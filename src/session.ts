import { useEffect, useState } from 'react'
import { DbConnection } from './module_bindings'
import type { Membership, Invite, Record as HealthRecord, RecordConnection, Message, Task, CarePreparation, SandboxLink, Reminder, Booking, SharingPreference, CarePlan, AutoCarePreference, FamilyVisit, EmergencyCard } from './module_bindings/types'
import {tokenKey,rememberAccount} from './device'
export type Snapshot = {me:Membership|null;members:Membership[];invites:Invite[];records:HealthRecord[];messages:Message[];tasks:Task[];recordConnection:RecordConnection|null;carePreparation:CarePreparation|null;sandboxLink:SandboxLink|null;reminders:Reminder[];bookings:Booking[];sharingPreference:SharingPreference|null;carePlans:CarePlan[];autoCarePreference?:AutoCarePreference|null;familyVisits?:FamilyVisit[];emergencyCards?:EmergencyCard[]}
const empty:Snapshot={me:null,members:[],invites:[],records:[],messages:[],tasks:[],recordConnection:null,carePreparation:null,sandboxLink:null,reminders:[],bookings:[],sharingPreference:null,carePlans:[],autoCarePreference:null,familyVisits:[],emergencyCards:[]}
export function useSession() {
  const [connection,setConnection]=useState<DbConnection|null>(null)
  const [snapshot,setSnapshot]=useState<Snapshot>(empty)
  const [status,setStatus]=useState('Connecting to your care space…')
  useEffect(()=>{
    let alive=true
    const conn=DbConnection.builder().withUri(import.meta.env.VITE_SPACETIME_URI || 'ws://127.0.0.1:3000').withDatabaseName(import.meta.env.VITE_SPACETIME_DATABASE || 'kin-local')
      .withToken(sessionStorage.getItem(tokenKey) ?? undefined)
      .onConnect((c,_identity,token)=>{
        if(!alive)return
        // Session-scoped only: never overwrite an existing long-lived identity token on reconnect.
        if(!sessionStorage.getItem(tokenKey))sessionStorage.setItem(tokenKey,token)
        setConnection(c)
        const sync=()=>{const mine=[...c.db.myMembership.iter()][0];if(mine)rememberAccount({identity:mine.identity,name:mine.name,token:sessionStorage.getItem(tokenKey)!});if(alive)setSnapshot({me:[...c.db.myMembership.iter()][0]??null,members:[...c.db.familyMembers.iter()],invites:[...c.db.myInvites.iter()],records:[...c.db.myRecords.iter()],messages:[...c.db.visibleMessages.iter()].sort((a,b)=>a.created===b.created?(a.id<b.id?-1:1):(a.created<b.created?-1:1)),tasks:[...c.db.familyTasks.iter()],recordConnection:[...c.db.myRecordConnection.iter()][0]??null,carePreparation:[...c.db.myCarePreparation.iter()][0]??null,sandboxLink:[...c.db.mySandboxLink.iter()][0]??null,reminders:[...c.db.myReminders.iter()],bookings:[...c.db.myBookings.iter()],sharingPreference:[...c.db.mySharingPreference.iter()][0]??null,carePlans:[...c.db.myCarePlans.iter()],autoCarePreference:[...c.db.myAutoCarePreference.iter()][0]??null,familyVisits:[...c.db.familyVisits.iter()],emergencyCards:[...c.db.familyEmergencyCards.iter()]})}
        for(const table of [c.db.myMembership,c.db.familyMembers,c.db.myInvites,c.db.myRecords,c.db.visibleMessages,c.db.familyTasks,c.db.myRecordConnection,c.db.myCarePreparation,c.db.mySandboxLink,c.db.myReminders,c.db.myBookings,c.db.mySharingPreference,c.db.myCarePlans,c.db.myAutoCarePreference,c.db.familyVisits,c.db.familyEmergencyCards]){table.onInsert(sync);table.onDelete(sync);table.onUpdate(sync)}
        c.subscriptionBuilder().onApplied(()=>{sync();setStatus('ready')}).onError(()=>{setSnapshot(empty);setStatus('Unable to load your care space. Reload to reconnect.')}).subscribe(['SELECT * FROM my_membership','SELECT * FROM family_members','SELECT * FROM my_invites','SELECT * FROM my_records','SELECT * FROM visible_messages','SELECT * FROM family_tasks','SELECT * FROM my_record_connection','SELECT * FROM my_care_preparation','SELECT * FROM my_sandbox_link','SELECT * FROM my_reminders','SELECT * FROM my_bookings','SELECT * FROM my_sharing_preference','SELECT * FROM my_care_plans','SELECT * FROM my_auto_care_preference','SELECT * FROM family_visits','SELECT * FROM family_emergency_cards'])
      }).onConnectError(()=>{if(alive){setSnapshot(empty);setConnection(null);setStatus('Care space unavailable. Please reload to reconnect.')}})
      .onDisconnect(()=>{if(alive){setSnapshot(empty);setConnection(null);setStatus('Connection closed. Reload to reconnect.')}}).build()
    return()=>{alive=false;conn.disconnect()}
  },[])
  function signOut(){sessionStorage.removeItem(tokenKey);setSnapshot(empty);connection?.disconnect();window.location.reload()}
  return {connection,...snapshot,status,signOut}
}
