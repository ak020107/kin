// A standalone name starts help; follow-ups stay with the same speaker for ten minutes.
export function mentionsKin(text:string){return /(^|\s)@?kin(?![\w.-])/i.test(text)}
type Entry={author:string;created?:bigint;shared?:boolean}
export function kinFollowup(messages:Entry[],name:string,now:number){
 const last=messages.at(-1)
 if(!last||last.author!=='Kin companion'||!last.created||now<Number(last.created/1000n)||now-Number(last.created/1000n)>600000)return false
 const speaker=[...messages].reverse().find(m=>m.author!=='Kin companion')
 return speaker?.author===name&&!speaker.shared
}
