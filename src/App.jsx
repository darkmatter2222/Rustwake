import React,{useCallback,useEffect,useRef,useState} from "react";
import {LivingWorld} from "./world.js";
import {createCameraInput} from "./cameraInput.js";
import {zoomAtPixel} from "./camera.js";
import {RESOURCES,RESOURCE_BY_ID,BUILDINGS,BLUEPRINTS,RESEARCH,TIERS,CELL,WORLD_SIZE,amount} from "./content.js";
import {readGame,createGame,resetGame,persist,advanceGame,snapshot,buildAt,roadLine,removeBuilding,cancelConstruction,powerStatus,unlocked,connectedToRoad,canAfford,sell,researchAt,checkSite,buildingAt,footprintDims,facingName} from "./simulation.js";
import {inspectorState,machineScreenRect,panelPlacement,frameSelection,readUxSettings,writeUxSettings} from "./inspector.js";
import "./styles.css";

const cap=(n)=>Math.max(0,Math.floor(n||0));
const toMoney=(cost)=>Object.entries(cost||{}).map(([k,v])=>amount(v)+" "+(RESOURCE_BY_ID[k]?.unit||k)).join(" · ");
const MAIN_RESOURCES=["credits","scrap","iron","steel","fuel","data"];
const TOOLBAR=[
 {id:"select",name:"Inspect",key:"1",icon:"⌕"},
 {id:"build",name:"Construct",key:"2",icon:"▦"},
 {id:"road",name:"Roads",key:"3",icon:"═"},
 {id:"fleet",name:"Fleet",key:"4",icon:"⇄"},
 {id:"research",name:"Research",key:"5",icon:"◈"},
 {id:"market",name:"Exchange",key:"6",icon:"◇"}
];
function Icon({name}){return <span aria-hidden="true" className="tool-icon">{name}</span>;}
function StatusDot({ok=true}){return <span className={"status-dot"+(ok?"":" status-dot--warn")}/>;}
function Resource({id,value,onClick,compact=false}){
 const r=RESOURCE_BY_ID[id];
 return <button type="button" onClick={onClick} className={"resource "+(compact?"resource--compact":"")} title={r.name}>
  <span className="resource__spark" style={{background:r.color}}/>
  <span className="resource__name">{r.unit}</span><strong>{amount(value)}</strong>
 </button>;
}
function Card({title,eyebrow,children,onClose,className=""}){
 return <section className={"glass-panel "+className} aria-label={title}>
  <header className="panel-head"><div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2></div>
  {onClose&&<button className="plain-icon" aria-label={"Close "+title} onClick={onClose}>×</button>}</header>
  {children}
 </section>;
}
function Meter({value,max,color}){return <div className="meter"><div style={{width:Math.round(Math.min(1,(value||0)/(max||1))*100)+"%",background:color||"var(--amber)"}}/></div>;}
function ItemCost({cost,g}){return <div className="cost-wrap">{Object.entries(cost||{}).map(([id,n])=><span key={id} className={(g.bank[id]||0)<n?"cost cost--short":"cost"}>{n} {RESOURCE_BY_ID[id]?.unit||id}</span>)}</div>;}
function Log({events}){return <div className="event-list">{events.slice(0,6).map(e=><div key={e.id}><i></i><span>{e.message}</span></div>)}</div>;}
function IntroPrompt({onDismiss}){return <div className="intro-prompt">
  <span className="eyebrow">SECTOR 01 / CINDER BASIN</span>
  <strong>The yard is yours.</strong>
  <p>Orbit the world. Place machinery. Lay roads. Your fleet moves real cargo between buildings.</p>
  <button onClick={onDismiss}>Enter the yard <span>↗</span></button>
 </div>;}
function BuildingCard({def,g,onChoose,selected}){
 const locked=!unlocked(g,def.id),afford=canAfford(g,def.cost);
 return <button type="button" className={"blueprint "+(selected?"blueprint--selected ":"")+(locked?"blueprint--locked":"")}
   aria-label={"Select "+def.name+(locked?" (locked)":"")} disabled={locked} onClick={()=>onChoose(def.id)}>
  <span className="blueprint__icon" style={{"--bp-accent":def.accent}}>{def.family==="logistics"?"▣":def.family==="processing"?"◉":def.family==="utility"?"⌁":def.family==="science"?"◈":def.family==="defense"?"⊞":"▤"}</span>
  <span className="blueprint__meta"><strong>{def.name}</strong><small>{def.tag} · {def.power>0?def.power+" MW":"NO GRID"}</small></span>
  <span className={"blueprint__cost"+(afford?"":" blueprint__cost--short")}>{locked?"LOCKED":def.cost.credits+" CR"}</span>
 </button>;
}
function DrawPanel({mode,g,selectedId,setSelectedId,buildId,setBuildId,buildRot,setBuildRot,notify,close,onSell,onResearch,onRemove,onCancel}){
 const selected=g.buildings.find(b=>b.id===selectedId);
 if(mode==="build"){
  const fp=footprintDims(buildId,buildRot);
  return <Card title="Build catalog" eyebrow="CONSTRUCTION / BLUEPRINTS" onClose={close} className="catalog-panel">
   <div className="panel-sub">Select a structure, then tap the terrain. Slope, parcels, bays and road frontage are validated before any material is spent.</div>
   <div className="stat-grid" data-testid="site-orientation">
    <div><small>Footprint</small><strong data-testid="footprint-dims">{fp.w}×{fp.d}</strong></div>
    <div><small>Bay facing</small><strong data-testid="bay-facing">{facingName(buildRot)}</strong></div>
   </div>
   <button className="rotate-button" data-testid="rotate-footprint" onClick={()=>setBuildRot(r=>(r+1)%4)}>Rotate footprint (R)</button>
   <div className="blueprint-list">{BUILDINGS.map(d=><BuildingCard key={d.id} def={d} g={g} selected={buildId===d.id} onChoose={setBuildId}/>)}</div>
   <div className="panel-footnote">Constructing a machine reserves the listed materials. Mechanical assembly takes five seconds; canceling mid-assembly refunds everything.</div>
  </Card>;
 }
 if(mode==="road")return <Card title="Road engineer" eyebrow="ROUTING / INFRASTRUCTURE" onClose={close}>
  <div className="panel-sub">Tap the starting cell, then tap the destination. Asphalt connects the freight fleet to machines.</div>
  <div className="stat-grid"><div><small>Network</small><strong>{g.roads.length} cells</strong></div><div><small>Per segment</small><strong>3 AG / 4 CR</strong></div></div>
  <div className="hint-box"><span>01</span> Select route origin<br/><span>02</span> Select route destination<br/><span>03</span> Trucks automatically use connected roads</div>
 </Card>;
 if(mode==="fleet")return <Card title="Active fleet" eyebrow="DISPATCH / PHYSICAL CARGO" onClose={close}>
  <div className="panel-sub">Each truck physically follows connected road segments. Inventory is reserved while in transit.</div>
  <div className="fleet-list">{g.vehicles.map(v=><div className="fleet-row" key={v.id}><span className="fleet-glyph">▰</span><div><strong>{v.name}</strong><small>{v.job?(v.job.phase==="toSource"?"Driving to pickup":"Delivering cargo"):"Available for dispatch"}</small></div><span className="fleet-label">{v.job?(v.job.amount+" "+v.job.resource):"IDLE"}</span></div>)}</div>
  <div className="panel-footnote">Priority: maintain processor inputs, then haul finished products to your depot.</div>
 </Card>;
 if(mode==="research")return <Card title="Research & industry" eyebrow="PROGRESSION / LONG GAME" onClose={close}>
  <div className="panel-sub">Data and credits fund lasting research. Further eras unlock new materials, sectors and systems.</div>
  <div className="research-list">{RESEARCH.map(t=><div className="research-row" key={t.id}><div><strong>{t.name}</strong><small>{t.desc}</small><span>{toMoney(t.cost)}</span></div><button disabled={g.research.includes(t.id)||!canAfford(g,t.cost)} onClick={()=>onResearch(t.id)}>{g.research.includes(t.id)?"Done":"Unlock"}</button></div>)}</div>
  <h3 className="panel-section">Era progression</h3><div className="milestone-list">{TIERS.map(t=><div key={t.id} className={g.tier>=t.id?"milestone complete":"milestone"}><span>{g.tier>=t.id?"✓":"○"}</span><strong>{t.name}</strong><small>{t.needs} production</small></div>)}</div>
 </Card>;
 if(mode==="market")return <Card title="Trade exchange" eyebrow="CONTRACTS / CURRENCIES" onClose={close}>
  <div className="panel-sub">Sell conserved depot stock for credits. Later eras introduce reputation, contracts and asynchronous markets.</div>
  {["scrap","iron","copper","steel","alloy","gears","circuits","fuel"].map(id=><div className="trade-row" key={id}><div><strong>{RESOURCE_BY_ID[id].name}</strong><small>In depot: {amount(g.bank[id])}</small></div><button disabled={(g.bank[id]||0)<1} onClick={()=>onSell(id)}>Sell 10</button></div>)}
  <div className="hint-box">Relics · Influence · Echo shards · Charters are reserved for later progression phases, not fabricated multiplayer features.</div>
 </Card>;
 if(mode==="inventory")return <Card title="Freight ledger" eyebrow="INVENTORY / ECONOMY" onClose={close}>
  <div className="inventory-list">{RESOURCES.map(r=><div key={r.id}><span className="resource__spark" style={{background:r.color}}/><strong>{r.name}</strong><span>{amount(g.bank[r.id]||0)}</span></div>)}</div>
  <div className="panel-footnote">Material totals are depot inventory. Truck cargo and machine inventories are separate until delivery.</div>
 </Card>;
 return null;
}
/* UX-04 (#362): the inspector is a pure read model over the authoritative
   simulation (src/inspector.js). It never spends, forks or fabricates economy
   state; refund previews are unit-tested against the real transactions. */
function InspectorPanel({g,selectedId,ux,onUx,onClose,onRemove,onCancel,confirmId,setConfirmId,openBtnRef,confirmBtnRef,obscured,onFocus,openBuild}){
 if(selectedId==null)return <Card title="Inspector" eyebrow="SELECTION / EMPTY" onClose={onClose} className="inspector-panel">
  <p className="panel-sub" data-testid="inspector-empty">No machine selected. Tap any structure in the yard to read its status, recipe, cargo, bay connectivity and recovery options.</p>
  <button className="rotate-button" onClick={openBuild}>Open construct catalog</button>
 </Card>;
 const s=inspectorState(g,selectedId);
 if(s.kind==="loading")return <Card title="Inspector" eyebrow="SELECTION / LOADING" onClose={onClose} className="inspector-panel">
  <div className="inspector-loading" aria-busy="true" data-testid="inspector-loading"><span className="spinner" aria-hidden="true"/><p className="panel-sub">Reading yard state…</p></div>
 </Card>;
 if(s.kind==="error")return <Card title="Selection unavailable" eyebrow="SELECTION / ERROR" onClose={onClose} className="inspector-panel">
  <p className="panel-sub text-warn" role="alert" data-testid="inspector-error">{s.reason}</p>
  <button className="rotate-button" onClick={onClose}>Back to the yard</button>
 </Card>;
 const {def,status,bay,recipe,stock,construction,upgrade,dismantle,level,site,power}=s;
 const confirming=confirmId===selectedId;
 const openConfirm=()=>{setConfirmId(selectedId);};
 // The opener button unmounts while the confirm block is shown; focus the
 // freshly rendered node after React commits, never the detached one.
 const keepMachine=()=>{setConfirmId(null);requestAnimationFrame(()=>openBtnRef.current?.focus?.());};
 return <Card title={def.name} eyebrow={"SITE "+site.x+"."+site.z+" / "+def.tag} onClose={onClose} className="inspector-panel">
  <div className="selected-hero"><span className="selected-hero__mark" style={{background:def.accent}}>▣</span><div><strong>UNIT {String(s.building.id).padStart(3,"0")} · LEVEL {level}</strong>
   <span className={"status-chip status-chip--"+status.tone} data-testid="inspector-status"><i aria-hidden="true"/>{status.label}</span></div></div>
  <p className="panel-sub" data-testid="inspector-status-detail">{status.detail}</p>
  <div className="stat-grid">
   <div><small>Power demand</small><strong>{power.demand} MW</strong></div>
   <div><small>Yard grid</small><strong className={power.available?"":"text-warn"}>{power.available?"Powered":"Brownout"}</strong></div>
  </div>
  <div className="stat-grid">
   <div><small>Footprint</small><strong data-testid="inspect-footprint">{bay.footprint.w}×{bay.footprint.d}</strong></div>
   <div><small>Bay facing</small><strong data-testid="inspect-bay-facing">{bay.facing}</strong></div>
  </div>
  <div className={"bay-line"+(bay.connected?"":" bay-line--warn")} data-testid="bay-connectivity">
   <span aria-hidden="true">{bay.connected?"▣":"⚠"}</span>
   <span>{bay.connected?"Loading bay reaches a road in "+bay.reach+" cell"+(bay.reach===1?"":"s"):"No road frontage — lay asphalt within 3 cells of the loading bay"}</span>
  </div>
  {construction.active&&<>
   <h3 className="panel-section">Construction stage</h3>
   <Meter value={construction.total-construction.remaining} max={construction.total} color="var(--amber)"/>
   <p className="panel-sub">Mechanical assembly — {construction.remaining.toFixed(1)}s remaining. Canceling refunds every reserved material.</p>
   {construction.cancel.allowed
    ?<button className="danger-button" data-testid="cancel-construction" onClick={()=>onCancel(selectedId)}>Cancel construction — full refund ({toMoney(construction.cancel.refund)})</button>
    :<p className="panel-sub text-warn">{construction.cancel.reason}</p>}
  </>}
  {recipe&&<>
   <h3 className="panel-section">Production cycle</h3>
   <Meter value={s.building.timer} max={recipe.cycle} color="var(--mint)"/>
   <div className="recipe-table">
    <div><small>INPUT / {recipe.cycle}s</small><span>{recipe.inputText}</span></div>
    <div><small>OUTPUT / LEVEL {level}</small><span data-testid="recipe-output">{toMoney(recipe.effectiveOutputs)}</span></div>
   </div>
  </>}
  <h3 className="panel-section">Local storage</h3>
  <div className="inventory-list inventory-list--short">{stock.length?stock.map(e=><div key={e.id}><strong>{e.name}</strong><span>{amount(e.amount)} {e.unit}</span></div>):<p className="panel-sub">No cargo in this building.</p>}</div>
  <h3 className="panel-section">Upgrade effect</h3>
  <div className="upgrade-preview" data-testid="upgrade-effect">
   {upgrade.hasCycle
    ?<><div><small>LEVEL {upgrade.level} NOW</small><span>{toMoney(upgrade.current)}</span></div>
       <div><small>LEVEL {upgrade.nextLevel} NEXT</small><span>{toMoney(upgrade.next)}</span></div></>
    :<p className="panel-sub">Support structure — no production cycle to scale.</p>}
  </div>
  <button className="upgrade-button" data-testid="upgrade-locked" disabled aria-describedby="upgrade-lock-reason">Upgrade — locked</button>
  <p className="panel-footnote" id="upgrade-lock-reason">{upgrade.lockReason}</p>
  <h3 className="panel-section">Dismantle</h3>
  {!dismantle.gate.allowed
   ?<><button className="danger-button" disabled data-testid="dismantle-blocked">Dismantle unavailable</button>
     <p className="panel-sub text-warn" data-testid="dismantle-blocked-reason">{dismantle.gate.reason}</p></>
   :confirming
    ?<div className="confirm-block" role="alertdialog" aria-label={"Confirm dismantling "+def.name} data-testid="dismantle-confirm-dialog">
      <strong>Dismantle {def.name}?</strong>
      <p className="panel-sub">{dismantle.recoveryNote}</p>
      <div className="refund-list" data-testid="dismantle-refund">{dismantle.entries.map(e=><div key={e.id}><span>{e.name}</span><em>{e.source==="recovery"?"40% recovery":"cargo return"}</em><strong>+{amount(e.amount)} {e.unit}</strong></div>)}</div>
      <div className="confirm-actions">
       <button ref={confirmBtnRef} className="danger-button danger-button--solid" data-testid="dismantle-confirm" onClick={()=>onRemove(selectedId)}>Confirm dismantling</button>
       <button className="keep-button" data-testid="dismantle-keep" onClick={keepMachine}>Keep machine</button>
      </div>
     </div>
    :<><button ref={openBtnRef} className="danger-button" data-testid="dismantle-open" onClick={openConfirm}>Dismantle machine…</button>
      <p className="panel-sub" data-testid="dismantle-preview">Recovery preview: {dismantle.entries.map(e=>"+"+amount(e.amount)+" "+e.unit).join(", ")||"no recoverable materials"}.</p></>}
  {obscured&&<button className="focus-button" data-testid="focus-machine" onClick={onFocus}>Focus machine in clear view</button>}
  <div className="inspector-settings">
   <label><input type="checkbox" checked={ux.autoFrame} onChange={e=>onUx({autoFrame:e.target.checked})} data-testid="setting-autoframe"/> Keep machine in view</label>
   <button className="side-button" data-testid="setting-side" onClick={()=>onUx({panelSide:ux.panelSide==="auto"?"left":ux.panelSide==="left"?"right":"auto"})} title="Inspector dock side (desktop)">Dock: {ux.panelSide}</button>
  </div>
 </Card>;
}
export default function App(){
 const sceneHost=useRef(null),worldRef=useRef(null);
 const gameRef=useRef(null);
 if(!gameRef.current)gameRef.current=typeof window!=="undefined"?readGame():createGame();
 const [data,setData]=useState(()=>snapshot(gameRef.current));
 const [mode,setMode]=useState("select");
 const [buildId,setBuildId]=useState("salvager");
 const [buildRot,setBuildRot]=useState(0);
 const [selectedId,setSelectedId]=useState(null);
 const [toast,setToast]=useState("");
 const [intro,setIntro]=useState(false);
 const [preview,setPreview]=useState(null);
 const [roadStart,setRoadStart]=useState(null);
 const [showLegend,setShowLegend]=useState(false);
 const [gridVisible,setGridVisible]=useState(false);
 // UX-04 (#362): persisted inspector preferences + two-step dismantle confirm.
 const [ux,setUx]=useState(()=>readUxSettings(typeof window!=="undefined"?window.localStorage:null));
 const [confirmId,setConfirmId]=useState(null);
 const [panelSide,setPanelSide]=useState("left");
 const [obscured,setObscured]=useState(false);
 const panelHostRef=useRef(null),openBtnRef=useRef(null),confirmBtnRef=useRef(null);
 const uxRef=useRef(ux),confirmRef=useRef(confirmId),selectedRef=useRef(selectedId);
 const camera=useRef({yaw:45,elevation:35.264,zoom:typeof window!=="undefined"&&window.innerWidth>=960?1.15:1,x:0,z:0});

 const modeRef=useRef({mode,buildId,buildRot,roadStart});
 useEffect(()=>{modeRef.current={mode,buildId,buildRot,roadStart};},[mode,buildId,buildRot,roadStart]);
 useEffect(()=>{uxRef.current=ux;},[ux]);
 useEffect(()=>{confirmRef.current=confirmId;},[confirmId]);
 useEffect(()=>{selectedRef.current=selectedId;},[selectedId]);
 useEffect(()=>{setConfirmId(null);},[selectedId]);
 useEffect(()=>{if(confirmId!=null)confirmBtnRef.current?.focus();},[confirmId]);
 const notify=useCallback((text)=>{setToast(text);},[]);
 const choose=useCallback(id=>{setMode(id);setPreview(null);setRoadStart(null);setConfirmId(null);if(id!=="build")setSelectedId(null);},[]);
 /* Non-obscuring placement: pure geometry from src/inspector.js decides which
    half hosts the sheet; the camera is only ever moved through the existing
    setView/applyCamera public API (camera invariants #307 untouched). */
 const updatePlacement=useCallback((frame=false,force=false)=>{
  const world=worldRef.current,cv=world?.renderer.domElement;
  const id=selectedRef.current;
  if(!cv||id==null||modeRef.current.mode!=="inspect"){setObscured(false);return;}
  const b=gameRef.current.buildings.find(x=>x.id===id);
  if(!b){setObscured(false);return;}
  const rect=cv.getBoundingClientRect(),viewport={width:rect.width,height:rect.height};
  if(viewport.width<=0||viewport.height<=0)return;
  const isPhone=viewport.width<=770;
  const hr=panelHostRef.current?.getBoundingClientRect();
  const panelSize=hr&&hr.width>0&&hr.height>0?{width:hr.width,height:hr.height}
   :{width:Math.min(356,viewport.width-28),height:Math.min(viewport.height*(isPhone?0.46:0.63),isPhone?400:650)};
  const place=panelPlacement({machineRect:machineScreenRect(camera.current,b,viewport),viewport,panelSize,
   isPhone,preference:uxRef.current.panelSide,bottomOffset:isPhone?95:133});
  if(!isPhone)setPanelSide(s=>s===place.side?s:place.side);
  setObscured(o=>o===place.obscured?o:place.obscured);
  if(frame&&place.obscured&&(force||uxRef.current.autoFrame)){
   camera.current=frameSelection(camera.current,b,viewport,place.focusPixel);
   world.setView(camera.current);world.applyCamera();
   setObscured(false);
  }
 },[]);
 useEffect(()=>{
  if(mode!=="inspect"||selectedId==null)return;
  const t=requestAnimationFrame(()=>updatePlacement(true));
  return ()=>cancelAnimationFrame(t);
 },[selectedId,mode,ux.autoFrame,updatePlacement]);
 const onUx=useCallback(patch=>{
  const next=writeUxSettings(window.localStorage,patch);
  uxRef.current=next;setUx(next);
  requestAnimationFrame(()=>updatePlacement(true));
 },[updatePlacement]);
 const refresh=useCallback(()=>setData(snapshot(gameRef.current)),[]);
 const onSell=useCallback((id)=>{const r=sell(gameRef.current,id,10);notify(r.ok?"Sold materials for "+r.earnings+" CR":r.reason);refresh();},[notify,refresh]);
 const onResearch=useCallback((id)=>{const r=researchAt(gameRef.current,id);notify(r.ok?"Research completed":r.reason);refresh();},[notify,refresh]);
 const onRemove=useCallback((id)=>{
  const r=removeBuilding(gameRef.current,id);
  setConfirmId(null);
  if(r.ok){
   const recovered=Object.entries(r.refund||{}).map(([k,n])=>"+"+n+" "+(RESOURCE_BY_ID[k]?.unit||k)).join(", ");
   notify("Machine dismantled — "+(recovered||"no materials")+" returned to depot");
   setSelectedId(null);
   // Focus returns to a stable control after the confirmed sheet unmounts.
   document.querySelector('[data-tool="select"]')?.focus();
  }else notify(r.reason);
  refresh();
 },[notify,refresh]);
 const onCancel=useCallback((id)=>{const r=cancelConstruction(gameRef.current,id);notify(r.ok?"Construction canceled — materials refunded":r.reason);if(r.ok){setSelectedId(null);setMode("select");}refresh();},[notify,refresh]);
 const resetCam=useCallback(()=>{camera.current={yaw:45,elevation:35.264,zoom:window.innerWidth>=960?1.15:1,x:0,z:0};setToast("Camera reset to isometric overview");},[]);
 const zoomControl=useCallback((factor)=>{
  const world=worldRef.current,cv=world?.renderer.domElement;
  document.body.dataset.lastZoomRequested=String(factor);
  if(!world||!cv){document.body.dataset.lastZoomError="world-missing";return;}
  const rect=cv.getBoundingClientRect(),size={width:rect.width,height:rect.height};
  camera.current=zoomAtPixel(camera.current,camera.current.zoom*factor,
    {x:size.width/2,y:size.height/2},size);
  world.setView(camera.current);world.applyCamera();
  document.body.dataset.lastZoomApplied=String(camera.current.zoom);
 },[]);
 useEffect(()=>{
  if(!sceneHost.current)return;
  const world=new LivingWorld(sceneHost.current);worldRef.current=world;world.setView(camera.current);
  let raf=0,last=performance.now(),uiLast=0,saveLast=0,alive=true;
  const loop=(now)=>{
   if(!alive)return;
   const dt=Math.min(.07,Math.max(0,(now-last)/1000));last=now;
   advanceGame(gameRef.current,dt);
   world.setView(camera.current);world.update(gameRef.current,dt,now/1000);
   if(now-uiLast>270){setData(snapshot(gameRef.current));updatePlacement(false);uiLast=now;}
   if(now-saveLast>4200){persist(gameRef.current);saveLast=now;}
   raf=requestAnimationFrame(loop);
  };
  raf=requestAnimationFrame(loop);
  const save=()=>persist(gameRef.current);
  window.addEventListener("pagehide",save);
  // The camera controller alone owns pointer/gesture events. React owns
  // gameplay dispatch. A dragged/orbiting finger NEVER submits a transaction.
  const controller=createCameraInput({
   canvas:world.renderer.domElement,
   world,cameraRef:camera,
   onHover:c=>{
    if(c&&c.x>=0&&c.x<WORLD_SIZE&&c.z>=0&&c.z<WORLD_SIZE)
     setPreview(p=>p?.x===c.x&&p?.z===c.z?p:{x:c.x,z:c.z});
   },
   onTap:c=>{
    if(!c||c.x<0||c.x>=WORLD_SIZE||c.z<0||c.z>=WORLD_SIZE)return;
    const g=gameRef.current,tool=modeRef.current.mode;
    if(tool==="build"){
     const r=buildAt(g,modeRef.current.buildId,c.x,c.z,modeRef.current.buildRot);
     // Observability stamp: the exact validator verdict for the tapped site.
     document.body.dataset.lastSiteOk=String(r.ok);
     document.body.dataset.lastSiteCode=r.code||"";
     document.body.dataset.lastSiteReason=r.reason||"";
     notify(r.ok?"Construction underway — "+BLUEPRINTS[modeRef.current.buildId].name:r.reason);
     if(r.ok){setSelectedId(r.building.id);setMode("inspect");}
    }else if(tool==="road"){
     const first=modeRef.current.roadStart;
     if(!first){setRoadStart({x:c.x,z:c.z});notify("Now select the road destination");}
     else {const r=roadLine(g,first,{x:c.x,z:c.z});notify(r.ok?r.cells+" road segments connected":r.reason);setRoadStart(null);}
    }else{
     const hit=buildingAt(g,c.x,c.z);
     if(hit){setSelectedId(hit.id);setMode("inspect");notify(BLUEPRINTS[hit.type].name+" selected");}
     else {setSelectedId(null);if(tool==="inspect")setMode("select");}
    }
    refresh();
   }
  });
  const {rotate,keyboardPan}=controller;
  const onKey=(e)=>{
   if(["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName))return;
   if(e.key==="q"||e.key==="Q")rotate(-24,0);
   if(e.key==="e"||e.key==="E")rotate(24,0);
   if(e.key==="Home"||e.key==="f"||e.key==="F")resetCam();
   if(e.key==="Escape"){
    // Topmost layer first: an open dismantle confirmation closes before selection.
    if(confirmRef.current!=null){setConfirmId(null);requestAnimationFrame(()=>openBtnRef.current?.focus?.());return;}
    choose("select");setSelectedId(null);
   }
   if(["1","2","3","4","5","6"].includes(e.key))choose(TOOLBAR[Number(e.key)-1].id);
   if(e.key==="g"||e.key==="G")setGridVisible(v=>!v);
   if((e.key==="r"||e.key==="R")&&modeRef.current.mode==="build")setBuildRot(v=>(v+1)%4);
   if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)){
    e.preventDefault();
    keyboardPan(e.key==="ArrowLeft"?-35:e.key==="ArrowRight"?35:0,e.key==="ArrowUp"?-35:e.key==="ArrowDown"?35:0);
   }
  };
  window.addEventListener("keydown",onKey);
  const observer=new ResizeObserver(()=>{world.resize();updatePlacement(true);});observer.observe(sceneHost.current);
  return ()=>{alive=false;cancelAnimationFrame(raf);observer.disconnect();persist(gameRef.current);
   controller.dispose();
   window.removeEventListener("keydown",onKey);window.removeEventListener("pagehide",save);world.dispose();worldRef.current=null;
  };
 },[]);
 const power=powerStatus(data);
 useEffect(()=>{
  const world=worldRef.current;
  if(!world)return;
  const hover=preview;
  const inBounds=hover&&hover.x>=0&&hover.z>=0&&hover.x<WORLD_SIZE&&hover.z<WORLD_SIZE;
  // The ghost uses the SAME pure validator as the transaction: free selection
  // never deducts bank stock (#370).
  const site=mode==="build"&&inBounds?checkSite(data,buildId,hover.x,hover.z,buildRot):null;
  const valid=mode==="build"?!!site?.ok:!!inBounds&&!buildingAt(data,hover.x,hover.z);
  world.drawGhost(mode==="road"?"road":mode==="build"?"build":null,
   mode==="road"||mode==="build"?hover:null,valid,roadStart,
   site?{cells:site.cells,bay:site.bay}:null);
 },[preview,mode,roadStart,buildId,buildRot,data]);
 return <div className="app-shell" data-world="v2" data-camera="isometric" data-save-version="2">
  <div className="world-container" ref={sceneHost} id="rustwake-3d-world"/>
  <div className="screen-vignette" aria-hidden="true"/>
  <header className="hud-top">
   <div className="brand" aria-label="Rustwake, Cinder Yard">
    <div className="brand-mark"><span>R</span><i/></div>
    <div className="brand-type"><strong>RUSTWAKE<span className="brand-badge">V2</span></strong><small>LIVING INDUSTRIAL WORLD / 01</small></div>
   </div>
   <div className="resources-strip" aria-label="Resources">{MAIN_RESOURCES.map(id=><Resource key={id} id={id} value={data.bank[id]||0} onClick={()=>choose("inventory")} compact={true}/>)}
    <button className="resource-more" onClick={()=>choose("inventory")} title="Open full inventory">+ {RESOURCES.length-MAIN_RESOURCES.length}</button>
   </div>
   <div className="session-info"><StatusDot ok={power.available}/><span>LOCAL YARD</span><small>SECTOR 01</small></div>
  </header>
  <aside className={"left-rail"+(mode==="inspect"&&selectedId!=null&&panelSide==="left"?" left-rail--beside-panel":"")}>
   <div className="coordinate-chip"><span className="eyebrow">OPERATING SECTOR</span><strong>CINDER BASIN</strong><small>{TIERS[data.tier]?.name||"INDUSTRIAL AGE"} · {WORLD_SIZE}×{WORLD_SIZE} LAND</small></div>
   <div className="rail-controls">
    <button onClick={resetCam} title="Fit isometric world (Home)">⌖ <span>Recenter</span></button>
    <button onClick={()=>{camera.current.yaw=(camera.current.yaw+45)%360}} title="Orbit camera right">⤾ <span>Orbit</span></button>
    <button aria-label="Zoom in" onClick={()=>zoomControl(1.55)} title="Zoom in (up to 12×)">＋ <span>Zoom in</span></button>
    <button aria-label="Zoom out" onClick={()=>zoomControl(1/1.55)} title="Zoom out (down to 0.20×)">− <span>Zoom out</span></button>
    <button onClick={()=>setShowLegend(v=>!v)} title="Controls and help">? <span>Controls</span></button>
   </div>
   {showLegend&&<div className="controls-card"><b>Explore your world</b><p>Drag to pan with cursor-locked grip · right-drag to orbit · wheel to zoom (0.20×–12×) · Q/E rotate · Home reset. Mobile: one finger pans, pinch zooms, two fingers twist.</p><p>Select a building to inspect it. Construct machinery or lay roads from the tool dock.</p><button onClick={()=>setShowLegend(false)}>Close</button></div>}
  </aside>
  <aside className="right-rail">
   <div className="vitals-card">
    <div className="eyebrow">INDUSTRIAL TELEMETRY</div>
    <div className="vitals-title"><span><StatusDot ok={power.available}/> GRID LOAD</span><strong>{power.demand}/{power.supply} MW</strong></div>
    <Meter value={power.demand} max={power.supply||1} color={power.available?"var(--mint)":"var(--danger)"}/>
    <div className="stat-line"><span>Freight movement</span><strong>{data.vehicles.filter(v=>!!v.job).length}/{data.vehicles.length}</strong></div>
    <div className="stat-line"><span>Materials delivered</span><strong>{amount(data.stats.delivered)}</strong></div>
    <div className="stat-line"><span>Completed trips</span><strong>{amount(data.stats.shipments)}</strong></div>
   </div>
   <div className="activity-card"><div className="eyebrow">YARD ACTIVITY</div><Log events={data.log}/></div>
  </aside>
  {intro&&<IntroPrompt onDismiss={()=>{setIntro(false);try{localStorage.setItem("rustwake:v2:intro","1");}catch{}}}/>}
  <div className="center-hint" aria-hidden="true">{mode==="road"?(roadStart?"TAP A DESTINATION CELL":"TAP A START CELL"):mode==="build"?"TAP THE GROUND TO CONSTRUCT · R ROTATES THE FOOTPRINT":null}</div>
  <nav className="tool-dock" aria-label="Construction and world controls">
    {TOOLBAR.map(item=><button key={item.id} data-tool={item.id}
      className={mode===item.id||item.id==="select"&&mode==="inspect"?"tool-dock__item is-active":"tool-dock__item"}
      onClick={()=>choose(item.id)} title={item.name+" — "+item.key} aria-label={item.name} aria-pressed={mode===item.id}>
      <Icon name={item.icon}/><span>{item.name}</span><em>{item.key}</em>
    </button>)}
  </nav>
  {["build","road","fleet","research","market","inventory","inspect"].includes(mode)&&<div
    className={"panel-host"+(mode==="inspect"&&panelSide==="right"?" panel-host--right":"")} ref={panelHostRef}>
    {mode==="inspect"
     ?<InspectorPanel g={data} selectedId={selectedId} ux={ux} onUx={onUx}
       confirmId={confirmId} setConfirmId={setConfirmId} openBtnRef={openBtnRef} confirmBtnRef={confirmBtnRef}
       obscured={obscured} onFocus={()=>updatePlacement(true,true)} openBuild={()=>choose("build")}
       onRemove={onRemove} onCancel={onCancel} onClose={()=>{setSelectedId(null);choose("select");}}/>
     :<DrawPanel mode={mode} g={data} selectedId={selectedId} setSelectedId={setSelectedId}
       buildId={buildId} setBuildId={setBuildId} buildRot={buildRot} setBuildRot={setBuildRot}
       notify={notify} onSell={onSell} onResearch={onResearch} onRemove={onRemove} onCancel={onCancel} close={()=>choose("select")}/>}
   </div>}
  <div className="footline"><span>RUSTWAKE / V2 FOUNDATION</span><span>SIM {Math.floor(data.elapsed)}s</span><span>{data.buildings.length} STRUCTURES · {data.roads.length} ROAD CELLS</span></div>
  {toast&&<div key={toast+Math.floor(data.elapsed/7)} className="toast" role="status" onClick={()=>setToast("")}><b>NOTICE</b><span>{toast}</span><button aria-label="Dismiss notice" onClick={()=>setToast("")}>×</button></div>}
 </div>;
}
const EDGE_LIMIT=70;
