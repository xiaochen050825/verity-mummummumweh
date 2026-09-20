const FIELD_KEYS=['shipper','consignee','notify_party','port_of_loading','port_of_discharge','container_count','gross_weight_kg'];
const LABELS={shipper:'Shipper',consignee:'Consignee',notify_party:'Notify party',port_of_loading:'Port of loading',port_of_discharge:'Port of discharge',container_count:'Container count',gross_weight_kg:'Gross weight'};
const DEFAULTS=['Oceanic Traders Ltd.','Harbor View Imports','Harbor View Imports','Singapore (SGSIN)','Los Angeles (USLAX)','3','235,550 KG'];
function makeFields(){return Object.fromEntries(FIELD_KEYS.map((k,i)=>[k,{si:DEFAULTS[i],bl:DEFAULTS[i],comparison:'MATCH',verified:false,kind:null,reason:null}]))}
function preset(id,company,type,changes={},extra={}){const fields=makeFields();for(const [key,val] of Object.entries(changes))Object.assign(fields[key],val);return {id,company,type,fields,category:'BL_COMPARISON',booking:id,version:1,history:[{title:'Independent extraction checked',detail:'Preset source values and field rules loaded. This is a demonstration record.',at:'20 Sep, 10:16'},{title:'SI and BL candidates identified',detail:'Document title and booking reference checked in the preset scenario.',at:'20 Sep, 10:15'},{title:'Email classified',detail:'BL keyword found; full message requests a comparison.',at:'20 Sep, 10:14'}],...extra}}
function makeCases(){return [
 preset('BK-2048','Oceanic Traders Ltd.','mixed',{container_count:{bl:'4',comparison:'MISMATCH'},gross_weight_kg:{si:'N/A',comparison:null,kind:'MISSING',reason:'missing_value'}}),
 preset('SI-7781','Global Manufacturing Co.','pairing',{}, {pairIssue:true,history:[{title:'Automatic pairing paused',detail:'Two SI versions and two BL candidates found. A specific pair is required.',at:'20 Sep, 10:16'}]}),
 preset('BL-3312','Eastport Logistics','unreadable',{gross_weight_kg:{si:'Unable to read',comparison:null,kind:'UNREADABLE',reason:'scan_illegible'}}),
 preset('BL-7720','Sunrise Textiles','match'),
 preset('SI-4021','Maple Distribution','missing_bl',{}, {docIssue:'missing_bl'}),
 preset('SI-4022','Pacific Retail Co.','missing_si',{}, {docIssue:'missing_si'}),
 preset('BK-2201','Westhaven Paper','number',{gross_weight_kg:{si:'22.000 MT',bl:'22,000 KG',comparison:null,kind:'AMBIGUOUS',reason:'separator_ambiguous'}}),
 preset('BK-2202','Cedar Export Partners','port',{port_of_discharge:{si:'Portland',bl:'Portland, OR (USPDX)',comparison:null,kind:'AMBIGUOUS',reason:'alias_collision'}}),
 preset('BK-2203','Meridian Supply','entity',{consignee:{si:'Harbor View Imports Ltd.','bl':'HVI Trading',comparison:null,kind:'AMBIGUOUS',reason:'entity_identity'}}),
 preset('BK-2204','Northline Packaging','extraction',{container_count:{si:'8',bl:'3',comparison:null,kind:'UNREADABLE',reason:'extraction_incomplete',sourceSI:'3'}}),
 preset('BK-2205','Orion Supplies','mismatch',{container_count:{si:'3',bl:'4',comparison:'MISMATCH'}}),
 preset('SI-0092','Maple Distribution','timeout',{}, {processingError:'service_timeout',retries:0}),
 preset('BK-2207','Southbay Industries','unsupported',{}, {processingError:'unsupported_format'}),
 preset('BK-2208','Atlas Components','evidence',{notify_party:{si:'Not located',sourceSI:'Harbor View Imports',bl:'Harbor View Imports',comparison:null,kind:'UNREADABLE',reason:'evidence_not_located'}}),
 preset('BK-2209','Evergreen Trading','wrong_type',{}, {docIssue:'wrong_type'}),
 preset('BK-2210','Straits Distribution','port_conflict',{port_of_loading:{si:'Singapore (MYPKG)',bl:'Singapore (SGSIN)',comparison:null,kind:'AMBIGUOUS',reason:'port_name_code_conflict'}}),
 preset('BK-2211','Bluewater Cargo','alias_unknown',{port_of_discharge:{si:'North Harbor Terminal',bl:'North Harbor Terminal',comparison:null,kind:'AMBIGUOUS',reason:'alias_not_found'}}),
 preset('BK-2212','Harbor Paper Mills','validity',{container_count:{si:'0',bl:'0',comparison:null,kind:'AMBIGUOUS',reason:'invalid_container_count'}}),
 preset('BK-2213','Summit Commodities','processing',{}, {processing:true}),
 ...[['MAIL-1190','Harbor Ops','SI_REQUEST','Please prepare the SI for our next booking.'],['MAIL-1191','Meridian','INVOICE_QUERY','Please clarify the service charge on invoice INV-112.'],['MAIL-1192','Coastal Ventures','GENERAL','Please confirm tomorrow’s meeting time.'],['MAIL-1193','Promotional Sender','SPAM','A promotional offer unrelated to shipment operations.']].map(([id,company,category,body])=>preset(id,company,'noncomparison',{}, {category,body,history:[{title:'Classification complete',detail:'No SI–BL comparison was requested in this preset email.',at:'20 Sep, 10:14'}]}))
]}
