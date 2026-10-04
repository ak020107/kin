import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {DbConnection} from '../src/module_bindings'
const clients:DbConnection[]=[]
const delay=(ms=100)=>new Promise(r=>setTimeout(r,ms))
async function connect(token?:string){let issued='';const c=await new Promise<DbConnection>((resolve,reject)=>DbConnection.builder().withUri('ws://127.0.0.1:3000').withDatabaseName('kin-local').withToken(token).onConnect((c,_id,t)=>{issued=t;c.subscriptionBuilder().onApplied(()=>resolve(c)).subscribe(['SELECT * FROM my_membership','SELECT * FROM my_records','SELECT * FROM my_record_connection','SELECT * FROM my_sandbox_link','SELECT * FROM my_reminders','SELECT * FROM my_bookings'])}).onConnectError((_c,e)=>reject(e)).build());clients.push(c);return {c,token:token??issued}}
try{
 const d=await connect(),a=await connect();await d.c.reducers.createFamily({name:'Daniel'});const code=randomUUID().replaceAll('-','')+randomUUID().replaceAll('-','');await d.c.reducers.createInvite({code,name:'Alex'});await a.c.reducers.joinFamily({code})
 const reminderId=randomUUID(),dueAt=BigInt(Date.now()+1500)*1000n
 await d.c.reducers.createReminder({requestId:reminderId,title:'Bring questions',dueAt});await d.c.reducers.createReminder({requestId:reminderId,title:'Bring questions',dueAt})
 assert.equal([...d.c.db.myReminders.iter()].length,1);assert.equal([...a.c.db.myReminders.iter()].length,0)
 await assert.rejects(a.c.reducers.updateReminder({id:reminderId,action:'dismiss'}));await delay(1600);await d.c.reducers.checkReminders({});assert.equal([...d.c.db.myReminders.iter()][0].status,'due');await d.c.reducers.updateReminder({id:reminderId,action:'dismiss'});await d.c.reducers.checkReminders({});assert.equal([...d.c.db.myReminders.iter()][0].status,'dismissed')
 const again=await connect(d.token);assert.equal([...again.c.db.myReminders.iter()][0].status,'dismissed')
 console.log('PASS Persistent private reminders: timed delivery, dismissal, repeated click and unauthorized access')
 const slot='2026-10-15T15:00:00Z',ids=[randomUUID(),randomUUID()]
 const results=await Promise.allSettled([d.c.reducers.confirmDemoBooking({requestId:ids[0],slot}),a.c.reducers.confirmDemoBooking({requestId:ids[1],slot})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
 const winner=results[0].status==='fulfilled'?d:a,loser=winner===d?a:d,id=winner===d?ids[0]:ids[1]
 await winner.c.reducers.confirmDemoBooking({requestId:id,slot});assert.equal([...winner.c.db.myBookings.iter()].length,1);assert.equal([...loser.c.db.myBookings.iter()].length,0)
 await assert.rejects(loser.c.reducers.cancelDemoBooking({id}));assert([...winner.c.db.myRecords.iter()].some(r=>r.id==='booking-'+id&&r.text.includes('No provider has been contacted')));await winner.c.reducers.cancelDemoBooking({id});assert(![...winner.c.db.myRecords.iter()].some(r=>r.id==='booking-'+id))
 console.log('PASS Human-confirmed synthetic booking, race-safe slots, repeat confirmation, private record and cancellation')
 const requestId=randomUUID()
 const sandbox=async(event?:string)=>{const response=await fetch('http://127.0.0.1:3001/sandbox/connect',{method:'POST',headers:{Authorization:`Bearer ${d.token}`,'Content-Type':'application/json'},body:JSON.stringify({requestId,scenario:'baseline-adult',event})});const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));await delay();return result}
 const initial=await sandbox();const link=[...d.c.db.mySandboxLink.iter()][0],records=[...d.c.db.myRecords.iter()];assert(link.sessionId);if(initial.status==='waiting'){assert.equal(link.status,'waiting');assert.equal(records.length,0);await sandbox();assert.equal([...d.c.db.mySandboxLink.iter()][0].sessionId,link.sessionId);console.log('PASS Account-backed sandbox creates a persistent session; upstream syncing remains waiting, retry reuses it without demo fallback');}else{assert(link.subject.startsWith('u_'));assert(['ready','partial'].includes(link.status));assert(records.some(r=>r.category==='Lab result'));assert(records.every(r=>JSON.parse(r.provenance!).provider==='FinchNode sandbox'));assert.equal([...a.c.db.mySandboxLink.iter()].length,0)
 await assert.rejects(a.c.procedures.finishSandbox({owner:link.owner,revision:link.revision,sessionId:link.sessionId,subject:link.subject,status:'ready',payload:'{}'}))
 await sandbox();assert.equal([...d.c.db.mySandboxLink.iter()][0].subject,link.subject)
 console.log('PASS Account-backed FinchNode sandbox session, synthetic consent flow, paginated records, own subject binding and refresh reuse')
 const response=await fetch('http://127.0.0.1:3001/sandbox/connect',{method:'POST',headers:{Authorization:`Bearer ${d.token}`,'Content-Type':'application/json'},body:JSON.stringify({requestId,scenario:'baseline-adult',event:'consent.revoke'})});await response.json();await delay();assert.equal([...d.c.db.myRecordConnection.iter()][0].status,'revoked');assert.equal([...d.c.db.myRecords.iter()].length,0)
 console.log('PASS Sandbox consent revocation clears imported records without fallback')}
}finally{clients.forEach(c=>c.disconnect())}
