// ART-04 (#350): pure simulation-status + motion contract for the four civic rigs
// (freight depot, trade exchange, signal observatory, parts fabricator).
// No THREE, no DOM — the SAME functions are called by world.js update() (through
// applyArt04) and by tests/art04Models.test.mjs, so the tested pose/status is the
// rendered one (same architecture as ART-03 src/art03.js).
//
// Authority (#274 honesty):
//  - research / fabricator are real cycling machines: status derives ONLY from
//    machineStatus(g,b) (powerStatus grid + inputs fit, same 1e-7 epsilon as
//    simulation.js) and the work clock integrates wrap-aware b.timer deltas.
//    Unpowered pivots freeze; a starved sim timer advances but the work clock
//    deliberately does NOT (no false production).
//  - depot has no production cycle: its dock shutter is a pure function of the
//    nearest REAL freight truck's distance to this depot's bay approach cell
//    (gridOccupancy bayCells — the same convention as the ART-05 forklift).
//    No truck near => shutter closed, status idle. Never a wall-clock timer.
//  - market has no production cycle either: the balance beam / awning are
//    DECLARED AMBIENT civic decoration on the sim elapsed clock (load label
//    "ambient", no production/freight authority), and the status lamp flashes
//    "trading" only when g.stats.sold ACTUALLY increased since the last step
//    (simulation.js sell() is the only writer of that counter).
import {BLUEPRINTS,CELL,WORLD_SIZE} from "./content.js";
import {bayCells} from "./gridOccupancy.js";
import {machineStatus,timerDelta,STATUS_MATERIALS} from "./art03.js";

export const ART04_TYPES=Object.freeze(["depot","market","research","fabricator"]);

// Motion constants — voxelSchema.js pivot declarations mirror these EXACTLY.
// Angles are radians per unit of SIM work clock (never wall time). The market
// channels run on an AMBIENT clock (g.elapsed deltas, labelled, no authority).
export const ART04_MOTION=Object.freeze({
 dishSpeed:.5,          // research azimuth dish sweep (axis y, working only)
 feedAmp:.16,feedSpeed:.7,   // research feed-horn nod (axis x, nested in dish)
 gearSpeed:1.6,         // fabricator drive gear (axis z, working only)
 pinionSpeed:3.2,       // fabricator pinion, counter-rotating at the 2:1 radius ratio
 hammerAmp:.45,hammerSpeed:1.1, // fabricator trip hammer (axis x, oscillate)
 scaleAmp:.12,scaleSpeed:.5,    // market balance beam (axis z, AMBIENT)
 awningAmp:.05,awningSpeed:.8   // market awning flutter (axis x, AMBIENT)
});

// Dock shutter travel contract (depot). Distance is world units from the truck
// to this depot's bay approach cell center; the shutter lifts linearly between
// `far` (closed) and `near` (fully open). Reduced motion parks it CLOSED.
export const ART04_DOCK=Object.freeze({near:2.5,far:7,travel:.8});

// Discrete shared-material swaps per derived status. "docking"/"trading" are
// real observable events (truck at the bay / a completed sale), never timers.
// Hot process surfaces reuse the ART-03 STATUS_MATERIALS table; civic events
// keep their shells cold ("dark") — a lamp is not a furnace.
export const ART04_STATUS_LIGHT=Object.freeze({
 docking:"lights",trading:"lights",
 working:"lights",starved:"statusStarved",unpowered:"statusDead",
 assembling:"lights",idle:"statusIdle"
});
export const art04HotMaterial=(status)=>STATUS_MATERIALS[status]?.hot||"dark";

// Distance from the nearest REAL freight truck to this building's bay approach
// cell center (first bay cell — 1x1 footprints have exactly one). Pure: reads
// only g.vehicles positions and the occupancy contract, never mutates state.
export function bayApproachDistance(g,b){
 const bay=bayCells(b.type,b.x,b.z,b.rot||0)[0];
 const bx=(bay.x-WORLD_SIZE/2+.5)*CELL,bz=(bay.z-WORLD_SIZE/2+.5)*CELL;
 let distance=Infinity;
 for(const v of g.vehicles||[]){
  const d=Math.hypot((v.x-WORLD_SIZE/2+.5)*CELL-bx,(v.z-WORLD_SIZE/2+.5)*CELL-bz);
  if(d<distance)distance=d;
 }
 return {distance,bay:{x:bx,z:bz}};
}

// One integration step of a rig's work clock. Returns a NEW state object plus
// the derived status/load/advance so callers (and tests) assert exactly what the
// renderer will apply. reducedMotion parks the clock but keeps tracking sim
// timers/elapsed/sold, so re-enabling motion never jumps.
export function art04Advance(state,g,b,reducedMotion=false){
 const d=BLUEPRINTS[b.type];
 const elapsed=g.elapsed||0;
 const sold=Number(g.stats?.sold||0);
 let status="idle",advance=0,load=0,truckDistance=null;
 if(b.type==="depot"){
  truckDistance=bayApproachDistance(g,b).distance;
  status=truckDistance<=ART04_DOCK.near?"docking":"idle";
 }else if(b.type==="market"){
  status=sold>(state.lastSold??sold)+1e-7?"trading":"idle";
  load=1; // AMBIENT decoration clock — labelled, no production authority (#274)
  advance=Math.max(0,elapsed-(state.lastElapsed??elapsed));
 }else if(d&&d.cycle>0){
  status=machineStatus(g,b);
  if(status==="working")advance=timerDelta(state.lastTimer,b.timer||0,d.cycle);
 }
 return {status,load,advance,
  clock:reducedMotion?(state.clock||0):(state.clock||0)+advance,
  lastTimer:b.timer||0,lastElapsed:elapsed,lastSold:sold,truckDistance};
}

// Pure pose: every named pivot angle from the work clock. Reduced motion parks
// ALL channels at zero (status colours still apply — they are not motion).
export function art04Pose(clock,reducedMotion=false,id=0){
 if(reducedMotion)return {dish:0,feed:0,gear:0,pinion:0,hammer:0,scale:0,awning:0};
 const M=ART04_MOTION;
 return {
  dish:clock*M.dishSpeed,
  feed:Math.sin(clock*M.feedSpeed+id)*M.feedAmp,
  gear:clock*M.gearSpeed,
  pinion:-clock*M.pinionSpeed,
  hammer:Math.sin(clock*M.hammerSpeed+id)*M.hammerAmp,
  scale:Math.sin(clock*M.scaleSpeed+id)*M.scaleAmp,
  awning:Math.sin(clock*M.awningSpeed+id)*M.awningAmp
 };
}

// Dock shutter lift from the nearest real truck distance (depot only). Pure,
// monotone, bounded by ART04_DOCK.travel; reduced motion parks it closed.
export function depotDoorLift(distance,reducedMotion=false){
 if(reducedMotion)return 0;
 const D=ART04_DOCK;
 if(!(distance<=D.far))return 0; // Infinity (no trucks) => closed
 if(distance<=D.near)return D.travel;
 return D.travel*(D.far-distance)/(D.far-D.near);
}
