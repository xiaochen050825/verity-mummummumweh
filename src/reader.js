import {spreadsheetCell} from './spreadsheet-cell.js';
import {cloudFile,uploadFile} from './api.js';
// Kept for existing batch-reader callers; no browser OCR worker is created.
export async function releaseReader(){}
async function rasterMeta(canvas,name){
 let source=canvas;
 if(Math.max(canvas.width,canvas.height)>1800){source=document.createElement('canvas');const scale=1800/Math.max(canvas.width,canvas.height);source.width=Math.round(canvas.width*scale);source.height=Math.round(canvas.height*scale);source.getContext('2d').drawImage(canvas,0,0,source.width,source.height)}
 const blob=await new Promise(r=>source.toBlob(r,'image/jpeg',.85));if(source!==canvas){source.width=0;source.height=0}
 if(!blob||blob.size>2_000_000)throw Error('The page image is too large for OCR. Upload a smaller readable scan.');
 return uploadFile(new File([blob],name,{type:'image/jpeg'}));
}
function xml(text){const d=new DOMParser().parseFromString(text,'application/xml');if(d.querySelector('parsererror'))throw Error('Invalid document XML.');return d}
async function office(file,kind){const {default:JSZip}=await import('jszip');const zip=await JSZip.loadAsync(file);const read=async name=>{const f=zip.file(name);if(!f)return null;if((f._data?.uncompressedSize||0)>8_000_000)throw Error('Office document section is too large.');return xml(await f.async('string'))};const pages=[];
 if(kind==='docx'){const d=await read('word/document.xml');if(!d)throw Error('Missing Word document body.');const blocks=[];for(const node of d.getElementsByTagName('w:body')[0].children){if(node.tagName==='w:tbl'){for(const row of node.getElementsByTagName('w:tr')){const cells=[...row.getElementsByTagName('w:tc')].map((c,i)=>({column:i+1,text:[...c.getElementsByTagName('w:t')].map(t=>t.textContent).join(' ')}));blocks.push({text:cells.map(c=>c.text).join('\t'),cells})}}else if(node.tagName==='w:p')blocks.push({text:[...node.getElementsByTagName('w:t')].map(x=>x.textContent).join(''),paragraph:blocks.length+1})}pages.push({page:1,text:blocks.map(x=>x.text).join('\n'),blocks,method:'native'})}
 else {const shared=await read('xl/sharedStrings.xml'),strings=shared?[...shared.getElementsByTagName('si')].map(x=>x.textContent):[];const sheets=Object.keys(zip.files).filter(n=>/^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort();if(sheets.length>30)throw Error('Use a workbook with at most 30 sheets.');for(const path of sheets){const d=await read(path),blocks=[];for(const row of d.getElementsByTagName('row')){const cells=[...row.getElementsByTagName('c')].map(c=>spreadsheetCell(c,strings));blocks.push({text:cells.map(c=>c.text).join('\t'),cells})}pages.push({page:pages.length+1,text:blocks.map(b=>b.text).join('\n'),blocks,method:'native'})}}
 return pages;
}
export async function readDocument(meta,onProgress){
 const file=await cloudFile(meta),head=new Uint8Array(await file.slice(0,8).arrayBuffer()),ext=file.name.split('.').pop().toLowerCase();let pages=[],readerEvidence;
 try{
  if(ext==='pdf'&&file.size===0)throw Error('The PDF file is empty, i.e. its size is zero bytes.');
  if(String.fromCharCode(...head.slice(0,4))==='%PDF'){
   const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).href;
   const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}),pdf=await task.promise;
   if(pdf.numPages>30){await task.destroy();throw Error('Use a PDF with at most 30 pages.')}
   readerEvidence={format:'pdf',nativeTextChecked:true,pages:[],reader:'pdfjs-original-inspection',sha256:meta.sha256};
   try{for(let i=1;i<=pdf.numPages;i++){
    onProgress?.('Reading '+file.name+' · page '+i+'/'+pdf.numPages);const page=await pdf.getPage(i),content=await page.getTextContent(),items=content.items.filter(i=>i.str?.trim()),rows=[];
    for(const item of items){const y=item.transform[5];let row=rows.find(r=>Math.abs(r.y-y)<3);if(!row){row={y,items:[]};rows.push(row)}row.items.push(item)}rows.sort((a,b)=>b.y-a.y);const blocks=rows.map(r=>({text:r.items.sort((a,b)=>a.transform[4]-b.transform[4]).map(i=>i.str).join('\t'),bbox:[Math.min(...r.items.map(i=>i.transform[4])),r.y,Math.max(...r.items.map(i=>i.transform[4]+i.width)),r.y+Math.max(...r.items.map(i=>i.height))]}));
    const viewport=page.getViewport({scale:1.5});if(viewport.width*viewport.height>12_000_000)throw Error('Page dimensions exceed the reading limit.');const canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
    const image=await rasterMeta(canvas,file.name+'.page-'+i+'.jpg'),text=blocks.map(b=>b.text).join('\n');
    const operators=await page.getOperatorList();
    readerEvidence.pages.push({page:i,nativeTextChars:text.replace(/\s/g,'').length,rasterImages:operators.fnArray.filter(op=>[pdfjs.OPS.paintImageXObject,pdfjs.OPS.paintInlineImageXObject,pdfjs.OPS.paintImageMaskXObject].includes(op)).length});
    pages.push({page:i,...(text.replace(/\s/g,'').length>=30?{text,blocks,method:'native'}:{text:'',method:'ocr'}),imageId:image.id});canvas.width=0;canvas.height=0;
   }}finally{await task.destroy()}
  }else if(head[0]===0x89&&head[1]===0x50||head[0]===0xff&&head[1]===0xd8){
   const bitmap=await createImageBitmap(file);if(bitmap.width*bitmap.height>20_000_000){bitmap.close();throw Error('Image exceeds 20 megapixels.')}
   const canvas=document.createElement('canvas'),scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height));canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
   const image=await rasterMeta(canvas,file.name+'.page-1.jpg');canvas.width=0;canvas.height=0;pages=[{page:1,text:'',method:'ocr',imageId:image.id}];
  }else if(['docx','xlsx'].includes(ext)&&head[0]===0x50&&head[1]===0x4b){pages=await office(file,ext)}
  else if(ext==='txt'){const text=await file.text();if(text.includes('\0'))throw Error('This file is not plain text.');pages=[{page:1,text,method:'native'}]}
  else throw Error('Unsupported format. Use PDF, PNG, JPG, DOCX, XLSX or text.');
  if(pages.reduce((n,p)=>n+p.text.length,0)>500000)throw Error('This document is too long for one processing request.');
  return {id:meta.id,name:meta.name,pages,numberProfile:'unset',...(readerEvidence?{readerEvidence}: {})};
 }catch(e){return {id:meta.id,name:meta.name,pages:[],readError:e.message}}
}
export async function unpack(staged){const files=[];for(const item of staged){if(item.type==='zip'){const {default:JSZip}=await import('jszip');const zip=await JSZip.loadAsync(item.file);let total=0;for(const entry of Object.values(zip.files)){if(entry.dir)continue;const declared=entry._data?.uncompressedSize||0;total+=declared;if(total>150*1024*1024||declared>25*1024*1024||files.length>=1500)throw Error('Archive exceeds the safe extraction limit. Split the batch.');if(!/\.(pdf|png|jpe?g|tiff?|txt|docx|xlsx)$/i.test(entry.name))continue;const bytes=await entry.async('uint8array');files.push(new File([bytes],entry.name,{type:''}))}}else if(item.type!=='json')files.push(item.file)}return files}
