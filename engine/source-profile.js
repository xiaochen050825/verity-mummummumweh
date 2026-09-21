import manifest from './sdoc-format-manifest.json' with {type:'json'};

const officialHashes=new Set(manifest.sha256);
export const isRegisteredSource=doc=>officialHashes.has(doc.sha256);
export function sourceWeightUnit(doc,field){
 if(!/^\d[\d.,]*$/.test(String(field?.raw||'').trim()))return null;
 const raw=String(field.raw).trim(),escaped=raw.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const adjacent=String(field.quote||'').match(new RegExp('(?:^|[\\s:：])'+escaped+'\\s+(KG|KGS|KILOGRAMS?|MT)\\b','i'));
 if(adjacent)return {unit:/^K/i.test(adjacent[1])?'KG':'MT',evidence:'Unit immediately follows this value in its validated source quote.'};
 const label=String(field.quote||'').split(/[:：\t]/)[0];
 const units=[...new Set((label.match(/\b(?:KG|KGS|KILOGRAMS?|MT)\b/gi)||[]).map(u=>/^K/i.test(u)?'KG':'MT'))];
 if(units.length===1)return {unit:units[0],evidence:'Unit in the source field heading: '+label};
 if(!units.length&&isRegisteredSource(doc)&&/\.xlsx$/i.test(doc.name||''))return {unit:'KG',evidence:'Registered XLSX source; data_v2/render.py:186 writes gross_weight_kg.'};
 return null;
}
export function applySourceProfile(doc){
 // Hash is calculated from original bytes by the server, not a filename or AI.
 // This registry contains format metadata only, never expected answers.
 if((doc.numberProfile||'unset')!=='unset'||!officialHashes.has(doc.sha256))return doc;
 return {...doc,numberProfile:'en_comma',profileEvidence:manifest.evidence,profileSource:manifest.version};
}
