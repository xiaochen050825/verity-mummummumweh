import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmedFormats} from './format-choice.js';
import {reviewState} from './review-state.js';
import {runPipeline} from './pipeline.js';
test('format confirmation stays with the chosen document and requires separate evidence',()=>{
 const docs=[{id:'a',numberProfile:'unset'},{id:'b',numberProfile:'unset'}];
 const updated=confirmedFormats(docs,{a:{profile:'de_dot',note:'Page 1 explicitly states decimal comma.'}});
 assert.equal(updated[0].numberProfile,'de_dot');assert.equal(updated[1].numberProfile,'unset');assert.equal(docs[0].numberProfile,'unset');
 assert.throws(()=>confirmedFormats(docs,{a:{profile:'en_comma',note:'yes'}}));
 assert.throws(()=>confirmedFormats(docs,{other:{profile:'en_comma',note:'Page 1 convention'}}));
 assert.equal(confirmedFormats([{...docs[0],numberProfile:'en_comma',profileSource:'sdoc-v2-format-1'}],{} )[0].numberProfile,'unset');
});
test('an evidenced manual pair persists only while both original file hashes are unchanged',async()=>{
 const doc=(id,title)=>({id,sha256:id+'-bytes',name:id+'.txt',pages:[{page:1,method:'native',text:title+'\nShipper: A LTD\nConsignee: B LTD\nNotify Party: B LTD\nPort of Loading: SINGAPORE\nPort of Discharge: MOMBASA\nContainer Count: 2\nGross Weight: 12.5 KG'}]});
 const docs=[doc('one','SHIPPING INSTRUCTIONS'),doc('two','BILL OF LADING')];
 const c={id:'new-mail',history:[],fields:{},classification:{category:'BL_COMPARISON',needsReview:false,provider:'human'}};
 const first=await runPipeline(c,docs,{}, {keepCategory:true,pair:{si:'one',bl:'two',note:'Sender confirmed these two attachments in current correspondence.'}});
 assert.equal(first.pipeline.status,'complete');assert.equal(first.pairConfirmation.siHash,'one-bytes');
 const again=await runPipeline(first,docs,{}, {keepCategory:true});assert.equal(again.pipeline.status,'complete');
 const changed=structuredClone(docs);changed[1].sha256='replaced-bytes';
 const next=await runPipeline(again,changed,{}, {keepCategory:true});assert.equal(next.pairIssue,true);assert.equal(next.pairConfirmation,null);
});
test('business decisions and incomplete checks remain distinct without hiding differences',()=>{
 const c={category:'BL_COMPARISON',pipeline:{status:'review'},fields:Object.fromEntries(Array.from({length:7},(_,i)=>[i,{comparison:'MATCH'}]))};
 assert.equal(reviewState(c).key,'matched');
 c.fields[0]={comparison:'MISMATCH'};c.fields[1]={comparison:null,kind:'MISSING'};
 const before=JSON.stringify(c),state=reviewState(c);assert.equal(state.key,'business_decision');assert.equal(state.comparisonComplete,false);assert.equal(state.unresolved,1);assert.equal(JSON.stringify(c),before);
 c.fields[0].verified=true;assert.equal(reviewState(c).key,'input_needed');
 c.fields[1].comparison='MATCH';assert.equal(reviewState(c).key,'reviewed_difference');
 c.processingError='service_timeout';assert.equal(reviewState(c).key,'system_failure');assert.equal(reviewState(c).differences,1);
 assert.equal(reviewState({category:'GENERAL',pipeline:{status:'complete'}}).key,'classification_only');
});
