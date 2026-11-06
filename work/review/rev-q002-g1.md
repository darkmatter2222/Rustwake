# REV-Q002-G1 — independent review of the Q-002 style slice

- Candidate SHA: `c659cf812bc2316b3be70125a4a80c5f76dd634b` (origin/main, `docs(publisher): PUB-9 …`).
- Reviewer checkouts: `C:\Users\ryans\.local\share\opencode\worktree\fe4e05\rev-q002-g1` (my own worktree, `git checkout --detach c659cf8…`, used for all measurements) and the shared `review-r1` worktree (report artifacts). Production files unmodified in both.
- Head movement note: while this review ran, `main` advanced past `c659cf8` to `090260a`, which adds `docs/evidence/2026-11-03-style-slice.md`, `docs/evidence/asset-provenance.json` and a regenerated sheet (13 652 B) plus a rewritten `scripts/capture-style.mjs`. All numbers below were taken against the pinned candidate `c659cf8` (verified by `git rev-parse HEAD` before and after the probe runs); differences against the later head are called out where they matter. At submission time the canonical checkout reads `main = 9fca373`; the verdict scope stays `c659cf8` (my worktree still reports that SHA with a clean `git status --porcelain`), so the later commits are, in this review's terms, still-unreviewed additions whose content matches what B-6 describes as absent-at-candidate.
- Spec: `work/review/REV-Q2SPEC.md` (gen 3), checks A/B/C/3D, gates 3A–3E. Verdict scope: this SHA and this slice only.
- Image capability verified first in this session: **7** repository PNGs consumed one at a time (`slice-phone-rest`, `-build`, `-mature`, `-one-machine`, `slice-desktop-rest`, `-mature`, `slice-sheet-silhouette`), each as a separate read. Visible facts are quoted per image below. (`slice-desktop-build.png` is the eighth artifact; its pixels are covered by the numeric decoder, it was not viewed as an image.)
- Motion, audio listening, real-device trace and organic first-minute progression stay explicitly unverified (section 6).

## Verdict: **rework** (6 bounded findings, B-1 … B-6; the code itself is accepted as-is — findings 1, 3, 6 are evidence/harness work, 4 and 5 are ≤ 20-line table edits)

The renderer work is good: the grid is genuinely context-only, the six authored roles are separable at phone scale, the palette hierarchy is real (measured on the composited canvas, not quoted), and the paint budget has wide margin. The reason for rework is that the shipped evidence does not currently prove two of the gates it claims (C4/C5, B1), the captured FS-1 is not the state the draw-bound tests assert, and two numeric authoring choices (drone lean, missing PARTS rows) leave defects visible in the phone frame.

## 1. Re-run of the technical gates (my own run, this SHA)

| gate | required | measured here | result |
|---|---|---|---|
| `npm ci` | clean | clean (5 audit notices, same as prior heads) | pass |
| `npx vitest run` | 23 files / 206 tests at this head | `Test Files 23 passed (23)`, `Tests 206 passed (206)`, 0 skipped, 5.23 s | pass |
| `npm run typecheck` | clean | no output | pass |
| `npm run build` | clean | 53 modules; `dist/assets/index-CmwRilug.js`, `index-Cwg_kGXQ.css`, `catchup.worker-DphWaCEx.js` | pass |
| `npm run validate` | `content: 0 violation(s)` | `content: 0 violation(s) in 3 ms`; `behaviour: … machines=8 links=18 drones=5 … 0 violation(s)` | pass |
| exact bytes | publisher: js 232754, css 7224 | `index-CmwRilug.js = 232754 B`, `index-Cwg_kGXQ.css = 7224 B`, worker `= 13015 B` (gzip 73.57 kB / 2.15 kB from vite) | byte-exact match with the publisher |
| E6 | no new runtime dep, `base` unchanged, one `getContext` | deps `react`, `react-dom` only; `base: "./"` unchanged (5 inserted lines in `vite.config.ts` are comment/`build.target` block); `getContext` once (`src/ui/App.tsx:146`) | pass |

`tests/renderer/scene-draw.test.ts` = **13** `it` cases (A1/A2, A3/A4, D1/D2, D3, D4, D5, D6, D7, B4/B5/B6, B2, D9, B7, E6). My own stub-context run (independent of the committed file, `probe-draw-g1.mts`) reproduces the frame census:

| frame | total ops | paints | grid strokes | amber ops | ceiling | result |
|---|---:|---:|---:|---:|---|---|
| RS-1 rest (390×844, s 1.8056) | 205 | 61 | 0 | 5 | ≤ 80 | pass |
| RS-1 build (ghost 20) | 236 | 64 | 1 | 5 | ≤ 90 | pass |
| RS-1 selected | 207 | 62 | 0 | 5 | — | pass |
| RS-1 rest @1440×900 (s 4) | 205 | 61 | 0 | 5 | — | pass |
| mature rest (8 machines, 18 links, 5 drones) | 415 | 182 | 0 | 24 | ≤ 240 and ≤ 215 (D3) | pass |
| mature build | 446 | 185 | 1 | 24 | — | pass |

Additional invariants I measured myself: D4 two consecutive draws element-wise identical (236 ops); D6 0 off-grid coordinates at 360/390/412/844/1440 and `imageSmoothingEnabled === false`; minimum painted height 3.5 CSS px at 360/390 (4.0 at 412, 8.0 at 844/1440) → 3B-4 ≥ 3.0 px holds at every fitted scale; 1 `fillText` per FS-1 frame (the level digit appears only from level 4); B2 Hamming minimum **13/64** (sorter/furnace and furnace/signalLab), all 15 pairs ≥ 12.

## 2. E3, size ceiling decision for this candidate

**Decision: ceiling = 232 800 B for `dist/assets/index-*.js` at `c659cf8`. E3 is evaluated: pass.**
Ceiling history, each step tied to one measured integration: 229 000 B (spec 3E at `3f1b4ac`, measured 224 968) → 231 000 B (after Q-005, measured 230 892) → **232 800 B** (this head, measured 232 754, headroom 46 B). Rule for the next integration: re-measure and set the ceiling to the measured value rounded up to the next 100 B; a step larger than +1 000 B needs a one-line reason in the handoff. No shed requested: 232 754 B is 15 302 B of growth over `3f1b4ac` for the whole presentation layer plus the audio graph, and gzip is 73.57 kB.

## 3. Captures and the pixel JSON, checked numerically

Method: my own PNG decoder (zlib inflate + the 5 PNG filter types, no dependencies), plus the deterministic draw list from the stub context, plus `worldToScreen`. Frame cross-check: with `view = 390×844, s = 1.8056` the predicted floor rect is `x 43.4, y 439.6, 693×693 device px`; the PNG gives `x[43..735]` and the first floor row `447` = 439.6 + the 2-unit rail → the analytic frame is exact, so every sample can be attributed to a part.

Verified numerically (all 7 cases × 7 points): every RGB triple in `docs/evidence/2026-11-03-style-slice-pixels.json` reproduces at my independently computed device coordinates (`match=true` for all 49 samples) → the shipped JSON is an honest measurement of those pixels. Independently confirmed on the composited canvas: floor `#22384a` (34,56,74), backdrop `#0b1220` (11,18,32), WCAG **C1 = 1.545** (≥ 1.5), **C2 = 3.594** (≥ 3), **C3 = 4.937** (≥ 4.5), `well` 1.482, `bodyMid` 4.375, `amber` 7.049, `cyan` 7.200, `select` 11.280 — so the palette and the luminance hierarchy are real, and the two "problem" rows are sampling artefacts, not palette defects.

Rows that do **not** measure their named part (see B-1): `dockPad` = `244,247,251` (`select`, ratio 11.28) is the drone nose mark; `amberToken` = `60,54,51` (ratio **1.02**, below its own 4.5 limit) is the amber pip under 4 stacked 0.35-alpha drone shadows — the arithmetic fits: `1 − 0.65⁴ = 0.821`, `0.821·(16,27,40) + 0.179·(255,183,101) = (59,55,51)`.

Ink/purity numbers I measured (my definitions, printed by the probes):

| case | panel device bbox | ink in panel | distinct colours | cells with ink (of 36) | min cell ink |
|---|---|---|---:|---|---|
| phone-rest | x[43..735] y[447..1125] | 40 265 / 470 547 = **8.56 %** | 185 | **36 → 100.0 %** | 231 px |
| phone-build | same | 55 265 = 11.76 % | 192 | 36 → 100 % | 471 px |
| phone-mature | same | 85 423 = 18.15 % | 568 | 36 → 100 % | 242 px |
| phone-one-machine | same | 33 339 = 7.09 % | 185 | 36 → 100 % | 231 px |
| desktop-rest | x[336..1103] y[10..761] | 58 199 / 577 536 = 10.08 % | 305 | 36 → 100 % | 288 px |
| desktop-mature | x[336..1103] y[114..761] | 50 557 = 10.16 % | 155 | 36 → 100 % | 288 px |

So the handoff's "100 % ink coverage" holds under my definition (every one of the 36 cells contains ≥ 231 painted pixels) and is not an artefact of the whole-canvas average. Two rows are informative: in `phone-mature` the middle rows (tiles 18–29) carry only ~242 px of a 13 225-px cell = **1.8 %** each, against 63 % in tile 2 → the seeded crowded yard is a 2-row band over an empty board (finding B-6). Silhouette purity: B2 minimum 13/64 confirmed from the table; the sheet artifact carries **0** neutral-gray pixels of 1 478 314 ink pixels and **0** pixels of four of its five declared gray steps (finding B-3).

## 4. Composition and identity at phone scale (what the images actually show)

- `slice-phone-rest.png`: no lattice at rest (only the gravel ticks and the rail dashes) → A1 also holds visually. The focal column dock → sorter → furnace → wreck reads in one vertical line; the sorter (three dark roller bars + two chutes + amber tray pip + rust status bar) and the furnace (smaller body, chimney stub on the right, side blocks, rust band) are separable without labels at 390 px. The dock is a legible pad (cyan corner ticks, 5-pip amber gauge row, arm post). The wreck is a pentagon with a rust outline, 3 remaining pips and 3 shards. Crude-rectangle remnants: **none** for the authored roles; the crates and the pole read as intended 5×5/2×10 marks.
- `slice-phone-build.png`: the 6×6 lattice appears only in build mode (one path), the ghost box + check mark is drawn, but on **tile 0** (top-left) rather than tile 20 as the spec's E2 states (the harness never moves the pointer, so the app's own ghost tile wins). The picker is the tutorial flow (`Cancel / Place Scrap sorter 20 scrap / Next`), not the 8-blueprint picker.
- `slice-phone-one-machine.png` (clean-session case): legible but sparse — rows 3–5 hold only the gravel lattice, and the gravel (72 ticks at 3×3 units, alpha 0.5 → 8 288 px of one blend colour) forms a regular dot lattice that re-telegraphs the hidden grid.
- `slice-desktop-rest.png` / `-mature.png`: the yard is a 768-px board with ~336-px navy margins; identity at s = 4 is good for the authored roles; the level digits (9–14) sit above the cells and collide with the rail posts; 4 of the 8 mature machines are the `generic` fallback = body rect + one dark slot, i.e. the original nested rectangle (B-4). The drone row at the dock is one merged light bar with two pip rows (B-5).
- `slice-sheet-silhouette.png`: 6 overlapping shapes inside the left ~40 % of an 1800×840 canvas, dark-on-dark, plus the DOM HUD strip on top; my own naming pass reached **2/6 with confidence** (drone, sorter) — the artifact, not the art, is the limitation (B-3). (The image I viewed is the regenerated 13 652-byte variant from the later head; the drawing code is unchanged between the two heads, so the composition facts hold, while the pixel measurements quoted in B-3 are from the `c659cf8` file.)

## 5. Findings (each: evidence → player impact → fix → acceptance)

**B-1 (P1) The shipped pixel receipt does not measure the parts its rows name.**
Evidence (all at `c659cf8`, my own decoder + the analytic frame): `dockPad` = `244,247,251` (ratio **11.28**) is the `select` drone-nose mark, not the pad whose hex is `#7f9fbb` (4.375); `amberToken` = `60,54,51` (ratio **1.02**, below its own 4.5 limit) is the amber pip under 4 stacked 0.35-alpha drone shadows — `1 − 0.65⁴ = 0.8207`, `0.8207·(16,27,40) + 0.1793·(255,183,101) = (59,55,51)`, an exact match; `machineWell` is a 6-of-9 modal on the body/roller boundary (its 7×7 window shows the well hex only where the roller AA reaches). The other four rows reproduce their named hex exactly (`match=true`, n=9), and all 49 samples reproduce the shipped JSON — so the harness is honest and only the point placement is wrong. Second problem: at this SHA only `docs/evidence/2026-11-03-style-slice-pixels.json` ships (see B-6), and the numeric receipt added on the later head quotes `127,159,187`/`255,183,101` for these two rows and describes a row-major first-exact-match sampler with `runX/runY/count` that the shipped `scripts/capture-style.mjs` does not implement.
Impact: a reader cannot tell which number is the measurement; C4 is unevaluated and C5 as printed fails its own gate, so the amber/cyan hierarchy — what the phone player uses for the store gauge and cargo tokens — is unproven.
Fix (harness only): one sampler; implement the spec's point-stepping rule inside `modal()` (if the 3×3 modal is not one of the named part's declared hexes, walk to the nearest pixel that is); write the header block (`candidateSha`, viewport, `deviceScaleFactor`, scenario, provenance, timestamp, tool versions) into the JSON; generate the receipt's tables from that JSON.
Acceptance: for all 7 cases × 7 points the sampled RGB equals the named part's palette hex within ±2 per channel and the modal count is 9/9; the receipt's contrast table is byte-derived from the JSON (no manual transcription); the JSON's `scale` equals the app's fitted scale (1.8056 at 390 CSS, 4.0 at 1440).

**B-2 (P1) The captured FS-1 is not the state the draw-bound tests assert.**
Evidence: the phone captures' HUD reads `Store900/900` while FS-1 fixes `storeUnits 770`; the dock band contains **5** nose marks (device x 285, 300, 314, 329, 343 → 4-unit pitch) so 5 drone units are drawn, while the test fixture has 1; `scripts/capture-style.mjs` replaces `sim.machines`/`sim.routes` but not `sim.spares`, `sim.drone.inFlight` or `sim.store`, and the frame loop keeps advancing during the 250 ms wait before the shot; the numeric receipt that ships on the later head quotes an amber census of 734 px where my measurement of the same hex on the shipped PNG totals 898 px in components ≥ 4 px.
Impact: the still and the numbers describe different worlds, so an accepted number may not describe the accepted image (spec 2.1: "the numbers in 3A-3D are only valid for this fixture").
Fix: in the harness, also set `sim.spares` (count as declared), `sim.drone.inFlight = {arrive: 350, units: 3}` and the store map so `storeUnits` recomputes to 770; stop the frame loop (or capture after a fixed tick) so no catch-up runs between load and shot; print the live state (tick, storeUnits, machine statuses, drone count) into the JSON per case.
Acceptance: each case's state block in the JSON equals the fixture values (tick 344, storeUnits 770/900, machines 2, drones 1 for FS-1 and 5 for `seeded-mature`), the HUD text matches (`Store770/900`), and the nose-mark count in the dock band equals the declared drone count.

**B-3 (P1) The identity sheet is not usable as the B1 artifact.**
Evidence (my measurements on the `c659cf8` `slice-sheet-silhouette.png`, 1800×840): **1 566** distinct colours and **0** neutral-gray pixels of 1 478 314 ink pixels, so the sheet is not grayscale at all; **none** of the five `GRAY_STEPS` hexes survives as an exact pixel (`#101b28`, `#22384a`, `#6d90ab`, `#8aa9c4` = 0 px each; only `#f4f7fb` = 10 958) because the appended canvas carries `width = 1800, height = 840` as bitmap attributes inside a 900-px-wide viewport → the browser resamples the bitmap 0.5× and every pixel becomes a blend; the ink profile is a **single** run covering the full 1800 px width in both row bands (row 0 pitch 40 CSS px vs cell width 57.8; row 1 pitch 64 vs 128), i.e. all six roles touch; by the step formula `gray(i) = grays[min(4, floor(i/4))]` the body step `#101b28` (luminance 0.0105) sits on the `#0b1220` background (0.0061) = WCAG **1.078**, and it is *darker* than the interior step `#22384a` (0.0366), so the sheet also inverts the in-game light/dark hierarchy.
Impact: DESIGN_BIBLE line 31 asks for grayscale silhouette discrimination; the artifact delivers a bluish, low-contrast, overlapping cluster, so machine identity cannot be read (my pass: 2/6).
Fix: give the sheet canvas an explicit CSS size (`canvas.style.width = "900px"; canvas.style.height = "420px"`) so the bitmap maps 1:2 with no resample and the hexes stay exact; paint the sheet background a step lighter than the body (or map the steps by luminance role instead of `floor(i/4)`); per-row pitch `ceil(maxPartExtent × s) + 8` (row 1 → 136); print the mask strings beside the PNG in the receipt.
Acceptance: neutral-gray purity ≥ 95 % of sheet ink; all five step counts > 0; 6 separated ink runs per row with widths matching each role's extent (±2 px); the body step's contrast against the sheet background ≥ 3; a 6/6 naming pass by two readers with labels hidden.

**B-4 (P2) Four shipped blueprints still render as the crude rectangle.**
Evidence: `Object.keys(BLUEPRINTS)` = `sorter, furnace, copperSeparator, polymerRecycler, wireMill, platePress, circuitAssembler, signalLab`; `PARTS` has rows for only `dock, sorter, furnace, wireMill, signalLab, drone, generic`; the seeded mature fixture's ids `polymerRecycler, copperSeparator, platePress, circuitAssembler` therefore all paint `PARTS.generic`, whose 8×8 mask is **identical** to the sorter's (Hamming 0/64; versus ≥ 13 for the six authored rows). Visible in `slice-desktop-mature.png` and `slice-phone-mature.png` as nested rectangles with one dark slot.
Impact: in the mature yard, 4 of 8 machines are distinguishable only by the level digit and the status bar → the asset-identity category cannot reach 3 in the crowded case.
Fix: four more `PARTS` rows (one per missing blueprint), each with one identity mark outside the body's rectangle (roller/cutter drum, press crown, coil stack, antenna ring), respecting 3B-4 (height ≥ 2 units) and 3B-6 (inside ±16 units).
Acceptance: a new assertion `Object.keys(BLUEPRINTS).every(b => b in PARTS)`; the mask matrix over the 9 rows has minimum Hamming ≥ 12; in `slice-desktop-mature.png` no two of the 8 machines share an identical ink bounding box.

**B-5 (P2) With a full fleet the drone row merges and hides the store gauge.**
Evidence: `LEAN_UNITS = 4` while one unit's own painted extent is 10 units (rotors at −5..5, shadow rx 5); in `slice-phone-rest.png` the dock band contains **one** cyan component of 94×18 device px (26.03 × 4.98 units) covering all five units, 5 amber 3.05-unit pod marks at 14.4-px pitch (4 of them only 56 of 121 px, i.e. partially overpainted), and **zero** amber components of the 2-unit gauge size inside device y 460..540, while the same 2-unit size is present 3× in the wreck band.
Impact: the two always-on quantity readings compete in one 8-unit band; with 5 drones the store level is not separable from the drone marks, and "five units" do not read as five.
Fix: `LEAN_UNITS` 4 → 11 (or stagger each unit's `y` by 3 units), and draw the store gauge outside the pad's vertical centre (e.g. `y + 11`) so the drone row cannot cover it.
Acceptance: in the dock band, 5 separated cyan components each ≈ 22–36 px wide, ≥ 4 amber components of the 2-unit gauge size, and the gauge's hex `#ffb765` ratio against the floor = 7.049 in the JSON.

**B-6 (P3) Evidence set is incomplete relative to spec §5.**
Evidence (at `c659cf8`): tracked evidence files are `docs/evidence/2026-11-03-style-slice-pixels.json` and 8 `docs/screenshots/slice-*.png` only — the spec's **E9** numeric receipt (`2026-11-03-style-slice.md`) and **E10** provenance manifest (`asset-provenance.json`) are absent at this SHA (both appear only on the later head `0606d37`/`090260a`), so 3A–3E have no printed mask strings, no 15-pair Hamming matrix and no per-role manifest; `slice-phone-landscape.png` (E4, 844×390) is absent, so the short-viewport media query is unverified; the shipped `slice-phone-one-machine.png` is not in the spec's E-list; no per-artifact header block carries the candidate SHA (the later manifest lists only `ade4b60/4d3c4bb/aff2ec6`).
Impact: the frame that the 844×390 layout depends on has no capture, and artifacts cannot be pinned to the accepted SHA.
Fix: add the landscape case (844×390 dpr 2, FS-1) to the harness and keep `one-machine` as an extra; write `candidateSha: c659cf8…` into both JSON headers.
Acceptance: 9 PNG artifacts present and listed; each JSON has the header block with the SHA; landscape shows the full focal column with no clipped panel.

## 6. Scores, gates and unverified dimensions

| category | score | basis |
|---|---:|---|
| Scene composition | 3 | authored layers present and measured (path 7 491 px, rails/posts 12 276 px, gravel 8 288 px, puddle blends), 100 % cell coverage, clear focal column; capped by the empty middle rows in the mature seed (1.8 % per cell) and the broken path band (spur ends at y 16, band starts at y 96 → an 80-unit gap) |
| Asset identity | 2 | six authored roles separable (B2 min 13/64) but 4/8 mature machines are `generic` (mask identical to the sorter) and the sheet artifact is unreadable (B-3/B-4) |
| Readability | 3 | grid context-only, status accents in 5 hues (violet/rust/steel/cyan/mint visible), pips not ratio bars; capped by the gauge/drone overlap (B-5) and the digit-on-rail collision |
| Interaction | not re-scored here | the 13 draw-bound cases are deterministic; the click-through path is Q-001/Q-004 evidence |
| Motion | **pending (Q-004)** | screenshots cannot prove motion. The only cases in this file that touch the motion gate are **D4** (two consecutive draws identical → no wall-clock read entered the render path) and **B7** (the 4-unit lateral offset survives `reducedMotion`); the 5-second real clip stays with Q-004 |
| Audio | pending (Q-005, structural accept already recorded) | no listening evidence in this set |
| State fidelity | 2 | status accents correct, but the captured state ≠ the asserted fixture (B-2) and the store gauge is occluded (B-5) |
| Performance / accessibility | 3 (from the suite) | paint census 61/64/182 with margin, 1 `fillText` per frame, 0 off-grid coords, `imageSmoothingEnabled = false`; touch targets only via the unchanged `tests/ui/hud-layout.test.ts` (green), reduced-motion only via B7 |

Explicitly **unverified** at this SHA: real-device trace and 10 ms p95 (B-08), audio listening (B-11), organic first-minute progression, Safari/Firefox, the 844×390 layout (B-6), and the two-reader naming pass.

## 7. Prioritized next-five (presentation area, unchanged order plus one insertion)

1. Q-002 rework of B-1…B-6 (this file) — one harness commit + one `sprites.ts` table commit.
2. Q-003 (pip clamp) closes on 3B-5/3B-6, already green here.
3. Q-004 interpolated motion + the 5-second clip (unlocks the motion gate).
4. B-4's four `PARTS` rows if not folded into the Q-002 rework.
5. Q-007 fifth status accent test (hue table already reserves `#7fd6c2`); then the resource/control icon set as slice 2.

Artifacts written by this review: `work/review/rev-q002-g1.md` (this file), `.rustwake-runtime/reviewer/rev-q002-g1.json`, probes `probe-px-g1.mjs`, `probe-px2-g1.mjs`, `probe-px3-g1.mts`, `probe-px4-g1.mjs`, `probe-sheet-g1.mjs`, `probe-draw-g1.mts`, `probe-mask2-g1.mts`, `probe-mirror-g1.mjs` (all in `.rustwake-runtime/reviewer/`, read-only over the candidate). Measurement worktree: `.local/share/opencode/worktree/fe4e05/rev-q002-g1` at detached `c659cf8`; the shared `review-r1` worktree moved to `090260a` mid-session, which is why every number above was re-taken in the pinned worktree and re-checked.
