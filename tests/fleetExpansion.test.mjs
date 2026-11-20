// #596 fleet growth as a DEPOT-ONLY level sink — the dedicated evidence file.
// Covers the exact cost ladder, the cap clamp, save compatibility (readGame
// NEVER spawns), recoveryTries sanitization, four-seam atomic rollback,
// kind-tagged command idempotency, every zero-spend reject path, real spawn
// clearance, the B2 production-neutrality tripwire, the B1 depot-only
// affordance (with the NEW lockReason pinned verbatim — tests/inspector.test
// only asserts length>10), and preview/authority parity.
//
// All assertions compare actual values (deep-equal objects, exact codes and
// strings, measured gaps). The transaction authority is upgradeDepot in
// src/simulation.js; the read model is depotUpgradeView in src/inspector.js.
// Refs #596, Refs #592, Refs #280 (truck manufacturing stays sequenced behind
// this capacity sink — no mechanic duplication).
import test from "node:test";
import assert from "node:assert/strict";
import {
 createGame,advanceGame,persist,readGame,buildAt,upgradeDepot,depotUpgradeCost,
 fleetCapOf,depotSpawnCell,DEPOT_MAX_LEVEL,FLEET_BASE,ORIGIN_RECOVERY_MAX_TRIES,
 __setConstructionFault,snapshot,freightTotals
} from "../src/simulation.js";
import {inspectorState,depotUpgradeView} from "../src/inspector.js";
import {BLUEPRINTS,SAVE_KEY} from "../src/content.js";
import {bayCells,ROAD_REACH,key} from "../src/gridOccupancy.js";
import {envelopeGapWorld,MIN_GAP_WORLD} from "../src/traffic.js";

const building=(g,id)=>g.buildings.find(b=>b.id===id);
const depotOf=g=>g.buildings.find(b=>b.type==="depot"&&b.remaining<=0);
function storageStub(){
 const m=new Map();
 return {getItem:k=>(m.has(k)?m.get(k):null),setItem:(k,v)=>m.set(k,String(v)),
  removeItem:k=>m.delete(k),map:m};
}
// Rich bank so every gate EXCEPT the one under test is satisfied.
function richGame(){
 const g=createGame();
 Object.assign(g.bank,{credits:20000,steel:1000,gears:1000});
 return g;
}
const truckAt=(id,x,z)=>({id,name:"HAULER-"+String(id).padStart(2,"0"),x,z,
 speed:2.25,job:null,cargo:null,anim:0,heading:{x:1,z:0},
 waiting:false,blockedBy:null,waitTime:0,recoveryTries:0});
// The NEW locked-upgrade copy, pinned VERBATIM (the old text is gone; a revert
// or reword fails here, not silently behind a length>10 assertion).
const LOCK_REASON="Production upgrades are not purchasable in this build — only the depot has a live upgrade (fleet capacity). This preview shows the exact effect of a level, not a buy action.";

test("cost ladder: exact L2/L3/L4 objects; L2 has NO gears key; ladder continues linearly to L10",()=>{
 assert.deepEqual(depotUpgradeCost(2),{credits:600,steel:30});
 assert.equal("gears" in depotUpgradeCost(2),false,"L2 must not charge gears");
 assert.deepEqual(depotUpgradeCost(3),{credits:1100,steel:55,gears:15});
 assert.deepEqual(depotUpgradeCost(4),{credits:1600,steel:80,gears:30});
 // L10 = 600+500*8 credits, 30+25*8 steel, 15*8 gears.
 assert.deepEqual(depotUpgradeCost(10),{credits:4600,steel:230,gears:120});
 // Coercion floor: anything below 2 prices as L2, never a free upgrade.
 assert.deepEqual(depotUpgradeCost(1),{credits:600,steel:30});
 assert.deepEqual(depotUpgradeCost(NaN),{credits:600,steel:30});
});

test("fleetCapOf: exact clamp table 1->3, 2->4, 3->5, 10->12, 11->12, 0->3, NaN->3",()=>{
 assert.equal(DEPOT_MAX_LEVEL,10);
 assert.equal(FLEET_BASE,3);
 const table=[[1,3],[2,4],[3,5],[4,6],[5,7],[6,8],[7,9],[8,10],[9,11],[10,12],[11,12],[0,3],[-7,3],[NaN,3],[2.9,4]];
 for(const [level,cap] of table)
  assert.equal(fleetCapOf(level),cap,"fleetCapOf("+level+") must clamp to "+cap);
});

test("fresh game ships exactly 3 trucks; a legacy level-1 save reloads with exactly the same 3",()=>{
 const store=storageStub();
 globalThis.localStorage=store;
 try{
  const g=createGame();
  assert.equal(g.vehicles.length,3);
  assert.deepEqual(g.vehicles.map(v=>v.id),[1,2,3]);
  assert.equal(depotOf(g).level,1);
  assert.ok(persist(g));
  const loaded=readGame(); // immediate reload: no offline catch-up
  assert.equal(loaded.vehicles.length,3,"legacy level-1 save keeps exactly 3 — no free bump");
  assert.deepEqual(loaded.vehicles,g.vehicles,"the legacy fleet roundtrips verbatim");
  assert.equal(depotOf(loaded).level,1);
 }finally{delete globalThis.localStorage;}
});

test("readGame NEVER spawns: tampered depot level 10 raises the cap to 12 but the fleet stays 3; level clamp is global",()=>{
 const store=storageStub();
 globalThis.localStorage=store;
 try{
  const tamper=(mutate)=>{
   const g=createGame();
   mutate(g);
   assert.ok(persist(g));
   return readGame();
  };
  const high=tamper(g=>{depotOf(g).level=10;});
  assert.equal(high.vehicles.length,3,"a tampered level must NOT respawn or grow the fleet on reload");
  assert.equal(depotOf(high).level,10);
  assert.equal(fleetCapOf(depotOf(high).level),12,"the cap derives from the persisted level only");
  const over=tamper(g=>{depotOf(g).level=999;});
  assert.equal(depotOf(over).level,10,"999 clamps to DEPOT_MAX_LEVEL");
  assert.equal(over.vehicles.length,3);
  const neg=tamper(g=>{depotOf(g).level=-5;});
  assert.equal(depotOf(neg).level,1,"-5 clamps to 1");
  // JSON cannot carry NaN; persist serializes it to null, which readGame must
  // coerce to 1 exactly like NaN (Number(null)||1).
  const nan=tamper(g=>{depotOf(g).level=NaN;});
  assert.equal(JSON.parse(store.map.get(SAVE_KEY)).buildings.find(b=>b.id===2).level,null,"NaN persisted as null");
  assert.equal(depotOf(nan).level,1,"NaN/null clamps to 1");
  // The clamp is GLOBAL: a non-depot building is clamped identically so a
  // tampered level can never explode n*b.level production either.
  const nonDepot=tamper(g=>{building(g,1).level=999;});
  assert.equal(building(nonDepot,1).type,"salvager");
  assert.equal(building(nonDepot,1).level,10,"non-depot level clamps to 10 too");
  const nonDepotLow=tamper(g=>{building(g,1).level=-5;});
  assert.equal(building(nonDepotLow,1).level,1);
 }finally{delete globalThis.localStorage;}
});

test("recoveryTries sanitization: 99->3, -1->0, 2.7->2; a legacy vehicle keeps NO recoveryTries key",()=>{
 assert.equal(ORIGIN_RECOVERY_MAX_TRIES,3);
 const store=storageStub();
 globalThis.localStorage=store;
 try{
  const g=createGame();
  g.vehicles[0].recoveryTries=99;
  g.vehicles[1].recoveryTries=-1;
  g.vehicles[2].recoveryTries=2.7;
  assert.ok(persist(g));
  const loaded=readGame();
  assert.equal(loaded.vehicles[0].recoveryTries,3,"99 clamps to ORIGIN_RECOVERY_MAX_TRIES");
  assert.equal(loaded.vehicles[1].recoveryTries,0,"-1 clamps to 0");
  assert.equal(loaded.vehicles[2].recoveryTries,2,"2.7 floors to 2");
  // Legacy shape: createGame vehicles carry no recoveryTries key at all.
  const legacy=createGame();
  for(const v of legacy.vehicles)assert.equal("recoveryTries" in v,false);
  assert.ok(persist(legacy));
  const reloaded=readGame();
  for(const v of reloaded.vehicles)
   assert.equal("recoveryTries" in v,false,"legacy vehicle shape is provably untouched by reload");
 }finally{delete globalThis.localStorage;}
});

test("atomicity: faults at all four depotUpgrade seams roll back bank/level/vehicles/ledger/log/commands/nextId exactly; retry is real",()=>{
 for(const phase of ["depotUpgrade.afterSpend","depotUpgrade.afterLevel","depotUpgrade.afterSpawn","depotUpgrade.afterLedger"]){
  const g=richGame();
  // Fill the capped rings so the commit's pushes EVICT their heads; rollback
  // must restore full CONTENTS, not lengths (pattern: dismantleAtomic).
  for(let i=0;i<64;i++)assert.equal(buildAt(g,"salvager",3,3).code,"FRONTAGE");
  while(g.log.length<32)g.log.push({id:900+g.log.length,time:0,message:"pad"});
  g.log.length=32;
  const before=snapshot(g);
  const bankBefore={...g.bank},levelBefore=depotOf(g).level,fleetBefore=g.vehicles.length;
  __setConstructionFault(p=>{if(p===phase)throw Error("fault at "+phase);});
  try{assert.throws(()=>upgradeDepot(g,"fault-"+phase),/fault at/);}
  finally{__setConstructionFault(null);}
  assert.deepEqual(g.bank,bankBefore,"bank restored at "+phase);
  assert.equal(depotOf(g).level,levelBefore,"depot level restored at "+phase);
  assert.deepEqual(g.vehicles,before.vehicles,"FULL vehicle contents restored at "+phase);
  assert.equal(g.vehicles.length,fleetBefore);
  assert.deepEqual(g.ledger,before.ledger,"ledger ring contents restored at "+phase);
  assert.deepEqual(g.log,before.log,"log ring contents restored at "+phase);
  assert.deepEqual(g.commands,before.commands,"command ring contents restored at "+phase);
  assert.equal(g.nextId,before.nextId,"nextId restored at "+phase);
  assert.deepEqual(snapshot(g),before,"whole-state rollback at "+phase);
  // The aborted command recorded nothing: a retry is a real transaction.
  const retry=upgradeDepot(g,"fault-"+phase);
  assert.equal(retry.ok,true,"retry after "+phase+" commits");
  assert.notEqual(retry.duplicate,true);
  assert.equal(retry.level,2);
  assert.equal(g.vehicles.length,fleetBefore+1);
  assert.deepEqual(
   {credits:bankBefore.credits-g.bank.credits,steel:bankBefore.steel-g.bank.steel},
   {credits:600,steel:30},"paid exactly once after retry at "+phase);
 }
});

test("idempotency: kind-tagged depotUpgrade replay spends once; a buildAt id can NEVER satisfy it (both directions); failed replay keeps its code",()=>{
 const g=richGame();
 const first=upgradeDepot(g,"dup-1");
 assert.equal(first.ok,true);
 assert.equal(first.code,"OK");
 assert.equal(first.level,2);
 assert.equal(first.vehicle.id,4);
 const bankAfter={...g.bank};
 const replay=upgradeDepot(g,"dup-1");
 assert.deepEqual(replay,{ok:true,code:"OK",duplicate:true,commandId:"dup-1",level:2,buildingId:2,vehicleId:4});
 assert.equal(g.vehicles.length,4,"exactly one new truck");
 assert.equal(g.ledger.filter(e=>e.kind==="upgrade"&&e.type==="depot").length,1,"exactly one upgrade ledger row");
 assert.deepEqual(g.bank,bankAfter,"exactly one spend");
 assert.deepEqual(g.commands.filter(c=>c.id==="dup-1").length,1);
 // Kind isolation, direction 1: an untagged buildAt command id (here a recorded
 // FRONTAGE rejection) must NOT satisfy a depotUpgrade replay — the upgrade
 // executes as a REAL transaction instead of returning the build's outcome.
 const build=buildAt(g,"salvager",3,3,0,"kind-probe");
 assert.equal(build.code,"FRONTAGE");
 const real=upgradeDepot(g,"kind-probe");
 assert.equal(real.ok,true,"a buildAt id never replays a depotUpgrade");
 assert.notEqual(real.duplicate,true);
 assert.equal(real.level,3);
 assert.equal(g.vehicles.length,5);
 // Kind isolation, direction 2: the depotUpgrade id cannot replay as a build.
 const buildReplay=buildAt(g,"salvager",3,3,0,"dup-1");
 assert.equal(buildReplay.ok,false);
 assert.equal(buildReplay.code,"FRONTAGE","buildAt revalidates; the depotUpgrade success is not its outcome");
 assert.notEqual(buildReplay.duplicate,true);
 // Failed replay: the original reject code survives even after the state is
 // repaired, and the replay spends nothing.
 const poor=createGame();
 poor.bank={...poor.bank,credits:0,steel:0,gears:0};
 const fail=upgradeDepot(poor,"fail-1");
 assert.equal(fail.ok,false);
 assert.equal(fail.code,"INSUFFICIENT");
 Object.assign(poor.bank,{credits:20000,steel:1000,gears:1000});
 const funded={...poor.bank};
 const failReplay=upgradeDepot(poor,"fail-1");
 assert.equal(failReplay.ok,false);
 assert.equal(failReplay.duplicate,true);
 assert.equal(failReplay.code,"INSUFFICIENT","failed replay returns the ORIGINAL code");
 assert.deepEqual(poor.bank,funded,"failed replay spends nothing even once funded");
 assert.equal(poor.vehicles.length,3);
});

// Honest construction of every reject state. Each assertion checks the exact
// code, zero spend (deep-equal bank), unchanged level and fleet length, and a
// kind:"reject" ledger row carrying that exact code.
function assertReject(g,expectedCode){
 const b=depotOf(g);
 const bankBefore={...g.bank};
 const levelBefore=b?b.level:null;
 const fleetBefore=g.vehicles.length;
 const ledgerBefore=g.ledger.length;
 const res=upgradeDepot(g);
 assert.equal(res.ok,false);
 assert.equal(res.code,expectedCode);
 assert.deepEqual(g.bank,bankBefore,expectedCode+" moves no stock");
 if(b)assert.equal(b.level,levelBefore,expectedCode+" changes no level");
 assert.equal(g.vehicles.length,fleetBefore,expectedCode+" changes no fleet");
 const row=g.ledger[g.ledger.length-1];
 assert.equal(g.ledger.length,ledgerBefore+1);
 assert.equal(row.kind,"reject");
 assert.equal(row.type,"depot");
 assert.equal(row.code,expectedCode);
 assert.deepEqual(row.cost,{});
 assert.deepEqual(row.refund,{});
 return res;
}
function noSpaceGame(){
 // Level 5 -> next cap fleetCapOf(6)=8, so 6 parked trucks pass FLEET_FULL and
 // reach the spawn gate. Every road cell within ROAD_REACH of bay (13,10) is
 // covered: the 9 candidates are (11,9),(11,10),(11,11),(12,8),(13,8),(14,8),
 // (12,12),(13,12),(14,12). A square envelope blocks cell centres within
 // 0.6714 cells, so the half-cell parks each cover two adjacent candidates.
 const g=richGame();
 depotOf(g).level=5;
 g.vehicles=[[11,9.5],[11,11],[12.5,8],[14,8],[12.5,12],[14,12]]
  .map(([x,z],i)=>truckAt(i+1,x,z));
 return g;
}
test("reject paths: NO_DEPOT / MAX_LEVEL / INSUFFICIENT / FLEET_FULL / NO_SPACE each move nothing and ledger the exact code",()=>{
 const noDepot=richGame();
 noDepot.buildings=noDepot.buildings.filter(b=>b.id!==2);
 assertReject(noDepot,"NO_DEPOT");
 assert.equal(noDepot.ledger[noDepot.ledger.length-1].buildingId,null);

 const maxed=richGame();
 depotOf(maxed).level=10;
 assertReject(maxed,"MAX_LEVEL");

 const poor=richGame();
 poor.bank={...poor.bank,credits:0,steel:0,gears:0};
 assertReject(poor,"INSUFFICIENT");

 const full=richGame();
 full.vehicles.push(truckAt(4,5,5)); // fleet 4 == fleetCapOf(2)
 assertReject(full,"FLEET_FULL");

 const packed=noSpaceGame();
 // Prove the yard really occupies EVERY candidate, not just that spawn is null.
 const bay=bayCells("depot",13,9,0)[0];
 const candidates=packed.roads.map(k=>k.split(",").map(Number))
  .filter(([x,z])=>Math.abs(x-bay.x)+Math.abs(z-bay.z)<=ROAD_REACH);
 assert.equal(candidates.length,9,"the 9 candidate cells within ROAD_REACH of the bay");
 for(const [x,z] of candidates){
  const pos={x,z,heading:{x:1,z:0}};
  // Occupied = SOME truck denies clearance (depotSpawnCell requires ALL clear).
  const worst=Math.min(...packed.vehicles.map(u=>envelopeGapWorld(pos,u)));
  assert.ok(worst<MIN_GAP_WORLD,"candidate ("+x+","+z+") is occupied (tightest gap "+worst.toFixed(3)+")");
 }
 assert.equal(depotSpawnCell(packed,depotOf(packed)),null);
 assertReject(packed,"NO_SPACE");
});

test("spawn clearance is real: new truck on asphalt within ROAD_REACH of the bay, >= MIN_GAP_WORLD from every truck (measured min gap 4.95)",()=>{
 const g=richGame();
 const depot=depotOf(g);
 const bay=bayCells(depot.type,depot.x,depot.z,depot.rot||0)[0];
 const predicted=depotSpawnCell(g,depot);
 assert.deepEqual(predicted,{x:13,z:12},"deterministic (distance,key) first-clear cell");
 const res=upgradeDepot(g);
 assert.equal(res.ok,true);
 const v=res.vehicle;
 assert.deepEqual({x:v.x,z:v.z},predicted,"the transaction spawns exactly where the pure read promised");
 assert.ok(g.roads.includes(key(v.x,v.z)),"spawn cell is real asphalt");
 assert.ok(Math.abs(v.x-bay.x)+Math.abs(v.z-bay.z)<=ROAD_REACH,"within ROAD_REACH Manhattan of the bay");
 assert.deepEqual(v.heading,{x:1,z:0});
 assert.equal(v.recoveryTries,0);
 assert.equal(v.job,null);
 let minGap=Infinity;
 for(const u of g.vehicles){
  if(u.id===v.id)continue;
  const gap=envelopeGapWorld(v,u);
  minGap=Math.min(minGap,gap);
  assert.ok(gap>=MIN_GAP_WORLD,"spawn clears truck "+u.id+" by "+gap.toFixed(4)+" world");
 }
 assert.ok(Math.abs(minGap-4.95)<1e-9,"actual minimum spawn gap is 4.95 world (measured "+minGap+")");
 assert.ok(minGap>=MIN_GAP_WORLD);
});

test("B2 tripwire: depot outputs {} and no byproduct; level 1 vs 10 yards deposit IDENTICAL totals over the same run",()=>{
 const def=BLUEPRINTS.depot;
 assert.deepEqual(def.outputs,{},"TRIPWIRE: the depot must stay production-neutral — if anyone gives the depot outputs, fleet levels become a production multiplier and this test MUST fail");
 assert.equal(def.byproduct,undefined,"TRIPWIRE: no depot byproduct — level must scale nothing");
 assert.equal(def.cycle,0);
 const a=createGame();
 const b=createGame();
 depotOf(b).level=10; // the ONLY difference between the two yards
 assert.equal(depotOf(a).level,1);
 advanceGame(a,120);
 advanceGame(b,120);
 assert.deepEqual(freightTotals(b).totals,freightTotals(a).totals,
  "TRIPWIRE: depot level 10 deposited different totals than level 1 — the depot gained production; capacity must NEVER be production");
 assert.deepEqual(b.bank,a.bank,"bank deposits identical across depot levels");
 assert.equal(b.stats.produced,a.stats.produced,"produced counters identical across depot levels");
 assert.equal(b.vehicles.length,3,"level alone never spawns — only the upgrade transaction does");
});

test("B1 affordance: EVERY non-depot type has depotUpgrade null and a locked upgrade with the NEW lockReason pinned verbatim; depot view non-null and pure",()=>{
 const g=richGame();
 let id=100;
 for(const type of Object.keys(BLUEPRINTS)){
  if(type==="depot")continue;
  g.buildings.push({id:id++,type,x:3,z:3,rot:0,level:1,remaining:0,inventory:{},timer:0});
  const st=inspectorState(g,id-1);
  assert.equal(st.kind,"selected");
  assert.equal(st.depotUpgrade,null,type+" must have NO depot-upgrade affordance");
  assert.equal(st.upgrade.available,false,type+" production upgrade stays locked");
  assert.equal(st.upgrade.lockReason,LOCK_REASON,type+" lockReason must be the NEW verbatim copy");
 }
 const depot=depotOf(g);
 const view=depotUpgradeView(g,depot);
 assert.ok(view!==null,"the depot HAS the live affordance");
 assert.equal(view.available,true);
 assert.deepEqual(inspectorState(g,depot.id).depotUpgrade,view,"inspector wires the same pure view");
 // Purity: neither the view nor the full inspector state may mutate g.
 const before=structuredClone(g);
 depotUpgradeView(g,depot);
 inspectorState(g,depot.id);
 assert.deepEqual(g,before,"depotUpgradeView/inspectorState are pure reads");
});

test("preview/authority parity: every shared reject code matches exactly; success cost equals depotUpgradeCost(level+1); NO_DEPOT has no affordance at all",()=>{
 const states=[
  ["MAX_LEVEL",()=>{const g=richGame();depotOf(g).level=10;return g;}],
  ["INSUFFICIENT",()=>{const g=richGame();g.bank={...g.bank,credits:0,steel:0,gears:0};return g;}],
  ["FLEET_FULL",()=>{const g=richGame();g.vehicles.push(truckAt(4,5,5));return g;}],
  ["NO_SPACE",noSpaceGame]
 ];
 for(const [code,make]of states){
  const g=make();
  const view=depotUpgradeView(g,depotOf(g));
  const res=upgradeDepot(g);
  assert.equal(view.available,false,code+" preview must not promise");
  assert.equal(view.code,code);
  assert.equal(res.code,code);
  assert.equal(view.code,res.code,"preview/authority parity at "+code);
 }
 // NO_DEPOT: with no completed depot there is no building to inspect — the
 // affordance is null (it cannot promise anything), and the authority rejects.
 const gone=richGame();
 gone.buildings=gone.buildings.filter(b=>b.id!==2);
 const goneDepot=gone.buildings.find(b=>b.type==="depot"); // undefined: nothing to inspect
 assert.equal(depotUpgradeView(gone,goneDepot),null,"a vanished depot offers no affordance");
 assert.equal(inspectorState(gone,2).kind,"error","the inspector cannot even select it");
 assert.equal(upgradeDepot(gone).code,"NO_DEPOT");
 // Assembling depot: the preview names the specific reason (ASSEMBLING) while
 // the authority reports NO_DEPOT ("no completed depot"). Both REFUSE — the
 // affordance never promises what the transaction would reject. Disclosed as
 // a code-naming nuance in the developer report, not a parity breach.
 const assembling=richGame();
 building(assembling,2).remaining=5;
 const aView=depotUpgradeView(assembling,building(assembling,2));
 assert.equal(aView.available,false);
 assert.equal(aView.code,"ASSEMBLING");
 const aRes=upgradeDepot(assembling);
 assert.equal(aRes.ok,false);
 assert.equal(aRes.code,"NO_DEPOT");
 // Success parity.
 const g=richGame();
 const view=depotUpgradeView(g,depotOf(g));
 assert.equal(view.available,true);
 assert.equal(view.code,"OK");
 assert.equal(view.level,1);
 assert.equal(view.nextLevel,2);
 assert.equal(view.cap,3);
 assert.equal(view.nextCap,4);
 assert.deepEqual(view.cost,depotUpgradeCost(2));
 assert.equal(view.reason,null);
 const res=upgradeDepot(g);
 assert.equal(res.ok,true);
 assert.deepEqual(res.cost,view.cost,"the transaction charges exactly the previewed cost");
});
