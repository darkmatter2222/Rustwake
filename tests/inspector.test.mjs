import test from "node:test";
import assert from "node:assert/strict";
import {createGame,buildAt,removeBuilding,cancelConstruction,advanceGame,snapshot,powerStatus,checkSite} from "../src/simulation.js";
import {BLUEPRINTS,BUILDINGS} from "../src/content.js";
import {groundAtScreen} from "../src/camera.js";
import {inspectorState,upgradeEffect,dismantleRefund,dismantleGate,cancelPreview,refundEntries,
 projectGround,machineScreenRect,panelPlacement,rectsIntersect,frameSelection,
 readUxSettings,writeUxSettings,UX_SETTINGS_KEY,UX_DEFAULTS} from "../src/inspector.js";

const freshWith=(mutate)=>{const g=createGame();mutate?.(g);return g;};
const built=(g,type="furnace")=>{
 // Find a legal pad with the SAME pure validator the transaction uses; large
 // footprints (crane 2×3) and tier-gated blueprints need their own search.
 let site=null;
 for(let z=1;z<23&&!site;z++)for(let x=1;x<23;x++)
  if(checkSite(g,type,x,z,0).ok){site={x,z};break;}
 assert.ok(site,"no legal site for "+type);
 const r=buildAt(g,type,site.x,site.z,0);
 assert.equal(r.ok,true);
 g.buildings.find(b=>b.id===r.building.id).remaining=0;
 return r.building;
};

/* ---------------- state coverage: loading / empty / error / selected ---------------- */
test("inspector loading state when the game is not ready",()=>{
 assert.deepEqual(inspectorState(null,1),{kind:"loading"});
});
test("inspector error state for a missing or unknown selection",()=>{
 const g=createGame();
 const missing=inspectorState(g,999);
 assert.equal(missing.kind,"error");assert.equal(missing.code,"MISSING");
 g.buildings.push({id:50,type:"ghost",x:6,z:7,level:1,remaining:0,inventory:{},timer:0});
 assert.equal(inspectorState(g,50).code,"UNKNOWN");
});
test("selected state exposes status, recipe, stock, bay, construction, upgrade and dismantle",()=>{
 const g=createGame();
 const s=inspectorState(g,4); // starter furnace with iron/fuel cargo
 assert.equal(s.kind,"selected");
 assert.equal(s.def.id,"furnace");
 assert.equal(s.status.code,"OPERATING");
 assert.equal(s.recipe.cycle,5.5);
 assert.deepEqual(s.recipe.inputs,{iron:5,fuel:2});
 assert.deepEqual(s.recipe.effectiveOutputs,{steel:4});
 assert.equal(s.bay.connected,true);
 assert.equal(s.bay.facing,"SOUTH");
 assert.deepEqual(s.bay.footprint,{w:1,d:1});
 assert.ok(s.bay.reach<=3);
 assert.ok(s.stock.some(e=>e.id==="iron"&&e.amount===10));
 assert.equal(s.construction.active,false);
 assert.equal(s.upgrade.available,false);
 assert.ok(s.dismantle.entries.length>0);
});
test("inspector derivation never mutates the authoritative game",()=>{
 const g=createGame();
 const b=built(g); // transaction first; the read model must not change anything after
 const before=snapshot(g);
 inspectorState(g,4);inspectorState(g,1);inspectorState(g,999);inspectorState(g,b.id);
 dismantleRefund(BLUEPRINTS.furnace,b.inventory);
 dismantleGate(g,b);cancelPreview(g,b);upgradeEffect(BLUEPRINTS.furnace,1);
 assert.deepEqual(g,before);
});

/* ---------------- status derivation: processing / blocked variants ---------------- */
test("assembling (processing) state shows stage, countdown and full-refund cancel",()=>{
 const g=createGame();
 const r=buildAt(g,"salvager",6,7,0);
 const s=inspectorState(g,r.building.id);
 assert.equal(s.status.code,"ASSEMBLING");
 assert.equal(s.phase,"assembling");
 assert.equal(s.construction.active,true);
 assert.equal(s.construction.total,5);
 assert.equal(s.construction.cancel.allowed,true);
 assert.deepEqual(s.construction.cancel.refund,BLUEPRINTS.salvager.cost);
});
test("powerless state when grid demand exceeds supply",()=>{
 const g=freshWith(g=>{g.buildings=g.buildings.filter(b=>b.type!=="generator");});
 const s=inspectorState(g,4);
 assert.equal(s.status.code,"POWERLESS");
 assert.equal(s.status.tone,"danger");
 assert.match(s.status.detail,/MW/);
});
test("no-frontage state when the bay cannot reach a road",()=>{
 const g=freshWith(g=>{g.roads=[];});
 const s=inspectorState(g,4);
 assert.equal(s.status.code,"NO_FRONTAGE");
 assert.equal(s.bay.connected,false);
 assert.equal(s.bay.reach,null);
});
test("starved state lists the exact input shortfall and matches sim production",()=>{
 // No trucks: the starvation cross-check must be deterministic, not resupplied.
 const g=freshWith(g=>{const f=g.buildings.find(b=>b.id===4);f.inventory={iron:1,fuel:0};g.vehicles=[];});
 const s=inspectorState(g,4);
 assert.equal(s.status.code,"STARVED");
 assert.match(s.status.detail,/4 FE/);
 assert.match(s.status.detail,/2 FU/);
 // Authority cross-check: a starved furnace completes cycles but makes no steel
 // (the salvager keeps producing, so assert on the furnace itself).
 const f=g.buildings.find(b=>b.id===4);
 for(let i=0;i<40;i++)advanceGame(g,0.5);
 assert.equal(f.inventory.steel||0,0);
 assert.equal(inspectorState(g,4).status.code,"STARVED");
});
test("support structures report ONLINE, not a fake production cycle",()=>{
 const g=createGame();
 assert.equal(inspectorState(g,2).status.code,"ONLINE"); // depot
 assert.equal(inspectorState(g,3).recipe,null);           // generator has no cycle
 assert.match(inspectorState(g,3).status.detail,/12 MW/);
});
test("rotated crane inspector reports swapped footprint and rotated bay facing",()=>{
 const g=createGame();
 const crane=g.buildings.find(b=>b.type==="crane");
 crane.rot=1;
 const s=inspectorState(g,crane.id);
 assert.deepEqual(s.bay.footprint,{w:3,d:2});
 assert.equal(s.bay.facing,"EAST");
});

/* ---------------- upgrade effect: exact, honest, locked ---------------- */
test("upgrade effect is the exact advanceGame level multiplier for every producer",()=>{
 for(const def of BUILDINGS){
  const u=upgradeEffect(def,2);
  assert.equal(u.level,2);assert.equal(u.nextLevel,3);
  for(const [id,n] of Object.entries(def.outputs)){
   assert.equal(u.current[id],n*2);
   assert.equal(u.next[id],n*3);
   assert.equal(u.delta[id],n);
  }
  assert.equal(u.available,false);
  assert.ok(u.lockReason.length>10);
 }
});
test("upgrade preview matches authoritative level-scaled production",()=>{
 const g=createGame();
 const f=g.buildings.find(b=>b.id===4);
 f.level=2;f.inventory={iron:50,fuel:20};g.vehicles=[]; // keep cargo local for the exact assertion
 const s=inspectorState(g,4);
 assert.deepEqual(s.recipe.effectiveOutputs,{steel:8});
 assert.deepEqual(s.upgrade.next,{steel:12});
 const before=g.stats.produced;
 for(let i=0;i<60;i++)advanceGame(g,0.5);
 assert.ok(g.stats.produced>before);
 assert.ok(f.inventory.steel>=8,"level 2 furnace deposits 8 steel per cycle, exactly the preview");
});

/* ---------------- dismantle: preview MUST equal the authoritative refund ---------------- */
test("dismantle preview equals removeBuilding refund for every blueprint and cargo mix",()=>{
 const cases=[{},{iron:3},{steel:7,fuel:2},{scrap:1,iron:2,copper:3,stone:4,fuel:5,water:6,steel:7,alloy:8,gears:9,circuits:10,data:11}];
 for(const def of BUILDINGS)for(const inventory of cases){
  const g=createGame();
  g.tier=2; // every blueprint unlocked so each refund path is exercised
  for(const id of Object.keys(g.bank))g.bank[id]=100000; // pass the FUNDS gate for costly blueprints
  const b=built(g,def.id);
  b.inventory={...inventory};
  const s=inspectorState(g,b.id);
  const bankBefore={...g.bank};
  const r=removeBuilding(g,b.id);
  assert.equal(r.ok,true,def.id+" dismantle should succeed");
  assert.deepEqual(s.dismantle.refund,r.refund,def.id+" refund preview drifted from authority");
  for(const [id,n] of Object.entries(r.refund))
   assert.equal(g.bank[id],bankBefore[id]+n,"conservation: "+def.id+"/"+id);
 }
});
test("dismantle recovery is floor(40%) of cost plus 100% of cargo, never negative",()=>{
 const def=BLUEPRINTS.salvager; // credits 180, scrap 28, stone 12
 const refund=dismantleRefund(def,{scrap:5,iron:2});
 // floor(180*.4)=72 CR, floor(28*.4)=11 SC + 5 cargo = 16, floor(12*.4)=4 AG, 2 FE cargo.
 assert.deepEqual(refund,{credits:72,scrap:16,stone:4,iron:2});
 const entries=refundEntries(refund,def);
 assert.equal(entries.find(e=>e.id==="iron").source,"cargo");
 assert.equal(entries.find(e=>e.id==="credits").source,"recovery");
 assert.ok(Object.values(dismantleRefund(def,{})).every(n=>n>=0));
});
test("dismantle gate mirrors removeBuilding: protected starters and reserved trucks",()=>{
 const g=createGame();
 const s=inspectorState(g,1);
 assert.equal(s.dismantle.gate.allowed,false);
 assert.equal(s.dismantle.gate.code,"PROTECTED");
 const r=removeBuilding(g,1);
 assert.equal(r.ok,false);assert.equal(r.reason,s.dismantle.gate.reason);
 // Truck reservation blocks dismantling with the exact sim reason.
 const g2=createGame();
 const b=built(g2,"salvager");
 g2.vehicles[0].job={sourceId:b.id,destId:2,resource:"scrap",amount:3,phase:"toSource",route:[],segment:0,progress:0};
 const gate=dismantleGate(g2,b);
 assert.equal(gate.allowed,false);assert.equal(gate.code,"RESERVED");
 const r2=removeBuilding(g2,b.id);
 assert.equal(r2.ok,false);assert.equal(r2.reason,gate.reason);
 assert.equal(dismantleGate(g2,null).code,"MISSING");
});
test("cancel preview equals cancelConstruction full refund and rejects completed machines",()=>{
 const g=createGame();
 const r=buildAt(g,"crusher",6,7,0);
 const s=inspectorState(g,r.building.id);
 const bankBefore={...g.bank};
 const c=cancelConstruction(g,r.building.id);
 assert.equal(c.ok,true);
 assert.deepEqual(s.construction.cancel.refund,c.refund);
 for(const [id,n] of Object.entries(c.refund))assert.equal(g.bank[id],bankBefore[id]+n);
 const done=built(g,"salvager");
 const p=cancelPreview(g,done);
 assert.equal(p.allowed,false);assert.equal(p.code,"COMPLETE");
 assert.equal(cancelPreview(g,g.buildings[0]).code,"PROTECTED");
});

/* ---------------- non-obscuring geometry ---------------- */
test("projectGround round-trips groundAtScreen across yaw/elevation/zoom",()=>{
 const viewport={width:1440,height:900};
 for(const yaw of [0,45,137,359])for(const elevation of [20,35.264,80])for(const zoom of [0.2,1,12]){
  const camera={yaw,elevation,zoom,x:7,z:-4};
  for(const ground of [{x:0,z:0},{x:-31.5,z:22.75},{x:40,z:-40}]){
   const px=projectGround(camera,ground,viewport);
   const back=groundAtScreen(camera,px,viewport);
   assert.ok(Math.hypot(back.x-ground.x,back.z-ground.z)<1e-6,
    `round trip failed yaw=${yaw} el=${elevation} z=${zoom}`);
  }
 }
});
test("machine screen rect contains the projected pivot and grows with height",()=>{
 const g=createGame(),b=g.buildings.find(x=>x.type==="crane");
 const viewport={width:1440,height:900},camera={yaw:45,elevation:35.264,zoom:1.15,x:0,z:0};
 const r=machineScreenRect(camera,b,viewport);
 const fpCenter=projectGround(camera,{x:(b.x-12+1)*3.5,z:(b.z-12+1.5)*3.5},viewport);
 assert.ok(r.width>0&&r.height>0);
 assert.ok(fpCenter.x>=r.x&&fpCenter.x<=r.x+r.width);
 assert.ok(r.height>3.5*1.15,"crane silhouette includes mast height");
});
test("desktop placement docks opposite the machine and never intersects it",()=>{
 const viewport={width:1440,height:900},panelSize={width:356,height:520};
 const leftMachine={x:120,y:300,width:90,height:110};
 const a=panelPlacement({machineRect:leftMachine,viewport,panelSize});
 assert.equal(a.side,"right");assert.equal(a.obscured,false);
 assert.equal(rectsIntersect(leftMachine,a.panelRect),false);
 const rightMachine={x:1200,y:300,width:90,height:110};
 const b=panelPlacement({machineRect:rightMachine,viewport,panelSize});
 assert.equal(b.side,"left");assert.equal(b.obscured,false);
 // Centered machine: both sides clear, deterministic pick, still no overlap.
 const c=panelPlacement({machineRect:{x:680,y:300,width:80,height:100},viewport,panelSize});
 assert.equal(c.obscured,false);
});
test("explicit persisted side preference is honored but occlusion stays honest",()=>{
 const viewport={width:1440,height:900},panelSize={width:356,height:520};
 const machine={x:120,y:300,width:90,height:110};
 const p=panelPlacement({machineRect:machine,viewport,panelSize,preference:"left"});
 assert.equal(p.side,"left");
 assert.equal(p.obscured,true); // preference can conflict; UI must offer Focus
 assert.ok(p.focusPixel.x>viewport.width/2);
});
test("phone placement reports occlusion and a focus pixel in the clear upper zone",()=>{
 const viewport={width:390,height:844},panelSize={width:378,height:380};
 const low={x:150,y:650,width:80,height:90};
 const p=panelPlacement({machineRect:low,viewport,panelSize,isPhone:true,bottomOffset:95});
 assert.equal(p.side,"bottom");assert.equal(p.obscured,true);
 assert.ok(p.focusPixel.y<p.panelRect.y,"focus pixel must sit above the sheet");
 const high={x:150,y:180,width:80,height:90};
 assert.equal(panelPlacement({machineRect:high,viewport,panelSize,isPhone:true,bottomOffset:95}).obscured,false);
});
test("frameSelection pins the machine pivot to the focus pixel via camera math only",()=>{
 const g=createGame(),b=g.buildings.find(x=>x.id===4);
 const viewport={width:390,height:844};
 const camera={yaw:45,elevation:35.264,zoom:1,x:0,z:0};
 const focus={x:195,y:220};
 const next=frameSelection(camera,b,viewport,focus);
 const fp=projectGround(next,{x:(b.x-12+.5)*3.5,z:(b.z-12+.5)*3.5},viewport);
 assert.ok(Math.hypot(fp.x-focus.x,fp.y-focus.y)<1e-6);
 assert.equal(next.yaw,camera.yaw);assert.equal(next.zoom,camera.zoom); // pan only
 assert.deepEqual(camera,{yaw:45,elevation:35.264,zoom:1,x:0,z:0});   // input untouched
});
test("reframe after orbit keeps the machine clear of the sheet at every quarter turn",()=>{
 const g=createGame(),b=g.buildings.find(x=>x.id===4);
 const viewport={width:1440,height:900},panelSize={width:356,height:520};
 let camera={yaw:45,elevation:35.264,zoom:3,x:0,z:0}; // zoomed in: orbit really pushes the machine under a dock side
 for(let q=0;q<4;q++){
  camera={...camera,yaw:(camera.yaw+90)%360};
  const m=machineScreenRect(camera,b,viewport);
  let p=panelPlacement({machineRect:m,viewport,panelSize});
  if(p.obscured){camera=frameSelection(camera,b,viewport,p.focusPixel);
   p=panelPlacement({machineRect:machineScreenRect(camera,b,viewport),viewport,panelSize});}
  assert.equal(p.obscured,false,"machine obscured after orbit "+q);
 }
});

/* ---------------- persisted settings ---------------- */
const memStorage=()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),_m:m};};
test("ux settings round-trip, sanitize and survive corrupt or throwing storage",()=>{
 const s=memStorage();
 assert.deepEqual(readUxSettings(s),{...UX_DEFAULTS});
 const next=writeUxSettings(s,{autoFrame:false,panelSide:"right"});
 assert.deepEqual(next,{autoFrame:false,panelSide:"right"});
 assert.deepEqual(readUxSettings(s),next);
 assert.equal(JSON.parse(s._m.get(UX_SETTINGS_KEY)).panelSide,"right");
 // Partial patch preserves the other setting.
 assert.deepEqual(writeUxSettings(s,{autoFrame:true}),{autoFrame:true,panelSide:"right"});
 // Corrupt JSON and hostile values fall back to safe defaults.
 s._m.set(UX_SETTINGS_KEY,"{not json");
 assert.deepEqual(readUxSettings(s),{...UX_DEFAULTS});
 s._m.set(UX_SETTINGS_KEY,JSON.stringify({autoFrame:"yes",panelSide:"under"}));
 assert.deepEqual(readUxSettings(s),{...UX_DEFAULTS});
 const throwing={getItem(){throw Error("denied");},setItem(){throw Error("denied");}};
 assert.deepEqual(readUxSettings(throwing),{...UX_DEFAULTS});
 assert.deepEqual(writeUxSettings(throwing,{panelSide:"left"}),{autoFrame:true,panelSide:"left"});
 assert.deepEqual(readUxSettings(null),{...UX_DEFAULTS});
});
test("inspector reads power from the authoritative grid, not a private estimate",()=>{
 const g=createGame();
 const s=inspectorState(g,4);
 const p=powerStatus(g);
 assert.equal(s.power.supply,p.supply);
 assert.equal(s.power.gridDemand,p.demand);
 assert.equal(s.power.available,p.available);
});