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
 *
 * CAM-02 (#338) interaction state machine: ONE classifier decides whether a
 * contact sequence is a click (the only thing that may commit a build/road or
 * change selection) or a camera gesture (pan / orbit / pinch-twist) that must
 * NEVER spend materials. Per-pointer phase: press -> pan|orbit (movement latch),
 * multi (two-finger transform), chord (secondary mouse button), or purged
 * (cancel / lost capture / out / buttons===0). A tap is emitted only when ALL of:
 *   1. the track still exists at the FINAL button release (e.buttons===0);
 *   2. the session was single-pointer at release (no multi-touch participant);
 *   3. displacement from down stayed STRICTLY BELOW the type click-slop
 *      (mouse/pen 5 CSS px, touch 10 CSS px) — latched: once >= slop it is a
 *      drag forever, even if the pointer returns to the down pixel;
 *   4. the pointer never gestured: no two-finger transform, no button chord,
 *      and no camera command (wheel / Q-E orbit / arrow pan / zoom buttons)
 *      while it was in contact;
 *   5. the press was PRIMARY (button 0, no shift orbit modifier) and the
 *      release is primary (button 0) — right/middle/back/forward never commit;
 *   6. the commit cell is the cell picked at POINTER DOWN (downCell), never the
 *      release pixel, so sub-threshold jitter across a cell boundary or camera
 *      motion during the press can never redirect a commit to another cell.
 * The anchor math (src/camera.js) and src/world.js are untouched.
 */
import {
  CAMERA_LIMITS, normalizeCamera, groundAtScreen, panWithAnchor,
  zoomAtPixel, transformGesture
} from "./camera.js";

const clamp=(value,a,b)=>Math.min(b,Math.max(a,value));
const shortestAngle = radians => ((radians+Math.PI*3)%(Math.PI*2)-Math.PI);
// CAM-02 click-vs-drag slop in CSS pixels. Displacement >= slop classifies the
// contact as a drag (never commits); strictly below it is a click. Touch gets a
// wider tolerance for finger jitter; mouse/pen are precise.
const CLICK_SLOP={mouse:5,pen:5,touch:10};
const slopFor=type=>CLICK_SLOP[type]??CLICK_SLOP.mouse;
// CAM-10 (#346) measurement probes — INERT unless a measurement harness sets
// window.__RW_PROBES__.cam10={enabled:true[,delayMs]} BEFORE load. Aggregate
// statistics only (per-kind count/sum/max handler ms + one last-input stamp);
// no raw pointer coordinates, no event logs, no timers, no storage, so no
// personal input trace can be persisted. delayMs>0 injects a deterministic
// synchronous main-thread stall BEFORE the camera command — the negative
// control that proves the harness detects degradation. It is a probe flag,
// never a rendering-quality change. Normal gameplay never sets __RW_PROBES__.
const cam10Probe=()=>{
  if(typeof window==="undefined")return null;
  const p=window.__RW_PROBES__&&window.__RW_PROBES__.cam10;
  return p&&p.enabled?p:null;
};
export function createCameraInput({canvas,world,cameraRef,onTap,onHover}){
  const pointers=new Map();
  let gesture=null;
  // Wrap one camera command with probe accounting. `evt` is the originating
  // DOM event when available (its timeStamp shares the rAF time origin, which
  // is what makes event->next-rendered-frame latency measurable); commands
  // without an event (UI buttons/keys) fall back to handler start time.
  const measured=(kind,evt,fn)=>{
    const p=cam10Probe();
    if(!p){fn();return;}
    const t0=performance.now();
    const delay=Number(p.delayMs)||0;
    if(delay>0){const end=t0+delay;while(performance.now()<end){/* injected stall: negative control only */}}
    fn();
    const t1=performance.now();
    const s=p.stats||(p.stats={seq:0,kinds:{},last:null});
    const k=s.kinds[kind]||(s.kinds[kind]={count:0,sumMs:0,maxMs:0});
    k.count++;k.sumMs+=t1-t0;if(t1-t0>k.maxMs)k.maxMs=t1-t0;
    s.seq++;
    s.last={seq:s.seq,kind,
      eventTime:evt&&Number.isFinite(evt.timeStamp)?evt.timeStamp:t0,
      appliedAt:t1,handlerMs:t1-t0};
  };

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
  // CAM-02: any camera command issued while a pointer is in contact is a camera
  // gesture, not a click — every tracked pointer loses its commit eligibility.
  const markContactGesture=()=>{
    for(const t of pointers.values()){t.gestured=true;if(t.phase==="press")t.phase="gesture";}
  };

  // CAM-10: optional trailing `evt` is the originating DOM event for probe
  // latency pairing only; existing callers (App.jsx rail buttons, keys) pass
  // nothing and behave exactly as before.
  const rotate=(dx,dy,evt)=>{
    measured("orbit",evt,()=>{
      markContactGesture();
      applyView({
        ...cameraRef.current,
        yaw:cameraRef.current.yaw-dx*.42,
        elevation:cameraRef.current.elevation+dy*.23
      });
    });
  };
  const keyboardPan=(dx,dy,evt)=>{
    measured("key",evt,()=>{
      markContactGesture();
      const box=size(),center={x:box.width/2,y:box.height/2};
      applyView(panWithAnchor(cameraRef.current,pointBelow(center),
        {x:center.x+dx,y:center.y+dy},box));
    });
  };
  const zoomBy=(ratio,point,evt)=>{
    measured("zoom",evt,()=>{
      markContactGesture();
      const box=size(),p=point||{x:box.width/2,y:box.height/2};
      applyView(zoomAtPixel(cameraRef.current,cameraRef.current.zoom*ratio,p,box));
    });
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
    // CAM-02 button chord: a mouse reports EVERY button change as pointerdown on
    // the SAME pointerId. A secondary press during an existing contact must NOT
    // reset the track (that would erase the drag latch and re-arm a clean click,
    // letting an orbit+click chord lift into a purchase). Keep the original
    // down pixel/button/anchor and mark the contact as a gesture.
    const existing=pointers.get(e.pointerId);
    if(existing){
      existing.gestured=true;existing.phase="chord";
      return;
    }
    const p=screen(e);
    // Sync the rendered camera before picking so downCell uses the CURRENT view.
    world.setView(cameraRef.current);world.applyCamera();
    const cell=world.screenToCell(e.clientX,e.clientY);
    const primary=e.button===0&&!e.shiftKey;
    pointers.set(e.pointerId,{
      x:e.clientX,y:e.clientY,downX:e.clientX,downY:e.clientY,
      button:e.button,anchor:pointBelow(p),moved:false,gestured:false,
      phase:"press",slop:slopFor(e.pointerType),orbitIntent:e.shiftKey,
      // A ray that misses the ground plane yields null: an out-of-bounds cell
      // the gameplay dispatch rejects, never a crash on the input path.
      primary,downCell:cell?{x:cell.x,z:cell.z}:{x:-1,z:-1}
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
    // CAM-02 latch: displacement >= type slop => drag, permanently (returning to
    // the down pixel never re-arms a click).
    if(Math.hypot(e.clientX-track.downX,e.clientY-track.downY)>=track.slop)track.moved=true;
    track.x=e.clientX;track.y=e.clientY;
    if(pointers.size===1){
      if(e.buttons===2||track.button===2||e.shiftKey||track.orbitIntent){
        if(track.moved){track.phase="orbit";rotate(dx,dy,e);}
      }else if(track.moved){
        track.phase="pan";
        measured("drag",e,()=>applyView(panWithAnchor(cameraRef.current,track.anchor,screen(e),size())));
      }
    }else if(pointers.size===2){
      const [a,b]=[...pointers.values()];
      const distance=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y));
      const angle=Math.atan2(b.y-a.y,b.x-a.x);
      if(!gesture)startGesture();
      else{
        measured("pinch",e,()=>{
          const center=local({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
          applyView(transformGesture(cameraRef.current,gesture.anchor,center,
            size(),distance/gesture.distance,shortestAngle(angle-gesture.angle)*180/Math.PI));
          gesture.distance=distance;gesture.angle=angle;
          // Both fingers participated in a real transform: neither may tap.
          a.gestured=true;b.gestured=true;a.phase="multi";b.phase="multi";
        });
      }
    }
    emitHover(e);
  };
  const onUp=e=>{
    const track=pointers.get(e.pointerId);
    if(!track)return; // late up for a purged/cancelled id: inert (no duplicate tap)
    // CAM-02 chord: a non-final button release (other buttons still held) keeps
    // the contact alive and gesture-marked; only the FINAL release may classify.
    if(e.buttons!==0){
      track.gestured=true;track.phase="chord";
      track.x=e.clientX;track.y=e.clientY;
      return;
    }
    const wasMulti=pointers.size>1;
    pointers.delete(e.pointerId);
    releaseCapture(e.pointerId);
    gesture=null;
    if(wasMulti){
      for(const remaining of pointers.values())
        remaining.anchor=pointBelow(local(remaining));
    }
    const isTap=!wasMulti&&!track.moved&&!track.gestured&&track.primary&&e.button===0;
    if(isTap&&onTap){
      world.setView(cameraRef.current);world.applyCamera();
      // Commit the cell picked at DOWN, not the release pixel (CAM-02 rule 6).
      onTap(track.downCell,e);
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
    markContactGesture();
    const box=size();
    const delta=e.deltaMode===1?e.deltaY*16:e.deltaMode===2?e.deltaY*box.height:e.deltaY;
    zoomBy(Math.exp(-delta*.0015),screen(e),e);
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
    // Read-only state-machine snapshot for tests/evidence (no mutation).
    state(){
      return {
        mode:pointers.size===0?"idle":pointers.size===1?"single":"multi",
        pointers:[...pointers.entries()].map(([id,t])=>({
          id,phase:t.phase,moved:t.moved,gestured:t.gestured,button:t.button,primary:t.primary
        }))
      };
    },
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
