/**
 * Single-input owner for V2 isometric world navigation.
 *
 * Interaction law: the ground point under mouse-down must remain directly
 * underneath the moving pointer (within a pixel), irrespective of orbit or
 * zoom. Never approximate pan using a fixed screen-pixel multiplier.
 *
 * Only the WORLD canvas owns these listeners. React UI buttons remain separate.
 * No global browser instances, timers, storage, or simulation transactions.
 */
import {
  CAMERA_LIMITS, normalizeCamera, groundAtScreen, panWithAnchor,
  zoomAtPixel, transformGesture
} from "./camera.js";

const clamp=(value,a,b)=>Math.min(b,Math.max(a,value));
const shortestAngle = radians => ((radians+Math.PI*3)%(Math.PI*2)-Math.PI);
export function createCameraInput({canvas,world,cameraRef,onTap,onHover}){
  const pointers=new Map();
  let dragged=false,gesture=null;

  const viewport=()=>{
    const r=canvas.getBoundingClientRect();
    return {width:r.width,height:r.height,left:r.left,top:r.top};
  };
  const local=({x,y})=>{const v=viewport();return {x:x-v.left,y:y-v.top};};
  const screen=e=>local({x:e.clientX,y:e.clientY});
  const size=()=>{const {width,height}=viewport();return {width,height};};
  const applyView=next=>{
    cameraRef.current=normalizeCamera(next);
    world.setView(cameraRef.current);
    world.applyCamera(); // ray picking must use the CURRENT pointer camera
  };
  const pointBelow=(point)=>groundAtScreen(cameraRef.current,point,size());

  const rotate=(dx,dy)=>applyView({
    ...cameraRef.current,
    yaw:cameraRef.current.yaw-dx*.42,
    elevation:cameraRef.current.elevation+dy*.23
  });
  const keyboardPan=(dx,dy)=>{
    const box=size(),center={x:box.width/2,y:box.height/2};
    applyView(panWithAnchor(cameraRef.current,pointBelow(center),
      {x:center.x+dx,y:center.y+dy},box));
  };
  const zoomBy=(ratio,point)=>{
    const box=size(),p=point||{x:box.width/2,y:box.height/2};
    applyView(zoomAtPixel(cameraRef.current,cameraRef.current.zoom*ratio,p,box));
  };
  const emitHover=e=>{
    if(!onHover)return;
    world.setView(cameraRef.current);world.applyCamera();
    onHover(world.screenToCell(e.clientX,e.clientY));
  };
  const startGesture=()=>{
    if(pointers.size!==2)return;
    const [a,b]=[...pointers.values()];
    const centroid=local({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
    gesture={
      anchor:pointBelow(centroid),
      distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),
      angle:Math.atan2(b.y-a.y,b.x-a.x)
    };
  };
  const onDown=e=>{
    if(canvas.setPointerCapture && !canvas.hasPointerCapture(e.pointerId))
      canvas.setPointerCapture(e.pointerId);
    const p=screen(e);
    pointers.set(e.pointerId,{
      x:e.clientX,y:e.clientY,downX:e.clientX,downY:e.clientY,
      button:e.button,anchor:pointBelow(p)
    });
    if(pointers.size===1){dragged=false;gesture=null;}
    else {dragged=true;startGesture();}
  };
  const onMove=e=>{
    const track=pointers.get(e.pointerId);
    if(!track){emitHover(e);return;}
    const dx=e.clientX-track.x,dy=e.clientY-track.y;
    if(Math.hypot(e.clientX-track.downX,e.clientY-track.downY)>6)dragged=true;
    track.x=e.clientX;track.y=e.clientY;
    if(pointers.size===1){
      if(e.buttons===2||track.button===2||e.shiftKey){
        if(dragged)rotate(dx,dy);
      }else if(dragged){
        applyView(panWithAnchor(cameraRef.current,track.anchor,screen(e),size()));
      }
    }else if(pointers.size===2){
      const [a,b]=[...pointers.values()];
      const distance=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y));
      const angle=Math.atan2(b.y-a.y,b.x-a.x);
      if(!gesture)startGesture();
      else{
        const center=local({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
        applyView(transformGesture(cameraRef.current,gesture.anchor,center,
          size(),distance/gesture.distance,shortestAngle(angle-gesture.angle)*180/Math.PI));
        gesture.distance=distance;gesture.angle=angle;
      }
      dragged=true;
    }
    emitHover(e);
  };
  const onUp=e=>{
    const track=pointers.get(e.pointerId),wasMulti=pointers.size>1;
    pointers.delete(e.pointerId);gesture=null;
    if(wasMulti){
      dragged=true;
      for(const remaining of pointers.values())
        remaining.anchor=pointBelow(local(remaining));
    }
    const isTap=!!track&&!wasMulti&&!dragged&&track.button!==2&&e.button!==2;
    if(isTap&&onTap){
      world.setView(cameraRef.current);world.applyCamera();
      onTap(world.screenToCell(e.clientX,e.clientY),e);
    }
  };
  const onCancel=e=>{
    pointers.delete(e.pointerId);
    dragged=true;gesture=null;
    for(const remaining of pointers.values())remaining.anchor=pointBelow(local(remaining));
  };
  const onWheel=e=>{
    e.preventDefault();
    const box=size();
    const delta=e.deltaMode===1?e.deltaY*16:e.deltaMode===2?e.deltaY*box.height:e.deltaY;
    zoomBy(Math.exp(-delta*.0015),screen(e));
  };
  const onContext=e=>e.preventDefault();
  canvas.addEventListener("pointerdown",onDown);
  canvas.addEventListener("pointermove",onMove);
  canvas.addEventListener("pointerup",onUp);
  canvas.addEventListener("pointercancel",onCancel);
  canvas.addEventListener("wheel",onWheel,{passive:false});
  canvas.addEventListener("contextmenu",onContext);

  return {
    zoomBy,rotate,keyboardPan,
    limits:CAMERA_LIMITS,
    dispose(){
      canvas.removeEventListener("pointerdown",onDown);
      canvas.removeEventListener("pointermove",onMove);
      canvas.removeEventListener("pointerup",onUp);
      canvas.removeEventListener("pointercancel",onCancel);
      canvas.removeEventListener("wheel",onWheel);
      canvas.removeEventListener("contextmenu",onContext);
      pointers.clear();
    }
  };
}
