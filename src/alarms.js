/**
 * Rustwake V2 — actionable in-world alarms (#364 UX-06).
 *
 * Pure, deterministic, renderer-free READ MODEL over the authoritative
 * simulation, mirroring the src/inspector.js / src/resourceStrip.js contract:
 * nothing here mutates game state, spends stock or writes a second economy.
 * Every alarm is derived from the sim's own exports (powerStatus,
 * connectedToRoad, nearestRoad, roadPath, canAfford, unlocked) and the UX-01
 * strip read model, so an alarm can never disagree with the authority.
 *
 * Four alarm classes, each with a problem AND a remedy a novice can act on
 * without opening unrelated menus:
 *  - power      grid brownout (demand > supply) -> build a Turbine Generator
 *  - road       completed machine without road frontage -> lay asphalt
 *  - starvation operating machine short of inputs (mirrors UX-01 shortages)
 *               -> build the unlocked producer / watch the freight delivery
 *  - storage    output bay backing up with no truck assigned -> fix the route
 *               or check Fleet. The depot bank itself is UNCAPPED in the
 *               simulation (no capacity ledger exists); the model reports
 *               depotUncapped:true and the UI says so honestly instead of
 *               fabricating a "depot full" limit (GAPS.md UX-06 row).
 *
 * Colour is never the only cue: every alarm carries an icon, an explicit
 * severity word (CRITICAL / WARNING), a title, a problem sentence and a
 * remedy sentence. States: ready / processing / unaffordable / locked /
 * blocked, plus loading / empty / error at the model level.
 */
import {BLUEPRINTS,BUILDINGS,RESOURCE_BY_ID,TIERS} from "./content.js";
import {powerStatus,connectedToRoad,nearestRoad,roadPath,canAfford,unlocked,ROAD_REACH} from "./simulation.js";
import {resourceStripState} from "./resourceStrip.js";

const stock=(bag,id)=>Math.max(0,Number(bag?.[id]||0));
// The sim's deliveryCandidates caps a pickup at Math.min(15, floor(amount)):
// one full truck load is the honest "bay is backing up" threshold.
export const TRUCK_LOAD=15;
// roadLine charges exactly {credits:4, stone:3} per added segment.
export const ROAD_SEGMENT_COST=Object.freeze({stone:3,credits:4});
export const ALARM_KINDS=Object.freeze(["power","road","starvation","storage"]);
export const ALARM_ICONS=Object.freeze({power:"⌁",road:"⚠",starvation:"◔",storage:"▤"});
export const SEVERITY_LABELS=Object.freeze({critical:"CRITICAL",warning:"WARNING"});
const KIND_ORDER=Object.freeze({power:0,road:1,starvation:2,storage:3});
export const costText=(cost)=>Object.entries(cost||{}).map(([id,n])=>n+" "+(RESOURCE_BY_ID[id]?.unit||id)).join(" + ");

function makeAlarm({id,kind,severity,state="ready",title,problem,remedy,detail=null,action,altAction=null,target=null}){
 return {id,kind,severity,state,icon:ALARM_ICONS[kind],severityLabel:SEVERITY_LABELS[severity],
  title,problem,remedy,detail,action,altAction,target};
}

/** Grid brownout: exact powerStatus verdict, turbine remedy with real cost. */
function powerAlarms(g,power){
 if(power.available||!(power.demand>0))return [];
 const gen=BLUEPRINTS.generator;
 const assembling=g.buildings.filter(b=>b.type==="generator"&&b.remaining>0);
 const afford=canAfford(g,gen.cost);
 const state=assembling.length?"processing":afford?"ready":"unaffordable";
 const soon=assembling.length?Math.min(...assembling.map(b=>Number(b.remaining)||0)):0;
 return [makeAlarm({
  id:"power-brownout",kind:"power",severity:"critical",state,
  title:"GRID BROWNOUT",
  problem:"Grid demand "+power.demand+" MW exceeds supply "+power.supply+" MW — every machine is powerless and production is halted.",
  remedy:afford
   ?"Build another "+gen.name+" (+12 MW) — costs "+costText(gen.cost)+". Open the construct catalog and place it on a free pad."
   :"A "+gen.name+" costs "+costText(gen.cost)+" — the depot cannot afford one right now. Sell surplus at the Exchange, then build it.",
  detail:assembling.length?assembling.length+" turbine"+(assembling.length===1?"":"s")+" assembling — +12 MW each in "+soon.toFixed(1)+"s. Power returns automatically.":null,
  action:{tool:"build",blueprint:"generator",label:"Construct a turbine"},
  altAction:afford?null:{tool:"market",label:"Sell surplus at the Exchange"},
  target:{buildingId:null}
 })];
}

/** Missing roads: completed machines whose loading bay cannot reach asphalt. */
function roadAlarms(g){
 const out=[];
 const afford=canAfford(g,ROAD_SEGMENT_COST);
 for(const b of g.buildings){
  if(b.remaining>0)continue;
  const def=BLUEPRINTS[b.type];if(!def)continue;
  if(connectedToRoad(g,b))continue;
  out.push(makeAlarm({
   id:"road-"+b.id,kind:"road",severity:"critical",state:afford?"ready":"unaffordable",
   title:"NO ROAD · "+def.name.toUpperCase(),
   problem:def.name+" at "+b.x+","+b.z+" has no road frontage — trucks cannot load or deliver cargo there.",
   remedy:"Lay asphalt within "+ROAD_REACH+" cells of the loading bay — "+costText(ROAD_SEGMENT_COST)+" per segment."+
    (afford?" Open the road engineer, tap a start cell, then the bay.":" The depot cannot afford a segment right now — sell surplus at the Exchange first."),
   action:{tool:"road",label:"Open road engineer"},
   altAction:afford?null:{tool:"market",label:"Sell surplus at the Exchange"},
   target:{buildingId:b.id,x:b.x,z:b.z,name:def.name}
  }));
 }
 return out;
}

/** Machine shortages: mirrors the UX-01 strip shortages EXACTLY (ids/severity). */
function starvationAlarms(g,strip){
 const out=[];
 for(const row of strip.shortages){
  const id=row.id;
  const producers=BUILDINGS.filter(d=>d.cycle>0&&(d.outputs||{})[id]);
  const open=producers.filter(d=>unlocked(g,d.id)).sort((a,b)=>(a.cost.credits||0)-(b.cost.credits||0));
  const lockedProducer=producers.find(d=>!unlocked(g,d.id));
  const lockedTier=lockedProducer?TIERS.find(t=>t.unlocks.includes(lockedProducer.id)):null;
  let state,remedy,action,altAction=null;
  if(row.state==="warning"){
   state="ready";
   remedy="Depot stock plus inbound trucks already covers the deficit — delivery is automatic. Keep the route connected and watch the freight ledger.";
   action={tool:"inventory",resource:id,label:"Watch the freight ledger"};
  }else if(open.length){
   const p=open[0],afford=canAfford(g,p.cost);
   state=afford?"ready":"unaffordable";
   remedy="Build a "+p.name+" ("+costText(p.cost)+") to add "+row.name+" supply."+
    (afford?"":" The depot cannot afford it right now — sell surplus at the Exchange first.");
   action={tool:"build",blueprint:p.id,label:"Construct "+p.name};
   if(!afford)altAction={tool:"market",label:"Sell surplus at the Exchange"};
  }else if(lockedProducer&&lockedTier){
   state="locked";
   remedy=row.name+" production unlocks at "+lockedTier.name+" ("+lockedTier.needs+" production). Until then, sell less at the Exchange and keep existing trucks running.";
   action={tool:"market",label:"Open the Exchange"};
  }else{
   state="blocked";
   remedy="No "+row.name+" source exists in this build yet — starting stock is finite. Ration it: salvage idle consumers for their cargo and await a later progression phase.";
   action={tool:"inventory",resource:id,label:"Inspect yard stock"};
  }
  out.push(makeAlarm({
   id:"starve-"+id,kind:"starvation",severity:row.state==="critical"?"critical":"warning",state,
   title:row.unit+" SHORTAGE",
   problem:row.detail,
   remedy,action,altAction,
   target:{resource:id,buildingIds:strip.starving.filter(s=>s.missing.some(m=>m.id===id)).map(s=>s.buildingId)}
  }));
 }
 return out;
}

/**
 * Storage backups: output cargo piling up in a CONNECTED machine bay with no
 * pickup truck assigned. (Disconnected bays already raise the road alarm —
 * the root cause — so they are not double-counted here.) The depot bank is
 * uncapped in the simulation; this is the only honest storage alarm.
 */
function storageAlarms(g){
 const out=[];
 const depot=g.buildings.find(b=>b.type==="depot"&&b.remaining<=0);
 for(const b of g.buildings){
  if(b.remaining>0)continue;
  const def=BLUEPRINTS[b.type];if(!def||!(def.cycle>0))continue;
  const outputs=def.outputs||{};
  const held=Object.keys(outputs).reduce((a,id)=>a+stock(b.inventory,id),0);
  if(held<TRUCK_LOAD)continue;
  if(!connectedToRoad(g,b))continue; // road alarm owns the root cause
  if(g.vehicles.some(v=>v.job&&v.job.sourceId===b.id&&outputs[v.job.resource]))continue;
  const src=nearestRoad(g,b.x,b.z),dst=depot?nearestRoad(g,depot.x,depot.z):null;
  const routeOk=!!(depot&&src&&dst&&roadPath(g,src,dst));
  out.push(makeAlarm({
   id:"storage-"+b.id,kind:"storage",severity:"warning",state:routeOk?"ready":"blocked",
   title:"BAY BACKUP · "+def.name.toUpperCase(),
   problem:def.name+" at "+b.x+","+b.z+" is holding "+held+" units of output with no truck assigned to collect it.",
   remedy:routeOk
    ?"Freight dispatch is automatic — trucks collect loads of up to "+TRUCK_LOAD+". If the queue stalls, check Fleet for blocked routes or busy trucks."
    :"The bay reaches a road but no connected route leads to the Freight Depot — reconnect the asphalt; trucks then haul loads of up to "+TRUCK_LOAD+" automatically.",
   action:routeOk?{tool:"fleet",label:"Check fleet dispatch"}:{tool:"road",label:"Reconnect the route"},
   target:{buildingId:b.id,x:b.x,z:b.z,name:def.name,held}
  }));
 }
 return out;
}

/**
 * Full alarm read model. {kind:"loading"} without a game; {kind:"error"} for
 * an unreadable yard; otherwise {kind:"ready"} with deterministic alarms
 * (critical first, then power/road/starvation/storage), counts and the
 * authoritative grid state. NEVER mutates g.
 */
export function alarmsState(g){
 if(!g)return {kind:"loading"};
 if(!Array.isArray(g.buildings)||!Array.isArray(g.roads)||!Array.isArray(g.vehicles))
  return {kind:"error",reason:"Yard state is unreadable — alarms pause until the save loads."};
 const power=powerStatus(g);
 const strip=resourceStripState(g);
 const alarms=[
  ...powerAlarms(g,power),
  ...roadAlarms(g),
  ...starvationAlarms(g,strip),
  ...storageAlarms(g)
 // Stable sort: critical first, then power/road/starvation/storage; within a
 // class the derivation order is preserved (strip deficit order for starvation,
 // buildings order for road/storage) — deterministic for a given yard state.
 ].sort((a,b)=>(a.severity==="critical"?0:1)-(b.severity==="critical"?0:1)
  ||KIND_ORDER[a.kind]-KIND_ORDER[b.kind]);
 return {kind:"ready",alarms,power,
  counts:{critical:alarms.filter(a=>a.severity==="critical").length,
   warning:alarms.filter(a=>a.severity==="warning").length,total:alarms.length},
  depotUncapped:true,capacityExposed:false};
}

/** Alarms that target a specific machine (inspector contextual states). */
export function alarmsForBuilding(state,buildingId){
 if(!state||state.kind!=="ready"||buildingId==null)return [];
 return state.alarms.filter(a=>
  (a.target?.buildingId===buildingId)||
  (Array.isArray(a.target?.buildingIds)&&a.target.buildingIds.includes(buildingId)));
}

/* ---- Persisted alarm settings (player preference, never economy) ----
   Deliberately a SEPARATE storage key from ux/strip/dock/fleet settings:
   each sanitizer owns only its own fields, so sharing a blob would silently
   drop preferences (the UX-01 lesson). */
export const ALARM_SETTINGS_KEY="rustwake:v2:alarm-settings";
export const ALARM_DEFAULTS=Object.freeze({railOpen:true,showWarnings:true});
function sanitizeAlarms(p){
 return {
  railOpen:typeof p?.railOpen==="boolean"?p.railOpen:ALARM_DEFAULTS.railOpen,
  showWarnings:typeof p?.showWarnings==="boolean"?p.showWarnings:ALARM_DEFAULTS.showWarnings};
}
export function readAlarmSettings(storage){
 try{const raw=storage?.getItem(ALARM_SETTINGS_KEY);if(!raw)return {...ALARM_DEFAULTS};return sanitizeAlarms(JSON.parse(raw));}
 catch{return {...ALARM_DEFAULTS};}
}
export function writeAlarmSettings(storage,patch){
 const next=sanitizeAlarms({...readAlarmSettings(storage),...(patch||{})});
 try{storage?.setItem(ALARM_SETTINGS_KEY,JSON.stringify(next));}catch{}
 return next;
}