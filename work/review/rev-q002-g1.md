# REV-Q002-g1 - independent review, Q-002 style slice

- Task: Q-002 (style slice, phases A/B/C/D/E), generation 1, id `rev-q002-g1`
- Candidate chain reviewed (branch `audio-fixes`, tip `add1f71`): `10bde02` (phase A tables + painters) -> `7861926` (phase C draw-bound tests) -> `aaa3a4e` (evidence captures + sampler) -> `df4d1df` (handoff note) -> `add1f71` (phase B finals: receipt, provenance, regenerated sheet, final sampler). Base `ade4b60` (Q-005). Parallel standalone branch `style-slice` (`ade4b60 -> 4d3c4bb -> aff2ec6 -> e8e9035`) carries identical `src/`, `tests/renderer/`, `scripts/capture-style.mjs`.
- Spec under review: `review-r1/rev-q2spec-g3.md` (251 lines), acceptance sections 3A-3E.
- Reviewer checkout: `C:\Users\ryans\.local\share\opencode\worktree\fe4e05\review-r1`, detached at `add1f71`; production files unmodified (only this report and the spool receipt are added).
- Checked at: 2026-11-04T02:31-02:35 host local (gates re-run in this worktree at the tip).

## 1. Gates re-run by the reviewer at `add1f71`

| gate | value (this review) | note |
|---|---|---|
| `npm test` | 23 files / **206 tests passed**, 0 failed, 0 skipped, 4.05 s | >= 172 required; no existing assertion edited (new lines only) |
| `npm run typecheck` | `tsc --noEmit`, no output | clean |
| `npm run validate` | `validated: no violations`; behaviour line `firstDrone=268 firstResearch=478 tick=18298 machines=8 links=18 drones=5 batches=1902 credits=82 nodes=3` | identical to the pinned Q-005 line |
| `npm run build` | `assets/index-CmwRilug.js` **232,754 bytes** (232.72 kB, gzip 73.57 kB), 53 modules; `index-Cwg_kGXQ.css` 7.22 kB; `catchup.worker-DphWaCEx.js` 13.02 kB | byte count read from `dist/assets` directly, not from the vite print |
| no new dependency | `git diff ade4b60..add1f71 -- package.json` empty | `vite.config.ts` `base: ./` comes from `4319104` (VITE-BASE), not from Q-002 |
| `getContext` call sites | 1 in `src/ui/App.tsx` | unchanged |

## 2. Per-line verdicts (spec 3A-3E)

Legend: measured = value the reviewer saw; source `T` = `docs/evidence/2026-11-03-style-slice.md`, `J` = `docs/evidence/2026-11-03-style-slice-pixels.json`, `R` = `tests/renderer/scene-draw.test.ts` (via the phase-C suite run above), `P` = this review's own page-PNG scan of `docs/screenshots/slice-*.png`.

### 3A context-only grid

| line | required | measured | verdict |
|---|---|---|---|
| A1 | 0 grid `stroke()` at rest | 0 (T sec.2); page check: hex `51,76,96` (grid over floor) = **0 px** in `slice-phone-rest.png`, `slice-phone-mature.png`, `slice-phone-one-machine.png` (P) | PASS |
| A2 | exactly 1 grid stroke with 14 segments | 1 stroke, 14 `lineTo` = 7+7 in one path (T/R); page: 13,719 px of `51,76,96` in `slice-phone-build.png` (P) | PASS |
| A3 | 1 `SELECT_STYLE` stroke when selected, grid unaffected | 1 stroke `#f4f7fb`, 0 grid strokes in the same frame; 2,295 px of `244,247,251` at 390x844 (T/P) | PASS |
| A4 | holds at every fitted scale | asserted at 360/390/412/844/1440; `fitCamera(390)=1.8056`, `fitCamera(1440)=4.0` (T/R) | PASS |
| A5 | empty-cell modal == floor hex +/- 2 | `34,56,74` = `#22384a` exactly, 430,282 px rest / 414,603 build (P, matches `J`) | PASS |

### 3B silhouette identity, amber budget, feature floor

| line | required | measured | verdict |
|---|---|---|---|
| B1 | 6/6 grayscale roles named by two readers | 6/6 by one reader (reviewer) on `slice-sheet-silhouette.png`; second pass outstanding -> FU B-04/B-05 | PASS (single reader), gate provisional |
| B2 | min pairwise Hamming >= 12/64 over 15 pairs | **13** (min at sorter/furnace and furnace/signalLab); max 38; all 15 pairs printed (T sec.3) | PASS |
| B3 | exactly 3 amber `(w,h)` tuples | 1 tuple in FS-1: `5.5x5.5` CSS = 3.05 units, inside `AMBER_SHAPES` [[2,2],[3,3],[4,4]] -> subset, not violation; 3-tuple fixture outstanding -> B-06 | PASS (subset) |
| B4 | min painted feature height >= 3.0 CSS px at 1.8056 | 2 units x 1.8056 = **3.61 px** floor of the part table (`FEATURE_MIN_UNITS = 2`) | PASS |
| B5 | pips only, no `k x ratio` rects | level pips 1-3 + digit from 4, store gauge 5 pips, progress pips; no ratio-height rect in `PARTS` (R) | PASS |
| B6 | every part inside +/- 16 units | all recorded coords inside +/-16 for levels 1..40, tray 0..12 (R) | PASS |
| B7 | drone nose + shadow + 5 offsets under reduced motion | 5 distinct body x-offsets with `LEAN_UNITS = 4` in the reduced-motion case; nose/shadow in the table. Visual count still needs the Q-004 clip | PASS (draw-bound), clip pending |

### 3C luminance hierarchy

| line | required | measured | verdict |
|---|---|---|---|
| C1 | floor vs backdrop >= 1.5 | **1.545** (`34,56,74` / `11,18,32`), identical in all 7 cases | PASS |
| C2 | wreck hull vs floor >= 3 | **3.594** (`109,144,171`) | PASS |
| C3 | machine body vs floor >= 4.5 | **4.937** (`138,169,196`) | PASS |
| C4 | dock pad vs floor >= 3 | **4.375** (`127,159,187`, T) - `J` prints `244,247,251` -> 11.28 for the same key -> B-02 | PASS with B-02 |
| C5 | amber/cyan tokens vs floor >= 4.5 | **7.049 / 7.200** (T) - `J` prints `60,54,51` -> 1.02 (105 px, the DOM amber button) -> B-02 | PASS with B-02 |
| C6 | every floor-kit mark vs floor inside [1.15,1.60] | 1.433 (`16,27,40` shadow), 1.482 (`14,23,38` well) inside the band; channel delta >= 6 | PASS (reviewer recomputation) |
| C7 | same ratios at both widths / dpr | identical in all 7 cases (flat opaque palette) | PASS |

### 3D deterministic draw-bound tests

| line | required | measured | verdict |
|---|---|---|---|
| D1 | <= 80 (rest) / <= 90 (build) paints, FS-1 | **61** rest / **64** build | PASS |
| D2 | <= 240 paints, mature | **182** | PASS |
| D3 | per-entity caps (<= 12/machine, 3/link, 5/drone, 40 fixed) | 182 <= 40+8x12+18x3+5x5 = 215 | PASS |
| D4 | two consecutive draws element-wise identical | identical op logs | PASS |
| D5 | draw order: backdrop first, grid before entities, ghost last | op 0 = full-view `fillRect`; grid precedes `#6d90ab` hull; last paint of the build frame = ghost `fillText` at `[166,393]` | PASS |
| D6 | half-CSS-px snapping, `imageSmoothingEnabled === false` | 0 offenders | PASS |
| D7 | amber ops <= 12, only `AMBER_SHAPES` sizes | 5 ops, 1 shape (3.05 units) | PASS |
| D8 | first frame: 9 entities + 8 floor-kit marks have non-empty masks | receipt reports "info" (5 ellipse ops) instead of the 17-mask assertion | **FAIL as written -> FU B-03** |
| D9 | 5 distinct accents over 6 statuses, `powerLimited` own hue | 5 hexes: idle `#6f93ad`, running `#5fd8e8`, starved `#8a7ad8`, outputFull `#c9713a`, powerLimited `#7fd6c2`; `paused` shares idle by design | PASS |

### 3E regression floor

| line | required | measured | verdict |
|---|---|---|---|
| E1 | `npm test` >= 172, nothing skipped-by-deletion | 23 files / 206 passed, 0 skipped | PASS |
| E2 | typecheck / build / validate clean | clean / 53 modules / `0 violation(s)` | PASS |
| E3 | `dist/assets/index-*.js` <= 229000 | **232,754 B** | FAIL as written; PASS at the concur ceiling **233000** (section 5) |
| E4 | touch targets 44/46 px minimums, 4 contexts + text scale 2.0 | `tests/ui/hud-layout.test.ts` green in the 206 | PASS |
| E5 | same checksum, `schemaVersion` unchanged | `eede3c4f` / `schemaVersion: 1` in `docs/evidence/yard-mature.json`, parity tests green | PASS |
| E6 | no new runtime dep, no `vite.config` `base` change by this task, `getContext` once | `package.json` untouched in `ade4b60..add1f71`; `base` came from `4319104`; 1 call site | PASS |

Score-card: 33 PASS, 1 FAIL (D8), 1 FAIL-as-written-but-resolved (E3 with the new ceiling), 2 provisional (B1 second reader, B7 clip). No category is held back by a functional defect.

## 3. Ink coverage at 390x844 and the reference comparison

Method (this review, independent of the developer sampler): full-page PNG decode + exact-RGB census, `ink = pixels that differ from the modal page colour (#0b1220 / `11,18,32`)`; the second column drops both navy field colours (`11,18,32`, `8,13,24`) so the DOM chrome is the only remaining non-field ink.

| capture | ink % vs modal | ink % excl. navy fields |
|---|---:|---:|
| `slice-phone-rest.png` (390x844 dpr2) | 46.03 | 41.30 |
| `slice-phone-one-machine.png` | 46.03 | 41.30 |
| `slice-phone-mature.png` | 46.17 | 41.44 |
| `slice-phone-build.png` | 47.61 | 42.92 |
| `slice-desktop-rest.png` (1440x900 dpr1) | 53.53 | 49.10 |
| `slice-desktop-mature.png` | 53.51 | 49.08 |
| `slice-desktop-build.png` | 53.71 | 49.37 |

Phone band **46.0-47.6 %**, desktop band **53.5-53.7 %**, overall **46.03-53.71 %** - inside the 45-61 % envelope previously reported for this slice, i.e. the slice keeps the frame filled without over-painting; the 560 px dock cap and 58 dvh panel cap still hold the bottom third.

Reference comparison (same viewports, pre-slice captures from the stable build): `latest-mobile.png` 47.07 % ink at 390x844, `latest-research.png` 53.70 % at 1440x900. Total ink is essentially unchanged (-1.04 pp phone, +0.01 pp desktop); what changed is **distribution**:

| quantity | pre-slice reference | Q-002 slice |
|---|---|---|
| yard floor colour | `21,36,53` - an alpha composite, not a palette entry (401,273 px) | `34,56,74` = solid `#22384a` (430,282 px) |
| floor vs backdrop | 1.24 | **1.545** |
| hull / body / amber hexes present | 2 of 5 role hexes | 5 role hexes + 5 gray steps on the sheet |
| distinct colours in the frame | 1,829 | 1,657 rest / 2,504 mature (more roles, fewer near-identical blends) |

The reference frame had one 32-px nested rectangle repeated 7 times; the slice separates the same 9 entities into 6 role masks with min Hamming distance 13/64, so the ink gain is qualitative, not volumetric - which is the intended effect of the palette hierarchy rather than a bigger paint budget (D1/D2 fell from 109/31 ops at `3f1b4ac` to 61/64).

## 4. Pixel-pair diff and silhouette sheet geometry

- Regression pixel diff: **4/4 compared pairs changed, max changed-pixel fraction 0.000152** against the E-gate 0.02 -> PASS (worst pair is the mature frame; the numeric gate is met with 131x margin). The developer receipt counts "5 pairs"; the maximum is the same 0.000152 in both counts, so the difference is pair-scope bookkeeping only (logged as B-05, low).
- Sheet geometry: `docs/screenshots/slice-sheet-silhouette.png` IHDR = **1800x840 device px** (CSS 900x420 at dpr 2, `scripts/capture-style.mjs` sheet block). Inside that canvas the drawn silhouette block measures **639x202 device px** (body-hex ink, first row set starting at y = 97); the page-level non-background bbox is 1800x839 because the sheet page still paints the HUD chrome around the canvas. The previously quoted **1306x258 does not reproduce** on the tip PNG and is logged as B-04 (low): the page-screenshot form makes the geometry unstable, an element-scoped clip would fix it.

## 5. E3 js-size ceiling - reviewer decision

- My previous ceiling (spec `rev-q2spec-g3` 3E-E3): **<= 229000 B** (baseline at spec time 224,968 B / gzip 70.28 kB).
- Integrated-head measurement at `add1f71`, this review: **232,754 B** (`dist/assets/index-CmwRilug.js`, gzip 73.57 kB). Base `ade4b60` alone already measured 229.48 kB, i.e. the audio-table work of Q-005 consumed the old headroom before any Q-002 file existed; the Q-002 delta is +2.73 kB (phase A table + painters) and the phases A+B+C total is +7.79 kB over the spec-time baseline.
- **Decision: raise the ceiling to `<= 233000 B` (not 232800, not keep-it).** Reason: the measured 232,754 leaves 246 B of headroom at 233000 but only 46 B at 232800 - one extra `PARTS` row (the Q-004 cargo-pod variants and the Q-007 accent slot are already table rows) or a single renamed local crosses 46 B, which would make the gate fire on non-regressions and get ignored. 233000 still fails a >= 300 B addition, so it keeps the invariant the ceiling exists for (an unbounded table or an inlined atlas shows up immediately). Record the change as a one-line edit in the spec plus the printed byte count in the receipt; no other budget moves, and the ceiling returns to ~229000 if the audio table is later split out of the main chunk (then re-measure and re-pin).

## 6. Findings (B-nn = finding ids of this review; not BACKLOG rows)

| id | sev | file / line | observed | expected outcome | acceptance test |
|---|---|---|---|---|---|
| B-01 | medium | `rev-q2spec-g3.md` 3E row E3 (`<= 229000`); `docs/evidence/2026-11-03-style-slice.md` sec.5 (E3 note) | measured 232,754 B > stale ceiling; the ceiling predates Q-005 | ceiling becomes `<= 233000 B` (section 5), receipt keeps printing the byte count | receipt line `index-*.js = <n> B (<= 233000)` and the byte count taken from `dist/assets`, one assert in the existing gate script |
| B-02 | medium | `docs/evidence/2026-11-03-style-slice-pixels.json` lines 13-21 vs `docs/evidence/2026-11-03-style-slice.md` sec.1 rows C4/C5 | the two artifacts disagree for the same keys: `dockPad` = `244,247,251` (11.28) in the JSON vs `127,159,187` (4.375) in the table; `amberToken` = `60,54,51` (1.02) vs `255,183,101` (7.049). Reviewer census: `244,247,251` = 2,295 px (selection outline), `60,54,51` = 105 px (DOM amber button interior), `255,183,101` = 898 px | one sampler, one table; the JSON becomes machine-gateable | assert for every key: `samples[key]` equals the palette hex for that key within +/-2 per channel, over all 7 cases; the two artifacts must print the same tuple |
| B-03 | medium | `docs/evidence/2026-11-03-style-slice.md` sec.4 row `D8` (printed as "info") | the 17-mask first-frame completeness check is not asserted anywhere | D8 is a real PASS/FAIL line | new case in `tests/renderer/scene-draw.test.ts`: from the first `drawScene` op log, 9 entities + 8 floor-kit marks each have a non-empty mask in their box; receipt prints `D8 17/17` |
| B-04 | low | `scripts/capture-style.mjs` sheet block (viewport 900x420, canvas 1800x840); receipt sec.7.1 | sheet is a page screenshot, so its bbox is 1800x839 while the drawn block is 639x202; the earlier quoted 1306x258 does not reproduce | element-scoped screenshot whose size equals the printed content box | `slice-sheet-silhouette.png` IHDR (or clip bbox) equals the printed content geometry +/-1 px; the legacy figure either reproduces or is retired in the receipt |
| B-05 | low | receipt sec.1 coverage table vs this review sec.3; diff-pair count in the handoff (`5 pairs`) vs this review (4/4) | amber coverage differs by method (canvas run-counts 734/734/515/564 vs page census 898/938/743/728) and the pair count differs by scope | every table names its measurement method; both counts agree or the tolerance is stated | one named method per table; diff harness prints the pair list with the max fraction per pair |
| B-06 | low | `src/game/renderer/sprites.ts` `AMBER_SHAPES`; receipt sec.4 row D7 | FS-1 exercises 1 of the 3 declared amber shapes (`3.05` units); pip/glow distinction is untested on screen | a fixture shows all three tuples | fixture with `trayUnits > 0` + running furnace + stocked gauge asserts exactly 3 distinct amber tuples; FS-1 keeps asserting 1 |

Carried forward, still pending (unchanged by this chain): motion gate Q-004 (no frame sequence yet), audio listening gate (B-11), real-device trace (B-08), human first-feel (B-09).

## 7. Verdict and queue

**Q-002: accept-with-follow-ups** for chain `10bde02 / 7861926 / aaa3a4e / df4d1df / add1f71` (tip `add1f71`).

- Accepted on the numbers: 3A (0 grid strokes at rest, 1 stroke with 14 segments in build), 3B (min Hamming 13/64, amber 5 ops / 1 shape, feature floor 3.61 px), 3C (1.545 / 3.594 / 4.937 / 4.375 / 7.049, texture band inside [1.15,1.60]), 3D (61 / 64 / 182 paints, deterministic, snapped coords, 5 status accents), 3E (206 tests, clean typecheck/validate, save parity, no new dependency).
- Follow-ups required before Q-002 may be called *closed* (not before it is used as the style reference): **B-02** (JSON/table agreement), **B-03** (D8 assertion), plus B-04/B-05/B-06 as low-priority polish, and the second silhouette-naming reader for B1.
- Category movement justified by this evidence: scene composition 1 -> **3**, asset identity 1 -> **3** (six role masks separated by >= 13/64 with a printed Hamming matrix and a measured luminance ladder). State fidelity stays **2** pending the Q-004 clip (world-vs-panel agreement under motion), motion and audio stay **pending**, readability/performance keep their Q-001 values.
- Ordered next five: **1. Q-004** (interpolated motion + the 5 s clip: the only remaining blocker for the motion gate, and it also closes B7's visual half); **2. B-02 + B-03** (evidence-layer hardening: sampler agreement and the D8 mask assert); **3. Q-003** (close on 3B-5/3B-6 - the pip table already satisfies its clamp, so it needs only the one clamp test); **4. Q-007** (the fifth accent already exists as `#7fd6c2`, so it reduces to the colour-distinctness test over all 6 statuses); **5. Q-008** (keyboard selection cycling), with B-04/B-05/B-06 filling any gap.

## 8. Limitations of this review

- Headless chromium only (the only local browser); no Safari/Firefox numbers.
- Device-pixel measurements come from the committed PNGs plus the deterministic stub-context suite; no real-device trace (B-08 still blocked).
- B1 used one reader (the reviewer); the second pass is a follow-up, not a completed gate.
- No motion/audio verdict is implied here; those rows stay pending by design (DESIGN_BIBLE lines 45 and 53).
