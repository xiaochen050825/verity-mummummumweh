import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceReferences,automaticPairEvidence} from './references.js';
const doc=text=>({pages:[{page:1,text,method:'native'}]});
test('full English and Chinese labelled BL references retain type and location',()=>{
 for(const label of ['Bill of Lading No.','B/L NUMBER','提单号','提單號']){
  const refs=sourceReferences(doc(label+'\tABCD0012345'));
  assert.equal(refs.bl[0].value,'ABCD0012345');assert.equal(refs.bl[0].page,1);assert.match(refs.bl[0].quote,/ABCD0012345/);assert.equal(refs.booking.length,0);
 }
});
test('unlabelled title, different reference types and OCR lookalikes cannot establish a pair',()=>{
 assert.equal(automaticPairEvidence(doc('BL INSTRUCTION\t9876543210'),doc('ORDER NO.: 9876543210')).ok,false);
 assert.equal(automaticPairEvidence(doc('Booking No.: 9876543210'),doc('Bill of Lading No.: 9876543210')).ok,false);
 assert.equal(automaticPairEvidence(doc('B/L No.: ABCD1000'),doc('提单号: ABCD1OOO')).ok,false);
});
test('shared labelled BL identity works across label languages, conflicts still veto',()=>{
 assert.equal(automaticPairEvidence(doc('Bill of Lading No.: ABCD0022345'),doc('提单号: ABCD0022345')).ok,true);
 assert.equal(automaticPairEvidence(doc('Bill of Lading No.: ABCD0022345\nBooking No.: TEST1111'),doc('提单号: ABCD0022345\nBooking No.: TEST2222')).ok,false);
});
