// Read-only development diagnostics. Evaluation labels never enter the engine.
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {sourceReferences} from '../engine/references.js';
import {normalizeField} from '../engine/rules.js';
import {sourceNumericCell,sourceWeightUnit} from '../engine/source-profile.js';
const [inputArg,outArg]=process.argv.slice(2);if(!inputArg||!outArg)throw Error('Supply input run and a new diagnostics directory.');
const input=resolve(inputArg),out=resolve(outArg);mkdirSync(out);
const evaluation=JSON.parse(readFileSync(join(input,'evaluation.json'),'utf8')).after;
const cases=readdirSync(join(input,'cases')).filter(n=>n.endsWith('.json')).map(n=>JSON.parse(readFileSync(join(input,'cases',n),'utf8'))),byId=new Map(cases.map(c=>[c.id,c]));
const count=rows=>rows.reduce((m,x)=>(m[x]=(m[x]||0)+1,m),{});
const missed=(evaluation.fn||[]).map(id=>{const c=byId.get(id);return {id,pairing:c.pairIssue,pairReason:c.pairEvidence?.reason,unresolved:Object.entries(c.fields).filter(([,f])=>f.comparison===null).map(([field,f])=>({field,reason:f.reason})),processingError:c.processingError}});
const pairing=cases.filter(c=>c.pairIssue).map(c=>({id:c.id,reason:c.pairEvidence?.reason,documents:c.docs.map(d=>({id:d.id,type:d.type,name:d.name,references:sourceReferences(d),titleEvidence:(d.pages||[]).flatMap(p=>p.text.split('\n').filter(line=>/^(?:BL INSTRUCTIONS?|BILL OF LADING)\t+\d+/i.test(line)).map(text=>({page:p.page,text,meaning:'unlabelled number; not an inferred order or booking'})))}))}));
const numbers=cases.filter(c=>c.fields?.gross_weight_kg?.reason==='separator_ambiguous').map(c=>({id:c.id,documents:['si','bl'].map(side=>{
 const d=c.docs.find(d=>d.id===c.pair?.[side]),f=d?.fields?.gross_weight_kg;if(!d||!f)return {side,missing:true};
 const unit=sourceWeightUnit(d,f),parsed=normalizeField('gross_weight_kg',f.raw+(unit?' '+unit.unit:''));
 return {side,fileId:d.id,raw:f.raw,quote:f.quote,page:f.page,unitEvidence:unit,numericCell:sourceNumericCell(d,f),candidates:parsed.candidates||[],otherWeightLines:d.pages.flatMap(p=>p.text.split('\n').filter(line=>/\b(?:net|tare|gross) (?:weight|wt|mass)\b/i.test(line)&&!line.includes(f.raw)).map(text=>({page:p.page,text}))),policy:'Other lines are inspection candidates, not automatically a document-wide locale.'};
})}));
const blocked=evaluation.exportBlocked.map(b=>{const c=byId.get(b.email_id);return {...b,underlying:c?.pairIssue?'pairing':Object.values(c?.fields||{}).some(f=>f.reason==='separator_ambiguous')?'numeric_format':Object.values(c?.fields||{}).some(f=>f.scope_warning)?'scope_warning':'other'}});
const summary={scope:'Development-run diagnostics; no API calls or mutations. Reason counts may overlap.',missed:count(missed.map(c=>c.pairing?'pairing':c.unresolved.some(f=>f.reason==='separator_ambiguous')?'numeric_format':'other')),pairing:count(pairing.map(c=>c.reason)),numbers:{cases:numbers.length,nativeNumericCells:numbers.flatMap(c=>c.documents).filter(d=>d.numericCell).length,documentsWithOtherWeightLines:numbers.flatMap(c=>c.documents).filter(d=>d.otherWeightLines?.length).length},exportBlocks:count(blocked.map(c=>c.underlying))};
writeFileSync(join(out,'diagnostics.json'),JSON.stringify({summary,missed,pairing,numbers,blocked},null,2));console.log(JSON.stringify(summary,null,2));
