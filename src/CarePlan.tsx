import {AutomationStatus} from './AutomationStatus'
import {guidanceFor} from '../spacetimedb/spacetimedb/src/travel'
import type { usePlans } from './usePlans';
import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { Snapshot } from './session';
import type { DbConnection } from './module_bindings';
import { steps, type Plan } from '../spacetimedb/spacetimedb/src/automation';
import { useDeviceDraft } from './device';
function recordDate(value:string){return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value)?value+'T12:00:00':value).toLocaleDateString()}

type Session = Snapshot & {
    connection: DbConnection | null;
};
export function PlanReview({ id, session, controller, open, setOpen, mutate, busy, openRecords }: {
    openRecords: () => void;
    id: string;
    session: Session;
    controller: ReturnType<typeof usePlans>;
    open: boolean;
    setOpen: (value: boolean) => void;
    mutate: (action: () => Promise<void>) => Promise<boolean>;
    busy: boolean;
}) {
    const found = session.carePlans.find(p => p.id === id);
    const row = found && (['ready','partial','empty'].includes(session.recordConnection?.status??'') || (found.kind==='trip' && (JSON.parse(found.evidence) as {category:string}[]).every(e=>e.category==='Trip'))) ? found : undefined;
    const [selected, setSelected] = useState(''), [handoff, setHandoff] = useState(''), [includeSource, setIncludeSource] = useState(false);
    const [time, setTime] = useDeviceDraft(session.me!.identity, 'planReminderTime', '');
    let plan: Plan | undefined;
    try {
        if (row?.plan)
            plan = JSON.parse(row.plan);
    }
    catch { /* Failed plans never render partial output. */ }
    async function share(kind: string, approve = false, includeQuote = false) { if (!row)
        return; if (await mutate(() => session.connection!.reducers.sharePlanStep({ id: row.id, kind, approve, includeSource: includeQuote })))
        setHandoff(''); }
    return <Dialog.Root open={open} onOpenChange={value => { setOpen(value); if (!value) {
        setSelected('');
        setHandoff('');
    } }}><Dialog.Portal><Dialog.Overlay className="overlay kin-overlay"/><Dialog.Content className="dialog kin-dialog kin-plan-dialog"><Dialog.Close className="close" aria-label="Close"><X size={20}/></Dialog.Close><Dialog.Title>{row?.kind === 'trip' ? 'Get ready for your trip' : 'After your visit'}</Dialog.Title><Dialog.Description>{row?.kind === 'trip' ? 'Your upcoming trip' : 'Your recent follow-up instructions'} · Only you.</Dialog.Description>{!row ? <p>This plan is no longer available. Check your current records.</p> : !plan ? <><p>{row.status === 'preparing' || controller.checking ? 'Preparing your plan…' : 'Your plan could not be prepared.'}</p><button className="primary" disabled={controller.checking} onClick={() => void controller.check(true)}>Try again</button></> : <><p>{plan.summary}</p>{row.kind==='follow-up'&&<section className="plan-guidance"><h3>From your visit</h3>{(JSON.parse(row.evidence) as {id:string;category:string;text:string;date:string|null}[]).filter(e=>/^(Follow-up|Care plan|Discharge instructions)$/i.test(e.category)).map(e=><div key={e.id}><small>{e.category} · {e.date?recordDate(e.date):'Date unknown'}</small><details><summary>Read the written instructions</summary><blockquote>{e.text}</blockquote></details>{/no daily sodium target/i.test(e.text)&&<p>No daily sodium target is recorded.</p>}{/no .*next.visit date|next.visit date is documented/i.test(e.text)&&<p>No next-visit date is recorded.</p>}{/no new prescription/i.test(e.text)&&<p>No new prescription or dosing change is recorded.</p>}</div>)}</section>}{row.kind==='trip'&&<section className="plan-guidance"><h3>Good to know</h3><p>General travel guidance · Separate from your medical records.</p>{guidanceFor(JSON.parse(row.evidence)).filter(g=>!plan.guidance?.length||plan.guidance.includes(g.id)).map(g=><article key={g.id}><h4>{g.title}</h4><p>{g.text}</p><a href={g.url} target="_blank" rel="noreferrer">CDC source ↗</a><small>Source checked Oct 4, 2026 · {g.habit?'Optional daily check-in':'Information, not a recurring reminder'}</small></article>)}</section>}<section className="plan-auto-care"><label><input type="checkbox" checked={session.autoCarePreference?.enabled??false} disabled={busy} onChange={e=>void mutate(()=>session.connection!.reducers.setAutoCare({enabled:e.target.checked}))}/> Let Kin manage my check-ins</label><p>Saved for your plans. Kin schedules actionable preparation steps. Trips can include one private safe-water check-in a day for the first 7 days from departure. Cancel any check-in to stop it. Appears in Kin while open or when you return.</p>{session.autoCarePreference?.enabled&&<small>Family sees only what you share. A check-in records your response, not proof of medical care.</small>}</section><AutomationStatus session={session} planId={row.id} busy={busy} stop={id=>void mutate(()=>session.connection!.reducers.updateReminder({id,action:'cancel'}))}/><h3>Things to do</h3>{row.kind==='trip'&&!['ready','partial','empty'].includes(session.recordConnection?.status??'')&&<button className="secondary" onClick={()=>{setOpen(false);openRecords()}}>Connect medical records</button>}{row.status === 'handled' && <p className="plan-status">You’ve finished this checklist.</p>}<div className="plan-items">{plan.items.map(item => {
                const done = row.completed.includes(item.kind), task = session.tasks.find(t => t.id === `plan-task:${row.id}:${item.kind}`), source = (JSON.parse(row.evidence) as {
                    id: string;
                    category: string;
                    date: string | null;
                }[]).find(e => e.id === item.recordId);
                return <section key={item.kind} className="plan-item"><h3>{steps[item.kind]}</h3><small>{item.remind?'Kin can remind you to follow through':'No automatic reminder'}</small>{item.detail?<p>{item.detail}</p>:item.kind==='travel'?<div><p>Questions to prepare for a travel-health visit:</p><ul><li>What health precautions apply to my destination and travel dates?</li><li>Are any vaccinations or other preparations needed, and when should I arrange them?</li><li>What health documents should I bring?</li></ul></div>:null}<details><summary>Why this step</summary><blockquote>{item.quote}</blockquote><small>{source?.category} · Record date: {source?.date ? recordDate(source.date) : 'unknown'}</small></details>{!row.shared.includes(item.kind) && session.sharingPreference && session.sharingPreference.mode !== 'ask' && <details><summary>Family request preview · {session.members.filter(m => m.identity !== session.me!.identity).map(m => m.name).join(', ') || 'Family group'}</summary><p>Please help me: {steps[item.kind]}.</p>{session.sharingPreference.mode === 'summaries' && <><blockquote>{item.quote}</blockquote><small>{source?.category} · Record date: {source?.date ?? 'unknown'}</small></>}<small>New members can see earlier group history.</small></details>}{done ? <p className="plan-status">You marked this done.</p> : <div className="plan-actions"><button className="secondary" disabled={busy} onClick={() => void mutate(() => session.connection!.reducers.completePlanStep({ id: row.id, kind: item.kind }))}>Mark done</button><button className="secondary" disabled={busy} onClick={() => setSelected(selected === item.kind ? '' : item.kind)}>Remind me</button>{!row.shared.includes(item.kind) && <button className="secondary" disabled={busy} onClick={() => { if (!session.sharingPreference || session.sharingPreference.mode === 'ask') {
                    setIncludeSource(false);
                    setHandoff(item.kind);
                }
                else
                    void share(item.kind, false, session.sharingPreference.mode === 'summaries'); }}>Ask family to help</button>}</div>}{task && <p className="plan-status">{task.status === 'accepted' ? `${task.ownerName} is helping` : task.status === 'completed' ? `${task.ownerName} marked their help done` : task.status === 'cancelled' ? 'Family request cancelled' : 'Waiting for family help'}</p>}{selected === item.kind && !done && <div className="plan-reminder"><label htmlFor="plan-reminder-time">When · your device’s local time</label><input id="plan-reminder-time" type="datetime-local" value={time} onChange={e => setTime(e.target.value)}/><small>Appears while Kin is open or when you return.</small><button className="primary" disabled={busy || !Number.isFinite(Date.parse(time))} onClick={() => void (async () => { if (await mutate(() => session.connection!.reducers.remindPlanStep({ id: row.id, kind: item.kind, dueAt: BigInt(Date.parse(time)) * 1000n })))
                    setSelected(''); })()}>Save reminder</button></div>}{handoff === item.kind && <div className="plan-handoff"><strong>To: {session.members.filter(m => m.identity !== session.me!.identity).map(m => m.name).join(', ') || 'Your family group'}</strong><p>Please help me: {steps[item.kind]}.</p><label><input type="checkbox" checked={includeSource} onChange={e => setIncludeSource(e.target.checked)}/> Include this record excerpt</label>{includeSource && <blockquote>{item.quote}</blockquote>}<small>{includeSource ? `${source?.category} · Record date: ${source?.date ?? 'unknown'}. ` : ''}New family members can see group history.</small><button className="primary" disabled={busy} onClick={() => void share(item.kind, true, includeSource)}>Send request</button><button className="secondary" onClick={() => setHandoff('')}>Cancel</button></div>}</section>;
            })}</div><small>Check-ins record what you report; they do not verify medical care.</small><div className="dialog-actions">{row.status !== 'handled' && <button className="secondary" disabled={busy} onClick={() => void (async () => { if (await mutate(() => session.connection!.reducers.updatePlan({ id: row.id, action: 'dismiss' })))
            setOpen(false); })()}>Dismiss plan</button>}</div></>}{controller.error && <p role="alert">{controller.error}</p>}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}
export function TripForm({ session, mutate, busy }: {
    session: Session;
    mutate: (action: () => Promise<void>) => Promise<boolean>;
    busy: boolean;
}) {
    const [open, setOpen] = useState(false), [notice, setNotice] = useState('');
    const [destination, setDestination] = useDeviceDraft(session.me!.identity, 'tripDestination', ''), [departure, setDeparture] = useDeviceDraft(session.me!.identity, 'tripDeparture', ''), [requestId, setRequestId] = useDeviceDraft(session.me!.identity, 'tripRequest', '');
    return <><button className="secondary" onClick={() => setOpen(!open)}>Add a trip</button>{notice && <p role="status">{notice}</p>}{session.records.some(r => r.category === 'Trip') && <details><summary>Your trips</summary>{session.records.filter(r => r.category === 'Trip').map(r => <div key={r.id}><p>{r.text}</p><button className="secondary" disabled={busy} onClick={() => void mutate(() => session.connection!.reducers.cancelTrip({ recordId: r.id }))}>Cancel trip preparation</button></div>)}</details>}{open && <div className="plan-trip"><h3>Where are you going?</h3><label htmlFor="trip-destination">Destination</label><input id="trip-destination" value={destination} maxLength={100} onChange={e => { setRequestId(''); setDestination(e.target.value); }}/><label htmlFor="trip-departure">Departure</label><input id="trip-departure" type="date" value={departure} onChange={e => { setRequestId(''); setDeparture(e.target.value); }}/><p>Only you. Kin can prepare a checklist within 45 days of departure.</p><button className="primary" disabled={busy || !destination.trim() || !departure} onClick={() => void (async () => { const id = requestId || crypto.randomUUID(); setRequestId(id); if (await mutate(() => session.connection!.reducers.saveTrip({ requestId: id, destination, departure: departure + 'T12:00:00Z' }))) {
        setRequestId('');
        const starts = Date.parse(departure + 'T12:00:00Z') - 45 * 86400000;
        setNotice(starts > Date.now() ? `Trip saved. Preparation begins ${new Date(starts).toLocaleDateString('en-US',{timeZone:'America/Chicago'})}.` : 'Trip saved. Your checklist is being prepared for Today.');
        setOpen(false);
    } })()}>Save trip</button><button className="secondary" onClick={() => setOpen(false)}>Cancel</button></div>}</>;
}
