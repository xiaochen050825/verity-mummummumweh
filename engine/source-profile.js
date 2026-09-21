import {exactDecimal} from './numbers.js';
export function sourceNumberFormat(doc,field){
 const page=doc.pages?.find(p=>p.page===field?.page);
 if(page?.method!=='native')return null;
 const declarations=[];
 for(const line of page.text.split(/\r?\n/)){
  const m=line.match(/^\s*(?:WEIGHT NUMBER FORMAT|NUMBER FORMAT FOR (?:ALL )?WEIGHTS)\s*[:：]\s*(.+)$/i);if(!m)continue;
  const decimals=[...m[1].matchAll(/\bdecimal separator\s*(?:is|[:=])?\s*(comma|point|dot|[.,])(?=\s|;|$)/gi)];
  const groups=[...m[1].matchAll(/\b(?:thousands|grouping) separator\s*(?:is|[:=])?\s*(comma|point|dot|[.,])(?=\s|;|$)/gi)];
  const decimal=decimals[0],group=groups[0];
  const symbol=x=>/^(comma|,)$/i.test(x)?',':'.';
  if(decimals.length!==1||groups.length!==1||/\b(?:not|except|example|may|might)\b/i.test(m[1]))return {conflict:true,reason:'unverified_format_declaration',page:page.page,quote:line};
  const d=symbol(decimal[1]),g=symbol(group[1]);
  if(d===g)return {conflict:true,reason:'conflicting_format_declaration',page:page.page,quote:line};
  declarations.push({profile:d==='.'?'en_comma':'de_dot',page:page.page,quote:line,scope:'weight_on_same_page'});
 }
 if(!declarations.length)return null;
 if(new Set(declarations.map(d=>d.profile)).size!==1)return {conflict:true,reason:'conflicting_format_declaration',declarations};
 return {...declarations[0],declarations};
}
export function sourceWeightUnit(doc,field){
 if(!/^\d[\d.,]*$/.test(String(field?.raw||'').trim()))return null;
 const raw=String(field.raw).trim(),escaped=raw.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const adjacent=String(field.quote||'').match(new RegExp('(?:^|[\\s:：])'+escaped+'\\s+(KG|KGS|KILOGRAMS?|MT)\\b','i'));
 if(adjacent)return {unit:/^K/i.test(adjacent[1])?'KG':'MT',evidence:'Unit immediately follows this value in its validated source quote.'};
 const label=String(field.quote||'').split(/[:：\t]/)[0];
 const units=[...new Set((label.match(/\b(?:KG|KGS|KILOGRAMS?|MT)\b/gi)||[]).map(u=>/^K/i.test(u)?'KG':'MT'))];
 if(units.length===1)return {unit:units[0],evidence:'Unit in the source field heading: '+label};
 const page=doc.pages?.find(p=>p.page===field.page);
 if(page?.method==='native'){
  const stated=page.text.split(/\r?\n/).flatMap(line=>{const m=line.match(/^\s*All (?:gross )?weights (?:are )?(?:stated |expressed )?in (KG|KGS|KILOGRAMS?|MT|METRIC TONNES?|METRIC TONS?)\.?\s*$/i);return m?[{unit:/^K/i.test(m[1])?'KG':'MT',page:page.page,quote:line}]:[]});
  if(stated.length&&new Set(stated.map(s=>s.unit)).size===1)return {...stated[0],evidence:'Explicit weight-unit declaration on the same source page.'};
 }
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

export function sourceNumericCell(doc,field){
 const page=doc.pages?.find(p=>p.page===field.page);if(page?.method!=='native')return null;
 const matches=[];
 for(const row of page.blocks||[]){
  if(!/\bgross (?:weight|wt|mass)\b/i.test(row.text||'')||!String(row.text).replace(/\s+/g,' ').includes(String(field.quote).replace(/\s+/g,' ')))continue;
  for(const cell of row.cells||[]){
   if(cell.type!=='number'||cell.formula||String(cell.storageValue)!==String(cell.text))continue;
   const raw=String(field.raw||'').trim(),token=String(cell.text).trim();
   if(raw!==token&&!raw.startsWith(token+' '))continue;
   const value=exactDecimal(token);if(value===null)continue;
   const unit=raw.slice(token.length).trim();
   if(unit&&!/^(KG|KGS|KILOGRAMS?|MT|METRIC TONNES?|METRIC TONS?)$/i.test(unit))continue;
   matches.push({value,unit:unit||null,page:page.page,cell:cell.cell,evidence:row.text,method:'native_numeric_cell'});
  }
 }
 return matches.length===1?matches[0]:null;
}
