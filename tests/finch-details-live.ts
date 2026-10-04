import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {DbConnection} from '../src/module_bindings'
import {validateAnswer,renderAnswer} from '../spacetimedb/spacetimedb/src/grounding'
const history=[{messageId:'1',author:'Alex',text:'3 pm'}]
const reply={intent:'reminder',reply:'Alex mentioned 3 PM. Which day is that, and how early would you like a reminder?',references:[{messageId:'1',quote:'3 pm'}],findings:[],missing:[],taskProposal:'none'}
assert(renderAnswer(validateAnswer(reply,[],history),[],'family').includes('cannot send notifications'))
assert.throws(()=>validateAnswer({...reply,references:[{messageId:'private-message',quote:'Secret'}]},[],history))
assert.throws(()=>validateAnswer({...reply,reply:"I'll remind you."},[],history))
assert.throws(()=>validateAnswer({...reply,missing:['bloodType']},[],history))
console.log('PASS Conversation references verified; irrelevant clinical lists and unsupported action claims rejected')
const clients:DbConnection[]=[]
async function connect(){let token='';const c=await new Promise<DbConnection>((resolve,reject)=>DbConnection.builder().withUri('ws://127.0.0.1:3000').withDatabaseName('kin-local').onConnect((c,_id,t)=>{token=t;c.subscriptionBuilder().onApplied(()=>resolve(c)).subscribe(['SELECT * FROM visible_messages'])}).onConnectError((_c,e)=>reject(e)).build());clients.push(c);return {c,token}}
try{
 const d=await connect();await d.c.reducers.createFamily({name:'Daniel'});assert.equal(await d.c.procedures.refreshRecords({scenario:'baseline-adult'}),'ready')
 for(const text of ['Show my documented Hemoglobin A1c lab results with their values, units and dates','Show my readable clinical note','What source appointment is documented?']){
  const response=await fetch('http://127.0.0.1:3001/companion',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${d.token}`},body:JSON.stringify({requestId:randomUUID(),audience:'private',text})})
  assert.equal(response.status,200,JSON.stringify(await response.json()));await new Promise(r=>setTimeout(r,100));const answer=[...d.c.db.visibleMessages.iter()].at(-1)!
  assert.equal(answer.mode,'gemini');assert(answer.evidence);const citations=JSON.parse(answer.evidence!) as {category:string;text:string;date:string|null}[]
  if(text.includes('A1c')){assert(citations.some(e=>e.category==='Lab result'));assert(citations.filter(e=>e.category==='Lab result').every(e=>e.date&&e.text.length>0));assert(/A1c|hemoglobin/i.test(answer.text));assert(/\d/.test(answer.text))}
  if(text.includes('note'))assert(citations.some(e=>e.category==='Clinical note'&&e.text.includes('SYNTHETIC CLINICAL NOTE')))
  if(text.includes('appointment'))assert(citations.some(e=>e.category==='Appointment record'));assert(!answer.text.includes('An upcoming appointment is not established'))
 }
 console.log('PASS Live Gemini uses expanded FinchNode labs, readable clinical note and source appointment with validated citations')
}finally{clients.forEach(c=>c.disconnect())}
