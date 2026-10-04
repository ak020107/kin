export const profileNames=['Daniel','Alex','Maya','Bruce','Martha','Thomas']
export function scenarioProfile(name:string){return ({Bruce:'Maya',Martha:'Alex',Thomas:'Daniel'} as Record<string,string>)[name]??name}
