import {validateAnswer,renderAnswer,type Evidence,type GroundedAnswer} from './grounding'
export const demoAppointment={id:'synthetic-appointment-2026-10-06',title:'Synthetic primary-care appointment',startsAt:'2026-10-06T15:00:00Z',timeZone:'America/Chicago',display:'October 6, 2026 · 10:00 AM Chicago time',triggerAt:'2026-10-03T15:00:00Z'}
export function careDue(now:string){const value=Date.parse(now);return value>=Date.parse(demoAppointment.triggerAt)&&value<Date.parse(demoAppointment.startsAt)}
export const appointmentEvidence:Evidence={id:demoAppointment.id,category:'Appointment',text:`Synthetic demo appointment only: primary-care preparation on ${demoAppointment.display}. This is an authored demonstration fixture, not a booking or a FinchNode appointment record.`,date:'2026-10-06'}
export const careQuestion='Prepare a concise private appointment brief without a chat request. Use the synthetic Appointment entry, up to three documented medications, and every documented allergy. Use at most six findings, each quoting its evidence exactly. Do not claim a complete medication list. Include missing medications or allergies when that category has no records. Suggest preparation help using prepareQuestions. Do not diagnose, change treatment, infer medication use, or infer an appointment from historical encounters.'
export function validateCareAnswer(value:unknown,evidence:Evidence[]):GroundedAnswer{
  const answer=validateAnswer(value,evidence)
  if(answer.findings.length>6||!answer.findings.some(f=>f.recordId===demoAppointment.id))throw Error('Appointment evidence required in a concise brief')
  for(const category of ['Allergies','Medications']){
    const rows=evidence.filter(e=>e.category===category)
    if(!rows.length&&!answer.missing.includes(category==='Allergies'?'allergies':'medications'))throw Error('Missing records must be stated')
    if(category==='Allergies'&&rows.some(e=>!answer.findings.some(f=>f.recordId===e.id)))throw Error('Documented allergies must not be silently omitted')
  }
  return answer
}
export function renderCareBrief(answer:GroundedAnswer,evidence:Evidence[]){return renderAnswer(answer,evidence,'private').replace('Here is the documented information selected for your question:','Your synthetic appointment-preparation brief:')+'\n\nSelected excerpts only. Review My records for the full documentation and bring questions about accuracy to your care team.'}
