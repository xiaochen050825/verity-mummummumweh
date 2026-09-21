import test from 'node:test';
import assert from 'node:assert/strict';
import {compareDocuments,normalizeField} from './rules.js';
import {localExtract} from './provider.js';
import {applySourceProfile} from './source-profile.js';

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

test('complete company tokens match across table separators without trusting model address splits',()=>{
 const a=source('FRESH ENTITY LTD | 42 EXAMPLE ROAD; TAX ID 12345'),b=source('FRESH ENTITY LTD 42 EXAMPLE ROAD TAX ID 12345');
 a.fields.shipper.entity={name:'FRESH ENTITY LTD',qualifier:'',address:'42 EXAMPLE ROAD; TAX ID 12345'};
 b.fields.shipper.entity={name:'FRESH ENTITY LTD',qualifier:'TAX ID 12345',address:'42 EXAMPLE ROAD'};
 let f=compareDocuments(a,b).shipper;assert.equal(f.comparison,'MATCH');assert.equal(f.scope_warning,null);
 const different=source('FRESH ENTITY LTD ON BEHALF OF ANOTHER LTD 42 EXAMPLE ROAD TAX ID 12345');
 assert.equal(compareDocuments(a,different).shipper.comparison,'MISMATCH');
 const unknown={sha256:'unseen-source-hash',name:'brand-new.xlsx',numberProfile:'unset'};
 assert.equal(applySourceProfile(unknown).numberProfile,'unset');
 assert.equal(normalizeField('gross_weight_kg','21,577 KG',applySourceProfile(unknown).numberProfile).ok,false);
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
test('file identity never supplies a numeric convention; legacy cached settings are retired',()=>{
 for(const sha256 of ['formerly-registered','new-source']){
  const doc={sha256,name:'email_001_SI.xlsx',numberProfile:'unset'};
  assert.equal(applySourceProfile(doc),doc);
 }
 const legacy=applySourceProfile({numberProfile:'en_comma',profileSource:'sdoc-v2-format-1',profileEvidence:'Official renderer'});
 assert.equal(legacy.numberProfile,'unset');assert.equal(legacy.profileSource,undefined);
 assert.equal(normalizeField('gross_weight_kg','21,577 KG',legacy.numberProfile).ok,false);
 const explicit={numberProfile:'en_comma',profileEvidence:'Sender confirms comma grouping'};
 assert.equal(applySourceProfile(explicit),explicit);
 assert.equal(normalizeField('gross_weight_kg','21,577 KG',explicit.numberProfile).value,'21577');
});

test('documented weight profile detects a real difference and retains missing weight',()=>{
 const a=source('21,577 KG','Gross weight','gross_weight_kg'),b=source('22,577 KG','Gross weight','gross_weight_kg');
 assert.equal(compareDocuments(a,b,{si:'en_comma',bl:'en_comma'}).gross_weight_kg.comparison,'MISMATCH');
 const missing=source('N/A','Gross weight','gross_weight_kg');
 assert.equal(compareDocuments(a,missing,{si:'en_comma',bl:'en_comma'}).gross_weight_kg.kind,'MISSING');
});
