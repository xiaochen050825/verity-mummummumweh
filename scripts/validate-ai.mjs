// Real provider validation with frozen original reader output. This runner never
// opens ground truth. Raw responses are local diagnostics, not deployment files.
import {readFileSync,writeFileSync,mkdirSync,readdirSync,appendFileSync,existsSync} from 'node:fs';
import {resolve,join,basename} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {runPipeline} from '../engine/pipeline.js';
import {competitionOutput} from '../engine/export.js';
const root=process.cwd(),work=resolve(root,'../work'),out=resolve(process.argv[2]||'');
if(!process.argv[2]||existsSync(out))throw Error('Supply a new output directory');
mkdirSync(out,{recursive:true});for(const d of ['cases','responses','images'])mkdirSync(join(out,d));
const selected=process.argv.find(a=>a.startsWith('--ids='))?.slice(6).split(',');
const resume=process.argv.find(a=>a.startsWith('--resume='))?.slice(9),prior=new Map(resume?readdirSync(join(resolve(resume),'cases')).filter(n=>n.endsWith('.json')).map(n=>{const c=JSON.parse(readFileSync(join(resolve(resume),'cases',n),'utf8'));return [c.id,c]}):[]);
const records=readdirSync(join(work,'bundle/inbox')).filter(n=>/^email_\d+\.json$/.test(n)).sort().map(n=>JSON.parse(readFileSync(join(work,'bundle/inbox',n),'utf8'))).filter(e=>!selected||selected.includes(e.email_id));
const readers=new Map(JSON.parse(readFileSync(join(work,'full-benchmark-2026-09-21/reader-documents.json'),'utf8')).map(d=>[d.id,d]));
const decrypt=name=>execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"[void][Reflection.Assembly]::LoadWithPartialName('System.Security'); [Console]::Out.Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String([Console]::In.ReadToEnd()),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))"],{input:readFileSync(join(root,'.sites-runtime/'+name+'-key.dpapi'),'utf8'),encoding:'utf8'}).trim();
const env={GRAFILAB_API_KEY:decrypt('grafilab'),TYPESAFE_API_KEY:decrypt('typesafe'),JEV_MODEL:'jev-1.13.0'};
const digest=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const metadata={startedAt:new Date().toISOString(),status:'running',total:records.length,processed:0,calls:0,estimatedUSD:0,usageMissing:0,readerCache:true,modelCache:false,pricing:'Prior benchmark rate assumptions; not reconciled with current invoice.',sourceFiles:Object.fromEntries(['engine/provider.js','engine/pipeline.js','engine/rules.js','engine/references.js'].map(p=>[p,digest(join(root,p))]))};
if(resume)Object.assign(metadata,{resumeFrom:resolve(resume),modelCache:true,scope:'Only failed stages resumed; other predictions preserved.',retried:[],preserved:[]});
function limiter(max,gap){let active=0,last=0,timer;const queue=[];const pump=()=>{if(active>=max||!queue.length)return;const wait=gap-(Date.now()-last);if(wait>0){clearTimeout(timer);timer=setTimeout(pump,wait);return}active++;last=Date.now();queue.shift()(()=>{active--;pump()});pump()};return ()=>new Promise(r=>{queue.push(r);pump()})}
const jev=limiter(16,80),grafilab=limiter(6,170),save=()=>writeFileSync(join(out,'progress.json'),JSON.stringify(metadata,null,2));
const cases=[];let index=0,reserved=0,sequence=0;
const started=performance.now();save();
async function worker(){while(index<records.length){
 const email=records[index++],at=performance.now();
 const previous=prior.get(email.email_id);
 if(previous&&!previous.processingError){cases.push(previous);writeFileSync(join(out,'cases',email.email_id+'.json'),JSON.stringify(previous));metadata.preserved.push(email.email_id);metadata.processed++;save();continue}
 if(previous)metadata.retried.push(email.email_id);
 const fetcher=async(url,options)=>{
  const isJev=url==='https://api.typesafe.ai/v1/systemone';if(!isJev&&url!=='https://llm.grafilab.ai/v1/chat/completions')throw Error('Unexpected provider endpoint');
  const payload=JSON.parse(options.body),ocr=payload.model==='grafilab/glm-ocr',rates=isJev?[.042,0]:ocr?[.03,.03]:[.25,2.25];
  if(!isJev)payload.max_tokens=8000;
  const queued=performance.now(),release=await (isJev?jev:grafilab)(),queueMs=performance.now()-queued;
  const bound=(Buffer.byteLength(JSON.stringify(payload))+10000)*rates[0]/1e6+8000*rates[1]/1e6;
  if(metadata.estimatedUSD+reserved+bound>3||metadata.calls>=2000){release();throw Error('Validation budget limit reached')}
  reserved+=bound;const n=++sequence,t=performance.now();let response,data,error;
  try{response=await fetch(url,{...options,body:JSON.stringify(payload),signal:AbortSignal.timeout(isJev?15000:ocr?30000:45000)});data=await response.clone().json().catch(()=>null)}catch(e){error=e}finally{reserved-=bound;release()}
  const usage=data?.usage,input=usage?.input_tokens??usage?.prompt_tokens,output=usage?.output_tokens??usage?.completion_tokens;
  const charge=Number.isFinite(input)&&Number.isFinite(output)?(input*rates[0]+output*rates[1])/1e6:null;
  const call={id:email.email_id,n,model:payload.model,http:response?.status??null,ms:performance.now()-t,queueMs,usage:usage||null,estimatedUSD:charge,error:error?.name||null};
  appendFileSync(join(out,'calls.jsonl'),JSON.stringify(call)+'\n');writeFileSync(join(out,'responses',String(n).padStart(4,'0')+'.json'),JSON.stringify({call,request:payload,response:data}));
  metadata.calls++;metadata.estimatedUSD+=charge||0;if(charge===null)metadata.usageMissing++;save();if(error)throw error;return response;
 };
 const docs=(email.attachments||[]).map(id=>{
  const d=structuredClone(readers.get(id));if(!d)throw Error('Missing reader snapshot '+id);
  // Frozen reader snapshots predate the current server-side OCR policy. Remove
  // legacy browser OCR text so scanned pages are freshly read by GLM OCR.
  for(const page of d.pages||[])if(page.method==='ocr'&&!page.ocrEngine){page.text='';delete page.blocks;delete page.confidence;}
  const path=resolve(work,'bundle',id);if(!path.startsWith(resolve(work,'bundle')+'\\'))throw Error('Attachment outside input directory');
  const sha256=digest(path);if(d.sha256&&sha256!==d.sha256)throw Error('Original source hash changed');return {...d,sha256};
 });
 const result=await runPipeline(previous||{id:email.email_id,emailId:email.email_id,subject:email.subject,body:email.body,attachments:email.attachments||[],history:[],fields:{},docs:[],version:1},docs,env,{fetcher,getPageImage:async(doc,page)=>{
  if(!/\.pdf$/i.test(doc.name))return null;
  const prefix=join(out,'images',basename(doc.name,'.pdf')+'-'+page.page),png=prefix+'.png';
  if(!existsSync(png))execFileSync('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.EXE',['-f',String(page.page),'-l',String(page.page),'-singlefile','-scale-to','1800','-png',resolve(work,'bundle',doc.id),prefix],{stdio:'pipe',timeout:30000});
  return 'data:image/png;base64,'+readFileSync(png).toString('base64');
 }});
 result.benchmarkMs=performance.now()-at;cases.push(result);writeFileSync(join(out,'cases',email.email_id+'.json'),JSON.stringify(result));metadata.processed++;save();
 if(metadata.processed%25===0)console.log(JSON.stringify({processed:metadata.processed,total:metadata.total,calls:metadata.calls,estimatedUSD:metadata.estimatedUSD}));
}}
await Promise.all(Array.from({length:Math.min(32,records.length)},worker));
cases.sort((a,b)=>a.id.localeCompare(b.id));const exported=competitionOutput(cases,records.map(e=>e.email_id));
writeFileSync(join(out,'export-check.json'),JSON.stringify(exported,null,2));writeFileSync(join(out,exported.ready?'submission.json':'submission-partial-NOT-FOR-SUBMISSION.json'),JSON.stringify(exported.output,null,2));
Object.assign(metadata,{status:'complete',finishedAt:new Date().toISOString(),totalMs:performance.now()-started,automatic:cases.filter(c=>c.pipeline.status==='complete').length,manual:cases.filter(c=>c.pipeline.status!=='complete').length,blocked:exported.blocked.length});save();console.log(JSON.stringify(metadata));
