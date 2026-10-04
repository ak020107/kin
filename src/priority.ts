import type {Snapshot} from './session'
export type Priority = 'Due now' | 'Soon' | 'Planned'
export const priorityRank:Record<Priority,number>={'Due now':0,Soon:1,Planned:2}
export function datePriority(date:string|number,now:number):Priority{
 const time=typeof date==='number'?date:Date.parse(date)
 if(!Number.isFinite(time))return 'Planned'
 return time<=now?'Due now':time-now<=72*60*60*1000?'Soon':'Planned'
}
export function taskPriority(session:Snapshot,id:string,now:number):Priority{
 const task=session.tasks.find(t=>t.id===id)
 if(!task||!['open','accepted'].includes(task.status))return 'Planned'
 return session.carePreparation?.taskId===id?datePriority(session.carePreparation.appointmentDate,now):'Planned'
}
