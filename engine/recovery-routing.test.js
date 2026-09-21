import test from 'node:test';
import assert from 'node:assert/strict';
import {makeProvider,localExtract,recoverNativeExtraction} from './provider.js';
import {compareDocuments} from './rules.js';
import {runPipeline} from './pipeline.js';
import {competitionOutput} from './export.js';
test('uncertain email without document keywords actually reaches Gemini fallback',async()=>{
 const email={subject:'Status notification',body:'The automated billing process completed successfully. No action required.'},calls=[];
 const provider=makeProvider({TYPESAFE_API_KEY:'test',GRAFILAB_API_KEY:'test'},async(url,opts)=>{
  calls.push(url);if(url.includes('typesafe'))return Response.json({answers:{category:{choice:'INVOICE_QUERY',confidence:.6},compare_intent:{noul:.05}}});
  assert.deepEqual(JSON.parse(JSON.parse(opts.body).messages[1].content[0].text),email);
  return Response.json({choices:[{message:{content:JSON.stringify({category:'GENERAL',quote:email.body,reason:'Completed notification.',needsReview:false})}}]});
 });
 const result=await provider.classify(email);assert.equal(calls.length,2);assert.equal(result.category,'GENERAL');assert.equal(result.needsReview,false);
});
test('fallback cannot use a fabricated quote to automatically classify spam',async()=>{
 const provider=makeProvider({GRAFILAB_API_KEY:'test'},async()=>Response.json({choices:[{message:{content:JSON.stringify({category:'SPAM',quote:'This text is not in the email.',reason:'Spam.',needsReview:false})}}]}));
 assert.equal((await provider.classify({subject:'Notice',body:'Please review the notice.'})).needsReview,true);
});
test('whole JSON fence is harmless; targeted repair receives actual schema paths',async()=>{
 const doc={name:'example.txt',pages:[{page:1,method:'native',text:'SHIPPING INSTRUCTION\nBooking No.: BK-2000'}]};
 const expected=localExtract(doc);delete expected.provider;let count=0;
 const provider=makeProvider({GRAFILAB_API_KEY:'test'},async(_url,opts)=>{
  count++;const body=JSON.parse(opts.body);
  if(count===1)return Response.json({choices:[{message:{content:JSON.stringify({...expected,fields:{...expected.fields,shipper:{...expected.fields.shipper,page:'one'}}})}}]});
  assert.match(body.messages[0].content,/fields.shipper.page/);
  return Response.json({choices:[{message:{content:'```json\n'+JSON.stringify(expected)+'\n```'}}]});
 });
 assert.equal((await provider.extract(doc)).type,'SI');assert.equal(count,2);
});
test('two invalid attempts retain diagnostic paths without accepting partial data',async()=>{
 let calls=0;const provider=makeProvider({GRAFILAB_API_KEY:'test'},async()=>{calls++;return Response.json({choices:[{message:{content:'{"type":"SI"}'}}]})});
 await assert.rejects(()=>provider.extract({name:'example.txt',pages:[]}),e=>e.code==='AI_INVALID_OUTPUT'&&e.validationIssues.some(i=>i.path==='fields'));assert.equal(calls,2);
});

test('visual reread gets original images without potentially anchoring OCR text or filenames',async()=>{
 const doc={name:'SI_wrong_hint.pdf',pages:[{page:1,method:'ocr',text:'Shipper: CORRUPTED OLD VALUE',imageId:'source-page'}]};
 const expected=localExtract(doc);delete expected.provider;
 const provider=makeProvider({GRAFILAB_API_KEY:'test'},async(_url,opts)=>{
  const body=JSON.parse(opts.body),content=body.messages[1].content;
  assert.deepEqual(JSON.parse(content[0].text),{pages:[{page:1}]});
  assert.equal(content[1].image_url.url,'data:image/png;base64,original');
  assert.doesNotMatch(JSON.stringify(body),/CORRUPTED OLD VALUE|SI_wrong_hint/);
  return Response.json({choices:[{message:{content:JSON.stringify(expected)}}]});
 });
 await provider.reread(doc,['shipper'],'data:image/png;base64,original');
});

test('native heading recovery removes source labels while preserving the actual two defects',()=>{
 const make=(count,weight)=>({pages:[{page:1,method:'native',text:`SHIPPING INSTRUCTIONS\nBooking No.: BK-7788\nShipper/Exporter\tALPHA ON BEHALF OF BETA LTD\nNotify Party\tBETA LTD\nTotal Containers: ${count} x 40'HC\nTOTAL GROSS WEIGHT: ${weight} KG`}]});
 const a=make(5,118270),b=make(4,117770),read=localExtract(a),other=localExtract(b);
 for(const k of ['shipper','notify_party','container_count']){read.fields[k].raw=read.fields[k].quote;if(read.fields[k].entity)read.fields[k].entity.name=read.fields[k].raw;}
 read.fields.gross_weight_kg={raw:'TOTAL GROSS WEIGHT: 118270 KG',quote:'TOTAL GROSS WEIGHT: 118270 KG',page:1,status:'OK'};
 other.fields.gross_weight_kg={raw:'117770 KG',quote:'TOTAL GROSS WEIGHT: 117770 KG',page:1,status:'OK'};
 const recovered=recoverNativeExtraction(a,read),checked=compareDocuments({...a,...recovered},{...b,...other});
 assert.equal(checked.shipper.comparison,'MATCH');assert.equal(checked.notify_party.comparison,'MATCH');
 assert.equal(checked.container_count.comparison,'MISMATCH');assert.equal(checked.gross_weight_kg.comparison,'MISMATCH');
 assert.match(recovered.fields.shipper.raw,/ON BEHALF OF BETA LTD/);
});

test('confirmed corrupt PDF exports unreadable, while a reader service failure stays blocked',async()=>{
 const base={id:'source-case',history:[],fields:{},classification:{category:'BL_COMPARISON',needsReview:false,provider:'human'}},si={id:'si',name:'si.txt',pages:[{page:1,method:'native',text:'SHIPPING INSTRUCTIONS\nBooking Reference: BK-9000'}]};
 const bad={id:'broken-pdf',name:'draft.pdf',pages:[],readError:'Invalid PDF structure.'};
 const c=await runPipeline(base,[si,bad],{},{keepCategory:true});
 assert.equal(c.processingError,null);assert.equal(c.docIssue,'unreadable_file');assert.equal(c.docIssueDetail.fileId,'broken-pdf');
 assert.equal(competitionOutput([c]).output['source-case'].review_reason,'unreadable');
 const service=await runPipeline(base,[si,{...bad,readError:'Network request failed'}],{},{keepCategory:true});
 assert.ok(service.processingError);assert.equal(competitionOutput([service]).ready,false);
});
