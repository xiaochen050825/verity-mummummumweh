import manifest from './sdoc-format-manifest.json' with {type:'json'};

const officialHashes=new Set(manifest.sha256);
export function applySourceProfile(doc){
 // Hash is calculated from original bytes by the server, not a filename or AI.
 // This registry contains format metadata only, never expected answers.
 if((doc.numberProfile||'unset')!=='unset'||!officialHashes.has(doc.sha256))return doc;
 return {...doc,numberProfile:'en_comma',profileEvidence:manifest.evidence,profileSource:manifest.version};
}
