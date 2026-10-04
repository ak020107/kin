import type {Evidence} from './grounding'
// Reviewed source summaries, kept separate from personal medical evidence.
export const travelGuidance=[
 {id:'safe-water',title:'Choose safer drinking water',text:'Where water quality is uncertain, choose unopened factory-sealed drinks or properly treated water. Avoid ice made with uncertain water.',url:'https://wwwnc.cdc.gov/travel/page/food-water-safety',checked:'2026-10-04',habit:true},
 {id:'food',title:'Make safer food choices',text:'Choose food served steaming hot. Wash hands before eating; avoid raw foods that cannot be peeled or washed with safe water.',url:'https://wwwnc.cdc.gov/travel/page/food-water-safety',checked:'2026-10-04',habit:false},
 {id:'india-review',title:'Review India travel precautions',text:'Arrange a travel-health review before departure. Vaccination and other preparation depend on your itinerary, activities and medical history; Kin does not determine which treatments you need.',url:'https://wwwnc.cdc.gov/travel/destinations/traveler/none/india',checked:'2026-10-04',habit:false},
] as const
export function guidanceFor(evidence:Evidence[]){const trip=evidence.find(e=>e.category==='Trip');if(!trip)return [];return travelGuidance.filter(g=>g.id!=='india-review'||/\bindia\b/i.test(trip.text))}
export function preparationTime(departure:string|null,now:number){return departure?Math.min(Math.max(now+3600000,Date.parse(departure)-7*86400000),Date.parse(departure)):now+86400000}
export function nextTravelCheck(departure:string,now:number){const start=Date.parse(departure),end=start+7*86400000;const next=Math.max(start,now+86400000);return Number.isFinite(next)&&next<end?next:null}
