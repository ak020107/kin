export type Evidence = { id:string; category:string; text:string; date:string|null }
export type HistoryEntry={messageId:string;author:string;text:string}
export const a1cGuideUrl='https://www.niddk.nih.gov/health-information/diagnostic-tests/A1C-test'
export type GroundedAnswer = {intent?:'records'|'conversation'|'reminder'|'planning';reply?:string;educationSources?:string[];explanations?:{text:string;recordIds:string[]}[];references?:{messageId:string;quote:string}[]; findings:{recordId:string;quote:string}[]; missing:string[]; taskProposal:string }
export const missingLabels:Record<string,string> = {
  hba1c:'I couldn’t find HbA1c results in your connected records, so I can’t compare them. You can review your records or ask your care team for the missing reports.',
  bloodType:'Blood type is not established by the retrieved record categories.',
  allergies:'No allergy information was found. This does not mean there are no allergies.',
  medications:'No medication information was found. This does not mean no medications are being used.',
  upcomingAppointment:'An upcoming appointment is not established. Historical encounters are not future appointments.',
}
export function validateAnswer(value:unknown,evidence:Evidence[],history:HistoryEntry[]=[]):GroundedAnswer {
  if(!value||typeof value!=='object')throw Error('Invalid structured answer')
  const v=value as GroundedAnswer
  if(!Array.isArray(v.findings)||v.findings.length>18||!Array.isArray(v.missing)||v.missing.length>4||!['none','prepareQuestions'].includes(v.taskProposal))throw Error('Invalid answer shape')
  const seen=new Set<string>()
  for(const finding of v.findings){
    const record=evidence.find(e=>e.id===finding.recordId)
    if(!record||seen.has(`${finding.recordId}\0${finding.quote}`)||typeof finding.quote!=='string'||finding.quote.length<8||finding.quote.length>1600||!record.text.includes(finding.quote))throw Error('Unverified citation or excerpt')
    seen.add(`${finding.recordId}\0${finding.quote}`)
  }
  if(v.missing.some(m=>!Object.prototype.hasOwnProperty.call(missingLabels,m))||new Set(v.missing).size!==v.missing.length)throw Error('Invalid missing-information claim')
  if(v.missing.includes('bloodType')&&evidence.some(e=>e.category==='Blood type'||(e.category==='Shared snapshot'&&e.text.includes('Blood type:'))))throw Error('Blood type evidence exists')
  if(v.missing.includes('hba1c')&&evidence.some(e=>/HbA1c|hemoglobin A1c|haemoglobin A1c/i.test(e.text)))throw Error('HbA1c evidence exists')
  if(v.missing.includes('allergies')&&evidence.some(e=>e.category==='Allergies'||(e.category==='Shared snapshot'&&e.text.includes('Allergies:'))))throw Error('Allergy evidence exists')
  if(v.missing.includes('medications')&&evidence.some(e=>e.category==='Medications'||(e.category==='Shared snapshot'&&e.text.includes('Medications:'))))throw Error('Medication evidence exists')
  if(v.missing.includes('upcomingAppointment')&&evidence.some(e=>(e.category==='Appointment'||e.category==='Appointment record'||(e.category==='Shared snapshot'&&e.text.includes('Appointment record:')))))throw Error('Appointment evidence exists')
  if(v.intent!==undefined&&!['records','conversation','reminder','planning'].includes(v.intent))throw Error('Invalid intent')
  if(v.intent&&v.intent!=='records'){
    if(v.findings.length||v.missing.length||typeof v.reply!=='string'||!v.reply.trim()||v.reply.length>1200)throw Error('Invalid conversational answer')
    if(!Array.isArray(v.references)||v.references.length>6)throw Error('Invalid conversation references')
    for(const ref of v.references){const entry=history.find(h=>h.messageId===ref.messageId);if(!entry||typeof ref.quote!=='string'||!ref.quote||!entry.text.includes(ref.quote))throw Error('Unverified conversation reference')}
    if(/\b(you have been diagnosed|you should take|increase your dose|decrease your dose|stop taking|your blood type is|you are allergic to)\b/i.test(v.reply))throw Error('Unsupported clinical claim')
    if(/\b(?:i|we)(?:'ve| have)?\s+(?:booked|scheduled|created|sent|set)\b|\b(i(?:'ll| will| have)|we(?:'ll| will| have))\s+(?:remind|notify|book|schedule|send|create|set)\b|(?<!no )\b(reminder|appointment|task) (?:is |has been )?(?:set|booked|scheduled|created)\b/i.test(v.reply))throw Error('Unsupported action claim')
    return {findings:[],missing:[],taskProposal:v.taskProposal,intent:v.intent,reply:v.reply.trim(),references:v.references}
  }
  if(!v.findings.length&&!v.missing.length)throw Error('Empty answer')
  if(v.educationSources!==undefined&&(!Array.isArray(v.educationSources)||v.educationSources.length>1||v.educationSources.some(url=>url!==a1cGuideUrl)||v.educationSources.length&&!v.findings.some(f=>/HbA1c|hemoglobin A1c/i.test(evidence.find(e=>e.id===f.recordId)?.text??''))))throw Error('Unsupported education source')
  if(v.explanations!==undefined){
    if(!Array.isArray(v.explanations)||v.explanations.length>8)throw Error('Invalid explanations')
    for(const block of v.explanations){
      if(typeof block.text!=='string'||!block.text.trim()||block.text.length>1800||!Array.isArray(block.recordIds)||!block.recordIds.length||block.recordIds.some(id=>!v.findings.some(f=>f.recordId===id)))throw Error('Explanation requires selected evidence')
      const selected=evidence.filter(e=>block.recordIds.includes(e.id))
      const numbers=(text:string)=>(text.match(/\d+(?:\.\d+)?/g)??[]).map(Number)
      const documented=new Set(selected.flatMap(e=>numbers(e.text+' '+(e.date??''))))
      if(v.educationSources?.includes(a1cGuideUrl)&&/\b3\s+months\b/i.test(block.text))documented.add(3)
      // A dated A1c comparison may state the arithmetic change in percentage points.
      if(/HbA1c/i.test(block.text)&&/percentage points/i.test(block.text)){
        const values=selected.map(e=>e.text.match(/HbA1c\s*[:=]?\s*(\d+(?:\.\d+)?)/i)?.[1]).filter((n):n is string=>!!n).map(Number)
        if(values.length===2)documented.add(Number(Math.abs(values[0]-values[1]).toFixed(6)))
      }
      if(numbers(block.text).some(n=>!documented.has(n)))throw Error('Unsupported number in explanation')
      if(/\b(you have been diagnosed|you should take|increase your dose|decrease your dose|stop taking|start taking|i have booked|i will book)\b/i.test(block.text))throw Error('Unsupported clinical or action claim')
    }
  }
  return {findings:v.findings.map(f=>({recordId:f.recordId,quote:f.quote})),missing:v.missing,taskProposal:v.taskProposal,explanations:v.explanations,educationSources:v.educationSources}
}
export function renderAnswer(answer:GroundedAnswer,evidence:Evidence[],audience:string){
  if(answer.intent&&answer.intent!=='records'){
    const capability=answer.intent==='reminder'&&!/cannot send notifications|notifications (?:are|aren.t) (?:not available|available)|cannot set reminders|no reminder has been set/i.test(answer.reply??'')?'No reminder has been saved yet. Review and save an in-app reminder in My companion. Kin cannot send notifications outside the app.':''
    return [answer.reply,capability].filter(Boolean).join('\n\n')
  }
  if(answer.explanations?.length)return [...answer.explanations.map(b=>b.text.trim()),...answer.missing.map(m=>missingLabels[m]),...(answer.educationSources??[]).map(url=>`General health information: ${url}`)].join('\n\n')
  const parts=[audience==='family'?'From approved family snapshots only:':'Here is the documented information selected for your question:']
  for(const f of answer.findings){const e=evidence.find(e=>e.id===f.recordId)!;parts.push(`${e.category}: ${f.quote}${audience==='private'?`\nRecord date: ${e.date??'unavailable'}`:''}`)}
  parts.push(...answer.missing.map(m=>missingLabels[m]))
  if(answer.findings.length)parts.push('These are documented excerpts, not confirmation of current use or a treatment recommendation. Check accuracy with your care team.')
  return parts.join('\n\n')
}


export function recordQuestion(text:string){if(/^(?:kin[, ]+|@kin\s+)?(?:(?:can|could) you )?(?:help me (?:prepare|write|make)|prepare|write|make|suggest)\b.*\bquestions\b/i.test(text.trim())||/^(?:kin[, ]+|@kin\s+)?what questions (?:should|can|could) (?:i|we) ask\b/i.test(text.trim()))return false;return /(?:all (?:of )?my data|my (?:medical|health) (?:data|history)|my data)|medicat|allerg|blood type|prescri|dosage|diagnos|treatment|\brecords?\b|documented|summariz|\blabs?\b|HbA1c|blood pressure|conditions|care plan|follow-up instructions|immuniz|vaccin|surgical|\bvitals\b/i.test(text)&&!/\bremind(?:er)?\b/i.test(text)}
