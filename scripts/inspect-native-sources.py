"""Read originals without models or labels; preserve cached AI fields for replay."""
import json, re, sys, hashlib, zipfile, pathlib, xml.etree.ElementTree as ET
from pypdf import PdfReader

source, bundle, target = map(pathlib.Path, sys.argv[1:4])
target.mkdir(); (target/'cases').mkdir()
ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
inspection=[]
for path in sorted((source/'cases').glob('*.json')):
    case=json.loads(path.read_text(encoding='utf-8'))
    for doc in case.get('docs',[]):
        original=(bundle/doc['id']).resolve()
        if not original.is_relative_to(bundle.resolve()) or not original.is_file(): continue
        if original.suffix.lower() not in ['.xlsx','.pdf']: continue
        sha=hashlib.sha256(original.read_bytes()).hexdigest()
        if sha != doc.get('sha256'): raise ValueError('Original changed: '+doc['id'])
        row={'file':doc['id'],'original_sha256':sha}
        try:
            if original.suffix.lower()=='.pdf':
                pdf=PdfReader(original)
                pages=[{'page':i+1,'nativeTextChars':len(re.sub(r'\s','',p.extract_text() or '')),'rasterImages':len(p.images)} for i,p in enumerate(pdf.pages)]
                doc['readerEvidence']={'format':'pdf','nativeTextChecked':True,'pages':pages,'reader':'pypdf-original-inspection','sha256':sha}
                row.update(doc['readerEvidence'])
            else:
                with zipfile.ZipFile(original) as z:
                    shared=ET.fromstring(z.read('xl/sharedStrings.xml')) if 'xl/sharedStrings.xml' in z.namelist() else None
                    strings=[''.join(si.itertext()) for si in shared] if shared is not None else []
                    pages=[]
                    for sheet in sorted(n for n in z.namelist() if re.match(r'xl/worksheets/sheet\d+\.xml$',n)):
                        blocks=[]
                        for r in ET.fromstring(z.read(sheet)).findall('.//m:row',ns):
                            cells=[]
                            for c in r.findall('m:c',ns):
                                t=c.get('t','n');v=c.findtext('m:v','',ns);inline=c.find('m:is',ns)
                                text=strings[int(v)] if t=='s' else ''.join(inline.itertext()) if t=='inlineStr' and inline is not None else v
                                cells.append({'cell':c.get('r'),'text':text,'type':'number' if t=='n' else 'text','storageValue':v if t=='n' else None,'formula':c.find('m:f',ns) is not None,'styleId':c.get('s')})
                            blocks.append({'text':'\t'.join(c['text'] for c in cells),'cells':cells})
                        pages.append({'page':len(pages)+1,'text':'\n'.join(b['text'] for b in blocks),'blocks':blocks,'method':'native'})
                    doc['pages']=pages
                    row.update(numericCells=sum(c['type']=='number' for p in pages for b in p['blocks'] for c in b['cells']),grossWeightRows=[b for p in pages for b in p['blocks'] if re.search(r'gross (weight|wt|mass)',b['text'],re.I)])
        except Exception as ex:
            row['error']=str(ex)
        inspection.append(row)
    (target/'cases'/path.name).write_text(json.dumps(case,ensure_ascii=False),encoding='utf-8')
(target/'inspection.json').write_text(json.dumps(inspection,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'emails':len(list((target/'cases').glob('*.json'))),'inspected':len(inspection),'errors':sum('error' in r for r in inspection),'xlsxNumericCells':sum(r.get('numericCells',0) for r in inspection),'verifiedImageOnlyPDFs':sum(bool(r.get('pages')) and all(p['nativeTextChars']==0 and p['rasterImages']>0 for p in r['pages']) for r in inspection)}))
