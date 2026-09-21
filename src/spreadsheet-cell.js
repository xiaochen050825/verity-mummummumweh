// Keep native XLSX value/type separate from display text. Do not evaluate formulas.
export function spreadsheetCell(cell,strings=[]){
 const type=cell.getAttribute('t')||'n',stored=cell.getElementsByTagName('v')[0]?.textContent||'';
 const text=type==='s'?strings[Number(stored)]||'':type==='inlineStr'?cell.getElementsByTagName('is')[0]?.textContent||'':stored;
 return {cell:cell.getAttribute('r'),text,type:type==='n'?'number':'text',storageValue:type==='n'?stored:null,formula:cell.getElementsByTagName('f').length>0,styleId:cell.getAttribute('s')||null};
}
