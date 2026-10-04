import { useState } from 'react'

import { ShieldCheck } from 'lucide-react'

import {savedAccounts,resumeAccount,importDemoProfiles} from './device'

import type { DbConnection } from './module_bindings'

export function Welcome({connection,status}:{connection:DbConnection|null;status:string}){

  const [name,setName]=useState('Daniel'),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')

  const [profileRevision,setProfileRevision]=useState(0),[exportText,setExportText]=useState('')
  async function run(action:()=>Promise<void>){if(busy)return;setBusy(true);setError('');try{await action()}catch(e){setError(e instanceof Error?e.message:'Unable to continue.')}finally{setBusy(false)}}

  return <main className="onboarding" data-profile-revision={profileRevision}><div className="brand"><img className="kin-brand-logo" src="/kin-logo-white.png" alt="Kin" width="728" height="464"/></div><section><span className="eyebrow">YOUR FAMILY, IN YOUR CORNER</span><h1>A private space for you.<br/>A shared space for care.</h1><p>Synthetic prototype · authenticated sessions, persistent care, and live family updates.</p>{status!=='ready'?<p role="status">{status}</p>:<>{savedAccounts().length>0&&<div className="join"><h2>Continue on this device</h2>{savedAccounts().map(a=><button className="secondary" key={a.identity} onClick={()=>resumeAccount(a)}>Continue as {a.name}  ·  {a.identity.slice(-6)}</button>)}<p>Saved demo profiles. Anyone using this browser can open them.</p></div>}<div className="join"><h2>Restore demo profiles</h2><p>A profile file restores access to the existing demo. Keep it private: it contains sign-in access to fictional profiles.</p><label htmlFor="profile-file">Import demo profiles</label><input id="profile-file" type="file" accept=".json,application/json" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void run(async()=>{await importDemoProfiles(file);setProfileRevision(n=>n+1)});e.target.value=''}}/>{savedAccounts().some(a=>['Bruce','Martha','Thomas'].includes(a.name))&&<button className="secondary" onClick={()=>setExportText(JSON.stringify({format:'kin-demo-profiles-v1',database:import.meta.env.VITE_SPACETIME_DATABASE || 'kin-local',accounts:savedAccounts().filter(a=>['Bruce','Martha','Thomas'].includes(a.name))}))}>Export Wayne demo profiles</button>}{exportText&&<><label htmlFor="profile-export">Wayne demo profile file contents</label><textarea id="profile-export" readOnly value={exportText}/><p>Save this as kin-demo-profiles.json, then import it in your other browser.</p><button className="secondary" onClick={()=>setExportText('')}>Close export</button></>}</div><label htmlFor="profile">Create a new fictional family as</label><select id="profile" value={name} onChange={e=>setName(e.target.value)}><option>Daniel</option><option>Alex</option><option>Maya</option><option>Bruce</option><option>Martha</option><option>Thomas</option></select><button className="primary" disabled={busy} onClick={()=>run(()=>connection!.reducers.createFamily({name}))}>Create my care space</button><div className="join"><h2>Joining your family?</h2><label htmlFor="invite">Single-use invite code</label><input id="invite" value={code} onChange={e=>setCode(e.target.value.trim())} placeholder="Paste the code from your family"/><button className="secondary" disabled={busy||!code} onClick={()=>run(()=>connection!.reducers.joinFamily({code}))}>Join family</button></div></>}{error&&<p className="error" role="alert">{error}</p>}<p className="onboarding-note"><ShieldCheck size={18}/> Your session is authenticated by the database. Saved on this device. This demo has no password or cross-device recovery. Only fictional profiles and records are available.</p></section></main>

}

