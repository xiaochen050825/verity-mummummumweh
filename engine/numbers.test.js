import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNumber,exactDecimal,invariantNumericComparison} from './numbers.js';
import {compareDocuments,normalizeField} from './rules.js';
import {sourceNumericCell} from './source-profile.js';
const doc=(raw,cells)=>({id:'new-source',pages:[{page:1,method:'native',text:'Gross weight: '+raw,...(cells?{blocks:[{text:'Gross weight: '+raw,cells}]}:{})}],fields:{gross_weight_kg:{raw,quote:'Gross weight: '+raw,page:1,status:'OK'}}});
test('strict supported number grammars distinguish ambiguous separators without a locale guess',()=>{
 for(const [raw,value] of [['1,234,567','1234567'],['1.234.567','1234567'],['1,234.56','1234.56'],['1.234,56','1234.56'],['21,5','21.5'],['21,57','21.57'],['21,5771','21.5771'],['0,577','0.577'],['1,23,456.78','123456.78'],["1’234.5",'1234.5'],['12 345,67','12345.67']])assert.equal(parseNumber(raw).value,value,raw);
 for(const raw of ['21,577','21.577']){assert.equal(parseNumber(raw).ok,false);assert.equal(parseNumber(raw).candidates.length,2)}
 for(const raw of ['1,23,45','21,','1..2','1,234.5.6','-2','1/2'])assert.equal(parseNumber(raw).ok,false,raw);
 assert.equal(parseNumber('21.577','de_dot').value,'21577');
 assert.equal(parseNumber('21.577','en_comma').value,'21.577');
});
test('all combinations must agree, while identical source tokens prove document agreement',()=>{
 assert.equal(invariantNumericComparison(parseNumber('21,577'),parseNumber('21,577')),null);
 assert.equal(invariantNumericComparison(parseNumber('21,577'),parseNumber('21,577'),true),'MATCH');
 assert.equal(invariantNumericComparison(parseNumber('21,577'),parseNumber('22,577')),'MISMATCH');
 assert.equal(invariantNumericComparison(parseNumber('21,577'),parseNumber('21577')),null);
 assert.equal(invariantNumericComparison(parseNumber('21.5'),parseNumber('21,5')),'MATCH');
 assert.equal(compareDocuments(doc('21,577 KG'),doc('21,577 KG')).gross_weight_kg.comparison,'MATCH');
 const omittedUnit=doc('21,577 KG');omittedUnit.fields.gross_weight_kg.raw='21,577';
 assert.equal(compareDocuments(omittedUnit,doc('21,577 KG')).gross_weight_kg.comparison,'MATCH');
 assert.equal(compareDocuments(doc('21,577 KG'),doc('21.577 KG')).gross_weight_kg.comparison,null);
 const f=compareDocuments(doc('21,577 KG'),doc('22,577 KG')).gross_weight_kg;
 assert.equal(f.comparison,'MISMATCH');assert.equal(f.kind,null);assert.deepEqual(f.issues,[]);
 assert.equal(f.numeric_candidates.si.length,2);
 assert.equal(compareDocuments(doc('21,577'),doc('22,577')).gross_weight_kg.comparison,null);
});
test('decimal conversion is exact and does not invent rounding tolerances or units',()=>{
 assert.equal(exactDecimal('9007199254740993.0001','1000'),'9007199254740993000.1');
 assert.equal(exactDecimal('1.25e-3'),'0.00125');assert.equal(exactDecimal('1e999999'),null);
 assert.equal(normalizeField('gross_weight_kg','21,57 MT').value,'21570');
 assert.equal(compareDocuments(doc('21.6 MT'),doc('21577 KG')).gross_weight_kg.comparison,'MISMATCH');
 assert.equal(compareDocuments(doc('21 TON'),doc('21000 KG')).gross_weight_kg.comparison,null);
});
test('native numeric cells retain decimal meaning but cannot invent units or use formula caches',()=>{
 const cell={cell:'B7',type:'number',text:'21.577',storageValue:'21.577',formula:false};
 const a=doc('21.577 KG',[cell]);
 assert.equal(sourceNumericCell(a,a.fields.gross_weight_kg).value,'21.577');
 assert.equal(compareDocuments(a,doc('0.021577 MT')).gross_weight_kg.comparison,'MATCH');
 for(const altered of [{...cell,formula:true},{...cell,type:'text'},{...cell,storageValue:'21577'}]){
  const d=doc('21.577 KG',[altered]);assert.equal(sourceNumericCell(d,d.fields.gross_weight_kg),null);
 }
 const noUnit=doc('21.577',[cell]);assert.equal(compareDocuments(noUnit,doc('21.577 KG')).gross_weight_kg.comparison,null);
 const duplicate=doc('21.577 KG',[cell,{...cell,cell:'C7'}]);assert.equal(sourceNumericCell(duplicate,duplicate.fields.gross_weight_kg),null);
});
test('generated unseen weights preserve exact values and changed values remain different',()=>{
 for(let i=101;i<201;i++){
  const kg=i+'.25',euro=i+',25';
  assert.equal(compareDocuments(doc(kg+' KG'),doc(euro+' KG')).gross_weight_kg.comparison,'MATCH');
  assert.equal(compareDocuments(doc(kg+' KG'),doc((i+1)+',25 KG')).gross_weight_kg.comparison,'MISMATCH');
 }
});
