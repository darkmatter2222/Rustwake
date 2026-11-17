import test from "node:test";
import assert from "node:assert/strict";
import {createGame,buildAt,removeBuilding,cancelConstruction,advanceGame,sell,snapshot,powerStatus,checkSite} from "../src/simulation.js";
import {BLUEPRINTS,RESOURCES,INITIAL_BANK} from "../src/content.js";
import {resourceStripState,LOCKED_RESOURCES,STRIP_SETTINGS_KEY,STRIP_DEFAULTS,readStripSettings,writeStripSettings} from "../src/resourceStrip.js";
import {readUxSettings,writeUxSettings,UX_SETTINGS_KEY} from "../src/inspector.js";

const freshWith=(mutate)=>{const g=createGame();mutate?.(g);return g;};
const built=(g,type="furnace")=>{
 let site=null;
 for(let z=1;z<23&&!site;z++)for(let x=1;x<23;x++)
  if(checkSite(g,type,x,z,0).ok){site={x,z};break;}
 assert.ok(site,"no legal site for "+type);
 const r=buildAt(g,type,site.x,site.z,0);
 assert.equal(r.ok,true);
 g.buildings.find(b=>b.id===r.building.id).remaining=0;
 return r.building;
};
const row=(s,id)=>{const r=s.rows.find(r=>r.id===id);assert.ok(r,"missing row "+id);return r;};
// Independent recomputation straight from the authoritative bags — the strip
// must mirror these EXACTLY (no ghost balances, no double counting).
const authority=(g,id)=>{
 const depot=Math.max(0,Number(g.bank[id]||0));
 const machines=g.buildings.reduce((a,b)=>a+Math.max(0,Number(b.inventory?.[id]||0)),0);
 const transit=g.vehicles.reduce((a,v)=>a+(v.job&&v.job.resource===id?Math.max(0,Number(v.job.amount)||0):0),0);
 return {depot,machines,transit,total:depot+machines+transit};
};
const mirror=(s,g)=>{for(const id of RESOURCES.map(r=>r.id)){
 const r=row(s,id),a=authority(g,id);
 assert.equal(r.depot,a.depot,id+" depot");
 assert.equal(r.machines,a.machines,id+" machines");
 assert.equal(r.reserved,a.transit,id+" reserved");
 assert.equal(r.total,a.total,id+" total");
}};

/* ---------------- states: loading / empty / locked ---------------- */
test("strip loading state when the game is not ready",()=>{
 assert.deepEqual(resourceStripState(null),{kind:"loading"});
});
test("fresh strip mirrors the authoritative bank and machine cargo exactly",()=>{
 const g=createGame();
 const s=resourceStripState(g);
 assert.equal(s.kind,"ready");
 assert.equal(s.rows.length,RESOURCES.length);
 mirror(s,g);
 assert.equal(row(s,"credits").depot,INITIAL_BANK.credits);
 assert.equal(row(s,"iron").machines,10); // starter furnace cargo
 assert.equal(row(s,"fuel").machines,7);
 assert.equal(row(s,"iron").total,INITIAL_BANK.iron+10);
 assert.equal(s.shortages.length,0); // starter furnace is fed
 assert.equal(s.power.available,true);
});
test("empty state is honest zero, not a fabricated balance",()=>{
 const g=freshWith(g=>{g.bank={};g.buildings.forEach(b=>b.inventory={});g.vehicles.forEach(v=>v.job=null);});
 const s=resourceStripState(g);
 mirror(s,g);
 // Zero stock everywhere: idle materials read empty; the starving furnace's
 // inputs read CRITICAL (a shortage outranks emptiness — actionable, not hidden).
 for(const r of s.rows)if(!r.locked&&r.need===0)assert.equal(r.state,"empty",r.id);
 assert.equal(row(s,"iron").state,"critical");
 assert.equal(row(s,"fuel").state,"critical");
 assert.equal(row(s,"scrap").total,0);
});
test("locked prestige rows are flagged with an honest reason, not earnable",()=>{
 const s=resourceStripState(createGame());
 for(const id of LOCKED_RESOURCES){
  const r=row(s,id);
  assert.equal(r.locked,true,id);
  assert.equal(r.state,"locked",id);
  assert.match(r.detail,/later progression/);
 }
 assert.equal(row(s,"credits").locked,false);
 assert.equal(row(s,"data").locked,false);
});
test("capacity is honestly null — the simulation exposes no storage cap",()=>{
 const s=resourceStripState(createGame());
 assert.equal(s.capacityExposed,false);
 for(const r of s.rows)assert.equal(r.capacity,null,r.id);
});

/* ---------------- non-mutation ---------------- */
test("strip derivation never mutates the authoritative game",()=>{
 const g=createGame();
 built(g);
 const before=snapshot(g);
 resourceStripState(g);resourceStripState(g);
 assert.deepEqual(g,before);
});

/* ---------------- reservations mirror real dispatch ---------------- */
test("reserved equals live truck jobs after real dispatch; depot take is exact",()=>{
 const g=freshWith(g=>{const f=g.buildings.find(b=>b.type==="furnace");f.inventory={};});
 const ironBefore=g.bank.iron;
 let dispatched=false;
 for(let i=0;i<240&&!dispatched;i++){advanceGame(g,0.5);dispatched=g.vehicles.some(v=>v.job&&v.job.resource==="iron");}
 assert.ok(dispatched,"sim never dispatched an iron resupply");
 const s=resourceStripState(g);
 mirror(s,g);
 const r=row(s,"iron");
 assert.ok(r.reserved>0);
 assert.equal(r.reserved,g.vehicles.reduce((a,v)=>a+(v.job?.resource==="iron"?v.job.amount:0),0));
 assert.equal(r.depot,ironBefore-r.reserved); // take() at assignment, no ghost stock
 assert.equal(r.total,ironBefore+r.machines); // conservation: depot+transit constant
});
test("committed assembly cost mirrors buildAt spend and cancelConstruction full refund",()=>{
 const g=createGame();
 const before={...g.bank};
 const r=buildAt(g,"furnace",6,7,0);
 assert.equal(r.ok,true);
 const s=resourceStripState(g);
 for(const [id,n] of Object.entries(BLUEPRINTS.furnace.cost)){
  assert.equal(row(s,id).committed,n,id+" committed");
  assert.equal(row(s,id).depot,before[id]-n,id+" depot after spend");
 }
 assert.equal(row(s,"credits").committed,360);
 assert.ok(s.ledgerCount>=1);
 // Committed material is ALREADY spent: it must not inflate the physical total.
 assert.equal(row(s,"iron").total,g.bank.iron+g.buildings.reduce((a,b)=>a+(b.inventory?.iron||0),0));
 const c=cancelConstruction(g,r.building.id);
 assert.equal(c.ok,true);
 const s2=resourceStripState(g);
 for(const id of Object.keys(BLUEPRINTS.furnace.cost)){
  assert.equal(row(s2,id).committed,0,id+" committed after cancel");
  assert.equal(row(s2,id).depot,before[id],id+" depot restored");
 }
});
test("assembling machines are not counted as material-starved",()=>{
 const g=freshWith(g=>{g.bank.iron=0;g.bank.fuel=0;const f=g.buildings.find(b=>b.type==="furnace");f.inventory={};});
 const r=buildAt(g,"salvager",6,7,0); // salvager has no inputs; assembling anyway
 const s=resourceStripState(g);
 assert.ok(s.starving.every(x=>x.buildingId!==r.building.id));
});

/* ---------------- shortages mirror sim authority ---------------- */
test("critical shortage when depot + inbound cannot cover starving machines",()=>{
 const g=freshWith(g=>{g.bank.iron=0;g.bank.fuel=0;const f=g.buildings.find(b=>b.type==="furnace");f.inventory={iron:1,fuel:0};g.vehicles.forEach(v=>v.job=null);});
 const s=resourceStripState(g);
 const iron=row(s,"iron"),fuel=row(s,"fuel");
 assert.equal(iron.need,4); // inputs 5 - inventory 1
 assert.equal(fuel.need,2);
 assert.equal(iron.state,"critical");
 assert.equal(fuel.state,"critical");
 assert.equal(iron.starvedMachines,1);
 assert.match(iron.detail,/cannot cover/);
 assert.deepEqual(s.shortages.map(x=>x.id),["iron","fuel"]); // critical first, biggest deficit first
});
test("warning (delivery pending) when the depot can cover the deficit",()=>{
 const g=freshWith(g=>{const f=g.buildings.find(b=>b.type==="furnace");f.inventory={iron:1,fuel:0};g.vehicles.forEach(v=>v.job=null);});
 const s=resourceStripState(g);
 assert.equal(row(s,"iron").state,"warning"); // bank iron 90 covers need 4
 assert.equal(row(s,"fuel").state,"warning"); // bank fuel 110 covers need 2
 assert.match(row(s,"iron").detail,/trucks deliver automatically/);
 assert.ok(s.shortages.every(x=>x.state==="warning"));
});
test("inbound truck cargo counts toward covering a shortage",()=>{
 const g=freshWith(g=>{g.bank.iron=0;g.bank.fuel=0;const f=g.buildings.find(b=>b.type==="furnace");f.inventory={};
  g.vehicles[0].job={sourceId:2,destId:f.id,resource:"iron",amount:5,phase:"toDest",route:[],segment:0,progress:0};
  g.vehicles.forEach((v,i)=>{if(i>0)v.job=null;});});
 const s=resourceStripState(g);
 const iron=row(s,"iron");
 assert.equal(iron.inbound,5);
 assert.equal(iron.reserved,5);
 assert.equal(iron.state,"warning"); // 0 depot + 5 inbound covers need 5
 assert.equal(row(s,"fuel").state,"critical");
});
test("brownout takes precedence: powerless machines are not material-starved",()=>{
 const g=freshWith(g=>{g.buildings=g.buildings.filter(b=>b.type!=="generator");g.bank.iron=0;const f=g.buildings.find(b=>b.type==="furnace");f.inventory={};});
 const s=resourceStripState(g);
 assert.equal(s.power.available,false);
 assert.equal(s.starving.length,0);
 assert.equal(s.shortages.length,0);
 assert.equal(row(s,"iron").need,0);
 assert.notEqual(row(s,"iron").state,"critical");
});
test("no-frontage machines are not material-starved (mirrors inspector precedence)",()=>{
 const g=freshWith(g=>{g.roads=[];g.bank.iron=0;const f=g.buildings.find(b=>b.type==="furnace");f.inventory={};});
 const s=resourceStripState(g);
 assert.equal(s.starving.length,0);
 assert.equal(row(s,"iron").need,0);
});
test("shortage clears once trucks actually resupply the starving furnace",()=>{
 const g=freshWith(g=>{g.bank.iron=50;g.bank.fuel=20;const f=g.buildings.find(b=>b.type==="furnace");f.inventory={};});
 let cleared=false;
 for(let i=0;i<240&&!cleared;i++){
  advanceGame(g,0.5);
  const s=resourceStripState(g);
  mirror(s,g); // authority holds at EVERY instant, including mid-transit
  cleared=row(s,"iron").need===0&&row(s,"fuel").need===0;
 }
 assert.ok(cleared,"real sim delivery never cleared the shortage");
});

/* ---------------- transactions: no ghost balances ---------------- */
test("sell mirrors the exact depot take and credit deposit",()=>{
 const g=createGame();
 const creditsBefore=g.bank.credits,ironBefore=g.bank.iron;
 const r=sell(g,"iron",10);
 assert.equal(r.ok,true);
 const s=resourceStripState(g);
 mirror(s,g);
 assert.equal(row(s,"iron").depot,ironBefore-10);
 assert.equal(row(s,"credits").depot,creditsBefore+r.earnings);
 assert.equal(row(s,"iron").total,ironBefore-10+row(s,"iron").machines);
});
test("dismantle refund + cargo return mirror the strip exactly",()=>{
 const g=createGame();
 const b=built(g);
 b.inventory={iron:3};
 const ironTotalBefore=authority(g,"iron").total;
 const r=removeBuilding(g,b.id);
 assert.equal(r.ok,true);
 const s=resourceStripState(g);
 mirror(s,g);
 // Cargo moves machines -> depot (already counted); the floor(0.4*cost)
 // refund re-enters the yard. No ghost stock beyond the authoritative refund.
 const refund=Math.floor(0.4*BLUEPRINTS.furnace.cost.iron);
 assert.equal(row(s,"iron").total,ironTotalBefore+refund);
 assert.equal(row(s,"iron").machines,10); // only the starter furnace cargo remains
 assert.equal(row(s,"credits").depot,g.bank.credits);
});
test("ledger count mirrors the authoritative transaction ledger",()=>{
 const g=createGame();
 assert.equal(resourceStripState(g).ledgerCount,0);
 buildAt(g,"salvager",6,7,0);
 const s=resourceStripState(g);
 assert.equal(s.ledgerCount,g.ledger.length);
 assert.ok(s.ledgerCount>=1);
});

/* ---------------- persisted strip preferences ---------------- */
const memStorage=()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),_m:m};};
test("strip settings round-trip, sanitize and survive corrupt or throwing storage",()=>{
 const s=memStorage();
 assert.deepEqual(readStripSettings(s),{...STRIP_DEFAULTS});
 const next=writeStripSettings(s,{ledgerOpen:true});
 assert.deepEqual(next,{ledgerOpen:true});
 assert.deepEqual(readStripSettings(s),next);
 assert.equal(JSON.parse(s._m.get(STRIP_SETTINGS_KEY)).ledgerOpen,true);
 // Unknown keys and wrong types are sanitized away.
 s.setItem(STRIP_SETTINGS_KEY,JSON.stringify({ledgerOpen:"yes",ghost:9}));
 assert.deepEqual(readStripSettings(s),{...STRIP_DEFAULTS});
 s.setItem(STRIP_SETTINGS_KEY,"{not json");
 assert.deepEqual(readStripSettings(s),{...STRIP_DEFAULTS});
 const throwing={getItem(){throw Error("denied");},setItem(){throw Error("denied");}};
 assert.deepEqual(readStripSettings(throwing),{...STRIP_DEFAULTS});
 assert.deepEqual(writeStripSettings(throwing,{ledgerOpen:true}),{ledgerOpen:true});
 assert.deepEqual(readStripSettings(null),{...STRIP_DEFAULTS});
});
test("strip settings key is independent of inspector ux-settings",()=>{
 const s=memStorage();
 writeUxSettings(s,{autoFrame:false,panelSide:"right"});
 writeStripSettings(s,{ledgerOpen:true});
 assert.deepEqual(readUxSettings(s),{autoFrame:false,panelSide:"right"});
 assert.deepEqual(readStripSettings(s),{ledgerOpen:true});
 // Writing inspector prefs must not clobber strip prefs and vice versa.
 writeUxSettings(s,{autoFrame:true});
 assert.deepEqual(readStripSettings(s),{ledgerOpen:true});
 writeStripSettings(s,{ledgerOpen:false});
 assert.deepEqual(readUxSettings(s),{autoFrame:true,panelSide:"right"});
 assert.notEqual(STRIP_SETTINGS_KEY,UX_SETTINGS_KEY);
});
