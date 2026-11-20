import {WORLD_SIZE,INITIAL_BANK,BLUEPRINTS,TIERS,RESEARCH,ROAD_KINDS,SAVE_KEY,STARTER_BUILDINGS,INITIAL_ROADS} from "./content.js";
import {key,cellOf,inside,checkSite,buildingAt,footprintCells,normalizeRot,bayCells,ROAD_REACH} from "./gridOccupancy.js";
import {laneRoute,separationClamp,turnClear,envelopeGapWorld,MIN_GAP_WORLD,WAIT_TIMEOUT_SECONDS,ORIGIN_RECOVERY_RADIUS_CELLS} from "./traffic.js";

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
  g.vehicles=g.vehicles.filter(v=>Number.isFinite(v.x)&&Number.isFinite(v.z))
   // #596: clamp the per-job sidestep budget when present; legacy saves without
   // the field keep their exact shape (the sim reads it as (v.recoveryTries||0)).
   .map(v=>("recoveryTries" in v)
    ?{...v,recoveryTries:Math.max(0,Math.min(ORIGIN_RECOVERY_MAX_TRIES,Math.floor(Number(v.recoveryTries)||0)))}
    :v);
  g.buildings=g.buildings.filter(b=>inside(b.x,b.z)&&BLUEPRINTS[b.type]).slice(0,400)
   // #596: level is a persisted production multiplier AND the depot fleet-cap
   // sink — clamp every building to 1..DEPOT_MAX_LEVEL so a tampered level can
   // neither explode n*b.level production nor raise the cap past 12. readGame
   // NEVER spawns trucks: a tampered high level changes the cap only, and the
   // fleet stays exactly what the save holds (legacy level-1 saves keep 3).
   .map(b=>({...b,rot:normalizeRot(b.rot),paid:paidOf(b),inventory:sanitizeBag(b.inventory),
    level:Math.max(1,Math.min(DEPOT_MAX_LEVEL,Math.floor(Number(b.level)||1)))}));
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
// ---- Fleet growth: DEPOT-ONLY level sink (#596) ----
// The depot has no production cycle (outputs:{}, no byproduct), so its level
// scales NOTHING in advanceGame — the n*b.level deposit loops iterate an empty
// object. Depot level is therefore a pure CAPACITY sink: each level raises the
// fleet cap by one hauler and spawns exactly one truck, up to 12 at level 10
// (coherent with the #384 FLEET_CAP reload clamp). No new ledger: the cap
// derives from the persisted b.level. Production upgrades for other buildings
// remain unwired (their inspector preview stays honestly locked).
export const DEPOT_MAX_LEVEL=10;
export const FLEET_BASE=3;
export const fleetCapOf=(level)=>{
 const lv=Math.max(1,Math.min(DEPOT_MAX_LEVEL,Math.floor(Number(level)||1)));
 return Math.min(FLEET_BASE+(lv-1),12);
};
// Cost to reach nextLevel (>=2). L2 {credits:600,steel:30}, L3
// {credits:1100,steel:55,gears:15}; L4+ continue the same linear ladder:
// credits 600+500*(L-2), steel 30+25*(L-2), gears 15*(L-2) from L3.
export function depotUpgradeCost(nextLevel){
 const L=Math.max(2,Math.floor(Number(nextLevel)||2));
 const cost={credits:600+500*(L-2),steel:30+25*(L-2)};
 if(L>=3)cost.gears=15*(L-2);
 return cost;
}
// Pure spawn-cell read: the first road cell within ROAD_REACH of the depot bay
// in (Manhattan distance, key) order whose centre clears EVERY live truck
// envelope by >= MIN_GAP_WORLD. Shared by the transaction and the inspector
// preview so the affordance can never drift from the authority. Null when no
// cell is clear (the transaction then rejects NO_SPACE with zero spend).
export function depotSpawnCell(g,b){
 if(!b||b.type!=="depot")return null;
 const bay=bayCells(b.type,b.x,b.z,b.rot||0)[0];
 if(!bay)return null;
 const cands=[];
 for(const tile of (Array.isArray(g.roads)?g.roads:[])){
  const [x,z]=cellOf(tile);
  const d=Math.abs(x-bay.x)+Math.abs(z-bay.z);
  if(d>ROAD_REACH)continue;
  cands.push({x,z,d,k:key(x,z)});
 }
 cands.sort((p,q)=>p.d-q.d||(p.k<q.k?-1:p.k>q.k?1:0));
 for(const c of cands){
  const pos={x:c.x,z:c.z,heading:{x:1,z:0}};
  let clear=true;
  for(const u of (g.vehicles||[])){
   if(envelopeGapWorld(pos,u)<MIN_GAP_WORLD-1e-6){clear=false;break;}
  }
  if(clear)return {x:c.x,z:c.z};
 }
 return null;
}
// ONE atomic, idempotent transaction in the #373/#377 discipline: kind-tagged
// command replay ("depotUpgrade" — a build or removal id can never satisfy it),
// full snapshot/rollback at four fault seams, exact ledger row. Every reject
// path moves NO stock, NO level and NO fleet (reject rows are the audit trail,
// exactly like buildAt). Spawn clearance is re-validated at commit time.
export function upgradeDepot(g,commandId=null){
 const cmd=commandIdOf(commandId);
 if(cmd){
  const prior=(Array.isArray(g.commands)?g.commands:[]).find(c=>c.id===cmd&&c.kind==="depotUpgrade");
  if(prior)return prior.ok
   ?{ok:true,code:"OK",duplicate:true,commandId:cmd,level:prior.level,buildingId:prior.buildingId,vehicleId:prior.vehicleId??null}
   :{ok:false,code:prior.code,reason:prior.reason,duplicate:true,commandId:cmd};
 }
 const b=(g.buildings||[]).find(x=>x.type==="depot"&&x.remaining<=0);
 const reject=(code,reason)=>{
  recordLedger(g,{kind:"reject",type:"depot",buildingId:b?b.id:null,code,reason,cost:{},refund:{},...(cmd?{commandId:cmd}:{})});
  if(cmd)recordCommand(g,{id:cmd,kind:"depotUpgrade",ok:false,code,reason,buildingId:b?b.id:null});
  return {ok:false,code,reason,...(cmd?{commandId:cmd}:{})};
 };
 if(!b)return reject("NO_DEPOT","No completed depot to upgrade");
 const level=Math.max(1,Math.min(DEPOT_MAX_LEVEL,Math.floor(Number(b.level)||1)));
 if(level>=DEPOT_MAX_LEVEL)return reject("MAX_LEVEL","Depot is at maximum level "+DEPOT_MAX_LEVEL+" — fleet cap 12");
 const nextLevel=level+1;
 const cost=depotUpgradeCost(nextLevel);
 if(!fits(g.bank,cost))return reject("INSUFFICIENT","Need "+Object.entries(cost).map(([id,n])=>n+" "+id).join(", "));
 if(g.vehicles.length>=fleetCapOf(nextLevel))return reject("FLEET_FULL","Fleet already at the level-"+nextLevel+" cap of "+fleetCapOf(nextLevel));
 const cell=depotSpawnCell(g,b);
 if(!cell)return reject("NO_SPACE","No clear road cell within "+ROAD_REACH+" of the depot bay for a new hauler");
 // Snapshot every field the commit touches (rings restore full CONTENTS).
 const snap={bank:{...g.bank},level:b.level,vehicles:[...g.vehicles],
  ledger:[...(Array.isArray(g.ledger)?g.ledger:[])],log:[...g.log],
  commands:[...(Array.isArray(g.commands)?g.commands:[])],nextId:g.nextId};
 try{
  spend(g.bank,cost);
  fault("depotUpgrade.afterSpend",{buildingId:b.id,nextLevel});
  b.level=nextLevel;
  fault("depotUpgrade.afterLevel",{buildingId:b.id,nextLevel});
  const id=g.vehicles.reduce((m,v)=>Math.max(m,v.id),0)+1;
  const speeds=[2.25,2.6,2.0];
  const v={id,name:"HAULER-"+String(id).padStart(2,"0"),x:cell.x,z:cell.z,
   speed:speeds[(id-1)%speeds.length],job:null,cargo:null,anim:0,
   heading:{x:1,z:0},waiting:false,blockedBy:null,waitTime:0,recoveryTries:0};
  g.vehicles.push(v);
  fault("depotUpgrade.afterSpawn",{buildingId:b.id,vehicleId:id});
  recordLedger(g,{kind:"upgrade",type:"depot",buildingId:b.id,level:nextLevel,
   cost:{...cost},refund:{},vehicleId:id,...(cmd?{commandId:cmd}:{})});
  fault("depotUpgrade.afterLedger",{buildingId:b.id,nextLevel});
  pushLog(g,"Freight Depot upgraded to level "+nextLevel+" — "+v.name+" joined the fleet.");
  if(cmd)recordCommand(g,{id:cmd,kind:"depotUpgrade",ok:true,code:"OK",buildingId:b.id,level:nextLevel,vehicleId:id,cost:{...cost}});
  return {ok:true,code:"OK",building:b,vehicle:v,level:nextLevel,cost:{...cost},...(cmd?{commandId:cmd}:{})};
 }catch(err){
  for(const k of Object.keys(g.bank))if(!(k in snap.bank))delete g.bank[k];
  Object.assign(g.bank,snap.bank);
  b.level=snap.level;
  g.vehicles.splice(0,g.vehicles.length,...snap.vehicles);
  g.ledger=snap.ledger;g.log=snap.log;g.commands=snap.commands;g.nextId=snap.nextId;
  throw err;
 }
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
// ---- ART-04 bay-approach docking (#580) ----
// The depot shutter is a pure function of the REAL truck-to-bay distance
// (src/art04.js ART04_DOCK near 2.5 / far 7 / travel 0.8). Freight used to stop
// at nearestRoad(ANCHOR): for the starter depot (13,9) rot 0 that is (13,8),
// two cells NORTH of the south bay (13,10) — 7 world away, measured 0 docking
// steps / 240 sim-s, so the shutter honestly never opened. Rotating the starter
// depot is not an available remedy: tests/vehicleRigs.test.mjs pins
// FORKLIFT_POST.bayCell to the live rot-0 starter bay, and that post is hardcoded
// in world.js/crowd.js (fenced under #599). The remedy is stop semantics: a depot
// job chooses the facing-side aligned road stop within ROAD_REACH of the bay and
// drives a final OFF-ROAD leg along the free corridor onto the LOG-02 bay
// approach cell itself. The parked truck's right-hand lane offset leaves it
// ~1.225 world from the bay center (<= near 2.5), so depotDoorLift opens on real
// proximity. No dock constant changes, no timer/ambient fallback, no geometry
// moves; non-depot machines keep their measured curbside stops (#567/#585).
// Returns {id, bay, stop, cells} where cells runs from just after the stop to
// the bay inclusive, or null when no facing-side stop / a machine blocks the
// corridor. Pure read of live geometry — re-derived every guard pass so a
// blocked or vanished corridor severs the route honestly (ROUTE_BLOCKED).
// roadSet (optional): the caller's per-pass Set of road keys. Hot guard passes
// build it ONCE and share it across every dockApproach call in the pass.
export function dockApproach(g,b,roadSet){
 if(!b||b.type!=="depot")return null;
 const bay=bayCells(b.type,b.x,b.z,b.rot||0)[0];
 if(!bay)return null;
 const fx=bay.x-b.x,fz=bay.z-b.z; // 1x1 depot: bay = anchor + facing (unit axis)
 if(fx===0&&fz===0)return null;
 const roads=roadSet||new Set(Array.isArray(g.roads)?g.roads:[]);
 // Alignment forces every candidate onto the facing-axis ray from the bay, so
 // Manhattan distance EQUALS the ray offset: probing d=1..ROAD_REACH in order
 // and taking the first asphalt hit is exactly the old "nearest aligned road
 // within ROAD_REACH" full scan — at most ROAD_REACH Set membership tests, no
 // per-tile cellOf split/alloc (the full scan cost ~3x base advanceGame).
 let stop=null;
 for(let d=1;d<=ROAD_REACH;d++){
  const x=bay.x+fx*d,z=bay.z+fz*d;
  if(roads.has(key(x,z))){stop={x,z};break;}
 }
 if(!stop)return null;
 const cells=[];
 let x=stop.x,z=stop.z;
 while(x!==bay.x||z!==bay.z){x-=fx;z-=fz;cells.push({x,z});}
 if(cells.some(p=>buildingAt(g,p.x,p.z)))return null;
 return {id:b.id,bay,stop,cells};
}
// Departure leg: bay -> ... -> just before the stop (roadPath resumes AT the
// stop). Lets a truck parked on the bay drive out instead of snapping ~2 cells
// back to the road on its next join.
const dockDeparture=a=>[{x:a.bay.x,z:a.bay.z},...a.cells.slice(0,-1).reverse()];
// #580 shared route-severance guard — the SINGLE source of truth for moveVehicle
// AND the UX-05 fleet read model (src/fleet.js), whose contract is "stuck reason =
// the EXACT guard moveVehicle applies next tick". A route cell is legitimate iff
// it is asphalt OR part of a LIVE depot approach corridor of this job's endpoints.
// When an endpoint building has VANISHED, its stored straight tail stays exempt
// (geometrically validated below) so the missing-building guards — not
// ROUTE_BLOCKED — yield the honest SOURCE_MISSING / DEST_MISSING reason and the
// truck still drives the freight home. A machine blocking a live corridor makes
// dockApproach null, dropping the exemption and severing exactly like a removed
// road. Pure read of live state; never mutates g.
export function routeSevered(g,j){
 if(!j)return true;
 const roadSet=new Set(Array.isArray(g.roads)?g.roads:[]);
 const buildings=Array.isArray(g.buildings)?g.buildings:[];
 const dock=new Set();
 let gone=false;
 for(const id of [j.sourceId,j.destId]){
  const b=buildings.find(x=>x.id===id);
  if(!b){gone=true;continue;}
  const a=dockApproach(g,b,roadSet);
  if(a){dock.add(key(a.bay.x,a.bay.z));for(const p of a.cells)dock.add(key(p.x,p.z));}
 }
 // Vanished endpoint: exempt a stored tail that is a straight, contiguous,
 // axis-aligned run anchored at a road cell. Bounded + geometric — a tampered
 // bend or gap still severs, and the missing-building guard returns the freight.
 if(gone){
  for(const r of [j.route,j.toSource,j.toDest]){
   if(!Array.isArray(r)||r.length<2)continue;
   let i=r.length-1;
   while(i>=0&&!roadSet.has(key(r[i].x,r[i].z)))i--;
   if(i<0||i===r.length-1)continue;
   const anchor=r[i],end=r[r.length-1];
   const dx=Math.sign(end.x-anchor.x),dz=Math.sign(end.z-anchor.z);
   if((dx!==0&&dz!==0)||(dx===0&&dz===0))continue;
   let ok=true;
   for(let k=i+1;k<r.length;k++){
    if(r[k].x!==anchor.x+dx*(k-i)||r[k].z!==anchor.z+dz*(k-i)){ok=false;break;}
   }
   if(ok)for(let k=i+1;k<r.length;k++)dock.add(key(r[k].x,r[k].z));
  }
 }
 const sev=r=>!Array.isArray(r)||r.some(p=>!roadSet.has(key(p.x,p.z))&&!dock.has(key(p.x,p.z)));
 return sev(j.route)||sev(j.toSource)||sev(j.toDest);
}
// RESERVE transition (#384): source stock -> reserved load. The units leave the
// source bag exactly once and are held against the job, NOT yet onboard.
function assignJob(g,v){
 const vx=Math.round(v.x),vz=Math.round(v.z);
 // #580 perf: one road-key Set per dispatch pass, shared by every dock probe.
 const roadSet=new Set(Array.isArray(g.roads)?g.roads:[]);
 // #580: a truck idle ON a depot bay departs along that bay's corridor.
 let exitA=null;
 for(const b of g.buildings){const a=dockApproach(g,b,roadSet);if(a&&a.bay.x===vx&&a.bay.z===vz){exitA=a;break;}}
 const start=exitA?exitA.stop:nearestRoad(g,vx,vz);
 const candidates=deliveryCandidates(g);
 for(const c of candidates){
  const srcA=dockApproach(g,c.source,roadSet),dstA=dockApproach(g,c.dest,roadSet);
  const src=srcA?srcA.stop:nearestRoad(g,c.source.x,c.source.z);
  const dst=dstA?dstA.stop:nearestRoad(g,c.dest.x,c.dest.z);
  const roadToSrc=roadPath(g,start,src),roadToDest=roadPath(g,src,dst);
  if(!roadToSrc||!roadToDest)continue;
  // Already parked at the source bay: a single-cell route picks up in place
  // (no out-and-back through the stop). Otherwise prepend the exit corridor
  // when parked on a bay, and append the entry corridor for a depot endpoint.
  const sameSrc=srcA&&exitA&&srcA.id===exitA.id;
  const toSource=sameSrc?[{x:srcA.bay.x,z:srcA.bay.z}]
   :(exitA?dockDeparture(exitA):[]).concat(roadToSrc,srcA?srcA.cells:[]);
  const toDest=(srcA?dockDeparture(srcA):[]).concat(roadToDest,dstA?dstA.cells:[]);
  // #589: reserve immediately even if the lane start is currently occupied. The
  // reservation is what storageAlarms reads to know a bay is being served; deferring
  // it here left full bays unassigned and latched the storage-4 alarm (gate C-2).
  // The truck instead HOLDS at the join in moveVehicle until the start is clear, so
  // it never snaps into a neighbour's envelope, yet the bay sees a committed truck.
  const fromBank=c.source.type==="depot";
  const sourceBag=fromBank?g.bank:c.source.inventory;
  const amount=take(sourceBag,c.resource,c.amount);
  if(amount<=0)continue;
  v.cargo=null;
  // #596: the origin-sidestep budget is PER JOB — a fresh dispatch starts clean.
  v.recoveryTries=0;
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
// right-hand lane. Forward-only + id tie-breaks can still form a mixed
// following/mutual wait-for cycle at a saturated intersection; a bounded reroute
// dissolves mid-route blocks without starving the furnace.
// #596: when the normal reroute fails because the blocker sits on the mover's
// OWN origin cell (every route from cur starts inside the blocker's envelope),
// a BOUNDED origin sidestep may move the route origin to a nearby road cell —
// see ORIGIN_RECOVERY_RADIUS_CELLS in traffic.js. This is bounded effort, NOT
// universal deadlock-freedom: perpendicular crossing cycles remain possible
// (docs/design/TRAFFIC.md limitations).
// Freight is untouched (same source/dest, same phase); only j.route changes. The
// new lane start is separation-checked against every other truck BEFORE commit, so
// recovery can never introduce an overlap. Returns true if a safe reroute landed.
// Per-job sidestep budget: at most ORIGIN_RECOVERY_MAX_TRIES origin commits per
// job (reset by assignJob); normal reroutes are not budgeted.
export const ORIGIN_RECOVERY_MAX_TRIES=3;
// Shared route commit: separation-check the new lane start against EVERY other
// envelope, then land route + position + queue flags as one unit. sidestep=true
// additionally bounds the physical snap to R+1 cells and spends one budget try.
const commitRecoveryRoute=(g,v,j,full,sidestep)=>{
 const lane=laneRoute(full);
 if(!lane.points.length)return false;
 const start={x:lane.points[0].x,z:lane.points[0].z,heading:lane.headings[0]||v.heading};
 // Never teleport into another envelope: require declared clearance at the new start.
 for(const u of g.vehicles){if(u.id===v.id)continue;
  if(envelopeGapWorld(start,u)<MIN_GAP_WORLD-1e-6)return false;}
 if(sidestep&&Math.hypot(start.x-v.x,start.z-v.z)>ORIGIN_RECOVERY_RADIUS_CELLS+1)return false;
 j.route=full;j.segment=0;j.progress=0;
 v.x=start.x;v.z=start.z;v.heading=start.heading;
 v.waitTime=0;v.waiting=false;v.blockedBy=null;
 if(sidestep)v.recoveryTries=(v.recoveryTries||0)+1;
 return true;
};
// The idle-park obstacle sweep shared by both recovery variants (#580): avoid
// the immediate blocker's cell plus every OTHER parked idle truck's road cell.
// A jobless truck never clears, so routing around only the immediate blocker
// just cascades into the next idle park. Moving trucks are NOT avoided — they
// clear. The GOAL cell is exempt: an idle park ON the destination stop is the
// #589 bay-queue last resort's own case (timeout-gated early arrival / pickup
// join); avoiding it here made recovery refuse forever and starved the steel
// run (measured: starterFuelEconomy test-3 regression, 0 steel in 60 s).
const recoveryAvoid=(g,v,roadDest)=>{
 const avoid=new Set();
 const blocker=g.vehicles.find(u=>u.id===v.blockedBy);
 if(blocker){const bc=nearestRoad(g,Math.round(blocker.x),Math.round(blocker.z));if(bc)avoid.add(key(bc.x,bc.z));}
 for(const u of g.vehicles){
  if(u.id===v.id||u.job)continue;
  const uc=nearestRoad(g,Math.round(u.x),Math.round(u.z));
  if(uc&&!(uc.x===roadDest.x&&uc.z===roadDest.z))avoid.add(key(uc.x,uc.z));
 }
 return avoid;
};
// #596 bounded origin sidestep: enumerate road cells at Manhattan distance
// 1..R from the origin in deterministic (distance, x, z) order, skip the avoid
// set, and commit the first route whose lane start clears every envelope.
// Caller gates: normal reroute already failed, waitTime past the timeout,
// budget remaining. Returns true if a safe sidestep landed.
function originSidestep(g,v,j,cur,roadDest,tail,avoid){
 if(ORIGIN_RECOVERY_RADIUS_CELLS<=0)return false;
 if((v.waitTime||0)<WAIT_TIMEOUT_SECONDS)return false;
 if((v.recoveryTries||0)>=ORIGIN_RECOVERY_MAX_TRIES)return false;
 const cands=[];
 for(const tile of g.roads){
  const [x,z]=cellOf(tile);
  const d=Math.abs(x-cur.x)+Math.abs(z-cur.z);
  if(d<1||d>ORIGIN_RECOVERY_RADIUS_CELLS||avoid.has(key(x,z)))continue;
  cands.push({x,z,d});
 }
 cands.sort((p,q)=>p.d-q.d||p.x-q.x||p.z-q.z);
 for(const s of cands){
  const sp=roadPath(g,s,roadDest,avoid);
  if(!sp)continue;
  const full=sp.concat(tail);
  if(full.length<2)continue;
  if(commitRecoveryRoute(g,v,j,full,true))return true;
 }
 return false;
}
function rerouteAroundBlocker(g,v){
 const j=v.job;if(!j||v.blockedBy==null)return false;
 const dest=j.route[j.route.length-1];
 const cur=nearestRoad(g,Math.round(v.x),Math.round(v.z));
 if(!cur||!dest)return false;
 // #580: a dock job's route ends on the OFF-ROAD bay cell. roadPath only walks
 // asphalt, so route to the facing-side dock STOP and re-append the live corridor
 // tail; otherwise recovery could never fire for a depot job (measured: the fuel
 // resupply join-held 60 s behind an idle truck because roadPath(bay)===null).
 const endId=j.phase==="toSource"?j.sourceId:j.destId;
 const a=dockApproach(g,g.buildings.find(b=>b.id===endId));
 const roadDest=a?a.stop:dest;
 // #596: mirror the leg's OWN terminal semantics. Recovery reroutes the ROAD leg;
 // it must not upgrade a stop-terminated leg into a bay dock mid-job. Re-append
 // the corridor tail ONLY when the current route actually ends ON the corridor
 // (a dock job as dispatched). A leg terminated at the road stop — e.g. the #580
 // clause-1 base-stop-semantics control, which strips the corridor every tick —
 // stays stop-terminated, so recovery can never re-open the shutter there.
 const tail=a&&key(dest.x,dest.z)!==key(a.stop.x,a.stop.z)?a.cells:[];
 const avoid=recoveryAvoid(g,v,roadDest);
 if(avoid.has(key(roadDest.x,roadDest.z)))return false; // cannot route around the goal itself
 const path=roadPath(g,cur,roadDest,avoid);
 if(path){
  const full=path.concat(tail);
  if(full.length>=2&&commitRecoveryRoute(g,v,j,full,false))return true;
 }
 // #596: the normal attempt failed (no path, or every route from cur starts
 // inside a neighbour's envelope — the origin-cell case). Try the bounded
 // sidestep; it re-checks the timeout and budget itself.
 return originSidestep(g,v,j,cur,roadDest,tail,avoid);
}
// #596 pickup phase-flip recovery. The flip join-hold (moveVehicle, end of the
// toSource route) used to set waiting/blockedBy and break with NO recovery call:
// an idle truck parked on the departure lane start — which for a straight-through
// route IS the source stop the mover just arrived at — held the pickup forever.
// The #589 bay-queue early arrival is deliberately NOT applied here (it snapped
// the flip into the blocker's envelope, measured -1.61 world overlap). Instead,
// after honest queuing past WAIT_TIMEOUT_SECONDS, recompute j.toDest around the
// idle parks (normal obstacle BFS first, then the bounded origin sidestep) and
// separation-check the new departure lane start BEFORE pickupCargo copies it to
// j.route. Route-only: the truck does not move until the flip's own join snap,
// which is now proven clear. Freight, phase and endpoints are untouched.
function recoverDeparture(g,v){
 const j=v.job;
 if(!j||j.phase!=="toSource"||v.blockedBy==null)return false;
 if((v.waitTime||0)<WAIT_TIMEOUT_SECONDS)return false;
 if((v.recoveryTries||0)>=ORIGIN_RECOVERY_MAX_TRIES)return false;
 const src=g.buildings.find(b=>b.id===j.sourceId);
 const dst=g.buildings.find(b=>b.id===j.destId);
 if(!src||!dst)return false;
 const roadSet=new Set(Array.isArray(g.roads)?g.roads:[]);
 const srcA=dockApproach(g,src,roadSet),dstA=dockApproach(g,dst,roadSet);
 // Road leg endpoints: the facing-side dock stops when the endpoint is a depot
 // (nearestRoad(bay) resolves to the OLD anchor stop, not the live dock stop —
 // #580), otherwise the stored toDest's first/last road cells.
 const roadStart=srcA?srcA.stop:nearestRoad(g,Math.round(v.x),Math.round(v.z));
 const roadDest=dstA?dstA.stop:j.toDest[j.toDest.length-1];
 if(!roadStart||!roadDest)return false;
 // #596: mirror the stored departure leg's OWN head/tail semantics (see
 // rerouteAroundBlocker). Re-prepend the exit corridor / re-append the entry
 // corridor ONLY when the current toDest actually carries them. A leg stripped
 // to road stops stays stop-terminated, so the pickup flip's join snap can never
 // land on a bay the leg did not already serve (#580 clause-1 control).
 const first=j.toDest[0],last=j.toDest[j.toDest.length-1];
 const head=srcA&&first&&key(first.x,first.z)!==key(srcA.stop.x,srcA.stop.z)?dockDeparture(srcA):[];
 const tail=dstA&&last&&key(last.x,last.z)!==key(dstA.stop.x,dstA.stop.z)?dstA.cells:[];
 const avoid=recoveryAvoid(g,v,roadDest);
 if(avoid.has(key(roadDest.x,roadDest.z)))return false;
 const path=roadPath(g,roadStart,roadDest,avoid);
 if(path){
  const full=head.concat(path,tail);
  if(full.length>=2&&commitDeparture(g,v,j,full,false))return true;
 }
 // Origin-cell case: the departure lane start itself is occupied. Sidestep the
 // ROAD origin (no departure corridor — the flip snap lands on the new lane
 // start, separation-checked and displacement-bounded by commitRecoveryRoute).
 if(ORIGIN_RECOVERY_RADIUS_CELLS<=0)return false;
 const cands=[];
 for(const tile of g.roads){
  const [x,z]=cellOf(tile);
  const d=Math.abs(x-roadStart.x)+Math.abs(z-roadStart.z);
  if(d<1||d>ORIGIN_RECOVERY_RADIUS_CELLS||avoid.has(key(x,z)))continue;
  cands.push({x,z,d});
 }
 cands.sort((p,q)=>p.d-q.d||p.x-q.x||p.z-q.z);
 for(const s of cands){
  const sp=roadPath(g,s,roadDest,avoid);
  if(!sp)continue;
  const full=sp.concat(tail);
  if(full.length<2)continue;
  if(commitDeparture(g,v,j,full,true))return true;
 }
 return false;
}
// Departure-route commit: unlike commitRecoveryRoute this lands j.toDest ONLY
// (the phase is still toSource; pickupCargo copies it to j.route at the flip).
// The truck's position is NOT touched — the flip's join snap does that, and the
// caller re-runs joinBlocker against the new toDest before allowing the flip.
// sidestep=true bounds the future join snap to R+1 cells from the CURRENT
// position and spends one budget try.
function commitDeparture(g,v,j,full,sidestep){
 const lane=laneRoute(full);
 if(!lane.points.length)return false;
 const start={x:lane.points[0].x,z:lane.points[0].z,heading:lane.headings[0]||v.heading};
 for(const u of g.vehicles){if(u.id===v.id)continue;
  if(envelopeGapWorld(start,u)<MIN_GAP_WORLD-1e-6)return false;}
 if(sidestep&&Math.hypot(start.x-v.x,start.z-v.z)>ORIGIN_RECOVERY_RADIUS_CELLS+1)return false;
 j.toDest=full;
 if(sidestep)v.recoveryTries=(v.recoveryTries||0)+1;
 return true;
}
// #589 lane-join gate. Starting a route (assignJob, pickup phase flip) snaps the
// truck to the new lane's start point; that snap is NOT integrated motion and
// can land inside a neighbour's envelope (measured -1.61 world overlap when a
// mid-lane bay queue re-joined). Returns the id of the first truck whose
// envelope would be within MIN_GAP of the join point, or null if the join is
// clear. Callers defer the transition instead of teleporting into traffic.
function joinBlocker(g,v,route){
 const lane=laneRoute(route);
 if(!lane.points.length)return null;
 const start={x:lane.points[0].x,z:lane.points[0].z,heading:lane.headings[0]||v.heading};
 for(const u of g.vehicles){if(u.id===v.id)continue;
  if(envelopeGapWorld(start,u)<MIN_GAP_WORLD-1e-6)return u.id;}
 return null;
}
function moveVehicle(g,v,seconds){
 const j=v.job;if(!j)return;
 // #384 disconnect guard: a severed route or vanished source returns the freight
 // (reserved OR onboard, never both) to its source exactly once, with a log line.
 // #580: routeSevered is the shared dock-aware guard, also used verbatim by the
 // fleet read model so the panel's stuck reason equals this guard exactly.
 if(routeSevered(g,j)){returnFreight(g,v,"ROUTE_BLOCKED");return;}
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
  // #589 join hold: a freshly assigned (or phase-flipped) route starts at segment 0,
  // progress 0, but the truck is still parked at its previous position. The first
  // integration step would snap it onto lane.points[0]; if a neighbour occupies that
  // start, hold here (waiting/blockedBy) WITHOUT snapping until it clears. The freight
  // is already reserved, so the bay is honestly served; only the physical join waits.
  if(j.segment===0&&j.progress===0){
   const jb=joinBlocker(g,v,route);
   if(jb!=null){
    v.waiting=true;v.blockedBy=jb;v.waitTime=(v.waitTime||0)+seconds;
    // #580: a JOBLESS blocker parked on the join point never clears on its own
    // (no load to dispatch it), so waiting the full timeout just starves the job
    // behind a stationary park. Reroute around idle parks immediately; MOVING
    // blockers still get the timeout grace to clear. rerouteAroundBlocker is
    // separation-checked against every envelope, so this never snaps into traffic.
    // EXCLUSION: a jobless blocker parked ON the destination endpoint cell (the
    // depot bay for a dock job) keeps the verbatim timeout path. The implicit
    // avoid.has(roadDest) guard does NOT cover it: nearestRoad(bay) resolves to
    // the OLD anchor stop (measured (13,8)), not the facing-side dock stop
    // (13,12), so an immediate reroute would snap the mover back to the stop and
    // re-drive the corridor — perturbing the bay-queue early-arrival timing that
    // gate C-2 (storage-4 alarm) is sensitive to. The timeout/bay-queue last
    // resort owns the destination-bay park; this acceleration does not.
    const bu=g.vehicles.find(u=>u.id===jb);
    const end=j.route[j.route.length-1];
    const atDestBay=bu&&!bu.job&&Math.round(bu.x)===end.x&&Math.round(bu.z)===end.z;
    if(bu&&!bu.job&&!atDestBay)rerouteAroundBlocker(g,v);
    else if(v.waitTime>=WAIT_TIMEOUT_SECONDS)rerouteAroundBlocker(g,v);
    break;
   }
  }
  if(j.segment>=route.length-1){
   if(j.phase==="toSource"){
    // Join gate: the departure lane start must be clear before the phase flip
    // snaps us onto it. Wait at the bay (incoming position, proven clear) until
    // it is; an idle blocker there will itself be dispatched once its own join
    // is clear, so the wait resolves.
    const jb=joinBlocker(g,v,j.toDest);
    if(jb!=null){
     v.waiting=true;v.blockedBy=jb;v.waitTime=(v.waitTime||0)+seconds;
     // #596: bounded pickup-flip recovery. After honest queuing past the
     // timeout, recompute the departure route around the idle parks and
     // separation-check its lane start; only a PROVEN-clear recompute lets the
     // flip proceed this tick. recoverDeparture gates timeout + budget itself
     // and never moves the truck — pickupCargo's join snap does, onto the new
     // checked start. The #589 bay-queue early arrival stays excluded from
     // pickup (it caused the measured -1.61 world overlap at this exact flip).
     if(recoverDeparture(g,v)&&joinBlocker(g,v,j.toDest)==null){
      v.waiting=false;v.blockedBy=null;v.waitTime=0;
     }else break;
    }
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
   // Accumulate continuous blocked time; past the timeout, attempt recovery.
   v.waitTime=(v.waitTime||0)+seconds;
   if(v.waitTime>=WAIT_TIMEOUT_SECONDS){
    // #589 bay queue (last resort): an IDLE truck parked on the bay approach with
    // no job never clears, and rerouteAroundBlocker refuses to route around the
    // goal cell itself — measured 192 s starvation of every later delivery to that
    // bay. Only after honest queuing proves the blocker is stuck (waitTime past the
    // timeout) do we complete the ARRIVAL at the clamped position: the idle blocker
    // is itself parked at the bay (within 1 cell of the route end) and the mover is
    // within 2 cells of the end (worst starter-fleet queue: two idle trucks packed at
    // the bay, third delivering, measured 1.343 cells). The arrive ledger transition
    // is position-independent and fully validated, so this skips no phase and moves
    // no freight early. Gating on the timeout keeps continuous-work yards (where idle
    // bay blockers are dispatched and clear within a few seconds) on normal queuing —
    // early arrival there perturbed dispatch timing and latched the storage-4 alarm
    // (gate C-2). Deliberately NOT applied to pickup: the phase flip re-joins the
    // departure lane at its start, which for a straight-through route IS the idle
    // blocker's parked position (measured -1.61 world overlap + reroute thrash).
    const idleBlocker=others.find(u=>u.id===blockedBy&&!u.job);
    const routeEnd=lane.points[route.length-1];
    const bayQueued=idleBlocker&&Math.hypot(idleBlocker.x-routeEnd.x,idleBlocker.z-routeEnd.z)<=1.0;
    if(j.phase==="toDest"&&bayQueued&&Math.hypot(v.x-routeEnd.x,v.z-routeEnd.z)<=2.0){
     arriveCargo(g,v);return;
    }
    rerouteAroundBlocker(g,v);
   }
   break;
  }
  // #589 liveness guard: remaining -= advanced*len can leave an fp residue
  // (~1e-17) whose remaining/len rounds intended back to exactly j.progress.
  // Then advanced===0, the blocked-break above does not fire (progress===intended),
  // and remaining never shrinks — infinite loop. Guard on advanced, not on a
  // remaining epsilon: remaining/len can underflow any fixed epsilon on long
  // segments. Genuine blocking is already handled by the progress<intended break.
  if(advanced<=0)break;
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
   // #589: an idle truck is not queued. Arrival/return/cancel null the job without
   // touching the motion flags, so a truck that early-arrived at the bay-queue
   // timeout would otherwise keep stale waiting/blockedBy/waitTime — and that stale
   // waitTime would fire premature recovery on its next job's first tick. Clear here.
   if(!v.job){v.waiting=false;v.blockedBy=null;v.waitTime=0;}
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
