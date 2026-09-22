import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {emailRowsInArchive,emailRowsFromJson} from './import-bundle.js';

test('participant-style archive imports one email per inbox JSON and ignores submission samples',async()=>{
 const zip=new JSZip();zip.file('inbox/email_001.json',JSON.stringify({email_id:'email_001',subject:'Please compare SI and BL',body:'Check the files.',attachments:['attachments/email_001_SI.txt']}));zip.file('attachments/email_001_SI.txt','SHIPPING INSTRUCTIONS');zip.file('sample_submission.json',JSON.stringify({email_001:{category:'GENERAL'}}));
 const rows=await emailRowsInArchive(await zip.generateAsync({type:'uint8array'}));assert.equal(rows.length,1);assert.equal(rows[0].email_id,'email_001');
});

test('a separately uploaded inbox JSON is accepted as one email record',()=>{
 const rows=emailRowsFromJson({email_id:'email_777',subject:'Compare SI and BL',body:'Please check the attachments.',attachments:['SI_777.pdf','BL_777.pdf']},'inbox/email_777.json');
 assert.equal(rows.length,1);
 assert.equal(rows[0].email_id,'email_777');
});
