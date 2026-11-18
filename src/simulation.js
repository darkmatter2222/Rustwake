import {WORLD_SIZE,INITIAL_BANK,BLUEPRINTS,TIERS,RESEARCH,ROAD_KINDS,SAVE_KEY,STARTER_BUILDINGS,INITIAL_ROADS} from "./content.js";
import {key,cellOf,inside,checkSite,buildingAt,footprintCells,normalizeRot} from "./gridOccupancy.js";
import {laneRoute,separationClamp,turnClear,envelopeGapWorld,MIN_GAP_WORLD,WAIT_TIMEOUT_SECONDS} from "./traffic.js";

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
// Stock sanitization (#377 BLD-08): a refund may only ever move finite,
// non-negative units. Zero keys are preserved so legitimate save round-trips
// stay byte-identical; negative/NaN/non-numeric entries are dropped, never
// deposited (a tampered inventory must not mint, destroy or poison bank stock).
const sanitizeBag=(bag)=>{
 const out={};
 if(bag&&typeof bag==="object"&&!Array.isArray(bag))
  for(const [id,v] of Object.entries(bag)){const n=Number(v);if(Number.isFinite(n)&&n>=0)out[id]=n;}
 return out;
};
// 100% cargo recovery (#377): every positive sanitized inventory unit returns
// to the depot on dismantle AND on cancel — no unit is ever silently destroyed.
const cargoRefund=(b)=>{
 const out={};
 for(const [id,n] of Object.entries(sanitizeBag(b?.inventory)))if(n>0)out[id]=(out[id]||0)+n;
 return out;
};
const sourceBagOf=(g,j)=>bagOfBuilding(g,g.buildings.find(b=>b.id===j?.sourceId));
// ---- Dispatch cooldown (#558, BLD-08 follow-up) ----
// advanceGame re-runs assignJob for every idle truck EVERY substep, so after a
// player cancelFreight the dispatcher used to re-reserve the same cargo on the
// very next tick (cancelling RESTORES the source inventory that made it a
// candidate) — the cancel->dismantle window was not normally winnable. Remedy
// (issue #558 option (a)): a successful player cancel records an ABSOLUTE
// SIM-TIME expiry for the cancelled source+resource PAIR in g.dispatchCooldowns
// ({"<sourceId>:<resource>": untilElapsed}); deliveryCandidates skips cooled
// pairs until g.elapsed passes the expiry, then normal dispatch resumes. The
// window is 15 sim seconds — the midpoint of the issue's 10-20s range: long
// enough for the deliberate two-step dismantle confirm on desktop AND phone
// (panel navigation + dialog), short enough that a cancelled haul resumes
// promptly when the player keeps the machine. Sim time (never wall clock) keeps
// it deterministic, replay-safe and correctly consumed by offline catch-up;
// the registry is part of the save, so reload cannot bypass it. readGame
// sanitizes hostile entries and clamps far-future expiries to ONE window so a
// tampered save can never permanently lock dispatch. The RESERVED hard block
// and exactly-once cancellation/conservation are NOT weakened: the cooldown
// only suppresses NEW reservations, it never touches live jobs or ledgers.
export const DISPATCH_COOLDOWN_SECONDS=15;
const pairKey=(sourceId,resource)=>sourceId+":"+resource;
const cooldownUntil=(g,sourceId,resource)=>{
 const until=g?.dispatchCooldowns?.[pairKey(sourceId,resource)];
 return Number.isFinite(until)?until:0;
};
// Read-only remaining window (sim seconds) for UI/tests; 0 when not cooled.
export function dispatchCooldownRemaining(g,sourceId,resource){
 return Math.max(0,cooldownUntil(g,sourceId,resource)-(g?.elapsed||0));
}
const sanitizeCooldowns=(raw,elapsed)=>{
 const out={};
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return out;
 for(const [k,v] of Object.entries(raw)){
  if(!/^\d+:[a-z]+$/.test(k))continue;
  const n=Number(v);
  if(!Number.isFinite(n)||n<=elapsed)continue;
  out[k]=Math.min(n,elapsed+DISPATCH_COOLDOWN_SECONDS);
 }
 return out;
};
// ---- Output-collection fairness (#567) ----
// Measured on a fresh untouched yard (zero player input, 660 sim seconds, both
// 38c36cc0 and 4a9571e3): the furnace steel bay backed up to 228 units and was
// NEVER collected, while the fleet hauled 307 other shipments. The route was
// fully connected; the defect was candidate ORDERING — every output is
// priority 1 in building/inventory insertion order, so the salvager's scrap
// (and priority-3 input replenishments) permanently outranked furnace steel
// under the saturated 3-truck fleet. Remedy: oldest-served-first ordering for
// output candidates. g.freightServedAt maps "<sourceId>:<resource>" to the sim
// time that pair's output LAST arrived at the depot; never-served pairs sort
// first (-1), then oldest served. This is deterministic, replay-safe, part of
// the save, and cannot starve any eligible output bay indefinitely. It does
// NOT change input priority (3), the RESERVED hard block, the #558 cooldown,
// or any ledger transition — only the tie-break order among priority-1 output
// candidates. readGame sanitizes hostile entries (bad keys, non-finite or
// future timestamps, vanished sources) and caps the registry.
const SERVED_AT_CAP=2048;
const servedAtOf=(g,sourceId,resource)=>{
 const n=g?.freightServedAt?.[pairKey(sourceId,resource)];
 return Number.isFinite(n)?n:-1;
};
const sanitizeServedAt=(raw,elapsed,buildings)=>{
 let out={};
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return out;
 const ids=new Set((buildings||[]).map(b=>b.id));
 for(const [k,v] of Object.entries(raw)){
  if(!/^\d+:[a-z]+$/.test(k))continue;
  const n=Number(v);
  if(!Number.isFinite(n)||n<0||n>elapsed)continue;
  if(!ids.has(Number(k.split(":")[0])))continue;
  out[k]=n;
 }
 const keys=Object.keys(out);
 if(keys.length>SERVED_AT_CAP){
  const keep=keys.sort((a,b)=>out[b]-out[a]).slice(0,SERVED_AT_CAP);
  const trimmed={};for(const k of keep)trimmed[k]=out[k];out=trimmed;
 }
 return out;
};
const pruneServedAt=(g,id)=>{
 if(g.freightServedAt&&typeof g.freightServedAt==="object")
  for(const k of Object.keys(g.freightServedAt))if(k.startsWith(id+":"))delete g.freightServedAt[k];
};
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
 // #589: heading/waiting/blockedBy/waitTime are real motion state. heading is the
 // last axis-aligned travel direction (envelope orientation + right-of-way geometry);
 // waiting/blockedBy expose an honest traffic queue to the fleet panel and tests;
 // waitTime accumulates continuous blocked seconds and drives deadlock rerouting.
 const vehicles=[
  {id:1,name:"HAULER-01",x:11,z:10,speed:2.25,job:null,cargo:null,anim:0,heading:{x:1,z:0},waiting:false,blockedBy:null,waitTime:0},
  {id:2,name:"HAULER-02",x:11,z:11,speed:2.6,job:null,cargo:null,anim:0,heading:{x:1,z:0},waiting:false,blockedBy:null,waitTime:0},
  {id:3,name:"HAULER-03",x:11,z:12,speed:2.0,job:null,cargo:null,anim:0,heading:{x:1,z:0},waiting:false,blockedBy:null,waitTime:0}
 ];
 return {version:2,seed:4073,createdAt:Date.now(),lastSavedAt:Date.now(),elapsed:0,
  nextId:10,bank:{...INITIAL_BANK},buildings,roads:[...INITIAL_ROADS],vehicles,
  research:[],discovered:["cinders"],tier:0,world:"Cinder Basin",sector:1,ledger:[],freightLedger:[],commands:[],dispatchCooldowns:{},freightServedAt:{},
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
   .map(b=>({...b,rot:normalizeRot(b.rot),paid:paidOf(b),inventory:sanitizeBag(b.inventory)}));
 g.ledger=Array.isArray(g.ledger)?g.ledger.filter(e=>e&&typeof e==="object").slice(-64):[];
 g.freightLedger=Array.isArray(g.freightLedger)?g.freightLedger.filter(e=>e&&typeof e==="object").slice(-128):[];
 // #373: replay protection survives reload; malformed registry entries drop.
 g.commands=Array.isArray(g.commands)?g.commands.filter(c=>c&&typeof c==="object"&&typeof c.id==="string"&&c.id).slice(-COMMAND_CAP):[];
 // #558: dispatch cooldowns survive reload (absolute sim-time expiry). Malformed
 // and expired entries drop; tampered far-future expiries clamp to ONE window.
 g.dispatchCooldowns=sanitizeCooldowns(data.dispatchCooldowns,g.elapsed);
 // #567: output-collection fairness registry survives reload; hostile entries drop.
 g.freightServedAt=sanitizeServedAt(data.freightServedAt,g.elapsed,g.buildings);
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
  // #377: kind-tagged dismantle/cancel outcomes belong to their own commands;
  // build replay only matches untagged (build/legacy) entries.
  const prior=(Array.isArray(g.commands)?g.commands:[]).find(c=>c.id===cmd&&!c.kind);
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
// ---- Dismantle / cancel transaction authority (#377 BLD-08) ----
// Both removals follow the #373 BLD-04 discipline: ONE validated transaction
// (refund + splice + ledger + log) with full snapshot rollback on any throw,
// and an optional command id (3rd argument; existing 1/2-argument calls are
// unchanged) that makes the outcome idempotent across duplicate delivery AND
// save/reload. Replay returns the EXACT original refund with zero further
// deposit, no ledger row and no log line. Active-job semantics (documented in
// docs/engineering/ECONOMY.md): HARD BLOCK — while any live truck job references
// the building (source OR destination) removal is refused with RESERVED and
// state is untouched; real cancellation is per-truck cancelFreight (#384),
// which returns reserved/onboard units to their source exactly once. The player
// cancels freight first, then dismantles; no cargo is ever stranded or doubled.
// A rejected command records its rejection (replayable); a thrown commit
// records nothing and is retryable.
const removalRejection=(g,cmd,kind,code,reason,id,b)=>{
 if(cmd){
  const site=b?{type:b.type,x:b.x,z:b.z,rot:b.rot||0}:{};
  recordLedger(g,{kind:"reject",buildingId:id,...site,code,reason,cost:{},refund:{},commandId:cmd});
  recordCommand(g,{id:cmd,kind,ok:false,code,reason,buildingId:id});
 }
 return {ok:false,code,reason,...(cmd?{commandId:cmd}:{})};
};
const priorRemoval=(g,cmd,kind)=>{
 const prior=(Array.isArray(g.commands)?g.commands:[]).find(c=>c.id===cmd&&c.kind===kind);
 if(!prior)return null;
 return prior.ok
  ?{ok:true,code:"OK",duplicate:true,commandId:cmd,refund:{...(prior.refund&&typeof prior.refund==="object"?prior.refund:{})}}
  :{ok:false,code:prior.code,reason:prior.reason,duplicate:true,commandId:cmd};
};
const commandIdOf=(commandId)=>typeof commandId==="string"&&commandId.trim()?commandId.trim():null;
// Snapshot/rollback shared by both removals. ledger/log/commands are capped
// rings: restore full CONTENTS (a push can evict their head), not lengths.
const removalSnapshot=(g)=>({bank:{...g.bank},buildings:[...g.buildings],
 ledger:[...(Array.isArray(g.ledger)?g.ledger:[])],log:[...g.log],
 commands:[...(Array.isArray(g.commands)?g.commands:[])],nextId:g.nextId,
 freightServedAt:{...(g.freightServedAt||{})}});
const removalRollback=(g,snap)=>{
 for(const k of Object.keys(g.bank))if(!(k in snap.bank))delete g.bank[k];
 Object.assign(g.bank,snap.bank);
 g.buildings.splice(0,g.buildings.length,...snap.buildings);
 g.ledger=snap.ledger;g.log=snap.log;g.commands=snap.commands;g.nextId=snap.nextId;
 g.freightServedAt=snap.freightServedAt;
};
// Cancel an in-flight assembly: refunds EXACTLY what this building paid
// (b.paid provenance, durable across ledger eviction and save/reload) PLUS 100%
// of any stored cargo (#377 conservation: assembling machines normally hold
// empty inventory — deliveryCandidates skips remaining>0 — but legacy/tampered
// saves can carry cargo, and no unit may be silently destroyed). Conserved
// ledger, no ghost stock.
export function cancelConstruction(g,id,commandId=null){
 const cmd=commandIdOf(commandId);
 if(cmd){const replay=priorRemoval(g,cmd,"cancel");if(replay)return replay;}
 const i=g.buildings.findIndex(b=>b.id===id);
 if(i<0)return removalRejection(g,cmd,"cancel","MISSING","No building selected",id,null);
 const b=g.buildings[i];
 if(b.id<=6)return removalRejection(g,cmd,"cancel","PROTECTED","Starter buildings are protected; construct your own district.",id,b);
 if(b.remaining<=0)return removalRejection(g,cmd,"cancel","COMPLETE","Assembly is complete — dismantle the machine instead",id,b);
 for(const v of g.vehicles)if(v.job&&(v.job.sourceId===id||v.job.destId===id))
  return removalRejection(g,cmd,"cancel","RESERVED","A truck has reserved material at this building",id,b);
 const def=BLUEPRINTS[b.type];
 const refund={...paidOf(b)};
 for(const [r,n] of Object.entries(cargoRefund(b)))refund[r]=(refund[r]||0)+n;
 const snap=removalSnapshot(g);
 try{
  for(const [r,n] of Object.entries(refund))deposit(g.bank,r,n);
  fault("cancel.afterRefund",{id});
  g.buildings.splice(i,1);
  pruneServedAt(g,id);
  fault("cancel.afterSplice",{id});
  recordLedger(g,{kind:"cancel",type:b.type,buildingId:b.id,x:b.x,z:b.z,rot:b.rot||0,cost:{},refund:{...refund},...(cmd?{commandId:cmd}:{})});
  fault("cancel.afterLedger",{id});
  pushLog(g,def.name+" construction canceled — full material refund.");
  if(cmd)recordCommand(g,{id:cmd,kind:"cancel",ok:true,code:"OK",buildingId:b.id,refund:{...refund}});
  return {ok:true,code:"OK",refund,...(cmd?{commandId:cmd}:{})};
 }catch(err){removalRollback(g,snap);throw err;}
}
// Dismantle a completed machine: floor(40%) of durable paid build materials
// plus 100% of sanitized stored cargo (processed outputs included — the
// inventory holds whatever the machine actually stores, not the cost recipe).
export function removeBuilding(g,id,commandId=null){
 const cmd=commandIdOf(commandId);
 if(cmd){const replay=priorRemoval(g,cmd,"dismantle");if(replay)return replay;}
 const i=g.buildings.findIndex(b=>b.id===id);
 if(i<0)return removalRejection(g,cmd,"dismantle","MISSING","No building selected",id,null);
 const b=g.buildings[i];
 if(b.id<=6)return removalRejection(g,cmd,"dismantle","PROTECTED","Starter buildings are protected; construct your own district.",id,b);
 for(const v of g.vehicles)if(v.job&&(v.job.sourceId===id||v.job.destId===id))
  return removalRejection(g,cmd,"dismantle","RESERVED","A truck has reserved material at this building",id,b);
 const d=BLUEPRINTS[b.type];
 const refund={};
 for(const [r,amount] of Object.entries(paidOf(b))){const n=Math.floor(amount*.4);refund[r]=(refund[r]||0)+n;}
 for(const [r,n] of Object.entries(cargoRefund(b)))refund[r]=(refund[r]||0)+n;
 const snap=removalSnapshot(g);
 try{
  for(const [r,n] of Object.entries(refund))deposit(g.bank,r,n);
  fault("dismantle.afterRefund",{id});
  g.buildings.splice(i,1);
  pruneServedAt(g,id);
  fault("dismantle.afterSplice",{id});
  recordLedger(g,{kind:"salvage",type:b.type,buildingId:b.id,x:b.x,z:b.z,rot:b.rot||0,cost:{},refund:{...refund},...(cmd?{commandId:cmd}:{})});
  fault("dismantle.afterLedger",{id});
  pushLog(g,d.name+" salvaged. Recoverable inventory returned.");
  if(cmd)recordCommand(g,{id:cmd,kind:"dismantle",ok:true,code:"OK",buildingId:b.id,refund:{...refund}});
  return {ok:true,code:"OK",refund,...(cmd?{commandId:cmd}:{})};
 }catch(err){removalRollback(g,snap);throw err;}
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
export function roadPath(g,a,b,avoid=null){
 if(!a||!b)return null;
 const start=key(a.x,a.z),end=key(b.x,b.z),set=new Set(g.roads);
 if(!set.has(start)||!set.has(end))return null;
 // #589 deadlock recovery: an optional obstacle set (blocker cells) the BFS must
 // route around. Backward compatible — 2-arg callers pass null and get the old
 // shortest path. If the destination itself is avoided, no path exists (null).
 const frontier=[start],prev=new Map([[start,null]]);
 for(let i=0;i<frontier.length;i++){
  const t=frontier[i];if(t===end)break;
  const [x,z]=cellOf(t);
  for(const [nx,nz] of neighbors(x,z)){const k=key(nx,nz);if(set.has(k)&&!prev.has(k)&&!(avoid&&avoid.has(k))){prev.set(k,t);frontier.push(k);}}
 }
 if(!prev.has(end))return null;
 const rev=[];for(let at=end;at!==null;at=prev.get(at)){const [x,z]=cellOf(at);rev.push({x,z});}
 return rev.reverse();
}
export function connectedToRoad(g,b){return !!nearestRoad(g,b.x,b.z);}
function deliveryCandidates(g){
 const bank=g.buildings.find(b=>b.type==="depot"&&b.remaining<=0);
 if(!bank)return [];
 // #558: prune expired cooldowns so the registry stays bounded by LIVE pairs.
 if(g.dispatchCooldowns&&typeof g.dispatchCooldowns==="object")
  for(const [k,until] of Object.entries(g.dispatchCooldowns))
   if(!(Number.isFinite(until)&&until>g.elapsed))delete g.dispatchCooldowns[k];
 const cooled=(sourceId,resource)=>cooldownUntil(g,sourceId,resource)>g.elapsed;
 const candidates=[];
 for(const b of g.buildings){
  if(b.remaining>0||b.id===bank.id)continue;
  const def=BLUEPRINTS[b.type];if(!def)continue;
  for(const [id,amount] of Object.entries(b.inventory||{})){
   // #575: a machine's own feedstock is never an "output". Hauling it to the
   // bank only to re-deliver it as a priority-3 input burned shuttle trips on
   // the saturated starter fleet (product ruling #567, follow-up #575). Input
   // resupply below still tops the buffer up; produced goods still export.
   if(def.inputs&&id in def.inputs)continue;
   if(amount>=3 && !cooled(b.id,id) && !g.vehicles.some(v=>v.job?.sourceId===b.id&&v.job?.resource===id)){
    // #567: oldest-served-first tie-break among priority-1 outputs; a pair
    // never collected (-1) outranks every previously served pair.
    candidates.push({source:b,dest:bank,resource:id,amount:Math.min(15,Math.floor(amount)),priority:1,servedAt:servedAtOf(g,b.id,id)});
   }
  }
  for(const [id,n] of Object.entries(def.inputs)){
   const have=stock(b.inventory,id);
   // #585 stranding fix: below the normal n*2 bank threshold, an EMERGENCY
   // top-up still fires when the buffer cannot fund one more cycle (have<n)
   // and the bank can (bank>=n). The old n*2 rule stranded usable fuel — bank
   // 2 sat below 4 while the furnace buffer stuck at 1 < 2/cycle, a halt with
   // bank fuel >= per-cycle cost. Now a genuine halt leaves bank stock
   // strictly BELOW the per-cycle cost. Normal resupply (have<n*2, bank>=n*2)
   // and the #575 feedstock guard above are unchanged.
   const bankHave=stock(g.bank,id);
   if(have<n*2 && bankHave>=n && (bankHave>=n*2||have<n) && !cooled(bank.id,id) &&
      !g.vehicles.some(v=>v.job?.destId===b.id&&v.job?.resource===id)){
    candidates.push({source:bank,dest:b,resource:id,amount:Math.min(stock(g.bank,id),n*3),priority:3});
   }
  }
 }
 // Stable sort: priority first (inputs 3 > outputs 1), then oldest-served
 // output first. Insertion order still breaks exact ties (deterministic).
 return candidates.sort((a,b)=>b.priority-a.priority||(a.servedAt??-1)-(b.servedAt??-1));
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
 // #567: stamp the pair's last output collection so the next dispatch decision
 // serves the oldest waiting bay instead of the same insertion-order favorite.
 if(dest.type==="depot"){
  if(!g.freightServedAt||typeof g.freightServedAt!=="object"||Array.isArray(g.freightServedAt))g.freightServedAt={};
  g.freightServedAt[pairKey(j.sourceId,c.resource)]=g.elapsed;
 }
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
// back to the source exactly once; a second cancel is a no-op (IDLE). A
// successful cancel ALSO arms the #558 dispatch cooldown for the cancelled
// source+resource pair, so the dispatcher cannot immediately re-reserve the
// very cargo the player just returned — the cancel->dismantle window is now
// genuinely winnable. Automatic returns (route blockage, reload repair, fleet
// cap) do NOT arm it: only the deliberate player command suppresses dispatch.
export function cancelFreight(g,vehicleId){
 const v=g.vehicles.find(v=>v.id===vehicleId);
 if(!v)return {ok:false,code:"MISSING",reason:"No truck selected"};
 if(!v.job&&!v.cargo)return {ok:false,code:"IDLE",reason:"Truck has no freight to cancel"};
 const sourceId=v.job?.sourceId??null;
 const r=returnFreight(g,v,"CANCELLED");
 if(r.ok&&sourceId!==null){
  if(!g.dispatchCooldowns||typeof g.dispatchCooldowns!=="object"||Array.isArray(g.dispatchCooldowns))g.dispatchCooldowns={};
  g.dispatchCooldowns[pairKey(sourceId,r.resource)]=g.elapsed+DISPATCH_COOLDOWN_SECONDS;
 }
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
// #589 deadlock recovery. A truck continuously blocked past WAIT_TIMEOUT_SECONDS
// re-routes around its blocker's cell via obstacle BFS, then resumes on the new
// right-hand lane. This is the guaranteed cycle-breaker: forward-only + id
// tie-breaks can still form a mixed following/mutual wait-for cycle at a saturated
// intersection; a bounded reroute dissolves it without starving the furnace.
// Freight is untouched (same source/dest, same phase); only j.route changes. The
// new lane start is separation-checked against every other truck BEFORE commit, so
// recovery can never introduce an overlap. Returns true if a safe reroute landed.
function rerouteAroundBlocker(g,v){
 const j=v.job;if(!j||v.blockedBy==null)return false;
 const dest=j.route[j.route.length-1];
 const cur=nearestRoad(g,Math.round(v.x),Math.round(v.z));
 if(!cur||!dest)return false;
 const blocker=g.vehicles.find(u=>u.id===v.blockedBy);
 const avoid=new Set();
 if(blocker){const bc=nearestRoad(g,Math.round(blocker.x),Math.round(blocker.z));if(bc)avoid.add(key(bc.x,bc.z));}
 if(avoid.has(key(dest.x,dest.z)))return false; // cannot route around the goal itself
 const path=roadPath(g,cur,dest,avoid);
 if(!path||path.length<2)return false;
 const lane=laneRoute(path);
 const start={x:lane.points[0].x,z:lane.points[0].z,heading:lane.headings[0]||v.heading};
 // Never teleport into another envelope: require declared clearance at the new start.
 for(const u of g.vehicles){if(u.id===v.id)continue;
  if(envelopeGapWorld(start,u)<MIN_GAP_WORLD-1e-6)return false;}
 j.route=path;j.segment=0;j.progress=0;
 v.x=start.x;v.z=start.z;v.heading=start.heading;
 v.waitTime=0;v.waiting=false;v.blockedBy=null;
 return true;
}
function moveVehicle(g,v,seconds){
 const j=v.job;if(!j)return;
 // #384 disconnect guard: a severed route or vanished source returns the freight
 // (reserved OR onboard, never both) to its source exactly once, with a log line.
 const roadSet=new Set(g.roads);
 const severed=r=>!Array.isArray(r)||r.some(p=>!roadSet.has(key(p.x,p.z)));
 if(severed(j.route)||severed(j.toSource)||severed(j.toDest)){returnFreight(g,v,"ROUTE_BLOCKED");return;}
 if(!g.buildings.some(b=>b.id===j.sourceId)){returnFreight(g,v,"SOURCE_MISSING");return;}
 // #589 separation: integrate along the right-hand lane-offset polyline and clamp
 // progress against every other truck's swept envelope before committing. The
 // freight guards above are unchanged; only the position integrator now reads the
 // fleet. A clamped truck queues honestly (waiting/blockedBy) and resumes from its
 // clamped progress when the blocker clears — no teleport, no reset, no lost cargo.
 const speedMult=g.research.includes("fleet")?1.18:1;
 let remaining=seconds*(v.speed||2.1)*speedMult;
 const others=g.vehicles;
 v.waiting=false;v.blockedBy=null;
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
  const lane=laneRoute(route);
  const from=lane.points[j.segment],to=lane.points[j.segment+1];
  const hv=lane.headings[j.segment];
  const len=lane.lengths[j.segment]||1;
  v.heading=hv;
  const intended=Math.min(1,j.progress+remaining/len);
  const {progress,blockedBy}=separationClamp(v,others,from,to,hv,j.progress,intended,seconds,speedMult);
  const advanced=progress-j.progress;
  j.progress=progress;
  v.x=from.x+(to.x-from.x)*j.progress;v.z=from.z+(to.z-from.z)*j.progress;
  if(progress<intended-1e-9){
   v.waiting=true;v.blockedBy=blockedBy;
   // Accumulate continuous blocked time; past the timeout, attempt a safe reroute
   // around the blocker (bounded: one attempt per tick, separation-checked).
   v.waitTime=(v.waitTime||0)+seconds;
   if(v.waitTime>=WAIT_TIMEOUT_SECONDS)rerouteAroundBlocker(g,v);
   break;
  }
  remaining-=advanced*len;
  if(j.progress>=1-1e-8){
   // Corner turn gate: the outgoing orientation must clear every neighbour before
   // the heading flips, else wait at the corner (incoming orientation, already
   // proven clear by the approach clamp) until it does. Prevents the stationary
   // heading-flip near-miss without reserving square space along the segment.
   const ns=j.segment+1;
   if(ns<route.length-1){
    const tb=turnClear(v,others,{x:v.x,z:v.z},lane.headings[ns]);
    if(tb!=null){
     v.waiting=true;v.blockedBy=tb;
     v.waitTime=(v.waitTime||0)+seconds;
     if(v.waitTime>=WAIT_TIMEOUT_SECONDS)rerouteAroundBlocker(g,v);
     break;
    }
   }
   j.segment=ns;j.progress=0;
  }
 }
 if(!v.waiting)v.waitTime=0;
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
     // #585: crew-recovered byproduct (salvager diesel trickle) lands straight
     // in the depot bank on a SUCCESSFUL cycle — new units created, like any
     // production, never freight. Keeping it out of the bay avoids adding
     // truck trips on the saturated starter fleet (measured: bay-output fuel
     // backed the furnace steel bay past the storage alarm). Freight ledgers,
     // the #575 guard and dispatch ordering are untouched.
     if(d.byproduct)for(const [id,n] of Object.entries(d.byproduct)){deposit(g.bank,id,n*b.level);g.stats.produced+=n*b.level;}
    }
   }
  }
  // #589: deterministic ascending-id motion order. Right-of-way tie-breaks are
  // already id-based (traffic.hasPriority); processing lowest id first makes the
  // queue attribution and resume order reproducible run-to-run and save/reload.
  for(const v of [...g.vehicles].sort((a,b)=>a.id-b.id)){
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
