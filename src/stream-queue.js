// Separate routing and document lanes: a slow document must not serialize email routing.
// Backpressure bounds prepared work; no promise is created for each of 10,000 emails.
export function runStreamQueue(records,{route,needsProcess,process,routeConcurrency=20,processConcurrency=12,bufferSize=24,shouldStop=()=>false,onProgress=()=>{}}){
 for(const n of [routeConcurrency,processConcurrency,bufferSize])if(!Number.isInteger(n)||n<1||n>64)throw Error('Invalid stream concurrency');
 let next=0,routing=0,processing=0,finished=0,routed=0,compared=0;
 const ready=[],errors=[];
 return new Promise(resolve=>{
  const progress=()=>onProgress({finished,total:records.length,routed,compared,routing,processing,waiting:ready.length,errors:errors.length});
  const fail=(item,error)=>{errors.push({id:item.id,error:error.message});finished++};
  function pump(){
   while(!shouldStop()&&processing<processConcurrency&&ready.length){
    const item=ready.shift();processing++;
    Promise.resolve().then(()=>process(item)).then(()=>{finished++;compared++},error=>fail(item,error)).finally(()=>{processing--;progress();pump()});
   }
   while(!shouldStop()&&routing<routeConcurrency&&next<records.length&&ready.length+routing<bufferSize){
    const item=records[next++];routing++;
    (async()=>{try{const updated=await Promise.resolve().then(()=>route(item));const required=needsProcess(updated);routed++;if(required)ready.push(updated);else finished++}catch(error){fail(item,error)}finally{routing--;progress();pump()}})();
   }
   if(!routing&&!processing&&(shouldStop()||next===records.length&&!ready.length))resolve({finished,routed,compared,total:records.length,remaining:records.length-finished,errors});
  }
  pump();
 });
}

// Bound expensive PDF rendering separately from mostly waiting network requests.
export function createDocumentPool(read,{concurrency=4,cacheSize=32}={}){
 if(!Number.isInteger(concurrency)||concurrency<1||concurrency>8||!Number.isInteger(cacheSize)||cacheSize<0)throw Error('Invalid document pool size');
 const pending=new Map(),cache=new Map(),queue=[];let active=0;
 function pump(){while(active<concurrency&&queue.length){const {meta,resolve,reject}=queue.shift();active++;
  Promise.resolve().then(()=>read(meta)).then(value=>{cache.set(meta.id,value);while(cache.size>cacheSize)cache.delete(cache.keys().next().value);resolve(value)},reject).finally(()=>{pending.delete(meta.id);active--;pump()});
 }}
 return meta=>{
  if(pending.has(meta.id))return pending.get(meta.id);
  if(cache.has(meta.id)){const value=cache.get(meta.id);cache.delete(meta.id);cache.set(meta.id,value);return Promise.resolve(value)}
  const promise=new Promise((resolve,reject)=>queue.push({meta,resolve,reject}));pending.set(meta.id,promise);pump();return promise;
 };
}

export function createStartGate(intervalMs,{now=()=>performance.now(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 if(!Number.isFinite(intervalMs)||intervalMs<0||intervalMs>10000)throw Error('Invalid start interval');
 let next=0,tail=Promise.resolve();
 return ()=>{
  const turn=tail.then(async()=>{const current=now(),wait=Math.max(0,next-current);next=Math.max(next,current)+intervalMs;if(wait)await sleep(wait)});
  tail=turn.catch(()=>{});return turn;
 };
}

export const canResume=c=>!!c.server&&(!c.pipeline||['classifying','routed','processing','extracting','pairing','validating','comparing','recovering'].includes(c.pipeline.status)||!!(c.processingError&&/Invalid redirect value/i.test(c.processingDetail||'')));
