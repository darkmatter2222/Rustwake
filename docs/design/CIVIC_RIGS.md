# ART-04 civic rigs (#350) — freight depot, trade exchange, signal observatory, parts fabricator

Four distinctive, sim-driven civic machines replace the pre-ART-04 blockouts.
The smoking gun was `src/world.js:179` on main: `} else if(kind==="depot"||kind==="market"){`
— ONE shared blockout body differing only by a text panel. That branch is gone;
depot and market are separate structures with distinct silhouettes (occupancy-grid
Jaccard distance **0.1776**, floor 0.15). The research mast and fabricator
orange-box specials were likewise rebuilt.

Every visual channel (pivot angles, shutter lift, status colours) derives from
the **real simulation state** through the pure module `src/art04.js` (no THREE,
no DOM, no wall clock — source-guarded). `art04Advance`/`art04Pose` are called
identically by the runtime `World.update()` (`applyArt04`) and by
`tests/art04Models.test.mjs` — tested pose == rendered pose (the ART-03 pattern).

## Provenance

All geometry is original, authored in code in `src/world.js makeBuilding`
(shared unit `BoxGeometry` + 8-segment cylinders, shared `MATERIALS` pool
mirroring `docs/design/tokens.json`, flat shading). No external/downloaded
models, textures or images enter the playable world. Style reference:
`public/reference/approved-yard.png` (unchanged) and the color/scale tokens.
Schema descriptors live in `src/voxelSchema.js` (`depot`, `market`, `research`,
`fabricator`); motion numbers there mirror `ART04_MOTION` exactly and are
drift-guarded by test.

Lease respected: `src/App.jsx`, UI modules, `src/styles.css`,
`src/cameraInput.js`, `src/simulation.js`, `src/content.js` are **untouched**.
Footprints (1×1), `port:loading-bay` [0, 0.11, CELL×0.37], `status:light`
[1.28, 0.95, 1.25], full-cell pick volumes, mid-build staging, save semantics,
registry, costs and outputs are unchanged. ART-02 salvager/crusher, ART-03
industrial rigs, ART-05 vehicle rigs, ART-06 crane and ART-07 scenery untouched.

## Structures (authored local space, #370 footprint contract)

Measured counts come from the real `makeBuilding` graph (production capture at
source_sha `b21d5b847759948a2d4820faacb1e8a18b1579ef`, `docs/evidence/350-art-04/`).

### Freight Depot (depot) — 35 meshes / 410 tris (budget 38 / 460)

- Dock hall + monitor roof with steel vents, **raised loading platform** with
  steel lip, roll-up shutter, canopy on two orange posts framing the truck
  corridor (2.38 clear > 1.2 truck width), ribbed side container, crate-glyph
  logo plaque, hanging FREIGHT sign.
- Pivot: `pivot:door` shutter (y-lift @ [0, 0.76, 1.08], `lift` vocabulary,
  travel **0.8**). Lift is a PURE piecewise function of the nearest REAL freight
  truck's distance to this depot's bay approach cell (`bayApproachDistance`
  over `g.vehicles` vs the LOG-02 `bayCells` cell; `depotDoorLift`): fully open
  at **near 2.5**, closed at **far 7**, linear between. Never a wall-clock timer.
  Reduced motion parks the shutter CLOSED.
- Dock reach window `ART04_DOCK = {near: 2.5, far: 7, travel: 0.8}`; the swept
  freight-truck envelope (1.2 × 1.35 × 2.05) clears every bay approach corridor
  for 4 types × 4 rotations with the shutter OPEN and pivots at live pose
  (`tests/art04Models.test.mjs`). Socket *orientation* remains LOG-02 #382.

### Trade Exchange (market) — 32 meshes / 434 tris (budget 36 / 480)

- Timber gabled hall (sloped roof slabs + ridge), coin logo on the gable,
  served counter with steel top, banded produce crates, EXCHANGE sign.
- Pivots (both DECLARED AMBIENT civic decoration, `drive: "ambient-elapsed"`,
  load label 1 — no production authority, #274):
  - `pivot:scale` balance beam (z @ [0, 2.95, 0.72], amplitude **0.45**, speed
    **1.3**, swing radius 0.8) with hanging orange pans.
  - `pivot:awning` scalloped awning (x @ [0, 1.95, 0.72], amplitude **0.25**,
    speed **2.6**, swing radius 0.85).
- **2:1 second-harmonic ambient pair.** The awning runs at exactly twice the
  beam speed with phase `2·id`, i.e. it is the beam's exact second harmonic for
  every building id. Two independent sinusoids (the old 0.5/0.8 pair) can both
  sit near their extrema over a fixed sim window and render as static — this
  actually happened at clocks 20.35→21.58 (id 6, combined displacement 0.152
  rad, rendered pair meanAbsDiff 0.552 < 1). With the 2:1 harmonic pair the
  combined displacement over ANY 1.2–1.35 sim window is bounded **≥ 0.4002 rad
  for every id** (dense phase sweep, pinned by regression test). Rest pose at
  t=0, id=0 remains exactly zero; reduced motion parks both at 0.
- Status lamp reads `trading` ONLY when `g.stats.sold` actually increased
  (simulation.js `sell()` is the sole writer); motion is ambient, not authority.

### Signal Observatory (research) — 24 meshes / 418 tris (budget 28 / 460)

- Banded tower + cap, SHORTER than the old mast (static 3.45, full 4.4589 vs
  old 4.925; pick height 4.5 — CAM-01 height-aware picking improves), ladder,
  cabinet + hot status window, SIGNAL sign.
- Pivots: `pivot:dish` tilted azimuth dish (y @ [0, 3.55, −0.2], spin speed
  **0.5**) carrying a NESTED `pivot:feed` horn (x, oscillate amplitude **0.16**,
  speed **0.7**). Working-only: the work clock integrates wrap-aware sim-timer
  deltas; starved timers advance but the clock freezes; unpowered pivots freeze.

### Parts Fabricator (fabricator) — 37 meshes / 494 tris (budget 40 / 540)

- Workshop + vent, output chute + crate, side entrance with lintel, hot status
  window, FAB WORKS sign.
- Pivots: `pivot:gear` 8-tooth drive gear (z, spin **1.6**) and `pivot:pinion`
  4-tooth pinion counter-rotating at **−3.2** (2:1 radius/speed ratio, pitch
  radii sum = center distance); `pivot:hammer` trip hammer over anvil (x,
  oscillate amplitude **0.45**, speed **1.1**). Work clock from real sim timers.

## Acceptance metric — six-rig distinctness

Occupancy-grid Jaccard distance over the REAL `makeBuilding` meshes (14×20×14
voxels, pick volume excluded), all 15 pairs of {depot, market, research,
fabricator, salvager, crusher}: **min 0.1741 (fabricator/salvager)**, floor 0.15;
depot/market **0.1776**. The same computation runs in the production capture
(`scripts/capture-art04.mjs`) and in `tests/art04Models.test.mjs`.

Mutation controls (`scripts/mutate-art04.mjs`, evidence
`docs/evidence/350-art-04/mutation-controls.json`): C0 unmutated head PASS;
C1 main's old shared depot/market body spliced back in → FAIL (depot/market 0);
C2 depot body cloned onto research → FAIL (depot/research 0); C3 untouched
clean-main snapshot → FAIL (depot/market 0). The metric is load-bearing.

## Honesty ceiling

Local headless captures are `PASS_NUMERIC_ONLY` — never visual approval. No
art-parity claim against `public/reference/approved-yard.png` is made here;
G1 sponsor visual acceptance (#276) is sponsor-reserved and still owed, and
physical handset verification remains #268/#275. Seeded scenario yards are
legitimate only because they go through the real save schema and the live
simulation derives every status stamp.