# Canonical voxel geometry scale, pivot and material schema (ART-01, #347)

Schema id: `rustwake.voxel.geometry.v1` — source: `src/voxelSchema.js` (pure data + validation, no THREE/DOM, Node-testable).
Status: describes and validates the LIVE procedural geometry in `src/world.js`. This is a geometry contract, **not** visual acceptance. Art parity remains open under #262 / #270; sponsor G1 visual acceptance is #276 and is never granted by the code author.

## Provenance

| Input | Location | Role |
|---|---|---|
| Approved visual reference | `public/reference/approved-yard.png` | Canonical isometric blocky salvage-yard look (supplemental: `public/reference/asset-style-sheet.png`) |
| Color/scale tokens | `docs/design/tokens.json` (`rustwake.visual.tokens.v1`) | 20 `world` hex colors mirrored by the material registry |
| Geometry source of truth | `src/world.js` `makeBuilding` / `createTruck` / `createWorker` at PR #307 baseline `006b5e8` | Original V2 procedural voxel kit; the schema mirrors it, never replaces the playable world with an image |
| Asset manifest | `docs/design/asset-manifest.json` | 13 reference-only glTF blockouts; `geometry_schema` block points here |
| Archive | `archive/legacy-v1-2026-11-15` | Read-only history. No V1 HUD/grid/pipes code is imported or revived |

## Coordinate and scale contract

- Right-handed axes: **X east, Y up, Z south** (matches `src/camera.js`).
- Logical parcel: **24 × 24 hidden cells**, `CELL = 3.5` world units → 84 × 84 world units.
- Cell origin: `origin(i) = (i − 24/2 + 0.5) × 3.5`; `cellCenter(i)` is exported by the schema.
- Logical footprints come from the content registry `footprintOf()` (**#370**, merged in main `e8240a87`): 11 initial machines are **1 × 1 cells**; the crane is **2 × 3**. Per #370 the group sits at the footprint center on Y = 0, rotated `rot × 90°` and scaled by base w/d.
- **All schema geometry fields (bounds, pick, pivots, bay) are authored LOCAL (unscaled) space.** World envelope = local envelope × `footprint.scale`; the invisible pick volume scales with the group and covers the whole footprint. `tests/voxelSchema.test.mjs` measures local geometry AND asserts the exact `worldFootprint()` transform for all 12 machines × 4 rotations.
- **Frontage faces +Z (south)**: ground loading bay `port:loading-bay` at offset `[0, 1.295]`, size 1.22 × 0.42, y 0.11; status beacon `status:light` at `[1.28, 0.95, 1.25]`.
- Orthographic frustum vertical span = `80 / zoom` (camera contract; camera math and PR #307 observability stamps are untouched by this schema).

### Scale references (measured from real geometry in tests)

| Reference | Envelope (world units) | Source |
|---|---|---|
| Worker | 0.62 W × **1.7 H** × 0.34 D | `createWorker()` in `src/world.js`, named `scale:worker`; 3 decorative figures in the starter yard. Human scale reference only — crew simulation is #274 |
| Truck | 1.2 W × 1.35 H × **2.05 L** | `createTruck()`, named `vehicle:truck`, `userData.scaleReference = "truck"`; must fit one road cell and one loading bay (bay width 1.22 ≥ 1.2) |
| Machine height ratio | 0.9 – 4.0 × worker height (1.53 – 6.8 units) | enforced per descriptor |
| Max animated reach | `swingRadius ≤ CELL × 1.5 = 5.25` | booms may overhang the cell visually, never the parcel logic |

## Part hierarchy and pivot ownership

Each machine group carries `userData.voxel = {schema, type, footprint, frontage, pick, pivots, bounds}` and named nodes:

- `pivot:<id>` — animated assembly owned by the machine (THREE.Group). Declared offset, axis, motion (`spin` | `oscillate` with amplitude/speed) and `swingRadius`.
- `port:loading-bay`, `status:light` — frontage/port and operating-status nodes.
- `pick:volume` — invisible full-cell pick box (`MeshBasicMaterial({visible:false})`), excluded from staging/silhouette logic.
- Canvas stamps (rebuilt each refresh): `dataset.voxelSchema`, `dataset.machineCount` alongside the PR #307 camera stamps.

## Material ownership

One shared pool: `mats` in `src/world.js` (16 keys, flatShading, shared unit BoxGeometry, 8-segment cylinders). `MATERIALS` in the schema mirrors color/metalness/roughness/emissive exactly and is the **only legal material id set** for machine parts; `canvas-text` is the single exempt id for depot/market signage planes. CI (`scripts/check-design-contract.mjs`) requires every `tokens.json` world hex to remain literally present in `src/world.js` — the schema mirrors, it does not relocate, the palette.

## Pick accessibility (honest numbers)

Pick volume = full logical cell (3.5 × pickHeight × 3.5), enclosing the static silhouette including roof; pickHeight overrides cover the tallest animated pose (salvager 2.95, generator 2.2, crane 5.6). Projected cell size = `3.5 × viewportHeight × zoom / 80`:

| View | Default zoom | Cell CSS px | 44 px floor |
|---|---|---|---|
| Desktop 1440×900 | 1.15 | **45.28** | met at default |
| Phone 390×844 | 1.0 | 36.93 | requires zoom ≥ `minZoomForPick(844)` ≈ **1.192** |

Picking itself is a ground-plane cell raycast, so the whole cell is targetable at any zoom; the 44 px floor is the declared comfort target, published via `minZoomForPick()` rather than silently claimed.

## Machine validation table (all 12 initial machines; bounds in authored local space)

Bounds are pad-inclusive static envelopes (W × H × D, local world units before the #370 footprint scale); pick H encloses animated poses. Validated by `validateAllMachines()` AND by measuring real `THREE.Box3` envelopes in `tests/voxelSchema.test.mjs` (tolerance 0.02).

| Machine | Footprint | Static bounds | Pick H | Pivot (motion, swingRadius) | Budget meshes/tris |
|---|---|---|---|---|---|
| salvager | 1×1 | 3.045 × 2.285 × 3.045 | 2.95 | rocker (oscillate, 2.95) | 24 / 400 |
| depot | 1×1 | 3.13 × 2.87 × 3.045 | 2.87 | static + FREIGHT signage | 24 / 400 |
| market | 1×1 | 3.13 × 2.87 × 3.045 | 2.87 | static + EXCHANGE signage | 24 / 400 |
| generator | 1×1 | 3.045 × 1.975 × 3.045 | 2.20 | spin (spin, 1.32) | 24 / 500 |
| furnace | 1×1 | 3.045 × 4.55 × 3.045 | 4.55 | group pulse (amp 0.009, speed 5) | 24 / 500 |
| foundry | 1×1 | 3.045 × 4.55 × 3.045 | 4.55 | group pulse (amp 0.009, speed 5) | 24 / 500 |
| crusher | 1×1 | 3.045 × 2.34 × 3.045 | 2.34 | static | 24 / 500 |
| refinery | 1×1 | 3.045 × 2.34 × 3.045 | 2.34 | static | 24 / 500 |
| crane | 2×3 | 3.045 × 5.09 × 3.045 | 5.60 | crane slew→trolley→hoist→hook (ART-06 lift cycle, 4.8) | 32 / 600 (measured 27 / 324) |
| turret | 1×1 | 3.045 × 3.42 × 3.045 | 3.42 | rotate (spin, 2.3) | 20 / 400 |
| fabricator | 1×1 | 3.045 × 3.05 × 3.045 | 3.05 | static | 24 / 400 |
| research | 1×1 | 3.045 × 4.925 × 3.045 | 4.92 | static | 24 / 450 |

Validation rules enforced per descriptor: integer footprint within 24×24 mirroring `footprintOf()`; `footprint.world = cells × 3.5`; static bounds ≤ base cell; worker height ratio; pick ≥ base cell and enclosing static silhouette with ≥44 px declared floor; +Z bay inside the base cell and ≥ truck width; pivot naming/axis/motion/offset within envelope (`y ≤ height + 0.5`); swingRadius ≤ 5.25; registered materials; budgets ≤ global limits. 18 negative descriptors (oversize footprint, overhang, sub-cell pick, narrow bay, misnamed pivot, out-of-envelope offset, excessive reach, unregistered material, over-budget, missing descriptor…) are asserted rejected in tests.

## ART-06 crane lift-cycle motion contract (#352)

The decorative endless sinusoidal slew (`rotation.y = sin(time*.24)*.34`) is replaced by a deterministic, phased mechanical lift cycle on a named pivot hierarchy. Source of truth: `src/world.js` exports `CRANE_LIMITS`, `CRANE_PHASES`, `CRANE_CYCLE_TOTAL`, pure `cranePose(time, reducedMotion)` and the single application path `applyCranePose(p, pose)` — runtime `update()` and `tests/craneMotion.test.mjs` share the same functions, so the tested pose is the rendered pose.

### Pivot hierarchy (inspectable named Groups)

- `pivot:crane` — slew assembly at the ART-01 schema offset `[0, 5.1, 0]` (name/offset/axis/swingRadius 4.8 unchanged): boom girder, 8 truss beams, counterweight. `rotation.y` = slew angle.
- `pivot:crane:trolley` — child of the slew; travels the boom on local X between `trolleyMin 0.7` and `trolleyMax 4.35`.
- `pivot:crane:hoist` — child of the trolley at `[0, −0.2, 0]`; carries the cable mesh. Cable `scale.y` = drop and `position.y` = −drop/2, so the cable always spans exactly from hoist to hook.
- `pivot:crane:hook` — child of the hoist; `position.y` = −drop (block + shank + tip). The hook rides exactly the cable end; the load chain can never teleport apart.

### Deterministic cycle (25.2 s, smoothstep ease, zero end velocity)

| # | Phase | Dur (s) | Motion |
|---|---|---|---|
| 0 | travel-out | 3.0 | trolley 0.7 → 4.35 |
| 1 | lower | 3.0 | drop 0.45 → 3.2 at trolley max |
| 2 | hook-dwell | 1.6 | hold at full drop |
| 3 | raise | 3.0 | drop 3.2 → 0.45 |
| 4 | travel-in | 3.0 | trolley 4.35 → 0.7 |
| 5 | slew-to-drop | 2.4 | slew 0 → −0.6 rad |
| 6 | lower-drop | 2.6 | drop 0.45 → 2.6 (release height) |
| 7 | release-dwell | 1.6 | hold at release height |
| 8 | raise-drop | 2.6 | drop 2.6 → 0.45 |
| 9 | slew-back | 2.4 | slew −0.6 → 0 rad |

`cranePose` is pure: elapsed time modulo 25.2 s selects the phase, smoothstep `u²(3−2u)` eases each channel; no randomness, no frame-rate dependence, exact periodicity (t and t + 25.2 pose identically).

### Simulated truth and accessibility

- **Empty hook.** No cargo mesh is created, attached or teleported; the cycle implies no production and moves no inventory. A visible load may only ever mirror a real reserved shipment from the simulation authority (#274); `src/simulation.js` is untouched by #352.
- **prefers-reduced-motion** (matchMedia + change listener): `cranePose` returns the parked pose `{phase:"parked", slew:0, trolley:0.7, drop:0.45}` — static, minimal, state preserved.
- Canvas stamps each refresh: `dataset.cranePhase`, `dataset.craneTrolley` (3 dp), `dataset.craneDrop` (3 dp), `dataset.craneReducedMotion` ("1"/"0"), alongside the untouched #307 camera stamps.
- Selection/footprint unchanged: 2×3 via #370 `worldFootprint`, full-cell pick volume (pickHeight 5.6 encloses every animated pose), shared material pool; measured 27 meshes / 324 triangles (budget 32 / 600).
- Camera invariants preserved: `applyCamera`/`stampCamera` byte-identical to main (sha256-16 `f3afa5479a66b97e` / `691b3c0a3480e97b`, guarded in `tests/craneMotion.test.mjs`), isometric yaw 45 / elevation 35.264, synchronous dataset stamps, one WebGL context, no document scroll.

### Schema declaration follow-up (honest gap)

`src/voxelSchema.js` still declares the crane pivot motion as `{kind:"oscillate", amplitude:0.34, speed:0.24}` — the validator vocabulary is `spin | oscillate` and `voxelSchema.js` is outside the #352 file lease, so the descriptor is now stale relative to the runtime lift cycle. Pivot name/offset/axis/swingRadius/parts/budget remain accurate and all schema tests stay green. Extending the schema motion vocabulary to describe the phased cycle (and retiring the stale amplitude/speed) is a follow-up under the ART umbrella #262; recorded in `docs/backlog/GAPS.md`.

### ART-06 evidence

- Tests: `tests/craneMotion.test.mjs` — 13 tests (hierarchy names/parentage, phase order + durations + periodicity, channel bounds, hook==cable-end coupling, no-cargo negatives, reduced-motion parked static, camera-hash guard). Full suite 168/168 on rebased main `d1e8dec4` (155 main + 13 crane).
- Capture: `npm run build && node scripts/capture-crane.mjs` → `docs/evidence/352-art-06/` (desktop 1440×900 + phone 390×844 front/side/isometric stills, parked reduced-motion negative, selection proof, 10 distinct motion-stage frames over ≥60 s with a ≥120-sample timeline, phone motion frames, `report.json` citing the capture head SHA). Status `PASS_NUMERIC_ONLY` — numeric smoke only, not art parity, reviewer/product acceptance or sponsor G1 (#276).

## Performance limits

| Limit | Value |
|---|---|
| Max meshes per machine | 60 (declared per-machine budgets 20–32) |
| Max triangles per machine | 1600 (declared 400–600) |
| Initial scene machines / trucks | 6 / 3 |
| Cylinder radial segments | 8 |
| Shadow map | 2048 |
| Device pixel ratio cap | 2 |
| Point lights | ≤ 4 |

Shared unit BoxGeometry + shared material pool; no per-mesh geometry allocation. Real mesh/triangle counts are measured in tests, not assumed.

## Negative and fallback states

- **Invalid placement** (captured on desktop AND phone): Construct mode over the occupied starter depot cell (13,9) renders the red-orange ghost `#ee8263` (`drawGhost` valid=false) and tapping rejects with toast "A machine occupies this site" (`src/simulation.js` occupancy guard). Roads similarly reject with "Move the site off the road".
- **WebGL**: V2 has no 2D fallback renderer and no image masquerading as the world; the canvas stamps `world3d="ready"` only after a real render. Captures assert that stamp, the schema stamp and `machineCount=6`, zero page errors and zero failed requests. Known gap (not fixed by #347): there is currently no explicit WebGL-unavailable guard/error boundary in `main.jsx` — a device without WebGL fails loudly rather than showing a fake world; a graceful notice belongs to the UX track (#268).
- **Staged construction**: mid-build machines hide unfinished parts (tested: furnace at remaining 4.5 keeps foundation visible, high walls hidden).

## Reproducible evidence

- Tests: `node --test tests/*.test.mjs` — 168 pass at ART-06 (14 in `tests/voxelSchema.test.mjs`: schema/token identity, real Box3 envelopes, #370 worldFootprint transform integration (12 machines × 4 rotations), pick enclosure, frontage/truck fit, pivot offsets/axes/motion, material registry, scale references, budgets, 44 px projection, negative descriptors, staging; 13 in `tests/craneMotion.test.mjs` (ART-06 #352); plus camera, gridOccupancy, simulation, dock and verify-live suites from main).
- Capture: `npm run build && node scripts/capture-art.mjs` → `artifacts/art-01/` (`desktop-world.png`, `desktop-detail.png` near-zoom pivots/bay/worker/truck, `desktop-negative-ghost.png`, `desktop-negative-toast.png`, `phone-world.png`, `phone-negative-toast.png`, `report.json` with the full validation table and camera poses). The run for this PR is committed at `docs/evidence/347-art-01/`. One headless Chromium/SwiftShader, production vite preview; phone view is emulated, not a physical handset (#275).
- Gates: `npm run validate`, `node scripts/check-design-contract.mjs` (PASS: 13 assets / 20 world tokens), `node scripts/check-studio-docs.mjs` (PASS).
- **No code-author art self-acceptance**: numeric capture status is `PASS_NUMERIC_ONLY`. Independent reviewer + product verdict on the immutable PR head, then sponsor G1 (#276) on the deployed build, are required before any art-parity claim.

## Concurrency boundaries respected

Rebased onto main `e8240a87` after #528 BLD-01 merged: camera math and PR #307 `applyCamera`/`stampCamera` are byte-identical to main (#337 owns `src/cameraInput.js` / `src/camera.js`); #370 occupancy (`src/gridOccupancy.js`, `src/simulation.js`, footprint pivots/AABB in `src/world.js`, rotate/cancel UI, `scripts/capture-v2.mjs` construction proof) is preserved intact — this schema integrates with it via registry footprints and local-space geometry fields. `scripts/capture-art.mjs` is a new, separate capture entry point. ART-06 (#352, rebased onto main `d1e8dec4` after UX-07 #536) owns only the crane motion in `src/world.js`: `applyCamera`/`stampCamera` remain byte-identical (sha256-16 `f3afa5479a66b97e` / `691b3c0a3480e97b`, hash-guarded in `tests/craneMotion.test.mjs`); `src/camera.js`, `src/cameraInput.js`, `src/simulation.js`, `src/App.jsx`, `src/styles.css` and `src/voxelSchema.js` are untouched; `scripts/capture-crane.mjs` is a new, separate capture entry point.
