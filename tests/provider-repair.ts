import assert from 'node:assert/strict'
import {generate,ProviderError} from '../server/gemini'
const originalFetch=globalThis.fetch,key=process.env.GEMINI_API_KEY
process.env.GEMINI_API_KEY='synthetic-unit-test-key'
const context={question:'What is my HbA1c?',person:'Daniel',audience:'private',evidence:[{id:'lab',category:'Lab result',text:'HbA1c 7.4 percent.',date:'2026-09-25'}],history:[],warnings:[]}
const valid={intent:'records',reply:'',references:[],educationSources:[],explanations:[{text:'Your recorded HbA1c is 7.4 percent.',recordIds:['lab']}],findings:[{recordId:'lab',quote:'HbA1c 7.4 percent.'}],missing:[],taskProposal:'none'}
const response=(output:unknown)=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(output)}]}}]}))
try{
 for(const invalid of [{...valid,findings:[{recordId:'private-other',quote:'HbA1c 7.4 percent.'}]},{...valid,explanations:[{text:'Your HbA1c is 5.4 percent.',recordIds:['lab']}]}]){
  const contexts:string[]=[];let calls=0
  globalThis.fetch=async(_url,init)=>{contexts.push(JSON.parse(String(init?.body)).contents[0].parts[0].text);return response(++calls===1?invalid:valid)}
  assert.equal((await generate(context)).explanations?.[0].text,valid.explanations[0].text);assert.equal(calls,2);assert.equal(contexts[0],contexts[1])
 }
 let calls=0
 globalThis.fetch=async()=>{calls++;return response({...valid,findings:[{recordId:'private-other',quote:'HbA1c 7.4 percent.'}]})}
 await assert.rejects(generate(context),e=>e instanceof ProviderError&&e.code==='invalid-evidence');assert.equal(calls,2)
 calls=0;globalThis.fetch=async()=>{calls++;return new Response('{}',{status:429})}
 await assert.rejects(generate(context),e=>e instanceof ProviderError&&e.code==='rate-limited');assert.equal(calls,1)
 console.log('PASS Bounded model repair: unchanged authorized context, fabricated sources and numbers still rejected, two-attempt limit, no quota retry')
}finally{globalThis.fetch=originalFetch;if(key===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=key}
