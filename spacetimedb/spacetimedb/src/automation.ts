import {guidanceFor} from './travel'
import type { Evidence } from './grounding';
// Small reusable vocabulary: the model chooses relevant work, never prescribes treatment.
export const steps = {
    questions: 'Write down questions for your care team',
    records: 'Gather the records you want to bring',
    instructions: 'Review the documented care instructions',
    supplies: 'Check medication supplies with your pharmacy',
    travel: 'Ask your care team about preparing for your trip',
    meals: 'Help prepare meals',
    logs: 'Gather the requested home log for the next visit',
} as const;
export type StepKind = keyof typeof steps;
export type Plan = {
    version?: number;
    guidance?: string[];
    summary: string;
    items: {
        kind: StepKind;
        recordId: string;
        quote: string;
        detail?: string;
        remind?: boolean;
    }[];
};
export function eventKey(e: Evidence) {
    // Content changes create a new event; a retrieval timestamp or revision does not.
    let hash = 2166136261;
    for (const c of `${e.category}|${e.date ?? ''}|${e.text}`)
        hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
    return `${e.category}-${hash.toString(16)}-${e.text.length}`;
}
export function candidates(evidence: Evidence[], now: string) {
    const time = Date.parse(now);
    return evidence.filter(e => {
        if (e.category === 'Trip')
            return !!e.date && Date.parse(e.date) > time && Date.parse(e.date) - time <= 45 * 86400000;
        if (!/^(Follow-up|Care plan|Discharge instructions)$/i.test(e.category) || !e.date)
            return false;
        const age = time - Date.parse(e.date);
        return age >= 0 && age <= 30 * 86400000;
    }).sort((a, b) => a.category === 'Trip' && b.category !== 'Trip' ? -1 : b.category === 'Trip' && a.category !== 'Trip' ? 1 : a.category === 'Trip' ? Date.parse(a.date!) - Date.parse(b.date!) : Date.parse(b.date!) - Date.parse(a.date!));
}
export function validatePlan(value: unknown, evidence: Evidence[], trip: boolean): Plan {
    const p = value as Plan;
    if (!p || typeof p.summary !== 'string' || !p.summary.trim() || p.summary.length > 800 || !Array.isArray(p.items) || !p.items.length || p.items.length > 4)
        throw Error('Invalid plan');
    // The summary explains organization, not clinical interpretation or medication instructions.
    if (/\b(diagnos|increase|decrease|stop taking|start taking|take \d|you should take|guarantee|booked|notification sent)/i.test(p.summary))
        throw Error('Unsupported action');
    const used = new Set<string>();
    for (const i of p.items) {
        if (!Object.prototype.hasOwnProperty.call(steps, i.kind) || used.has(i.kind) || (!trip && i.kind === 'travel'))
            throw Error('Invalid step');
        const source = evidence.find(e => e.id === i.recordId);
        if (!source || typeof i.quote !== 'string' || i.quote.length < 8 || i.quote.length > 2000 || !source.text.includes(i.quote))
            throw Error('Invalid evidence');
        if (i.kind === 'instructions' && !/^(Follow-up|Care plan|Discharge instructions)$/i.test(source.category))
            throw Error('No care instruction');
        if (i.kind === 'meals' && (!/^(Follow-up|Care plan|Discharge instructions)$/i.test(source.category) || !/meal|diet|sodium|nutrition/i.test(i.quote)))
            throw Error('No meal instruction');
        if (i.kind === 'logs' && (!/^(Follow-up|Care plan|Discharge instructions)$/i.test(source.category) || !/blood.pressure log/i.test(i.quote)))
            throw Error('No documented log request');
        if (i.kind === 'supplies' && !/Medication/i.test(source.category))
            throw Error('No medication record');
        if (i.kind === 'travel' && source.category !== 'Trip')
            throw Error('No trip');
        if (i.detail !== undefined && (typeof i.detail !== 'string' || !i.detail.trim() || i.detail.length > 600 || /\b(diagnos|increase|decrease|stop taking|start taking|take \d|you should take|guarantee|booked|notification sent)/i.test(i.detail)))
            throw Error('Unsupported step detail');
        used.add(i.kind);
    }
    if (!p.items.some(i => i.recordId === evidence[0]?.id))
        throw Error('Missing triggering evidence');
    const allowed=guidanceFor(evidence).map(g=>g.id as string)
    if(p.guidance!==undefined&&(!Array.isArray(p.guidance)||p.guidance.some(id=>typeof id!=='string'||!allowed.includes(id))||new Set(p.guidance).size!==p.guidance.length))throw Error('Unsupported guidance')
    if(p.items.some(i=>i.remind!==undefined&&typeof i.remind!=='boolean'))throw Error('Invalid reminder choice')
    return {version:3,guidance:p.guidance??[], summary: p.summary.trim(), items: p.items.map(i => ({ kind: i.kind, recordId: i.recordId, quote: i.quote, ...(i.detail ? {detail:i.detail.trim()} : {}),remind:i.remind===true })) };
}
