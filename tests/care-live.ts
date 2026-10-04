import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {DbConnection} from '../src/module_bindings'
import {demoAppointment} from '../spacetimedb/spacetimedb/src/care'
const clients:DbConnection[]=[]
const delay=(ms=40)=>new Promise(r=>setTimeout(r,ms))
async function until(test:()=>boolean){const end=Date.now()+10000;while(!test()){if(Date.now()>end)throw Error('Expected preparation update did not arrive');await delay()}}
async function connect(token?:string){let issued='';const c=await new Promise<DbConnection>((resolve,reject)=>{DbConnection.builder().withUri('ws://127.0.0.1:3000').withDatabaseName('kin-local').withToken(token).onConnect((c,_id,t)=>{issued=t;c.subscriptionBuilder().onApplied(()=>resolve(c)).subscribe(['SELECT * FROM my_membership','SELECT * FROM my_records','SELECT * FROM my_care_preparation','SELECT * FROM visible_messages','SELECT * FROM family_tasks'])}).onConnectError((_ctx,e)=>reject(e)).build()});clients.push(c);return {c,token:token??issued}}
const card=(c:DbConnection)=>[...c.db.myCarePreparation.iter()][0]
const messages=(c:DbConnection)=>[...c.db.visibleMessages.iter()]
const tasks=(c:DbConnection)=>[...c.db.familyTasks.iter()]
async function prepare(client:Awaited<ReturnType<typeof connect>>,retry=false){const response=await fetch('http://127.0.0.1:3001/care-preparation',{method:'POST',headers:{Authorization:`Bearer ${client.token}`,'Content-Type':'application/json'},body:JSON.stringify({retry})});const result=await response.json() as {status:string;code?:string};assert.equal(response.status,200,`Live preparation failed: ${result.code??result.status}`);return result}
try{
  const d=await connect(),a=await connect();await d.c.reducers.createFamily({name:'Daniel'});const code=randomUUID().replaceAll('-','')+randomUUID().replaceAll('-','');await d.c.reducers.createInvite({code,name:'Alex'});await a.c.reducers.joinFamily({code})
  assert.equal((await prepare(d)).status,'ready');await until(()=>card(d.c)?.status==='ready');assert.equal(messages(d.c).length,0);assert.equal(messages(a.c).length,0);assert.equal(tasks(a.c).length,0);assert.equal([...a.c.db.myCarePreparation.iter()].length,0)
  assert(card(d.c).text.includes('Synthetic demo appointment'));assert(card(d.c).text.includes('Sulfonamide'));assert(card(d.c).text.includes('Contrast media'));assert(card(d.c).text.includes('Selected excerpts only'))
  const sourceIds=(JSON.parse(card(d.c).evidence) as {id:string}[]).map(e=>e.id);assert(sourceIds.includes(demoAppointment.id));assert(sourceIds.every(id=>id===demoAppointment.id||[...d.c.db.myRecords.iter()].some(r=>r.id===id)))
  const generation=card(d.c).generation;await prepare(d);const again=await connect(d.token);assert.equal(card(again.c).generation,generation);assert.equal([...again.c.db.myCarePreparation.iter()].length,1)
  console.log('PASS Live Gemini brief appears without a chat request; fetched synthetic evidence, one card on refresh, private until approved')
  const allergy=(JSON.parse(card(d.c).evidence) as {id:string;category:string;text:string}[]).find(e=>e.category==='Allergies')!
  await d.c.reducers.shareCareBrief({recordIds:[allergy.id],excerpts:[allergy.text],note:'Please help prepare questions.',includeAppointment:false,taskTitle:"Prepare appointment questions"});await until(()=>tasks(a.c).length===1&&messages(a.c).length===1);assert(!messages(a.c)[0].text.includes(demoAppointment.display));assert.equal(messages(a.c)[0].sourceIds.length,0)
  await a.c.reducers.claimTask({id:tasks(a.c)[0].id});await until(()=>tasks(d.c)[0].status==='accepted');assert.equal(tasks(d.c)[0].ownerName,'Alex')
  console.log('PASS Live brief selection approved, unselected appointment withheld, family acceptance visible to original user')
  const sparse=await connect();await sparse.c.reducers.createFamily({name:'Daniel'});await sparse.c.procedures.refreshRecords({scenario:'sparse-record'});assert.equal((await prepare(sparse)).status,'ready');await until(()=>card(sparse.c).status==='ready');assert(card(sparse.c).text.includes('does not mean there are no allergies'));assert(card(sparse.c).text.includes('does not mean no medications'))
  await sparse.c.reducers.dismissCare({});assert.equal((await prepare(sparse,true)).status,'dismissed');const dismissed=await connect(sparse.token);assert(card(dismissed.c).dismissed);assert.equal(card(dismissed.c).text,'')
  console.log('PASS Live missing medications/allergies handled honestly; dismissal remains after reconnect and retry')
}finally{clients.forEach(c=>c.disconnect())}
