// ART-03 (#349): pure simulation-status + motion contract for the four industrial
// rigs (turbine generator, induction furnace, fuel refinery, alloy foundry).
// No THREE, no DOM — the SAME functions are called by world.js update() and by
// tests/art03Models.test.mjs, so the tested pose/status is the rendered one.
//
// Authority (#274 honesty): powered / starved / working is derived ONLY from the
// simulation state — powerStatus(g) for the grid and an inputs-fit check against
// the machine's real inventory (same epsilon as simulation.js fits). No wall
// clock, no hardcoded production timers: work clocks integrate wrap-aware
// b.timer deltas (cycling machines) or g.elapsed deltas scaled by the real grid
// load fraction (generator). An unpowered machine's sim timer is frozen, so its
// pivots freeze; a starved machine's sim timer still advances but it produces
// nothing, so its work clock deliberately does NOT advance — smoke and hot
// surfaces are gated on the derived status, never on the raw timer.
import {BLUEPRINTS} from "./content.js";
import {powerStatus} from "./simulation.js";

export const ART03_TYPES=Object.freeze(["generator","furnace","refinery","foundry"]);

// Motion constants — voxelSchema.js pivot declarations mirror these EXACTLY.
// Angles are radians per unit of SIM work clock (never wall time).
export const ART03_MOTION=Object.freeze({
 fanSpeed:2.2,        // generator roof fan (axis y)
 turbineSpeed:3.4,    // generator front turbine (axis z, counter-rotating)
 blowerSpeed:2.6,     // furnace side blower (axis x)
 chargeAmp:.5,chargeSpeed:1.2,   // furnace charging flap (axis x, oscillate)
 crucibleAmp:.42,crucibleSpeed:.85, // foundry tilting crucible (axis x)
 foundryFanSpeed:2,   // foundry roof extractor (axis y)
 pumpSpeed:2.4,       // refinery pump flywheel (axis x)
 valveAmp:.6,valveSpeed:.9,      // refinery valve handwheel (axis y, oscillate)
 pulseAmp:.009,pulseSpeed:5      // furnace/foundry heat pulse on group.scale.y
});

// Emission puffs: a few shared-material boxes per emit point, phased off the
// work clock. Rise + shrink only (no per-mesh opacity clones — material pool
// ownership stays with world.js mats).
export const ART03_SMOKE=Object.freeze({speed:.55,rise:1.1,count:2,base:.22});

// Discrete shared-material swaps per derived status. "hot" covers every named
// process surface (status:window / status:glow / status:ingot); the light is the
// ART-01 status:light node. Assembling keeps the legacy mint light + cold shell.
export const STATUS_MATERIALS=Object.freeze({
 working:{light:"lights",hot:"furnace"},
 starved:{light:"statusStarved",hot:"ember"},
 unpowered:{light:"statusDead",hot:"dark"},
 assembling:{light:"lights",hot:"dark"},
 idle:{light:"statusIdle",hot:"dark"}
});

// Mirrors simulation.js fits() epsilon exactly (stock is clamped >= 0 there).
const stock=(bag,id)=>Math.max(0,Number(bag?.[id]||0));
export const inputsFit=(bag,need)=>Object.entries(need||{}).every(([id,n])=>stock(bag,id)+1e-7>=n);

// Derived runtime status — the ONLY source of truth for rig visuals.
// Precedence matches the inspector: assembly first, then grid power, then
// recipe inputs. Utilities without a cycle are "idle" unless they are a
// generator carrying real demand ("working" — blades reflect plant load).
export function machineStatus(g,b){
 const d=BLUEPRINTS[b.type];
 if(!d)return "idle";
 if((b.remaining||0)>0)return "assembling";
 if(!d.cycle){
  if(d.power<0)return powerStatus(g).demand>0?"working":"idle";
  return "idle";
 }
 if(!powerStatus(g).available)return "unpowered";
 if(!inputsFit(b.inventory,d.inputs))return "starved";
 return "working";
}

// Real grid load fraction for the generator (demand/supply, capped at 1).
export function generatorLoad(g){
 const p=powerStatus(g);
 return {demand:p.demand,supply:p.supply,load:p.supply>0?Math.min(1,p.demand/p.supply):0};
}

// Wrap-aware sim-timer delta. simulation.js does b.timer %= d.cycle on wrap, so
// a negative raw delta means exactly one wrap; anything else (reset, rebuild,
// teleport) is rejected as 0 rather than fabricating work.
export function timerDelta(prev,cur,cycle){
 if(!(cycle>0))return 0;
 let d=(cur||0)-(prev||0);
 if(d<0)d+=cycle;
 if(d<0||d>=cycle)return 0;
 return d;
}

// One integration step of a rig's work clock. Returns a NEW state object plus
// the derived status/load/advance so callers (and tests) can assert exactly what
// the renderer will apply. reducedMotion parks the clock but keeps tracking the
// sim timers, so re-enabling motion never jumps.
export function art03Advance(state,g,b,reducedMotion=false){
 const d=BLUEPRINTS[b.type];
 const status=machineStatus(g,b);
 const elapsed=g.elapsed||0;
 let advance=0,load=0;
 if(d&&d.cycle>0){
  if(status==="working")advance=timerDelta(state.lastTimer,b.timer||0,d.cycle);
 }else if(d&&d.power<0){
  load=generatorLoad(g).load;
  if(status==="working")advance=Math.max(0,elapsed-(state.lastElapsed??elapsed))*load;
 }
 return {status,load,advance,
  clock:reducedMotion?(state.clock||0):(state.clock||0)+advance,
  lastTimer:b.timer||0,lastElapsed:elapsed};
}

// Pure pose: every named pivot angle from the work clock. Reduced motion parks
// ALL channels at zero (status colours still apply — they are not motion).
export function art03Pose(clock,reducedMotion=false,id=0){
 if(reducedMotion)return {fan:0,turbine:0,blower:0,charge:0,crucible:0,foundryFan:0,pump:0,valve:0,pulse:0};
 const M=ART03_MOTION;
 return {
  fan:clock*M.fanSpeed,
  turbine:-clock*M.turbineSpeed,
  blower:clock*M.blowerSpeed,
  charge:Math.sin(clock*M.chargeSpeed+id)*M.chargeAmp,
  crucible:Math.sin(clock*M.crucibleSpeed+id)*M.crucibleAmp,
  foundryFan:clock*M.foundryFanSpeed,
  pump:clock*M.pumpSpeed,
  valve:Math.sin(clock*M.valveSpeed+id)*M.valveAmp,
  pulse:Math.sin(clock*M.pulseSpeed+id)*M.pulseAmp
 };
}

// One puff's rise/shrink from the emission phase (work-clock cycles). Pure and
// periodic: t wraps in [0,1), y rises, scale shrinks — deterministic, no random.
export function smokePuff(phase,i,count=ART03_SMOKE.count){
 const t=((phase+i/count)%1+1)%1;
 return {y:t*ART03_SMOKE.rise,s:ART03_SMOKE.base*(1-.55*t)};
}