import assert from "node:assert/strict";
import * as THREE from "three";
globalThis.document={createElement:(tag)=>{assert.equal(tag,"canvas");return {width:0,height:0,getContext:()=>new Proxy({},{get:()=>()=>{}})}}};
const W=await import("file:///C:/Users/ryans/AppData/Local/Temp/rw-qwen/art-351/src/world.js");
const {RIGS}=await import("file:///C:/Users/ryans/AppData/Local/Temp/rw-qwen/art-351/src/voxelSchema.js");
const count=(rig)=>{let meshes=0,triangles=0,visible=0;rig.traverse(n=>{if(!n.isMesh||!n.material.visible)return;meshes++;const g=n.geometry;triangles+=g.index?g.index.count/3:g.attributes.position.count/3;});
 // visible-at-tier0 leaf count (proxy hidden)
 rig.traverse(n=>{if(n.isMesh&&n.material.visible&&n.name!=="lod:proxy")visible++;});
 return {meshes,triangles,tier0Visible:visible};};
const out={};
for(const id of [1,2,3]){const r=W.createTruck(id);W.syncTruckCargo(r,{id,cargo:{resource:"scrap",amount:12}});out["truck"+id+"("+r.userData.identity.variant+",loaded)"]=count(r);}
out.truckEmpty=count(W.createTruck(1));
out.forklift=count(W.createForklift());
out.drone=count(W.createDrone());
out.worker=count(W.createWorker());
const box=g=>{const b=new THREE.Box3().setFromObject(g);const s=b.getSize(new THREE.Vector3());return {w:+s.x.toFixed(3),h:+s.y.toFixed(3),l:+s.z.toFixed(3)};};
out.envelopes={truck1:box(W.createTruck(1)),truck2:box(W.createTruck(2)),truck3:box(W.createTruck(3)),forklift:box(W.createForklift()),drone:box(W.createDrone()),worker:box(W.createWorker())};
out.budgets=Object.fromEntries(Object.entries(RIGS).map(([k,v])=>[k,v.budget]));
console.log(JSON.stringify(out,null,1));
