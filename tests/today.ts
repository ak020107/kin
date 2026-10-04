import assert from 'node:assert/strict'
import {todayState,todayItems} from '../src/todayState'
import type {Snapshot} from '../src/session'
import {appointmentEvidence,demoAppointment} from '../spacetimedb/spacetimedb/src/care'
const now=Date.parse('2026-10-04T03:00:00Z')
const empty:Snapshot={me:{identity:'alex',familyId:'family',name:'Alex',role:'member'},members:[],invites:[],records:[],messages:[],tasks:[],recordConnection:null,carePreparation:null,sandboxLink:null,reminders:[],bookings:[],sharingPreference:null,carePlans:[]}
assert.equal(todayState(empty,now).appointment,undefined)
assert.equal(todayState(empty,now).ready,false)
const booking={id:'visit',owner:'alex',slot:'2026-10-14T20:00:00Z',status:'confirmed-demo',created:1n}
assert.equal(todayState({...empty,bookings:[booking]},now).appointment?.id,'visit')
assert.equal(todayState({...empty,bookings:[{...booking,status:'cancelled'}]},now).appointment,undefined)
assert.equal(todayState({...empty,bookings:[booking]},Date.parse('2026-10-15')).appointment,undefined)
const shared={id:1n,familyId:'family',owner:'daniel',audience:'family',author:'Daniel',text:appointmentEvidence.text,sourceIds:[],shared:true,created:1n,mode:'human',evidence:undefined,proposal:undefined}
assert.equal(todayState({...empty,messages:[{...shared,shared:false}]},now).appointment,undefined)
assert.equal(todayState({...empty,messages:[{...shared,text:'An allergy excerpt only'}]},now).appointment,undefined)
assert.equal(todayState({...empty,messages:[shared]},now).appointment?.private,false)
assert.equal(todayState({...empty,messages:[shared]},now).appointment?.title,'Daniel’s visit')
const card={owner:'alex',familyId:'family',appointmentId:demoAppointment.id,appointmentDate:demoAppointment.startsAt,status:'ready',dismissed:false,text:'Private brief',evidence:'[]',warnings:[],revision:1n,generation:1n,started:1n,sharedMessage:undefined,taskId:undefined,generatedAt:1n,reviewedAt:0n,dismissedAt:0n,handledAt:0n}
assert.equal(todayState({...empty,carePreparation:card},now).ready,true)
assert.equal(todayState({...empty,carePreparation:{...card,dismissed:true}},now).ready,false)
assert.equal(todayState({...empty,carePreparation:{...card,dismissed:true}},now).card,null)
assert.equal(todayState({...empty,carePreparation:{...card,status:'records-changed'}},now).ready,false)
assert.equal(todayState({...empty,carePreparation:card},Date.parse('2026-10-07')).appointment,undefined)
const task={id:'task',familyId:'family',title:'Prepare questions',owner:'',ownerName:'',status:'open',creator:'alex',declined:[],created:1n,updated:1n}
assert.equal(todayState({...empty,tasks:[task]},now).careTask?.status,'open')
assert.equal(todayState({...empty,tasks:[{...task,status:'accepted',owner:'daniel',ownerName:'Daniel'}]},now).careTask?.ownerName,'Daniel')
assert.equal(todayState({...empty,tasks:[{...task,status:'cancelled'}]},now).careTask,undefined)
console.log('PASS Today: real saved visits, cancelled/past visits, approved family appointment only, dismissed/stale briefs and actual task ownership')

const queue=todayItems({...empty,tasks:[task,{...task,id:'second',status:'accepted',owner:'alex',ownerName:'Alex'},{...task,id:'cancelled',status:'cancelled'}]},[],true)
assert.deepEqual(queue.map(i=>i.id),['visit','task:task','task:second'])
assert.equal(new Set(queue.map(i=>i.id)).size,queue.length)
assert.deepEqual(todayItems({...empty,tasks:[{...task,status:'completed'}]},[],false),[])
console.log('PASS Today queue: visit and multiple tasks coexist; completed and cancelled requests excluded')

const visit={id:'new-family-visit',familyId:'family',patient:'alex',patientName:'Alex',organizer:'daniel',organizerName:'Daniel',slot:'2026-10-18T15:00:00Z',status:'confirmed-demo',created:1n}
assert(todayItems({...empty,familyVisits:[visit],carePreparation:card},[],true,now).some(i=>i.id==='family-visit:new-family-visit'))
assert(todayItems({...empty,me:{...empty.me!,identity:'daniel'},familyVisits:[visit]},[],false,now).some(i=>i.kind==='family-visit'))
assert(!todayItems({...empty,me:{...empty.me!,identity:'maya'},familyVisits:[visit]},[],false,now).some(i=>i.kind==='family-visit'))
assert(!todayItems({...empty,familyVisits:[{...visit,status:'cancelled'}]},[],false,now).some(i=>i.kind==='family-visit'))
assert(!todayItems({...empty,familyVisits:[visit]},[],false,Date.parse('2026-10-19')).some(i=>i.kind==='family-visit'))
assert(todayItems({...empty,bookings:[booking]},[],false,now).some(i=>i.kind==='booking'))
console.log('PASS Every upcoming reservation has its own Today card for patient and organizer; cancelled, past and unrelated visits excluded')

const reminder={id:'due',owner:'alex',title:'Prepare questions',dueAt:BigInt(now-1000)*1000n,status:'due',created:1n}
const prioritized=todayItems({...empty,carePreparation:card,bookings:[booking],reminders:[reminder],tasks:[task]},[],true,now)
assert.equal(prioritized[0].kind,'reminder')
assert.equal(prioritized[0].priority,'Due now')
assert.equal(prioritized[1].kind,'visit')
assert.equal(prioritized[1].priority,'Soon')
assert.equal(prioritized.find(i=>i.kind==='booking')?.priority,'Planned')
const linked=todayItems({...empty,carePreparation:{...card,taskId:'task'},tasks:[task]},[],false,now)
assert.equal(linked[0].priority,'Soon')
assert.equal(todayItems({...empty,tasks:[task]},[],false,now)[0].priority,'Planned')
assert.deepEqual(todayItems({...empty,carePreparation:card,bookings:[booking],reminders:[reminder],tasks:[task]},[],true,now),prioritized)
console.log('PASS Priority: due reminders first, near visits and linked tasks next, undated tasks planned, stable ordering')
