import assert from 'node:assert/strict'
import {Readable} from 'node:stream'
import type {IncomingMessage,ServerResponse} from 'node:http'
import {handleRequest} from '../server/handler'
async function request(url:string,method='GET',headers:Record<string,string>={}){
  const req=Object.assign(Readable.from([]),{url,method,headers}) as unknown as IncomingMessage
  let status=0,body=''
  const res={writeHead(code:number){status=code},end(value:string){body=value}} as unknown as ServerResponse
  await handleRequest(req,res)
  return {status,body:JSON.parse(body)}
}
assert.equal((await request('/api/health')).status,200)
assert.equal((await request('/api/companion','POST')).status,401)
assert.equal((await request('/api/companion','POST',{origin:'https://unapproved.example'})).status,403)
assert.equal((await request('/api/unknown')).status,404)
assert.equal((await request('/api/kin?kinPath=health')).status,200)
assert.equal((await request('/api/kin?kinPath=demo-records/Thomas')).status,200)
assert.equal((await request('/api/demo-records/Thomas')).status,200)
console.log('Vercel API routing, health, authorization and origin checks passed.')
