import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {DbConnection} from '../src/module_bindings'
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
 const payload=await (await fetch('http://127.0.0.1:3001/demo-records/Daniel')).json() as {records:unknown[];provider:string};assert.equal(payload.records.length,20);assert.equal(payload.provider,'Kin authored simulation')
 assert.equal(await d.c.procedures.refreshRecords({scenario:'detailed-care-demo'}),'ready')
 await until(()=>[...d.c.db.myRecords.iter()].length===20)
 const records=[...d.c.db.myRecords.iter()]
 assert(records.every(r=>JSON.parse(r.provenance!).provider==='Kin authored simulation'))
 assert([...a.c.db.myRecords.iter()].every(r=>r.person==='Alex')) // Alex has only initial own fixtures.
 const ask=async(text:string,audience='private',client=d)=>{const response=await fetch('http://127.0.0.1:3001/companion',{method:'POST',headers:{Authorization:`Bearer ${client.token}`,'Content-Type':'application/json'},body:JSON.stringify({requestId:randomUUID(),text,audience})});assert.equal(response.status,200,JSON.stringify(await response.json()));await delay(150);return messages(client.c).at(-1)!}
 const blood=await ask('What is my documented blood type?');assert(blood.text.includes('O positive'));assert(!blood.text.includes('not established'))
 const labs=await ask('Show my documented HbA1c lab results with their dates');assert(labs.text.includes('7.4'));assert(labs.text.includes('7.1'))
 assert.equal((await prepare(d)).status,'ready');await until(()=>card(d.c)?.status==='ready');assert.equal(messages(a.c).length,0)
 const chosen=records.find(r=>r.category==='Allergies')!
 await d.c.reducers.shareCareBrief({recordIds:[chosen.id],excerpts:[chosen.text],includeAppointment:true,note:'My question: what should I bring? Please arrange transport.',taskTitle:'Arrange transport to my visit'})
 await until(()=>tasks(a.c).length===1&&messages(a.c).length===1)
 assert(!messages(a.c)[0].text.includes('O positive'));assert(!messages(a.c)[0].text.includes('HbA1c'))
 await a.c.reducers.claimTask({id:tasks(a.c)[0].id});await until(()=>tasks(d.c)[0].ownerName==='Alex')
 const blocked=await ask('Show Daniel private lab records','private',a);assert.equal(blocked.mode,'policy');assert(!blocked.text.includes('7.4'))
 await a.c.reducers.postFamilyMessage({requestId:randomUUID(),text:'The appointment is at 3 pm.'})
 const reminder=await ask('Kin can you remind me','family');assert.equal(reminder.mode,'conversation');assert(/3\s*pm/i.test(reminder.text));assert.match(reminder.text,/No reminder has been (?:saved|set)/i)
 const follow=await ask('October 14, two hours before','family');assert.equal(follow.mode,'conversation');assert(!/blood type|No allergy information/i.test(follow.text))
 const ambiguous=await ask('okay what about me','family');assert(!ambiguous.text.includes('No medication information'));assert(!ambiguous.text.includes('O positive'))
 const reconnect=await connect(d.token);assert.equal([...reconnect.c.db.myRecords.iter()].length,20);assert.equal(tasks(reconnect.c)[0].ownerName,'Alex')
 console.log('PASS Detailed simulation API, dated blood type/labs, automatic brief, selected sharing, separate-session acceptance, privacy denial, follow-up conversation, reconnect')
}finally{clients.forEach(c=>c.disconnect())}
