// Frozen independent AI outputs; rerun production native recovery, pairing,
// validation, comparison and export. Network calls are prohibited.
import {readFileSync,readdirSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {runPipeline} from '../engine/pipeline.js';
import {competitionOutput} from '../engine/export.js';
const [inputArg,outputArg]=process.argv.slice(2),input=resolve(inputArg),output=resolve(outputArg);
if(input===output)throw Error('Cannot overwrite baseline');
mkdirSync(output);mkdirSync(join(output,'cases'));
const cases=[],changes=[],skipped=[];
for(const file of readdirSync(join(input,'cases')).filter(f=>f.endsWith('.json')).sort()){
 const before=JSON.parse(readFileSync(join(input,'cases',file),'utf8'));
 let c=before;
 // Failed or incomplete model responses require a real provider retry. Never
 // substitute invented extraction results for those cases during this replay.
 const knownDamagedPDF=before.processingError==='unsupported_format'&&before.docs?.some(d=>/\.pdf$/i.test(d.name)&&/^(?:Invalid PDF structure\.?|The PDF file is empty, i\.e\. its size is zero bytes\.)$/i.test(d.readError||''));
 if(!before.processingError||knownDamagedPDF){
  c=await runPipeline(before,before.docs||[],{GRAFILAB_API_KEY:'offline-not-a-key'},{keepCategory:true,fetcher:async()=>{throw Error('OFFLINE_REPLAY_CACHE_MISS')}});
  if(c.processingDetail?.includes('OFFLINE_REPLAY_CACHE_MISS')){c=before;skipped.push(before.id)}
 }else skipped.push(before.id);
 c.regression={type:'frozen-AI-production-pipeline-replay',apiCalls:0};
 cases.push(c);writeFileSync(join(output,'cases',file),JSON.stringify(c));
 if(c.pipeline?.status!==before.pipeline?.status||c.pair?.si!==before.pair?.si||JSON.stringify(c.fields)!==JSON.stringify(before.fields))changes.push({id:c.id,before:before.pipeline?.status,after:c.pipeline?.status,pair:c.pair,reason:c.pairEvidence?.reason});
}
const exported=competitionOutput(cases);
writeFileSync(join(output,'export-check.json'),JSON.stringify(exported,null,2));
writeFileSync(join(output,exported.ready?'submission.json':'submission-partial-NOT-FOR-SUBMISSION.json'),JSON.stringify(exported.output,null,2));
writeFileSync(join(output,'replay-metadata.json'),JSON.stringify({emails:cases.length,apiCalls:0,skippedFailedOrUncached:skipped,changes},null,2));
console.log(JSON.stringify({emails:cases.length,automatic:cases.filter(c=>c.pipeline?.status==='complete').length,manual:cases.filter(c=>c.pipeline?.status!=='complete').length,exported:Object.keys(exported.output).length,blocked:exported.blocked.length,skipped,apiCalls:0}));
