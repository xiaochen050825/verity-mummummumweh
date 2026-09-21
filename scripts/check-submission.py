"""Independent structural/source checks; no import from the mapping engine."""
import json,sys,pathlib,hashlib

CATEGORIES={'BL_COMPARISON','SI_REQUEST','INVOICE_QUERY','GENERAL','SPAM'}
FIELDS={'shipper','consignee','notify_party','port_of_loading','port_of_discharge','container_count','gross_weight_kg'}
REASONS={'missing_attachment','wrong_doc_type','unreadable','missing_value'}
def no_duplicates(pairs):
    result={}
    for key,value in pairs:
        if key in result: raise ValueError('Duplicate JSON key: '+key)
        result[key]=value
    return result

def check(output,expected,cases,audit):
    errors=[]; missing=sorted(set(expected)-set(output)); extra=sorted(set(output)-set(expected))
    for id,row in output.items():
        if not isinstance(row,dict) or set(row)!={'category','status','review_reason','has_defect','defect_fields'}:
            errors.append([id,'Wrong row shape']);continue
        if row['category'] not in CATEGORIES or row['status'] not in {'OK','MISMATCH','NEEDS_REVIEW'} or type(row['has_defect']) is not bool:
            errors.append([id,'Invalid category/status/boolean']);continue
        defects=row['defect_fields']
        if not isinstance(defects,list) or not all(isinstance(k,str) and k in FIELDS for k in defects) or len(set(defects))!=len(defects):
            errors.append([id,'Invalid defect fields']);continue
        if row['status']=='MISMATCH':
            if not row['has_defect'] or not defects or row['review_reason'] is not None: errors.append([id,'Inconsistent mismatch'])
        elif row['has_defect'] or defects: errors.append([id,'Unexpected defects outside MISMATCH'])
        if row['status']=='OK' and row['review_reason'] is not None: errors.append([id,'OK cannot have review reason'])
        if row['status']=='NEEDS_REVIEW' and row['review_reason'] not in REASONS: errors.append([id,'Invalid review reason'])
        c=cases.get(id); a=audit.get(id)
        if not c or not a or a.get('case_id')!=id or a.get('source_pointer',{}).get('case_id')!=id or not a.get('mapping_version'):
            errors.append([id,'Missing source or mapping audit']);continue
        if row['category']!=c.get('category'):errors.append([id,'Classification not from case'])
        actual={k for k,f in c.get('fields',{}).items() if f.get('comparison')=='MISMATCH'}
        if set(defects)!=actual:errors.append([id,'Exported defects differ from internal facts'])
        if row['status']=='OK' and c.get('category')=='BL_COMPARISON' and not c.get('classificationOnly'):
            if set(c.get('fields',{}))!=FIELDS or any(f.get('comparison')!='MATCH' or f.get('scope_warning') for f in c['fields'].values()) or c.get('docIssue') or c.get('pairIssue') or c.get('processingError'):
                errors.append([id,'Unresolved check cannot default to OK'])
    return {'valid_partial':not errors and not extra,'complete':not errors and not missing and not extra,'exported':len(output),'missing_count':len(missing),'missing_ids':missing,'extra_ids':extra,'errors':errors}

if __name__=='__main__':
    run,inbox=map(pathlib.Path,sys.argv[1:3]); read=lambda p:json.loads(p.read_text(encoding='utf-8'),object_pairs_hook=no_duplicates)
    expected=[read(p)['email_id'] for p in inbox.glob('*.json')]
    if len(expected)!=len(set(expected)):raise ValueError('Duplicate import IDs')
    cases={};hashes={}
    for p in (run/'cases').glob('*.json'):
        c=read(p);cases[c['id']]=c;hashes[c['id']]=hashlib.sha256(p.read_bytes()).hexdigest()
    export=read(run/'export-check.json');name='submission.json' if export['ready'] else 'submission-partial-NOT-FOR-SUBMISSION.json'
    result=check(read(run/name),expected,cases,export.get('audit',{}))
    result.update(scope='Independent schema and source checks; not an accuracy or official acceptance claim.',case_file_sha256=hashes)
    (run/'independent-export-check.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k not in ['case_file_sha256','missing_ids']}))
    if not result['valid_partial']:sys.exit(1)
