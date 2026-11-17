import test from "node:test";
import assert from "node:assert/strict";
import {createGame,buildAt,advanceGame,snapshot,powerStatus,checkSite,canAfford,roadLine,connectedToRoad,nearestRoad,roadPath,ROAD_REACH} from "../src/simulation.js";
import {BLUEPRINTS,BUILDINGS,TIERS,INITIAL_BANK} from "../src/content.js";
import {resourceStripState} from "../src/resourceStrip.js";
import {readUxSettings,writeUxSettings,UX_SETTINGS_KEY} from "../src/inspector.js";
import {readStripSettings,writeStripSettings,STRIP_SETTINGS_KEY} from "../src/resourceStrip.js";
import {readDockSettings,writeDockSettings,DOCK_SETTINGS_KEY} from "../src/dock.js";
import {readFleetSettings,writeFleetSettings,FLEET_SETTINGS_KEY} from "../src/fleet.js";
import {alarmsState,alarmsForBuilding,ALARM_KINDS,ALARM_ICONS,SEVERITY_LABELS,TRUCK_LOAD,ROAD_SEGMENT_COST,
 ALARM_SETTINGS_KEY,ALARM_DEFAULTS,readAlarmSettings,writeAlarmSettings,costText} from "../src/alarms.js";

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
const byId=(s,id)=>{const a=s.alarms.find(a=>a.id===id);assert.ok(a,"missing alarm "+id+" in "+JSON.stringify(s.alarms?.map(x=>x.id)));return a;};
const kinds=(s)=>s.alarms.map(a=>a.kind);
// Seeded failure fixtures: each one drives a REAL sim condition, never a
// fabricated alarm flag. The model must derive problem AND remedy from it.
const brownout=()=>freshWith(g=>{g.buildings=g.buildings.filter(b=>b.type!=="generator");});
const noRoads=()=>freshWith(g=>{g.roads=[];});
const starvedCritical=()=>freshWith(g=>{g.bank.iron=0;g.bank.fuel=0;
 const f=g.buildings.find(b=>b.type==="furnace");f.inventory={iron:1,fuel:0};g.vehicles.forEach(v=>v.job=null);});
const starvedWarning=()=>freshWith(g=>{const f=g.buildings.find(b=>b.type==="furnace");
 f.inventory={iron:1,fuel:0};g.vehicles.forEach(v=>v.job=null);});
const bayBackup=()=>freshWith(g=>{const f=g.buildings.find(b=>b.type==="furnace");
 f.inventory={iron:10,fuel:7,steel:TRUCK_LOAD};g.vehicles.forEach(v=>v.job=null);});

/* ---------------- model states: loading / error / empty ---------------- */
test("alarms loading state when the game is not ready",()=>{
 assert.deepEqual(alarmsState(null),{kind:"loading"});
 assert.deepEqual(alarmsState(undefined),{kind:"loading"});
});
test("alarms error state for an unreadable yard, never a crash",()=>{
 const s=alarmsState({buildings:null,roads:[],vehicles:[]});
 assert.equal(s.kind,"error");
 assert.match(s.reason,/unreadable/);
 assert.equal(alarmsState({buildings:[],roads:"x",vehicles:[]}).kind,"error");
});
test("fresh starter yard is nominal — no fabricated alarms",()=>{
 const g=createGame();
 const s=alarmsState(g);
 assert.equal(s.kind,"ready");
 assert.deepEqual(s.alarms,[]);
 assert.deepEqual(s.counts,{critical:0,warning:0,total:0});
 assert.equal(s.power.available,true);
 assert.equal(s.depotUncapped,true);
 assert.equal(s.capacityExposed,false);
});

/* ---------------- power brownout: problem + remedy + states ---------------- */
test("brownout alarm mirrors powerStatus exactly and names the turbine remedy",()=>{
 const g=brownout();
 const s=alarmsState(g),p=powerStatus(g);
 assert.equal(p.available,false);
 const a=byId(s,"power-brownout");
 assert.equal(a.kind,"power");
 assert.equal(a.severity,"critical");
 assert.equal(a.severityLabel,"CRITICAL");
 assert.equal(a.icon,ALARM_ICONS.power);
 assert.equal(a.state,"ready");
 assert.ok(a.problem.includes(p.demand+" MW"),"problem carries authoritative demand");
 assert.ok(a.problem.includes(p.supply+" MW"),"problem carries authoritative supply");
 assert.match(a.problem,/powerless/);
 assert.ok(a.remedy.includes(BLUEPRINTS.generator.name),"remedy names the real blueprint");
 assert.ok(a.remedy.includes(costText(BLUEPRINTS.generator.cost)),"remedy carries the real cost");
 assert.deepEqual(a.action,{tool:"build",blueprint:"generator",label:"Construct a turbine"});
 assert.equal(a.altAction,null);
});
test("brownout state is processing while a turbine is assembling",()=>{
 const g=freshWith(g=>{g.buildings.find(b=>b.type==="generator").remaining=5;});
 const a=byId(alarmsState(g),"power-brownout");
 assert.equal(a.state,"processing");
 assert.match(a.detail,/assembling/);
 assert.match(a.detail,/5\.0s/);
 assert.match(a.remedy,/Turbine Generator/);
});
test("brownout state is unaffordable with an Exchange fallback when the depot cannot pay",()=>{
 const g=freshWith(g=>{g.buildings=g.buildings.filter(b=>b.type!=="generator");g.bank={};});
 const a=byId(alarmsState(g),"power-brownout");
 assert.equal(a.state,"unaffordable");
 assert.equal(canAfford(g,BLUEPRINTS.generator.cost),false);
 assert.match(a.remedy,/cannot afford/);
 assert.deepEqual(a.altAction,{tool:"market",label:"Sell surplus at the Exchange"});
});
test("brownout affordability flips exactly at the authoritative cost boundary",()=>{
 const cost=BLUEPRINTS.generator.cost;
 const exact=freshWith(g=>{g.buildings=g.buildings.filter(b=>b.type!=="generator");g.bank={...cost};});
 assert.equal(byId(alarmsState(exact),"power-brownout").state,"ready");
 const short=freshWith(g=>{g.buildings=g.buildings.filter(b=>b.type!=="generator");g.bank={...cost,credits:cost.credits-1};});
 assert.equal(byId(alarmsState(short),"power-brownout").state,"unaffordable");
});
test("brownout clears after a REAL turbine build completes — no hardcoded state",()=>{
 const g=brownout();
 assert.ok(alarmsState(g).alarms.some(a=>a.kind==="power"));
 built(g,"generator");
 assert.equal(powerStatus(g).available,true);
 assert.ok(!alarmsState(g).alarms.some(a=>a.kind==="power"));
});
test("no brownout alarm when demand is zero (supply 0 is not a failure)",()=>{
 const g=freshWith(g=>{g.buildings=g.buildings.filter(b=>b.type==="depot");});
 assert.equal(powerStatus(g).available,true);
 assert.ok(!alarmsState(g).alarms.some(a=>a.kind==="power"));
});

/* ---------------- missing roads: problem + remedy + states ---------------- */
test("no-frontage machines raise a critical road alarm with the real segment cost",()=>{
 const g=noRoads();
 const s=alarmsState(g);
 const completed=g.buildings.filter(b=>b.remaining<=0);
 assert.equal(s.alarms.filter(a=>a.kind==="road").length,completed.length);
 const f=g.buildings.find(b=>b.type==="furnace");
 const a=byId(s,"road-"+f.id);
 assert.equal(a.severity,"critical");
 assert.equal(a.state,"ready");
 assert.equal(a.icon,ALARM_ICONS.road);
 assert.deepEqual(a.target,{buildingId:f.id,x:f.x,z:f.z,name:BLUEPRINTS.furnace.name});
 assert.ok(a.problem.includes(f.x+","+f.z));
 assert.match(a.problem,/no road frontage/);
 assert.ok(a.remedy.includes(ROAD_REACH+" cells"),"remedy carries the authoritative reach");
 assert.ok(a.remedy.includes(costText(ROAD_SEGMENT_COST)),"remedy carries the real per-segment cost");
 assert.deepEqual(a.action,{tool:"road",label:"Open road engineer"});
});
test("ROAD_SEGMENT_COST mirrors the authoritative roadLine spend per segment",()=>{
 const g=createGame();
 const before={credits:g.bank.credits,stone:g.bank.stone};
 const r=roadLine(g,{x:0,z:0},{x:3,z:0});
 assert.equal(r.ok,true);
 assert.ok(r.cells>0);
 assert.equal((before.credits-g.bank.credits)/r.cells,ROAD_SEGMENT_COST.credits);
 assert.equal((before.stone-g.bank.stone)/r.cells,ROAD_SEGMENT_COST.stone);
});
test("road alarm state is unaffordable when a segment cannot be paid",()=>{
 const g=freshWith(g=>{g.roads=[];g.bank={};});
 const f=g.buildings.find(b=>b.type==="furnace");
 const a=byId(alarmsState(g),"road-"+f.id);
 assert.equal(a.state,"unaffordable");
 assert.match(a.remedy,/cannot afford/);
 assert.deepEqual(a.altAction,{tool:"market",label:"Sell surplus at the Exchange"});
});
test("assembling machines do not raise road alarms yet",()=>{
 const g=noRoads();
 // Seed an in-flight assembly directly (buildAt validates frontage, which a
 // roadless yard cannot offer): remaining>0 means still assembling.
 g.buildings.push({id:99,type:"salvager",x:6,z:7,level:1,remaining:5,inventory:{},timer:0});
 const s=alarmsState(g);
 assert.ok(!s.alarms.some(a=>a.id==="road-99"));
 assert.ok(s.alarms.filter(a=>a.kind==="road").every(a=>a.target.buildingId<=6));
});
test("road alarm clears after a REAL roadLine reaches the bay",()=>{
 const g=noRoads();
 const f=g.buildings.find(b=>b.type==="furnace");
 assert.ok(alarmsState(g).alarms.some(a=>a.id==="road-"+f.id));
 const r=roadLine(g,{x:15,z:12},{x:16,z:12});
 assert.equal(r.ok,true);
 assert.equal(connectedToRoad(g,f),true);
 assert.ok(!alarmsState(g).alarms.some(a=>a.id==="road-"+f.id));
});

/* ---------------- starvation: mirrors the UX-01 strip EXACTLY ---------------- */
test("critical starvation alarms mirror strip shortage ids, severity and problem text",()=>{
 const g=starvedCritical();
 const s=alarmsState(g),strip=resourceStripState(g);
 const starve=s.alarms.filter(a=>a.kind==="starvation");
 assert.deepEqual(starve.map(a=>a.id),strip.shortages.map(r=>"starve-"+r.id));
 for(const a of starve){
  const row=strip.shortages.find(r=>"starve-"+r.id===a.id);
  assert.equal(a.severity,row.state==="critical"?"critical":"warning");
  assert.equal(a.problem,row.detail,"problem text is the authoritative strip detail");
  assert.equal(a.icon,ALARM_ICONS.starvation);
  assert.ok(a.target.buildingIds.includes(4),"targets the starving furnace");
 }
});
test("iron shortage remedy builds the cheapest UNLOCKED producer with its real cost",()=>{
 const g=starvedCritical();
 const a=byId(alarmsState(g),"starve-iron");
 assert.equal(a.severity,"critical");
 assert.equal(a.state,"ready");
 // salvager (180 CR) and crusher (260 CR) both make iron; cheapest wins.
 assert.deepEqual(a.action,{tool:"build",blueprint:"salvager",label:"Construct "+BLUEPRINTS.salvager.name});
 assert.ok(a.remedy.includes(costText(BLUEPRINTS.salvager.cost)));
});
test("fuel shortage at tier 0 is LOCKED behind the refinery tier, with an honest remedy",()=>{
 const g=starvedCritical();
 const a=byId(alarmsState(g),"starve-fuel");
 assert.equal(a.severity,"critical");
 assert.equal(a.state,"locked");
 const tier=TIERS.find(t=>t.unlocks.includes("refinery"));
 assert.ok(a.remedy.includes(tier.name),"remedy names the unlocking era");
 assert.ok(a.remedy.includes(tier.needs+" production"),"remedy names the real requirement");
 assert.deepEqual(a.action,{tool:"market",label:"Open the Exchange"});
});
// #566 DISCRIMINATION (covered side): a delivery-pending shortage whose depot +
// inbound already covers the deficit is NOT a rail alarm — its own text would say
// "already covered / automatic", which cries wolf on a healthy yard. The signal
// survives on the UX-01 strip chip flag (◔) and the ledger, never on the rail.
test("#566 covered (delivery-pending) shortage raises NO rail alarm; strip still flags it",()=>{
 const g=starvedWarning();
 const s=alarmsState(g),strip=resourceStripState(g);
 // The strip read model is UNCHANGED: both rows are still delivery-pending warnings.
 const ironRow=strip.shortages.find(r=>r.id==="iron");
 const fuelRow=strip.shortages.find(r=>r.id==="fuel");
 assert.equal(ironRow.state,"warning","strip still classifies the covered deficit");
 assert.equal(fuelRow.state,"warning");
 assert.match(ironRow.detail,/covers it/,"strip detail still says the depot covers it");
 // But the rail carries NO starvation alarm for a covered deficit (no wolf chip).
 assert.ok(!s.alarms.some(a=>a.kind==="starvation"),"covered deficit must not raise a rail alarm");
 assert.ok(!s.alarms.some(a=>a.id==="starve-iron"));
 assert.ok(!s.alarms.some(a=>a.id==="starve-fuel"));
 assert.equal(s.counts.warning,0,"no WARNING chip on a covered shortage");
});
// #566 DISCRIMINATION (uncovered side — the decisive anti-suppression clause):
// a genuinely uncovered deficit MUST STILL raise a visible alarm chip with the
// authoritative problem text and a STATE-CHANGING action. Same commit as the
// covered case so the discrimination is never absent from the record.
test("#566 uncovered deficit STILL raises a visible alarm with a state-changing action",()=>{
 const g=starvedCritical();
 const s=alarmsState(g),strip=resourceStripState(g);
 const ironRow=strip.shortages.find(r=>r.id==="iron");
 assert.equal(ironRow.state,"critical","depot + inbound cannot cover the deficit");
 const a=byId(s,"starve-iron");
 // CRITICAL is the rail's highest severity (>= WARNING): the deficit is visible,
// not silenced. Severity mirrors the strip's critical flag (no cross-surface drift).
 assert.equal(a.severity,"critical");
 assert.equal(a.severityLabel,"CRITICAL");
 assert.equal(a.problem,ironRow.detail,"problem text is the authoritative uncovered detail");
 assert.match(a.problem,/cannot cover it/);
 // The action changes state (arms a real producer build), not "open a panel and watch".
 assert.equal(a.action.tool,"build");
 assert.ok(a.action.blueprint,"names a real producer blueprint to construct");
 assert.notEqual(a.action.label,"Watch the freight ledger");
 assert.ok(s.counts.critical>=1,"the uncovered deficit is counted, not suppressed");
});
// #566: a covered deficit that BECOMES uncovered (player sells out the depot)
// crosses the boundary from no-rail-alarm to a visible alarm — proving the rail
// discriminates on real coverage, not on a hardcoded silence.
test("#566 rail re-arms when a covered deficit becomes uncovered",()=>{
 const g=starvedWarning();
 assert.ok(!alarmsState(g).alarms.some(a=>a.id==="starve-iron"),"covered: silent on rail");
 g.bank.iron=0;g.vehicles.forEach(v=>v.job=null); // depot can no longer cover it
 const a=byId(alarmsState(g),"starve-iron");
 assert.equal(a.severity,"critical");
 assert.match(a.problem,/cannot cover it/);
});
test("unaffordable producer remedy offers the Exchange fallback",()=>{
 const g=freshWith(g=>{g.bank.iron=0;g.bank.fuel=0;g.bank.credits=0;g.bank.scrap=0;g.bank.stone=0;
  const f=g.buildings.find(b=>b.type==="furnace");f.inventory={};g.vehicles.forEach(v=>v.job=null);});
 const a=byId(alarmsState(g),"starve-iron");
 assert.equal(a.state,"unaffordable");
 assert.match(a.remedy,/cannot afford/);
 assert.deepEqual(a.altAction,{tool:"market",label:"Sell surplus at the Exchange"});
});
test("a resource with NO producer in the registry is honestly blocked, not faked",()=>{
 const g=freshWith(g=>{g.tier=1;});
 // Explicit site beside the starter grid so the bay has real frontage.
 const r=buildAt(g,"refinery",14,10,0);
 assert.equal(r.ok,true);
 g.buildings.find(b=>b.id===r.building.id).remaining=0;
 assert.equal(connectedToRoad(g,g.buildings.find(b=>b.id===r.building.id)),true);
 g.bank.water=0;
 g.buildings.find(b=>b.type==="refinery").inventory={};
 g.vehicles.forEach(v=>v.job=null);
 const a=byId(alarmsState(g),"starve-water");
 assert.equal(a.severity,"critical");
 assert.equal(a.state,"blocked");
 assert.match(a.remedy,/No .* source exists/);
 assert.deepEqual(a.action,{tool:"inventory",resource:"water",label:"Inspect yard stock"});
});
test("locked producer becomes buildable once the tier is REALLY reached",()=>{
 const g=starvedCritical();
 assert.equal(byId(alarmsState(g),"starve-fuel").state,"locked");
 g.tier=1; // authoritative progression flag, as researchAt/advanceGame set it
 const a=byId(alarmsState(g),"starve-fuel");
 assert.equal(a.state,"ready");
 assert.deepEqual(a.action,{tool:"build",blueprint:"refinery",label:"Construct "+BLUEPRINTS.refinery.name});
});
test("covered shortage clears after REAL truck resupply on the strip read model — no hardcoded flag",()=>{
 const g=freshWith(g=>{g.bank.iron=50;g.bank.fuel=20;
  const f=g.buildings.find(b=>b.type==="furnace");f.inventory={};});
 // #566: a covered (delivery-pending) deficit raises NO rail alarm; the live
 // signal is the strip shortage, which real truck delivery must still clear.
 assert.ok(!alarmsState(g).alarms.some(a=>a.kind==="starvation"),"covered deficit is not a rail alarm");
 assert.ok(resourceStripState(g).shortages.length>0,"strip still flags the delivery-pending deficit");
 let cleared=false;
 for(let i=0;i<240&&!cleared;i++){advanceGame(g,0.5);cleared=resourceStripState(g).shortages.length===0;}
 assert.ok(cleared,"real sim delivery never cleared the strip shortage");
 assert.ok(!alarmsState(g).alarms.some(a=>a.kind==="starvation"),"rail stays nominal after resupply");
});
test("brownout takes precedence: powerless machines are not material-starved",()=>{
 const g=freshWith(g=>{g.buildings=g.buildings.filter(b=>b.type!=="generator");
  g.bank.iron=0;g.buildings.find(b=>b.type==="furnace").inventory={};});
 const s=alarmsState(g);
 assert.ok(s.alarms.some(a=>a.kind==="power"));
 assert.ok(!s.alarms.some(a=>a.kind==="starvation"));
});

/* ---------------- storage backups: honest, uncapped depot ---------------- */
test("a connected bay holding a full truck load with no pickup raises a storage warning",()=>{
 const g=bayBackup();
 const f=g.buildings.find(b=>b.type==="furnace");
 const s=alarmsState(g);
 const a=byId(s,"storage-"+f.id);
 assert.equal(a.kind,"storage");
 assert.equal(a.severity,"warning");
 assert.equal(a.severityLabel,"WARNING");
 assert.equal(a.state,"ready");
 assert.equal(a.icon,ALARM_ICONS.storage);
 assert.equal(a.target.held,TRUCK_LOAD);
 assert.ok(a.problem.includes(TRUCK_LOAD+" units"));
 // #566 (product ruling 6956802594): when routeOk is TRUE the remedy must NOT
 // diagnose blocked routes — it describes queue/saturation, true under both the
 // pre- and post-#573 economies. Remedy TEXT ONLY: state/severity/firing unchanged.
 assert.equal(a.state,"ready","routeOk true → ready state unchanged");
 assert.equal(a.severity,"warning","severity unchanged by the copy fix");
 assert.match(a.remedy,/queued|waiting its turn|waiting for a free truck/i,"queue/saturation wording");
 assert.doesNotMatch(a.remedy,/blocked route/i,"must not diagnose a blocked route when routeOk is true");
 assert.doesNotMatch(a.remedy,/dispatch is automatic/i,"must not cry 'already automatic'");
 assert.deepEqual(a.action,{tool:"fleet",label:"Check fleet dispatch"},"action unchanged (Fleet has real cancel/reassign controls)");
 assert.equal(s.depotUncapped,true,"depot cap is never fabricated");
});
// #566: the blocked-route remedy (routeOk FALSE) is untouched — it correctly
// diagnoses the missing route. The copy fix only changes the routeOk-TRUE branch.
test("#566 storage remedy still diagnoses a blocked route when routeOk is FALSE",()=>{
 const g=freshWith(g=>{const f=g.buildings.find(b=>b.type==="furnace");
  f.inventory={iron:10,fuel:7,steel:TRUCK_LOAD};g.vehicles.forEach(v=>v.job=null);
  g.roads=["16,12"];});
 const f=g.buildings.find(b=>b.type==="furnace");
 const a=byId(alarmsState(g),"storage-"+f.id);
 assert.equal(a.state,"blocked");
 assert.match(a.remedy,/reconnect/i);
 assert.deepEqual(a.action,{tool:"road",label:"Reconnect the route"});
});
test("storage threshold is the sim's own truck load, not an invented cap",()=>{
 const under=freshWith(g=>{const f=g.buildings.find(b=>b.type==="furnace");
  f.inventory={iron:10,fuel:7,steel:TRUCK_LOAD-1};g.vehicles.forEach(v=>v.job=null);});
 assert.ok(!alarmsState(under).alarms.some(a=>a.kind==="storage"));
 const at=freshWith(g=>{const f=g.buildings.find(b=>b.type==="furnace");
  f.inventory={iron:10,fuel:7,steel:TRUCK_LOAD};g.vehicles.forEach(v=>v.job=null);});
 assert.ok(alarmsState(at).alarms.some(a=>a.kind==="storage"));
});
test("a bay with a pickup job already reserved raises NO storage alarm",()=>{
 const g=bayBackup();
 const f=g.buildings.find(b=>b.type==="furnace");
 g.vehicles[0].job={sourceId:f.id,destId:2,resource:"steel",amount:TRUCK_LOAD,phase:"toSource",route:[],segment:0,progress:0};
 assert.ok(!alarmsState(g).alarms.some(a=>a.kind==="storage"));
});
test("a connected bay with no route to the depot is BLOCKED with a road remedy",()=>{
 const g=freshWith(g=>{const f=g.buildings.find(b=>b.type==="furnace");
  f.inventory={iron:10,fuel:7,steel:TRUCK_LOAD};g.vehicles.forEach(v=>v.job=null);
  g.roads=["16,12"];}); // furnace reaches asphalt; depot does not
 const f=g.buildings.find(b=>b.type==="furnace");
 assert.equal(connectedToRoad(g,f),true);
 const depot=g.buildings.find(b=>b.type==="depot");
 assert.equal(nearestRoad(g,depot.x,depot.z),null);
 assert.equal(roadPath(g,nearestRoad(g,f.x,f.z),nearestRoad(g,depot.x,depot.z)),null);
 const a=byId(alarmsState(g),"storage-"+f.id);
 assert.equal(a.state,"blocked");
 assert.match(a.remedy,/reconnect/i);
 assert.deepEqual(a.action,{tool:"road",label:"Reconnect the route"});
});
test("a disconnected bay raises the ROAD root cause, not a duplicate storage alarm",()=>{
 const g=freshWith(g=>{g.roads=[];const f=g.buildings.find(b=>b.type==="furnace");
  f.inventory={iron:10,fuel:7,steel:TRUCK_LOAD};g.vehicles.forEach(v=>v.job=null);});
 const f=g.buildings.find(b=>b.type==="furnace");
 const s=alarmsState(g);
 assert.ok(s.alarms.some(a=>a.id==="road-"+f.id));
 assert.ok(!s.alarms.some(a=>a.id==="storage-"+f.id));
});
test("storage alarm clears once the sim REALLY assigns a pickup truck",()=>{
 // The sim prioritizes processor-input deliveries over output pickups, so a
 // steel pickup only dispatches when no input resupply is possible: freeze the
 // salvager and empty the depot's iron/fuel, leaving output pickup as the work.
 const g=freshWith(g=>{g.bank.iron=0;g.bank.fuel=0;
  g.buildings.find(b=>b.type==="salvager").remaining=1e9;
  const f=g.buildings.find(b=>b.type==="furnace");f.inventory={iron:10,fuel:7,steel:TRUCK_LOAD};
  g.vehicles.forEach(v=>v.job=null);});
 const f=g.buildings.find(b=>b.type==="furnace");
 assert.ok(alarmsState(g).alarms.some(a=>a.id==="storage-"+f.id));
 let dispatched=false;
 for(let i=0;i<400&&!dispatched;i++){advanceGame(g,0.25);
  dispatched=g.vehicles.some(v=>v.job&&v.job.sourceId===f.id&&v.job.resource==="steel");}
 assert.ok(dispatched,"sim never dispatched a steel pickup");
 assert.ok(!alarmsState(g).alarms.some(a=>a.id==="storage-"+f.id));
});

/* ---------------- ordering, purity, authority, colour-never-sole-cue ---------------- */
test("alarms sort critical-first then power/road/starvation/storage, deterministically",()=>{
 const g=freshWith(g=>{g.buildings=g.buildings.filter(b=>b.type!=="generator");g.roads=[];});
 const s=alarmsState(g);
 assert.equal(s.alarms[0].id,"power-brownout");
 const sev=s.alarms.map(a=>a.severity==="critical"?0:1);
 assert.deepEqual(sev,[...sev].sort((a,b)=>a-b));
 const roads=s.alarms.filter(a=>a.kind==="road").map(a=>a.id);
 assert.deepEqual(roads,[...roads].sort());
 assert.deepEqual(alarmsState(g),s,"derivation is deterministic");
 assert.equal(s.counts.critical,s.alarms.filter(a=>a.severity==="critical").length);
 assert.equal(s.counts.warning,s.alarms.filter(a=>a.severity==="warning").length);
 assert.equal(s.counts.total,s.alarms.length);
});
test("alarm derivation never mutates the authoritative game",()=>{
 for(const fixture of [brownout,noRoads,starvedCritical,starvedWarning,bayBackup]){
  const g=fixture();
  const before=snapshot(g);
  alarmsState(g);alarmsState(g);
  assert.deepEqual(g,before);
 }
});
test("every alarm pairs colour with icon + severity word + problem + remedy (model contract)",()=>{
 const fixtures=[brownout(),noRoads(),starvedCritical(),starvedWarning(),bayBackup(),
  freshWith(g=>{g.buildings=g.buildings.filter(b=>b.type!=="generator");g.roads=[];g.bank={};})];
 let seen=0;
 for(const g of fixtures){
  for(const a of alarmsState(g).alarms){
   seen++;
   assert.ok(ALARM_KINDS.includes(a.kind));
   assert.ok(a.icon&&a.icon.length>0,"icon present");
   assert.equal(a.icon,ALARM_ICONS[a.kind],"icon is kind-specific, not colour-only");
   assert.ok(["CRITICAL","WARNING"].includes(a.severityLabel),"explicit severity word");
   assert.equal(a.severityLabel,SEVERITY_LABELS[a.severity]);
   assert.ok(a.title.length>0);
   assert.ok(a.problem.length>10,"problem sentence");
   assert.ok(a.remedy.length>10,"remedy sentence");
   assert.ok(["ready","processing","unaffordable","locked","blocked"].includes(a.state));
   assert.ok(a.action&&a.action.label&&a.action.tool,"every alarm has a real action");
  }
 }
 assert.ok(seen>=10,"fixtures must exercise all alarm classes");
 const allKinds=new Set(fixtures.flatMap(g=>alarmsState(g).alarms.map(a=>a.kind)));
 assert.deepEqual([...allKinds].sort(),[...ALARM_KINDS].sort(),"all four classes exercised");
});
test("alarmsForBuilding returns machine-targeted alarms only",()=>{
 const g=noRoads();
 const s=alarmsState(g);
 const f=g.buildings.find(b=>b.type==="furnace");
 const list=alarmsForBuilding(s,f.id);
 assert.ok(list.some(a=>a.id==="road-"+f.id));
 assert.ok(!list.some(a=>a.kind==="power"),"grid alarm is yard-wide, not machine-targeted");
 assert.deepEqual(alarmsForBuilding(s,99999),[]);
 assert.deepEqual(alarmsForBuilding({kind:"loading"},1),[]);
 assert.deepEqual(alarmsForBuilding(null,1),[]);
 const starve=alarmsForBuilding(alarmsState(starvedCritical()),f.id);
 assert.ok(starve.some(a=>a.id==="starve-iron"));
 assert.ok(starve.some(a=>a.id==="starve-fuel"));
});

/* ---------------- persisted alarm preferences ---------------- */
const memStorage=()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),_m:m};};
test("alarm settings round-trip, sanitize and survive corrupt or throwing storage",()=>{
 const s=memStorage();
 assert.deepEqual(readAlarmSettings(s),{...ALARM_DEFAULTS});
 const next=writeAlarmSettings(s,{railOpen:false,showWarnings:false});
 assert.deepEqual(next,{railOpen:false,showWarnings:false});
 assert.deepEqual(readAlarmSettings(s),next);
 assert.equal(JSON.parse(s._m.get(ALARM_SETTINGS_KEY)).railOpen,false);
 s.setItem(ALARM_SETTINGS_KEY,JSON.stringify({railOpen:"yes",showWarnings:1,ghost:9}));
 assert.deepEqual(readAlarmSettings(s),{...ALARM_DEFAULTS});
 s.setItem(ALARM_SETTINGS_KEY,"{not json");
 assert.deepEqual(readAlarmSettings(s),{...ALARM_DEFAULTS});
 const throwing={getItem(){throw Error("denied");},setItem(){throw Error("denied");}};
 assert.deepEqual(readAlarmSettings(throwing),{...ALARM_DEFAULTS});
 assert.deepEqual(writeAlarmSettings(throwing,{railOpen:false}),{railOpen:false,showWarnings:true});
 assert.deepEqual(readAlarmSettings(null),{...ALARM_DEFAULTS});
});
test("alarm settings key is independent of ux/strip/dock/fleet settings",()=>{
 const s=memStorage();
 writeUxSettings(s,{autoFrame:false,panelSide:"right"});
 writeStripSettings(s,{ledgerOpen:true});
 writeDockSettings(s,{sheetCollapsed:true});
 writeFleetSettings(s,{showIdle:false,followCam:false});
 writeAlarmSettings(s,{railOpen:false,showWarnings:false});
 assert.deepEqual(readUxSettings(s),{autoFrame:false,panelSide:"right"});
 assert.deepEqual(readStripSettings(s),{ledgerOpen:true});
 assert.deepEqual(readDockSettings(s),{sheetCollapsed:true});
 assert.deepEqual(readFleetSettings(s),{showIdle:false,followCam:false});
 assert.deepEqual(readAlarmSettings(s),{railOpen:false,showWarnings:false});
 writeAlarmSettings(s,{railOpen:true});
 assert.deepEqual(readUxSettings(s),{autoFrame:false,panelSide:"right"});
 assert.deepEqual(readStripSettings(s),{ledgerOpen:true});
 for(const k of [UX_SETTINGS_KEY,STRIP_SETTINGS_KEY,DOCK_SETTINGS_KEY,FLEET_SETTINGS_KEY])assert.notEqual(ALARM_SETTINGS_KEY,k);
});