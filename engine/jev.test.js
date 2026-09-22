import test from 'node:test';
import assert from 'node:assert/strict';
import {jevShardIndex,makeProvider} from './provider.js';
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
test('uncertainty and intent that contradicts a non-document category fall back without anchoring Gemini',async()=>{
 for(const [category,confidence,intent] of [['BL_COMPARISON',.43,.52],['GENERAL',.99,.9],['INVOICE_QUERY',.99,.5]]){
  const calls=[];const p=makeProvider(env,async(url,opts)=>{calls.push(url);if(url.includes('typesafe'))return answer(category,confidence,intent);const payload=JSON.parse(opts.body);assert.deepEqual(JSON.parse(payload.messages[1].content[0].text),email);return gemini()});
  const result=await p.classify(email);assert.equal(result.category,'SI_REQUEST');assert.equal(result.needsReview,false);assert.equal(result.routingFallback.reason,'uncertain_decision');assert.equal(result.provider,'api');assert.equal(result.routingProvider,'jev');assert.equal(calls.length,2);
 }
});
test('a confident SI request can mention the future draft BL without paying for a second classification',async()=>{
 let calls=0;const p=makeProvider(env,async url=>{calls++;assert.match(url,/typesafe/);return answer('SI_REQUEST',.99,.77)});
 const result=await p.classify(email);assert.equal(result.category,'SI_REQUEST');assert.equal(result.needsReview,false);assert.equal(result.provider,'jev');assert.equal(calls,1);
});
test('Jev overload and malformed answers recover through Gemini',async()=>{
 for(const response of [()=>new Response('',{status:529}),()=>answer('MADE_UP'),()=>answer('SI_REQUEST',null,.1)]){
  const p=makeProvider(env,async url=>url.includes('typesafe')?response():gemini());const result=await p.classify(email);
  assert.equal(result.category,'SI_REQUEST');assert.equal(result.routingFallback.reason,'provider_failure');
 }
});
test('the other TypeSafe account takes over when the selected shard cannot return a valid decision',async()=>{
 const redundant={...env,TYPESAFE_BACKUP_API_KEY:'backup'};const keys=[];
 const p=makeProvider(redundant,async(_url,opts)=>{const key=opts.headers.Authorization;keys.push(key);return keys.length===1?new Response('',{status:429}):answer()});
 const result=await p.classify(email);
 assert.equal(result.provider,'jev');assert.equal(result.routingFailover,true);assert.equal(result.routingAttempts,2);assert.equal(new Set(keys).size,2);
});
test('two TypeSafe accounts split a 520-email batch evenly before failover',async()=>{
 const counts=new Map(),redundant={...env,TYPESAFE_BACKUP_API_KEY:'backup'};
 await Promise.all(Array.from({length:520},(_,i)=>{const item={...email,id:'email_'+String(i+1).padStart(3,'0')};return makeProvider(redundant,async(_url,opts)=>{const key=opts.headers.Authorization;counts.set(key,(counts.get(key)||0)+1);return answer()}).classify(item)}));
 const split=[...counts.values()].sort((a,b)=>a-b);assert.equal(split.reduce((a,b)=>a+b,0),520);assert.ok(split[1]-split[0]<=2);
 assert.notEqual(jevShardIndex({id:'email_001'},2),jevShardIndex({id:'email_002'},2));
});
test('both unavailable TypeSafe accounts are reported before the independent Gemini fallback',async()=>{
 const redundant={...env,TYPESAFE_BACKUP_API_KEY:'backup'};let geminiCalls=0;
 const p=makeProvider(redundant,async(url)=>{if(url.includes('typesafe'))return new Response('',{status:529});geminiCalls++;return gemini()});
 const result=await p.classify(email);
 assert.equal(result.provider,'api');assert.equal(result.routingFallback.reason,'provider_failure');assert.equal(result.routingFallback.errorCode,'AI_TRANSIENT');assert.equal(geminiCalls,1);
});
test('the user-facing failure names every unavailable routing layer',async()=>{
 const redundant={...env,TYPESAFE_BACKUP_API_KEY:'backup'};
 const p=makeProvider(redundant,async()=>new Response('',{status:503}));
 await assert.rejects(()=>p.classify(email),/Both TypeSafe routing accounts and the document AI fallback are unavailable/);
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
