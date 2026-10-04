import {spawnSync} from 'node:child_process'
import {readFileSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('../',import.meta.url))
const cli=fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs',import.meta.url))
const scripts=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).scripts as Record<string,string>
const results=[]
for(const [name,command] of Object.entries(scripts)){
 if(!name.startsWith('test:')||name==='test:qc')continue
 const match=command.match(/^tsx (tests\/[\w-]+\.ts)$/)
 if(!match)throw Error(`Unsupported test command: ${name}`)
 console.log(`RUN ${name}`)
 const started=Date.now(),run=spawnSync(process.execPath,[cli,match[1]],{cwd:root,encoding:'utf8',timeout:180000})
 const output=(run.stdout??'')+(run.stderr??'')
 process.stdout.write(output)
 results.push({suite:name,passed:run.status===0,durationMs:Date.now()-started,groups:output.split(/\r?\n/).filter(line=>line.startsWith('PASS ')),failure:run.status===0?undefined:run.error?.message??output.slice(-2000)})
}
const report={checkedAt:new Date().toISOString(),passed:results.every(r=>r.passed),suiteCount:results.length,results}
writeFileSync(new URL('../qc-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n')
console.log(`${results.filter(r=>r.passed).length}/${results.length} suites passed; report: qc-results.json`)
if(!report.passed)process.exitCode=1
