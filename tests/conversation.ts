import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {DbConnection} from '../src/module_bindings'
import {validateAnswer,renderAnswer,recordQuestion} from '../spacetimedb/spacetimedb/src/grounding'
const history=[{messageId:'1',author:'Alex',text:'3 pm'}]
const reply={intent:'reminder',reply:'Alex mentioned 3 PM. Which day is that, and how early would you like a reminder?',references:[{messageId:'1',quote:'3 pm'}],findings:[],missing:[],taskProposal:'none'}
assert(renderAnswer(validateAnswer(reply,[],history),[],'family').includes('cannot send notifications'))
assert.throws(()=>validateAnswer({...reply,references:[{messageId:'private-message',quote:'Secret'}]},[],history))
assert.throws(()=>validateAnswer({...reply,reply:"I'll remind you."},[],history))
assert.throws(()=>validateAnswer({...reply,missing:['bloodType']},[],history))
console.log('PASS Conversation references verified; irrelevant clinical lists and unsupported action claims rejected')
assert(recordQuestion('can you show me all of my data'))
assert(recordQuestion('show my health history'))
assert(!recordQuestion('can you remind me about my medication'))
const clients:DbConnection[]=[]
async function connect(){let token='';const c=await new Promise<DbConnection>((resolve,reject)=>DbConnection.builder().withUri('ws://127.0.0.1:3000').withDatabaseName('kin-local').onConnect((c,_id,t)=>{token=t;c.subscriptionBuilder().onApplied(()=>resolve(c)).subscribe(['SELECT * FROM visible_messages'])}).onConnectError((_c,e)=>reject(e)).build());clients.push(c);return {c,token}}
try{
 const d=await connect(),a=await connect()
 await d.c.reducers.createFamily({name:'Daniel'});const code=randomUUID().replaceAll('-','')+randomUUID().replaceAll('-','');await d.c.reducers.createInvite({code,name:'Alex'});await a.c.reducers.joinFamily({code})
 for(const [c,text] of [[d.c,'What time is the appointment?'],[a.c,'3 pm']] as const)await c.reducers.postFamilyMessage({requestId:randomUUID(),text})
 const requestId=randomUUID()
 const response=await fetch('http://127.0.0.1:3001/companion',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${d.token}`},body:JSON.stringify({requestId,audience:'family',text:'@Kin can you remind me'})})
 assert.equal(response.status,200,JSON.stringify(await response.json()))
 await new Promise(r=>setTimeout(r,100))
 const messages=[...d.c.db.visibleMessages.iter()],answer=messages.at(-1)!
 assert.equal(answer.mode,'conversation');assert(/3\s*(?:pm|p.m.)/i.test(answer.text));assert(/day|date/i.test(answer.text));assert(/cannot send notifications/i.test(answer.text));assert(!/blood type|allerg|medication/i.test(answer.text))
 assert.equal(messages.filter(m=>m.author==='Kin companion').length,1)
 console.log('PASS Live Gemini reminder uses Alex’s 3 PM statement, asks for date, and makes no delivery promise')
 const greeting=await fetch('http://127.0.0.1:3001/companion',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${a.token}`},body:JSON.stringify({requestId:randomUUID(),audience:'private',text:'Hi Kin, can you help me organize things?'})})
 assert.equal(greeting.status,200);await new Promise(r=>setTimeout(r,100))
 assert.equal([...a.c.db.visibleMessages.iter()].at(-1)!.mode,'conversation')
 console.log('PASS Ordinary private conversation works without a record connection')
}finally{clients.forEach(c=>c.disconnect())}
