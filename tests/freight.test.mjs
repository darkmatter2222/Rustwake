// LOG-04 (#384): freight ledger acceptance tests.
// Four DISTINCT ledgers — source stock, reserved load, onboard cargo, destination
// stock — with validated reserve/pickup/arrive transitions, exact per-resource
// conservation at EVERY tick, cancel/blockage/reload repair without duplication.
// Power is frozen (generator never completes) so production/consumption cannot
// mask a freight leak; every measurement below is exact, fixed-seed (4073).
import test from "node:test";
import assert from "node:assert/strict";
import {
 createGame,readGame,persist,advanceGame,buildAt,cancelFreight,reconcileFreight,
 freightTotals,freightManifest,key
} from "../src/simulation.js";
import {SAVE_KEY,INITIAL_BANK} from "../src/content.js";

const truck=(g,id)=>g.vehicles.find(v=>v.id===id);
const building=(g,id)=>g.buildings.find(b=>b.id===id);
const entries=(g,kind)=>g.freightLedger.filter(e=>e.kind===kind);

// Deterministic fixture: frozen power, explicit inventories and bank. Starter
// furnace stock is cleared so the only units in the world are the ones we place.
// Real saves always carry every bank key (readGame merges defaults under missing
// keys), so fixtures zero materials explicitly instead of deleting keys.
const ZERO_BANK=Object.fromEntries(Object.keys(INITIAL_BANK).map(k=>[k,0]));
function freightGame({bank={credits:1800},inventories={}}={}){
 const g=createGame();
 assert.equal(g.seed,4073);
 building(g,3).remaining=1e9; // generator never completes -> supply 0, demand 5
 for(const b of g.buildings)b.inventory={...(inventories[b.id]||{})};
 g.bank={...ZERO_BANK,...bank};
 assert.equal(g.freightLedger.length,0);
 return g;
}
// Exact-measurement fixtures run a SINGLE truck: with idle siblings, the
// dispatcher would re-reserve delivered stock inside the same tick and blur the
// instant a transition lands. Multi-carrier behavior is covered separately.
const solo=g=>{g.vehicles=g.vehicles.slice(0,1);return g;};
const scrapGame=()=>solo(freightGame({inventories:{1:{scrap:12}}}));
const ironGame=()=>solo(freightGame({bank:{credits:1800,iron:90}}));

// Advance in small steps, asserting exact conservation of every resource total
// after each step, until pred holds. Small steps let us observe the instant a
// transition lands, before the dispatcher re-assigns the now-idle truck.
function tickUntil(g,pred,base,{step=0.1,max=6000,invariant=true}={}){
 for(let i=0;i<max;i++){
  advanceGame(g,step);
  assert.deepStrictEqual(freightTotals(g).totals,base,"freight totals must be conserved every tick");
  if(invariant)for(const v of g.vehicles){
   if(v.cargo&&v.job)assert.equal(v.job.phase,"toDest","onboard cargo must never coexist with a reservation");
   if(v.cargo&&v.job)assert.equal(v.cargo.amount,v.job.amount,"cargo must match the validated job");
  }
  if(pred(g))return i+1;
 }
 throw new Error("tickUntil: predicate never met within "+max+" steps");
}

test("freight: reserve moves exact units source->reserved, not onboard",()=>{
 const g=freightGame({inventories:{1:{scrap:12}}});
 const base=freightTotals(g).totals;
 assert.deepStrictEqual(base,{credits:1800,scrap:12});
 advanceGame(g,0.1);
 const v=truck(g,1);
 assert.equal(building(g,1).inventory.scrap,0,"source stock debited exactly once");
 assert.equal(v.job.phase,"toSource");
 assert.equal(v.job.amount,12);
 assert.equal(v.cargo,null,"reserved units are NOT yet onboard");
 assert.equal(g.bank.scrap??0,0);
 const r=entries(g,"reserve");
 assert.equal(r.length,1);
 assert.equal(r[0].resource,"scrap");
 assert.equal(r[0].amount,12);
 assert.equal(r[0].sourceId,1);
 assert.equal(r[0].destId,2);
 const t=freightTotals(g);
 assert.equal(t.reserved,12);
 assert.equal(t.onboard,0);
 assert.deepStrictEqual(t.totals,base);
 // Only one truck may hold a reservation on the same source+resource.
 assert.equal(truck(g,2).job,null);
 assert.equal(truck(g,3).job,null);
});

test("freight: full scrap lifecycle reserve->pickup->arrive with exact ledger deltas",()=>{
 const g=scrapGame();
 const base=freightTotals(g).totals;
 tickUntil(g,()=>truck(g,1).job?.phase==="toSource",base);
 tickUntil(g,()=>truck(g,1).job?.phase==="toDest",base);
 const v=truck(g,1);
 assert.deepStrictEqual(v.cargo,{resource:"scrap",amount:12});
 assert.equal(building(g,1).inventory.scrap,0);
 assert.equal(freightTotals(g).reserved,0,"reservation consumed at pickup");
 assert.equal(freightTotals(g).onboard,12);
 const p=entries(g,"pickup");
 assert.equal(p.length,1);
 assert.equal(p[0].amount,12);
 tickUntil(g,()=>truck(g,1).job===null,base);
 assert.equal(v.cargo,null);
 assert.equal(g.bank.scrap,12,"destination (depot=bank) credited exactly once");
 assert.equal(building(g,1).inventory.scrap,0);
 const a=entries(g,"arrive");
 assert.equal(a.length,1);
 assert.equal(a[0].amount,12);
 assert.equal(a[0].destId,2);
 assert.ok(g.stats.delivered>=12);
 assert.ok(g.stats.shipments>=1);
 assert.deepStrictEqual(freightTotals(g).totals,base);
 assert.deepStrictEqual(entries(g,"reserve").map(e=>e.amount),[12]);
 assert.deepStrictEqual(entries(g,"pickup").map(e=>e.amount),[12]);
 assert.deepStrictEqual(entries(g,"arrive").map(e=>e.amount),[12]);
});

test("freight: depot->furnace iron delivery credits destination inventory, not bank",()=>{
 const g=ironGame();
 const base=freightTotals(g).totals;
 assert.deepStrictEqual(base,{credits:1800,iron:90});
 tickUntil(g,()=>truck(g,1).job?.phase==="toSource",base);
 const v=truck(g,1);
 assert.equal(v.job.sourceId,2);
 assert.equal(v.job.destId,4);
 assert.equal(v.job.amount,15);
 assert.equal(g.bank.iron,75,"bank debited at reserve");
 tickUntil(g,()=>truck(g,1).job?.phase==="toDest",base);
 assert.deepStrictEqual(v.cargo,{resource:"iron",amount:15});
 assert.equal(g.bank.iron,75);
 tickUntil(g,()=>truck(g,1).job===null,base);
 assert.equal(building(g,4).inventory.iron,15,"furnace stock credited, bank untouched");
 assert.equal(g.bank.iron,75);
 assert.equal(entries(g,"arrive")[0].amount,15);
 assert.deepStrictEqual(freightTotals(g).totals,base);
});

test("freight: severed route mid-haul returns onboard cargo to source exactly once",()=>{
 const g=scrapGame();
 const base=freightTotals(g).totals;
 tickUntil(g,()=>{const j=truck(g,1).job;return j?.phase==="toDest"&&j.segment<j.route.length-2;},base);
 const v=truck(g,1);
 const cell=v.job.route[v.job.segment+1];
 g.roads=g.roads.filter(k=>k!==key(cell.x,cell.z));
 advanceGame(g,0.1);
 assert.equal(v.job,null);
 assert.equal(v.cargo,null);
 assert.equal(building(g,1).inventory.scrap,12,"onboard units returned to source, not duplicated");
 const r=entries(g,"return");
 assert.equal(r.length,1);
 assert.equal(r[0].reason,"ROUTE_BLOCKED");
 assert.equal(r[0].amount,12);
 assert.deepStrictEqual(freightTotals(g).totals,base);
 // Repair the road: the load is re-reserved once and delivered once. No dupes.
 g.roads.push(key(cell.x,cell.z));
 tickUntil(g,()=>entries(g,"arrive").some(e=>e.amount===12),base);
 assert.equal(g.bank.scrap,12);
 assert.equal(entries(g,"arrive").filter(e=>e.amount===12).length,1);
 assert.equal(entries(g,"reserve").length,2,"original reservation + one re-dispatch");
 assert.deepStrictEqual(freightTotals(g).totals,base);
});

test("freight: severed route during toSource returns the reservation, not cargo",()=>{
 const g=scrapGame();
 const base=freightTotals(g).totals;
 advanceGame(g,0.1);
 const v=truck(g,1);
 assert.equal(v.job.phase,"toSource");
 const cell=v.job.route[v.job.segment+1];
 g.roads=g.roads.filter(k=>k!==key(cell.x,cell.z));
 advanceGame(g,0.1);
 assert.equal(v.job,null);
 assert.equal(v.cargo,null);
 assert.equal(building(g,1).inventory.scrap,12);
 assert.equal(entries(g,"return")[0].reason,"ROUTE_BLOCKED");
 assert.equal(entries(g,"pickup").length,0,"never picked up");
 assert.deepStrictEqual(freightTotals(g).totals,base);
});

test("freight: cancel returns reserved or onboard units once; second cancel is IDLE",()=>{
 const g=scrapGame();
 const base=freightTotals(g).totals;
 advanceGame(g,0.1);
 assert.equal(truck(g,1).job.phase,"toSource");
 const c1=cancelFreight(g,1);
 assert.deepStrictEqual(c1,{ok:true,code:"OK",resource:"scrap",amount:12});
 assert.equal(building(g,1).inventory.scrap,12);
 assert.equal(truck(g,1).job,null);
 assert.deepStrictEqual(cancelFreight(g,1),{ok:false,code:"IDLE",reason:"Truck has no freight to cancel"});
 assert.equal(entries(g,"return").filter(e=>e.reason==="CANCELLED").length,1);
 assert.deepStrictEqual(freightTotals(g).totals,base);
 // Restart after cancel: exactly one new reservation, one delivery, no dupes.
 tickUntil(g,()=>entries(g,"arrive").some(e=>e.amount===12),base);
 assert.equal(g.bank.scrap,12);
 assert.equal(entries(g,"reserve").length,2);
 assert.equal(entries(g,"arrive").length,1);
 // Cancel while onboard.
 const g2=scrapGame();
 const base2=freightTotals(g2).totals;
 tickUntil(g2,()=>truck(g2,1).job?.phase==="toDest",base2);
 const c2=cancelFreight(g2,1);
 assert.deepStrictEqual(c2,{ok:true,code:"OK",resource:"scrap",amount:12});
 assert.equal(building(g2,1).inventory.scrap,12,"onboard cargo returned to source");
 assert.equal(truck(g2,1).cargo,null);
 assert.deepStrictEqual(freightTotals(g2).totals,base2);
 assert.deepStrictEqual(cancelFreight(g2,999),{ok:false,code:"MISSING",reason:"No truck selected"});
});

test("freight: vanished source/destination return freight instead of teleporting it",()=>{
 const g=scrapGame();
 const base=freightTotals(g).totals;
 tickUntil(g,()=>truck(g,1).job?.phase==="toDest",base);
 g.buildings=g.buildings.filter(b=>b.id!==2); // depot gone mid-haul
 tickUntil(g,()=>truck(g,1).job===null,base);
 assert.equal(entries(g,"return")[0].reason,"DEST_MISSING");
 assert.equal(building(g,1).inventory.scrap,12,"load went back to source, not the bank");
 assert.equal(g.bank.scrap??0,0);
 assert.equal(entries(g,"arrive").length,0);
 assert.deepStrictEqual(freightTotals(g).totals,base);
 const g2=scrapGame();
 const base2=freightTotals(g2).totals;
 tickUntil(g2,()=>truck(g2,1).job?.phase==="toDest",base2);
 g2.buildings=g2.buildings.filter(b=>b.id!==1); // source gone mid-haul
 tickUntil(g2,()=>truck(g2,1).job===null,base2);
 assert.equal(entries(g2,"return")[0].reason,"SOURCE_MISSING");
 assert.equal(g2.bank.scrap,12,"orphaned load falls back to the bank exactly once");
 assert.deepStrictEqual(freightTotals(g2).totals,base2);
});

test("freight: arrival refuses cargo that does not match the validated job",()=>{
 const g=scrapGame();
 tickUntil(g,()=>truck(g,1).job?.phase==="toDest",freightTotals(g).totals);
 const v=truck(g,1);
 v.cargo.amount=7; // tampered load: job says 12, truck carries 7
 const base=freightTotals(g).totals; // conservation measured from the tampered state
 assert.equal(base.scrap,7);
 tickUntil(g,()=>v.job===null,base,{invariant:false});
 const r=entries(g,"return");
 assert.equal(r[0].reason,"ARRIVAL_INVALID");
 assert.equal(r[0].amount,7);
 assert.equal(building(g,1).inventory.scrap,7);
 assert.equal(entries(g,"arrive").length,0,"invalid arrival never credits destination");
 assert.deepStrictEqual(freightTotals(g).totals,base);
});

test("freight: save/reload round-trips cargo, phase, ledger and totals exactly",()=>{
 const store=new Map();
 globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
 const g=scrapGame();
 const base=freightTotals(g).totals;
 tickUntil(g,()=>{const j=truck(g,1).job;return j?.phase==="toDest"&&j.segment<j.route.length-2;},base);
 assert.equal(persist(g),true);
 const loaded=readGame();
 assert.deepStrictEqual(loaded.vehicles,g.vehicles,"cargo/phase/segment/progress survive reload");
 assert.deepStrictEqual(loaded.freightLedger,g.freightLedger);
 assert.deepStrictEqual(freightTotals(loaded).totals,base);
 assert.equal(loaded.notices.length,0,"fresh save must not trigger offline catch-up");
 // Reload after a completed delivery is equally exact.
 tickUntil(g,()=>entries(g,"arrive").length===1,base);
 persist(g);
 const after=readGame();
 assert.equal(after.bank.scrap,12);
 assert.deepStrictEqual(freightTotals(after).totals,base);
 assert.deepStrictEqual(after.freightLedger,g.freightLedger);
});

test("freight: corrupt saves reconcile to source once, never double-count",()=>{
 const store=new Map();
 globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
 const midHaul=()=>{
  const g=scrapGame();
  tickUntil(g,()=>{const j=truck(g,1).job;return j?.phase==="toDest"&&j.segment<j.route.length-2;},freightTotals(g).totals);
  return g;
 };
 // The mid-haul truth is 12 scrap onboard. A corrupt save may double-count it
 // (reserved AND onboard) or lose track of it; reload must restore exactly 12.
 const truth={credits:1800,scrap:12};
 const loadCorrupt=(mutate,expected=truth)=>{
  const g=midHaul();
  assert.deepStrictEqual(freightTotals(g).totals,truth);
  mutate(g);
  g.lastSavedAt=Date.now();
  store.set(SAVE_KEY,JSON.stringify(g));
  const loaded=readGame();
  assert.deepStrictEqual(freightTotals(loaded).totals,expected,"reconcile must restore the true unit count");
  return loaded;
 };
 // Cargo onboard but job still claims toSource -> PHASE_STALE, cargo to source.
 let l=loadCorrupt(g=>{const j=truck(g,1).job;j.phase="toSource";j.route=j.toSource;});
 assert.equal(truck(l,1).cargo,null);
 assert.equal(truck(l,1).job,null);
 assert.equal(building(l,1).inventory.scrap,12);
 assert.equal(entries(l,"reconcile")[0].reason,"PHASE_STALE");
 // Cargo with no job -> JOB_MISSING, cargo to bank.
 l=loadCorrupt(g=>{truck(g,1).job=null;});
 assert.equal(truck(l,1).cargo,null);
 assert.equal(l.bank.scrap,12);
 assert.equal(entries(l,"reconcile")[0].reason,"JOB_MISSING");
 // toDest job with missing cargo -> CARGO_MISSING, reservation to source.
 l=loadCorrupt(g=>{truck(g,1).cargo=null;});
 assert.equal(truck(l,1).job,null);
 assert.equal(building(l,1).inventory.scrap,12);
 assert.equal(entries(l,"reconcile")[0].reason,"CARGO_MISSING");
 // Cargo amount disagrees with job -> CARGO_MISMATCH, actual cargo to source.
 l=loadCorrupt(g=>{truck(g,1).cargo.amount=99;},{credits:1800,scrap:99});
 assert.equal(truck(l,1).cargo,null);
 assert.equal(building(l,1).inventory.scrap,99);
 assert.equal(entries(l,"reconcile")[0].reason,"CARGO_MISMATCH");
});

test("freight: reload fleet cap returns excess trucks' freight before dropping them",()=>{
 const store=new Map();
 globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
 const g=scrapGame();
 tickUntil(g,()=>{const j=truck(g,1).job;return j?.phase==="toDest"&&j.segment<j.route.length-2;},freightTotals(g).totals);
 const extra=JSON.parse(JSON.stringify(truck(g,1)));
 extra.id=13;extra.name="HAULER-13";
 for(let i=0;i<11;i++)g.vehicles.push({id:20+i,name:"PAD-"+i,x:11,z:10,speed:2,job:null,cargo:null,anim:0});
 g.vehicles.push(extra); // 13th truck carries freight and must be the one dropped
 const before=freightTotals(g).totals; // scrap 24: two identical onboard loads
 assert.equal(before.scrap,24);
 g.lastSavedAt=Date.now();
 store.set(SAVE_KEY,JSON.stringify(g));
 const l=readGame();
 assert.equal(l.vehicles.length,12);
 assert.equal(truck(l,13),undefined);
 assert.equal(building(l,1).inventory.scrap,12,"excess truck's cargo returned exactly once");
 assert.equal(truck(l,1).cargo.amount,12,"surviving truck keeps its own cargo");
 assert.equal(entries(l,"return").some(e=>e.reason==="FLEET_CAP"&&e.amount===12),true);
 assert.deepStrictEqual(freightTotals(l).totals,before);
});

test("freight: multi-carrier yard conserves every resource on every tick",()=>{
 const g=freightGame({bank:{credits:5000,scrap:28,stone:12,iron:40}});
 const built=buildAt(g,"salvager",6,7);
 assert.equal(built.ok,true,built.reason);
 built.building.remaining=0;
 built.building.inventory={scrap:20};
 building(g,1).inventory={scrap:12};
 const base=freightTotals(g).totals;
 assert.equal(base.scrap,32);
 assert.equal(base.iron,40);
 let sawReserved=false,sawOnboard=false,sawMulti=false;
 for(let i=0;i<400;i++){
  advanceGame(g,0.5);
  assert.deepStrictEqual(freightTotals(g).totals,base,"tick "+i+" leaked freight");
  const t=freightTotals(g);
  if(t.reserved>0)sawReserved=true;
  if(t.onboard>0)sawOnboard=true;
  if(g.vehicles.filter(v=>v.job).length>=2)sawMulti=true;
  for(const v of g.vehicles){
   if(v.cargo&&v.job){assert.equal(v.job.phase,"toDest");assert.equal(v.cargo.amount,v.job.amount);}
  }
 }
 assert.ok(sawReserved,"reserved ledger must be exercised");
 assert.ok(sawOnboard,"onboard ledger must be exercised");
 assert.ok(sawMulti,"at least two carriers must haul simultaneously");
 assert.ok(entries(g,"arrive").length>=2);
 assert.ok(g.stats.shipments>=2);
 assert.deepStrictEqual(freightTotals(g).totals,base);
});

test("freight: manifest exposes the four ledgers distinctly",()=>{
 const g=scrapGame();
 tickUntil(g,()=>truck(g,1).job?.phase==="toDest",freightTotals(g).totals);
 const m=freightManifest(g);
 assert.deepStrictEqual(m.bank,g.bank);
 assert.equal(m.buildings.length,g.buildings.length);
 const v1=m.vehicles.find(v=>v.id===1);
 assert.equal(v1.phase,"toDest");
 assert.equal(v1.reserved,null,"picked-up load is no longer reserved");
 assert.deepStrictEqual(v1.cargo,{resource:"scrap",amount:12});
 assert.equal(m.totals.onboard,12);
 assert.equal(m.totals.reserved,0);
 assert.equal(m.totals.totals.scrap,12);
 // reconcileFreight is idempotent on a consistent yard.
 const before=JSON.stringify(g.freightLedger);
 reconcileFreight(g);
 assert.equal(JSON.stringify(g.freightLedger),before);
});
