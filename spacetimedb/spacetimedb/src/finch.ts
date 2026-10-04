export const demoBase='https://api.finchnode.com/demo/v1'
export const defaultScenarios:Record<string,string>={Daniel:'polypharmacy-senior',Alex:'baseline-adult',Maya:'sparse-record',Bruce:'sparse-record',Martha:'baseline-adult',Thomas:'polypharmacy-senior'}
export const allowedScenarios=['detailed-care-demo','baseline-adult','polypharmacy-senior','sparse-record','consent-partial','consent-revoked','rate-limited','source-unavailable']
type Obj=Record<string,unknown>
const object=(v:unknown):Obj=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Obj:{}
const list=(v:unknown):unknown[]=>Array.isArray(v)?v:[]
const text=(v:unknown)=>typeof v==='string'?v:''
export type NormalizedRecord={upstreamId:string;category:string;text:string;date:string|undefined;provenance:string}
export function normalizeEnvelope(value:unknown,scenario:string,subject:string,retrievedAt:string,environment='demo'){
  const envelope=object(value),data=object(envelope.data),meta=object(envelope.meta)
  if(envelope.synthetic!==true || text(envelope.environment)!==environment || !Object.keys(data).length)throw Error('Unexpected FinchNode response. No records imported.')
  const output:NormalizedRecord[]=[]
  const categories:Record<string,string>={demographics:'Demographics',medications:'Medications',medicationAdministrations:'Medication administration',medicationDispenses:'Medication fill',allergies:'Allergies',conditions:'Conditions',vitals:'Vitals',labs:'Lab result',immunizations:'Immunization',encounters:'Encounter',appointments:'Appointment record',diagnosticReports:'Diagnostic report',careTeam:'Care team',documents:'Document',clinicalNotes:'Clinical note',coverages:'Coverage',explanationsOfBenefit:'Claim'}
  const claims=object(data.claims)
  const sections:Obj={...data,coverages:claims.coverages,explanationsOfBenefit:claims.explanationsOfBenefit}
  const seen=new Set<string>()
  for(const [key,label] of Object.entries(categories)){
    const section=sections[key],container=object(section)
    const rows=Array.isArray(section)?section:Array.isArray(container.records)?container.records:text(container.id)?[container]:[]
    for(const raw of rows){
      const r=object(raw),upstreamId=text(r.id),sourceId=text(r.sourceRecordId)
      if(!upstreamId||!sourceId)throw Error('A FinchNode record is missing its provenance identifier.')
      // Document metadata and readable note may describe the same resource. Keep one row with both.
      if(key==='documents'&&list(data.clinicalNotes).some(n=>text(object(n).id)===upstreamId))continue
      if(seen.has(upstreamId))continue
      seen.add(upstreamId)
      let content='',date=''
      if(key==='medications'){content=`Documented ${text(r.resourceType)||'medication'}: ${text(r.name)||'name unavailable'}. Recorded status: ${text(r.status)||'unavailable'}. Current use is not independently confirmed.`;date=text(r.startDate)||text(r.dispensedAt)||text(r.date)}
      else if(key==='allergies'){content=`Documented allergy: ${text(r.substance)||'substance unavailable'}. Reaction: ${text(r.reaction)||'not documented'}. Recorded status: ${text(r.status)||'unavailable'}.`;date=text(r.recordedDate)}
      else if(key==='encounters'){content=`Documented encounter: ${text(r.type)||'type unavailable'}. Recorded status: ${text(r.status)||'unavailable'}. ${text(r.reason)}`;date=text(r.startDate)}
      else {content=`Documented ${label.toLowerCase()}: ${text(r.name)||text(r.title)||text(r.description)||text(r.type)||text(r.resourceType)}.`;date=text(r.date)||text(r.effectiveDate)||text(r.recordedDate)||text(r.startDate)||text(r.createdDate)||text(object(r.servicePeriod).start)||text(object(r.period).start)}
      if(key==='appointments')content+=' Synthetic source appointment only; importing it does not create a booking or change Kin’s authored demo trigger.'
      if(key==='medicationAdministrations'||key==='medicationDispenses')content+=' Historical administration or dispensing does not confirm current use.'
      const omitted=new Set(['id','resourceType','sourceRecordId','source','sourceName','codes','sourceUpdatedAt','syncedAt','records'])
      const fields=Object.entries(r).filter(([k,v])=>!omitted.has(k)&&v!==null&&v!==undefined&&v!=='').map(([k,v])=>`${k.replace(/([A-Z])/g,' $1')}: ${typeof v==='object'?JSON.stringify(v):String(v)}`)
      content+='\n'+fields.join('\n')
      const document=key==='clinicalNotes'?list(data.documents).find(d=>text(object(d).id)===upstreamId):undefined
      if(document)content+='\nDocument metadata: '+JSON.stringify(Object.fromEntries(Object.entries(object(document)).filter(([k])=>!omitted.has(k))))
      // Never silently truncate a clinical statement. Complete source remains inspectable.
      const provenance=JSON.stringify({provider:environment==='sandbox'?'FinchNode sandbox':'FinchNode public demo',scenario,subject,upstreamId,sourceRecordId:sourceId,resourceType:text(r.resourceType),sourceName:text(r.sourceName)||text(r.source),sourceUpdatedAt:text(r.sourceUpdatedAt)||null,syncedAt:text(r.syncedAt)||null,retrievedAt,clinicalDate:date||null,dataAsOf:text(meta.dataAsOf)||null,raw:r,documentMetadata:document??null})
      output.push({upstreamId,category:label,text:content,date:date||undefined,provenance})
    }
  }
  const warnings=list(meta.warnings).map(w=>{const r=object(w);return `${text(r.code)}: ${text(r.message)}`}).filter(Boolean)
  const missing=list(meta.missingCategories).map(text).filter(Boolean)
  const partial=text(meta.syncStatus)==='partial'||warnings.some(w=>w.includes('source_unavailable'))||scenario==='consent-partial'
  if(missing.length)warnings.push(`Missing categories: ${missing.join(', ')}. Missing information does not imply absence.`)
  return {records:output,status:partial?'partial':output.length?'ready':'empty',warnings,details:JSON.stringify({meta,consent:envelope.consent,sources:envelope.sources,requestedCategories:list(meta.availableCategories).map(text),returnedSections:Object.keys(data),categoryOutcomes:meta.categoryOutcomes??[]})}
}
export function failureStatus(status:number){return status===410?'revoked':status===403?'denied':status===429?'rate-limited':'unavailable'}

export function normalizeSimulation(value:unknown,retrievedAt:string){
 const data=object(value)
 if(data.synthetic!==true||data.provider!=='Kin authored simulation'||data.scenario!=='detailed-care-demo')throw Error('Invalid synthetic simulation')
 const records=list(data.records).map(raw=>{const r=object(raw);if(!text(r.id)||!text(r.category)||!text(r.text)||!/^\d{4}-\d{2}-\d{2}$/.test(text(r.date)))throw Error('Incomplete simulation record');return {upstreamId:text(r.id),category:text(r.category),text:text(r.text),date:text(r.date),provenance:JSON.stringify({provider:'Kin authored simulation',sourceName:'Kin authored simulation · fictional',scenario:'detailed-care-demo',subject:text(data.subject),upstreamId:text(r.id),sourceRecordId:`simulation:${text(r.id)}`,clinicalDate:text(r.date),sourceUpdatedAt:null,syncedAt:null,retrievedAt,raw:r})}})
 return {records,subject:text(data.subject),displayName:text(data.displayName),warnings:['Authored simulation only. Not FinchNode data or real medical records.'],details:JSON.stringify({provider:data.provider,synthetic:true,requestedCategories:[...new Set(records.map(r=>r.category))]})}
}
