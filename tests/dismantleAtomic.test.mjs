// BLD-08 (#377): atomic, idempotent dismantle / cancel-construction acceptance.
// Every removal is ONE validated transaction (refund + splice + ledger + log)
// with full snapshot rollback on injected failure, and an optional command id
// whose outcome replays EXACTLY (zero further deposit) across duplicate delivery
// and save/reload. Active-job semantics: HARD BLOCK (RESERVED) while any live
// truck job references the building; real cancellation is per-truck cancelFreight
// (#384) returning reserved/onboard units to source exactly once. Local stock
// recovery: floor(40%) of durable paid build materials + 100% of sanitized cargo
// (processed outputs included; cancel also returns cargo — nothing destroyed).
// Exact bank deltas, per-resource units, footprint cells and pivot offsets are
// asserted; conservation is measured across bank + inventories + committed +
// freight reserved/onboard. Fixed seed 4073; power/freight frozen where
// production or dispatch would mask a leak (tests/constructionAtomic.test.mjs
// discipline). EVERY test here is load-bearing: each fails against unmodified
// main c5ad8dec (docs/evidence/377-bld-08/rollback-control.json).
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {
 createGame,readGame,persist,snapshot,buildAt,cancelConstruction,removeBuilding,
 cancelFreight,advanceGame,checkSite,buildingAt,footprintCells,footprintDims,
 worldFootprint,normalizeRot,committedTotals,freightTotals,roadLine,nearestRoad,
 __setConstructionFault
} from "../src/simulation.js";
import {BLUEPRINTS,INITIAL_BANK,SAVE_KEY,CELL,WORLD_SIZE} from "../src/content.js";

const SALVAGER_COST=BLUEPRINTS.salvager.cost;        // {credits:180,scrap:28,stone:12}
const SALVAGER_RECOVERY={credits:72,scrap:11,stone:4}; // floor(40%)
const CRUSHER_COST=BLUEPRINTS.crusher.cost;          // {credits:260,scrap:46,stone:28}
const CRUSHER_RECOVERY={credits:104,scrap:18,stone:11};
const ZERO_BANK=Object.fromEntries(Object.keys(INITIAL_BANK).map(k=>[k,0]));
const clone=(x)=>JSON.parse(JSON.stringify(x));
const store=()=>{const m=new Map();globalThis.localStorage={getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};return m;};
const delta=(after,before,keys)=>Object.fromEntries(keys.map(k=>[k,(after[k]||0)-(before[k]||0)]));

// Frozen-power fixture (same as constructionAtomic): generator removed, starter
// inventories cleared, explicit bank. No production, no dispatch candidates
// (no iron/fuel in bank) -> freight idle, every measurement exact.
function frozenGame(bank={credits:1000,scrap:100,stone:100}){
 const g=createGame();
 assert.equal(g.seed,4073);
 g.buildings=g.buildings.filter(b=>b.id!==3);
 for(const b of g.buildings)b.inventory={};
 g.bank={...ZERO_BANK,...bank};
 return g;
}
// Producing fixture: power ON (starter generator kept), freight OFF (no trucks)
// so processed outputs stay in the machine inventory and bank deltas are exact.
function producingGame(bank={credits:1000,scrap:200,stone:200}){
 const g=createGame();
 g.vehicles=[];
 g.bank={...ZERO_BANK,...bank};
 return g;
}
function grandTotals(g){
 const t={...freightTotals(g).totals};
 for(const [id,n] of Object.entries(committedTotals(g)))t[id]=(t[id]||0)+n;
 return t;
}
function legalSite(g,type,rot=0){
 // Require a servable anchor (nearestRoad <= 3) so the dispatcher can route to
 // the machine; checkSite frontage alone uses the bay, which can reach a road
 // even when the anchor cannot.
 for(let z=1;z<WORLD_SIZE-1;z++)for(let x=1;x<WORLD_SIZE-1;x++)
  if(checkSite(g,type,x,z,rot).ok&&nearestRoad(g,x,z))return {x,z};
 throw Error("no legal site for "+type+" rot "+rot);
}
function completed(g,type,cmd,bank){
 const site=legalSite(g,type);
 const r=buildAt(g,type,site.x,site.z,0,cmd);
 assert.equal(r.ok,true,r.reason);
 advanceGame(g,5); // assembly is power-independent
 assert.equal(r.building.remaining<=0,true);
 return r.building;
}
// Advance until a live job references building id in the given role; bounded.
function awaitJob(g,id,role){
 for(let i=0;i<400;i++){
  const v=g.vehicles.find(v=>v.job&&v.job[role]===id);
  if(v)return v;
  advanceGame(g,0.5);
 }
 throw Error("no job with "+role+"="+id+" within 200s");
}

test("dismantle: exact OK code, salvage ledger row, bank delta; plain repeat is MISSING with zero payout",()=>{
 const g=frozenGame();
 const b=completed(g,"salvager","t1-build");
 b.inventory={iron:7};
 const bankBefore={...g.bank},count=g.buildings.length;
 const r=removeBuilding(g,b.id);
 assert.equal(r.ok,true);assert.equal(r.code,"OK");
 assert.deepEqual(r.refund,{credits:72,scrap:11,stone:4,iron:7},"floor(40% paid) + 100% cargo");
 assert.deepEqual(delta(g.bank,bankBefore,["credits","scrap","stone","iron"]),{credits:72,scrap:11,stone:4,iron:7});
 assert.equal(g.buildings.length,count-1);
 const e=g.ledger.at(-1);
 assert.equal(e.kind,"salvage");assert.equal(e.buildingId,b.id);
 assert.deepEqual(e.refund,r.refund);assert.deepEqual(e.cost,{});
 // Plain repeat: the building is gone; MISSING pays nothing, touches nothing.
 const bankAfter={...g.bank},ledgerLen=g.ledger.length,logLen=g.log.length;
 const again=removeBuilding(g,b.id);
 assert.equal(again.ok,false);assert.equal(again.code,"MISSING");
 assert.equal(again.reason,"No building selected");
 assert.deepEqual(g.bank,bankAfter);assert.equal(g.ledger.length,ledgerLen);assert.equal(g.log.length,logLen);
});

test("dismantle: command id replays the EXACT refund once — duplicate delivery and save/reload pay nothing further",()=>{
 const m=store();
 const g=frozenGame();
 const b=completed(g,"salvager","t2-build");
 b.inventory={iron:7};
 const first=removeBuilding(g,b.id,"t2-dismantle");
 assert.equal(first.ok,true);assert.equal(first.code,"OK");assert.equal(first.commandId,"t2-dismantle");
 assert.deepEqual(first.refund,{credits:72,scrap:11,stone:4,iron:7});
 const bankAfterFirst={...g.bank},count=g.buildings.length,ledgerLen=g.ledger.length,logLen=g.log.length;
 // Duplicate delivery in-session: replay, zero deposit, no ledger/log row.
 const dup=removeBuilding(g,b.id,"t2-dismantle");
 assert.equal(dup.ok,true);assert.equal(dup.duplicate,true);assert.equal(dup.code,"OK");
 assert.deepEqual(dup.refund,first.refund,"replay returns the ORIGINAL refund exactly");
 assert.deepEqual(g.bank,bankAfterFirst);assert.equal(g.buildings.length,count);
 assert.equal(g.ledger.length,ledgerLen);assert.equal(g.log.length,logLen);
 // Reload: registry survives; the dismantled id cannot be re-removed for pay.
 persist(g);
 const loaded=readGame();
 assert.equal(loaded.notices.length,0,"fresh save, no offline catch-up");
 const bankLoaded={...loaded.bank},countLoaded=loaded.buildings.length,ledgerLoaded=loaded.ledger.length;
 const replay=removeBuilding(loaded,b.id,"t2-dismantle");
 assert.equal(replay.ok,true);assert.equal(replay.duplicate,true);
 assert.deepEqual(replay.refund,first.refund);
 assert.deepEqual(loaded.bank,bankLoaded);assert.equal(loaded.buildings.length,countLoaded);
 assert.equal(loaded.ledger.length,ledgerLoaded);
 const plain=removeBuilding(loaded,b.id);
 assert.equal(plain.ok,false);assert.equal(plain.code,"MISSING");
 assert.deepEqual(loaded.bank,bankLoaded);
 // The original BUILD command replays too, but its building is gone: null, no resurrection.
 const buildReplay=buildAt(loaded,"salvager",b.x,b.z,0,"t2-build");
 assert.equal(buildReplay.ok,true);assert.equal(buildReplay.duplicate,true);assert.equal(buildReplay.building,null);
 assert.deepEqual(loaded.bank,bankLoaded);assert.equal(loaded.buildings.length,countLoaded);
 // Ids are never reused: a fresh build at the freed site gets a NEWER id.
 const fresh=buildAt(loaded,"salvager",b.x,b.z,0,"t2-rebuild");
 assert.equal(fresh.ok,true);assert.ok(fresh.building.id>b.id,"nextId monotonic across dismantle");
 const second=removeBuilding(loaded,fresh.building.id,"t2-dismantle-2");
 assert.equal(second.ok,true);assert.notEqual(second.duplicate,true);
 const bankSecond={...loaded.bank};
 const secondReplay=removeBuilding(loaded,fresh.building.id,"t2-dismantle-2");
 assert.equal(secondReplay.duplicate,true);assert.deepEqual(secondReplay.refund,second.refund);
 assert.deepEqual(loaded.bank,bankSecond);
 delete globalThis.localStorage;
});

test("dismantle: rejected commands (PROTECTED / RESERVED / MISSING) replay their rejection with zero bank/building change",()=>{
 const g=frozenGame();
 const b=completed(g,"salvager","t3-build");
 // PROTECTED starter.
 const prot=removeBuilding(g,1,"t3-protected");
 assert.equal(prot.ok,false);assert.equal(prot.code,"PROTECTED");
 assert.equal(prot.reason,"Starter buildings are protected; construct your own district.");
 const bankProt={...g.bank},countProt=g.buildings.length;
 const protReplay=removeBuilding(g,1,"t3-protected");
 assert.equal(protReplay.ok,false);assert.equal(protReplay.duplicate,true);assert.equal(protReplay.code,"PROTECTED");
 assert.deepEqual(g.bank,bankProt);assert.equal(g.buildings.length,countProt);
 // RESERVED: inject a live reservation referencing the machine.
 g.vehicles[0].job={sourceId:b.id,destId:2,resource:"scrap",amount:3,phase:"toSource",
  route:[{x:11,z:10}],toSource:[{x:11,z:10}],toDest:[{x:11,z:10}],segment:0,progress:0};
 const res=removeBuilding(g,b.id,"t3-reserved");
 assert.equal(res.ok,false);assert.equal(res.code,"RESERVED");
 assert.equal(res.reason,"A truck has reserved material at this building");
 assert.deepEqual(g.bank,bankProt);assert.equal(g.buildings.length,countProt);
 assert.ok(g.buildings.some(x=>x.id===b.id),"blocked dismantle leaves the machine in place");
 const resReplay=removeBuilding(g,b.id,"t3-reserved");
 assert.equal(resReplay.ok,false);assert.equal(resReplay.duplicate,true);assert.equal(resReplay.code,"RESERVED");
 assert.deepEqual(g.bank,bankProt);
 // MISSING id.
 const miss=removeBuilding(g,9999,"t3-missing");
 assert.equal(miss.ok,false);assert.equal(miss.code,"MISSING");
 const missReplay=removeBuilding(g,9999,"t3-missing");
 assert.equal(missReplay.duplicate,true);assert.equal(missReplay.code,"MISSING");
 assert.deepEqual(g.bank,bankProt);
 // One reject ledger row per rejected command, not per delivery.
 assert.equal(g.ledger.filter(e=>e.commandId==="t3-reserved").length,1);
 assert.equal(g.ledger.filter(e=>e.commandId==="t3-protected").length,1);
});

test("dismantle: injected faults afterRefund/afterSplice/afterLedger roll back EVERYTHING; aborted command is retryable",()=>{
 for(const phase of ["dismantle.afterRefund","dismantle.afterSplice","dismantle.afterLedger"]){
  const g=frozenGame();
  const b=completed(g,"salvager","t4-build");
  b.inventory={iron:7};
  // Fill the capped rings so the commit's pushes EVICT their heads; rollback
  // must restore contents, not just lengths.
  for(let i=0;i<64;i++)assert.equal(buildAt(g,"salvager",3,3).code,"FRONTAGE");
  while(g.log.length<32)g.log.push({id:900+g.log.length,time:0,message:"pad"});
  g.log.length=32;
  const before=snapshot(g);
  __setConstructionFault((p)=>{if(p===phase)throw Error("fault at "+phase);});
  try{assert.throws(()=>removeBuilding(g,b.id,"t4-"+phase),/fault at/);}
  finally{__setConstructionFault(null);}
  assert.deepEqual(snapshot(g),before,"rollback at "+phase+" restores bank/buildings/rings/nextId exactly");
  assert.ok(g.buildings.some(x=>x.id===b.id),"no half-removed machine at "+phase);
  // The aborted command recorded nothing: a retry is a real transaction.
  const retry=removeBuilding(g,b.id,"t4-"+phase);
  assert.equal(retry.ok,true);assert.notEqual(retry.duplicate,true);
  assert.deepEqual(retry.refund,{credits:72,scrap:11,stone:4,iron:7});
  assert.deepEqual(delta(g.bank,before.bank,["credits","scrap","stone","iron"]),{credits:72,scrap:11,stone:4,iron:7},"paid exactly once after retry");
 }
});

test("dismantle: null/negative/NaN inventory can never double-pay, mint or poison bank stock (legacy double-pay counterfactual)",()=>{
 const m=store();
 // Legacy counterfactual, reproduced exactly: main's removeBuilding deposited
 // the 40% build-cost refund BEFORE reading b.inventory; a null inventory threw
 // mid-transaction, leaving the refund paid AND the building present -> a retry
 // paid the recovery AGAIN.
 const legacy=frozenGame();
 const lb=completed(legacy,"salvager","t5-legacy");
 lb.inventory=null;
 const legacyBank={...legacy.bank};
 for(const [r,n] of Object.entries(SALVAGER_RECOVERY))legacy.bank[r]+=n; // partial refund deposited
 try{Object.entries(lb.inventory);}catch{} // main throws here, before the splice
 assert.ok(legacy.buildings.some(x=>x.id===lb.id),"legacy: building survives the throw");
 for(const [r,n] of Object.entries(SALVAGER_RECOVERY))legacy.bank[r]+=n; // retry pays again
 assert.deepEqual(delta(legacy.bank,legacyBank,["credits","scrap","stone"]),{credits:144,scrap:22,stone:8},"legacy double recovery 2x72/2x11/2x4");
 // Fixed: null inventory is sanitized, the transaction commits once, no throw.
 const g=frozenGame();
 const b=completed(g,"salvager","t5-null");
 b.inventory=null;
 const bankBefore={...g.bank};
 const r=removeBuilding(g,b.id,"t5-null");
 assert.equal(r.ok,true);assert.equal(r.code,"OK");
 assert.deepEqual(r.refund,SALVAGER_RECOVERY,"null cargo contributes nothing, recovery paid once");
 assert.deepEqual(delta(g.bank,bankBefore,["credits","scrap","stone"]),{credits:72,scrap:11,stone:4});
 const bankAfterNull={...g.bank};
 const replay=removeBuilding(g,b.id,"t5-null");
 assert.equal(replay.duplicate,true);assert.deepEqual(replay.refund,SALVAGER_RECOVERY);
 assert.deepEqual(g.bank,bankAfterNull,"replay deposits nothing further");
 // Tampered amounts: negative destroys nothing, NaN poisons nothing, numeric
 // strings coerce, zero keys contribute nothing.
 const g2=frozenGame();
 const b2=completed(g2,"salvager","t5-tamper");
 b2.inventory={scrap:-50,iron:NaN,copper:"8",stone:0,steel:3};
 const bank2={...g2.bank};
 const r2=removeBuilding(g2,b2.id);
 assert.equal(r2.ok,true);
 assert.deepEqual(r2.refund,{credits:72,scrap:11,stone:4,copper:8,steel:3},"only finite positive cargo returns");
 assert.deepEqual(delta(g2.bank,bank2,["credits","scrap","stone","copper","steel"]),{credits:72,scrap:11,stone:4,copper:8,steel:3});
 for(const [k,v] of Object.entries(g2.bank))assert.ok(Number.isFinite(v)&&v>=0,"bank key "+k+" finite and non-negative");
 // readGame normalizes hostile inventories on load (legacy saves included).
 const g3=frozenGame();
 const b3=completed(g3,"salvager","t5-load");
 b3.inventory={scrap:-50,iron:NaN,copper:"8",stone:0,steel:3};
 persist(g3);
 const loaded=readGame();
 const lb3=loaded.buildings.find(x=>x.id===b3.id);
 assert.deepEqual(lb3.inventory,{copper:8,iron:0,stone:0,steel:3},"negative dropped; NaN->null->0 and zero keys kept (contribute nothing)");
 const bank3={...loaded.bank};
 const r3=removeBuilding(loaded,b3.id);
 assert.deepEqual(r3.refund,{credits:72,scrap:11,stone:4,copper:8,steel:3});
 assert.deepEqual(delta(loaded.bank,bank3,["credits","scrap","stone","copper","steel"]),{credits:72,scrap:11,stone:4,copper:8,steel:3});
 delete globalThis.localStorage;
});

test("cancel: atomic idempotent full paid + 100% cargo refund; replay survives reload",()=>{
 const m=store();
 const g=frozenGame();
 const site=legalSite(g,"crusher");
 const r=buildAt(g,"crusher",site.x,site.z,0,"t6-build");
 assert.equal(r.ok,true);
 advanceGame(g,2);
 assert.ok(r.building.remaining>0,"still assembling");
 r.building.inventory={scrap:5}; // legacy/tampered cargo on an assembling machine
 const bankBefore={...g.bank};
 const c=cancelConstruction(g,r.building.id,"t6-cancel");
 assert.equal(c.ok,true);assert.equal(c.code,"OK");
 assert.deepEqual(c.refund,{credits:260,scrap:51,stone:28},"full paid 260/46/28 + cargo scrap 5 — nothing destroyed");
 assert.deepEqual(delta(g.bank,bankBefore,["credits","scrap","stone"]),{credits:260,scrap:51,stone:28});
 assert.equal(g.buildings.some(b=>b.id===r.building.id),false);
 const e=g.ledger.at(-1);
 assert.equal(e.kind,"cancel");assert.deepEqual(e.refund,c.refund);
 const bankAfter={...g.bank},ledgerLen=g.ledger.length;
 const dup=cancelConstruction(g,r.building.id,"t6-cancel");
 assert.equal(dup.ok,true);assert.equal(dup.duplicate,true);assert.deepEqual(dup.refund,c.refund);
 assert.deepEqual(g.bank,bankAfter);assert.equal(g.ledger.length,ledgerLen);
 persist(g);
 const loaded=readGame();
 const bankLoaded={...loaded.bank},countLoaded=loaded.buildings.length;
 const replay=cancelConstruction(loaded,r.building.id,"t6-cancel");
 assert.equal(replay.duplicate,true);assert.deepEqual(replay.refund,c.refund);
 assert.deepEqual(loaded.bank,bankLoaded);assert.equal(loaded.buildings.length,countLoaded);
 // A kind-tagged cancel id is NOT a build command: buildAt treats it as fresh.
 const asBuild=buildAt(loaded,"crusher",site.x,site.z,0,"t6-cancel");
 assert.equal(asBuild.ok,true);assert.notEqual(asBuild.duplicate,true);
 delete globalThis.localStorage;
});

test("cancel: injected faults afterRefund/afterSplice/afterLedger roll back EVERYTHING; retryable",()=>{
 for(const phase of ["cancel.afterRefund","cancel.afterSplice","cancel.afterLedger"]){
  const g=frozenGame();
  const site=legalSite(g,"crusher");
  const r=buildAt(g,"crusher",site.x,site.z,0,"t7-build");
  advanceGame(g,2);
  r.building.inventory={scrap:5};
  for(let i=0;i<64;i++)buildAt(g,"salvager",3,3);
  while(g.log.length<32)g.log.push({id:900+g.log.length,time:0,message:"pad"});
  g.log.length=32;
  const before=snapshot(g);
  __setConstructionFault((p)=>{if(p===phase)throw Error("fault at "+phase);});
  try{assert.throws(()=>cancelConstruction(g,r.building.id,"t7-"+phase),/fault at/);}
  finally{__setConstructionFault(null);}
  assert.deepEqual(snapshot(g),before,"rollback at "+phase+" restores everything");
  const retry=cancelConstruction(g,r.building.id,"t7-"+phase);
  assert.equal(retry.ok,true);assert.notEqual(retry.duplicate,true);
  assert.deepEqual(retry.refund,{credits:260,scrap:51,stone:28});
  assert.deepEqual(delta(g.bank,before.bank,["credits","scrap","stone"]),{credits:260,scrap:51,stone:28});
 }
});

test("cancel: MISSING / PROTECTED / COMPLETE / RESERVED gates with codes; reserved assembly is never destroyed",()=>{
 const g=frozenGame();
 const miss=cancelConstruction(g,9999,"t8-missing");
 assert.equal(miss.ok,false);assert.equal(miss.code,"MISSING");
 const prot=cancelConstruction(g,1,"t8-protected");
 assert.equal(prot.ok,false);assert.equal(prot.code,"PROTECTED");
 const b=completed(g,"salvager","t8-build");
 const done=cancelConstruction(g,b.id,"t8-complete");
 assert.equal(done.ok,false);assert.equal(done.code,"COMPLETE");
 assert.equal(done.reason,"Assembly is complete — dismantle the machine instead");
 const bankBefore={...g.bank},count=g.buildings.length;
 const doneReplay=cancelConstruction(g,b.id,"t8-complete");
 assert.equal(doneReplay.duplicate,true);assert.equal(doneReplay.code,"COMPLETE");
 assert.deepEqual(g.bank,bankBefore);assert.equal(g.buildings.length,count);
 // Defensive RESERVED gate: a live job referencing an assembling machine (only
 // reachable via tampered/legacy state — deliveryCandidates skips remaining>0)
 // blocks cancel exactly like dismantle, with zero mutation.
 const site=legalSite(g,"crusher");
 const r=buildAt(g,"crusher",site.x,site.z,0,"t8-assembly");
 advanceGame(g,2);
 g.vehicles[0].job={sourceId:r.building.id,destId:2,resource:"scrap",amount:3,phase:"toSource",
  route:[{x:11,z:10}],toSource:[{x:11,z:10}],toDest:[{x:11,z:10}],segment:0,progress:0};
 const before=snapshot(g);
 // No command id: a blocked cancel is byte-identical (nothing recorded).
 const resPlain=cancelConstruction(g,r.building.id);
 assert.equal(resPlain.ok,false);assert.equal(resPlain.code,"RESERVED");
 assert.equal(resPlain.reason,"A truck has reserved material at this building");
 assert.deepEqual(snapshot(g),before,"blocked cancel without cmd is byte-identical");
 // With a command id: bank/buildings untouched; exactly one replayable reject row.
 const res=cancelConstruction(g,r.building.id,"t8-reserved");
 assert.equal(res.ok,false);assert.equal(res.code,"RESERVED");
 assert.deepEqual(g.bank,before.bank);assert.deepEqual(g.buildings,before.buildings);
 assert.equal(g.ledger.length,before.ledger.length+1);
 assert.equal(g.ledger.at(-1).kind,"reject");assert.equal(g.ledger.at(-1).commandId,"t8-reserved");
 const resReplay=cancelConstruction(g,r.building.id,"t8-reserved");
 assert.equal(resReplay.duplicate,true);assert.equal(resReplay.code,"RESERVED");
 assert.deepEqual(g.bank,before.bank);assert.deepEqual(g.buildings,before.buildings);
});

test("active source job: RESERVED dismantle is byte-identical; cancelFreight returns cargo exactly once; then dismantle adds exact recovery, cargo conserved",()=>{
 // Frozen power + zero iron/fuel in bank => the seeded machine is the ONLY
 // dispatch candidate, so the reservation is deterministic (no competing hauls).
 const g=frozenGame();
 const b=completed(g,"salvager","t9-build");
 b.inventory={scrap:20};
 const v=awaitJob(g,b.id,"sourceId");
 assert.equal(v.job.phase,"toSource");
 assert.equal(v.job.amount,15,"dispatcher reserves min(15, floor(20))");
 assert.equal(b.inventory.scrap,5,"reserved units left the source bag exactly once");
 // Hard block: dismantle while the job is live changes NOTHING.
 const before=snapshot(g);
 const blocked=removeBuilding(g,b.id);
 assert.equal(blocked.ok,false);assert.equal(blocked.code,"RESERVED");
 assert.deepEqual(snapshot(g),before,"RESERVED dismantle is byte-identical");
 const totalsBefore=freightTotals(g);
 assert.equal(totalsBefore.reserved,15);
 // Real cancellation: reserved units return to the SOURCE bag exactly once.
 const c1=cancelFreight(g,v.id);
 assert.equal(c1.ok,true);assert.equal(c1.code,"OK");assert.equal(c1.resource,"scrap");assert.equal(c1.amount,15);
 assert.equal(b.inventory.scrap,20,"cargo back in the machine, not stranded, not doubled");
 assert.equal(freightTotals(g).reserved,0);
 assert.deepEqual(freightTotals(g).totals,totalsBefore.totals,"cancelFreight conserves per-resource totals");
 const c2=cancelFreight(g,v.id);
 assert.equal(c2.ok,false);assert.equal(c2.code,"IDLE","second cancel is a no-op, never a second return");
 assert.equal(b.inventory.scrap,20);
 // Now dismantle succeeds: recovery + 100% of the returned cargo.
 const bankBefore={...g.bank},grandBefore=grandTotals(g);
 const r=removeBuilding(g,b.id,"t9-dismantle");
 assert.equal(r.ok,true);assert.equal(r.code,"OK");
 assert.deepEqual(r.refund,{credits:72,scrap:31,stone:4},"floor(40%) 72/11/4 + cargo scrap 20");
 assert.deepEqual(delta(g.bank,bankBefore,["credits","scrap","stone"]),{credits:72,scrap:31,stone:4});
 // The cargo (scrap 20) was already counted in the grand ledger (machine bag);
 // dismantle moves it to the bank and ADDS only the floor(40%) recovery. Net
 // grand change == +recovery; cargo is conserved, never destroyed or doubled.
 assert.deepEqual(delta(grandTotals(g),grandBefore,["credits","scrap","stone"]),
  {credits:SALVAGER_RECOVERY.credits,scrap:SALVAGER_RECOVERY.scrap,stone:SALVAGER_RECOVERY.stone},
  "grand ledger gains EXACTLY the recovery; the 20 cargo units stay conserved");
 assert.equal(grandTotals(g).scrap,103,"bank scrap 72 + cargo 20 + recovery 11 all present");
 assert.equal(freightTotals(g).reserved,0);assert.equal(freightTotals(g).onboard,0);
});

test("active destination job + reload: RESERVED persists across save/reload; cancelFreight returns to the depot bank exactly once",()=>{
 const m=store();
 const g=createGame();
 // Keep the starter furnace fed so the PLAYER furnace is the only resupply dest.
 g.buildings.find(b=>b.id===4).inventory={iron:40,fuel:20};
 const b=completed(g,"furnace","t10-build");
 const v=awaitJob(g,b.id,"destId");
 assert.equal(v.job.sourceId,2,"resupply sources from the depot");
 assert.equal(v.job.resource,"iron");
 const amount=v.job.amount;
 assert.equal(amount,15,"resupply reserves min(bank iron, n*3=15)");
 const blocked=removeBuilding(g,b.id);
 assert.equal(blocked.ok,false);assert.equal(blocked.code,"RESERVED");
 // Reload with the job live: reconciliation keeps a valid reservation, and the
 // hard block still holds — no cargo stranded or doubled by the round-trip.
 persist(g);
 const loaded=readGame();
 assert.equal(loaded.notices.length,0);
 const lv=loaded.vehicles.find(x=>x.id===v.id);
 assert.ok(lv.job&&lv.job.destId===b.id,"valid reserved job survives reconcileFreight");
 assert.equal(freightTotals(loaded).reserved,freightTotals(g).reserved);
 const blocked2=removeBuilding(loaded,b.id);
 assert.equal(blocked2.ok,false);assert.equal(blocked2.code,"RESERVED");
 const bankBefore={...loaded.bank};
 const c=cancelFreight(loaded,v.id);
 assert.equal(c.ok,true);assert.equal(c.amount,amount);
 assert.equal(loaded.bank.iron,bankBefore.iron+amount,"depot-sourced reservation returns to the BANK exactly once");
 const c2=cancelFreight(loaded,v.id);
 assert.equal(c2.ok,false);assert.equal(c2.code,"IDLE");
 assert.equal(loaded.bank.iron,bankBefore.iron+amount);
 const r=removeBuilding(loaded,b.id,"t10-dismantle");
 assert.equal(r.ok,true);assert.equal(r.code,"OK");
 assert.deepEqual(r.refund,{credits:144,iron:9,scrap:20,stone:8},"floor(40%) of furnace paid 360/24/50/20; empty cargo");
 delete globalThis.localStorage;
});

test("stock recovery: PROCESSED OUTPUTS refund at 100% — crusher 3 cycles, exact units and transformation audit",()=>{
 const g=producingGame();
 const b=completed(g,"crusher","t11-build");
 // Power available (starter generator 12 MW >= demand 7), no trucks: outputs stay.
 b.inventory={scrap:30};
 advanceGame(g,12); // exactly 3 crusher cycles (4s each): 30 scrap -> 18 iron + 6 stone
 assert.deepEqual(b.inventory,{scrap:0,iron:18,stone:6},"3 cycles of {scrap:10}->{iron:6,stone:2}, exact");
 const bankBefore={...g.bank};
 assert.deepEqual(bankBefore,{...ZERO_BANK,credits:740,scrap:154,stone:172},"build cost spent, production never touches the bank");
 const others=g.buildings.filter(x=>x.id!==b.id).map(x=>({id:x.id,inventory:clone(x.inventory)}));
 const r=removeBuilding(g,b.id,"t11-dismantle");
 assert.equal(r.ok,true);assert.equal(r.code,"OK");
 // floor(40% of paid 260/46/28) = 104/18/11; cargo iron 18 + stone 6 at 100%.
 assert.deepEqual(r.refund,{credits:104,scrap:18,stone:17,iron:18});
 assert.deepEqual(delta(g.bank,bankBefore,["credits","scrap","stone","iron"]),{credits:104,scrap:18,stone:17,iron:18});
 assert.deepEqual(g.bank,{...ZERO_BANK,credits:844,scrap:172,stone:189,iron:18},"exact post-dismantle bank");
 const e=g.ledger.at(-1);
 assert.equal(e.kind,"salvage");assert.deepEqual(e.refund,r.refund);
 // Dismantle touches ONLY the target machine's stock.
 for(const o of others)assert.deepEqual(g.buildings.find(x=>x.id===o.id).inventory,o.inventory);
 // Transformation audit: the 30 scrap became 18 iron + 6 stone by recipe, and
 // every one of those output units returned to the bank (stone 6 merged into
 // the 11 recovery). Nothing was lost beyond the audited build-material loss.
 assert.deepEqual(delta(g.bank,{...ZERO_BANK,credits:1000,scrap:200,stone:200},["credits","scrap","stone","iron"]),
  {credits:-156,scrap:-28,stone:-11,iron:18},
  "net: 60% build loss 156/28/17 minus recipe stone output 6, plus recipe iron 18");
 const replay=removeBuilding(g,b.id,"t11-dismantle");
 assert.equal(replay.duplicate,true);assert.deepEqual(replay.refund,r.refund);
});

test("stock recovery: partially-assembled machine — cancel returns paid + cargo exactly; normal empty-inventory cancel is unchanged",()=>{
 const g=frozenGame();
 const site=legalSite(g,"crusher");
 const r=buildAt(g,"crusher",site.x,site.z,0,"t12-build");
 advanceGame(g,2);
 assert.ok(r.building.remaining>0);
 r.building.inventory={scrap:5,iron:2};
 const bankBefore={...g.bank},grandBefore=grandTotals(g);
 const c=cancelConstruction(g,r.building.id,"t12-cancel");
 assert.equal(c.ok,true);assert.equal(c.code,"OK");
 assert.deepEqual(c.refund,{credits:260,scrap:51,stone:28,iron:2},"paid 260/46/28 + cargo scrap 5 iron 2");
 assert.deepEqual(delta(g.bank,bankBefore,["credits","scrap","stone","iron"]),{credits:260,scrap:51,stone:28,iron:2});
 assert.deepEqual(grandTotals(g),grandBefore,"cancel is lossless: grand ledger (bank+committed+cargo) unchanged");
 // Normal gameplay: assembling machines hold EMPTY inventory (dispatcher skips
 // remaining>0), so the cancel refund is exactly the paid cost — unchanged.
 const g2=frozenGame();
 const site2=legalSite(g2,"salvager");
 const r2=buildAt(g2,"salvager",site2.x,site2.z,0,"t12-normal");
 advanceGame(g2,2);
 assert.deepEqual(r2.building.inventory,{});
 const bank2={...g2.bank};
 const c2=cancelConstruction(g2,r2.building.id);
 assert.equal(c2.ok,true);assert.equal(c2.code,"OK");
 assert.deepEqual(c2.refund,SALVAGER_COST);
 assert.deepEqual(delta(g2.bank,bank2,["credits","scrap","stone"]),{credits:180,scrap:28,stone:12});
});

test("footprint: dismantle FREES exactly the 2x3 crane cells/pivot for all four rotations; roads and rebuild reuse the pad",()=>{
 const g=frozenGame({credits:20000,steel:400,gears:200,scrap:400,stone:400});
 assert.deepEqual(BLUEPRINTS.crane.footprint,{w:2,d:3});
 for(let rot=0;rot<4;rot++){
  const site=legalSite(g,"crane",rot);
  const r=buildAt(g,"crane",site.x,site.z,rot,"t13-"+rot);
  assert.equal(r.ok,true,r.reason);
  const b=r.building;
  const dims=footprintDims("crane",rot);
  assert.deepEqual(dims,rot%2===1?{w:3,d:2}:{w:2,d:3});
  const cells=footprintCells("crane",site.x,site.z,rot);
  assert.equal(cells.length,6);
  // Exact 3D pivot/AABB while committed (CELL=3.5, world center 12).
  const fp=worldFootprint("crane",site.x,site.z,rot);
  const ox=(site.x-WORLD_SIZE/2+.5)*CELL,oz=(site.z-WORLD_SIZE/2+.5)*CELL;
  assert.equal(fp.rotationY,normalizeRot(rot)*Math.PI/2);
  assert.deepEqual(fp.pivot,{x:ox+(dims.w-1)*CELL/2,y:0,z:oz+(dims.d-1)*CELL/2});
  assert.deepEqual(fp.min,{x:ox-CELL/2,y:0,z:oz-CELL/2});
  assert.deepEqual(fp.max,{x:ox+(dims.w-1)*CELL+CELL/2,y:0,z:oz+(dims.d-1)*CELL+CELL/2});
  for(const c of cells)assert.equal(buildingAt(g,c.x,c.z)?.id,b.id);
  // Roads refuse the occupied pad.
  const a={x:site.x,z:site.z},bb={x:site.x+1,z:site.z};
  assert.equal(roadLine(g,a,bb).ok,false,"road intersects the committed crane");
  const bankBefore={...g.bank};
  const s=removeBuilding(g,b.id,"t13-dismantle-"+rot);
  assert.equal(s.ok,true);assert.equal(s.code,"OK");
  assert.deepEqual(s.refund,{credits:352,steel:14,gears:4},"floor(40%) of crane paid 880/36/12, empty cargo");
  assert.deepEqual(delta(g.bank,bankBefore,["credits","steel","gears"]),{credits:352,steel:14,gears:4});
  // EXACT release: every footprint cell is free, one cell beyond still free/other.
  for(const c of cells)assert.equal(buildingAt(g,c.x,c.z),null,"cell "+c.x+","+c.z+" freed at rot "+rot);
  // The freed pad now accepts a road and a rebuild at the same site/rotation.
  const road=roadLine(g,a,bb);
  assert.equal(road.ok,true,"freed pad accepts roads");
  assert.equal(road.cells,2);
  const rebuild=buildAt(g,"crane",site.x,site.z,rot,"t13-rebuild-"+rot);
  // Road now occupies two pad cells -> the rebuild must be refused there...
  assert.equal(rebuild.ok,false,"roads paved on the pad block reconstruction (occupancy still authoritative)");
  // ...but a fresh legal site builds fine and the registry replays the dismantle.
  const replay=removeBuilding(g,b.id,"t13-dismantle-"+rot);
  assert.equal(replay.duplicate,true);assert.deepEqual(replay.refund,s.refund);
 }
});

test("fixture: saved-state dismantle fixture replays through the public API; post-dismantle command replay pays nothing",()=>{
 const path=fileURLToPath(new URL("./fixtures/save-v2-dismantle.json",import.meta.url));
 const fixture=JSON.parse(readFileSync(path,"utf8"));
 assert.equal(fixture.version,2);assert.equal(fixture.seed,4073);
 // Replay the fixture's real history: build a crusher, complete it, run 3
 // production cycles (freight frozen), dismantle with a command id.
 const replay=producingGame();
 const site=legalSite(replay,"crusher");
 const r=buildAt(replay,"crusher",site.x,site.z,0,"fixture-crusher-build");
 assert.equal(r.ok,true);
 advanceGame(replay,5);
 r.building.inventory={scrap:30};
 advanceGame(replay,12);
 assert.deepEqual(r.building.inventory,{scrap:0,iron:18,stone:6});
 const d=removeBuilding(replay,r.building.id,"fixture-dismantle-1");
 assert.equal(d.ok,true);
 assert.deepEqual(fixture.bank,replay.bank,"fixture bank conserved by real API replay");
 assert.deepEqual(fixture.ledger,replay.ledger);
 assert.deepEqual(fixture.commands,replay.commands);
 assert.equal(fixture.buildings.length,6,"player crusher removed, starters intact");
 // Load the post-dismantle save: the recorded dismantle command replays with
 // zero payout; a plain repeat is MISSING; the freed pad rebuilds.
 const m=store();
 m.set(SAVE_KEY,JSON.stringify({...fixture,lastSavedAt:Date.now()}));
 const loaded=readGame();
 assert.deepEqual(loaded.bank,replay.bank);
 assert.deepEqual(loaded.ledger,replay.ledger);
 assert.deepEqual(loaded.commands,replay.commands);
 const bankBefore={...loaded.bank},count=loaded.buildings.length,ledgerLen=loaded.ledger.length;
 const dup=removeBuilding(loaded,r.building.id,"fixture-dismantle-1");
 assert.equal(dup.ok,true);assert.equal(dup.duplicate,true);
 assert.deepEqual(dup.refund,d.refund);
 assert.deepEqual(loaded.bank,bankBefore);assert.equal(loaded.buildings.length,count);assert.equal(loaded.ledger.length,ledgerLen);
 const plain=removeBuilding(loaded,r.building.id);
 assert.equal(plain.ok,false);assert.equal(plain.code,"MISSING");
 assert.deepEqual(loaded.bank,bankBefore);
 const rebuild=buildAt(loaded,"crusher",site.x,site.z,0,"fixture-rebuild");
 assert.equal(rebuild.ok,true);assert.ok(rebuild.building.id>r.building.id);
 delete globalThis.localStorage;
});

test("conserved ledger: build->cancel->rebuild->process->dismantle->rebuild->cancel — sum(ledger) == bank delta, exact audited loss",()=>{
 const m=store();
 const g=frozenGame(); // freight idle, power frozen: ledger is the ONLY mover
 const initial={...g.bank};
 const base=grandTotals(g);
 assert.deepEqual(base,{credits:1000,scrap:100,stone:100});
 const site=legalSite(g,"salvager");
 const r1=buildAt(g,"salvager",site.x,site.z,0,"t15-b1");
 assert.equal(r1.ok,true);assert.deepEqual(grandTotals(g),base);
 const c1=cancelConstruction(g,r1.building.id,"t15-c1");
 assert.equal(c1.ok,true);assert.deepEqual(c1.refund,SALVAGER_COST);
 assert.deepEqual(grandTotals(g),base);assert.deepEqual(g.bank,initial);
 const r2=buildAt(g,"salvager",site.x,site.z,0,"t15-b2");
 advanceGame(g,5);
 assert.deepEqual(committedTotals(g),{});
 assert.deepEqual(grandTotals(g),{credits:820,scrap:72,stone:88},"completion sinks exactly the paid cost");
 r2.building.inventory={iron:7};
 const d=removeBuilding(g,r2.building.id,"t15-d1");
 assert.equal(d.ok,true);
 assert.deepEqual(d.refund,{credits:72,scrap:11,stone:4,iron:7});
 assert.deepEqual(delta(grandTotals(g),base,["credits","scrap","stone","iron"]),
  {credits:-108,scrap:-17,stone:-8,iron:7},"exact salvage loss; cargo iron 7 conserved");
 const r3=buildAt(g,"salvager",site.x,site.z,0,"t15-b3");
 const c2=cancelConstruction(g,r3.building.id,"t15-c2");
 assert.equal(c2.ok,true);assert.deepEqual(c2.refund,SALVAGER_COST);
 // CONSERVED LEDGER: for every resource, bank delta == sum(refunds) - sum(costs)
 // across ALL ledger rows (build/cancel/salvage/reject). No ghost stock.
 const sums={};
 for(const e of g.ledger){
  for(const [id,n] of Object.entries(e.refund||{}))sums[id]=(sums[id]||0)+n;
  for(const [id,n] of Object.entries(e.cost||{}))sums[id]=(sums[id]||0)-n;
 }
 const bankDelta={};
 for(const id of Object.keys(g.bank))if(g.bank[id]!==initial[id])bankDelta[id]=g.bank[id]-initial[id];
 assert.deepEqual(sums,bankDelta,"ledger sums equal the exact bank movement");
 assert.deepEqual(bankDelta,{credits:-108,scrap:-17,stone:-8,iron:7});
 assert.deepEqual(g.bank,{...ZERO_BANK,credits:892,scrap:83,stone:92,iron:7});
 // Reload: totals, registry and ledger survive; dismantled command replays.
 persist(g);
 const loaded=readGame();
 assert.deepEqual(grandTotals(loaded),grandTotals(g));
 assert.deepEqual(loaded.commands,g.commands);
 const replay=removeBuilding(loaded,r2.building.id,"t15-d1");
 assert.equal(replay.duplicate,true);assert.deepEqual(replay.refund,d.refund);
 assert.deepEqual(loaded.bank,g.bank);
 delete globalThis.localStorage;
});
