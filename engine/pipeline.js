import {KEYS,blankFields,compareDocuments,normalizeField,validateEvidence,norm,RULE_VERSION,PORT_VERSION} from './rules.js';
import {makeProvider} from './provider.js';
const event=(c,title,detail)=>{c.history.unshift({title,detail,at:new Date().toISOString()})};
export async function runPipeline(original,documents,env={},options={}){
 const c=structuredClone(original),provider=makeProvider(env,options.fetcher),now=new Date().toISOString();
 c.sourceVersions||=[];if(c.pipeline)c.sourceVersions.push({version:c.version,fields:c.fields,docs:(c.docs||[]).map(({pages,...meta})=>meta)});
 c.version=(c.version||0)+1;c.fields=blankFields();c.docIssue=null;c.processingError=null;c.pairIssue=false;c.deferred=false;
 c.pipeline={status:'classifying',provider:provider.status.mode,model:provider.status.model,rules:RULE_VERSION,ports:PORT_VERSION,startedAt:now,stages:[],rereads:0};
 const stage=s=>{c.pipeline.status=s;c.pipeline.stages.push({stage:s,at:new Date().toISOString()})};
 try{
  const classification=c.classification&&(options.keepCategory||c.classification.provider===provider.status.mode)?c.classification:await provider.classify({subject:c.subject||'',body:c.body||'',attachments:c.attachments||[]});
  c.classification=classification;c.category=classification.category;c.classificationPending=classification.needsReview;
  event(c,'Email routed',classification.reason+' ['+provider.status.mode+']');
  if(c.classificationPending){stage('review');return c}
  if(c.category!=='BL_COMPARISON'){c.fields={};stage('complete');return c}
  stage('extracting');const extracted=[];
  for(const doc of documents){
   if(doc.readError){extracted.push({...doc,side:null,fields:{},type:'UNREADABLE'});continue}
   const providerKey=provider.status.mode+'/'+(provider.status.model||'parser')+'/extract-1';
   const cached=original.docs?.find(d=>d.id===doc.id&&d.sha256===doc.sha256&&d.fields&&d.providerKey===providerKey);
   const result=cached||await provider.extract(doc);const full=doc.pages.map(p=>p.text).join('\n');
   const booking=result.booking&&result.bookingQuote&&norm(full).includes(norm(result.bookingQuote))&&norm(result.bookingQuote).includes(norm(result.booking))?result.booking:null;
   extracted.push({...doc,...result,pages:doc.pages,booking,side:result.type==='SI'?'si':result.type==='BL'?'bl':null,numberProfile:doc.numberProfile||'unset',profileEvidence:doc.profileEvidence,providerKey});c.docs=[...extracted];
  }
  c.docs=extracted;stage('pairing');const si=extracted.filter(d=>d.side==='si'),bl=extracted.filter(d=>d.side==='bl');
  let a,b;if(options.pair){a=si.find(d=>d.id===options.pair.si);b=bl.find(d=>d.id===options.pair.bl);if(!a||!b)throw Error('Choose one SI and one BL.');if(a.booking&&b.booking&&a.booking!==b.booking)throw Error('The chosen files have different booking references.');if((!a.booking||!b.booking)&&!options.pair.note?.trim())throw Error('Missing booking references need a pairing reason.')}
  else if(si.length===1&&bl.length===1&&si[0].booking&&si[0].booking===bl[0].booking){[a,b]=[si[0],bl[0]]}
  else {c.pair=null;if(extracted.some(d=>d.readError)){c.processingError='unsupported_format';c.processingDetail=extracted.find(d=>d.readError).readError}else if(!si.length)c.docIssue='missing_si';else if(!bl.length)c.docIssue=extracted.some(d=>d.type==='OTHER')?'wrong_type':'missing_bl';else c.pairIssue=true;stage('review');event(c,'Comparison paused',c.docIssue||c.processingError||'An explicit SI and BL pair is required.');return c}
  c.pair={si:a.id,bl:b.id};c.booking=a.booking||b.booking||c.booking;
  stage('validating');
  // Reread only the problematic document and field; never provide the other side.
  for(const doc of [a,b]){
   const keys=KEYS.filter(key=>{const e=validateEvidence(doc.fields[key],doc,key);return !e.ok&&e.kind==='UNREADABLE'&&!doc.rereads?.[key]});
   if(keys.length&&provider.status.mode==='api'&&options.getPageImage&&!doc.rereadRound){
    const pageNos=[...new Set(keys.map(k=>doc.fields[k]?.page||1))],images=[];for(const n of pageNos){const pg=doc.pages.find(p=>p.page===n);if(pg){const image=await options.getPageImage(doc,pg);if(image)images.push(image)}}if(!images.length)continue;
    doc.rereadAttempts=(doc.rereadAttempts||0)+1;if(doc.rereadAttempts>2)continue;
    const revised=await provider.reread(doc,keys,images);doc.rereadRound=1;c.pipeline.rereads++;doc.rereads||={};
    for(const key of keys){const field=revised?.[key];if(field)field.readMethod='vision_reread';doc.rereads[key]={before:doc.fields[key],after:field,attempts:1};if(field&&validateEvidence(field,doc).ok)doc.fields[key]=field}
   }
  }
  stage('comparing');c.fields=compareDocuments(a,b,{si:a.numberProfile,bl:b.numberProfile});
  // Recompute dependent values, but retain independent decisions on unchanged evidence.
  const samePair=original.pair?.si===a.id&&original.pair?.bl===b.id;
  if(samePair)for(const key of KEYS){const old=original.fields?.[key],fresh=c.fields[key];
   const profilesChanged=key==='gross_weight_kg'&&[a,b].some(d=>(original.docs?.find(x=>x.id===d.id)?.numberProfile||'unset')!==d.numberProfile);
   if(old&&!profilesChanged&&old.sourceSI===fresh.sourceSI&&old.sourceBL===fresh.sourceBL){if(old.manual)c.fields[key]={...fresh,...old};else if(old.verified&&fresh.comparison==='MISMATCH')fresh.verified=true}
  }
  c.pipeline.finishedAt=new Date().toISOString();stage(Object.values(c.fields).every(f=>f.comparison==='MATCH'&&!f.scope_warning)?'complete':'review');
  event(c,'Seven fields checked',`Rules ${RULE_VERSION}; independent ${provider.status.mode} extraction. Original evidence retained.`);
 }catch(e){c.processingError=['AI_TRANSIENT','TimeoutError'].includes(e.code||e.name)?'service_timeout':'processing_failed';c.processingDetail=e.message;c.pipeline.failedStage=c.pipeline.status;stage('failed');event(c,'Processing failed',e.message)}
 return c;
}
export function reviewAction(original,action,p={}){
 const c=structuredClone(original),f=c.fields?.[p.field];
 if(action==='verify'){if(f?.comparison!=='MISMATCH')throw Error('Only an existing difference can be verified.');f.verified=true;event(c,'Difference verified',p.field+': MISMATCH retained.')}
 else if(action==='defer'){c.deferred=true;event(c,'Left unresolved',String(p.note||'Waiting for source evidence.').slice(0,2000))}
 else if(action==='multiple'){c.multiple=true;c.pairIssue=true;event(c,'Multiple shipments flagged','Automatic comparison remains paused.')}
 else if(action==='classify'){if(!['BL_COMPARISON','SI_REQUEST','INVOICE_QUERY','GENERAL','SPAM'].includes(p.category)||!p.note?.trim())throw Error('Choose a category and add an evidence note.');c.classification={category:p.category,needsReview:false,reason:p.note,provider:'human'};c.category=p.category;c.classificationPending=false;if(p.category==='BL_COMPARISON'&&!Object.keys(c.fields).length)c.fields=blankFields();event(c,'Category confirmed',p.category+': '+p.note)}
 else if(action==='support'){if(!p.file?.id)throw Error('A stored source file is required.');c.supportFiles||=[];c.supportFiles.push(p.file);event(c,'Supporting source added',p.file.name+'; reprocess and choose the intended pair.')}
 else if(action==='resolve'){
  if(!f||!p.note?.trim()||p.note.trim().length<8)throw Error('Record the evidence location and the fact supporting your decision.');
  if(!['MATCH','MISMATCH'].includes(p.decision))throw Error('Choose the evidence-backed comparison result.');
  if(!p.siValue?.trim()||!p.blValue?.trim())throw Error('Record both independently checked source values.');
  if(['missing_value','comparison_paused','scan_illegible'].includes(f.reason))throw Error('Add readable source material and reprocess before resolving this field.');
  c.sourceVersions||=[];c.sourceVersions.push({version:c.version,fields:structuredClone(c.fields),docs:(c.docs||[]).map(({pages,...meta})=>meta)});
  f.sourceSI??=f.si;f.sourceBL??=f.bl;f.si=p.siValue;f.bl=p.blValue;f.comparison=p.decision;f.reason=null;f.kind=null;f.scope_warning=null;f.verified=p.decision==='MISMATCH';f.manual=true;f.evidenceNote=p.note;
  event(c,'Manual evidence review',`${p.field}: ${p.decision}. SI ${p.siValue}; BL ${p.blValue}. ${p.note}`);
 }else throw Error('Unsupported review action.');
 c.version++;c.updated=new Date().toISOString();return c;
}
