// ---------------------------------------------------------------------------
// #590 (G1 "more stuff" + no-overlap): decorative yard-crew simulation.
// PURE DATA module — no THREE, no timers, no DOM, no simulation authority.
// Deterministic given (seed, dt sequence, env inputs); headlessly testable.
// world.js consumes the output poses; the economy never reads this module.
// Authority contract: every rig stays "none — decorative yard crew (#274)".
// Crew never carries cargo, never picks/drops freight, never mutates the game.
//
// Motion model:
//  - Walkers ping-pong along maintenance-alley segments (yardSceneryPlan
//    alleys). Limb swing is a pure function of travelled distance, so it
//    freezes naturally when dt=0 or under prefers-reduced-motion.
//  - Clearance is enforced every step against the LIVE truck envelope
//    (conservative circumscribed radius), the forklift, and other walkers.
//    Yielding = retreat along the walker's own segment out of the threat's
//    forbidden interval; lower index has right-of-way (no deadlock cycles).
//  - Per-step displacement is bounded by declared constants (anti-teleport).
//  - The forklift shuttles decoratively along the depot bay apron and parks
//    at FORKLIFT_POST when the shuttle is blocked; it never carries a load.
//  - The drone flies CONTINUOUSLY (velocity-limited follow, cruise altitude
//    above the tallest machine) to the real active-cycle anchor or the pad.
//    No position snaps: max step <= CROWD_MOTION.maxDroneStep at dt<=0.07.
//  - Visibility is rebuild-only (sceneryConflicts convention): a segment is
//    hidden when any of its cells becomes road/footprint or a volumetric
//    scenery piece overlaps its corridor. Bay aprons are NOT blockers —
//    walkers intentionally cross them (machines cannot build on bays).
// ---------------------------------------------------------------------------
import {CELL, WORLD_SIZE, STARTER_BUILDINGS} from "./content.js";
import {key, footprintCells} from "./gridOccupancy.js";

const origin = (i) => (i - WORLD_SIZE / 2 + 0.5) * CELL;

export const CROWD_MOTION = Object.freeze({
  workerSpeed: 1.15,          // base world units / sim second
  workerSpeedJitter: 0.08,    // per-seed +/- fraction
  forkliftSpeed: 0.9,
  retreatSpeed: 1.25,         // yield back-away speed (>= max worker speed)
  droneSpeed: 6.5,            // max cruise speed, world units / sim second
  droneFollowGain: 2.2,       // v = min(droneSpeed, distance * gain)
  droneCruiseY: 9.0,          // cruise altitude (tallest machine 6.8 -> 4.0x1.7 ratio)
  droneArriveRadius: 0.35,
  strideFreq: 7.5,            // limb radians per world unit travelled
  legSwing: 0.5,
  armSwing: 0.4,
  workerRadius: 0.5,          // conservative circumscribed ground radius
  laneOffset: 0.6,            // shared-segment walkers use opposite lanes;
                              // lane gap 1.2 > 2*workerRadius+margin (1.12),
                              // so crew pass each other without overlap
  forkliftRadius: 0.75,
  truckRadius: 1.2,           // >= hypot(0.6, 1.025) = 1.188 (any heading)
  droneRadius: 0.55,
  clearanceMargin: 0.12,
  crossingLookahead: 3.5,     // lower-index walker within this distance of a
                              // shared intersection activates a CONSTANT
                              // waiting interval for the higher-index walker
  crossingPad: 0.15,          // wait radius = hardR + laneOffset + crossingPad
  // Declared per-step displacement bounds at the App's dt clamp (<=0.07 s).
  maxWorkerStep: 0.09,        // retreatSpeed 1.25 * 0.07 = 0.0875
  maxForkliftStep: 0.07,      // forkliftSpeed 0.9 * 0.07 = 0.063
  maxDroneStep: 0.5           // droneSpeed 6.5 * 0.07 = 0.455
});

// Maintenance-alley patrol segments (cell ranges inclusive; endpoints at cell
// centers). Alleys come from yardSceneryPlan: z=10 & z=14 for x 6..18 (skip
// the x=11 road), x=8 for z 9..16 (skip the z=12 road). The z=10 east segment
// starts at cell 14 so walkers never cross the forklift shuttle apron.
//
// #599 (G1 "I want to see more stuff"): seven road-adjacent perimeter corridors
// spread patrols across the north/south/east/west edges so no large empty region
// remains on first arrival. They sit on cells terrainFor() grades to pad because
// they neighbour a road (road 4-neighbours are always rock-free), so volumetric
// dressing never hides them on ANY seed (probe: scripts/probe-599-density.mjs).
// Indices 0..5 are the original alleys — preserved so existing crossing pairs and
// visibility tests stay valid. The new corridors create ZERO new centerline
// crossings (none intersect the alleys or each other).
const SEGMENT_DEFS = Object.freeze([
  {id: "alley-z10-w", x0: 6,  z0: 10, x1: 10, z1: 10, walkers: 2},
  {id: "alley-z10-e", x0: 14, z0: 10, x1: 18, z1: 10, walkers: 2},
  {id: "alley-z14-w", x0: 6,  z0: 14, x1: 10, z1: 14, walkers: 2},
  {id: "alley-z14-e", x0: 12, z0: 14, x1: 18, z1: 14, walkers: 2},
  {id: "alley-x8-n",  x0: 8,  z0: 9,  x1: 8,  z1: 11, walkers: 1},
  {id: "alley-x8-s",  x0: 8,  z0: 13, x1: 8,  z1: 16, walkers: 1},
  {id: "north-z7-w",  x0: 6,  z0: 7,  x1: 10, z1: 7,  walkers: 1},
  {id: "north-z7-e",  x0: 12, z0: 7,  x1: 13, z1: 7,  walkers: 1},
  {id: "south-z18-w", x0: 6,  z0: 18, x1: 10, z1: 18, walkers: 2},
  {id: "south-z18-m", x0: 12, z0: 18, x1: 13, z1: 18, walkers: 2},
  {id: "south-z18-e", x0: 16, z0: 18, x1: 18, z1: 18, walkers: 2},
  {id: "east-x20",    x0: 20, z0: 9,  x1: 20, z1: 16, walkers: 2},
  {id: "west-x4",     x0: 4,  z0: 9,  x1: 4,  z1: 16, walkers: 2}
]);

// #599: stationary-but-animated station crew. Each tends a real starter machine
// (or queues at the depot / clerks the market). Position is fixed; limbs swing on
// the sim clock via stationPose(), freezing at dt=0 / reduced motion. They are
// HARD separation threats to walkers and the forklift (never the reverse — crew
// yields to station crew just as it yields to lower-index walkers). A station
// hides when its cell becomes road/footprint, volumetric dressing reaches it, or
// its anchor machine is dismantled. There is no scale house in V2 content; the
// depot queue + market clerk are the honest standing-population substitutes.
const STATION_DEFS = Object.freeze([
  {id: "salvager-tender",  x: 6,  z: 9,  building: "salvager"},
  {id: "depot-queue-1",    x: 14, z: 9,  building: "depot"},
  {id: "depot-queue-2",    x: 15, z: 9,  building: "depot"},
  {id: "depot-queue-3",    x: 16, z: 9,  building: "depot"},
  {id: "furnace-tender",   x: 17, z: 13, building: "furnace"},
  {id: "generator-tender", x: 6,  z: 16, building: "generator"},
  {id: "crane-tender",     x: 14, z: 7,  building: "crane"},
  {id: "market-clerk",     x: 14, z: 18, building: "market"}
]);

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

// Default post/pad derive from the same content formulas world.js uses
// (FORKLIFT_POST / DRONE_PAD); tests assert the two sources agree.
function defaultForkliftPost() {
  const depot = STARTER_BUILDINGS.find((b) => b.type === "depot");
  return {x: origin(depot.x) - 1.2, z: origin(depot.z + 1) + 0.2, rotY: 0, bayCell: {x: depot.x, z: depot.z + 1}};
}
const DEFAULT_PAD = Object.freeze({x: -47.5, y: 5.9, z: -23});

function segmentCells(def) {
  const out = [];
  for (let x = def.x0; x <= def.x1; x++) for (let z = def.z0; z <= def.z1; z++) out.push([x, z]);
  return out;
}

// Pure deterministic plan. Same seed -> byte-identical JSON.
export function crowdPlan(seed, opts = {}) {
  const s = Number(seed) >>> 0;
  const rand = seeded(s ^ 0x590c0de);
  const post = opts.forkliftPost || defaultForkliftPost();
  const pad = opts.dronePad || DEFAULT_PAD;
  const segments = SEGMENT_DEFS.map((def) => {
    const ax = origin(def.x0), az = origin(def.z0), bx = origin(def.x1), bz = origin(def.z1);
    const len = Math.hypot(bx - ax, bz - az);
    return {id: def.id, ax, az, bx, bz, ux: (bx - ax) / len, uz: (bz - az) / len, len, cells: segmentCells(def)};
  });
  const walkers = [];
  segments.forEach((seg, si) => {
    const n = SEGMENT_DEFS[si].walkers;
    for (let k = 0; k < n; k++) {
      const phase = seg.len * ((k + 0.5) / n) + seg.len * 0.15 * (rand() * 2 - 1);
      walkers.push({
        seg: si,
        s: Math.min(seg.len, Math.max(0, phase)),
        dir: rand() > 0.5 ? 1 : -1,
        // Opposite lanes on shared segments let crew pass without overlap;
        // single-walker segments walk the centerline.
        lane: n > 1 ? (k % 2 === 0 ? -1 : 1) * CROWD_MOTION.laneOffset : 0,
        speed: CROWD_MOTION.workerSpeed * (1 + CROWD_MOTION.workerSpeedJitter * (rand() * 2 - 1))
      });
    }
  });
  // Shuttle: post -> one cell west along the bay apron (cell 12,10).
  const fa = {x: post.x, z: post.z};
  const fb = {x: post.x - CELL + 0.5, z: post.z};
  const flen = Math.hypot(fb.x - fa.x, fb.z - fa.z);
  const forklift = {
    ax: fa.x, az: fa.z, bx: fb.x, bz: fb.z,
    ux: (fb.x - fa.x) / flen, uz: (fb.z - fa.z) / flen, len: flen,
    post: {x: post.x, z: post.z, rotY: post.rotY || 0},
    cells: [[post.bayCell.x, post.bayCell.z], [post.bayCell.x - 1, post.bayCell.z]]
  };
  // Precompute centerline intersections between segment pairs. At a shared
  // crossing the higher-index walker waits against a CONSTANT interval (see
  // stepCrowd) — a live sqrt forbidden-interval boundary has diverging
  // velocity as the threat enters the perpendicular band, which outruns the
  // anti-teleport retreat cap and allows interpenetration.
  const crossings = [];
  const crossingMap = {};
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const a = segments[i], b = segments[j];
    const denom = a.ux * b.uz - a.uz * b.ux;
    if (Math.abs(denom) < 1e-9) continue; // parallel
    const rx = b.ax - a.ax, rz = b.az - a.az;
    const t = (rx * b.uz - rz * b.ux) / denom;
    const q = (rx * a.uz - rz * a.ux) / denom;
    if (t < 0 || t > a.len || q < 0 || q > b.len) continue;
    const c = {a: i, b: j, x: a.ax + a.ux * t, z: a.az + a.uz * t, sa: t, sb: q};
    crossings.push(c);
    crossingMap[i + ":" + j] = c;
  }
  // #599: station crew face their anchor machine; phase is seeded AFTER the
  // walkers so existing walker phases/determinism are untouched.
  const stations = STATION_DEFS.map((def) => {
    const anchor = STARTER_BUILDINGS.find((b) => b.type === def.building);
    const x = origin(def.x), z = origin(def.z);
    const heading = Math.atan2(origin(anchor.x) - x, origin(anchor.z) - z);
    return {id: def.id, x, z, heading, phase: rand() * Math.PI * 2,
      cell: [def.x, def.z], building: def.building, anchor: [anchor.x, anchor.z]};
  });
  return {seed: s, segments, walkers, stations, forklift, pad: {x: pad.x, y: pad.y, z: pad.z}, crossings, crossingMap};
}

// Hard center distance for walker-walker clearance (physical radius + margin
// + a small numerical pad so boundary commits never measure under margin).
function walkerHardR() {
  return CROWD_MOTION.workerRadius * 2 + CROWD_MOTION.clearanceMargin + 0.02;
}
// Constant waiting radius at an intersection: covers the lower walker's
// lateral lane offset so clearance holds on BOTH sides of the crossing.
function crossingWaitR() {
  return walkerHardR() + CROWD_MOTION.laneOffset + CROWD_MOTION.crossingPad;
}
// The crossing record for a walker pair (lower-seg index first), or null.
function crossingFor(plan, segA, segB) {
  const lo = Math.min(segA, segB), hi = Math.max(segA, segB);
  return plan.crossingMap[lo + ":" + hi] || null;
}
// A crossing waits only while the lower walker is APPROACHING within the
// lookahead, or is already close (release radius covers its lane offset on
// both sides). Direction-aware activation keeps the intersection walkers
// flowing instead of pinned: a lower walker moving away past the release
// radius can no longer reach the higher walker's path before the higher
// walker clears, because direction only reverses at segment ends, which are
// farther than the lookahead from every intersection. Pure function of the
// current state -> deterministic, no hidden memory.
function crossingActive(plan, c, o) {
  const odx = c.x - o.x, odz = c.z - o.z;
  const od = Math.hypot(odx, odz);
  if (od < crossingWaitR() + CROWD_MOTION.laneOffset) return true;
  const seg = plan.segments[o.seg];
  const approaching = (seg.ux * o.dir * odx + seg.uz * o.dir * odz) > 0;
  return od < CROWD_MOTION.crossingLookahead && approaching;
}

// Lane-aware world position on a segment (perp = (-uz, ux)).
function walkerPos(seg, s, lane) {
  return {x: seg.ax + seg.ux * s - seg.uz * lane, z: seg.az + seg.uz * s + seg.ux * lane};
}

export function createCrowdState(plan) {
  const walkers = plan.walkers.map((w) => {
    const seg = plan.segments[w.seg];
    const p = walkerPos(seg, w.s, w.lane);
    return {
      seg: w.seg, s: w.s, dir: w.dir, lane: w.lane, speed: w.speed, dist: 0,
      x: p.x, z: p.z,
      heading: Math.atan2(seg.ux * w.dir, seg.uz * w.dir), hidden: false
    };
  });
  // Seed jitter can phase walkers from DIFFERENT segments near a shared
  // intersection; relax the initial layout deterministically so every pair
  // starts outside the hard physical radius (same-segment pairs are already
  // separated by their opposite lanes). The step loop preserves the invariant.
  const hardR = CROWD_MOTION.workerRadius * 2 + CROWD_MOTION.clearanceMargin;
  const waitR = crossingWaitR();
  for (let pass = 0; pass < 12; pass++) {
    let moved = false;
    for (let i = 0; i < walkers.length; i++) for (let j = i + 1; j < walkers.length; j++) {
      const a = walkers[i], b = walkers[j];
      if (a.seg === b.seg) continue;
      if (Math.hypot(a.x - b.x, a.z - b.z) >= hardR + 0.05) continue;
      const seg = plan.segments[b.seg];
      const tryS = (v) => {
        const cs = Math.min(seg.len, Math.max(0, v));
        const p = walkerPos(seg, cs, b.lane);
        return {cs, d: Math.hypot(a.x - p.x, a.z - p.z), p};
      };
      const plus = tryS(b.s + hardR + 0.1), minus = tryS(b.s - hardR - 0.1);
      const best = plus.d >= minus.d ? plus : minus;
      if (best.d <= Math.hypot(a.x - b.x, a.z - b.z) + 1e-9) continue;
      b.s = best.cs; b.x = best.p.x; b.z = best.p.z;
      moved = true;
    }
    // Seeded phases can also start a higher-segment walker INSIDE an active
    // crossing waiting interval; push it to the nearer constant boundary so
    // the step-loop invariant holds from frame zero.
    for (const c of plan.crossings) {
      const active = walkers.some((w) => w.seg === c.a && crossingActive(plan, c, w));
      if (!active) continue;
      const seg = plan.segments[c.b];
      for (const w of walkers) {
        if (w.seg !== c.b) continue;
        const lo = c.sb - waitR, hi = c.sb + waitR;
        if (w.s <= lo || w.s >= hi) continue;
        const target = w.s < c.sb ? lo : hi;
        w.s = Math.min(seg.len, Math.max(0, target));
        const p = walkerPos(seg, w.s, w.lane);
        w.x = p.x; w.z = p.z;
        moved = true;
      }
    }
    if (!moved) break;
  }
  // #599: station crew are fixed threats — relax walkers off any station they
  // were seeded inside, along their own segment, so frame zero already clears
  // the hard radius the step loop enforces.
  const stations = (plan.stations || []).map((st) => ({
    id: st.id, x: st.x, z: st.z, heading: st.heading, phase: st.phase,
    cell: st.cell, building: st.building, anchor: st.anchor, hidden: false
  }));
  for (let pass = 0; pass < 12; pass++) {
    let moved = false;
    for (const w of walkers) {
      const seg = plan.segments[w.seg];
      for (const st of stations) {
        if (Math.hypot(w.x - st.x, w.z - st.z) >= hardR + 0.05) continue;
        const tryS = (v) => {
          const cs = Math.min(seg.len, Math.max(0, v));
          const p = walkerPos(seg, cs, w.lane);
          return {cs, d: Math.hypot(st.x - p.x, st.z - p.z), p};
        };
        const plus = tryS(w.s + hardR + 0.1), minus = tryS(w.s - hardR - 0.1);
        const best = plus.d >= minus.d ? plus : minus;
        if (best.d <= Math.hypot(w.x - st.x, w.z - st.z) + 1e-9) continue;
        w.s = best.cs; w.x = best.p.x; w.z = best.p.z;
        moved = true;
      }
    }
    if (!moved) break;
  }
  const f = plan.forklift;
  return {
    elapsed: 0,
    walkers,
    stations,
    forklift: {s: 0, dir: -1, dist: 0, x: f.ax, z: f.az, heading: f.post.rotY, hidden: false, shuttle: true},
    drone: {x: plan.pad.x, y: plan.pad.y, z: plan.pad.z, mode: "parked", rotor: 0, bob: 0, targetId: "none"}
  };
}

// --- geometry helpers -------------------------------------------------------
function distToSegment(px, pz, seg) {
  const dx = px - seg.ax, dz = pz - seg.az;
  const t = Math.min(seg.len, Math.max(0, dx * seg.ux + dz * seg.uz));
  const cx = seg.ax + seg.ux * t, cz = seg.az + seg.uz * t;
  return {d: Math.hypot(px - cx, pz - cz), t};
}

// Resolve s against the UNION of all threat forbidden intervals on the
// segment (single-threat sequential pushes can re-enter an earlier interval
// when two threats straddle the path). lane is the walker's signed perp
// offset, so intervals are computed against the walker's ACTUAL path.
// Returns the nearest allowed s (clamped to [0, len]); caller caps the step.
// threats: [{x, z, r}] world coords + safe center distance, or precomputed
// constant intervals {lo, hi} (crossing waiting zones).
function resolveClearance(s, seg, lane, threats) {
  const ivs = [];
  for (const t of threats) {
    if (t.lo !== undefined) { ivs.push([t.lo, t.hi]); continue; }
    const dx = t.x - seg.ax, dz = t.z - seg.az;
    const st = dx * seg.ux + dz * seg.uz;
    const perp = Math.abs(-dx * seg.uz + dz * seg.ux - lane);
    if (perp >= t.r) continue;
    const half = Math.sqrt(Math.max(0, t.r * t.r - perp * perp));
    ivs.push([st - half, st + half]);
  }
  if (!ivs.length) return s;
  ivs.sort((a, b) => a[0] - b[0]);
  const merged = [ivs[0].slice()];
  for (let k = 1; k < ivs.length; k++) {
    const last = merged[merged.length - 1];
    if (ivs[k][0] <= last[1]) last[1] = Math.max(last[1], ivs[k][1]);
    else merged.push(ivs[k].slice());
  }
  const inside = (v) => merged.some(([lo, hi]) => v > lo && v < hi);
  if (!inside(s)) return s;
  const cands = [0, seg.len];
  for (const [lo, hi] of merged) cands.push(lo, hi);
  let best = null, bd = Infinity;
  for (const c of cands) {
    const cc = Math.min(seg.len, Math.max(0, c));
    if (inside(cc)) continue;
    const d = Math.abs(cc - s);
    if (d < bd - 1e-12 || (Math.abs(d - bd) <= 1e-12 && (best === null || cc < best))) { bd = d; best = cc; }
  }
  return best === null ? s : best;
}

function bounce(s, dir, len) {
  if (s < 0) return {s: -s, dir: 1};
  if (s > len) return {s: 2 * len - s, dir: -1};
  return {s, dir};
}

// --- per-step simulation ----------------------------------------------------
// env = {trucks: [{x,z}] world coords, anchor: {x,y,z,id}|null, reduced: bool}
// Mutates and returns state. Deterministic; never touches the game object.
export function stepCrowd(state, plan, dt, env) {
  state.elapsed += dt;
  if (dt <= 0 || env.reduced) {
    if (env.reduced) { state.drone.rotor = 0; state.drone.bob = 0; }
    return state;
  }
  const M = CROWD_MOTION;
  const trucks = env.trucks || [];
  const maxW = M.retreatSpeed * dt;

  // Walkers in index order. Same-segment crew use opposite lanes (gap 1.2 >
  // hardR) so they pass freely — no queue locks. Cross-segment intersections
  // use strict index priority: the higher index retreats along its own
  // segment out of the lower index's hard radius and tracks that moving
  // boundary. The boundary moves at most one lower-index step per frame
  // (<= maxWorkerStep), exactly the retreat cap, so the hard-radius invariant
  // holds inductively from the relaxed initial layout — no brake, no deadlock
  // (index 0 never yields to walkers, so right-of-way always drains). Trucks
  // and the forklift are hard threats for everyone; all retreats step-capped.
  const hardR = M.workerRadius * 2 + M.clearanceMargin + 0.02;
  for (let i = 0; i < state.walkers.length; i++) {
    const w = state.walkers[i];
    if (w.hidden) continue;
    const seg = plan.segments[w.seg];
    const prev = w.s;
    let cand = bounce(w.s + w.dir * w.speed * dt, w.dir, seg.len);
    let s = cand.s, dir = cand.dir;
    // All threats resolved as ONE interval union (sequential pushes can
    // re-enter an earlier interval when two threats straddle the path).
    const threats = [];
    for (const t of trucks) threats.push({x: t.x, z: t.z, r: M.truckRadius + M.workerRadius + M.clearanceMargin});
    if (!state.forklift.hidden) {
      const f = state.forklift;
      threats.push({x: f.x, z: f.z, r: M.forkliftRadius + M.workerRadius + M.clearanceMargin});
    }
    // #599: stationary station crew are hard threats at the walker hard radius.
    for (const st of state.stations || []) {
      if (st.hidden) continue;
      threats.push({x: st.x, z: st.z, r: hardR});
    }
    // Cross-segment walkers: lower indices resolved first (right-of-way).
    // At a shared crossing, once the lower walker is within the lookahead we
    // wait against a CONSTANT interval centered on the intersection instead
    // of its live position: the live sqrt boundary's velocity diverges as the
    // threat enters the perpendicular band and outruns the retreat cap. The
    // constant boundary is reachable in waitR/retreatSpeed ~1.5 s while the
    // lower walker needs >= D/maxSpeed ~2.8 s to arrive, and waitR covers its
    // lane offset on both sides. Lower indices never yield -> no deadlock.
    for (let j = 0; j < i; j++) {
      const o = state.walkers[j];
      if (o.hidden || o.seg === w.seg) continue;
      const c = crossingFor(plan, w.seg, o.seg);
      if (c && crossingActive(plan, c, o)) {
        threats.push({lo: c.sb - crossingWaitR(), hi: c.sb + crossingWaitR()});
      } else {
        threats.push({x: o.x, z: o.z, r: hardR});
      }
    }
    s = resolveClearance(s, seg, w.lane, threats);
    // Cap displacement (anti-teleport), then commit.
    const ds = Math.min(maxW, Math.max(-maxW, s - prev));
    w.s = prev + ds;
    w.dir = dir;
    const np = walkerPos(seg, w.s, w.lane);
    w.x = np.x; w.z = np.z;
    if (Math.abs(ds) > 1e-9) {
      w.dist += Math.abs(ds);
      w.heading = Math.atan2(seg.ux * Math.sign(ds), seg.uz * Math.sign(ds));
    }
  }

  // Forklift: lowest priority — yields to trucks and all walkers.
  const f = state.forklift;
  if (!f.hidden) {
    const fl = plan.forklift;
    if (f.shuttle) {
      const prev = f.s;
      let cand = bounce(f.s + f.dir * M.forkliftSpeed * dt, f.dir, fl.len);
      const threats = [];
      for (const t of trucks) threats.push({x: t.x, z: t.z, r: M.truckRadius + M.forkliftRadius + M.clearanceMargin});
      for (const w of state.walkers) {
        if (w.hidden) continue;
        threats.push({x: w.x, z: w.z, r: M.workerRadius + M.forkliftRadius + M.clearanceMargin});
      }
      // #599: the forklift yields to station crew too (lowest priority).
      for (const st of state.stations || []) {
        if (st.hidden) continue;
        threats.push({x: st.x, z: st.z, r: M.workerRadius + M.forkliftRadius + M.clearanceMargin});
      }
      const s = resolveClearance(cand.s, fl, 0, threats);
      const ds = Math.min(M.forkliftSpeed * dt, Math.max(-M.forkliftSpeed * dt, s - prev));
      f.s = prev + ds;
      f.dir = cand.dir;
      f.x = fl.ax + fl.ux * f.s;
      f.z = fl.az + fl.uz * f.s;
      if (Math.abs(ds) > 1e-9) {
        f.dist += Math.abs(ds);
        f.heading = Math.atan2(fl.ux * Math.sign(ds), fl.uz * Math.sign(ds));
      } else if (f.s <= 1e-9) {
        f.heading = fl.post.rotY; // parked at the post faces the bay
      }
    } else {
      f.s = 0; f.x = fl.ax; f.z = fl.az; f.heading = fl.post.rotY;
    }
  }

  // Drone: continuous velocity-limited flight. Cruise altitude blends in
  // with horizontal distance so the path never snaps and always clears the
  // tallest machine while in transit. Bob only when hovering at an anchor.
  const d = state.drone;
  const target = env.anchor
    ? {x: env.anchor.x, y: env.anchor.y, z: env.anchor.z, id: env.anchor.id}
    : {x: plan.pad.x, y: plan.pad.y, z: plan.pad.z, id: "none"};
  d.targetId = target.id;
  const hd = Math.hypot(target.x - d.x, target.z - d.z);
  const blend = Math.min(1, Math.max(0, (hd - 1.0) / 2.5));
  const cruiseY = Math.max(M.droneCruiseY, target.y + 1.2);
  const aimY = target.y + (cruiseY - target.y) * blend;
  const dx = target.x - d.x, dy = aimY - d.y, dz = target.z - d.z;
  const dist = Math.hypot(dx, dy, dz);
  const arrived = hd < 1.0 && Math.hypot(target.x - d.x, target.y - d.y, target.z - d.z) < M.droneArriveRadius;
  if (arrived) {
    // #590 finisher: the arrival commit is ALSO step-capped. The follow gain
    // can leave up to ~0.35 u of gap when the arrive radius triggers, and the
    // hover bob adds up to 0.18 u on top — an unclamped snap measured 0.524 u
    // at dt 0.016 (> maxDroneStep 0.5). Clamping the commit keeps the declared
    // anti-teleport bound true on EVERY frame; hover still converges because
    // the bob target moves at 0.234 u/s, far below the cap. Parked snaps are
    // <= droneArriveRadius (0.35) so the pad park remains exact.
    const bob = env.anchor ? Math.sin(state.elapsed * 1.3) * 0.18 : 0;
    const sx = target.x - d.x, sy = target.y + bob - d.y, sz = target.z - d.z;
    const sd = Math.hypot(sx, sy, sz);
    const k = sd > M.maxDroneStep ? M.maxDroneStep / sd : 1;
    d.x += sx * k; d.y += sy * k; d.z += sz * k;
    if (env.anchor) {
      d.mode = "hovering";
      d.bob = bob;
      d.rotor = state.elapsed * 22;
    } else {
      d.mode = "parked";
      d.bob = 0; d.rotor = 0;
    }
  } else {
    d.mode = "flying";
    const v = Math.min(M.droneSpeed, dist * M.droneFollowGain);
    const step = Math.min(M.maxDroneStep, v * dt, dist);
    if (dist > 1e-9) {
      d.x += (dx / dist) * step;
      d.y += (dy / dist) * step;
      d.z += (dz / dist) * step;
    }
    d.bob = 0;
    d.rotor = state.elapsed * 22;
  }
  return state;
}

// Pure limb pose from travelled distance (freezes when distance is constant).
export function workerPose(dist, reduced = false) {
  if (reduced || !(dist > 0)) return {legL: 0, legR: 0, armL: 0, armR: 0};
  const swing = Math.sin(dist * CROWD_MOTION.strideFreq);
  return {
    legL: swing * CROWD_MOTION.legSwing,
    legR: -swing * CROWD_MOTION.legSwing,
    armL: -swing * CROWD_MOTION.armSwing,
    armR: swing * CROWD_MOTION.armSwing
  };
}

// #599: pure station-crew pose from the sim clock + seeded phase. Station crew
// stand still (legs locked) and work with their arms; the pose freezes when the
// clock is constant (dt=0) or under reduced motion, exactly like walkerPose.
export function stationPose(elapsed, phase, reduced = false) {
  if (reduced || !(elapsed > 0)) return {legL: 0, legR: 0, armL: 0, armR: 0};
  const swing = Math.sin(elapsed * 2.2 + phase);
  return {legL: 0, legR: 0, armL: swing * 0.35, armR: -swing * 0.25};
}

// --- rebuild-only visibility conflicts -------------------------------------
// blocked = roads + machine footprints (NOT bays: walkers cross bay aprons).
// Volumetric scenery (props + rubble taller than a flush decal) blocks a
// corridor when its conservative circumscribed AABB reaches it.
export function crowdConflicts(plan, g, sceneryPlan) {
  const M = CROWD_MOTION;
  const blocked = new Set(g.roads);
  for (const b of g.buildings) {
    for (const c of footprintCells(b.type, b.x, b.z, b.rot || 0)) blocked.add(key(c.x, c.z));
  }
  const vols = [];
  if (sceneryPlan) {
    for (const o of sceneryPlan.props || []) vols.push({x: o.x, z: o.z, r: Math.hypot(o.w || 1, o.d || 1) / 2});
    for (const o of sceneryPlan.rubble || []) if ((o.h || 0) > 0.1) vols.push({x: o.x, z: o.z, r: Math.hypot(o.w || 1, o.d || 1) / 2});
  }
  const corridorBlocked = (seg, radius) => {
    for (const [cx, cz] of seg.cells) if (blocked.has(key(cx, cz))) return true;
    for (const v of vols) if (distToSegment(v.x, v.z, seg).d < v.r + radius + M.clearanceMargin) return true;
    return false;
  };
  const segments = plan.segments.map((seg) => corridorBlocked(seg, M.workerRadius + M.laneOffset));
  const fl = plan.forklift;
  const postCellBlocked = blocked.has(key(fl.cells[0][0], fl.cells[0][1]));
  let postVolumetric = false;
  for (const v of vols) {
    if (Math.hypot(v.x - fl.post.x, v.z - fl.post.z) < v.r + M.forkliftRadius + M.clearanceMargin) postVolumetric = true;
  }
  const forklift = postCellBlocked || postVolumetric;
  const shuttle = !forklift && !corridorBlocked(fl, M.forkliftRadius);
  // #599: a station hides when its cell is paved/built, its anchor machine is
  // gone (dismantled), or volumetric dressing reaches its standing radius.
  const stations = (plan.stations || []).map((st) => {
    if (blocked.has(key(st.cell[0], st.cell[1]))) return true;
    if (!g.buildings.some((b) => b.type === st.building && b.x === st.anchor[0] && b.z === st.anchor[1])) return true;
    for (const v of vols) if (Math.hypot(v.x - st.x, v.z - st.z) < v.r + M.workerRadius + M.clearanceMargin) return true;
    return false;
  });
  return {segments, forklift, shuttle, stations};
}