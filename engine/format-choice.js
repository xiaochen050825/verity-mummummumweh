import {applySourceProfile} from './source-profile.js';
export function confirmedFormats(documents,choices){
 const known=new Set(documents.map(d=>d.id));
 for(const id of Object.keys(choices))if(!known.has(id))throw Error('Unknown source document.');
 return documents.map(original=>{
  const doc=applySourceProfile(original),choice=choices[doc.id];if(!choice)return doc;
  if(!['unset','en_comma','de_dot'].includes(choice.profile))throw Error('Unsupported number format.');
  const note=String(choice.note||'').trim();
  if(choice.profile!=='unset'&&note.length<8)throw Error('Add the source location or confirmation for each selected document.');
  return {...doc,numberProfile:choice.profile,profileEvidence:choice.profile==='unset'?undefined:note,profileSource:choice.profile==='unset'?undefined:'user_document_weight_confirmation'};
 });
}
