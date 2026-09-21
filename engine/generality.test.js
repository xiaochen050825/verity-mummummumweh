import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticPairEvidence} from './references.js';
import {normalizeField,compareDocuments} from './rules.js';
import {Input,bindSource} from '../server/input.js';
import {imageOnlyPDF} from './export.js';
import {groupedIntegerAgreement} from './numbers.js';

test('conflicting attachment context vetoes automatic pairing',()=>{
 const si={id:'a',side:'si',pages:[{page:1,method:'native',text:'Booking No.: FRESH7182'}]},bl={id:'b',side:'bl',pages:[{page:1,method:'native',text:'BL No.: SHIP3392'}]};
 const ctx={documents:[si,bl],subject:'Please compare'};
 for(const tail of ['for two different shipments.','. They belong to different shipments.','as examples only.','. The BL is not for this shipment.','. One is for a different customer.','. The latter supersedes another consignment.'])assert.equal(automaticPairEvidence(si,bl,{...ctx,body:'Attached are the SI and BL '+tail}).ok,false,tail);
 assert.equal(automaticPairEvidence(si,bl,{...ctx,subject:'BL No.: OTHER9876',body:'Attached are the SI and BL.'}).ok,false);
 assert.equal(automaticPairEvidence(si,bl,{...ctx,body:'Attached are the SI and BL. Please compare.'}).ok,true);
 bl.pages[0].text+='\nBooking No.: FRESH7182';
 assert.equal(automaticPairEvidence(si,bl,{...ctx,body:'Attached are the SI and BL for different shipments.'}).ok,false);
 assert.equal(automaticPairEvidence(si,bl,{...ctx,subject:'BL No.: OTHER9876',body:'Attached are the SI and BL.'}).ok,false);
 assert.equal(automaticPairEvidence(si,bl,{...ctx,subject:'Voyage 763241',body:'Please compare.'}).ok,true);
});

test('ports retain country and arbitrary trailing information',()=>{
 for(const [a,b] of [['SINGAPORE, SINGAPORE','SINGAPORE, CHINA'],['LOS ANGELES, USA','LOS ANGELES, CHILE'],['SINGAPORE','SINGAPORE SOMETHING UNKNOWN'],['SINGAPORE','SINGAPORE, UNKNOWN']]){
  const doc=raw=>({id:raw,pages:[{page:1,text:'Port of loading: '+raw,method:'native'}],fields:{port_of_loading:{raw,quote:'Port of loading: '+raw,page:1,status:'OK'}}});
  assert.notEqual(compareDocuments(doc(a),doc(b)).port_of_loading.comparison,'MATCH');
 }
 for(const [raw,expected] of [['LOS ANGELES, USA','USLAX'],['LOS ANGELES,USA','USLAX'],['LOS ANGELES UNITED STATES','USLAX'],['SINGAPORE, SG','SGSIN'],['PORT KLANG (WESTPORT), MALAYSIA','MYPKG'],['YANGON, MYANMAR','MMRGN'],['YANGON, BURMA','MMRGN']])assert.equal(normalizeField('port_of_loading',raw).value,expected);
 assert.equal(normalizeField('port_of_loading','SINGAPORE (WESTPORT)').ok,false);
});

test('PDF evidence survives actual input contract and source binding',()=>{
 const hash='a'.repeat(64),input={id:'source',name:'file.pdf',pages:[{page:1,text:'',method:'ocr'}],readerEvidence:{format:'pdf',nativeTextChecked:true,reader:'pdfjs-original-inspection',sha256:hash,pages:[{page:1,nativeTextChars:0,rasterImages:1}]}},meta={name:'source.pdf',type:'application/pdf',sha256:hash,size:500};
 assert.deepEqual(Input.parse(input).readerEvidence,input.readerEvidence);
 assert.equal(imageOnlyPDF(bindSource(input,meta)),true);
 assert.throws(()=>bindSource(input,{...meta,sha256:'b'.repeat(64)}));
 assert.throws(()=>bindSource(input,{...meta,type:'image/png'}));
 assert.throws(()=>bindSource({...input,pages:[]},meta));
 assert.throws(()=>Input.parse({...input,readerEvidence:{...input.readerEvidence,pages:[{page:1,nativeTextChars:-1,rasterImages:1}]}}));
 assert.equal(bindSource({...input,readerEvidence:undefined},meta).readerEvidence,undefined);
});

test('same-unit integer and canonical comma grouping agree without case-specific values',()=>{
 for(const [plain,grouped] of [['116055','116,055'],['1234','1,234'],['987654321','987,654,321']]){
  assert.equal(groupedIntegerAgreement(plain,grouped),true);
  assert.equal(groupedIntegerAgreement(grouped,plain),true);
  const doc=raw=>({id:raw,pages:[{page:1,text:'Gross Weight (KG): '+raw,method:'native'}],fields:{gross_weight_kg:{raw,quote:'Gross Weight (KG): '+raw,page:1,status:'OK'}}});
  assert.equal(compareDocuments(doc(plain),doc(grouped)).gross_weight_kg.comparison,'MATCH');
 }
 for(const [a,b] of [['116055','116,05'],['116055','116.055'],['1234','01,234'],['1234','1,235']])assert.equal(groupedIntegerAgreement(a,b),false);
});
