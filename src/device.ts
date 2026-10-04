import {useState, type SetStateAction} from 'react'
export const tokenKey='kin.local.session.v2'
type Account={identity:string;name:string;token:string}
const accountsKey='kin.device.accounts.v1'
export function savedAccounts():Account[]{try{return JSON.parse(localStorage.getItem(accountsKey)??'[]')}catch{return []}}
export function rememberAccount(account:Account){localStorage.setItem(accountsKey,JSON.stringify([...savedAccounts().filter(a=>a.identity!==account.identity),account]))}
export function resumeAccount(account:Account){sessionStorage.setItem(tokenKey,account.token);window.location.reload()}
export function useDeviceDraft<T>(identity:string,field:string,initial:T){
  const key=`kin.draft.v1.${identity}.${field}`
  const [value,setValue]=useState<T>(()=>{try{return JSON.parse(localStorage.getItem(key)??'null')??initial}catch{return initial}})
  function update(next:SetStateAction<T>){setValue(old=>{const result=typeof next==='function'?(next as (v:T)=>T)(old):next;localStorage.setItem(key,JSON.stringify(result));return result})}
  return [value,update] as const
}

export async function importDemoProfiles(file:File){
  if(file.size>1000000)throw Error('This profile file is too large.')
  const data=JSON.parse(await file.text())
  if(data?.format!=='kin-demo-profiles-v1'||!Array.isArray(data.accounts)||!data.accounts.length||data.accounts.length>100)throw Error('Choose a Kin demo profile file.')
  if((data.database || 'kin-local') !== (import.meta.env.VITE_SPACETIME_DATABASE || 'kin-local'))throw Error('These profiles belong to a different database. Use this site’s profiles or create a new family.')
  for(const a of data.accounts){if(typeof a.identity!=='string'||!/^([0-9a-f]{64})$/i.test(a.identity)||typeof a.name!=='string'||!['Daniel','Alex','Maya','Bruce','Martha','Thomas'].includes(a.name)||typeof a.token!=='string'||!a.token||a.token.length>20000)throw Error('The profile file is invalid.')}
  for(const a of data.accounts)rememberAccount(a)
}
