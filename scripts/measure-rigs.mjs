import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import * as THREE from "three";
globalThis.document={createElement:(tag)=>{assert.equal(tag,"canvas");return {width:0,height:0,getContext:()=>new Proxy({},{get:()=>()=>{}})}}};
// Refs #597 — portable target resolution (no machine-specific path). An explicit
// CLI argument (a checkout root) wins; otherwise the repository root is derived
// from this script's own location (<root>/scripts/measure-rigs.mjs) via
// import.meta.url, which cannot be fooled by the caller's working directory.
// The target is validated BEFORE any import: a missing src/world.js or
// src/voxelSchema.js throws naming the exact path tried. There is deliberately
// no fallback to a guessed checkout — measuring a stale-but-plausible tree is
// the failure mode this repair exists to prevent.
const scriptDir=path.dirname(fileURLToPath(import.meta.url));
const defaultRoot=path.resolve(scriptDir,"..");
const target=path.resolve(process.argv[2]!==undefined?process.argv[2]:defaultRoot);
for(const rel of ["src/world.js","src/voxelSchema.js"]){
 const tried=path.join(target,rel);
 if(!fs.existsSync(tried))throw new Error("measure-rigs: invalid target checkout '"+target+"' - missing "+rel+" (tried '"+tried+"'). Pass a valid checkout root as the first CLI argument; no fallback checkout is guessed.");
}
process.stderr.write("measure-rigs: measuring target "+target+"\n");
const W=await import(pathToFileURL(path.join(target,"src","world.js")).href);
const {RIGS}=await import(pathToFileURL(path.join(target,"src","voxelSchema.js")).href);
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
