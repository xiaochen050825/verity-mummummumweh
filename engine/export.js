import {KEYS} from './rules.js';
export function competitionOutput(cases,expectedIds=cases.map(c=>c.emailId||c.id)){
 const output={},blocked=[];const ids=cases.map(c=>c.emailId||c.id);
 if(new Set(ids).size!==ids.length)blocked.push({reason:'Duplicate email IDs across selected batches.'});
 for(const id of expectedIds)if(!ids.includes(id))blocked.push({email_id:id,reason:'Missing email result.'});
 for(const c of cases){const id=c.emailId||c.id,fields=Object.values(c.fields||{}),diff=KEYS.filter(k=>c.fields?.[k]?.comparison==='MISMATCH'),unknown=fields.filter(f=>f.comparison===null);let reason=null;
  if(c.demo||c.classificationPending||c.processingError||c.pairIssue||c.multiple||!c.pipeline)reason='Example, unclassified, unprocessed, failed, or unpaired case.';
  else if(c.category!=='BL_COMPARISON'||c.classificationOnly){
   output[id]={category:c.category,status:'OK',review_reason:null,has_defect:false,defect_fields:[]};
   continue;
  }
  else if(!diff.length&&fields.some(f=>f.scope_warning))reason='Address/scope warning needs official mapping.';
  if(reason){blocked.push({email_id:id,reason});continue}
  let reviewReason=null;
  if(!diff.length){
   reviewReason=c.docIssue==='wrong_type'?'wrong_doc_type':c.docIssue==='unreadable_file'?'unreadable':['missing_si','missing_bl'].includes(c.docIssue)?'missing_attachment':null;
   if(!reviewReason&&unknown.length){const reasons=new Set(unknown.map(f=>f.kind==='MISSING'?'missing_value':f.kind==='UNREADABLE'?'unreadable':null));if(reasons.size===1&&!reasons.has(null))reviewReason=[...reasons][0];else {blocked.push({email_id:id,reason:'Ambiguity or multiple review reasons have no confirmed official mapping.'});continue}}
  }
  if(!reviewReason&&fields.length!==7){blocked.push({email_id:id,reason:'Seven checked fields are required.'});continue}
  output[id]={category:c.category,status:diff.length?'MISMATCH':reviewReason?'NEEDS_REVIEW':'OK',review_reason:reviewReason,has_defect:diff.length>0,defect_fields:diff};
 }
 return {ready:blocked.length===0&&Object.keys(output).length===expectedIds.length,blocked,output};
}
export function diagnostics(cases){
 const attempted=cases.filter(c=>c.category==='BL_COMPARISON'&&c.pipeline),failures=attempted.filter(c=>c.processingError),data=attempted.filter(c=>!c.processingError&&(c.docIssue||c.pairIssue||Object.values(c.fields||{}).some(f=>f.comparison===null||f.scope_warning))),groups={};
 for(const c of attempted)for(const key of KEYS){const f=c.fields?.[key];if(!f)continue;for(const side of ['si','bl']){const doc=c.docs?.find(d=>d.id===c.pair?.[side]),format=doc?.name.split('.').pop()||'unpaired',id=key+' / '+format;groups[id]||={attempted:0,unresolved:0,reasons:{}};groups[id].attempted++;if(f.comparison===null){groups[id].unresolved++;groups[id].reasons[f.reason]=(groups[id].reasons[f.reason]||0)+1}}}
 return {attempted:attempted.length,processing_failures:failures.length,data_review:data.length,review_rate:attempted.length?data.length/attempted.length:null,diagnostic_trigger:attempted.length>=50&&data.length/attempted.length>.3,threshold_note:'Initial engineering trigger, not a measured accuracy guarantee.',groups,blind_review_candidates:attempted.filter(c=>!c.processingError&&!c.docIssue&&!c.pairIssue&&Object.values(c.fields).length===7&&Object.values(c.fields).every(f=>f.comparison==='MATCH'&&!f.scope_warning)).map(c=>c.emailId||c.id).slice(0,10)};
}
