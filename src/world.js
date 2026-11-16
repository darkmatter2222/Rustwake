import * as THREE from "three";
import {CELL,WORLD_SIZE,BLUEPRINTS} from "./content.js";
import {cellOf,key} from "./simulation.js";

const EDGE=WORLD_SIZE*CELL;
const origin=(i)=>(i-WORLD_SIZE/2+.5)*CELL;
const mat=(hex,metalness=.07,roughness=.78)=>new THREE.MeshStandardMaterial({color:hex,metalness,roughness,flatShading:true});
const mats={
 asphalt:mat("#222c31"),line:mat("#e5ac60"),earth:mat("#55534a"),rock:mat("#77715c"),
 steel:mat("#8fa0a1",.42),dark:mat("#33474e",.38),rust:mat("#b87549",.3),
 orange:mat("#e7a25d",.36),lights:new THREE.MeshStandardMaterial({color:"#86d5c5",emissive:"#4baba7",emissiveIntensity:1.1}),
 furnace:new THREE.MeshStandardMaterial({color:"#f98b50",emissive:"#cf431c",emissiveIntensity:1.8}),
 roof:mat("#57696c",.35),body:mat("#697e82",.4),glass:mat("#9ab9bc",.1,.22),
 sand:mat("#6e6250"),wood:mat("#80644d"),black:mat("#151d23",.1)
};
const geo=new THREE.BoxGeometry(1,1,1);
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
function makeBuilding(b,time){
 const group=new THREE.Group();
 group.position.set(origin(b.x),0,origin(b.z));
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
  group.add(arm);parts.push({kind:"rocker",node:arm});
 } else if(kind==="depot"||kind==="market"){
  add(0,1.48,0,2.95,2.14,2.65,kind==="depot"?"body":"wood");
  add(0,2.67,0,3.13,.4,2.88,"roof");
  add(0,1.35,1.34,1.6,1.35,.13,"black");
  add(.9,1.6,1.42,.23,1.15,.14,"orange");
  add(-1.18,1.6,1.42,.12,1.2,.15,"orange");
  for(let i=-1;i<=1;i++)add(i*.82,2.72,-.12,.45,.06,.9,"steel");
  textPanel(group,kind==="depot"?"FREIGHT":"EXCHANGE",0,2.2,1.44,1.1);
 } else if(kind==="generator"){
  add(0,1.02,0,2.75,.95,2.8,"body");
  add(0,1.75,0,2.8,.45,2.8,"dark");
  const fan=new THREE.Group();fan.position.set(0,1.9,0);
  cylinder(fan,0,.1,0,.65,.35,"steel");
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5;const s=box(fan,Math.cos(a)*.84,.1,Math.sin(a)*.84,.95,.14,.28,"orange");s.rotation.y=a;}
  group.add(fan);parts.push({kind:"spin",node:fan});
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
  const boom=new THREE.Group();boom.position.set(0,5.1,0);
  box(boom,1.5,0,0,6.5,.28,.38,"orange");
  for(let i=0;i<8;i++){beam(boom,-1.4+i*.7,.36,0,.7,"x","steel");}
  box(boom,4.35,-1.18,0,.14,2.4,.14,"steel");
  box(boom,4.35,-2.38,0,.85,.45,.75,"rust");
  box(boom,-1.45,-.15,0,1.5,.7,1.6,"dark");
  group.add(boom);parts.push({kind:"crane",node:boom});
 } else if(kind==="turret"){
  add(0,1.4,0,1.5,2.2,1.6,"dark");
  cylinder(group,0,2.7,0,.98,.4,"steel");
  const head=new THREE.Group();head.position.set(0,2.95,0);
  add(0,3.18,0,1.55,.48,1.2,"roof");
  box(head,0,0,-1,.38,.32,2.45,"orange");
  group.add(head);parts.push({kind:"rotate",node:head});
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
 add(0,.11,CELL*.37,1.22,.08,.42,"orange");
 add(1.28,.95,1.25,.25,.25,.25,"lights");
 if(has){ // foundation + staged frame, never a pop-in balloon.
  const ratio=Math.max(0,1-b.remaining/5);
  for(const child of [...group.children])if(child!==foot)child.visible=ratio>=.25;
  if(ratio<.65){for(const child of group.children)if(child!==foot)child.visible=child.position.y<1.4||ratio>.35;}
 }
 return {group,parts};
}
function createTruck(i){
 const g=new THREE.Group();
 const paint=i%3===0?"rust":i%3===1?"orange":"body";
 box(g,0,.62,0,1.1,.67,1.55,paint);
 box(g,0,.91,-.48,1.12,.78,.7,"dark");
 box(g,0,1.05,-.86,.95,.39,.09,"glass");
 box(g,0,.38,.62,1.2,.54,.96,"steel");
 for(const x of [-.53,.53])for(const z of [-.58,.58])cylinder(g,x,.25,z,.3,.2,"black",true);
 box(g,-.38,.67,-.91,.23,.16,.08,"lights");
 box(g,.38,.67,-.91,.23,.16,.08,"lights");
 g.userData.vehicle=true;
 return g;
}
function seeded(seed){let s=seed>>>0;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
export class LivingWorld{
 constructor(host){
  this.host=host;this.scene=new THREE.Scene();
  this.scene.background=new THREE.Color("#1a2930");this.scene.fog=new THREE.FogExp2("#27323a",.007);
  this.camera=new THREE.OrthographicCamera(-25,25,15,-15,.1,600);
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:"high-performance"});
  this.renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
  this.renderer.outputColorSpace=THREE.SRGBColorSpace;
  this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.55;
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  this.renderer.domElement.className="world-canvas";this.renderer.domElement.setAttribute("aria-label","Rustwake interactive 3D salvage sandbox");
  host.appendChild(this.renderer.domElement);
  this.scene.add(new THREE.HemisphereLight("#cadde2","#665a46",2.05));
  const sun=new THREE.DirectionalLight("#ffe5b3",3.0);sun.position.set(-45,90,38);
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  sun.shadow.camera.left=-130;sun.shadow.camera.right=130;sun.shadow.camera.top=130;sun.shadow.camera.bottom=-130;
  sun.shadow.bias=-.0001;this.scene.add(sun);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(1800,1800),mat("#2e3b38"));
  ground.rotation.x=-Math.PI/2;ground.position.y=-.42;ground.receiveShadow=true;this.scene.add(ground);
  this.scenery=new THREE.Group();this.scene.add(this.scenery);this.makeTerrain();
  this.roadGroup=new THREE.Group();this.buildingGroup=new THREE.Group();this.vehicleGroup=new THREE.Group();
  this.scene.add(this.roadGroup,this.buildingGroup,this.vehicleGroup);
  this.ghost=new THREE.Group();this.scene.add(this.ghost);
  this.raycaster=new THREE.Raycaster();
  this.groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
  this.state=null;this.sig="";this.built=new Map();this.trucks=new Map();this.view={yaw:45,elevation:35.264,zoom:1,x:0,z:0};
  this.resize();
 }
 makeTerrain(){
  const rand=seeded(48891);
  box(this.scenery,0,-.26,0,EDGE+5,.45,EDGE+5,"earth");
  for(let i=0;i<130;i++){
   const x=(rand()-.5)*EDGE,z=(rand()-.5)*EDGE;
   box(this.scenery,x,.015,z,.7+rand()*2,.03,.5+rand()*2,rand()>.8?"sand":"rock").castShadow=false;
  }
  // Rusted perimeter with gaps: the player is on an explorable industrial parcel.
  for(let i=0;i<=WORLD_SIZE;i+=2){
   const x=(i-WORLD_SIZE/2)*CELL;
   if(Math.abs(x)>7){box(this.scenery,x,1.15,-EDGE/2-1,.24,2.3,.23,"rust");box(this.scenery,x,1.15,EDGE/2+1,.24,2.3,.23,"rust");}
  }
  for(const x of [-EDGE/2-1,EDGE/2+1]){
   for(let z=-EDGE/2;z<=EDGE/2;z+=CELL*2){
    box(this.scenery,x,.95,z,.24,1.9,.24,"rust");
    if(Math.abs(z)>10)beam(this.scenery,x,1.55,z,CELL*1.9,"z","dark");
   }
  }
  // Container stacks, crane staging, scrap piles: never a blank flat world at first frame.
  const containers=[[-30,-28],[-26,-28],[27,26],[30,26],[-30,26],[30,-27]];
  for(const [x,z] of containers){
   box(this.scenery,x,1,z,5,2,2.6,"rust");
   for(let p=-2;p<2;p+=.85)box(this.scenery,x+p,1.9,z, .06,.1,2.4,"steel");
  }
  for(let i=0;i<52;i++){
   const a=rand()*Math.PI*2,r=EDGE*.50+rand()*17;
   const x=Math.cos(a)*r,z=Math.sin(a)*r;
   const size=.4+rand()*1.2;
   box(this.scenery,x,size/2,z,size,size*.8,size*1.2,rand()>.5?"rock":"sand").rotation.y=rand()*6;
  }
  for(let i=0;i<15;i++){
   const x=(rand()-.5)*EDGE*.85,z=(rand()-.5)*EDGE*.85;
   if(x*x+z*z<450)continue;
   const p=box(this.scenery,x,.48,z,1.5,.8,1.4,i%2?"rust":"dark");p.rotation.y=rand()*Math.PI;
  }
  // Warm floodlights define the site; no bloom or photoreal assets.
  for(const [x,z] of [[-EDGE/2+5,-EDGE/2+5],[EDGE/2-5,-EDGE/2+5],[-EDGE/2+5,EDGE/2-5],[EDGE/2-5,EDGE/2-5]]){
   cylinder(this.scenery,x,4,z,.16,8,"dark");
   box(this.scenery,x,8.1,z,.85,.28,.75,"orange");
   const light=new THREE.PointLight("#f4b77b",16,20,2);light.position.set(x,7.6,z);this.scenery.add(light);
  }
 }
 setView(view){
  Object.assign(this.view,view);
  this.view.zoom=THREE.MathUtils.clamp(this.view.zoom,.42,3.4);
  this.view.elevation=THREE.MathUtils.clamp(this.view.elevation,20,80);
 }
 resize(){
  const w=Math.max(1,this.host.clientWidth),h=Math.max(1,this.host.clientHeight);
  this.renderer.setSize(w,h,false);this.width=w;this.height=h;
  this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
 }
 applyCamera(){
  const {yaw,elevation,zoom,x,z}=this.view;
  const aspect=this.width/this.height,half=40/zoom;
  this.camera.left=-half*aspect;this.camera.right=half*aspect;
  this.camera.top=half;this.camera.bottom=-half;
  const y=THREE.MathUtils.degToRad(elevation),t=THREE.MathUtils.degToRad(yaw);
  const dist=150,cos=Math.cos(y);
  this.camera.position.set(x+dist*cos*Math.sin(t),dist*Math.sin(y),z+dist*cos*Math.cos(t));
  this.camera.lookAt(new THREE.Vector3(x,0,z));this.camera.updateProjectionMatrix();
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
 setState(g){this.state=g;const signature=g.roads.join("|")+"//"+g.buildings.map(b=>b.id+":"+b.type+":"+b.x+":"+b.z+":"+Math.floor(b.remaining)).join("|");
  if(signature!==this.sig){this.sig=signature;this.rebuild(g);}
 }
 rebuild(g){
  this.roadGroup.clear();this.buildingGroup.clear();this.built.clear();
  for(const tile of g.roads){const [x,z]=cellOf(tile),wx=origin(x),wz=origin(z);
   box(this.roadGroup,wx,.11,wz,CELL*.99,.15,CELL*.99,"asphalt").castShadow=false;
   if((x+z)%2===0)box(this.roadGroup,wx,.205,wz,.11,.012,.7,"line").castShadow=false;
  }
  for(const b of g.buildings){const built=makeBuilding(b,g.elapsed);this.built.set(b.id,built);this.buildingGroup.add(built.group);}
 }
 drawGhost(mode,cell,valid,start){
  this.ghost.clear();if(!cell||cell.x<0||cell.z<0||cell.x>=WORLD_SIZE||cell.z>=WORLD_SIZE)return;
  const m=new THREE.MeshBasicMaterial({color:valid?"#7ed4b3":"#ee8263",transparent:true,opacity:.4,depthWrite:false});
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(CELL*.94,.12,CELL*.94),m);
  mesh.position.set(origin(cell.x),.2,origin(cell.z));this.ghost.add(mesh);
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
  for(const [id,obj] of this.built){
   const b=g.buildings.find(b=>b.id===id);if(!b)continue;
   obj.group.userData.buildingId=id;
   for(const p of obj.parts){
    if(p.kind==="spin")p.node.rotation.y=time*1.75;
    if(p.kind==="rocker")p.node.rotation.y=Math.sin(time*.65+id)*.55;
    if(p.kind==="crane")p.node.rotation.y=Math.sin(time*.24)*.34;
    if(p.kind==="rotate")p.node.rotation.y=time*.22;
   }
   if(b.type==="furnace"||b.type==="foundry")obj.group.scale.y=1+.009*Math.sin(time*5+id);
  }
  const alive=new Set();
  for(const v of g.vehicles){
   alive.add(v.id);
   let truck=this.trucks.get(v.id);
   if(!truck){truck=createTruck(v.id);this.vehicleGroup.add(truck);this.trucks.set(v.id,truck);}
   truck.position.set(origin(v.x),.22+Math.sin(time*5+v.id)*.01,origin(v.z));
   if(v.job?.route&&v.job.segment<v.job.route.length-1){
    const from=v.job.route[v.job.segment],to=v.job.route[v.job.segment+1];
    truck.rotation.y=Math.atan2(to.x-from.x,to.z-from.z);
   }
   if(v.cargo && !truck.userData.loaded){
    const load=box(truck,0,1.05,.52,.95,.5,.9,"rust");load.name="cargo";truck.userData.loaded=true;
   }else if(!v.cargo && truck.userData.loaded){
    const load=truck.children.find(c=>c.name==="cargo");if(load)truck.remove(load);
    truck.userData.loaded=false;
   }
  }
  for(const [id,tr] of this.trucks)if(!alive.has(id)){this.vehicleGroup.remove(tr);this.trucks.delete(id);}
  this.renderer.render(this.scene,this.camera);
 }
 dispose(){this.renderer.dispose();this.renderer.domElement.remove();this.scene.clear();}
}
