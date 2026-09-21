import test from 'node:test';
import assert from 'node:assert/strict';
import {makeProvider} from './provider.js';
const email={subject:'BL and SI',body:'Please prepare the SI for this shipment.'};
const env={TYPESAFE_API_KEY:'test',GRAFILAB_API_KEY:'test'};
const answer=(choice='SI_REQUEST',confidence=.95,noul=.05)=>Response.json({answers:{category:{choice,confidence},compare_intent:{noul}}});
const gemini=(needsReview=false)=>Response.json({choices:[{message:{content:JSON.stringify({category:'SI_REQUEST',quote:email.body,reason:'Requests SI preparation.',needsReview})}}]});
test('explicit invoice route stays zero-call even with Jev enabled',async()=>{
 const p=makeProvider(env,async()=>{throw Error('Unnecessary paid request')});
 const result=await p.classify({subject:'Invoice query',body:'Query on invoice 123: is this charge billed separately?'});
 assert.equal(result.category,'INVOICE_QUERY');assert.equal(result.needsReview,false);assert.equal(result.provider,'local-rules');assert.equal(result.routingProvider,'jev');
});
test('clear Jev decisions avoid a second model call',async()=>{
 let calls=0;const p=makeProvider(env,async url=>{calls++;assert.match(url,/typesafe/);return answer()});
 const result=await p.classify(email);assert.equal(result.needsReview,false);assert.equal(result.provider,'jev');assert.equal(calls,1);
});
test('uncertainty and contradictory intent fall back independently without anchoring Gemini',async()=>{
 for(const [category,confidence,intent] of [['BL_COMPARISON',.43,.52],['SI_REQUEST',.99,.9],['SI_REQUEST',.99,.5]]){
  const calls=[];const p=makeProvider(env,async(url,opts)=>{calls.push(url);if(url.includes('typesafe'))return answer(category,confidence,intent);const payload=JSON.parse(opts.body);assert.deepEqual(JSON.parse(payload.messages[1].content[0].text),email);return gemini()});
  const result=await p.classify(email);assert.equal(result.category,'SI_REQUEST');assert.equal(result.needsReview,false);assert.equal(result.routingFallback.reason,'uncertain_decision');assert.equal(result.provider,'api');assert.equal(result.routingProvider,'jev');assert.equal(calls.length,2);
 }
});
test('Jev overload and malformed answers recover through Gemini',async()=>{
 for(const response of [()=>new Response('',{status:529}),()=>answer('MADE_UP'),()=>answer('SI_REQUEST',null,.1)]){
  const p=makeProvider(env,async url=>url.includes('typesafe')?response():gemini());const result=await p.classify(email);
  assert.equal(result.category,'SI_REQUEST');assert.equal(result.routingFallback.reason,'provider_failure');
 }
});
test('fallback cannot clear Gemini review or conceal failure of both services',async()=>{
 const p=makeProvider(env,async url=>url.includes('typesafe')?answer('SI_REQUEST',.5,.1):gemini(true));
 assert.equal((await p.classify(email)).needsReview,true);
 const broken=makeProvider(env,async()=>new Response('',{status:503}));await assert.rejects(()=>broken.classify(email),/HTTP 503/);
});
test('without a fallback key uncertainty remains unresolved and overload remains retryable',async()=>{
 assert.equal((await makeProvider({TYPESAFE_API_KEY:'test'},async()=>answer('SI_REQUEST',.5,.1)).classify(email)).needsReview,true);
 await assert.rejects(()=>makeProvider({TYPESAFE_API_KEY:'test'},async()=>new Response('',{status:529})).classify(email),e=>e.code==='AI_TRANSIENT');
});
test('truncated email never auto-routes on Jev confidence alone',async()=>{
 const long={...email,body:email.body+'x'.repeat(13000)};
 const result=await makeProvider({TYPESAFE_API_KEY:'test'},async()=>answer()).classify(long);
 assert.equal(result.needsReview,true);assert.equal(result.body_coverage.complete,false);
});
