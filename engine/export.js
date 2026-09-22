import {KEYS} from './rules.js';
export const EXPORT_VERSION='sdoc-review-3';
export function imageOnlyPDF(doc){
 const e=doc.readerEvidence;
 return e?.format==='pdf'&&e.nativeTextChecked===true&&(!e.sha256||e.sha256===doc.sha256)&&e.pages?.length>0&&e.pages.length===doc.pages?.length&&e.pages.every((p,i)=>p.page===i+1&&p.nativeTextChars===0&&Number.isInteger(p.rasterImages)&&p.rasterImages>0);
}
function reviewReasons(c){
 const reasons=new Set();
 const doc={wrong_type:'wrong_doc_type',unreadable_file:'unreadable',missing_si:'missing_attachment',missing_bl:'missing_attachment'}[c.docIssue];
 if(doc)reasons.add(doc);
 // Competition-only policy: the supplied README classifies image-only PDFs
 // as unreadable. OCR success remains intact in product facts.
 if((c.docs||[]).some(imageOnlyPDF))reasons.add('unreadable');
 for(const f of Object.values(c.fields||{}))if(f.comparison===null&&f.reason!=='comparison_paused'){
  if(f.kind==='MISSING')reasons.add('missing_value');
  if(f.kind==='UNREADABLE')reasons.add('unreadable');
 }
 return [...reasons];
}
export function competitionOutput(cases,expectedIds=cases.map(c=>c.emailId||c.id)){
 const output={},blocked=[],audit={};const ids=cases.map(c=>c.emailId||c.id);
 if(new Set(ids).size!==ids.length)blocked.push({reason:'Duplicate email IDs across selected batches.'});
 for(const id of expectedIds)if(!ids.includes(id))blocked.push({email_id:id,reason:'Missing email result.'});
 for(const c of cases){const id=c.emailId||c.id,fields=Object.values(c.fields||{}),diff=KEYS.filter(k=>c.fields?.[k]?.comparison==='MISMATCH'),unknown=fields.filter(f=>f.comparison===null);let reason=null;
  const supportedBeforePairing=reviewReasons(c);
  if(c.demo||c.classificationPending||c.processingError||c.multiple||!c.pipeline||(c.pairIssue&&supportedBeforePairing.length!==1))reason='Example, unclassified, unprocessed, failed, or unpaired case.';
  else if(c.category!=='BL_COMPARISON'||c.classificationOnly){
   output[id]={category:c.category,status:'OK',review_reason:null,has_defect:false,defect_fields:[]};
   continue;
  }
  if(reason){blocked.push({email_id:id,reason});continue}
  let reviewReason=null;
  if(!diff.length){
   const reasons=reviewReasons(c);
   if(reasons.length>1){blocked.push({email_id:id,reason:'Multiple supported review reasons have no confirmed priority.'});continue}
   reviewReason=reasons[0]||null;
   if(!reviewReason&&(unknown.length||fields.some(f=>f.scope_warning))){blocked.push({email_id:id,reason:'Internal uncertainty has no supported official review reason.'});continue}
  }
  if(!reviewReason&&fields.length!==7){blocked.push({email_id:id,reason:'Seven checked fields are required.'});continue}
  output[id]={category:c.category,status:diff.length?'MISMATCH':reviewReason?'NEEDS_REVIEW':'OK',review_reason:reviewReason,has_defect:diff.length>0,defect_fields:diff};
 }
 for(const c of cases){const id=c.emailId||c.id,fields=Object.values(c.fields||{}),row=output[id],supported=reviewReasons(c);
  audit[id]={case_id:id,mapping_version:EXPORT_VERSION,source_pointer:{case_id:id,pipeline_version:c.pipeline?.engineVersion||null,documents:(c.docs||[]).map(d=>({id:d.id,sha256:d.sha256||null}))},
   rule:!row?'blocked':c.category!=='BL_COMPARISON'||c.classificationOnly?'classification_only':row.has_defect?'known_difference':row.review_reason==='unreadable'&&(c.docs||[]).some(imageOnlyPDF)?'readme_image_only_pdf':row.review_reason?'single_supported_review_reason':'all_fields_compared',
   image_only_sources:(c.docs||[]).filter(imageOnlyPDF).map(d=>({fileId:d.id,readerEvidence:d.readerEvidence})),
   defect_fields_complete:fields.length===7&&fields.every(f=>['MATCH','MISMATCH'].includes(f.comparison)&&!f.scope_warning)&&!c.docIssue&&!c.pairIssue&&!c.processingError,
   supported_review_reasons:supported,
   internal_findings:KEYS.flatMap(k=>{const f=c.fields?.[k];return f&&(f.comparison===null||f.scope_warning)?[{field:k,reason:f.reason,kind:f.kind,scope_warning:f.scope_warning||null}]:[]}),
   policy_note:row?.has_defect&&supported.length?'Known-difference precedence is product policy; mixed official reasons are not explicitly defined in the README.':row?.review_reason?'This reason does not exhaust all internal findings.':null};
 }
 return {ready:blocked.length===0&&Object.keys(output).length===expectedIds.length,blocked,output,audit};
}
export function diagnostics(cases){
 const attempted=cases.filter(c=>c.category==='BL_COMPARISON'&&c.pipeline),failures=attempted.filter(c=>c.processingError),data=attempted.filter(c=>!c.processingError&&(c.docIssue||c.pairIssue||Object.values(c.fields||{}).some(f=>f.comparison===null||f.scope_warning))),groups={};
 for(const c of attempted)for(const key of KEYS){const f=c.fields?.[key];if(!f)continue;for(const side of ['si','bl']){const doc=c.docs?.find(d=>d.id===c.pair?.[side]),format=doc?.name.split('.').pop()||'unpaired',id=key+' / '+format;groups[id]||={attempted:0,unresolved:0,reasons:{}};groups[id].attempted++;if(f.comparison===null){groups[id].unresolved++;groups[id].reasons[f.reason]=(groups[id].reasons[f.reason]||0)+1}}}
 return {attempted:attempted.length,processing_failures:failures.length,data_review:data.length,review_rate:attempted.length?data.length/attempted.length:null,diagnostic_trigger:attempted.length>=50&&data.length/attempted.length>.3,threshold_note:'Initial engineering trigger, not a measured accuracy guarantee.',groups,blind_review_candidates:attempted.filter(c=>!c.processingError&&!c.docIssue&&!c.pairIssue&&Object.values(c.fields).length===7&&Object.values(c.fields).every(f=>f.comparison==='MATCH'&&!f.scope_warning)).map(c=>c.emailId||c.id).slice(0,10)};
}
