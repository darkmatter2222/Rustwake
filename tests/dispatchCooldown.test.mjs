// #558: per-source dispatch cooldown after cancelFreight (BLD-08 follow-up).
// The defect: advanceGame re-runs assignJob for every idle truck EVERY substep,
// so after cancelFreight returns cargo exactly once the very next tick
// re-reserves the same source+resource pair (cancelling RESTORES the inventory
// that made it a candidate). The cancel->dismantle window was not normally
// winnable; #377's capture needed decoy seeds + a slowed fleet to disclose it.
// Remedy (issue option (a)): cancelFreight records a SIM-TIME expiry for the
// cancelled source+resource pair in g.dispatchCooldowns; deliveryCandidates
// skips cooled pairs until g.elapsed passes the expiry. Persisted across
// save/reload (absolute sim-time expiry, never wall clock), expiring back to
// normal dispatch. The RESERVED hard block and exactly-once conservation are
// NOT weakened — every test below also fails against unmodified main 6ebb7ff3
// (rollback control), and removing the cooldown guard fails the suppression
// assertions (mutation control). Fixed seed 4073; frozen-power fixtures mirror
// tests/dismantleAtomic.test.mjs so the seeded machine is the ONLY candidate.
import test from "node:test";
import assert from "node:assert/strict";
import {
 createGame,readGame,persist,snapshot,buildAt,removeBuilding,cancelFreight,
 advanceGame,checkSite,committedTotals,freightTotals,nearestRoad,
 DISPATCH_COOLDOWN_SECONDS,dispatchCooldownRemaining
} from "../src/simulation.js";
import {BLUEPRINTS,INITIAL_BANK,SAVE_KEY,WORLD_SIZE} from "../src/content.js";

const SALVAGER_RECOVERY={credits:72,scrap:11,stone:4}; // floor(40% of 180/28/12)
const ZERO_BANK=Object.fromEntries(Object.keys(INITIAL_BANK).map(k=>[k,0]));
const store=()=>{const m=new Map();globalThis.localStorage={getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};return m;};
const delta=(after,before,keys)=>Object.fromEntries(keys.map(k=>[k,(after[k]||0)-(before[k]||0)]));
const jobOn=(g,sourceId,resource)=>g.vehicles.find(v=>v.job&&v.job.sourceId===sourceId&&v.job.resource===resource)||null;

// Frozen-power fixture (dismantleAtomic discipline): generator removed, starter
// inventories cleared, explicit bank with NO iron/fuel -> no resupply candidates,
// no production. The seeded player machine is the only dispatch candidate.
function frozenGame(bank={credits:1000,scrap:100,stone:100}){
 const g=createGame();
 assert.equal(g.seed,4073);
 g.buildings=g.buildings.filter(b=>b.id!==3);
 for(const b of g.buildings)b.inventory={};
 g.bank={...ZERO_BANK,...bank};
 return g;
}
function grandTotals(g){
 const t={...freightTotals(g).totals};
 for(const [id,n] of Object.entries(committedTotals(g)))t[id]=(t[id]||0)+n;
 return t;
}
function legalSite(g,type,rot=0){
 for(let z=1;z<WORLD_SIZE-1;z++)for(let x=1;x<WORLD_SIZE-1;x++)
  if(checkSite(g,type,x,z,rot).ok&&nearestRoad(g,x,z))return {x,z};
 throw Error("no legal site for "+type+" rot "+rot);
}
function completed(g,type,cmd){
 const site=legalSite(g,type);
 const r=buildAt(g,type,site.x,site.z,0,cmd);
 assert.equal(r.ok,true,r.reason);
 advanceGame(g,5); // assembly is power-independent
 assert.equal(r.building.remaining<=0,true);
 return r.building;
}
function awaitJob(g,id,role,resource){
 for(let i=0;i<400;i++){
  const v=g.vehicles.find(v=>v.job&&v.job[role]===id&&(!resource||v.job.resource===resource));
  if(v)return v;
  advanceGame(g,0.5);
 }
 throw Error("no job with "+role+"="+id+" within 200s");
}

test("cooldown: cancel -> one tick -> source NOT re-reserved; dismantle then succeeds with recovery + 100% cargo; grand totals conserved",()=>{
 const g=frozenGame();
 const b=completed(g,"salvager","c1-build");
 b.inventory={scrap:20};
 const v=awaitJob(g,b.id,"sourceId");
 assert.equal(v.job.amount,15);assert.equal(b.inventory.scrap,5);
 // RESERVED hard block intact and byte-identical (never weakened).
 const before=snapshot(g);
 const blocked=removeBuilding(g,b.id);
 assert.equal(blocked.ok,false);assert.equal(blocked.code,"RESERVED");
 assert.deepEqual(snapshot(g),before,"RESERVED dismantle is byte-identical");
 const totalsBefore=freightTotals(g).totals;
 const c=cancelFreight(g,v.id);
 assert.equal(c.ok,true);assert.equal(c.resource,"scrap");assert.equal(c.amount,15);
 assert.equal(b.inventory.scrap,20,"exactly-once return to source");
 assert.deepEqual(freightTotals(g).totals,totalsBefore,"cancel conserves totals");
 // THE DEFECT (main): the very next substep re-reserves the same pair.
 // THE FIX: the cancelled source+resource pair is cooled for the window.
 assert.equal(dispatchCooldownRemaining(g,b.id,"scrap"),DISPATCH_COOLDOWN_SECONDS);
 advanceGame(g,0.5);
 assert.equal(jobOn(g,b.id,"scrap"),null,"source NOT re-reserved on the next tick");
 assert.equal(b.inventory.scrap,20,"returned cargo stays in the machine");
 assert.equal(freightTotals(g).reserved,0);
 assert.deepEqual(freightTotals(g).totals,totalsBefore,"still conserved after the tick");
 // The player can now WIN the window: dismantle succeeds inside the cooldown.
 const bankBefore={...g.bank},grandBefore=grandTotals(g);
 const r=removeBuilding(g,b.id,"c1-dismantle");
 assert.equal(r.ok,true);assert.equal(r.code,"OK");
 assert.deepEqual(r.refund,{credits:72,scrap:31,stone:4},"floor(40%) + 100% of the returned 20 scrap");
 assert.deepEqual(delta(g.bank,bankBefore,["credits","scrap","stone"]),{credits:72,scrap:31,stone:4});
 assert.deepEqual(delta(grandTotals(g),grandBefore,["credits","scrap","stone"]),
  SALVAGER_RECOVERY,"grand ledger gains EXACTLY the recovery; cargo conserved");
 assert.equal(freightTotals(g).reserved,0);assert.equal(freightTotals(g).onboard,0);
});

test("cooldown: survives save/reload (sim-time expiry, not wall clock); reload cannot bypass the window",()=>{
 const m=store();
 const g=frozenGame();
 const b=completed(g,"salvager","c2-build");
 b.inventory={scrap:20};
 const v=awaitJob(g,b.id,"sourceId");
 const c=cancelFreight(g,v.id);
 assert.equal(c.ok,true);
 const until=g.dispatchCooldowns[b.id+":scrap"];
 assert.equal(until,g.elapsed+DISPATCH_COOLDOWN_SECONDS,"absolute sim-time expiry recorded");
 persist(g);
 const loaded=readGame();
 assert.equal(loaded.notices.length,0,"fresh save, no offline catch-up");
 assert.equal(loaded.elapsed,g.elapsed);
 assert.equal(loaded.dispatchCooldowns[b.id+":scrap"],until,"cooldown survives the round-trip");
 assert.equal(dispatchCooldownRemaining(loaded,b.id,"scrap"),DISPATCH_COOLDOWN_SECONDS);
 advanceGame(loaded,0.5);
 assert.equal(jobOn(loaded,b.id,"scrap"),null,"reload does NOT bypass the cooldown");
 assert.equal(loaded.buildings.find(x=>x.id===b.id).inventory.scrap,20);
 const r=removeBuilding(loaded,b.id,"c2-dismantle");
 assert.equal(r.ok,true);assert.equal(r.code,"OK");
 assert.deepEqual(r.refund,{credits:72,scrap:31,stone:4});
 delete globalThis.localStorage;
});

test("cooldown: expiry restores normal dispatch — suppressed just before the window, re-reserved at it; conserved every tick",()=>{
 const g=frozenGame();
 const b=completed(g,"salvager","c3-build");
 b.inventory={scrap:20};
 const v=awaitJob(g,b.id,"sourceId");
 assert.equal(cancelFreight(g,v.id).ok,true);
 const base=freightTotals(g).totals;
 const cancelAt=g.elapsed;
 // Advance to JUST BEFORE expiry: still suppressed, totals conserved each step.
 for(let i=0;i<29;i++){
  advanceGame(g,0.5);
  assert.deepEqual(freightTotals(g).totals,base,"conserved every tick during cooldown");
  assert.equal(jobOn(g,b.id,"scrap"),null,"suppressed at elapsed "+g.elapsed);
 }
 assert.equal(g.elapsed,cancelAt+14.5);
 assert.equal(dispatchCooldownRemaining(g,b.id,"scrap"),0.5);
 // Cross the expiry: normal dispatch resumes and re-reserves the SAME pair.
 advanceGame(g,0.5);
 assert.equal(g.elapsed,cancelAt+DISPATCH_COOLDOWN_SECONDS);
 const re=jobOn(g,b.id,"scrap");
 assert.ok(re,"dispatch restored exactly at expiry");
 assert.equal(re.job.amount,15);assert.equal(b.inventory.scrap,5);
 assert.deepEqual(freightTotals(g).totals,base,"re-reservation conserves totals");
 assert.equal(dispatchCooldownRemaining(g,b.id,"scrap"),0,"expired entry no longer active");
});

test("cooldown: per source+resource PAIR — other resources/sources dispatch normally; RESERVED hard block still holds for a live sibling job",()=>{
 const g=frozenGame();
 const a=completed(g,"salvager","c4-a");
 const b=completed(g,"salvager","c4-b");
 a.inventory={scrap:20,iron:10};
 b.inventory={scrap:20};
 const v1=awaitJob(g,a.id,"sourceId","scrap");
 const v2=awaitJob(g,a.id,"sourceId","iron");
 const v3=awaitJob(g,b.id,"sourceId","scrap");
 assert.equal(v1.job.amount,15);assert.equal(v2.job.amount,10);assert.equal(v3.job.amount,15);
 assert.equal(cancelFreight(g,v1.id).ok,true); // cool ONLY a:scrap
 advanceGame(g,0.5);
 assert.equal(jobOn(g,a.id,"scrap"),null,"cancelled pair stays cooled");
 assert.ok(jobOn(g,a.id,"iron"),"same source, DIFFERENT resource still dispatches");
 assert.ok(jobOn(g,b.id,"scrap"),"different source, same resource still dispatches");
 // The hard block is NOT weakened: a live sibling job (a:iron) still refuses.
 const blocked=removeBuilding(g,a.id);
 assert.equal(blocked.ok,false);assert.equal(blocked.code,"RESERVED");
 // Cancel the iron job too: a:iron now cools on its OWN key while a:scrap stays
 // cooled — proving the key is the pair, not the source or the resource alone.
 assert.equal(cancelFreight(g,v2.id).ok,true);
 assert.equal(dispatchCooldownRemaining(g,a.id,"iron"),DISPATCH_COOLDOWN_SECONDS);
 assert.ok(dispatchCooldownRemaining(g,a.id,"scrap")>0,"a:scrap cooldown untouched by the iron cancel");
 advanceGame(g,0.5);
 assert.equal(jobOn(g,a.id,"scrap"),null,"a:scrap still cooled");
 assert.equal(jobOn(g,a.id,"iron"),null,"a:iron cooled by its own fresh cancel");
});

test("cooldown: depot-sourced resupply cancel cools bank:resource; expiry restores resupply",()=>{
 const g=createGame();
 // Keep the starter furnace fed so the PLAYER furnace is the only resupply dest.
 g.buildings.find(b=>b.id===4).inventory={iron:40,fuel:20};
 const b=completed(g,"furnace","c5-build");
 const v=awaitJob(g,b.id,"destId");
 assert.equal(v.job.sourceId,2,"resupply sources from the depot");
 assert.equal(v.job.resource,"iron");
 const amount=v.job.amount;
 const bankBefore={...g.bank};
 assert.equal(cancelFreight(g,v.id).ok,true);
 assert.equal(g.bank.iron,bankBefore.iron+amount,"returned to the BANK exactly once");
 assert.equal(dispatchCooldownRemaining(g,2,"iron"),DISPATCH_COOLDOWN_SECONDS);
 advanceGame(g,0.5);
 assert.equal(g.vehicles.some(v=>v.job&&v.job.sourceId===2&&v.job.resource==="iron"),false,
  "depot iron resupply cooled after cancel");
 // Expiry restores the resupply to the same player furnace.
 for(let i=0;i<40;i++){
  if(g.vehicles.some(v=>v.job&&v.job.destId===b.id&&v.job.resource==="iron"))break;
  advanceGame(g,0.5);
 }
 const re=g.vehicles.find(v=>v.job&&v.job.destId===b.id&&v.job.resource==="iron");
 assert.ok(re,"resupply restored after the window");
 assert.equal(re.job.sourceId,2);
});

test("cooldown: reload sanitization — tampered far-future expiry clamps to one window; malformed/expired entries drop; legacy saves load clean",()=>{
 const m=store();
 const g=frozenGame();
 const b=completed(g,"salvager","c6-build");
 b.inventory={scrap:20};
 const v=awaitJob(g,b.id,"sourceId");
 assert.equal(cancelFreight(g,v.id).ok,true);
 const elapsed=g.elapsed;
 persist(g);
 // Tamper the persisted save: a hostile permanent lock, junk keys, expired rows.
 const raw=JSON.parse(m.get(SAVE_KEY));
 raw.dispatchCooldowns={
  [b.id+":scrap"]:elapsed+1e9,          // hostile far-future -> clamp to ONE window
  "not-a-key":elapsed+10,               // malformed key -> drop
  "99:scrap":"soon",                    // non-numeric expiry -> drop
  "98:iron":elapsed-1,                  // already expired -> drop
  "97:copper":null                      // null expiry -> drop
 };
 m.set(SAVE_KEY,JSON.stringify(raw));
 const loaded=readGame();
 assert.deepEqual(loaded.dispatchCooldowns,{[b.id+":scrap"]:elapsed+DISPATCH_COOLDOWN_SECONDS},
  "only the valid pair survives, clamped to one window");
 advanceGame(loaded,0.5);
 assert.equal(jobOn(loaded,b.id,"scrap"),null,"clamped cooldown still suppresses");
 // The clamp means a hostile save can never lock dispatch forever: expiry hits.
 advanceGame(loaded,DISPATCH_COOLDOWN_SECONDS);
 assert.ok(jobOn(loaded,b.id,"scrap"),"dispatch restored after the clamped window");
 // Legacy save WITHOUT the field loads clean (fresh default, no throw).
 const legacy=JSON.parse(m.get(SAVE_KEY));
 delete legacy.dispatchCooldowns;
 m.set(SAVE_KEY,JSON.stringify(legacy));
 const loaded2=readGame();
 assert.deepEqual(loaded2.dispatchCooldowns,{},"legacy save defaults to no cooldowns");
 delete globalThis.localStorage;
});

test("cooldown: IDLE/MISSING cancels record nothing; a fresh game starts with an empty registry",()=>{
 const g=frozenGame();
 assert.deepEqual(g.dispatchCooldowns,{},"createGame ships an empty cooldown registry");
 const idle=cancelFreight(g,1);
 assert.equal(idle.ok,false);assert.equal(idle.code,"IDLE");
 const missing=cancelFreight(g,999);
 assert.equal(missing.ok,false);assert.equal(missing.code,"MISSING");
 assert.deepEqual(g.dispatchCooldowns,{},"no-op cancels never cool a pair");
 advanceGame(g,0.5);
 assert.deepEqual(g.dispatchCooldowns,{},"dispatch itself never creates cooldowns");
});
