import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticPairEvidence} from './references.js';
const setup=()=>{
 const si={id:'fresh-si',side:'si',pages:[{page:1,method:'native',text:'Booking No.: ZX900123'}]},bl={id:'fresh-bl',side:'bl',pages:[{page:1,method:'native',text:'Bill of Lading No.: CARRIER777890'}]};
 return {si,bl,ctx:{documents:[si,bl],subject:'Please confirm CARRIER777890',body:'Attached are the shipping instructions and draft bill of lading for ZX900123. Please verify.'}};
};
test('current attachment declaration bridges the SI booking and BL number with quotes',()=>{
 const {si,bl,ctx}=setup(),r=automaticPairEvidence(si,bl,ctx);
 assert.equal(r.ok,true);assert.equal(r.method,'current_email_attachment_link');assert.match(r.matches[0].email.quote,/ZX900123/);
 assert.equal(automaticPairEvidence(si,bl,{...ctx,body:ctx.body.replace('. Please verify.',' for your confirmation.')}).ok,true);
 assert.equal(automaticPairEvidence(si,bl,{...ctx,body:ctx.body+' Also for XX900124.'}).ok,false);
 // The comparison fields deliberately differ: pairing never examines them.
 si.fields={shipper:{raw:'ALPHA'}};bl.fields={shipper:{raw:'BETA'}};assert.equal(automaticPairEvidence(si,bl,ctx).ok,true);
});
test('the current email can explicitly pair its only typed SI and BL without a shared identifier',()=>{
 const {si,bl,ctx}=setup();
 assert.equal(automaticPairEvidence(si,bl,{...ctx,subject:'Please check the attached documents',body:'Attached are the SI and draft BL. Please check the details and confirm.'}).method,'current_email_explicit_pair_declaration');
 assert.equal(automaticPairEvidence(si,bl,{...ctx,subject:'Please check',body:'Attached are the SI and draft BL for OC 5ABC-12345. Please check.'}).ok,true);
 assert.equal(automaticPairEvidence(si,bl,{...ctx,subject:'Please check',body:'Attached are the SI and draft BL for ZX900123. Please check.'}).ok,true);
 assert.equal(automaticPairEvidence(si,bl,{...ctx,subject:'Please check',body:'Attached are the SI and draft BL for ZX900124. Please check.'}).ok,false);
});
test('co-occurrences, quoted threads, conflicting references and extra documents do not bridge',()=>{
 const {si,bl,ctx}=setup();
 for(const body of ['Please compare ZX900123 and CARRIER777890.','Attached are invoices for ZX900123.','Attached are SI and BL for ZX900124.','Attached are SI and BL for ZX900123.\nDo not use these files.','Hello\nFrom: old sender\n'+ctx.body,'Hello\n> '+ctx.body])assert.equal(automaticPairEvidence(si,bl,{...ctx,body}).ok,false,body);
 for(const subject of ['Please confirm XCARRIER777890','Fwd: CARRIER777890','CARRIER777890 wrong attachment'])assert.equal(automaticPairEvidence(si,bl,{...ctx,subject}).ok,false,subject);
 assert.equal(automaticPairEvidence(si,bl,{...ctx,documents:[si,bl,{...bl,id:'revision'}]}).ok,false);
 const conflict=structuredClone(bl);conflict.pages[0].text+='\nBooking No.: OTHER123';assert.equal(automaticPairEvidence(si,conflict,{...ctx,documents:[si,conflict]}).ok,false);
});
test('renaming files and IDs cannot alter reference evidence; numeric substrings cannot anchor',()=>{
 for(let i=0;i<40;i++){
  const {si,bl,ctx}=setup();si.id='arbitrary-'+i;bl.id='unseen-'+i;si.name='test-'+i+'.txt';bl.name='other-'+i+'.pdf';si.sha256='changed-'+i;
  assert.equal(automaticPairEvidence(si,bl,ctx).ok,true);
  assert.equal(automaticPairEvidence(si,bl,{...ctx,body:ctx.body.replace('ZX900123','ZX9001234')}).ok,false);
 }
});
test('new reference values and wording variants preserve the same evidence requirements',()=>{
 for(let i=101;i<151;i++){
  const {si,bl,ctx}=setup(),booking='FRESH'+i+'42',bill='LINE'+(i+317)+'008';
  si.pages[0].text='Booking Reference: '+booking;bl.pages[0].text='提单号: '+bill;
  const body=i%2?'Enclosed are the SI and BL for '+booking+'.':'Please review the attached draft bill of lading and shipping instruction for booking '+booking+' for your approval.';
  const context={...ctx,subject:'Review '+bill,body};
  assert.equal(automaticPairEvidence(si,bl,context).ok,true);
  const wrong=structuredClone(bl);wrong.pages[0].text='提单号: '+bill+'9';assert.equal(automaticPairEvidence(si,wrong,{...context,documents:[si,wrong]}).ok,false);
 }
});
