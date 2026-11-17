import {WORLD_SIZE,INITIAL_BANK,BLUEPRINTS,TIERS,RESEARCH,ROAD_KINDS,SAVE_KEY,STARTER_BUILDINGS,INITIAL_ROADS} from "./content.js";
import {key,cellOf,inside,checkSite,buildingAt,footprintCells,normalizeRot} from "./gridOccupancy.js";

export {key,cellOf,inside} from "./gridOccupancy.js";
export {checkSite,buildingAt,footprintCells,footprintDims,bayCells,worldFootprint,terrainFor,terrainAt,ownedParcels,parcelId,surveyed,facingName,normalizeRot,SURVEY_MIN,SURVEY_MAX,ROAD_REACH,PARCEL_SIZE,PARCEL_NAMES} from "./gridOccupancy.js";
const clone=(x)=>JSON.parse(JSON.stringify(x));
const stock=(bag,id)=>Math.max(0,Number(bag?.[id]||0));
const fits=(bag,need)=>Object.entries(need).every(([id,n])=>stock(bag,id)+1e-7>=n);
const spend=(bag,need)=>{for(const [id,n] of Object.entries(need))bag[id]=Math.max(0,stock(bag,id)-n);};
const take=(bag,id,amount)=>{const n=Math.min(stock(bag,id),amount);bag[id]=Math.max(0,stock(bag,id)-n);return n;};
const deposit=(bag,id,n)=>{bag[id]=stock(bag,id)+n;};
const pushLog=(g,message)=>{g.log.unshift({id:g.nextId++,time:g.elapsed,message});g.log.length=Math.min(g.log.length,32);};
// Construction transaction ledger (#370): every build/cancel/salvage/reject is
// recorded with its exact spend or refund delta so conservation is auditable.
const recordLedger=(g,entry)=>{
 if(!Array.isArray(g.ledger))g.ledger=[];
 g.ledger.push({id:g.nextId++,time:g.elapsed,...entry});
 if(g.ledger.length>64)g.ledger.splice(0,g.ledger.length-64);
};
// Freight ledger (#384 LOG-04): source stock, reserved load, onboard truck cargo
// and destination stock are DISTINCT ledgers. Every reserve/pickup/arrive/return
// is a validated transition recorded with its exact amount, so total units are
// conserved and auditable across cancel, route blockage and save/reload.
// This ledger never touches finance (sales/credits) or occupancy (#370).
const recordFreight=(g,entry)=>{
 if(!Array.isArray(g.freightLedger))g.freightLedger=[];
 g.freightLedger.push({id:g.nextId++,time:g.elapsed,...entry});
 if(g.freightLedger.length>128)g.freightLedger.splice(0,g.freightLedger.length-128);
};
const bagOfBuilding=(g,b)=>{if(!b)return null;if(b.type==="depot")return g.bank;if(!b.inventory||typeof b.inventory!=="object")b.inventory={};return b.inventory;};
const sourceBagOf=(g,j)=>bagOfBuilding(g,g.buildings.find(b=>b.id===j?.sourceId));
// ---- Construction transaction authority (#373 BLD-04) ----
// Durable refund provenance: every committed building carries the EXACT cost it
// paid (b.paid), independent of the 64-row ledger cap and of later blueprint
// rebalances. Legacy/tampered saves fall back to the current blueprint cost, so
// a refund can never mint negative or fabricated stock.
const paidOf=(b)=>{
 const def=BLUEPRINTS[b?.type];
 const fallback={...(def?.cost||{})};
 const p=b?.paid;
 if(!p||typeof p!=="object"||Array.isArray(p))return fallback;
 const keys=Object.keys(p);
 if(keys.length!==Object.keys(fallback).length||!keys.every(k=>k in fallback))return fallback;
 const clean={};
 for(const [id,n] of Object.entries(p)){if(!Number.isFinite(n)||n<0)return fallback;clean[id]=n;}
 return clean;
};
// Bounded idempotency registry: a confirmed command id (build OR reject) records
// its exact outcome so a duplicate delivery — even at different coordinates or
// after a save/reload — replays the original result and spends nothing further.
const COMMAND_CAP=128;
const recordCommand=(g,entry)=>{
 if(!Array.isArray(g.commands))g.commands=[];
 g.commands.push({time:g.elapsed,...entry});
 if(g.commands.length>COMMAND_CAP)g.commands.splice(0,g.commands.length-COMMAND_CAP);
};
// Test-only fault seam (#373): forces a throw at exact points INSIDE the commit
// so tests can prove all-or-nothing rollback. Never set by gameplay code.
let constructionFault=null;
export function __setConstructionFault(fn){constructionFault=typeof fn==="function"?fn:null;}
const fault=(phase,ctx)=>{if(constructionFault)constructionFault(phase,ctx);};
// Committed-construction measurement (#373): units already spent on assembling
// buildings (remaining>0), read from durable paid provenance. Distinct from
// physical stock and from the #384 freight ledgers: these units left the bank
// at commit and return in full on cancel. Never added to freightTotals.
export function committedTotals(g){
 const totals={};
 for(const b of g?.buildings||[]){
  if(!(b.remaining>0))continue;
  for(const [id,n] of Object.entries(paidOf(b)))if(n>0)totals[id]=(totals[id]||0)+n;
 }
 return totals;
}
export function createGame(){
 const buildings=clone(STARTER_BUILDINGS);
 const vehicles=[
  {id:1,name:"HAULER-01",x:11,z:10,speed:2.25,job:null,cargo:null,anim:0},
  {id:2,name:"HAULER-02",x:11,z:11,speed:2.6,job:null,cargo:null,anim:0},
  {id:3,name:"HAULER-03",x:11,z:12,speed:2.0,job:null,cargo:null,anim:0}
 ];
 return {version:2,seed:4073,createdAt:Date.now(),lastSavedAt:Date.now(),elapsed:0,
  nextId:10,bank:{...INITIAL_BANK},buildings,roads:[...INITIAL_ROADS],vehicles,
  research:[],discovered:["cinders"],tier:0,world:"Cinder Basin",sector:1,ledger:[],freightLedger:[],commands:[],
  view:{yaw:45,elevation:35.264,zoom:1},stats:{produced:0,delivered:0,shipments:0,sold:0,builds:0},
  log:[{id:0,time:0,message:"Cinder Yard established. Roads and freight trucks are operational."}],
  notices:[]
 };
}
export function readGame(){
 try{
  const data=JSON.parse(localStorage.getItem(SAVE_KEY)||"null");
  if(!data||data.version!==2||!Array.isArray(data.buildings)||!Array.isArray(data.roads)||!Array.isArray(data.vehicles))return createGame();
  const fresh=createGame();
  // Coerce only the expected public schema; do not import arbitrary object prototypes.
  const g={...fresh,...data,bank:{...fresh.bank,...data.bank},stats:{...fresh.stats,...data.stats},
    view:{...fresh.view,...data.view},version:2};
  g.elapsed=Math.max(0,Math.min(1e9,Number(g.elapsed)||0));
  g.lastSavedAt=Number(g.lastSavedAt)||Date.now();
  g.vehicles=g.vehicles.filter(v=>Number.isFinite(v.x)&&Number.isFinite(v.z));
  g.buildings=g.buildings.filter(b=>inside(b.x,b.z)&&BLUEPRINTS[b.type]).slice(0,400)
   .map(b=>({...b,rot:normalizeRot(b.rot),paid:paidOf(b)}));
 g.ledger=Array.isArray(g.ledger)?g.ledger.filter(e=>e&&typeof e==="object").slice(-64):[];
 g.freightLedger=Array.isArray(g.freightLedger)?g.freightLedger.filter(e=>e&&typeof e==="object").slice(-128):[];
 // #373: replay protection survives reload; malformed registry entries drop.
 g.commands=Array.isArray(g.commands)?g.commands.filter(c=>c&&typeof c==="object"&&typeof c.id==="string"&&c.id).slice(-COMMAND_CAP):[];
  g.roads=[...new Set(g.roads.filter(k=>typeof k==="string"&&inside(...cellOf(k))))];
  // #384: reconcile reserved/onboard ledgers BEFORE offline catch-up so a reload
  // can never count the same units twice; cap the fleet without losing freight.
  reconcileFreight(g);
  if(g.vehicles.length>12){for(const v of g.vehicles.slice(12))returnFreight(g,v,"FLEET_CAP");g.vehicles=g.vehicles.slice(0,12);}
  const away=Math.max(0,(Date.now()-g.lastSavedAt)/1000);
  if(away>6){const simulated=Math.min(300,away);advanceGame(g,simulated);g.notices=[{type:"offline",message:"Your yard kept running for "+Math.floor(simulated)+"s while you were away."}];}
  return g;
 }catch{return createGame();}
}
export function persist(g){
 try{g.lastSavedAt=Date.now();localStorage.setItem(SAVE_KEY,JSON.stringify(g));return true;}catch{return false;}
}
export function resetGame(){try{localStorage.removeItem(SAVE_KEY);}catch{}return createGame();}
export function canAfford(g,cost){return fits(g.bank,cost);}
export function unlocked(g,type){
 const rank=TIERS.find(t=>t.unlocks.includes(type));
 return !!rank&&g.tier>=rank.id;
}
export function powerStatus(g){
 const supply=g.buildings.filter(b=>b.remaining<=0&&b.type==="generator").length*12;
 const demand=g.buildings.filter(b=>b.remaining<=0).reduce((a,b)=>a+Math.max(0,BLUEPRINTS[b.type]?.power||0),0);
 return {supply,demand,available:supply>=demand,percent:supply===0?0:Math.round(demand/supply*100)};
}
// Free selection/hover uses checkSite (pure, never deducts). A confirmed build
// is a ONE-SHOT validated transaction (#373 BLD-04): the pure preview is
// re-run against the CURRENT state at commit (a stale preview can never cause
// an overspend), then spend + building + stats + ledger + log land as one unit.
// Any throw mid-commit rolls every touched field back exactly — no half-applied
// construction can destroy materials. An optional command id (6th argument;
// existing 4/5-argument calls are unchanged) makes the commit idempotent: a
// repeated id replays the original outcome with zero further spend, even at
// different coordinates. UI click wiring of command ids is a registered
// follow-up (GAPS.md #373 row) — App.jsx is outside this issue's lease.
export function buildAt(g,type,x,z,rot=0,commandId=null){
 const cmd=typeof commandId==="string"&&commandId.trim()?commandId.trim():null;
 if(cmd){
  const prior=(Array.isArray(g.commands)?g.commands:[]).find(c=>c.id===cmd);
  if(prior){
   // Idempotent replay: no revalidation, no spend, no ledger row, no stats.
   return prior.ok
    ?{ok:true,code:"OK",duplicate:true,commandId:cmd,building:g.buildings.find(b=>b.id===prior.buildingId)||null}
    :{ok:false,code:prior.code,reason:prior.reason,duplicate:true,commandId:cmd};
  }
 }
 const site=checkSite(g,type,x,z,rot);
 if(!site.ok){
  recordLedger(g,{kind:"reject",type,x,z,rot:normalizeRot(rot),code:site.code,reason:site.reason,cost:{},refund:{},...(cmd?{commandId:cmd}:{})});
  if(cmd)recordCommand(g,{id:cmd,ok:false,code:site.code,reason:site.reason,type,x,z,rot:normalizeRot(rot)});
  return {ok:false,reason:site.reason,code:site.code};
 }
 const def=BLUEPRINTS[type];
 // Snapshot every field the commit touches. ledger/log/commands are capped
 // rings, so a push can evict their head — restore full contents, not lengths.
 const snap={bank:{...g.bank},buildings:g.buildings.length,builds:g.stats.builds,
  ledger:[...(Array.isArray(g.ledger)?g.ledger:[])],log:[...g.log],
  commands:[...(Array.isArray(g.commands)?g.commands:[])],nextId:g.nextId};
 try{
  spend(g.bank,def.cost);
  fault("afterSpend",{type,x,z,rot:site.rot});
  const b={id:g.nextId++,type,x,z,rot:site.rot,level:1,remaining:5,inventory:{},timer:0,paid:{...def.cost}};
  fault("beforePush",{type,x,z,rot:site.rot});
  g.buildings.push(b);
  fault("afterPush",{type,x,z,rot:site.rot});
  g.stats.builds++;
  recordLedger(g,{kind:"build",type,buildingId:b.id,x,z,rot:b.rot,cost:{...def.cost},refund:{},...(cmd?{commandId:cmd}:{})});
  fault("afterLedger",{type,x,z,rot:site.rot});
  pushLog(g,def.name+" deployed at "+x+","+z+" — assembling.");
  if(cmd)recordCommand(g,{id:cmd,ok:true,code:"OK",buildingId:b.id,type,x,z,rot:b.rot});
  return {ok:true,building:b,code:"OK",...(cmd?{commandId:cmd}:{})};
 }catch(err){
  // All-or-nothing rollback: bank keys restored exactly (added keys removed),
  // append-only rings restored to their pre-commit contents, counters reset.
  for(const k of Object.keys(g.bank))if(!(k in snap.bank))delete g.bank[k];
  Object.assign(g.bank,snap.bank);
  g.buildings.length=snap.buildings;
  g.stats.builds=snap.builds;
  g.ledger=snap.ledger;
  g.log=snap.log;
  g.commands=snap.commands;
  g.nextId=snap.nextId;
  throw err;
 }
}
// Cancel an in-flight assembly: refunds EXACTLY what this building paid
// (b.paid provenance, durable across ledger eviction and save/reload), never
// the current blueprint price. Conserved ledger, no ghost stock.
export function cancelConstruction(g,id){
 const i=g.buildings.findIndex(b=>b.id===id);
 if(i<0)return {ok:false,code:"MISSING",reason:"No building selected"};
 const b=g.buildings[i];
 if(b.id<=6)return {ok:false,code:"PROTECTED",reason:"Starter buildings are protected; construct your own district."};
 if(b.remaining<=0)return {ok:false,code:"COMPLETE",reason:"Assembly is complete — dismantle the machine instead"};
 const def=BLUEPRINTS[b.type];
 const paid=paidOf(b);
 for(const [r,n] of Object.entries(paid))deposit(g.bank,r,n);
 g.buildings.splice(i,1);
 recordLedger(g,{kind:"cancel",type:b.type,buildingId:b.id,x:b.x,z:b.z,rot:b.rot||0,cost:{},refund:{...paid}});
 pushLog(g,def.name+" construction canceled — full material refund.");
 return {ok:true,code:"OK",refund:{...paid}};
}
export function removeBuilding(g,id){
 const i=g.buildings.findIndex(b=>b.id===id);
 if(i<0)return {ok:false,reason:"No building selected"};
 const b=g.buildings[i];
 if(b.id<=6)return {ok:false,reason:"Starter buildings are protected; construct your own district."};
 for(const v of g.vehicles)if(v.job&&(v.job.sourceId===id||v.job.destId===id))return {ok:false,reason:"A truck has reserved material at this building"};
 const d=BLUEPRINTS[b.type];
 const paid=paidOf(b);
 const refund={};
 for(const [r,amount] of Object.entries(paid)){const n=Math.floor(amount*.4);refund[r]=(refund[r]||0)+n;deposit(g.bank,r,n);}
 for(const [r,amount] of Object.entries(b.inventory)){refund[r]=(refund[r]||0)+amount;deposit(g.bank,r,amount);}
 g.buildings.splice(i,1);
 recordLedger(g,{kind:"salvage",type:b.type,buildingId:b.id,x:b.x,z:b.z,rot:b.rot||0,cost:{},refund});
 pushLog(g,d.name+" salvaged. Recoverable inventory returned.");
 return {ok:true,refund};
}
export function roadLine(g,a,b){
 if(!inside(a.x,a.z)||!inside(b.x,b.z))return {ok:false,reason:"Road end is outside the surveyed land"};
 const points=[];
 let x=a.x,z=a.z;points.push({x,z});
 while(x!==b.x){x+=x<b.x?1:-1;points.push({x,z});}
 while(z!==b.z){z+=z<b.z?1:-1;points.push({x,z});}
 if(points.length>30)return {ok:false,reason:"Route too long; build it in segments"};
 const existing=new Set(g.roads);
 const added=points.filter(p=>!existing.has(key(p.x,p.z)));
 if(added.some(p=>buildingAt(g,p.x,p.z)))return {ok:false,reason:"Road intersects a machine; route around it"};
 const cost={credits:4*added.length,stone:3*added.length};
 if(!fits(g.bank,cost))return {ok:false,reason:"Need "+cost.stone+" aggregate and "+cost.credits+" credits"};
 spend(g.bank,cost);for(const p of added)g.roads.push(key(p.x,p.z));
 pushLog(g,added.length+" road segments paved; freight network updated.");
 return {ok:true,cells:added.length};
}
function neighbors(x,z){
 return [[x-1,z],[x+1,z],[x,z-1],[x,z+1]].filter(([a,b])=>inside(a,b));
}
export function nearestRoad(g,x,z){
 let best=null,score=Infinity;
 for(const tile of g.roads){const [a,b]=cellOf(tile);const d=Math.abs(a-x)+Math.abs(b-z);
  if(d<score){best={x:a,z:b};score=d;}}
 return score<=3?best:null;
}
export function roadPath(g,a,b){
 if(!a||!b)return null;
 const start=key(a.x,a.z),end=key(b.x,b.z),set=new Set(g.roads);
 if(!set.has(start)||!set.has(end))return null;
 const frontier=[start],prev=new Map([[start,null]]);
 for(let i=0;i<frontier.length;i++){
  const t=frontier[i];if(t===end)break;
  const [x,z]=cellOf(t);
  for(const [nx,nz] of neighbors(x,z)){const k=key(nx,nz);if(set.has(k)&&!prev.has(k)){prev.set(k,t);frontier.push(k);}}
 }
 if(!prev.has(end))return null;
 const rev=[];for(let at=end;at!==null;at=prev.get(at)){const [x,z]=cellOf(at);rev.push({x,z});}
 return rev.reverse();
}
export function connectedToRoad(g,b){return !!nearestRoad(g,b.x,b.z);}
function deliveryCandidates(g){
 const bank=g.buildings.find(b=>b.type==="depot"&&b.remaining<=0);
 if(!bank)return [];
 const candidates=[];
 for(const b of g.buildings){
  if(b.remaining>0||b.id===bank.id)continue;
  const def=BLUEPRINTS[b.type];if(!def)continue;
  for(const [id,amount] of Object.entries(b.inventory||{})){
   if(amount>=3 && !g.vehicles.some(v=>v.job?.sourceId===b.id&&v.job?.resource===id)){
    candidates.push({source:b,dest:bank,resource:id,amount:Math.min(15,Math.floor(amount)),priority:1});
   }
  }
  for(const [id,n] of Object.entries(def.inputs)){
   const have=stock(b.inventory,id);
   if(have<n*2 && stock(g.bank,id)>=n*2 &&
      !g.vehicles.some(v=>v.job?.destId===b.id&&v.job?.resource===id)){
    candidates.push({source:bank,dest:b,resource:id,amount:Math.min(stock(g.bank,id),n*3),priority:3});
   }
  }
 }
 return candidates.sort((a,b)=>b.priority-a.priority);
}
// RESERVE transition (#384): source stock -> reserved load. The units leave the
// source bag exactly once and are held against the job, NOT yet onboard.
function assignJob(g,v){
 const start=nearestRoad(g,Math.round(v.x),Math.round(v.z));
 const candidates=deliveryCandidates(g);
 for(const c of candidates){
  const src=nearestRoad(g,c.source.x,c.source.z),dst=nearestRoad(g,c.dest.x,c.dest.z);
  const toSource=roadPath(g,start,src),toDest=roadPath(g,src,dst);
  if(!toSource||!toDest)continue;
  const fromBank=c.source.type==="depot";
  const sourceBag=fromBank?g.bank:c.source.inventory;
  const amount=take(sourceBag,c.resource,c.amount);
  if(amount<=0)continue;
  v.cargo=null;
  v.job={sourceId:c.source.id,destId:c.dest.id,resource:c.resource,amount,
    phase:"toSource",toSource,toDest,route:toSource,segment:0,progress:0};
  recordFreight(g,{kind:"reserve",vehicleId:v.id,sourceId:c.source.id,destId:c.dest.id,resource:c.resource,amount});
  return;
 }
}
// PICKUP transition (#384): reserved load -> onboard truck cargo, validated.
// Refuses to load a truck that already carries cargo (no duplication).
function pickupCargo(g,v){
 const j=v.job;
 if(!j||j.phase!=="toSource")return {ok:false,code:"PHASE"};
 if(v.cargo)return {ok:false,code:"ALREADY_LOADED"};
 if(!(j.amount>0))return {ok:false,code:"EMPTY"};
 v.cargo={resource:j.resource,amount:j.amount};
 j.phase="toDest";j.route=j.toDest;j.segment=0;j.progress=0;
 recordFreight(g,{kind:"pickup",vehicleId:v.id,sourceId:j.sourceId,destId:j.destId,resource:j.resource,amount:j.amount});
 return {ok:true};
}
// ARRIVAL transition (#384): onboard cargo -> destination stock, validated.
// Cargo must exactly match the reserved job; a vanished destination returns the
// load to its source instead of teleporting goods into the bank.
function arriveCargo(g,v){
 const j=v.job,c=v.cargo;
 if(!j||j.phase!=="toDest"||!c||c.resource!==j.resource||c.amount!==j.amount){returnFreight(g,v,"ARRIVAL_INVALID");return;}
 const dest=g.buildings.find(b=>b.id===j.destId);
 if(!dest){returnFreight(g,v,"DEST_MISSING");return;}
 deposit(bagOfBuilding(g,dest),c.resource,c.amount);
 recordFreight(g,{kind:"arrive",vehicleId:v.id,sourceId:j.sourceId,destId:j.destId,resource:c.resource,amount:c.amount});
 g.stats.delivered+=c.amount;g.stats.shipments++;
 v.job=null;v.cargo=null;
}
// RETURN transition (#384): cancel/blockage/reload repair. Returns whichever
// single ledger holds the units — onboard cargo if picked up, otherwise the
// reservation — to the source bag (bank if the source is gone). Never both.
function returnFreight(g,v,reason){
 const j=v.job;
 const load=v.cargo&&v.cargo.amount>0?v.cargo:(j&&j.amount>0?{resource:j.resource,amount:j.amount}:null);
 if(!load){v.job=null;v.cargo=null;return {ok:false,code:"EMPTY",reason:"No freight to return"};}
 deposit(sourceBagOf(g,j)||g.bank,load.resource,load.amount);
 recordFreight(g,{kind:"return",vehicleId:v.id,sourceId:j?.sourceId??null,destId:j?.destId??null,resource:load.resource,amount:load.amount,reason});
 pushLog(g,v.name+" returned "+load.amount+" "+load.resource+" to stock — "+reason.toLowerCase().replace(/_/g," ")+".");
 v.job=null;v.cargo=null;
 return {ok:true,resource:load.resource,amount:load.amount};
}
// Player command: cancel a truck's freight job. Reserved or onboard units go
// back to the source exactly once; a second cancel is a no-op (IDLE).
export function cancelFreight(g,vehicleId){
 const v=g.vehicles.find(v=>v.id===vehicleId);
 if(!v)return {ok:false,code:"MISSING",reason:"No truck selected"};
 if(!v.job&&!v.cargo)return {ok:false,code:"IDLE",reason:"Truck has no freight to cancel"};
 const r=returnFreight(g,v,"CANCELLED");
 return r.ok?{ok:true,code:"OK",resource:r.resource,amount:r.amount}:r;
}
// Save/reload reconciliation (#384): a v2 save must never count the same units
// as both reserved AND onboard. Onboard cargo is authoritative once picked up;
// any inconsistent pair is returned to source (or bank) exactly once.
export function reconcileFreight(g){
 const routeOk=r=>Array.isArray(r)&&r.length>0&&r.every(p=>p&&inside(p.x,p.z));
 for(const v of g.vehicles){
  const j=v.job;
  let c=v.cargo;
  if(c&&!(typeof c.resource==="string"&&Number.isFinite(c.amount)&&c.amount>0))c=v.cargo=null;
  const validJob=j&&typeof j.resource==="string"&&Number.isFinite(j.amount)&&j.amount>0
   &&(j.phase==="toSource"||j.phase==="toDest")&&routeOk(j.route)&&routeOk(j.toSource)&&routeOk(j.toDest);
  if(c){
   if(validJob&&j.phase==="toDest"&&c.resource===j.resource&&c.amount===j.amount)continue;
   const bag=validJob?sourceBagOf(g,j):null;
   deposit(bag||g.bank,c.resource,c.amount);
   recordFreight(g,{kind:"reconcile",vehicleId:v.id,sourceId:j?.sourceId??null,destId:j?.destId??null,
    resource:c.resource,amount:c.amount,reason:!validJob?"JOB_MISSING":j.phase==="toSource"?"PHASE_STALE":"CARGO_MISMATCH"});
   v.job=null;v.cargo=null;continue;
  }
  if(!validJob){v.job=null;v.cargo=null;continue;}
  if(j.phase==="toDest"){
   deposit(sourceBagOf(g,j)||g.bank,j.resource,j.amount);
   recordFreight(g,{kind:"reconcile",vehicleId:v.id,sourceId:j.sourceId,destId:j.destId,resource:j.resource,amount:j.amount,reason:"CARGO_MISSING"});
   v.job=null;v.cargo=null;
  }
 }
}
// Exact measurement of the four distinct freight ledgers (#384 acceptance):
// source/destination stock (bank + building inventories), reserved load and
// actual onboard cargo, summed per resource without double counting.
export function freightTotals(g){
 const totals={};
 const add=b=>{for(const id of Object.keys(b||{})){const n=stock(b,id);if(n>0)totals[id]=(totals[id]||0)+n;}};
 add(g.bank);
 for(const b of g.buildings)add(b.inventory);
 let reserved=0,onboard=0;
 for(const v of g.vehicles){
  if(v.job?.phase==="toSource"&&v.job.amount>0){totals[v.job.resource]=(totals[v.job.resource]||0)+v.job.amount;reserved+=v.job.amount;}
  if(v.cargo?.amount>0){totals[v.cargo.resource]=(totals[v.cargo.resource]||0)+v.cargo.amount;onboard+=v.cargo.amount;}
 }
 return {totals,reserved,onboard};
}
export function freightManifest(g){
 return {
  bank:{...g.bank},
  buildings:g.buildings.map(b=>({id:b.id,type:b.type,inventory:{...(b.inventory||{})}})),
  vehicles:g.vehicles.map(v=>({id:v.id,name:v.name,phase:v.job?.phase||"idle",
   sourceId:v.job?.sourceId??null,destId:v.job?.destId??null,
   reserved:v.job?.phase==="toSource"?{resource:v.job.resource,amount:v.job.amount}:null,
   cargo:v.cargo?{resource:v.cargo.resource,amount:v.cargo.amount}:null})),
  totals:freightTotals(g)
 };
}
function moveVehicle(g,v,seconds){
 const j=v.job;if(!j)return;
 // #384 disconnect guard: a severed route or vanished source returns the freight
 // (reserved OR onboard, never both) to its source exactly once, with a log line.
 const roadSet=new Set(g.roads);
 const severed=r=>!Array.isArray(r)||r.some(p=>!roadSet.has(key(p.x,p.z)));
 if(severed(j.route)||severed(j.toSource)||severed(j.toDest)){returnFreight(g,v,"ROUTE_BLOCKED");return;}
 if(!g.buildings.some(b=>b.id===j.sourceId)){returnFreight(g,v,"SOURCE_MISSING");return;}
 let remaining=seconds*(v.speed||2.1)*(g.research.includes("fleet")?1.18:1);
 while(remaining>0&&v.job){
  const route=j.route;
  if(j.segment>=route.length-1){
   if(j.phase==="toSource"){
    const p=pickupCargo(g,v);
    if(!p.ok){returnFreight(g,v,"PICKUP_INVALID");return;}
    continue;
   }
   arriveCargo(g,v);return;
  }
  const from=route[j.segment],to=route[j.segment+1];
  const capacity=1-j.progress,delta=Math.min(remaining,capacity);
  j.progress+=delta;remaining-=delta;
  v.x=from.x+(to.x-from.x)*j.progress;v.z=from.z+(to.z-from.z)*j.progress;
  if(j.progress>=1-1e-8){j.segment++;j.progress=0;}
 }
}
export function advanceGame(g,seconds){
 let remaining=Math.max(0,Math.min(seconds,300));
 while(remaining>1e-5){
  const dt=Math.min(0.5,remaining);remaining-=dt;g.elapsed+=dt;
  const power=powerStatus(g);
  for(const b of g.buildings){
   if(b.remaining>0){b.remaining=Math.max(0,b.remaining-dt);continue;}
   const d=BLUEPRINTS[b.type];if(!d?.cycle||!power.available)continue;
   b.timer+=dt*(1+(g.research.includes("crew") ? 0.12 : 0)+(g.research.includes("smelt") ? 0.12 : 0));
   if(b.timer>=d.cycle){
    b.timer%=d.cycle;
    if(fits(b.inventory,d.inputs)){
     spend(b.inventory,d.inputs);
     for(const [id,n] of Object.entries(d.outputs)){deposit(b.inventory,id,n*b.level);g.stats.produced+=n*b.level;}
    }
   }
  }
  for(const v of g.vehicles){
   if(!v.job&&v.cargo)returnFreight(g,v,"JOB_MISSING");
   if(!v.job)assignJob(g,v);
   if(v.job)moveVehicle(g,v,dt);
   v.anim+=dt;
  }
  const rank=TIERS.findLast(t=>g.stats.produced>=t.needs);
  if(rank&&rank.id>g.tier){g.tier=rank.id;pushLog(g,"Industrial milestone: "+rank.name+" — new blueprints unlocked.");}
 }
 return g;
}
export function sell(g,id,quantity){
 const amounts={scrap:2,iron:7,copper:12,steel:38,alloy:95,gears:65,circuits:120,fuel:9};
 if(!amounts[id])return {ok:false,reason:"No market contract for this material"};
 const n=Math.min(stock(g.bank,id),Math.max(1,Math.floor(quantity)));
 if(n<=0)return {ok:false,reason:"No inventory available to sell"};
 take(g.bank,id,n);
 const earnings=n*amounts[id];deposit(g.bank,"credits",earnings);g.stats.sold+=earnings;
 pushLog(g,"Trade convoy sold "+n+" "+id+" for "+earnings+" credits.");
 return {ok:true,earnings};
}
export function researchAt(g,id){
 const d=RESEARCH.find(r=>r.id===id);
 if(!d)return {ok:false,reason:"Research unavailable"};
 if(g.research.includes(id))return {ok:false,reason:"Already researched"};
 if(!fits(g.bank,d.cost))return {ok:false,reason:"Not enough credits or research data"};
 spend(g.bank,d.cost);g.research.push(id);pushLog(g,d.name+" research completed.");
 return {ok:true};
}
export function inspectBuilding(g,id){return g.buildings.find(b=>b.id===id)||null;}
export function snapshot(g){return clone(g);}
