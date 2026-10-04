import {useState,useRef,useEffect,cloneElement,type ReactElement,type PointerEvent} from 'react'
import type {CarePlan} from './module_bindings/types'
import type {Snapshot} from './session'
import {KinAvatar,KinButton,type Page} from './KinShell'
import {todayState,todayItems} from './todayState'
export function Today({session,now,navigate,review,retry,checking,error,plans,reviewPlan,planError,manageVisit}:{session:Snapshot;now:number;navigate:(page:Page)=>void;review:()=>void;retry:()=>void;checking:boolean;error:string;plans:CarePlan[];reviewPlan:(id?:string)=>void;planError:string;manageVisit:(id:string)=>void}){
 const {appointment,careTask,ready,shared,card}=todayState(session,now)
 const date=new Date(now),hour=Number(date.toLocaleString('en-US',{timeZone:'America/Chicago',hour:'numeric',hourCycle:'h23'}))
 const greeting=hour<12?'Good morning':hour<18?'Good afternoon':'Good evening'
 const status=careTask?.status==='accepted'?`${careTask.ownerName} accepted`:careTask?.status==='completed'?`${careTask.ownerName} marked coordination complete`:careTask?.status==='cancelled'?'Request cancelled':careTask?'Waiting for someone to help':'No help requested yet'
 const [selected,setSelected]=useState(''),gesture=useRef<{x:number;y:number;id:number}|null>(null),suppressClick=useRef(false),[drag,setDrag]=useState(0),cardRef=useRef<HTMLElement|null>(null),wheelState=useRef({distance:0,last:0,locked:false})
 const front=useRef<ReactElement|null>(null),[departing,setDeparting]=useState<{card:ReactElement;direction:number}|null>(null),animationBusy=useRef(false)
 useEffect(()=>{if(!departing)return;const timer=setTimeout(()=>{setDeparting(null);animationBusy.current=false},340);return()=>clearTimeout(timer)},[departing])
 const items=todayItems(session,plans,!!card,now)
 const index=Math.max(0,items.findIndex(i=>i.id===selected)),item=items[index]
 function move(direction:number){
 if(animationBusy.current||items.length<2)return
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches
 if(!reduced&&front.current){animationBusy.current=true;setDeparting({card:cloneElement(front.current as ReactElement<{ref:null}>,{ref:null}),direction})}
 setSelected(items[(index+direction+items.length)%items.length].id)
 }
 function finishSwipe(e:PointerEvent<HTMLElement>,cancel=false){
 const start=gesture.current;if(!start||start.id!==e.pointerId)return
 const dx=e.clientX-start.x,dy=e.clientY-start.y
 if(!cancel&&Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)&&items.length>1){suppressClick.current=true;move(dx<0?1:-1)}
 gesture.current=null;setDrag(0)
 if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)
 }
 useEffect(()=>{
 const node=cardRef.current;if(!node||items.length<2)return
 function wheel(e:WheelEvent){
 if(e.ctrlKey)return
 const x=e.deltaX,y=e.deltaY
 if(Math.abs(x)<=Math.abs(y)||Math.abs(x)<1)return
 e.preventDefault()
 const state=wheelState.current,time=performance.now()
 if(time-state.last>180){state.distance=0;state.locked=false}
 state.last=time
 if(state.locked)return
 const scale=e.deltaMode===1?16:e.deltaMode===2?node!.clientWidth:1
 state.distance+=x*scale
 if(Math.abs(state.distance)>=65){state.locked=true;move(state.distance>0?1:-1);setDrag(0)}
 }
 node.addEventListener('wheel',wheel,{passive:false})
 return()=>node.removeEventListener('wheel',wheel)
 })
 const plan=item?.kind==='plan'?plans.find(p=>'plan:'+p.id===item.id):undefined
 const currentDue=item?.kind==='reminder'?session.reminders.find(r=>'reminder:'+r.id===item.id):undefined
 const currentTask=item?.kind==='task'?session.tasks.find(t=>'task:'+t.id===item.id):undefined
 const currentVisit=item?.kind==='family-visit'?(session.familyVisits??[]).find(v=>'family-visit:'+v.id===item.id):undefined
 const currentBooking=item?.kind==='booking'?session.bookings.find(b=>'booking:'+b.id===item.id):undefined
 const recordsReady=['ready','partial','empty'].includes(session.recordConnection?.status??'')
 let title='A little clarity. A little support.',description='Your records and family support, together.',label='Talk to Kin',action=()=>navigate('private')
 if(currentVisit){title=currentVisit.patient===session.me!.identity?'Your reserved visit.':`${currentVisit.patientName}’s reserved visit.`;description=`${new Date(currentVisit.slot).toLocaleString('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})} CT · Demo Community Clinic. Arranged by ${currentVisit.organizerName}. Synthetic reservation.`;label='Manage family visit';action=()=>manageVisit(currentVisit.id)}
 else if(currentBooking){title='Your reserved visit.';description=`${new Date(currentBooking.slot).toLocaleString('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})} CT · Demo Community Clinic · Synthetic reservation.`;label='Review saved visit';action=()=>navigate('private')}
 else if(currentDue){title='A small step, right on time.';description=currentDue.title;label='Review reminder'}
 else if(plan){title=plan.kind==='trip'?'Get ready for your trip.':'A little support after your visit.';description=plan.summary||'Kin is preparing a short plan from your records.';label=plan.status==='active'?'Continue your plan':'Review plan';action=()=>reviewPlan(plan.id)}
 else if(item?.kind==='visit'&&ready){title='Your visit, without the last-minute scramble.';description='Your sourced brief is ready. Bring your questions.';label='Review your visit';action=review}
 else if(item?.kind==='visit'&&card){title=checking||card.status==='preparing'?'Preparing for your visit.':'Your visit needs another look.';description=card.status==='records-unavailable'?'Your records are unavailable. Check the connection to continue.':card.status==='records-changed'?'Your records changed. Prepare a current brief.':card.status==='failed'?'Your brief could not be prepared. Try again.':'Kin is preparing your brief from your records.';label=card.status==='records-unavailable'?'Check records':'Retry preparation';action=card.status==='records-unavailable'?()=>navigate('records'):retry}
 else if(!item&&shared&&appointment&&!session.carePreparation){title='A visit, without the last-minute scramble.';description=`Review what ${shared.author} shared and bring your questions.`;label='Review shared visit';action=()=>navigate('family')}
 else if(currentTask){title='A little help goes a long way.';description=currentTask.title+(currentTask.status==='accepted'?` · ${currentTask.ownerName} is helping.`:' · Waiting for someone to help.');label='Review care task';action=()=>navigate('tasks')}
 else if(!recordsReady){title='Your health, in one place.';description='Connect your records to help Kin prepare useful next steps.';label='Open records';action=()=>navigate('records')}
 const frontCard=<section ref={cardRef} className="kin-next-step kin-glass" aria-labelledby="kin-next-title" tabIndex={items.length>1?0:undefined} aria-roledescription={items.length>1?'carousel':undefined} aria-describedby={items.length>1?'kin-swipe-hint':undefined} data-swipe={items.length>1} data-dragging={drag!==0} style={{transform:drag?`translateX(${drag}px) rotate(${drag/22}deg)`:undefined}} onPointerDown={e=>{if(items.length<2||!e.isPrimary||e.button!==0)return;suppressClick.current=false;gesture.current={x:e.clientX,y:e.clientY,id:e.pointerId}}} onPointerMove={e=>{const start=gesture.current;if(!start||start.id!==e.pointerId)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;if(Math.abs(dx)>10&&Math.abs(dx)>Math.abs(dy)){e.currentTarget.setPointerCapture(e.pointerId);setDrag(Math.max(-90,Math.min(90,dx*.45)));suppressClick.current=true}}} onPointerUp={e=>finishSwipe(e)} onPointerCancel={e=>finishSwipe(e,true)} onLostPointerCapture={()=>{gesture.current=null;setDrag(0)}} onClickCapture={e=>{if(suppressClick.current){e.preventDefault();e.stopPropagation();suppressClick.current=false}}} onKeyDown={e=>{if(e.target!==e.currentTarget||items.length<2)return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();move(e.key==='ArrowRight'?1:-1)}}}><div className="kin-card-heading"><p className="kin-label">FOR YOU {item&&<span className="kin-priority" data-priority={item.priority}>{item.priority}</span>}</p>{items.length>1&&<div className="kin-card-dots" aria-label={`Item ${index+1} of ${items.length}`}><span className="kin-sr-only" aria-live="polite">Item {index+1} of {items.length}</span>{items.map((entry,i)=><span key={entry.id} className={i===index?'is-current':''} aria-hidden="true"/>)}</div>}</div>{items.length>1&&<span id="kin-swipe-hint" className="kin-sr-only">Swipe with two fingers on a trackpad, or swipe left and right on a touchscreen. Use arrow keys when the card is focused.</span>}<div key={item?.id??'empty'} className="kin-card-content"><h2 id="kin-next-title">{title}</h2><p>{description}</p>{plan?<p className="kin-next-reason">{plan.kind==='trip'?'Why: your saved trip is within 45 days.':'Why: recent follow-up instructions in your records.'} Checked while Kin is open.</p>:item?.kind==='visit'&&card&&<p className="kin-next-reason">Why: your demo visit is within 72 hours. Checked while Kin is open.</p>}<KinButton onClick={action} disabled={plan?plan.status==='preparing':checking&&!ready&&!currentDue&&!currentTask&&!currentVisit&&!currentBooking}>{(plan?plan.status==='preparing':checking&&!ready&&!currentDue&&!currentTask&&!currentVisit&&!currentBooking)?'Preparing…':label}</KinButton><div className="kin-sharing-note"><span className="kin-lock"><img src="/figma/lock.svg" alt="" width="24" height="24"/></span><span>{currentVisit||currentTask?'Visible to your family.':appointment?.private?'Only you. Sharing follows your preference.':'You choose what gets shared.'}</span></div>{(plan?planError:error)&&<p className="kin-today-error" role="alert">{plan?planError:error}</p>}</div></section>
 useEffect(()=>{front.current=frontCard})
 return <section className="kin-today" aria-label="Today"><div className="kin-today-grid"><div className="kin-calm-focus"><p className="kin-label">{greeting.toUpperCase()}, {session.me!.name.toUpperCase()}</p><h1>Ready for<br/>{date.toLocaleDateString('en-US',{timeZone:'America/Chicago',weekday:'long'})}.</h1><p>One small step. More time together.</p></div>
 <div className="kin-card-deck" data-stacked={items.length>1} data-turning={!!departing}>{items.length>2&&<div className="kin-deck-back kin-deck-back-far" aria-hidden="true"/>}{items.length>1&&<div className="kin-deck-back kin-deck-back-near" aria-hidden="true"/>}{frontCard}{departing&&<div className="kin-card-departing" aria-hidden="true" inert style={{animationName:departing.direction>0?'kin-card-away-left':'kin-card-away-right'}}>{departing.card}</div>}</div>
 <div className="kin-appointment kin-glass">{appointment?<><div className="kin-date"><span>{new Date(appointment.date).toLocaleDateString('en-US',{timeZone:'America/Chicago',weekday:'short'}).toUpperCase()}</span><strong>{new Date(appointment.date).toLocaleDateString('en-US',{timeZone:'America/Chicago',day:'2-digit'})}</strong></div><div><h2>{appointment.title}</h2><p>{new Date(appointment.date).toLocaleString('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})} CT</p><small>{appointment.detail}</small></div></>:<div><h2>No upcoming visit saved</h2><p>Saved visits will appear here.</p></div>}</div>
 <section className="kin-coordination" aria-label="Family coordination"><div className="kin-family-avatars">{session.members.slice(0,3).map(m=><KinAvatar key={m.identity} name={m.name}/>)}</div><div><p>{careTask?status:session.members.length===1?'Your family space is ready.':'Your family, in your corner.'}</p><small>{careTask?careTask.title:session.members.length===1?'Invite someone in Settings.':session.members.map(m=>m.name).join(', ')}</small></div></section>
 </div><div className="kin-supporting-routes"><KinButton variant="secondary" onClick={()=>navigate('tasks')}>Care tasks</KinButton><KinButton variant="secondary" onClick={()=>navigate('family')}>Shared records</KinButton><KinButton variant="quiet" onClick={()=>navigate('private')}>Talk to Kin</KinButton></div><footer className="kin-today-footer">FICTIONAL FAMILY · {session.recordConnection?.scenario==='detailed-care-demo'?'AUTHORED SYNTHETIC DATA':session.recordConnection?'FINCHNODE SYNTHETIC DATA':'SYNTHETIC DEMO'}</footer></section>
}
