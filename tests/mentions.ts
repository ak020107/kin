import assert from 'node:assert/strict'
import {mentionsKin,kinFollowup} from '../src/mentions'
for(const text of ['@Kin help prepare questions','Can you help @kin?','Thanks, @KIN!'])assert(mentionsKin(text))
for(const text of ['I will take you','@kind','person@kin.com','@kin.com','@kin-helper','@kin_name'])assert(!mentionsKin(text))
console.log('PASS Explicit Kin mentions route to assistance; ordinary messages, names and email addresses do not')

assert(mentionsKin('Kin, help me prepare'))
const now=Date.now(),created=BigInt(now)*1000n
const exchange=[{author:'Daniel',created},{author:'Kin companion',created}]
assert(kinFollowup(exchange,'Daniel',now));assert(!kinFollowup(exchange,'Alex',now));assert(!kinFollowup(exchange,'Daniel',now+600001))
assert(!kinFollowup([...exchange,{author:'Alex',created}],'Daniel',now))
console.log('PASS Bare Kin invocation and same-speaker follow-ups; other speakers and expired exchanges remain human')
