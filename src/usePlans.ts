import { useEffect, useRef, useState } from 'react';
import { candidates, eventKey } from '../spacetimedb/spacetimedb/src/automation';
import { tokenKey } from './device';
import type { Snapshot } from './session';
import type { DbConnection } from './module_bindings';
type Session = Snapshot & {
    connection: DbConnection | null;
};
export function usePlans(session: Session, now: number) {
    const [error, setError] = useState(''), [checking, setChecking] = useState(false), running = useRef(false), queued = useRef(false);
    async function check(retry = false) {
        if (running.current) { queued.current = true; return; }
        running.current = true;
        setChecking(true);
        setError('');
        try {
            const response = await fetch('/api/care-plan', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem(tokenKey) ?? ''}` }, body: JSON.stringify({ retry }) });
            const result = await response.json();
            if (!response.ok)
                throw Error(result.error ?? 'Could not prepare your plan.');
            if (result.status === 'failed')
                setError('Your plan could not be prepared. Try again.');
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Could not prepare your plan.');
        }
        finally {
            running.current = false;
            setChecking(false);
            if (queued.current) { queued.current = false; void check(); }
        }
    }
    const identity = session.me!.identity, revision = String(session.recordConnection?.revision ?? 0n), status = session.recordConnection?.status, count = session.records.length, hasTrip = session.records.some(r=>r.category==='Trip'), planState = session.carePlans.map(p => `${p.id}:${p.status}`).sort().join('|');
    useEffect(() => { if (!['ready', 'partial', 'empty'].includes(status ?? '') && !hasTrip)
        return; void Promise.resolve().then(() => check()); const timer = setInterval(() => void check(), 60000); return () => clearInterval(timer); }, [identity, revision, status, count, hasTrip, planState]);
    const eligible = new Set(candidates(session.records.map(r => ({ ...r, date: r.date ?? null })), new Date(now).toISOString()).map(e => `${identity}:${eventKey(e)}`));
    const cards = session.carePlans.filter(p => (['ready','partial','empty'].includes(status??'') || (p.kind==='trip' && (JSON.parse(p.evidence) as {category:string}[]).every(e=>e.category==='Trip'))) && eligible.has(p.id) && ['ready', 'active', 'preparing', 'failed'].includes(p.status)).sort((a, b) => [...eligible].indexOf(a.id) - [...eligible].indexOf(b.id));
    return { cards, card: cards[0], error, checking, check };
}
