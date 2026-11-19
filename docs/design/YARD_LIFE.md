# #590 yard life — walking crew, forklift shuttle, continuous drone

Decorative yard-crew simulation for the V2 isometric sandbox. Ten walking
crew on the maintenance alleys, a forklift shuttling the depot bay apron, and
a drone that flies continuously to the machine actually cycling. All motion
is pure seeded data (`src/crowd.js` — no THREE, no timers, no DOM); world.js
consumes the poses. No external models or textures; the canonical 1.7-unit
worker rig is unchanged geometry with added hip pivots.

Authority: every crew rig declares `"none — decorative yard crew (#274)"`
(src/voxelSchema.js RIGS). Crew never carries cargo, never picks/drops
freight, never mutates the game state. Proven byte-identical economy output
with the crowd present vs absent (`tests/yardLife.test.mjs`, honesty gate:
6908 frames of full game-state JSON + freight manifest equality).

## Motion model (src/crowd.js CROWD_MOTION)

- Walkers ping-pong along six seeded maintenance-alley segments (the
  yardSceneryPlan alleys: z=10 and z=14 for x 6..18 skipping the x=11 road,
  x=8 for z 9..16 skipping the z=12 road). Speed 1.15 u/s ±8% per-seed jitter.
  Shared segments use opposite lanes (offset 0.6; lane gap 1.2 > the 1.12
  hard pair diameter + margin), so crew pass without overlap.
- Limb swing is a pure function of travelled distance (`workerPose`:
  strideFreq 7.5 rad/u, legSwing 0.5, armSwing 0.4, legs/arms opposite phase).
  Constant distance ⇒ frozen limbs: dt=0 and prefers-reduced-motion hold the
  pose exactly. `applyWorkerPose` drives the named pivots
  (pivot:leg-l/leg-r/arm-l/arm-r) on the real rig.
- Clearance is enforced every step against the LIVE truck envelope
  (conservative circumscribed radius 1.2 ≥ hypot(0.6, 1.025) at any heading),
  the forklift (0.75) and other walkers (0.5), with margin 0.12. Yielding =
  retreat along the walker's own segment out of the threat's forbidden
  interval at retreatSpeed 1.25 (≥ max worker speed, so retreat always wins).
  Intersection right-of-way: lower segment index goes first; the higher-index
  walker waits outside a CONSTANT waiting interval (hardR + laneOffset +
  crossingPad = 1.89) — constant boundaries keep the invariant exact under
  any dt sequence (a live sqrt boundary diverges).
- Forklift: decorative shuttle post → one cell west along the bay apron at
  0.9 u/s. Parked vs held, per the landed `src/crowd.js`: when the shuttle
  CORRIDOR is blocked (rebuild-time shuttle flag off) it is PARKED at
  FORKLIFT_POST — deliberate idle. While shuttling, a truck or walker threat
  makes it HOLD in place on the apron (clearance yield, not a park); it
  resumes when the threat clears and never snaps back to the post. Fork lift
  remains a pure function of the nearest REAL freight truck's distance to the
  depot bay approach (≤2 u raised 0.75, ≥6 u lowered 0). Never carries a load.
- Drone: continuous velocity-limited follow (v = min(6.5, distance × 2.2))
  to the roof of the building whose production timer ACTUALLY advanced this
  frame (`activeCycleAnchor`, unchanged from base), cruising at y ≥ 9.0
  (tallest machine 6.8). Arrival commit is ALSO step-capped (finisher fix:
  the unclamped commit measured 0.524 u > declared 0.5 at dt 0.016). Parks
  exactly on DRONE_PAD (shed roof, y 5.9) when no cycle is active. Hover
  bob/rotor spin are decorative flight on the sim clock, never work.

## Anti-teleport (declared per-step bounds at the App dt clamp ≤ 0.07 s)

maxWorkerStep 0.09 (1.25 × 0.07 = 0.0875), maxForkliftStep 0.07
(0.9 × 0.07 = 0.063), maxDroneStep 0.5 (6.5 × 0.07 = 0.455).

Measured (tests/crowd.test.mjs: 7 seeds × 240 s × mixed dt incl. 0.07;
tests/yardLife.test.mjs: real production anchors):

- worst walker step 0.0875, forklift 0.063, drone 0.5 (arrival clamp).
- BEFORE/AFTER: the verbatim base drone block
  (tests/fixtures/yardLifeBase590.mjs, provenance `git show 956a4706:src/world.js`)
  SET the position to the anchor roof/pad every frame — measured max step
  34.85 u on real anchors. The SAME bounded-step assertion throws on base and
  passes on HEAD (0.455 u). A test that would also pass at the base is not
  evidence; the negative control is in the suite.

## Pairwise clearance (measured minima, not booleans)

Ground pairs measured center-distance minus summed radii; drone pairs in 3D.
7 seeds × 240 s with three trucks looping the real road centerlines:

| pair | min clearance |
| --- | --- |
| walker–walker | 0.200 |
| walker–truck | 1.813–1.980 |
| forklift–truck | 0.856 |
| forklift–walker | 3.512–3.863 |
| drone–walker | 3.203–3.238 |
| drone–forklift | 5.531 |
| drone–truck | 3.075 |

Legal roads never come within ~2.9 u of a visible patrol path (lane offset
0.6), so truck/forklift yielding is defensive depth on the starter yard. A
synthetic stress (trucks driven ONTO an alley at 0.5 u/s) exercises the
retreat machinery: walker–truck clearance holds exactly the 0.12 margin with
bounded steps. Intersection yield fraction measured 0.60–0.72 of frames for
the waiting walker (the earlier "~half" claim is corrected to this range).

Post-#589 note (main `4628326daa0a2ef74a89784601976929d0d80385`): the table
above was measured with trucks looping road cell CENTRES; trucks now follow
the right-hand lane-offset routes of `docs/design/TRAFFIC.md`. The crowd
reads LIVE truck world positions, so the yielding machinery is unchanged —
a post-#592 scratch-merge re-measurement gave walker–truck clearance
1.8127–1.9798 against the 0.12 margin (coordinator measurement).

## Visibility (rebuild-only, sceneryConflicts convention)

`crowdConflicts(plan, g, sceneryPlan)` hides a segment when any of its cells
becomes road/footprint or a volumetric scenery piece's conservative
circumscribed AABB reaches the corridor. Bay aprons are NOT blockers —
walkers intentionally cross them (machines cannot build on bays). The
forklift hides when its post cell is paved/built or a volumetric prop reaches
the post; the shuttle flag parks it when the corridor is blocked. Hidden
walkers freeze (no drift). On a fresh save with the REAL yardSceneryPlan
nothing is hidden (measured: all six segments visible, post visible, shuttle
open). Applied only in rebuild(), never per-frame.

## Budgets (measured from real THREE geometry, tests/yardLife.test.mjs)

| rig | meshes | triangles | budget (RIGS) |
| --- | --- | --- | --- |
| worker | 11 | 132 | 16 / 250 |
| forklift | 20 | 320 | 28 / 450 |
| drone | 19 | 308 | 22 / 400 |

The worker rig is count-identical to the base fixture (pivot GROUPS add no
geometry). Scene delta vs base: base makeTerrain placed 3 static scale
references; HEAD places 10 patrol walkers ⇒ +77 meshes / +924 triangles
(7 × 11 / 7 × 132). Budgets are invariants — none were raised.

## Accessibility

prefers-reduced-motion (this.reducedMotion, ART-06 convention) holds the
crowd: walkers/forklift keep position, and the drone HOLDS its current
position with rotor/bob zeroed — `stepCrowd` returns early, so a mid-flight
drone neither flies to nor snaps to the pad. Only a fresh start begins
PARKED on DRONE_PAD (deliberate idle, no active cycle); a held mover is not
"parked". Limbs frozen. Simulation/economic timing is untouched. Proven in
tests/crowd.test.mjs (reduced hold + dt=0 hold, snapshot byte-equality).

## Determinism

`crowdPlan(seed)` is a pure seeded LCG plan; same seed + same dt sequence +
same env ⇒ byte-identical trajectories (JSON equality asserted across runs).
The economy never reads the crowd: src/simulation.js, content.js, fleet.js,
dock.js contain no crowd import or reference (static guard test).

## Test map

- tests/crowd.test.mjs — 11 tests: plan determinism, anti-teleport +
  clearance (7 seeds × 240 s), base-drone negative control, adversarial
  vertical ascent (250 phases × 4 dt), truck-yield stress, locomotion +
  limbs, trajectory determinism, reduced/dt=0 hold, frozen-env no-mutation,
  visibility, crossing right-of-way.
- tests/yardLife.test.mjs — 8 tests: plan/placement agreement, base-vs-HEAD
  anti-teleport on real anchors, economy byte-identity honesty gate, economy
  static guard, measured rig budgets + base worker parity, joint transforms,
  real-scenery visibility, source wiring guards.
- tests/yardScenery.test.mjs — 19 tests green (alleys/terrain unchanged).

## Limitations (honest scope)

- No visual acceptance is claimed here; G1 sponsor review of the deployed
  build is required (#276 stays open). Numeric evidence only.
- No cars/buses/trains system — crew are decorative pedestrians, the forklift
  is a decorative shuttle, the drone is a decorative flyer.
- Crew have no economy authority (#274) and trucks are not manufactured
  (#280); freight stays the simulation.js ledger.
- Parked vs held for FREIGHT trucks (#589, `docs/design/TRAFFIC.md`): a
  clamped truck is HELD, never "parked" — it carries explicit
  `waiting`/`blockedBy`/`waitTime` queue state and resumes from its clamped
  progress when the blocker clears. Known unresolved limitation: a truck
  whose route ORIGIN cell is occupied by a parked mover can wait
  INDEFINITELY — freight is conserved, other trucks keep flowing and the
  blocker is stated, but it is NOT repaired (mandatory recovery scope in
  follow-up #596). The system is not universally deadlock-free: forward-only
  yielding is acyclic only for same-direction following; perpendicular
  crossing traffic can form a wait-for cycle, which is why bounded reroute
  recovery exists.
