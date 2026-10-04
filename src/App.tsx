import {taskPriority,priorityRank} from './priority'
import {FamilyCare} from './FamilyCare'
import {AutomationStatus} from './AutomationStatus'
import {AppointmentBrief} from './AppointmentBrief'
import {PlanReview} from './CarePlan'
import {usePlans} from './usePlans'
import {AnswerText} from './AnswerText'
import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowUp, ArrowUpRight, Check, AlertCircle, ClipboardList, LockKeyhole, Plus, ShieldCheck, Sparkles, Users, X } from 'lucide-react'
import type { Message, Person, RecordItem, Task } from './demo'
import { useSession } from './session'
import {useDeviceDraft,tokenKey} from './device'
import { Welcome } from './Welcome'
import {CareActions,SandboxConnect} from './CareActions'
import { Records, Provenance } from './Records'
import { ForYou } from './ForYou'
import {useCareCheck} from './useCareCheck'
import {mentionsKin,kinFollowup} from './mentions'
import { appointmentEvidence, demoAppointment } from '../spacetimedb/spacetimedb/src/care'
import './App.css'
import {KinShell,type Page} from './KinShell'
import {Today} from './Today'
import '@fontsource-variable/manrope'
import './KinShell.css'
import './KinPages.css'
const starters = ['Summarize my medications and allergies', 'What is documented for my appointment?', 'Is my blood type documented?']
export default function App() {
  const session=useSession()
  if(!session.me||session.status!=='ready')return <Welcome connection={session.connection} status={session.status}/>
  return <CareApp key={session.me.identity} session={session}/>
}
function CareApp({session}:{session:ReturnType<typeof useSession>}) {
  const [page,setPage]=useState<Page>('today')
  const [planReview,setPlanReview]=useState(false),[reviewedPlanId,setReviewedPlanId]=useState('')
  function reviewPlan(id=plans.card?.id??''){setReviewedPlanId(id);setPlanReview(true);if(id)void session.connection!.reducers.updatePlan({id,action:'review'}).catch(()=>{})}
  useEffect(()=>{const check=()=>{void session.connection?.reducers.checkReminders({}).catch(()=>{})};check();const timer=setInterval(check,5000);return ()=>clearInterval(timer)},[session.connection])
  const [chatNow,setChatNow]=useState(()=>Date.now())
  const plans=usePlans(session,chatNow)
  useEffect(()=>{const timer=setInterval(()=>setChatNow(Date.now()),30000);return ()=>clearInterval(timer)},[])
  const [endedKin,setEndedKin]=useState<string|null>(null)
  const [privateInput,setPrivateInput]=useDeviceDraft(session.me!.identity,'privateInput','')
  const [familyInput,setFamilyInput]=useDeviceDraft(session.me!.identity,'familyInput','')
  const input=page==='family'?familyInput:privateInput
  const setInput=page==='family'?setFamilyInput:setPrivateInput
  const [questions,setQuestions]=useDeviceDraft(session.me!.identity,'questions','')
  const [taskTitle,setTaskTitle]=useDeviceDraft(session.me!.identity,'taskTitle','Prepare appointment questions')
  const [toastError,setToastError]=useState(false)
  const [busy,setBusy]=useState(false)
  const controller=useCareCheck(session.me!.identity,session.me!.name,String(session.recordConnection?.revision??0n),session.recordConnection?.status??'')
  const locked=useRef(false)
  const [source,setSource]=useState<RecordItem|null>(null)
  const [sharing,setSharing]=useDeviceDraft(session.me!.identity,'sharing',false)
  const [visitReview,setVisitReview]=useState('')
  const selectedVisit=(session.familyVisits??[]).find(v=>v.id===visitReview)
  const [careReview,setCareReview]=useState(false)
  const [sharingSetup,setSharingSetup]=useState(false)
  const [sharingChoice,setSharingChoice]=useState('visits')
  const [pendingHandoff,setPendingHandoff]=useState<'visit'|'summary'|null>(null)
  const [careSharing,setCareSharing]=useDeviceDraft(session.me!.identity,'careSharing',false)
  const [includeAppointment,setIncludeAppointment]=useDeviceDraft(session.me!.identity,'includeAppointment',false)
  const [selected,setSelected]=useDeviceDraft<string[]>(session.me!.identity,'selected',[])
  const [excerpts,setExcerpts]=useDeviceDraft<Record<string,string>>(session.me!.identity,'excerpts',{})
  const [note,setNote]=useDeviceDraft(session.me!.identity,'note','Please help me prepare questions for my care team.')
  const [proposal,setProposal]=useState(false)
  const [proposalMessage,setProposalMessage]=useState<string|null>(null)
  const [toast,setToast]=useState('')
  const [inviteName,setInviteName]=useState('Alex')
  const [scenario,setScenario]=useState('')
  const [savedPending,setSavedPending]=useDeviceDraft<{id:string;text:string;audience:string}|null>(session.me!.identity,'pending',null)
  const pending=useRef(savedPending)
  const [error,setError]=useState(!!savedPending)
  function keepPending(value:typeof savedPending){pending.current=value;setSavedPending(value)}
  const [savedTaskRequest,setSavedTaskRequest]=useDeviceDraft(session.me!.identity,'taskRequest','')
  const taskRequest=useRef(savedTaskRequest)
  function keepTaskRequest(value:string){taskRequest.current=value;setSavedTaskRequest(value)}
  const [savedShareRequest,setSavedShareRequest]=useDeviceDraft(session.me!.identity,'shareRequest','')
  const shareRequest=useRef(savedShareRequest)
  function keepShareRequest(value:string){shareRequest.current=value;setSavedShareRequest(value)}
  const own:RecordItem[]=session.records.map(r=>({...r,person:r.person as Person,date:r.date??null}))
  const sharedEvidence:RecordItem[]=session.messages.filter(m=>m.shared).map(m=>({id:`shared:${m.id}`,person:m.author as Person,category:'Shared snapshot',text:m.text,date:null}))
  const careEvidence=session.carePreparation?.status==='ready'?(JSON.parse(session.carePreparation.evidence) as RecordItem[]):[]
  const appointmentSource:RecordItem={...appointmentEvidence,person:session.me?.name as Person,date:appointmentEvidence.date}
  const evidenceSource=source?.id.startsWith('answer:')?source:own.find(r=>r.id===source?.id)??sharedEvidence.find(r=>r.id===source?.id)??(source?.id===appointmentEvidence.id?appointmentSource:null)
  const person=session.me?.name as Person
  const people=session.members.map(m=>m.name as Person)
  const family:Message[]=session.messages.filter(m=>m.audience==='family').map(m=>({id:String(m.id),author:m.author,text:m.text,shared:m.shared,mode:m.mode,proposal:m.proposal,created:m.created,sources:m.evidence?sharedEvidence.filter(e=>(JSON.parse(m.evidence!) as RecordItem[]).some(c=>c.id===e.id)):undefined}))
  const messages:Message[]=page==='family'?family:session.messages.filter(m=>m.audience==='private').map(m=>({id:String(m.id),author:m.author,text:m.text,mode:m.mode,proposal:m.proposal,created:m.created,sources:m.evidence?(JSON.parse(m.evidence) as RecordItem[]).map((r,i)=>({...r,id:`answer:${m.id}:${i}`,person})):m.sourceIds.length?own.filter(r=>m.sourceIds.includes(r.id)):undefined}))
  const talkingToKin=page==='family'&&endedKin!==family.at(-1)?.id&&kinFollowup(family,person,chatNow)
  const tasks:Task[]=[...session.tasks].sort((a,b)=>Number(!['open','accepted'].includes(a.status))-Number(!['open','accepted'].includes(b.status))||priorityRank[taskPriority(session,a.id,chatNow)]-priorityRank[taskPriority(session,b.id,chatNow)]).map(t=>({id:t.id,title:t.title,owner:t.ownerName as Person||null,status:t.status as Task['status']}))
  function navigate(next:Page){setPage(next);setSource(null);setError(false)}
  async function mutate(action:()=>Promise<void>){if(locked.current)return false;locked.current=true;setBusy(true);setToastError(false);try{await action();return true}catch(e){setToastError(true);setToast(e instanceof Error?e.message:'Unable to save this change.');return false}finally{locked.current=false;setBusy(false)}}
  async function ask(q:string){
    if(!q.trim()||locked.current||!session.connection)return
    const request=pending.current?.text===q&&pending.current.audience===(page==='family'?'family':'private')?pending.current:{id:crypto.randomUUID(),text:q,audience:page==='family'?'family':'private'}
    keepPending(request);setError(false);setToast('')
    const ok=await mutate(async()=>{
      const token=sessionStorage.getItem(tokenKey)
      const response=await fetch('/api/companion',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token??''}`},body:JSON.stringify({requestId:request.id,text:request.text,audience:request.audience})})
      const result=await response.json().catch(()=>({error:'Connection unavailable. Try again.'})) as {error?:string}
      if(!response.ok)throw Error(result.error??'The AI service is unavailable. Please retry.')
    })
    if(ok){keepPending(null);setInput('')}else{setError(true);setInput(q)}
  }
  function prepareSummary(){
    if(session.sharingPreference?.mode==='ask'){editSummary();return}
    if(session.sharingPreference?.mode!=='summaries'){setPendingHandoff('summary');setSharingChoice('summaries');setSharingSetup(true);return}
    void shareLatestSummary()
  }
  async function shareLatestSummary(){
    const answer=[...session.messages].reverse().find(m=>m.audience==='private'&&m.mode==='gemini'&&m.evidence&&m.sourceIds.length)
    const evidence=answer?JSON.parse(answer.evidence!) as {id:string;text:string}[]:[]
    const permitted=evidence.filter(e=>own.some(r=>r.id===e.id&&r.text.includes(e.text)))
    if(!permitted.length){setToastError(true);setToast('No current sourced summary to share. Ask Kin first.');return}
    if(!shareRequest.current)keepShareRequest(crypto.randomUUID())
    if(await mutate(()=>session.connection!.reducers.shareLatestSummary({requestId:shareRequest.current,messageId:answer!.id}))){keepShareRequest('');navigate('family');setToast('Summary shared.')}
  }
  function editSummary(){
    keepShareRequest('');setCareSharing(false);setIncludeAppointment(false)
    const answer=[...session.messages].reverse().find(m=>m.audience==='private'&&m.mode==='gemini'&&m.evidence&&m.sourceIds.length)
    const evidence=answer?JSON.parse(answer.evidence!) as {id:string;text:string}[]:[]
    const permitted=evidence.filter(e=>own.some(r=>r.id===e.id&&r.text.includes(e.text)))
    setSelected(permitted.length?permitted.map(e=>e.id):own.slice(0,8).map(r=>r.id))
    setExcerpts(Object.fromEntries(permitted.map(e=>[e.id,e.text])))
    setSharing(true)
  }
  function sharePreparation(){
    if(session.sharingPreference?.mode==='ask'){editPreparation();return}
    if(!session.sharingPreference){setPendingHandoff('visit');setSharingChoice('visits');setSharingSetup(true);return}
    void sendPreparedVisit()
  }
  async function sendPreparedVisit(){
    if(await mutate(()=>session.connection!.reducers.sharePreparedVisit({}))){setCareReview(false);navigate('family');setToast('Visit shared. Your family can offer help.')}
  }
  async function saveSharingPreference(){
    if(!await mutate(()=>session.connection!.reducers.setSharingPreference({mode:sharingChoice})))return
    setSharingSetup(false)
    if(pendingHandoff==='visit'&&sharingChoice!=='ask')await sendPreparedVisit()
    if(pendingHandoff==='summary'&&sharingChoice==='summaries')await shareLatestSummary()
    setPendingHandoff(null)
  }
  function editPreparation(){
    setCareReview(false);setCareSharing(true);setIncludeAppointment(false)
    const approved=careEvidence.filter(e=>own.some(r=>r.id===e.id&&r.text.includes(e.text)))
    setSelected([...new Set(approved.map(e=>e.id))]);setExcerpts(Object.fromEntries(approved.map(e=>[e.id,e.text])))
    setNote(['Please help with my visit.',questions.trim()].filter(Boolean).join('\n\n'));setSharing(true)
  }
  async function share(){
    if(!shareRequest.current)keepShareRequest(crypto.randomUUID())
    const approved=own.filter(r=>selected.includes(r.id))
    const ok=await mutate(()=>careSharing?session.connection!.reducers.shareCareBrief({recordIds:approved.map(r=>r.id),excerpts:approved.map(r=>excerpts[r.id]??r.text),note,includeAppointment,taskTitle}):session.connection!.reducers.shareSummary({requestId:shareRequest.current,recordIds:approved.map(r=>r.id),excerpts:approved.map(r=>excerpts[r.id]??r.text),note}))
    if(ok){keepShareRequest('');setSharing(false);navigate('family');setToast('Shared with your family.')}
  }
  async function createTask(){
    if(!taskRequest.current)keepTaskRequest(crypto.randomUUID())
    const ok=await mutate(()=>proposalMessage?session.connection!.reducers.confirmAiTask({messageId:BigInt(proposalMessage),title:taskTitle}):session.connection!.reducers.createTask({requestId:taskRequest.current,title:taskTitle}))
    if(ok){keepTaskRequest('');setProposal(false);setToast('Care task created.')}
  }
  async function refreshRecords(){await mutate(async()=>{const result=await session.connection!.procedures.refreshRecords({scenario});setSource(null);setSelected([]);setExcerpts({});setToast(`Records: ${result}`)})}
  async function sendHuman(){
    if(!input.trim())return
    const request=pending.current??{id:crypto.randomUUID(),text:input,audience:'family'}
    keepPending(request)
    if(await mutate(()=>session.connection!.reducers.postFamilyMessage({requestId:request.id,text:request.text}))){keepPending(null);setInput('');setError(false)}
  }
  function taskCard(t:Task){
    const row=session.tasks.find(r=>r.id===t.id)!,mine=row.owner===session.me?.identity,declined=row.declined.includes(session.me!.identity)
    return <div className="task-card" key={t.id}><ClipboardList size={20}/><div><strong>{t.title}</strong>{['open','accepted'].includes(t.status)&&<span className="kin-priority" data-priority={taskPriority(session,t.id,chatNow)}>{taskPriority(session,t.id,chatNow)}</span>}<p>{t.status==='open'?'Requested':t.status==='accepted'?`Accepted by ${t.owner}`:t.status==='completed'?`Completed by ${t.owner}`:'Cancelled'}{declined?' · You declined':''}</p></div>
    {t.status==='open'&&!declined&&<><button className="secondary" disabled={busy} onClick={()=>mutate(()=>session.connection!.reducers.claimTask({id:t.id}))}>I’ll help</button><button className="secondary" disabled={busy} onClick={()=>mutate(()=>session.connection!.reducers.declineTask({id:t.id}))}>Decline</button></>}
    {t.status==='accepted'&&mine&&<button className="secondary" disabled={busy} onClick={()=>mutate(()=>session.connection!.reducers.completeTask({id:t.id}))}>Mark complete</button>}
    {['open','accepted'].includes(t.status)&&[row.creator,row.owner].includes(session.me!.identity)&&<button className="secondary" disabled={busy} onClick={()=>mutate(()=>session.connection!.reducers.cancelTask({id:t.id}))}>Cancel request</button>}
    </div>
  }
  function messageTime(created?:bigint){return created?new Date(Number(created/1000n)).toLocaleString('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' CT':'Time unknown'}
  function modal(open:boolean,onOpenChange:(v:boolean)=>void,title:string,description:string,body:React.ReactNode) {return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="overlay kin-overlay"/><Dialog.Content className="dialog kin-dialog"><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description>{body}<Dialog.Close className="close" aria-label="Close dialog"><X size={20}/></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>}
  if(!session.me || session.status!=='ready')return <Welcome connection={session.connection} status={session.status}/>;
  return <div className={`kin-app ${page==='today'?'kin-app-today':'kin-app-interior'}`}><img className="kin-artwork" src="/figma/phthalo-artwork-hd.png" alt="" aria-hidden="true"/><div className="kin-optical-veil" aria-hidden="true"/><KinShell page={page} name={person} navigate={navigate}/>
  <main key={page} className={page==='today'?'kin-today-main':`kin-existing-main kin-page-${page}`}>{page!=='today'&&<header className="topbar"><div><span className="eyebrow">YOUR FAMILY, IN YOUR CORNER</span><h1>{page === 'private' ? 'My companion' : page === 'family' ? 'Family chat' : page === 'tasks' ? 'Care tasks' : page === 'records' ? 'My records' : 'Settings & privacy'}</h1></div><span className="privacy-tag">{(page === 'private'||page === 'records') ? <LockKeyhole size={14}/> : <Users size={14}/>} {(page === 'private'||page === 'records') ? 'Only you' : people.join(', ')}</span></header>}
  {page==='today'?<Today manageVisit={setVisitReview} plans={plans.cards} reviewPlan={reviewPlan} planError={plans.error} session={session} now={chatNow} navigate={navigate} review={()=>{setCareReview(true);void mutate(()=>session.connection!.reducers.reviewCare({}))}} retry={()=>void controller.check(true)} checking={controller.checking} error={controller.error}/>: (page === 'private' || page === 'family') ? <><div className="conversation" aria-live="polite">{page==='family'&&<FamilyCare session={session} mutate={mutate} busy={busy}/>}{page==='family'&&people.length===1&&<div className="record-connect"><strong>No one else has joined.</strong><p>Invite someone to help.</p><button className="secondary" onClick={()=>navigate('settings')}>Invite family</button></div>}{page==='private'&&(!session.recordConnection||!['ready','partial','empty'].includes(session.recordConnection.status))&&<section className="record-connect" role="status"><strong>{session.recordConnection?`Records ${session.recordConnection.status}`:'Connect your records'}</strong><p>{session.recordConnection?'Kin cannot use your records until the connection is available.':'Connect your synthetic record source to ask Kin about your health history.'}</p><button className="secondary" onClick={()=>navigate('records')}>Open records</button></section>}{page==='private'&&plans.card&&<section className="record-connect"><strong>{plans.card.kind==='trip'?'Get ready for your trip':'After your visit'}</strong><p>{plans.card.summary||'Preparing your next steps…'}</p><button className="secondary" onClick={()=>reviewPlan()}>Review plan</button></section>}{page==='private'&&<CareActions session={session} mutate={mutate} busy={busy}/>} {page==='private'&&!plans.card&&<ForYou controller={controller} identity={session.me.identity} name={person} connectionRevision={String(session.recordConnection?.revision??0n)} connectionStatus={session.recordConnection?.status??''} card={session.carePreparation} tasks={session.tasks} review={()=>{setCareReview(true);void mutate(()=>session.connection!.reducers.reviewCare({}))}} share={sharePreparation} dismiss={()=>mutate(()=>session.connection!.reducers.dismissCare({}))} busy={busy}/>} {messages.length === 0 ? <section className="welcome"><div className="welcome-mark"><Sparkles size={31}/><span>✦</span></div><span className="eyebrow">A LITTLE CLARITY. A LITTLE SUPPORT.</span><h2>{page === 'private' ? `Hi ${person}. Let’s make\ncare feel a little simpler.` : 'Your family conversation'}</h2><p>{page === 'private' ? 'Understand what’s in your records, collect your questions,\nand bring your people in when you’re ready.' : 'Send a message or request help.'}</p><div className="starter-list">{(page === 'private' ? starters : ['What has been shared with our family?']).map(q=><button key={q} onClick={()=>void ask(page==='family'?'@Kin '+q:q)}>{q}<ArrowUpRight size={16}/></button>)}</div><span className="welcome-foot"><LockKeyhole size={12}/>{page === 'private' ? 'This conversation is only visible to you.' : 'Only approved summary snapshots are used here.'}</span></section> : <div className="message-list">{messages.map(m=><article className={`message ${m.author === 'Kin companion' ? 'assistant' : 'human'}`} key={m.id}><span className="avatar">{m.author === 'Kin companion' ? <Sparkles size={17}/> : m.author[0]}</span><div><div className="message-author">{m.author}<span>{m.author === 'Kin companion' ? m.mode==='conversation'?'Conversation':m.mode==='gemini'?'Sourced answer':m.mode==='policy'?'Access & record status':'Earlier scripted demo' : m.shared ? 'Shared snapshot · '+messageTime(m.created) : messageTime(m.created)}</span></div>{m.shared&&m.text.includes('Personal note:\n')?<><blockquote>{m.text.split('Personal note:\n')[0]}</blockquote><p><strong>Personal note</strong><br/>{m.text.split('Personal note:\n').slice(1).join('Personal note:\n')}</p></>:<AnswerText text={m.text}/>}{m.sources && <div className="sources">{m.sources.map(r=><button key={r.id} onClick={()=>setSource(r)}><ShieldCheck size={13}/>{r.category}<ArrowUpRight size={13}/></button>)}</div>}{m.proposal && <button className="secondary" disabled={busy} onClick={()=>{keepTaskRequest('');setProposalMessage(m.id);setTaskTitle(m.proposal!);setProposal(true)}}><Plus size={15}/> Review care task</button>}{m.shared && <small>Approved snapshot · Underlying private records remain private.</small>}</div></article>)}</div>}{busy && <div className="status" role="status">Working…</div>}{error && <div className="error" role="alert">Couldn’t answer. Your question is saved. <button onClick={()=>ask(input)}>Retry</button></div>}{page === 'family' && <div className="inline-tasks">{tasks.map(taskCard)}{<button className="secondary" onClick={()=>{keepTaskRequest('');setProposalMessage(null);setProposal(true)}}><Plus size={16}/> Request help</button>}</div>}</div><div className="composer-area">{page === 'private' && messages.some(m=>m.sources?.length) && <button className="share-shortcut" onClick={prepareSummary}><Users size={16}/> Share latest summary<ArrowUpRight size={15}/></button>}{talkingToKin&&<button className="secondary" onClick={()=>setEndedKin(family.at(-1)?.id??null)}>Back to family</button>}<form className="composer" onSubmit={e=>{e.preventDefault();void (page==='family'&&!mentionsKin(input)&&!talkingToKin?sendHuman():ask(input))}}><input aria-label={page==='family'?'Message your family':'Ask Kin'} placeholder={page === 'private' ? 'Ask Kin…' : talkingToKin?'Reply to Kin…':'Message family. Say Kin for help…'} value={input} onChange={e=>{keepPending(null);setInput(e.target.value)}}/><button aria-label="Send message" disabled={busy || !input.trim()}><ArrowUp size={20}/></button></form><p className="composer-caption"><span><Sparkles size={12}/> {page==='family'?talkingToKin?'Replying to Kin · Visible to family':'Say Kin for help · Medical records stay private':session.recordConnection ? !['ready','partial','empty'].includes(session.recordConnection.status)?('Records '+session.recordConnection.status):session.recordConnection.scenario==='detailed-care-demo'?'Authored synthetic records':'FinchNode synthetic records' : 'Connect records for medical questions'}</span><span>{page==='family'?'New members can read earlier history.':'Synthetic records'}</span></p></div></> : page === 'records' ? <><details className="kin-sandbox-tools"><summary>Sandbox connection</summary><SandboxConnect session={session} mutate={mutate} busy={busy}/></details><Records records={own} connection={session.recordConnection} scenario={scenario} setScenario={setScenario} refresh={refreshRecords} busy={busy} inspect={setSource}/></> : page === 'tasks' ? <section className="page-content"><h2>Family requests</h2><p>Completion tracks help, not medical care.</p>{tasks.length ? tasks.map(taskCard) : <div className="empty"><ClipboardList size={28}/><h3>No care tasks yet</h3><p>Propose one here or after sharing a care summary.</p></div>}<button className="primary" disabled={busy} onClick={()=>{keepTaskRequest('');setProposalMessage(null);setProposal(true)}}><Plus size={17}/> Request help</button></section> : <section className="page-content"><h2>Your information. Your choice.</h2><div className="settings-row"><ClipboardList/><div><h3>Automatic check-ins</h3><p>Kin can schedule preparation reminders and a short travel check-in. Private, in-app, and easy to stop.</p><label><input type="checkbox" checked={session.autoCarePreference?.enabled??false} disabled={busy} onChange={e=>void mutate(()=>session.connection!.reducers.setAutoCare({enabled:e.target.checked}))}/> Let Kin manage my check-ins</label></div></div><button className="secondary" onClick={session.signOut}>Switch profile</button><div className="settings-row"><Users/><div><h3>Family sharing</h3><p>{session.sharingPreference?.mode==='summaries'?'Visit details, help requests and sourced summaries':session.sharingPreference?.mode==='visits'?'Visit details and help requests':'Choose information for each share'}. Private chat and personal questions stay private.</p><button className="secondary" onClick={()=>{setPendingHandoff(null);setSharingChoice(session.sharingPreference?.mode??'visits');setSharingSetup(true)}}>Change sharing</button></div></div><div className="settings-row"><ShieldCheck/><div><h3>Share a snapshot, keep records private</h3><p>Family membership grants no access to another person’s private records. Shared summaries are fixed snapshots sent using your sharing choice. Revoking future access cannot erase information someone has already seen.</p></div></div><div className="settings-row"><Users/><div><h3>Family members</h3><p>Authenticated local sessions. Shared care updates immediately; private records stay scoped to their owner.</p>{session.members.map(m=><div className="member-row" key={m.identity}>{m.name} · {m.role}{session.me?.role === 'owner' && m.identity !== session.me.identity && <button className="secondary" disabled={busy} onClick={()=>mutate(()=>session.connection!.reducers.revokeMember({identity:m.identity}))}>Remove access</button>}</div>)}{session.me?.role === 'owner' && <><label htmlFor="invite-name">Invite a fictional family member</label><select id="invite-name" value={people.includes(inviteName as Person) ? ['Daniel','Alex','Maya','Bruce','Martha','Thomas'].find(n=>!people.includes(n as Person)) ?? '' : inviteName} onChange={e=>setInviteName(e.target.value)}>{['Daniel','Alex','Maya','Bruce','Martha','Thomas'].filter(n=>!people.includes(n as Person)).map(n=><option key={n}>{n}</option>)}</select><button className="secondary" disabled={busy||people.length>=3} onClick={()=>mutate(()=>session.connection!.reducers.createInvite({code:crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-',''),name:people.includes(inviteName as Person) ? ['Daniel','Alex','Maya','Bruce','Martha','Thomas'].find(n=>!people.includes(n as Person)) ?? '' : inviteName}))}>Create single-use invite</button>{session.invites.filter(i=>!i.used).map(i=><div className="invite-code" key={i.code}><strong>{i.name} · expires {new Date(Number(i.expires / 1000n)).toLocaleString('en-US', {timeZone:'America/Chicago'})} CT</strong><input aria-label={`Invite code for ${i.name}`} readOnly value={i.code}/><small>Copy into a separate browser session. This code grants family membership.</small></div>)}</>}<p>Records can be fetched from the public FinchNode synthetic demo in My records. Kin explains sourced records and prepares care plans. The synthetic appointment brief appears in My companion. Voice comes later. Profiles are saved on this device. There is no password or cross-device recovery.</p></div></div></section>}</main>
  {modal(evidenceSource !== null,open=>{if(!open)setSource(null)},'Record evidence',evidenceSource?.id.startsWith('answer:')?'Saved answer excerpt · source dates are preserved.':evidenceSource?.id.startsWith('shared:')?'Approved family snapshot · private source records are not included.':'Synthetic record · only visible in your private space.',evidenceSource && <><span className="evidence-category">{evidenceSource.category}</span><p>{evidenceSource.text}</p>{!evidenceSource.id.startsWith('shared:')&&<dl><dt>Clinical record date</dt><dd>{evidenceSource.date ?? 'Unavailable'}</dd></dl>}{!evidenceSource.id.startsWith('shared:')&&<Provenance record={evidenceSource}/>}</>)}
  {modal(sharingSetup,setSharingSetup,'Family sharing',`Whole family: ${people.join(', ')}. New members can read earlier history.`,<><p>Choose once. Change it anytime in Settings.</p><label className="field-label" htmlFor="sharing-choice">What can Kin share?</label><select id="sharing-choice" value={sharingChoice} onChange={e=>setSharingChoice(e.target.value)}><option value="visits">Visit details and help requests</option><option value="summaries">Medical summaries too</option><option value="ask">Choose each time</option></select><p className="fine-print">Visit sharing includes the appointment and a preparation request. Medical summaries include exact sourced excerpts. Private chat, personal questions and raw documents stay private. Existing shares remain in family history.</p><div className="dialog-actions"><Dialog.Close className="secondary">Cancel</Dialog.Close><button className="primary" disabled={busy} onClick={saveSharingPreference}>{pendingHandoff&&sharingChoice!=='ask'?'Save and share':'Save preference'}</button></div></>)}
  {modal(sharing,setSharing,'Choose what to share',`Post a snapshot to Family chat. Recipients: ${people.filter(p=>p !== person).join(' and ') || 'No other family members yet'}.`,<><div className="share-options">{careSharing&&<label><input type="checkbox" checked={includeAppointment} onChange={e=>setIncludeAppointment(e.target.checked)}/><span><strong>Include the synthetic appointment details</strong><p>{appointmentEvidence.text}</p></span></label>}{(careSharing?own.filter(r=>careEvidence.some(e=>e.id===r.id)):own).map(r=><label key={r.id}><input type="checkbox" checked={selected.includes(r.id)} disabled={!selected.includes(r.id)&&selected.length>=20} onChange={e=>setSelected(prev=>e.target.checked ? [...prev,r.id] : prev.filter(v=>v !== r.id))}/><span><strong>{r.category}</strong><blockquote>{excerpts[r.id] ?? r.text}</blockquote><small>Record date: {r.date ?? 'unavailable'}</small></span></label>)}</div>{careSharing&&<><label className="field-label" htmlFor="share-task">Request help</label><input id="share-task" value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} maxLength={200}/></>}<label className="field-label" htmlFor="note">Personal note</label><textarea id="note" value={note} onChange={e=>{keepShareRequest('');setNote(e.target.value)}}/><p className="fine-print">{careSharing?'Creates the request shown above. ':''}Shared with the whole family. New members can read earlier family history. Record quotes are unchanged; your note is separate.</p><div className="dialog-actions"><Dialog.Close className="secondary">Cancel</Dialog.Close><button className="primary" disabled={busy||(careSharing&&!taskTitle.trim())||(!selected.length && !note.trim()&&!includeAppointment)} onClick={share}>Share with family</button></div></>)}
  {modal(!!visitReview,value=>{if(!value)setVisitReview('')},'Family visit','Synthetic reservation · No real provider was contacted.',selectedVisit?<><h3>{selectedVisit.patientName}’s visit</h3><p>Demo Community Clinic · Primary care</p><p>{new Date(selectedVisit.slot).toLocaleString('en-US',{timeZone:'America/Chicago',dateStyle:'full',timeStyle:'short'})} CT</p><p>Arranged by {selectedVisit.organizerName}</p><p>{selectedVisit.status==='cancelled'?'Cancelled':'Confirmed sandbox reservation'}</p>{session.reminders.filter(r=>r.id===`auto-care:family-visit:${selectedVisit.id}`).map(r=><p key={r.id}>Preparation reminder: {new Date(Number(r.dueAt/1000n)).toLocaleString('en-US',{timeZone:'America/Chicago',dateStyle:'medium',timeStyle:'short'})} CT · {r.status}</p>)}<div className="dialog-actions"><Dialog.Close className="secondary">Close</Dialog.Close>{selectedVisit.status!=='cancelled'&&[selectedVisit.patient,selectedVisit.organizer].includes(session.me.identity)&&<button className="primary" disabled={busy} onClick={()=>void mutate(()=>session.connection!.reducers.cancelFamilyVisit({id:selectedVisit.id}))}>Cancel sandbox visit</button>}</div></>:<p>This visit is no longer available.</p>)}
  {modal(careReview,setCareReview,'Your appointment brief',`Only you · synthetic appointment on ${demoAppointment.display}.`,<><AppointmentBrief evidence={careEvidence} automated={session.autoCarePreference?.enabled??false} busy={busy} enable={()=>void mutate(()=>session.connection!.reducers.setAutoCare({enabled:true}))}/><AutomationStatus session={session} visitId={demoAppointment.id} busy={busy} stop={id=>void mutate(()=>session.connection!.reducers.updateReminder({id,action:'cancel'}))}/><label className="field-label" htmlFor="questions">My questions</label><textarea id="questions" placeholder="What would you like to ask?" value={questions} onChange={e=>setQuestions(e.target.value)}/><small>Saved on this device. Private until you share.</small><div className="sources">{[...new Set(careEvidence.map(e=>e.id))].map(id=>{const r=careEvidence.find(e=>e.id===id)!;return <button key={id} onClick={()=>{setCareReview(false);setSource(r)}}><ShieldCheck size={13}/>{r.category} · inspect evidence</button>})}</div>{session.carePreparation?.warnings.map((w,i)=><p className="record-warning" key={i}>{w}</p>)}<div className="dialog-actions"><Dialog.Close className="secondary">Close</Dialog.Close>{session.carePreparation?.sharedMessage===undefined&&<button className="primary" onClick={sharePreparation}>Share visit with family</button>}</div></>)}
  {modal(proposal,setProposal,'Confirm care task','A proposal becomes a task only when you confirm.',<><label htmlFor="task-title">What help do you need?</label><input id="task-title" value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} maxLength={200}/><p>Requested until someone accepts. Completion records coordination, not proof of medical care.</p><div className="dialog-actions"><Dialog.Close className="secondary">Cancel</Dialog.Close><button className="primary" disabled={busy||!taskTitle.trim()} onClick={createTask}>Create task</button></div></>)}
  <PlanReview openRecords={()=>navigate('records')} id={reviewedPlanId} session={session} controller={plans} open={planReview} setOpen={setPlanReview} mutate={mutate} busy={busy}/>
  {toast && <div className="toast" role="status">{toastError?<AlertCircle size={17}/>:<Check size={17}/>} {toast}<button onClick={()=>setToast('')} aria-label="Dismiss notification"><X size={16}/></button></div>}
  </div>
}












