// Evaluation only: labels never enter the provider or production pipeline.
import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
const out=resolve(process.argv[2]),work=resolve('../work');
const gold=JSON.parse(readFileSync(join(work,'official-evaluator/ground_truth.json'),'utf8'));
const readCases=dir=>readdirSync(join(dir,'cases')).filter(n=>n.endsWith('.json')).map(n=>JSON.parse(readFileSync(join(dir,'cases',n),'utf8')));
function measure(dir){
 const cases=readCases(dir),exports=JSON.parse(readFileSync(join(dir,'export-check.json'),'utf8'));
 const tp=[],fp=[],fn=[],exact=[],wrongClassification=[],confusion={},reviewReasons={};
 for(const c of cases){
  const g=gold[c.id];if(!g)throw Error('Unexpected case '+c.id);
  const fields=Object.entries(c.fields).filter(([,f])=>f.comparison==='MISMATCH').map(([k])=>k).sort(),detected=c.category==='BL_COMPARISON'&&fields.length>0;
  if(g.has_defect)(detected?tp:fn).push(c.id);else if(detected)fp.push(c.id);
  if(g.has_defect&&detected&&JSON.stringify(fields)===JSON.stringify([...g.defect_fields].sort()))exact.push(c.id);
  if(g.category!==c.category)wrongClassification.push({id:c.id,expected:g.category,actual:c.category,pending:c.classificationPending});
  const pair=g.category+' -> '+c.category;confusion[pair]=(confusion[pair]||0)+1;
  if(c.pipeline.status!=='complete'){
   const reasons=new Set([c.processingError,c.docIssue,c.pairIssue?'pairing':null,c.classificationPending?'classification':null,...Object.values(c.fields).flatMap(f=>[f.reason==='comparison_paused'?null:f.reason,f.scope_warning,f.comparison==='MISMATCH'?'identified_difference':null])].filter(Boolean));
   for(const reason of reasons)(reviewReasons[reason]||=[]).push(c.id);
  }
 }
 const output=exports.output,submitted=Object.entries(output);
 const reasons=cases.filter(c=>gold[c.id].review_reason).map(c=>({id:c.id,expected:gold[c.id].review_reason,actual:output[c.id]?.review_reason??null,blocked:!output[c.id]}));
 return {total:cases.length,classificationCorrect:cases.length-wrongClassification.length,classificationAccuracy:(cases.length-wrongClassification.length)/cases.length,wrongClassification,confusion,
  defectTP:tp.length,defectFP:fp.length,defectFN:fn.length,defectPrecision:tp.length/(tp.length+fp.length)||0,defectRecall:tp.length/(tp.length+fn.length)||0,defectF1:2*tp.length/(2*tp.length+fp.length+fn.length)||0,
  tp,fp,fn,exactDefectFieldSets:exact.length,automatic:cases.filter(c=>c.pipeline.status==='complete').length,
  automaticDocumentChecks:cases.filter(c=>c.pipeline.status==='complete'&&Object.keys(c.fields).length===7).length,
  manual:cases.filter(c=>c.pipeline.status!=='complete').length,
  wronglyAutocompletedDefects:cases.filter(c=>c.pipeline.status==='complete'&&gold[c.id].has_defect).map(c=>c.id),
  reviewReasons,sourceReviewReasonChecks:reasons,sourceReviewReasonCorrect:reasons.filter(x=>x.actual===x.expected).length,
  exportReady:exports.ready,exportCount:submitted.length,exportBlocked:exports.blocked,
  exactExportRecords:submitted.filter(([id,row])=>['category','status','review_reason','has_defect'].every(k=>row[k]===gold[id][k])&&JSON.stringify([...row.defect_fields].sort())===JSON.stringify([...gold[id].defect_fields].sort())).length};
}
const replay=existsSync(join(out,'replay-metadata.json'));
const progress=replay?{...JSON.parse(readFileSync(join(out,'replay-metadata.json'),'utf8')),status:'complete',modelCache:true}:JSON.parse(readFileSync(join(out,'progress.json'),'utf8'));
if(progress.status!=='complete')throw Error('Run is not complete');
const calls=existsSync(join(out,'calls.jsonl'))?readFileSync(join(out,'calls.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[],models={};
for(const call of calls){const x=models[call.model]||={calls:0,ms:0,queueMs:0,estimatedUSD:0,missingUsage:0,errors:0};x.calls++;x.ms+=call.ms;x.queueMs+=call.queueMs;x.estimatedUSD+=call.estimatedUSD||0;x.missingUsage+=call.estimatedUSD===null?1:0;x.errors+=call.http!==200?1:0;}
for(const x of Object.values(models)){x.meanResponseMs=x.ms/x.calls;x.meanQueueMs=x.queueMs/x.calls;x.meanEstimatedUSD=x.estimatedUSD/x.calls;}
const result={scope:replay?'Offline rule replay on preserved AI responses; zero API calls. Development set, not held-out accuracy.':progress.resumeFrom?'Failed-stage recovery on preserved batch results. This duration and cost cover recovery calls only; include the original run for batch totals.':'Fresh provider calls using original cached reader output; PDF images freshly rendered on demand. Development set, not held-out accuracy. Cost uses recorded tokens and prior assumed rates, not a reconciled invoice.',run:progress,models,after:measure(out)};
if(process.argv[3])result.before=measure(resolve(process.argv[3]));
writeFileSync(join(out,'evaluation.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({run:progress,models,after:result.after,before:result.before},null,2));
