// Workflow state is derived from facts; it never changes comparison results.
export function reviewState(c){
 const fields=Object.values(c.fields||{}),differences=fields.filter(f=>f.comparison==='MISMATCH').length;
 const unresolved=fields.filter(f=>f.comparison==null||f.scope_warning).length;
 const base={differences,unresolved,comparisonComplete:fields.length===7&&unresolved===0&&!c.docIssue&&!c.pairIssue&&!c.processingError};
 if(c.processing||['processing','classifying','extracting','pairing','validating','comparing'].includes(c.pipeline?.status))return {...base,key:'processing',label:'Processing',owner:'system'};
 if(c.processingError)return {...base,key:'system_failure',label:'System recovery needed',owner:'system'};
 if(c.classificationPending||!c.pipeline&&!c.demo)return {...base,key:'input_needed',label:'Classification needed',owner:'reviewer'};
 if(c.category!=='BL_COMPARISON'||c.classificationOnly)return {...base,key:'classification_only',label:'Classification complete',owner:null,comparisonComplete:false};
 if(differences){
  const awaiting=fields.some(f=>f.comparison==='MISMATCH'&&!f.verified);
  return {...base,key:awaiting?'business_decision':unresolved||c.docIssue||c.pairIssue?'input_needed':'reviewed_difference',label:unresolved?`Difference found · ${unresolved} unfinished`:awaiting?'Difference · business review':'Difference reviewed',owner:awaiting?'business':unresolved?'reviewer':null};
 }
 if(c.docIssue||c.pairIssue||unresolved||fields.length!==7)return {...base,key:'input_needed',label:'Evidence or clarification needed',owner:'reviewer'};
 return {...base,key:'matched',label:'Seven fields compared',owner:null};
}
