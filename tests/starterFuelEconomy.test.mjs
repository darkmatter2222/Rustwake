// #585 starter-fuel economy: the efficient (#575-guarded) furnace must survive
// the 660s zero-input window, and usable fuel must never strand below the old
// n*2 resupply multiple. Mechanism: the salvager crew recovers a diesel trickle
// (byproduct {fuel:1} per 3.6s cycle ≈ 0.28/s) straight to the depot bank —
// ~76% of one furnace's 2/5.5s burn, so the finite starter 110 funds the rest
// well past 660s while fuel stays NET-NEGATIVE (the tier-1 refinery remains the
// progression answer). Plus an emergency resupply top-up: when a buffer cannot
// fund one cycle (have<n) and the bank can (bank>=n), the bank's last units are
// delivered even below n*2 — a genuine halt leaves bank stock < per-cycle cost.
// Rollback controls at the pinned guard head 61070927: test 1 fails (no steel
// flow after ~t360, 0 late assigns, 0 recovered fuel) and test 2 fails (bank
// fuel 2 strands while the furnace halts at fuel 1). The gate file
// dispatchGate567.test.mjs is NOT touched; these are ADDITIVE economy bars.
import test from "node:test";
import assert from "node:assert/strict";
import {createGame,advanceGame,persist,readGame,freightTotals} from "../src/simulation.js";
import {BLUEPRINTS,INITIAL_BANK} from "../src/content.js";

const TOTAL=660,DT=0.5;

test("content contract: diesel is a crew byproduct, not a bay output; starter bank unchanged",()=>{
 assert.deepEqual(BLUEPRINTS.salvager.byproduct,{fuel:1},"salvager recovers 1 diesel per cycle");
 assert.ok(!("fuel" in BLUEPRINTS.salvager.outputs),
  "fuel must NOT be a bay output: it would add truck trips on the saturated fleet and change the starvation-alarm producer list (refinery remedy, issue 586)");
 assert.equal(INITIAL_BANK.fuel,110,"starter bank fuel is unchanged — no fixture supersession owed");
 assert.deepEqual(BLUEPRINTS.furnace.inputs,{iron:5,fuel:2},"furnace recipe is NOT throttled");
 assert.deepEqual(BLUEPRINTS.furnace.outputs,{steel:4},"furnace output is NOT throttled");
});

test("fresh untouched yard: recovered diesel sustains steel flow through all 660s of zero input",()=>{
 const g=createGame();
 const furnace=g.buildings.find(b=>b.type==="furnace");
 const depot=g.buildings.find(b=>b.type==="depot");
 const steelWindows=new Array(Math.ceil(TOTAL/60)).fill(0);
 let lastId=0,steelDelivered=0,lateSteelAssigns=0,feedstockPickups=0;
 for(let t=0;t<TOTAL;t+=DT){
  advanceGame(g,DT);
  for(const e of g.freightLedger){
   if(e.id<=lastId)continue;
   lastId=e.id;
   if(e.kind==="arrive"&&e.destId===depot.id&&e.resource==="steel"){
    steelDelivered+=e.amount;
    steelWindows[Math.min(steelWindows.length-1,Math.floor(e.time/60))]+=e.amount;
   }
   if(e.kind==="reserve"&&e.sourceId===furnace.id){
    if(e.resource==="iron"||e.resource==="fuel")feedstockPickups++;
    if(e.resource==="steel"&&e.time>TOTAL-120)lateSteelAssigns++;
   }
  }
 }
 // Efficiency win preserved (falsifier: late assigns bought by <228 steel or
  // by any feedstock pickup — that is starvation-limping again).
 assert.ok(steelDelivered>=228,`steel delivered ${steelDelivered} must be >= 228 (the #575 efficiency win)`);
 assert.equal(feedstockPickups,0,"the #575 guard still holds: zero furnace feedstock pickups");
 assert.ok(lateSteelAssigns>0,`steel assigns in the final 120s = ${lateSteelAssigns} (must be > 0)`);
 // Steel KEEPS flowing: every 60s window delivers steel (at the guard head the
 // windows after ~t360 are all zero — this is the non-vacuous rollback control).
 steelWindows.forEach((units,i)=>assert.ok(units>0,`steel flow dry in window t=${i*60}-${(i+1)*60}s (${units})`));
 // Fuel mass balance: initial 117 (bank 110 + furnace 7) + recovered = final
 // fuel in ALL ledgers + burned (2 per furnace cycle; 4 steel per cycle is the
 // only steel source, so cycles = total steel created / 4). Steel created is
 // measured via freightTotals so reserved/onboard steel counts too — bank +
 // bay alone would undercount cycles by the in-transit loads.
 const totalSteelCreated=(freightTotals(g).totals.steel||0)-INITIAL_BANK.steel;
 const cycles=totalSteelCreated/4;
 const finalFuel=freightTotals(g).totals.fuel||0;
 const recovered=finalFuel+2*cycles-(INITIAL_BANK.fuel+7);
 assert.ok(recovered>0,`recovered diesel must be > 0 (mass balance gives ${recovered}; guard head recovers 0)`);
 assert.ok(Math.abs(recovered-Math.floor(TOTAL/3.6))<=2,
  `recovered ${recovered} should track one diesel per salvager cycle (~${Math.floor(TOTAL/3.6)})`);
 // Net-negative balance: the trickle does NOT make fuel infinite — the refinery
 // stays the progression answer to a genuine long-run deficit.
 assert.ok(finalFuel<INITIAL_BANK.fuel+7,`total fuel ${finalFuel} must stay below the starter 117 (net-negative)`);
 assert.ok(finalFuel>0,"the yard never runs dry inside the window");
});

test("no stranded usable fuel: bank fuel 2 below the old n*2=4 threshold still reaches a halted furnace",()=>{
 const g=createGame();
 // Isolate the resupply rule: remove the salvager so no recovery trickle can
 // mask the stranding defect. Exactly the measured stranded state: bank 2,
 // furnace buffer 1 < 2/cycle.
 g.buildings=g.buildings.filter(b=>b.type!=="salvager");
 const furnace=g.buildings.find(b=>b.type==="furnace");
 const depot=g.buildings.find(b=>b.type==="depot");
 g.bank={...g.bank,fuel:2};
 furnace.inventory={iron:10,fuel:1};
 let lastId=0,resupply=null;
 for(let t=0;t<60;t+=DT){
  advanceGame(g,DT);
  for(const e of g.freightLedger){
   if(e.id<=lastId)continue;
   lastId=e.id;
   if(e.kind==="reserve"&&e.sourceId===depot.id&&e.destId===furnace.id&&e.resource==="fuel")resupply=e;
  }
  // Dynamic halt invariant: whenever the furnace cannot fund a fuel cycle and
  // no fuel is inbound, the bank must hold LESS than one cycle cost (2).
  const inbound=g.vehicles.some(v=>v.job&&v.job.destId===furnace.id&&v.job.resource==="fuel");
  if((furnace.inventory.fuel||0)<2&&!inbound)
   assert.ok((g.bank.fuel||0)<2,`halt at t=${g.elapsed}: bank fuel ${g.bank.fuel} >= cycle cost 2 while the furnace demands fuel (stranded)`);
 }
 assert.ok(resupply,"bank fuel 2 (>= cycle cost, < old n*2 threshold 4) must be delivered — guard head strands it");
 assert.equal(resupply.amount,2,"the emergency top-up delivers exactly the bank's usable 2 units");
 assert.ok(g.bank.steel>INITIAL_BANK.steel,"the rescued fuel was BURNED into steel, not parked");
 assert.ok((g.bank.fuel||0)<2,`final halt bank fuel ${g.bank.fuel} must be < per-cycle cost 2`);
 assert.ok((furnace.inventory.fuel||0)<2,"furnace buffer is genuinely below one cycle at the halt");
});

test("player saves preserved: a new-economy run roundtrips through persist/readGame with no wipe or schema break",()=>{
 const store=new Map();
 globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
 try{
  const g=createGame();
  advanceGame(g,120);
  assert.ok(g.bank.fuel>0&&g.bank.steel>INITIAL_BANK.steel,"run reached a live economy state");
  assert.ok(persist(g),"persist succeeds");
  const loaded=readGame();
  assert.equal(loaded.version,2,"schema version unchanged");
  assert.deepEqual(loaded.bank,g.bank,"bank (incl. recovered diesel) survives reload exactly");
  assert.deepEqual(loaded.buildings.map(b=>({id:b.id,type:b.type,inventory:b.inventory})),
   g.buildings.map(b=>({id:b.id,type:b.type,inventory:b.inventory})),"machine buffers survive reload exactly");
  assert.equal(loaded.elapsed,g.elapsed,"sim time survives reload");
  assert.deepEqual(loaded.stats,g.stats,"production/delivery stats survive reload");
  // Reload keeps the economy running: another 60s still produces steel.
  const steelBefore=loaded.bank.steel;
  advanceGame(loaded,60);
  assert.ok(loaded.bank.steel>steelBefore,"the reloaded yard keeps smelting");
 }finally{delete globalThis.localStorage;}
});