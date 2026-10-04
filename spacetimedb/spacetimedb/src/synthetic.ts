import {profileNames,scenarioProfile} from './profiles'
// Authored fictional records. This endpoint never reads profiles, tokens, or user data.
const senior:[string,string,string][]=[
 ['Profile','2026-09-28','Fictional senior care scenario: age 76. Primary-care team: Dr. Lee, Demo Community Clinic. Preferred language: English. Uses large print.'],
 ['Blood type','2025-04-15','Synthetic laboratory report documents ABO/Rh: O positive. Source: Demo Laboratory, specimen collected April 15, 2025.'],
 ['Conditions','2026-09-28','Synthetic problem list documents hypertension and type 2 diabetes. Reviewed by Demo Community Clinic on September 28, 2026.'],
 ['Conditions','2026-09-28','Synthetic problem list documents knee osteoarthritis and hearing difficulty. Current severity is not documented.'],
 ['Medications','2026-09-28','Synthetic medication reconciliation lists metformin 500 mg by mouth twice daily with meals. Recorded status: active. Current use is not independently confirmed. This is documentation, not dosing advice.'],
 ['Medications','2026-09-28','Synthetic medication reconciliation lists lisinopril 10 mg by mouth daily. Recorded status: active. Current use is not independently confirmed. This is documentation, not dosing advice.'],
 ['Medications','2026-09-28','Synthetic medication reconciliation lists atorvastatin 20 mg by mouth nightly. Recorded status: active. Current use is not independently confirmed. This is documentation, not dosing advice.'],
 ['Medications','2025-11-12','Synthetic historical prescription lists amoxicillin, recorded status: discontinued. It must not be presented as a current medication.'],
 ['Allergies','2018-06-11','Synthetic allergy record documents sulfonamide antibiotics; reaction: hives. Recorded status: active.'],
 ['Lab result','2026-09-25','Synthetic lab: HbA1c 7.4 percent. Lab reference interval: 4.0–5.6 percent. Specimen: September 25, 2026. No clinical interpretation or treatment recommendation is recorded here.'],
 ['Lab result','2026-09-25','Synthetic lab: creatinine 1.0 mg/dL; reported eGFR 78 mL/min/1.73 m². Lab reference interval for creatinine: 0.7–1.3 mg/dL. Specimen: September 25, 2026.'],
 ['Lab result','2026-03-20','Synthetic historical lab: HbA1c 7.1 percent. Specimen: March 20, 2026. Compare dates without inferring a diagnosis or treatment change.'],
 ['Vitals','2026-09-28','Synthetic clinic measurement: blood pressure 138/82 mmHg, pulse 74 beats/minute, weight 79 kg. Measured September 28, 2026; these are historical readings.'],
 ['Encounter','2026-09-28','Synthetic completed primary-care visit, September 28, 2026. Reason: diabetes follow-up and medication reconciliation. Clinician: Dr. Lee, Demo Community Clinic.'],
 ['Visit note','2026-09-28','Synthetic clinician note: patient reports difficulty keeping track of paperwork and wants help preparing questions. Family transport support was discussed. The note does not authorize family access.'],
 ['Follow-up','2026-09-28','Synthetic written visit instructions: discuss recent laboratory results and bring medication bottles and a home blood-pressure log to the next visit. For meals, the clinician advised choosing lower-sodium options. No daily sodium target or next-visit date is documented. No new prescription or dosing change is documented. These are fictional clinician instructions, not new recommendations from Kin.'],
 ['Immunization','2025-10-10','Synthetic immunization record: influenza vaccination documented October 10, 2025. This record does not establish whether another vaccination is due.'],
 ['Procedure','2022-05-09','Synthetic surgical history documents cataract surgery on May 9, 2022. No complication is recorded in this excerpt; it does not establish a complete surgical history.'],
 ['Care preference','2026-09-28','Synthetic preference note: provide a short written visit summary in large print. Ask before involving relatives.'],
 ['Document','2026-09-28','Synthetic document index: primary-care visit summary, dated September 28, 2026; medication reconciliation and follow-up instructions included. No original PDF attachment is available.']
]
const adult:[string,string,string][]=[
 ['Profile','2026-09-15','Fictional adult care scenario: age 42. Primary-care team: Demo Family Practice.'],
 ['Allergies','2026-09-15','Synthetic allergy record documents penicillin; reaction: rash. Recorded status: active.'],
 ['Encounter','2026-09-15','Synthetic completed annual wellness visit September 15, 2026 at Demo Family Practice.'],
 ['Vitals','2026-09-15','Synthetic clinic measurement: blood pressure 122/78 mmHg, pulse 68 beats/minute. These are historical readings.'],
 ['Care preference','2026-09-15','Synthetic preference note: prefers concise written instructions.'],
 ['Document','2026-09-15','Synthetic document index: wellness visit summary dated September 15, 2026. No original PDF attachment is available.']
]
export function syntheticRecords(profile:string){
 if(!profileNames.includes(profile))return null
 const rows=scenarioProfile(profile)==='Daniel'?senior:scenarioProfile(profile)==='Alex'?adult:[['Encounter','2026-08-02','Synthetic historical intake visit. Medication, allergy and blood type documentation are unavailable.']] as [string,string,string][]
 return {synthetic:true,environment:'demo',provider:'Kin authored simulation',scenario:'detailed-care-demo',subject:`kin-demo-${profile.toLowerCase()}`,displayName:`${profile} · authored synthetic scenario`,records:rows.map(([category,date,text],i)=>({id:`${profile.toLowerCase()}-${i+1}`,category,date,text})),warnings:['Authored simulation only. Not FinchNode data, real medical records, a booking, or a complete clinical history.']}
}
