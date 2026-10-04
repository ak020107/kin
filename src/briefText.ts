// Keep allergy reactions visible even when they occupy a separate sentence.
export function briefText(category:string,text:string){
 const cleaned=text.replace(/^Synthetic (medication reconciliation lists|allergy record documents)\s*/i,'')
 const sentences=cleaned.split(/\.\s+(?=[A-Z])/)
 return category==='Allergies'?sentences.filter(s=>!/^Recorded status:/.test(s)).join('. '):sentences[0]
}
