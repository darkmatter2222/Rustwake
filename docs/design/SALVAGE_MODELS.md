# ART-02 salvage structures (#348) — extractor, crusher, screening plant

Scope: the ART-02 trio — **salvage extractor (salvager)**, **crusher** and **sorter**.
Base main `ec64143340891d4c9fe1829560243d17e753b506`, branch `rw/v2-art-02-salvage-models`.
Companion contracts: ART-01 schema (#347, `VOXEL_GEOMETRY.md`), ART-06 crane motion
(#352), ART-05 vehicle rigs (#351), ART-07 yard scenery (#353). Furnace/refinery/
generator/foundry remain ART-03 (#349); depot/market/research/fabrication remain
ART-04 (#350). This document records geometry, material/pivot ownership, the sorter
mapping decision, performance and evidence. **Numeric validation is not art
acceptance** — independent reviewer/product ACCEPT of the immutable head and sponsor
G1 visual review (#276) of the deployed build are still required.

## Provenance

All geometry is **original procedural code** in `src/world.js` (`makeBuilding`
salvager/crusher branches): shared unit `BoxGeometry` + 8-segment cylinders, shared
`mats` material pool mirroring `docs/design/tokens.json` / `MATERIALS` in
`src/voxelSchema.js`, flat shading. **No external/downloaded models, textures or
images are used as the playable world.** `public/reference/approved-yard.png` and the
approved color/scale tokens are unchanged; the reference-only blockout
`public/assets/blockouts/sorter.gltf` stays reference-only per `import_policy`.
Silhouettes are graded against the approved isometric yard reference at yaw 45 /
elevation 35.264.

## Sorter mapping decision (bounded scope, honest seam)

V2's buildable registry (`src/content.js` + `src/simulation.js`) has **no standalone
"sorter" machine** — only the reference-only blockout glTF. Registering a new
buildable would require `src/content.js`, `src/simulation.js` and `src/App.jsx`,
all outside the ART-02 file lease. The crusher's **real simulation outputs are
`{iron:6, stone:2}` from `{scrap:10}`** — that IS mechanical separation. Therefore
the ART-02 sorter outcome is delivered as part of the crusher structure:

- `pivot:screen` — an oscillating screen deck (steel frame + 5 dark mesh bars)
  directly under the crushing chamber, shaking at amplitude 0.04 rad / 3.4 rad/s;
- **twin discharge chutes** on the +Z frontage with distinct rims: ferrous stream
  (rust rim, left) and aggregate stream (orange rim, right).

A standalone buildable sorter (new registry entry, sim recipe, footprint, inspector
row) is registered as a follow-up seam under the ART umbrella **#262**. No save
semantics, costs, outputs or registry entries were changed by ART-02.

## Structures (authored local space, #370 footprint contract)

Both machines keep the 1×1 footprint, group at `worldFootprint` pivot (Y=0),
`rotation = rot*90°`, scale `(base.w, 1, base.d)`. Static envelopes are pad-inclusive
(PAD = 3.045). The +Z loading bay (`port:loading-bay`, 1.22×0.08×0.42 at
`[0, 0.11, 1.295]`) and status light (`[1.28, 0.95, 1.25]`) are **byte-exact to the
ART-01 contract** — port orientation and footprint are unchanged.

### Scrap Extractor (salvager) — static 3.045 × 2.74 × 3.045, pick H 2.95

Body/roof/side silhouette instead of the old 2.285-high generic box:

- rust hull (2.6×1.24×2.4) + stepped roof slab and raised roof step;
- three dark roof vents; rear dark counterweight; +X rust side panel;
- three dark radiator fins on the −X side (side silhouette detail);
- glazed operator cab on the front-left: dark frame + registered `glass` panel;
- front intake (orange housing + black mouth) and front-right steel discharge
  chute with dark rim — both on the +Z frontage beside the loading bay;
- steel exhaust stack + rust cap rising to 2.74 (the new static top).

Working part: `pivot:rocker` at the ART-01 offset `[0, 2.4, −0.2]` (axis Y,
oscillate 0.55 rad / 0.65 rad/s, swingRadius 2.95 — all unchanged): dark turret,
orange boom, steel grapple head and **three orange teeth**. Tallest animated pose
(2.8) stays inside pick H 2.95. Measured **29 meshes / 408 triangles** (budget 32/560).

### Crusher + screening plant (crusher) — static 3.045 × 2.51 × 3.045, pick H 2.51

Open-front crushing chamber so the working parts are actually visible:

- two body side walls + rear wall + dark floor (no front wall), four dark side
  ribs, rust wear plate on the rear interior, roof cap over the rear;
- stepped hopper roof: dark throat → orange mid → orange flare, twin steel rails
  at 2.51 (the new static top);
- twin discharge chutes + distinct rims (ferrous rust / aggregate orange), side
  ladder (2 rails + 3 rungs) on +X.

Working parts (three named pivots, all axis X):

| Pivot | Offset | Motion | Parts |
|---|---|---|---|
| `pivot:rollerA` | `[0, 1.35, 0.42]` | spin +1.75 rad/s, swing 1.8 | steel shaft, 4 teeth, dark flywheel at x −1.32 **on the rotation axis** (spins in place, never orbits) |
| `pivot:rollerB` | `[0, 1.35, −0.18]` | spin −1.75 rad/s, swing 0.4 | steel shaft, 4 teeth |
| `pivot:screen` | `[0, 0.95, 0.95]` | oscillate 0.04 rad / 3.4 rad/s, swing 1.1 | steel deck frame + 5 dark mesh bars |

Roller axes are 0.6 apart with teeth reaching 0.36 → the toothed rollers
**intermesh and counter-rotate** like a real double-roll crusher. Measured
**45 meshes / 600 triangles** (budget 46/660).

### ART-03 seam: closed by #349

The old shared crusher/refinery branch was split. ART-02 kept **refinery exactly
at the pre-ART-02 geometry** (10 meshes / 180 tris, static 3.045×2.34×3.045, zero
pivots), guarded by a seam test. **ART-03 (#349) has now rebuilt the refinery**
into a distinct distillation plant (41 meshes / 792 tris, H 3.5, pump + valve
pivots, flare + vapor emissions); the seam test in `tests/salvageModels.test.mjs`
now asserts the rebuild and that the crusher is collateral-free. The generator,
furnace and foundry were likewise rebuilt by ART-03 — see
`docs/design/INDUSTRIAL_RIGS.md`. ART-02's salvager/crusher geometry and motion
remain untouched by ART-03.

## Motion ownership (tested pose == rendered pose)

`src/world.js` exports `ART02_MOTION` (frozen) and pure
`art02Pose(time, reducedMotion, id)`; runtime `update()` and
`tests/salvageModels.test.mjs` call the **same** function (ART-06 `cranePose`
pattern). `update()` part kinds: `rocker` → `rotation.y`, new `roll` →
`rotation.x = ±time*1.75` by declared speed sign, new `screen` →
`rotation.x = sin(t*3.4+id)*0.04`. Schema pivot declarations mirror `ART02_MOTION`
exactly (drift-guarded by test).

Accessibility: under `prefers-reduced-motion` every ART-02 channel parks at 0 —
**including the salvager rocker, which previously kept oscillating** (intentional
improvement, same treatment ART-06 gave the crane). Simulation/economic timing is
untouched. Additive canvas stamps: `art02Arm`, `art02Roller`, `art02Screen`
(3 dp) and `art02Reduced` ("1"/"0"), alongside the untouched #307 camera stamps and
ART-06 crane stamps.

### Reduced-motion stamp semantics: `"none"` vs `"0.000"` (net strengthening)

The motion stamps are **per-channel presence-aware**: a channel whose machine is
not yet in the yard stamps the literal string `"none"` (absent), while a channel
whose machine exists but is parked by `prefers-reduced-motion` stamps exactly
`"0.000"`. At first landing the yard contains the salvager but **no crusher**, so
`art02Arm` is `"0.000"` (parked rocker) while `art02Roller`/`art02Screen` are
`"none"` (crusher absent). This is honest telemetry, not a parked value.

The capture's reduced-motion negative is therefore **two-stage**, and the second
stage is strictly stronger than the first:

1. **landing** — `art02Reduced === "1"`, `art02Arm === "0.000"`,
   `art02Roller`/`art02Screen` ∈ {`"0.000"`, `"none"`} (parked-or-absent), and all
   stamps (incl. `cranePhase`) constant over 2 s of the browser's real
   `performance.now()` clock;
2. **crusher-live** — after the crusher is really placed through the UI, **all
   three** of `art02Arm`/`art02Roller`/`art02Screen` must equal exactly `"0.000"`
   (no `"none"` accepted) and stay constant over a second 2 s real-clock window.

Both stages are recorded for desktop AND phone in `report.negatives.reducedMotion`
(`stage: "landing"` / `stage: "crusher-live"`). Accepting `"none"` at landing is
not gate-widening: before the crusher exists there is no roller/screen channel to
park, and the strict all-three-channels assertion runs as soon as the machine is
live. A free-running or drifting channel fails stage 2 hard.

## Capture pipeline hardening (phone wheel delivery)

`scripts/capture-art02.mjs` wheels **only on genuinely exposed canvas**. On phone
the UX-07 (#365) contextual sheet can overlay the canvas-rect centre after the
build tool + blueprint are chosen; a wheel delivered there scrolls the sheet body
and never reaches the canvas `wheel` listener (the original phone invalid-site
failure: `ZOOM_TARGET_NOT_REACHED: wanted 0.7 got 1.55`, zoom never moved).

- `exposedCanvasPoint` checks `document.elementFromPoint` resolves to
  `.world-canvas` before any wheel; if covered it collapses the sheet through its
  **real** `sheet-toggle` button (condition waits on `aria-expanded` /
  `data-collapsed`, never sleeps), else scans the canvas rect for an exposed
  point, else throws `NO_EXPOSED_CANVAS_ANCHOR` with the topmost element.
- Every scripted sheet toggle asserts **CAM-05 (#341)**: the applied camera stamps
  (yaw/elevation/zoom/x/z) are byte-unchanged across collapse/expand
  (`SHEET_TOGGLE_MOVED_CAMERA` otherwise). Selection is likewise untouched by the
  app; the capture re-expands the sheet through the same real toggle before
  reading the inspector (selection does not auto-expand a collapsed sheet).
- A stalled zoom stamp throws `WHEEL_ZOOM_STAMP_STALLED` naming the element that
  actually owns the anchor and the real stamp value — the previous silent
  `.catch(() => {})` no-op loop is gone. The `1e-3` target tolerance and the
  `ZOOM_TARGET_NOT_REACHED` throw are **unchanged**; no assertion was relaxed.
- Silhouette clips are captured with the sheet collapsed so the 96 px metrics
  decode world pixels only, never HUD overlay.

## Material / pivot ownership

- Every mesh uses the shared registered `mats` pool (`MATERIALS` registry mirrors
  `tokens.json`; no new tokens, no per-mesh material clones). The salvager cab is
  the only `glass` user among the trio; chute rims use `rust`/`orange` to encode
  the two real output streams.
- Pivot Groups are named `pivot:<id>` exactly as declared in `src/voxelSchema.js`;
  `userData.voxel` metadata, pick volumes (`pick:volume`, invisible, full cell ×
  pickHeight) and mid-build staging semantics are unchanged (low parts y<1.4 stay
  visible during assembly exactly as before; the high hopper/rocker hide until the
  existing ratio thresholds).
- Picking remains the ground-plane cell raycast (`screenToCell`); the full-cell
  pick volume encloses every static and animated pose, so angled geometry never
  shrinks the tap target.

## Performance

| Machine | Measured meshes/tris | Declared budget | Global caps |
|---|---|---|---|
| salvager | 29 / 408 | 32 / 560 | 60 / 1600 |
| crusher | 45 / 600 | 46 / 660 | 60 / 1600 |
| refinery (seam) | 10 / 180 | 24 / 500 | 60 / 1600 |

Shared geometry/materials, 8-segment cylinders, no new lights, no new textures,
no draw-call growth beyond the per-machine budgets. ART-07 scenery budget is
untouched (scenery-only stats 177 meshes / 2824 tris / 4 point lights; exactly
2 InstancedMeshes; seed 4073 plan unchanged).

## Camera and save invariants

`applyCamera()` sha256-16 **f3afa5479a66b97e** (len 602) and `stampCamera()`
**691b3c0a3480e97b** (len 252) byte-identical to main, hash-guarded in
`tests/salvageModels.test.mjs` and `scripts/capture-art02.mjs`. Landing yaw 45 /
elevation 35.264, synchronous dataset stamps, `stampMatchesApplied`, one WebGL
context, no document scroll. **No save semantics changed**: no registry, cost,
output, footprint or persistence edits; existing saves load identically (the
crusher simply renders richer).

## Evidence

- Tests: `tests/salvageModels.test.mjs` — 11 tests (pure pose contract incl.
  counter-rotation/periodicity/reduced-motion negatives, schema-no-drift, salvager
  silhouette + grapple, crusher chamber/hopper/chutes/ladder/flywheel, three named
  pivots + reach, bay/status/pick byte-exactness, refinery seam, staging, measured
  budgets, camera-hash guard). Full suite **282/282** (271 main + 11 new).
  `tests/voxelSchema.test.mjs` pivot expectations updated with written justification
  (crusher gains rollerA/rollerB/screen; every other machine unchanged).
- Rollback injection (recorded in `docs/evidence/348-art-02/rollback-control.json`):
  replacing `src/world.js` + `src/voxelSchema.js` with main `ec641433`'s unmodified
  blobs makes the new suite FAIL **9/11** (no `art02Pose` export, no crusher pivots,
  old salvager silhouette, staging/budget drift); the 2 survivors are deliberate
  continuity guards (bay/status byte-exactness, camera hashes) that must hold on
  main too. Files were explicitly restored from head blobs afterwards
  (`git diff --quiet` clean) — the tests are load-bearing, not tautological.
- Capture: `npm run build && node scripts/capture-art02.mjs` →
  `docs/evidence/348-art-02/` — production preview, one Chromium, desktop 1440×900
  dpr1 + emulated phone 390×844 dpr2 (hasTouch/isMobile): real UI crusher placement
  at (9,9) with `lastSiteOk` verdict + observed 5 s assembly, front/side/isometric
  frames at strategic zoom, inspector picking proof for both machines (1×1),
  96 px silhouette clips with independent PNG decode + pairwise per-pixel metrics,
  stamp-driven motion timeline (≥12 s, ≥100 samples, 4 mid-motion stage frames),
  invalid-site red-ghost + COLLISION verdict negative, two-stage reduced-motion
  negative (landing parked-or-absent, then strict all-three `"0.000"` once the
  crusher is live), WebGL-failure loud-failure negative — **all stages complete on
  BOTH desktop and phone**. Capture head
  `685c3fc1eab80f34c640edf18784af8e6c0ce084`; `report.json.source_sha` cites it
  (direct parent of the evidence commit; empty `src scripts tests` diff between
  them). Status **PASS_NUMERIC_ONLY**. The motion run's landing readiness waits on
  the live salvager arm channel (the absent crusher's roller/screen legitimately
  stamp `"none"` until placement), then a stricter post-placement gate requires
  all three channels finite before sampling.
- Remaining: independent reviewer + product ACCEPT of the immutable head, release
  engineer merge + deployed-source SHA verification, hosted-browser receipt (#333),
  physical handset (#268/#275), sponsor G1 visual review (#276).
