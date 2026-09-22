let transientWorkspace;
function browserWorkspace(){const key='verity-browser-workspace-v1';let id;try{id=localStorage.getItem(key);if(!id){id=crypto.randomUUID();localStorage.setItem(key,id)}}catch{id=transientWorkspace||(transientWorkspace=crypto.randomUUID())}try{document.cookie=`verity_browser_workspace=${id}; Path=/; Max-Age=604800; SameSite=Lax; Secure`}catch{}return id}
export async function api(path,options={}){const response=await fetch('/api'+path,{...options,headers:{'X-Verity-Workspace':browserWorkspace(),...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),...options.headers}});const data=await response.json();if(!response.ok){const error=Error(data.error||'Workspace request failed.');error.status=response.status;throw error}return data}
export async function uploadFile(file,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))){
 let last;
 for(let attempt=0;attempt<3;attempt++)try{const form=new FormData();form.append('file',file);return await api('/files',{method:'POST',body:form})}catch(error){last=error;if(![408,429,500,502,503,504].includes(error.status)||attempt===2)throw error;await wait(200*2**attempt)}
 throw last;
}
export async function cloudFile(file){const response=await fetch('/api/files/'+encodeURIComponent(file.id),{headers:{'X-Verity-Workspace':browserWorkspace()}});if(!response.ok)throw Error('The stored original could not be loaded.');return new File([await response.blob()],file.name,{type:file.type})}
export const saveAction=(c,action,payload)=>api('/cases/'+encodeURIComponent(c.id)+'/actions',{method:'POST',body:JSON.stringify({revision:c.revision,action,payload})});
export const routeCase=c=>api('/cases/'+encodeURIComponent(c.id)+'/route',{method:'POST',body:JSON.stringify({revision:c.revision})});
export const processCase=(c,documents,extra={})=>api('/cases/'+encodeURIComponent(c.id)+'/process',{method:'POST',body:JSON.stringify({revision:c.revision,documents,...extra})});
