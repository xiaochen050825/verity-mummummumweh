// A current email can explicitly link references of different types. It is
// evidence about these attachments only, never a rule about a sender/template.
export function currentMessage(body){
 return String(body||'').split(/\n\s*(?:>|On .+wrote:|[- ]*(?:Original Message|Forwarded message)[- ]*|From:|发件人[:：]|寄件者[:：])/i)[0];
}
const token=(text,value)=>{
 const escaped=value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 return new RegExp('(?:^|[^A-Z0-9-])'+escaped+'(?:$|[^A-Z0-9-])','i').test(text);
};
// Contradictions veto a proposed relationship, including a shared reference.
// These are language-level scopes, not sender, filename or dataset exceptions.
export function pairingContextConflict(context){
 if(!context)return false;
 const text=String(context.subject||'')+'\n'+currentMessage(context.body);
 return /\b(?:not|never|neither|wrong|unrelated|ignore|superseded|cancelled|canceled|previous version|old version|reference only|examples? only|samples? only|do not|don't)\b/i.test(text)
  || /\b(?:different|separate|another|other|multiple|two|several)\b[^.!?\n]{0,60}\b(?:shipments?|consignments?|customers?|bookings?|orders?)\b/i.test(text)
  || /\b(?:shipments?|consignments?|bookings?|orders?)\b[^.!?\n]{0,60}\b(?:differ|different|separate|unrelated)\b/i.test(text);
}
export function messagePairEvidence(si,bl,refsSI,refsBL,context){
 if(!context?.documents||context.documents.length!==2||context.documents.filter(d=>d.side==='si').length!==1||context.documents.filter(d=>d.side==='bl').length!==1)return null;
 if(!context.documents.some(d=>d.id===si.id&&d.side==='si')||!context.documents.some(d=>d.id===bl.id&&d.side==='bl'))return null;
 const subject=String(context.subject||''),body=currentMessage(context.body);
 if(pairingContextConflict(context))return null;

 if(/^(?:fw|fwd)\s*[:_]/i.test(subject)||/\b(?:wrong|unrelated|ignore|superseded|cancelled|canceled|previous version|old version|reference only|do not|don't|not attached|not the)\b/i.test(subject+'\n'+body))return null;
 const lines=body.split(/\r?\n/).filter(line=>line.length<=700&&/\b(?:attached|enclosed)\b/i.test(line)&&/\b(?:SI|shipping instructions?)\b/i.test(line)&&/\b(?:B\/?L|bill of lading)\b/i.test(line));
 if(lines.length!==1)return null;
 const booking=refsSI.booking.length===1?refsSI.booking[0]:null,bill=refsBL.bl.length===1?refsBL.bl[0]:null;
 // Both anchors must be independently located in the current email. An
 // arbitrary co-occurrence or a quoted older thread is insufficient.
 const anchors=lines.flatMap(line=>[...line.matchAll(/\bfor\s+(?:(?:booking reference|booking no\.?|booking number|booking)\s*[:#]?\s*)?([A-Z0-9][A-Z0-9-]{3,})\b/gi)].filter(m=>/\d/.test(m[1])).map(m=>({value:m[1].toUpperCase(),quote:line})));
 if(booking&&bill&&token(subject,bill.value)&&anchors.length===1&&anchors[0].value===booking.value)return {ok:true,method:'current_email_attachment_link',matches:[{kind:'email_link',value:booking.value+' → '+bill.value,si:booking,bl:bill,email:{subject,quote:anchors[0].quote}}],note:'The current email identifies the attached SI/BL for the SI booking; its subject identifies the BL. Exactly one SI and one BL, with no conflicting source references.'};
 // A current, unquoted attachment declaration is direct evidence about the
 // only typed SI and BL in this email. If it names a booking-like value, that
 // value must agree with the SI; OC/order wording is a different reference type.
 const explicitBooking=lines.flatMap(line=>[...line.matchAll(/\bfor\s+(?:(?:booking reference|booking no\.?|booking number|booking)\s*[:#]?\s*)?([A-Z0-9][A-Z0-9-]{3,})\b/gi)].filter(m=>/\d/.test(m[1])&&!/^OC$/i.test(m[1])).map(m=>m[1].toUpperCase()));
 if(explicitBooking.length>1)return null;
 if(explicitBooking.length===1&&booking&&explicitBooking[0]!==booking.value)return null;
 if(bill&&!token(subject,bill.value)){
  const subjectRefs=(subject.toUpperCase().match(/[A-Z0-9][A-Z0-9-]{5,}/g)||[]).filter(v=>/\d/.test(v));
  if(subjectRefs.some(v=>v.includes(bill.value)||bill.value.includes(v)))return null;
 }
 return {ok:true,method:'current_email_explicit_pair_declaration',matches:[{kind:'current_email_declaration',value:'one SI + one BL',email:{subject,quote:lines[0]}}],note:'The current, unquoted email explicitly declares the only identified SI and BL as its attachments, with no conflict or supersession wording.'};
}
