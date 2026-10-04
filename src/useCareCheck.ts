import {scenarioProfile} from '../spacetimedb/spacetimedb/src/profiles'
import {useEffect,useRef,useState} from 'react'
export function useCareCheck(identity:string,name:string,connectionRevision:string,connectionStatus:string){
  const [error,setError]=useState(''),[checking,setChecking]=useState(false)
  const running=useRef(false)
  async function check(retry=false){
    if(running.current)return
    running.current=true;setChecking(true);setError('')
    try{
      const response=await fetch('/api/care-preparation',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${sessionStorage.getItem('kin.local.session.v2')??''}`},body:JSON.stringify({retry})})
      const result=await response.json().catch(()=>({error:'Connection unavailable. Try again.'})) as {error?:string}
      if(!response.ok)throw Error(result.error??'Preparation is unavailable. Try again.')
    }catch(e){setError(e instanceof Error?e.message:'Could not prepare your brief.')}
    finally{running.current=false;setChecking(false)}
  }
  useEffect(()=>{
    if(scenarioProfile(name)!=='Daniel')return
    void Promise.resolve().then(()=>check())
    const interval=setInterval(()=>void check(),60000)
    return()=>clearInterval(interval)
  },[identity,name,connectionRevision,connectionStatus])
  return {error,checking,check}
}
