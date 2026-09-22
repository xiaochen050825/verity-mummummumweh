export const attachmentNames=row=>(Array.isArray(row.attachments)?row.attachments:[]).map(a=>typeof a==='string'?a:a.filename||a.file_name||a.name||a.path||'');
export const matchingFiles=(rows,files)=>{const names=new Set(rows.flatMap(attachmentNames)),leaves=new Set([...names].map(n=>n.split('/').pop()));return files.filter(f=>names.has(f.name)||leaves.has(f.name.split('/').pop()))};
export function planImportBatches(rows,files){
 const chunks=[],split=part=>{
  const payload={rows:part,files:matchingFiles(part,files)};
  if(part.length<=500&&payload.files.length<=1500&&new TextEncoder().encode(JSON.stringify(payload)).length<=3_000_000){chunks.push(payload);return}
  if(part.length===1)throw Error('One email exceeds the batch request limit. Split its source documents.');
  const half=Math.ceil(part.length/2);split(part.slice(0,half));split(part.slice(half));
 };if(rows.length)split(rows);return chunks;
}
export async function runBoundedQueue(records,handle,{concurrency=3,shouldStop=()=>false,onProgress=()=>{}}={}){
 if(!Number.isInteger(concurrency)||concurrency<1||concurrency>16)throw Error('Invalid queue concurrency');
 let next=0,finished=0;const errors=[],values=[];
 async function worker(){while(!shouldStop()&&next<records.length){const index=next++,item=records[index];try{values[index]=await handle(item,index)}catch(error){errors.push({id:item.id||item.name||String(index),error:error.message})}finished++;onProgress({finished,total:records.length,errors:errors.length})}}
 await Promise.all(Array.from({length:Math.min(concurrency,records.length)},worker));
 return {finished,total:records.length,remaining:records.length-next,errors,values};
}
