import test from 'node:test';
import assert from 'node:assert/strict';
import {runPipeline} from './pipeline.js';
import {localExtract} from './provider.js';
import {validateEvidence} from './rules.js';
import {weightInterpretations,pairReviewEvidence,contextReadReason} from './review-evidence.js';
import {automaticPairEvidence} from './references.js';

const content=(title,ref='')=>title+'\n'+ref+'\nShipper: A LTD\nConsignee: B LTD\nNotify Party: B LTD\nPort of Loading: SINGAPORE\nPort of Discharge: MOMBASA\nContainer Count: 2\nGross Weight: 25.5 KG';
const document=(id,title)=>{const d={id,name:id+'.pdf',sha256:id+'-original',numberProfile:'unset',pages:[{page:1,method:'ocr',confidence:95,imageId:id+'-image',text:content(title)}]};return {...d,...localExtract(d),side:title==='BILL OF LADING'?'bl':'si',providerKey:'grafilab/gemini/gemini-3.5-flash-lite/grafilab/glm-ocr/extract-3'}};
const setup=()=>({id:'unseen-mail',history:[],fields:{},pairIssue:true,classification:{category:'BL_COMPARISON',needsReview:false,provider:'human'},docs:[document('new-si','SHIPPING INSTRUCTIONS'),document('new-bl','BILL OF LADING')]});
const env={GRAFILAB_API_KEY:'unit-test-not-a-key'};
function providerMock(failure){
 const calls=[];
 return {calls,fetcher:async(url,opts)=>{assert.equal(url,'https://llm.grafilab.ai/v1/chat/completions');const body=JSON.parse(opts.body);calls.push(body.model);
  const ocr=body.model==='grafilab/glm-ocr';
  if(failure==='ocr'&&ocr||failure==='extraction'&&!ocr)return Response.json({error:'unavailable'},{status:400});
  let value;
  if(ocr){const image=body.messages.at(-1).content.find(c=>c.type==='image_url').image_url.url;value=content(image.includes('new-si')?'SHIPPING INSTRUCTIONS':'BILL OF LADING','Booking No.: NEWREF9988')}
  else{const input=JSON.parse(body.messages.at(-1).content[0].text),image=body.messages.at(-1).content.find(c=>c.type==='image_url');
   if(image){assert.ok(input.pages.filter(p=>p.scan).every(p=>p.text===undefined));input.pages=input.pages.map(p=>p.scan?{page:p.page,text:content(image.image_url.url.includes('new-si')?'SHIPPING INSTRUCTIONS':'BILL OF LADING','Booking No.: NEWREF9988')}:p)}
   const {provider,...extracted}=localExtract(input);value=JSON.stringify(extracted)}
  return Response.json({choices:[{message:{content:value}}]});
 }};
}
test('targeted scan recovery links independently reread references and reuses the same original without more calls',async()=>{
 const c=setup(),mock=providerMock();let images=0;
 const options={keepCategory:true,fetcher:mock.fetcher,getPageImage:async d=>{images++;return 'data:image/png;base64,'+d.id}};
 const out=await runPipeline(c,c.docs,env,options);
 assert.equal(out.pipeline.status,'complete');assert.equal(out.pipeline.contextReads,2);assert.equal(out.pairEvidence.method,'shared_source_reference');assert.equal(mock.calls.length,4);assert.equal(images,2);
 const reread=await runPipeline(out,c.docs,env,options);assert.equal(reread.pipeline.status,'complete');assert.equal(mock.calls.length,4);
});
test('first import can request context reading before a reviewer has opened the case',async()=>{
 const c=setup(),docs=c.docs;delete c.docs;c.pairIssue=false;
 const mock=providerMock(),out=await runPipeline(c,docs,env,{keepCategory:true,fetcher:mock.fetcher,getPageImage:async d=>'data:image/png;base64,'+d.id});
 assert.equal(out.pipeline.status,'complete');assert.equal(out.pipeline.contextReads,2);assert.equal(mock.calls.length,4);
});
test('image-only inputs are read directly by GLM with no browser OCR transcript or confidence',async()=>{
 const c=setup(),docs=c.docs.map(d=>({...d,pages:[{page:1,method:'ocr',text:'',imageId:d.id+'-image'}]}));delete c.docs;c.pairIssue=false;
 const mock=providerMock(),out=await runPipeline(c,docs,env,{keepCategory:true,fetcher:mock.fetcher,getPageImage:async d=>'data:image/png;base64,'+d.id});
 assert.equal(out.pipeline.status,'complete');assert.equal(mock.calls.filter(m=>m==='grafilab/glm-ocr').length,2);assert.equal(out.pipeline.rereads,0);assert.equal(out.docs[0].pages[0].ocrSourceHash,docs[0].sha256);
 const noKey=await runPipeline(c,docs,{}, {keepCategory:true});assert.equal(noKey.processingError,'ocr_unavailable');assert.equal(noKey.docIssue,null);
 const missingImage=await runPipeline(c,docs,env,{keepCategory:true,fetcher:mock.fetcher,getPageImage:async()=>null});assert.equal(missingImage.processingError,'ocr_unavailable');
});
test('optional OCR or extraction failure preserves old evidence, records failure and stops automatic retries',async()=>{
 for(const failure of ['ocr','extraction']){
  const c=setup(),mock=providerMock(failure),options={keepCategory:true,fetcher:mock.fetcher,getPageImage:async d=>'data:image/png;base64,'+d.id};
  const out=await runPipeline(c,c.docs,env,options);assert.equal(out.processingError,null);assert.equal(out.pairIssue,true);assert.equal(out.docs[0].pages[0].text,c.docs[0].pages[0].text);assert.equal(out.docs[0].contextReadAttempts[0].status,failure==='ocr'?'failed':'extraction_failed');
  const count=mock.calls.length;await runPipeline(out,c.docs,env,options);assert.equal(mock.calls.length,count);
 }
});
test('clear native text and already reread scans never trigger a speculative context read',()=>{
 const d=document('any','SHIPPING INSTRUCTIONS');d.fields.gross_weight_kg.raw='12,345 KG';
 assert.equal(contextReadReason(d,{...d.pages[0],method:'native'},true),null);
 assert.equal(contextReadReason(d,{...d.pages[0],ocrEngine:'grafilab/glm-ocr'},true),null);
 assert.equal(contextReadReason(d,d.pages[0],false),'weight_context');
});
test('server OCR provenance replaces obsolete browser confidence but never missing evidence or a different original',()=>{
 const d=document('read','SHIPPING INSTRUCTIONS'),p=d.pages[0],f=d.fields.gross_weight_kg;p.confidence=20;
 assert.equal(validateEvidence(f,d,'gross_weight_kg').ok,false);
 p.ocrEngine='grafilab/glm-ocr';p.ocrSourceHash=d.sha256;assert.equal(validateEvidence(f,d,'gross_weight_kg').ok,true);
 assert.equal(validateEvidence({...f,raw:'99 KG'},d,'gross_weight_kg').ok,false);
 p.ocrSourceHash='different-original';assert.equal(validateEvidence(f,d,'gross_weight_kg').ok,false);
});
test('a vision field that disagrees with the OCR source is held for review rather than producing a company defect',async()=>{
 const c=setup(),mock=providerMock(),fetcher=async(url,opts)=>{
  const response=await mock.fetcher(url,opts),payload=JSON.parse(opts.body);
  if(payload.model==='grafilab/glm-ocr')return response;
  const data=await response.json(),result=JSON.parse(data.choices[0].message.content);
  result.fields.shipper={raw:'UNSEEN ENTITY LTD',quote:'Shipper: UNSEEN ENTITY LTD',page:1,status:'OK'};
  return Response.json({choices:[{message:{content:JSON.stringify(result)}}]});
 };
 const out=await runPipeline(c,c.docs,env,{keepCategory:true,fetcher,getPageImage:async d=>'data:image/png;base64,'+d.id});
 assert.equal(out.fields.shipper.comparison,null);assert.equal(out.fields.shipper.reason,'evidence_not_located');assert.equal(out.pipeline.rereads,0);assert.equal(out.pipeline.status,'review');
});
test('human weight options show actual independent kg values and keep a missing unit unresolved',()=>{
 const d={fields:{gross_weight_kg:{raw:'12,345 KG',quote:'Gross weight: 12,345 KG'}}};
 assert.deepEqual(weightInterpretations(d).map(x=>x.value),['12345','12.345']);
 d.fields.gross_weight_kg={raw:'12,345 MT',quote:'Gross weight: 12,345 MT'};assert.deepEqual(weightInterpretations(d).map(x=>x.value),['12345000','12345']);
 d.fields.gross_weight_kg={raw:'12345',quote:'Gross weight: 12345'};assert.ok(weightInterpretations(d).every(x=>x.value===null));
});
test('unlabelled shared numbers are displayed for human review and never establish automatic identity',()=>{
 const a={id:'a',name:'any.xlsx',pages:[{page:1,method:'native',text:'BL INSTRUCTION\t77889911'}]},b={id:'b',name:'different.docx',pages:[{page:1,method:'native',text:'Order No.: 77889911'}]};
 const snapshot=JSON.stringify([a,b]),rows=pairReviewEvidence([a,b]);assert.equal(rows[0].untyped[0].value,'77889911');assert.equal(rows[1].references[0].kind,'order');assert.equal(automaticPairEvidence(a,b).ok,false);assert.equal(JSON.stringify([a,b]),snapshot);
});
