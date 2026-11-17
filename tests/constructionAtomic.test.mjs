// BLD-04 (#373): atomic, idempotent construction commit acceptance tests.
// Preview (checkSite) stays pure; buildAt is a one-shot validated transaction:
// spend + building + stats + ledger land together or roll back exactly. A
// repeated command id replays the original outcome with zero further spend,
// even at different coordinates or after save/reload. Refunds read durable
// per-building paid provenance (b.paid), never the evictable 64-row ledger nor
// a rebalanced blueprint price. Conservation is measured across bank +
// inventories + committed construction + freight reserved/onboard, with exact
// salvage-loss numbers. Fixed seed 4073; power frozen where production would
// mask a leak (same fixture discipline as tests/freight.test.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {
 createGame,readGame,persist,snapshot,buildAt,cancelConstruction,removeBuilding,
 advanceGame,sell,checkSite,buildingAt,footprintCells,footprintDims,bayCells,
 worldFootprint,normalizeRot,committedTotals,freightTotals,__setConstructionFault
} from "../src/simulation.js";
import {BLUEPRINTS,INITIAL_BANK,SAVE_KEY,CELL,WORLD_SIZE} from "../src/content.js";

const COST=BLUEPRINTS.salvager.cost;            // {credits:180,scrap:28,stone:12}
const SALVAGE_REFUND={credits:72,scrap:11,stone:4}; // floor(40%) of COST
const SALVAGE_LOSS={credits:108,scrap:17,stone:8};  // COST - SALVAGE_REFUND
const ZERO_BANK=Object.fromEntries(Object.keys(INITIAL_BANK).map(k=>[k,0]));
const clone=(x)=>JSON.parse(JSON.stringify(x));
const store=()=>{const m=new Map();globalThis.localStorage={getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};return m;};

// Frozen-power fixture: the starter generator is removed so powerStatus supply
// is 0 and no production can mask a leak (assembly itself is power-independent,
// simulation.js advanceGame). Starter inventories cleared, explicit bank. With
// no iron/fuel in the bank the dispatcher has no resupply candidate, so freight
// stays idle and every measurement — including committedTotals — is exact.
function atomicGame(bank={credits:1000,scrap:100,stone:100}){
 const g=createGame();
 assert.equal(g.seed,4073);
 g.buildings=g.buildings.filter(b=>b.id!==3);
 for(const b of g.buildings)b.inventory={};
 g.bank={...ZERO_BANK,...bank};
 return g;
}
// Grand conservation measure: physical freight ledgers (bank + inventories +
// reserved + onboard, counted once) PLUS committed construction (paid cost of
// assembling buildings). The two measurements stay distinct — committed units
// already left the bank and are never double-counted as physical stock.
function grandTotals(g){
 const t={...freightTotals(g).totals};
 for(const [id,n] of Object.entries(committedTotals(g)))t[id]=(t[id]||0)+n;
 return t;
}
function legalSite(g,type,rot=0){
 for(let z=1;z<WORLD_SIZE-1;z++)for(let x=1;x<WORLD_SIZE-1;x++)
  if(checkSite(g,type,x,z,rot).ok)return {x,z};
 throw Error("no legal site for "+type+" rot "+rot);
}
const delta=(after,before,keys)=>Object.fromEntries(keys.map(k=>[k,(after[k]||0)-(before[k]||0)]));

test("atomic: preview is pure; commit revalidates and spends exactly once with paid provenance",()=>{
 const g=atomicGame();
 const site=legalSite(g,"salvager");
 const before=snapshot(g);
 const preview=checkSite(g,"salvager",site.x,site.z,0);
 assert.equal(preview.ok,true);
 assert.deepEqual(snapshot(g),before,"preview must not mutate anything");
 const bankBefore={...g.bank},buildsBefore=g.stats.builds;
 const r=buildAt(g,"salvager",site.x,site.z,0);
 assert.equal(r.ok,true);assert.equal(r.code,"OK");
 assert.deepEqual(delta(g.bank,bankBefore,["credits","scrap","stone"]),{credits:-180,scrap:-28,stone:-12});
 assert.equal(g.buildings.length,before.buildings.length+1);
 assert.equal(g.stats.builds,buildsBefore+1);
 assert.deepEqual(r.building.paid,COST,"building carries durable paid provenance");
 const e=g.ledger.at(-1);
 assert.equal(e.kind,"build");assert.deepEqual(e.cost,COST);assert.deepEqual(e.refund,{});
 assert.equal(e.buildingId,r.building.id);
 // The committed cost is measured once as committed construction, and the
 // physical freight totals exclude it (units already left the bank).
 assert.deepEqual(committedTotals(g),COST);
 assert.equal(freightTotals(g).totals.credits,1000-180);
});

test("atomic: injected failure between spend and push rolls back EVERYTHING (legacy loss 180/28/12 vs fixed 0)",()=>{
 const g=atomicGame();
 const site=legalSite(g,"salvager");
 const before=snapshot(g);
 // Legacy counterfactual, reproduced exactly: the pre-#373 code spent first,
 // then constructed. A throw between spend and push destroyed the materials.
 const legacy=snapshot(g);
 for(const [id,n] of Object.entries(COST))legacy.bank[id]=Math.max(0,(legacy.bank[id]||0)-n);
 try{throw Error("legacy fault between spend and push");}catch{}
 assert.deepEqual(delta(legacy.bank,before.bank,["credits","scrap","stone"]),{credits:-180,scrap:-28,stone:-12},"legacy: materials destroyed, no building");
 assert.equal(legacy.buildings.length,before.buildings.length);
 // Fixed transaction: the same injected throw leaves state byte-identical.
 __setConstructionFault((phase)=>{if(phase==="afterSpend")throw Error("injected commit fault");});
 try{
  assert.throws(()=>buildAt(g,"salvager",site.x,site.z,0,"fault-1"),/injected commit fault/);
 }finally{__setConstructionFault(null);}
 assert.deepEqual(snapshot(g),before,"bank/buildings/stats/ledger/log/nextId/commands exactly as before");
 assert.deepEqual(delta(g.bank,before.bank,["credits","scrap","stone"]),{credits:0,scrap:0,stone:0},"fixed: zero loss");
 // The aborted command id is retryable: no outcome was recorded for a throw.
 const retry=buildAt(g,"salvager",site.x,site.z,0,"fault-1");
 assert.equal(retry.ok,true);
 assert.deepEqual(delta(g.bank,before.bank,["credits","scrap","stone"]),{credits:-180,scrap:-28,stone:-12});
});

test("atomic: faults beforePush/afterPush/afterLedger roll back; capped rings restore evicted heads",()=>{
 for(const phase of ["beforePush","afterPush","afterLedger"]){
  const g=atomicGame();
  // Fill the capped rings so the commit's push EVICTS their head entries;
  // rollback must restore contents, not just lengths.
  for(let i=0;i<64;i++)assert.equal(buildAt(g,"salvager",3,3).code,"FRONTAGE");
  assert.equal(g.ledger.length,64);
  while(g.log.length<32)g.log.push({id:900+g.log.length,time:0,message:"pad"});
  g.log.length=32;
  const site=legalSite(g,"salvager");
  const before=snapshot(g);
  __setConstructionFault((p)=>{if(p===phase)throw Error("fault at "+phase);});
  try{assert.throws(()=>buildAt(g,"salvager",site.x,site.z,0,"ring-"+phase),/fault at/);}
  finally{__setConstructionFault(null);}
  assert.deepEqual(snapshot(g),before,"rollback at "+phase+" must restore evicted ring heads and counters");
  assert.equal(g.buildings.some(b=>b.x===site.x&&b.z===site.z),false,"no ghost building at "+phase);
 }
});

test("idempotent: duplicate command id at DIFFERENT coordinates replays the original outcome, spends nothing",()=>{
 const g=atomicGame({credits:2000,scrap:200,stone:200});
 const a=legalSite(g,"salvager");
 const first=buildAt(g,"salvager",a.x,a.z,0,"cmd-373");
 assert.equal(first.ok,true);
 // Find a second, different legal site (the first is now occupied).
 const b=legalSite(g,"salvager");
 assert.notDeepEqual(b,a);
 const bankAfterFirst={...g.bank},count=g.buildings.length,ledgerLen=g.ledger.length,builds=g.stats.builds,logLen=g.log.length;
 // Legacy counterfactual: with no command concept the second delivery builds
 // again — 2 buildings, double charge {credits:-360,scrap:-56,stone:-24}.
 const dup=buildAt(g,"salvager",b.x,b.z,0,"cmd-373");
 assert.equal(dup.ok,true);assert.equal(dup.duplicate,true);assert.equal(dup.code,"OK");
 assert.equal(dup.building.id,first.building.id,"replay returns the ORIGINAL building");
 assert.equal(g.buildings.length,count,"exactly one building, not two");
 assert.deepEqual(g.bank,bankAfterFirst,"zero further spend");
 assert.deepEqual(delta(g.bank,{credits:2000,scrap:200,stone:200},["credits","scrap","stone"]),{credits:-180,scrap:-28,stone:-12},"single charge 180/28/12, not legacy 360/56/24");
 assert.equal(g.ledger.length,ledgerLen,"no second ledger row");
 assert.equal(g.stats.builds,builds);assert.equal(g.log.length,logLen);
 // A THIRD delivery with a fresh id at the same different site is a real new
  // command: it builds (proving the replay guard is per-id, not a global freeze).
 const fresh=buildAt(g,"salvager",b.x,b.z,0,"cmd-373-b");
 assert.equal(fresh.ok,true);assert.notEqual(fresh.duplicate,true);
 assert.equal(g.buildings.length,count+1);
});

test("idempotent: command replay survives save/reload; plain duplicate click still COLLISION with zero spend",()=>{
 const m=store();
 const g=atomicGame();
 const a=legalSite(g,"salvager");
 const first=buildAt(g,"salvager",a.x,a.z,0,"cmd-reload");
 assert.equal(first.ok,true);
 persist(g);
 const loaded=readGame();
 assert.equal(loaded.notices.length,0,"fresh save, no offline catch-up");
 const bankBefore={...loaded.bank},count=loaded.buildings.length;
 const b=legalSite(loaded,"salvager");
 const dup=buildAt(loaded,"salvager",b.x,b.z,0,"cmd-reload");
 assert.equal(dup.ok,true);assert.equal(dup.duplicate,true);
 assert.equal(dup.building.id,first.building.id);
 assert.deepEqual(loaded.bank,bankBefore);assert.equal(loaded.buildings.length,count);
 // Plain clicks (no command id): same-cell duplicate is refused by COLLISION
 // with zero spend — the pre-#373 incidental guard still holds.
 const plain=buildAt(loaded,"salvager",a.x,a.z,0);
 assert.equal(plain.ok,false);assert.equal(plain.code,"COLLISION");
 assert.deepEqual(loaded.bank,bankBefore);
 // Concurrent commands: two DIFFERENT ids aimed at one cell — only one wins.
 const c=legalSite(loaded,"salvager");
 const w1=buildAt(loaded,"salvager",c.x,c.z,0,"race-1");
 const bankMid={...loaded.bank};
 const w2=buildAt(loaded,"salvager",c.x,c.z,0,"race-2");
 assert.equal(w1.ok,true);assert.equal(w2.ok,false);assert.equal(w2.code,"COLLISION");
 assert.deepEqual(loaded.bank,bankMid,"loser of the race spends nothing");
 assert.equal(loaded.buildings.filter(x=>x.x===c.x&&x.z===c.z).length,1);
 delete globalThis.localStorage;
});

test("idempotent: a rejected command id replays its rejection even at a later-valid site",()=>{
 const g=atomicGame();
 const bad=buildAt(g,"salvager",3,3,0,"cmd-reject"); // FRONTAGE
 assert.equal(bad.ok,false);assert.equal(bad.code,"FRONTAGE");
 const bankBefore={...g.bank},count=g.buildings.length;
 const site=legalSite(g,"salvager");
 const replay=buildAt(g,"salvager",site.x,site.z,0,"cmd-reject");
 assert.equal(replay.ok,false);assert.equal(replay.duplicate,true);
 assert.equal(replay.code,"FRONTAGE");assert.equal(replay.reason,bad.reason);
 assert.deepEqual(g.bank,bankBefore);assert.equal(g.buildings.length,count);
 assert.equal(g.ledger.filter(e=>e.commandId==="cmd-reject").length,1,"one reject row, not two");
});

test("stale bank: a preview computed against an older bank can never overspend at commit",()=>{
 // Interleaved advanceGame: the dispatcher legitimately takes bank iron between
 // preview and commit; buildAt revalidates FUNDS against the CURRENT bank.
 const g=createGame();
 g.bank.iron=24; // exactly the furnace iron cost
 g.buildings.find(b=>b.id===4).inventory={};
 const site=legalSite(g,"furnace");
 assert.equal(checkSite(g,"furnace",site.x,site.z,0).ok,true,"preview affordable at iron 24");
 advanceGame(g,0.5);
 assert.equal(g.bank.iron,9,"dispatcher reserved 15 iron for the starving starter furnace");
 const count=g.buildings.length,bankNow={...g.bank};
 const r=buildAt(g,"furnace",site.x,site.z,0,"stale-1");
 assert.equal(r.ok,false);assert.equal(r.code,"FUNDS");
 assert.deepEqual(g.bank,bankNow,"rejected stale commit spends nothing");
 assert.equal(g.buildings.length,count);
 assert.ok(g.bank.iron>=0,"no clamp-masked overspend");
 // Explicit concurrent drain via a real sell transaction between preview/commit.
 const g2=createGame();
 const site2=legalSite(g2,"furnace");
 assert.equal(checkSite(g2,"furnace",site2.x,site2.z,0).ok,true);
 assert.equal(sell(g2,"iron",80).ok,true); // bank iron 90 -> 10 < 24
 const bank2={...g2.bank},count2=g2.buildings.length;
 const r2=buildAt(g2,"furnace",site2.x,site2.z,0,"stale-2");
 assert.equal(r2.ok,false);assert.equal(r2.code,"FUNDS");
 assert.deepEqual(g2.bank,bank2);assert.equal(g2.buildings.length,count2);
});

test("refunds: cancel/salvage pay the RECORDED paid cost, durable across ledger eviction and reload",()=>{
 const m=store();
 const g=atomicGame();
 const site=legalSite(g,"salvager");
 const r=buildAt(g,"salvager",site.x,site.z,0,"prov-1");
 assert.equal(r.ok,true);
 // A different paid provenance (same cost keys, rebalanced amounts): refunds
 // must follow what was PAID, not the current blueprint price.
 r.building.paid={credits:100,scrap:20,stone:10};
 // Evict the build row: 70 real reject transactions push the 64-row cap.
 for(let i=0;i<70;i++)buildAt(g,"salvager",3,3);
 assert.equal(g.ledger.some(e=>e.kind==="build"&&e.buildingId===r.building.id),false,"build row evicted");
 persist(g);
 const loaded=readGame();
 const bankBefore={...loaded.bank};
 const c=cancelConstruction(loaded,r.building.id);
 assert.equal(c.ok,true);
 assert.deepEqual(c.refund,{credits:100,scrap:20,stone:10},"refund follows paid provenance, not blueprint cost");
 assert.deepEqual(delta(loaded.bank,bankBefore,["credits","scrap","stone"]),{credits:100,scrap:20,stone:10});
 const e=loaded.ledger.at(-1);
 assert.equal(e.kind,"cancel");assert.deepEqual(e.refund,{credits:100,scrap:20,stone:10});
 // Salvage provenance: floor(40%) of PAID, plus 100% of inventory.
 const g2=atomicGame();
 const site2=legalSite(g2,"salvager");
 const r2=buildAt(g2,"salvager",site2.x,site2.z,0,"prov-2");
 r2.building.paid={credits:100,scrap:20,stone:10};
 advanceGame(g2,5); // assembly completes (power frozen: no production)
 assert.equal(r2.building.remaining<=0,true);
 r2.building.inventory={scrap:7};
 const bank2={...g2.bank};
 const s=removeBuilding(g2,r2.building.id);
 assert.equal(s.ok,true);
 assert.deepEqual(s.refund,{credits:40,scrap:15,stone:4},"floor(40% of paid) + full inventory");
 assert.deepEqual(delta(g2.bank,bank2,["credits","scrap","stone"]),{credits:40,scrap:15,stone:4});
 delete globalThis.localStorage;
});

test("refunds: legacy saves without paid fall back safely; tampered paid never mints stock",()=>{
 const m=store();
 const g=atomicGame();
 const site=legalSite(g,"salvager");
 const r=buildAt(g,"salvager",site.x,site.z,0);
 // Legacy v2 building: no paid field at all.
 const legacy=clone(g);
 delete legacy.buildings.find(b=>b.id===r.building.id).paid;
 legacy.lastSavedAt=Date.now();
 m.set(SAVE_KEY,JSON.stringify(legacy));
 const loaded=readGame();
 const lb=loaded.buildings.find(b=>b.id===r.building.id);
 assert.deepEqual(lb.paid,COST,"readGame normalizes durable paid onto legacy buildings");
 const bankBefore={...loaded.bank};
 const c=cancelConstruction(loaded,r.building.id);
 assert.deepEqual(c.refund,COST,"legacy fallback refunds the blueprint cost exactly");
 assert.deepEqual(delta(loaded.bank,bankBefore,["credits","scrap","stone"]),{credits:180,scrap:28,stone:12});
 // Tampered provenance: negative, NaN and extra-key payloads all fall back.
 for(const bad of [{credits:-5,scrap:28,stone:12},{credits:NaN,scrap:28,stone:12},{credits:180,scrap:28,stone:12,relics:999}]){
  const g2=atomicGame();
  const s2=legalSite(g2,"salvager");
  const r2=buildAt(g2,"salvager",s2.x,s2.z,0);
  r2.building.paid=bad;
  const before={...g2.bank};
  const c2=cancelConstruction(g2,r2.building.id);
  assert.deepEqual(c2.refund,COST,"tampered paid falls back to blueprint cost");
  assert.deepEqual(delta(g2.bank,before,["credits","scrap","stone"]),{credits:180,scrap:28,stone:12});
  assert.equal(g2.bank.relics,0,"no fabricated prestige mint");
 }
 delete globalThis.localStorage;
});

test("conservation: build->cancel->rebuild->salvage->reload conserves the grand ledger with exact salvage loss",()=>{
 const m=store();
 const g=atomicGame(); // bank {credits:1000,scrap:100,stone:100}, freight idle
 const base=grandTotals(g);
 assert.deepEqual(base,{credits:1000,scrap:100,stone:100});
 const site=legalSite(g,"salvager");
 // BUILD: bank -cost, committed +cost -> grand total unchanged.
 const r1=buildAt(g,"salvager",site.x,site.z,0,"cons-1");
 assert.equal(r1.ok,true);
 assert.deepEqual(grandTotals(g),base);
 assert.deepEqual(committedTotals(g),COST);
 assert.deepEqual(g.bank,{...ZERO_BANK,credits:820,scrap:72,stone:88});
 // CANCEL (the required failed/canceled transaction case): exact full refund.
 const bankPre={...g.bank};
 const c=cancelConstruction(g,r1.building.id);
 assert.equal(c.ok,true);assert.deepEqual(c.refund,COST);
 assert.deepEqual(grandTotals(g),base);
 assert.deepEqual(committedTotals(g),{});
 assert.deepEqual(g.bank,{...ZERO_BANK,credits:1000,scrap:100,stone:100},"bank restored to exact pre-build state");
 // Replaying the canceled command id does NOT resurrect the building.
 const replay=buildAt(g,"salvager",site.x,site.z,0,"cons-1");
 assert.equal(replay.ok,true);assert.equal(replay.duplicate,true);assert.equal(replay.building,null);
 assert.deepEqual(g.bank,{...ZERO_BANK,credits:1000,scrap:100,stone:100});
 // REBUILD under a fresh command id: one new building, one charge.
 const r2=buildAt(g,"salvager",site.x,site.z,0,"cons-2");
 assert.equal(r2.ok,true);assert.equal(r2.duplicate,undefined);
 assert.deepEqual(grandTotals(g),base);
 // Complete assembly through real ticks (power frozen -> zero production).
 // Completion converts committed materials into sunk machine capital: the
 // grand material ledger drops by EXACTLY the paid cost (audited, not leaked).
 advanceGame(g,5);
 assert.equal(r2.building.remaining<=0,true);
 assert.deepEqual(committedTotals(g),{},"completed machines hold no committed cost");
 assert.deepEqual(grandTotals(g),{credits:820,scrap:72,stone:88},"completion sinks exactly the paid cost");
 // SALVAGE: exactly floor(40%) returns; the unrecovered 60% is the audited loss.
 const s=removeBuilding(g,r2.building.id);
 assert.equal(s.ok,true);assert.deepEqual(s.refund,SALVAGE_REFUND);
 const afterSalvage=grandTotals(g);
 assert.deepEqual(delta(afterSalvage,base,["credits","scrap","stone"]),{credits:-108,scrap:-17,stone:-8},"exact salvage loss, nothing else");
 assert.deepEqual(g.bank,{...ZERO_BANK,credits:892,scrap:83,stone:92});
 const salvageRow=g.ledger.at(-1);
 assert.equal(salvageRow.kind,"salvage");assert.deepEqual(salvageRow.refund,SALVAGE_REFUND);
 // RELOAD: provenance, registry and totals survive the round-trip exactly.
 persist(g);
 const loaded=readGame();
 assert.equal(loaded.notices.length,0);
 assert.deepEqual(grandTotals(loaded),afterSalvage);
 assert.deepEqual(loaded.bank,g.bank);
 assert.deepEqual(loaded.commands,g.commands);
 assert.deepEqual(loaded.ledger,g.ledger);
 delete globalThis.localStorage;
});

test("footprint: nonsquare crane commits the exact cells/bay/pivot for all four rotations",()=>{
 const g=atomicGame({credits:6000,steel:300,gears:100,scrap:200,stone:200});
 assert.deepEqual(BLUEPRINTS.crane.footprint,{w:2,d:3},"nonsquare 2x3 fixture");
 for(let rot=0;rot<4;rot++){
  const site=legalSite(g,"crane",rot);
  const r=buildAt(g,"crane",site.x,site.z,rot,"fp-"+rot);
  assert.equal(r.ok,true,r.reason);
  const b=r.building;
  assert.equal(b.rot,normalizeRot(rot));
  const dims=footprintDims("crane",rot);
  assert.deepEqual(dims,rot%2===1?{w:3,d:2}:{w:2,d:3},"odd quarter turns swap w/d");
  const cells=footprintCells("crane",site.x,site.z,rot);
  assert.equal(cells.length,6);
  for(const c of cells)assert.equal(buildingAt(g,c.x,c.z)?.id,b.id,"committed building occupies exactly its footprint cells");
  // One cell beyond each extent must NOT belong to this building.
  const outside=[{x:site.x+dims.w,z:site.z},{x:site.x,z:site.z+dims.d},{x:site.x-1,z:site.z},{x:site.x,z:site.z-1}];
  for(const c of outside)if(c.x>=0&&c.z>=0)assert.notEqual(buildingAt(g,c.x,c.z)?.id,b.id);
  const bay=bayCells("crane",site.x,site.z,rot);
  assert.equal(bay.length,rot%2===1?dims.d:dims.w,"bay spans the facing edge width");
  const facing=[[0,1],[1,0],[0,-1],[-1,0]][rot];
  for(const c of bay){
   const onEdge=facing[1]!==0?(c.z===site.z+(facing[1]>0?dims.d:-1)):(c.x===site.x+(facing[0]>0?dims.w:-1));
   assert.ok(onEdge,"bay sits just outside the facing edge");
  }
  // Exact 3D pivot/AABB from the pure renderer contract (CELL=3.5, center 12).
  const fp=worldFootprint("crane",site.x,site.z,rot);
  const ox=(site.x-WORLD_SIZE/2+.5)*CELL,oz=(site.z-WORLD_SIZE/2+.5)*CELL;
  assert.equal(fp.rotationY,rot*Math.PI/2);
  assert.deepEqual(fp.pivot,{x:ox+(dims.w-1)*CELL/2,y:0,z:oz+(dims.d-1)*CELL/2});
  assert.deepEqual(fp.min,{x:ox-CELL/2,y:0,z:oz-CELL/2});
  assert.deepEqual(fp.max,{x:ox+(dims.w-1)*CELL+CELL/2,y:0,z:oz+(dims.d-1)*CELL+CELL/2});
  assert.deepEqual(fp.size,{x:dims.w*CELL,z:dims.d*CELL});
  assert.deepEqual(fp.base,{w:2,d:3},"local geometry stays authored at base dims");
 }
 assert.equal(g.buildings.filter(b=>b.type==="crane"&&b.id>6).length,4);
});

test("registry: command outcomes are capped at 128 and sanitized on reload",()=>{
 const m=store();
 const g=atomicGame({credits:1e6,scrap:1e6,stone:1e6});
 // 130 distinct rejected commands (cheap, no buildings) exercise the ring cap.
 for(let i=0;i<130;i++)assert.equal(buildAt(g,"salvager",3,3,0,"cap-"+i).ok,false);
 assert.equal(g.commands.length,128);
 assert.equal(g.commands[0].id,"cap-2","oldest outcomes evicted first");
 // Evicted ids are no longer protected — a bounded, documented registry.
 assert.equal(buildAt(g,"salvager",3,3,0,"cap-0").duplicate,undefined);
 persist(g);
 const loaded=readGame();
 assert.equal(loaded.commands.length,128);
 const replay=buildAt(loaded,"salvager",3,3,0,"cap-129");
 assert.equal(replay.duplicate,true);
 // Malformed registry entries drop on reload; valid ones survive.
 const tampered=clone(loaded);
 tampered.commands.push(null,{id:7},{ok:true},42,{id:"valid-extra",ok:false,code:"FUNDS",reason:"x"});
 tampered.lastSavedAt=Date.now();
 m.set(SAVE_KEY,JSON.stringify(tampered));
 const clean=readGame();
 assert.equal(clean.commands.length,128,"reload re-applies the 128 cap after filtering junk");
 assert.equal(clean.commands.at(-1).id,"valid-extra");
 delete globalThis.localStorage;
});

test("fixture: saved-state fixture replays through the public API and round-trips provenance",()=>{
 const path=fileURLToPath(new URL("./fixtures/save-v2-atomic.json",import.meta.url));
 const fixture=JSON.parse(readFileSync(path,"utf8"));
 assert.equal(fixture.version,2);assert.equal(fixture.seed,4073);
 // Replay the fixture's real construction history through the public API.
 const replay=createGame();
 const r1=buildAt(replay,"salvager",6,7,0,"fixture-build-1");
 assert.equal(r1.ok,true);
 const r2=buildAt(replay,"salvager",6,7,0,"fixture-reject-1");
 assert.equal(r2.ok,false);assert.equal(r2.code,"COLLISION");
 assert.deepEqual(fixture.bank,replay.bank,"fixture bank conserved by real API replay");
 assert.deepEqual(fixture.ledger,replay.ledger);
 assert.deepEqual(fixture.commands,replay.commands);
 assert.equal(fixture.buildings.length,7);
 const built=fixture.buildings.find(b=>b.id===r1.building.id);
 assert.deepEqual(built.paid,COST);assert.equal(built.remaining,5);
 // Load through readGame with a fresh timestamp (no offline advance).
 const m=store();
 m.set(SAVE_KEY,JSON.stringify({...fixture,lastSavedAt:Date.now()}));
 const loaded=readGame();
 assert.deepEqual(loaded.bank,replay.bank);
 assert.deepEqual(loaded.ledger,replay.ledger);
 assert.deepEqual(loaded.commands,replay.commands);
 assert.deepEqual(loaded.buildings.find(b=>b.id===built.id).paid,COST);
 // Duplicate delivery of the fixture's committed command: zero spend, no build.
 const bankBefore={...loaded.bank},count=loaded.buildings.length;
 const dup=buildAt(loaded,"salvager",11,2,0,"fixture-build-1");
 assert.equal(dup.ok,true);assert.equal(dup.duplicate,true);
 assert.equal(dup.building.id,built.id);
 assert.deepEqual(loaded.bank,bankBefore);assert.equal(loaded.buildings.length,count);
 // Cancel refunds the fixture's recorded paid cost exactly: the bank returns
 // to the full pre-build starting bank (fixture.bank + paid cost).
 const c=cancelConstruction(loaded,built.id);
 assert.equal(c.ok,true);assert.deepEqual(c.refund,COST);
 assert.deepEqual(loaded.bank,createGame().bank,"full refund restores the starting bank");
 delete globalThis.localStorage;
});

test("measurement: committedTotals counts assembling paid cost once, excludes completed, isn't freight",()=>{
 const g=atomicGame();
 assert.deepEqual(committedTotals(g),{});
 const site=legalSite(g,"salvager");
 const r=buildAt(g,"salvager",site.x,site.z,0,"measure-1");
 assert.deepEqual(committedTotals(g),COST);
 const ft=freightTotals(g);
 assert.equal(ft.reserved,0);assert.equal(ft.onboard,0);
 assert.equal(ft.totals.credits,820,"freight totals never include committed cost");
 advanceGame(g,5);
 assert.deepEqual(committedTotals(g),{},"completed assembly releases the commitment into sunk capital");
 assert.deepEqual(grandTotals(g),{credits:820,scrap:72,stone:88});
});
