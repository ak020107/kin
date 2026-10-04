import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {DbConnection} from '../src/module_bindings'
const clients:DbConnection[]=[]
const delay=(ms=30)=>new Promise(r=>setTimeout(r,ms))
async function until(check:()=>boolean){const end=Date.now()+8000;while(!check()){if(Date.now()>end)throw Error('Family subscription timed out');await delay()}}
async function connect(token?:string){let saved='';const c=await new Promise<DbConnection>((resolve,reject)=>{DbConnection.builder().withUri('ws://127.0.0.1:3000').withDatabaseName('kin-local').withToken(token).onConnect((c,_id,t)=>{saved=t;c.subscriptionBuilder().onApplied(()=>resolve(c)).onError(()=>reject(Error('Subscription failed'))).subscribe(['SELECT * FROM my_membership','SELECT * FROM my_records','SELECT * FROM visible_messages','SELECT * FROM family_tasks'])}).onConnectError((_c,e)=>reject(e)).build()});clients.push(c);return {c,token:token??saved}}
const messages=(c:DbConnection)=>[...c.db.visibleMessages.iter()]
const tasks=(c:DbConnection)=>[...c.db.familyTasks.iter()]
const me=(c:DbConnection)=>[...c.db.myMembership.iter()][0]
try{
 const d=await connect(),a=await connect(),m=await connect(),o=await connect()
 await d.c.reducers.createFamily({name:'Daniel'})
 for(const [name,c] of [['Alex',a.c]] as const){const code=randomUUID().replaceAll('-','')+randomUUID().replaceAll('-','');await d.c.reducers.createInvite({name,code});await c.reducers.joinFamily({code})}
 const msg={requestId:randomUUID(),text:'I will take you.'}
 await a.c.reducers.postFamilyMessage(msg);await a.c.reducers.postFamilyMessage(msg)
 await until(()=>messages(d.c).length===1&&messages(a.c).length===1)
 assert.equal(messages(d.c)[0].author,'Alex');assert.equal(messages(d.c)[0].mode,'human');assert(messages(d.c)[0].created>0n);assert.equal(messages(d.c).filter(r=>r.author==='Kin companion').length,0)
 await assert.rejects(o.c.reducers.postFamilyMessage({requestId:randomUUID(),text:'Outsider'}))
 console.log('PASS Human messages sync once across separate sessions without an AI reply')
 const own=[...d.c.db.myRecords.iter()][0]
 await assert.rejects(d.c.reducers.shareSummary({requestId:randomUUID(),recordIds:[own.id],excerpts:['Changed medical quote'],note:''}))
 await d.c.reducers.shareSummary({requestId:randomUUID(),recordIds:[own.id],excerpts:[own.text],note:'My own question'})
 await until(()=>messages(a.c).some(r=>r.shared))
 const snapshot=messages(a.c).find(r=>r.shared)!
 assert(snapshot.text.includes('Personal note:'));assert.equal(snapshot.sourceIds.length,0)
 const laterInvite=randomUUID().replaceAll('-','')+randomUUID().replaceAll('-','')
 await d.c.reducers.createInvite({name:'Maya',code:laterInvite});await m.c.reducers.joinFamily({code:laterInvite})
 await until(()=>messages(m.c).some(r=>r.shared))
 assert.equal(messages(m.c).find(r=>r.shared)!.text,snapshot.text)
 console.log('PASS Later members receive earlier group history, as disclosed')
 console.log('PASS Changed quotes rejected and personal notes separated from approved evidence')
 const transport={requestId:randomUUID(),title:'Arrange transport'}
 const questions={requestId:randomUUID(),title:'Prepare my questions'}
 await d.c.reducers.createTask(transport);await d.c.reducers.createTask(transport);await d.c.reducers.createTask(questions)
 await until(()=>tasks(a.c).length===2)
 const claims=await Promise.allSettled([a.c.reducers.claimTask({id:transport.requestId}),m.c.reducers.claimTask({id:transport.requestId})])
 assert.equal(claims.filter(r=>r.status==='fulfilled').length,1)
 await until(()=>tasks(d.c).find(t=>t.id===transport.requestId)?.status==='accepted')
 const winner=tasks(d.c).find(t=>t.id===transport.requestId)!.owner===me(a.c).identity?a.c:m.c
 await winner.reducers.claimTask({id:transport.requestId});assert.equal(tasks(d.c).length,2)
 await a.c.reducers.declineTask({id:questions.requestId});await a.c.reducers.declineTask({id:questions.requestId})
 await assert.rejects(a.c.reducers.claimTask({id:questions.requestId}))
 await m.c.reducers.claimTask({id:questions.requestId})
 await winner.reducers.completeTask({id:transport.requestId});await winner.reducers.completeTask({id:transport.requestId})
 await d.c.reducers.cancelTask({id:questions.requestId});await d.c.reducers.cancelTask({id:questions.requestId})
 await until(()=>tasks(a.c).some(t=>t.status==='cancelled'))
 await assert.rejects(m.c.reducers.completeTask({id:questions.requestId}))
 assert.equal(messages(d.c).filter(r=>r.text.startsWith('Marked coordination complete:')).length,1)
 const reconnect=await connect(d.token)
 assert.equal(me(reconnect.c).identity,me(d.c).identity);assert.equal(tasks(reconnect.c).length,2)
 assert.equal(messages(reconnect.c).find(r=>r.shared)!.text,snapshot.text)
 console.log('PASS Multiple flexible requests, atomic acceptance, repeated clicks, decline, cancellation and durable state')
 const oldLength=messages(a.c).length
 await d.c.reducers.revokeMember({identity:me(a.c).identity})
 await until(()=>messages(a.c).length===0&&tasks(a.c).length===0&&[...a.c.db.myRecords.iter()].length===0)
 assert(oldLength>0)
 console.log('PASS Revocation clears family and private cached rows')
}finally{clients.forEach(c=>c.disconnect())}
