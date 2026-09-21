// Exact decimal arithmetic and explicit candidate sets. No locale is inferred
// from a sender, filename, shipment size, another field or the other document.
const bad=reason=>({ok:false,kind:'AMBIGUOUS',reason,candidates:[]});
export function exactDecimal(raw,factor='1'){
 const m=String(raw).match(/^\+?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
 if(!m||raw.length>160||!/^\d{1,8}$/.test(String(factor)))return null;
 const exponent=Number(m[3]||0);if(Math.abs(exponent)>100)return null;
 let digits=BigInt(m[1]+(m[2]||''))*BigInt(factor),scale=(m[2]||'').length-exponent;
 if(scale<0){digits*=10n**BigInt(-scale);scale=0}
 while(scale&&digits%10n===0n){digits/=10n;scale--}
 const text=digits.toString().padStart(scale+1,'0');return scale?text.slice(0,-scale)+'.'+text.slice(-scale):text;
}
export function parseNumber(raw,profile='unset',factor='1'){
 const s=String(raw??'').normalize('NFKC').trim();
 if(!s)return {ok:false,kind:'MISSING',reason:'missing_value',candidates:[]};
 if(s.startsWith('-'))return bad('negative_weight');
 if(s.length>160)return bad('unsupported_number_format');
 const candidates=[];
 const add=(text,interpretation)=>{const value=exactDecimal(text,factor);if(value!==null&&!candidates.some(c=>c.value===value))candidates.push({value,interpretation})};
 const english=/^\+?(?:\d+|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d+)?$/;
 const european=/^\+?(?:\d+|[1-9]\d{0,2}(?:\.\d{3})+)(?:,\d+)?$/;
 if(profile==='en_comma') {if(english.test(s))add(s.replaceAll(',',''),'explicit_decimal_point')}
 else if(profile==='de_dot') {if(european.test(s))add(s.replaceAll('.','').replace(',','.'),'explicit_decimal_comma')}
 else if(profile==='unset'){
  if(english.test(s))add(s.replaceAll(',',''),'decimal_point_comma_grouping');
  if(european.test(s))add(s.replaceAll('.','').replace(',','.'),'decimal_comma_point_grouping');
  if(/^\+?[1-9]\d?(?:,\d{2})+,\d{3}(?:\.\d+)?$/.test(s))add(s.replaceAll(',',''),'indian_grouping');
  if(/^\+?[1-9]\d{0,2}(?:['’]\d{3})+(?:\.\d+)?$/.test(s))add(s.replace(/['’]/g,''),'apostrophe_grouping');
  if(/^\+?[1-9]\d{0,2}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d+)?$/.test(s))add(s.replace(/[ \u00a0\u202f]/g,'').replace(',','.'),'space_grouping');
 }else return bad('unsupported_number_profile');
 if(!candidates.length)return bad('unsupported_number_format');
 if(candidates.length>1)return {ok:false,kind:'AMBIGUOUS',reason:'separator_ambiguous',candidates};
 return {ok:true,value:candidates[0].value,candidates};
}
export function invariantNumericComparison(a,b){
 const permitted=x=>x.ok||x.reason==='separator_ambiguous';
 if(!permitted(a)||!permitted(b)||!a.candidates?.length||!b.candidates?.length)return null;
 const outcomes=new Set(a.candidates.flatMap(x=>b.candidates.map(y=>x.value===y.value?'MATCH':'MISMATCH')));
 return outcomes.size===1?[...outcomes][0]:null;
}
