// #567: anti-starvation dispatch ordering (oldest-served-first among outputs).
// The measured defect (fresh untouched yard, ZERO player input): the furnace at
// 16,13 IS road-connected and the dispatcher rejects NOTHING — every (idle truck,
// queued load) pair is ASSIGNABLE — yet furnace steel permanently starves because
// deliveryCandidates ordered priority-1 outputs by building insertion order, so
// the salvager's scrap/iron/copper (id 1) always outranked furnace steel (id 4)
// under the saturated 3-truck fleet. Steel never reached the bank (bank.steel
// frozen at the starter 20), permanently blocking steel-dependent progression
// unattended, while the furnace bay piled to 228 and raised storage-4.
// Remedy: g.freightServedAt maps "<sourceId>:<resource>" to the sim time that
// pair's output LAST arrived at the depot; never-served pairs sort first (-1),
// then oldest served. Only the tie-break ORDER among priority-1 outputs changes
// — input priority (3), the RESERVED hard block, the #558 cooldown and every
// ledger transition are untouched (dispatchCooldown.test.mjs still passes).
// Rollback control: the fairness assertions below FAIL against the pre-fix
// dispatcher (verified at 38c36cc0 and the 4a9571e3 base before this change).
// This file imports only exports present in BOTH bases so it runs as that control.
import test from "node:test";
import assert from "node:assert/strict";
import {
 createGame,readGame,persist,snapshot,buildAt,removeBuilding,cancelFreight,
 advanceGame,checkSite,committedTotals,freightTotals,nearestRoad,roadPath,
 connectedToRoad,__setConstructionFault
} from "../src/simulation.js";
import {BLUEPRINTS,INITIAL_BANK,SAVE_KEY,WORLD_SIZE} from "../src/content.js";

const ZERO_BANK=Object.fromEntries(Object.keys(INITIAL_BANK).map(k=>[k,0]));
const store=()=>{const m=new Map();globalThis.localStorage={getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};return m;};

// Frozen yard: generator removed and starter inventories cleared so production
// halts; the ONLY candidates are the outputs we seed. Bank carries no iron/fuel,
// so no priority-3 resupply competes. Starter salvager id 1 (7,9) and furnace
// id 4 (16,13) have proven frontage + a connected BFS path to the depot (#567 Q1).
// A single idle truck makes the candidate ORDER decisive.
function orderingYard(){
 const g=createGame();
 g.buildings=g.buildings.filter(b=>b.id!==3);
 for(const b of g.buildings)b.inventory={};
 g.bank={...ZERO_BANK,credits:1000};
 g.buildings.find(b=>b.id===1).inventory={scrap:20};
 g.buildings.find(b=>b.id===4).inventory={steel:20};
 g.vehicles=g.vehicles.slice(0,1);
 g.vehicles[0].job=null;g.vehicles[0].cargo=null;
 return g;
}
function frozenYard(bank={credits:1000,scrap:100,stone:100}){
 const g=createGame();
 g.buildings=g.buildings.filter(b=>b.id!==3);
 for(const b of g.buildings)b.inventory={};
 g.bank={...ZERO_BANK,...bank};
 return g;
}
function legalSite(g,type){
 for(let z=1;z<WORLD_SIZE-1;z++)for(let x=1;x<WORLD_SIZE-1;x++)
  if(checkSite(g,type,x,z,0).ok&&nearestRoad(g,x,z))return {x,z};
 throw Error("no legal site for "+type);
}
// Build a player salvager and run until a depot arrival stamps its scrap pair.
// On the pre-fix dispatcher freightServedAt never exists, so this throws — the
// rollback control for the stamping/prune/rollback tests.
function servedSalvager(g){
 const s=legalSite(g,"salvager");
 const r=buildAt(g,"salvager",s.x,s.z,0,"f-build");
 assert.equal(r.ok,true,r.reason);
 advanceGame(g,5); // assembly is power-independent
 const b=r.building;
 assert.ok(b.remaining<=0,"assembly complete");
 // A single truck so that, at the arrival substep, no sibling has re-reserved
 // the building — removal is winnable without a RESERVED rejection.
 g.vehicles=g.vehicles.slice(0,1);
 g.vehicles[0].job=null;g.vehicles[0].cargo=null;
 b.inventory={scrap:20};
 for(let i=0;i<200;i++){
  advanceGame(g,0.5);
  if(Number.isFinite(g.freightServedAt?.[b.id+":scrap"]))return b;
 }
 throw Error("salvager scrap never served (pre-fix dispatcher has no served-at registry)");
}

test("fairness: a never-served output bay outranks a recently-served one (the #567 tie-break)",()=>{
 const g=orderingYard();
 // Salvager scrap was just served; furnace steel has NEVER been served (-1).
 g.freightServedAt={"1:scrap":g.elapsed};
 advanceGame(g,0.5);
 const j=g.vehicles[0].job;
 assert.ok(j,"the single idle truck must take a job");
 assert.equal(j.sourceId,4,"never-served furnace steel outranks recently-served salvager scrap");
 assert.equal(j.resource,"steel");
 // Reverse: stamp the furnace served, leave the salvager never-served -> salvager wins.
 const h=orderingYard();
 h.freightServedAt={"4:steel":h.elapsed};
 advanceGame(h,0.5);
 assert.equal(h.vehicles[0].job.sourceId,1,"ordering flips with the served-at timestamps");
 assert.equal(h.vehicles[0].job.resource,"scrap");
});

test("fairness: a depot arrival stamps the pair's last-served sim time",()=>{
 const g=orderingYard();
 g.freightServedAt={"1:scrap":g.elapsed}; // furnace steel never-served -> collected first
 advanceGame(g,0.5);
 assert.equal(g.vehicles[0].job.sourceId,4,"furnace steel collected first");
 let arrived=false;
 for(let i=0;i<200&&!arrived;i++){
  advanceGame(g,0.5);
  if(Number.isFinite(g.freightServedAt?.["4:steel"]))arrived=true;
 }
 assert.ok(arrived,"depot arrival stamps freightServedAt['4:steel']");
 assert.ok(g.freightServedAt["4:steel"]>0,"stamp is a positive sim time");
});

test("fairness: priority-3 input resupply still outranks every priority-1 output",()=>{
 const g=createGame();
 g.buildings=g.buildings.filter(b=>b.id!==3);
 for(const b of g.buildings)b.inventory={};
 // Bank keeps its starter iron/fuel so the empty furnace qualifies for resupply.
 g.buildings.find(b=>b.id===1).inventory={scrap:20}; // priority-1 output
 g.buildings.find(b=>b.id===4).inventory={};          // needs iron/fuel (priority 3)
 g.vehicles=g.vehicles.slice(0,1);
 g.vehicles[0].job=null;g.vehicles[0].cargo=null;
 g.freightServedAt={"1:scrap":-1}; // even a never-served output must lose to p3
 advanceGame(g,0.5);
 const j=g.vehicles[0].job;
 assert.ok(j);
 assert.equal(j.destId,4,"input resupply to the furnace wins over output collection");
 assert.equal(j.sourceId,2,"resupply sources from the depot");
 assert.equal(j.resource,"iron");
});

test("fresh untouched yard: furnace steel reaches the bank instead of starving (core #567 regression); deterministic",()=>{
 const run=()=>{
  const g=createGame();
  assert.deepEqual(g.freightServedAt,{},"fresh yard ships an empty served-at registry");
  const steel0=g.bank.steel;
  let maxFurnaceSteel=0,steelPickups=0;
  const active=new Set();
  for(let t=0;t<180;t+=0.5){
   advanceGame(g,0.5);
   const f=g.buildings.find(b=>b.id===4);
   maxFurnaceSteel=Math.max(maxFurnaceSteel,f.inventory.steel||0);
   for(const v of g.vehicles){
    const isSteel=v.job&&v.job.sourceId===4&&v.job.resource==="steel";
    if(isSteel&&!active.has(v.id)){steelPickups++;active.add(v.id);}
    if(!isSteel)active.delete(v.id);
   }
   const ft=freightTotals(g);
   assert.ok(ft.reserved>=0&&ft.onboard>=0,"freight ledger never goes negative");
  }
  return {g,steel0,maxFurnaceSteel,steelPickups};
 };
 const a=run();
 // THE DEFECT (pre-fix): bank.steel frozen at 20, furnace bay piling past 60,
 // zero steel pickups. THE FIX: steel is collected and reaches the bank.
 assert.ok(a.steelPickups>=2,"furnace steel collected repeatedly, not permanently starved");
 assert.ok(a.g.bank.steel>a.steel0,"steel actually reaches the bank (progression unblocked)");
 assert.ok(a.maxFurnaceSteel<60,"furnace bay drains instead of stalling (pre-fix piled to 228)");
 // Determinism / replay-safety: an identical fresh run matches exactly.
 const b=run();
 assert.deepEqual(b.g.bank,a.g.bank,"identical fresh runs conserve the same bank");
 assert.deepEqual(b.g.freightServedAt,a.g.freightServedAt,"served-at registry is deterministic");
 assert.equal(b.steelPickups,a.steelPickups);
});

test("fairness: save/reload sanitizes hostile served-at entries; legacy saves load clean; registry is capped",()=>{
 const m=store();
 const g=createGame();
 advanceGame(g,120); // accrue real served-at entries and elapsed
 persist(g);
 const raw=JSON.parse(m.get(SAVE_KEY));
 const elapsed=raw.elapsed;
 raw.freightServedAt={
  ["1:scrap"]:elapsed-5,     // valid pair, finite, <= elapsed, source exists -> keep
  ["4:steel"]:elapsed+1e9,   // hostile future timestamp (> elapsed) -> drop
  "bad-key":5,               // malformed key -> drop
  ["99:scrap"]:5,            // vanished source id -> drop
  ["1:iron"]:"soon",         // non-numeric -> drop
  ["1:copper"]:-3            // negative -> drop
 };
 raw.lastSavedAt=Date.now(); // no offline catch-up
 m.set(SAVE_KEY,JSON.stringify(raw));
 const loaded=readGame();
 assert.deepEqual(loaded.freightServedAt,{["1:scrap"]:elapsed-5},
  "only the valid pair survives sanitization");
 // Legacy save WITHOUT the field loads clean (fresh default, no throw).
 const legacy=JSON.parse(m.get(SAVE_KEY));
 delete legacy.freightServedAt;
 legacy.lastSavedAt=Date.now();
 m.set(SAVE_KEY,JSON.stringify(legacy));
 assert.deepEqual(readGame().freightServedAt,{},"legacy save defaults to an empty registry");
 // Cap: 3000 valid entries are trimmed to the 2048 LARGEST timestamps.
 const cap=JSON.parse(m.get(SAVE_KEY));
 cap.elapsed=5000;cap.lastSavedAt=Date.now();
 const big={};
 for(let i=0;i<3000;i++){
  const name=String.fromCharCode(97+Math.floor(i/676)%26,97+Math.floor(i/26)%26,97+i%26);
  big["1:"+name]=i; // values 0..2999 <= elapsed; source id 1 exists; key format valid
 }
 cap.freightServedAt=big;
 m.set(SAVE_KEY,JSON.stringify(cap));
 const cl=readGame();
 const vals=Object.values(cl.freightServedAt);
 assert.equal(vals.length,2048,"registry capped at SERVED_AT_CAP");
 assert.equal(Math.min(...vals),952,"keeps the 2048 largest (3000 - 2048 = 952)");
 delete globalThis.localStorage;
});

test("fairness: dismantle prunes the removed source's pairs; an injected fault rolls the registry back exactly",()=>{
 const g=frozenYard();
 const b=servedSalvager(g);
 assert.ok(Object.keys(g.freightServedAt).some(k=>k.startsWith(b.id+":")),"pair stamped before removal");
 // Injected fault AFTER the splice (and after prune) must restore the registry.
 const before=snapshot(g);
 __setConstructionFault((p)=>{if(p==="dismantle.afterSplice")throw Error("fault at afterSplice");});
 try{assert.throws(()=>removeBuilding(g,b.id,"f-fault"),/fault at afterSplice/);}
 finally{__setConstructionFault(null);}
 assert.deepEqual(snapshot(g),before,"rollback restores bank/buildings/rings AND freightServedAt exactly");
 assert.ok(g.buildings.some(x=>x.id===b.id),"no half-removed machine");
 // A clean retry succeeds and prunes the removed source's pairs.
 const r=removeBuilding(g,b.id,"f-dismantle");
 assert.equal(r.ok,true);assert.equal(r.code,"OK");
 assert.equal(Object.keys(g.freightServedAt).some(k=>k.startsWith(b.id+":")),false,
  "removed source's served-at pairs are pruned");
});

test("fairness: a fresh yard starts empty and dispatch alone never fabricates served-at entries for idle sources",()=>{
 const g=frozenYard(); // no seeded outputs -> nothing to serve
 assert.deepEqual(g.freightServedAt,{},"createGame ships an empty registry");
 advanceGame(g,5);
 assert.deepEqual(g.freightServedAt,{},"with no eligible output, no pair is stamped");
 // cancelFreight on an idle truck records nothing and does not touch the registry.
 const idle=cancelFreight(g,1);
 assert.equal(idle.ok,false);
 assert.deepEqual(g.freightServedAt,{});
});
