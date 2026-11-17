import * as THREE from "three";
import {CAMERA_LIMITS,normalizeCamera} from "./camera.js";
import {CELL,WORLD_SIZE,BLUEPRINTS,RESOURCE_BY_ID,STARTER_BUILDINGS,INITIAL_ROADS} from "./content.js";
import {cellOf,key} from "./simulation.js";
import {worldFootprint,terrainFor,surveyed,inside,footprintCells,bayCells} from "./gridOccupancy.js";
import {SCHEMA_ID,machineDescriptor,cellCenter,rigLodTier,RIGS,SCENERY,SCENERY_AUTHORITY,MATERIALS} from "./voxelSchema.js";

const EDGE=WORLD_SIZE*CELL;
const origin=(i)=>(i-WORLD_SIZE/2+.5)*CELL;
const mat=(hex,metalness=.07,roughness=.78)=>new THREE.MeshStandardMaterial({color:hex,metalness,roughness,flatShading:true});
const mats={
 asphalt:mat("#283840"),line:mat("#e5ac60"),earth:mat("#756b55"),rock:mat("#91806b"),
 steel:mat("#b2bfbd",.42),dark:mat("#33474e",.38),rust:mat("#c78355",.3),
 orange:mat("#e7a25d",.36),lights:new THREE.MeshStandardMaterial({color:"#86d5c5",emissive:"#4baba7",emissiveIntensity:1.1}),
 furnace:new THREE.MeshStandardMaterial({color:"#f98b50",emissive:"#cf431c",emissiveIntensity:1.8}),
 roof:mat("#70888b",.35),body:mat("#839c9e",.4),glass:mat("#9ab9bc",.1,.22),
 sand:mat("#8d7b5d"),wood:mat("#80644d"),black:mat("#151d23",.1)
};
// LOG-04 (#384): truck crates are tinted by the actual resource onboard, so the
// visible load is evidence of the freight ledger, not a decorative carrier.
const cargoMats=new Map();
function cargoMaterial(resource){
 if(!cargoMats.has(resource))cargoMats.set(resource,mat(RESOURCE_BY_ID[resource]?.color||"#c78355",.18,.6));
 return cargoMats.get(resource);
}
const geo=new THREE.BoxGeometry(1,1,1);
// ART-01 (#347): invisible full-cell pick volume owned by the voxel schema.
// material.visible=false never renders; the mesh gives mesh-based ray picking an
// accessible target that encloses the whole silhouette, not just thin greebles.
const pickMat=new THREE.MeshBasicMaterial({visible:false});
function box(parent,x,y,z,w,h,d,material){
 const mesh=new THREE.Mesh(geo,typeof material==="string"?mats[material]:material);
 mesh.position.set(x,y,z);mesh.scale.set(w,h,d);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function cylinder(parent,x,y,z,r,h,color,rotate=false){
 const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,8),typeof color==="string"?mats[color]:color);
 mesh.position.set(x,y,z);if(rotate)mesh.rotation.z=Math.PI/2;
 mesh.castShadow=true;parent.add(mesh);return mesh;
}
function textPanel(parent,label,x,y,z,size=2.2){
 const canvas=document.createElement("canvas");canvas.width=512;canvas.height=128;
 const c=canvas.getContext("2d");c.fillStyle="#1d2c33";c.fillRect(0,0,512,128);
 c.fillStyle="#d8e3d9";c.font="bold 46px system-ui";c.textAlign="center";
 c.fillText(label.slice(0,16).toUpperCase(),256,78);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(size*3.2,size*.78),new THREE.MeshBasicMaterial({map:texture,transparent:false,side:THREE.DoubleSide}));
 mesh.position.set(x,y,z);parent.add(mesh);
 return mesh;
}
function beam(parent,x,y,z,length,axis="x",material="steel"){
 return box(parent,x,y,z,axis==="x"?length:.21,.23,axis==="z"?length:.21,material);
}
// ART-06 (#352): the crane runs a scripted mechanical lift cycle, never the legacy
// endless sinusoidal slew. Pure deterministic phase machine: elapsed time in,
// named-pivot pose out (slew angle, trolley travel along the boom, hoist cable
// payout). The hook always runs EMPTY — a visible load may only ever mirror a real
// reserved shipment from the simulation authority (#274); this cycle implies no
// production. prefers-reduced-motion parks the crane in a static pose.
export const CRANE_LIMITS=Object.freeze({trolleyMin:.7,trolleyMax:4.35,dropMin:.45,dropMax:3.2,dropRelease:2.6,slewDrop:-.6});
export const CRANE_PHASES=Object.freeze([
 {name:"travel-out",dur:3},{name:"lower",dur:3},{name:"hook-dwell",dur:1.6},
 {name:"raise",dur:3},{name:"travel-in",dur:3},{name:"slew-to-drop",dur:2.4},
 {name:"lower-drop",dur:2.6},{name:"release-dwell",dur:1.6},{name:"raise-drop",dur:2.6},
 {name:"slew-back",dur:2.4}
]);
export const CRANE_CYCLE_TOTAL=CRANE_PHASES.reduce((s,p)=>s+p.dur,0);
const craneEase=u=>u*u*(3-2*u); // smoothstep: mechanical accel/decel, zero end velocity
const craneLerp=(a,b,u)=>a+(b-a)*u;
export function cranePose(time,reducedMotion=false){
 const L=CRANE_LIMITS;
 if(reducedMotion)return {phase:"parked",index:-1,progress:0,cycleT:0,slew:0,trolley:L.trolleyMin,drop:L.dropMin,reduced:true};
 const cycleT=((time%CRANE_CYCLE_TOTAL)+CRANE_CYCLE_TOTAL)%CRANE_CYCLE_TOTAL;
 let acc=0,index=CRANE_PHASES.length-1,progress=1;
 for(let i=0;i<CRANE_PHASES.length;i++){
  const d=CRANE_PHASES[i].dur;
  if(cycleT<acc+d){index=i;progress=(cycleT-acc)/d;break;}
  acc+=d;
 }
 const u=craneEase(Math.min(1,Math.max(0,progress)));
 let slew=0,trolley=L.trolleyMin,drop=L.dropMin;
 switch(CRANE_PHASES[index].name){
  case "travel-out":trolley=craneLerp(L.trolleyMin,L.trolleyMax,u);break;
  case "lower":trolley=L.trolleyMax;drop=craneLerp(L.dropMin,L.dropMax,u);break;
  case "hook-dwell":trolley=L.trolleyMax;drop=L.dropMax;break;
  case "raise":trolley=L.trolleyMax;drop=craneLerp(L.dropMax,L.dropMin,u);break;
  case "travel-in":trolley=craneLerp(L.trolleyMax,L.trolleyMin,u);break;
  case "slew-to-drop":slew=craneLerp(0,L.slewDrop,u);break;
  case "lower-drop":slew=L.slewDrop;drop=craneLerp(L.dropMin,L.dropRelease,u);break;
  case "release-dwell":slew=L.slewDrop;drop=L.dropRelease;break;
  case "raise-drop":slew=L.slewDrop;drop=craneLerp(L.dropRelease,L.dropMin,u);break;
  case "slew-back":slew=craneLerp(L.slewDrop,0,u);break;
 }
 return {phase:CRANE_PHASES[index].name,index,progress,cycleT,slew,trolley,drop,reduced:false};
}
// Single runtime application path (update() and tests share it): the hook pivot
// rides exactly the cable end, so the load chain can never teleport apart.
export function applyCranePose(p,pose){
 p.node.rotation.y=pose.slew;
 p.trolley.position.x=pose.trolley;
 p.hook.position.y=-pose.drop;
 p.cable.scale.y=pose.drop;
 p.cable.position.y=-pose.drop/2;
 p.node.userData.cranePhase=pose.phase;
}
export function makeBuilding(b,time){
 const group=new THREE.Group();
 // Exact footprint pivot (#370): anchor cell is the min corner; the group sits
 // at the footprint center, scaled to base w×d cells, rotated rot*90° about Y.
 const wf=worldFootprint(b.type,b.x,b.z,b.rot||0);
 group.position.set(wf.pivot.x,0,wf.pivot.z);
 group.rotation.y=wf.rotationY;
 group.scale.set(wf.base.w,1,wf.base.d);
 group.userData.buildingId=b.id;
 const d=BLUEPRINTS[b.type],kind=b.type;
 const has=(b.remaining||0)>0;
 const parts=[];
 const add=(...args)=>box(group,...args);
 const foot=add(0,.2,0,CELL*.87,.4,CELL*.87,"dark");
 add(0,.48,0,CELL*.72,.17,CELL*.72,"steel");
 if(kind==="salvager"){
  add(0,1.25,0,2.7,1.5,2.55,"rust");
  add(0,2.12,0,2.9,.33,2.9,"roof");
  add(-1.08,1.15,1.25,.35,1,.25,"orange");
  add(.8,1.15,1.26,.35,.8,.25,"steel");
  for(let i=0;i<4;i++)box(group,-.95+i*.64,1.36,-1.3,.16,.45,.18,"dark");
  const arm=new THREE.Group();arm.position.set(0,2.4,-.2);
  cylinder(arm,0,.25,0,.55,.45,"dark");
  box(arm,0,.35,-1.3,.42,.32,2.7,"orange");
  box(arm,0,.08,-2.5,.8,.25,.25,"steel");
  arm.name="pivot:rocker";group.add(arm);parts.push({kind:"rocker",node:arm});
 } else if(kind==="depot"||kind==="market"){
  add(0,1.48,0,2.95,2.14,2.65,kind==="depot"?"body":"wood");
  add(0,2.67,0,3.13,.4,2.88,"roof");
  add(0,1.35,1.34,1.6,1.35,.13,"black");
  add(.9,1.6,1.42,.23,1.15,.14,"orange");
  add(-1.18,1.6,1.42,.12,1.2,.15,"orange");
  for(let i=-1;i<=1;i++)add(i*.82,2.72,-.12,.45,.06,.9,"steel");
  textPanel(group,kind==="depot"?"FREIGHT":"EXCHANGE",0,2.2,1.44,.95);
 } else if(kind==="generator"){
  add(0,1.02,0,2.75,.95,2.8,"body");
  add(0,1.75,0,2.8,.45,2.8,"dark");
  const fan=new THREE.Group();fan.position.set(0,1.9,0);
  cylinder(fan,0,.1,0,.65,.35,"steel");
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5;const s=box(fan,Math.cos(a)*.84,.1,Math.sin(a)*.84,.95,.14,.28,"orange");s.rotation.y=a;}
  fan.name="pivot:spin";group.add(fan);parts.push({kind:"spin",node:fan});
  add(-.95,1.4,-.95,.25,1.15,.25,"orange");
  add(.95,1.4,.95,.25,1.15,.25,"lights");
 } else if(kind==="furnace"||kind==="foundry"){
  add(0,1.38,0,2.6,1.95,2.6,"body");
  add(0,2.55,0,2.65,.28,2.65,"roof");
  cylinder(group,-.75,3.35,-.75,.29,2.4,"steel");
  cylinder(group,.75,3,-.75,.25,1.9,"rust");
  add(0,1.32,1.32,1.32,.87,.12,"furnace");
  add(-1.2,1.05,0,.2,1.4,2.4,"rust");
  for(let i=0;i<3;i++)add(-.9+i*.9,2.45,1.35,.23,.12,.13,"orange");
 } else if(kind==="crusher"||kind==="refinery"){
  add(0,1,0,2.55,1.04,2.5,"body");
  for(let i=-1;i<=1;i++)cylinder(group,i*.7,1.65,0,.35,.75,"steel",true);
  add(0,2.15,0,2.1,.38,1.6,"orange");
  add(0,1.4,1.31,1.7,.45,.16,"dark");
 } else if(kind==="crane"){
  add(0,.7,0,2.2,.8,2.4,"rust");
  for(let s of [-1,1])for(let z of [-1,1])box(group,s*.9,2.8,z*.8,.22,4.3,.22,"orange");
  add(0,4.95,0,2.2,.28,1.8,"steel");
  // ART-06 (#352): named slew/boom -> trolley -> hoist -> hook hierarchy. The root
  // keeps the ART-01 schema name "pivot:crane" at (0,5.1,0); the trolley travels the
  // boom, the hoist pays out a scaled cable and the empty hook block rides its end.
  const slew=new THREE.Group();slew.position.set(0,5.1,0);slew.name="pivot:crane";
  box(slew,1.5,0,0,6.5,.28,.38,"orange");
  for(let i=0;i<8;i++){beam(slew,-1.4+i*.7,.36,0,.7,"x","steel");}
  box(slew,-1.45,-.15,0,1.5,.7,1.6,"dark");
  const trolley=new THREE.Group();trolley.name="pivot:crane:trolley";
  trolley.position.set(CRANE_LIMITS.trolleyMin,-.31,0);
  box(trolley,0,0,0,.6,.34,.62,"dark");
  box(trolley,0,.02,.36,.66,.2,.08,"steel");
  box(trolley,0,.02,-.36,.66,.2,.08,"steel");
  const hoist=new THREE.Group();hoist.name="pivot:crane:hoist";hoist.position.set(0,-.2,0);
  const cable=box(hoist,0,-CRANE_LIMITS.dropMin/2,0,.12,CRANE_LIMITS.dropMin,.12,"steel");
  const hook=new THREE.Group();hook.name="pivot:crane:hook";hook.position.set(0,-CRANE_LIMITS.dropMin,0);
  box(hook,0,-.24,0,.85,.45,.75,"rust");
  box(hook,0,-.6,0,.16,.34,.16,"steel");
  box(hook,0,-.82,0,.3,.12,.16,"orange");
  hoist.add(hook);trolley.add(hoist);slew.add(trolley);group.add(slew);
  parts.push({kind:"crane",node:slew,trolley,hoist,hook,cable});
 } else if(kind==="turret"){
  add(0,1.4,0,1.5,2.2,1.6,"dark");
  cylinder(group,0,2.7,0,.98,.4,"steel");
  const head=new THREE.Group();head.position.set(0,2.95,0);
  add(0,3.18,0,1.55,.48,1.2,"roof");
  box(head,0,0,-1,.38,.32,2.45,"orange");
  head.name="pivot:rotate";group.add(head);parts.push({kind:"rotate",node:head});
 } else {
  add(0,1.4,0,2.75,2,2.65,"body");
  add(0,2.55,0,3,.3,2.8,"roof");
  for(let i=-1;i<=1;i++)add(i*.8,1.6,1.34,.47,.55,.12,"lights");
  if(kind==="research"){
   cylinder(group,0,3.65,0,.18,2.1,"steel");
   cylinder(group,0,4.8,0,.3,.25,"lights");
  }
  if(kind==="fabricator")for(let i=-1;i<=1;i++)add(i*.76,2.8,0,.4,.5,.6,"orange");
 }
 // Each building has a ground-projected loading bay and luminous status marker.
 // ART-01 (#347): named port/status nodes + schema ownership metadata + pick volume.
 const bay=add(0,.11,CELL*.37,1.22,.08,.42,"orange");bay.name="port:loading-bay";
 const status=add(1.28,.95,1.25,.25,.25,.25,"lights");status.name="status:light";
 const desc=machineDescriptor(kind);
 if(desc){
  group.userData.voxel={schema:SCHEMA_ID,type:kind,footprint:desc.footprint,frontage:desc.frontage,
   pick:desc.pick,pivots:desc.pivots.map(p=>p.node),bounds:desc.bounds};
  const pick=new THREE.Mesh(geo,pickMat);
  pick.name="pick:volume";pick.scale.set(...desc.pick.size);pick.position.set(...desc.pick.center);
  group.add(pick);
 }
 if(has){ // foundation + staged frame, never a pop-in balloon.
  const ratio=Math.max(0,1-b.remaining/5);
  for(const child of [...group.children])if(child!==foot&&child.name!=="pick:volume")child.visible=ratio>=.25;
  if(ratio<.65){for(const child of group.children)if(child!==foot&&child.name!=="pick:volume")child.visible=child.position.y<1.4||ratio>.35;}
 }
 return {group,parts};
}
// ---------------------------------------------------------------------------
// ART-05 (#351): identity-specific vehicle/crew rigs at coherent relative scale.
// All geometry is ORIGINAL, authored in-code from the shared unit box/cylinder
// kit (approved-yard.png style; docs/design/tokens.json palette). No external or
// downloaded models, no archive/legacy geometry.
//
// Authority contract (#274/#384 honesty): the truck is the ONLY rig with economic
// authority — its crates mirror the simulation.js freight ledger exactly. The
// forklift, drone and workers are DECORATIVE yard crew: they never carry cargo,
// never report freight/production, and are anchored to real observable sim state
// (truck proximity at the depot bay; a building whose cycle timer actually
// advanced) or parked. Decorative animation is not a gameplay mechanic.
//
// LOD (RIGS in voxelSchema.js): tier 0 full detail, tier 1 silhouette (greebles
// hidden), tier 2 single livery-colored proxy box so mobile far-zoom stays
// recognizable and cheap. applyRigLod is the single runtime application path.
// ---------------------------------------------------------------------------
function rigShell(name,proxySize,proxyCenter,proxyMat){
 const g=new THREE.Group();g.name=name;
 const detail=new THREE.Group();detail.name="lod:detail";g.add(detail);
 const greeble=new THREE.Group();greeble.name="lod:greeble";detail.add(greeble);
 const proxy=new THREE.Mesh(geo,proxyMat);proxy.name="lod:proxy";
 proxy.scale.set(...proxySize);proxy.position.set(...proxyCenter);
 proxy.castShadow=true;proxy.visible=false;g.add(proxy);
 g.userData.lod=0;
 return {g,detail,greeble,proxy};
}
export function applyRigLod(g,tier){
 const detail=g.getObjectByName("lod:detail"),proxy=g.getObjectByName("lod:proxy"),greeble=g.getObjectByName("lod:greeble");
 if(detail)detail.visible=tier<2;
 if(proxy)proxy.visible=tier===2;
 if(greeble)greeble.visible=tier===0;
 const cargo=g.children.find(c=>c.name==="cargo");if(cargo)cargo.visible=tier<2;
 g.userData.lod=tier;
}
// Identity is keyed off the REAL vehicle id (HAULER-01/02/03), never random:
// id%3 selects one of three fixed liveries/rig variants declared in RIGS.truck.
export const TRUCK_WHEEL_RADIUS=.3;
export const TRUCK_IDENTITIES=RIGS.truck.identities;
export function truckIdentity(v){
 const id=typeof v==="number"?v:(v?.id??0);
 const index=((id%3)+3)%3;
 return {...TRUCK_IDENTITIES[index],index,id};
}
// One wheel: steer group (front axle yaw from real route turns) -> spin group
// (rotation.x = travelled distance / radius) -> tire + offset hub so the spin is
// readable. The hub stays inside the canonical 1.2-unit truck width envelope.
function truckWheel(parent,tag,x,z,h,steerable){
 const steer=new THREE.Group();steer.name="steer:"+tag;steer.position.set(x,.25,z);
 const spin=new THREE.Group();spin.name="wheel:"+tag;
 const tire=new THREE.Mesh(new THREE.CylinderGeometry(TRUCK_WHEEL_RADIUS,TRUCK_WHEEL_RADIUS,h,8),mats.black);
 tire.rotation.z=Math.PI/2;tire.castShadow=true;spin.add(tire);
 box(spin,0,.135,0,h*.85,.15,.15,"steel");
 steer.add(spin);parent.add(steer);
 return {steer,spin};
}
// Canonical envelope (ART-01 scale reference, unchanged): width 1.2 (x ±.6),
// height 1.35 (y -.05..1.30), length 2.05 (z -.95..1.10). Every variant keeps
// the same envelope so all three haulers fit one road cell and one loading bay.
export function createTruck(v){
 const ident=truckIdentity(v);
 const {g,detail,greeble}=rigShell("vehicle:truck",[1.2,1.35,2.05],[0,.625,.075],mats[ident.livery]);
 box(detail,0,.62,.1,1.1,.67,1.7,ident.livery);   // chassis
 box(detail,0,.91,-.5,1.12,.78,.72,"dark");       // cab (top 1.30)
 box(detail,0,1.05,-.87,.95,.39,.06,"glass");     // windshield
 box(detail,0,.35,-.92,1.16,.3,.06,"dark");       // front bumper (z -.95)
 box(detail,0,.38,.62,1.2,.54,.96,"steel");       // load tray floor (rear z 1.10)
 const wheels=new THREE.Group();wheels.name="pivot:wheels";detail.add(wheels);
 const steerGroups=[],spinGroups=[];
 for(const [tag,x] of [["fl",-.5],["fr",.5]]){
  const w=truckWheel(wheels,tag,x,-.58,.2,true);steerGroups.push(w.steer);spinGroups.push(w.spin);
 }
 if(ident.variant==="tipper"){ // dual rear axle: six wheels, distinct silhouette
  for(const [tag,x] of [["rl1",-.54],["rl2",-.42],["rr1",.42],["rr2",.54]]){
   const w=truckWheel(wheels,tag,x,.58,.12,false);spinGroups.push(w.spin);
  }
 }else{
  for(const [tag,x] of [["rl",-.5],["rr",.5]]){
   const w=truckWheel(wheels,tag,x,.58,.2,false);spinGroups.push(w.spin);
  }
 }
 let beacon=null;
 if(ident.variant==="flatbed"){ // RUST FLATBED: headboard rack + round lamps
  for(const x of [-.4,0,.4])box(detail,x,.95,.12,.12,.7,.08,"rust");
  for(const x of [-.4,.4]){
   const lamp=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,.04,8),mats.lights);
   lamp.rotation.x=Math.PI/2;lamp.position.set(x,.62,-.93);greeble.add(lamp);
  }
 }else if(ident.variant==="stake"){ // AMBER STAKE-BED: rails, stack, light bar, beacon
  for(const x of [-.56,.56])box(detail,x,.95,.62,.08,.5,.96,"orange");
  box(detail,0,.95,1.06,1.2,.5,.08,"orange");
  cylinder(detail,-.5,1.0,-.12,.07,.6,"steel");
  box(greeble,0,1.27,-.5,.7,.06,.18,"lights");
  beacon=new THREE.Group();beacon.name="pivot:beacon";beacon.position.set(0,1.27,-.5);
  box(beacon,0,0,0,.16,.06,.16,"orange");greeble.add(beacon);
  for(const x of [-.38,.38])box(greeble,x,.67,-.93,.23,.16,.04,"lights");
 }else{ // TEAL TIPPER: open-top box tray + hydraulic ram + dual rear wheels
  for(const x of [-.56,.56])box(detail,x,.85,.62,.08,.6,.96,"body");
  box(detail,0,.85,1.06,1.2,.6,.08,"body");
  box(detail,0,.85,.18,1.2,.6,.08,"body");
  cylinder(detail,0,.45,.05,.06,.35,"steel");
  for(const x of [-.38,.38])box(greeble,x,.67,-.93,.23,.16,.04,"lights");
 }
 for(const x of [-.45,.45])box(greeble,x,.7,1.08,.18,.12,.04,"lights"); // tail lamps
 g.userData.vehicle=true;
 g.userData.scaleReference="truck";
 g.userData.decorative=false;
 g.userData.authority="simulation.js freight ledger";
 g.userData.identity=ident;
 g.userData.wheels={steer:steerGroups,spin:spinGroups};
 g.userData.beacon=beacon;
 g.userData.cargoSig="";g.userData.loaded=false;g.userData.cargo=null;
 g.userData.distance=0;g.userData.wheelAngle=0;g.userData.beaconAngle=0;
 g.userData.steer=0;g.userData.heading=null;g.userData.lastX=null;g.userData.lastZ=null;
 return g;
}
// Articulation derives ONLY from real sim state: wheel spin integrates actual
// travelled distance, steering comes from real route heading deltas, suspension
// bob is proportional to real speed (exactly zero when parked — no free-running
// decorative sine pretending to be work), beacon spin is distance-driven.
export function wheelSpin(distance){return distance/TRUCK_WHEEL_RADIUS;}
const wrapAngle=a=>Math.atan2(Math.sin(a),Math.cos(a));
export function steerTarget(prevHeading,heading){
 if(prevHeading==null||heading==null)return 0;
 return Math.max(-.45,Math.min(.45,wrapAngle(heading-prevHeading)));
}
export function suspensionBob(speed,time,id){
 if(!(speed>1e-4))return 0;
 return Math.sin(time*9+id)*.012*Math.min(1,speed/2.2);
}
export function applyTruckMotion(truck,{wheelAngle,steer,bob,beacon}){
 const u=truck.userData;
 for(const w of u.wheels?.spin||[])w.rotation.x=wheelAngle;
 for(const s of u.wheels?.steer||[])s.rotation.y=steer;
 const detail=truck.getObjectByName("lod:detail");if(detail)detail.position.y=bob;
 if(u.beacon)u.beacon.rotation.y=beacon;
}
// Single runtime step shared by update() and tests. v.x/v.z are cell-space sim
// coordinates; world distance = cell delta * CELL. Reduced motion parks all
// articulation (wheel/steer/bob/beacon) while sim position still advances.
export function stepTruck(truck,v,dt,time,reduced=false){
 const u=truck.userData;
 let dist=0;
 if(u.lastX!=null)dist=Math.hypot(v.x-u.lastX,v.z-u.lastZ)*CELL;
 u.lastX=v.x;u.lastZ=v.z;
 u.distance=(u.distance||0)+dist;
 const speed=dt>0?dist/dt:0;
 let heading=null;
 if(v.job?.route&&v.job.segment<v.job.route.length-1){
  const from=v.job.route[v.job.segment],to=v.job.route[v.job.segment+1];
  heading=Math.atan2(to.x-from.x,to.z-from.z);
 }
 let steer=u.steer||0;
 if(heading!=null&&u.heading!=null&&heading!==u.heading)steer=steerTarget(u.heading,heading);
 else steer*=Math.max(0,1-dt*2.5);
 if(heading!=null)u.heading=heading;
 if(reduced)steer=0;
 else u.wheelAngle=(u.wheelAngle||0)+wheelSpin(dist);
 const bob=reduced?0:suspensionBob(speed,time,v.id??0);
 const beacon=reduced?(u.beaconAngle||0):u.distance*2;
 u.beaconAngle=beacon;u.steer=steer;u.speed=speed;
 applyTruckMotion(truck,{wheelAngle:u.wheelAngle,steer,bob,beacon});
 return {dist,speed,wheelAngle:u.wheelAngle,steer,bob,beacon,distance:u.distance};
}
// LOG-04 (#384): the visible load mirrors ONLY the real onboard freight ledger.
// Rebuilt exactly when the cargo signature changes (real pickup/drop); an empty
// truck carries no crate. Returns true only on a real signature transition.
export function syncTruckCargo(truck,v){
 const cargo=v.cargo&&v.cargo.amount>0?v.cargo:null;
 const sig=cargo?cargo.resource+":"+cargo.amount:"";
 if(sig===truck.userData.cargoSig)return false;
 const old=truck.children.find(c=>c.name==="cargo");if(old)truck.remove(old);
 truck.userData.cargoSig=sig;truck.userData.loaded=!!cargo;truck.userData.cargo=cargo?{resource:cargo.resource,amount:cargo.amount}:null;
 if(cargo){
  const load=new THREE.Group();load.name="cargo";
  const count=Math.max(1,Math.min(3,Math.ceil(cargo.amount/5)));
  for(let i=0;i<count;i++)box(load,(i-(count-1)/2)*.34,1.05,.52,.3,.42,.8,cargoMaterial(cargo.resource));
  if(truck.userData.lod===2)load.visible=false;
  truck.add(load);
 }
 return true;
}
// ART-05 (#351): DECORATIVE yard forklift stationed on the depot bay approach
// cell (gridOccupancy bayCells: machines may never build there). Fork lift is a
// pure function of the nearest REAL freight truck's distance — a honest visual
// response to observable sim state, never freight capacity. No load mesh ever.
export const FORKLIFT_POST=(()=>{
 const depot=STARTER_BUILDINGS.find(b=>b.type==="depot");
 return Object.freeze({x:cellCenter(depot.x)-1.2,z:cellCenter(depot.z+1)+.2,rotY:0,bayCell:Object.freeze({x:depot.x,z:depot.z+1})});
})();
export function createForklift(){
 const {g,detail,greeble}=rigShell("crew:forklift",[.8,1.1,1.3],[0,.55,0],mats.orange);
 box(detail,0,.45,.15,.7,.5,.8,"orange");      // body
 box(detail,0,.5,.5,.74,.6,.28,"dark");        // counterweight
 box(detail,0,.72,.25,.4,.3,.3,"dark");        // seat
 for(const x of [-.32,.32])for(const z of [-.28,.42])box(detail,x,.8,z,.06,.55,.06,"dark");
 box(detail,0,1.06,.07,.76,.08,.9,"orange");   // overhead guard (top 1.10)
 for(const x of [-.28,.28])box(detail,x,.6,-.55,.08,1.0,.08,"steel"); // mast
 const forks=new THREE.Group();forks.name="pivot:forks";forks.position.set(0,.1,-.5);
 box(forks,0,.05,.02,.5,.1,.06,"steel");       // carriage
 for(const x of [-.18,.18])box(forks,x,0,-.07,.1,.05,.14,"steel"); // prongs
 detail.add(forks);
 for(const x of [-.34,.34])for(const z of [-.4,.4]){
  const w=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,.12,8),mats.black);
  w.rotation.z=Math.PI/2;w.position.set(x,.16,z);w.castShadow=true;detail.add(w);
 }
 box(greeble,0,.95,.5,.3,.1,.06,"lights");
 box(greeble,-.2,1.0,-.55,.06,.06,.06,"lights");
 g.userData.decorative=true;
 g.userData.authority="none — decorative yard crew (#274)";
 g.userData.scaleReference="forklift";
 g.userData.forks=forks;g.userData.lift=0;
 return g;
}
export function forkliftLift(distance,reduced=false){
 if(reduced)return 0;
 if(distance<=2)return .75;
 if(distance>=6)return 0;
 return .75*(6-distance)/4;
}
export function applyForkliftPose(g,lift){
 g.userData.forks.position.y=.1+lift;g.userData.lift=lift;
}
// ART-05 (#351): DECORATIVE survey drone. Anchors above a building whose
// production timer ACTUALLY advanced (real active cycle); hover bob/rotor spin
// are decorative flight on the sim clock — explicitly NOT work, production or
// freight. Parked (rotors still) when no cycle is active or reduced motion.
export const DRONE_PAD=Object.freeze({x:-47.5,y:5.9,z:-23}); // exterior service-shed roof park spot (ART-07: sheds moved off buildable ground)
export function createDrone(){
 const {g,detail,greeble}=rigShell("crew:drone",[1,.3,1],[0,.15,0],mats.body);
 box(detail,0,.12,0,.34,.16,.34,"body");
 box(detail,0,.2,.06,.2,.08,.16,"glass");
 const rotors=[];
 for(const [sx,sz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
  const arm=box(detail,sx*.2,.12,sz*.2,.42,.05,.08,"dark");
  arm.rotation.y=sx*sz>0?-Math.PI/4:Math.PI/4;
  const rotor=new THREE.Group();rotor.name="pivot:rotor:"+rotors.length;
  rotor.position.set(sx*.33,.2,sz*.33);
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,.06,8),mats.steel);
  hub.position.y=.03;rotor.add(hub);
  box(rotor,0,.05,0,.34,.02,.05,"dark");
  detail.add(rotor);rotors.push(rotor);
 }
 for(const x of [-.12,.12])box(detail,x,.02,0,.04,.04,.3,"dark"); // landing skids
 box(greeble,0,.06,-.18,.1,.04,.04,"lights");
 box(greeble,0,.27,-.1,.02,.06,.02,"steel");   // antenna (top .30)
 g.userData.decorative=true;
 g.userData.authority="none — decorative yard crew (#274)";
 g.userData.scaleReference="drone";
 g.userData.rotors=rotors;
 return g;
}
export function droneHover(simTime,reduced=false){
 if(reduced)return {bob:0,rotor:0,reduced:true};
 return {bob:Math.sin(simTime*1.3)*.18,rotor:simTime*22,reduced:false};
}
// Real-state anchor: first completed building with a production cycle whose
// timer advanced since the previous frame. Null when nothing is actually
// cycling (power loss, starvation, assembly) — the drone then parks, honestly.
export function activeCycleAnchor(buildings,prevTimers){
 for(const b of buildings){
  if((b.remaining||0)>0)continue;
  const d=BLUEPRINTS[b.type];if(!d?.cycle)continue;
  const prev=prevTimers?.get(b.id);
  if(prev!=null&&b.timer>prev)return b;
 }
 return null;
}
// ART-01 (#347): canonical 1.7-world-unit worker as a visible human scale reference.
// ART-05 (#351): vest stripes, tool belt and named arm pivots added inside the
// unchanged 0.62×1.7×0.34 envelope. Decorative only — never presented as
// economic transport or crew simulation (#274).
export function createWorker(){
 const {g,detail,greeble}=rigShell("scale:worker",[.62,1.7,.34],[0,.85,0],mats.orange);
 box(detail,-.12,.39,0,.2,.78,.22,"dark");
 box(detail,.12,.39,0,.2,.78,.22,"dark");
 box(detail,0,1.09,0,.56,.62,.3,"orange");
 const armL=new THREE.Group();armL.name="pivot:arm-l";armL.position.set(-.25,1.3,0);
 box(armL,0,-.25,0,.12,.5,.16,"rust");detail.add(armL);
 const armR=new THREE.Group();armR.name="pivot:arm-r";armR.position.set(.25,1.3,0);
 box(armR,0,-.25,0,.12,.5,.16,"rust");detail.add(armR);
 box(detail,0,1.5,0,.28,.28,.28,"sand");
 box(detail,0,1.64,0,.34,.12,.34,"orange");
 box(greeble,0,.82,0,.58,.1,.32,"dark");        // tool belt
 box(greeble,-.12,1.12,.16,.1,.4,.02,"lights"); // hi-vis vest stripes
 box(greeble,.12,1.12,.16,.1,.4,.02,"lights");
 g.userData.scaleReference="worker";
 g.userData.decorative=true;
 g.userData.authority="none — decorative yard crew (#274)";
 return g;
}
function seeded(seed){let s=seed>>>0;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
// ---------------------------------------------------------------------------
// ART-07 (#353): inhabited salvage-yard terrain. Pure deterministic plan +
// THREE builder + occupancy-safe visibility. Authority contract (voxelSchema
// SCENERY): decorative ONLY — no pick volumes, no build-site occupancy, no
// route blocking. Placement rules proven in tests/yardScenery.test.mjs:
//  - volumetric interior props stand only on TERRAIN-rejected rock cells;
//  - exterior landmarks sit beyond the parcel (machines BOUNDS, roads refuse);
//  - flush decals (top <= 0.06, below road top 0.185) tint non-road ground;
//  - roadLine can pave rock/ring cells, so sceneryConflicts() hides any prop
//    or rubble chunk whose covered cells become road/footprint/bay.
// ---------------------------------------------------------------------------
export const DEFAULT_YARD_SEED=4073; // matches simulation.js createGame() default
const cellMin=(i)=>(i-WORLD_SIZE/2)*CELL;
function coveredCells(minX,maxX,minZ,maxZ){
 const x0=Math.floor(minX/CELL+WORLD_SIZE/2),x1=Math.floor((maxX-1e-9)/CELL+WORLD_SIZE/2);
 const z0=Math.floor(minZ/CELL+WORLD_SIZE/2),z1=Math.floor((maxZ-1e-9)/CELL+WORLD_SIZE/2);
 const out=[];for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++)out.push(key(x,z));
 return out;
}
// Quarter-turn rotY swaps width/length exactly; arbitrary angles use the
// conservative circumscribed radius so rotated chunks can never leak cells.
function aabbFor(x,z,w,d,rotY,height){
 const k=Math.round(rotY/(Math.PI/2));
 let hw=w/2,hd=d/2;
 if(Math.abs(rotY-k*Math.PI/2)<1e-9){if(((k%2)+2)%2===1){hw=d/2;hd=w/2;}}
 else{const r=Math.hypot(w,d)/2;hw=r;hd=r;}
 return {minX:x-hw,maxX:x+hw,minZ:z-hd,maxZ:z+hd,height};
}
function starterCellSet(){
 const s=new Set();
 for(const b of STARTER_BUILDINGS){
  for(const c of footprintCells(b.type,b.x,b.z,b.rot||0))s.add(key(c.x,c.z));
  for(const c of bayCells(b.type,b.x,b.z,b.rot||0))s.add(key(c.x,c.z));
 }
 return s;
}
const planCache=new Map();
export function yardSceneryPlan(seed){
 const s=Number(seed)>>>0;
 if(planCache.has(s))return planCache.get(s);
 const rand=seeded(s^0x5eed);
 const terrain=terrainFor(s);
 const roadSet=new Set(INITIAL_ROADS);
 const starter=starterCellSet();
 const props=[],rubble=[],decals=[];
 const zoneOf=(cells)=>cells.every(k=>{const [x,z]=cellOf(k);return !inside(x,z)||!surveyed(x,z);})?"exterior":"rock";
 const addProp=(kind,x,z,rotY=0,material=null)=>{
  const sc=SCENERY.kinds[kind].scale;
  const aabb=aabbFor(x,z,sc.width,sc.length,rotY,sc.height);
  const cells=coveredCells(aabb.minX,aabb.maxX,aabb.minZ,aabb.maxZ);
  props.push({kind,x,z,rotY,material,aabb,cells,zone:zoneOf(cells)});
 };
 const addRubble=(kind,x,y,z,w,h,d,rotY,color)=>{
  const aabb=aabbFor(x,z,w,d,rotY,h);
  const cells=coveredCells(aabb.minX,aabb.maxX,aabb.minZ,aabb.maxZ);
  rubble.push({kind,x,y,z,w,h,d,rotY,color,aabb,cells,zone:zoneOf(cells)});
 };
 const addDecal=(x,z,w,d,h,color,rotY=0)=>{
  const aabb=aabbFor(x,z,w,d,rotY,h);
  decals.push({kind:"decal",x,z,w,d,h,rotY,color,cells:coveredCells(aabb.minX,aabb.maxX,aabb.minZ,aabb.maxZ),zone:"any-nonroad"});
 };
 // --- interior: wrecks / barrels / scrap / outcrops on rock cells only ------
 const roadList=INITIAL_ROADS.map(t=>{const [x,z]=cellOf(t);return {x,z};});
 const roadDist=(x,z)=>{let m=Infinity;for(const r of roadList)m=Math.min(m,Math.max(Math.abs(r.x-x),Math.abs(r.z-z)));return m;};
 const rocks=[];
 for(const [k,t] of terrain){
  if(t.kind!=="rock")continue;
  const [x,z]=cellOf(k);
  if(!surveyed(x,z)||starter.has(k))continue;
  rocks.push({x,z,k,d:roadDist(x,z),used:false});
 }
 rocks.sort((a,b)=>a.d-b.d||a.z-b.z||a.x-b.x);
 const taken=[];
 const pick=(max,minSpacing)=>{const out=[];for(const r of rocks){if(out.length>=max)break;if(r.used)continue;
  if(taken.every(t=>Math.max(Math.abs(t.x-r.x),Math.abs(t.z-r.z))>=minSpacing)){r.used=true;taken.push(r);out.push(r);}}return out;};
 for(const r of pick(4,3))addProp("wreck",origin(r.x),origin(r.z),Math.floor(rand()*4)*Math.PI/2);
 for(const r of pick(3,2))addProp("barrel",origin(r.x),origin(r.z),0);
 const rust=MATERIALS.rust.color,dark=MATERIALS.dark.color,steel=MATERIALS.steel.color,
       rockC=MATERIALS.rock.color,sandC=MATERIALS.sand.color,orangeC=MATERIALS.orange.color;
 for(const r of pick(6,2))for(let i=0;i<6;i++){
  const w=.5+rand()*.7,d=.5+rand()*.7,h=.3+rand()*.8;
  addRubble("scrapPile",origin(r.x)+(rand()-.5)*1.6,h/2+rand()*.25-.04,origin(r.z)+(rand()-.5)*1.6,w,h,d,rand()*Math.PI,[rust,dark,steel][i%3]);
 }
 for(const r of rocks)if(!r.used)for(let i=0;i<3;i++){
  const w=.6+rand()*.6,d=.6+rand()*.6,h=.4+rand()*.9;
  addRubble("outcrop",origin(r.x)+(rand()-.5)*1.6,h/2-.04,origin(r.z)+(rand()-.5)*1.6,w,h,d,rand()*Math.PI,rand()>.7?sandC:rockC);
 }
 // --- exterior belt: landmarks beyond the parcel edge -----------------------
 for(const [x,z,ry,m] of [[-45.6,-33,0,"rust"],[-45.6,-29.6,0,"body"],[45.6,30,0,"rust"],[45.6,33.4,0,"dark"],[-30,-45.6,Math.PI/2,"body"],[27,45.6,Math.PI/2,"rust"]])
  addProp("container",x,z,ry,m);
 for(const [x,z] of [[-47.5,-23],[47.5,23]])addProp("shed",x,z);
 for(const [x,z] of [[-47.5,17],[47.5,-20]])addProp("silo",x,z);
 for(const [x,z] of [[-19,-46.5],[19,46.5]])addProp("pipeRack",x,z);
 for(const [x,z] of [[-43.5,-43.5],[43.5,-43.5],[-43.5,43.5],[43.5,43.5]])addProp("floodlight",x,z);
 for(const [x,z] of [[-7.6,-43],[7.6,-43],[-7.6,43],[7.6,43]])addProp("gatePost",x,z);
 // Perimeter fence with a gate gap |x|<=7 on both south/north sides.
 const fenceLine=EDGE/2+1;
 for(const z of [-fenceLine,fenceLine]){
  const xs=[];for(let i=0;i<=WORLD_SIZE;i+=2){const x=(i-WORLD_SIZE/2)*CELL;if(Math.abs(x)>7)xs.push(x);}
  for(const x of xs)addRubble("fence",x,1.15,z,.24,2.3,.23,0,rust);
  for(let i=0;i<xs.length-1;i++){const a=xs[i],b=xs[i+1];if(b-a>CELL*2+1e-9)continue;
   addRubble("fence",(a+b)/2,1.55,z,b-a-.2,.23,.21,0,dark);}
 }
 for(const x of [-fenceLine,fenceLine]){
  const zs=[];for(let z=-EDGE/2;z<=EDGE/2;z+=CELL*2)zs.push(z);
  for(const z of zs)addRubble("fence",x,1.15,z,.24,2.3,.23,0,rust);
  for(let i=0;i<zs.length-1;i++){const a=zs[i],b=zs[i+1];
   addRubble("fence",x,1.55,(a+b)/2,b-a-.2,.23,.21,Math.PI/2,dark);}
 }
 // Boulders ring the parcel on a SQUARE belt (a circular ring would cut inside
 // the parcel at the diagonals): perpendicular offset >= 43.5 keeps even the
 // conservative rotated AABB beyond the edge, so roads/machines can never reach.
 for(let i=0;i<52;i++){
  const side=Math.floor(rand()*4),t=(rand()-.5)*(EDGE+30),off=EDGE/2+1.5+rand()*14,size=.4+rand()*1.2;
  const x=side===0?off:side===1?-off:t,z=side===2?off:side===3?-off:t;
  addRubble("boulder",x,size*.4,z,size,size*.8,size*1.2,rand()*6,rand()>.5?rockC:sandC);
 }
 // --- flush decals: bench tints, dust, alleys, chevrons, stains -------------
 for(const [k,t] of terrain){
  if(t.kind!=="bench")continue;
  const [x,z]=cellOf(k);
  addDecal(origin(x),origin(z),3.3,3.3,.05,sandC);
 }
 for(let i=0;i<90;i++){
  const x=Math.floor(rand()*WORLD_SIZE),z=Math.floor(rand()*WORLD_SIZE),k=key(x,z);
  if(roadSet.has(k)||starter.has(k)||terrain.get(k)?.kind!=="pad")continue;
  const w=.8+rand()*1.8,d=.6+rand()*1.6;
  const jx=(CELL-w)/2-.05,jz=(CELL-d)/2-.05;
  addDecal(origin(x)+(rand()-.5)*2*jx,origin(z)+(rand()-.5)*2*jz,w,d,.035,rand()>.75?sandC:rockC);
 }
 // Maintenance alleys between the starter road corridors: gravel + tire tracks.
 const alley=(cx,cz,vertical)=>{
  const w=vertical?1:3.3,d=vertical?3.3:1;
  addDecal(cx,cz,w,d,.045,rockC);
  for(const s of [-.4,.4])addDecal(cx+(vertical?s:0),cz+(vertical?0:s),vertical?.16:3.3,vertical?3.3:.16,.04,dark);
 };
 for(const z of [10,14])for(let x=6;x<=18;x++){if(x===11)continue;alley(origin(x),origin(z),false);}
 for(let z=9;z<=16;z++){if(z===12)continue;alley(origin(8),origin(z),true);}
 // Hazard chevrons on starter loading bays (never on road cells).
 for(const b of STARTER_BUILDINGS)for(const c of bayCells(b.type,b.x,b.z,b.rot||0)){
  const k=key(c.x,c.z);if(roadSet.has(k))continue;
  for(let i=0;i<3;i++)addDecal(origin(c.x)+(i-1)*.9,origin(c.z),.8,.26,.05,orangeC,(i%2?1:-1)*Math.PI/4);
 }
 for(const [x,z] of [[15,13],[17,14],[6,15],[8,15]])addDecal(origin(x),origin(z),1.2,.9,.03,dark);
 for(const p of props)if(p.kind==="wreck")for(let i=0;i<2;i++)
  addDecal(p.x+(rand()-.5)*1.6,p.z+(rand()-.5)*1.6,.7,.6,.035,i?rust:rockC);
 for(const z of [-43,43])for(let i=0;i<4;i++)addDecal((i-1.5)*1.4,z,1.2,.4,.04,i%2?dark:orangeC);
 const plan={seed:s,props,rubble,decals};
 planCache.set(s,plan);
 return plan;
}
// Pure placement audit against the occupancy authority. Volumetric entries may
// only cover exterior/unsurveyed/rock cells (never starter footprint/bay), and
// must clear the truck sweep (road-cell centers +/- truckHalfWidth) on every
// INITIAL_ROADS cell. Decals must stay flush and off road cells.
export function validateSceneryPlan(plan,seed){
 const errors=[];
 const terrain=terrainFor(Number(seed)>>>0);
 const roadSet=new Set(INITIAL_ROADS);
 const starter=starterCellSet();
 const m=SCENERY.truckHalfWidth;
 const truckRects=INITIAL_ROADS.map(t=>{const [x,z]=cellOf(t),cx=origin(x),cz=origin(z);
  return {minX:cx-m,maxX:cx+m,minZ:cz-m,maxZ:cz+m};});
 const checkVol=(e,label)=>{
  for(const k of e.cells){
   const [x,z]=cellOf(k);
   if(!inside(x,z)||!surveyed(x,z))continue;
   if(terrain.get(k)?.kind!=="rock")errors.push(label+" occupies buildable cell "+k);
   if(starter.has(k))errors.push(label+" occupies starter footprint/bay "+k);
  }
  const a=e.aabb;
  for(const r of truckRects)
   if(a.minX<r.maxX&&a.maxX>r.minX&&a.minZ<r.maxZ&&a.maxZ>r.minZ)errors.push(label+" blocks the truck route");
 };
 plan.props.forEach((p,i)=>checkVol(p,"prop["+i+"]:"+p.kind));
 plan.rubble.forEach((r,i)=>checkVol(r,"rubble["+i+"]:"+r.kind));
 plan.decals.forEach((d,i)=>{
  if(d.h/2+.002>SCENERY.decalMaxHeight+1e-9)errors.push("decal["+i+"] above flush height limit");
  if(d.cells.some(c=>roadSet.has(c)))errors.push("decal["+i+"] on a road cell");
 });
 return {ok:errors.length===0,errors};
}
// Dynamic occupancy conflicts: roadLine may pave rock/ring cells and machines
// may claim any surveyed pad, so hide scenery whose cells are now occupied.
export function sceneryConflicts(plan,g){
 const blocked=new Set(g.roads);
 for(const b of g.buildings){
  for(const c of footprintCells(b.type,b.x,b.z,b.rot||0))blocked.add(key(c.x,c.z));
  for(const c of bayCells(b.type,b.x,b.z,b.rot||0))blocked.add(key(c.x,c.z));
 }
 const hit=(e)=>e.cells.some(c=>blocked.has(c));
 const props=[],rubble=[];
 plan.props.forEach((p,i)=>{if(hit(p))props.push(i);});
 plan.rubble.forEach((r,i)=>{if(hit(r))rubble.push(i);});
 return {props,rubble};
}
let sceneryDecalMat=null,sceneryRubbleMat=null;
const sceneryDummy=new THREE.Object3D();
const sceneryColor=new THREE.Color();
function buildSceneryProp(g,p){
 switch(p.kind){
  case "wreck":{
   box(g,0,.42,.15,1.7,.5,2.5,"rust").rotation.z=.05;
   box(g,0,.78,-.95,1.5,.62,.85,"dark").rotation.z=-.08;
   box(g,0,.62,-.35,1.42,.16,.7,"steel").rotation.x=.1;
   box(g,-.7,.18,.9,.3,.3,.3,"dark");box(g,.7,.18,.9,.3,.3,.3,"dark");
   cylinder(g,-.78,.3,-.55,.3,.22,"black",true);cylinder(g,.78,.3,-.55,.3,.22,"black",true);
   box(g,0,.68,1.32,1.5,.34,.1,"rust");
   box(g,-.86,.55,.2,.06,.18,1.6,"orange");
   box(g,.3,.95,-.9,.5,.1,.4,"steel").rotation.z=.3;
   break;}
  case "barrel":{
   box(g,0,.03,0,1.6,.06,1.6,"dark");
   for(const [dx,dz,m] of [[-.45,-.3,"rust"],[.4,-.35,"orange"],[0,.45,"dark"]]){
    cylinder(g,dx,.48,dz,.32,.95,m);
    box(g,dx,.74,dz,.68,.08,.68,"steel");
   }
   break;}
  case "container":{
   box(g,0,1,0,5,2,2.6,p.material||"rust");
   for(let i=-2;i<2;i+=.85)box(g,i,1.9,0,.06,.1,2.4,"steel");
   box(g,2.51,1,0,.06,1.7,2.2,"dark");
   break;}
  case "shed":{
   box(g,0,2,0,9,3.9,5.7,"body");
   box(g,0,4.2,0,9.6,.58,6.15,"roof");
   for(let j=-1;j<=1;j++)box(g,j*2.5,2.5,2.92,1.6,1.35,.09,"dark");
   for(let j=-1;j<=1;j++)box(g,j*2.5,4.52,0,.4,.12,3.8,"steel");
   cylinder(g,-3.4,6.4,-1.8,.22,4.5,"rust");
   box(g,0,1.1,2.93,1.8,2.2,.08,"black");
   break;}
  case "silo":{
   for(let i=-1;i<=1;i++){
    cylinder(g,i*2.8,2.6,0,1.15,5.2,i===0?"rust":"steel");
    cylinder(g,i*2.8,5.55,0,.88,.6,"roof");
    box(g,i*2.8,1.1,1.2,.22,1.8,.35,"orange");
   }
   break;}
  case "pipeRack":{
   box(g,0,1.05,0,6,1.6,2.3,"rust");
   box(g,0,2.05,0,6.1,.25,2.45,"roof");
   for(let j=-2;j<=2;j++)box(g,j,1.25,1.2,.12,.55,.1,"steel");
   box(g,3.2,2.45,0,.28,4.8,.28,"orange");
   break;}
  case "floodlight":{
   cylinder(g,0,4,0,.16,8,"dark");
   box(g,0,8.1,0,.85,.28,.75,"orange");
   const light=new THREE.PointLight("#f4b77b",16,20,2);light.position.set(0,7.6,0);g.add(light);
   break;}
  case "gatePost":{
   box(g,0,1.3,0,.3,2.6,.3,"orange");
   box(g,0,2.45,0,.34,.18,.34,"dark");
   box(g,0,.9,0,.32,.5,.32,"black");
   break;}
 }
}
// THREE builder: shared unit geometry + material pool; decals and rubble are
// one InstancedMesh each (2 draw calls for ~430 instances). Node-testable with
// a document stub (no canvas text panels in scenery).
export function buildScenery(parent,plan){
 const stats={propMeshes:0,propTriangles:0,pointLights:0,rubbleInstances:plan.rubble.length,decalInstances:plan.decals.length};
 box(parent,0,-.26,0,EDGE+5,.45,EDGE+5,"earth").castShadow=false;
 if(!sceneryDecalMat)sceneryDecalMat=new THREE.MeshStandardMaterial({color:"#ffffff",metalness:.07,roughness:.85,flatShading:true});
 if(!sceneryRubbleMat)sceneryRubbleMat=new THREE.MeshStandardMaterial({color:"#ffffff",metalness:.2,roughness:.8,flatShading:true});
 const decalMesh=new THREE.InstancedMesh(geo,sceneryDecalMat,Math.max(1,plan.decals.length));
 decalMesh.name="scenery:decals";decalMesh.castShadow=false;decalMesh.receiveShadow=true;decalMesh.frustumCulled=false;
 decalMesh.userData.decorative=true;decalMesh.userData.authority=SCENERY_AUTHORITY;
 plan.decals.forEach((d,i)=>{
  sceneryDummy.position.set(d.x,d.h/2+.002,d.z);sceneryDummy.rotation.set(0,d.rotY||0,0);sceneryDummy.scale.set(d.w,d.h,d.d);
  sceneryDummy.updateMatrix();decalMesh.setMatrixAt(i,sceneryDummy.matrix);decalMesh.setColorAt(i,sceneryColor.set(d.color));
 });
 if(!plan.decals.length){sceneryDummy.scale.set(0,0,0);sceneryDummy.updateMatrix();decalMesh.setMatrixAt(0,sceneryDummy.matrix);}
 decalMesh.instanceMatrix.needsUpdate=true;if(decalMesh.instanceColor)decalMesh.instanceColor.needsUpdate=true;
 parent.add(decalMesh);
 const rubbleMesh=new THREE.InstancedMesh(geo,sceneryRubbleMat,Math.max(1,plan.rubble.length));
 rubbleMesh.name="scenery:rubble";rubbleMesh.castShadow=true;rubbleMesh.receiveShadow=true;rubbleMesh.frustumCulled=false;
 rubbleMesh.userData.decorative=true;rubbleMesh.userData.authority=SCENERY_AUTHORITY;
 plan.rubble.forEach((r,i)=>{
  sceneryDummy.position.set(r.x,r.y,r.z);sceneryDummy.rotation.set(0,r.rotY||0,0);sceneryDummy.scale.set(r.w,r.h,r.d);
  sceneryDummy.updateMatrix();rubbleMesh.setMatrixAt(i,sceneryDummy.matrix);rubbleMesh.setColorAt(i,sceneryColor.set(r.color));
 });
 if(!plan.rubble.length){sceneryDummy.scale.set(0,0,0);sceneryDummy.updateMatrix();rubbleMesh.setMatrixAt(0,sceneryDummy.matrix);}
 rubbleMesh.instanceMatrix.needsUpdate=true;if(rubbleMesh.instanceColor)rubbleMesh.instanceColor.needsUpdate=true;
 parent.add(rubbleMesh);
 const propNodes=plan.props.map(p=>{
  const g=new THREE.Group();g.name="scenery:"+p.kind;
  g.position.set(p.x,0,p.z);g.rotation.y=p.rotY||0;
  g.userData.decorative=true;g.userData.authority=SCENERY_AUTHORITY;g.userData.sceneryKind=p.kind;
  buildSceneryProp(g,p);parent.add(g);
  g.traverse(o=>{
   if(o.isMesh){stats.propMeshes++;const idx=o.geometry.index;stats.propTriangles+=idx?idx.count/3:o.geometry.attributes.position.count/3;}
   if(o.isPointLight)stats.pointLights++;
  });
  return g;
 });
 return {propNodes,rubbleMesh,decalMesh,rubbleBase:rubbleMesh.instanceMatrix.array.slice(),stats};
}
// Rebuild-only visibility pass (never per-frame): hidden props toggle .visible,
// hidden rubble instances collapse to zero-scale matrices; base matrices are
// restored verbatim when the conflict clears.
export function applySceneryVisibility(build,conflicts){
 const hp=new Set(conflicts.props),hr=new Set(conflicts.rubble);
 build.propNodes.forEach((n,i)=>{n.visible=!hp.has(i);});
 const arr=build.rubbleMesh.instanceMatrix.array,base=build.rubbleBase;
 for(let i=0;i<build.rubbleMesh.count;i++){
  if(hr.has(i)){arr.fill(0,i*16,i*16+16);arr[i*16+15]=1;}
  else arr.set(base.subarray(i*16,i*16+16),i*16);
 }
 build.rubbleMesh.instanceMatrix.needsUpdate=true;
}
export class LivingWorld{
 constructor(host){
  this.host=host;this.scene=new THREE.Scene();
  this.scene.background=new THREE.Color("#1a2930");this.scene.fog=new THREE.FogExp2("#3e4240",.0038);
  this.camera=new THREE.OrthographicCamera(-25,25,15,-15,.1,600);
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:"high-performance"});
  this.renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
  this.renderer.outputColorSpace=THREE.SRGBColorSpace;
  this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.9;
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  this.renderer.domElement.className="world-canvas";this.renderer.domElement.dataset.world3d="initializing";this.renderer.domElement.setAttribute("aria-label","Rustwake interactive 3D salvage sandbox");
  host.appendChild(this.renderer.domElement);
  this.scene.add(new THREE.HemisphereLight("#d8e7e3","#897754",2.5));
  const sun=new THREE.DirectionalLight("#ffe5b3",3.65);sun.position.set(-45,90,38);
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  sun.shadow.camera.left=-130;sun.shadow.camera.right=130;sun.shadow.camera.top=130;sun.shadow.camera.bottom=-130;
  sun.shadow.bias=-.0001;this.scene.add(sun);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(1800,1800),mat("#2e3b38"));
  ground.rotation.x=-Math.PI/2;ground.position.y=-.42;ground.receiveShadow=true;this.scene.add(ground);
  // ART-05 (#351): decorative yard crew state (no freight authority, #274).
  this.crewWorkers=[];this.forklift=null;this.drone=null;this.crewTimers=new Map();this.droneAnchorId="none";
  this.terrainSeed=DEFAULT_YARD_SEED;this.sceneryPlan=null;this.sceneryBuild=null;
  this.scenery=new THREE.Group();this.scene.add(this.scenery);this.makeTerrain();
  this.roadGroup=new THREE.Group();this.buildingGroup=new THREE.Group();this.vehicleGroup=new THREE.Group();
  this.scene.add(this.roadGroup,this.buildingGroup,this.vehicleGroup);
  this.ghost=new THREE.Group();this.scene.add(this.ghost);
  this.raycaster=new THREE.Raycaster();
  this.groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
  this.state=null;this.sig="";this.built=new Map();this.trucks=new Map();this.view={yaw:45,elevation:35.264,zoom:1,x:0,z:0};
  // ART-06 (#352): prefers-reduced-motion parks continuous crane motion in a static
  // pose; simulation/economic timing is untouched (MOTION_AUDIO.md accessibility).
  const mq=typeof window!=="undefined"&&window.matchMedia?window.matchMedia("(prefers-reduced-motion: reduce)"):null;
  this.reducedMotion=!!(mq&&mq.matches);
  if(mq&&mq.addEventListener)mq.addEventListener("change",e=>{this.reducedMotion=!!e.matches;});
  this.resize();
 }
 // ART-07 (#353): terrain is a deterministic, occupancy-audited scenery plan
 // (yardSceneryPlan) rendered by buildScenery — original 3D geometry, never an
 // image. Interior landmarks stand on permanently TERRAIN-rejected rock cells;
 // the exterior belt sits beyond the parcel; decals stay flush and off roads.
 makeTerrain(seed=this.terrainSeed){
  this.terrainSeed=Number(seed)>>>0;
  this.sceneryPlan=yardSceneryPlan(this.terrainSeed);
  this.sceneryBuild=buildScenery(this.scenery,this.sceneryPlan);
  // Human scale references beside starter loading bays (1.7 units tall vs 3.5-unit cells).
  for(const [cx,cz,dx,dz,ry] of [[13,9,-1.0,2.1,.4],[15,18,1.05,2.0,-.7],[7,9,1.2,1.9,2.2]]){
   const w=createWorker();w.position.set(cellCenter(cx)+dx,0,cellCenter(cz)+dz);w.rotation.y=ry;this.scenery.add(w);this.crewWorkers.push(w);
  }
  this.stampScenery();
 }
 // Seed changes (new save / imported save) rebuild the whole dressing; crew
 // rigs owned by update() are re-attached, and the state signature is cleared
 // so rebuild(g) re-applies occupancy visibility against the new plan.
 rebuildScenery(seed){
  if(this.sceneryBuild){this.sceneryBuild.rubbleMesh.dispose();this.sceneryBuild.decalMesh.dispose();}
  this.scenery.clear();
  this.crewWorkers=[];
  this.makeTerrain(seed);
  if(this.forklift)this.scenery.add(this.forklift);
  if(this.drone)this.scenery.add(this.drone);
  this.sig="";
 }
 stampScenery(){
  const d=this.renderer.domElement.dataset;
  d.scenerySeed=String(this.terrainSeed);
  d.sceneryProps=String(this.sceneryPlan.props.length);
  d.sceneryRubble=String(this.sceneryPlan.rubble.length);
  d.sceneryDecals=String(this.sceneryPlan.decals.length);
 }
 setView(view){
  Object.assign(this.view,view);
  this.view=normalizeCamera(this.view);
 }
 resize(){
  const w=Math.max(1,this.host.clientWidth),h=Math.max(1,this.host.clientHeight);
  this.renderer.setSize(w,h,false);this.width=w;this.height=h;
  this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
 }
 applyCamera(){
  const {yaw,elevation,zoom,x,z}=this.view;
  const aspect=this.width/this.height,half=CAMERA_LIMITS.frustumHeight/(2*zoom);
  this.camera.left=-half*aspect;this.camera.right=half*aspect;
  this.camera.top=half;this.camera.bottom=-half;
  const y=THREE.MathUtils.degToRad(elevation),t=THREE.MathUtils.degToRad(yaw);
  const dist=150,cos=Math.cos(y);
  this.camera.position.set(x+dist*cos*Math.sin(t),dist*Math.sin(y),z+dist*cos*Math.cos(t));
  this.camera.lookAt(new THREE.Vector3(x,0,z));this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld(true);
  this.stampCamera();
 }
 // Observability contract: the canvas dataset must reflect the APPLIED camera
 // synchronously on every path (pointer input, UI zoom buttons, render loop).
 // Stamping only after renderer.render() let slow software-WebGL frames leave
 // a stale cameraZoom visible to UI/tests even though the camera had moved.
 stampCamera(){
  const d=this.renderer.domElement.dataset;
  d.cameraYaw=String(this.view.yaw);
  d.cameraElevation=String(this.view.elevation);
  d.cameraZoom=String(this.view.zoom);
  d.cameraX=String(this.view.x);
  d.cameraZ=String(this.view.z);
 }
 screenToCell(cx,cy){
  const rect=this.renderer.domElement.getBoundingClientRect();
  const nx=((cx-rect.left)/rect.width)*2-1,ny=-((cy-rect.top)/rect.height)*2+1;
  this.raycaster.setFromCamera(new THREE.Vector2(nx,ny),this.camera);
  const hit=new THREE.Vector3();
  if(!this.raycaster.ray.intersectPlane(this.groundPlane,hit))return null;
  const x=Math.floor(hit.x/CELL+WORLD_SIZE/2),z=Math.floor(hit.z/CELL+WORLD_SIZE/2);
  return {x,z,wx:hit.x,wz:hit.z};
 }
 setState(g){this.state=g;
  // ART-07 (#353): a different save seed rebuilds the yard dressing itself.
  const seed=Number.isFinite(g.seed)?g.seed>>>0:DEFAULT_YARD_SEED;
  if(seed!==this.terrainSeed)this.rebuildScenery(seed);
  const signature=g.roads.join("|")+"//"+g.buildings.map(b=>b.id+":"+b.type+":"+b.x+":"+b.z+":"+(b.rot||0)+":"+Math.floor(b.remaining)).join("|");
  if(signature!==this.sig){this.sig=signature;this.rebuild(g);}
 }
 rebuild(g){
  this.roadGroup.clear();this.buildingGroup.clear();this.built.clear();
  for(const tile of g.roads){const [x,z]=cellOf(tile),wx=origin(x),wz=origin(z);
   box(this.roadGroup,wx,.11,wz,CELL*.99,.15,CELL*.99,"asphalt").castShadow=false;
   if((x+z)%2===0)box(this.roadGroup,wx,.205,wz,.11,.012,.7,"line").castShadow=false;
  }
  for(const b of g.buildings){const built=makeBuilding(b,g.elapsed);this.built.set(b.id,built);this.buildingGroup.add(built.group);}
  // ART-07 (#353): decorations never occupy build sites or block routes — any
  // prop/rubble whose cells became road/footprint/bay is hidden (rebuild-only).
  const conflicts=sceneryConflicts(this.sceneryPlan,g);
  applySceneryVisibility(this.sceneryBuild,conflicts);
  // ART-01 observability: schema identity + machine count, separate from camera stamps.
  const d=this.renderer.domElement.dataset;
  d.voxelSchema=SCHEMA_ID;d.machineCount=String(g.buildings.length);
  d.sceneryHidden=String(conflicts.props.length+conflicts.rubble.length);
 }
 drawGhost(mode,cell,valid,start,footprint){
  this.ghost.clear();if(!cell||cell.x<0||cell.z<0||cell.x>=WORLD_SIZE||cell.z>=WORLD_SIZE)return;
  const m=new THREE.MeshBasicMaterial({color:valid?"#7ed4b3":"#ee8263",transparent:true,opacity:.4,depthWrite:false});
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(CELL*.94,.12,CELL*.94),m);
  mesh.position.set(origin(cell.x),.2,origin(cell.z));this.ghost.add(mesh);
  // Full rotated footprint + loading-bay approach, so the player sees exactly
  // which cells the validator judged (#370). Out-of-bounds cells are skipped.
  if(mode==="build"&&footprint){
   const bayMat=new THREE.MeshBasicMaterial({color:valid?"#e5ac60":"#ee8263",transparent:true,opacity:.22,depthWrite:false});
   for(const c of footprint.cells||[]){
    if(c.x<0||c.z<0||c.x>=WORLD_SIZE||c.z>=WORLD_SIZE||(c.x===cell.x&&c.z===cell.z))continue;
    const q=mesh.clone();q.position.set(origin(c.x),.2,origin(c.z));this.ghost.add(q);
   }
   for(const c of footprint.bay||[]){
    if(c.x<0||c.z<0||c.x>=WORLD_SIZE||c.z>=WORLD_SIZE)continue;
    const q=new THREE.Mesh(new THREE.BoxGeometry(CELL*.94,.06,CELL*.94),bayMat);
    q.position.set(origin(c.x),.16,origin(c.z));this.ghost.add(q);
   }
  }
  if(mode==="road"&&start){
   const x0=start.x,z0=start.z,x1=cell.x,z1=cell.z;
   const add=(x,z)=>{const q=mesh.clone();q.position.set(origin(x),.22,origin(z));this.ghost.add(q);};
   let x=x0,z=z0;while(x!==x1){x+=Math.sign(x1-x);add(x,z);}while(z!==z1){z+=Math.sign(z1-z);add(x,z);}
  }
 }
 update(g,dt,time){
  this.setState(g);
  const width=Math.max(1,this.host.clientWidth),height=Math.max(1,this.host.clientHeight);
  if(width!==this.width||height!==this.height)this.resize();
  this.applyCamera();
  let craneStamp=null;
  for(const [id,obj] of this.built){
   const b=g.buildings.find(b=>b.id===id);if(!b)continue;
   obj.group.userData.buildingId=id;
   for(const p of obj.parts){
    if(p.kind==="spin")p.node.rotation.y=time*1.75;
    if(p.kind==="rocker")p.node.rotation.y=Math.sin(time*.65+id)*.55;
    if(p.kind==="crane"){const pose=cranePose(time,this.reducedMotion);applyCranePose(p,pose);craneStamp=pose;}
    if(p.kind==="rotate")p.node.rotation.y=time*.22;
   }
   if(b.type==="furnace"||b.type==="foundry")obj.group.scale.y=1+.009*Math.sin(time*5+id);
  }
  // ART-05 (#351): one LOD tier per frame from the real projected cell size.
  const lodTier=rigLodTier(this.view.zoom,this.height);
  const alive=new Set();
  let freightLoaded=0,freightOnboard=0;
  for(const v of g.vehicles){
   alive.add(v.id);
   let truck=this.trucks.get(v.id);
   if(!truck){truck=createTruck(v);this.vehicleGroup.add(truck);this.trucks.set(v.id,truck);}
   truck.position.set(origin(v.x),.22,origin(v.z));
   if(v.job?.route&&v.job.segment<v.job.route.length-1){
    const from=v.job.route[v.job.segment],to=v.job.route[v.job.segment+1];
    truck.rotation.y=Math.atan2(to.x-from.x,to.z-from.z);
   }
   // ART-05 (#351): articulation from real travelled distance/route/speed only;
   // reduced motion parks wheel/steer/bob/beacon while sim position advances.
   stepTruck(truck,v,dt,time,this.reducedMotion);
   // LOG-04 (#384): rebuild the visible load only when the actual onboard cargo
   // changes; crate count/color derive from v.cargo, never from the job phase.
   syncTruckCargo(truck,v);
   applyRigLod(truck,lodTier);
   const cargo=v.cargo&&v.cargo.amount>0?v.cargo:null;
   if(cargo){freightLoaded++;freightOnboard+=cargo.amount;}
  }
  for(const [id,tr] of this.trucks)if(!alive.has(id)){this.vehicleGroup.remove(tr);this.trucks.delete(id);}
  // ART-05 (#351): DECORATIVE yard crew — zero freight/production authority (#274).
  // Forklift: stationed on the depot bay approach cell (machines can never build
  // there); fork lift responds only to the nearest real truck's distance.
  if(!this.forklift){
   this.forklift=createForklift();
   this.forklift.position.set(FORKLIFT_POST.x,0,FORKLIFT_POST.z);
   this.forklift.rotation.y=FORKLIFT_POST.rotY;
   this.scenery.add(this.forklift);
  }
  let nearest=Infinity;
  for(const v of g.vehicles){
   const d=Math.hypot(origin(v.x)-FORKLIFT_POST.x,origin(v.z)-FORKLIFT_POST.z);
   if(d<nearest)nearest=d;
  }
  applyForkliftPose(this.forklift,forkliftLift(nearest,this.reducedMotion));
  applyRigLod(this.forklift,lodTier);
  // Drone: hovers over a building whose cycle timer actually advanced this frame;
  // otherwise parked on the service roof. Hover/rotor motion is decorative flight
  // on the sim clock — never presented as work or freight.
  if(!this.drone){this.drone=createDrone();this.scenery.add(this.drone);this.drone.position.set(DRONE_PAD.x,DRONE_PAD.y,DRONE_PAD.z);}
  const anchor=activeCycleAnchor(g.buildings,this.crewTimers);
  this.crewTimers=new Map(g.buildings.map(b=>[b.id,b.timer]));
  let anchorId="none";
  const hover=droneHover(g.elapsed||0,this.reducedMotion);
  if(anchor){
   const wf=worldFootprint(anchor.type,anchor.x,anchor.z,anchor.rot||0);
   const desc=machineDescriptor(anchor.type);
   const roofY=(desc?.bounds.height||2.5)+1.4;
   this.drone.position.set(wf.pivot.x,roofY+hover.bob,wf.pivot.z);
   anchorId=String(anchor.id);
  }else{
   this.drone.position.set(DRONE_PAD.x,DRONE_PAD.y,DRONE_PAD.z);
  }
  for(const r of this.drone.userData.rotors)r.rotation.y=anchor?hover.rotor:0;
  applyRigLod(this.drone,lodTier);
  for(const w of this.crewWorkers)applyRigLod(w,lodTier);
  this.droneAnchorId=anchorId;
  this.renderer.render(this.scene,this.camera);
  // applyCamera() already stamped this frame's camera synchronously; only the
  // rendered-ready flag belongs after the first successful render.
  this.renderer.domElement.dataset.world3d="ready";
  // LOG-04 (#384): additive freight stamps (camera stamps above are untouched).
  this.renderer.domElement.dataset.freightLoaded=String(freightLoaded);
  this.renderer.domElement.dataset.freightOnboard=String(freightOnboard);
  // ART-06 (#352): additive crane-cycle observability (camera stamps untouched).
  const cd=this.renderer.domElement.dataset;
  cd.cranePhase=craneStamp?craneStamp.phase:"none";
  cd.craneTrolley=craneStamp?craneStamp.trolley.toFixed(3):"0";
  cd.craneDrop=craneStamp?craneStamp.drop.toFixed(3):"0";
  cd.craneReducedMotion=this.reducedMotion?"1":"0";
  // ART-05 (#351): additive rig observability (camera stamps untouched). Wheel
  // angle must equal travelled distance / radius; crew stamps expose the honest
  // decorative anchoring so captures/tests can prove no fabricated freight.
  cd.rigLod=String(lodTier);
  cd.rigReducedMotion=this.reducedMotion?"1":"0";
  const lead=this.trucks.get(1)||[...this.trucks.values()][0];
  cd.truck1Dist=lead?lead.userData.distance.toFixed(3):"0.000";
  cd.truck1Wheel=lead?lead.userData.wheelAngle.toFixed(3):"0.000";
  cd.truck1Cargo=lead?(lead.userData.cargoSig||"none"):"none";
  cd.forkliftLift=this.forklift.userData.lift.toFixed(3);
  cd.droneAnchor=this.droneAnchorId;
 }
 dispose(){if(this.sceneryBuild){this.sceneryBuild.rubbleMesh.dispose();this.sceneryBuild.decalMesh.dispose();}this.renderer.dispose();this.renderer.domElement.remove();this.scene.clear();}
}
