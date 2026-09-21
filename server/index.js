import {z} from 'zod';
import {runPipeline,reviewAction,PIPELINE_VERSION} from '../engine/pipeline.js';
import {providerStatus} from '../engine/provider.js';
import {importEmails,buildReport} from '../src/model.js';
import {competitionOutput,diagnostics} from '../engine/export.js';
import {RULE_VERSION} from '../engine/rules.js';
import {applySourceProfile} from '../engine/source-profile.js';
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const Input=z.object({id:z.string().max(300),name:z.string().max(500),pages:z.array(z.object({page:z.number().int().min(1).max(30),text:z.string().max(100000),method:z.enum(['native','ocr']),confidence:z.number().min(0).max(100).optional(),imageId:z.string().optional(),blocks:z.array(z.unknown()).max(5000).optional()})).max(30),readError:z.string().max(500).optional(),numberProfile:z.enum(['unset','en_comma','de_dot']).optional(),profileEvidence:z.string().max(2000).optional()});
async function body(req){const text=await req.text();if(text.length>4_000_000)throw Error('Request too large.');return JSON.parse(text)}
async function fileMeta(env,owner,id){const f=await env.DB.prepare('SELECT * FROM files WHERE owner=? AND id=?').bind(owner,id).first();if(!f)throw Error('Source file not found.');return f}
async function getCase(env,owner,id){const row=await env.DB.prepare('SELECT data,revision FROM cases WHERE owner=? AND id=?').bind(owner,id).first();if(!row)throw Error('Case not found.');return {...JSON.parse(row.data),revision:row.revision,server:true}}
async function saveCase(env,owner,c,expected){const out={...c,revision:expected+1,server:true};const data=JSON.stringify(out);if(data.length>1_500_000)throw Error('This case exceeds the evidence storage limit. Split the source documents.');const result=await env.DB.prepare('UPDATE cases SET data=?, revision=revision+1 WHERE id=? AND owner=? AND revision=?').bind(data,c.id,owner,expected).run();if(!result.meta.changes){const e=Error('This case changed in another session. Refresh before saving.');e.status=409;throw e}return out}
export default {async fetch(req,env){
 const url=new URL(req.url);if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(req);
 try{
  const owner=req.headers.get('oai-authenticated-user-id')||(env.LOCAL_DEV==='true'&&['127.0.0.1','localhost'].includes(url.hostname)?'local-reviewer':null);
  if(!owner)return reply({error:'Sign in to access this workspace.'},401);
  const origin=req.headers.get('origin'),localPreview=env.LOCAL_DEV==='true'&&['127.0.0.1','localhost'].includes(url.hostname)&&origin==='http://127.0.0.1:5178';
  if(!['GET','HEAD'].includes(req.method)&&!localPreview&&(req.headers.get('sec-fetch-site')==='cross-site'||origin&&origin!==url.origin))return reply({error:'Cross-origin write rejected.'},403);
  if(!env.DB||!env.BUCKET)return reply({error:'Workspace storage is unavailable.'},503);
  if(url.pathname==='/api/status')return reply({...providerStatus(env),storage:'cloud',ocr:'tesseract-eng',rules:RULE_VERSION});
  if(url.pathname==='/api/workspace'&&req.method==='GET'){
   const [b,c]=await Promise.all([env.DB.prepare('SELECT data FROM batches WHERE owner=? ORDER BY created DESC').bind(owner).all(),env.DB.prepare('SELECT data,revision FROM cases WHERE owner=?').bind(owner).all()]);return reply({batches:b.results.map(x=>JSON.parse(x.data)),cases:c.results.map(x=>({...JSON.parse(x.data),revision:x.revision,server:true}))});
  }
  if(url.pathname==='/api/files'&&req.method==='POST'){
   if(Number(req.headers.get('content-length')||0)>27_000_000)return reply({error:'File limit is 25 MB.'},413);
   const form=await req.formData(),file=form.get('file');if(!file||typeof file.arrayBuffer!=='function'||file.size>25*1024*1024)throw Error('Choose a file up to 25 MB.');
   const id=crypto.randomUUID(),bytes=await file.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
   const h=new Uint8Array(bytes),mime=h[0]===0x89&&h[1]===0x50?'image/png':h[0]===0xff&&h[1]===0xd8?'image/jpeg':String.fromCharCode(...h.slice(0,4))==='%PDF'?'application/pdf':file.type;
   const meta={id,name:file.name,size:file.size,type:mime,sha256:hash,server:true,added:new Date().toISOString()};
   await env.BUCKET.put(owner+'/'+id,bytes,{httpMetadata:{contentType:file.type||'application/octet-stream'}});
   await env.DB.prepare('INSERT INTO files(id,owner,name,type,size,sha256,data) VALUES(?,?,?,?,?,?,?)').bind(id,owner,meta.name,meta.type,meta.size,hash,JSON.stringify(meta)).run();return reply(meta,201);
  }
  if(url.pathname.startsWith('/api/files/')&&req.method==='GET'){
   const id=decodeURIComponent(url.pathname.slice(11)),meta=await fileMeta(env,owner,id),obj=await env.BUCKET.get(owner+'/'+id);if(!obj)return reply({error:'Original file unavailable.'},404);
   return new Response(obj.body,{headers:{'Content-Type':meta.type||'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(meta.name),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});
  }
  if(url.pathname==='/api/batches'&&req.method==='POST'){
   const input=await body(req);if(!Array.isArray(input.rows)||!input.rows.length||input.rows.length>1000)throw Error('Import 1–1000 messages per batch.');
   if(!Array.isArray(input.files)||input.files.length>1500)throw Error('Import at most 1500 extracted attachments.');
   const metas=[];for(const f of input.files)metas.push(JSON.parse((await fileMeta(env,owner,f.id)).data));
   const id='batch-'+crypto.randomUUID(),rows=importEmails(input.rows,id),batch={id,name:'Import '+new Date().toLocaleDateString('en-GB'),count:rows.length,demo:false,server:true,created:new Date().toISOString(),files:metas};
   const statements=[env.DB.prepare('INSERT INTO batches(id,owner,data,created) VALUES(?,?,?,?)').bind(id,owner,JSON.stringify(batch),batch.created)];
   const records=rows.map(c=>({...c,server:true,revision:1}));for(const c of records)statements.push(env.DB.prepare('INSERT INTO cases(id,owner,batch_id,data,revision) VALUES(?,?,?,?,1)').bind(c.id,owner,id,JSON.stringify(c)));
   await env.DB.batch(statements);return reply({batch,cases:records},201);
  }
  const match=url.pathname.match(/^\/api\/cases\/([^/]+)\/(process|actions)$/);
  if(match&&req.method==='POST'){
   const id=decodeURIComponent(match[1]),input=await body(req),c=await getCase(env,owner,id);
   if(input.revision!==c.revision)return reply({error:'This case changed. Refresh before trying again.'},409);
   if(match[2]==='actions'){
    if(input.action==='support'){const f=await fileMeta(env,owner,input.payload?.file?.id);input.payload.file=JSON.parse(f.data)}
    const out=reviewAction(c,input.action,input.payload);return reply(await saveCase(env,owner,out,c.revision));
   }
   if(!Array.isArray(input.documents)||input.documents.length>12)throw Error('Choose at most 12 document candidates.');
   const docs=[];for(const raw of input.documents){const d=Input.parse(raw);const f=await fileMeta(env,owner,d.id);for(const p of d.pages)if(p.imageId)await fileMeta(env,owner,p.imageId);docs.push(applySourceProfile({...d,numberProfile:d.numberProfile||'unset',name:f.name,sha256:f.sha256,size:f.size,server:true}))}
   const fingerprint=docs.map(d=>d.sha256+':'+d.numberProfile).sort().join('|'),sameSource=c.sourceFingerprint===fingerprint,sameEngine=c.pipeline?.engineVersion===PIPELINE_VERSION;
   if(c.processingError==='processing_failed'&&sameSource&&sameEngine)throw Error('The provider or output contract needs correction. This failed request cannot be repeated on unchanged sources.');
   if(c.processingError&&sameSource&&sameEngine&&c.retries>=1)throw Error('This source version has reached its retry limit. Add new source material.');
   // Persist the exact reading before external requests, so reload/retry never needs fabricated evidence.
   for(const d of docs)if(d.numberProfile!=='unset'&&!d.profileEvidence?.trim())throw Error('A number-format setting needs source evidence.');
   let reading=structuredClone(c);reading.sourceInputs=docs;reading.processingError=null;reading.pipeline={...c.pipeline,status:'processing',startedAt:new Date().toISOString()};reading=await saveCase(env,owner,reading,c.revision);
   const out=await runPipeline(reading,docs,env,{keepCategory:input.keepCategory,pair:input.pair,getPageImage:async(doc,page)=>{const imageId=page?.imageId;if(!imageId)return null;const f=await fileMeta(env,owner,imageId);if(!/^image\/(png|jpeg)$/.test(f.type)||f.size>2_000_000)return null;const obj=await env.BUCKET.get(owner+'/'+imageId);const bytes=new Uint8Array(await obj.arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return 'data:'+f.type+';base64,'+btoa(s)}});
   out.retries=c.processingError&&sameSource&&sameEngine?(c.retries||0)+1:0;out.sourceFingerprint=fingerprint;return reply(await saveCase(env,owner,out,reading.revision));
  }
  if(url.pathname==='/api/export'&&req.method==='GET'){
   const rows=await env.DB.prepare('SELECT data FROM cases WHERE owner=?').bind(owner).all(),b=await env.DB.prepare('SELECT data FROM batches WHERE owner=?').bind(owner).all(),cases=rows.results.map(r=>JSON.parse(r.data));return reply({...buildReport(cases,b.results.map(r=>JSON.parse(r.data))),diagnostics:diagnostics(cases),competition:competitionOutput(cases)});
  }
  return reply({error:'Route not found.'},404);
 }catch(e){console.error('Verity request failed',e.name,e.message);return reply({error:e instanceof z.ZodError?'The processing payload is invalid.':e.message||'Processing failed.'},e.status||400)}
}};
