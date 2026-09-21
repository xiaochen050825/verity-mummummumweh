import {norm} from './rules.js';
import {messagePairEvidence,pairingContextConflict,currentMessage} from './message-evidence.js';

// Reference types are kept separate: an order number is not a booking number.
export function sourceReferences(doc){
 const refs={booking:[],order:[],bl:[]};
 const patterns={booking:/\bBOOKING(?:[ \t]+(?:REFERENCE|REF\.?|NUMBER|NO\.?))?[ \t]*(?:[:#：][ \t]*|[ \t]+)([A-Z0-9][A-Z0-9-]{3,})/gi,order:/\bORDER[ \t]+(?:NUMBER|NO\.?)[ \t]*(?:[:#：][ \t]*|[ \t]+)([A-Z0-9][A-Z0-9-]{3,})/gi,bl:/(?:\b(?:B\/?L|BILL[ \t]+OF[ \t]+LADING)[ \t]+(?:NUMBER|NO\.?)|提单号|提單號)(?:[ \t]*\([^)]*\))?[ \t]*(?:[:#：][ \t]*|[ \t]+)([A-Z0-9][A-Z0-9-]{3,})/gi};
 for(const page of doc.pages||[]){
  // Low-quality OCR cannot establish automatic identity.
  if(page.method==='ocr'&&!page.ocrEngine&&(page.confidence??0)<80)continue;
  for(const [kind,re] of Object.entries(patterns))for(const m of page.text.matchAll(re)){
   if(/^(?:REFERENCE|NUMBER|NONE|MISSING|UNKNOWN)$/i.test(m[1]))continue;
   refs[kind].push({value:norm(m[1]).toUpperCase(),quote:m[0],page:page.page});
  }

 }
 return refs;
}
export function automaticPairEvidence(si,bl,context){
 const a=sourceReferences(si),b=sourceReferences(bl),matches=[];
 if(pairingContextConflict(context))return {ok:false,reason:'conflicting_message_context',si:a,bl:b};
 // Compare only labelled, same-type references; a voyage or order number in
 // a subject must not be compared to a BL number just because both contain digits.
 const messageRefs=sourceReferences({pages:[{page:1,method:'native',text:String(context?.subject||'')+'\n'+currentMessage(context?.body)}]});
 for(const kind of ['booking','order','bl']){
  const known=new Set([...a[kind],...b[kind]].map(r=>r.value));
  if(known.size&&messageRefs[kind].some(r=>!known.has(r.value)))return {ok:false,reason:'conflicting_message_'+kind+'_reference',si:a,bl:b};
 }
 for(const kind of ['booking','order','bl']){
  const av=[...new Set(a[kind].map(r=>r.value))],bv=[...new Set(b[kind].map(r=>r.value))];
  if(av.length>1||bv.length>1)return {ok:false,reason:'multiple_'+kind+'_references',si:a,bl:b};
  if(av.length&&bv.length){
   if(av[0]!==bv[0])return {ok:false,reason:'conflicting_'+kind+'_references',si:a,bl:b};
   matches.push({kind,value:av[0],si:a[kind][0],bl:b[kind][0]});
  }
 }
 if(matches.length)return {ok:true,method:'shared_source_reference',matches,si:a,bl:b};
 return messagePairEvidence(si,bl,a,b,context)||{ok:false,reason:'no_shared_source_reference',si:a,bl:b};
}
