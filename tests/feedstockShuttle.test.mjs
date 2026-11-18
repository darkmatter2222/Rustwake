// #575: a machine's own feedstock is never hauled OUT as an "output".
// Measured defect (fresh untouched yard, 660s, zero player input, main f0acf5a2):
// the starter furnace's iron 10 / fuel 7 qualified as priority-1 output candidates
// (the old rule was ANY inventory >= 3), were hauled to the bank, then re-delivered
// as priority-3 input — 33 iron + 34 fuel shuttle pickups, 583 wasted delivered
// units on the throughput-saturated 3-truck starter fleet (#280). Product ruling
// #567 (comments 6956801701 / 6956802181) approved removing the shuttle (#575).
// Remedy: deliveryCandidates skips any inventory resource that is the machine's
// own blueprint input. Input resupply (priority 3) and produced-output export are
// untouched. Rollback control: the fresh-yard assertions below FAIL at f0acf5a2
// (the shuttle reserves furnace iron on the very first substep).
import test from "node:test";
import assert from "node:assert/strict";
import {createGame,advanceGame,freightTotals} from "../src/simulation.js";
import {BLUEPRINTS,INITIAL_BANK} from "../src/content.js";

const ZERO_BANK=Object.fromEntries(Object.keys(INITIAL_BANK).map(k=>[k,0]));

test("fresh untouched yard: furnace feedstock is never hauled out, resupply and steel export still work",()=>{
 const g=createGame();
 const furnace=g.buildings.find(b=>b.type==="furnace");
 const depot=g.buildings.find(b=>b.type==="depot");
 assert.deepEqual(furnace.inventory,{iron:10,fuel:7},"starter feedstock present");
 let feedstockJobs=0,feedstockFreight=0,resupplyIron=0,steelJobs=0;
 for(let t=0;t<180;t+=0.5){
  advanceGame(g,0.5);
  for(const v of g.vehicles){
   const j=v.job;
   if(!j)continue;
   if(j.sourceId===furnace.id&&(j.resource==="iron"||j.resource==="fuel"))feedstockJobs++;
   if(j.sourceId===depot.id&&j.destId===furnace.id&&j.resource==="iron")resupplyIron++;
   if(j.sourceId===furnace.id&&j.resource==="steel")steelJobs++;
  }
  for(const e of g.freightLedger)
   if(e.sourceId===furnace.id&&(e.resource==="iron"||e.resource==="fuel"))feedstockFreight++;
  const ft=freightTotals(g);
  assert.ok(ft.reserved>=0&&ft.onboard>=0,"freight ledger never goes negative");
 }
 assert.equal(feedstockJobs,0,"no truck ever reserves furnace iron/fuel as output (pre-fix: shuttle from substep 1)");
 assert.equal(feedstockFreight,0,"no freight ledger event ever moves furnace feedstock to the bank");
 assert.ok(resupplyIron>0,"priority-3 iron resupply bank->furnace still happens once the buffer draws down");
 assert.ok(steelJobs>0,"produced furnace steel is still exported to the bank");
 assert.ok(g.bank.steel>INITIAL_BANK.steel,"steel actually reaches the bank");
 // resupplyIron>0 above also proves the buffer drew down below n*2 by SMELTING
 // (resupply only fires when have<n*2) — consumption, not haul-out, empties it.
});

test("the rule is general: a seeded input buffer >= 3 is not an output, but a produced output is",()=>{
 // Frozen yard (no generator -> no production), one idle truck, empty bank:
 // the ONLY possible job is the seeded inventory, so the candidate rule decides.
 const yard=(type,seed)=>{
  const g=createGame();
  g.buildings=g.buildings.filter(b=>b.id!==3);
  for(const b of g.buildings)b.inventory={};
  g.bank={...ZERO_BANK,credits:1000};
  const b=g.buildings.find(b=>b.type===type)||g.buildings.find(b=>b.id===1);
  b.type=type;b.inventory={...seed};
  g.vehicles=g.vehicles.slice(0,1);
  g.vehicles[0].job=null;g.vehicles[0].cargo=null;
  return {g,b};
 };
 // Crusher consumes scrap (input 10): a scrap buffer of 20 must NOT be hauled out.
 const a=yard("crusher",{scrap:20});
 assert.ok("scrap" in BLUEPRINTS.crusher.inputs,"scrap is the crusher's own feedstock");
 advanceGame(a.g,2);
 assert.equal(a.g.vehicles[0].job,null,"crusher scrap feedstock is not an output candidate");
 // Crusher PRODUCES iron: an iron buffer of 20 IS an output and must be hauled.
 const b=yard("crusher",{iron:20});
 assert.ok(!("iron" in BLUEPRINTS.crusher.inputs),"iron is a crusher product, not feedstock");
 advanceGame(b.g,2);
 const j=b.g.vehicles[0].job;
 assert.ok(j,"crusher produced iron is still collected");
 assert.equal(j.sourceId,b.b.id);assert.equal(j.resource,"iron");
 // Furnace steel (product) exports; the same furnace's iron (feedstock) does not.
 const c=yard("furnace",{steel:20,iron:20});
 advanceGame(c.g,2);
 const k=c.g.vehicles[0].job;
 assert.ok(k,"furnace steel is collected");
 assert.equal(k.resource,"steel","only the produced steel is hauled, never the iron feedstock");
 assert.equal(c.b.inventory.iron,20,"furnace iron feedstock stays in the machine");
});
