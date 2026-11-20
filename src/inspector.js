/**
 * Rustwake V2 — building inspector derivation (#362 UX-04).
 *
 * Pure, deterministic, renderer-free READ MODEL over the authoritative
 * simulation. Nothing here mutates game state, spends stock or writes a
 * second economy: every refund/status preview is derived from the same
 * formulas simulation.js applies, and tests/inspector.test.mjs cross-checks
 * each preview against the real transaction (removeBuilding /
 * cancelConstruction / advanceGame) so the read model can never drift.
 *
 * Upgrade semantics: advanceGame deposits outputs as n * b.level, so the
 * exact effect of the next level is +n per output. The upgrade TRANSACTION
 * is wired for the DEPOT ONLY (#596): upgradeDepot buys fleet capacity (one
 * hauler per level, cap 12 at level 10), never production — the depot has no
 * cycle, so its level scales an empty outputs object. Every other building
 * keeps the exact effect preview and an honest locked control, never a fake
 * buy: production upgrades are not purchasable in this build.
 */
import {BLUEPRINTS,RESOURCE_BY_ID,TIERS} from "./content.js";
import {powerStatus,connectedToRoad,depotUpgradeCost,fleetCapOf,depotSpawnCell,DEPOT_MAX_LEVEL} from "./simulation.js";
import {footprintDims,facingName,bayCells,worldFootprint,cellOf,ROAD_REACH} from "./gridOccupancy.js";
import {CAMERA_LIMITS,normalizeCamera,pinGroundToPixel} from "./camera.js";

const stock=(bag,id)=>Math.max(0,Number(bag?.[id]||0));
// Same epsilon as simulation.fits: a preview must agree with the authority.
const fits=(bag,need)=>Object.entries(need||{}).every(([id,n])=>stock(bag,id)+1e-7>=n);
const levelOf=(b)=>Math.max(1,Math.floor(Number(b?.level)||1));

/** Exact production effect of the current and next level (advanceGame formula). */
export function upgradeEffect(def,level){
 const lv=Math.max(1,Math.floor(Number(level)||1));
 const scale=(n)=>Object.fromEntries(Object.entries(def?.outputs||{}).map(([id,v])=>[id,v*n]));
 const current=scale(lv),next=scale(lv+1);
 const delta=Object.fromEntries(Object.entries(next).map(([id,v])=>[id,v-(current[id]||0)]));
 return {level:lv,nextLevel:lv+1,current,next,delta,hasCycle:(def?.cycle||0)>0,
  available:false,
  lockReason:"Production upgrades are not purchasable in this build — only the depot has a live upgrade (fleet capacity). This preview shows the exact effect of a level, not a buy action."};
}

/**
 * #596 depot-only upgrade preview. Mirrors upgradeDepot's gates exactly
 * (assembling / max level / funds / fleet cap / spawn clearance) against the
 * CURRENT state, so the affordance can never promise what the transaction
 * would reject. Pure read — never mutates g. Returns null for non-depots.
 */
export function depotUpgradeView(g,b){
 if(!b||b.type!=="depot")return null;
 const lv=Math.max(1,Math.min(DEPOT_MAX_LEVEL,levelOf(b)));
 const cap=fleetCapOf(lv);
 const costText=(cost)=>Object.entries(cost).map(([id,n])=>n+" "+(RESOURCE_BY_ID[id]?.unit||id)).join(", ");
 if(b.remaining>0)return {available:false,code:"ASSEMBLING",level:lv,nextLevel:null,cap,nextCap:null,cost:null,
  reason:"Depot is still assembling — fleet upgrades unlock once construction completes."};
 if(lv>=DEPOT_MAX_LEVEL)return {available:false,code:"MAX_LEVEL",level:lv,nextLevel:null,cap,nextCap:null,cost:null,
  reason:"Depot is at maximum level "+DEPOT_MAX_LEVEL+" — the fleet cap of 12 haulers is reached."};
 const nextLevel=lv+1,cost=depotUpgradeCost(nextLevel),nextCap=fleetCapOf(nextLevel);
 if(!fits(g?.bank,cost))return {available:false,code:"INSUFFICIENT",level:lv,nextLevel,cap,nextCap,cost,
  reason:"Need "+costText(cost)+"."};
 if((g?.vehicles||[]).length>=nextCap)return {available:false,code:"FLEET_FULL",level:lv,nextLevel,cap,nextCap,cost,
  reason:"Fleet already at the level-"+nextLevel+" cap of "+nextCap+" haulers."};
 if(!depotSpawnCell(g,b))return {available:false,code:"NO_SPACE",level:lv,nextLevel,cap,nextCap,cost,
  reason:"No clear road cell within "+ROAD_REACH+" of the depot bay for a new hauler — clear the approach first."};
 return {available:true,code:"OK",level:lv,nextLevel,cap,nextCap,cost,reason:null};
}

/** Mirrors removeBuilding: floor(40%) of each build material + 100% of cargo. */
export function dismantleRefund(def,inventory){
 const refund={};
 for(const [r,n] of Object.entries(def?.cost||{})){const v=Math.floor(n*0.4);if(v>0)refund[r]=(refund[r]||0)+v;}
 for(const [r,n] of Object.entries(inventory||{})){const v=Math.max(0,Number(n)||0);if(v>0)refund[r]=(refund[r]||0)+v;}
 return refund;
}
export function refundEntries(refund,def){
 const costIds=new Set(Object.keys(def?.cost||{}));
 return Object.entries(refund||{}).map(([id,n])=>({
  id,name:RESOURCE_BY_ID[id]?.name||id,unit:RESOURCE_BY_ID[id]?.unit||id,amount:n,
  source:costIds.has(id)?"recovery":"cargo"}));
}
/** Mirrors removeBuilding gates exactly (missing / protected / truck reservation). */
export function dismantleGate(g,b){
 if(!b)return {allowed:false,code:"MISSING",reason:"No building selected"};
 if(b.id<=6)return {allowed:false,code:"PROTECTED",reason:"Starter buildings are protected; construct your own district."};
 for(const v of g?.vehicles||[])if(v.job&&(v.job.sourceId===b.id||v.job.destId===b.id))
  return {allowed:false,code:"RESERVED",reason:"A truck has reserved material at this building"};
 return {allowed:true,code:"OK",reason:null};
}
/** Mirrors cancelConstruction: full blueprint refund, only mid-assembly, never starters. */
export function cancelPreview(g,b){
 if(!b)return {allowed:false,code:"MISSING",reason:"No building selected",refund:{}};
 if(b.id<=6)return {allowed:false,code:"PROTECTED",reason:"Starter buildings are protected; construct your own district.",refund:{}};
 if(!(b.remaining>0))return {allowed:false,code:"COMPLETE",reason:"Assembly is complete — dismantle the machine instead",refund:{}};
 return {allowed:true,code:"OK",reason:null,refund:{...(BLUEPRINTS[b.type]?.cost||{})}};
}

function structureStatus(g,b,def,power,connected){
 if(b.remaining>0)return {code:"ASSEMBLING",label:"Assembling",tone:"amber",
  detail:"Mechanical assembly — "+Number(b.remaining).toFixed(1)+"s remaining. Canceling refunds every reserved material."};
 if(def.power>0&&!power.available)return {code:"POWERLESS",label:"No grid power",tone:"danger",
  detail:"Grid demand "+power.demand+" MW exceeds supply "+power.supply+" MW. Add turbine capacity."};
 if(!connected)return {code:"NO_FRONTAGE",label:"No road frontage",tone:"danger",
  detail:"The loading bay must reach a road within "+ROAD_REACH+" cells. Lay asphalt to the bay."};
 if(def.cycle>0){
  if(!fits(b.inventory,def.inputs)){
   const missing=Object.entries(def.inputs||{})
    .filter(([id,n])=>stock(b.inventory,id)+1e-7<n)
    .map(([id,n])=>(n-stock(b.inventory,id))+" "+(RESOURCE_BY_ID[id]?.unit||id));
   return {code:"STARVED",label:"Waiting for inputs",tone:"amber",
    detail:missing.length?"Short "+missing.join(", ")+" — trucks deliver from the depot.":"Waiting for input cargo."};
  }
  return {code:"OPERATING",label:"Operating",tone:"mint",
   detail:"Cycle "+def.cycle+"s · level "+levelOf(b)+" · outputs scale with level."};
 }
 return {code:"ONLINE",label:"Online",tone:"mint",
  detail:def.family==="utility"&&def.power<0?"Supplying "+(-def.power)+" MW to the yard grid.":"Support structure active — no production cycle."};
}

/**
 * Full inspector read model. Returns {kind:"loading"} without a game,
 * {kind:"error"} for a missing/unknown selection, otherwise {kind:"selected"}
 * with status, recipe, stock, bay, construction, upgrade and dismantle views.
 * NEVER mutates g.
 */
export function inspectorState(g,id){
 if(!g)return {kind:"loading"};
 const b=(g.buildings||[]).find(x=>x.id===id);
 if(!b)return {kind:"error",code:"MISSING",reason:"No building selected — it may have been dismantled or the save changed."};
 const def=BLUEPRINTS[b.type];
 if(!def)return {kind:"error",code:"UNKNOWN",reason:"Unknown structure type in this save."};
 const power=powerStatus(g),connected=connectedToRoad(g,b);
 const lv=levelOf(b),upgrade=upgradeEffect(def,lv);
 const bay=bayCells(b.type,b.x,b.z,b.rot||0);
 let reach=Infinity;
 for(const c of bay)for(const tile of g.roads||[]){const [rx,rz]=cellOf(tile);reach=Math.min(reach,Math.abs(rx-c.x)+Math.abs(rz-c.z));}
 const gate=dismantleGate(g,b),refund=dismantleRefund(def,b.inventory);
 const recipe=def.cycle>0?{
  cycle:def.cycle,inputs:{...(def.inputs||{})},outputs:{...(def.outputs||{})},
  effectiveOutputs:upgrade.current,nextOutputs:upgrade.next,
  inputText:Object.entries(def.inputs||{}).map(([id,n])=>n+" "+(RESOURCE_BY_ID[id]?.unit||id)).join(" + ")||"Salvage site",
 }:null;
 return {kind:"selected",building:b,def,level:lv,
  site:{x:b.x,z:b.z},
  status:structureStatus(g,b,def,power,connected),
  phase:b.remaining>0?"assembling":def.cycle>0?"processing":"support",
  power:{available:power.available,demand:Math.max(0,def.power),supply:power.supply,gridDemand:power.demand},
  bay:{connected,facing:facingName(b.rot||0),reach:Number.isFinite(reach)?reach:null,
   footprint:footprintDims(b.type,b.rot||0),cells:bay},
  recipe,
  stock:Object.entries(b.inventory||{}).filter(([,n])=>Number(n)>0)
   .map(([id,n])=>({id,name:RESOURCE_BY_ID[id]?.name||id,unit:RESOURCE_BY_ID[id]?.unit||id,amount:n})),
  construction:{active:b.remaining>0,remaining:Math.max(0,Number(b.remaining)||0),total:5,cancel:cancelPreview(g,b)},
  upgrade,
  depotUpgrade:def.id==="depot"?depotUpgradeView(g,b):null,
  dismantle:{gate,refund,entries:refundEntries(refund,def),
   recoveryNote:"Recovery returns 40% of build materials (rounded down) plus 100% of stored cargo to the depot."},
  lockedBlueprint:!TIERS.some(t=>t.unlocks.includes(b.type)&&g.tier>=t.id)};
}

/* ---- Non-obscuring geometry (#362): the sheet never covers the machine ---- */

/** Inverse of camera.groundAtScreen (orthographic). Round-trip tested. */
export function projectGround(camera,ground,viewport){
 const c=normalizeCamera(camera);
 const wpp=CAMERA_LIMITS.frustumHeight/(viewport.height*c.zoom);
 const th=c.yaw*Math.PI/180,cs=Math.cos(th),sn=Math.sin(th);
 const el=c.elevation*Math.PI/180,sine=Math.sin(el);
 const dx=ground.x-c.x,dz=ground.z-c.z;
 const u=cs*dx-sn*dz;
 const v=(-sn*dx-cs*dz)*sine+(Number(ground.y)||0)*Math.cos(el);
 return {x:viewport.width/2+u/wpp,y:viewport.height/2-v/wpp};
}
// Conservative silhouette height in world units (crane mast is taller).
const machineHeight=(type)=>type==="crane"?9:6;
/** Screen-space bounding box of the selected machine, including its height. */
export function machineScreenRect(camera,b,viewport){
 const fp=worldFootprint(b.type,b.x,b.z,b.rot||0),h=machineHeight(b.type);
 const corners=[{x:fp.min.x,z:fp.min.z},{x:fp.max.x,z:fp.min.z},{x:fp.min.x,z:fp.max.z},{x:fp.max.x,z:fp.max.z}];
 let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
 for(const c of corners)for(const y of [0,h]){
  const p=projectGround(camera,{x:c.x,y,z:c.z},viewport);
  x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);
 }
 return {x:x0,y:y0,width:x1-x0,height:y1-y0};
}
export const rectsIntersect=(a,b)=>!!a&&!!b&&a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;

/**
 * Pure panel placement. Desktop: dock the sheet on the half OPPOSITE the
 * machine (auto), honoring an explicit persisted preference. Phone: bounded
 * bottom sheet; if the machine falls under it, report a focus pixel in the
 * clear upper zone so the camera can reframe (pinGroundToPixel, never a
 * rewrite of applyCamera/stampCamera).
 */
export function panelPlacement({machineRect,viewport,panelSize,isPhone=false,preference="auto",margin=24,bottomOffset=133}){
 const pw=Math.max(120,Math.min(panelSize.width,viewport.width-2*margin));
 const ph=Math.max(80,Math.min(panelSize.height,viewport.height-(isPhone?95:133)-12));
 if(isPhone){
  const sheet={x:6,y:viewport.height-bottomOffset-ph,width:viewport.width-12,height:ph};
  const obscured=rectsIntersect(machineRect,sheet);
  return {side:"bottom",panelRect:sheet,obscured,
   focusPixel:{x:viewport.width/2,y:Math.max(64,sheet.y*0.42)}};
 }
 const bottom=viewport.height-bottomOffset;
 const leftRect={x:margin,y:bottom-ph,width:pw,height:ph};
 const rightRect={x:viewport.width-margin-pw,y:bottom-ph,width:pw,height:ph};
 const hitsL=rectsIntersect(machineRect,leftRect),hitsR=rectsIntersect(machineRect,rightRect);
 let side=preference==="left"||preference==="right"?preference:null;
 if(!side){
  if(hitsL&&!hitsR)side="right";
  else if(hitsR&&!hitsL)side="left";
  else side=(machineRect.x+machineRect.width/2)<viewport.width/2?"right":"left";
 }
 const panelRect=side==="left"?leftRect:rightRect;
 const freeCenterX=side==="left"?(margin+pw+viewport.width-margin)/2:(margin+viewport.width-margin-pw)/2;
 return {side,panelRect,obscured:rectsIntersect(machineRect,panelRect),
  focusPixel:{x:freeCenterX,y:viewport.height*0.45}};
}
/** Pure camera reframe: pins the machine pivot to the clear-zone pixel. */
export function frameSelection(camera,b,viewport,focusPixel){
 const fp=worldFootprint(b.type,b.x,b.z,b.rot||0);
 return pinGroundToPixel(camera,{x:fp.pivot.x,z:fp.pivot.z},focusPixel,viewport);
}

/* ---- CAM-05 (#341): camera retention across panel/sheet transitions ----
   Single pure decision point for EVERY App.jsx camera move. Panel open/close
   ("panel") and viewport/sheet resize ("resize") are camera-NEUTRAL: the
   intentional pan/orbit/zoom pose is returned by reference, untouched, even
   when the sheet obscures the machine and autoFrame is on. Only a NEW
   selection ("selection", UX-04 autoFrame), the explicit Focus button
   ("focus"), an explicit settings change ("settings") or Home/Recenter
   ("reset") may move the camera. "reset" is the ONLY refit: it restores the
   approved isometric overview (yaw 45 / elevation 35.264). The guard is real,
   not a no-op: the same obscured inputs DO reframe under "selection"/"focus"
   (tests/cam05Retention.test.mjs pins the exact legacy delta as a negative
   control). Camera math stays in src/camera.js; world.js applyCamera /
   stampCamera (#307 hashes) are never rewritten. */
export const CAMERA_TRIGGERS=Object.freeze(["selection","panel","resize","focus","reset","settings"]);
export const HOME_CAMERA=Object.freeze({yaw:45,elevation:35.264,zoom:1,x:0,z:0});
export function transitionCamera({trigger,camera,building=null,viewport=null,focusPixel=null,obscured=false,autoFrame=false,home=null}){
 if(trigger==="reset")return normalizeCamera(home||HOME_CAMERA);
 if(trigger==="focus")return frameSelection(camera,building,viewport,focusPixel);
 if((trigger==="selection"||trigger==="settings")&&obscured&&autoFrame&&building)
  return frameSelection(camera,building,viewport,focusPixel);
 // "panel" | "resize" | unobscured selection: retain the exact pose.
 return camera;
}

/* ---- Persisted inspector settings (player preference, never economy) ---- */
export const UX_SETTINGS_KEY="rustwake:v2:ux-settings";
export const UX_DEFAULTS=Object.freeze({autoFrame:true,panelSide:"auto"});
function sanitizeUx(p){
 return {
  autoFrame:typeof p?.autoFrame==="boolean"?p.autoFrame:UX_DEFAULTS.autoFrame,
  panelSide:["auto","left","right"].includes(p?.panelSide)?p.panelSide:UX_DEFAULTS.panelSide};
}
export function readUxSettings(storage){
 try{const raw=storage?.getItem(UX_SETTINGS_KEY);if(!raw)return {...UX_DEFAULTS};return sanitizeUx(JSON.parse(raw));}
 catch{return {...UX_DEFAULTS};}
}
export function writeUxSettings(storage,patch){
 const next=sanitizeUx({...readUxSettings(storage),...(patch||{})});
 try{storage?.setItem(UX_SETTINGS_KEY,JSON.stringify(next));}catch{}
 return next;
}