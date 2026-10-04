import {useState, type ButtonHTMLAttributes} from 'react'
export type Page = 'today'|'private'|'family'|'records'|'tasks'|'settings'
const destinations: {key:Page;label:string}[]=[{key:'today',label:'Today'},{key:'private',label:'Talk to Kin'},{key:'family',label:'Family'},{key:'records',label:'Records'},{key:'tasks',label:'Care tasks'}]
export function KinButton({variant='primary',className='',...props}:ButtonHTMLAttributes<HTMLButtonElement>&{variant?:'primary'|'secondary'|'quiet'}){
 return <button {...props} className={`kin-button kin-button-${variant} ${className}`}/>
}
export function KinAvatar({name}:{name:string}){return <span className="kin-avatar" title={name}>{name.slice(0,1).toUpperCase()}</span>}
export function KinShell({page,name,navigate}:{page:Page;name:string;navigate:(page:Page)=>void}){
 const [more,setMore]=useState(false)
 return <><header className="kin-navigation"><button className="kin-wordmark" onClick={()=>navigate('today')} aria-label="Kin home"><img className="kin-brand-logo" src="/kin-logo-white.png" alt="" width="728" height="464"/></button><nav className="kin-desktop-nav" aria-label="Main navigation">{destinations.map(d=><button key={d.key} aria-current={page===d.key?'page':undefined} onClick={()=>navigate(d.key)}>{d.label}</button>)}</nav><button className="kin-profile" aria-label={`Settings and privacy for ${name}`} onClick={()=>navigate('settings')}><KinAvatar name={name}/></button></header>
 <nav className="kin-mobile-nav" aria-label="Mobile navigation">{([{key:'today',label:'Today',icon:'home'},{key:'private',label:'Kin',icon:'kin'},{key:'family',label:'Family',icon:'family'}] as const).map(d=><button key={d.key} aria-current={page===d.key?'page':undefined} onClick={()=>{setMore(false);navigate(d.key)}}><img src={`/figma/${d.icon}.svg`} alt="" width="24" height="24"/>{d.label}</button>)}<button aria-expanded={more} aria-controls="kin-more-menu" aria-current={['records','tasks','settings'].includes(page)?'page':undefined} onClick={()=>setMore(!more)}><img src="/figma/more.svg" alt="" width="24" height="24"/>More</button></nav>
 {more&&<div id="kin-more-menu" className="kin-more-menu">{([{key:'records',label:'Records'},{key:'tasks',label:'Care tasks'},{key:'settings',label:'Settings & privacy'}] as const).map(d=><button key={d.key} onClick={()=>{setMore(false);navigate(d.key)}}>{d.label}</button>)}</div>}</>
}
