// RUSTWAKE V2 — freight traffic separation (#589, sponsor G1 REJECT).
//
// The defect: moveVehicle interpolated every truck along road-cell CENTRES and
// never read another vehicle, so trucks sharing a cell rendered interpenetrated.
// This module is the whole remedy, expressed as PURE functions (no renderer, no
// three.js) so the separation invariant is testable headlessly:
//
//   1. Right-hand lane offset. Each route is rebuilt as a miter-joined offset
//      polyline (LANE_OFFSET_CELLS to the truck's right of travel). Opposing
//      traffic therefore passes on its own side instead of meeting head-on at a
//      cell centre — the "Two-way traffic lane" promise in content.js, made real.
//      Axis-aligned 90deg turns have an exact miter point P + (r_prev+r_next)*L,
//      so the offset path is continuous: no teleport, no lateral jump at corners.
//
//   2. Forward-only yielding with a deterministic id tie-break. A truck yields
//      only to a truck AHEAD of it along its own heading (dot > 0). When two
//      trucks are mutually ahead (head-on / crossing) or exactly side-by-side,
//      the LOWER vehicle id has right of way. This ORDERS conflicts; it does NOT
//      make the wait-for relation deadlock-free. Same-direction following edges
//      are acyclic (they run downstream along a lane), mutual conflicts are
//      totally ordered by id, and head-on pairs are separated by the lanes — but
//      perpendicular crossing traffic at a saturated intersection can still form
//      a mixed following/mutual wait-for cycle: the id tie-break gives right of
//      way, not progress (the winner can itself be blocked downstream). The
//      bounded reroute recovery below is therefore LOAD-BEARING, not optional —
//      see the #589 recovery block and docs/design/TRAFFIC.md.
//
//   3. Swept-envelope clamping. Before committing a substep the truck's progress
//      is clamped so its real oriented envelope (2.05 x 1.2 world units, axis
//      aligned because headings are 4-neighbour) keeps at least MIN_GAP_WORLD of
//      clearance from every other truck. A truck that must yield respects the
//      blocker's CURRENT envelope plus its full possible step this substep (so
//      the blocker can move freely first); a truck with right of way respects
//      only the yielder's current envelope. End-of-substep separation holds in
//      either update order. The clamp is analytic per axis (no iteration).
//
//   4. Honest queue state. A clamped truck records v.waiting / v.blockedBy so the
//      fleet panel and tests can see a real queue; when the blocker clears the
//      truck resumes from its clamped progress — no reset, no lost cargo.
//
// Scope: simulation freight movers only. Pedestrians/forklift/drone are #590;
// truck manufacturing is #280; the spatial partition is #514. This is the minimum
// honest slice that removes the visible interpenetration, not those systems.
import {CELL} from "./content.js";

// Real truck envelope from createTruck (src/world.js): 1.2 wide x 2.05 long.
// Half-extents in WORLD units; headings are axis aligned so the envelope is an
// AABB (long side along the heading, wide side across it).
export const TRUCK_LENGTH_WORLD = 2.05;
export const TRUCK_WIDTH_WORLD = 1.2;
const HALF_LONG = TRUCK_LENGTH_WORLD / 2 / CELL; // cells, along heading
const HALF_WIDE = TRUCK_WIDTH_WORLD / 2 / CELL;  // cells, across heading

// Declared bumper-to-bumper clearance the invariant guarantees (world units).
export const MIN_GAP_WORLD = 0.3;
const GAP = MIN_GAP_WORLD / CELL; // cells, inflated fully onto the blocker AABB

// Deadlock recovery (#589): forward-only yielding + id tie-breaks remove head-on
// and crossing deadlocks, but a following edge can still feed a mixed wait-for
// cycle at a saturated intersection (measured: three trucks gridlocked the depot
// approach). A truck continuously blocked longer than this re-routes around its
// blocker's cell (obstacle BFS). Normal queues clear in ~1-2s, so this only fires
// on genuine gridlock; it is bounded (one attempt per window) and never teleports
// into another envelope (the new start is separation-checked before committing).
// NOT a universal cycle-breaker: perpendicular crossing cycles at saturated
// intersections remain possible — see docs/design/TRAFFIC.md limitations.
export const WAIT_TIMEOUT_SECONDS = 10;

// Bounded origin-cell sidestep (#596). A blocker parked on the mover's OWN
// origin lane cell cannot be avoided by any route that starts there (every
// candidate lane start lands inside the blocker's envelope — measured 0
// arrivals / 60 s in the constructed dry-yard join-hold). After the normal
// obstacle-BFS reroute fails AND the mover has honestly queued past
// WAIT_TIMEOUT_SECONDS, recovery may SIDE-STEP the origin: enumerate road
// cells at Manhattan distance 1..R from the origin, route from the first one
// whose lane start clears every envelope, and snap the mover there (at most
// R+1 cells of displacement). Route-only: freight, phase and endpoints are
// untouched. R=0 disables the sidestep entirely (the pre-#596 behaviour, used
// as the negative control). This is bounded effort, NOT deadlock-freedom.
export const ORIGIN_RECOVERY_RADIUS_CELLS = 3;

// Right-hand lane offset (cells). MUST be consistent with the SQUARE envelope
// below: opposing lanes clear only if 2*L >= 2*HALF_LONG + GAP = 0.6714 cells.
// The earlier 0.25 (2*L = 0.5) was sized for the slim oriented body and falsely
// queued opposing traffic under the square footprint — measured permanent
// mutual block on the depot row (1 arrival/200 s vs 4 at base). L = 0.35 gives
// 2*L = 0.7 cells = 2.45 world, margin 0.1 world over the square requirement.
// Lateral reach from a road centre: L + HALF_LONG = 2.25 world (straight) /
// L*sqrt2 + HALF_LONG = 2.76 world (miter corner); the yardScenery "truck routes
// stay clear" sweep is the gate on that reach (see tests/yardScenery.test.mjs).
export const LANE_OFFSET_CELLS = 0.35;

const EPS = 1e-9;
const DEFAULT_HEADING = Object.freeze({x: 1, z: 0});

export const headingOf = (v) =>
  (v && v.heading && Number.isFinite(v.heading.x) && Number.isFinite(v.heading.z) &&
   (v.heading.x !== 0 || v.heading.z !== 0)) ? v.heading : DEFAULT_HEADING;

// Right of travel: facing +x (east) the right hand is +z (south); facing +z the
// right hand is -x (west). right(h) = (-h.z, h.x).
const rightOf = (h) => ({x: -h.z, z: h.x});

const segmentHeading = (route, i) => {
  const dx = route[i + 1].x - route[i].x, dz = route[i + 1].z - route[i].z;
  const len = Math.abs(dx) + Math.abs(dz) || 1;
  return {x: dx / len, z: dz / len};
};

// Build the right-hand offset polyline for a cell-centre route. Returns the
// offset waypoints, the per-segment unit headings and the per-segment lengths
// (cells). Interior waypoints use the exact axis-aligned miter P+(r_prev+r_next)*L;
// endpoints offset by their single adjacent heading. Segment lengths stay strictly
// positive (1-2L .. 1+2L with L=LANE_OFFSET_CELLS=0.35 -> 0.3 .. 1.7, derived from
// the constant above) so progress is well defined.
export function laneRoute(route, offset = LANE_OFFSET_CELLS) {
  const n = route.length;
  if (n === 0) return {points: [], headings: [], lengths: []};
  if (n === 1) return {points: [{x: route[0].x, z: route[0].z}], headings: [], lengths: []};
  const headings = [];
  for (let i = 0; i < n - 1; i++) headings.push(segmentHeading(route, i));
  const rights = headings.map(rightOf);
  const points = new Array(n);
  points[0] = {x: route[0].x + rights[0].x * offset, z: route[0].z + rights[0].z * offset};
  for (let i = 1; i < n - 1; i++) {
    // Straight continuation keeps the SINGLE right offset (collinear waypoints);
    // only a 90deg turn uses the miter P+(r_prev+r_next)*L. Doubling the offset on
    // straights would zig-zag the lane and tilt segment headings off-axis.
    const straight = headings[i - 1].x === headings[i].x && headings[i - 1].z === headings[i].z;
    const ox = straight ? rights[i].x : rights[i - 1].x + rights[i].x;
    const oz = straight ? rights[i].z : rights[i - 1].z + rights[i].z;
    points[i] = {x: route[i].x + ox * offset, z: route[i].z + oz * offset};
  }
  points[n - 1] = {
    x: route[n - 1].x + rights[n - 2].x * offset,
    z: route[n - 1].z + rights[n - 2].z * offset
  };
  const lengths = new Array(n - 1);
  for (let i = 0; i < n - 1; i++)
    lengths[i] = Math.abs(points[i + 1].x - points[i].x) + Math.abs(points[i + 1].z - points[i].z);
  return {points, headings, lengths};
}

// Axis-aligned envelope half-extents (cells). We use the heading-INDEPENDENT
// square bounding box (half = HALF_LONG on both axes), which CONTAINS the real
// oriented 2.05 x 1.2 body. Why square: an oriented envelope swaps its long axis
// x<->z at every 90deg corner, so a position clear for the incoming heading can
// interpenetrate for the outgoing one, and a stationary truck's envelope expands
// when its heading flips at a segment advance — silently into a neighbour that
// parked clear of the old orientation (measured 0.125 world near-miss; conditional
// corner reservations re-introduced it because the constraint box grew into parked
// trucks). A square envelope never changes with heading or progress, so "clear
// now" stays clear forever and the single motion-axis clamp interval guarantees
// full 2D clearance with no time-varying boxes. It is conservative: square-gap >=
// MIN_GAP implies the visible oriented bodies also keep >= MIN_GAP. LANE_OFFSET is
// widened so parallel lanes do not falsely queue under the square footprint.
const halfExtents = () => ({x: HALF_LONG, z: HALF_LONG});

// Envelope AABB (cells) at a position with a heading, optionally inflated by a
// uniform margin and swept forward by maxStep (cells) along the heading.
export function envelopeAabb(pos, heading, inflate = 0, maxStep = 0) {
  const he = halfExtents(heading);
  let minX = pos.x - he.x - inflate, maxX = pos.x + he.x + inflate;
  let minZ = pos.z - he.z - inflate, maxZ = pos.z + he.z + inflate;
  if (maxStep > 0) {
    if (heading.x > 0) maxX += maxStep; else if (heading.x < 0) minX -= maxStep;
    if (heading.z > 0) maxZ += maxStep; else if (heading.z < 0) minZ -= maxStep;
  }
  return {minX, maxX, minZ, maxZ};
}

// Separation (world units) between two envelope AABBs given as {x,z,heading}.
// Positive => disjoint; the value is the smallest axis push that separates them.
// <= 0 => the envelopes interpenetrate. This is the falsifiable invariant metric.
export function envelopeGapWorld(a, b) {
  const ea = envelopeAabb(a, a.heading || DEFAULT_HEADING);
  const eb = envelopeAabb(b, b.heading || DEFAULT_HEADING);
  const sepX = Math.max(eb.minX - ea.maxX, ea.minX - eb.maxX);
  const sepZ = Math.max(eb.minZ - ea.maxZ, ea.minZ - eb.maxZ);
  return Math.max(sepX, sepZ) * CELL;
}

// The heading a vehicle turns into at the end of its current segment, or null.
function nextHeadingOf(u) {
  const j = u.job;
  if (!j || !Array.isArray(j.route)) return null;
  const r = j.route, s = (j.segment || 0) + 1;
  if (s >= r.length - 1) return null;
  const dx = r[s + 1].x - r[s].x, dz = r[s + 1].z - r[s].z;
  if (dx === 0 && dz === 0) return null;
  return Math.abs(dx) >= Math.abs(dz) ? {x: Math.sign(dx), z: 0} : {x: 0, z: Math.sign(dz)};
}

// A blocker near its upcoming corner reserves BOTH orientations (union box) so an
// approacher stops clear of the turn, not just the slim current body — otherwise
// the approacher parks inside the turn envelope and the turning truck deadlocks
// against it (measured: 254s mutual freeze at the depot intersection). Far from a
// corner (or going straight) the blocker stays slim, so opposing through-lanes do
// not falsely queue (the full-segment union gridlocked them — 92% throughput loss).
function blockerAabb(u, hu) {
  const j = u.job;
  const nh = nextHeadingOf(u);
  const nearCorner = j && nh && (j.progress >= 0.5 || u.waiting);
  if (nearCorner && (nh.x !== hu.x || nh.z !== hu.z)) {
    const a = halfExtents(hu), b = halfExtents(nh);
    const hx = Math.max(a.x, b.x), hz = Math.max(a.z, b.z);
    return {minX: u.x - hx - GAP, maxX: u.x + hx + GAP, minZ: u.z - hz - GAP, maxZ: u.z + hz + GAP};
  }
  return envelopeAabb(u, hu, GAP, 0);
}

// Analytic clamp of v's progress along its current offset segment so v's envelope
// keeps GAP clearance from u's constraint AABB. Motion is axis aligned, so the
// forbidden progress set is a single interval; we stop at its entry. Returns the
// largest allowed progress in [p0, p1] (>= p0). The slim oriented envelope keeps
// parallel lanes flowing; corner orientation flips are gated separately by
// turnClear() in the integrator (reserving a square along the whole segment would
// gridlock opposing lanes — measured 92% throughput loss).
function clampAgainst(uAabb, from, to, hv, p0, p1) {
  const he = halfExtents(hv);
  const alongX = Math.abs(hv.x) >= Math.abs(hv.z);
  const a = alongX ? from.x : from.z;
  const b = alongX ? to.x : to.z;
  const c = alongX ? from.z : from.x; // constant cross coordinate
  const span = b - a;
  if (Math.abs(span) < EPS) return p1;
  const hAlong = alongX ? he.x : he.z;
  const hCross = alongX ? he.z : he.x;
  const lo = alongX ? uAabb.minZ : uAabb.minX;
  const hi = alongX ? uAabb.maxZ : uAabb.maxX;
  // Cross-axis ranges must overlap for any conflict along the motion axis.
  if (c - hCross >= hi || c + hCross <= lo) return p1;
  const mLo = (alongX ? uAabb.minX : uAabb.minZ) - hAlong;
  const mHi = (alongX ? uAabb.maxX : uAabb.maxZ) + hAlong;
  let t0 = (mLo - a) / span, t1 = (mHi - a) / span;
  if (t0 > t1) {const tmp = t0; t0 = t1; t1 = tmp;}
  // Progress in (t0, t1) is forbidden. If the whole move stays before the band
  // (p1 <= t0) or already past it (p0 >= t1, blocker behind us) we move freely.
  if (p1 <= t0 || p0 >= t1) return p1;
  // Otherwise stop at entry (minus epsilon keeps the gap >= GAP); if already
  // inside the band we cannot advance at all.
  return Math.min(p1, Math.max(p0, t0 - EPS));
}

// Full separation clamp for one substep. `others` is every other vehicle (idle
// trucks are physical obstacles too). Returns {progress, blockedBy}. blockedBy is
// the id of the truck that forced the stop (null if the truck moved freely).
//
// Clearance is enforced against each blocker's CURRENT envelope inflated by GAP.
// This is sufficient (no extra forward sweep) because advanceGame integrates the
// fleet in deterministic ASCENDING id order: a lower-id blocker has already moved
// when a higher-id yielder clamps, so the yielder sees the blocker's committed
// position; a higher-id blocker has not moved yet, but its own clamp (against this
// truck's committed position) keeps it from entering our envelope when it moves.
// Either way the end-of-substep pairwise gap is >= GAP. Sweeping the blocker by a
// full speed*dt step (the earlier design) inflated following distance ~16x the
// declared gap and gridlocked the sparse starter network (measured 92% throughput
// loss); the ordered current-envelope clamp keeps queues tight AND separates.
//
// This ascending-id order IS the right-of-way tie-break (the standalone priority
// helper that once mirrored this rule was never called and was removed in #598):
// forward-only yielding means a truck yields to a truck AHEAD of it along its own
// heading; mutually-ahead (head-on / crossing) and exactly-side-by-side conflicts
// are broken by the LOWER vehicle id, because the lower-id truck integrates first
// and the higher-id truck clamps against its committed envelope. Deterministic
// and replay-safe.
export function separationClamp(v, others, from, to, hv, p0, p1, dt, speedMult) {
  let limit = p1, blockedBy = null;
  for (const u of others) {
    if (u === v || u.id === v.id) continue;
    const hu = headingOf(u);
    const box = blockerAabb(u, hu);
    const clamped = clampAgainst(box, from, to, hv, p0, limit);
    if (clamped < limit - EPS) {limit = clamped; blockedBy = u.id;}
  }
  return {progress: Math.max(p0, limit), blockedBy};
}

// Corner turn gate (#589). A truck at a 90deg corner changes its envelope
// orientation (long axis swaps x<->z); the slim approach clamp guarantees the
// INCOMING orientation is clear, but the OUTGOING one can interpenetrate a
// neighbour that parked clear of the incoming box (measured 0.125 world near-miss).
// Before flipping heading at a corner the integrator calls this: it returns the id
// of the first truck whose current envelope would be within MIN_GAP of the mover's
// outgoing envelope at the corner position, or null if the turn is clear. The
// truck waits at the corner (incoming orientation, already proven clear) until the
// turn clears — no square reservation along the segment, so opposing lanes flow.
export function turnClear(v, others, pos, nextHeading) {
  const probe = {x: pos.x, z: pos.z, heading: nextHeading};
  for (const u of others) {
    if (u === v || u.id === v.id) continue;
    if (envelopeGapWorld(probe, u) < MIN_GAP_WORLD - 1e-6) return u.id;
  }
  return null;
}
