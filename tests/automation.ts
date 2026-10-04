import {guidanceFor,preparationTime,nextTravelCheck} from '../spacetimedb/spacetimedb/src/travel'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {DbConnection} from '../src/module_bindings'
import {candidates,eventKey,validatePlan,type Plan} from '../spacetimedb/spacetimedb/src/automation'
assert.equal(nextTravelCheck('2026-10-14T12:00:00Z',Date.parse('2026-10-21T12:00:00Z')),null)
assert.equal(preparationTime('2026-10-14T12:00:00Z',Date.parse('2026-10-04T12:00:00Z')),Date.parse('2026-10-07T12:00:00Z'))
assert.equal(guidanceFor([{id:'trip',category:'Trip',date:'2026-10-14',text:'Personal travel plan: Canada.'}]).some(g=>g.id==='india-review'),false)
const source={id:'followup',category:'Follow-up',date:'2026-09-28',text:'Bring medication bottles and your home blood-pressure log to the next visit.'}
assert.equal(candidates([source,{...source,category:'Encounter'}],'2026-10-04').length,1)
assert.equal(candidates([source],'2026-11-04').length,0)
assert.equal(candidates([{...source,date:null}],'2026-10-04').length,0)
assert.equal(eventKey({...source,id:'another-retrieval'}),eventKey(source))
assert.notEqual(eventKey({...source,text:'Changed care instruction'}),eventKey(source))
const plan={summary:'Gather your notes before your next visit.',items:[{kind:'instructions',recordId:source.id,quote:source.text}]}
assert.equal(validatePlan(plan,[source],false).items.length,1)
assert.equal(validatePlan({...plan,items:[{kind:'logs',recordId:source.id,quote:source.text}]},[source],false).items[0].kind,'logs')
assert.throws(()=>validatePlan({...plan,items:[{kind:'logs',recordId:source.id,quote:'Bring medication bottles'}]},[source],false))
assert.throws(()=>validatePlan({...plan,items:[{kind:'instructions',recordId:'private-other',quote:source.text}]},[source],false))
assert.throws(()=>validatePlan({...plan,items:[{kind:'travel',recordId:source.id,quote:source.text}]},[source],false))
assert.throws(()=>validatePlan({...plan,items:[{kind:'meals',recordId:source.id,quote:source.text}]},[source],false))
assert.throws(()=>validatePlan({...plan,summary:'Increase your medication.'},[source],false))
assert.throws(()=>validatePlan({...plan,items:[{...plan.items[0],detail:'Increase your medication.'}]},[source],false))
assert.equal(validatePlan({...plan,items:[{...plan.items[0],detail:'Gather your medication bottles and your home log before the visit.'}]},[source],false).items[0].detail,'Gather your medication bottles and your home log before the visit.')
assert.throws(()=>validatePlan({...plan,guidance:['invented-medical-source']},[source],false))
console.log('PASS Deterministic recent-record/trip eligibility, stable event keys and bounded sourced plans')
const clients:DbConnection[]=[]
const delay=(ms=40)=>new Promise(r=>setTimeout(r,ms))
async function until(test:()=>boolean){const end=Date.now()+10000;while(!test()){if(Date.now()>end)throw Error('Subscription timeout');await delay()}}
async function connect(token?:string){let issued='';const c=await new Promise<DbConnection>((resolve,reject)=>DbConnection.builder().withUri('ws://127.0.0.1:3000').withDatabaseName('kin-local').withToken(token).onConnect((c,_id,t)=>{issued=t;c.subscriptionBuilder().onApplied(()=>resolve(c)).subscribe(['SELECT * FROM my_membership','SELECT * FROM my_records','SELECT * FROM my_care_plans','SELECT * FROM my_reminders','SELECT * FROM visible_messages','SELECT * FROM family_tasks','SELECT * FROM my_auto_care_preference'])}).onConnectError((_c,e)=>reject(e)).build());clients.push(c);return {c,token:token??issued}}
const rows=(c:DbConnection)=>[...c.db.myCarePlans.iter()]
async function prepare(user:Awaited<ReturnType<typeof connect>>,retry=false){const response=await fetch('http://127.0.0.1:3001/care-plan',{method:'POST',headers:{Authorization:`Bearer ${user.token}`,'Content-Type':'application/json'},body:JSON.stringify({retry})});const body=await response.json() as {status:string;error?:string};assert.equal(response.status,200,body.error);return body.status}
try{
 const d=await connect(),a=await connect(),m=await connect();await d.c.reducers.createFamily({name:'Daniel'})
 for(const [user,name] of [[a,'Alex'],[m,'Maya']] as const){const code=randomUUID().replaceAll('-','')+randomUUID().replaceAll('-','');await d.c.reducers.createInvite({code,name});await user.c.reducers.joinFamily({code})}
 await d.c.procedures.refreshRecords({scenario:'detailed-care-demo'})
 assert.equal(await prepare(d),'ready');await until(()=>rows(d.c)[0]?.status==='ready')
 let row=rows(d.c)[0];const generated=row.generatedAt;const output=JSON.parse(row.plan) as Plan;assert(output.items.length>=2);assert(output.items.some(i=>i.kind==='meals'));assert(output.items.some(i=>i.kind==='logs'));assert(output.items.every(i=>typeof i.detail==='string'&&i.detail.length>20),'AI steps must explain practical next work');assert.equal(rows(a.c).length,0);assert.equal([...a.c.db.visibleMessages.iter()].length,0)
 await prepare(d);assert.equal(rows(d.c).length,1);assert.equal(rows(d.c)[0].generatedAt,generated)
 await d.c.procedures.refreshRecords({scenario:'detailed-care-demo'});await prepare(d);assert.equal(rows(d.c)[0].generatedAt,generated)
 await assert.rejects(a.c.reducers.updatePlan({id:row.id,action:'activate'}));await assert.rejects(a.c.procedures.finishPlan({id:row.id,started:row.started,output:row.plan,failure:''}))
 await d.c.reducers.updatePlan({id:row.id,action:'review'});await d.c.reducers.updatePlan({id:row.id,action:'activate'})
 const item=output.items.find(i=>i.kind==='meals')!
 await assert.rejects(d.c.reducers.sharePlanStep({id:row.id,kind:item.kind,approve:false,includeSource:false}))
 await d.c.reducers.setSharingPreference({mode:'visits'})
 await assert.rejects(d.c.reducers.sharePlanStep({id:row.id,kind:item.kind,approve:false,includeSource:true}))
 await Promise.all([d.c.reducers.sharePlanStep({id:row.id,kind:item.kind,approve:false,includeSource:false}),d.c.reducers.sharePlanStep({id:row.id,kind:item.kind,approve:false,includeSource:false})])
 await until(()=>[...a.c.db.familyTasks.iter()].length===1)
 assert.equal([...a.c.db.visibleMessages.iter()].length,1);assert(![...a.c.db.visibleMessages.iter()][0].text.includes(item.quote))
 const task=[...a.c.db.familyTasks.iter()][0]
 const claims=await Promise.allSettled([a.c.reducers.claimTask({id:task.id}),m.c.reducers.claimTask({id:task.id})]);assert.equal(claims.filter(r=>r.status==='fulfilled').length,1)
 await until(()=>[...d.c.db.familyTasks.iter()][0].status==='accepted')
 const helper=[...d.c.db.familyTasks.iter()][0].ownerName==='Alex'?a:m
 await helper.c.reducers.completeTask({id:task.id});await until(()=>[...d.c.db.familyTasks.iter()][0].status==='completed')
 assert(!rows(d.c)[0].completed.includes(item.kind),'Family coordination must not imply medical action or personal completion')
 await d.c.reducers.setAutoCare({enabled:true});await d.c.reducers.checkReminders({});assert(![...d.c.db.myReminders.iter()].some(r=>r.id===`auto-care:${row.id}:${item.kind}`&&['scheduled','due'].includes(r.status)))
 await d.c.reducers.setAutoCare({enabled:false})
 console.log('PASS After-visit meals/logs, accepted family help, live completion status and no implied medical completion')
 const dueAt=BigInt(Date.now()+4000)*1000n
 await d.c.reducers.remindPlanStep({id:row.id,kind:item.kind,dueAt});await d.c.reducers.remindPlanStep({id:row.id,kind:item.kind,dueAt})
 assert.equal([...d.c.db.myReminders.iter()].filter(r=>r.id.startsWith('plan-reminder:')).length,1);assert.equal([...a.c.db.myReminders.iter()].length,0)
 await d.c.reducers.completePlanStep({id:row.id,kind:item.kind});await d.c.reducers.completePlanStep({id:row.id,kind:item.kind})
 assert.equal(rows(d.c)[0].completed.length,1);assert.equal(Object.keys(JSON.parse(rows(d.c)[0].completedAt)).length,1);assert.equal([...d.c.db.myReminders.iter()].find(r=>r.id===`plan-reminder:${row.id}:${item.kind}`)?.status,'dismissed')
 const again=await connect(d.token);assert.equal(rows(again.c)[0].status,'active');assert(rows(again.c)[0].reviewedAt>0n)
 const chat=await fetch('http://127.0.0.1:3001/companion',{method:'POST',headers:{Authorization:`Bearer ${d.token}`,'Content-Type':'application/json'},body:JSON.stringify({requestId:randomUUID(),audience:'private',text:'What is left in my saved preparation plan?'})});assert.equal(chat.status,200,await chat.text());await until(()=>[...d.c.db.visibleMessages.iter()].some(r=>r.author==='Kin companion'));assert([...d.c.db.visibleMessages.iter()].filter(r=>r.author==='Kin companion').at(-1)!.text.length>30)
 console.log('PASS Live Gemini record plan, refresh deduplication, private scopes, saved sharing, race-safe family handoff and persistent self-reported check-in')
 const followupId=row.id;const followupProgress=[...rows(d.c).find(r=>r.id===followupId)!.completed]
 const departure=new Date(Date.now()+7*86400000).toISOString(),tripId=randomUUID();await d.c.reducers.saveTrip({requestId:tripId,destination:'India',departure});await d.c.reducers.saveTrip({requestId:tripId,destination:'India',departure})
 assert.equal([...d.c.db.myRecords.iter()].filter(r=>r.category==='Trip').length,1)
 await d.c.procedures.refreshRecords({scenario:'detailed-care-demo'});assert([...d.c.db.myRecords.iter()].some(r=>r.category==='Trip'))
 assert.equal(await prepare(d),'ready');await until(()=>rows(d.c).some(r=>r.kind==='trip'&&r.status==='ready'));row=rows(d.c).find(r=>r.kind==='trip')!
 assert.equal(rows(d.c).find(r=>r.id===followupId)!.status,'active');assert.deepEqual(rows(d.c).find(r=>r.id===followupId)!.completed,followupProgress);await d.c.reducers.updatePlan({id:followupId,action:'dismiss'});
 const tripPlan=JSON.parse(row.plan) as Plan;assert(tripPlan.items.some(i=>i.kind==='travel'));assert(tripPlan.guidance?.length)
 await d.c.reducers.setAutoCare({enabled:true});await d.c.reducers.checkReminders({})
 await until(()=>[...d.c.db.myAutoCarePreference.iter()][0]?.enabled===true)
 assert.equal([...a.c.db.myAutoCarePreference.iter()].length,0);const savedPreference=await connect(d.token);assert.equal([...savedPreference.c.db.myAutoCarePreference.iter()][0]?.enabled,true)
 const auto=[...d.c.db.myReminders.iter()].filter(r=>r.id.startsWith('auto-care:'));assert(auto.length>0)
 await d.c.reducers.checkReminders({});assert.equal([...d.c.db.myReminders.iter()].filter(r=>r.id.startsWith('auto-care:')).length,auto.length)
 await assert.rejects(a.c.reducers.updateReminder({id:auto[0].id,action:'cancel'}))
 const stop=auto[0];await d.c.reducers.updateReminder({id:stop.id,action:'cancel'});await d.c.reducers.checkReminders({});assert.equal([...d.c.db.myReminders.iter()].find(r=>r.id===stop.id)?.status,'cancelled')
 assert.equal([...a.c.db.myReminders.iter()].length,0)

 const override=tripPlan.items.find(i=>i.remind)
 if(override){
  const due=BigInt(Date.now()+86400000)*1000n
  await d.c.reducers.remindPlanStep({id:row.id,kind:override.kind,dueAt:due})
  await d.c.reducers.checkReminders({})
  const active=[...d.c.db.myReminders.iter()].filter(r=>[`auto-care:${row.id}:${override.kind}`,`plan-reminder:${row.id}:${override.kind}`].includes(r.id)&&['scheduled','due'].includes(r.status))
  assert.equal(active.length,1);assert.equal(active[0].dueAt,due)
  console.log('PASS User-selected reminder time replaces automatic timing without duplicate reminders')
 }
 console.log('PASS Opt-in automatic preparation, scoped preference, duplicate prevention and respected cancellation')
 await d.c.reducers.setSharingPreference({mode:'summaries'});const travel=tripPlan.items.find(i=>i.kind==='travel')!
 await d.c.reducers.sharePlanStep({id:row.id,kind:'travel',approve:false,includeSource:true});await until(()=>[...a.c.db.visibleMessages.iter()].some(r=>r.text.includes(travel.quote)))
 const shared=[...a.c.db.visibleMessages.iter()].find(r=>r.text.includes(travel.quote))!.text
 await d.c.procedures.refreshRecords({scenario:'detailed-care-demo'});assert([...a.c.db.visibleMessages.iter()].some(r=>r.text===shared));await prepare(d);assert.equal(rows(d.c).length,2)
 await d.c.reducers.updatePlan({id:row.id,action:'activate'});for(const step of tripPlan.items)await d.c.reducers.completePlanStep({id:row.id,kind:step.kind})
 assert.equal(rows(d.c).find(r=>r.id===row.id)!.status,'handled');assert(![...d.c.db.myReminders.iter()].some(r=>r.id.startsWith('auto-care:')&&['due','scheduled'].includes(r.status)));await d.c.reducers.setAutoCare({enabled:false});assert.equal(await prepare(d),'nothing-due')
 const final=await connect(d.token);assert.equal(rows(final.c).find(r=>r.kind==='follow-up')!.status,'dismissed');assert.equal(rows(final.c).find(r=>r.kind==='trip')!.status,'handled')
 const cancelledId=randomUUID();await a.c.reducers.saveTrip({requestId:cancelledId,destination:'Canada',departure});assert.equal(await prepare(a),'ready');await until(()=>rows(a.c).some(r=>r.kind==='trip'&&r.status==='ready'));const standalone=rows(a.c).find(r=>r.kind==='trip')!;assert((JSON.parse(standalone.evidence) as {category:string}[]).every(e=>e.category==='Trip'));assert(!/supplies|meals|instructions/.test((JSON.parse(standalone.plan) as Plan).items.map(i=>i.kind).join(',')));assert(/records.*not connected|records.*aren.t connected|no.*medical records/i.test(standalone.summary));await assert.rejects(d.c.reducers.cancelTrip({recordId:`trip-${cancelledId}`}));await a.c.reducers.cancelTrip({recordId:`trip-${cancelledId}`});await a.c.reducers.cancelTrip({recordId:`trip-${cancelledId}`});assert.equal([...a.c.db.myRecords.iter()].find(r=>r.id===`trip-${cancelledId}`)!.category,'Cancelled trip')
 const proactive=await connect(),autoHelper=await connect();await proactive.c.reducers.createFamily({name:'Daniel'});const invite=randomUUID().replaceAll('-','')+randomUUID().replaceAll('-','');await proactive.c.reducers.createInvite({code:invite,name:'Alex'});await autoHelper.c.reducers.joinFamily({code:invite});await proactive.c.procedures.refreshRecords({scenario:'detailed-care-demo'});await prepare(proactive)
 await proactive.c.reducers.setSharingPreference({mode:'visits'});await proactive.c.reducers.setAutoCare({enabled:true});await proactive.c.reducers.checkReminders({});await until(()=>[...autoHelper.c.db.familyTasks.iter()].length===1)
 const automaticTask=[...autoHelper.c.db.familyTasks.iter()][0];assert(![...autoHelper.c.db.visibleMessages.iter()].some(m=>/sodium|blood.pressure|metformin/i.test(m.text)),'Automatic generic handoff must not disclose private evidence')
 await proactive.c.reducers.checkReminders({});assert.equal([...autoHelper.c.db.familyTasks.iter()].length,1)
 await autoHelper.c.reducers.claimTask({id:automaticTask.id});await autoHelper.c.reducers.completeTask({id:automaticTask.id});await proactive.c.reducers.checkReminders({});await until(()=>[...proactive.c.db.familyTasks.iter()][0]?.status==='completed');assert.equal([...autoHelper.c.db.familyTasks.iter()].length,1)
 await proactive.c.reducers.updatePlan({id:rows(proactive.c)[0].id,action:'dismiss'});await proactive.c.reducers.checkReminders({});assert(![...proactive.c.db.myReminders.iter()].some(r=>['due','scheduled'].includes(r.status)))
 console.log('PASS Automatic family task creation under saved settings, deduplication, private evidence protection and lifecycle stop')
 console.log('PASS Upcoming-trip preparation without a chat prompt, personal context survives refresh, selected immutable sharing, completion and dismissal survive reconnect')
}finally{clients.forEach(c=>c.disconnect())}
