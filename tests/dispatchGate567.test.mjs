// #567 PRODUCT GATE BAR C-1..C-4 — ruling 6956801701 (PR #573) / 6956802181 (#567).
// Fresh untouched yard, 660 sim seconds, ZERO player input (the reachable state:
// createGame + advanceGame only, exactly like scripts/measure-567.mjs).
//   C-1: every producible output pair (salvager scrap/iron/copper, furnace steel)
//        is assigned > 0 times AND delivers > 0 units to the depot. Starvation
//        must not be relocated; any pair at zero => REWORK.
//   C-2: bank steel exceeds the starter 20 by t=120s; furnace bay bounded (no
//        monotonic freeze); storage-4 never latches on the untouched yard.
//   C-3: scrap deliveries continue throughout the run (> 0 in every 60s window).
//        A growing scrap backlog is acceptable ONLY while scrap flow > 0.
//   C-4: total delivered units is REPORTED honestly but is NOT a gate metric
//        (product ruled it a vanity metric: pre-fix 3352 was bought by starving
//        steel, the gating progression currency, plus feedstock waste trips).
// Per-pair units are tallied from the real freight ledger's `arrive` transitions
// (destId = depot), scanned incrementally because the ledger is capped at 128.
// A delivered pair was necessarily first-assignable at least once (assignJob only
// takes the first assignable candidate); the harness scripts/measure-567.mjs
// additionally reports the exact mirror first-assignable counts per pair.
// Rollback control: C-1 and C-2 FAIL on the pre-fix dispatcher (bank steel frozen
// at 20, zero steel deliveries, storage-4 latched from t=45). C-3 passes pre-fix
// by design (scrap was the insertion-order favorite). Imports only exports
// present in BOTH bases so the file runs as that control.
import test from "node:test";
import assert from "node:assert/strict";
import {createGame,advanceGame} from "../src/simulation.js";
import {alarmsState} from "../src/alarms.js";

const TOTAL=660,DT=0.5;
// Starter yard: salvager id 1 (scrap/iron/copper outputs), furnace id 4 (steel).
const OUTPUT_PAIRS=["1:scrap","1:iron","1:copper","4:steel"];

function gateRun(){
 const g=createGame();
 const depot=g.buildings.find(b=>b.type==="depot");
 const furnace=g.buildings.find(b=>b.type==="furnace");
 const delivered={},assigned={};
 const scrapBuckets=new Array(Math.ceil(TOTAL/60)).fill(0);
 let lastId=0,bankSteelAt120=null,storage4Ever=false;
 let maxFurnaceSteel=0,prevFurnaceSteel=0,sawDrain=false,lateSteelAssigns=0;
 for(let t=0;t<TOTAL;t+=DT){
  advanceGame(g,DT);
  for(const e of g.freightLedger){
   if(e.id<=lastId)continue;
   lastId=e.id;
   const k=e.sourceId+":"+e.resource;
   if(e.kind==="arrive"&&e.destId===depot.id){
    delivered[k]=(delivered[k]||0)+e.amount;
    if(e.resource==="scrap")scrapBuckets[Math.min(scrapBuckets.length-1,Math.floor(e.time/60))]+=e.amount;
   }
   if(e.kind==="reserve"&&e.sourceId!==depot.id){
    assigned[k]=(assigned[k]||0)+1;
    if(k==="4:steel"&&e.time>TOTAL-120)lateSteelAssigns++;
   }
  }
  if(bankSteelAt120===null&&g.elapsed>=120)bankSteelAt120=g.bank.steel||0;
  const fs=furnace.inventory?.steel||0;
  if(fs>maxFurnaceSteel)maxFurnaceSteel=fs;
  if(fs<prevFurnaceSteel)sawDrain=true;
  prevFurnaceSteel=fs;
  if(!storage4Ever&&(alarmsState(g).alarms||[]).some(a=>a.id==="storage-"+furnace.id))storage4Ever=true;
 }
 return {g,depot,furnace,delivered,assigned,scrapBuckets,bankSteelAt120,storage4Ever,
  maxFurnaceSteel,sawDrain,lateSteelAssigns,finalFurnaceSteel:prevFurnaceSteel};
}
let cached=null;
const run=()=>cached||(cached=gateRun());

test("C-1 gate: every output pair is assigned and delivers > 0 units (no relocated starvation)",()=>{
 const r=run();
 for(const pair of OUTPUT_PAIRS){
  const a=r.assigned[pair]||0,d=r.delivered[pair]||0;
  assert.ok(a>0,`C-1 REWORK: pair ${pair} was never assigned (first-assignable 0) — starvation relocated`);
  assert.ok(d>0,`C-1 REWORK: pair ${pair} delivered 0 units to the depot`);
 }
});

test("C-2 gate: bank steel > 20 by t=120s, furnace bay bounded and draining, storage-4 never latches",()=>{
 const r=run();
 assert.ok(r.bankSteelAt120>20,
  `C-2 REWORK: bank steel at t=120s is ${r.bankSteelAt120} (must exceed the starter 20; pre-fix froze at 20)`);
 assert.ok(r.maxFurnaceSteel<60,
  `C-2 REWORK: furnace bay peaked at ${r.maxFurnaceSteel} (pre-fix monotonic pile to 228)`);
 assert.ok(r.sawDrain,"C-2 REWORK: furnace bay never drained (monotonic freeze)");
 assert.ok(r.lateSteelAssigns>0,
  "C-2 REWORK: no steel assigned in the final 120s — bay frozen like the pre-fix fuel-exhaustion plateau");
 assert.equal(r.storage4Ever,false,"C-2 REWORK: storage-4 latched on the untouched yard (pre-fix fired from t=45)");
});

test("C-3 gate: scrap flow > 0 in every 60s window of the 660s run (backlog growth only tolerated while flowing)",()=>{
 const r=run();
 r.scrapBuckets.forEach((units,i)=>{
  assert.ok(units>0,`C-3 REWORK: zero scrap deliveries in window t=${i*60}-${(i+1)*60}s — new hard block`);
 });
});

test("C-4 report-only: total delivered units is disclosed, never gated (product vanity-metric ruling)",()=>{
 const r=run();
 // REPORT, not a gate: no magnitude assertion on totals is permitted by the ruling.
 console.log(`[C-4 report] total delivered=${r.g.stats.delivered} shipments=${r.g.stats.shipments} `+
  `per-pair delivered=${JSON.stringify(r.delivered)} scrap backlog=${r.g.buildings.find(b=>b.id===1).inventory?.scrap||0} `+
  `bank steel final=${r.g.bank.steel} furnace steel final=${r.finalFurnaceSteel}`);
 assert.ok(Number.isFinite(r.g.stats.delivered),"totals are reported as finite numbers");
});
