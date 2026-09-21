import test from 'node:test';
import assert from 'node:assert/strict';
import {compareDocuments} from './rules.js';
const d=(raw,statement='')=>({id:'unseen',pages:[{page:1,method:'native',text:'Gross weight: '+raw+'\n'+statement}],fields:{gross_weight_kg:{raw,page:1,status:'OK',quote:'Gross weight: '+raw}}});
const en='Weight number format: decimal separator point; thousands separator comma';
const de='Number format for all weights: decimal separator comma; grouping separator dot';
test('explicit same-page declarations resolve each side independently',()=>{
 const a=d('12,345 KG',en),b=d('12.345 KG',de);assert.equal(compareDocuments(a,b).gross_weight_kg.comparison,'MATCH');
 assert.equal(compareDocuments(a,d('12,345 KG')).gross_weight_kg.comparison,null);
 assert.equal(compareDocuments(a,d('12,345 KG',de)).gross_weight_kg.comparison,'MISMATCH');
 assert.equal(compareDocuments(a,b).gross_weight_kg.quality_checks.at(-1).si.quote,en);
});
test('conflicting declarations, manual settings, example text or another page never resolve the format',()=>{
 const a=d('12,345 KG',en),b=d('12,345 KG',en+'\n'+de);
 assert.equal(compareDocuments(a,b).gross_weight_kg.reason,'number_profile_conflict');
 assert.equal(compareDocuments(a,d('12,345 KG',en+'; decimal separator comma')).gross_weight_kg.reason,'number_profile_conflict');
 assert.equal(compareDocuments(a,a,{si:'de_dot',bl:'en_comma'}).gross_weight_kg.reason,'number_profile_conflict');
 const otherPage=d('12,345 KG');otherPage.pages.push({page:2,method:'native',text:en});assert.equal(compareDocuments(a,otherPage).gross_weight_kg.comparison,null);
 assert.equal(compareDocuments(a,d('12,345 KG','Example: '+en)).gross_weight_kg.comparison,null);
 const ocr=d('12,345 KG',en);ocr.pages[0].method='ocr';ocr.pages[0].confidence=95;assert.equal(compareDocuments(a,ocr).gross_weight_kg.comparison,null);
});
test('explicit units are scoped to the source page; missing units and conflicting declarations remain unknown',()=>{
 assert.equal(compareDocuments(d('25.5','All weights are in KG.'),d('25.5 KG')).gross_weight_kg.comparison,'MATCH');
 assert.equal(compareDocuments(d('25.5'),d('25.5 KG')).gross_weight_kg.comparison,null);
 assert.equal(compareDocuments(d('25.5','All weights are in KG.\nAll weights are in MT.'),d('25.5 KG')).gross_weight_kg.comparison,null);
});
