import {generatePlan,type PlanContext} from './planner'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { DbConnection } from '../src/module_bindings'
import { config,generate,ProviderError,type ModelContext } from './gemini'
import {connectSandbox} from './finch'
import {syntheticRecords} from './synthetic'
async function serviceToken(){
  if(process.env.KIN_SERVICE_TOKEN)return process.env.KIN_SERVICE_TOKEN
  if(process.env.VERCEL)throw Error('Service identity is not configured')
  return (JSON.parse(await readFile(new URL('./.service-session.local',import.meta.url),'utf8')) as {token:string}).token
}
const allowedOrigins=(process.env.KIN_ALLOWED_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173').split(',').map(s=>s.trim()).filter(Boolean)
async function connect(token:string){return new Promise<DbConnection>((resolve,reject)=>{
  let timeout:ReturnType<typeof setTimeout>
  const connection=DbConnection.builder().withUri(process.env.SPACETIME_URI || 'ws://127.0.0.1:3000').withDatabaseName(process.env.SPACETIME_DATABASE || 'kin-local').withToken(token).onConnect(c=>{clearTimeout(timeout);resolve(c)}).onConnectError(()=>reject(new Error('Session verification failed'))).build()
  timeout=setTimeout(()=>{connection.disconnect();reject(Error('Database unavailable'))},8000);timeout.unref()
})}
const failures:Record<string,string>={unconfigured:'Gemini is not configured yet. Add the API key to the server settings file, then retry.',unavailable:'Gemini is unavailable. Your question is saved; please retry.', 'rate-limited':'Gemini is busy or its quota is reached. Please wait before retrying.', 'invalid-evidence':'The answer did not pass its evidence checks. It was not published. Please retry.'}
export async function handleRequest(req:IncomingMessage & {body?:unknown},res:ServerResponse){
  const requestUrl=new URL(req.url || '/', 'http://kin.internal')
  req.url=(requestUrl.pathname==='/api/kin' && requestUrl.searchParams.has('kinPath') ? '/'+requestUrl.searchParams.get('kinPath') : requestUrl.pathname.replace(/^\/api(?=\/)/,''))
  const send=(status:number,body:unknown)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body))}
  if(req.method==='GET'&&req.url?.startsWith('/demo-records/')){const data=syntheticRecords(req.url.slice('/demo-records/'.length));return send(data?200:404,data??{error:'Unknown synthetic profile'})}
  if(req.url==='/health'&&req.method==='GET'){const settings=await config();return send(200,{configured:!!settings.key,model:settings.model})}
  const sandboxRequest=req.url==='/sandbox/connect'
  const planRequest=req.url==='/care-plan'
  const careRequest=req.url==='/care-preparation'
  if((req.url!=='/companion'&&!careRequest&&!sandboxRequest&&!planRequest)||req.method!=='POST')return send(404,{error:'Not found'})
  if(req.headers.origin&&!allowedOrigins.includes(req.headers.origin))return send(403,{error:'Origin denied'})
  const token=req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1]
  if(!token||token.length>10000)return send(401,{error:'An authenticated session is required.'})
  let caller:DbConnection|undefined,service:DbConnection|undefined,requestId='',careOwner='',careGeneration=0n,planId='',planStarted=0n
  try{
    let body=req.body===undefined?'':typeof req.body==='string'?req.body:JSON.stringify(req.body);if(req.body===undefined){for await(const chunk of req){body+=chunk.toString();if(body.length>10000)throw Error('Request too large')}}if(body.length>10000)return send(413,{error:'Request too large'});
    service=await connect(await serviceToken())
    if(sandboxRequest){const args=JSON.parse(body);if(typeof args.requestId!=='string'||typeof args.scenario!=='string'||(args.event&&!['records.advance','consent.revoke'].includes(args.event)))return send(400,{error:'Invalid sandbox request'});caller=await connect(token);try{return send(200,{status:await connectSandbox(caller,service,args)})}catch{return send(409,{error:'Sandbox connection could not finish. Check the connection status and retry.'})}}
    if(planRequest){
      const args=JSON.parse(body);if(args.retry!==undefined&&typeof args.retry!=='boolean')return send(400,{error:'Invalid request'})
      caller=await connect(token)
      const prepared=JSON.parse(await caller.procedures.preparePlan({retry:args.retry===true})) as PlanContext&{status:string;id:string;started:string}
      if(prepared.status!=='generate')return send(200,{status:prepared.status})
      planId=prepared.id;planStarted=BigInt(prepared.started)
      const output=await generatePlan(prepared)
      const status=await service.procedures.finishPlan({id:planId,started:planStarted,output:JSON.stringify(output),failure:''})
      return send(status==='invalid-evidence'?422:200,{status})
    }
    if(careRequest){
      const args=JSON.parse(body) as {retry?:boolean}
      if(args.retry!==undefined&&typeof args.retry!=='boolean')return send(400,{error:'Invalid preparation request'})
      caller=await connect(token)
      let prepared=JSON.parse(await caller.procedures.prepareCare({retry:args.retry===true})) as ModelContext&{status:string;owner:string;generation:string}
      if(prepared.status==='needs-records'){
        // Fetch only this verified caller's assigned synthetic subject. Never
        // replace an explicitly failed/revoked connection with another scenario.
        await caller.procedures.refreshRecords({scenario:''})
        prepared=JSON.parse(await caller.procedures.prepareCare({retry:args.retry===true}))
      }
      if(prepared.status!=='generate')return send(200,{status:prepared.status})
      careOwner=prepared.owner;careGeneration=BigInt(prepared.generation)
      const context:ModelContext={purpose:'appointment-preparation',question:prepared.question,person:prepared.person,audience:'private',evidence:prepared.evidence,history:[],warnings:prepared.warnings}
      const output=await generate(context)
      const status=await service.procedures.finishCare({owner:careOwner,generation:careGeneration,output:JSON.stringify(output),failure:''})
      return send(status==='invalid-evidence'?422:200,{status,error:status==='invalid-evidence'?failures[status]:undefined})
    }
    const args=JSON.parse(body) as {requestId:string;audience:string;text:string}
    if(typeof args.requestId!=='string'||typeof args.audience!=='string'||typeof args.text!=='string')return send(400,{error:'Invalid question'})
    caller=await connect(token)
    const prepared=JSON.parse(await caller.procedures.prepareAi(args)) as ModelContext&{status:string;requestId:string}
    if(prepared.status==='completed')return send(200,{status:'completed'})
    requestId=prepared.requestId
    const output=await generate(prepared)
    const status=await service.procedures.finishAi({requestId,output:JSON.stringify(output),failure:''})
    if(status!=='completed')return send(422,{error:failures[status]??'The answer was not published.',code:status})
    return send(200,{status})
  }catch(error){
    if(error instanceof ProviderError){try{if(!service)throw Error('Service unavailable');if(planId)await service.procedures.finishPlan({id:planId,started:planStarted,output:'',failure:error.code});else if(careOwner)await service.procedures.finishCare({owner:careOwner,generation:careGeneration,output:'',failure:error.code});else if(requestId)await service.procedures.finishAi({requestId,output:'',failure:error.code})}catch{/* Access may have been revoked while the provider ran. */}return send(503,{code:error.code,error:failures[error.code]})}
    // Never echo SDK errors, credentials, prompts, provider bodies, or patient data.
    return send(409,{error:'The question could not be completed. Check your connection and record access, then retry.'})
  }finally{caller?.disconnect();service?.disconnect()}
}
