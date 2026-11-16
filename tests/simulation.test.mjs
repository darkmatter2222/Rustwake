import test from "node:test";
import assert from "node:assert/strict";
import {createGame,buildAt,roadLine,advanceGame,roadPath,nearestRoad,sell,researchAt,canAfford} from "../src/simulation.js";

test("new sandbox has a built industrial yard, visible physical roads and trucks",()=>{
 const g=createGame();
 assert.ok(g.buildings.length>=5);assert.ok(g.roads.length>=50);
 assert.ok(g.vehicles.length>=2);
 assert.equal(g.version,2);
 assert.equal(g.view.yaw,45);
 assert.equal(g.view.elevation,35.264);
});
test("route graph can carry actual cargo from extractor to depot",()=>{
 const g=createGame(),a=g.buildings.find(b=>b.type==="salvager"),b=g.buildings.find(b=>b.type==="depot");
 const path=roadPath(g,nearestRoad(g,a.x,a.z),nearestRoad(g,b.x,b.z));
 assert.ok(path?.length>2);
 const before=g.stats.delivered;
 for(let i=0;i<400;i++)advanceGame(g,.5);
 assert.ok(g.stats.produced>0,"machines produced materials");
 assert.ok(g.stats.delivered>before,"trucks delivered conserved cargo");
 assert.ok(g.stats.shipments>0);
 assert.ok(g.bank.scrap>=0);
});
test("road placement charges resources and refuses occupied cells",()=>{
 const g=createGame(),before=g.bank.credits;
 assert.equal(roadLine(g,{x:0,z:0},{x:0,z:1}).ok,true);
 assert.equal(g.bank.credits,before-8);
 assert.equal(roadLine(g,{x:7,z:9},{x:8,z:9}).ok,false);
});
test("construction never spends on invalid or duplicate placement",()=>{
 const g=createGame(),bank={...g.bank};
 assert.equal(buildAt(g,"salvager",7,9).ok,false);
 assert.deepEqual(g.bank,bank);
 const r=buildAt(g,"salvager",3,3);
 assert.equal(r.ok,true);assert.equal(g.bank.credits,bank.credits-180);
 assert.equal(buildAt(g,"salvager",3,3).ok,false);
});
test("research and selling are explicit resource transactions",()=>{
 const g=createGame(),credits=g.bank.credits;
 const r=sell(g,"steel",2);
 assert.equal(r.ok,true);assert.equal(g.bank.credits,credits+76);
 assert.equal(researchAt(g,"crew").ok,true);
 assert.equal(researchAt(g,"crew").ok,false);
 assert.ok(!canAfford(g,{credits:1e8}));
});
