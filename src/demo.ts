export type Person = 'Daniel' | 'Alex' | 'Maya' | 'Bruce' | 'Martha' | 'Thomas'
export type RecordItem = { id: string; person: Person; category: string; text: string; date: string | null; provenance?: string }
export type Message = {created?:bigint; id: string; author: string; text: string; sources?: RecordItem[]; shared?: boolean; mode?: string; proposal?: string }
export type Task = { id: string; title: string; owner: Person | null; status: 'open' | 'accepted' | 'completed' | 'cancelled' }
export const people: Person[] = ['Daniel', 'Alex', 'Maya']
export const records: RecordItem[] = [
  { id: 'fixture-med-1', person: 'Daniel', category: 'Medications', text: 'Medication list documents lisinopril. Current use has not been independently confirmed.', date: '2026-09-25' },
  { id: 'fixture-allergy-1', person: 'Daniel', category: 'Allergies', text: 'Penicillin allergy documented; reaction recorded as rash.', date: '2026-08-12' },
  { id: 'fixture-appt-1', person: 'Daniel', category: 'Appointment', text: 'Primary care follow-up scheduled for October 6, 2026, at 10:00 AM America/Chicago.', date: null },
  { id: 'fixture-alex-1', person: 'Alex', category: 'Appointment', text: 'Annual wellness visit scheduled for October 20, 2026.', date: '2026-09-30' },
]
export const fixtureAdapter = {
  async answer(person: Person, audience: 'private' | 'family', question: string, shared: Message[]): Promise<Omit<Message, 'id'>> {
    await new Promise(resolve => setTimeout(resolve, 550))
    const other = people.find(p => p !== person && question.toLowerCase().includes(p.toLowerCase()))
    if (audience === 'family') {
      if (/record|unshared|ignore|private/i.test(question)) return { author: 'Kin companion', text: 'Access denied · Private source records are not available in the family space. I can only use explicitly posted summary snapshots.' }
      const snapshots = shared.filter(m => m.shared)
      return { author: 'Kin companion', text: snapshots.length ? `From the shared snapshot only:\n${snapshots.map(m => m.text).join('\n\n')}\n\nThe underlying private records are not accessible here.` : 'No care summary has been shared yet. Ask the person to preview and share one first.' }
    }
    if (other) return { author: 'Kin companion', text: `Access denied · ${other}’s private records are not available to ${person}. Family membership does not grant record access.` }
    if (/blood|missing/i.test(question) || person === 'Maya') return { author: 'Kin companion', text: 'No matching information was found in these synthetic fixtures. Missing documentation is not evidence that a condition or allergy is absent.' }
    const sources = records.filter(r => r.person === person)
    return { author: 'Kin companion', text: `Here’s what is documented for you:\n\n${sources.map(r => r.text).join('\n\n')}\n\nBlood type is not documented. Bring questions about accuracy or current use to your care team.`, sources }
  },
}
