export function sourceWeightUnit(doc,field){
 if(!/^\d[\d.,]*$/.test(String(field?.raw||'').trim()))return null;
 const raw=String(field.raw).trim(),escaped=raw.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const adjacent=String(field.quote||'').match(new RegExp('(?:^|[\\s:：])'+escaped+'\\s+(KG|KGS|KILOGRAMS?|MT)\\b','i'));
 if(adjacent)return {unit:/^K/i.test(adjacent[1])?'KG':'MT',evidence:'Unit immediately follows this value in its validated source quote.'};
 const label=String(field.quote||'').split(/[:：\t]/)[0];
 const units=[...new Set((label.match(/\b(?:KG|KGS|KILOGRAMS?|MT)\b/gi)||[]).map(u=>/^K/i.test(u)?'KG':'MT'))];
 if(units.length===1)return {unit:units[0],evidence:'Unit in the source field heading: '+label};
 return null;
}
export function applySourceProfile(doc){
 // Retire legacy dataset-derived profiles, including persisted cached records.
 // Explicit user/source format settings remain supported for every document.
 const legacy=String(doc.profileSource||'').startsWith('sdoc-')||/data_v2|render\.py|official SDOC|Registered XLSX/i.test(String(doc.profileEvidence||''));
 if(!legacy)return doc;
 const {profileSource,profileEvidence,...rest}=doc;
 return {...rest,numberProfile:'unset'};
}
