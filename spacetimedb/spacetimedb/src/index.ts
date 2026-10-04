import {profileNames,scenarioProfile} from './profiles'
import {guidanceFor,preparationTime,nextTravelCheck} from './travel'
import {candidates,eventKey,validatePlan,steps,type Plan} from './automation'
import { schema, table, t, SenderError, type ReducerCtx, type ViewCtx } from 'spacetimedb/server'
import { aiServiceIdentity } from './service-identity'
import {syntheticRecords} from './synthetic'
import { validateAnswer, renderAnswer, type Evidence, type HistoryEntry, recordQuestion } from './grounding'
import { demoAppointment, careDue, appointmentEvidence, careQuestion, validateCareAnswer, renderCareBrief } from './care'
import { TimeDuration } from 'spacetimedb'
import { allowedScenarios, defaultScenarios, demoBase, failureStatus, normalizeEnvelope, normalizeSimulation } from './finch'
// No raw table is publicly subscribable. All client data comes from caller-scoped views.
const membership = table({public:false}, {identity:t.string().primaryKey(),familyId:t.string().index('btree'),name:t.string(),role:t.string()})
const invite = table({public:false}, {code:t.string().primaryKey(),familyId:t.string(),issuer:t.string().index('btree'),name:t.string(),expires:t.u64(),used:t.bool()})
const message = table({public:false}, {id:t.u64().primaryKey().autoInc(),familyId:t.string().index('btree'),owner:t.string(),audience:t.string(),author:t.string(),text:t.string(),sourceIds:t.array(t.string()),shared:t.bool(),created:t.u64(),mode:t.string().default('legacy'),evidence:t.option(t.string()).default(undefined),proposal:t.option(t.string()).default(undefined)})
const record = table({public:false}, {id:t.string().primaryKey(),owner:t.string().index('btree'),person:t.string(),category:t.string(),text:t.string(),date:t.option(t.string()),provenance:t.option(t.string()).default(undefined)})
const recordConnection = table({public:false}, {owner:t.string().primaryKey(),scenario:t.string(),subject:t.string(),displayName:t.string(),status:t.string(),retrievedAt:t.string(),warnings:t.array(t.string()),details:t.string(),revision:t.u64()})
const task = table({public:false}, {id:t.string().primaryKey(),familyId:t.string().index('btree'),title:t.string(),owner:t.string(),ownerName:t.string(),status:t.string(),creator:t.string().default(''),declined:t.array(t.string()).default([]),created:t.u64().default(0n),updated:t.u64().default(0n)})
const request = table({public:false}, {id:t.string().primaryKey(),caller:t.string(),operation:t.string(),payload:t.string()})
const audit = table({public:false}, {id:t.u64().primaryKey().autoInc(),familyId:t.string(),actor:t.string(),action:t.string(),created:t.u64()})
const aiJob = table({public:false},{id:t.string().primaryKey(),owner:t.string().index('btree'),familyId:t.string(),audience:t.string(),question:t.string(),status:t.string(),evidence:t.string(),revision:t.u64(),created:t.u64(),history:t.string().default('[]')})
const carePreparation=table({public:false},{owner:t.string().primaryKey(),familyId:t.string(),appointmentId:t.string(),appointmentDate:t.string(),status:t.string(),dismissed:t.bool(),text:t.string(),evidence:t.string(),warnings:t.array(t.string()),revision:t.u64(),generation:t.u64(),started:t.u64(),sharedMessage:t.option(t.u64()),taskId:t.option(t.string()),generatedAt:t.u64().default(0n),reviewedAt:t.u64().default(0n),dismissedAt:t.u64().default(0n),handledAt:t.u64().default(0n)})
const sandboxLink=table({public:false},{owner:t.string().primaryKey(),familyId:t.string(),requestId:t.string(),scenario:t.string(),sessionId:t.string(),subject:t.string(),status:t.string(),revision:t.u64(),started:t.u64()})
const reminder=table({public:false},{id:t.string().primaryKey(),owner:t.string().index('btree'),title:t.string(),dueAt:t.u64(),status:t.string(),created:t.u64()})
const booking=table({public:false},{id:t.string().primaryKey(),owner:t.string().index('btree'),slot:t.string().unique(),status:t.string(),created:t.u64()})
const sharingPreference=table({public:false},{owner:t.string().primaryKey(),familyId:t.string(),mode:t.string()})
const carePlan=table({public:false},{id:t.string().primaryKey(),owner:t.string().index('btree'),familyId:t.string(),kind:t.string(),status:t.string(),summary:t.string(),plan:t.string(),evidence:t.string(),revision:t.u64(),started:t.u64(),generatedAt:t.u64(),reviewedAt:t.u64(),dismissedAt:t.u64(),completed:t.array(t.string()),shared:t.array(t.string()),handledAt:t.u64(),completedAt:t.string()})
const autoCarePreference=table({public:false},{owner:t.string().primaryKey(),enabled:t.bool()})
const familyVisit=table({public:false},{id:t.string().primaryKey(),familyId:t.string().index('btree'),patient:t.string(),patientName:t.string(),organizer:t.string(),organizerName:t.string(),slot:t.string().index('btree'),status:t.string(),created:t.u64()})
const emergencyCard=table({public:false},{owner:t.string().primaryKey(),familyId:t.string().index('btree'),name:t.string(),data:t.string(),reviewedAt:t.u64()})
const db = schema({familyVisit,emergencyCard,autoCarePreference,carePlan,sharingPreference,membership,invite,message,record,recordConnection,task,request,audit,aiJob,carePreparation,sandboxLink,reminder,booking})
export default db
type Ctx = ReducerCtx<typeof db.schemaType>
type ReadCtx = ViewCtx<typeof db.schemaType>
function member(ctx:Ctx) {const row=ctx.db.membership.identity.find(ctx.sender.toHexString());if(!row)throw new SenderError('Family membership required.');return row}
function checkedText(text:string,max=6000) {const value=text.trim();if(!value || value.length>max)throw new SenderError('Text is empty or too long.');return value}
function once(ctx:Ctx,key:string,operation:string,payload:unknown) {
  if(!/^[a-f0-9-]{36}$/.test(key))throw new SenderError('Invalid request identifier.')
  const caller=ctx.sender.toHexString(), fingerprint=JSON.stringify(payload), old=ctx.db.request.id.find(key)
  if(old) {if(old.caller!==caller || old.operation!==operation || old.payload!==fingerprint)throw new SenderError('Request identifier conflict.');return false}
  ctx.db.request.insert({id:key,caller,operation,payload:fingerprint});return true
}
function event(ctx:Ctx,familyId:string,action:string) {ctx.db.audit.insert({id:0n,familyId,actor:ctx.sender.toHexString(),action,created:ctx.timestamp.microsSinceUnixEpoch})}
function post(ctx:Ctx,m:ReturnType<typeof member>,audience:string,text:string,author=m.name,sourceIds:string[]=[],shared=false) {
  ctx.db.message.insert({id:0n,familyId:m.familyId,owner:m.identity,audience,author,text,sourceIds,shared,created:ctx.timestamp.microsSinceUnixEpoch,mode:author===m.name?'human':'legacy',evidence:undefined,proposal:undefined})
}
function seed(ctx:Ctx,identity:string,name:string) {
  const fixtures = scenarioProfile(name)==='Daniel' ? [
    {category:'Medications',text:'Medication list documents lisinopril. Current use has not been independently confirmed.',date:'2026-09-25'},
    {category:'Allergies',text:'Penicillin allergy documented; reaction recorded as rash.',date:'2026-08-12'},
    {category:'Appointment',text:'Primary care follow-up scheduled for October 6, 2026, at 10:00 AM America/Chicago.',date:undefined},
  ] : scenarioProfile(name)==='Alex' ? [{category:'Appointment',text:'Annual wellness visit scheduled for October 20, 2026.',date:'2026-09-30'}] : []
  fixtures.forEach((r,i)=>ctx.db.record.insert({...r,id:`fixture-${identity}-${i}`,owner:identity,person:name,provenance:undefined}))
}
export const createFamily=db.reducer({name:t.string()},(ctx,{name})=>{
  const identity=ctx.sender.toHexString();if(ctx.db.membership.identity.find(identity))throw new SenderError('This session already belongs to a family.')
  if(!profileNames.includes(name))throw new SenderError('Choose one of the fictional adults.')
  ctx.db.membership.insert({identity,familyId:identity,name,role:'owner'});seed(ctx,identity,name);event(ctx,identity,'family-created')
})
export const createInvite=db.reducer({code:t.string(),name:t.string()},(ctx,{code,name})=>{
  const m=member(ctx);if(m.role!=='owner')throw new SenderError('Only the family creator can invite members.')
  if(!/^[a-f0-9]{64}$/.test(code) || !profileNames.includes(name))throw new SenderError('Invalid invite.')
  if([...ctx.db.membership.familyId.filter(m.familyId)].some(p=>p.name===name))throw new SenderError('That fictional profile already has a member.')
  if(ctx.db.invite.code.find(code))throw new SenderError('Invite already exists.')
  ctx.db.invite.insert({code,familyId:m.familyId,issuer:m.identity,name,expires:ctx.timestamp.microsSinceUnixEpoch+3600000000n,used:false});event(ctx,m.familyId,'invite-created')
})
export const joinFamily=db.reducer({code:t.string()},(ctx,{code})=>{
  const identity=ctx.sender.toHexString();if(ctx.db.membership.identity.find(identity))throw new SenderError('This session already belongs to a family.')
  const invitation=ctx.db.invite.code.find(code)
  if(!invitation || invitation.used || invitation.expires<ctx.timestamp.microsSinceUnixEpoch)throw new SenderError('Invite is invalid, expired, or already used.')
  if([...ctx.db.membership.familyId.filter(invitation.familyId)].some(p=>p.name===invitation.name))throw new SenderError('This profile already has a member.')
  ctx.db.invite.code.update({...invitation,used:true});ctx.db.membership.insert({identity,familyId:invitation.familyId,name:invitation.name,role:'member'});seed(ctx,identity,invitation.name);event(ctx,invitation.familyId,'member-joined')
})
export const revokeMember=db.reducer({identity:t.string()},(ctx,{identity})=>{
  const m=member(ctx),target=ctx.db.membership.identity.find(identity)
  if(m.role!=='owner' || !target || target.familyId!==m.familyId || target.identity===m.identity)throw new SenderError('Cannot revoke this membership.')
  ctx.db.membership.identity.delete(identity);event(ctx,m.familyId,'member-revoked')
})
export const sendMessage=db.reducer({requestId:t.string(),audience:t.string(),text:t.string()},(ctx,args)=>{
  const m=member(ctx),text=checkedText(args.text)
  if(!['private','family'].includes(args.audience))throw new SenderError('Invalid conversation.')
  if(!once(ctx,args.requestId,'message',args))return
  post(ctx,m,args.audience,text)
  if(args.audience==='private'){
    const connection=ctx.db.recordConnection.owner.find(m.identity)
    const other=profileNames.find(p=>p!==m.name && text.toLowerCase().includes(p.toLowerCase()))
    const own=[...ctx.db.record.owner.filter(m.identity)]
    if(other)post(ctx,m,'private',`Access denied · ${other}’s private records are not available to ${m.name}.`,'Kin companion')
    else if(connection && !['ready','partial','empty'].includes(connection.status))post(ctx,m,'private',`Records are ${connection.status}. No older records or local fixtures will be used. Refresh your connection to try again.`,'Kin companion')
    else if(/blood|missing/i.test(text)||!own.length)post(ctx,m,'private','No matching information was found in these synthetic fixtures. Missing documentation is not evidence that a condition or allergy is absent.','Kin companion')
    else if(connection && /appointment/i.test(text))post(ctx,m,'private','No upcoming appointment is established by the retrieved medications, allergies, and encounter records. Historical encounters are not future appointments.','Kin companion',own.filter(r=>r.category==='Encounter').slice(0,3).map(r=>r.id))
    else {const shown=own.slice(0,8);post(ctx,m,'private',`Here’s what is documented in ${connection?'the fetched FinchNode synthetic record':'the local fixtures'}:\n\n${shown.map(r=>r.text).join('\n\n')}\n\n${own.length>8?`${own.length} records are available in My records; showing the first 8 here. `:''}Blood type is not established by these retrieved categories. Confirm current use and accuracy with your care team.`,'Kin companion',shown.map(r=>r.id))}
  } else {
    const summaries=[...ctx.db.message.familyId.filter(m.familyId)].filter(r=>r.shared)
    const response=/private|unshared|ignore|source record/i.test(text) ? 'Access denied · Private source records are not available in the family space. I can only use approved summary snapshots.' : summaries.length ? `From approved snapshots only:\n\n${summaries.map(r=>r.text).join('\n\n')}` : 'No care summary has been shared yet.'
    post(ctx,m,'family',response,'Kin companion')
  }
})
export const setSharingPreference=db.reducer({mode:t.string()},(ctx,{mode})=>{
  const m=member(ctx)
  if(!['ask','visits','summaries'].includes(mode))throw new SenderError('Invalid sharing preference.')
  const row={owner:m.identity,familyId:m.familyId,mode}
  if(ctx.db.sharingPreference.owner.find(m.identity))ctx.db.sharingPreference.owner.update(row)
  else ctx.db.sharingPreference.insert(row)
  event(ctx,m.familyId,'sharing-preference-updated')
})
export const mySharingPreference=db.view({public:true},t.array(sharingPreference.rowType),ctx=>{
 const m=scoped(ctx),row=m?ctx.db.sharingPreference.owner.find(m.identity):undefined
 return row&&row.familyId===m?.familyId?[row]:[]
})
export const sharePreparedVisit=db.reducer(ctx=>{
 const m=member(ctx),preference=ctx.db.sharingPreference.owner.find(m.identity)
 if(!preference||preference.familyId!==m.familyId||preference.mode==='ask')throw new SenderError('Choose a family-sharing preference first.')
 const row=ctx.db.carePreparation.owner.find(m.identity),connection=ctx.db.recordConnection.owner.find(m.identity)
 if(!row||row.dismissed||row.status!=='ready'||!careDue(ctx.timestamp.toISOString())||connection?.revision!==row.revision||!['ready','partial','empty'].includes(connection.status))throw new SenderError('A current visit brief is required.')
 if(row.sharedMessage!==undefined)return
 const parts=[appointmentEvidence.text]
 if(preference.mode==='summaries'){
  const evidence=JSON.parse(row.evidence) as Evidence[]
  for(const e of evidence){if(e.id===appointmentEvidence.id)continue;const r=ctx.db.record.id.find(e.id)
   if(!r||r.owner!==m.identity||!r.text.includes(e.text))throw new SenderError('Visit evidence changed. Refresh your brief.')
   parts.push(`${r.category}: ${e.text} (Record date: ${r.date??'unavailable'})`)
  }
 }
 const posted=ctx.db.message.insert({id:0n,familyId:m.familyId,owner:m.identity,audience:'family',author:m.name,text:checkedText(parts.join('\n\n'),12000),sourceIds:[],shared:true,created:ctx.timestamp.microsSinceUnixEpoch,mode:'human',evidence:undefined,proposal:undefined})
 const taskId=`prep-task-${posted.id}`
 ctx.db.task.insert({id:taskId,familyId:m.familyId,title:'Help me prepare for my visit',owner:'',ownerName:'',status:'open',creator:m.identity,declined:[],created:ctx.timestamp.microsSinceUnixEpoch,updated:ctx.timestamp.microsSinceUnixEpoch})
 ctx.db.carePreparation.owner.update({...row,sharedMessage:posted.id,taskId,handledAt:ctx.timestamp.microsSinceUnixEpoch})
 event(ctx,m.familyId,'visit-shared-under-saved-preference')
})
export const shareLatestSummary=db.reducer({requestId:t.string(),messageId:t.u64()},(ctx,args)=>{
 const m=member(ctx),preference=ctx.db.sharingPreference.owner.find(m.identity)
 if(preference?.familyId!==m.familyId||preference.mode!=='summaries')throw new SenderError('Medical summary sharing is not enabled.')
 const answer=ctx.db.message.id.find(args.messageId)
 if(!answer||answer.owner!==m.identity||answer.audience!=='private'||answer.mode!=='gemini'||!answer.evidence)throw new SenderError('Sourced summary unavailable.')
 const evidence=JSON.parse(answer.evidence) as Evidence[]
 if(!evidence.length||evidence.length>20)throw new SenderError('No current sourced summary to share.')
 const parts=evidence.map(e=>{const r=ctx.db.record.id.find(e.id);if(!r||r.owner!==m.identity||!r.text.includes(e.text))throw new SenderError('Summary evidence changed. Ask Kin again.');return `${r.category}: ${checkedText(e.text,2000)} (Record date: ${r.date??'unavailable'})`})
 const text=checkedText(parts.join('\n\n'),12000)
 if(!once(ctx,args.requestId,'saved-preference-summary',{messageId:args.messageId.toString()}))return
 post(ctx,m,'family',text,m.name,[],true);event(ctx,m.familyId,'summary-shared-under-saved-preference')
})
export const shareSummary=db.reducer({requestId:t.string(),recordIds:t.array(t.string()),excerpts:t.array(t.string()),note:t.string()},(ctx,args)=>{
  const m=member(ctx)
  if(args.recordIds.length>20 || args.recordIds.length!==args.excerpts.length || new Set(args.recordIds).size!==args.recordIds.length)throw new SenderError('Invalid selections.')
  const parts=args.recordIds.map((id,i)=>{const r=ctx.db.record.id.find(id);if(!r || r.owner!==m.identity)throw new SenderError('Access denied to selected record.');const quote=checkedText(args.excerpts[i],2000);if(!r.text.includes(quote))throw new SenderError('Record quotes cannot be changed. Add changes as a personal note.');return `${r.category}: ${quote} (Record date: ${r.date ?? 'unavailable'})`})
  if(args.note.trim())parts.push('Personal note:\n'+checkedText(args.note,2000));const text=checkedText(parts.join('\n\n'),12000)
  if(!once(ctx,args.requestId,'share',args))return
  post(ctx,m,'family',text,m.name,[],true);event(ctx,m.familyId,'summary-shared')
})
export const createTask=db.reducer({requestId:t.string(),title:t.string()},(ctx,args)=>{
  const m=member(ctx),title=checkedText(args.title,200)
  if(!once(ctx,args.requestId,'task',args))return
  ctx.db.task.insert({id:args.requestId,familyId:m.familyId,title,owner:'',ownerName:'',status:'open',creator:m.identity,declined:[],created:ctx.timestamp.microsSinceUnixEpoch,updated:ctx.timestamp.microsSinceUnixEpoch});event(ctx,m.familyId,'task-created')
})
export const claimTask=db.reducer({id:t.string()},(ctx,{id})=>{
  const m=member(ctx),item=ctx.db.task.id.find(id)
  if(!item || item.familyId!==m.familyId)throw new SenderError('Task not available.')
  if(item.owner===m.identity && item.status==='accepted')return
  if(item.declined.includes(m.identity))throw new SenderError('You declined this request.');
  if(item.status!=='open')throw new SenderError('Someone has already accepted this task.')
  ctx.db.task.id.update({...item,owner:m.identity,ownerName:m.name,status:'accepted',updated:ctx.timestamp.microsSinceUnixEpoch});post(ctx,m,'family',`I’ll handle: ${item.title}.`);event(ctx,m.familyId,'task-accepted')
})
export const confirmAiTask=db.reducer({messageId:t.u64(),title:t.string()},(ctx,{messageId,title})=>{
  const m=member(ctx),proposal=ctx.db.message.id.find(messageId)
  if(!proposal||proposal.familyId!==m.familyId||!['gemini','conversation'].includes(proposal.mode)||!proposal.proposal||(proposal.audience==='private'&&proposal.owner!==m.identity))throw new SenderError('Task proposal not available.')
  const id=`ai-task-${messageId}`
  if(ctx.db.task.id.find(id))return
  ctx.db.task.insert({id,familyId:m.familyId,title:checkedText(title,200),owner:'',ownerName:'',status:'open',creator:m.identity,declined:[],created:ctx.timestamp.microsSinceUnixEpoch,updated:ctx.timestamp.microsSinceUnixEpoch});event(ctx,m.familyId,'ai-task-confirmed')
})
export const completeTask=db.reducer({id:t.string()},(ctx,{id})=>{
  const m=member(ctx),item=ctx.db.task.id.find(id)
  if(!item || item.familyId!==m.familyId || item.owner!==m.identity)throw new SenderError('Only the task owner can complete it.')
  if(item.status==='completed')return
  if(item.status!=='accepted')throw new SenderError('Accept this task first.')
  ctx.db.task.id.update({...item,status:'completed',updated:ctx.timestamp.microsSinceUnixEpoch});post(ctx,m,'family',`Marked coordination complete: ${item.title}.`);event(ctx,m.familyId,'task-completed')
})
export const myMembership=db.view({public:true},t.array(membership.rowType),ctx=>{const m=ctx.db.membership.identity.find(ctx.sender.toHexString());return m?[m]:[]})
function scoped(ctx:ReadCtx){return ctx.db.membership.identity.find(ctx.sender.toHexString())}
export const familyMembers=db.view({public:true},t.array(membership.rowType),ctx=>{const m=scoped(ctx);return m?[...ctx.db.membership.familyId.filter(m.familyId)]:[]})
export const myRecords=db.view({public:true},t.array(record.rowType),ctx=>scoped(ctx)?[...ctx.db.record.owner.filter(ctx.sender.toHexString())]:[])
export const visibleMessages=db.view({public:true},t.array(message.rowType),ctx=>{const m=scoped(ctx);return m?[...ctx.db.message.familyId.filter(m.familyId)].filter(row=>row.audience==='family'||row.owner===m.identity):[]})
export const familyTasks=db.view({public:true},t.array(task.rowType),ctx=>{const m=scoped(ctx);return m?[...ctx.db.task.familyId.filter(m.familyId)]:[]})
export const myInvites=db.view({public:true},t.array(invite.rowType),ctx=>{const m=scoped(ctx);return m?.role==='owner'?[...ctx.db.invite.issuer.filter(m.identity)]:[]})
export const myRecordConnection=db.view({public:true},t.array(recordConnection.rowType),ctx=>{const m=scoped(ctx);const row=m?ctx.db.recordConnection.owner.find(m.identity):undefined;return row?[row]:[]})
// This server-side adapter uses the verified procedure caller. It accepts no owner or patient ID.
// Membership and revision are rechecked after HTTP retrieval to prevent stale or revoked writes.
export const refreshRecords=db.procedure({scenario:t.string()},t.string(),(ctx,{scenario})=>{
  const start=ctx.withTx(tx=>{
    const m=member(tx),chosen=scenario||defaultScenarios[m.name]
    if(!allowedScenarios.includes(chosen))throw new SenderError('Unsupported synthetic scenario.')
    const old=tx.db.recordConnection.owner.find(m.identity)
    if(old?.status==='loading')throw new SenderError('A record request is already in progress.')
    const revision=(old?.revision??0n)+1n
    const row={owner:m.identity,scenario:chosen,subject:'',displayName:'',status:'loading',retrievedAt:'',warnings:[] as string[],details:'',revision}
    if(old)tx.db.recordConnection.owner.update(row);else tx.db.recordConnection.insert(row)
    for(const r of tx.db.record.owner.filter(m.identity))if(r.category!=='Trip'&&!r.id.startsWith('booking-'))tx.db.record.id.delete(r.id)
    return {identity:m.identity,familyId:m.familyId,name:m.name,scenario:chosen,revision}
  })
  let status='unavailable',subject='',displayName='',retrievedAt='',details='',warnings:string[]=[],normalized:ReturnType<typeof normalizeEnvelope>['records']=[]
  try{
    if(start.scenario==='detailed-care-demo'){
      // Explicit authored simulation uses the same immutable payload as the local demo API.
      // It is not a fallback for failed FinchNode retrieval.
      retrievedAt=ctx.withTx(tx=>tx.timestamp.toISOString());const result=normalizeSimulation(syntheticRecords(start.name),retrievedAt)
      normalized=result.records;subject=result.subject;displayName=result.displayName;warnings=result.warnings;details=result.details;status=normalized.length?'ready':'empty'
    }else{
    const manifestResponse=ctx.http.fetch(`${demoBase}/scenarios`,{timeout:new TimeDuration(15000000n)})
    if(!manifestResponse.ok)throw Error('Scenario discovery is unavailable.')
    const manifest=manifestResponse.json() as {synthetic?:boolean;data?:Array<{id:string;subject?:string;persona?:{displayName?:string}}>}
    const found=manifest.synthetic===true?manifest.data?.find(s=>s.id===start.scenario):undefined
    if(!found?.subject)throw Error('No valid synthetic subject was discovered.')
    subject=found.subject;displayName=found.persona?.displayName??'Synthetic subject'
    // Omitting categories requests all available sections, constrained by the demo consent receipt.
    const response=ctx.http.fetch(`${demoBase}/users/${encodeURIComponent(subject)}/records`,{timeout:new TimeDuration(15000000n)})
    retrievedAt=ctx.withTx(tx=>tx.timestamp.toISOString())
    if(!response.ok){status=failureStatus(response.status);const retry=response.headers.get('Retry-After');warnings=[`FinchNode returned HTTP ${response.status}.${retry?` Retry after ${retry} seconds.`:''}`];details=JSON.stringify({httpStatus:response.status,retryAfter:retry,requestId:response.headers.get('X-Request-Id')})}
    else {const result=normalizeEnvelope(response.json(),start.scenario,subject,retrievedAt);status=result.status;normalized=result.records;warnings=result.warnings;details=result.details}
  }
  }catch{status='unavailable';warnings=['Record source is unavailable or returned an unexpected response. No fixtures were substituted.']}
  return ctx.withTx(tx=>{
    const m=member(tx),current=tx.db.recordConnection.owner.find(start.identity)
    if(m.identity!==start.identity||m.familyId!==start.familyId||current?.revision!==start.revision)throw new SenderError('Record request no longer authorized.')
    for(const r of normalized)tx.db.record.insert({id:`${start.scenario==='detailed-care-demo'?'simulation':'finch'}-${m.identity}-${r.upstreamId}`,owner:m.identity,person:m.name,category:r.category,text:r.text,date:r.date,provenance:r.provenance})
    tx.db.recordConnection.owner.update({owner:m.identity,scenario:start.scenario,subject,displayName,status,retrievedAt,warnings,details,revision:start.revision})
    event(tx,m.familyId,`records-${status}`);return status
  })
})
// The browser supplies its session to the local AI service. This procedure derives
// the caller from the database-verified token, never from a submitted person ID.
export const prepareAi=db.procedure({requestId:t.string(),audience:t.string(),text:t.string()},t.string(),(ctx,args)=>ctx.withTx(tx=>{
  const m=member(tx),text=checkedText(args.text,2000)
  if(!['private','family'].includes(args.audience)||!/^[a-f0-9-]{36}$/.test(args.requestId))throw new SenderError('Invalid AI request.')
  const old=tx.db.aiJob.id.find(args.requestId)
  if(old&&(old.owner!==m.identity||old.audience!==args.audience||old.question!==text))throw new SenderError('Request identifier conflict.')
  if(old?.status==='completed')return JSON.stringify({status:'completed'})
  if(old?.status==='processing'&&tx.timestamp.microsSinceUnixEpoch-old.created<90000000n)throw new SenderError('This question is already being answered.')
  if([...tx.db.aiJob.owner.filter(m.identity)].some(j=>j.id!==args.requestId&&j.status==='processing'&&tx.timestamp.microsSinceUnixEpoch-j.created<90000000n))throw new SenderError('Please wait for your current answer.')
  if(!old)post(tx,m,args.audience,text)
  const other=profileNames.find(p=>p!==m.name&&new RegExp(`\\b${p}(?:['’]s|s)?\\b`,'i').test(text))
  const connection=tx.db.recordConnection.owner.find(m.identity)
  let policy=''
  if(args.audience==='private'&&other)policy=`Access denied · ${other}’s private records are not available to ${m.name}. Family membership does not grant record access.`
  else if(args.audience==='family'&&/private|unshared|ignore.*privacy|source records/i.test(text))policy='Access denied · Private source records are not available in the family space. Only approved snapshots may be used.'
  else if(args.audience==='private'&&recordQuestion(text)&&!connection)policy='Fetch your FinchNode synthetic records in My records before asking the AI. Local fixtures are not substituted.'
  else if(args.audience==='private'&&recordQuestion(text)&&connection&&!['ready','partial','empty'].includes(connection.status))policy=`Records are ${connection.status}. No older records or local fixtures will be used. Refresh My records to try again.`
  const evidence:Evidence[]=args.audience==='private'?[...tx.db.record.owner.filter(m.identity)].filter(r=>r.provenance).map(r=>({id:r.id,category:r.category,text:r.text,date:r.date??null})): [...tx.db.message.familyId.filter(m.familyId)].filter(r=>r.shared).slice(-12).map(r=>({id:`shared:${r.id}`,category:'Shared snapshot',text:r.text,date:null}))
  const history=[...tx.db.message.familyId.filter(m.familyId)].filter(r=>r.audience===args.audience&&(r.audience==='family'||r.owner===m.identity)).sort((a,b)=>a.created<b.created?-1:1).slice(-16).map(r=>({messageId:r.id.toString(),author:r.author,text:r.text.slice(0,2000)}))
  if(args.audience==='private'&&connection&&['ready','partial','empty'].includes(connection.status))for(const plan of tx.db.carePlan.owner.filter(m.identity))if(['ready','active','handled'].includes(plan.status)&&(JSON.parse(plan.evidence) as Evidence[]).every(e=>evidence.some(r=>r.id===e.id&&r.text===e.text)))history.push({messageId:`plan:${plan.id}`,author:'Kin',text:`Saved personal preparation plan (${plan.status}): ${plan.summary}. Steps marked done by the user, not verified medical actions: ${plan.completed.map(k=>steps[k as keyof typeof steps]).join('; ')||'none'}. Family requests sent: ${plan.shared.map(k=>steps[k as keyof typeof steps]).join('; ')||'none'}.`})
  const row={id:args.requestId,owner:m.identity,familyId:m.familyId,audience:args.audience,question:text,status:policy?'completed':'processing',evidence:JSON.stringify(evidence),revision:connection?.revision??0n,created:tx.timestamp.microsSinceUnixEpoch,history:JSON.stringify(history)}
  if(old)tx.db.aiJob.id.update(row);else tx.db.aiJob.insert(row)
  if(policy){post(tx,m,args.audience,policy,'Kin companion');const last=[...tx.db.message.familyId.filter(m.familyId)].filter(r=>r.owner===m.identity&&r.author==='Kin companion').sort((a,b)=>a.id<b.id?1:-1)[0];if(last)tx.db.message.id.update({...last,mode:'policy'});return JSON.stringify({status:'completed'})}
  return JSON.stringify({status:'processing',requestId:args.requestId,audience:args.audience,person:m.name,question:text,evidence,history,now:tx.timestamp.toISOString(),timeZone:'America/Chicago',capabilities:{reminderDelivery:false,booking:false,taskRequiresConfirmation:true},warnings:args.audience==='private'?connection?.warnings??[]:[]})
}))
// Only the dedicated AI service identity may submit model results. The server
// rechecks membership and the exact evidence after the external model request.
export const finishAi=db.procedure({requestId:t.string(),output:t.string(),failure:t.string()},t.string(),(ctx,args)=>ctx.withTx(tx=>{
  if(ctx.sender.toHexString()!==aiServiceIdentity)throw new SenderError('AI service authorization required.')
  const job=tx.db.aiJob.id.find(args.requestId)
  if(!job)throw new SenderError('Question unavailable.')
  if(job.status==='completed')return 'completed'
  const m=tx.db.membership.identity.find(job.owner)
  if(!m||m.familyId!==job.familyId)throw new SenderError('Question access revoked.')
  if(job.status!=='processing'||tx.timestamp.microsSinceUnixEpoch-job.created>90000000n)throw new SenderError('Question expired.')
  const connection=tx.db.recordConnection.owner.find(m.identity)
  const evidence=JSON.parse(job.evidence) as Evidence[]
  if(job.audience==='private'&&recordQuestion(job.question)&&(connection?.revision!==job.revision||!['ready','partial','empty'].includes(connection.status)))throw new SenderError('Records changed. Ask again using current evidence.')
  if(job.audience==='family'&&evidence.some(e=>{const id=BigInt(e.id.slice(7));const row=tx.db.message.id.find(id);return !row||!row.shared||row.familyId!==m.familyId||row.text!==e.text}))throw new SenderError('Shared evidence changed.')
  if(args.failure){if(!['unconfigured','unavailable','rate-limited','invalid-evidence'].includes(args.failure))throw new SenderError('Invalid failure status.');tx.db.aiJob.id.update({...job,status:'failed'});return args.failure}
  let answer
  try{answer=validateAnswer(JSON.parse(checkedText(args.output,16000)),evidence,JSON.parse(job.history) as HistoryEntry[])}catch{tx.db.aiJob.id.update({...job,status:'failed'});return 'invalid-evidence'}
  if(job.audience==='private'&&answer.findings.length&&(connection?.revision!==job.revision||!['ready','partial','empty'].includes(connection?.status??'')))throw new SenderError('Records changed. Ask again using current evidence.')
  tx.db.message.insert({id:0n,familyId:m.familyId,owner:m.identity,audience:job.audience,author:'Kin companion',text:renderAnswer(answer,evidence,job.audience),sourceIds:job.audience==='private'?answer.findings.map(f=>f.recordId):[],shared:false,created:tx.timestamp.microsSinceUnixEpoch,mode:answer.intent&&answer.intent!=='records'?'conversation':'gemini',evidence:JSON.stringify(answer.findings.map(f=>({...evidence.find(e=>e.id===f.recordId)!,text:f.quote,provenance:job.audience==='private'?tx.db.record.id.find(f.recordId)?.provenance:undefined}))),proposal:answer.taskProposal==='prepareQuestions'?'Prepare appointment questions':undefined})
  tx.db.aiJob.id.update({...job,status:'completed'});event(tx,m.familyId,'ai-answer-validated');return 'completed'
}))
// Date-based eligibility is decided with the database clock. The single authored
// appointment belongs only to the fictional Daniel profile; it is not provider data.
export const prepareCare=db.procedure({retry:t.bool()},t.string(),(ctx,{retry})=>ctx.withTx(tx=>{
  const m=member(tx)
  if(scenarioProfile(m.name)!=='Daniel')return JSON.stringify({status:'not-applicable'})
  const old=tx.db.carePreparation.owner.find(m.identity)
  if(old?.dismissed)return JSON.stringify({status:'dismissed'})
  if(!careDue(tx.timestamp.toISOString())){
    if(old)tx.db.carePreparation.owner.update({...old,status:'not-due',text:'',evidence:'[]'})
    return JSON.stringify({status:'not-due'})
  }
  const connection=tx.db.recordConnection.owner.find(m.identity),revision=connection?.revision??0n
  if(old?.revision===revision&&old.status==='ready')return JSON.stringify({status:'ready'})
  if(old?.revision===revision&&old.status==='preparing'&&tx.timestamp.microsSinceUnixEpoch-old.started<90000000n)return JSON.stringify({status:'preparing'})
  if(old?.revision===revision&&old.status==='failed'&&!retry)return JSON.stringify({status:'failed'})
  if(old?.revision===revision&&old.status==='records-unavailable'&&!retry&&!['ready','partial','empty'].includes(connection?.status??''))return JSON.stringify({status:'records-unavailable'})
  const usable=connection&&['ready','partial','empty'].includes(connection.status)
  const evidence=[appointmentEvidence,...(usable?[...tx.db.record.owner.filter(m.identity)].filter(r=>r.provenance).map(r=>({id:r.id,category:r.category,text:r.text,date:r.date??null})):[])]
  const status=!connection?'needs-records':usable?'preparing':'records-unavailable'
  const row={owner:m.identity,familyId:m.familyId,appointmentId:demoAppointment.id,appointmentDate:demoAppointment.startsAt,status,dismissed:false,text:'',evidence:JSON.stringify(evidence),warnings:connection?.warnings??[],revision,generation:(old?.generation??0n)+1n,started:tx.timestamp.microsSinceUnixEpoch,sharedMessage:old?.sharedMessage,taskId:old?.taskId,generatedAt:old?.generatedAt??0n,reviewedAt:old?.reviewedAt??0n,dismissedAt:old?.dismissedAt??0n,handledAt:old?.handledAt??0n}
  if(old)tx.db.carePreparation.owner.update(row);else tx.db.carePreparation.insert(row)
  if(status!=='preparing')return JSON.stringify({status})
  return JSON.stringify({status:'generate',owner:m.identity,generation:row.generation.toString(),audience:'private',person:m.name,question:careQuestion,evidence,history:[],warnings:row.warnings})
}))
export const finishCare=db.procedure({owner:t.string(),generation:t.u64(),output:t.string(),failure:t.string()},t.string(),(ctx,args)=>ctx.withTx(tx=>{
  if(ctx.sender.toHexString()!==aiServiceIdentity)throw new SenderError('AI service authorization required.')
  const row=tx.db.carePreparation.owner.find(args.owner),m=tx.db.membership.identity.find(args.owner)
  if(!row||!m||m.familyId!==row.familyId)throw new SenderError('Preparation access revoked.')
  if(row.dismissed)return 'dismissed'
  if(row.generation!==args.generation||row.status!=='preparing')return 'superseded'
  const connection=tx.db.recordConnection.owner.find(m.identity)
  if(!careDue(tx.timestamp.toISOString())){tx.db.carePreparation.owner.update({...row,status:'not-due',text:'',evidence:'[]'});return 'not-due'}
  if(connection?.revision!==row.revision||!['ready','partial','empty'].includes(connection.status)){
    tx.db.carePreparation.owner.update({...row,status:'records-changed',text:'',evidence:'[]'});return 'superseded'
  }
  if(tx.timestamp.microsSinceUnixEpoch-row.started>90000000n){tx.db.carePreparation.owner.update({...row,status:'failed',text:'',evidence:'[]'});return 'expired'}
  if(args.failure){if(!['unconfigured','unavailable','rate-limited','invalid-evidence'].includes(args.failure))throw new SenderError('Invalid provider failure.');tx.db.carePreparation.owner.update({...row,status:'failed',text:'',evidence:'[]',warnings:[...row.warnings,`AI brief unavailable: ${args.failure}. Retry when ready.`]});return args.failure}
  try{
    const evidence=JSON.parse(row.evidence) as Evidence[],answer=validateCareAnswer(JSON.parse(checkedText(args.output,16000)),evidence)
    tx.db.carePreparation.owner.update({...row,status:'ready',generatedAt:tx.timestamp.microsSinceUnixEpoch,text:renderCareBrief(answer,evidence),evidence:JSON.stringify(answer.findings.map(f=>({...evidence.find(e=>e.id===f.recordId)!,text:f.quote})))})
    event(tx,m.familyId,'private-appointment-brief-prepared');return 'ready'
  }catch{tx.db.carePreparation.owner.update({...row,status:'failed',text:'',evidence:'[]',warnings:[...row.warnings,'The brief did not pass its evidence checks. No answer was substituted.']});return 'invalid-evidence'}
}))
export const dismissCare=db.reducer(ctx=>{
  const m=member(ctx),row=ctx.db.carePreparation.owner.find(m.identity)
  if(!row)throw new SenderError('No preparation card available.')
  ctx.db.carePreparation.owner.update({...row,dismissed:true,dismissedAt:ctx.timestamp.microsSinceUnixEpoch,text:'',evidence:'[]'});event(ctx,m.familyId,'private-preparation-dismissed')
})
export const myCarePreparation=db.view({public:true},t.array(carePreparation.rowType),ctx=>{
  const m=scoped(ctx),row=m?ctx.db.carePreparation.owner.find(m.identity):undefined
  if(!row)return []
  const connection=ctx.db.recordConnection.owner.find(row.owner)
  return row.status==='ready'&&(connection?.revision!==row.revision||!['ready','partial','empty'].includes(connection.status))?[{...row,status:'records-changed',text:'',evidence:'[]'}]:[row]
})
export const shareCareBrief=db.reducer({recordIds:t.array(t.string()),excerpts:t.array(t.string()),note:t.string(),includeAppointment:t.bool(),taskTitle:t.string()},(ctx,args)=>{
  const m=member(ctx),row=ctx.db.carePreparation.owner.find(m.identity),connection=ctx.db.recordConnection.owner.find(m.identity)
  if(!row||row.dismissed||row.status!=='ready'||!careDue(ctx.timestamp.toISOString())||connection?.revision!==row.revision||!['ready','partial','empty'].includes(connection.status))throw new SenderError('Review a current private brief before sharing.')
  if(row.sharedMessage!==undefined)return
  if(args.recordIds.length>20||args.recordIds.length!==args.excerpts.length||new Set(args.recordIds).size!==args.recordIds.length)throw new SenderError('Invalid selections.')
  const evidence=JSON.parse(row.evidence) as Evidence[]
  const parts=args.recordIds.map((id,i)=>{const record=ctx.db.record.id.find(id);if(!record||record.owner!==m.identity||!evidence.some(e=>e.id===id))throw new SenderError('Selected evidence not available.');const quote=checkedText(args.excerpts[i],2000);if(!record.text.includes(quote))throw new SenderError('Record quotes cannot be changed.');return `${record.category}: ${quote} (Record date: ${record.date??'unavailable'})`})
  if(args.includeAppointment)parts.unshift(appointmentEvidence.text)
  if(args.note.trim())parts.push('Personal note:\n'+checkedText(args.note,2000))
  const text=checkedText(parts.join('\n\n'),12000)
  const posted=ctx.db.message.insert({id:0n,familyId:m.familyId,owner:m.identity,audience:'family',author:m.name,text,sourceIds:[],shared:true,created:ctx.timestamp.microsSinceUnixEpoch,mode:'human',evidence:undefined,proposal:undefined})
  const taskId=`prep-task-${posted.id}`
  ctx.db.task.insert({id:taskId,familyId:m.familyId,title:checkedText(args.taskTitle,200),owner:'',ownerName:'',status:'open',creator:m.identity,declined:[],created:ctx.timestamp.microsSinceUnixEpoch,updated:ctx.timestamp.microsSinceUnixEpoch})
  ctx.db.carePreparation.owner.update({...row,sharedMessage:posted.id,taskId,handledAt:ctx.timestamp.microsSinceUnixEpoch});event(ctx,m.familyId,'appointment-preparation-approved-for-family')
})
export const postFamilyMessage=db.reducer({requestId:t.string(),text:t.string()},(ctx,args)=>{
  const m=member(ctx),text=checkedText(args.text)
  if(!once(ctx,args.requestId,'family-message',args))return
  post(ctx,m,'family',text)
})
export const reviewCare=db.reducer(ctx=>{
  const m=member(ctx),row=ctx.db.carePreparation.owner.find(m.identity)
  if(!row||row.dismissed||row.status!=='ready')throw new SenderError('Brief not available.')
  if(!row.reviewedAt)ctx.db.carePreparation.owner.update({...row,reviewedAt:ctx.timestamp.microsSinceUnixEpoch})
})
export const declineTask=db.reducer({id:t.string()},(ctx,{id})=>{
  const m=member(ctx),item=ctx.db.task.id.find(id)
  if(!item||item.familyId!==m.familyId)throw new SenderError('Task not available.')
  if(item.declined.includes(m.identity))return
  if(item.status!=='open')throw new SenderError('Only requested tasks can be declined.')
  ctx.db.task.id.update({...item,declined:[...item.declined,m.identity],updated:ctx.timestamp.microsSinceUnixEpoch})
  post(ctx,m,'family',`I cannot help with: ${item.title}.`)
})
export const cancelTask=db.reducer({id:t.string()},(ctx,{id})=>{
  const m=member(ctx),item=ctx.db.task.id.find(id)
  if(!item||item.familyId!==m.familyId||![item.creator,item.owner].includes(m.identity))throw new SenderError('Only the requester or helper can cancel.')
  if(item.status==='cancelled')return
  if(item.status==='completed')throw new SenderError('Completed tasks cannot be cancelled.')
  ctx.db.task.id.update({...item,status:'cancelled',updated:ctx.timestamp.microsSinceUnixEpoch})
  post(ctx,m,'family',`Cancelled: ${item.title}.`)
})
export const mySandboxLink=db.view({public:true},t.array(sandboxLink.rowType),ctx=>{const row=scoped(ctx)?ctx.db.sandboxLink.owner.find(ctx.sender.toHexString()):undefined;return row?[row]:[]})
export const myReminders=db.view({public:true},t.array(reminder.rowType),ctx=>scoped(ctx)?[...ctx.db.reminder.owner.filter(ctx.sender.toHexString())]:[])
export const myBookings=db.view({public:true},t.array(booking.rowType),ctx=>scoped(ctx)?[...ctx.db.booking.owner.filter(ctx.sender.toHexString())]:[])
export const beginSandbox=db.procedure({requestId:t.string(),scenario:t.string()},t.string(),(ctx,args)=>ctx.withTx(tx=>{
 const m=member(tx)
 if(!['baseline-adult','polypharmacy-senior','sparse-record','consent-partial','multi-source-overlap'].includes(args.scenario)||!/^[a-f0-9-]{36}$/.test(args.requestId))throw new SenderError('Invalid sandbox request.')
 const old=tx.db.sandboxLink.owner.find(m.identity)
 if(old&&old.scenario!==args.scenario)throw new SenderError('This profile already has a sandbox connection. Refresh its existing scenario.')
 if(old?.status==='loading'&&tx.timestamp.microsSinceUnixEpoch-old.started<120000000n)throw new SenderError('Connection already in progress.')
 const revision=(tx.db.recordConnection.owner.find(m.identity)?.revision??0n)+1n
 const row={owner:m.identity,familyId:m.familyId,requestId:old?.sessionId?old.requestId:args.requestId,scenario:args.scenario,sessionId:old?.sessionId??'',subject:old?.subject??'',status:'loading',revision,started:tx.timestamp.microsSinceUnixEpoch}
 if(old)tx.db.sandboxLink.owner.update(row);else tx.db.sandboxLink.insert(row)
 const connection={owner:m.identity,scenario:'sandbox:'+args.scenario,subject:row.subject,displayName:'FinchNode sandbox · '+m.name,status:'loading',retrievedAt:'',warnings:[] as string[],details:'',revision}
 if(tx.db.recordConnection.owner.find(m.identity))tx.db.recordConnection.owner.update(connection);else tx.db.recordConnection.insert(connection)
 for(const r of tx.db.record.owner.filter(m.identity))if(r.category!=='Trip'&&!r.id.startsWith('booking-'))tx.db.record.id.delete(r.id)
 return JSON.stringify({...row,revision:revision.toString(),started:row.started.toString(),person:m.name})
}))
export const finishSandbox=db.procedure({owner:t.string(),revision:t.u64(),sessionId:t.string(),subject:t.string(),status:t.string(),payload:t.string()},t.string(),(ctx,args)=>ctx.withTx(tx=>{
 if(ctx.sender.toHexString()!==aiServiceIdentity)throw new SenderError('Service authorization required.')
 const link=tx.db.sandboxLink.owner.find(args.owner),m=tx.db.membership.identity.find(args.owner),connection=tx.db.recordConnection.owner.find(args.owner)
 if(!link||!m||m.familyId!==link.familyId||link.revision!==args.revision||connection?.revision!==args.revision)throw new SenderError('Connection changed or revoked.')
 if(link.sessionId&&args.sessionId!==link.sessionId)throw new SenderError('Session changed.')
 if(link.subject&&args.subject&&args.subject!==link.subject)throw new SenderError('Subject changed.')
 if(args.status==='pending'){tx.db.sandboxLink.owner.update({...link,sessionId:args.sessionId,status:'waiting'});tx.db.recordConnection.owner.update({...connection,status:'waiting',warnings:['FinchNode is still syncing this synthetic patient. Resume the same connection shortly.']});return 'waiting'}
 if(args.status==='session'){tx.db.sandboxLink.owner.update({...link,sessionId:args.sessionId,subject:args.subject||link.subject});return 'session'}
 if(!['ready','partial','empty','unavailable','revoked','denied','rate-limited'].includes(args.status))throw new SenderError('Invalid connection state.')
 let normalized:ReturnType<typeof normalizeEnvelope>|undefined
 if(['ready','partial','empty'].includes(args.status)){normalized=normalizeEnvelope(JSON.parse(args.payload),link.scenario,args.subject,tx.timestamp.toISOString(),'sandbox')}
 for(const r of tx.db.record.owner.filter(args.owner))if(r.category!=='Trip'&&!r.id.startsWith('booking-'))tx.db.record.id.delete(r.id)
 for(const r of normalized?.records??[])tx.db.record.insert({id:`sandbox-${args.owner}-${r.upstreamId}`,owner:args.owner,person:m.name,category:r.category,text:r.text,date:r.date,provenance:r.provenance})
 const status=normalized?.status??args.status
 tx.db.recordConnection.owner.update({...connection,status,subject:args.subject||link.subject,retrievedAt:tx.timestamp.toISOString(),warnings:normalized?.warnings??['Sandbox records unavailable. No older records were substituted.'],details:normalized?.details??'',revision:args.revision})
 tx.db.sandboxLink.owner.update({...link,status,sessionId:args.sessionId,subject:args.subject||link.subject})
 return status
}))
export const createReminder=db.reducer({requestId:t.string(),title:t.string(),dueAt:t.u64()},(ctx,args)=>{
 const m=member(ctx),title=checkedText(args.title,200),now=ctx.timestamp.microsSinceUnixEpoch
 if(!once(ctx,args.requestId,'reminder',{...args,dueAt:args.dueAt.toString()}))return
 if(args.dueAt<=now||args.dueAt>now+31536000000000n)throw new SenderError('Choose a future reminder within one year.')
 ctx.db.reminder.insert({id:args.requestId,owner:m.identity,title,dueAt:args.dueAt,status:'scheduled',created:now})
})
export const checkReminders=db.reducer(ctx=>{syncAutoCare(ctx);const m=member(ctx);for(const r of ctx.db.reminder.owner.filter(m.identity))if(r.status==='scheduled'&&r.dueAt<=ctx.timestamp.microsSinceUnixEpoch)ctx.db.reminder.id.update({...r,status:'due'})})
export const updateReminder=db.reducer({id:t.string(),action:t.string()},(ctx,args)=>{const m=member(ctx),r=ctx.db.reminder.id.find(args.id);if(!r||r.owner!==m.identity||!['dismiss','cancel'].includes(args.action))throw new SenderError('Reminder unavailable.');ctx.db.reminder.id.update({...r,status:args.action==='cancel'?'cancelled':'dismissed'});
 if(args.action==='dismiss'&&r.id.startsWith('auto-care:')&&r.id.endsWith(':safe-water')&&ctx.db.autoCarePreference.owner.find(m.identity)?.enabled){
 const row=ctx.db.carePlan.id.find(r.id.slice('auto-care:'.length,-':safe-water'.length));if(row&&['ready','active'].includes(row.status)){try{currentPlan(ctx,row);const trip=(JSON.parse(row.evidence) as Evidence[]).find(e=>e.category==='Trip');const next=trip?.date?nextTravelCheck(trip.date,Number(ctx.timestamp.microsSinceUnixEpoch/1000n)):null;if(next)ctx.db.reminder.id.update({...r,status:'scheduled',dueAt:BigInt(next)*1000n})}catch{/* Stop when private sources are unavailable. */}}
 }})
const demoSlots=['2026-10-14T20:00:00Z','2026-10-15T15:00:00Z','2026-10-16T18:00:00Z']
export const confirmDemoBooking=db.reducer({requestId:t.string(),slot:t.string()},(ctx,args)=>{
 const m=member(ctx)
 if(!once(ctx,args.requestId,'demo-booking',args))return
 if(!demoSlots.includes(args.slot)||BigInt(Date.parse(args.slot))*1000n<=ctx.timestamp.microsSinceUnixEpoch)throw new SenderError('Demo slot unavailable.')
 if([...ctx.db.familyVisit.slot.filter(args.slot)].some(v=>v.status==='confirmed-demo'))throw new SenderError('This demo slot was taken. Choose another.')
 const old=ctx.db.booking.slot.find(args.slot);if(old&&old.status!=='cancelled')throw new SenderError('This demo slot was taken. Choose another.')
 if(old)ctx.db.booking.id.delete(old.id)
 ctx.db.booking.insert({id:args.requestId,owner:m.identity,slot:args.slot,status:'confirmed-demo',created:ctx.timestamp.microsSinceUnixEpoch})
 ctx.db.record.insert({id:'booking-'+args.requestId,owner:m.identity,person:m.name,category:'Appointment record',text:`Synthetic booking confirmed by the user: Demo Community Clinic, primary care, ${args.slot}. Fictional slot only. No provider has been contacted and no real appointment exists.`,date:args.slot,provenance:JSON.stringify({provider:'Kin synthetic booking',sourceName:'Demo Community Clinic · fictional',upstreamId:args.requestId,sourceRecordId:'booking:'+args.requestId,retrievedAt:ctx.timestamp.toISOString(),raw:{slot:args.slot,synthetic:true}})})
})
export const cancelDemoBooking=db.reducer({id:t.string()},(ctx,{id})=>{const m=member(ctx),b=ctx.db.booking.id.find(id);if(!b||b.owner!==m.identity)throw new SenderError('Booking unavailable.');ctx.db.booking.id.update({...b,status:'cancelled'});ctx.db.record.id.delete('booking-'+id)})

// Personal event history is private. Family receives only a deliberately requested handoff.
export const myCarePlans=db.view({public:true},t.array(carePlan.rowType),ctx=>scoped(ctx)?[...ctx.db.carePlan.owner.filter(ctx.sender.toHexString())]:[])
export const saveTrip=db.reducer({requestId:t.string(),destination:t.string(),departure:t.string()},(ctx,args)=>{
 const m=member(ctx),destination=checkedText(args.destination,100),date=Date.parse(args.departure)
 if(!Number.isFinite(date)||date<=Number(ctx.timestamp.microsSinceUnixEpoch/1000n)||date>Number(ctx.timestamp.microsSinceUnixEpoch/1000n)+366*86400000)throw new SenderError('Choose a future departure within one year.')
 if(!once(ctx,args.requestId,'trip',args))return
 ctx.db.record.insert({id:`trip-${args.requestId}`,owner:m.identity,person:m.name,category:'Trip',date:new Date(date).toISOString(),text:`Personal travel plan: ${destination}. Departure: ${new Date(date).toISOString()}. Saved by ${m.name}; not a medical recommendation.`,provenance:JSON.stringify({provider:'Personal context',synthetic:true})})
})
export const cancelTrip=db.reducer({recordId:t.string()},(ctx,{recordId})=>{
 const m=member(ctx),trip=ctx.db.record.id.find(recordId)
 if(!trip||trip.owner!==m.identity||!['Trip','Cancelled trip'].includes(trip.category))throw new SenderError('Trip unavailable.')
 if(trip.category==='Cancelled trip')return
 ctx.db.record.id.update({...trip,category:'Cancelled trip'})
 for(const row of ctx.db.carePlan.owner.filter(m.identity))if(row.status!=='handled'&&(JSON.parse(row.evidence) as Evidence[])[0]?.id===recordId){
  ctx.db.carePlan.id.update({...row,status:'dismissed',dismissedAt:row.dismissedAt||ctx.timestamp.microsSinceUnixEpoch})
  for(const reminder of ctx.db.reminder.owner.filter(m.identity))if((reminder.id.startsWith(`plan-reminder:${row.id}:`)||reminder.id.startsWith(`auto-care:${row.id}:`))&&['scheduled','due'].includes(reminder.status))ctx.db.reminder.id.update({...reminder,status:'cancelled'})
 }
})
export const preparePlan=db.procedure({retry:t.bool()},t.string(),(ctx,{retry})=>ctx.withTx(tx=>{
 const m=member(tx),connection=tx.db.recordConnection.owner.find(m.identity)
 const recordsAvailable=!!connection&&['ready','partial','empty'].includes(connection.status)
 const records=[...tx.db.record.owner.filter(m.identity)].filter(r=>recordsAvailable||r.category==='Trip').map(r=>({id:r.id,category:r.category,text:r.text,date:r.date??null}))
 // Prepare the most relevant eligible event. Existing plans retain their progress.
 const eligible=candidates(records,tx.timestamp.toISOString());let settled='nothing-due'
 for(const source of eligible){
  const id=`${m.identity}:${eventKey(source)}`,old=tx.db.carePlan.id.find(id)
  if(old&&['dismissed','handled'].includes(old.status))continue
  if(old&&['ready','active'].includes(old.status)&&(JSON.parse(old.plan) as Plan).version===3&&(JSON.parse(old.evidence) as Evidence[]).every(e=>records.some(r=>r.id===e.id&&r.text===e.text))){settled=old.status;continue}
  if(old?.status==='preparing'&&tx.timestamp.microsSinceUnixEpoch-old.started<90000000n)return JSON.stringify({status:'preparing'})
  if(old?.status==='failed'&&!retry)return JSON.stringify({status:'failed'})
  const trip=source.category==='Trip'
  const evidence=[source,...records.filter(e=>e.id!==source.id&&/^(Medications|Allergies|Care preference)$/i.test(e.category)).slice(0,10)]
  const row={id,owner:m.identity,familyId:m.familyId,kind:trip?'trip':'follow-up',status:'preparing',summary:'',plan:'',evidence:JSON.stringify(evidence),revision:connection?.revision??0n,started:tx.timestamp.microsSinceUnixEpoch,generatedAt:0n,reviewedAt:old?.reviewedAt??0n,dismissedAt:0n,completed:old?.completed??[],shared:old?.shared??[],handledAt:old?.handledAt??0n,completedAt:old?.completedAt??'{}'}
  if(old)tx.db.carePlan.id.update(row);else tx.db.carePlan.insert(row)
  return JSON.stringify({status:'generate',id,started:row.started.toString(),evidence,trip,recordsAvailable})
 }
 return JSON.stringify({status:settled})
}))
export const finishPlan=db.procedure({id:t.string(),started:t.u64(),output:t.string(),failure:t.string()},t.string(),(ctx,args)=>ctx.withTx(tx=>{
 if(ctx.sender.toHexString()!==aiServiceIdentity)throw new SenderError('Service authorization required.')
 const row=tx.db.carePlan.id.find(args.id),m=row?tx.db.membership.identity.find(row.owner):undefined
 if(!row||!m||m.familyId!==row.familyId)throw new SenderError('Access revoked.')
 if(row.started!==args.started||row.status!=='preparing')return 'superseded'
 const connection=tx.db.recordConnection.owner.find(row.owner)
 if((connection?.revision??0n)!==row.revision||((JSON.parse(row.evidence) as Evidence[]).some(e=>e.category!=='Trip')&&!['ready','partial','empty'].includes(connection?.status??''))||tx.timestamp.microsSinceUnixEpoch-row.started>90000000n){tx.db.carePlan.id.update({...row,status:'failed'});return 'superseded'}
 if(args.failure){tx.db.carePlan.id.update({...row,status:'failed'});return 'failed'}
 try{const plan=validatePlan(JSON.parse(checkedText(args.output,12000)),JSON.parse(row.evidence),row.kind==='trip');tx.db.carePlan.id.update({...row,status:'ready',summary:plan.summary,plan:JSON.stringify(plan),generatedAt:tx.timestamp.microsSinceUnixEpoch});return 'ready'}catch{tx.db.carePlan.id.update({...row,status:'failed'});return 'invalid-evidence'}
}))
function ownPlan(ctx:Ctx,id:string){const m=member(ctx),row=ctx.db.carePlan.id.find(id);if(!row||row.owner!==m.identity||row.familyId!==m.familyId)throw new SenderError('Plan unavailable.');return {m,row}}
function currentPlan(ctx:Ctx,row:ReturnType<Ctx['db']['carePlan']['insert']>){
 const connection=ctx.db.recordConnection.owner.find(row.owner),evidence=JSON.parse(row.evidence) as Evidence[]
 if(evidence.some(e=>e.category!=='Trip')&&(!connection||!['ready','partial','empty'].includes(connection.status)))throw new SenderError('Reconnect records first.')
 if(evidence.some(e=>{const r=ctx.db.record.id.find(e.id);return !r||r.owner!==row.owner||r.text!==e.text}))throw new SenderError('The source changed. Review your current records first.')
 return JSON.parse(row.plan) as Plan
}
export const updatePlan=db.reducer({id:t.string(),action:t.string()},(ctx,{id,action})=>{
 const {row}=ownPlan(ctx,id),now=ctx.timestamp.microsSinceUnixEpoch
 if(action==='dismiss'){ctx.db.carePlan.id.update({...row,status:'dismissed',dismissedAt:now});for(const r of ctx.db.reminder.owner.filter(row.owner))if((r.id.startsWith(`plan-reminder:${row.id}:`)||r.id.startsWith(`auto-care:${row.id}:`))&&['due','scheduled'].includes(r.status))ctx.db.reminder.id.update({...r,status:'cancelled'});return}
 if(action==='review'){ctx.db.carePlan.id.update({...row,reviewedAt:row.reviewedAt||now});return}
 if(action!=='activate'||!['ready','active'].includes(row.status))throw new SenderError('Plan not ready.')
 currentPlan(ctx,row);ctx.db.carePlan.id.update({...row,status:'active',reviewedAt:row.reviewedAt||now})
})
export const completePlanStep=db.reducer({id:t.string(),kind:t.string()},(ctx,{id,kind})=>{
 const {row}=ownPlan(ctx,id)
 if(!['ready','active','handled'].includes(row.status))throw new SenderError('Plan not ready.')
 const plan=currentPlan(ctx,row)
 if(row.completed.includes(kind))return
 if(!plan.items.some(i=>i.kind===kind))throw new SenderError('Step unavailable.')
 const completed=[...new Set([...row.completed,kind])].filter(k=>plan.items.some(i=>i.kind===k))
 const completedAt=JSON.parse(row.completedAt) as Record<string,string>;if(!completedAt[kind])completedAt[kind]=ctx.timestamp.toISOString()
 ctx.db.carePlan.id.update({...row,completed,completedAt:JSON.stringify(completedAt),handledAt:completed.length===plan.items.length?ctx.timestamp.microsSinceUnixEpoch:0n,status:completed.length===plan.items.length?'handled':'active'})
 for(const r of ctx.db.reminder.owner.filter(row.owner))if((r.id===`auto-care:${row.id}:${kind}`||completed.length===plan.items.length&&r.id.startsWith(`auto-care:${row.id}:`))&&['scheduled','due'].includes(r.status))ctx.db.reminder.id.update({...r,status:'dismissed'})
 const reminder=ctx.db.reminder.id.find(`plan-reminder:${row.id}:${kind}`);if(reminder&&['due','scheduled'].includes(reminder.status))ctx.db.reminder.id.update({...reminder,status:'dismissed'})
})
export const sharePlanStep=db.reducer({id:t.string(),kind:t.string(),approve:t.bool(),includeSource:t.bool()},(ctx,{id,kind,approve,includeSource})=>{
 const {m,row}=ownPlan(ctx,id)
 if(row.shared.includes(kind))return
 if(!['ready','active'].includes(row.status))throw new SenderError('Plan unavailable.')
 const plan=currentPlan(ctx,row),item=plan.items.find(i=>i.kind===kind)
 if(!item)throw new SenderError('Step unavailable.')
 const preference=ctx.db.sharingPreference.owner.find(m.identity)
 if((!preference||preference.familyId!==m.familyId||preference.mode==='ask')&&!approve)throw new SenderError('Review the family handoff first.')
 if(includeSource&&!(preference?.familyId===m.familyId&&preference.mode==='summaries')&&!approve)throw new SenderError('Approve the selected source before sharing.')
 // Send exactly the request and optional immutable excerpt previewed by the user.
 const title=steps[item.kind],taskId=`plan-task:${row.id}:${kind}`
 if(!ctx.db.task.id.find(taskId)){
  ctx.db.task.insert({id:taskId,familyId:m.familyId,title,owner:'',ownerName:'',status:'open',creator:m.identity,declined:[],created:ctx.timestamp.microsSinceUnixEpoch,updated:ctx.timestamp.microsSinceUnixEpoch})
  const source=(JSON.parse(row.evidence) as Evidence[]).find(e=>e.id===item.recordId)!
  const text=`Please help me: ${title}.`+(includeSource?`\n\n${source.category}: ${item.quote} (Record date: ${source.date??'unknown'})`:'')
  post(ctx,m,'family',text,m.name,[],true)
 }
 ctx.db.carePlan.id.update({...row,status:'active',reviewedAt:row.reviewedAt||ctx.timestamp.microsSinceUnixEpoch,shared:[...row.shared,kind]})
})
export const remindPlanStep=db.reducer({id:t.string(),kind:t.string(),dueAt:t.u64()},(ctx,args)=>{
 const {row,m}=ownPlan(ctx,args.id),plan=currentPlan(ctx,row),item=plan.items.find(i=>i.kind===args.kind)
 if(!item||!['ready','active'].includes(row.status))throw new SenderError('Step unavailable.')
 if(args.dueAt<=ctx.timestamp.microsSinceUnixEpoch||args.dueAt>ctx.timestamp.microsSinceUnixEpoch+366n*86400000000n)throw new SenderError('Choose a future reminder time.')
 const id=`plan-reminder:${row.id}:${args.kind}`
 const old=ctx.db.reminder.id.find(id),value={id,owner:m.identity,title:steps[item.kind],dueAt:args.dueAt,status:'scheduled',created:old?.created??ctx.timestamp.microsSinceUnixEpoch}
 if(old)ctx.db.reminder.id.update(value);else ctx.db.reminder.insert(value)
 const automatic=ctx.db.reminder.id.find(`auto-care:${row.id}:${args.kind}`)
 if(automatic&&['scheduled','due'].includes(automatic.status))ctx.db.reminder.id.update({...automatic,status:'cancelled'})
 ctx.db.carePlan.id.update({...row,status:'active',reviewedAt:row.reviewedAt||ctx.timestamp.microsSinceUnixEpoch})
})

export const myAutoCarePreference=db.view({public:true},t.array(autoCarePreference.rowType),ctx=>scoped(ctx)?[ctx.db.autoCarePreference.owner.find(ctx.sender.toHexString())].filter((p):p is NonNullable<typeof p>=>!!p):[])
export const setAutoCare=db.reducer({enabled:t.bool()},(ctx,{enabled})=>{
 const m=member(ctx),value={owner:m.identity,enabled};if(ctx.db.autoCarePreference.owner.find(m.identity))ctx.db.autoCarePreference.owner.update(value);else ctx.db.autoCarePreference.insert(value)
 if(enabled)syncAutoCare(ctx)
 if(!enabled)for(const r of ctx.db.reminder.owner.filter(m.identity))if(r.id.startsWith('auto-care:')&&['due','scheduled'].includes(r.status))ctx.db.reminder.id.update({...r,status:'cancelled'})
})
function syncAutoCare(ctx:Ctx){
 const m=member(ctx),now=Number(ctx.timestamp.microsSinceUnixEpoch/1000n)
 for(const r of ctx.db.reminder.owner.filter(m.identity))if(r.id.startsWith('auto-care:')&&['scheduled','due'].includes(r.status)){
 if(r.id.startsWith('auto-care:family-visit:')){const v=ctx.db.familyVisit.id.find(r.id.slice('auto-care:family-visit:'.length));if(!v||v.familyId!==m.familyId||v.patient!==m.identity||v.status!=='confirmed-demo'||Date.parse(v.slot)<=now)ctx.db.reminder.id.update({...r,status:'cancelled'});continue}
 if(r.id.startsWith('auto-care:visit:')){const brief=ctx.db.carePreparation.owner.find(m.identity);if(!brief||brief.dismissed||brief.status!=='ready'||!careDue(ctx.timestamp.toISOString()))ctx.db.reminder.id.update({...r,status:'cancelled'});continue}
 const row=[...ctx.db.carePlan.owner.filter(m.identity)].find(p=>r.id.startsWith(`auto-care:${p.id}:`))
 let valid=!!row&&['ready','active'].includes(row.status)
 if(row&&valid){try{currentPlan(ctx,row);const kind=r.id.slice(`auto-care:${row.id}:`.length),task=ctx.db.task.id.find(`plan-task:${row.id}:${kind}`);if(task&&['completed','cancelled'].includes(task.status))valid=false;if(r.id.endsWith(':safe-water')){const trip=(JSON.parse(row.evidence) as Evidence[]).find(e=>e.category==='Trip');valid=!!trip?.date&&now<Date.parse(trip.date)+7*86400000}}catch{valid=false}}
 if(!valid)ctx.db.reminder.id.update({...r,status:'cancelled'})
 }
 if(!ctx.db.autoCarePreference.owner.find(m.identity)?.enabled)return
 for(const v of ctx.db.familyVisit.familyId.filter(m.familyId))if(v.patient===m.identity&&v.status==='confirmed-demo'&&Date.parse(v.slot)>now){const id=`auto-care:family-visit:${v.id}`,due=Math.max(now+3600000,Date.parse(v.slot)-86400000);if(!ctx.db.reminder.id.find(id)&&due<Date.parse(v.slot))ctx.db.reminder.insert({id,owner:m.identity,title:'Prepare your questions for the family-arranged demo visit',dueAt:BigInt(due)*1000n,status:'scheduled',created:ctx.timestamp.microsSinceUnixEpoch})}
 const brief=ctx.db.carePreparation.owner.find(m.identity)
 if(brief&&brief.status==='ready'&&!brief.dismissed&&careDue(ctx.timestamp.toISOString())){
 const id=`auto-care:visit:${brief.appointmentId}`
 if(!ctx.db.reminder.id.find(id)){const visit=Date.parse(brief.appointmentDate),due=Math.max(now+3600000,visit-86400000);if(due<visit)ctx.db.reminder.insert({id,owner:m.identity,title:'Gather your questions and records for your visit',dueAt:BigInt(due)*1000n,status:'scheduled',created:ctx.timestamp.microsSinceUnixEpoch})}
 }
 for(const row of ctx.db.carePlan.owner.filter(m.identity)){
  if(!['ready','active'].includes(row.status))continue
  let plan:Plan;try{plan=currentPlan(ctx,row)}catch{continue}
  const evidence=JSON.parse(row.evidence) as Evidence[],trip=evidence.find(e=>e.category==='Trip')
  const sharing=ctx.db.sharingPreference.owner.find(m.identity)
  if(row.kind==='follow-up'&&!row.shared.length&&sharing&&sharing.familyId===m.familyId&&sharing.mode!=='ask'&&[...ctx.db.membership.familyId.filter(m.familyId)].length>1){
   const item=plan.items.find(i=>['meals','logs','supplies'].includes(i.kind)&&!row.completed.includes(i.kind))
   if(item){const id=`plan-task:${row.id}:${item.kind}`,title=steps[item.kind];if(!ctx.db.task.id.find(id)){ctx.db.task.insert({id,familyId:m.familyId,title,owner:'',ownerName:'',status:'open',creator:m.identity,declined:[],created:ctx.timestamp.microsSinceUnixEpoch,updated:ctx.timestamp.microsSinceUnixEpoch});post(ctx,m,'family',`Please help me: ${title}.`,m.name,[],true)}ctx.db.carePlan.id.update({...row,shared:[item.kind]})}
  }
  for(const item of plan.items){
   const task=ctx.db.task.id.find(`plan-task:${row.id}:${item.kind}`)
   if(!item.remind||row.completed.includes(item.kind)||task?.status==='completed'||task?.status==='cancelled'||ctx.db.reminder.id.find(`plan-reminder:${row.id}:${item.kind}`))continue
   const id=`auto-care:${row.id}:${item.kind}`;if(ctx.db.reminder.id.find(id))continue
   const due=preparationTime(trip?.date??null,now);if(due<=now)continue
   ctx.db.reminder.insert({id,owner:m.identity,title:steps[item.kind],dueAt:BigInt(due)*1000n,status:'scheduled',created:ctx.timestamp.microsSinceUnixEpoch})
  }
  if(trip?.date&&plan.guidance?.includes('safe-water')&&guidanceFor(evidence).some(g=>g.id==='safe-water')){
   const id=`auto-care:${row.id}:safe-water`;if(ctx.db.reminder.id.find(id))continue
   const start=Date.parse(trip.date),due=Math.max(start,now+3600000);if(due>=start+7*86400000)continue
   ctx.db.reminder.insert({id,owner:m.identity,title:'Do you have safe drinking water available today?',dueAt:BigInt(due)*1000n,status:'scheduled',created:ctx.timestamp.microsSinceUnixEpoch})
  }
 }
}

export const familyVisits=db.view({public:true},t.array(familyVisit.rowType),ctx=>{const m=scoped(ctx);return m?[...ctx.db.familyVisit.familyId.filter(m.familyId)].filter(v=>ctx.db.membership.identity.find(v.patient)?.familyId===m.familyId):[]})
export const familyEmergencyCards=db.view({public:true},t.array(emergencyCard.rowType),ctx=>{const m=scoped(ctx);return m?[...ctx.db.emergencyCard.familyId.filter(m.familyId)].filter(c=>ctx.db.membership.identity.find(c.owner)?.familyId===m.familyId):[]})
export const confirmFamilyVisit=db.reducer({requestId:t.string(),patient:t.string(),slot:t.string()},(ctx,args)=>{
 const m=member(ctx),patient=ctx.db.membership.identity.find(args.patient)
 if(!patient||patient.familyId!==m.familyId)throw new SenderError('Family member unavailable.')
 if(!once(ctx,args.requestId,'family-visit',args))return
 if(![...demoSlots,'2026-10-18T15:00:00Z','2026-10-19T15:00:00Z','2026-10-20T15:00:00Z'].includes(args.slot)||Date.parse(args.slot)<=Number(ctx.timestamp.microsSinceUnixEpoch/1000n))throw new SenderError('Demo slot unavailable.')
 if(ctx.db.booking.slot.find(args.slot)?.status==='confirmed-demo'||[...ctx.db.familyVisit.slot.filter(args.slot)].some(v=>v.status==='confirmed-demo'))throw new SenderError('This demo slot was taken. Choose another.')
 ctx.db.familyVisit.insert({id:args.requestId,familyId:m.familyId,patient:patient.identity,patientName:patient.name,organizer:m.identity,organizerName:m.name,slot:args.slot,status:'confirmed-demo',created:ctx.timestamp.microsSinceUnixEpoch})
 post(ctx,m,'family',`${m.name} reserved a synthetic primary-care visit for ${patient.name}: ${args.slot}. Demo Community Clinic. No real provider was contacted.`,m.name,[],true)
 const due=Math.max(Number(ctx.timestamp.microsSinceUnixEpoch/1000n)+3600000,Date.parse(args.slot)-86400000)
 if(ctx.db.autoCarePreference.owner.find(patient.identity)?.enabled&&due<Date.parse(args.slot))ctx.db.reminder.insert({id:`auto-care:family-visit:${args.requestId}`,owner:patient.identity,title:'Prepare your questions for the family-arranged demo visit',dueAt:BigInt(due)*1000n,status:'scheduled',created:ctx.timestamp.microsSinceUnixEpoch})
})
export const cancelFamilyVisit=db.reducer({id:t.string()},(ctx,{id})=>{
 const m=member(ctx),v=ctx.db.familyVisit.id.find(id);if(!v||v.familyId!==m.familyId||![v.patient,v.organizer].includes(m.identity))throw new SenderError('Visit unavailable.')
 if(v.status==='cancelled')return
 ctx.db.familyVisit.id.update({...v,status:'cancelled'});const r=ctx.db.reminder.id.find(`auto-care:family-visit:${id}`);if(r)ctx.db.reminder.id.update({...r,status:'cancelled'})
 post(ctx,m,'family',`Cancelled the synthetic visit for ${v.patientName}.`,m.name,[],true)
})
export const publishEmergencyCard=db.reducer({data:t.string()},(ctx,{data})=>{
 const m=member(ctx);let value:unknown;try{value=JSON.parse(checkedText(data,6000))}catch{throw new SenderError('Invalid card.')}
 const fields=['bloodType','allergies','medications','conditions','contact','notes']
 const card=value as Record<string,unknown>;if(!card||Array.isArray(card)||typeof card!=='object'||Object.keys(card).some(k=>!fields.includes(k))||fields.some(k=>typeof card[k]!=='string'||(card[k] as string).length>800))throw new SenderError('Invalid card fields.')
 const blood=card.bloodType as string;if(!['','Unknown','A+','A-','B+','B-','AB+','AB-','O+','O-'].includes(blood))throw new SenderError('Invalid blood type.')
 const row={owner:m.identity,familyId:m.familyId,name:m.name,data:JSON.stringify(card),reviewedAt:ctx.timestamp.microsSinceUnixEpoch}
 if(ctx.db.emergencyCard.owner.find(m.identity))ctx.db.emergencyCard.owner.update(row);else ctx.db.emergencyCard.insert(row)
})
export const unpublishEmergencyCard=db.reducer(ctx=>{const m=member(ctx);const c=ctx.db.emergencyCard.owner.find(m.identity);if(c?.familyId===m.familyId)ctx.db.emergencyCard.owner.delete(m.identity)})
