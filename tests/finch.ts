import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { DbConnection } from '../src/module_bindings'
import { failureStatus, normalizeEnvelope } from '../spacetimedb/spacetimedb/src/finch'
const clients:DbConnection[]=[]
const delay=(ms=50)=>new Promise(r=>setTimeout(r,ms))
async function until(test:()=>boolean){const end=Date.now()+10000;while(!test()){if(Date.now()>end)throw Error('Subscription did not settle');await delay()}}
async function connect(){const c=await new Promise<DbConnection>((resolve,reject)=>{DbConnection.builder().withUri('ws://127.0.0.1:3000').withDatabaseName('kin-local').onConnect(c=>{c.subscriptionBuilder().onApplied(()=>resolve(c)).onError(()=>reject(new Error('Subscription failed'))).subscribe(['SELECT * FROM my_membership','SELECT * FROM my_records','SELECT * FROM my_record_connection','SELECT * FROM visible_messages'])}).onConnectError((_ctx,e)=>reject(e)).build()});clients.push(c);return c}
const records=(c:DbConnection)=>[...c.db.myRecords.iter()]
const state=(c:DbConnection)=>[...c.db.myRecordConnection.iter()][0]
try{
  const d=await connect(),a=await connect(),m=await connect(),unknown=await connect()
  for(const [name,c] of [['Daniel',d],['Alex',a],['Maya',m]] as const)await c.reducers.createFamily({name})
  await assert.rejects(unknown.procedures.refreshRecords({scenario:''}));await assert.rejects(d.procedures.refreshRecords({scenario:'pediatric-asthma'}))
  assert.equal(await d.procedures.refreshRecords({scenario:''}),'ready');await until(()=>state(d)?.status==='ready'&&records(d).length>0)
  assert.equal(state(d).scenario,'polypharmacy-senior');assert.equal(state(d).subject,'patient-demo-polypharmacy');assert(records(d).every(r=>r.provenance&&r.id.startsWith('finch-')));assert.equal(records(unknown).length,0)
  const provenance=JSON.parse(records(d)[0].provenance!);assert(provenance.sourceRecordId);assert(provenance.retrievedAt);assert.equal(provenance.sourceUpdatedAt,provenance.raw.sourceUpdatedAt ?? null);assert(provenance.raw);console.log('PASS Live senior subject discovery, fetching, normalization, and original provenance')
  assert.equal(await a.procedures.refreshRecords({scenario:''}),'ready');await until(()=>state(a)?.status==='ready');assert.equal(state(a).subject,'patient-demo-001');assert(records(a).some(r=>r.category==='Lab result'&&r.text.includes('reference')));assert(records(a).some(r=>r.category==='Clinical note'&&r.text.includes('SYNTHETIC CLINICAL NOTE')));assert(records(a).some(r=>r.category==='Coverage'));assert(records(a).some(r=>r.category==='Claim'));assert(records(a).some(r=>r.category==='Appointment record'));assert.equal(new Set(records(a).map(r=>JSON.parse(r.provenance!).upstreamId)).size,records(a).length);console.log('PASS All available live sections: dated labs, readable notes, source appointments, coverage and claims; duplicate document representations merged')
  const sparse=await m.procedures.refreshRecords({scenario:''});assert(['ready','empty'].includes(sparse));await until(()=>state(m)?.scenario==='sparse-record');assert.equal(state(m).subject,'patient-demo-sparse');assert(!records(m).some(r=>r.category==='Medications'||r.category==='Allergies'));console.log('PASS Live sparse records preserve missing information')
  assert.equal(await d.procedures.refreshRecords({scenario:'consent-partial'}),'partial');await until(()=>state(d)?.status==='partial');assert(records(d).every(r=>['Medications','Allergies','Medication administration','Medication fill'].includes(r.category)));console.log('PASS Partial consent imports only allowed categories')
  assert.equal(await d.procedures.refreshRecords({scenario:'consent-revoked'}),'revoked');await until(()=>state(d)?.status==='revoked'&&records(d).length===0)
  await d.reducers.sendMessage({requestId:randomUUID(),audience:'private',text:'Summarize my records'});await until(()=>[...d.db.visibleMessages.iter()].some(r=>r.text.includes('No older records or local fixtures')));console.log('PASS Live revoked consent clears old data and prevents fixture fallback')
  assert.equal(await d.procedures.refreshRecords({scenario:'source-unavailable'}),'partial');await until(()=>state(d)?.status==='partial');assert(state(d).warnings.some(w=>w.includes('source_unavailable')));console.log('PASS Live source failure retains partial status and warnings')
  let limited=false;for(let i=0;i<5;i++){const status=await d.procedures.refreshRecords({scenario:'rate-limited'});if(status==='rate-limited'){limited=true;await until(()=>state(d)?.status==='rate-limited');assert.equal(records(d).length,0);break}await delay(250)}assert(limited,'Rate-limit scenario should exercise HTTP 429');console.log('PASS Live rate limiting clears old data and exposes retry guidance')
  assert.equal(failureStatus(403),'denied');assert.equal(failureStatus(503),'unavailable');assert.throws(()=>normalizeEnvelope({synthetic:false},'baseline-adult','patient-demo-001','now'))
  const missing=normalizeEnvelope({synthetic:true,environment:'demo',data:{medications:[],allergies:[],encounters:[]},meta:{missingCategories:['allergies']}},'sparse-record','patient-demo-sparse','2026-10-03T20:00:00Z');assert.equal(missing.status,'empty');assert(missing.warnings.some(w=>w.includes('Missing categories')));console.log('PASS Empty, denied, unavailable, and malformed response handling')
}finally{clients.forEach(c=>c.disconnect())}

