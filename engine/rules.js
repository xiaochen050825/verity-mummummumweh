import {sourceWeightUnit,sourceNumericCell,sourceNumberFormat} from './source-profile.js';
import {parseNumber,invariantNumericComparison} from './numbers.js';
export const KEYS=['shipper','consignee','notify_party','port_of_loading','port_of_discharge','container_count','gross_weight_kg'];
export const RULE_VERSION='verity-rules-1.8';
export const PORT_VERSION='ports-curated-2';
// Bounded comparison dictionary; code identities checked against UNECE 2025-1.
// Source names and declared codes are checked separately. See docs/port-reference.md.
const PORTS={
 SGSIN:['SINGAPORE'],
 MYPKG:['PORT KLANG','PORT KELANG','KLANG'],
 INNSA:['NHAVA SHEVA','JAWAHARLAL NEHRU PORT','JNPT'],
 IDBUA:['BULA'],
 IDBUN:['BUATAN'],
 CNSHA:['SHANGHAI HONGQIAO INTERNATIONAL APT'],
 CNSGH:['SHANGHAI'],
 CNNGB:['NINGBO LISHE INTERNATIONAL APT'],
 CNNBO:['NINGBO'],
 CNNTG:['NANTONG'],
 CNRUG:['RUGAO'],
 GNCKY:['CONAKRY'],
 NGAPP:['APAPA','LAGOS APAPA'],
 PLGDN:['GDANSK'],
 PLGDY:['GDYNIA'],
 LTKLJ:['KLAIPEDA'],
 USSAV:['SAVANNAH'],
 MMRGN:['YANGON','RANGOON'],
 AUBNE:['BRISBANE'],
 USNYC:['NEW YORK'],
 USLGB:['LONG BEACH'],
 KEMBA:['MOMBASA'],
 AUFRE:['FREMANTLE'],
 VNSGN:['HO CHI MINH CITY','HOCHIMINH CITY','HO CHI MINH','SAIGON'],
 ILASH:['ASHDOD'],
 CLVAP:['VALPARAISO'],
 KRPTK:['PYEONGTAEK'],
 USBAL:['BALTIMORE'],
 AEJEA:['JEBEL ALI'],
 USHOU:['HOUSTON'],
 KRPUS:['BUSAN'],
 JOAQB:['AQABA'],
 USLAX:['LOS ANGELES'],
 USPDX:['PORTLAND OREGON','PORTLAND OR'],
 AUPTJ:['PORTLAND VICTORIA','PORTLAND VIC'],
 HKHKG:['HONG KONG'],
 NLRTM:['ROTTERDAM'],
 PECLL:['CALLAO'],
 PKKHI:['KARACHI'],
 SIKOP:['KOPER'],
 TRMER:['MERSIN'],
 INPAV:['PIPAVAV'],
 INMAA:['CHENNAI','MADRAS'],
 INTUT:['TUTICORIN','THOOTHUKUDI','TUTICORN'],
 EGPSD:['PORT SAID'],
 GHTEM:['TEMA'],
 PHMNL:['MANILA'],
 PHCEB:['CEBU'],
};
export const norm=s=>String(s??'').normalize('NFKC').replace(/\s+/g,' ').trim();
const name=s=>norm(s).toUpperCase().replace(/[.,]/g,'').replace(/\s+/g,' ');
const entityName=s=>name(s).replace(/[|;]/g,' ').replace(/\s+/g,' ').trim();
const fail=(kind,reason)=>({ok:false,kind,reason});
const good=value=>({ok:true,value});
function portParts(raw){
 const text=norm(raw).toUpperCase();
 const codes=[...new Set((text.match(/\b[A-Z]{2}[A-Z0-9]{3}\b/g)||[]).filter(c=>PORTS[c]||text===c||text.includes('('+c+')')||text.includes('['+c+']')))];
 const without=codes.reduce((t,c)=>t.replaceAll(c,''),text).replace(/\(\)|\[\]/g,'').trim();
 const location=without.split(',')[0].replace(/\((?:WESTPORT|NORTHPORT)\)/g,'').trim();
 const names=location.split('/').map(s=>name(s)).filter(Boolean);
 const identities=names.map(s=>{
  const matches=Object.entries(PORTS).filter(([,aliases])=>aliases.some(a=>s===name(a)||s.startsWith(name(a)+' ')));
  // Prefer the longest exact alias, so an airport is not its surrounding city.
  const exact=matches.filter(([,aliases])=>aliases.some(a=>s===name(a)));
  const choices=exact.length?exact:matches;
  return choices.length===1?choices[0][0]:null;
 });
 const named=identities.length&&identities.every(Boolean)?[...new Set(identities)].sort():null;
 return {codes,named,hasName:!!location};
}
function normalizePort(raw){
 if(name(raw)==='PORTLAND')return fail('AMBIGUOUS','alias_collision');
 const p=portParts(raw);
 if(p.codes.length>1||p.codes.some(c=>!PORTS[c]))return fail('AMBIGUOUS','alias_not_found');
 if(p.hasName&&!p.named)return fail('AMBIGUOUS','alias_not_found');
 if(p.codes.length&&p.named&&!p.named.includes(p.codes[0]))return {...fail('AMBIGUOUS','port_name_code_conflict'),port:p};
 if(!p.named&&!p.codes.length)return fail('AMBIGUOUS','alias_not_found');
 // A slash list stays a list; never silently choose the final location.
 return {...good(p.named?.length>1?'locations:'+p.named.join('/')+';code:'+(p.codes[0]||''):p.codes[0]||p.named[0]),port:p};
}
export const number=parseNumber;
function wordNumber(raw){const units=['ZERO','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE','TEN','ELEVEN','TWELVE','THIRTEEN','FOURTEEN','FIFTEEN','SIXTEEN','SEVENTEEN','EIGHTEEN','NINETEEN'],tens=['TWENTY','THIRTY','FORTY','FIFTY','SIXTY','SEVENTY','EIGHTY','NINETY'],w=raw.toUpperCase().split(/[- ]/);if(w.length===1&&units.includes(w[0]))return String(units.indexOf(w[0]));const t=tens.indexOf(w[0]),u=units.indexOf(w[1]);if(t>=0&&(w.length===1||w.length===2&&u>0&&u<10))return String((t+2)*10+(w.length===2?u:0));return null}
export function normalizeField(key,raw,profile='unset'){
 const s=norm(raw);if(!s||/^(?:N\/?A|NONE|NOT PROVIDED|MISSING|-|TBA|TBD|_{2,}(?:\s*(?:KG|KGS|MT))?)$/i.test(s))return fail('MISSING','missing_value');
 if(key==='gross_weight_kg'){
  const m=s.match(/^([+-]?\d[\d.,'’ \u00a0\u202f]*|[A-Z]+(?:[- ][A-Z]+)?)\s*(KG|KGS|KILOGRAMS?|MT|M\/T|METRIC TONS?|METRIC TONNES?|TONNES?)$/i);
  if(!m)return /^[+-]?[\d.,]+$/.test(s)?fail('MISSING','unit_absent'):fail('AMBIGUOUS','weight_unit_or_value');
  const token=/^[A-Z]/i.test(m[1])?wordNumber(m[1]):m[1];if(token===null)return fail('AMBIGUOUS','unsupported_number_words');
  return number(token.trim(),profile,/^(KG|KGS|KILOGRAM)/i.test(m[2])?'1':'1000');
 }
 if(key==='container_count'){
  if(/^\d+$/.test(s)){const n=number(s);return n.ok&&n.value!=='0'?good(n.value):fail('AMBIGUOUS','invalid_container_count')}
  if(/^\d+\s*[x×]\s*(?:20|40|45)\s*['’/]?\s*(?:HC|HQ|GP|DC|RF|FT|FCL)?$/i.test(s)){const count=s.match(/^\d+/)[0];return BigInt(count)>0n?good(BigInt(count).toString()):fail('AMBIGUOUS','invalid_container_count')}
  const units=['ZERO','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE','TEN','ELEVEN','TWELVE','THIRTEEN','FOURTEEN','FIFTEEN','SIXTEEN','SEVENTEEN','EIGHTEEN','NINETEEN'];
  const words=s.toUpperCase().split(/[- ]/);let n=units.indexOf(words[0]);if(words.length===1&&n>0)return good(String(n));
  const tens=['TWENTY','THIRTY','FORTY','FIFTY','SIXTY','SEVENTY','EIGHTY','NINETY'];const t=tens.indexOf(words[0]),u=units.indexOf(words[1]);if(t>=0&&(words.length===1||words.length===2&&u>0&&u<10))return good(String((t+2)*10+(words.length===2?u:0)));
  return fail('AMBIGUOUS','invalid_container_count');
 }
 if(key.startsWith('port_'))return normalizePort(s);
 return good(name(s));
}
export function validateEvidence(field,doc,key){
 if(!field||field.raw===null)return field?.status==='MISSING'&&field.quote&&doc.pages?.some(p=>norm(p.text).includes(norm(field.quote)))?fail('MISSING','missing_value'):fail('UNREADABLE','extraction_incomplete');
 if(field.status==='AMBIGUOUS')return fail('AMBIGUOUS','extraction_ambiguous');
 const labels={shipper:/\b(shipper|exporter)\b/i,consignee:/\b(consignee|to the order of)\b/i,notify_party:/\bnotify(?: party)?\b/i,port_of_loading:/\b(port of loading|loading port|load port|pol)\b/i,port_of_discharge:/\b(port of discharge|discharge port|pod)\b/i,container_count:/\b(container count|total containers|no\.? of containers|number of containers|containers)\b/i,gross_weight_kg:/\bgross (weight|mass|wt)\b/i};
 if(key&&labels[key]&&!labels[key].test(field.quote))return fail('UNREADABLE','extraction_incomplete');
 if(field.quote.split('\n').slice(1).some(line=>/^\s*(?:shipper(?:\/exporter)?|exporter|consignee|to the order of|notify(?: party)?|port of loading|loading port|load port|pol|port of discharge|discharge port|pod|container count|total containers|no\.? of containers(?: or packages)?|gross (?:weight|wt|mass)|booking (?:ref|reference|no\.?)?)\s*(?:\([^)]*\))?\s*(?:[:：]|\t)/i.test(line)))return fail('UNREADABLE','extraction_incomplete');
 const p=doc.pages?.find(p=>p.page===field.page);
 if(!p||!field.quote||!(field.readMethod==='vision_reread'&&p.imageId||norm(p.text).includes(norm(field.quote)))||!norm(field.quote).includes(norm(field.raw)))return fail('UNREADABLE','evidence_not_located');
 if(field.entity&&Object.values(field.entity).some(v=>v&&!norm(field.raw).toUpperCase().includes(norm(v).toUpperCase())&&!norm(field.quote).toUpperCase().includes(norm(v).toUpperCase())))return fail('UNREADABLE','evidence_not_located');
 if(field.readMethod==='vision_reread'&&p.imageId)return good(field.raw);
 // A server OCR transcript is not scored by the older browser OCR confidence.
 // It must still contain the labelled quote/value and belong to these bytes.
 const serverRead=!!p.ocrEngine&&!!doc.sha256&&p.ocrSourceHash===doc.sha256;
 if(p.method==='ocr'&&!serverRead&&(p.confidence??0)<80)return fail('UNREADABLE','scan_illegible');
 return good(field.raw);
}
export function compareDocuments(si,bl,profiles={si:'unset',bl:'unset'}){
 return Object.fromEntries(KEYS.map(key=>{
  const a=si.fields[key],b=bl.fields[key],av=validateEvidence(a,si,key),bv=validateEvidence(b,bl,key);
  const declaredSI=key==='gross_weight_kg'&&av.ok?sourceNumberFormat(si,a):null,declaredBL=key==='gross_weight_kg'&&bv.ok?sourceNumberFormat(bl,b):null;
  const profileSI=declaredSI?.profile||profiles.si,profileBL=declaredBL?.profile||profiles.bl;
  // Compare the source value, not a model's potentially truncated entity name.
  // A labelled heading is not part of raw; relationships inside raw are retained.
  const entityRaw=f=>{
   let raw=norm(f?.raw);
   // Some extractions include the heading in raw. Strip only a heading that
   // begins the source quote too; "Consignee: TO THE ORDER OF X" is a value.
   if(key==='consignee'&&/^TO THE ORDER OF[ \t]*[:：\t]/i.test(f?.raw||'')&&norm(f.quote).startsWith(raw))raw=norm(f.raw.replace(/^TO THE ORDER OF[ \t]*[:：\t][ \t]*/i,''));
   const address=norm(f?.entity?.address);
   return entityName(address&&raw.endsWith(address)?raw.slice(0,-address.length).trim():raw);
  };
  const entityField=['shipper','consignee','notify_party'].includes(key);
  let x=av.ok?normalizeField(key,entityField?entityRaw(a):a.raw,profileSI):av,y=bv.ok?normalizeField(key,entityField?entityRaw(b):b.raw,profileBL):bv;
  const unitSI=key==='gross_weight_kg'&&av.ok?sourceWeightUnit(si,a):null,unitBL=key==='gross_weight_kg'&&bv.ok?sourceWeightUnit(bl,b):null;
  if(unitSI)x=normalizeField(key,a.raw+' '+unitSI.unit,profileSI);
  if(unitBL)y=normalizeField(key,b.raw+' '+unitBL.unit,profileBL);
  const numericSI=key==='gross_weight_kg'&&av.ok?sourceNumericCell(si,a):null,numericBL=key==='gross_weight_kg'&&bv.ok?sourceNumericCell(bl,b):null;
  if(numericSI)x=normalizeField(key,numericSI.value+' '+(unitSI?.unit||numericSI.unit||''),'en_comma');
  if(numericBL)y=normalizeField(key,numericBL.value+' '+(unitBL?.unit||numericBL.unit||''),'en_comma');
  const conflict=(d,p)=>d?.conflict||d?.profile&&p!=='unset'&&p!==d.profile;
  if(conflict(declaredSI,profiles.si))x=fail('AMBIGUOUS','number_profile_conflict');
  if(conflict(declaredBL,profiles.bl))y=fail('AMBIGUOUS','number_profile_conflict');
  // A literal cross-reference may only resolve to a validated consignee in the same document.
  const reference=(doc,f,profile)=>{if(key==='notify_party'&&/^SAME AS CONSIGNEE$/i.test(norm(f?.raw))){const c=doc.fields.consignee;return validateEvidence(c,doc).ok?normalizeField('consignee',c.raw,profile):fail('AMBIGUOUS','entity_identity')}return null};
  if(av.ok)x=reference(si,a,profiles.si)||x;if(bv.ok)y=reference(bl,b,profiles.bl)||y;
  // Identical validated company blocks cannot become different through splitting.
  // Cross-references must first resolve within each document, never by raw equality.
  const sameEntitySource=entityField&&av.ok&&bv.ok&&x.ok&&y.ok&&entityName(a.raw)===entityName(b.raw)&&!/^SAME AS CONSIGNEE$/i.test(norm(a.raw));
  if(sameEntitySource){x=good(entityName(a.raw));y=good(entityName(b.raw))}
  // Absence of a represented party is not a contradictory represented party.
  // Only this explicit source phrase is split; legal suffixes/names are intact.
  let representationIncomplete=false;
  if(entityField&&av.ok&&bv.ok&&x.ok&&y.ok&&!sameEntitySource){
   const parts=f=>entityRaw(f).split(/\s+ON BEHALF OF\b/);
   const ap=parts(a),bp=parts(b);
   if(ap.length<=2&&bp.length<=2&&ap[0]===bp[0]&&ap[0]&&(ap.length===2)!==(bp.length===2))representationIncomplete=true;
  }
  const bad=!x.ok?x:!y.ok?y:null;
  let comparison=bad?null:x.value===y.value?'MATCH':'MISMATCH',reason=bad?.reason||null,kind=bad?.kind||null;
  if(representationIncomplete){comparison=null;reason='representation_not_stated';kind='AMBIGUOUS'}
  // A code/name inconsistency inside a source must not hide a demonstrable
  // difference between two named locations, or manufacture a difference when
  // the complete, independently validated source expressions are identical.
  let portDecision=null;
  if(key.startsWith('port_')&&av.ok&&bv.ok&&x.port&&y.port){
   if(name(a.raw)===name(b.raw)){comparison='MATCH';portDecision='identical_source_expression'}
   else if(x.port.named&&y.port.named&&x.port.named.join('/')!==y.port.named.join('/')){comparison='MISMATCH';portDecision='different_named_locations'}
   else if(x.port.codes.length===1&&y.port.codes.length===1&&x.port.codes[0]!==y.port.codes[0]){comparison='MISMATCH';portDecision='different_declared_codes'}
   if(portDecision){reason=null;kind=null}
  }
  let numericDecision=null;
  if(key==='gross_weight_kg'&&av.ok&&bv.ok){
   const numericToken=value=>(norm(value).match(/^[+-]?\d[\d.,'’ \u00a0\u202f]*/)?.[0]||'').replace(/[ \u00a0\u202f]/g,'');
   const sameSourceToken=!!numericToken(a?.raw)&&numericToken(a?.raw)===numericToken(b?.raw);
   numericDecision=invariantNumericComparison(x,y,sameSourceToken);
   if(numericDecision){comparison=numericDecision;reason=null;kind=null}
  }
  const scopeWarning=!sameEntitySource&&entityField&&a?.entity?.address&&b?.entity?.address&&entityName(a.entity.address)!==entityName(b.entity.address)?'address_conflict':null;
  const qa=[{rule:'source_evidence',version:RULE_VERSION,status:av.ok&&bv.ok?'pass':'flag'},{rule:'field_grammar',status:bad?'flag':'pass'},{rule:'detail_totals',status:'not_applicable',reason:'No verified complete detail-total relationship provided.'},{rule:'business_range',status:'not_applicable',reason:'No sourced business range is configured.'}];
  if(portDecision)qa.push({rule:'port_source_comparison',status:'pass',reason:portDecision,sourceWarning:bad?.reason||null});
  if(representationIncomplete)qa.push({rule:'represented_party_completeness',status:'flag',reason:'One source names a represented party; the other does not. Identity agreement is not assumed.'});
  if(key==='gross_weight_kg')qa.push({rule:'numeric_interpretations',status:numericDecision?'pass':'flag',decision:numericDecision,si:x.candidates||[],bl:y.candidates||[],sourceSI:numericSI,sourceBL:numericBL,comparisonPolicy:'exact_decimal_no_rounding_tolerance; identical source tokens match only when all converted candidates are identical'});
  if(unitSI||unitBL)qa.push({rule:'source_unit',status:'pass',si:unitSI,bl:unitBL});
  if(declaredSI||declaredBL)qa.push({rule:'explicit_source_number_format',status:conflict(declaredSI,profiles.si)||conflict(declaredBL,profiles.bl)?'flag':'pass',si:declaredSI,bl:declaredBL});
  return [key,{si:a?.raw??'Not located',bl:b?.raw??'Not located',sourceSI:a?.raw??'Not located',sourceBL:b?.raw??'Not located',normalizedSI:x.ok?x.value:null,normalizedBL:y.ok?y.value:null,comparison,reason,kind,scope:entityField?'name_and_qualifier':'field_value',scope_warning:scopeWarning,affectedSide:!x.ok?'si':!y.ok?'bl':null,verified:false,numeric_candidates:key==='gross_weight_kg'?{si:x.candidates||[],bl:y.candidates||[]}:undefined,raw_equal:norm(a?.raw)===norm(b?.raw),quality_checks:qa,source_warnings:portDecision&&bad?[bad.reason]:[],issues:(bad&&!portDecision&&!numericDecision||representationIncomplete)?[{kind,reason,stage:'validate',retryable:false,next_action:kind==='MISSING'?'add_source':'review_evidence'}]:[],evidence:{si:a?{fileId:si.id,page:a.page,quote:a.quote,readMethod:a.readMethod||si.pages.find(p=>p.page===a.page)?.method}:null,bl:b?{fileId:bl.id,page:b.page,quote:b.quote,readMethod:b.readMethod||bl.pages.find(p=>p.page===b.page)?.method}:null}}];
 }));
}
export const blankFields=()=>Object.fromEntries(KEYS.map(k=>[k,{si:'Not extracted',bl:'Not extracted',comparison:null,reason:'comparison_paused',kind:'UNREADABLE'}]));
