import test from "node:test";
import assert from "node:assert/strict";
import {
 CAMERA_LIMITS,normalizeCamera,groundAtScreen,pinGroundToPixel,
 panWithAnchor,zoomAtPixel,orbitAtPixel,transformGesture,wrapAngle
} from "../src/camera.js";

const base={x:0,z:0,yaw:45,elevation:35.264,zoom:1};
const views=[{width:1440,height:900},{width:390,height:844},{width:844,height:390},{width:2560,height:1440}];
const near=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-7,message+": "+a+" vs "+b);
const same=(a,b,message)=>{near(a.x,b.x,message+" x");near(a.z,b.z,message+" z");};

test("camera defaults and extended zoom limits are explicit and clamped",()=>{
 assert.equal(CAMERA_LIMITS.minZoom,.20);assert.equal(CAMERA_LIMITS.maxZoom,12);
 assert.equal(normalizeCamera({...base,zoom:0}).zoom,.2);
 assert.equal(normalizeCamera({...base,zoom:300}).zoom,12);
 assert.equal(normalizeCamera({...base,yaw:-30}).yaw,330);
 assert.equal(wrapAngle(765),45);
 assert.equal(normalizeCamera({...base,elevation:3}).elevation,20);
});
test("mouse pointer grips ground at exactly the same CSS pixel under angled camera",()=>{
 for(const screen of views)for(const yaw of [0,45,115,180,270,350])for(const elev of [20,35.264,60,80]){
  const camera={...base,yaw,elevation:elev,zoom:1.37,x:9,z:-5};
  const start={x:screen.width*.48,y:screen.height*.52};
  const end={x:start.x+Math.min(75,screen.width*.11),y:start.y+Math.min(38,screen.height*.08)};
  const gripped=groundAtScreen(camera,start,screen);
  const moved=panWithAnchor(camera,gripped,end,screen);
  same(gripped,groundAtScreen(moved,end,screen),"pixel lock "+yaw+"/"+elev+"/"+screen.width);
 }
});
test("pan never accumulates drift across dozens of 1-pixel moves",()=>{
 const size=views[0],start={x:600,y:440},anchor=groundAtScreen(base,start,size);
 let cam={...base};
 for(let i=1;i<=72;i++){
  const pixel={x:start.x+i,y:start.y+Math.sin(i/5)*27};
  cam=panWithAnchor(cam,anchor,pixel,size);
  same(groundAtScreen(cam,pixel,size),anchor,"repeated drag sample "+i);
 }
});
test("wheel zoom stays under the pointer across the entire zoom range",()=>{
 for(const screen of views){
  let cam={...base},pixel={x:screen.width*.63,y:screen.height*.41};
  const anchor=groundAtScreen(cam,pixel,screen);
  for(const factor of [1.5,2,3,1/3,1/2,.2]){
   cam=zoomAtPixel(cam,cam.zoom*factor,pixel,screen);
   same(anchor,groundAtScreen(cam,pixel,screen),"wheel anchor "+factor);
  }
 }
});
test("two-finger orbit, pinch and centroid translation share one ground anchor",()=>{
 const size=views[1],gestureStart={x:175,y:350};
 const anchor=groundAtScreen(base,gestureStart,size);
 let cam={...base};
 const sequence=[
  [{x:185,y:355},1.15,11],
  [{x:195,y:360},1.17,-18],
  [{x:205,y:370},.85,44],
  [{x:210,y:365},.8,29],
 ];
 for(const [point,ratio,turn] of sequence){
  cam=transformGesture(cam,anchor,point,size,ratio,turn);
  same(anchor,groundAtScreen(cam,point,size),"multitouch same point");
 }
 assert.notEqual(cam.yaw,base.yaw);
});
test("orbit/tilt about cursor preserves terrain and enforces safe elevation",()=>{
 const size=views[0],point={x:830,y:570},ground=groundAtScreen(base,point,size);
 let cam=orbitAtPixel(base,110,17,point,size);
 same(ground,groundAtScreen(cam,point,size),"orbit");
 cam=orbitAtPixel(cam,-240,-1000,point,size);
 same(ground,groundAtScreen(cam,point,size),"tilt clamp");
 assert.equal(cam.elevation,20);
});
test("invalid viewport is an explicit error rather than an infinite camera",()=>{
 assert.throws(()=>groundAtScreen(base,{x:10,y:10},{width:0,height:500}),RangeError);
 assert.throws(()=>pinGroundToPixel(base,{x:0,z:0},{x:1,y:1},{width:800,height:0}),RangeError);
});
