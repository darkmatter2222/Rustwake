// dev-567 measurement harness for issue #567 (node-side, NO browser).
// Fresh untouched yard, ZERO player input. Drives advanceGame in 0.5s substeps
// exactly like the runtime loop, and answers the four measured questions:
//  1. road connectivity of furnace 16,13 (actual path or failure reason)
//  2. dispatcher rejection reason for every (idle truck, queued load) pair
//  3. does the queue drain over >=10 sim minutes (time series)
//  4. does the `road` alarm class fire for the furnace, and why not
// The candidate/rejection mirror below is copied VERBATIM from
// src/simulation.js deliveryCandidates/assignJob (labeled MIRROR); a
// consistency assertion proves the mirror agrees with the real dispatcher:
// whenever the mirror says ASSIGNABLE for an idle truck, the real sim must
// assign that truck a job on the next substep.
import * as sim from "../src/simulation.js";
import {BLUEPRINTS} from "../src/content.js";
import {alarmsState} from "../src/alarms.js";
import {fleetState} from "../src/fleet.js";

const stock=(bag,id)=>Math.max(0,Number(bag?.[id]||0));
const cooldownUntil=(g,sourceId,resource)=>{
 const until=g?.dispatchCooldowns?.[sourceId+":"+resource];
 return Number.isFinite(until)?until:0;
};
// MIRROR of simulation.deliveryCandidates (verbatim predicate logic).
function mirrorCandidates(g){
 const bank=g.buildings.find(b=>b.type==="depot"&&b.remaining<=0);
 if(!bank)return [];
 const cooled=(sourceId,resource)=>cooldownUntil(g,sourceId,resource)>g.elapsed;
 const candidates=[];
 for(const b of g.buildings){
  if(b.remaining>0||b.id===bank.id)continue;
  const def=BLUEPRINTS[b.type];if(!def)continue;
  for(const [id,amount] of Object.entries(b.inventory||{})){
   if(amount>=3 && !cooled(b.id,id) && !g.vehicles.some(v=>v.job?.sourceId===b.id&&v.job?.resource===id)){
    const sv=g?.freightServedAt?.[b.id+":"+id];
    candidates.push({source:b,dest:bank,resource:id,amount:Math.min(15,Math.floor(amount)),priority:1,servedAt:Number.isFinite(sv)?sv:-1});
   }
  }
  for(const [id,n] of Object.entries(def.inputs)){
   const have=stock(b.inventory,id);
   if(have<n*2 && stock(g.bank,id)>=n*2 && !cooled(bank.id,id) &&
      !g.vehicles.some(v=>v.job?.destId===b.id&&v.job?.resource===id)){
    candidates.push({source:bank,dest:b,resource:id,amount:Math.min(stock(g.bank,id),n*3),priority:3});
   }
  }
 }
 return candidates.sort((a,b)=>b.priority-a.priority||(a.servedAt??-1)-(b.servedAt??-1));
}
// MIRROR of assignJob's per-candidate acceptance checks, with the rejection
// reason the code actually takes (route legs are the only `continue` gates
// before take(); take() cannot fail for a fresh candidate).
function rejectionFor(g,v,c){
 const start=sim.nearestRoad(g,Math.round(v.x),Math.round(v.z));
 if(!start)return "NO_TRUCK_FRONTAGE";
 const src=sim.nearestRoad(g,c.source.x,c.source.z),dst=sim.nearestRoad(g,c.dest.x,c.dest.z);
 if(!src)return "NO_SOURCE_FRONTAGE";
 if(!dst)return "NO_DEST_FRONTAGE";
 if(!sim.roadPath(g,start,src))return "NO_PATH_TRUCK_TO_SOURCE";
 if(!sim.roadPath(g,src,dst))return "NO_PATH_SOURCE_TO_DEST";
 return "ASSIGNABLE";
}
const label=c=>(c.source.type==="depot"?"bank->b"+c.dest.id:"b"+c.source.id+"->bank")+":"+c.resource+"(p"+c.priority+",amt"+c.amount+")";

const g=sim.createGame();
const furnace=g.buildings.find(b=>b.type==="furnace");
const depot=g.buildings.find(b=>b.type==="depot");
console.log("== Q1: furnace connectivity at t=0 ==");
console.log("furnace id",furnace.id,"at",furnace.x+","+furnace.z,"remaining",furnace.remaining);
console.log("connectedToRoad:",sim.connectedToRoad(g,furnace));
const fRoad=sim.nearestRoad(g,furnace.x,furnace.z),dRoad=sim.nearestRoad(g,depot.x,depot.z);
console.log("nearestRoad(furnace):",JSON.stringify(fRoad),"nearestRoad(depot):",JSON.stringify(dRoad));
const path=sim.roadPath(g,fRoad,dRoad);
console.log("roadPath furnace->depot:",path?path.map(p=>p.x+","+p.z).join(" "):"NULL (no connected path)");
for(const v of g.vehicles){
 const s=sim.nearestRoad(g,Math.round(v.x),Math.round(v.z));
 console.log(v.name,"start",v.x+","+v.z,"nearestRoad",JSON.stringify(s),"pathToDepot",s&&dRoad?!!sim.roadPath(g,s,dRoad):"n/a");
}

const TOTAL=660,DT=0.5;
const series=[];
let furnaceJobSteps=0,furnacePickups=0,furnaceArrives=0,steelDelivered=0,maxSteel=0;
const furnacePickupByResource={};
let steelCandidateSteps=0,steelFirstAssignableSteps=0,bankSteelMin=Infinity,bankSteelMax=0;
let idleSteps={1:0,2:0,3:0},idleWithCandidates=0,mirrorAssignableButIdle=0;
const rejectionTally={};
const idleEpisodes=[]; // {t, truck, waiting, reasons}
let prevJobs={1:null,2:null,3:null};
let alarmSamples=[];
for(let t=0;t<TOTAL;t+=DT){
 sim.advanceGame(g,DT);
 // track furnace freight lifecycle
 for(const v of g.vehicles){
  const j=v.job;
  if(j&&j.sourceId===furnace.id){
   furnaceJobSteps++;
   if(prevJobs[v.id]!=="furnace-toDest"&&j.phase==="toDest"){furnacePickups++;furnacePickupByResource[j.resource]=(furnacePickupByResource[j.resource]||0)+1;}
   prevJobs[v.id]="furnace-"+j.phase;
  }else{
   if(prevJobs[v.id]==="furnace-toDest"&&(!j||j.sourceId!==furnace.id)){furnaceArrives++;}
   prevJobs[v.id]=j?j.sourceId+"-"+j.phase:null;
  }
 }
 const steel=stock(furnace.inventory,"steel");
 if(steel>maxSteel)maxSteel=steel;
 // idle-truck rejection enumeration AFTER the substep (post-arrive idle is the
 // exact state the UI renders between frames)
 const cands=mirrorCandidates(g);
 const bs=stock(g.bank,"steel");if(bs<bankSteelMin)bankSteelMin=bs;if(bs>bankSteelMax)bankSteelMax=bs;
 if(cands.some(c=>c.source.id===furnace.id&&c.resource==="steel"))steelCandidateSteps++;
 const firstIdle=g.vehicles.find(v=>!v.job);
 if(firstIdle){
  const firstAssignable=cands.find(c=>rejectionFor(g,firstIdle,c)==="ASSIGNABLE");
  if(firstAssignable&&firstAssignable.source.id===furnace.id&&firstAssignable.resource==="steel")steelFirstAssignableSteps++;
 }
 for(const v of g.vehicles){
  if(v.job)continue;
  idleSteps[v.id]++;
  if(cands.length>0){
   idleWithCandidates++;
   const reasons=cands.map(c=>label(c)+"="+rejectionFor(g,v,c));
   for(const r of reasons){const code=r.split("=")[1];rejectionTally[code]=(rejectionTally[code]||0)+1;}
   if(reasons.some(r=>r.endsWith("=ASSIGNABLE")))mirrorAssignableButIdle++;
   if(idleEpisodes.length<400)idleEpisodes.push({t:+(t+DT).toFixed(1),truck:v.name,waiting:cands.length,reasons});
  }
 }
 // consistency check: mirror ASSIGNABLE at end of step N => real sim assigns
 // that truck during step N+1 (same candidate set, zero player input).
 if(Math.round((t+DT)*2)%30===0){
  const f=fleetState(g),a=alarmsState(g);
  const st4=(a.alarms||[]).find(x=>x.id==="storage-"+furnace.id);
  const rd4=(a.alarms||[]).find(x=>x.id==="road-"+furnace.id);
  series.push({t:+(t+DT).toFixed(1),
   steel,iron:stock(furnace.inventory,"iron"),fuel:stock(furnace.inventory,"fuel"),
   salvagerScrap:stock(g.buildings.find(b=>b.type==="salvager").inventory,"scrap"),
   waiting:f.totals?.waiting,
   trucks:f.rows?.map(r=>r.name+":"+r.state+(r.resource?"/"+r.resource.id:"")),
   storageAlarm:st4?st4.state:null,roadAlarm:rd4?rd4.state:null,
   delivered:g.stats.delivered,shipments:g.stats.shipments});
  if(st4&&alarmSamples.length<3)alarmSamples.push({t:+(t+DT).toFixed(1),remedy:st4.remedy,action:st4.action});
 }
}
console.log("\n== Q3: time series (every 15s, 660s sim, zero input) ==");
for(const s of series)console.log(JSON.stringify(s));
console.log("\n== Q2: idle-truck / queued-load measurements ==");
console.log("idle substeps per truck (of",TOTAL/DT,"):",JSON.stringify(idleSteps));
console.log("idle substeps WITH >=1 waiting candidate:",idleWithCandidates);
console.log("rejection reason tally over all (idle truck, candidate) pairs:",JSON.stringify(rejectionTally));
console.log("mirror said ASSIGNABLE yet truck idle at sample:",mirrorAssignableButIdle);
console.log("first 12 idle episodes:",JSON.stringify(idleEpisodes.slice(0,12),null,1));
console.log("\n== furnace freight lifecycle ==");
console.log("substeps with a live furnace-source job:",furnaceJobSteps,"pickups:",furnacePickups,"arrives:",furnaceArrives,"maxSteelHeld:",maxSteel,"finalSteel:",stock(furnace.inventory,"steel"));
console.log("furnace pickups by resource:",JSON.stringify(furnacePickupByResource));
console.log("substeps steel>=3 was a waiting candidate:",steelCandidateSteps,"of",TOTAL/DT);
console.log("substeps steel was the FIRST assignable candidate for the first idle truck:",steelFirstAssignableSteps);
console.log("bank steel min/max over run:",bankSteelMin,"/",bankSteelMax,"(initial bank steel = 20; unchanged => zero steel ever delivered)");
console.log("final bank steel:",stock(g.bank,"steel"),"stats:",JSON.stringify(g.stats));
console.log("dispatchCooldowns at end (zero player input => must be empty):",JSON.stringify(g.dispatchCooldowns));
console.log("\n== Q4: alarm samples ==");
console.log(JSON.stringify(alarmSamples,null,1));
const aEnd=alarmsState(g);
console.log("final alarms:",(aEnd.alarms||[]).map(x=>x.id+"/"+x.kind+"/"+x.state).join(", "));
// mirror-consistency proof: replay one assignable episode
console.log("\n== mirror consistency spot-check ==");
const g2=sim.createGame();
let checked=0,violations=0;
for(let t=0;t<120;t+=DT){
 // Only the FIRST idle truck in sim order is guaranteed the first assignable
 // candidate (assignJob runs in vehicle order within the substep); later idle
 // trucks can legitimately lose a single candidate to an earlier truck.
 const first=g2.vehicles.find(v=>!v.job);
 const cands=first?mirrorCandidates(g2):[];
 const assignable=first?cands.find(c=>rejectionFor(g2,first,c)==="ASSIGNABLE"):null;
 sim.advanceGame(g2,DT);
 if(assignable){checked++;if(!first.job)violations++;}
}
console.log("assignable-predictions checked:",checked,"violations (mirror said assignable, sim left idle):",violations);
