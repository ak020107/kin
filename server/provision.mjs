import { readFile, writeFile } from 'node:fs/promises'
const sessionPath = new URL('./.service-session.local', import.meta.url)
let session
try { session = JSON.parse(await readFile(sessionPath, 'utf8')) }
catch {
  const response = await fetch('http://127.0.0.1:3000/v1/identity', { method: 'POST' })
  if (!response.ok) throw Error('Local service identity could not be issued')
  session = await response.json()
  await writeFile(sessionPath, JSON.stringify(session), { mode: 0o600 })
}
if (!/^[a-f0-9]{64}$/.test(session.identity) || !session.token) throw Error('Invalid local service session')
await writeFile(new URL('../spacetimedb/spacetimedb/src/service-identity.ts', import.meta.url), `// Non-secret identity of the local AI service. Its bearer token stays in server/.service-session.local.\nexport const aiServiceIdentity = '${session.identity}'\n`)
console.log('Local AI service identity configured; no credentials printed.')
