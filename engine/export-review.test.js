import test from 'node:test';
import assert from 'node:assert/strict';
import {competitionOutput,imageOnlyPDF} from './export.js';
import {KEYS} from './rules.js';
const base=()=>({id:'new-case',category:'BL_COMPARISON',pipeline:{status:'review'},fields:Object.fromEntries(KEYS.map(k=>[k,{comparison:'MATCH'}]))});
test('a supported missing-value reason coexists with internal ambiguities without changing facts',()=>{
 const c=base();c.fields.consignee={comparison:null,kind:'MISSING',reason:'missing_value'};
 c.fields.shipper={comparison:null,kind:'AMBIGUOUS',reason:'representation_not_stated'};
 c.fields.gross_weight_kg={comparison:null,kind:'AMBIGUOUS',reason:'separator_ambiguous'};
 const original=structuredClone(c),r=competitionOutput([c]);
 assert.equal(r.ready,true);assert.equal(r.output[c.id].review_reason,'missing_value');assert.equal(r.output[c.id].status,'NEEDS_REVIEW');
 assert.equal(r.audit[c.id].internal_findings.length,3);assert.equal(r.audit[c.id].defect_fields_complete,false);assert.deepEqual(c,original);
 assert.deepEqual(Object.keys(r.output[c.id]).sort(),['category','status','review_reason','has_defect','defect_fields'].sort());
});
test('unsupported ambiguity alone and competing supported reasons are not filled with a default',()=>{
 const c=base();c.fields.gross_weight_kg={comparison:null,kind:'AMBIGUOUS',reason:'separator_ambiguous'};
 assert.equal(competitionOutput([c]).ready,false);
 c.fields.shipper={comparison:null,kind:'MISSING',reason:'missing_value'};
 c.fields.consignee={comparison:null,kind:'UNREADABLE',reason:'scan_illegible'};
 assert.equal(competitionOutput([c]).ready,false);
});
test('known differences have explicit incomplete-field audit and retain the other findings',()=>{
 const c=base();c.fields.container_count={comparison:'MISMATCH'};c.fields.gross_weight_kg={comparison:null,kind:'MISSING',reason:'missing_value'};
 const r=competitionOutput([c]);assert.equal(r.output[c.id].status,'MISMATCH');assert.equal(r.audit[c.id].defect_fields_complete,false);assert.match(r.audit[c.id].policy_note,/not explicitly defined/);
});
test('classification only is not audited as seven-field completion',()=>{
 const c={...base(),fields:{},classificationOnly:true};const r=competitionOutput([c]);assert.equal(r.output[c.id].status,'OK');assert.equal(r.audit[c.id].rule,'classification_only');assert.equal(r.audit[c.id].defect_fields_complete,false);
});
test('image-only competition mapping requires measured native text absence, not OCR usage',()=>{
 const c=base(),d={id:'arbitrary-source',sha256:'current-source',pages:[{page:1,method:'ocr',text:'Recovered content'}]};c.docs=[d];
 assert.equal(imageOnlyPDF(d),false);
 d.readerEvidence={format:'pdf',nativeTextChecked:true,sha256:d.sha256,pages:[{page:1,nativeTextChars:0,rasterImages:1}]};
 const snapshot=structuredClone(c),r=competitionOutput([c]);assert.equal(r.output[c.id].review_reason,'unreadable');assert.equal(r.audit[c.id].rule,'readme_image_only_pdf');assert.deepEqual(c,snapshot);
 d.readerEvidence.pages[0].nativeTextChars=12;assert.equal(imageOnlyPDF(d),false);
 d.readerEvidence.pages[0].nativeTextChars=0;d.readerEvidence.pages[0].rasterImages=0;assert.equal(imageOnlyPDF(d),false);
 d.readerEvidence.pages[0].rasterImages=1;d.readerEvidence.sha256='different-source';assert.equal(imageOnlyPDF(d),false);
});
test('an image-only pair with conflicting OCR booking references still exports as unreadable review',()=>{
 const c=base();c.pairIssue=true;c.docs=['si','bl'].map(id=>({id,name:id+'.pdf',pages:[{page:1,text:'OCR text',method:'ocr'}],readerEvidence:{format:'pdf',nativeTextChecked:true,pages:[{page:1,nativeTextChars:0,rasterImages:1}]}}));
 const r=competitionOutput([c]);assert.equal(r.ready,true);assert.equal(r.output[c.id].status,'NEEDS_REVIEW');assert.equal(r.output[c.id].review_reason,'unreadable');
});
