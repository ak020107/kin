import {datePriority,taskPriority,priorityRank,type Priority} from './priority'
import type {Snapshot} from './session'
import {appointmentEvidence,demoAppointment,careDue} from '../spacetimedb/spacetimedb/src/care'
export function todayState(session:Snapshot,now:number){
 const card=session.carePreparation
 const shared=session.messages.find(m=>m.audience==='family'&&m.shared&&m.text.includes(appointmentEvidence.text))
 const appointments=session.bookings.filter(b=>b.status==='confirmed-demo'&&Date.parse(b.slot)>now).map(b=>({id:b.id,title:'Your demo visit',date:b.slot,detail:'Demo Community Clinic · synthetic booking',private:true}))
 if(Date.parse(demoAppointment.startsAt)>now&&(card||shared))appointments.push({id:demoAppointment.id,title:card?'Your upcoming visit':`${shared!.author}’s visit`,date:demoAppointment.startsAt,detail:card?'Synthetic demo appointment':`Shared by ${shared!.author} · synthetic appointment`,private:!!card})
 for(const v of session.familyVisits??[])if(v.patient===session.me?.identity&&v.status==='confirmed-demo'&&Date.parse(v.slot)>now)appointments.push({id:v.id,title:'Your family-arranged visit',date:v.slot,detail:`Arranged by ${v.organizerName} · synthetic booking`,private:false})
 const appointment=appointments.sort((a,b)=>Date.parse(a.date)-Date.parse(b.date))[0]
 const careTask=session.tasks.find(t=>t.id===card?.taskId)??session.tasks.filter(t=>['open','accepted'].includes(t.status)).sort((a,b)=>a.created>b.created?-1:1)[0]
 const ready=!!card&&!card.dismissed&&card.status==='ready'&&careDue(new Date(now).toISOString())
 const due=session.reminders.find(r=>r.status==='due')
 return {appointment,careTask,ready,due,shared,card:card&&!card.dismissed&&careDue(new Date(now).toISOString())?card:null}
}

export function todayItems(session:Snapshot,plans:Snapshot['carePlans'],hasVisit:boolean,now:number=0){
 const visits=(session.familyVisits??[]).filter(v=>v.status==='confirmed-demo'&&Date.parse(v.slot)>now&&(v.patient===session.me?.identity||v.organizer===session.me?.identity)).map(v=>({id:'family-visit:'+v.id,kind:'family-visit'}))
 const bookings=session.bookings.filter(b=>b.status==='confirmed-demo'&&Date.parse(b.slot)>now).map(b=>({id:'booking:'+b.id,kind:'booking'}))
 const items = [...visits,...bookings,...session.reminders.filter(r=>r.status==='due').map(r=>({id:'reminder:'+r.id,kind:'reminder'})),...plans.filter(p=>['ready','active','preparing','failed'].includes(p.status)).map(p=>({id:'plan:'+p.id,kind:'plan'})),...(hasVisit?[{id:'visit',kind:'visit'}]:[]),...session.tasks.filter(t=>['open','accepted'].includes(t.status)).map(t=>({id:'task:'+t.id,kind:'task'}))]
 return items.map(item=>{
 let priority:Priority='Planned',due=Number.POSITIVE_INFINITY
 if(item.kind==='reminder'){priority='Due now';due=Number(session.reminders.find(r=>'reminder:'+r.id===item.id)!.dueAt/1000n)}
 else if(item.kind==='family-visit')due=Date.parse((session.familyVisits??[]).find(v=>'family-visit:'+v.id===item.id)!.slot)
 else if(item.kind==='booking')due=Date.parse(session.bookings.find(b=>'booking:'+b.id===item.id)!.slot)
 else if(item.kind==='visit')due=Date.parse(session.carePreparation?.appointmentDate??demoAppointment.startsAt)
 else if(item.kind==='task'){priority=taskPriority(session,item.id.slice(5),now);if(session.carePreparation?.taskId===item.id.slice(5))due=Date.parse(session.carePreparation.appointmentDate)}
 if(Number.isFinite(due)&&item.kind!=='reminder')priority=datePriority(due,now)
 return {...item,priority,due}
 }).sort((a,b)=>priorityRank[a.priority]-priorityRank[b.priority]||a.due-b.due)

}
