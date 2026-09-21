import {z} from 'zod';

export const Input=z.object({
 id:z.string().max(300),name:z.string().max(500),
 pages:z.array(z.object({page:z.number().int().min(1).max(30),text:z.string().max(100000),method:z.enum(['native','ocr']),confidence:z.number().min(0).max(100).optional(),imageId:z.string().optional(),blocks:z.array(z.unknown()).max(5000).optional()})).max(30),
 readError:z.string().max(500).optional(),numberProfile:z.enum(['unset','en_comma','de_dot']).optional(),profileEvidence:z.string().max(2000).optional(),
 readerEvidence:z.object({format:z.literal('pdf'),nativeTextChecked:z.literal(true),reader:z.literal('pdfjs-original-inspection'),sha256:z.string().regex(/^[a-f0-9]{64}$/i),pages:z.array(z.object({page:z.number().int().min(1).max(30),nativeTextChars:z.number().int().min(0),rasterImages:z.number().int().min(0)})).min(1).max(30)}).optional()
});

// Bind the browser's reading to the actual stored source. This validates
// provenance/shape, not an independent server-side rereading of the PDF.
export function bindSource(input,meta){
 const d=Input.parse(input),e=d.readerEvidence;
 if(e&&(meta.type!=='application/pdf'||e.sha256!==meta.sha256||e.pages.length!==d.pages.length||e.pages.some((p,i)=>p.page!==i+1||p.page!==d.pages[i].page)))throw Error('The reading evidence does not match the stored source. Read the original file again.');
 return {...d,name:meta.name,sha256:meta.sha256,size:meta.size,server:true};
}
