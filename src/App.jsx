import React,{useCallback,useEffect,useRef,useState} from "react";
import {LivingWorld} from "./world.js";
import {createCameraInput} from "./cameraInput.js";
import {zoomAtPixel} from "./camera.js";
import {RESOURCES,RESOURCE_BY_ID,BUILDINGS,BLUEPRINTS,RESEARCH,TIERS,CELL,WORLD_SIZE,amount} from "./content.js";
import {readGame,createGame,resetGame,persist,advanceGame,snapshot,buildAt,roadLine,removeBuilding,cancelConstruction,powerStatus,unlocked,connectedToRoad,canAfford,sell,researchAt,checkSite,buildingAt,footprintDims,facingName,cancelFreight,freightTotals,ROAD_REACH} from "./simulation.js";
import {inspectorState,machineScreenRect,panelPlacement,transitionCamera,readUxSettings,writeUxSettings} from "./inspector.js";
import {resourceStripState,readStripSettings,writeStripSettings} from "./resourceStrip.js";
import {alarmsState,alarmsForBuilding,readAlarmSettings,writeAlarmSettings} from "./alarms.js";
import {fleetState,truckAt,followTarget,readFleetSettings,writeFleetSettings} from "./fleet.js";
import {classifyViewport,dockBottomOffset,sheetMaxHeight,nextToolMode,readDockSettings,writeDockSettings} from "./dock.js";
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
/* UX-01 (#359): every chip is a pure read-model row (src/resourceStrip.js)
   over the authoritative bags — depot value, reserved truck cargo and an
   actionable shortage flag. title/strong keep the capture contract: the
   depot number is the source-of-truth bank value, never a ghost balance. */
function ResourceChip({row,active,onOpen}){
 const r=RESOURCE_BY_ID[row.id];
 const bits=[r.name+": "+amount(row.depot)+" "+r.unit+" in depot"];
 if(row.reserved>0)bits.push(amount(row.reserved)+" reserved in transit");
 if(row.state==="critical")bits.push("critical shortage "+amount(row.need)+" "+r.unit);
 else if(row.state==="warning")bits.push("shortage awaiting delivery");
 if(row.locked)bits.push("locked until later progression");
 return <button type="button" onClick={()=>onOpen(row.id)} title={r.name}
  className={"resource resource--compact resource--"+row.state+(active?" is-active":"")}
  data-resource={row.id} data-state={row.state} aria-pressed={active}
  aria-label={bits.join(", ")+". Open freight ledger."}>
  <span className="resource__spark" style={{background:r.color}}/>
  <span className="resource__name">{r.unit}</span><strong>{amount(row.depot)}</strong>
  {row.reserved>0&&<span className="resource__reserved">⇄{amount(row.reserved)}</span>}
  {(row.state==="critical"||row.state==="warning")&&<span className={"resource__flag resource__flag--"+row.state} aria-hidden="true">{row.state==="critical"?"⚠":"◔"}</span>}
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
function DrawPanel({mode,g,selectedId,setSelectedId,buildId,setBuildId,buildRot,setBuildRot,notify,close,onSell,onResearch,onRemove,onCancel,strip,stripPrefs,onStripPrefs,ledgerFocus,setLedgerFocus,alarms}){
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
 if(mode==="inventory"){
  /* UX-01 (#359): actionable stock + shortages first; the full transaction
     ledger stays hidden behind a persisted disclosure toggle. Every number
     comes from the pure read model over the authoritative simulation. */
  if(!strip||strip.kind!=="ready")return <Card title="Freight ledger" eyebrow="INVENTORY / LOADING" onClose={close} className="ledger-panel">
   <div className="inspector-loading" aria-busy="true" data-testid="ledger-loading"><span className="spinner" aria-hidden="true"/><p className="panel-sub">Reading yard stock…</p></div>
  </Card>;
  const focus=strip.rows.find(r=>r.id===ledgerFocus)||null;
  const entries=(g.ledger||[]).slice(-12).reverse();
  const tone=focus?(focus.state==="critical"?"danger":focus.state==="warning"?"amber":focus.state==="locked"?"muted":"mint"):"mint";
  const stateLabel=focus?(focus.state==="critical"?"CRITICAL":focus.state==="warning"?"AWAITING DELIVERY":focus.state==="locked"?"LOCKED":focus.state==="empty"?"EMPTY":"IN STOCK"):"";
  return <Card title="Freight ledger" eyebrow="INVENTORY / SOURCE OF TRUTH" onClose={close} className="ledger-panel">
   {!strip.power.available&&<div className="bay-line bay-line--warn" role="status" data-testid="ledger-brownout"><span aria-hidden="true">⚠</span><span>Grid brownout — machines are powerless; production resumes when supply meets demand.</span></div>}
   {strip.shortages.length>0&&<><h3 className="panel-section">Shortages</h3>
    <div className="ledger-shortages" data-testid="ledger-shortages">{strip.shortages.map(s=><button type="button" key={s.id}
      className={"ledger-shortage ledger-shortage--"+s.state} data-testid={"shortage-"+s.id} data-state={s.state}
      onClick={()=>setLedgerFocus(s.id)} aria-label={s.name+" shortage — show breakdown"}>
      <span aria-hidden="true">{s.state==="critical"?"⚠":"◔"}</span>
      <span className="ledger-shortage__body"><strong>{s.name} · {s.state==="critical"?"CRITICAL":"DELIVERY PENDING"}</strong><small>{s.detail}</small></span>
     </button>)}</div></>}
   {/* UX-06 (#364): storage backups mirror the alarm rail read model — the
       depot bank is uncapped in the simulation, so the honest storage alarm
       is a machine output bay holding a full truck load with no pickup job. */}
   {alarms?.kind==="ready"&&alarms.alarms.some(a=>a.kind==="storage")&&<>
    <h3 className="panel-section">Storage backups</h3>
    <div className="ledger-shortages" data-testid="ledger-storage">{alarms.alarms.filter(a=>a.kind==="storage").map(a=>
     <div key={a.id} className="ledger-shortage ledger-shortage--warning" data-testid={"storage-"+a.target.buildingId} data-state={a.state}>
      <span aria-hidden="true">{a.icon}</span>
      <span className="ledger-shortage__body"><strong>{a.title} · WARNING</strong><small>{a.problem} {a.remedy}</small></span>
     </div>)}</div></>}
   {focus&&<div className="ledger-detail" data-testid="ledger-detail" data-resource={focus.id}>
    <div className="selected-hero"><span className="selected-hero__mark" style={{background:focus.color}}>▤</span><div><strong>{focus.name.toUpperCase()}</strong>
     <span className={"status-chip status-chip--"+tone} data-testid="ledger-state"><i aria-hidden="true"/>{stateLabel}</span></div></div>
    {focus.detail&&<p className="panel-sub" data-testid="ledger-detail-note">{focus.detail}</p>}
    <div className="stat-grid">
     <div><small>Depot</small><strong data-testid="ledger-depot">{amount(focus.depot)} {focus.unit}</strong></div>
     <div><small>In machines</small><strong data-testid="ledger-machines">{amount(focus.machines)} {focus.unit}</strong></div>
     <div><small>Reserved · transit</small><strong data-testid="ledger-reserved">{amount(focus.reserved)} {focus.unit}</strong></div>
     <div><small>Committed · assembly</small><strong data-testid="ledger-committed">{amount(focus.committed)} {focus.unit}</strong></div>
     <div><small>Yard total</small><strong data-testid="ledger-total">{amount(focus.total)} {focus.unit}</strong></div>
     <div><small>Capacity</small><strong data-testid="ledger-capacity">No cap</strong></div>
    </div>
   </div>}
   <h3 className="panel-section">All materials</h3>
   <div className="inventory-list ledger-list" data-testid="ledger-rows">{strip.rows.map(r=><button type="button" key={r.id}
     className={"ledger-row"+(ledgerFocus===r.id?" is-active":"")+(r.locked?" ledger-row--locked":"")}
     data-resource={r.id} data-state={r.state} onClick={()=>setLedgerFocus(r.id)} aria-pressed={ledgerFocus===r.id}
     aria-label={r.name+": depot "+amount(r.depot)+" "+r.unit+", yard total "+amount(r.total)+" "+r.unit+(r.locked?", locked until later progression":"")}>
     <span className="resource__spark" style={{background:r.color}}/>
     <span className="ledger-row__name"><strong>{r.name}</strong>{r.locked&&<em>LOCKED</em>}</span>
     <span className="ledger-row__nums"><strong>{amount(r.depot)}</strong><small>{r.reserved>0?"⇄"+amount(r.reserved)+" · ":""}Σ{amount(r.total)}</small></span>
     {(r.state==="critical"||r.state==="warning")&&<span className={"resource__flag resource__flag--"+r.state} aria-hidden="true">{r.state==="critical"?"⚠":"◔"}</span>}
    </button>)}</div>
   <button type="button" className="ledger-toggle" data-testid="ledger-toggle" aria-expanded={stripPrefs.ledgerOpen}
    onClick={()=>onStripPrefs({ledgerOpen:!stripPrefs.ledgerOpen})}>{stripPrefs.ledgerOpen?"Hide":"Show"} transaction ledger ({strip.ledgerCount})</button>
   {stripPrefs.ledgerOpen&&<div className="ledger-entries" data-testid="ledger-entries">
    {entries.length?entries.map(e=><div key={e.id} className="ledger-entry" data-kind={e.kind}>
      <strong>{String(e.kind).toUpperCase()}</strong><span>{e.type||"yard"}</span>
      <em>{e.cost?"−"+toMoney(e.cost):e.refund?"+"+toMoney(e.refund):""}</em>
     </div>):<p className="panel-sub">No transactions recorded yet.</p>}
   </div>}
   <div className="panel-footnote">Totals = depot + machine cargo + truck cargo, mirrored live from the simulation. Assembly cost is spent up front and refunds in full on cancel. Depot storage is uncapped.</div>
  </Card>;
 }
 return null;
}
/* UX-04 (#362): the inspector is a pure read model over the authoritative
   simulation (src/inspector.js). It never spends, forks or fabricates economy
   state; refund previews are unit-tested against the real transactions. */
function InspectorPanel({g,selectedId,ux,onUx,onClose,onRemove,onCancel,confirmId,setConfirmId,openBtnRef,confirmBtnRef,obscured,onFocus,openBuild,alarms,onAlarmAction}){
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
  {/* UX-06 (#364): contextual alarm states for THIS machine — the same pure
      read model the rail renders, with problem + remedy + a real action.
      Powerless consumers also surface the grid brownout contextually. */}
  {(()=>{
   const list=alarmsForBuilding(alarms,selectedId);
   const powerAlarm=alarms?.kind==="ready"&&def.power>0&&s.building.remaining<=0?alarms.alarms.find(a=>a.kind==="power"):null;
   const all=powerAlarm&&!list.some(a=>a.id===powerAlarm.id)?[powerAlarm,...list]:list;
   return all.length>0&&<>
    <h3 className="panel-section">Active alarms</h3>
    <div className="inspector-alarms" data-testid="inspector-alarms">{all.map(a=>
     <div key={a.id} className={"bay-line alarm-line alarm-line--"+a.severity} data-testid={"inspector-alarm-"+a.id} data-severity={a.severity} data-state={a.state}>
      <span aria-hidden="true">{a.icon}</span>
      <span><strong>{a.severityLabel} · {a.title}</strong> — {a.problem} <em>{a.remedy}</em></span>
      <button type="button" className="alarm-fix-button" data-testid={"inspector-alarm-action-"+a.id} onClick={()=>onAlarmAction(a)}>{a.action.label}</button>
     </div>)}
    </div></>;
  })()}
  {def.id==="depot"&&<p className="panel-sub" data-testid="inspector-depot-capacity">Depot storage is uncapped in this build — the simulation enforces no depot limit. Machine bays raise a storage alarm when output waits for a truck.</p>}
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
/* UX-05 (#363): fleet logistics is a pure read model over the authoritative
   simulation (src/fleet.js). Routes, reserved/onboard loads, bay queues and
   stuck reasons are the sim's own job fields — never a second fleet ledger.
   A disabled truck (cancelled / route-blocked / reconciled) is NEVER shown as
   hauling. The only mutation is the player's explicit cancelFreight command,
   which returns the units to their source exactly once. Follow camera moves
   ONLY through the public world.setView/applyCamera path (#307 invariants). */
function FleetPanel({g,focusId,setFocusId,followId,onFollow,onStopFollow,prefs,onPrefs,onCancelFreight,close}){
 const f=fleetState(g);
 if(f.kind==="loading")return <Card title="Fleet logistics" eyebrow="DISPATCH / LOADING" onClose={close} className="fleet-panel">
  <div className="inspector-loading" aria-busy="true" data-testid="fleet-loading"><span className="spinner" aria-hidden="true"/><p className="panel-sub">Reading dispatch state…</p></div>
 </Card>;
 const focus=f.rows.find(r=>r.id===focusId)||null;
 const rows=prefs.showIdle?f.rows:f.rows.filter(r=>r.state!=="idle");
 const focusBay=focus?.job?f.bays.find(b=>b.id===focus.job.destId):null;
 return <Card title="Fleet logistics" eyebrow="DISPATCH / PHYSICAL CARGO" onClose={close} className="fleet-panel">
  <div className="stat-grid fleet-summary">
   <div><small>Active</small><strong data-testid="fleet-active">{f.totals.active}/{f.totals.trucks}</strong></div>
   <div><small>Reserved</small><strong data-testid="fleet-reserved">{f.totals.reserved}</strong></div>
   <div><small>Onboard</small><strong data-testid="fleet-onboard">{f.totals.onboard}</strong></div>
  </div>
  {f.totals.waiting>0&&<p className="panel-sub" data-testid="fleet-waiting">{f.totals.waiting} load{f.totals.waiting===1?"":"s"} waiting for a connected route — dispatch assigns them automatically.</p>}
  {f.empty
   ?<p className="panel-sub" data-testid="fleet-empty">No trucks in the yard. The starter fleet is restored with a fresh save; vehicle manufacturing arrives with a later progression phase.</p>
   :<div className="fleet-list" data-testid="fleet-rows">{rows.map(r=><button type="button" key={r.id}
     className={"fleet-row"+(focusId===r.id?" is-active":"")} data-testid={"truck-"+r.id} data-state={r.state}
     aria-pressed={focusId===r.id} onClick={()=>setFocusId(r.id)}
     aria-label={r.name+": "+r.stateLabel+(r.job?", "+r.job.amount+" "+r.job.resource:"")+(r.stuck?", "+r.stuck.reason:"")}>
     <span className="fleet-glyph" aria-hidden="true">▰</span>
     <div><strong>{r.name}</strong><small>{r.stateLabel}</small></div>
     <span className={"fleet-label"+(r.tone==="danger"?" fleet-label--danger":"")}>{r.state==="error"?"REPAIR":r.job?(r.job.amount+" "+r.job.resource):"IDLE"}</span>
    </button>)}</div>}
  {focus&&<div className="fleet-detail" data-testid="fleet-detail" data-truck={focus.id}>
   <div className="selected-hero"><span className="selected-hero__mark" style={{background:"var(--amber)"}}>▰</span><div><strong>{focus.name}</strong>
    <span className={"status-chip status-chip--"+focus.tone} data-testid="fleet-state"><i aria-hidden="true"/>{focus.stateLabel.toUpperCase()}</span></div></div>
   <p className="panel-sub" data-testid="fleet-detail-note">{focus.detail}</p>
   {focus.job&&<>
    <div className={"bay-line"+(focus.state==="blocked"?" bay-line--warn":"")} data-testid="fleet-route">
     <span aria-hidden="true">⇄</span>
     <span>{(focus.source.name||"Missing source")+(focus.source.missing?"":" "+focus.source.x+","+focus.source.z)} → {(focus.dest.name||"Missing destination")+(focus.dest.missing?"":" "+focus.dest.x+","+focus.dest.z)}</span>
    </div>
    <div className="stat-grid">
     <div><small>Reserved load</small><strong data-testid="fleet-reserved-load">{focus.reserved} {focus.resource?.unit}</strong></div>
     <div><small>Onboard</small><strong data-testid="fleet-onboard-load">{focus.onboard} {focus.resource?.unit}</strong></div>
     <div><small>Route progress</small><strong data-testid="fleet-progress">{Math.round(focus.progress*100)}%</strong></div>
     <div><small>ETA</small><strong data-testid="fleet-eta">{focus.etaSeconds!=null?focus.etaSeconds.toFixed(1)+"s":"—"}</strong></div>
    </div>
    <Meter value={focus.progress} max={1} color={focus.tone==="danger"?"var(--danger)":"var(--amber)"}/>
   </>}
   {focus.stuck&&<div className="bay-line bay-line--warn" role={focus.state==="error"?"alert":"status"}
    data-testid={focus.state==="error"?"fleet-error":"fleet-stuck"}>
    <span aria-hidden="true">⚠</span><span><strong>{focus.stuck.code}</strong> — {focus.stuck.reason}. {focus.stuck.detail}</span>
   </div>}
   {focus.state==="noroute"&&focus.unaffordable&&<p className="panel-sub text-warn" data-testid="fleet-unaffordable">A road segment costs 3 AG + 4 CR — the depot cannot afford one right now. Sell surplus or wait for production.</p>}
   {focusBay&&focusBay.queue.length>0&&<div className="fleet-queue" data-testid="fleet-bay-queue">
    <h3 className="panel-section">Bay queue — {focusBay.name||"bay"}</h3>
    {focusBay.queue.map(q=><div key={q.vehicleId} className="fleet-queue__row" data-vehicle={q.vehicleId}>
     <strong>{q.name}</strong><span>{q.role==="pickup"?"PICKUP":"DELIVERY"} · {q.amount} {q.unit}</span>
     <em>{q.loading?"AT BAY":Math.ceil(q.remainingCells)+" cells out"}</em>
    </div>)}
   </div>}
   <div className="fleet-actions">
    <button type="button" className="focus-button" data-testid="fleet-follow" aria-pressed={followId===focus.id}
     onClick={()=>followId===focus.id?onStopFollow():onFollow(focus.id)}>
     {followId===focus.id?"Stop following":"Follow truck"}</button>
    {focus.cancel.allowed
     ?<button type="button" className="danger-button" data-testid="fleet-cancel" onClick={()=>onCancelFreight(focus.id)}>Cancel job — return load</button>
     :<button type="button" className="danger-button" data-testid="fleet-cancel" disabled title={focus.cancel.reason}>Cancel job — no freight</button>}
   </div>
  </div>}
  <div className="inspector-settings">
   <label><input type="checkbox" checked={prefs.showIdle} onChange={e=>onPrefs({showIdle:e.target.checked})} data-testid="fleet-setting-idle"/> Show idle trucks</label>
   <label><input type="checkbox" checked={prefs.followCam} onChange={e=>onPrefs({followCam:e.target.checked})} data-testid="fleet-setting-follow"/> Keep following truck in view</label>
  </div>
  <button type="button" className="rotate-button" data-testid="fleet-build-locked" disabled aria-describedby="fleet-build-lock-reason">Build new truck — locked</button>
  <p className="panel-footnote" id="fleet-build-lock-reason">{f.buildLock.reason}</p>
  <div className="panel-footnote">Every value mirrors the simulation's freight ledger live. Canceling returns the reserved or onboard units to their source exactly once — never both. Priority: maintain processor inputs, then haul finished products to your depot.</div>
 </Card>;
}
/* UX-06 (#364): actionable in-world alarms. Compact severity chips + one
   expanded detail at a time, derived from the pure src/alarms.js read model
   over the authoritative simulation. Colour is NEVER the only cue: every
   chip pairs an icon with an explicit CRITICAL / WARNING word and a title;
   the detail spells out the problem AND the remedy with a real action.
   CAM-05 (#341): chips appear, expand and act WITHOUT moving the camera or
   dropping the selection — actions reuse the camera-neutral choose() /
   openLedger() paths; no transitionCamera call lives in this component. */
function AlarmChip({alarm,expanded,onToggle}){
 return <button type="button"
  className={"alarm-chip alarm-chip--"+alarm.severity+(expanded?" is-active":"")}
  data-testid={"alarm-chip-"+alarm.id} data-kind={alarm.kind} data-severity={alarm.severity} data-state={alarm.state}
  aria-pressed={expanded} aria-expanded={expanded} aria-controls={expanded?"alarm-detail":undefined}
  onClick={()=>onToggle(alarm.id)}
  aria-label={alarm.severityLabel+": "+alarm.title+". "+alarm.problem+" Remedy: "+alarm.remedy}>
  <span className="alarm-chip__icon" aria-hidden="true">{alarm.icon}</span>
  <span className="alarm-chip__text"><strong>{alarm.title}</strong><em>{alarm.severityLabel}</em></span>
 </button>;
}
function AlarmDetail({alarm,onAction,onClose}){
 return <div className="alarm-detail" id="alarm-detail" data-testid="alarm-detail"
  data-kind={alarm.kind} data-severity={alarm.severity} data-state={alarm.state}
  role="group" aria-label={alarm.title+" alarm detail"}>
  <div className="alarm-detail__head">
   <span className={"status-chip status-chip--"+(alarm.severity==="critical"?"danger":"amber")}><i aria-hidden="true"/>{alarm.severityLabel}</span>
   <button type="button" className="plain-icon" data-testid="alarm-detail-close" aria-label="Close alarm detail" onClick={onClose}>×</button>
  </div>
  <strong className="alarm-detail__title"><span aria-hidden="true">{alarm.icon}</span> {alarm.title}</strong>
  <p className="panel-sub" data-testid="alarm-problem">{alarm.problem}</p>
  <p className="alarm-detail__remedy" data-testid="alarm-remedy"><span className="eyebrow">REMEDY</span>{alarm.remedy}</p>
  {alarm.detail&&<p className="panel-sub" data-testid="alarm-processing">{alarm.detail}</p>}
  <div className="alarm-detail__actions">
   <button type="button" className="focus-button" data-testid="alarm-action" onClick={()=>onAction(alarm)}>{alarm.action.label}</button>
   {alarm.altAction&&<button type="button" className="keep-button" data-testid="alarm-alt-action" onClick={()=>onAction(alarm,alarm.altAction)}>{alarm.altAction.label}</button>}
  </div>
 </div>;
}
function AlarmRail({state,prefs,onPrefs,expandedId,onToggle,onAction,onCloseDetail}){
 if(state.kind==="loading")return <div className="alarm-rail" aria-busy="true" data-testid="alarms-loading">
  <span className="alarm-chip alarm-chip--ok"><span className="spinner" aria-hidden="true"/><span className="alarm-chip__text"><strong>READING YARD…</strong><em>LOADING</em></span></span>
 </div>;
 if(state.kind==="error")return <div className="alarm-rail" role="alert" data-testid="alarms-error">
  <span className="alarm-chip alarm-chip--critical"><span className="alarm-chip__icon" aria-hidden="true">⚠</span><span className="alarm-chip__text"><strong>ALARMS PAUSED</strong><em>{state.reason}</em></span></span>
 </div>;
 const visible=state.alarms.filter(a=>a.severity==="critical"||prefs.showWarnings);
 const expanded=visible.find(a=>a.id===expandedId)||null;
 const live=visible.length
  ?visible.length+" yard alarm"+(visible.length===1?"":"s")+": "+visible.map(a=>a.severityLabel+" "+a.title).join("; ")
  :"All yard systems nominal";
 return <div className="alarm-rail" data-testid="alarm-rail">
  <span className="sr-only" role="status" aria-live="polite" data-testid="alarm-live">{live}</span>
  {!prefs.railOpen
   ?(visible.length>0&&<button type="button" className="alarm-summary" data-testid="alarm-summary" aria-expanded={false}
     onClick={()=>onPrefs({railOpen:true})}
     aria-label={visible.length+" yard alarm"+(visible.length===1?"":"s")+" hidden — show alarm rail"}>
     <span aria-hidden="true">{visible.some(a=>a.severity==="critical")?"⚠":"◔"}</span>
     {visible.length} ALARM{visible.length===1?"":"S"}<em>show</em></button>)
   :<>
    {visible.length===0&&<span className="alarm-chip alarm-chip--ok" data-testid="alarms-empty">
     <span className="alarm-chip__icon" aria-hidden="true">✓</span>
     <span className="alarm-chip__text"><strong>YARD NOMINAL</strong><em>NO ALARMS</em></span></span>}
    {visible.map(a=><AlarmChip key={a.id} alarm={a} expanded={expanded?.id===a.id} onToggle={onToggle}/>)}
    {expanded&&<AlarmDetail alarm={expanded} onAction={onAction} onClose={onCloseDetail}/>}
    {state.alarms.length>0&&<div className="alarm-controls">
     <label><input type="checkbox" checked={prefs.showWarnings} data-testid="alarm-setting-warnings"
      onChange={e=>onPrefs({showWarnings:e.target.checked})}/> Warnings</label>
     <button type="button" className="alarm-collapse" data-testid="alarm-collapse" aria-expanded={true}
      onClick={()=>onPrefs({railOpen:false})}>Hide rail</button>
    </div>}
   </>}
 </div>;
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
 // UX-01 (#359): persisted strip disclosure prefs (separate key from ux-settings).
 const [stripPrefs,setStripPrefs]=useState(()=>readStripSettings(typeof window!=="undefined"?window.localStorage:null));
 const [ledgerFocus,setLedgerFocus]=useState(null);
 // UX-07 (#365): persisted sheet collapse pref (separate key from ux/strip/save)
 // + compact-mode detection for the center hint. Collapsing NEVER touches the
 // camera ref or selection — it only hides the sheet body in place.
 const [dockPrefs,setDockPrefs]=useState(()=>readDockSettings(typeof window!=="undefined"?window.localStorage:null));
 // UX-05 (#363): fleet focus (selected truck) + follow-camera selection, and
 // persisted fleet prefs under their OWN storage key (fleet.js sanitizer).
 const [fleetFocus,setFleetFocus]=useState(null);
 const [followId,setFollowId]=useState(null);
 const [fleetPrefs,setFleetPrefs]=useState(()=>readFleetSettings(typeof window!=="undefined"?window.localStorage:null));
 const fleetRef=useRef({followId:null,followCam:fleetPrefs.followCam});
 useEffect(()=>{fleetRef.current={followId,followCam:fleetPrefs.followCam};},[followId,fleetPrefs.followCam]);
 // UX-06 (#364): persisted alarm rail prefs under their OWN storage key
 // (alarms.js sanitizer) + the single expanded alarm detail. UI-only state:
 // expanding/acting on an alarm never touches the camera ref or selection.
 const [alarmPrefs,setAlarmPrefs]=useState(()=>readAlarmSettings(typeof window!=="undefined"?window.localStorage:null));
 const [expandedAlarmId,setExpandedAlarmId]=useState(null);
 const expandedAlarmRef=useRef(null);
 useEffect(()=>{expandedAlarmRef.current=expandedAlarmId;},[expandedAlarmId]);
 const [compact,setCompact]=useState(()=>typeof window!=="undefined"&&window.matchMedia("(max-width:770px),(max-height:600px)").matches);
 const sheetCollapsed=dockPrefs.sheetCollapsed;
 const [confirmId,setConfirmId]=useState(null);
 const [panelSide,setPanelSide]=useState("left");
 const [obscured,setObscured]=useState(false);
 const panelHostRef=useRef(null),openBtnRef=useRef(null),confirmBtnRef=useRef(null),sheetToggleRef=useRef(null);
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
 // Leaving fleet mode stops the follow camera (bounded UX-05 judgment call:
 // follow is a fleet-panel affordance; the truck focus itself is preserved).
 // CAM-05 (#341): toolbar transitions NEVER drop the selected machine and
 // never move the camera. Inspect re-shows the retained selection; explicit
 // deselect remains a distinct gesture (empty-ground tap / Escape / dismantle).
 const choose=useCallback(id=>{
  const next=nextToolMode(id,selectedRef.current);
  setMode(next);setPreview(null);setRoadStart(null);setConfirmId(null);
  if(id!=="fleet")setFollowId(null);
  document.body.dataset.panelProbe=JSON.stringify({trigger:"tool:"+id,mode:next,selectedId:selectedRef.current});
 },[]);
 const openLedger=useCallback((id=null)=>{choose("inventory");setLedgerFocus(id);},[choose]);
 const onStripPrefs=useCallback(patch=>{setStripPrefs(writeStripSettings(window.localStorage,patch));},[]);
 const onDockPrefs=useCallback(patch=>{setDockPrefs(writeDockSettings(window.localStorage,patch));},[]);
 const onFleetPrefs=useCallback(patch=>{setFleetPrefs(writeFleetSettings(window.localStorage,patch));},[]);
 const onAlarmPrefs=useCallback(patch=>{setAlarmPrefs(writeAlarmSettings(window.localStorage,patch));},[]);
 const onToggleAlarm=useCallback(id=>setExpandedAlarmId(cur=>cur===id?null:id),[]);
 const onCloseAlarmDetail=useCallback(()=>setExpandedAlarmId(null),[]);
 /* UX-06 (#364): alarm remedies route through the SAME camera-neutral tool
    paths as the dock (choose / openLedger). No transitionCamera, no selection
    change — CAM-05 invariants hold for every alarm interaction. */
 const onAlarmAction=useCallback((alarm,alt)=>{
  const action=alt||alarm.action;
  if(action.tool==="build"){
   choose("build");
   if(action.blueprint&&BLUEPRINTS[action.blueprint])setBuildId(action.blueprint);
   notify("Construct a "+(BLUEPRINTS[action.blueprint]?.name||"machine")+" — tap a free pad to place it");
  }else if(action.tool==="road"){
   choose("road");
   notify(alarm.target?.name
    ?"Lay asphalt within "+ROAD_REACH+" cells of the "+alarm.target.name+" bay at "+alarm.target.x+","+alarm.target.z
    :"Lay asphalt to reconnect the route — tap a start cell, then the destination");
  }else if(action.tool==="fleet")choose("fleet");
  else if(action.tool==="market")choose("market");
  else openLedger(action.resource||null);
  setExpandedAlarmId(null);
 },[choose,openLedger,notify]);
 /* Follow camera reframes ONLY through the public world.setView/applyCamera
    path (#307): followTarget is a pure pinGroundToPixel target move — yaw,
    elevation and zoom are preserved; world.js/camera.js are never edited. */
 const reframeFollow=useCallback(id=>{
  const world=worldRef.current,cv=world?.renderer.domElement;
  const v=gameRef.current?.vehicles.find(x=>x.id===id);
  if(!world||!cv||!v)return;
  const rect=cv.getBoundingClientRect(),viewport={width:rect.width,height:rect.height};
  if(viewport.width<=0||viewport.height<=0)return;
  camera.current=followTarget(camera.current,v,viewport);
  world.setView(camera.current);world.applyCamera();
 },[]);
 const onFollow=useCallback(id=>{setFollowId(id);reframeFollow(id);},[reframeFollow]);
 const onStopFollow=useCallback(()=>setFollowId(null),[]);
 useEffect(()=>{
  const mq=window.matchMedia("(max-width:770px),(max-height:600px)");
  const onChange=e=>setCompact(e.matches);
  mq.addEventListener("change",onChange);setCompact(mq.matches);
  return ()=>mq.removeEventListener("change",onChange);
 },[]);
 const toggleSheet=useCallback(()=>{
  // If focus lives inside the body we are about to hide, return it to the
  // toggle so keyboard users never lose their place. Camera + selection stay.
  if(!sheetCollapsed){
   const body=document.getElementById("context-sheet-body");
   if(body&&body.contains(document.activeElement))sheetToggleRef.current?.focus();
  }
  onDockPrefs({sheetCollapsed:!sheetCollapsed});
  document.body.dataset.panelProbe=JSON.stringify({trigger:"sheet-toggle",mode:modeRef.current.mode,selectedId:selectedRef.current,collapsed:!sheetCollapsed});
 },[sheetCollapsed,onDockPrefs]);
 // CAM-05 (#341): closing the sheet hides the panel but KEEPS the selection
 // and the camera pose; the Inspect tool re-opens it for the same machine.
 const closeSheet=useCallback(()=>{
  setMode("select");setPreview(null);setRoadStart(null);setConfirmId(null);setFollowId(null);
  document.body.dataset.panelProbe=JSON.stringify({trigger:"sheet-close",mode:"select",selectedId:selectedRef.current});
 },[]);
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
   :{width:isPhone?viewport.width-12:Math.min(356,viewport.width-28),height:sheetMaxHeight(viewport)||120};
  // UX-07 (#365): reserve the ACTUAL dock band (measured, safe-area aware) so
  // the sheet never covers the dock; fall back to the pure dock.js mirror.
  const dockRect=document.querySelector(".tool-dock")?.getBoundingClientRect();
  const bottomOffset=dockRect&&dockRect.top>0?Math.max(0,viewport.height-dockRect.top)+6
   :dockBottomOffset(classifyViewport(viewport));
  const place=panelPlacement({machineRect:machineScreenRect(camera.current,b,viewport),viewport,panelSize,
   isPhone,preference:uxRef.current.panelSide,bottomOffset});
  if(!isPhone)setPanelSide(s=>s===place.side?s:place.side);
  setObscured(o=>o===place.obscured?o:place.obscured);
  // CAM-05 (#341): the pure transitionCamera policy is the SINGLE decision
  // point. frame=false (panel open/close, resize, periodic placement) is
  // camera-neutral even when obscured; only a new selection (UX-04 autoFrame)
  // or the explicit Focus button (force) may reframe, via setView/applyCamera.
  const next=transitionCamera({trigger:frame?(force?"focus":"selection"):"panel",
   camera:camera.current,building:b,viewport,focusPixel:place.focusPixel,
   obscured:place.obscured,autoFrame:uxRef.current.autoFrame});
  if(next!==camera.current){
   camera.current=next;
   world.setView(next);world.applyCamera();
   setObscured(false);
  }
 },[]);
 // CAM-05 (#341): auto-framing belongs to a NEW selection only. Re-entering
 // the inspector for a retained selection (panel close/reopen) must NOT move
 // the camera; framedRef remembers the last framed machine across modes.
 const framedRef=useRef(null);
 useEffect(()=>{
  if(selectedId==null){framedRef.current=null;return;}
  if(mode!=="inspect")return;
  const isNewSelection=framedRef.current!==selectedId;
  framedRef.current=selectedId;
  const t=requestAnimationFrame(()=>updatePlacement(isNewSelection));
  return ()=>cancelAnimationFrame(t);
 },[selectedId,mode,ux.autoFrame,updatePlacement]);
 const onUx=useCallback(patch=>{
  const next=writeUxSettings(window.localStorage,patch);
  uxRef.current=next;setUx(next);
  requestAnimationFrame(()=>updatePlacement(true));
 },[updatePlacement]);
 const refresh=useCallback(()=>setData(snapshot(gameRef.current)),[]);
 /* UX-05 (#363): the ONLY fleet mutation is the player's explicit cancel —
    simulation.cancelFreight returns reserved OR onboard units to their source
    exactly once (returnFreight). No UI-side ledger or refund math here. */
 const onCancelFreight=useCallback(id=>{
  // Atomic observability (#363): the sim may re-dispatch this truck on the very
  // next frame, so captures prove exact-once conservation from a stamp taken
  // INSIDE the transaction — never from the periodic UI stamp. Read-only.
  const g=gameRef.current,v0=g.vehicles.find(x=>x.id===id),j0=v0?.job||null;
  const srcId=j0?.sourceId??null;
  const bagOf=bid=>{const b=g.buildings.find(x=>x.id===bid);return !b||b.type==="depot"?g.bank:(b.inventory||{});};
  const pre=freightTotals(g),bagBefore=j0?(bagOf(srcId)[j0.resource]||0):0;
  const r=cancelFreight(g,id);
  const post=freightTotals(g),bagAfter=j0?(bagOf(srcId)[j0.resource]||0):0;
  document.body.dataset.cancelProbe=JSON.stringify({id,ok:r.ok,code:r.code,amount:r.amount??0,resource:r.resource??null,
   sourceId:srcId,phase:j0?.phase??null,bagBefore,bagAfter,
   before:{reserved:pre.reserved,onboard:pre.onboard,totals:pre.totals},
   after:{reserved:post.reserved,onboard:post.onboard,totals:post.totals}});
  notify(r.ok?"Freight canceled — "+r.amount+" "+(RESOURCE_BY_ID[r.resource]?.unit||r.resource)+" returned to its source":r.reason);
  refresh();
 },[notify,refresh]);
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
 // CAM-05 (#341): Home/Recenter is the ONLY refit. It restores the approved
 // isometric overview through the same pure policy and stamps synchronously
 // via the public setView/applyCamera path (#307 hashes untouched).
 const resetCam=useCallback(()=>{
  camera.current=transitionCamera({trigger:"reset",camera:camera.current,
   home:{yaw:45,elevation:35.264,zoom:window.innerWidth>=960?1.15:1,x:0,z:0}});
  const world=worldRef.current;
  if(world){world.setView(camera.current);world.applyCamera();}
  document.body.dataset.panelProbe=JSON.stringify({trigger:"reset",mode:modeRef.current.mode,selectedId:selectedRef.current});
  setToast("Camera reset to isometric overview");
 },[]);
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
  // Cached canvas size (refreshed by the ResizeObserver) so the follow camera
  // never forces a per-frame layout read.
  let viewSize={width:sceneHost.current.clientWidth,height:sceneHost.current.clientHeight};
  const loop=(now)=>{
   if(!alive)return;
   const dt=Math.min(.07,Math.max(0,(now-last)/1000));last=now;
   advanceGame(gameRef.current,dt);
   // UX-05 (#363): follow camera pins the truck's ACTUAL sim position to the
   // clear-zone focus pixel via the pure fleet.followTarget; the camera only
   // moves through the existing public setView/applyCamera path below.
   const fr=fleetRef.current;
   if(fr.followId!=null&&fr.followCam&&viewSize.width>0&&viewSize.height>0){
    const v=gameRef.current.vehicles.find(x=>x.id===fr.followId);
    if(v){
     camera.current=followTarget(camera.current,v,viewSize);
     // Same-frame observability: the LIVE truck position the camera pinned,
     // so captures can verify the pin against the applied camera stamps.
     document.body.dataset.followProbe=JSON.stringify({id:v.id,x:v.x,z:v.z});
    }
   }
   world.setView(camera.current);world.update(gameRef.current,dt,now/1000);
   if(now-uiLast>270){
    const s=snapshot(gameRef.current);setData(s);
    // UX-05 (#363) observability stamp: the SAME snapshot the panel renders,
    // so captures can prove panel values equal the sim's own freight fields
    // (same pattern as lastSiteOk / lastZoomApplied). Read-only, never mutates.
    const ft=freightTotals(s);
    document.body.dataset.fleetProbe=JSON.stringify({reserved:ft.reserved,onboard:ft.onboard,totals:ft.totals,
     bank:s.bank,buildings:s.buildings.map(b=>({id:b.id,type:b.type,inventory:b.inventory||{}})),
     fleetResearch:s.research.includes("fleet"),
     vehicles:s.vehicles.map(v=>({id:v.id,x:v.x,z:v.z,speed:v.speed,
      job:v.job?{phase:v.job.phase,amount:v.job.amount,resource:v.job.resource,segment:v.job.segment,
       progress:v.job.progress,routeLen:v.job.route.length,toSourceLen:v.job.toSource.length,
       toDestLen:v.job.toDest.length,sourceId:v.job.sourceId,destId:v.job.destId}:null,
      cargo:v.cargo?{amount:v.cargo.amount,resource:v.cargo.resource}:null}))});
    // UX-06 (#364) observability stamp: the SAME snapshot the alarm rail
    // renders, so captures prove chip ids/counts equal the pure read model
    // over the sim. Test-gated behind window.__RW_PROBES__ (wiring harness
    // + capture script opt in) so production never grows the debug-probe
    // family; registered in the probe debt ledger. Read-only, never mutates.
    if(window.__RW_PROBES__){
     const al=alarmsState(s);
     document.body.dataset.alarmProbe=JSON.stringify({kind:al.kind,ids:(al.alarms||[]).map(a=>a.id),counts:al.counts||null,power:al.power||null});
    }
    updatePlacement(false);uiLast=now;
   }
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
     // UX-05 (#363): a fresh road-mode tap ON a truck inspects it instead of
     // arming a road origin — choose("fleet") clears roadStart, so inspecting
     // never mis-triggers road construction. A destination tap still builds.
     const truck=!first?truckAt(g,c.x,c.z):null;
     if(truck!=null){choose("fleet");setFleetFocus(truck);notify((g.vehicles.find(v=>v.id===truck)?.name||"Truck")+" — fleet logistics");}
     else if(!first){setRoadStart({x:c.x,z:c.z});notify("Now select the road destination");}
     else {const r=roadLine(g,first,{x:c.x,z:c.z});notify(r.ok?r.cells+" road segments connected":r.reason);setRoadStart(null);}
    }else{
     const truck=tool!=="build"?truckAt(g,c.x,c.z):null;
     const hit=truck==null?buildingAt(g,c.x,c.z):null;
     if(truck!=null){choose("fleet");setFleetFocus(truck);notify((g.vehicles.find(v=>v.id===truck)?.name||"Truck")+" — fleet logistics");}
     else if(hit){setSelectedId(hit.id);setMode("inspect");notify(BLUEPRINTS[hit.type].name+" selected");}
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
   // UX-06 (#364): an expanded alarm detail is the topmost transient layer —
   // close it and return focus to its chip; camera and selection untouched.
   // A separate guard BEFORE the CAM-05 Escape block keeps that block's source
   // contract (cam05Retention) byte-identical.
   if(e.key==="Escape"&&expandedAlarmRef.current!=null){
    const id=expandedAlarmRef.current;setExpandedAlarmId(null);
    requestAnimationFrame(()=>document.querySelector('[data-testid="alarm-chip-'+id+'"]')?.focus?.());
    return;
   }
   if(e.key==="Escape"){
    // Topmost layer first: an open dismantle confirmation closes before selection.
    if(confirmRef.current!=null){setConfirmId(null);requestAnimationFrame(()=>openBtnRef.current?.focus?.());return;}
    // Explicit deselect (CAM-05 keeps this distinct from panel transitions):
    // clear the selection AND hide the sheet without touching the camera.
    setSelectedId(null);setMode("select");setPreview(null);setRoadStart(null);setFollowId(null);
    document.body.dataset.panelProbe=JSON.stringify({trigger:"escape",mode:"select",selectedId:null});
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
  // CAM-05 (#341): responsive transitions are camera-neutral. world.resize()
  // never refits; placement is recomputed WITHOUT moving the camera. If the
  // sheet now obscures the machine, the explicit Focus button is offered.
  const observer=new ResizeObserver(()=>{viewSize={width:sceneHost.current.clientWidth,height:sceneHost.current.clientHeight};world.resize();updatePlacement(false);
   document.body.dataset.panelProbe=JSON.stringify({trigger:"resize",mode:modeRef.current.mode,selectedId:selectedRef.current});});observer.observe(sceneHost.current);
  return ()=>{alive=false;cancelAnimationFrame(raf);observer.disconnect();persist(gameRef.current);
   controller.dispose();
   window.removeEventListener("keydown",onKey);window.removeEventListener("pagehide",save);world.dispose();worldRef.current=null;
  };
 },[]);
 const power=powerStatus(data);
 const stripState=resourceStripState(data);
 const alarmState=alarmsState(data);
 const sheetTitle=mode==="inspect"
  ?(selectedId!=null?(BLUEPRINTS[data.buildings.find(b=>b.id===selectedId)?.type]?.name||"Inspector"):"Inspector")
  :mode==="build"?"Build catalog":mode==="road"?"Road engineer":mode==="fleet"?"Fleet logistics"
  :mode==="research"?"Research & industry":mode==="market"?"Trade exchange":"Freight ledger";
 const criticalCount=stripState.kind==="ready"?stripState.shortages.filter(s=>s.state==="critical").length:0;
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
   <div className="resources-strip" aria-label="Resources">
    {stripState.kind==="ready"&&MAIN_RESOURCES.map(id=>{const row=stripState.rows.find(r=>r.id===id);
     return row?<ResourceChip key={id} row={row} active={mode==="inventory"&&ledgerFocus===id} onOpen={openLedger}/>:null;})}
    {stripState.kind==="ready"&&(criticalCount>0||!power.available)&&
     <button type="button" className={"strip-alert"+(criticalCount>0?" strip-alert--critical":"")} data-testid="strip-alert"
      onClick={()=>openLedger(null)} aria-label={criticalCount>0?criticalCount+" critical material shortages — open freight ledger":"Grid brownout — open freight ledger"}>
      <span aria-hidden="true">⚠</span>{criticalCount>0?criticalCount+" SHORT":"GRID"}
     </button>}
    <button className="resource-more" onClick={()=>openLedger(null)} title="Open full inventory" aria-label="Open full freight ledger">+ {RESOURCES.length-MAIN_RESOURCES.length}</button>
   </div>
   <div className="session-info"><StatusDot ok={power.available}/><span>LOCAL YARD</span><small>SECTOR 01</small></div>
  </header>
  <aside className={"left-rail"+(mode==="inspect"&&selectedId!=null&&panelSide==="left"?" left-rail--beside-panel":"")}>
   <div className="coordinate-chip"><span className="eyebrow">OPERATING SECTOR</span><strong>CINDER BASIN</strong><small>{TIERS[data.tier]?.name||"INDUSTRIAL AGE"} · {WORLD_SIZE}×{WORLD_SIZE} LAND</small></div>
   <div className="rail-controls">
    <button onClick={resetCam} title="Fit isometric world (Home)">⌖ <span>Recenter</span></button>
    <button onClick={()=>{camera.current={...camera.current,yaw:(camera.current.yaw+45)%360};const w=worldRef.current;if(w){w.setView(camera.current);w.applyCamera();}}} title="Orbit camera right">⤾ <span>Orbit</span></button>
    <button aria-label="Zoom in" onClick={()=>zoomControl(1.55)} title="Zoom in (up to 12×)">＋ <span>Zoom in</span></button>
    <button aria-label="Zoom out" onClick={()=>zoomControl(1/1.55)} title="Zoom out (down to 0.20×)">− <span>Zoom out</span></button>
    <button onClick={()=>setShowLegend(v=>!v)} title="Controls and help">? <span>Controls</span></button>
   </div>
   {/* UX-06 (#364): the alarm rail lives in the left HUD rail — compact chips
      with an expanded detail, camera-neutral by construction. */}
   <AlarmRail state={alarmState} prefs={alarmPrefs} onPrefs={onAlarmPrefs}
    expandedId={expandedAlarmId} onToggle={onToggleAlarm} onAction={onAlarmAction} onCloseDetail={onCloseAlarmDetail}/>
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
  {(mode==="road"||mode==="build")&&(!compact||sheetCollapsed)&&<div className="center-hint" aria-hidden="true">{mode==="road"?(roadStart?"TAP A DESTINATION CELL":"TAP A START CELL"):"TAP THE GROUND TO CONSTRUCT · R ROTATES THE FOOTPRINT"}</div>}
  <nav className="tool-dock" aria-label="Construction and world controls">
    {TOOLBAR.map(item=><button key={item.id} data-tool={item.id}
      className={mode===item.id||item.id==="select"&&mode==="inspect"?"tool-dock__item is-active":"tool-dock__item"}
      onClick={()=>choose(item.id)} title={item.name+" — "+item.key} aria-label={item.name} aria-pressed={mode===item.id}>
      <Icon name={item.icon}/><span>{item.name}</span><em>{item.key}</em>
    </button>)}
  </nav>
  {["build","road","fleet","research","market","inventory","inspect"].includes(mode)&&<div
    className={"panel-host"+(mode==="inspect"&&panelSide==="right"?" panel-host--right":"")+(sheetCollapsed?" panel-host--collapsed":"")}
    data-testid="panel-host" data-collapsed={String(sheetCollapsed)} ref={panelHostRef}>
    {/* UX-07 (#365): persistent sheet bar — collapse/expand keeps the panel
       mounted (scroll position, confirm dialog and focus survive) and never
       moves the camera or clears the selection. */}
    <div className="sheet-bar">
     <span className="sheet-grip" aria-hidden="true"/>
     <strong data-testid="sheet-title">{sheetTitle}</strong>
     <button type="button" ref={sheetToggleRef} className="sheet-toggle" data-testid="sheet-toggle"
      aria-expanded={!sheetCollapsed} aria-controls="context-sheet-body"
      aria-label={(sheetCollapsed?"Expand ":"Collapse ")+sheetTitle+" sheet"}
      onClick={toggleSheet}><span aria-hidden="true">{sheetCollapsed?"▴":"▾"}</span></button>
     <button type="button" className="plain-icon" data-testid="sheet-close" aria-label={"Close "+sheetTitle} onClick={closeSheet}>×</button>
    </div>
    <div className="sheet-body" id="context-sheet-body" hidden={sheetCollapsed}>
     {mode==="inspect"
      ?<InspectorPanel g={data} selectedId={selectedId} ux={ux} onUx={onUx}
        confirmId={confirmId} setConfirmId={setConfirmId} openBtnRef={openBtnRef} confirmBtnRef={confirmBtnRef}
        obscured={obscured} onFocus={()=>updatePlacement(true,true)} openBuild={()=>choose("build")}
        onRemove={onRemove} onCancel={onCancel} onClose={closeSheet}
        alarms={alarmState} onAlarmAction={onAlarmAction}/>
      :mode==="fleet"
      ?<FleetPanel g={data} focusId={fleetFocus} setFocusId={setFleetFocus}
        followId={followId} onFollow={onFollow} onStopFollow={onStopFollow}
        prefs={fleetPrefs} onPrefs={onFleetPrefs} onCancelFreight={onCancelFreight}
        close={closeSheet}/>
      :<DrawPanel mode={mode} g={data} selectedId={selectedId} setSelectedId={setSelectedId}
        buildId={buildId} setBuildId={setBuildId} buildRot={buildRot} setBuildRot={setBuildRot}
        notify={notify} onSell={onSell} onResearch={onResearch} onRemove={onRemove} onCancel={onCancel} close={closeSheet}
        strip={stripState} stripPrefs={stripPrefs} onStripPrefs={onStripPrefs} ledgerFocus={ledgerFocus} setLedgerFocus={setLedgerFocus} alarms={alarmState}/>}
    </div>
   </div>}
  <div className="footline"><span>RUSTWAKE / V2 FOUNDATION</span><span>SIM {Math.floor(data.elapsed)}s</span><span>{data.buildings.length} STRUCTURES · {data.roads.length} ROAD CELLS</span></div>
  {/* #548: toast body is pointer-events:none (styles.css) so world gestures
      pass through; only the 44px dismiss button is interactive. role=status
      and the remount key are unchanged. */}
  {toast&&<div key={toast+Math.floor(data.elapsed/7)} className="toast" role="status"><b>NOTICE</b><span>{toast}</span><button aria-label="Dismiss notice" onClick={()=>setToast("")}>×</button></div>}
 </div>;
}
const EDGE_LIMIT=70;
