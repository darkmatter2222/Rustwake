/**
 * Single-input owner for V2 isometric world navigation.
 *
 * Interaction law: the ground point under mouse-down must remain directly
 * underneath the moving pointer (within a pixel), irrespective of orbit or
 * zoom. Never approximate pan using a fixed screen-pixel multiplier.
 *
 * Only the WORLD canvas owns these listeners. React UI buttons remain separate.
 * No global browser instances, timers, storage, or simulation transactions.
 *
 * CAM-08 (#344) pointer ownership: every tracked pointer is released exactly
 * once, and a stale track can never move the camera or submit a tap. Recovery
 * is CANVAS-OWNED (no window/document listeners, no timers):
 *   - setPointerCapture is guarded (an inactive pointerId throws NotFoundError;
 *     bookkeeping must still complete so the gesture works without capture);
 *   - lostpointercapture purges the dropped pointer and rebases the survivors;
 *   - pointerout purges a tracked pointer ONLY when we do not hold its capture
 *     (a captured drag legitimately leaves the canvas and keeps receiving events);
 *   - a pointermove reporting buttons===0 for a tracked (pressed) pointer means
 *     the button/finger was released elsewhere -> purge before any pan/pinch, so
 *     a plain hover can never ghost-drag from a stale anchor;
 *   - pointerup/pointercancel release capture and delete the track; a later
 *     lostpointercapture/up for the same id is a no-op (no duplicate tap);
 *   - movement is tracked PER POINTER (moved/gestured), so one finger's motion
 *     no longer suppresses another finger's tap, and a multi-touch transform
 *     marks both participants so neither lifts into a build purchase.
 */
import {
  CAMERA_LIMITS, normalizeCamera, groundAtScreen, panWithAnchor,
  zoomAtPixel, transformGesture
} from "./camera.js";

const clamp=(value,a,b)=>Math.min(b,Math.max(a,value));
const shortestAngle = radians => ((radians+Math.PI*3)%(Math.PI*2)-Math.PI);
export function createCameraInput({canvas,world,cameraRef,onTap,onHover}){
  const pointers=new Map();
  let gesture=null;

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
  // Release capture defensively: hasPointerCapture may be absent, and releasing
  // an id we no longer hold throws NotFoundError. Never let cleanup throw.
  const releaseCapture=id=>{
    try{
      if(canvas.hasPointerCapture && canvas.hasPointerCapture(id))
        canvas.releasePointerCapture(id);
    }catch{ /* already released / inactive */ }
  };
  // Drop one tracked pointer and rebase the survivors so a continuing gesture
  // anchors from the CURRENT ground under each remaining finger (no target jump).
  // Idempotent: a repeated lostpointercapture/up after deletion is a no-op.
  const purgePointer=id=>{
    const track=pointers.get(id);
    if(!track)return false;
    const wasMulti=pointers.size>1;
    pointers.delete(id);
    releaseCapture(id);
    gesture=null;
    for(const remaining of pointers.values()){
      remaining.anchor=pointBelow(local(remaining));
      // An abnormal multi-touch termination (cancel / lost capture / out) must
      // never let the surviving finger lift into a purchase.
      if(wasMulti)remaining.gestured=true;
    }
    return true;
  };
  const onDown=e=>{
    // Guarded: an inactive pointerId throws NotFoundError. Bookkeeping below
    // must still run so the gesture works even when capture is unavailable;
    // pointerout + the buttons===0 purge recover ownership without capture.
    try{
      if(canvas.setPointerCapture && !canvas.hasPointerCapture(e.pointerId))
        canvas.setPointerCapture(e.pointerId);
    }catch{ /* capture unsupported / inactive pointer */ }
    const p=screen(e);
    pointers.set(e.pointerId,{
      x:e.clientX,y:e.clientY,downX:e.clientX,downY:e.clientY,
      button:e.button,anchor:pointBelow(p),moved:false,gestured:false
    });
    if(pointers.size===1)gesture=null;
    else startGesture();
  };
  const onMove=e=>{
    const track=pointers.get(e.pointerId);
    if(!track){emitHover(e);return;}
    // A tracked pointer is PRESSED. If the move reports no buttons held, the
    // press ended elsewhere (out-of-window release, dropped capture, OS cancel):
    // purge the stale track BEFORE any pan/pinch so hover can never ghost-drag.
    if(e.buttons===0){
      purgePointer(e.pointerId);
      emitHover(e);
      return;
    }
    const dx=e.clientX-track.x,dy=e.clientY-track.y;
    if(Math.hypot(e.clientX-track.downX,e.clientY-track.downY)>6)track.moved=true;
    track.x=e.clientX;track.y=e.clientY;
    if(pointers.size===1){
      if(e.buttons===2||track.button===2||e.shiftKey){
        if(track.moved)rotate(dx,dy);
      }else if(track.moved){
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
        // Both fingers participated in a real transform: neither may tap.
        a.gestured=true;b.gestured=true;
      }
    }
    emitHover(e);
  };
  const onUp=e=>{
    const track=pointers.get(e.pointerId),wasMulti=pointers.size>1;
    pointers.delete(e.pointerId);
    releaseCapture(e.pointerId);
    gesture=null;
    if(wasMulti){
      for(const remaining of pointers.values())
        remaining.anchor=pointBelow(local(remaining));
    }
    const isTap=!!track&&!wasMulti&&!track.moved&&!track.gestured&&track.button!==2&&e.button!==2;
    if(isTap&&onTap){
      world.setView(cameraRef.current);world.applyCamera();
      onTap(world.screenToCell(e.clientX,e.clientY),e);
    }
  };
  const onCancel=e=>{purgePointer(e.pointerId);};
  // Browser/OS dropped capture (touch cancellation, element change, alt-tab,
  // devtools, context menu): the track is stale -> purge and rebase survivors.
  const onLostCapture=e=>{purgePointer(e.pointerId);};
  // Pointer left the canvas while we do NOT hold its capture: no further
  // down-events will arrive here, so the track is stale. While captured, a drag
  // legitimately leaves the canvas and keeps receiving moves/up -> do not purge.
  const onOut=e=>{
    if(pointers.has(e.pointerId) &&
       !(canvas.hasPointerCapture && canvas.hasPointerCapture(e.pointerId)))
      purgePointer(e.pointerId);
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
  canvas.addEventListener("lostpointercapture",onLostCapture);
  canvas.addEventListener("pointerout",onOut);
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
      canvas.removeEventListener("lostpointercapture",onLostCapture);
      canvas.removeEventListener("pointerout",onOut);
      canvas.removeEventListener("wheel",onWheel);
      canvas.removeEventListener("contextmenu",onContext);
      for(const id of [...pointers.keys()])releaseCapture(id);
      pointers.clear();
      gesture=null;
    }
  };
}
