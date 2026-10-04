import {scenarioProfile} from '../spacetimedb/spacetimedb/src/profiles'
import type {useCareCheck} from './useCareCheck'
import {CalendarDays,ArrowUpRight,LockKeyhole} from 'lucide-react'
import type {CarePreparation,Task} from './module_bindings/types'
import {demoAppointment} from '../spacetimedb/spacetimedb/src/care'
type Props={identity:string;name:string;connectionRevision:string;connectionStatus:string;card:CarePreparation|null;tasks:Task[];review:()=>void;share:()=>void;dismiss:()=>void;busy:boolean}
export function ForYou({name,card,tasks,review,share,dismiss,busy,controller}:Props&{controller:ReturnType<typeof useCareCheck>}){
  const {error,checking,check}=controller
  if(scenarioProfile(name)!=='Daniel'||card?.dismissed||card?.status==='not-due')return null
  if(!card&&!error)return null
  const task=tasks.find(t=>t.id===card?.taskId),ready=card?.status==='ready'
  return <section className="for-you" aria-labelledby="for-you-title">
    <div className="for-you-label"><span><CalendarDays size={15}/> FOR YOU</span><span><LockKeyhole size={12}/> Only you</span></div>
    <h2 id="for-you-title">Your upcoming visit</h2>
    <p><strong>Synthetic demo appointment</strong> · {demoAppointment.display}</p>
    <p className="why">{card?"Why: your demo visit is within 72 hours. Checked while Kin is open.":"Kin could not check whether preparation is due. Retry to verify the appointment date."}</p>
    {ready?<p>Your brief is ready. Only you can see it.</p>:<p role="status">{card?.status==='records-unavailable'?'Your records are unavailable. Check My records; Kin will not substitute older records or fixtures.':card?.status==='failed'?'Your brief could not be prepared. You can retry when ready.':card?.status==='records-changed'?'Your records changed. Prepare a brief from the current evidence.':card?'Preparing your private brief from synthetic records…':'The preparation service could not be reached.'}</p>}
    {error&&<p className="care-error" role="alert">{error}</p>}
    {task&&<div className="care-progress" role="status"><strong>{task.title}</strong><span>{task.status==='open'?'Requested · waiting for help':task.status==='accepted'?`${task.ownerName} accepted`:task.status==='completed'?`${task.ownerName} marked coordination complete`:'Request cancelled'}</span></div>}
    <div className="care-actions">{ready&&<><button className="primary" disabled={busy} onClick={review}>Review brief<ArrowUpRight size={15}/></button>{card?.sharedMessage===undefined&&<button className="secondary" disabled={busy} onClick={share}>Share visit with family</button>}</>}{!ready&&!checking&&<button className="secondary" disabled={busy} onClick={()=>void check(true)}>Retry preparation</button>}{card&&<button className="care-dismiss" disabled={busy} onClick={dismiss}>Dismiss</button>}</div>
  </section>
}
