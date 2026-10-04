import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {DbConnection} from '../src/module_bindings'
import {validateAnswer,renderAnswer} from '../spacetimedb/spacetimedb/src/grounding'
const evidence=[{id:'lab',category:'Lab result',text:'HbA1c 7.4 percent.',date:'2026-09-25'}]
const example={findings:[{recordId:'lab',quote:evidence[0].text}],missing:[],taskProposal:'none',intent:'records',explanations:[{text:'The documented HbA1c is 7.4 percent.',recordIds:['lab']}]}
assert.equal(renderAnswer(validateAnswer(example,evidence),evidence,'private'),example.explanations[0].text)
assert.throws(()=>validateAnswer({...example,explanations:[{text:'A claim',recordIds:['private-other']}]},evidence))
assert.throws(()=>validateAnswer({...example,explanations:[{text:'You should take more medication.',recordIds:['lab']}]},evidence))
const clients:DbConnection[]=[]
async function connect(){return new Promise<{c:DbConnection;token:string}>((resolve,reject)=>DbConnection.builder().withUri('ws://127.0.0.1:3000').withDatabaseName('kin-local').onConnect((c,_i,token)=>{clients.push(c);c.subscriptionBuilder().onApplied(()=>resolve({c,token})).subscribe(['SELECT * FROM visible_messages'])}).onConnectError((_c,e)=>reject(e)).build())}
async function ask(user:Awaited<ReturnType<typeof connect>>,text:string){const response=await fetch('http://127.0.0.1:3001/companion',{method:'POST',headers:{Authorization:`Bearer ${user.token}`,'Content-Type':'application/json'},body:JSON.stringify({requestId:randomUUID(),audience:'private',text})});assert.equal(response.status,200,await response.text());const end=Date.now()+5000;while(Date.now()<end){const rows=[...user.c.db.visibleMessages.iter()];if(rows.at(-1)?.author==='Kin companion'&&rows.at(-2)?.text===text)return rows.at(-1)!;await new Promise(r=>setTimeout(r,40))}throw Error('Answer subscription timeout')}
try{
 const d=await connect(),a=await connect();await d.c.reducers.createFamily({name:'Daniel'});await a.c.reducers.createFamily({name:'Alex'});await d.c.procedures.refreshRecords({scenario:'detailed-care-demo'});await a.c.procedures.refreshRecords({scenario:'detailed-care-demo'})
 const missing=await ask(a,'compare my two HbA1c results');assert(/couldn.t find HbA1c/i.test(missing.text));assert(!/7\.1|7\.4/.test(missing.text));
 const comparison=await ask(d,'Compare my two HbA1c results');assert.equal(comparison.mode,'gemini');assert(/7\.1/.test(comparison.text)&&/7\.4/.test(comparison.text));assert(!comparison.text.includes('Here is the documented information'));assert(JSON.parse(comparison.evidence!).length>=2)
 const explanation=await ask(d,'what does this mean?');assert(!explanation.text.includes('Here is the documented information'));assert(/HbA1c|7\.4|7\.1/i.test(explanation.text));assert.notEqual(explanation.text,comparison.text);assert(/average|three months|3 months/i.test(explanation.text),explanation.text);assert(explanation.text.includes('niddk.nih.gov'))
 const questions=await ask(d,'Help me prepare questions for my doctor about my HbA1c results');assert.equal(questions.mode,'conversation');assert(!questions.proposal);assert(/\?|ask|question/i.test(questions.text),questions.text)
 for(const text of ['what is daniels blood type',"what is Daniel's blood type",'what is Daniel’s blood type']){const reply=await ask(a,text);assert.equal(reply.mode,'policy');assert(/Access denied/.test(reply.text));assert(!reply.text.includes('O positive'))}
 console.log('PASS live explanations, contextual follow-up, useful questions without task gate, exact evidence links and possessive-name privacy')
}finally{clients.forEach(c=>c.disconnect())}
