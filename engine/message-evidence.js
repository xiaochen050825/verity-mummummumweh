// A current email can explicitly link references of different types. It is
// evidence about these attachments only, never a rule about a sender/template.
export function currentMessage(body){
 return String(body||'').split(/\n\s*(?:>|On .+wrote:|[- ]*(?:Original Message|Forwarded message)[- ]*|From:|发件人[:：]|寄件者[:：])/i)[0];
}
const token=(text,value)=>{
 const escaped=value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 return new RegExp('(?:^|[^A-Z0-9-])'+escaped+'(?:$|[^A-Z0-9-])','i').test(text);
};
export function messagePairEvidence(si,bl,refsSI,refsBL,context){
 if(!context?.documents||context.documents.length!==2||context.documents.filter(d=>d.side==='si').length!==1||context.documents.filter(d=>d.side==='bl').length!==1)return null;
 if(!context.documents.some(d=>d.id===si.id&&d.side==='si')||!context.documents.some(d=>d.id===bl.id&&d.side==='bl'))return null;
 const subject=String(context.subject||''),body=currentMessage(context.body);
 if(/^(?:fw|fwd)\s*[:_]/i.test(subject)||/\b(?:wrong|unrelated|ignore|superseded|cancelled|canceled|previous version|old version|reference only|do not|don't|not attached|not the)\b/i.test(subject+'\n'+body))return null;
 if(refsSI.booking.length!==1||refsBL.bl.length!==1)return null;
 const booking=refsSI.booking[0],bill=refsBL.bl[0];
 // Both anchors must be independently located in the current email. An
 // arbitrary co-occurrence or a quoted older thread is insufficient.
 if(!token(subject,bill.value))return null;
 const lines=body.split(/\r?\n/).filter(line=>line.length<=700&&/\b(?:attached|enclosed)\b/i.test(line)&&/\b(?:SI|shipping instructions?)\b/i.test(line)&&/\b(?:B\/?L|bill of lading)\b/i.test(line));
 const anchors=lines.flatMap(line=>[...line.matchAll(/\bfor\s+(?:(?:booking reference|booking no\.?|booking number|booking)\s*[:#]?\s*)?([A-Z0-9][A-Z0-9-]{3,})\b/gi)].filter(m=>/\d/.test(m[1])).map(m=>({value:m[1].toUpperCase(),quote:line})));
 if(anchors.length!==1||anchors[0].value!==booking.value)return null;
 return {ok:true,method:'current_email_attachment_link',matches:[{kind:'email_link',value:booking.value+' → '+bill.value,si:booking,bl:bill,email:{subject,quote:anchors[0].quote}}],note:'The current email identifies the attached SI/BL for the SI booking; its subject identifies the BL. Exactly one SI and one BL, with no conflicting source references.'};
}
