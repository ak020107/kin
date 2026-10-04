import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {DbConnection} from '../src/module_bindings'
import type {Evidence} from '../spacetimedb/spacetimedb/src/grounding'
import {demoAppointment} from '../spacetimedb/spacetimedb/src/care'
const clients:DbConnection[]=[]
async function connect(token?:string){let issued='';const c=await new Promise<DbConnection>((resolve,reject)=>DbConnection.builder().withUri('ws://127.0.0.1:3000').withDatabaseName('kin-local').withToken(token).onConnect((c,_i,t)=>{issued=t;c.subscriptionBuilder().onApplied(()=>resolve(c)).subscribe(['SELECT * FROM my_membership','SELECT * FROM my_sharing_preference','SELECT * FROM my_records','SELECT * FROM visible_messages','SELECT * FROM family_tasks','SELECT * FROM my_care_preparation'])}).onConnectError((_c,e)=>reject(e)).build());clients.push(c);return {c,token:token??issued}}
async function until(check:()=>boolean){const end=Date.now()+8000;while(!check()){if(Date.now()>end)throw Error('Subscription timed out');await new Promise(r=>setTimeout(r,30))}}
const msgs=(c:DbConnection)=>[...c.db.visibleMessages.iter()].filter(m=>m.audience==='family')
try{
 const service=await connect(JSON.parse(await readFile(new URL('../server/.service-session.local',import.meta.url),'utf8')).token)
 for(const mode of ['visits','summaries']){
  const d=await connect(),a=await connect(),outsider=await connect()
  await d.c.reducers.createFamily({name:'Daniel'});const code=randomUUID().replaceAll('-','')+randomUUID().replaceAll('-','');await d.c.reducers.createInvite({code,name:'Alex'});await a.c.reducers.joinFamily({code})
  await assert.rejects(outsider.c.reducers.setSharingPreference({mode}));await assert.rejects(d.c.reducers.sharePreparedVisit({}))
  await d.c.reducers.setSharingPreference({mode});const again=await connect(d.token);assert.equal([...again.c.db.mySharingPreference.iter()][0].mode,mode);assert.equal([...a.c.db.mySharingPreference.iter()].length,0)
  await d.c.procedures.refreshRecords({scenario:'detailed-care-demo'})
  const prepared=JSON.parse(await d.c.procedures.prepareCare({retry:false})) as {owner:string;generation:string;evidence:Evidence[]}
  const selected=prepared.evidence.filter(e=>e.id===demoAppointment.id||e.category==='Allergies'||e.category==='Medications').slice(0,8)
  assert.equal(await service.c.procedures.finishCare({owner:prepared.owner,generation:BigInt(prepared.generation),output:JSON.stringify({findings:selected.map(e=>({recordId:e.id,quote:e.text})),missing:[],taskProposal:'prepareQuestions'}),failure:''}),'ready')
  await Promise.all([d.c.reducers.sharePreparedVisit({}),again.c.reducers.sharePreparedVisit({})]);await until(()=>msgs(a.c).length===1&&[...a.c.db.familyTasks.iter()].length===1);assert.equal(msgs(a.c).length,1);assert.equal([...a.c.db.familyTasks.iter()].length,1)
  const snapshot=msgs(a.c)[0].text;assert(snapshot.includes('Synthetic demo appointment'));assert.equal(snapshot.includes(selected.find(e=>e.category==='Allergies')!.text),mode==='summaries');assert(!snapshot.includes('Personal note:'))
  await a.c.reducers.claimTask({id:[...a.c.db.familyTasks.iter()][0].id});await until(()=>[...d.c.db.familyTasks.iter()][0]?.ownerName==='Alex');assert.equal([...d.c.db.familyTasks.iter()][0].ownerName,'Alex')
  const requestId=randomUUID();const context=JSON.parse(await d.c.procedures.prepareAi({requestId,audience:'private',text:'Summarize my medications'})) as {evidence:Evidence[]}
  const medication=context.evidence.find(e=>e.category==='Medications')!
  await service.c.procedures.finishAi({requestId,output:JSON.stringify({findings:[{recordId:medication.id,quote:medication.text}],missing:[],taskProposal:'none'}),failure:''});await until(()=>[...d.c.db.visibleMessages.iter()].some(m=>m.mode==='gemini'))
  const answer=[...d.c.db.visibleMessages.iter()].find(m=>m.mode==='gemini')!,share={requestId:randomUUID(),messageId:answer.id}
  await assert.rejects(a.c.reducers.shareLatestSummary(share))
  if(mode==='visits')await assert.rejects(d.c.reducers.shareLatestSummary(share))
  else {await d.c.reducers.shareLatestSummary(share);await d.c.reducers.shareLatestSummary(share);await until(()=>msgs(a.c).filter(m=>m.shared).length===2);assert.equal(msgs(a.c).filter(m=>m.shared).length,2)}
  await d.c.reducers.setSharingPreference({mode:'ask'});await assert.rejects(d.c.reducers.sharePreparedVisit({}));await assert.rejects(d.c.reducers.shareLatestSummary({requestId:randomUUID(),messageId:answer.id}));assert.equal(msgs(a.c)[0].text,snapshot)
  await d.c.reducers.revokeMember({identity:[...a.c.db.myMembership.iter()][0].identity});const deadline=Date.now()+8000;while(msgs(a.c).length&&Date.now()<deadline)await new Promise(r=>setTimeout(r,30));assert.equal([...a.c.db.mySharingPreference.iter()].length,0);assert.equal(msgs(a.c).length,0)
  console.log(`PASS ${mode}: saved preference, scoped handoff, concurrent deduplication, family acceptance, summary permission, disabling and revocation`)
 }
}finally{clients.forEach(c=>c.disconnect())}
