import assert from 'node:assert/strict'
import {recordQuestion,validateAnswer,renderAnswer} from '../spacetimedb/spacetimedb/src/grounding'
import {mentionsKin,kinFollowup} from '../src/mentions'
import {briefText} from '../src/briefText'
let checks=0
const check=(fn:()=>void)=>{fn();checks++}
for(const prompt of [
 'Show all of my data','Can you show me all of my data?', 'What is my blood type?',
 'What allergies are documented?', 'Compare my two HbA1c results', 'Show my blood pressure readings',
 'What medication is in my record?', 'Show my prescriptions', 'Summarize my medical history',
 'Show my health history','What do my labs say?', 'What are the follow-up instructions?',
 'Show my immunizations','Show my surgical history','What conditions are documented?',
 'What is in my care plan?', 'Show my vitals', 'What dosage was recorded?',
])check(()=>assert(recordQuestion(prompt),prompt))
for(const prompt of [
 'Alex, can you pick up groceries for Dad?', 'I can cook dinner on Tuesday.',
 'Can you remind me to bring my medication bottles?', 'Set a reminder for my blood pressure log',
 'Help me prepare questions for my doctor about my HbA1c results',
 'Prepare questions about my medications', 'Kin, suggest questions about my lab results',
 'Write questions about my allergies for my next visit',
 'Can you help arrange a visit for Dad?', 'Who is helping Dad this week?',
 'I am going to India next month', 'What should I bring?', 'What did Alex say?',
 'What do you mean?', 'Yes, please', 'Thanks for explaining',
 'Can you help me prepare questions about my medications?',
 'Could you suggest questions about my lab results?',
 'What questions should I ask about my HbA1c?',
 'Kin, what questions can we ask about my blood pressure?',
 'Write questions about my care plan',
 'Make questions about my treatment for the doctor',
])check(()=>assert(!recordQuestion(prompt),prompt))
for(const prompt of ['Kin, help plan Dad’s visit','@kin can you help?','Can Kin help us?','Thanks, @KIN!'])check(()=>assert(mentionsKin(prompt),prompt))
for(const prompt of ['I can drive Dad','Alex, can you collect the prescription?','Thanks Alex','@kind','person@kin.com','@kin-helper','@kin_name'])check(()=>assert(!mentionsKin(prompt),prompt))
const now=Date.now(),created=BigInt(now)*1000n
const exchange=[{author:'Daniel',created},{author:'Kin companion',created}]
for(const [name,time,result] of [['Daniel',now,true],['Alex',now,false],['Daniel',now+600001,false],['Daniel',now-1,false]] as const)check(()=>assert.equal(kinFollowup(exchange,name,time),result))
check(()=>assert(!kinFollowup([{author:'Daniel',shared:true,created},exchange[1]],'Daniel',now)))
check(()=>assert(!kinFollowup([...exchange,{author:'Alex',created}],'Daniel',now)))
const history=[{messageId:'offer',author:'Alex',text:'I can prepare lower-sodium meals on Tuesday.'}]
const reply={intent:'conversation',reply:'Alex said they can prepare lower-sodium meals on Tuesday.',references:[{messageId:'offer',quote:history[0].text}],findings:[],missing:[],taskProposal:'none'}
check(()=>assert.equal(renderAnswer(validateAnswer(reply,[],history),[],'family'),reply.reply))
check(()=>assert.equal(validateAnswer({...reply,reply:'No reminder has been set.'},[],history).reply,'No reminder has been set.'))
check(()=>assert.throws(()=>validateAnswer({...reply,references:[{messageId:'private',quote:'Secret'}]},[],history)))
check(()=>assert.throws(()=>validateAnswer({...reply,references:[{messageId:'offer',quote:'Alex will monitor every meal.'}]},[],history)))
for(const text of ["I'll book your appointment.",'I have scheduled your appointment.','I booked your appointment.',"I've set a reminder.",'I created a task.','Your reminder has been scheduled.','You should take more medication.','Stop taking your medication.'])check(()=>assert.throws(()=>validateAnswer({...reply,reply:text},[],history),text))
const evidence=[{id:'lab',category:'Lab result',text:'HbA1c 7.4 percent. Specimen: September 25, 2026.',date:'2026-09-25'}]
const answer={findings:[{recordId:'lab',quote:evidence[0].text}],missing:[],taskProposal:'none',explanations:[{text:'The recorded HbA1c is 7.4 percent.',recordIds:['lab']}]}
check(()=>assert.equal(validateAnswer(answer,evidence).findings.length,1))
for(const invalid of [
 {...answer,findings:[{recordId:'other-person',quote:evidence[0].text}]},
 {...answer,findings:[{recordId:'lab',quote:'HbA1c 5.4 percent.'}]},
 {...answer,missing:['hba1c']}, {...answer,missing:['invented']},
 {...answer,explanations:[{text:'Your result.',recordIds:['other-person']}]},
 {...answer,explanations:[{text:'Increase your dose.',recordIds:['lab']}]},
 {...answer,explanations:[{text:'Your HbA1c is 5.4 percent.',recordIds:['lab']}]},
 {...answer,explanations:[{text:'Your HbA1c was measured in 2027.',recordIds:['lab']}]},
 {...answer,educationSources:['https://untrusted.example']},
])check(()=>assert.throws(()=>validateAnswer(invalid,evidence)))
check(()=>assert.match(briefText('Allergies','Synthetic allergy record documents penicillin. Reaction: hives. Recorded status: active.'),/Reaction: hives/))
check(()=>assert.match(briefText('Allergies','Contrast media. Reaction: breathing difficulty.'),/breathing difficulty/))
check(()=>assert.equal(briefText('Medications','Synthetic medication reconciliation lists metformin 500 mg. Recorded status: active.'),'metformin 500 mg'))
console.log(`PASS ${checks} family-prompt regression cases: routing, natural requests, speaker boundaries, evidence, action honesty and visible allergy reactions`)
