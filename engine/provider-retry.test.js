import test from 'node:test';
import assert from 'node:assert/strict';
import {transientRequest} from './provider-retry.js';
test('temporary service failure recovers with bounded backoff',async()=>{
 let calls=0;const waits=[];
 const res=await transientRequest(async()=>new Response('',{status:++calls<3?500:200}),{sleep:async n=>waits.push(n),random:()=>0});
 assert.equal(res.status,200);assert.equal(calls,3);assert.deepEqual(waits,[500,1000]);
});
test('persistent failures stop; configuration errors and long rate limits are not hammered',async()=>{
 for(const [status,header,expected] of [[503,null,3],[401,null,1],[429,'120',1]]){
  let calls=0;const result=await transientRequest(async()=>{calls++;return new Response('',{status,headers:header?{'Retry-After':header}:{}})},{sleep:async()=>{},random:()=>0});
  assert.equal(calls,expected);assert.equal(result.status,status);
 }
});
test('caller cancellation stays cancelled',async()=>{
 let calls=0;await assert.rejects(()=>transientRequest(async()=>{calls++;throw new DOMException('Cancelled','AbortError')},{sleep:async()=>{}}),{name:'AbortError'});assert.equal(calls,1);
});
