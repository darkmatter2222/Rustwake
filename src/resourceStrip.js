/**
 * Rustwake V2 — top resource strip derivation (#359 UX-01).
 *
 * Pure, deterministic, renderer-free READ MODEL over the authoritative
 * simulation, mirroring the src/inspector.js contract: nothing here mutates
 * game state, spends stock or writes a second economy. Every number shown in
 * the strip/ledger is derived from the same bags the simulation transacts on:
 *
 *  - depot     = g.bank[id]                       (the shared material bank)
 *  - machines  = sum of building inventory stock  (local cargo, not yet banked)
 *  - transit   = per truck: onboard v.cargo if picked up, else the reserved
 *                v.job amount (#384 LOG-04 reserve→pickup→arrive ledgers).
 *                assignJob take()s material from the source bag at dispatch,
 *                so both are physical freight — counted ONCE per truck,
 *                never job+cargo together (they are the same units)
 *  - committed = blueprint cost of assembling buildings (buildAt already
 *                spent it; cancelConstruction refunds it in full — shown as a
 *                commitment, NEVER added to the physical total)
 *  - total     = depot + machines + transit       (physical conservation)
 *
 * Capacity: the simulation exposes NO storage cap (g.bank is uncapped), even
 * after the #384 LOG-04 freight ledgers merged (reserve/pickup/arrive/return
 * are auditable in g.freightLedger, but no capacity ledger exists). The read
 * model reports capacity:null / capacityExposed:false and the UI says so
 * honestly instead of fabricating a limit (GAPS.md UX-01 row).
 *
 * Shortages mirror inspector.structureStatus precedence exactly: assembling,
 * powerless and no-frontage machines are NOT counted as starved; only
 * operating machines that fail the same fits() epsilon as simulation.js are.
 * A resource is CRITICAL when the starving machines' deficit exceeds what the
 * depot plus inbound truck jobs can cover; otherwise it is a warning
 * (delivery pending — the sim's deliveryCandidates dispatches from the depot).
 */
import {RESOURCES,BLUEPRINTS} from "./content.js";
import {powerStatus,connectedToRoad} from "./simulation.js";

const stock=(bag,id)=>Math.max(0,Number(bag?.[id]||0));
// Same epsilon as simulation.fits / inspector.fits: previews must agree.
const fits=(bag,need)=>Object.entries(need||{}).every(([id,n])=>stock(bag,id)+1e-7>=n);

// Registry currencies/prestige with no source or sink in the simulation yet.
// The market panel already declares them reserved for later phases; the strip
// marks them LOCKED rather than implying they are earnable today.
export const LOCKED_RESOURCES=Object.freeze(["relics","influence","shards","charters","renown"]);

/**
 * Full strip read model. {kind:"loading"} without a game; otherwise
 * {kind:"ready"} with one row per registry resource, the sorted shortage
 * list, the authoritative grid state and the starving-machine detail.
 * NEVER mutates g.
 */
export function resourceStripState(g){
 if(!g)return {kind:"loading"};
 const power=powerStatus(g);
 const buildings=Array.isArray(g.buildings)?g.buildings:[];
 const vehicles=Array.isArray(g.vehicles)?g.vehicles:[];
 // Starved machines: same precedence as inspector.structureStatus —
 // assembling / powerless / no-frontage machines are blocked on something
 // else first, so their inputs are not an actionable material shortage yet.
 const starving=[];
 if(power.available){
  for(const b of buildings){
   if(b.remaining>0)continue;
   const def=BLUEPRINTS[b.type];
   if(!def||!(def.cycle>0))continue;
   if(!connectedToRoad(g,b))continue;
   if(fits(b.inventory,def.inputs))continue;
   const missing=Object.entries(def.inputs||{})
    .filter(([id,n])=>stock(b.inventory,id)+1e-7<n)
    .map(([id,n])=>({id,need:n-stock(b.inventory,id)}));
   starving.push({buildingId:b.id,type:b.type,name:def.name,missing});
  }
 }
 const rows=RESOURCES.map(r=>{
  const id=r.id;
  const depot=stock(g.bank,id);
  let machines=0,committed=0,assembling=0;
  for(const b of buildings){
   machines+=stock(b.inventory,id);
   if(b.remaining>0){
    const cost=BLUEPRINTS[b.type]?.cost||{};
    if(cost[id]){committed+=cost[id];assembling++;}
   }
  }
  const starvedFor=starving.filter(s=>s.missing.some(m=>m.id===id));
  const starvedIds=new Set(starvedFor.map(s=>s.buildingId));
  let transit=0,inbound=0;
  for(const v of vehicles){
   const j=v.job;
   // #384: onboard cargo is authoritative once picked up; before pickup the
   // reservation lives on the job. Both hold the SAME units — never sum both.
   const load=v.cargo&&v.cargo.amount>0?v.cargo:(j&&j.amount>0?{resource:j.resource,amount:j.amount}:null);
   if(load&&load.resource===id){
    const n=Math.max(0,Number(load.amount)||0);
    transit+=n;
    if(j&&starvedIds.has(j.destId))inbound+=n;
   }
  }
  const need=starvedFor.reduce((a,s)=>a+(s.missing.find(m=>m.id===id)?.need||0),0);
  const total=depot+machines+transit;
  const locked=LOCKED_RESOURCES.includes(id);
  let state="ok",detail=null;
  if(locked){
   state="locked";
   detail="No source or sink in the simulation yet — reserved for later progression phases.";
  }else if(need>0){
   const cover=depot+inbound;
   if(cover+1e-7<need){
    state="critical";
    detail=starvedFor.length+" machine"+(starvedFor.length===1?"":"s")+" waiting for "+need+" "+r.unit+
     "; depot "+depot+" + inbound "+inbound+" cannot cover it. Add supply or sell less.";
   }else{
    state="warning";
    detail="Short "+need+" "+r.unit+" at "+starvedFor.length+" machine"+(starvedFor.length===1?"":"s")+
     " — depot "+depot+" + inbound "+inbound+" covers it; trucks deliver automatically.";
   }
  }else if(total<=0){
   state="empty";
   detail="Nothing in the depot, machines or trucks yet.";
  }
  return {id,name:r.name,unit:r.unit,group:r.group,color:r.color,
   depot,machines,transit,reserved:transit,committed,assembling,total,
   capacity:null,need,inbound,starvedMachines:starvedFor.length,
   locked,state,detail};
 });
 const shortages=rows.filter(r=>r.need>0)
  .sort((a,b)=>(a.state==="critical"?0:1)-(b.state==="critical"?0:1)||b.need-a.need||a.id.localeCompare(b.id));
 return {kind:"ready",rows,shortages,starving,power,
  capacityExposed:false,
  ledgerCount:Array.isArray(g.ledger)?g.ledger.length:0};
}

/* ---- Persisted strip settings (player preference, never economy) ----
   Deliberately a SEPARATE storage key from the inspector's ux-settings:
   inspector.js sanitizes that blob to {autoFrame,panelSide} only, so sharing
   it would silently drop strip preferences (and vice versa). */
export const STRIP_SETTINGS_KEY="rustwake:v2:strip-settings";
export const STRIP_DEFAULTS=Object.freeze({ledgerOpen:false});
function sanitizeStrip(p){
 return {ledgerOpen:typeof p?.ledgerOpen==="boolean"?p.ledgerOpen:STRIP_DEFAULTS.ledgerOpen};
}
export function readStripSettings(storage){
 try{const raw=storage?.getItem(STRIP_SETTINGS_KEY);if(!raw)return {...STRIP_DEFAULTS};return sanitizeStrip(JSON.parse(raw));}
 catch{return {...STRIP_DEFAULTS};}
}
export function writeStripSettings(storage,patch){
 const next=sanitizeStrip({...readStripSettings(storage),...(patch||{})});
 try{storage?.setItem(STRIP_SETTINGS_KEY,JSON.stringify(next));}catch{}
 return next;
}
