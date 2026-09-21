import test from 'node:test';
import assert from 'node:assert/strict';
import {compareDocuments,normalizeField} from './rules.js';
import {localExtract} from './provider.js';
import {applySourceProfile} from './source-profile.js';
import manifest from './sdoc-format-manifest.json' with {type:'json'};

const source=(value,label='Shipper',key='shipper')=>{
 const d={id:label,pages:[{page:1,text:`${label}: ${value}`,method:'native'}]};
 return {...d,fields:{[key]:{raw:value,quote:d.pages[0].text,page:1,status:'OK'}}};
};
test('identical source blocks override inconsistent model entity splits',()=>{
 const a=source('PAPER TRADING (MIDDLE EAST) FZE\n88 Example Road'),b=structuredClone(a);
 a.fields.shipper.entity={name:'PAPER TRADING',qualifier:'',address:'88 Example Road'};
 b.fields.shipper.entity={name:'PAPER TRADING (MIDDLE EAST) FZE',qualifier:'',address:''};
 const f=compareDocuments(a,b).shipper;
 assert.equal(f.comparison,'MATCH');assert.equal(f.scope_warning,null);
});
test('full source company names and on-behalf-of principals remain material',()=>{
 for(const other of ['PAPER TRADING (MIDDLE EAST) LLC','PAPER TRADING ON BEHALF OF OTHER LTD']){
  const a=source('PAPER TRADING (MIDDLE EAST) FZE'),b=source(other);
  for(const d of [a,b])d.fields.shipper.entity={name:'PAPER TRADING',qualifier:'',address:''};
  assert.equal(compareDocuments(a,b).shipper.comparison,'MISMATCH');
 }
});
test('heading accidentally included in raw is removed only at a proven quote boundary',()=>{
 const a=source('EXAMPLE LTD','Consignee','consignee');
 const b=source('EXAMPLE LTD','To the Order of','consignee');
 b.fields.consignee.raw=b.fields.consignee.quote;
 assert.equal(compareDocuments(a,b).consignee.comparison,'MATCH');
 const material=source('TO THE ORDER OF: EXAMPLE LTD','Consignee','consignee');
 assert.equal(compareDocuments(a,material).consignee.comparison,'MISMATCH');
});
test('equal raw is not a bypass for missing, ambiguous, unreadable or absent evidence',()=>{
 for(const value of ['N/A','', 'TO THE ORDER OF']){
  const a=source(value),b=structuredClone(a);
  a.fields.shipper.status='AMBIGUOUS';
  assert.equal(compareDocuments(a,b).shipper.comparison,null);
 }
 const a=source('PAPER LTD'),b=structuredClone(a);b.pages[0].text='Unrelated text';
 assert.equal(compareDocuments(a,b).shipper.comparison,null);
});
test('same-as-consignee is resolved independently instead of accepted as identical text',()=>{
 const doc=name=>{const d={id:name,pages:[{page:1,method:'native',text:`Consignee: ${name}\nNotify party: SAME AS CONSIGNEE`}]};return {...d,...localExtract(d)}};
 assert.equal(compareDocuments(doc('ONE LTD'),doc('TWO LTD')).notify_party.comparison,'MISMATCH');
});
test('FCL and slash equipment syntax extract the count, not size or aggregate totals',()=>{
 for(const raw of ["10 x 20'FCL",'10 × 40/HC'])assert.equal(normalizeField('container_count',raw).value,'10');
 for(const raw of ["0 x 20'FCL","2 x 20'FCL + 3 x 40'HC",'10 x 40 cartons'])assert.equal(normalizeField('container_count',raw).ok,false);
});
test('numeric profile is attached only to exact official source bytes and never overrides an explicit profile',()=>{
 const known=applySourceProfile({sha256:manifest.sha256[0],numberProfile:'unset'});
 assert.equal(known.numberProfile,'en_comma');assert.match(known.profileEvidence,/render.py/);
 assert.equal(normalizeField('gross_weight_kg','21,577 KG',known.numberProfile).value,'21577');
 const unknown={sha256:'not-an-official-source',name:'email_001_SI.txt',numberProfile:'unset'};
 assert.equal(applySourceProfile(unknown),unknown);
 assert.equal(normalizeField('gross_weight_kg','21,577 MT').ok,false);
 const manual={sha256:manifest.sha256[0],numberProfile:'en_comma',profileEvidence:'Sender confirmation'};
 assert.equal(applySourceProfile(manual),manual);
});
test('documented weight profile detects a real difference and retains missing weight',()=>{
 const a=source('21,577 KG','Gross weight','gross_weight_kg'),b=source('22,577 KG','Gross weight','gross_weight_kg');
 assert.equal(compareDocuments(a,b,{si:'en_comma',bl:'en_comma'}).gross_weight_kg.comparison,'MISMATCH');
 const missing=source('N/A','Gross weight','gross_weight_kg');
 assert.equal(compareDocuments(a,missing,{si:'en_comma',bl:'en_comma'}).gross_weight_kg.kind,'MISSING');
});
