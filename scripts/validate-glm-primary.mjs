// One source-selected scanned email, with fresh GLM reading and extraction.
// No ground truth is loaded. Credentials stay in memory; never log headers.
import {readFileSync,readdirSync,writeFileSync,mkdirSync,appendFileSync} from 'node:fs';
import {resolve,join,basename} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {runPipeline} from '../engine/pipeline.js';
const [sourceArg,outArg]=process.argv.slice(2);if(!sourceArg||!outArg)throw Error('Supply baseline and a new output directory');
const source=resolve(sourceArg),out=resolve(outArg),bundle=resolve('../work/bundle');
const rows=readdirSync(join(source,'cases')).sort().map(f=>JSON.parse(readFileSync(join(source,'cases',f),'utf8')));
const c=rows.find(c=>c.category==='BL_COMPARISON'&&c.docs?.length===2&&c.docs.every(d=>/\.pdf$/i.test(d.name)&&d.pages?.length===1&&d.pages[0].method==='ocr'));
if(!c)throw Error('No eligible scanned pair');
mkdirSync(out);mkdirSync(join(out,'images'));
const docs=structuredClone(c.docs);for(const d of docs){const path=resolve(bundle,d.id);if(!path.startsWith(bundle+'\\'))throw Error('Original outside input directory');if(createHash('sha256').update(readFileSync(path)).digest('hex')!==d.sha256)throw Error('Original changed');d.pages=d.pages.map(p=>({page:p.page,method:'ocr',text:'',imageId:p.imageId}));delete d.fields;delete d.providerKey;delete d.rereads;delete d.rereadRound;delete d.contextReadAttempts;}
const cacheArg=process.argv.find(a=>a.startsWith('--ocr-cache='))?.slice(12);
if(cacheArg){const cached=JSON.parse(readFileSync(resolve(cacheArg),'utf8'));if(cached.id!==c.id)throw Error('Cache is for another email');for(const d of docs){const old=cached.docs.find(x=>x.id===d.id&&x.sha256===d.sha256);if(!old||old.pages.some(p=>!p.ocrEngine||p.ocrSourceHash!==d.sha256))throw Error('OCR cache not bound to this original');d.pages=structuredClone(old.pages)}}
const key=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"[void][Reflection.Assembly]::LoadWithPartialName('System.Security'); [Console]::Out.Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String([Console]::In.ReadToEnd()),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))"],{input:readFileSync('.sites-runtime/grafilab-key.dpapi','utf8'),encoding:'utf8'}).trim();
let count=0;const calls=[],started=performance.now();
const fetcher=async(url,options)=>{
 if(url!=='https://llm.grafilab.ai/v1/chat/completions'||count>=8)throw Error('Validation endpoint/call limit reached');
 const payload=JSON.parse(options.body);payload.max_tokens=8000;const n=++count,t=performance.now();
 const response=await fetch(url,{...options,body:JSON.stringify(payload),signal:AbortSignal.timeout(45000)}),data=await response.clone().json();
 const row={n,model:payload.model,http:response.status,ms:Math.round(performance.now()-t),usage:data.usage||null};calls.push(row);appendFileSync(join(out,'calls.jsonl'),JSON.stringify(row)+'\n');writeFileSync(join(out,'response-'+n+'.json'),JSON.stringify(data));return response;
};
const input={...c,docs:[],sourceVersions:[],fields:{},pairConfirmation:null};
const result=await runPipeline(input,docs,{GRAFILAB_API_KEY:key},{keepCategory:true,fetcher,getPageImage:async(d,p)=>{
 const prefix=join(out,'images',basename(d.name,'.pdf')+'-'+p.page);
 execFileSync('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.EXE',['-f',String(p.page),'-l',String(p.page),'-singlefile','-scale-to','1800','-png',resolve(bundle,d.id),prefix],{stdio:'pipe',timeout:30000});
 return 'data:image/png;base64,'+readFileSync(prefix+'.png').toString('base64');
}});
writeFileSync(join(out,'case.json'),JSON.stringify(result));
const summary={id:c.id,scope:'One scanned email integration check, not whole-batch accuracy or timing.',calls:count,elapsedMs:Math.round(performance.now()-started),status:result.pipeline.status,error:result.processingDetail||null,ocrPages:result.docs?.flatMap(d=>d.pages.map(p=>({method:p.method,engine:p.ocrEngine||null,characters:p.text.length,boundToOriginal:p.ocrSourceHash===d.sha256}))),fields:Object.fromEntries(Object.entries(result.fields).map(([k,v])=>[k,{comparison:v.comparison,reason:v.reason}])),models:calls};writeFileSync(join(out,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
