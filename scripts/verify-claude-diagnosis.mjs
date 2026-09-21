// Diagnostics only. Never supplies development labels or decisions to the engine.
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {sourceReferences} from '../engine/references.js';
import {parseNumber} from '../engine/numbers.js';
const folder=resolve(process.argv[2]),cases=readdirSync(join(folder,'cases')).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(readFileSync(join(folder,'cases',f),'utf8')));
const numbers=cases.filter(c=>c.fields.gross_weight_kg?.reason==='separator_ambiguous').map(c=>({id:c.id,si:c.fields.gross_weight_kg.si,bl:c.fields.gross_weight_kg.bl,rawEqual:c.fields.gross_weight_kg.si===c.fields.gross_weight_kg.bl,otherProblems:Object.entries(c.fields).filter(([k,f])=>k!=='gross_weight_kg'&&(f.comparison===null||f.scope_warning)).map(([k,f])=>({field:k,reason:f.reason,warning:f.scope_warning})),hasDifference:Object.values(c.fields).some(f=>f.comparison==='MISMATCH'),documents:c.docs.filter(d=>Object.values(c.pair||{}).includes(d.id)).map(d=>({id:d.id,syntaxCandidates:d.pages.flatMap(p=>[...p.text.matchAll(/(?<![A-Z0-9])[0-9]+(?:[.,'’][0-9]+)+(?![A-Z0-9])/gi)].flatMap(m=>{const n=parseNumber(m[0]);return n.ok?[{token:m[0],value:n.value,page:p.page,context:p.text.slice(Math.max(0,m.index-35),m.index+m[0].length+35),note:'Syntax only; does not establish the weight format.'}]:[]}))}))}));
const pairing=cases.filter(c=>c.pairIssue).map(c=>{
 const docs=c.docs.map(d=>({id:d.id,side:d.side,references:sourceReferences(d),unlabelledTitles:d.pages.flatMap(p=>p.text.split('\n').filter(s=>/^(?:BL INSTRUCTION|BILL OF LADING)\t+\d+/i.test(s)))}));
 const message=(c.subject||'')+'\n'+(c.body||'');
 return {id:c.id,documents:docs,messageReferenceOccurrences:docs.flatMap(d=>Object.entries(d.references).flatMap(([kind,rs])=>rs.filter(r=>message.toUpperCase().includes(r.value)).map(r=>({fileId:d.id,kind,value:r.value,note:'An occurrence does not by itself link both documents.'}))))};
});
const single=cases.flatMap(c=>Object.entries(c.fields).filter(([,f])=>f.reason==='representation_not_stated').map(([field,f])=>({id:c.id,field,si:f.si,bl:f.bl})));
const cleanNumbers=numbers.filter(c=>!c.hasDifference&&!c.otherProblems.length);
const report={scope:'Read-only source diagnostics; token syntax is not a document-wide locale.',summary:{ambiguousWeightCases:numbers.length,weightOnlyCases:cleanNumbers.length,weightOnlyRawIdentical:cleanNumbers.filter(c=>c.rawEqual).length,weightCasesWithDifference:numbers.filter(c=>c.hasDifference).length,documentsWithUnambiguousPunctuationTokens:numbers.flatMap(c=>c.documents).filter(d=>d.syntaxCandidates.length).length,pairingCases:pairing.length,singleSidedRepresentationFields:single.length},numbers,pairing,single};
writeFileSync(join(folder,'source-diagnostics.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.summary));
