# ART-03 industrial rigs (#349) — generator, induction furnace, fuel refinery, cast foundry

Four distinctive, sim-driven industrial machines replace the shared pre-ART-02
blockouts. Every visual channel (pivot angles, status colours, smoke, pulse) is
derived from the **real simulation state** through the pure module
`src/art03.js`, which the runtime `World.update()` and
`tests/art03Models.test.mjs` call identically — tested pose == rendered pose
(the ART-06 `cranePose` / ART-02 `art02Pose` pattern).

## Provenance

All geometry is original, authored in code in `src/world.js makeBuilding`
(shared unit `BoxGeometry` + 8-segment cylinders, shared `MATERIALS` pool
mirroring `docs/design/tokens.json`, flat shading). No external/downloaded
models, textures or images enter the playable world. Style reference:
`public/reference/approved-yard.png` (unchanged) and the color/scale tokens.
Schema descriptors live in `src/voxelSchema.js` (`generator`, `furnace`,
`refinery`, `foundry`); motion numbers there mirror `ART03_MOTION` exactly and
are drift-guarded by test.

Lease respected: `src/App.jsx`, UI modules, `src/cameraInput.js`,
`src/simulation.js`, `src/content.js` are **untouched**. Footprints (1×1),
`port:loading-bay` [0, 0.11, 1.295], `status:light` [1.28, 0.95, 1.25],
full-cell pick volumes, mid-build staging, save semantics, registry, costs and
outputs are unchanged. ART-02 salvager/crusher, ART-05 rigs, ART-06 crane cycle
and ART-07 scenery are untouched.

## Structures (authored local space, #370 footprint contract)

All four rigs: static bounds **3.045 × H × 3.045** (PAD = CELL × 0.87),
footprint 1×1, +Z frontage. Measured counts come from the real
`makeBuilding` graph in tests and the production capture.

### Turbine Generator (generator) — H 3.05, pick H 3.1

- Features: foundation/base/body/cap, intake grille, exhaust stack + rust cap,
  side fuel tank on saddles, orange corner post + lamp, loading bay, status light.
- Pivots: `pivot:spin` roof fan (y @ [0, 1.9, 0], speed **2.2**, swing radius
  1.32, hub + orange blades); `pivot:turbine` exposed side turbine (z @
  [0, 1.02, 1.44], speed **−3.4**, radius 0.6) — counter-rotating read.
- Emission: `emit:exhaust` [−0.95, 3.05, −0.95], 2 smoke puffs, working-only.
- Status surface: light. **Measured 30 meshes / 460 tris** (budget 36 / 800).
- The generator has no recipe cycle: its work clock advances by
  `elapsed delta × load`, where `load = min(1, demand/supply)` from the real
  grid (`generatorLoad`). With zero demand it is `idle` and the fan parks.

### Induction Furnace (furnace) — H 4.7, pick H 4.7

- Features: vessel with rust induction coils, roof, twin stacks (main steel +
  aux rust, capped), orange charge hopper with black mouth, hot window
  (`furnace` material), side grates, tap spout + launder, bay, status light.
- Pivots: `pivot:charge` hopper flap (x @ [0, 2.92, 0.62], oscillate amplitude
  **0.5**, speed **1.2**, radius 0.8); `pivot:blower` side blower (x @
  [1.22, 1.55, 0.45], spin **2.6**, radius 0.5).
- Pulse: `group.scale.y = 1 + sin(clock·5 + id)·0.009` while working.
- Emissions: `emit:stackA` [−0.62, 4.72, −0.62] and `emit:stackB`
  [0.62, 4.22, −0.62], 2 smoke puffs each, working-only.
- Status surfaces: light + hot window. **Measured 31 meshes / 472 tris**
  (budget 40 / 900).

### Fuel Refinery (refinery) — H 3.5, pick H 3.5

Rebuilds the pre-ART-02 shared 10-mesh / 180-tri blockout into a distinct
distillation plant (the ART-02 seam is now closed; crusher geometry unchanged).

- Features: main column with rust collars + cap, aux column, twin storage tanks
  on saddles, pipe rack, flare stack, control cabinet with grates + sight
  window (`furnace` material), pump pedestal, bay, status light.
- Pivots: `pivot:pump` flywheel (x @ [−1.2, 0.95, 0.35], spin **2.4**, radius
  0.45); `pivot:valve` handwheel (y @ [0.15, 1.42, 0.2], oscillate amplitude
  **0.6**, speed **0.9**, radius 0.3).
- Emissions: `emit:flare` [1.25, 3.55, −1.15], 1 `furnace`-material flame puff
  (flare flag: vertical flicker `1 + 0.25·sin(clock·7 + id)`, no rise);
  `emit:vapor` [−0.55, 3.34, −0.45], 2 smoke puffs. Working-only.
- Status surfaces: light + sight window. **Measured 41 meshes / 792 tris**
  (budget 48 / 1100).

### Cast Foundry (foundry) — H 4.2, pick H 4.2

- Features: rust hall with sawtooth roof + glass clerestory, twin capped
  stacks, trunnions, mold line with steel ingots + one hot ingot (`furnace`
  material), cooling tank with glass coolant, bay, status light.
- Pivots: `pivot:crucible` tipping vessel (x @ [0, 1.95, 0.95], oscillate
  amplitude **0.42**, speed **0.85**, radius 0.62; vessel + glow + lip);
  `pivot:fan` roof fan (y @ [0.7, 2.44, 0.3], spin **2**, radius 0.66).
- Pulse: same `group.scale.y` channel as the furnace (amplitude 0.009, speed 5).
- Emissions: `emit:stackA` [−0.8, 4.22, −0.85], `emit:stackB`
  [0.8, 3.82, −0.85], 2 smoke puffs each, working-only.
- Status surfaces: light + crucible glow + hot ingot. **Measured 31 meshes /
  512 tris** (budget 40 / 900).

## Sim-derived status (the only source of truth for rig visuals)

`machineStatus(g, b)` precedence matches the inspector:

1. `b.remaining > 0` → **assembling**
2. no cycle: generator (`power < 0`) → **working** iff grid demand > 0, else
   **idle**; other utilities → **idle**
3. grid unavailable → **unpowered**
4. recipe inputs short (`inputsFit`, ε = 1e-7) → **starved**
5. otherwise → **working**

Status swaps are **discrete `mesh.material` reassignments of registered shared
materials** (`STATUS_MATERIALS`) — the pool is never mutated, no per-frame
material allocation:

| status | light | hot (window/glow/ingot) |
|---|---|---|
| working | `lights` | `furnace` |
| starved | `statusStarved` | `ember` |
| unpowered | `statusDead` | `dark` |
| assembling | `lights` | `dark` |
| idle | `statusIdle` | `dark` |

## Work clocks (sim time, never wall time)

`art03Advance(state, g, b, reducedMotion)` integrates one step and returns a
NEW state `{status, load, advance, clock, lastTimer, lastElapsed}`:

- Cycle machines (furnace/refinery/foundry): advance = `timerDelta(lastTimer,
  b.timer, cycle)` only while **working**. `timerDelta` is wrap-aware
  (`simulation.js` does `b.timer %= cycle`): a negative raw delta means exactly
  one wrap; resets/rebuilds outside `[0, cycle)` are rejected as 0 rather than
  fabricating work.
- Generator: advance = `max(0, elapsed − lastElapsed) × load` while working.
- `reducedMotion` parks the clock but keeps tracking `lastTimer`/`lastElapsed`,
  so re-enabling motion never jumps. Status colours still apply (they are not
  motion).

`art03Pose(clock, reducedMotion, id)` is pure: fan/turbine/blower/foundryFan/
pump are `clock × speed` (turbine negated), charge/crucible/valve/pulse are
`sin(clock × speed + id) × amplitude`. Under reduced motion every channel is 0.
`ART03_MOTION` (frozen): fanSpeed 2.2, turbineSpeed 3.4, blowerSpeed 2.6,
chargeAmp 0.5 / chargeSpeed 1.2, crucibleAmp 0.42 / crucibleSpeed 0.85,
foundryFanSpeed 2, pumpSpeed 2.4, valveAmp 0.6 / valveSpeed 0.9, pulseAmp 0.009
/ pulseSpeed 5.

Smoke: `smokePuff(phase, i, count)` with `phase = clock × ART03_SMOKE.speed`
(0.55); each puff wraps in [0, 1), rises `t × 1.1`, shrinks
`0.22 × (1 − 0.55t)` — deterministic, no randomness. Emission groups are
visible only while `status === "working" && !reducedMotion`.

## Runtime application and stamps

`World.update()` calls the exported `applyArt03(obj, g, b, reducedMotion, id)`
— the exact function tests drive against a real `makeBuilding` graph with real
simulation state. It applies pivot rotations, status-material swaps, emission
visibility/puff transforms and the furnace/foundry pulse, and returns the
observability stamp `{status, clock, load}`. Additive canvas dataset stamps
(alongside the untouched #307 camera stamps and ART-02/06/07 stamps):

- `art03Generator` / `art03Furnace` / `art03Refinery` / `art03Foundry`: derived
  status, or `"absent"` when the rig is not in the yard
- `art03Load`: generator real demand/supply load (3 dp; `"0.000"` when absent)
- `art03Clock`: lead ART-03 rig work clock (3 dp; `"0.000"` when none/parked)
- `art03Reduced`: `"1"` / `"0"`

## Capture pipeline (scripts/capture-art03.mjs)

Production-preview (`vite build` + `vite preview`), headless Chromium
(SwiftShader), desktop 1440×900 dpr1 + **emulated** phone 390×844 dpr2
(touch). Stages: fresh landing (reduced motion parked, 6 starter machines,
refinery/foundry absent) → real-UI placement of refinery + foundry (blueprint
card → tap → `lastSiteOk` → 5 s assembly via inspector) → per-rig strategic
zoom picking proof + HUD-free silhouette clips → sim-seeded **starved** and
**unpowered** negatives (real save-schema localStorage seeds) → 96 px
silhouette legibility (independent zlib PNG decode, pairwise meanAbsDiff ≥ 6
and diffFractionOver24 ≥ 0.10) → motion timeline (≥ 100 samples over ≥ 12 s
wall; the lead generator clock must track the footline's independent SIM
floor(elapsed) readout within 1.5 s, never outrun wall time, and advance ≥ 8 s
— the app clamps frame dt to 0.07 s, so under SwiftShader sim time legitimately
runs slower than wall time; sim time, not wall time, is the contract) →
WebGL-failure loud-failure negative.

### Picking model and the inherited FAIL (honest diagnosis)

`world.js screenToCell()` raycasts ray → **ground plane** → cell; it is not a
mesh raycast. A tap on a rig's visible body therefore selects the cell BEHIND
it — height-aware mesh picking is registered debt (GAPS CAM-01). Valid pick
aims must project inside the footprint's ground cells.

The inherited `MACHINE_NOT_CLICKABLE Induction Furnace … topmost=span` was
`document.elementFromPoint`-diagnosed as the NOTICE toast (`App.jsx notify`,
`.toast`, never auto-dismisses — player-facing side tracked by **#548**,
outside this lease) covering the single ground-cell-center aim point.
Classification: **(a) harness aiming bug**. Fixes, all real player actions:

- dismiss the toast through its real `Dismiss notice` button before aiming and
  before any sheet-toggle click (the toast can cover the toggle itself);
- sub-cell ground offsets (±0.32 CELL) that raycast to the SAME cell;
- closed-loop wheel zoom-out reframe when the whole cell is HUD-covered, then
  re-anchor to strategic zoom for the clip.

No assertion was deleted or weakened; no DOM removal, no forced clicks.
CAM-05: every sheet toggle asserts the applied camera is byte-unchanged
(`SHEET_TOGGLE_MOVED_CAMERA` guard).

## Camera and save invariants

`applyCamera()` / `stampCamera()` byte-identical to main (sha256-16
`f3afa5479a66b97e` / `691b3c0a3480e97b`), hash-guarded in
`tests/art03Models.test.mjs` and `scripts/capture-art03.mjs`. Player saves,
security controls and the simulation economy are untouched.

## Performance

Shared geometry/materials, 8-segment cylinders, no new lights/textures/tokens.
Per-rig budgets (36/800, 40/900, 48/1100, 40/900) sit within the global caps
(60 meshes / 1600 tris per machine). Measured totals above come from the real
rendered graph, not declarations.

## Evidence

`tests/art03Models.test.mjs` (18 tests) + `scripts/capture-art03.mjs` →
`docs/evidence/349-art-03/` (`PASS_NUMERIC_ONLY`; `report.json.source_sha` is
the capture head, direct parent of the evidence commit, empty
`src scripts tests` diff between them). Phone captures are **emulated**, not a
physical device. Numeric validation only — not automatically production-
approved art parity: sponsor visual review **G1 #276** remains owed/reserved;
independent reviewer + product ACCEPT of the immutable head pending. Nothing
here is live/deployed until the release engineer merges and verifies.
