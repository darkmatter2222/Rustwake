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

## #552 — Screening Plant buildable: silhouette decision (binding-only)

Issue #552 asks for the ART-02 "sorter" outcome to exist as its own placeable
machine. Two explicit silhouette decisions were made and recorded here:

1. **Refinery keeps its OWN ART-03 distillation silhouette — UNCHANGED.** The issue
   premise ("screening geometry only reachable inside another buildable, decide
   whether refinery keeps the screening silhouette") is stale at base
   `e82caa52a3973fae92a983e11b6906489269b655`: ART-03 (#349) already rebuilt the
   refinery into a distinct distillation plant. There is no shared
   refinery/screening silhouette to resolve. The refinery branch in
   `src/world.js` is untouched by #552; no geometry, palette, primitive or
   accepted-test edits were made to it.

2. **Screening Plant binds to the EXISTING accepted ART-02 crusher+screening rig
   (shared silhouette, disclosed not silent).** The screening stage geometry
   (`pivot:screen` oscillating deck + twin discharge chutes + `pivot:rollerA` /
   `pivot:rollerB`) lives only in the ART-02 crusher branch. #552 attaches the new
   `screening` id to that branch via a NARROW ADDITIVE binding-only alias:
   - `src/voxelSchema.js`: `RAW_MACHINES.screening = RAW_MACHINES.crusher;`
     (pure descriptor alias; the frozen `MACHINES` map validates keys == BUILDINGS).
   - `src/world.js` line ~276: `else if(kind==="crusher"||kind==="screening")`
     selects the same rig; geometry UNCHANGED. Camera methods `applyCamera` /
     `stampCamera` UNTOUCHED (hashes re-measured base+head, preserved:
     `f3afa5479a66b97e`/602 and `691b3c0a3480e97b`/252).
   - `src/simulation.js`: ZERO edits — `advanceGame` is data-driven off
     `BLUEPRINTS`, so the content registry IS the wiring (PR #573 rebase mechanical).
   - `src/content.js`: new `screening` processing buildable (cost
     {credits:230,scrap:42,stone:22}, cycle 3.5 s, inputs {scrap:8},
     outputs {stone:5,copper:1}, power 2, 1×1, tier-0 unlock). Surfaces through the
     data-driven dock with ZERO UI edits (UI lease held by dev-566).

   **Rationale:** a distinct screening-only silhouette requires new voxel geometry
   in `src/world.js`, which is outside the binding-only lease exception and must be
   serialized as its own world.js geometry task. Shipping the standalone buildable
   now (genuinely consuming/producing, exact bank deltas, load-bearing tests) on the
   accepted rig delivers the issue outcome without reviving archived UI or editing
   accepted ART-02/03 geometry. The shared silhouette is an explicit, disclosed
   interim state, not a claim of visual fidelity.

   **Owed follow-up:** a serialized world.js geometry issue for a distinct
   screening-only rig (deck/hopper/chute proportions tuned to screening rather than
   crushing), with its own capture evidence and sponsor G1 review. Until then the
   Screening Plant is visually the crusher rig BY DESIGN.

   **Evidence (node-side only ⇒ PASS_NUMERIC_ONLY; browser NOT cleared, port 4201
   reserved):** `pnpm test` 452 (451 pass / 1 fail = known Windows deliveryAlert
   #207, identical on clean main; Linux CI authoritative); baseline measured 442.
   +10 load-bearing tests in `tests/screeningPlant.test.mjs` fail 10/10 on base-main
   blobs, pass 10/10 after. Exact bank deltas: build −230 cr / −42 sc / −22 st;
   one cycle −8 sc / +5 st / +1 cu (stats.produced +6, bank untouched); dismantle
   refund {credits:92,scrap:88,stone:13,copper:1}. 4 negative controls
   (NC1 registry-removal 9 fail, NC2 world-binding revert 1, NC3 schema-alias
   removal 1, NC4 outputs-emptied 4). One disclosed additive integration-test edit
   (`tests/voxelSchema.test.mjs` pivot-expectation map gains
   `screening: ["rollerA","rollerB","screen"]`; crusher/ART-02/03 rows UNCHANGED)
   flagged for reviewer ratification. Code head
   `0a0d88e95574aec2479261622c9038c12fe85beb` (PR #577 DRAFT).

   **C1 economy gate (product condition on PR #577) — DISCHARGED,
   PASS_NUMERIC_ONLY.** Harness: `scripts/measure-552-ab.mjs` (committed; the
   dispatcher variant is a PARAMETER — `--dispatcher-sha <40-char SHA>`, default
   `d8a492a68a8e7415021da431cc520a685041ad97` — so it re-runs unchanged at the
   train turn on the genuinely rebased head). Fresh yard, fixed seed 4073, zero
   player input beyond one public `buildAt("screening", 11, 1)` at t≈0 (first
   road-connected legal site; building id 10; 5 s assembly); t=120 s in 0.5 s
   substeps; delivered counts are real freight-ledger depot arrivals.

   **SRC-PROVENANCE (mandatory disclosure):** variant (i) = this branch's
   `content.js` + pre-#573 `simulation.js` at
   `639c5ec39a24fe2eaab20d77cec4aa1095b05b9c`; variant (ii) = the SAME
   `content.js` + #573's `simulation.js` at
   `d8a492a68a8e7415021da431cc520a685041ad97` (#573 is unmerged and
   CONFLICTING) — variant (ii) is **NOT a real merged tree**. The #573
   dispatcher was applied in the WORKING TREE ONLY, never committed.
   Byte-exact restore proof: `src/simulation.js` sha256
   `c969a40b9e82ac3e6a259aa154e1b6fd38fe0de06f044d7f5ed0b22995e81f28`
   before == after; `git diff --stat` and `--numstat` for that path both EMPTY.
   The zero-`simulation.js`-diff property (mechanical #573 rebase) is preserved.
   Every cell JSON carries the sha256 of the `simulation.js` bytes it imported
   (post variant: `802879992d56dd006b22a0f299d5980e326de7abc06b8dfc22d7d5ba222f75d1`),
   cross-checked by the orchestrator.

   | dispatcher | screening | bank steel @120 s (gate > 20) | delivered by resource (depot arrivals, 0–120 s) | scrap flow (gate > 0) | screening stone/copper pair |
   |---|---|---|---|---|---|
   | pre-#573 | built t≈0 | 20 — pre-existing #567 starvation | scrap 240, iron 104, copper 29, fuel 7, stone 0, steel 0 | 240 (60 s windows [105, 135]) | not delivered (starved pre-#573) |
   | pre-#573 | none (control) | 20 — pre-existing #567 starvation | scrap 252, iron 113, copper 28, fuel 7, stone 0, steel 0 | 252 ([117, 135]) | n/a |
   | post-#573 | built t≈0 | **52 — PASS** | scrap 77, iron 84, copper 40, stone 45, steel 32, fuel 15 | 77 ([38, 39]) | **10:stone 45, 10:copper 15 — PASS** |
   | post-#573 | none (control) | **48 — PASS** | scrap 90, iron 153, copper 29, steel 28, fuel 33, stone 0 | 90 ([45, 45]) | n/a |

   Gate verdicts: post-#573 NO zero-delivery output pair in either row
   (with screening: `1:scrap 45, 1:iron 39, 1:copper 25, 4:steel 32, 10:stone 45,
   10:copper 15`); bank steel > 20 in both post-#573 rows; scrap flow > 0 in all
   four rows. Pre-#573: screening does NOT worsen bank steel vs the no-screening
   control (20 vs 20); the ≤ 20 pre-#573 rows are the known pre-existing #567
   player-output starvation, not a #552 regression. Iron/fuel totals include the
   furnace's starter input stock being collected as inventory (pre-existing
   dispatcher behavior, identical in both variants). `stats.produced` /
   `stats.delivered` are vanity metrics (ruling 6956801701 / 6956802181) —
   reported by the harness, NEVER gated. No recipe re-tune was needed;
   `src/content.js` economy values are unchanged. **C2 (desktop+phone captures
   at the DEPLOYED SHA, crusher and screening adjacent in one frame) remains
   OWED** — this session had no browser; all figures are PASS_NUMERIC_ONLY,
   never PASS.
