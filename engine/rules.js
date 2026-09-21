export const KEYS=['shipper','consignee','notify_party','port_of_loading','port_of_discharge','container_count','gross_weight_kg'];
export const RULE_VERSION='verity-rules-1.1';
export const PORT_VERSION='ports-curated-1';
// Deliberately bounded lookup. Unlisted locations require human evidence.
const PORTS={SGSIN:['SINGAPORE'],MYPKG:['PORT KLANG','PORT KELANG'],USLAX:['LOS ANGELES'],USPDX:['PORTLAND OREGON','PORTLAND OR'],AUPTJ:['PORTLAND VICTORIA','PORTLAND VIC'],CNSHA:['SHANGHAI'],CNNGB:['NINGBO'],CNNTG:['NANTONG'],HKHKG:['HONG KONG'],NLRTM:['ROTTERDAM'],PECLL:['CALLAO'],PKKHI:['KARACHI'],SIKOP:['KOPER'],TRMER:['MERSIN']};
export const norm=s=>String(s??'').normalize('NFKC').replace(/\s+/g,' ').trim();
const name=s=>norm(s).toUpperCase().replace(/[.,]/g,'').replace(/\s+/g,' ');
const fail=(kind,reason)=>({ok:false,kind,reason});
const good=value=>({ok:true,value});
export function number(raw,profile='unset',factor='1'){
 let s=norm(raw);if(!s)return fail('MISSING','missing_value');
 const patterns={unset:/^[+-]?\d+$/,en_comma:/^[+-]?(?:\d+|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d+)?$/};
 if(!patterns[profile]?.test(s))return fail('AMBIGUOUS','separator_ambiguous');
 if(profile==='en_comma')s=s.replaceAll(',','');if(profile==='de_dot')s=s.replaceAll('.','').replace(',','.');
 const [whole,fraction='']=s.replace(/^\+/,'').split('.');let digits=BigInt(whole+fraction)*BigInt(factor),scale=fraction.length;
 while(scale&&digits%10n===0n){digits/=10n;scale--}let text=digits.toString().padStart(scale+1,'0');if(scale)text=text.slice(0,-scale)+'.'+text.slice(-scale);
 if(digits<0n)return {...fail('AMBIGUOUS','negative_weight'),parsed:text};return good(text);
}
function wordNumber(raw){const units=['ZERO','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE','TEN','ELEVEN','TWELVE','THIRTEEN','FOURTEEN','FIFTEEN','SIXTEEN','SEVENTEEN','EIGHTEEN','NINETEEN'],tens=['TWENTY','THIRTY','FORTY','FIFTY','SIXTY','SEVENTY','EIGHTY','NINETY'],w=raw.toUpperCase().split(/[- ]/);if(w.length===1&&units.includes(w[0]))return String(units.indexOf(w[0]));const t=tens.indexOf(w[0]),u=units.indexOf(w[1]);if(t>=0&&(w.length===1||w.length===2&&u>0&&u<10))return String((t+2)*10+(w.length===2?u:0));return null}
export function normalizeField(key,raw,profile='unset'){
 const s=norm(raw);if(!s||/^(?:N\/?A|NONE|NOT PROVIDED|MISSING|-)$/i.test(s))return fail('MISSING','missing_value');
 if(key==='gross_weight_kg'){
  const m=s.match(/^([+-]?\d[\d.,]*|[A-Z]+(?:[- ][A-Z]+)?)\s*(KG|KGS|KILOGRAMS?|MT|M\/T|METRIC TONS?|METRIC TONNES?|TONNES?)$/i);
  if(!m)return /^[+-]?[\d.,]+$/.test(s)?fail('MISSING','unit_absent'):fail('AMBIGUOUS','weight_unit_or_value');
  const token=/^[A-Z]/i.test(m[1])?wordNumber(m[1]):m[1];if(token===null)return fail('AMBIGUOUS','unsupported_number_words');
  return number(token,profile,/^(KG|KGS|KILOGRAM)/i.test(m[2])?'1':'1000');
 }
 if(key==='container_count'){
  if(/^\d+$/.test(s)){const n=number(s);return n.ok&&n.value!=='0'?good(n.value):fail('AMBIGUOUS','invalid_container_count')}
  if(/^\d+\s*[x×]\s*(?:20|40|45)\s*['’/]?\s*(?:HC|HQ|GP|DC|RF|FT|FCL)?$/i.test(s)){const count=s.match(/^\d+/)[0];return BigInt(count)>0n?good(BigInt(count).toString()):fail('AMBIGUOUS','invalid_container_count')}
  const units=['ZERO','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE','TEN','ELEVEN','TWELVE','THIRTEEN','FOURTEEN','FIFTEEN','SIXTEEN','SEVENTEEN','EIGHTEEN','NINETEEN'];
  const words=s.toUpperCase().split(/[- ]/);let n=units.indexOf(words[0]);if(words.length===1&&n>0)return good(String(n));
  const tens=['TWENTY','THIRTY','FORTY','FIFTY','SIXTY','SEVENTY','EIGHTY','NINETY'];const t=tens.indexOf(words[0]),u=units.indexOf(words[1]);if(t>=0&&(words.length===1||words.length===2&&u>0&&u<10))return good(String((t+2)*10+(words.length===2?u:0)));
  return fail('AMBIGUOUS','invalid_container_count');
 }
 if(key.startsWith('port_')){
  const text=name(s),codes=(text.match(/\b[A-Z]{2}[A-Z0-9]{3}\b/g)||[]).filter(c=>PORTS[c]||c===text||text.includes('('+c+')')||text.includes('['+c+']')),valid=codes.filter(c=>PORTS[c]);
  const without=codes.reduce((t,c)=>t.replace(c,''),text).replace(/[()\[\],]/g,' ').replace(/\s+/g,' ').trim();
  if(text==='PORTLAND')return fail('AMBIGUOUS','alias_collision');
  const named=[...new Set(Object.entries(PORTS).filter(([,aliases])=>aliases.some(a=>without===name(a)||without.startsWith(name(a)+' '))).map(([c])=>c))];
  if(codes.length){if(codes.length!==1||valid.length!==1)return fail('AMBIGUOUS','alias_not_found');if(without&&(!named.length||named.length!==1||named[0]!==valid[0]))return fail('AMBIGUOUS','port_name_code_conflict');return good(valid[0])}
  return named.length===1?good(named[0]):fail('AMBIGUOUS','alias_not_found');
 }
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
 if(p.method==='ocr'&&(p.confidence??0)<80)return fail('UNREADABLE','scan_illegible');
 return good(field.raw);
}
export function compareDocuments(si,bl,profiles={si:'unset',bl:'unset'}){
 return Object.fromEntries(KEYS.map(key=>{
  const a=si.fields[key],b=bl.fields[key],av=validateEvidence(a,si,key),bv=validateEvidence(b,bl,key);
  // Compare the source value, not a model's potentially truncated entity name.
  // A labelled heading is not part of raw; relationships inside raw are retained.
  const entityRaw=f=>{
   let raw=norm(f?.raw);
   // Some extractions include the heading in raw. Strip only a heading that
   // begins the source quote too; "Consignee: TO THE ORDER OF X" is a value.
   if(key==='consignee'&&/^TO THE ORDER OF\s*[:：]/i.test(raw)&&norm(f.quote).startsWith(raw))raw=raw.replace(/^TO THE ORDER OF\s*[:：]\s*/i,'');
   const address=norm(f?.entity?.address);
   return address&&raw.endsWith(address)?raw.slice(0,-address.length).trim():raw;
  };
  const entityField=['shipper','consignee','notify_party'].includes(key);
  let x=av.ok?normalizeField(key,entityField?entityRaw(a):a.raw,profiles.si):av,y=bv.ok?normalizeField(key,entityField?entityRaw(b):b.raw,profiles.bl):bv;
  // A literal cross-reference may only resolve to a validated consignee in the same document.
  const reference=(doc,f,profile)=>{if(key==='notify_party'&&/^SAME AS CONSIGNEE$/i.test(norm(f?.raw))){const c=doc.fields.consignee;return validateEvidence(c,doc).ok?normalizeField('consignee',c.raw,profile):fail('AMBIGUOUS','entity_identity')}return null};
  if(av.ok)x=reference(si,a,profiles.si)||x;if(bv.ok)y=reference(bl,b,profiles.bl)||y;
  // Identical validated company blocks cannot become different through splitting.
  // Cross-references must first resolve within each document, never by raw equality.
  const sameEntitySource=entityField&&av.ok&&bv.ok&&x.ok&&y.ok&&norm(a.raw)===norm(b.raw)&&!/^SAME AS CONSIGNEE$/i.test(norm(a.raw));
  if(sameEntitySource){x=good(name(a.raw));y=good(name(b.raw))}
  const bad=!x.ok?x:!y.ok?y:null;
  let comparison=bad?null:x.value===y.value?'MATCH':'MISMATCH',reason=bad?.reason||null,kind=bad?.kind||null;
  const scopeWarning=!sameEntitySource&&entityField&&a?.entity?.address&&b?.entity?.address&&name(a.entity.address)!==name(b.entity.address)?'address_conflict':null;
  const qa=[{rule:'source_evidence',version:RULE_VERSION,status:av.ok&&bv.ok?'pass':'flag'},{rule:'field_grammar',status:bad?'flag':'pass'},{rule:'detail_totals',status:'not_applicable',reason:'No verified complete detail-total relationship provided.'},{rule:'business_range',status:'not_applicable',reason:'No sourced business range is configured.'}];
  return [key,{si:a?.raw??'Not located',bl:b?.raw??'Not located',sourceSI:a?.raw??'Not located',sourceBL:b?.raw??'Not located',normalizedSI:x.ok?x.value:null,normalizedBL:y.ok?y.value:null,comparison,reason,kind,scope:entityField?'name_and_qualifier':'field_value',scope_warning:scopeWarning,affectedSide:!x.ok?'si':!y.ok?'bl':null,verified:false,raw_equal:norm(a?.raw)===norm(b?.raw),quality_checks:qa,issues:bad?[{kind,reason,stage:'validate',retryable:false,next_action:kind==='MISSING'?'add_source':'review_evidence'}]:[],evidence:{si:a?{fileId:si.id,page:a.page,quote:a.quote,readMethod:a.readMethod||si.pages.find(p=>p.page===a.page)?.method}:null,bl:b?{fileId:bl.id,page:b.page,quote:b.quote,readMethod:b.readMethod||bl.pages.find(p=>p.page===b.page)?.method}:null}}];
 }));
}
export const blankFields=()=>Object.fromEntries(KEYS.map(k=>[k,{si:'Not extracted',bl:'Not extracted',comparison:null,reason:'comparison_paused',kind:'UNREADABLE'}]));
