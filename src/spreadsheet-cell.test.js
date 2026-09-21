import test from 'node:test';
import assert from 'node:assert/strict';
import {spreadsheetCell} from './spreadsheet-cell.js';
const cell=(attributes,children)=>({getAttribute:k=>attributes[k]??null,getElementsByTagName:k=>(children[k]||[]).map(textContent=>({textContent}))});
test('XLSX reader preserves storage type, precision and formula presence separately from text',()=>{
 const n=spreadsheetCell(cell({r:'B12',s:'3'},{v:['21.577']}));
 assert.deepEqual(n,{cell:'B12',text:'21.577',type:'number',storageValue:'21.577',formula:false,styleId:'3'});
 assert.equal(spreadsheetCell(cell({r:'B12',t:'s'},{v:['0']}),['21.577']).type,'text');
 assert.equal(spreadsheetCell(cell({r:'B12'},{v:['21.577'],f:['A1+A2']})).formula,true);
 assert.equal(spreadsheetCell(cell({r:'B12'},{v:['9007199254740993']})).storageValue,'9007199254740993');
});
