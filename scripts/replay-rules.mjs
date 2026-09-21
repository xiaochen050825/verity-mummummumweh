// Offline regression: frozen independent model extractions, new comparison rules.
// Does not import providers, call APIs, or inspect expected answers.
import {readFileSync,readdirSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {compareDocuments,RULE_VERSION} from '../engine/rules.js';
import {applySourceProfile} from '../engine/source-profile.js';
import {competitionOutput} from '../engine/export.js';
const [inputArg,outputArg]=process.argv.slice(2);
if(!inputArg||!outputArg)throw Error('Usage: node scripts/replay-rules.mjs INPUT_DIRECTORY NEW_OUTPUT_DIRECTORY');
const input=resolve(inputArg),output=resolve(outputArg);
if(input===output)throw Error('Never overwrite the frozen baseline');
mkdirSync(output,{recursive:false});mkdirSync(join(output,'cases'));
const changes=[],cases=[];
for(const f of readdirSync(join(input,'cases')).filter(x=>x.endsWith('.json')).sort()){
 const before=JSON.parse(readFileSync(join(input,'cases',f),'utf8')),c=structuredClone(before);
 const a=c.docs?.find(d=>d.id===c.pair?.si),b=c.docs?.find(d=>d.id===c.pair?.bl);
 if(a&&b&&!c.processingError&&!c.classificationPending){
  const si=applySourceProfile(a),bl=applySourceProfile(b);
  c.docs=c.docs.map(d=>d.id===si.id?si:d.id===bl.id?bl:d);
  c.fields=compareDocuments(si,bl,{si:si.numberProfile,bl:bl.numberProfile});
  c.pipeline.rules=RULE_VERSION;
  c.pipeline.status=Object.values(c.fields).every(f=>f.comparison==='MATCH'&&!f.scope_warning)?'complete':'review';
  for(const [key,now] of Object.entries(c.fields)){
   const old=before.fields[key];
   if(old?.comparison!==now.comparison||old?.reason!==now.reason||old?.scope_warning!==now.scope_warning)changes.push({id:c.id,key,before:old?.comparison,after:now.comparison,oldReason:old?.reason,newReason:now.reason});
  }
 }
 c.regression={type:'cached-extraction-rules-only',rules:RULE_VERSION,apiCalls:0};
 cases.push(c);writeFileSync(join(output,'cases',f),JSON.stringify(c));
}
const exported=competitionOutput(cases);
writeFileSync(join(output,'export-check.json'),JSON.stringify(exported,null,2));
writeFileSync(join(output,exported.ready?'submission.json':'submission-partial-NOT-FOR-SUBMISSION.json'),JSON.stringify(exported.output,null,2));
writeFileSync(join(output,'changes.json'),JSON.stringify(changes,null,2));
console.log(JSON.stringify({emails:cases.length,fieldChanges:changes.length,automatic:cases.filter(c=>c.pipeline.status==='complete').length,exported:Object.keys(exported.output).length,blocked:exported.blocked.length,apiCalls:0}));
