import assert from 'node:assert/strict'
import {connectSandbox} from '../server/finch'
import {normalizeEnvelope} from '../spacetimedb/spacetimedb/src/finch'
import type {DbConnection} from '../src/module_bindings'
const original=globalThis.fetch
const baseRecord={resourceType:'Observation',sourceRecordId:'Observation/lab-1',id:'lab-1',name:'HbA1c',value:7.2,unit:'%',date:'2026-09-01'}
const link={owner:'synthetic-owner',person:'Daniel',revision:'2',sessionId:'existing-session',subject:'u_synthetic',scenario:'baseline-adult',requestId:'existing-request'}
const caller={procedures:{beginSandbox:async()=>JSON.stringify(link)}} as unknown as DbConnection
let payload='',commits=0,pageCalls=0
const service={procedures:{finishSandbox:async(args:{status:string;payload:string})=>{commits++;payload=args.payload;return args.status}}} as unknown as DbConnection
try{
 globalThis.fetch=async(input)=>{const url=String(input);let body:unknown
 if(url.endsWith('/app'))body={environment:'sandbox',categories:['labs']}
 else if(url.endsWith('/records'))body={synthetic:true,environment:'sandbox',data:{labs:[]},meta:{availableCategories:['labs'],syncStatus:'complete'}}
 else if(url.includes('/records/labs')){pageCalls++;body={data:[{...baseRecord,id:pageCalls===1?'lab-1':'lab-2',sourceRecordId:'Observation/lab-'+pageCalls}],hasMore:pageCalls===1,nextCursor:pageCalls===1?'opaque-cursor':null,meta:{changeCursor:'changes'}}}
 else throw Error('Unexpected request')
 return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}})
 }
 assert.equal(await connectSandbox(caller,service,{requestId:'test',scenario:'baseline-adult'}),'ready');assert.equal(pageCalls,2);assert.equal(commits,1)
 const normalized=normalizeEnvelope(JSON.parse(payload),'baseline-adult',link.subject,'now','sandbox');assert.equal(normalized.records.length,2);assert(normalized.records.every(r=>JSON.parse(r.provenance).provider==='FinchNode sandbox'));assert(normalized.records[0].text.includes('7.2'));assert(normalized.records[0].text.includes('%'))
 console.log('PASS Sandbox adapter imports complete cursor pages, preserves clinical fields and records sandbox provenance')
}finally{globalThis.fetch=original}
