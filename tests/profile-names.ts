import assert from 'node:assert/strict'
import {profileNames,scenarioProfile} from '../spacetimedb/spacetimedb/src/profiles'
import {syntheticRecords} from '../spacetimedb/spacetimedb/src/synthetic'
import {defaultScenarios} from '../spacetimedb/spacetimedb/src/finch'
for(const [name,base] of [['Bruce','Maya'],['Martha','Alex'],['Thomas','Daniel']]){
 assert(profileNames.includes(name))
 assert.equal(scenarioProfile(name),base)
 const records=syntheticRecords(name)!
 assert(records.displayName.startsWith(name))
 assert(records.subject.includes(name.toLowerCase()))
 assert.deepEqual(records.records.map(r=>r.text),syntheticRecords(base)!.records.map(r=>r.text))
 assert.equal(defaultScenarios[name],defaultScenarios[base])
}
assert.equal(syntheticRecords('Unknown'),null)
console.log('PASS Wayne profile names preserve separate subjects and existing scenario behavior')
