// Rustwake V2 — #370 explicit world grid occupancy + buildable-terrain validation.
// Same-seed determinism, exact rejection codes/reasons, exact 3D footprint/pivot,
// free-selection bank safety, conserved build/cancel/reject ledger, saved-state fixture.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {
 createGame,readGame,persist,buildAt,cancelConstruction,removeBuilding,roadLine,advanceGame,
 checkSite,buildingAt,footprintCells,footprintDims,bayCells,worldFootprint,terrainFor,terrainAt,
 ownedParcels,parcelId,surveyed,facingName,normalizeRot,SURVEY_MIN,SURVEY_MAX,ROAD_REACH,PARCEL_SIZE
} from "../src/simulation.js";
import {BLUEPRINTS,INITIAL_BANK,WORLD_SIZE,CELL,SAVE_KEY} from "../src/content.js";

const REASONS={
 UNKNOWN:"Unknown blueprint",
 LOCKED:"Unlock this blueprint by growing your industrial rank",
 BOUNDS:"Beyond the surveyed frontier",
 UNSURVEYED:"Site is unsurveyed — stay inside the surveyed frontier",
 PARCEL:"Parcel is not claimed — advance your industrial rank to expand",
 TERRAIN:"Solid rock outcrop — machines need graded ground",
 SLOPE:"Uneven ground — the footprint must sit level",
 COLLISION:"A machine occupies this site",
 ROAD:"Move the site off the road",
 BAY:"Loading bay blocked — keep the approach clear of machines",
 FRONTAGE:"No road frontage — lay a road within "+ROAD_REACH+" cells of the loading bay",
 FUNDS:"Not enough materials — review the blueprint costs"
};
const expectFail=(g,type,x,z,rot,code)=>{
 const r=checkSite(g,type,x,z,rot);
 assert.equal(r.ok,false,`expected ${code} at ${type} ${x},${z} rot${rot||0}, got ${JSON.stringify(r)}`);
 assert.equal(r.code,code);
 assert.equal(r.reason,REASONS[code]);
 return r;
};

test("same-seed terrain and full-grid validation are deterministic",()=>{
 const a=createGame(),b=createGame();
 assert.equal(a.seed,b.seed);
 assert.deepEqual(terrainFor(a.seed),terrainFor(b.seed));
 assert.deepEqual([...terrainFor(a.seed).entries()],[...terrainFor(b.seed).entries()]);
 for(const type of ["salvager","crane"]){
  for(let z=-1;z<=WORLD_SIZE;z++)for(let x=-1;x<=WORLD_SIZE;x++){
   assert.deepEqual(checkSite(a,type,x,z,0),checkSite(b,type,x,z,0),`divergence at ${type} ${x},${z}`);
  }
 }
 // A different seed must actually change the raw terrain (not a constant map).
 const other=[...terrainFor(9999).entries()];
 assert.notDeepEqual(other,[...terrainFor(a.seed).entries()]);
 // Road corridors + starter pads are graded flat on every seed.
 for(const seed of [1,4073,9999]){
  assert.equal(terrainAt(seed,11,10).h,0,"road corridor graded");
  assert.equal(terrainAt(seed,7,9).h,0,"starter salvager pad graded");
 }
});

test("crane 2x3 footprint cells, dims and bay are exact for all four rotations",()=>{
 const g=createGame();
 assert.deepEqual(footprintDims("crane",0),{w:2,d:3});
 assert.deepEqual(footprintDims("crane",1),{w:3,d:2});
 assert.deepEqual(footprintDims("crane",2),{w:2,d:3});
 assert.deepEqual(footprintDims("crane",3),{w:3,d:2});
 assert.deepEqual(footprintCells("crane",15,5,0),[
  {x:15,z:5},{x:16,z:5},{x:15,z:6},{x:16,z:6},{x:15,z:7},{x:16,z:7}]);
 assert.deepEqual(footprintCells("crane",7,1,1),[
  {x:7,z:1},{x:8,z:1},{x:9,z:1},{x:7,z:2},{x:8,z:2},{x:9,z:2}]);
 assert.deepEqual(bayCells("crane",15,5,0),[{x:15,z:8},{x:16,z:8}]); // SOUTH
 assert.deepEqual(bayCells("crane",7,1,1),[{x:10,z:1},{x:10,z:2}]);  // EAST
 assert.deepEqual(bayCells("crane",7,1,2),[{x:7,z:0},{x:8,z:0}]);    // NORTH
 assert.deepEqual(bayCells("crane",7,1,3),[{x:6,z:1},{x:6,z:2}]);    // WEST
 assert.equal(facingName(0),"SOUTH");assert.equal(facingName(1),"EAST");
 assert.equal(facingName(2),"NORTH");assert.equal(facingName(3),"WEST");
 assert.equal(normalizeRot(-1),3);assert.equal(normalizeRot(5),1);assert.equal(normalizeRot(1.5),0);
 // Anchor cell stays occupied under every rotation; buildingAt hits non-anchor cells.
 for(let r=0;r<4;r++)assert.ok(footprintCells("crane",7,1,r).some(c=>c.x===7&&c.z===1));
 assert.equal(buildingAt(g,16,6)?.type,"crane"); // starter crane non-anchor cell
 assert.equal(buildingAt(g,17,6),null);
});

test("worldFootprint gives the exact 3D pivot, AABB and rotation for the renderer",()=>{
 const wf0=worldFootprint("crane",15,5,0);
 assert.deepEqual(wf0.base,{w:2,d:3});
 assert.deepEqual(wf0.dims,{w:2,d:3});
 assert.equal(wf0.rotationY,0);
 assert.deepEqual(wf0.pivot,{x:14,y:0,z:-19.25});
 assert.deepEqual(wf0.min,{x:10.5,y:0,z:-24.5});
 assert.deepEqual(wf0.max,{x:17.5,y:0,z:-14});
 assert.deepEqual(wf0.size,{x:2*CELL,z:3*CELL});
 const wf1=worldFootprint("crane",7,1,1);
 assert.deepEqual(wf1.dims,{w:3,d:2});
 assert.equal(wf1.rotationY,Math.PI/2);
 assert.deepEqual(wf1.pivot,{x:-12.25,y:0,z:-35});
 assert.deepEqual(wf1.min,{x:-17.5,y:0,z:-38.5});
 assert.deepEqual(wf1.max,{x:-7,y:0,z:-31.5});
 assert.deepEqual(wf1.size,{x:3*CELL,z:2*CELL});
 // Pivot is the AABB center at ground level for every rotation.
 for(let r=0;r<4;r++){
  const wf=worldFootprint("crane",9,9,r);
  assert.equal(wf.pivot.x,(wf.min.x+wf.max.x)/2);
  assert.equal(wf.pivot.z,(wf.min.z+wf.max.z)/2);
  assert.equal(wf.pivot.y,0);
  assert.equal(wf.rotationY,r*Math.PI/2);
 }
});

test("every rejection carries its exact machine code and player reason (seed 4073)",()=>{
 const g=createGame();
 expectFail(g,"warp-gate",6,7,0,"UNKNOWN");
 expectFail(g,"fabricator",6,7,0,"LOCKED");       // tier 2 blueprint at tier 0
 expectFail(g,"salvager",-1,9,0,"BOUNDS");
 expectFail(g,"salvager",0,9,0,"UNSURVEYED");    // outer survey ring
 expectFail(g,"salvager",7,18,0,"PARCEL");       // South Flats unclaimed at tier 0
 expectFail(g,"salvager",2,1,0,"TERRAIN");       // deterministic rock outcrop
 expectFail(g,"crane",4,1,0,"SLOPE");            // mixed heights under 2x3 pad
 expectFail(g,"salvager",7,9,0,"COLLISION");     // starter salvager anchor
 expectFail(g,"salvager",16,6,0,"COLLISION");    // starter crane NON-anchor cell
 expectFail(g,"salvager",8,8,0,"ROAD");
 expectFail(g,"salvager",7,10,0,"BAY");          // starter salvager approach row
 expectFail(g,"salvager",3,3,0,"FRONTAGE");      // no road within bay reach
 const drained=createGame();
 for(const k of Object.keys(drained.bank))drained.bank[k]=0;
 expectFail(drained,"salvager",6,7,0,"FUNDS");
 // Survey ring + parcel geometry constants.
 assert.equal(SURVEY_MIN,1);assert.equal(SURVEY_MAX,WORLD_SIZE-2);
 assert.equal(surveyed(0,9),false);assert.equal(surveyed(1,9),true);
 assert.equal(parcelId(7,18),2);assert.deepEqual(ownedParcels({tier:0}),[0,1]);
 assert.deepEqual(ownedParcels({tier:1}),[0,1,2]);assert.deepEqual(ownedParcels({tier:2}),[0,1,2,3]);
 const claimed=createGame();claimed.tier=1;
 assert.notEqual(checkSite(claimed,"salvager",7,18,0).code,"PARCEL");
 // Legal sites validate with exact cells/bay/dims/rot.
 const ok=checkSite(g,"salvager",6,7,0);
 assert.equal(ok.ok,true);assert.equal(ok.code,"OK");
 assert.deepEqual(ok.cells,[{x:6,z:7}]);assert.deepEqual(ok.bay,[{x:6,z:8}]);
 assert.deepEqual(ok.dims,{w:1,d:1});assert.equal(ok.rot,0);
 assert.equal(checkSite(g,"salvager",7,4,1).ok,true);
 g.bank.credits=9000;g.bank.steel=200;g.bank.gears=50; // crane cost exceeds the starter bank
 assert.equal(checkSite(g,"crane",7,1,1).ok,true); // 3x2 pad, EAST bay reaches road x=11
});

test("free selection and hover validation never deduct bank stock or mutate state",()=>{
 const g=createGame();
 const before=JSON.stringify(g);
 for(const type of ["salvager","crane","depot","furnace"]){
  for(let r=0;r<4;r++)for(let z=-1;z<=WORLD_SIZE;z++)for(let x=-1;x<=WORLD_SIZE;x++){
   checkSite(g,type,x,z,r);
  }
 }
 assert.equal(JSON.stringify(g),before,"checkSite must be pure over the whole grid");
 // Even a rejected confirmed attempt leaves stock untouched.
 const bankBefore={...g.bank};
 const r=buildAt(g,"salvager",7,9,0);
 assert.equal(r.ok,false);assert.equal(r.code,"COLLISION");
 assert.deepEqual(g.bank,bankBefore);
});

test("failed transaction is ledgered with zero cost/refund and no stock movement",()=>{
 const g=createGame();
 const bankBefore={...g.bank},count=g.buildings.length,ledgerBefore=g.ledger.length;
 const r=buildAt(g,"salvager",3,3,0); // FRONTAGE
 assert.equal(r.ok,false);assert.equal(r.code,"FRONTAGE");assert.equal(r.reason,REASONS.FRONTAGE);
 assert.deepEqual(g.bank,bankBefore);
 assert.equal(g.buildings.length,count);
 assert.equal(g.ledger.length,ledgerBefore+1);
 const e=g.ledger.at(-1);
 assert.equal(e.kind,"reject");assert.equal(e.code,"FRONTAGE");assert.equal(e.type,"salvager");
 assert.deepEqual(e.cost,{});assert.deepEqual(e.refund,{});
});

test("build spends exactly once; cancel refunds in full; ledger conserves source/stock",()=>{
 const g=createGame();
 const pre={...g.bank};
 const cost=BLUEPRINTS.salvager.cost;
 const r=buildAt(g,"salvager",6,7,0);
 assert.equal(r.ok,true);assert.equal(r.code,"OK");
 const charged={...pre};
 for(const [id,n] of Object.entries(cost))charged[id]-=n;
 assert.deepEqual(g.bank,charged,"exactly one charge of blueprint cost");
 const id=r.building.id;
 assert.equal(r.building.rot,0);assert.equal(r.building.remaining,5);
 const buildEntry=g.ledger.at(-1);
 assert.equal(buildEntry.kind,"build");assert.deepEqual(buildEntry.cost,cost);
 // Double-build on the same cell is refused without a second charge.
 const dup=buildAt(g,"salvager",6,7,0);
 assert.equal(dup.ok,false);assert.equal(dup.code,"COLLISION");
 assert.deepEqual(g.bank,charged);
 // Cancel mid-assembly: full refund, bank returns to the exact pre-build state.
 const c=cancelConstruction(g,id);
 assert.equal(c.ok,true);assert.equal(c.code,"OK");assert.deepEqual(c.refund,cost);
 assert.deepEqual(g.bank,pre,"cancel restores the exact pre-build bank");
 assert.equal(g.buildings.some(b=>b.id===id),false);
 const cancelEntry=g.ledger.at(-1);
 assert.equal(cancelEntry.kind,"cancel");
 assert.deepEqual(cancelEntry.refund,buildEntry.cost,"ledger conserves build cost == cancel refund");
 assert.deepEqual(cancelEntry.cost,{});
 // Guard rails: missing, protected starter, completed assembly.
 assert.equal(cancelConstruction(g,id).code,"MISSING");
 assert.equal(cancelConstruction(g,1).code,"PROTECTED");
 const r2=buildAt(g,"salvager",6,7,0);
 advanceGame(g,6); // assembly completes (remaining 5 -> 0)
 assert.equal(r2.building.remaining<=0,true);
 assert.equal(cancelConstruction(g,r2.building.id).code,"COMPLETE");
 // Completed machine salvages at 40% floor + inventory, ledgered.
 const bankAtSalvage={...g.bank};
 const s=removeBuilding(g,r2.building.id);
 assert.equal(s.ok,true);
 const salvageEntry=g.ledger.at(-1);
 assert.equal(salvageEntry.kind,"salvage");
 for(const [res,n] of Object.entries(s.refund))assert.equal(g.bank[res],bankAtSalvage[res]+n);
 assert.deepEqual(salvageEntry.refund,s.refund);
 // Ledger is capped at 64 entries.
 for(let i=0;i<80;i++)buildAt(g,"salvager",3,3,0);
 assert.equal(g.ledger.length<=64,true);
});

test("roads refuse to pave through any machine footprint cell",()=>{
 const g=createGame();
 const r=roadLine(g,{x:16,z:6},{x:18,z:6}); // (16,6) is a starter crane cell
 assert.equal(r.ok,false);
 assert.equal(r.reason,"Road intersects a machine; route around it");
 const bankBefore={...g.bank},roadsBefore=g.roads.length;
 assert.deepEqual(g.bank,bankBefore);assert.equal(g.roads.length,roadsBefore);
});

test("saved-state fixture roundtrips rotation, ledger and conserved bank",()=>{
 const path=fileURLToPath(new URL("./fixtures/save-v2-occupancy.json",import.meta.url));
 const fixture=JSON.parse(readFileSync(path,"utf8"));
 assert.equal(fixture.version,2);
 // Replay the fixture's real construction history through the public API.
 const replay=createGame();
 replay.tier=1;replay.bank.credits=3000;replay.bank.steel=120;replay.bank.gears=30;
 const rc=buildAt(replay,"crane",7,1,1);assert.equal(rc.ok,true);
 const rs=buildAt(replay,"salvager",11,2,2);assert.equal(rs.ok,true);
 advanceGame(replay,2);
 assert.deepEqual(fixture.bank,replay.bank,"fixture bank is conserved by real API replay");
 assert.deepEqual(fixture.ledger,replay.ledger);
 assert.equal(fixture.buildings.length,8);
 const crane=fixture.buildings.find(b=>b.type==="crane"&&b.id>6);
 const salv=fixture.buildings.find(b=>b.type==="salvager"&&b.id>6);
 assert.equal(crane.rot,1);assert.deepEqual({x:crane.x,z:crane.z},{x:7,z:1});
 assert.equal(salv.rot,2);assert.deepEqual({x:salv.x,z:salv.z},{x:11,z:2});
 assert.equal(salv.remaining,3,"mid-assembly state preserved");
 // Load through readGame with a fresh timestamp (no offline advance).
 const store=new Map();
 globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
 const fresh={...fixture,lastSavedAt:Date.now()};
 store.set(SAVE_KEY,JSON.stringify(fresh));
 const loaded=readGame();
 assert.equal(loaded.version,2);
 assert.deepEqual(loaded.bank,replay.bank);
 assert.deepEqual(loaded.ledger,replay.ledger);
 assert.equal(loaded.buildings.find(b=>b.id===crane.id).rot,1);
 assert.equal(loaded.buildings.find(b=>b.id===salv.id).rot,2);
 assert.equal(loaded.buildings.find(b=>b.id===salv.id).remaining,3);
 // persist -> readGame keeps rotation + ledger intact.
 loaded.buildings.find(b=>b.id===salv.id).rot=3;
 persist(loaded);
 const again=readGame();
 assert.equal(again.buildings.find(b=>b.id===salv.id).rot,3);
 assert.deepEqual(again.ledger,loaded.ledger);
 // Legacy v2 saves without rot/ledger default safely (player saves preserved).
 const legacy=JSON.parse(JSON.stringify(fresh));
 delete legacy.ledger;
 for(const b of legacy.buildings)delete b.rot;
 store.set(SAVE_KEY,JSON.stringify(legacy));
 const migrated=readGame();
 assert.deepEqual(migrated.ledger,[]);
 assert.ok(migrated.buildings.every(b=>b.rot===0));
 assert.equal(migrated.buildings.length,8);
 // Version-1 (old format) falls back to a fresh yard, never crashes.
 store.set(SAVE_KEY,JSON.stringify({...fixture,version:1}));
 const reset=readGame();
 assert.equal(reset.buildings.length,6);assert.deepEqual(reset.ledger,[]);
 // Corrupt JSON falls back safely.
 store.set(SAVE_KEY,"{not json");
 assert.equal(readGame().version,2);
 delete globalThis.localStorage;
});
