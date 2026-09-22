import test from 'node:test';
import assert from 'node:assert/strict';
import {uploadFile} from './api.js';

test('file uploads retry transient storage errors with a fresh form body',async t=>{
 const originalFetch=globalThis.fetch,originalStorage=globalThis.localStorage,originalDocument=globalThis.document;
 t.after(()=>{globalThis.fetch=originalFetch;globalThis.localStorage=originalStorage;globalThis.document=originalDocument});
 globalThis.localStorage={getItem:()=>null,setItem:()=>{}};globalThis.document={cookie:''};let calls=0;
 globalThis.fetch=async()=>++calls<3?Response.json({error:'temporary storage error'},{status:503}):Response.json({id:'stored'},{status:201});
 const result=await uploadFile(new File(['source'],'source.pdf',{type:'application/pdf'}),async()=>{});
 assert.equal(result.id,'stored');assert.equal(calls,3);
});

test('file uploads do not retry permanent validation errors',async t=>{
 const originalFetch=globalThis.fetch,originalStorage=globalThis.localStorage,originalDocument=globalThis.document;
 t.after(()=>{globalThis.fetch=originalFetch;globalThis.localStorage=originalStorage;globalThis.document=originalDocument});
 globalThis.localStorage={getItem:()=>null,setItem:()=>{}};globalThis.document={cookie:''};let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({error:'bad file'},{status:400})};
 await assert.rejects(()=>uploadFile(new File(['x'],'bad.bin'),async()=>{}),/bad file/);assert.equal(calls,1);
});
