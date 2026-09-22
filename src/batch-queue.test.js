import test from 'node:test';
import assert from 'node:assert/strict';
import {planImportBatches,runBoundedQueue} from './batch-queue.js';
test('ten thousand queue items run once each with bounded concurrency and isolated failures',async()=>{
 const records=Array.from({length:10000},(_,i)=>({id:'new-'+i})),seen=new Set();let active=0,peak=0;
 const result=await runBoundedQueue(records,async item=>{active++;peak=Math.max(peak,active);assert.equal(seen.has(item.id),false);seen.add(item.id);await Promise.resolve();active--;if(item.id==='new-4321')throw Error('Transport unavailable')},{concurrency:3});
 assert.equal(result.finished,10000);assert.equal(seen.size,10000);assert.equal(peak,3);assert.equal(result.errors.length,1);
});
test('pause drains active work and leaves unstarted records resumable',async()=>{
 let pause=false;const records=Array.from({length:20},(_,id)=>({id})),seen=[];
 const first=await runBoundedQueue(records,async r=>{seen.push(r.id);pause=true},{concurrency:1,shouldStop:()=>pause});
 assert.equal(first.remaining,19);await runBoundedQueue(records.filter(r=>!seen.includes(r.id)),async r=>seen.push(r.id));
 assert.equal(new Set(seen).size,20);assert.equal(seen.length,20);
});
test('concurrent queue returns values in source order',async()=>{
 const records=[{id:'first',delay:12},{id:'second',delay:0},{id:'third',delay:4}];
 const result=await runBoundedQueue(records,async item=>{await new Promise(resolve=>setTimeout(resolve,item.delay));return item.id.toUpperCase()},{concurrency:3});
 assert.deepEqual(result.values,['FIRST','SECOND','THIRD']);
});
test('large imports split without dropping emails or mixing attachment references',()=>{
 const rows=Array.from({length:10000},(_,i)=>({id:'new-'+i,subject:'New mail',body:'New text',attachments:i===10?['x/source.pdf']:[]}));
 const chunks=planImportBatches(rows,[{id:'source',name:'x/source.pdf'},{id:'unrelated',name:'unrelated.pdf'}]);
 assert.equal(chunks.flatMap(c=>c.rows).length,10000);assert.equal(new Set(chunks.flatMap(c=>c.rows).map(r=>r.id)).size,10000);
 assert.ok(chunks.every(c=>c.rows.length<=500));assert.equal(chunks.flatMap(c=>c.files).filter(f=>f.id==='source').length,1);assert.ok(chunks.every(c=>!c.files.some(f=>f.id==='unrelated')));
});
