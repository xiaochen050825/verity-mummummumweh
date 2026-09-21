// Retry only transport/service failures, never uncertain business decisions.
// A long Retry-After is left for the batch queue to resume later.
export async function transientRequest(send,{sleep=ms=>new Promise(r=>setTimeout(r,ms)),random=Math.random}={}){
 for(let attempt=0;attempt<3;attempt++){
  let res;
  try{res=await send()}catch(error){
   if(attempt===2||!['TimeoutError','TypeError'].includes(error.name))throw error;
  }
  if(res&&![408,429,500,502,503,504,529].includes(res.status))return res;
  if(attempt===2)return res;
  const header=res?.headers.get('Retry-After');
  const requested=header?(Number.isFinite(Number(header))?Number(header)*1000:Date.parse(header)-Date.now()):0;
  if(requested>10000)return res;
  await sleep(Math.max(Number.isFinite(requested)?requested:0,500*2**attempt)+Math.floor(random()*250));
 }
}
