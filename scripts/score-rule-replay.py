"""Score frozen predictions after an offline replay; never supplies labels to rules."""
from pathlib import Path
from collections import Counter
import json
import sys

baseline, replay, truth_path = map(Path, sys.argv[1:4])
truth = json.loads(truth_path.read_text(encoding='utf-8'))
def measure(folder):
    cases = [json.loads(p.read_text(encoding='utf-8')) for p in (folder/'cases').glob('*.json')]
    assert {c['id'] for c in cases} == set(truth)
    tp, fp, fn, exact = [], [], [], []
    for c in cases:
        defects = {k for k,f in c['fields'].items() if f.get('comparison') == 'MISMATCH'}
        gold = truth[c['id']]
        predicted = c['category'] == 'BL_COMPARISON' and bool(defects)
        if gold['has_defect'] and predicted: tp.append(c['id'])
        if not gold['has_defect'] and predicted: fp.append(c['id'])
        if gold['has_defect'] and not predicted: fn.append(c['id'])
        if gold['has_defect'] and predicted and defects == set(gold['defect_fields']): exact.append(c['id'])
    exported = json.loads((folder/'export-check.json').read_text(encoding='utf-8'))
    fields = {k:dict(Counter(f.get('comparison') or 'UNRESOLVED' for c in cases if c.get('pair') for key,f in c['fields'].items() if key==k))
              for k in ['shipper','consignee','container_count','gross_weight_kg','port_of_loading','port_of_discharge']}
    return dict(emails=len(cases),detected=len(tp),false_alarms=len(fp),missed=len(fn),exact_defect_sets=len(exact),
                true_positive_ids=tp,false_positive_ids=fp,false_negative_ids=fn,
                classification_correct=sum(c['category']==truth[c['id']]['category'] for c in cases),
                automatic=sum(c['pipeline']['status']=='complete' for c in cases),
                automatic_document_checks=sum(c['pipeline']['status']=='complete' and len(c['fields'])==7 for c in cases),
                manual=sum(c['pipeline']['status']!='complete' for c in cases),
                wrongly_autocompleted_defects=[c['id'] for c in cases if c['pipeline']['status']=='complete' and truth[c['id']]['has_defect']],
                export_count=len(exported['output']),export_blocked=len(exported['blocked']),fields=fields)

b,a=measure(baseline),measure(replay)
result=dict(scope='Offline rules regression on frozen extraction. Not new AI/OCR or online end-to-end evaluation.',api_calls=0,additional_ai_cost_usd=0,before=b,after=a)
(replay/'summary.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
rows=[('真实差异检出（46 封）',b['detected'],a['detected']),('误报邮件',b['false_alarms'],a['false_alarms']),('漏检邮件',b['missed'],a['missed']),('差异字段集合完全正确',b['exact_defect_sets'],a['exact_defect_sets']),('七字段自动核对完成',b['automatic_document_checks'],a['automatic_document_checks']),('人工处理',b['manual'],a['manual']),('可导出记录',b['export_count'],a['export_count']),('导出阻塞',b['export_blocked'],a['export_blocked'])]
table='\n'.join(f'| {k} | {x} | {y} |' for k,x,y in rows)
report=f'''# Verity 规则修复回归报告

本次对保存的 520 封真实 API 提取结果重放新规则；未重新调用 AI/OCR，新增 API 费用为 0。属于开发回归，不能当成独立留出集准确率或新速度测试。

| 指标 | 修复前 | 修复后 |
|---|---:|---:|
{table}

分类未修改，仍为 {a['classification_correct']}/520。误自动完成的真实差异邮件：{a['wrongly_autocompleted_defects']}。

## 已修复

- 公司比较使用完整来源值，不再由模型截短的公司名称制造差异。相同且有效的公司原文可以一致；缺失、歧义、不可读和 SAME AS CONSIGNEE 不走这个快捷判断。
- To the Order of 作为来源字段标题时不加入实体名；文字实际出现在字段值中时，保留关系。只在原文证据证明标题边界时去除误带入的标题。
- 官方 data_v2/render.py 明确使用逗号千位分组。250 个原件 SHA-256 注册到来源格式表，只有字节完全相同的官方文件自动应用 en_comma。清单无邮件标签、预期答案或差异字段。新文件仍需有依据的格式配置。
- 柜数接受 20'FCL 和 40/HC 等完整、单一柜型表达；不把混合柜型或数量零当成有效单值。

## 原诊断需纠正

- 75 封无字段邮件是请求发送提单的分类完成记录，不是 75 次配对失败。
- 有明确配对、进入字段比较的记录是 88 封；重量实际 85 项 separator_ambiguous，另 3 项缺单位/缺值/无效写法。不能把暂停比较的空字段也算作 129 项重量格式错误。
- 旧误报按字段统计会重叠，不能将 consignee 与 shipper 次数直接相加当成邮件数。

## 仍未完成

- 剩余误报：{', '.join(a['false_positive_ids'])}。扫描读取错误，以及来源中的代理关系与官方评分范围冲突，需要分别解决；不能一律删掉 ON BEHALF OF。
- 港口映射覆盖不足、分类错误、配对/提取失败仍在。没有通过猜选文件或强制 OK 绕开。
- 导出阻塞从 {b['export_blocked']} 增至 {a['export_blocked']}：原先部分假差异触发 MISMATCH 导出；移除假差异后，尚未解决的港口/资料问题显现。此处保留阻塞，不伪造正式提交。
- 正式提交文件仍未完成；目录中的 partial 文件不能提交。

本次测试不能证明新数据效果、API 平均成本或速度改善。原始全量测试目录未修改。
'''
(replay/'修复回归报告.md').write_text(report,encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))
