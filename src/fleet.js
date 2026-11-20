/**
 * Rustwake V2 — fleet logistics panel derivation (#363 UX-05).
 *
 * Pure, deterministic, renderer-free READ MODEL over the authoritative
 * simulation, mirroring the src/inspector.js / src/resourceStrip.js contract:
 * nothing here mutates game state, dispatches jobs or writes a second fleet
 * ledger. Every panel value is the simulation's own job field:
 *
 *  - route        = v.job.route / toSource / toDest (roadPath cells + the #580
 *                   live depot approach corridor tail onto the LOG-02 bay)
 *  - source/dest  = v.job.sourceId / destId resolved against g.buildings
 *  - reserved     = v.job.amount while phase==="toSource" (assignJob already
 *                   take()s the units from the source bag — #384 LOG-04)
 *  - onboard      = v.cargo.amount after the validated pickup transition
 *  - bay queue    = trucks whose validated job approaches this building's bay,
 *                   ordered by remaining route cells (the sim's own metric)
 *  - stuck reason = the EXACT guard moveVehicle applies next tick
 *                   (ROUTE_BLOCKED / SOURCE_MISSING / DEST_MISSING), or the
 *                   dispatch mirror of deliveryCandidates + roadPath for an
 *                   idle truck that cannot reach any waiting load (NO_ROUTE /
 *                   NO_FRONTAGE). The panel never invents a breakdown.
 *
 * NEGATIVE INVARIANT (issue #363): a disabled vehicle — one the simulation has
 * stripped of its job (cancelFreight, route-severance return, save/reload
 * reconcile) or whose job/cargo pair fails the reconcileFreight validity rules
 * — is NEVER shown as hauling. Hauling requires a valid job in phase toDest
 * AND a matching onboard cargo; anything inconsistent is an explicit error
 * row, anything returned is idle. tests/fleet.test.mjs proves each case
 * against the real transactions.
 *
 * Follow camera: followTarget is a pure pinGroundToPixel reframe of the truck's
 * actual world position (same origin() mapping world.js renders). App.jsx
 * applies it ONLY through the existing public world.setView / world.applyCamera
 * path — #307 applyCamera/stampCamera invariants are never rewritten.
 */
import {BLUEPRINTS,RESOURCE_BY_ID,CELL,WORLD_SIZE} from "./content.js";
import {inside,nearestRoad,roadPath,dockApproach,routeSevered} from "./simulation.js";
import {pinGroundToPixel} from "./camera.js";
import {classifyViewport,sheetTop,dockBottomOffset,sheetMaxHeight} from "./dock.js";

const stock=(bag,id)=>Math.max(0,Number(bag?.[id]||0));
const routeOk=r=>Array.isArray(r)&&r.length>0&&r.every(p=>p&&inside(p.x,p.z));
// Exact reconcileFreight validity rules — a job the save/reload repair would
// strip can never be presented as live freight.
const validJob=j=>!!j&&typeof j.resource==="string"&&Number.isFinite(j.amount)&&j.amount>0
 &&(j.phase==="toSource"||j.phase==="toDest")&&routeOk(j.route)&&routeOk(j.toSource)&&routeOk(j.toDest);
const cargoOk=c=>!!c&&typeof c.resource==="string"&&Number.isFinite(c.amount)&&c.amount>0;

export const TRUCK_TAP_RADIUS_CELLS=0.65;
export const ROAD_SEGMENT_COST=Object.freeze({stone:3,credits:4}); // roadLine per-segment cost
export const FLEET_BUILD_LOCK=Object.freeze({available:false,
 reason:"Vehicle manufacturing is not wired to the simulation yet (#280) — the yard dispatches its existing haulers. Build roads and machines to keep them working."});

const endpoint=(g,id)=>{
 const b=(g.buildings||[]).find(x=>x.id===id);
 if(!b)return {id,name:null,type:null,x:null,z:null,missing:true};
 return {id,name:BLUEPRINTS[b.type]?.name||b.type,type:b.type,x:b.x,z:b.z,missing:false};
};
const resourceInfo=id=>{const r=RESOURCE_BY_ID[id];return r?{id,name:r.name,unit:r.unit,color:r.color}:{id,name:id,unit:id,color:"#94a5a3"};};
const remainingCells=j=>Math.max(0,(j.route.length-1)-(j.segment+(Number(j.progress)||0)));
const routeFraction=j=>j.route.length>1?Math.min(1,(j.segment+(Number(j.progress)||0))/(j.route.length-1)):1;
// moveVehicle speed formula, verbatim: (v.speed||2.1) * (fleet research ? 1.18 : 1).
const effectiveSpeed=(g,v)=>(Number(v.speed)||2.1)*(g.research?.includes("fleet")?1.18:1);

/** Mirror of simulation.deliveryCandidates (not exported there): the waiting
 *  loads an idle truck COULD be dispatched for. Pure — never reserves. */
function waitingLoads(g){
 const bank=(g.buildings||[]).find(b=>b.type==="depot"&&b.remaining<=0);
 if(!bank)return [];
 const out=[];
 for(const b of g.buildings||[]){
  if(b.remaining>0||b.id===bank.id)continue;
  const def=BLUEPRINTS[b.type];if(!def)continue;
  for(const [id,n] of Object.entries(b.inventory||{})){
   if(n>=3&&!(g.vehicles||[]).some(v=>v.job?.sourceId===b.id&&v.job?.resource===id))
    out.push({sourceId:b.id,destId:bank.id,resource:id,amount:Math.min(15,Math.floor(n)),priority:1});
  }
  for(const [id,n] of Object.entries(def.inputs||{})){
   const have=stock(b.inventory,id);
   if(have<n*2&&stock(g.bank,id)>=n*2&&!(g.vehicles||[]).some(v=>v.job?.destId===b.id&&v.job?.resource===id))
    out.push({sourceId:bank.id,destId:b.id,resource:id,amount:Math.min(stock(g.bank,id),n*3),priority:3});
  }
 }
 return out.sort((a,b)=>b.priority-a.priority);
}

/**
 * Full fleet read model. {kind:"loading"} without a game; otherwise
 * {kind:"ready"} with one row per vehicle (simulation order), bay queues,
 * waiting loads and fleet totals. NEVER mutates g.
 */
export function fleetState(g){
 if(!g)return {kind:"loading"};
 const vehicles=Array.isArray(g.vehicles)?g.vehicles:[];
 const buildings=Array.isArray(g.buildings)?g.buildings:[];
 const waiting=waitingLoads(g);
 // Pre-resolve candidate road legs once (shared by every idle truck). #580:
 // mirror assignJob's dock-aware stop selection exactly — a depot endpoint stops
 // at its facing-side aligned road stop (dockApproach), not nearestRoad(anchor).
 const candidateLegs=waiting.map(c=>{
  const src=buildings.find(b=>b.id===c.sourceId),dst=buildings.find(b=>b.id===c.destId);
  const srcA=src?dockApproach(g,src):null,dstA=dst?dockApproach(g,dst):null;
  const srcRoad=srcA?srcA.stop:(src?nearestRoad(g,src.x,src.z):null);
  const dstRoad=dstA?dstA.stop:(dst?nearestRoad(g,dst.x,dst.z):null);
  return {...c,srcRoad,dstRoad,
   destLeg:!!(srcRoad&&dstRoad&&roadPath(g,srcRoad,dstRoad))};
 });
 const rows=vehicles.map(v=>{
  const j=v.job,c=cargoOk(v.cargo)?v.cargo:null;
  const base={id:v.id,name:v.name,x:v.x,z:v.z,speed:Number(v.speed)||2.1,
   hauling:false,job:null,source:null,dest:null,resource:null,
   reserved:0,onboard:0,routeCells:0,remainingCells:0,progress:0,etaSeconds:null,
   stuck:null,cancel:{allowed:!!(j||c),code:j||c?"OK":"IDLE",reason:j||c?null:"Truck has no freight to cancel"}};
  // 1) Inconsistent job/cargo pair: the reconcileFreight repair cases. These
  //    units are NEVER presented as hauling — the save repair returns them.
  let errorCode=null;
  if(c&&!validJob(j))errorCode="JOB_MISSING";
  else if(c&&j.phase!=="toDest")errorCode="PHASE_STALE";
  else if(c&&(c.resource!==j.resource||c.amount!==j.amount))errorCode="CARGO_MISMATCH";
  else if(!c&&validJob(j)&&j.phase==="toDest")errorCode="CARGO_MISSING";
  else if(!c&&j&&!validJob(j))errorCode="JOB_INVALID";
  if(errorCode){
   return {...base,state:"error",stateLabel:"Load needs repair",tone:"danger",
    detail:"Inconsistent freight record ("+errorCode.toLowerCase().replace(/_/g," ")+"). Save reconciliation returns this load to its source — it is not shown as hauling.",
    stuck:{code:errorCode,reason:"Freight record fails the simulation's validity rules",detail:"Reload repairs this record and returns the units to their source exactly once."},
    resource:j&&typeof j.resource==="string"?resourceInfo(j.resource):(c?resourceInfo(c.resource):null)};
  }
  if(!validJob(j)){
   // 2) Idle: the simulation holds no job for this truck (dispatch, cancel,
   //    blockage return and reconcile all land here). Derive the honest
   //    stuck reason from the same candidate/path rules assignJob uses.
   // #580: mirror assignJob's exit — a truck idle ON a depot bay departs from
   // that bay's facing-side stop, so its reachability matches the sim exactly.
   const vx=Math.round(v.x),vz=Math.round(v.z);
   let exitA=null;
   for(const b of buildings){const a=dockApproach(g,b);if(a&&a.bay.x===vx&&a.bay.z===vz){exitA=a;break;}}
   const start=exitA?exitA.stop:nearestRoad(g,vx,vz);
   let stuck=null,state="idle",stateLabel="Available for dispatch",tone="muted",
    detail="Idle at "+v.x.toFixed(1)+","+v.z.toFixed(1)+" — dispatch assigns the next reachable load automatically.";
   if(candidateLegs.length>0){
    if(!start){
     state="noroute";tone="danger";stateLabel="No road frontage";
     stuck={code:"NO_FRONTAGE",reason:"Truck is not within 3 cells of any road",detail:"Lay asphalt near the truck so dispatch can route it."};
    }else if(!candidateLegs.some(c=>c.srcRoad&&c.destLeg&&roadPath(g,start,c.srcRoad))){
     state="noroute";tone="danger";stateLabel="No connected route";
     stuck={code:"NO_ROUTE",reason:candidateLegs.length+" load"+(candidateLegs.length===1?"":"s")+" waiting, but no connected asphalt path reaches them",
      detail:"Connect the source and destination bays with roads (3 AG + 4 CR per segment)."};
    }
   }
   return {...base,state,stateLabel,tone,detail,stuck,
    waitingLoads:candidateLegs.length,
    unaffordable:state==="noroute"&&(stock(g.bank,"stone")<ROAD_SEGMENT_COST.stone||stock(g.bank,"credits")<ROAD_SEGMENT_COST.credits)};
  }
  // 3) Valid job: mirror its fields exactly.
  const source=endpoint(g,j.sourceId),dest=endpoint(g,j.destId);
  const job={sourceId:j.sourceId,destId:j.destId,resource:j.resource,amount:j.amount,
   phase:j.phase,segment:j.segment,progress:Number(j.progress)||0,
   route:j.route.map(p=>({x:p.x,z:p.z})),toSourceLength:j.toSource.length,toDestLength:j.toDest.length};
  const speed=effectiveSpeed(g,v),rem=remainingCells(j);
  const mirror={...base,job,source,dest,resource:resourceInfo(j.resource),
   reserved:j.phase==="toSource"?j.amount:0,onboard:c?c.amount:0,
   routeCells:j.route.length,remainingCells:rem,progress:routeFraction(j),
   etaSeconds:speed>0?rem/speed:null};
  // 3a) Blocked: the exact moveVehicle guards. The sim returns this freight
  //     to its source on the next tick — the panel says so, never "hauling".
  let stuckCode=null;
  // #580: routeSevered is moveVehicle's own guard (shared, dock-aware) — the
  // panel's ROUTE_BLOCKED is exactly what the sim applies next tick.
  if(routeSevered(g,j))stuckCode="ROUTE_BLOCKED";
  else if(source.missing)stuckCode="SOURCE_MISSING";
  else if(dest.missing)stuckCode="DEST_MISSING";
  if(stuckCode){
   return {...mirror,state:"blocked",stateLabel:"Route blocked",tone:"danger",
    detail:stuckCode==="DEST_MISSING"
     ?"The destination is gone — the simulation returns this freight to its source when the truck reaches the bay. Reserved units are never lost."
     :"The simulation returns this freight to its source on the next tick — reserved units are never lost.",
    stuck:{code:stuckCode,
     reason:stuckCode==="ROUTE_BLOCKED"?"A road segment on this route was removed":stuckCode==="SOURCE_MISSING"?"The source building no longer exists":"The destination building no longer exists",
     detail:"Reconnect the road or cancel the job to return the load immediately."}};
  }
  // 3b) Live freight. Hauling ONLY with a validated toDest job + matching cargo.
  if(j.phase==="toDest"&&c&&c.resource===j.resource&&c.amount===j.amount){
   return {...mirror,state:"hauling",stateLabel:"Delivering cargo",tone:"mint",hauling:true,
    detail:"Onboard "+c.amount+" "+j.resource+" — driving the connected road to "+(dest.name||"destination")+"."};
  }
  if(j.phase==="toSource"&&j.segment>=j.route.length-1){
   return {...mirror,state:"loading",stateLabel:"Loading at bay",tone:"amber",
    detail:"At the source bay — the pickup transition moves the reserved load onboard."};
  }
  return {...mirror,state:"pickup",stateLabel:"Driving to pickup",tone:"amber",
   detail:"Reserved "+j.amount+" "+j.resource+" at "+(source.name||"source")+" — driving to the pickup bay."};
 });
 // Bay queues: every building a validated job approaches, ordered by the
 // sim's own remaining-route metric. A pickup truck also queues at its final
 // destination bay (it will deliver there after loading).
 const bays=[];
 const bayFor=id=>{
  let bay=bays.find(b=>b.id===id);
  if(!bay){const e=endpoint(g,id);bay={...e,queue:[]};bays.push(bay);}
  return bay;
 };
 for(const row of rows){
  const j=row.job;if(!j)continue;
  const v=vehicles.find(x=>x.id===row.id);
  const toSourceRem=remainingCells({...j,route:v.job.toSource});
  // While still driving to pickup, the delivery leg has not started: its
  // remaining cells are the full toDest length minus the shared endpoint.
  const toDestRem=j.phase==="toDest"?remainingCells({...j,route:v.job.toDest}):Math.max(0,j.toDestLength-1);
  if(j.phase==="toSource"){
   bayFor(j.sourceId).queue.push({vehicleId:row.id,name:row.name,role:"pickup",
    resource:j.resource,unit:RESOURCE_BY_ID[j.resource]?.unit||j.resource,amount:j.amount,
    remainingCells:toSourceRem,loading:row.state==="loading"});
   bayFor(j.destId).queue.push({vehicleId:row.id,name:row.name,role:"delivery",
    resource:j.resource,unit:RESOURCE_BY_ID[j.resource]?.unit||j.resource,amount:j.amount,
    remainingCells:toSourceRem+toDestRem,loading:false});
  }else{
   bayFor(j.destId).queue.push({vehicleId:row.id,name:row.name,role:"delivery",
    resource:j.resource,unit:RESOURCE_BY_ID[j.resource]?.unit||j.resource,amount:j.amount,
    remainingCells:toDestRem,loading:false});
  }
 }
 for(const bay of bays)bay.queue.sort((a,b)=>a.remainingCells-b.remainingCells||a.vehicleId-b.vehicleId);
 const totals={trucks:rows.length,
  active:rows.filter(r=>r.job).length,
  hauling:rows.filter(r=>r.hauling).length,
  reserved:rows.reduce((a,r)=>a+r.reserved,0),
  onboard:rows.reduce((a,r)=>a+r.onboard,0),
  waiting:waiting.length};
 return {kind:"ready",rows,bays,totals,waiting,
  empty:rows.length===0,buildLock:FLEET_BUILD_LOCK};
}

/* ---- Touch inspect (never mis-triggers road construction) ---- */
/** Nearest truck within TRUCK_TAP_RADIUS_CELLS of a tapped cell, or null.
 *  App.jsx gates road arming on this hit: a fresh road-mode tap on a truck
 *  inspects it instead of arming a road origin. Pure. */
export function truckAt(g,x,z){
 let best=null,bestD=TRUCK_TAP_RADIUS_CELLS;
 for(const v of g?.vehicles||[]){
  const d=Math.hypot(v.x-x,v.z-z);
  if(d<=bestD){bestD=d;best=v.id;}
 }
 return best;
}

/* ---- Follow camera (public setView/applyCamera path only) ---- */
/** world.js origin() mapping: cell coords -> world ground units. */
export const truckGround=v=>({x:(v.x-WORLD_SIZE/2+.5)*CELL,z:(v.z-WORLD_SIZE/2+.5)*CELL});
/** Clear-zone focus pixel for the followed truck: above the phone sheet,
 *  right of the desktop/landscape side sheet, clear of the camera rail. */
export function fleetFocusPixel(viewport){
 const w=Number(viewport?.width)||0,h=Number(viewport?.height)||0;
 const mode=classifyViewport({width:w,height:h});
 if(mode==="phone"){
  const top=sheetTop({width:w,height:h});
  return {x:w*0.66,y:Math.max(72,Math.min(h*0.24,Math.max(72,top-60)))};
 }
 if(mode==="landscape")return {x:w*0.72,y:h*0.42};
 return {x:w*0.66,y:h*0.45};
}
/** Pure reframe: pins the truck's actual ground position to the focus pixel.
 *  Yaw/elevation/zoom are preserved (pinGroundToPixel moves only the target). */
export function followTarget(camera,v,viewport,focusPixel){
 return pinGroundToPixel(camera,truckGround(v),focusPixel||fleetFocusPixel(viewport),viewport);
}
/** Sheet geometry the focus pixel must stay clear of (dock.js mirror). */
export function fleetSheetRect(viewport){
 const w=Number(viewport?.width)||0,h=Number(viewport?.height)||0;
 const mode=classifyViewport({width:w,height:h});
 const ph=sheetMaxHeight({width:w,height:h}),bottom=dockBottomOffset(mode);
 if(mode==="phone")return {x:6,y:h-bottom-ph,width:w-12,height:ph};
 const left=Math.min(36,Math.max(14,w*0.023));
 return {x:left,y:h-bottom-ph,width:Math.min(356,w-28),height:ph};
}

/* ---- Persisted fleet settings (player preference, never economy) ----
   SEPARATE storage key from ux-settings / strip-settings / dock-settings:
   each sanitizer owns only its own fields, so sharing would drop prefs. */
export const FLEET_SETTINGS_KEY="rustwake:v2:fleet-settings";
export const FLEET_DEFAULTS=Object.freeze({showIdle:true,followCam:true});
function sanitizeFleet(p){
 return {
  showIdle:typeof p?.showIdle==="boolean"?p.showIdle:FLEET_DEFAULTS.showIdle,
  followCam:typeof p?.followCam==="boolean"?p.followCam:FLEET_DEFAULTS.followCam};
}
export function readFleetSettings(storage){
 try{const raw=storage?.getItem(FLEET_SETTINGS_KEY);if(!raw)return {...FLEET_DEFAULTS};return sanitizeFleet(JSON.parse(raw));}
 catch{return {...FLEET_DEFAULTS};}
}
export function writeFleetSettings(storage,patch){
 const next=sanitizeFleet({...readFleetSettings(storage),...(patch||{})});
 try{storage?.setItem(FLEET_SETTINGS_KEY,JSON.stringify(next));}catch{}
 return next;
}
