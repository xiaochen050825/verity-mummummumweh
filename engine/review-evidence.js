import {normalizeField} from './rules.js';
import {sourceReferences} from './references.js';
import {sourceWeightUnit} from './source-profile.js';

// These are human review aids, never inputs to automatic pairing or scoring.
export function weightInterpretations(doc){
 const field=doc.fields?.gross_weight_kg;if(!field?.raw)return [];
 const unit=sourceWeightUnit(doc,field),raw=field.raw+(unit?' '+unit.unit:'');
 return [['en_comma','Decimal point'],['de_dot','Decimal comma']].map(([profile,label])=>{
  const parsed=normalizeField('gross_weight_kg',raw,profile);
  return {profile,label,value:parsed.ok?parsed.value:null,reason:parsed.reason||null};
 });
}

export function pairReviewEvidence(docs){
 return docs.map(doc=>({id:doc.id,name:doc.name,side:doc.side,
  references:Object.entries(sourceReferences(doc)).flatMap(([kind,refs])=>refs.map(ref=>({kind,...ref}))),
  // A title-adjacent number is useful to a reviewer, but its meaning is not
  // declared. Do not label it as a booking/order/BL reference automatically.
  untyped:(doc.pages||[]).flatMap(p=>p.text.split(/\r?\n/).flatMap(line=>{
   const match=line.match(/^\s*(?:BL INSTRUCTIONS?|SHIPPING INSTRUCTIONS?|BILL OF LADING(?: \(DRAFT\))?)\t+([A-Z0-9][A-Z0-9-]{3,})\s*$/i);
   return match?[{value:match[1],page:p.page,quote:line}]:[];
  }))}));
}

export function contextReadReason(doc,page,pairUnresolved){
 if(page.method!=='ocr'||page.ocrEngine)return null;
 if(pairUnresolved&&page.page===1)return 'shipment_references';
 const field=doc.fields?.gross_weight_kg;
 if(field?.page===page.page){
  const value=normalizeField('gross_weight_kg',field.raw,doc.numberProfile||'unset');
  if(['separator_ambiguous','unit_absent','unsupported_number_format'].includes(value.reason))return 'weight_context';
 }
 return null;
}
