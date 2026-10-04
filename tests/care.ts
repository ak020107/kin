import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {DbConnection} from '../src/module_bindings'
import {careDue,demoAppointment,validateCareAnswer,appointmentEvidence} from '../spacetimedb/spacetimedb/src/care'
import type {Evidence} from '../spacetimedb/spacetimedb/src/grounding'
const clients:DbConnection[]=[]
const delay=(ms=40)=>new Promise(r=>setTimeout(r,ms))
async function until(test:()=>boolean){const end=Date.now()+10000;while(!test()){if(Date.now()>end)throw Error('Preparation subscription did not settle');await delay()}}
async function connect(token?:string){let issued='';const c=await new Promise<DbConnection>((resolve,reject)=>{DbConnection.builder().withUri('ws://127.0.0.1:3000').withDatabaseName('kin-local').withToken(token).onConnect((c,_id,t)=>{issued=t;c.subscriptionBuilder().onApplied(()=>resolve(c)).subscribe(['SELECT * FROM my_membership','SELECT * FROM my_records','SELECT * FROM my_care_preparation','SELECT * FROM visible_messages','SELECT * FROM family_tasks'])}).onConnectError((_ctx,e)=>reject(e)).build()});clients.push(c);return {c,token:token??issued}}
const card=(c:DbConnection)=>[...c.db.myCarePreparation.iter()][0]
const messages=(c:DbConnection)=>[...c.db.visibleMessages.iter()]
const tasks=(c:DbConnection)=>[...c.db.familyTasks.iter()]
function answer(evidence:Evidence[]){const selected=[evidence.find(e=>e.id===demoAppointment.id)!,...evidence.filter(e=>e.category==='Allergies'),...evidence.filter(e=>e.category==='Medications').slice(0,3)];return {findings:selected.map(e=>({recordId:e.id,quote:e.text})),missing:['Medications','Allergies'].filter(cat=>!evidence.some(e=>e.category===cat)).map(cat=>cat==='Medications'?'medications':'allergies'),taskProposal:'prepareQuestions'}}
try{
  assert(!careDue('2026-10-03T14:59:59Z'));assert(careDue('2026-10-03T15:00:00Z'));assert(careDue('2026-10-06T14:59:59Z'));assert(!careDue('2026-10-06T15:00:00Z'));assert(!careDue('invalid'))
  assert.equal(Date.parse(demoAppointment.startsAt)-Date.parse(demoAppointment.triggerAt),72*3600000)
  console.log('PASS Deterministic 72-hour trigger, appointment cutoff, and Chicago demo timestamp')
  const d=await connect(),a=await connect(),outsider=await connect(),service=await connect(JSON.parse(await readFile(new URL('../server/.service-session.local',import.meta.url),'utf8')).token)
  await d.c.reducers.createFamily({name:'Daniel'});const code=randomUUID().replaceAll('-','')+randomUUID().replaceAll('-','');await d.c.reducers.createInvite({code,name:'Alex'});await a.c.reducers.joinFamily({code})
  await assert.rejects(outsider.c.procedures.prepareCare({retry:false}));assert.equal(JSON.parse(await a.c.procedures.prepareCare({retry:false})).status,'not-applicable');assert.equal([...a.c.db.myCarePreparation.iter()].length,0)
  await d.c.procedures.refreshRecords({scenario:''})
  const prepared=JSON.parse(await d.c.procedures.prepareCare({retry:false})) as {status:string;owner:string;generation:string;evidence:Evidence[]}
  assert.equal(prepared.status,'generate');assert.equal(prepared.owner,[...d.c.db.myMembership.iter()][0].identity);assert.equal(JSON.parse(await d.c.procedures.prepareCare({retry:false})).status,'preparing');assert.equal(messages(d.c).length,0);assert.equal(tasks(a.c).length,0);assert.equal([...a.c.db.myCarePreparation.iter()].length,0)
  const complete={owner:prepared.owner,generation:BigInt(prepared.generation),output:JSON.stringify(answer(prepared.evidence)),failure:''}
  await assert.rejects(a.c.procedures.finishCare(complete));await assert.rejects(a.c.reducers.dismissCare({}));assert.equal(await service.c.procedures.finishCare(complete),'ready');await until(()=>card(d.c)?.status==='ready')
  assert(card(d.c).generatedAt>0n);await d.c.reducers.reviewCare({});await until(()=>card(d.c).reviewedAt>0n);const reviewedAt=card(d.c).reviewedAt;await d.c.reducers.reviewCare({});assert.equal(card(d.c).reviewedAt,reviewedAt);
  const generation=card(d.c).generation
  assert.equal(JSON.parse(await d.c.procedures.prepareCare({retry:false})).status,'ready');assert.equal(card(d.c).generation,generation);assert.equal([...d.c.db.myCarePreparation.iter()].length,1)
  const reconnect=await connect(d.token);assert.equal(card(reconnect.c).generation,generation);assert.equal(card(reconnect.c).reviewedAt,reviewedAt);assert.equal(messages(reconnect.c).length,0)
  console.log('PASS One private card, no chat request, no family data before approval, no regenerated card on reconnect')
  const allergy=prepared.evidence.find(e=>e.category==='Allergies')!
  const share={recordIds:[allergy.id],excerpts:[allergy.text],note:'Please help prepare questions.',includeAppointment:false,taskTitle:"Prepare appointment questions"}
  await assert.rejects(a.c.reducers.shareCareBrief(share));await d.c.reducers.shareCareBrief(share);await d.c.reducers.shareCareBrief(share);await until(()=>messages(a.c).length===1&&tasks(a.c).length===1)
  assert(!messages(a.c)[0].text.includes(demoAppointment.display));assert(!messages(a.c)[0].text.includes(prepared.evidence.find(e=>e.category==='Medications')!.text));assert.equal(messages(a.c)[0].sourceIds.length,0);assert.equal([...a.c.db.myCarePreparation.iter()].length,0)
  await a.c.reducers.claimTask({id:tasks(a.c)[0].id});await until(()=>tasks(d.c)[0].ownerName==='Alex'&&tasks(d.c)[0].status==='accepted');assert.equal(card(d.c).taskId,tasks(d.c)[0].id)
  console.log('PASS Approved selection only, appointment withheld, one preparation task, realtime acceptance visible to owner')
  await new Promise<void>((resolve,reject)=>outsider.c.subscriptionBuilder().onApplied(()=>reject(Error('Raw preparation exposed'))).onError(()=>resolve()).subscribe('SELECT * FROM care_preparation'))
  await d.c.procedures.refreshRecords({scenario:'sparse-record'});await until(()=>card(d.c)?.status==='records-changed'&&card(d.c).text==='');await assert.rejects(d.c.reducers.shareCareBrief(share))
  const sparse=JSON.parse(await d.c.procedures.prepareCare({retry:false}));assert.throws(()=>validateCareAnswer({findings:[{recordId:demoAppointment.id,quote:appointmentEvidence.text}],missing:[],taskProposal:'none'},sparse.evidence))
  const sparseAnswer=answer(sparse.evidence);assert.equal(await service.c.procedures.finishCare({owner:sparse.owner,generation:BigInt(sparse.generation),output:JSON.stringify(sparseAnswer),failure:''}),'ready');await until(()=>card(d.c).status==='ready');assert(card(d.c).text.includes('does not mean there are no allergies'));assert.equal(messages(a.c).length,2) // approved snapshot + Alex acceptance only
  console.log('PASS Missing data is explicit; refreshed records invalidate old evidence without changing the approved snapshot')
  await d.c.reducers.dismissCare({});await until(()=>card(d.c).dismissed);assert.equal(JSON.parse(await d.c.procedures.prepareCare({retry:true})).status,'dismissed');const dismissed=await connect(d.token);assert(card(dismissed.c).dismissed);assert(card(dismissed.c).dismissedAt>0n);assert.equal(card(dismissed.c).text,'');assert.equal(tasks(a.c).length,1);assert(card(d.c).handledAt>0n)
  console.log('PASS Dismissal survives reconnect and does not recall already-approved family content')
  const inFlight=await connect();await inFlight.c.reducers.createFamily({name:'Daniel'});await inFlight.c.procedures.refreshRecords({scenario:'sparse-record'});const pending=JSON.parse(await inFlight.c.procedures.prepareCare({retry:false}));await inFlight.c.reducers.dismissCare({});assert.equal(await service.c.procedures.finishCare({owner:pending.owner,generation:BigInt(pending.generation),output:JSON.stringify(answer(pending.evidence)),failure:''}),'dismissed')
  console.log('PASS Dismissal while the AI is running prevents late publication')
  const failed=await connect();await failed.c.reducers.createFamily({name:'Daniel'});await failed.c.procedures.refreshRecords({scenario:'sparse-record'});const first=JSON.parse(await failed.c.procedures.prepareCare({retry:false}));assert.equal(await service.c.procedures.finishCare({owner:first.owner,generation:BigInt(first.generation),output:'',failure:'rate-limited'}),'rate-limited');assert.equal(JSON.parse(await failed.c.procedures.prepareCare({retry:false})).status,'failed');const retry=JSON.parse(await failed.c.procedures.prepareCare({retry:true}));assert(BigInt(retry.generation)>BigInt(first.generation));assert.equal([...failed.c.db.myCarePreparation.iter()].length,1)
  console.log('PASS Provider failure persists with explicit retry and preserves one card')
}finally{clients.forEach(c=>c.disconnect())}
