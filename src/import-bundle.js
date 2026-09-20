import JSZip from 'jszip';
import {importEmails} from './model.js';

// The competition bundle stores one JSON message per file under inbox/.
export async function emailRowsInArchive(file){
 const zip=await JSZip.loadAsync(file);
 const entries=Object.values(zip.files).filter(entry=>!entry.dir&&/(^|\/)inbox\/[^/]+\.json$/i.test(entry.name));
 if(!entries.length)return [];
 if(entries.length>1000)throw Error('This archive contains more than 1000 email records. Split the batch.');
 const rows=[];
 for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
  if((entry._data?.uncompressedSize||0)>1_000_000)throw Error('An email record is too large.');
  const row=JSON.parse(await entry.async('string'));
  if(Array.isArray(row)||!row||typeof row!=='object')throw Error('Each inbox JSON must contain one email record.');
  rows.push(row);
 }
 importEmails(rows,'validation');
 return rows;
}
