import {readFile} from 'node:fs/promises'
import type {DbConnection} from '../src/module_bindings'
const base='https://api.finchnode.com/api/v1'
type Link={owner:string;person:string;revision:string;sessionId:string;subject:string;scenario:string;requestId:string}
class FinchError extends Error {constructor(public status:number){super('FinchNode request failed')}}
async function key(){let env='';if(!process.env.FINCHNODE_API_KEY){try{env=await readFile(new URL('../.env.server',import.meta.url),'utf8')}catch{/* Hosted settings use environment variables. */}}const value=process.env.FINCHNODE_API_KEY||env.split(/\r?\n/).find(l=>/^\s*FINCHNODE_API_KEY\s*=/.test(l))?.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g,'')||'';if(!value.startsWith('ck_test_'))throw Error('A sandbox key is required');return value}
export async function connectSandbox(caller:DbConnection,service:DbConnection,args:{requestId:string;scenario:string;event?:string}){
 const credential=await key()
 const api=async(path:string,body?:unknown,idempotency?:string)=>{const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${credential}`,'Content-Type':'application/json',...(idempotency?{'Idempotency-Key':idempotency}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});if(!response.ok)throw new FinchError(response.status);return await response.json()}
 let phase='application'
 const app=await api('/app');if(app.environment!=='sandbox')throw Error('Sandbox environment required')
 const link=JSON.parse(await caller.procedures.beginSandbox({requestId:args.requestId,scenario:args.scenario})) as Link
 const commit=(status:string,payload='',subject=link.subject)=>service.procedures.finishSandbox({owner:link.owner,revision:BigInt(link.revision),sessionId:link.sessionId,subject,status,payload})
 try{
  phase='session';if(!link.sessionId){const session=await api('/connect/sessions',{externalId:link.owner,categories:app.categories},link.requestId);if(session.environment!=='sandbox'||typeof session.id!=='string')throw Error('Unexpected connection');link.sessionId=session.id;await commit('session')}
  phase='simulation';if(!link.subject){let session=await api(`/connect/sessions/${encodeURIComponent(link.sessionId)}`)
   if(session.simulation?.state!=='completed'){await api(`/connect/sessions/${encodeURIComponent(link.sessionId)}/simulate`,{scenario:link.scenario});for(let i=0;i<5;i++){await new Promise(r=>setTimeout(r,1000));session=await api(`/connect/sessions/${encodeURIComponent(link.sessionId)}`);if(['completed','failed'].includes(session.simulation?.state))break}}
   if(session.simulation?.state==='failed')throw Error('Simulation failed')
   if(session.simulation?.state!=='completed')return await commit('pending')
   if(typeof session.subject!=='string')throw Error('Completed session missing subject')
   link.subject=session.subject;await commit('session','',link.subject)
  }
  if(args.event){if(!['records.advance','consent.revoke'].includes(args.event))throw Error('Invalid demo event');await api(`/sandbox/subjects/${encodeURIComponent(link.subject)}/events`,{type:args.event});await new Promise(r=>setTimeout(r,1200))}
  phase='snapshot';const snapshot=await api(`/users/${encodeURIComponent(link.subject)}/records`)
  if(snapshot.environment!=='sandbox'||snapshot.synthetic!==true)throw Error('Expected synthetic sandbox data')
  // The snapshot carries consent and section grouping. Replace each populated section with complete category pages.
  const sectionFor:Record<string,string>={Patient:'demographics',MedicationRequest:'medications',MedicationDispense:'medicationDispenses',MedicationAdministration:'medicationAdministrations',Condition:'conditions',AllergyIntolerance:'allergies',Immunization:'immunizations',Encounter:'encounters',Appointment:'appointments',CareTeam:'careTeam',DiagnosticReport:'diagnosticReports',DocumentReference:'clinicalNotes',Coverage:'coverages',ExplanationOfBenefit:'explanationsOfBenefit'}
  const grouped:Record<string,unknown[]>={}
  const categories=snapshot.meta?.availableCategories??[]
  const metadata:Record<string,unknown>={}
  for(const category of categories){phase='page:'+category;let cursor='',done=false;const seen=new Set<string>();for(let pageIndex=0;pageIndex<100;pageIndex++){
   const page=await api(`/users/${encodeURIComponent(link.subject)}/records/${encodeURIComponent(category)}?limit=100${cursor?'&cursor='+encodeURIComponent(cursor):''}`)
   if(!Array.isArray(page.data))throw Error('Invalid page')
   metadata[category]??=page.meta
   for(const record of page.data){const readable=record.resourceType==='DocumentReference'?snapshot.data.clinicalNotes?.find((n:{id:string})=>n.id===record.id):undefined;const section=record.resourceType==='Observation'?(category==='vitals'?'vitals':'labs'):record.resourceType==='DocumentReference'?(readable?'clinicalNotes':'documents'):sectionFor[record.resourceType];if(!section)throw Error('Unsupported record type');(grouped[section]??=[]).push(readable?{...record,...readable}:record)}
   if(page.hasMore===false){done=true;break}if(typeof page.nextCursor!=='string'||seen.has(page.nextCursor))throw Error('Invalid pagination');cursor=page.nextCursor;seen.add(cursor)
  }if(!done)throw Error('Incomplete record import')}
  // Preserve readable snapshot projections for notes; category pages can contain only document metadata.
  for(const [section,records] of Object.entries(grouped)){if(section==='coverages'||section==='explanationsOfBenefit'){snapshot.data.claims??={};snapshot.data.claims[section]=records}else snapshot.data[section]=records}
  snapshot.meta.categoryPageMetadata=metadata
  phase='import';return await commit('ready',JSON.stringify(snapshot))
 }catch(error){console.warn('Sandbox phase failed:',phase,error instanceof FinchError?error.status:error instanceof Error?error.name:'unknown');const status=error instanceof FinchError?error.status===410?'revoked':error.status===403?'denied':error.status===429?'rate-limited':'unavailable':'unavailable';await commit(status);throw Error(`Sandbox ${status}. Retry the connection; no older records were substituted.`)}
}
