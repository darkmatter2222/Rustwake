---
id: Q-002
status: ready
priority: P1
owner: unassigned
base_sha: 3f1b4ac4427a362e038cc1f6f1d95ae0c1a51204
scope: [src/game/renderer/scene.ts, src/game/renderer/sprites.ts (new), src/ui/styles.css (:root palette block only), src/ui/Hud.tsx (DOT_COLORS constant only), scripts/capture-style.mjs (new), tests/renderer/scene-draw.test.ts (new), docs/evidence/ (style-slice receipt + provenance manifest)]
problem: the yard reads as a bare 6x6 grid of near-identical nested rectangles; one amber primitive encodes four quantities; the construction grid never hides at rest
expected_outcome: one art-directed authored salvage-yard slice (wreck, dock, two machines, flying drone, cargo, build ghost, one panel) with role-distinguishable silhouettes, a context-only grid and a measured luminance hierarchy at phone and desktop widths
acceptance: [sections 3A-3E; every check is a number]
evidence: [docs/screenshots/slice-phone-rest.png, slice-phone-build.png, slice-phone-mature.png, slice-phone-landscape.png, slice-desktop-rest.png, slice-desktop-build.png, slice-desktop-mature.png, slice-sheet-silhouette.png, docs/evidence/2026-11-03-style-slice.md, docs/evidence/asset-provenance.json]
dependencies: [Q-001 (styles.css/Panels.tsx overlap - rebase after it merges), Q-003 (level-pip clamp subsumed here), Q-004 (owns the motion clock, not this geometry)]
review_required: true
---

# REV-Q2SPEC - implementation-ready spec for Q-002 (gen 3, id `rev-q2spec-g3`)

- Numbers below were measured against `3f1b4ac4427a362e038cc1f6f1d95ae0c1a51204`.
- Reviewer checkout: `C:\Users\ryans\.local\share\opencode\worktree\fe4e05\review-r1` (detached at that SHA, production files unmodified, `npm install` already run there).
- Inputs: `work/review/REV-BASE.md` findings R-03 (grid never hidden), R-04 (one amber primitive, four meanings), R-10 (luminance + separator gaps). This file is the task spec, not a new verdict.
- Image capability, verified first this session: one repository PNG consumed (`docs/screenshots/latest-mobile.png`, 390 x 844 @2x). Three visible facts: (1) the 6 x 6 grid is fully visible with no panel open and no build mode; (2) the HUD second row reads `Store105/900` with no separator and the amber level bars run past their cells into the neighbour; (3) the seven machine bodies are the same nested rectangle, the wreck is a rust-outlined pentagon with an amber pip and three cyan teeth, and the two drones under it are two identical cyan triangles at one point.
- Reproduce the measured draw numbers: `npx tsx probe-scene-g3.mts`, `npx tsx probe-mask-g3.mts` (both in this worktree root, read-only stub-context harnesses, untracked).

## 1. Scope files

| File | Change | Why this file |
|---|---|---|
| `src/game/renderer/scene.ts` | replace the 6 primitive painters with table-driven sprite painters; gate the grid on `options.buildMode` only; add `drawSpriteSheet()` export; keep `Camera`/`DrawOptions`/`fitCamera`/`tileToWorld`/`worldToScreen`/`screenToWorld` signatures byte-identical | the only module that touches canvas ops (ARCHITECTURE layer `Presentation`) |
| `src/game/renderer/sprites.ts` (new) | the authored data: `PALETTE` (moved here, one source), `PARTS` geometry table (section 2), `AMBER_SHAPES`, `FEATURE_MIN_UNITS = 2` | a data table keeps the art reviewable as text and makes every acceptance number assertable |
| `src/ui/styles.css` | `:root` only: mirror the `PALETTE` hexes 1:1, add `--floor`, `--body-light`, `--body-mid`, `--well` | the renderer and the HUD must not drift apart on the same 8 colours |
| `src/ui/Hud.tsx` | `DOT_COLORS` only: reference the shared `PALETTE` entries instead of retyping 5 hexes | same drift guard; no behaviour change |
| `scripts/capture-style.mjs` (new) | one capture script: phone/desktop contexts, FS-1 fixture, four states, pixel-sample JSON, silhouette sheet | matches the existing `scripts/capture.mjs` lease/viewport convention |
| `tests/renderer/scene-draw.test.ts` (new) | deterministic draw-bound tests with a recording stub context | `drawScene` takes `ctx` as a parameter, so jsdom needs no canvas package |
| `docs/evidence/2026-11-03-style-slice.md`, `docs/evidence/asset-provenance.json` | the numeric receipt and the manifest | DESIGN_BIBLE line 33 provenance manifest, AGENT_WORKFLOW evidence cadence |

Out of scope (do not touch here): `src/game/simulation/*`, `src/game/audio/audio.ts`, `src/ui/Panels.tsx` (Q-001), the DOM structure of `.hud`/`.dock`, `vite.config.ts` (`base` is VITE-BASE), the resource icon set (later task after this slice passes).

## 2. The one reference scene (RS-1), per DESIGN_BIBLE `First approved style slice`

The bible (line 37) fixes the content: opening wreck, dock, two machines, moving drone, resource collection, build preview, one contextual panel. Nothing else is in the slice; the other six blueprints stay as-is until this slice passes.

### 2.1 Deterministic fixture FS-1 (drives both the unit test and the captures)

Replay in this exact order; the numbers in 3A-3D are only valid for this fixture.

1. `createInitialState()`
2. six x (`manual.salvage`, then `advance(state, 6)`)
3. `drone.repair`, `advance(state, 20)`
4. top-up (test-only, so the fixture is labelled `seeded`, never `organic`): `store.scrap=400`, `store.ferrous=200`, `store.nonferrous=200`, `storeUnits=800`, `storeCapacity=900`, `credits=900`
5. `machine.build` `sorter` on tile 8; `machine.build` `furnace` on tile 14
6. `route.connect` from=0 to=1 filter=`scrap`; `route.connect` from=1 to=2 filter=`ferrous`
7. `advance(state, 1)` until `state.tick === 344` (stop there)

Measured state at tick 344 (verified with the stub harness): `sorter@tile8 L1 status=running tray=0`, `furnace@tile14 L1 status=outputFull tray=1`, `routes items = [1, 2]`, `drone.inFlight` present, `storeUnits = 770`. Tick 344 is chosen because it is the first tick of this fixture where both links carry cargo and the drone is airborne at the same time, so the collection state is visible in a single still. The browser capture installs the same state through the existing `localStorage` envelope path (`rustwake.save.v1`), so the screenshot is the real app, not a re-implementation.

### 2.2 Exact object list of RS-1 (9 drawn entities + 8 floor-kit marks, all in one column of focus)

| # | Object | Tile / world position | Sprite id | State in FS-1 | Required distinguishing parts (world units, origin = cell centre, y down) |
|---|---|---|---|---|---|
| 1 | opening wreck | fixed `WRECK_POSITION` = (80, 206.4) | `wreck` | `remaining 18/30` | W1 pentagon hull 44 x 28 `body-mid`; W2 1-unit `rust` outline; W3 three amber pips 2x2 (2 x 2 gap 1) = remaining band; W4 hull shadow 24 x 2 `well`; W5 three 3x3 `rust` shards at (-30,12) (26,-4) (30,10) |
| 2 | salvage dock + pad | `DOCK_TILE` = 2 (col 2, row 0), centre (80, 16) | `dock` | 770/900 | D1 pad 26 x 20 `body-mid`; D2 4 corner landing ticks 3 x 2 `cyan`; D3 loading-arm post 2 x 8 at (9, -2) + 4 x 2 foot; D4 store gauge 5 pips 2 x 2 (gap 1) `amber`, filled = `clamp(ceil(ratio x 5), 0, 5)`; D5 pad shadow 26 x 2 `well` |
| 3 | sorter | tile 8 (col 2, row 1), centre (80, 48) | `sorter` | running | S1 body 24 x 22 `body-light`; S2 three roller bars 18 x 2 `well` at y -6, -2, 2 (this is the identity mark); S3 split chutes: left 8 x 2 at (-9, 7), right 8 x 2 at (2, 7); S4 amber tray token 3 x 3 at (8, -13) when `trayUnits > 0`; S5 status accent 6 x 2 at (-9, 10); S6 level pips 2 x 2 `body-light` (<= 3) + digit at level > 3 |
| 4 | furnace | tile 14 (col 2, row 2), centre (80, 80) | `furnace` | outputFull | F1 chamber 20 x 16 `body-light`; F2 chimney 4 x 6 `body-light` at (7, -14) (identity mark, breaks the square outline); F3 intake slot 8 x 2 `well` at (-5, -6); F4 amber glow circle diameter 4 at (0, 2), only while `running`; F5 rust band 4 x 2 over the chimney when `outputFull`; F6 level pips as S6 |
| 5 | cargo drone | on the wreck-dock leg at the FS-1 `t` | `drone` | `inFlight` | DR1 body 6 x 4 `cyan`; DR2 rotor bars 4 x 2 at (-5, -3) and (1, -3); DR3 cargo pod amber 3 x 3 when `inFlight` carries units, else `body-mid`; DR4 2 x 2 `select` nose at the heading end (orientation mark); DR5 shadow ellipse rx 5 ry 2 alpha 0.35 |
| 6 | resource collection | route items on both links | `cargo token` | 3 tokens | amber token 3 x 3 per in-transit item (replaces today's 4 px unscaled square) |
| 7 | build preview | ghost tile 20 (col 2, row 3) | `ghost` | valid | 1.5-unit `cyan` 28-unit box + 2 x 2 check/cross mark (existing shapes, snapped) |
| 8 | one contextual panel | DOM `.panel` (machine panel for the sorter) | - | open | unchanged DOM (Q-001 owns the panel; the slice only needs it on screen) |
| 9 | link lines | 2 links | `route` | - | 2-unit `cyan` 0.5-alpha lines, unchanged geometry |

Floor kit (drawn once, below all objects, inside the 192 x 192 yard panel): FK1 worn path band 6 units wide along column x = 64..70 from y = 96 to y = 196 in `path`, plus a 6-unit spur to the dock; FK2 drainage line 2 units at y = 190, x 8..184 in `drain`; FK3 three puddles ellipse rx 10 ry 3 alpha 0.14 at (24, 200) (88, 204) (150, 198); FK4 perimeter rail 2 units at y = 0 and y = 192 with 2 x 3 posts every 16 units in `shadow`; FK5 two crates 5 x 5 `body-mid` with 5 x 2 `body-light` tops at (104, 12) and (112, 16); FK6 power pole 2 x 10 with a 2-unit sagging cable to (40, 2); FK7 object shadows (2-unit ellipses under every entity); FK8 two 3-unit gravel ticks per empty cell corner at alpha 0.5. No random placement: every coordinate above is fixed, so the frame is byte-reproducible.

Draw order (asserted in 3D-4): sky -> yard panel -> floor kit -> grid (build mode only) -> links + tokens -> wreck -> dock -> machines in `state.machines` order -> drone -> ghost/selection -> sheet overlay when enabled.

### 2.3 Palette (one source: `PALETTE` in `sprites.ts`, mirrored in `styles.css :root`)

Computed with the WCAG relative-luminance formula against the composited floor. `s` = `camera.scale`: 1.8056 at 390 px, 1.6667 at 360 px, 1.9074 at 412 px, 3.9074 at 844 px, 4.0 at 1440 px.

| Key | Hex | Rel. lum. | Contrast vs floor | Role band |
|---|---|---:|---:|---|
| `night` | `#0b1220` | 0.0061 | 1.545 | page/sky |
| `nightDeep` | `#080d18` | 0.0041 | 1.603 | backdrop outside the yard panel |
| `floor` | `#22384a` | 0.0366 | 1.000 | yard panel (solid, no alpha) |
| `bodyLight` | `#8aa9c4` | 0.3776 | 4.937 | machine bodies |
| `bodyMid` | `#7f9fbb` | 0.3290 | 4.375 | dock/pad/crates |
| `wreck` | `#6d90ab` | 0.2614 | 3.594 | wreck hull |
| `well` | `#0e1726` | 0.0085 | 1.482 | interiors, roller gaps |
| `amber` | `#ffb765` | 0.5607 | 7.049 | exactly 3 shapes (3B-3) |
| `cyan` | `#5fd8e8` | 0.5737 | 7.200 | links, drone, focus |
| `rust` | `#c9713a` | 0.2453 | 3.409 | wreck outline, invalid ghost |
| `violet` | `#8a7ad8` | 0.2428 | 3.380 | starved accent |
| `select` | `#f4f7fb` | 0.9272 | 11.280 | selection |
| `path` | `#2c4257` | 0.0512 | 1.168 | texture band |
| `drain` | `#16283a` | 0.0199 | 1.239 | texture band |
| `puddle` | `#35566b` | 0.0847 | 1.555 | texture band |
| `shadow` | `#101b28` | 0.0105 | 1.433 | texture band |

Texture-band rule: floor-kit contrasts stay inside [1.15, 1.60] so they read as ground, while every object role is >= 3 - the hierarchy `texture < wreck < machine < amber/cyan` must hold in the measured numbers, not by eye. Today the same three samples are 1.24 (floor vs backdrop), 1.30 (wreck vs floor) and 2.00 (machine vs floor), which is why the current frame reads as one flat navy sheet.

## 3. Acceptance checks (all numeric; all reproducible from section 2)

### 3A. Context-only grid (from R-03)

The stub context records every call as `{op, style, args}` in call order. The grid is identifiable without name-based assumptions because it is the only painter that sets `strokeStyle` to the grid hex (`#6f93ad` at 0.22 alpha).

| ID | Check | Required value | Measured today |
|---|---|---|---|
| A1 | at rest (`buildMode: false`, `selected: null`): count of `stroke()` calls with the grid style | **0** | 1 |
| A2 | build mode (`buildMode: true`, ghost tile 20): grid `stroke()` calls | **1**, and that path holds exactly 14 segments ((COLS+1)+(ROWS+1) = 7+7 `moveTo`/`lineTo` pairs) | 1 (segments unchanged) |
| A3 | selected-cell highlight | drawn with its own `select` style, so A1/A2 stay exact; 1 extra `stroke()` when `selected !== null` | n/a (today no highlight exists) |
| A4 | A1/A2 hold at every fitted scale | pass at 1.4 (clamped), 1.6667, 1.8056, 1.9074, 3.9074, 4.0 | fails at 360/390/412/844/1440 |
| A5 | pixel check on the composited canvas: sample the 3x3 modal RGB at the centre of an empty cell (tile 15, world (112, 80) -> screen (223.9, 364.2) at 390 px) | at rest equals the floor hex within 2 per channel; in build mode differs from it | not measured yet |

### 3B. Silhouette identity, amber budget, feature floor (from R-04)

The sheet is drawn by `drawSpriteSheet(ctx, view)` from the same `PARTS` table: six role rows at s = 1.8056 plus a second row set at s = 4, desaturated by drawing with the grey steps of the same palette indices (no CSS filter, so the PNG is the evidence).

| ID | Check | Required value | Measured today |
|---|---|---|---|
| B1 | six grayscale silhouettes (dock, wreck, sorter, furnace, wire mill, signal lab) named correctly by two independent readers, labels hidden, at s = 1.8 | 6/6 for both readers; 6/6 by one reader plus a documented second pass is acceptable only if the same sheet is re-read later | 7 bodies, one rectangle |
| B2 | rect-coverage masks: per role, an 8x8 binary mask over its 32-unit cell, built from the recorded draw log; minimum pairwise Hamming distance over all 15 pairs | **>= 12/64 for every pair** | 2/64 (sorter/furnace), 6/64 (sorter/dock), 8/64 (furnace/dock) |
| B3 | amber shapes: distinct painted `(w, h)` tuples over the whole RS-1 frame, in world units | exactly **3**: `pip` 2x2, `token` 3x3, `glow` diameter 4 | 4 kinds (dock gauge 28.89 x 13.90 px, level bar 7.94 x 3.61, tray 9.03 x 9.03, route token 4 x 4 unscaled) |
| B4 | minimum painted feature height at s = 1.8056 | **>= 3.0 CSS px** for every recorded shape, i.e. every table height >= 2 world units | min 0.00 px and 1.35 px (zero/tiny ratio-driven fills); amber gauge 0.18 px at 10/900 |
| B5 | ratio-driven fills are quantised, not continuous | pips only: level 1-3 pips plus a digit from level 4 up, store gauge 5 pips, progress as 1-5 pips; no `height = k x ratio` rect anywhere (this also satisfies Q-003: bar right edge <= 12 units, tray inside +/- 16) | continuous |
| B6 | every object fits its cell | all recorded coords within centre +/- 16 units (the 32-unit tray), for levels 1..40 and tray 0..12 | bar overflow measured in R-02 |
| B7 | drone orientation | the `select` nose mark sits on the heading side in both phone captures; the two-unit shadow ellipse is present; under `reducedMotion` every unit keeps its `leanUnits = 4` lateral offset so 5 units read as 5 | one triangle per unit, collapsed |

### 3C. Luminance hierarchy (from R-10)

Sampled on the composited canvas with `ctx.getImageData` inside the running page (no assumptions from source), modal RGB over a 3x3 neighbourhood, then the WCAG ratio. Fixed sample points for FS-1 at 390 x 844 @2, computed from `worldToScreen` at s = 1.8056 (record the coordinate actually used; if a point lands on a sub-part, step to the nearest pixel inside that part box): backdrop (10, 10), empty-cell floor (223.9, 422.0), wreck hull (166.1, 592.4), machine body top strip (166.1, 289.0), machine interior/well (166.1, 310.0), dock pad (150.0, 235.0), amber token (166.1, 271.8).

| ID | Pair | Required | Measured from source constants |
|---|---|---|---|
| C1 | floor vs backdrop | **>= 1.5** | 1.603 |
| C2 | wreck hull vs floor | **>= 3** | 3.594 |
| C3 | machine body vs floor | **>= 4.5** | 4.937 |
| C4 | dock pad vs floor | >= 3 | 4.375 |
| C5 | amber and cyan tokens vs floor | >= 4.5 | 7.049 / 7.200 |
| C6 | every floor-kit mark vs floor | inside [1.15, 1.60] and channel delta >= 6 | 1.168 / 1.239 / 1.555 / 1.433 |
| C7 | identical ratios at both widths and at both dpr settings | same table within 0.05 | not measured yet |

The floor must be a solid hex (no alpha layering), so C1-C6 are reproducible without knowing the composite stack. Alpha is allowed only on `puddle` and the drone shadow, and those two are measured, not computed.

### 3D. Deterministic draw-bound tests (new file `tests/renderer/scene-draw.test.ts`)

`drawScene` already takes the context as a parameter, so the test passes a plain recording object cast to `CanvasRenderingContext2D`; jsdom needs no canvas package and no new dependency. Recorded tuple: `{op, fillStyle, strokeStyle, args}` in call order. Paints = `fill | stroke | fillRect | strokeRect | fillText | ellipse`.

Baselines measured at this SHA with the stub harness (FS-1, 390 x 844, `s` 1.8056; mature = `docs/evidence/yard-mature.json`):

| Frame | total ops | paints | grid strokes | amber ops |
|---|---:|---:|---:|---:|
| RS-1 rest | 109 | 31 | 1 | 4 |
| RS-1 build | 116 | 33 | 1 | 4 |
| RS-1 selected | 114 | 32 | 1 | 4 |
| RS-1 rest at 1440 x 900 (`s` 4) | 109 | 31 | 1 | 4 |
| mature rest | 268 | 85 | 1 | 12 |
| mature build | 275 | 87 | 1 | 12 |

| ID | Check | Required value after the change |
|---|---|---|
| D1 | paint ceiling, RS-1 rest / build | <= 80 / <= 90 |
| D2 | paint ceiling, mature rest | <= 240 |
| D3 | per-entity growth caps | <= 12 paints per machine, <= 3 per link, <= 5 per drone, <= 40 fixed (40+96+54+25 = 215 for the mature seed) |
| D4 | determinism | the recorded op arrays of two consecutive `drawScene` calls on the same frozen state are element-wise identical (this also proves no `Math.random` or wall-clock read entered the render path) |
| D5 | draw order | op index 0 is a `fillRect` covering the whole view; the first grid-class stroke (build mode only) precedes the first wreck/pad/machine paint; the ghost is the last shape group |
| D6 | pixel-grid snapping | every recorded coord satisfies `Math.round(v x 2) === v x 2` (half-CSS-px = one device px at dpr 2), and `imageSmoothingEnabled === false` |
| D7 | amber accounting | amber ops in RS-1 <= 12 and only the three `AMBER_SHAPES` sizes appear (3B-3) |
| D8 | first-frame completeness | on the very first `drawScene` after the start gesture, all 9 RS-1 entities plus the 8 floor-kit marks have a non-empty mask in their boxes (no decode race is possible with the chosen strategy, and this pins that) |
| D9 | status accents | five distinct accent hexes are reachable from the six `MachineState.status` values (the fifth accent is R-08/Q-007; Q-002 must reserve the hue and keep `powerLimited` on its own colour) |

### 3E. Regression floor (nothing here may go red)

| ID | Check | Required |
|---|---|---|
| E1 | `npm test` | >= 172 tests green, 0 skipped-by-deletion; no existing assertion relaxed |
| E2 | `npm run typecheck`, `npm run build`, `npm run validate` | clean; `content: 0 violation(s)` |
| E3 | built JS size | `dist/assets/index-*.js` <= 229000 bytes (baseline at this SHA: 224968 bytes, gzip 70.28 kB) |
| E4 | touch targets | `tests/ui/hud-layout.test.ts` still measures 44/46 px minimums at 360 x 640, 390 x 844, 844 x 390 and text scale 2.0 |
| E5 | save compatibility | the same command list still yields the same checksum, and `schemaVersion` is unchanged |
| E6 | no new runtime dependency, no `vite.config.ts` `base` change, `getContext` still called once | all three hold |

Run order for the developer: `npm test` -> `npx tsx probe-scene-g3.mts` -> `npm run build` -> `npm run preview` (background) -> `node scripts/capture-style.mjs`.

## 4. Asset strategy decision: code-drawn vector parts, not hand-authored pixel atlases

**Chosen: table-driven, code-drawn parts (`sprites.ts` PARTS + `scene.ts` painters). Atlases stay deferred.**

One-line rationale: with the built JS pinned near its 224,968-byte baseline, hand-authored atlases cost both bundle bytes (Vite inlines any asset under the 4 kB `assetsInlineLimit` as base64, about 1.33x on disk) and first-frame risk (an undecoded `HTMLImageElement` paints nothing on the first `requestAnimationFrame`), while a 60-row integer part table costs a few hundred gzip bytes, paints completely on frame 1, snaps to the device pixel grid at the non-integer scales this app uses (1.8056, 1.9074, 3.9074), and is the only form in which 3B/3D can be asserted numerically.

Supporting points:

1. Budget arithmetic. The slice needs 6 role sprites + drone + 8 floor marks. At roughly 6 parts each that is about 90 integer tuples: well under 1 kB of gzip. A 6-role PNG atlas at the desktop scale 4 needs about 512 x 512 px of 8-bit indexed art: 6-18 kB on disk, and 8-24 kB of base64 inside the JS bundle if it lands under the inline limit.
2. Determinism. The op-log tests in 3D need stable coordinates. Sprite sheets introduce decode-order and resample variance (`imageSmoothingEnabled` is on for the whole context today, line 87 turns it off, which is the right setting for nearest-neighbour atlases but must be re-verified if atlases ever arrive).
3. Consistency conditions from DESIGN_BIBLE line 33 (one perspective, one light direction, one pixel density, one palette, one shadow style) are enforced by construction: the palette and the light direction (top-left, 2-unit shadow) are single constants, and the part table cannot drift per-role the way separate PNGs can.
4. The bible explicitly allows it (line 27: code-generated art is allowed if it meets the same visual standard), and the acceptance gate is the visual standard itself - 3B and 3C - not the file format. Recolouring the existing blocks is excluded by 3B-1/3B-2 (a >= 12/64 mask separation cannot be reached by recolouring identical geometry).
5. Provenance: `docs/evidence/asset-provenance.json` records, per role, `{id, sourceModule, author, license, paletteVersion, generatedFrom (SHA), toolVersion, partsCount}` plus the FS-1 command list and tick, so the `editable source and export metadata` ask is met without a binary pipeline.

Reopen condition (record it in `DECISIONS.md` next to D-01): if a later slice needs more than about 200 simultaneously animated entities, or a real-device trace puts Canvas 2D above the 10 ms p95 budget (B-08), move to a pre-baked atlas built from this same part table so the numbers above stay valid.

## 5. Evidence list (what the reviewer will be handed)

Every artifact carries the same header block: candidate SHA, viewport, `deviceScaleFactor`, scenario id (`FS-1` or `seeded-mature`), provenance (`seeded` for installed envelopes, `organic` only for the click-through session), timestamp, Playwright/Chromium version. A capture without that block is not acceptance evidence (AGENT_WORKFLOW, Evidence cadence).

| # | Artifact | Context | Scenario | Proves |
|---|---|---|---|---|
| E1 | `docs/screenshots/slice-phone-rest.png` | 390 x 844, dpr 2, `isMobile`, `hasTouch` | FS-1, no panel open | A1/A5, B1, C1-C6, no grid at rest, focal column readable |
| E2 | `docs/screenshots/slice-phone-build.png` | same | FS-1, build mode, ghost on tile 20, picker open | A2/A3, ghost legibility, amber budget with 4 kinds on screen |
| E3 | `docs/screenshots/slice-phone-mature.png` | same | `seeded-mature` (`docs/evidence/yard-mature.json`: 8 machines, 5 drones, 18 links) | crowded-yard composition, 3D-2/3 ceilings, token density |
| E4 | `docs/screenshots/slice-phone-landscape.png` | 844 x 390, dpr 2 | FS-1 | the short-viewport media query still shows the whole focal column |
| E5 | `docs/screenshots/slice-desktop-rest.png` | 1440 x 900, dpr 1 | FS-1 | C7, margins, 2-unit hairlines at s = 4 |
| E6 | `docs/screenshots/slice-desktop-build.png` | 1440 x 900, dpr 1 | FS-1, build mode | A2 at s = 4 |
| E7 | `docs/screenshots/slice-desktop-mature.png` | 1440 x 900, dpr 1 | `seeded-mature` | wide-screen framing, no flat navy voids |
| E8 | `docs/screenshots/slice-sheet-silhouette.png` | sheet page, rows at s = 1.8056 and s = 4 | six roles + drone, desaturated | B1/B2 with the mask strings printed beside it |
| E9 | `docs/evidence/2026-11-03-style-slice.md` | - | - | the numeric receipt: pixel-sample table with modal RGBs and ratios, 8x8 mask strings + the 15-pair Hamming matrix, op counts per frame, byte sizes, and the header block |
| E10 | `docs/evidence/asset-provenance.json` | - | - | per-role manifest (section 4 point 5) + FS-1 command list and tick |

Explicitly not claimed by this evidence set, and therefore not to be marked passed: the motion gate (no frame sequence here - the bible line 45 requires a real short capture, owned by Q-004), the audio gate (Q-005, B-11 listening still blocked), real-device trace (B-08), human first-feel comprehension (B-09). A reviewer must keep those rows pending even if E1-E10 all pass.

## 6. Dependencies and what must not change

Dependencies and ordering:

1. **After Q-001 merges.** Q-001 owns `src/ui/Panels.tsx` and most of `src/ui/styles.css`; this task touches only the `:root` block and `DOT_COLORS`, so the conflict surface is two hunks, but the rebase must be on the merged main so the palette mirror test sees the final file.
2. Q-003 (R-02 bar clamp) is **subsumed** by 3B-5/3B-6: pips inside +/- 12 units satisfy its clamp assertion by construction. If Q-003 lands first, keep its clamp test and add the pip table on top; if Q-002 lands first, Q-003 closes on the 3B-5/3B-6 lines.
3. Q-004 owns the **motion clock** (interpolated `t` from the frame delta, per-unit `lean` in world units). This task owns the **geometry** in the part table, including `leanUnits = 4` and the shadow. Single-writer rule: `t` computation stays in `drawDrone` (Q-004), shape constants stay in `sprites.ts` (Q-002).
4. R-08/Q-007 (fifth status accent) may land before or after; the accent hue table in `sprites.ts` has one slot per status value so both landings are one-line edits.
5. Publisher runs the standard gate set; no deployment is implied by a documentation-plus-renderer change until the visual review is accepted.

Must not change (each is checkable against the current source at this SHA):

- `TICK_MS = 100` and `TICKS_PER_SECOND` (`content/defs.ts`), the 10-phase tick order in `engine.ts`, every `TUNING` value including `droneTravelTicks = 10`, `fleetCap = 5`, `dockCapacity = 900`, `routeLatencyTicks = 5`.
- State/footprint schemas: `SimState`, `MachineState`, `DroneState`, `RouteState` field sets in `simulation/types.ts`; `BlueprintDef.footprint = [1, 1]` for all eight blueprints; `YARD_COLS = 6`, `YARD_ROWS = 6`, `YARD_TILES = 36`, `DOCK_TILE = 2`; `CELL = 32`, `WORLD_W = 192`, `WORLD_H = 224`, `WRECK_POSITION = (80, 206.4)`.
- Save layer: `schemaVersion`, the checksum algorithm, the `rustwake.save.v1` / `rustwake.lease.v1` keys, the 1500 ms lease TTL.
- Hit areas and the pointer contract: `TAP_THRESHOLD`, `clampAxis`, the pinch range 1.2-6, `worldToTile` rounding, `onPointerUp` selection, and the DOM targets (44 px minimum, 46 px dock). The floor-kit marks are non-interactive by construction because selection maps tile-to-tile, so no kit mark may grow past 16 units from a cell centre and no kit mark may sit inside an object box.
- `Camera`/`DrawOptions` field names and `fitCamera` clamp `max(1.4, min(4, width / (WORLD_W + 24)))`; `imageSmoothingEnabled = false`; `ctx.setTransform(dpr, ...)` with dpr clamped to [1, 2].
- Test expectations: no existing assertion is edited to accommodate the new numbers; new expectations are added (E1).

## 7. Unverified dimensions, and the reviewer queue this spec sits in

Unverified by this file (authored spec, no new browser run): the composited-canvas ratios (C1-C7 are computed from the constants and must be re-measured by the capture script), the 6/6 naming pass (needs two readers), motion, audio, real-device trace, organic first-minute progression at this SHA. The measured values in 3A/3B/3D come from the stub harness over the checked-out source, so they are deterministic and re-runnable, but they are not screenshots.

Prioritized next-five (presentation area):

1. **Q-002 as specified here** - it is the gate for every later art pass and it converts two 1-score rubric categories into measurable ones.
2. **Q-003** - closes on 3B-5/3B-6 once the pip table exists (one bounded unit test if it stays separate).
3. **Q-004** - interpolated motion with the frame clock, `leanUnits` spacing, per-unit offsets under reduced motion, plus the 5-second clip that unlocks the motion gate.
4. **Q-007 (from R-08)** - the fifth status accent with a draw-colour test pinning all five statuses to five distinct hexes.
5. **Q-008 (from R-10)** - keyboard selection cycling, then the resource/control icon set as the second art slice once this one passes.

Verdict protocol for the developer handoff: the reviewer scores against 3A-3E only, on the exact candidate SHA, and returns `accept | rework | blocked` with the numbers it observed. The scene-composition and asset-identity categories may move from 1 to >= 3 only with E1-E8 attached; a completion note without them keeps the task at `review-ready`.

Report path: `review-r1/rev-q2spec-g3.md`. Candidate SHA: `3f1b4ac4427a362e038cc1f6f1d95ae0c1a51204`. Task file for the tracked inbox copy: `work/review/inbox/Q-002.md` (publisher imports).
