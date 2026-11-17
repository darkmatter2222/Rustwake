// UX-05 (#363): fleet logistics panel read-model acceptance tests.
// The panel is a PURE projection of the authoritative simulation: every row
// value must equal the sim's own job fields, and a disabled vehicle (job
// stripped by cancel / route-severance return / save reconcile, or an
// inconsistent job/cargo pair) must NEVER be shown as hauling. Fixtures mirror
// tests/freight.test.mjs: frozen power, explicit inventories, fixed seed 4073,
// exact conservation cross-checked against freightTotals every tick.
import test from "node:test";
import assert from "node:assert/strict";
import {
 createGame,readGame,persist,advanceGame,cancelFreight,reconcileFreight,
 freightTotals,key,snapshot
} from "../src/simulation.js";
import {SAVE_KEY,INITIAL_BANK,BLUEPRINTS,CELL,WORLD_SIZE} from "../src/content.js";
import {
 fleetState,truckAt,truckGround,followTarget,fleetFocusPixel,fleetSheetRect,
 TRUCK_TAP_RADIUS_CELLS,FLEET_SETTINGS_KEY,FLEET_DEFAULTS,
 readFleetSettings,writeFleetSettings
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
function storageStub(){
 const m=new Map();
 return {getItem:k=>(m.has(k)?m.get(k):null),setItem:(k,v)=>m.set(k,String(v)),
  removeItem:k=>m.delete(k),has:k=>m.has(k),map:m};
}
const ISO_CAM=Object.freeze({yaw:45,elevation:35.264,zoom:1.15,x:0,z:0});

test("fleet: loading state without a game",()=>{
 assert.deepStrictEqual(fleetState(null),{kind:"loading"});
 assert.deepStrictEqual(fleetState(undefined),{kind:"loading"});
});

test("fleet: fresh yard is idle, never hauling, and the read model never mutates the sim",()=>{
 const g=createGame();
 const before=JSON.stringify(g);
 const f=fleetState(g);
 assert.equal(f.kind,"ready");
 assert.equal(f.rows.length,3);
 assert.equal(f.empty,false);
 for(const r of f.rows){
  assert.equal(r.state,"idle");
  assert.equal(r.hauling,false);
  assert.equal(r.job,null);
  assert.equal(r.reserved,0);
  assert.equal(r.onboard,0);
  assert.equal(r.cancel.allowed,false);
  assert.equal(r.cancel.code,"IDLE");
 }
 assert.equal(f.totals.trucks,3);
 assert.equal(f.totals.active,0);
 assert.equal(f.totals.hauling,0);
 assert.equal(JSON.stringify(g),before,"fleetState must be a pure read");
});

test("fleet: empty fleet is an explicit empty state, not an error",()=>{
 const g=createGame();g.vehicles=[];
 const f=fleetState(g);
 assert.equal(f.kind,"ready");
 assert.equal(f.empty,true);
 assert.deepStrictEqual(f.rows,[]);
 assert.equal(f.totals.trucks,0);
 assert.equal(f.buildLock.available,false);
 assert.ok(f.buildLock.reason.includes("#280"));
});

test("fleet: reserved row mirrors the simulation job fields exactly",()=>{
 const g=scrapGame();
 advanceGame(g,0.1);
 const v=truck(g,1),j=v.job;
 assert.equal(j.phase,"toSource");
 const f=fleetState(g),r=row(f,1);
 assert.equal(r.state,"pickup");
 assert.equal(r.hauling,false,"a reservation is not yet hauling");
 assert.equal(r.reserved,j.amount);
 assert.equal(r.reserved,12);
 assert.equal(r.onboard,0);
 assert.equal(r.job.sourceId,j.sourceId);
 assert.equal(r.job.destId,j.destId);
 assert.equal(r.job.resource,j.resource);
 assert.equal(r.job.amount,j.amount);
 assert.equal(r.job.phase,j.phase);
 assert.equal(r.job.segment,j.segment);
 assert.equal(r.job.progress,j.progress);
 assert.deepStrictEqual(r.job.route,j.route);
 assert.equal(r.job.toSourceLength,j.toSource.length);
 assert.equal(r.job.toDestLength,j.toDest.length);
 assert.equal(r.source.id,1);
 assert.equal(r.source.name,BLUEPRINTS.salvager.name);
 assert.equal(r.source.missing,false);
 assert.equal(r.dest.id,2);
 assert.equal(r.dest.name,BLUEPRINTS.depot.name);
 assert.equal(r.resource.unit,"SC");
 assert.equal(r.routeCells,j.route.length);
 assert.ok(r.progress>=0&&r.progress<=1);
 assert.ok(Number.isFinite(r.etaSeconds)&&r.etaSeconds>0);
 assert.equal(r.cancel.allowed,true);
 assert.equal(r.cancel.code,"OK");
 assert.equal(f.totals.reserved,freightTotals(g).reserved);
 assert.equal(f.totals.onboard,freightTotals(g).onboard);
});

test("fleet: hauling requires a validated toDest job AND matching onboard cargo",()=>{
 const g=scrapGame();
 tickUntil(g,()=>truck(g,1).job?.phase==="toDest");
 const v=truck(g,1);
 const f=fleetState(g),r=row(f,1);
 assert.equal(r.state,"hauling");
 assert.equal(r.hauling,true);
 assert.equal(r.onboard,12);
 assert.equal(r.reserved,0,"reserved and onboard hold the SAME units — never summed");
 assert.deepStrictEqual({resource:r.job.resource,amount:r.onboard},v.cargo);
 assert.equal(f.totals.hauling,1);
 assert.equal(f.totals.reserved,freightTotals(g).reserved);
 assert.equal(f.totals.onboard,freightTotals(g).onboard);
});

test("fleet: loading-at-bay state is derived from the sim's own pickup position",()=>{
 const g=scrapGame();
 advanceGame(g,0.1);
 const v=truck(g,1);
 // Construct the exact instant before pickupCargo: at the last route cell.
 v.job.segment=v.job.route.length-1;v.job.progress=0;
 const r=row(fleetState(g),1);
 assert.equal(r.state,"loading");
 assert.equal(r.hauling,false);
 assert.equal(r.reserved,12);
 assert.equal(r.onboard,0);
 // The real transition then moves the SAME units onboard (no duplication).
 advanceGame(g,0.1);
 assert.equal(truck(g,1).job.phase,"toDest");
 assert.equal(row(fleetState(g),1).state,"hauling");
 assert.equal(freightTotals(g).reserved,0);
 assert.equal(freightTotals(g).onboard,12);
});

test("fleet NEGATIVE: cancelled mid-haul truck is idle, never hauling",()=>{
 const g=scrapGame();
 tickUntil(g,()=>truck(g,1).job?.phase==="toDest");
 assert.equal(row(fleetState(g),1).hauling,true);
 const res=cancelFreight(g,1);
 assert.equal(res.ok,true);
 assert.equal(res.amount,12);
 const r=row(fleetState(g),1);
 assert.equal(r.hauling,false,"disabled vehicle must not render as hauling");
 assert.equal(r.state,"idle");
 assert.equal(r.job,null);
 assert.equal(r.onboard,0);
 assert.equal(r.reserved,0);
 assert.equal(r.cancel.allowed,false);
 assert.equal(r.cancel.code,"IDLE");
 assert.equal(building(g,1).inventory.scrap,12,"units returned exactly once");
 assert.equal(cancelFreight(g,1).code,"IDLE","second cancel is a no-op");
 assert.equal(cancelFreight(g,999).code,"MISSING");
});

test("fleet NEGATIVE: cancelled reservation returns to source and reads idle",()=>{
 const g=scrapGame();
 advanceGame(g,0.1);
 assert.equal(row(fleetState(g),1).state,"pickup");
 assert.equal(cancelFreight(g,1).ok,true);
 const r=row(fleetState(g),1);
 assert.equal(r.hauling,false);
 assert.equal(r.state,"idle");
 assert.equal(r.reserved,0);
 assert.equal(building(g,1).inventory.scrap,12);
 assert.equal(freightTotals(g).reserved,0);
});

test("fleet NEGATIVE: severed route reads blocked (not hauling), then the sim returns the freight",()=>{
 const g=scrapGame();
 tickUntil(g,()=>truck(g,1).job?.phase==="toDest");
 const v=truck(g,1);
 const cell=v.job.route[Math.min(1,v.job.route.length-1)];
 g.roads=g.roads.filter(k=>k!==key(cell.x,cell.z));
 const blocked=row(fleetState(g),1);
 assert.equal(blocked.state,"blocked");
 assert.equal(blocked.hauling,false,"a truck on a severed route is never hauling");
 assert.equal(blocked.stuck.code,"ROUTE_BLOCKED");
 assert.equal(blocked.onboard,12,"cargo still physically onboard until the sim returns it");
 advanceGame(g,0.1); // moveVehicle guard returns the freight
 const after=row(fleetState(g),1);
 assert.equal(after.hauling,false);
 assert.equal(after.job,null);
 assert.equal(after.onboard,0);
 assert.equal(building(g,1).inventory.scrap,12,"returned exactly once");
 assert.equal(freightTotals(g).onboard,0);
});

test("fleet NEGATIVE: vanished source reads SOURCE_MISSING blocked, never hauling",()=>{
 const g=scrapGame();
 advanceGame(g,0.1);
 g.buildings=g.buildings.filter(b=>b.id!==1);
 const r=row(fleetState(g),1);
 assert.equal(r.state,"blocked");
 assert.equal(r.hauling,false);
 assert.equal(r.stuck.code,"SOURCE_MISSING");
 assert.equal(r.source.missing,true);
 advanceGame(g,0.1);
 assert.equal(truck(g,1).job,null);
 assert.equal(row(fleetState(g),1).hauling,false);
 assert.equal(g.bank.scrap,12,"orphaned reservation falls back to the bank");
});

test("fleet NEGATIVE: vanished destination reads DEST_MISSING blocked, never hauling",()=>{
 const g=scrapGame();
 tickUntil(g,()=>truck(g,1).job?.phase==="toDest");
 g.buildings=g.buildings.filter(b=>b.id!==2);
 const r=row(fleetState(g),1);
 assert.equal(r.state,"blocked");
 assert.equal(r.hauling,false);
 assert.equal(r.stuck.code,"DEST_MISSING");
 assert.equal(r.dest.missing,true);
});

// The four reconcileFreight repair cases, constructed deterministically. Each
// must surface as an explicit ERROR row — never as hauling — and the codes
// must match what the simulation's own save repair records.
function corruptPair(mutate){
 const g=scrapGame();
 tickUntil(g,()=>truck(g,1).job?.phase==="toDest");
 mutate(truck(g,1));
 return g;
}
test("fleet NEGATIVE: cargo without a job is JOB_MISSING error, never hauling",()=>{
 const g=corruptPair(v=>{v.job=null;});
 const r=row(fleetState(g),1);
 assert.equal(r.state,"error");
 assert.equal(r.hauling,false);
 assert.equal(r.stuck.code,"JOB_MISSING");
 const repair=snapshot(g);reconcileFreight(repair);
 assert.equal(repair.vehicles[0].job,null);
 assert.equal(repair.vehicles[0].cargo,null);
 assert.equal(repair.bank.scrap,12,"jobless cargo returns to the bank, exactly once");
});
test("fleet NEGATIVE: cargo with a toSource reservation is PHASE_STALE error, never hauling",()=>{
 const g=corruptPair(v=>{v.job.phase="toSource";v.job.route=v.job.toSource;v.job.segment=0;v.job.progress=0;});
 const r=row(fleetState(g),1);
 assert.equal(r.state,"error");
 assert.equal(r.hauling,false);
 assert.equal(r.stuck.code,"PHASE_STALE");
 const repair=snapshot(g);reconcileFreight(repair);
 const e=repair.freightLedger.findLast(x=>x.kind==="reconcile");
 assert.equal(e.reason,"PHASE_STALE","panel code matches the sim repair ledger");
});
test("fleet NEGATIVE: cargo amount mismatch is CARGO_MISMATCH error, never hauling",()=>{
 const g=corruptPair(v=>{v.cargo={resource:"scrap",amount:7};});
 const r=row(fleetState(g),1);
 assert.equal(r.state,"error");
 assert.equal(r.hauling,false);
 assert.equal(r.stuck.code,"CARGO_MISMATCH");
 const repair=snapshot(g);reconcileFreight(repair);
 assert.equal(repair.freightLedger.findLast(x=>x.kind==="reconcile").reason,"CARGO_MISMATCH");
});
test("fleet NEGATIVE: toDest job without cargo is CARGO_MISSING error, never hauling",()=>{
 const g=corruptPair(v=>{v.cargo=null;});
 const r=row(fleetState(g),1);
 assert.equal(r.state,"error");
 assert.equal(r.hauling,false);
 assert.equal(r.stuck.code,"CARGO_MISSING");
 const repair=snapshot(g);reconcileFreight(repair);
 assert.equal(repair.freightLedger.findLast(x=>x.kind==="reconcile").reason,"CARGO_MISSING");
 assert.equal(repair.buildings.find(b=>b.id===1).inventory.scrap,12);
});
test("fleet NEGATIVE: structurally invalid job is JOB_INVALID error and the sim strips it",()=>{
 const g=scrapGame();
 advanceGame(g,0.1);
 truck(g,1).job.route=[];
 const r=row(fleetState(g),1);
 assert.equal(r.state,"error");
 assert.equal(r.hauling,false);
 assert.equal(r.stuck.code,"JOB_INVALID");
 const repair=snapshot(g);reconcileFreight(repair);
 assert.equal(repair.vehicles[0].job,null,"reconcile strips exactly what the panel flags");
});

test("fleet NEGATIVE: a corrupt save reloads reconciled — the loaded truck reads idle, not hauling",()=>{
 const store=storageStub();
 const prev=globalThis.localStorage;
 globalThis.localStorage=store;
 try{
  const g=corruptPair(v=>{v.job.phase="toSource";v.job.route=v.job.toSource;});
  assert.equal(persist(g),true);
  const loaded=readGame();
  const v=truck(loaded,1);
  assert.equal(v.job,null,"readGame reconciles before the panel ever sees it");
  assert.equal(v.cargo,null);
  const r=row(fleetState(loaded),1);
  assert.equal(r.hauling,false);
  assert.equal(r.state,"idle");
  assert.equal(building(loaded,1).inventory.scrap,12);
 }finally{globalThis.localStorage=prev;}
});

test("fleet: idle truck with waiting loads but no connected asphalt reads NO_ROUTE + unaffordable hint",()=>{
 const g=freightGame({inventories:{1:{scrap:12}}});
 g.roads=["11,10"]; // isolated patch under truck 1; salvager has no frontage
 truck(g,2).x=0;truck(g,2).z=0;truck(g,3).x=23;truck(g,3).z=23; // off any road
 const f=fleetState(g);
 assert.equal(f.waiting.length,1);
 assert.equal(f.waiting[0].sourceId,1);
 assert.equal(f.waiting[0].amount,12);
 const r=row(f,1);
 assert.equal(r.state,"noroute");
 assert.equal(r.hauling,false);
 assert.equal(r.stuck.code,"NO_ROUTE");
 assert.equal(r.waitingLoads,1);
 assert.equal(r.unaffordable,true,"bank has 0 stone — a road segment costs 3 AG + 4 CR");
 g.bank.stone=30;g.bank.credits=40;
 assert.equal(row(fleetState(g),1).unaffordable,false);
 // Trucks 2/3 are off the isolated patch: honest NO_FRONTAGE, not a fake job.
 assert.equal(row(f,2).stuck.code,"NO_FRONTAGE");
 assert.equal(row(f,3).stuck.code,"NO_FRONTAGE");
});

test("fleet: bay queues mirror sim jobs, ordered by remaining route cells",()=>{
 const g=freightGame({bank:{credits:1800,iron:90,fuel:60}});
 advanceGame(g,0.1);
 const j1=truck(g,1).job,j2=truck(g,2).job;
 assert.ok(j1&&j2,"two inbound loads dispatched");
 assert.equal(j1.destId,4);assert.equal(j2.destId,4);
 const f=fleetState(g);
 const furnace=f.bays.find(b=>b.id===4);
 assert.ok(furnace,"processing machine bay is listed");
 assert.equal(furnace.name,BLUEPRINTS.furnace.name);
 assert.equal(furnace.queue.length,2);
 for(let i=1;i<furnace.queue.length;i++)
  assert.ok(furnace.queue[i-1].remainingCells<=furnace.queue[i].remainingCells,"queue sorted by sim route metric");
 for(const q of furnace.queue){
  const j=truck(g,q.vehicleId).job;
  assert.equal(q.role,"delivery","inbound loads queue as future deliveries at the furnace bay");
  assert.equal(q.amount,j.amount);
  assert.equal(q.resource,j.resource);
  const remSource=(j.toSource.length-1)-(j.segment+j.progress);
  const rem=j.toDest.length-1+remSource;
  assert.ok(Math.abs(q.remainingCells-rem)<1e-9,"queue ETA equals the sim's own remaining cells");
 }
 const depot=f.bays.find(b=>b.id===2);
 assert.equal(depot.queue.length,2);
 assert.ok(depot.queue.every(q=>q.role==="pickup"),"trucks first approach the depot pickup bay");
 assert.equal(f.totals.active,2);
 assert.equal(row(f,3).state,"idle");
});

test("fleet: totals mirror freightTotals across multi-carrier ticks without mutating the sim",()=>{
 const g=freightGame({bank:{credits:1800,iron:90,fuel:60},inventories:{1:{scrap:12}}});
 for(let i=0;i<60;i++){
  advanceGame(g,0.1);
  const before=JSON.stringify(g);
  const f=fleetState(g),t=freightTotals(g);
  assert.equal(f.totals.reserved,t.reserved);
  assert.equal(f.totals.onboard,t.onboard);
  assert.equal(f.totals.hauling,g.vehicles.filter(v=>v.job?.phase==="toDest"&&v.cargo).length);
  for(const r of f.rows){
   if(r.hauling)assert.ok(r.job&&r.onboard>0,"hauling always has a validated load");
   if(r.state==="error"||r.state==="blocked")assert.equal(r.hauling,false);
  }
  assert.equal(JSON.stringify(g),before,"pure read at every tick");
 }
});

test("fleet: ETA uses the sim speed formula including the fleet research bonus",()=>{
 const g=scrapGame();
 advanceGame(g,0.1);
 const v=truck(g,1);
 const rem=(v.job.route.length-1)-(v.job.segment+v.job.progress);
 const r0=row(fleetState(g),1);
 assert.ok(Math.abs(r0.etaSeconds-rem/v.speed)<1e-9);
 g.research.push("fleet");
 const r1=row(fleetState(g),1);
 assert.ok(Math.abs(r1.etaSeconds-rem/(v.speed*1.18))<1e-9,"moveVehicle speed formula mirrored");
});

test("fleet: truckAt hits the tapped truck within radius and misses empty ground",()=>{
 const g=createGame();
 assert.equal(truckAt(g,11,10),1);
 assert.equal(truckAt(g,11+TRUCK_TAP_RADIUS_CELLS-0.01,10),1);
 assert.equal(truckAt(g,11+TRUCK_TAP_RADIUS_CELLS+0.05,10),null);
 assert.equal(truckAt(g,12.5,10),null);
 assert.equal(truckAt(g,0,0),null);
 assert.equal(truckAt(null,11,10),null);
});

test("fleet: followTarget pins the truck's real world position and preserves the isometric pose",()=>{
 const g=scrapGame();
 tickUntil(g,()=>truck(g,1).job?.phase==="toDest");
 const v=truck(g,1);
 const viewport={width:1440,height:900};
 const focus=fleetFocusPixel(viewport);
 const cam={...ISO_CAM};
 const next=followTarget(cam,v,viewport,focus);
 const ground=truckGround(v);
 assert.ok(Math.abs(ground.x-(v.x-WORLD_SIZE/2+.5)*CELL)<1e-12);
 assert.ok(Math.abs(ground.z-(v.z-WORLD_SIZE/2+.5)*CELL)<1e-12);
 const back=groundAtScreen(next,focus,viewport);
 assert.ok(Math.abs(back.x-ground.x)<1e-6,"round-trip pins the truck under the focus pixel");
 assert.ok(Math.abs(back.z-ground.z)<1e-6);
 assert.equal(next.yaw,cam.yaw,"yaw preserved (#307)");
 assert.equal(next.elevation,cam.elevation,"elevation preserved (#307)");
 assert.equal(next.zoom,cam.zoom,"zoom preserved (#307)");
 assert.deepStrictEqual(cam,ISO_CAM,"input camera never mutated");
});

test("fleet: focus pixel stays in the clear world zone on desktop, phone and landscape",()=>{
 for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:844,height:390}]){
  const p=fleetFocusPixel(viewport),sheet=fleetSheetRect(viewport);
  assert.ok(p.x>0&&p.x<viewport.width&&p.y>0&&p.y<viewport.height);
  const clear=p.x<sheet.x-20||p.x>sheet.x+sheet.width+20||p.y<sheet.y-20||p.y>sheet.y+sheet.height+20;
  assert.ok(clear,"focus pixel must not sit under the fleet sheet "+JSON.stringify({viewport,p,sheet}));
 }
 // Phone portrait: above the expanded sheet top.
 const phone={width:390,height:844};
 assert.ok(fleetFocusPixel(phone).y<fleetSheetRect(phone).y);
});

test("fleet: settings persist under their own key, sanitize garbage, and never touch sibling panels",()=>{
 const store=storageStub();
 assert.deepStrictEqual(readFleetSettings(store),{...FLEET_DEFAULTS});
 assert.deepStrictEqual(readFleetSettings(null),{...FLEET_DEFAULTS});
 store.setItem(FLEET_SETTINGS_KEY,"{not json");
 assert.deepStrictEqual(readFleetSettings(store),{...FLEET_DEFAULTS});
 store.setItem(FLEET_SETTINGS_KEY,JSON.stringify({showIdle:"yes",followCam:7,extra:1}));
 assert.deepStrictEqual(readFleetSettings(store),{...FLEET_DEFAULTS});
 const next=writeFleetSettings(store,{showIdle:false});
 assert.deepStrictEqual(next,{showIdle:false,followCam:true});
 assert.deepStrictEqual(readFleetSettings(store),{showIdle:false,followCam:true});
 writeFleetSettings(store,{followCam:false});
 assert.deepStrictEqual(readFleetSettings(store),{showIdle:false,followCam:false});
 assert.equal(store.has("rustwake:v2:ux-settings"),false);
 assert.equal(store.has("rustwake:v2:strip-settings"),false);
 assert.equal(store.has("rustwake:v2:dock-settings"),false);
 assert.equal(store.has(SAVE_KEY),false,"preferences never write the player save");
 const throwing={getItem(){throw new Error("denied");},setItem(){throw new Error("denied");}};
 assert.deepStrictEqual(readFleetSettings(throwing),{...FLEET_DEFAULTS});
 assert.deepStrictEqual(writeFleetSettings(throwing,{showIdle:false}),{showIdle:false,followCam:true});
});
