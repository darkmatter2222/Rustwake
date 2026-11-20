// #580 starter-yard dock reach: the ART-04 Freight Depot roller shutter must
// open on a FRESH first-run yard with zero player input. The remedy is bay-
// approach STOP SEMANTICS (dockApproach: facing-side aligned road stop within
// ROAD_REACH of the LOG-02 bay + a live off-road corridor tail onto the bay),
// NOT the shutter drive: ART04_DOCK near/far/travel are byte-unchanged and the
// lift stays a pure function of the real nearest-truck bay distance (#274).
//
// Negative controls (each named test FAILS at the pre-fix base 77e6442):
//  - "docking fires (stocked bank)": base measures dockingSteps 0 / minBayDist
//    5.775 over the same 960-step window (scripts/diag-dock-reach.mjs, docs/
//    evidence/580-starter-dock/baseline-diag.txt) — the shutter never opens.
//  - "clause 1 zero input": base measures dockingSteps 0 / minBayDist 5.775 /
//    firstDockT null over 2640 steps / 660 sim-s with INITIAL_BANK and tier
//    UNTOUCHED (scripts/diag-dock-zeroinput.mjs). The in-test negative control
//    replays the same zero-input sim with the depot corridor tail stripped
//    every tick (base stop semantics: freight stops at the road stop, never
//    drives onto the bay) and must measure 0 docking steps.
//  - "corridor tail": base routes end at the anchor stop (13,8), 7 world from
//    the bay — the tail/corridor assertions cannot hold.
//  - "bay-parked departure": base trucks park at the road stop, never on the
//    bay (park distance 7 > near 2.5).
//  - "join-hold destination-bay exclusion": without the explicit exclusion the
//    immediate idle reroute snaps the mover back to the stop at t=0.5 (probe
//    measured route [bay] -> [stop,(13,11),bay]) — route-unchanged fails.
//  - "goal-cell recovery": without the goal exemption avoid.has(roadDest) is
//    permanently true and recovery refuses forever (starterFuelEconomy test-3
//    regression: 0 steel in 60 s).
//
// Refs #596 disclosure: the idle-blocker reroute acceleration + idle-avoid sweep
// in moveVehicle/rerouteAroundBlocker overlap #596's origin-cell blocker
// recovery territory. This PR keeps that overlap MINIMAL (join-hold exclusion +
// goal exemption only); createGame still ships exactly 3 trucks and #596 is NOT
// delivered here. Fleet growth / universal origin-cell recovery remain #596's.
//
// Migration semantics (acceptance clause 6): NONE. Save schema version 2 is
// unchanged; dock stops/corridors are DERIVED LIVE from geometry on every guard
// pass (dockApproach is a pure read), so no stop field is stored and no placed
// depot can move or rotate on reload. readGame's normalizeRot is the identity on
// valid rotations. The save/reload test below proves both halves.
import test from "node:test";
import assert from "node:assert/strict";
import {
 createGame,advanceGame,persist,readGame,buildAt,freightTotals,
 dockApproach,routeSevered,nearestRoad,roadPath,buildingAt
} from "../src/simulation.js";
import {INITIAL_BANK,CELL,SAVE_KEY,footprintOf} from "../src/content.js";
import {bayCells,ROAD_REACH,key} from "../src/gridOccupancy.js";
import {ART04_DOCK,ART04_TYPES,bayApproachDistance,depotDoorLift,art04Advance} from "../src/art04.js";
import {fleetState} from "../src/fleet.js";
import {laneRoute,WAIT_TIMEOUT_SECONDS} from "../src/traffic.js";

const truck=(g,id)=>g.vehicles.find(v=>v.id===id);
const building=(g,id)=>g.buildings.find(b=>b.id===id);
const entries=(g,kind)=>g.freightLedger.filter(e=>e.kind===kind);
const ZERO_BANK=Object.fromEntries(Object.keys(INITIAL_BANK).map(k=>[k,0]));
// Frozen-power freight fixture (mirrors tests/freight.test.mjs): production
// cannot mask a freight leak; every total below is exact, fixed seed 4073.
function freightGame({bank={credits:1800},inventories={}}={}){
 const g=createGame();
 assert.equal(g.seed,4073);
 building(g,3).remaining=1e9; // generator never completes -> supply 0
 for(const b of g.buildings)b.inventory={...(inventories[b.id]||{})};
 g.bank={...ZERO_BANK,...bank};
 return g;
}
const solo=g=>{g.vehicles=g.vehicles.slice(0,1);return g;};
const scrapGame=()=>solo(freightGame({inventories:{1:{scrap:12}}}));
const ironGame=()=>solo(freightGame({bank:{credits:1800,iron:90}}));
function tickUntil(g,pred,base,{step=0.1,max=6000}={}){
 for(let i=0;i<max;i++){
  advanceGame(g,step);
  assert.deepStrictEqual(freightTotals(g).totals,base,"freight conserved every tick");
  if(pred(g))return i+1;
 }
 throw new Error("tickUntil: predicate never met within "+max+" steps");
}
function storageStub(){
 const m=new Map();
 return {getItem:k=>(m.has(k)?m.get(k):null),setItem:(k,v)=>m.set(k,String(v)),
  removeItem:k=>m.delete(k),map:m};
}
// Dry yard: no dispatch candidates can form, so hand-placed jobs and idle
// parks are the ONLY motion authority (isolates moveVehicle from dispatch).
function dryYard(){
 const g=freightGame();
 for(const b of g.buildings)b.inventory={};
 g.bank={...ZERO_BANK,credits:1800};
 return g;
}

test("dock contract: ART04_DOCK window and civic types are byte-unchanged; 1x1 sockets preserved",()=>{
 assert.deepEqual(ART04_DOCK,{near:2.5,far:7,travel:.8},"the dock window must NOT be widened to swallow a 7-unit bay");
 assert.deepEqual(ART04_TYPES,["depot","market","research","fabricator"]);
 for(const t of ART04_TYPES)assert.deepEqual(footprintOf(t),{w:1,d:1},t+" keeps its 1x1 LOG-02 footprint");
 // Starter geometry is untouched (rotating the depot is NOT a remedy: the
 // ART-05 forklift post is pinned to the live rot-0 bay, tests/vehicleRigs).
 const g=createGame();
 const depot=building(g,2);
 assert.deepEqual({x:depot.x,z:depot.z,rot:depot.rot||0},{x:13,z:9,rot:0});
 const a=dockApproach(g,depot);
 assert.deepEqual(a.bay,{x:13,z:10},"LOG-02 bay cell unchanged");
 assert.deepEqual(a.stop,{x:13,z:12},"facing-side aligned road stop within ROAD_REACH");
 assert.deepEqual(a.cells,[{x:13,z:11},{x:13,z:10}],"corridor runs stop->bay inclusive");
 assert.ok(g.roads.includes(key(a.stop.x,a.stop.z)),"the stop is real asphalt");
 assert.equal(Math.abs(a.stop.x-a.bay.x)+Math.abs(a.stop.z-a.bay.z),2);
 assert.ok(2<=ROAD_REACH);
 // The OLD anchor stop is exactly why the shutter never opened: 7 world > near.
 const nr=nearestRoad(g,a.bay.x,a.bay.z);
 assert.deepEqual(nr,{x:13,z:8},"nearestRoad(bay) still resolves to the old anchor stop");
 assert.equal(Math.hypot((a.bay.x-nr.x)*CELL,(a.bay.z-nr.z)*CELL),7);
 assert.ok(7>ART04_DOCK.near);
});

test("dock contract: 4 types x 4 rotations — depot corridors are straight/live; non-depots keep curbside stops",()=>{
 for(const type of ART04_TYPES){
  for(let rot=0;rot<4;rot++){
   const bay=bayCells(type,10,10,rot)[0];
   const f={x:bay.x-10,z:bay.z-10}; // 1x1: bay = anchor + facing
   const roads=[1,2,3].map(d=>key(bay.x+f.x*d,bay.z+f.z*d));
   const b={id:1,type,x:10,z:10,rot,level:1,remaining:0,inventory:{},timer:0};
   const g={roads,buildings:[b]};
   const a=dockApproach(g,b);
   if(type!=="depot"){
    assert.equal(a,null,type+" rot "+rot+" must keep its measured curbside stop (#567/#585) — no corridor");
    continue;
   }
   assert.ok(a,"depot rot "+rot+" has a facing-side stop");
   assert.deepEqual(a.bay,bay);
   assert.deepEqual(a.stop,{x:bay.x+f.x,z:bay.z+f.z},"nearest aligned road cell wins");
   assert.deepEqual(a.cells,[bay],"contiguous axis-aligned corridor ends ON the bay");
   // A machine on the corridor severs the approach honestly (pure live read).
   const blocked={roads,buildings:[b,{id:2,type:"salvager",x:bay.x,z:bay.z,rot:0,level:1,remaining:0,inventory:{},timer:0}]};
   assert.equal(dockApproach(blocked,b),null,"corridor blocked by a machine -> null");
  }
 }
});

test("docking fires (stocked bank, tier 2): diag-dock-reach replica, real sim — shutter opens inside the declared 240s window",()=>{
 // Exact replica of scripts/diag-dock-reach.mjs: STOCKED bank so freight jobs
 // flow, tier 2, 960 steps dt 0.25 / 240 sim-s. This is NOT the clause-1
 // zero-input case (see the next test); the measured-12 firstDockT annotation
 // belongs to THIS stocked-bank condition only. NEGATIVE CONTROL: at base
 // 77e6442 this measures dockingSteps 0 / minBayDist 5.7750 (shutter closed
 // for the entire run); the assertions below cannot pass there.
 const g=createGame();
 const depot=building(g,2);
 Object.assign(g.bank,{credits:8000,scrap:600,iron:300,stone:300,steel:300,copper:300,fuel:200,water:200,circuits:80,gears:60,data:40});
 g.tier=2;
 let minDist=Infinity,dockingSteps=0,firstDockT=null;
 const dt=0.25;
 for(let t=0;t<240;t+=dt){
  advanceGame(g,dt);
  assert.equal(g.vehicles.length,3,"createGame still ships exactly 3 trucks — fleet growth is #596, not this PR");
  const {distance}=bayApproachDistance(g,depot);
  if(distance<minDist)minDist=distance;
  if(distance<=ART04_DOCK.near){dockingSteps++;if(firstDockT===null)firstDockT=t;}
 }
 assert.ok(dockingSteps>0,"dockingSteps must be > 0 (base: 0)");
 assert.ok(minDist<=ART04_DOCK.near,"minBayDist "+minDist.toFixed(4)+" must be <= near 2.5 (base: 5.7750)");
 assert.ok(firstDockT!==null&&firstDockT<=60,"first docking at t="+firstDockT+" must land within 60 sim-s (measured 12 under THIS stocked-bank/tier-2 condition)");
 assert.ok(depotDoorLift(minDist)>0,"the real nearest-truck distance commands a non-zero shutter lift");
});

test("clause 1 zero input: fresh starter yard, INITIAL_BANK and tier UNTOUCHED — real sim docks inside the declared 660s window",()=>{
 // Acceptance clause 1 proper: createGame() exactly as shipped — no bank
 // mutation, no tier mutation (tier stays 0), 2640 steps dt 0.25 / 660 sim-s.
 // Instrument: scripts/diag-dock-zeroinput.mjs. Measured at fix head:
 // dockingSteps 538, minBayDist 1.225, firstDockT 7.25 sim-s. Declared window:
 // first dock <= 30 sim-s inside the 660 sim-s run.
 // NEGATIVE CONTROL (base 77e6442f, same probe): dockingSteps 0, minBayDist
 // 5.775, firstDockT null — the assertions below cannot pass there. The
 // in-test control below replays base stop semantics dynamically.
 const g=createGame();
 assert.deepEqual(g.bank,INITIAL_BANK,"zero input: the shipped INITIAL_BANK is untouched");
 assert.equal(g.tier,0,"zero input: tier stays 0 — no mutation");
 const depot=building(g,2);
 let minDist=Infinity,dockingSteps=0,firstDockT=null;
 const dt=0.25;
 for(let t=0;t<660;t+=dt){
  advanceGame(g,dt);
  assert.equal(g.vehicles.length,3,"createGame still ships exactly 3 trucks — fleet growth is #596, not this PR");
  const {distance}=bayApproachDistance(g,depot);
  if(distance<minDist)minDist=distance;
  if(distance<=ART04_DOCK.near){dockingSteps++;if(firstDockT===null)firstDockT=t;}
 }
 assert.ok(dockingSteps>0,"dockingSteps must be > 0 (base zero-input: 0)");
 assert.ok(minDist<=ART04_DOCK.near,"minBayDist "+minDist.toFixed(4)+" must be <= near 2.5 (base zero-input: 5.775)");
 assert.ok(firstDockT!==null&&firstDockT<=30,"first docking at t="+firstDockT+" must land within 30 sim-s (measured 7.25)");
 assert.ok(depotDoorLift(minDist)>0,"the real nearest-truck distance commands a non-zero shutter lift");
 // ---- In-test negative control: base stop semantics, same zero-input sim ----
 // Base routes stop at the road stop and NEVER drive the off-road corridor
 // onto the bay. Replay that here by stripping the live depot corridor from
 // every job leg after each tick — the entry tail AND the dockDeparture head
 // prefix (all remaining cells are asphalt, so routeSevered stays false and
 // freight still flows). The truck then parks at the road stop ~5.775 world
 // from the bay — outside near 2.5 — exactly the base measurement. A widened
 // ART04_DOCK window or a fake/ambient docking path would make this control
 // dock and FAIL the test.
 const c=createGame();
 assert.deepEqual(c.bank,INITIAL_BANK);
 assert.equal(c.tier,0);
 const cDepot=building(c,2);
 const ca=dockApproach(c,cDepot);
 const corridor=new Set(ca.cells.map(p=>key(p.x,p.z)));
 const strip=leg=>{
  if(!Array.isArray(leg))return;
  while(leg.length&&corridor.has(key(leg[leg.length-1].x,leg[leg.length-1].z)))leg.pop();
  while(leg.length&&corridor.has(key(leg[0].x,leg[0].z)))leg.shift();
 };
 let cMin=Infinity,cDocking=0,cFirst=null;
 for(let t=0;t<660;t+=dt){
  advanceGame(c,dt);
  for(const v of c.vehicles){if(!v.job)continue;strip(v.job.route);strip(v.job.toSource);strip(v.job.toDest);}
  const {distance}=bayApproachDistance(c,cDepot);
  if(distance<cMin)cMin=distance;
  if(distance<=ART04_DOCK.near){cDocking++;if(cFirst===null)cFirst=t;}
 }
 assert.equal(cDocking,0,"base stop semantics (no corridor tail): dockingSteps must be 0 (base probe measured 0)");
 assert.equal(cFirst,null,"base stop semantics: firstDockT must be null — never docks");
 assert.ok(cMin>ART04_DOCK.near,"base stop semantics minBayDist "+cMin.toFixed(4)+" must stay > near 2.5 (base probe measured 5.775)");
});

test("shutter drive stays pure distance (#274): no timer, no ambient fallback, no fake docking",()=>{
 const D=ART04_DOCK;
 assert.equal(depotDoorLift(0),D.travel);
 assert.equal(depotDoorLift(D.near),D.travel);
 assert.equal(depotDoorLift(D.far),0);
 assert.equal(depotDoorLift(D.far+1),0);
 assert.equal(depotDoorLift(Infinity),0,"no trucks => closed, never an ambient open");
 let prev=Infinity;
 for(const d of [0,1,2.5,3,4.75,6,7,8,Infinity]){
  const lift=depotDoorLift(d);
  assert.ok(lift<=prev+1e-9,"monotone non-increasing in distance");
  assert.ok(lift>=0&&lift<=D.travel);
  prev=lift;
 }
 assert.equal(depotDoorLift(1,true),0,"reduced motion parks the shutter closed");
 // Same trucks, wildly different sim clocks => identical depot status/lift.
 const g=createGame();
 const depot=building(g,2);
 const a=dockApproach(g,depot);
 truck(g,1).x=a.bay.x+0.35;truck(g,1).z=a.bay.z;
 const s0={clock:0,lastTimer:0,lastElapsed:0,lastSold:0};
 const r1=art04Advance(s0,{...g,elapsed:0},depot);
 const r2=art04Advance(s0,{...g,elapsed:99999},depot);
 assert.equal(r1.status,"docking");
 assert.equal(r1.status,r2.status,"sim elapsed has NO authority over the depot shutter");
 assert.equal(r1.truckDistance,r2.truckDistance);
 assert.equal(r1.advance,0,"depot has no production cycle — the work clock never drives the door");
 const empty=art04Advance(s0,{...g,vehicles:[]},depot);
 assert.equal(empty.status,"idle");
 assert.equal(empty.truckDistance,Infinity);
});

test("corridor blocked by a machine severs honestly: ROUTE_BLOCKED return, fleet read-model parity",()=>{
 const g=scrapGame();
 const base=freightTotals(g).totals;
 advanceGame(g,0.1);
 const v=truck(g,1);
 assert.equal(v.job.phase,"toSource");
 const depot=building(g,2);
 const a=dockApproach(g,depot);
 assert.deepEqual(v.job.toDest.slice(-a.cells.length),a.cells,"depot destination route carries the live corridor tail (base: ends at anchor stop)");
 // A machine parked on the corridor cell drops dockApproach to null — the
 // off-road tail is no longer exempt, exactly like a removed road segment.
 g.buildings.push({id:90,type:"salvager",x:a.cells[0].x,z:a.cells[0].z,rot:0,level:1,remaining:0,inventory:{},timer:0});
 assert.equal(dockApproach(g,depot),null);
 assert.equal(routeSevered(g,v.job),true);
 const row=fleetState(g).rows.find(r=>r.id===1);
 assert.equal(row.state,"blocked");
 assert.equal(row.stuck.code,"ROUTE_BLOCKED","fleet panel says EXACTLY what moveVehicle applies next tick");
 assert.equal(row.hauling,false);
 advanceGame(g,0.1);
 assert.equal(v.job,null);
 assert.equal(v.cargo,null);
 assert.equal(building(g,1).inventory.scrap,12,"reservation returned to source exactly once");
 assert.equal(entries(g,"return")[0].reason,"ROUTE_BLOCKED");
 assert.deepStrictEqual(freightTotals(g).totals,base);
 // Repair the corridor: the load is re-reserved and delivered once. No dupes.
 g.buildings=g.buildings.filter(b=>b.id!==90);
 assert.ok(dockApproach(g,depot));
 tickUntil(g,()=>entries(g,"arrive").some(e=>e.amount===12),base);
 assert.equal(g.bank.scrap,12);
 assert.equal(entries(g,"arrive").filter(e=>e.amount===12).length,1);
 assert.deepStrictEqual(freightTotals(g).totals,base);
});

test("vanished depot destination: stored straight tail stays exempt -> DEST_MISSING (not ROUTE_BLOCKED), freight home",()=>{
 const g=scrapGame();
 const base=freightTotals(g).totals;
 tickUntil(g,()=>truck(g,1).job?.phase==="toDest",base);
 const v=truck(g,1);
 g.buildings=g.buildings.filter(b=>b.id!==2); // depot gone mid-haul
 // The geometric straight-tail exemption keeps the route legal so the honest
 // missing-building guard (not ROUTE_BLOCKED) yields the reason.
 assert.equal(routeSevered(g,v.job),false,"vanished endpoint's straight corridor tail is exempt");
 const row=fleetState(g).rows.find(r=>r.id===1);
 assert.equal(row.stuck.code,"DEST_MISSING");
 tickUntil(g,()=>v.job===null,base);
 assert.equal(entries(g,"return")[0].reason,"DEST_MISSING");
 assert.equal(building(g,1).inventory.scrap,12,"load went back to source, not the bank");
 assert.equal(g.bank.scrap??0,0);
 assert.equal(entries(g,"arrive").length,0);
 assert.deepStrictEqual(freightTotals(g).totals,base);
});

test("vanished depot source: stored straight tail stays exempt -> SOURCE_MISSING, reservation to bank",()=>{
 const g=ironGame();
 const base=freightTotals(g).totals;
 tickUntil(g,()=>truck(g,1).job?.phase==="toSource",base);
 const v=truck(g,1);
 assert.equal(v.job.sourceId,2);
 const a=dockApproach(g,building(g,2));
 assert.deepEqual(v.job.toSource.slice(-a.cells.length),a.cells,"depot source route carries the corridor tail");
 g.buildings=g.buildings.filter(b=>b.id!==2);
 assert.equal(routeSevered(g,v.job),false);
 assert.equal(fleetState(g).rows.find(r=>r.id===1).stuck.code,"SOURCE_MISSING");
 advanceGame(g,0.1);
 assert.equal(v.job,null);
 assert.equal(entries(g,"return")[0].reason,"SOURCE_MISSING");
 assert.equal(g.bank.iron,90,"orphaned reservation falls back to the bank exactly once");
 assert.deepStrictEqual(freightTotals(g).totals,base);
});

test("tampered corridor tail still severs: the vanished-endpoint exemption is bounded and geometric",()=>{
 const g=scrapGame();
 const base=freightTotals(g).totals;
 tickUntil(g,()=>truck(g,1).job?.phase==="toDest",base);
 const v=truck(g,1);
 g.buildings=g.buildings.filter(b=>b.id!==2);
 // Bend the stored tail off its straight axis: a tampered route must NOT ride
 // the exemption — it severs exactly like a removed road.
 v.job.toDest[v.job.toDest.length-1]={x:14,z:10};
 assert.equal(routeSevered(g,v.job),true);
 advanceGame(g,0.1);
 assert.equal(v.job,null);
 assert.equal(entries(g,"return")[0].reason,"ROUTE_BLOCKED");
 assert.equal(building(g,1).inventory.scrap,12);
 assert.deepStrictEqual(freightTotals(g).totals,base);
});

test("bay-parked truck departs without snapping: pickup in place, bounded per-tick displacement",()=>{
 const g=scrapGame();
 const base=freightTotals(g).totals;
 tickUntil(g,()=>entries(g,"arrive").some(e=>e.amount===12),base);
 const v=truck(g,1);
 const depot=building(g,2);
 const a=dockApproach(g,depot);
 assert.equal(v.job,null,"delivered truck is idle");
 // NEGATIVE CONTROL: base trucks park at the anchor stop (13,8), 7 world from
 // the bay — this park-inside-the-window assertion cannot pass there.
 const parkDist=Math.hypot(v.x-a.bay.x,v.z-a.bay.z)*CELL;
 assert.ok(parkDist<=ART04_DOCK.near,"truck parks ON the bay approach (measured 1.225 world), not at the road stop");
 // Fund a depot->furnace iron resupply (priority 3): the idle truck ON the
 // depot bay is the SOURCE park, so it must depart along the corridor
 // (dockDeparture) and pick up in place — no out-and-back, no snap.
 g.bank.iron=15;
 const base2=freightTotals(g).totals;
 advanceGame(g,0.1);
 assert.ok(v.job,"re-dispatched from the bay");
 assert.equal(v.job.sourceId,2,"depot is the source — the truck is parked on its bay");
 assert.equal(v.job.destId,4);
 assert.deepEqual(v.job.toDest[0],a.bay,"departure route starts AT the bay (sameSrc pickup in place)");
 assert.equal(v.job.phase,"toDest");
 let maxStep=0,px=v.x,pz=v.z;
 for(let i=0;i<60;i++){
  advanceGame(g,0.1);
  assert.deepStrictEqual(freightTotals(g).totals,base2,"freight conserved every tick");
  const d=Math.hypot(v.x-px,v.z-pz);
  maxStep=Math.max(maxStep,d);
  px=v.x;pz=v.z;
 }
 // A lane-offset join is <= 0.7 cells; the old ~2-cell teleport back to the
 // road stop would blow this bound. Speed 2.25 cells/s * 0.1 s = 0.225 + join.
 assert.ok(maxStep<=1.0,"max per-tick displacement "+maxStep.toFixed(3)+" cells must stay <= 1.0 (no road snap)");
 assert.ok(Math.hypot(v.x-a.bay.x,v.z-a.bay.z)>3,"the truck genuinely drove out of the bay corridor");
});

test("join-hold destination-bay exclusion: idle bay park keeps the verbatim timeout path (no t=0.5 snap)",()=>{
 // Probe-derived fixture (dry yard isolates moveVehicle). u idles exactly at
 // the bay lane park spot; v holds a sameSrc single-cell pickup route [bay].
 // NEGATIVE CONTROL: without the explicit atDestBay exclusion the immediate
 // idle reroute fires at t=0.5 (nearestRoad(bay)=(13,8) != dock stop (13,12),
 // so the implicit avoid.has(roadDest) guard does NOT cover this case) and
 // snaps v back to the stop — routeChanged becomes true and this test fails.
 const g=dryYard();
 const depot=building(g,2);
 const a=dockApproach(g,depot);
 assert.deepEqual(nearestRoad(g,a.bay.x,a.bay.z),{x:13,z:8},"the implicit guard's blind spot, measured");
 const [v,u,w]=g.vehicles;
 u.x=a.bay.x+0.35;u.z=a.bay.z;u.heading={x:0,z:-1};u.job=null;
 w.x=5;w.z=5;w.job=null;
 v.x=a.stop.x;v.z=a.stop.z;v.heading={x:0,z:-1};
 v.job={sourceId:depot.id,destId:4,resource:"scrap",amount:5,
  phase:"toSource",toSource:[{x:a.bay.x,z:a.bay.z}],toDest:[{x:a.bay.x,z:a.bay.z},{x:16,z:12}],
  route:[{x:a.bay.x,z:a.bay.z}],segment:0,progress:0};
 v.cargo=null;
 const routeBefore=JSON.stringify(v.job.route);
 for(let t=0;t<3;t+=0.5){
  advanceGame(g,0.5);
  assert.equal(JSON.stringify(v.job?.route),routeBefore,"route must NOT change while waitTime < timeout ("+WAIT_TIMEOUT_SECONDS+"s)");
  assert.equal(v.x,a.stop.x,"mover holds at the join — no snap back to the stop lane");
  assert.equal(v.z,a.stop.z);
  assert.equal(v.waiting,true);
  assert.equal(v.blockedBy,u.id);
  assert.ok((v.waitTime||0)>0,"waitTime accumulates honest queue time");
  assert.equal(u.job,null,"dry yard: the bay park stays jobless");
 }
 assert.ok((v.waitTime||0)<WAIT_TIMEOUT_SECONDS,"still inside the timeout grace — the bay-queue last resort owns this case");
});

test("idle-blocker acceleration: a jobless NON-destination join blocker reroutes immediately, freight untouched",()=>{
 const g=dryYard();
 const [v,u,w]=g.vehicles;
 const route=roadPath(g,{x:5,z:12},{x:16,z:12});
 assert.ok(route&&route.length>=2);
 const lane=laneRoute(route);
 // u idles exactly on v's join start; w is far away. v is freshly assigned
 // (segment 0 / progress 0) but parked mid-route at (10,12).
 u.x=lane.points[0].x;u.z=lane.points[0].z;u.heading=lane.headings[0]||{x:1,z:0};u.job=null;
 w.x=5;w.z=5;w.job=null;
 v.x=10;v.z=12;v.heading={x:1,z:0};
 v.job={sourceId:2,destId:4,resource:"scrap",amount:5,phase:"toDest",
  toSource:[{x:13,z:12}],toDest:route,route,segment:0,progress:0};
 v.cargo=null;
 const before={amount:v.job.amount,sourceId:v.job.sourceId,destId:v.job.destId,phase:v.job.phase};
 advanceGame(g,0.5); // << WAIT_TIMEOUT_SECONDS: only the immediate path can fire
 assert.notEqual(JSON.stringify(v.job.route),JSON.stringify(route),"idle non-destination blocker reroutes immediately (base: timeout-only)");
 assert.deepEqual(v.job.route[v.job.route.length-1],{x:16,z:12},"goal preserved");
 assert.deepEqual({amount:v.job.amount,sourceId:v.job.sourceId,destId:v.job.destId,phase:v.job.phase},before,"freight untouched by recovery");
 assert.equal(v.waiting,false);
 assert.equal(v.blockedBy,null);
 assert.equal(v.waitTime,0);
 assert.equal(u.job,null);
});

test("goal-cell recovery exemption: an idle park ON the destination stop does not veto reroute around a mid-route blocker",()=>{
 // NEGATIVE CONTROL for the idle-avoid goal exemption: without it,
 // avoid.has(roadDest) is permanently true (the goal park is in the sweep),
 // rerouteAroundBlocker refuses forever, and the steel run starves behind a
 // mid-route idle park (measured: starterFuelEconomy test-3, 0 steel in 60 s).
 const g=dryYard();
 const [v,u,w]=g.vehicles;
 const route=roadPath(g,{x:5,z:12},{x:16,z:12});
 const lane=laneRoute(route);
 // w blocks the join start; u idles ON the destination stop's lane (16,12).
 w.x=lane.points[0].x;w.z=lane.points[0].z;w.heading=lane.headings[0]||{x:1,z:0};w.job=null;
 u.x=16.35;u.z=12;u.heading={x:1,z:0};u.job=null;
 assert.deepEqual(nearestRoad(g,Math.round(u.x),Math.round(u.z)),{x:16,z:12},"u's road cell IS the goal");
 v.x=10;v.z=12;v.heading={x:1,z:0};
 v.job={sourceId:2,destId:4,resource:"scrap",amount:5,phase:"toDest",
  toSource:[{x:13,z:12}],toDest:route,route,segment:0,progress:0};
 v.cargo=null;
 advanceGame(g,0.5);
 assert.notEqual(JSON.stringify(v.job.route),JSON.stringify(route),"recovery must land despite the goal-cell idle park");
 assert.deepEqual(v.job.route[v.job.route.length-1],{x:16,z:12},"goal preserved — the bay-queue last resort still owns the goal park");
 assert.equal(v.waiting,false);
 assert.equal(u.job,null);
});

test("save compatibility: placed depots never move/rotate; bay-park state reloads and departs (migration: NONE)",()=>{
 const store=storageStub();
 globalThis.localStorage=store;
 try{
  // Part A — an already-placed depot at a custom rotation survives reload
  // verbatim; dock semantics are derived live, never stored.
  const g=createGame();
  Object.assign(g.bank,{credits:8000,scrap:100,stone:100});
  const placed=buildAt(g,"depot",8,6,1);
  assert.ok(placed.ok,"player-placed depot at (8,6) rot 1: "+(placed.reason||""));
  assert.ok(persist(g));
  const raw=JSON.parse(store.map.get(SAVE_KEY));
  assert.equal(raw.version,2,"schema version unchanged — no migration");
  for(const b of raw.buildings)assert.ok(!("dockStop" in b)&&!("approach" in b),"no stored dock semantics");
  for(const v of raw.vehicles)assert.ok(!("dockStop" in v),"no stored dock semantics on vehicles");
  const loaded=readGame();
  const lb=loaded.buildings.find(b=>b.id===placed.building.id);
  assert.deepEqual({x:lb.x,z:lb.z,rot:lb.rot},{x:8,z:6,rot:1},"placed depot did not move or rotate");
  const ls=loaded.buildings.find(b=>b.id===2);
  assert.deepEqual({x:ls.x,z:ls.z,rot:ls.rot||0},{x:13,z:9,rot:0},"starter depot did not move or rotate");
  const la=dockApproach(loaded,lb);
  assert.deepEqual(la.bay,{x:9,z:6},"rot-1 bay derived live from geometry");
  assert.deepEqual(la.stop,{x:11,z:6},"facing-side stop derived live — nothing migrated");
  assert.deepEqual(la.cells,[{x:10,z:6},{x:9,z:6}]);
  // Part B — a truck parked ON the bay (the new park state this fix creates)
  // roundtrips exactly and departs along the corridor after reload.
  const g2=scrapGame();
  const base=freightTotals(g2).totals;
  tickUntil(g2,()=>entries(g2,"arrive").some(e=>e.amount===12),base);
  const v=truck(g2,1);
  const a=dockApproach(g2,building(g2,2));
  assert.ok(Math.hypot(v.x-a.bay.x,v.z-a.bay.z)*CELL<=ART04_DOCK.near);
  assert.ok(persist(g2));
  const reloaded=readGame(); // immediate reload: no offline catch-up
  const rv=reloaded.vehicles.find(x=>x.id===1);
  assert.equal(rv.x,v.x,"bay-park x survives reload exactly");
  assert.equal(rv.z,v.z,"bay-park z survives reload exactly");
  assert.equal(rv.job,null);
  assert.ok(bayApproachDistance(reloaded,reloaded.buildings.find(b=>b.id===2)).distance<=ART04_DOCK.near,"shutter still commands open on the reloaded park");
  reloaded.bank.iron=15; // depot->furnace resupply: the bay park is the SOURCE park
  advanceGame(reloaded,0.1);
  assert.ok(rv.job,"reloaded bay-park truck re-dispatches");
  assert.equal(rv.job.sourceId,2);
  assert.deepEqual(rv.job.toDest[0],a.bay,"departs along the corridor, pickup in place — no migration needed");
 }finally{delete globalThis.localStorage;}
});

test("perf guard: supplied roadSet => dockApproach never iterates g.roads, and equals the old full scan exactly",()=>{
 // Deterministic regression guard for the coordinator-measured ~3x advanceGame
 // slowdown at c62f0b89 (PR #603 comment 7029173754): dockApproach's full-road
 // scan decoded EVERY tile with cellOf (string split + array alloc) per call.
 // The ray-probe rewrite (alignment forces candidates onto the facing-axis ray,
 // so Manhattan distance == ray offset) must, when given the caller's per-pass
 // roadSet, perform ZERO iterations of g.roads while returning the EXACT result
 // of the old scan. Non-timing by design: an iteration counter is deterministic
 // on any CI, where wall-clock assertions would be flaky.
 // Reference: the pre-optimization full scan, verbatim semantics.
 const fullScan=(g,b)=>{
  if(!b||b.type!=="depot")return null;
  const bay=bayCells(b.type,b.x,b.z,b.rot||0)[0];
  if(!bay)return null;
  const fx=bay.x-b.x,fz=bay.z-b.z;
  if(fx===0&&fz===0)return null;
  let stop=null,bestD=Infinity;
  for(const tile of g.roads){
   const [a,c]=tile.split(",").map(Number);
   const aligned=fx!==0?(c===bay.z&&(a-bay.x)*fx>0):(a===bay.x&&(c-bay.z)*fz>0);
   if(!aligned)continue;
   const d=Math.abs(a-bay.x)+Math.abs(c-bay.z);
   if(d<=ROAD_REACH&&d<bestD){stop={x:a,z:c};bestD=d;}
  }
  if(!stop)return null;
  const cells=[];
  let x=stop.x,z=stop.z;
  while(x!==bay.x||z!==bay.z){x-=fx;z-=fz;cells.push({x,z});}
  if(cells.some(p=>buildingAt(g,p.x,p.z)))return null;
  return {id:b.id,bay,stop,cells};
 };
 // Array whose iterator counts every full-scan pass over it.
 const counting=roads=>{
  const arr=[...roads];let n=0;
  arr[Symbol.iterator]=function(){n++;return Array.prototype[Symbol.iterator].call(this);};
  return {arr,count:()=>n};
 };
 for(let rot=0;rot<4;rot++){
  const b={id:1,type:"depot",x:10,z:10,rot,level:1,remaining:0,inventory:{},timer:0};
  const bay=bayCells("depot",10,10,rot)[0];
  const f={x:bay.x-10,z:bay.z-10}; // unit facing axis
  const ray=d=>key(bay.x+f.x*d,bay.z+f.z*d);
  const offAxis=key(bay.x+f.z,bay.z+f.x); // perpendicular neighbour: never aligned
  const geometries=[
   [ray(1),ray(2),ray(3),offAxis],        // nearest aligned wins
   [ray(2),ray(3),offAxis],               // gap at d=1
   [ray(3),offAxis],                      // farthest legal stop
   [ray(ROAD_REACH+1),offAxis],           // beyond ROAD_REACH -> null
   [offAxis],                             // no aligned road -> null
   [ray(1),ray(2),ray(3),offAxis,"block"] // machine on the corridor -> null
  ];
  for(const geo of geometries){
   const tiles=geo.filter(r=>r!=="block");
   const buildings=[b];
   if(geo.includes("block"))buildings.push({id:2,type:"salvager",x:bay.x,z:bay.z,rot:0,level:1,remaining:0,inventory:{},timer:0});
   const g={roads:tiles,buildings};
   const expected=fullScan(g,b);
   const roadSet=new Set(tiles); // built from the plain array, before the swap
   const c=counting(tiles);
   g.roads=c.arr;
   // Instrument sanity: the OLD scan genuinely iterates the counting array.
   assert.deepEqual(fullScan(g,b),expected);
   assert.ok(c.count()>0,"instrument works: the old full scan iterates g.roads");
   const before=c.count();
   const actual=dockApproach(g,b,roadSet);
   assert.deepEqual(actual,expected,"rot "+rot+" roads ["+tiles.join(" ")+"]: ray probe must equal the old full scan exactly");
   assert.equal(c.count(),before,"supplied roadSet: dockApproach must NOT iterate g.roads (full-scan regression guard)");
  }
 }
 // Absent roadSet the function builds its own Set once — still exactly the old
 // scan's result on the live starter yard (and on a corridor-blocked variant).
 const live=createGame();
 const lb=live.buildings.find(x=>x.id===2);
 assert.deepEqual(dockApproach(live,lb),fullScan(live,lb));
 const la=dockApproach(live,lb);
 live.buildings.push({id:90,type:"salvager",x:la.cells[0].x,z:la.cells[0].z,rot:0,level:1,remaining:0,inventory:{},timer:0});
 assert.equal(dockApproach(live,lb),null);
 assert.equal(fullScan(live,lb),null);
});
