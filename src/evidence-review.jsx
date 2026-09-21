import React from 'react';
import {pairReviewEvidence,weightInterpretations} from '../engine/review-evidence.js';

export function PairEvidence({docs}){
 const evidence=pairReviewEvidence(docs);
 return <section className="review-evidence" aria-label="Pairing evidence"><h2>References found</h2><p className="caption">Check the source references below. Unlabelled numbers need confirmation.</p><div className="evidence-columns">{evidence.map(d=><article key={d.id}><strong>{d.side?.toUpperCase()} · {d.name}</strong>{!d.references.length&&!d.untyped.length&&<p>No reference located.</p>}{d.references.map((r,i)=><div key={'ref'+i}><span className="caption">{r.kind==='bl'?'BL number':r.kind==='booking'?'Booking':'Order'} · Page {r.page}</span><blockquote>{r.quote}</blockquote></div>)}{d.untyped.map((r,i)=><div key={'hint'+i}><span className="caption">Unlabelled number · Page {r.page} · Confirm its meaning</span><blockquote>{r.quote}</blockquote></div>)}<a href={'/api/files/'+encodeURIComponent(d.id)} download>Open original</a></article>)}</div></section>;
}

export function WeightChoices({doc,value,onChange}){
 const options=weightInterpretations(doc);
 return <fieldset className="weight-choices"><legend>What does this source mean?</legend>{options.map(o=><label className="pick-card" key={o.profile}><input type="radio" name={'format-'+doc.id} checked={value===o.profile} disabled={o.value===null} onChange={()=>onChange(o.profile)}/><span><strong>{o.value!==null?o.value+' kg':'Cannot determine the weight'}</strong><small>{o.label}{o.value===null?' · Check the original unit and format':''}</small></span></label>)}<label className="pick-card"><input type="radio" name={'format-'+doc.id} checked={value==='unset'} onChange={()=>onChange('unset')}/><span>Still unknown</span></label></fieldset>;
}
