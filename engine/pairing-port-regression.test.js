import test from 'node:test';
import assert from 'node:assert/strict';
import {localExtract,recoverNativeExtraction} from './provider.js';
import {automaticPairEvidence,sourceReferences} from './references.js';
import {compareDocuments,normalizeField} from './rules.js';
import {runPipeline} from './pipeline.js';
import {sourceWeightUnit} from './source-profile.js';
const doc=text=>({id:text,name:'source.txt',pages:[{page:1,text,method:'native'}]});
test('source units come from the same value or its heading, never another field',()=>{
 assert.equal(sourceWeightUnit({}, {raw:'23,702',quote:'TOTAL GROSS WEIGHT: 23,702 KG'}).unit,'KG');
 assert.equal(sourceWeightUnit({}, {raw:'23,702',quote:'Gross Weight (kgs) (毛重 KGS)\t23,702'}).unit,'KG');
 assert.equal(sourceWeightUnit({}, {raw:'23,702',quote:'Gross Weight: 23,702'}),null);
 assert.equal(sourceWeightUnit({}, {raw:'23,702',quote:'Gross Weight: 23,702 Net Weight: 22,000 KG'}),null);
});
test('table separators and tab-delimited headings do not change a company identity',()=>{
 const a=doc('Consignee\tEXAMPLE LTD | 88 MAIN ROAD; SINGAPORE'),b=doc('To the Order of\tEXAMPLE LTD 88 MAIN ROAD SINGAPORE');
 a.fields={consignee:{raw:'EXAMPLE LTD | 88 MAIN ROAD; SINGAPORE',quote:a.pages[0].text,page:1,status:'OK',entity:{address:'88 MAIN ROAD; SINGAPORE'}}};
 b.fields={consignee:{raw:b.pages[0].text,quote:b.pages[0].text,page:1,status:'OK',entity:{address:'88 MAIN ROAD SINGAPORE'}}};
 const field=compareDocuments(a,b).consignee;assert.equal(field.comparison,'MATCH');assert.equal(field.scope_warning,null);
});
test('SI instruction titles are recognized without hiding a second BL title',()=>{
 for(const title of ['BILL OF LADING INSTRUCTION','BILL OF LADING INSTRUCTIONS','BL INSTRUCTIONS'])assert.equal(localExtract(doc(title)).type,'SI');
 assert.equal(localExtract(doc('BILL OF LADING INSTRUCTION\nBILL OF LADING (DRAFT)')).type,'AMBIGUOUS');
 const d=doc('BILL OF LADING INSTRUCTION');assert.equal(recoverNativeExtraction(d,{type:'AMBIGUOUS',fields:{}}).type,'SI');
});
test('typed refs recover inline booking but never turn order or BL numbers into bookings',()=>{
 const a=doc('BILL OF LADING\nB/L NUMBER: BL-9876\tBOOKING NO. BK-1234\nORDER NO.: SO-4567');
 const refs=sourceReferences(a);assert.equal(refs.booking[0].value,'BK-1234');assert.equal(refs.bl[0].value,'BL-9876');assert.equal(refs.order[0].value,'SO-4567');
 assert.equal(localExtract(doc('BILL OF LADING\t3154303911')).booking,null);
 assert.equal(localExtract(doc('BOOKING REFERENCE:\nSHIPPER: EXAMPLE LTD')).booking,null);
 assert.equal(automaticPairEvidence(doc('BOOKING NUMBER:\nSHIPPER: EXAMPLE LTD'),doc('BOOKING NUMBER:\nSHIPPER: EXAMPLE LTD')).ok,false);
});
test('shared typed references permit pairing, while conflicting and unrelated references block it',()=>{
 assert.equal(automaticPairEvidence(doc('ORDER NO.: SO-5678'),doc('ORDER NO.: SO-5678')).ok,true);
 for(const [a,b] of [['BOOKING NO.: BK-1111','BOOKING NO.: BK-2222'],['BOOKING NO.: BK-1111','ORDER NO.: BK-1111'],['ORDER NO.: SO-1111\nBOOKING NO.: BK-1111','ORDER NO.: SO-1111\nBOOKING NO.: BK-2222'],['BOOKING NO.: BK-1111\nBOOKING NO.: BK-2222','BOOKING NO.: BK-1111']])assert.equal(automaticPairEvidence(doc(a),doc(b)).ok,false);
 assert.equal(automaticPairEvidence(doc('BILL OF LADING\t3154303911'),doc('BL INSTRUCTION\t3154303911')).ok,false);
});
test('native recovery adds the source unit and slash field label, not inferred data',()=>{
 const d=doc('Gross Weight (KG): 61,026 KG\nNotify Party/Intermediate Consignee: EXAMPLE LTD');
 const out=recoverNativeExtraction(d,{type:'OTHER',fields:{gross_weight_kg:{raw:'61,026',quote:'Gross Weight (KG): 61,026 KG',page:1,status:'OK'}}});
 assert.equal(out.fields.gross_weight_kg.raw,'61,026 KG');assert.equal(out.fields.notify_party.raw,'EXAMPLE LTD');
});
const portDoc=value=>{const d=doc('Port of discharge: '+value);return {...d,...localExtract(d)}};
test('known place names compare despite a wrong repeated code; unknown places never pass by code alone',()=>{
 assert.equal(compareDocuments(portDoc('MOMBASA, KENYA (KEMBA)'),portDoc('TUTICORIN, INDIA (KEMBA)')).port_of_discharge.comparison,'MISMATCH');
 assert.equal(normalizeField('port_of_discharge','MYSTERY HARBOR (KEMBA)').ok,false);
 assert.equal(normalizeField('port_of_discharge','MOMBASA (ZZZZZ)').ok,false);
 assert.notEqual(normalizeField('port_of_discharge','GDYNIA').value,normalizeField('port_of_discharge','GDANSK').value);
 assert.equal(normalizeField('port_of_discharge','NHAVA SHEVA, INDIA (INNSA)').value,'INNSA');
});
test('complete slash expression is retained; matching source is not a real-world correctness guarantee',()=>{
 const value='RUGAO/NANTONG/SHANGHAI, CHINA (CNSHA)';
 const same=compareDocuments(portDoc(value),portDoc(value)).port_of_discharge;
 assert.equal(same.comparison,'MATCH');assert.ok(same.quality_checks.some(q=>q.sourceWarning==='port_name_code_conflict'));
 assert.equal(compareDocuments(portDoc(value),portDoc('SINGAPORE (CNSHA)')).port_of_discharge.comparison,'MISMATCH');
 assert.equal(compareDocuments(portDoc(value),portDoc('SHANGHAI (CNSHA)')).port_of_discharge.comparison,'MISMATCH');
});
test('cache recovery takes effect in the actual pipeline without a model call',async()=>{
 const si=doc('BILL OF LADING INSTRUCTION\nBOOKING NO.: BK-2222'),bl=doc('BILL OF LADING\nBOOKING NO.: BK-2222');
 const cached=[si,bl].map((d,i)=>({...d,...localExtract(d),sha256:d.id,type:i?'BL':'AMBIGUOUS',providerKey:'grafilab/gemini/gemini-3.5-flash-lite/grafilab/glm-ocr/extract-3'}));
 const before={id:'test',history:[],fields:{},docs:cached,classification:{category:'BL_COMPARISON',needsReview:false,reason:'Compare',provider:'human'}};
 const result=await runPipeline(before,cached,{GRAFILAB_API_KEY:'test'},{keepCategory:true,fetcher:async()=>{throw Error('Cache should avoid paid calls')}});
 assert.equal(result.pair.si,si.id);assert.equal(result.pairEvidence.ok,true);
});

test('unlabelled spreadsheet units and title numbers remain unknown for every file identity',()=>{
 for(const identity of [
  {id:'email_005',name:'email_005_SI.xlsx',sha256:'004468bfffe447312fee7da32951723a06013b00a58c46a1a5facbe5e9583dd1'},
  {id:'new-batch-message',name:'unseen.xlsx',sha256:'unseen-hash'}
 ]){
  const si={...doc('BL INSTRUCTION\t1234567890'),...identity};
  const bl={...doc('BILL OF LADING\t1234567890'),...identity};
  assert.equal(sourceWeightUnit(si,{raw:'23702',quote:'Gross Weight: 23702'}),null);
  assert.deepEqual(sourceReferences(si).order,[]);
  assert.equal(automaticPairEvidence(si,bl).ok,false);
 }
});

test('typed reference pairing generalizes to new identifiers and rejects counterexamples',()=>{
 for(let i=0;i<40;i++){
  const ref='NEW-'+(900001+i),a=doc('ORDER NO.: '+ref),b=doc('ORDER NO.: '+ref);
  a.name='never-seen-'+i+'.pdf';b.name='different-'+i+'.xlsx';
  assert.equal(automaticPairEvidence(a,b).ok,true);
  assert.equal(automaticPairEvidence(a,doc('ORDER NO.: OTHER-'+i)).ok,false);
  assert.equal(automaticPairEvidence(a,doc('BOOKING NO.: '+ref)).ok,false);
 }
});
