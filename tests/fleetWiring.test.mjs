// UX-05 (#363) wiring-contract tests — complements tests/fleet.test.mjs.
// These prove the exact contracts App.jsx relies on when wiring FleetPanel:
//  - cancelFreight returns reserved OR onboard units to the source bag EXACTLY
//    once (a second cancel is a no-op), with per-resource conservation;
//  - the truck tap radius boundary and nearest-truck tie-break;
//  - an idle truck never fabricates cargo, even with loads waiting;
//  - progress/ETA are exact derivations of the sim job fields mid-route;
//  - bay queue ties break by vehicle id (deterministic order);
//  - the follow camera keeps pinning the truck as the sim moves it, preserving
//    yaw/elevation/zoom (#307) — the per-frame loop contract;
//  - the build lock is truthful and immutable.
// Same fixture discipline as fleet.test.mjs: frozen power, seed 4073,
// freightTotals conservation asserted every tick.
import test from "node:test";
import assert from "node:assert/strict";
import {createGame,advanceGame,cancelFreight,freightTotals} from "../src/simulation.js";
import {INITIAL_BANK,CELL,WORLD_SIZE} from "../src/content.js";
import {
 fleetState,truckAt,truckGround,followTarget,fleetFocusPixel,
 TRUCK_TAP_RADIUS_CELLS,FLEET_BUILD_LOCK
} from "../src/fleet.js";
import {groundAtScreen} from "../src/camera.js";

const truck=(g,id)=>g.vehicles.find(v=>v.id===id);
const building=(g,id)=>g.buildings.find(b=>b.id===id);
const row=(f,id)=>f.rows.find(r=>r.id===id);
const ZERO_BANK=Object.fromEntries(Object.keys(INITIAL_BANK).map(k=>[k,0]));
function freightGame({bank={credits:1800},inventories={}}={}){
 const g=createGame();
 assert.equal(g.seed,4073);
 building(g,3).remaining=1e9; // frozen power: production cannot mask freight
 for(const b of g.buildings)b.inventory={...(inventories[b.id]||{})};
 g.bank={...ZERO_BANK,...bank};
 return g;
}
const solo=g=>{g.vehicles=g.vehicles.slice(0,1);return g;};
const scrapGame=()=>solo(freightGame({inventories:{1:{scrap:12}}}));
function tickUntil(g,pred,{step=0.1,max=6000}={}){
 const base=freightTotals(g).totals;
 for(let i=0;i<max;i++){
  advanceGame(g,step);
  assert.deepStrictEqual(freightTotals(g).totals,base,"freight conserved every tick");
  if(pred(g))return i+1;
 }
 throw new Error("tickUntil: predicate never met");
}
const bagOf=(g,id)=>{const b=building(g,id);return b&&b.type==="depot"?g.bank:b.inventory;};
const ISO_CAM=Object.freeze({yaw:45,elevation:35.264,zoom:1.15,x:0,z:0});

test("fleet wiring NEGATIVE: cancel mid-haul returns onboard units to source EXACTLY once — never both",()=>{
 const g=scrapGame();
 tickUntil(g,()=>truck(g,1).job?.phase==="toDest");
 const v=truck(g,1),j=v.job,amount=j.amount,resource=j.resource;
 const srcBag=bagOf(g,j.sourceId);
 const beforeBag=srcBag[resource]||0;
 const before=freightTotals(g);
 assert.equal(before.onboard,amount,"onboard before cancel");
 assert.equal(before.reserved,0,"never counted as reserved while hauling");
 const fBefore=fleetState(g);
 assert.equal(row(fBefore,1).hauling,true);
 assert.equal(row(fBefore,1).onboard,amount);
 assert.equal(row(fBefore,1).reserved,0);
 const r1=cancelFreight(g,1);
 assert.equal(r1.ok,true);
 assert.equal(r1.amount,amount);
 assert.equal(r1.resource,resource);
 assert.equal(srcBag[resource],beforeBag+amount,"source bag gained the load exactly once");
 assert.deepStrictEqual(freightTotals(g).totals,before.totals,"per-resource conservation across cancel");
 assert.equal(freightTotals(g).onboard,0);
 assert.equal(freightTotals(g).reserved,0);
 assert.equal(v.job,null);assert.equal(v.cargo,null);
 // Second cancel: a no-op. No second refund, no ledger drift.
 const r2=cancelFreight(g,1);
 assert.equal(r2.ok,false);
 assert.equal(r2.code,"IDLE");
 assert.equal(srcBag[resource],beforeBag+amount,"no double refund");
 assert.deepStrictEqual(freightTotals(g).totals,before.totals);
 const fAfter=fleetState(g);
 const r=fAfter.rows.find(x=>x.id===1);
 assert.equal(r.hauling,false,"cancelled truck is NEVER shown as hauling");
 assert.equal(r.state,"idle");
 assert.equal(r.reserved,0);assert.equal(r.onboard,0);
 assert.equal(r.cancel.allowed,false);
 assert.equal(r.cancel.code,"IDLE");
});

test("fleet wiring NEGATIVE: cancel a reservation returns reserved units to source EXACTLY once",()=>{
 const g=scrapGame();
 tickUntil(g,()=>truck(g,1).job?.phase==="toSource");
 const v=truck(g,1),j=v.job,amount=j.amount,resource=j.resource;
 const srcBag=bagOf(g,j.sourceId);
 const beforeBag=srcBag[resource]||0;
 const before=freightTotals(g);
 assert.equal(before.reserved,amount);
 assert.equal(before.onboard,0);
 const r1=cancelFreight(g,1);
 assert.equal(r1.ok,true);
 assert.equal(srcBag[resource],beforeBag+amount);
 assert.deepStrictEqual(freightTotals(g).totals,before.totals);
 assert.equal(freightTotals(g).reserved,0);
 const r2=cancelFreight(g,1);
 assert.equal(r2.ok,false);assert.equal(r2.code,"IDLE");
 assert.equal(srcBag[resource],beforeBag+amount,"no double refund");
 assert.deepStrictEqual(freightTotals(g).totals,before.totals);
 const r=fleetState(g).rows.find(x=>x.id===1);
 assert.equal(r.hauling,false);assert.equal(r.state,"idle");
 assert.equal(r.reserved,0);assert.equal(r.onboard,0);
});

test("fleet wiring: truckAt radius boundary is inclusive at 0.65 and nearest truck wins",()=>{
 const g=createGame();
 const v=truck(g,1); // at 11,10
 assert.equal(TRUCK_TAP_RADIUS_CELLS,0.65);
 // The contract is d<=0.65; 1e-9 keeps the probe clear of binary FP noise at
 // the exact boundary (11+0.65-11 === 0.6500000000000004 in IEEE-754).
 assert.equal(truckAt(g,v.x+TRUCK_TAP_RADIUS_CELLS-1e-9,v.z),1,"just inside radius hits (<=)");
 assert.equal(truckAt(g,v.x+TRUCK_TAP_RADIUS_CELLS+1e-9,v.z),null,"beyond radius misses");
 // z probe stays clear of HAULER-02 (11,11): 0.3 from 01, 0.7 (> radius) from 02.
 assert.equal(truckAt(g,v.x,v.z+0.3),1);
 // Two trucks: HAULER-01 (11,10), HAULER-02 (11,11). A tap between them,
 // closer to 02, must resolve to 02 — never an arbitrary first match.
 assert.equal(truckAt(g,11,10.7),2);
 assert.equal(truckAt(g,11,10.2),1);
});

test("fleet wiring NEGATIVE: an idle truck shows no cargo even with loads waiting",()=>{
 const g=freightGame({inventories:{1:{scrap:12}}});
 // No ticks: dispatch has not run, all trucks idle, scrap waiting at source.
 const f=fleetState(g);
 assert.equal(f.kind,"ready");
 assert.ok(f.totals.waiting>0,"loads are waiting");
 for(const r of f.rows){
  assert.equal(r.state,"idle");
  assert.equal(r.hauling,false);
  assert.equal(r.job,null);
  assert.equal(r.reserved,0,"no fabricated reservation");
  assert.equal(r.onboard,0,"no fabricated cargo");
  assert.equal(r.resource,null);
  assert.equal(r.etaSeconds,null);
 }
 assert.equal(f.totals.reserved,0);
 assert.equal(f.totals.onboard,0);
});

test("fleet wiring: progress and ETA are exact sim-field derivations mid-route",()=>{
 const g=scrapGame();
 tickUntil(g,()=>{const j=truck(g,1).job;return j?.phase==="toDest"&&j.segment>=1&&j.progress>0.05;});
 const v=truck(g,1),j=v.job;
 const r=row(fleetState(g),1);
 const expectedProgress=(j.segment+j.progress)/(j.route.length-1);
 const rem=(j.route.length-1)-(j.segment+j.progress);
 const speed=(v.speed||2.1)*(g.research.includes("fleet")?1.18:1);
 assert.ok(Math.abs(r.progress-expectedProgress)<1e-12,"progress = (segment+progress)/(route-1)");
 assert.ok(Math.abs(r.remainingCells-rem)<1e-12);
 assert.ok(Math.abs(r.etaSeconds-rem/speed)<1e-12,"ETA = remaining cells / effective speed");
 assert.equal(r.reserved,0,"toDest leg carries onboard, not reserved");
 assert.equal(r.onboard,j.amount);
 assert.equal(r.routeCells,j.route.length);
});

test("fleet wiring: bay queue ties break deterministically by vehicle id",()=>{
 // Two DIFFERENT sources (dispatch never double-books one source+resource):
 // salvager scrap + furnace steel, both destined for the depot bay.
 const g=freightGame({inventories:{1:{scrap:12},4:{steel:12}}});
 tickUntil(g,()=>g.vehicles.filter(v=>v.job?.phase==="toSource").length>=2);
 const haulers=g.vehicles.filter(v=>v.job?.phase==="toSource");
 assert.equal(haulers.length,2);
 assert.ok(haulers.every(v=>v.job.destId===2),"both deliver to the depot");
 // Fixture-only: give both jobs the SAME delivery leg and equalize remaining
 // pickup distance, so the depot-queue sort MUST fall through to the
 // vehicle-id tie-break (segment stays a valid route index, routes in bounds).
 const sharedDest=haulers[0].job.toDest.map(p=>({x:p.x,z:p.z}));
 haulers.forEach(v=>{v.job.toDest=sharedDest.map(p=>({x:p.x,z:p.z}));});
 const lens=haulers.map(v=>v.job.toSource.length);
 const R=Math.min(...lens)-1;
 assert.ok(R>=1);
 haulers.forEach(v=>{v.job.segment=v.job.toSource.length-1-R;v.job.progress=0;});
 const f=fleetState(g);
 const depot=f.bays.find(b=>b.id===2);
 assert.ok(depot,"depot bay exists");
 const deliveries=depot.queue.filter(q=>q.role==="delivery");
 assert.equal(deliveries.length,2);
 assert.equal(deliveries[0].remainingCells,deliveries[1].remainingCells,"forced tie");
 assert.ok(deliveries[0].vehicleId<deliveries[1].vehicleId,"tie broken by vehicle id");
 // And the pickup bays still order by the sim's remaining-route metric.
 for(const bay of f.bays){
  for(let i=1;i<bay.queue.length;i++){
   const a=bay.queue[i-1],b=bay.queue[i];
   assert.ok(a.remainingCells<b.remainingCells||(a.remainingCells===b.remainingCells&&a.vehicleId<b.vehicleId),
    "queue ordered by remaining cells, ties by vehicle id");
  }
 }
});

test("fleet wiring: follow camera keeps pinning the moving truck and preserves pose every frame",()=>{
 const g=scrapGame();
 tickUntil(g,()=>truck(g,1).job?.phase==="toDest");
 const viewport={width:390,height:844}; // phone sheet geometry
 const focus=fleetFocusPixel(viewport);
 let cam={...ISO_CAM};
 const positions=[];
 for(let i=0;i<12;i++){
  advanceGame(g,0.1);
  const v=truck(g,1);
  positions.push({x:v.x,z:v.z});
  cam=followTarget(cam,v,viewport,focus);
  assert.equal(cam.yaw,45,"yaw invariant (#307)");
  assert.equal(cam.elevation,35.264,"elevation invariant (#307)");
  assert.equal(cam.zoom,ISO_CAM.zoom,"zoom invariant (#307)");
  const back=groundAtScreen(cam,focus,viewport),ground=truckGround(v);
  assert.ok(Math.abs(back.x-ground.x)<1e-6,"truck stays pinned under the focus pixel");
  assert.ok(Math.abs(back.z-ground.z)<1e-6);
 }
 assert.ok(positions.some(p=>p.x!==positions[0].x||p.z!==positions[0].z),"the truck actually moved");
 assert.ok(cam.x!==ISO_CAM.x||cam.z!==ISO_CAM.z,"the camera target actually moved");
});

test("fleet wiring NEGATIVE: build lock is truthful, frozen and surfaced by the read model",()=>{
 const f=fleetState(createGame());
 assert.equal(f.buildLock.available,false);
 assert.ok(f.buildLock.reason.length>20,"a real reason is shown, not a bare disable");
 assert.equal(f.buildLock,FLEET_BUILD_LOCK);
 assert.ok(Object.isFrozen(FLEET_BUILD_LOCK));
 assert.throws(()=>{FLEET_BUILD_LOCK.available=true;},TypeError);
});