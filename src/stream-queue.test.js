import test from 'node:test';
import assert from 'node:assert/strict';
import {runStreamQueue,createDocumentPool,createStartGate,canResume} from './stream-queue.js';
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
test('a ready comparison starts while another email is still being classified',async()=>{
 const slowRoute=gate(),firstCheck=gate();
 const run=runStreamQueue([{id:'one'},{id:'two'}],{route:async r=>{if(r.id==='two')await slowRoute.promise;return r},needsProcess:()=>true,process:async r=>{if(r.id==='one')firstCheck.resolve()},routeConcurrency:2,processConcurrency:1});
 await firstCheck.promise;slowRoute.resolve();assert.equal((await run).compared,2);
});
test('10,000 unseen records stay bounded and failures do not stop other records',async()=>{
 const seen=new Set(),processed=new Set();let peakRouting=0,peakProcessing=0,peakBuffer=0;
 const result=await runStreamQueue(Array.from({length:10000},(_,id)=>({id})),{
  route:async r=>{assert.ok(!seen.has(r.id));seen.add(r.id);if(r.id===13)throw Error('route failure');return r},
  needsProcess:r=>r.id%2===0,
  process:async r=>{assert.ok(!processed.has(r.id));processed.add(r.id);if(r.id===50)throw Error('process failure');await Promise.resolve()},
  routeConcurrency:7,processConcurrency:3,bufferSize:12,
  onProgress:p=>{peakRouting=Math.max(peakRouting,p.routing);peakProcessing=Math.max(peakProcessing,p.processing);peakBuffer=Math.max(peakBuffer,p.waiting+p.routing)}
 });
 assert.equal(result.finished,10000);assert.equal(result.remaining,0);assert.equal(seen.size,10000);assert.equal(processed.size,5000);assert.equal(result.errors.length,2);assert.ok(peakRouting<=7);assert.ok(peakProcessing<=3);assert.ok(peakBuffer<=12);
});
test('pause drains active checks, retains routed work, and resumes without duplicate checks',async()=>{
 let paused=false;const done=new Set(),routed=new Map(),records=Array.from({length:30},(_,id)=>({id}));
 const options={route:async r=>{routed.set(r.id,r);return r},needsProcess:()=>true,process:async r=>{assert.ok(!done.has(r.id));done.add(r.id);paused=true},routeConcurrency:4,processConcurrency:2,shouldStop:()=>paused};
 const first=await runStreamQueue(records,options);assert.ok(first.remaining>0);assert.equal(first.finished,done.size);
 paused=false;const rest=await runStreamQueue(records.filter(r=>!done.has(r.id)),{...options,route:async r=>routed.get(r.id)||r,process:async r=>{assert.ok(!done.has(r.id));done.add(r.id)}});
 assert.equal(done.size,30);assert.equal(rest.remaining,0);
});
test('document pool deduplicates in-flight reads even with cache eviction and retries failures',async()=>{
 let active=0,peak=0;const attempts=new Map(),hold=gate();
 const read=createDocumentPool(async m=>{active++;peak=Math.max(peak,active);attempts.set(m.id,(attempts.get(m.id)||0)+1);try{if(m.id==='held')await hold.promise;if(m.id==='bad'&&attempts.get(m.id)===1)throw Error('download failed');return m.id}finally{active--}},{concurrency:2,cacheSize:1});
 const original=read({id:'held'});await read({id:'a'});await read({id:'b'});assert.equal(read({id:'held'}),original);hold.resolve();await original;
 await assert.rejects(read({id:'bad'}));await Promise.resolve();assert.equal(await read({id:'bad'}),'bad');assert.equal(attempts.get('held'),1);assert.ok(peak<=2);
});
test('saved unfinished stages can resume, completed and human review cases cannot',()=>{
 for(const status of ['routed','processing','extracting','validating'])assert.equal(canResume({server:true,pipeline:{status}}),true);
 for(const status of ['complete','review'])assert.equal(canResume({server:true,pipeline:{status}}),false);
 assert.equal(canResume({server:false}),false);
});
test('start gate spaces bursts without waiting for earlier work to finish',async()=>{
 let time=0;const waits=[],gate=createStartGate(40,{now:()=>time,sleep:async ms=>{waits.push(ms);time+=ms}});
 await Promise.all([gate(),gate(),gate(),gate()]);assert.deepEqual(waits,[40,40,40]);assert.equal(time,120);
});
