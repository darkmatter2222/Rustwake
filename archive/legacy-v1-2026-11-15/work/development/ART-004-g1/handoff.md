# ART-004 g1 — atlas pilot on the silhouette page (A-1..A-5), branch `rw/art004-g1`

Started from `7f934cf` (ART-003 g1 tail, seven uncommitted entries inherited and published
as `5900bf3` + `6a25c97` + `d84f69e`). Instrument: `npm run typecheck && npx vitest run &&
npm run validate && npm run build`, plus `scripts/art003-census.mjs` and
`scripts/capture-style.mjs` / `capture-clip.mjs` against my own vite dev server
(`5175` was already taken by another lane's server, so this pass used `5177`; the served
bundle was verified to carry the new rows before any number was read).

## Published chain (helper receipts, not remembered text)

| step | SHA | what went in |
| --- | --- | --- |
| inherited tail, committed | `5900bf3` / `6a25c97` | the seven entries this lane inherited |
| `d84f69e` | `d84f69ec3c8c73e5b8adc752383b35a11c9407ff` | furnace 22×16, joint furnace/lab search, cell-normalised census |
| `e8abe4b` | `e8abe4b77b7b6d0f162ab95eded4c58580c593c8` | A-3 tuned rows + A-1/A-2 pilot atlas page |
| `d02d985` | `d02d9854262b97b42fbbf0262e3b8a6fc52e07b8` | atlas-pilot evidence (census after-row, stills, 26-frame clip) |

`git ls-remote origin refs/heads/rw/art004-g1` after the last publish:
`d02d9854262b97b42fbbf0262e3b8a6fc52e07b8`. Receipt file:
`.git/rustwake-publication/rw_art004-g1.json`.

## A-1 — one atlas page, real byte delta (measured, same machine, `npm run build`)

| tree | entry asset | bytes |
| --- | --- | --- |
| `b4e8321` base (recorded in `work/product/dispatch-startup/assignments.md`) | `index-DGy53fNu.js` | 231878 |
| deployed baseline quoted to this lane | — | 231943 |
| `d84f69e` — vector path only | `index-D0YBP7rj.js` | **232306** |
| A-3 rows only, no atlas (`d84f69e` `scene.ts` + tuned `sprites.ts`) | `index-CyH_Clzm.js` | **232306** |
| A-1/A-2 pilot page + `drawImage` | `index-CTxDTIY8.js` | **232922** |

**Real atlas delta = +616 B** (232306 → 232922), i.e. 78 B under the 233000 B ceiling. The
`+9–11 KB` projection for a single page was ~15× pessimistic: the pilot page is baked at
runtime by `atlasOf()` from the same `PARTS` rows the vector path paints, so no pixel table
(the 4267 B of data in the 4-page estimate) enters the bundle at all. The single page fits,
so the pilot continued to A-2. Total ART-003-tail + ART-004 movement against the deployed
231943 B is +979 B.

## A-2 — one `drawImage` per machine, witnesses and 12 h tick

* One `drawImage` per machine from the single pilot page (`src/game/renderer/scene.ts`):
  9 machine rows × 64 device px (2 px per world unit inside the 32-unit cell box), source
  row `cell * 64`, destination the placed cell box. Part loops remain only as the fallback
  for a context with no 2D surface (the recording stub), so the jsdom op-log witnesses are
  byte-identical.
* `spriteVersionAt(tile)` returns `null` for every tile — one shared page, no per-tile
  version — so all existing canvas witnesses apply. Measured on the built artifact
  (`docs/evidence/2026-11-04-clip-opening-250ms.json`, 390×844 dpr2): **26 frames, 26
  distinct PNG hashes**, 24 distinct drone positions, step 0.5–110.5 CSS px (mean 82.52).
  `docs/evidence/2026-11-06-art003-census-after.json`: `scrollHeight 844 == innerHeight
  844`, `minFacePx 44`, `pageErrors 0`. Palette contrast rows from `capture-style.mjs`
  unchanged: C1 1.545 / C2 3.594 / C3 4.937 / C4 4.375 / C5 7.049.
* 12 h tick, `tests/perf/bench.test.ts` "12h starter yard (4 machines, tick-by-tick)":
  **39.76 ms before the atlas → 41.98 ms after** (median of 3, cap 400 ms; +5.6 %, same
  fixture). `bench 12h idle yard (advanceTo) 0.00 ms` unchanged. The `103155 → 108136 ms`
  pair in the brief is the `probe-catchup.mjs` long-task sum (preview-host instrument); it
  was not re-run in this pass — see limitations.

## A-3 — per-kind placement, the two rows that owned the weak pairs

`sprites.ts` gained `ATLAS_PLACE` (`[dyUnits, scale]`, applied to the drawn cell box *and*
to its facet pair so they stay welded): `wireMill [0.5, 1.06]` (half a unit of stand, the
two reel rings stop merging into the body line), `signalLab [-0.5, 1.06]` (a unit of
headroom, so the mast tip reads above the scanner head). The tuned rows themselves:

* `furnace` body 22×16 on the steel step (index 16), chimney with it, rust cap, two dark
  chamber slots, vent + foot, feed notch.
* `wireMill` body 20×16 bodyLight, reel rings 7×7 at x −16 and x 9 (18-unit pitch) in `path`
  with `well` holes, steelLight stands one step under the rings, three-step tension arm with
  the rust tip.
* `signalLab` 14-unit tower 21 tall on the steel step, mast `[-2,-16,4,8]`, scanner head one
  step down (`y −13`) so the tip clears it, 7-unit feet and a 16-unit plinth.

`GRAVEL` and `FLOOR_KIT` untouched (A3-4 pins: 36 ground ticks, 5 kit paint groups).

**The 15-pair grayscale matrix, unit resolution (A3-1 instrument, `tests/renderer/silhouette.test.ts`;
`base` = `b4e8321`, `prev` = `d84f69e`, `now` = this candidate):**

| pair | base | prev | now |
| --- | --- | --- | --- |
| dock/sorter | 37.9 | 48.2 | 48.2 |
| dock/furnace | 58 | 60.6 | 62.8 |
| dock/wireMill | 56.3 | 65.6 | 68.5 |
| dock/signalLab | 66.2 | 67.9 | 68.8 |
| dock/drone | 53.3 | 55.9 | 55.9 |
| sorter/furnace | 49 | 38.3 | **56.7** (+18.4 over prev) |
| sorter/wireMill | 43.8 | 42.5 | 49.1 |
| sorter/signalLab | 57.2 | 48.9 | 60.2 |
| sorter/drone | 56.3 | 58 | 58 |
| furnace/wireMill | 38 | 37.8 | **61.1** (+23.3 over prev) |
| furnace/signalLab | 28.9 | 45.6 | 46.8 |
| furnace/drone | 50.4 | 52.2 | 51.8 |
| wireMill/signalLab | 36.5 | 42.1 | 57.2 |
| wireMill/drone | 45.1 | 53.9 | 54.1 |
| signalLab/drone | 53.5 | 40.1 | **46.9** (+6.8 over prev) |

`min=46.8` (was 37.8), `mean=56.41` (was 50.51, base 48.69). The three least-distinguishable
pairs each rose ≥ 5 points and all fifteen stay ≥ 30 (≥ 45). Only `furnace/drone` (−0.4) and
`signalLab/drone` against the *base* matrix (−6.6, against the 40.1 it had sunk to: +6.8)
moved down; nothing is below the 32 % floor. Pixel-level sheet (58×58 aligned window,
chromium): min 45.5 (`signalLab/drone`), max 68 (`dock/wireMill`).

Six-row solid ink: dock 568, sorter 693, furnace 537, wireMill 558, signalLab 515, drone 40
→ **2911 units²** vs base 2752 (A3-4 up), while the resting dot field stays dimmer than the
machines.

## A-4 — 40-cell census and the global flatness rows (chromium, 390×844 dpr1)

`docs/evidence/2026-11-06-art003-census-after.json`, same fixture as the `before` row:

| row | before (`d84f69e`) | after (atlas) |
| --- | --- | --- |
| bucket-0 share (8-bucket luminance) | 96.5 % | **96.4 %** |
| two darkest buckets | 97 % | **96.9 %** |
| two top colours | 84.6 % | 84.6 % |
| resting dot-field ink | 0.15 % | **0.13 %** |
| machine-row union ink | 62.7 % | **64 %** (all 8 buckets present) |
| cell ink: sorter 8 / furnace 14 / dock 2 / wreck | 63.8 / 57.3 / 67 / 99.9 | **63.9 / 61.0 / 67 / 99.9** |
| distinct luminance buckets, sorter cell | 0–7 | 0–7 |

The three global flatness rows did not worsen (two improved, one equal), machine-row ink rose.
`machineBodySharePct` moved 0.45 → 0.33 only because the furnace and lab bodies left
`bodyLight` (#8aa9c4, the colour that row counts) for `steelLight` in the A-3 tone ladder.

## A-5 — falsification check

The six sub-threshold pairs no longer sit in 30.5–31.8: the unit-grid minimum is **46.8** and
the pixel-sheet minimum **45.5**, with no row below 32 anywhere. The stop rule never fired, so
no ink was added by hand and the pilot ran to completion.

## Gates (real exit codes, at `d02d985`)

`npm run typecheck` 0 · `npx vitest run` **28 files / 294 tests passed**, 0 failed ·
`npm run validate` 0, behaviour line unchanged (`firstDrone=268 firstResearch=478
tick=18298 machines=8 links=18 drones=5 batches=1902 credits=82 nodes=3`) ·
`npm run build` 0 with `index-CTxDTIY8.js` 232922 B ≤ 233000 B.
Silhouette file: `A3-1 pairs=15 nowMean=56.41 baseMean=48.69 min=46.8 baseMin=28.9`;
`A3-4 machineInk total=2911 baseTotal=2752`; `D1/D3 paints rest 82 / build 85 / mature 225`
under the 84 / 96 / 240 ceilings and the L-5 pin 231; `G-1 minPairHamming=14`,
`latticeFamilyMinHamming=18`; `D-4 minFeaturePhone 5.42`, sorter body 39.7 px.

## Save / rollback impact

No simulation, save-format or `src/ui/**` change: `schemaVersion 1` and the fixture checksum
`eede3c4f` are untouched, the behaviour line is byte-identical, and `tests/persistence` stays
green. The atlas is presentation-only and is rebuilt from the same `PARTS` tables on every
load, so a rollback is a plain revert of `e8abe4b`/`d02d985` with no migration. Determinism
witnesses (`D4` element-wise identity, `A10` identical op log, `002` one state read per
frame) pass on the candidate.

## Limitations

1. The 12 h row is the `bench.test.ts` tick number (39.76 → 41.98 ms). The
   `probe-catchup.mjs` long-task sum (the `103155 → 108136 ms` pair) needs `vite preview`
   on 4173 and was not re-run here.
2. `drawSpriteSheet`'s first band still hard-codes the *old* phone fit 1.8056 while
   `fitCamera` now returns 1.95 (the sheet is a 900×420 evidence canvas, not the game view);
   changing it re-pins the `G-1`/`D-4` box numbers and the census mirror, so it is left as a
   documented carry-over rather than a drive-by inside this budget.
3. One page, nine machine rows: the dock and the drone keep their vector part loops (both
   carry per-frame dynamic marks outside the cell box), so their op counts are unchanged.
4. Screenshots are desktop-Chromium renders at phone viewport/dpr 2, not a device trace
   (BL-01 still stands).

---

# Addendum — QA rework list (`rev-art003-g1/work/review/ART-003-g1/QA.md`), rows 1–6

Measured at the tree this addendum is published with. `npx vitest run` there: **28 files /
294 tests passed, 0 failed** (exit 0), so the four failures QA reproduced at `6a25c97` close.

## Row 1 — stale `SCALE` rows: already fixed by `d84f69e` / `3f911fee`

| row | stale value | measured value (in force) |
| --- | --- | --- |
| `scene-draw.test.ts:114`, `silhouette.test.ts:24`, `:208` | `390 / (192 + 24)` = 1.8056 | `390 / (192 + 8)` = **1.95** |
| `scene-draw.test.ts:834` (`expected 1.95 to be 1.8056`) | 1.8056 | 1.95 |
| `scene-draw.test.ts:1079` (pulse row) | `[3.5, …]` | `[4, 4, 5, 5, 4, 4]` |
| `silhouette.test.ts:216` (wreck ellipse `+0` vs `1`) | alpha `+0` | `1` |
| `D-4` min painted feature (phone sweep row, scale 1.8056) | — | **5.4168 px** (3-unit marks); desktop 12 px |

No witness deleted; every row is the re-measured value of the same instrument.

## Row 2 — clip witness restored: already fixed by `3f911fee`

`scripts/capture-clip.mjs` takes the box sizes off `mod.fitCamera(view, insets).scale`
(line 112, `near(v, units, tol) => |v − units·S| ≤ tol`) instead of pinning 11×7 px at the old
1.8056 fit, and the chrome band is null-guarded (`hudBox && dockBox && … : undefined`).
Both clip files regenerate with exit 0 at this tip:

| file | frames | distinct PNG hashes | distinct drone positions | step min/max/mean (CSS px) |
| --- | --- | --- | --- | --- |
| `docs/evidence/2026-11-04-clip-opening-250ms.json` | 26 | **26** | **26** | 0 / 117 / 82.9 |
| `docs/evidence/2026-11-06-art003-clip.json` | 26 | **26** | **26** | 0 / 113.5 / 85.68 |

26/26 rows carry a non-null `droneBodyCssPx` (the earlier run had 24 distinct positions; the
atlas `drawImage` path lifted it to 26).

## Row 3 — committed evidence regenerated at this SHA (chromium, my vite on 5177)

`docs/evidence/2026-11-06-art003-census-after.json` (exit 0): `bandFit.scale` **1.95**, plate
**204.6 … 641.4** CSS px, `gapAbove 148.6 / gapBelow 148.6`, `minFacePx 44`, `scrolls false`,
`pageErrors 0`. Cell ink (`inkSharePct / inkPctOfCellArea`): sorter@8 63.9 / 63.13, furnace@14
61 / 61.15, dock@2 67 / 66.13, wreck 99.9 / 149.52. `scripts/art003-silhouette.mjs` (needs
`npx tsx`, not bare `node` — an extensionless import): `a3_1` unit grid min **48.2**, mean
**57.83** (base 48.69); aligned 58×58 pixel sheet min **46**, mean **57.79**, max 69.6 (base min
31.8 / mean 49.3); plate fit 1.95 / [204.6, 641.4] vs base 1.8056 / [219.78, 624.22].

## Row 4 — `circuitAssembler` contact shadow: **fixed now**

Bar moved `[-12, 12, 24, 3, 3] → [-12, 9, 24, 3, 3]` (mask row 7 → 6), so it no longer
overpaints the ellipse in rows 12–14. Per-machine `contactShadowPx`, from the mature
8-machine field (`CENSUS_FLEET=template` →
`docs/evidence/2026-11-06-art003-census-afterfleet.json`):

| machine | px | note |
| --- | --- | --- |
| sorter@0 | **108** | |
| furnace@1 | **87** | |
| polymerRecycler@3 | **104** | |
| copperSeparator@4 | **108** | |
| wireMill@5 | **123** | |
| platePress@6 | **95** | |
| **circuitAssembler@7** | **81** | was **0** |
| signalLab@8 | **42** | lowest: its plinth bar covers the ellipse's middle |
| dock@2 | **121** | QA's 113 |
| wreck | **6** | its own 6-unit hull box (QA's 320 is the 24×16 box) |

Nine of nine machine rows non-zero; field total 931 px.

## Row 5 — D1 band row: **fixed now**, lever = horizon bands in the gutters (one lever)

`SKY_NEAR` gained a far-bank tier (`path`, y −26) and a lit bank line (`steelLight`, y −18);
`APRON_TOPS` gained three 2-unit `bodyLight` rails at y 236 / 248 / 260; the sheen group now
fills at alpha 1 (was 0.9). World height untouched at 224 units. 8-band luminance histogram of
the live canvas, same instrument:

| run | b0 | b1 | b2 | b3 | b4 | b5 | b6 | b7 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| before (`d84f69e`, FS-1) | 96.4 | 0.5 | 2.2 | 0.4 | 0.3 | 0 | 0.1 | **0** |
| after (FS-1) | 94.8 | 0.5 | 2.5 | 1.6 | 0.3 | 0 | 0 | **0.2** |
| after (mature 8-machine field) | 92.5 | 0.7 | 3.2 | 2.6 | 0.7 | 0 | 0 | **0.4** |

Both outer bands are non-zero on both fields and six bands are populated. The new
`gutters.above` / `gutters.below` census rows read buckets `{0,2}` (4158 horizon px) and
`{0,3}`; `steelLightPx 1767`. Flatness rows all moved the right way: `twoDarkestSharePct`
96.9 → 95.3, `twoTopColorsSharePct` 84.6 → 82.1, `gridInkSharePct` 0.13. Ceilings after the
extra rows: `D1/D3 rest 83 / build 86 / mature 230` (caps 84 / 96 / 231; `L-5` ratio 7.76,
min 10.39 / max 80.65 over 12 cells).

## Row 6 — entry bytes, re-printed after rows 4–5

| tree | entry asset | bytes | Δ vs deployed 231943 |
| --- | --- | --- | --- |
| `d84f69e` (vector only) | `index-D0YBP7rj.js` | 232306 | +363 |
| `e8abe4b` (+ pilot atlas page) | `index-CTxDTIY8.js` | 232922 | +979 |
| **this tip** (atlas + QA-4 bar move + D1 rails) | `index-NaDxD6XG.js` | **232825** | **+882** |

Ceiling 233000 B → **175 B headroom**. The `ATLAS_IDS` literal became `Object.keys(PARTS)`
(−97 B) to pay for the D1 rows. `schemaVersion 1`, checksum `eede3c4f` and the behaviour line
untouched (`npm run validate` exit 0: `firstDrone=268 firstResearch=478 tick=18298 machines=8
links=18 drones=5 batches=1902 credits=82 nodes=3`).

## Gate rows for this tip

`npm run typecheck` 0 · `npx vitest run` **28 files / 294 tests, 0 failures** · `npm run
validate` 0 · `npm run build` 0 with `index-NaDxD6XG.js` **232825 B**.
Renderer witness rows: `A3-1 pairs=15 nowMean=57.83 min=48.2 baseMean=48.69`; `A3-4 machineInk
total=3001 baseTotal=2752`; `D-4 minFeaturePhone 5.4168`; `G-1 minPairHamming=12
latticeFamilyMinHamming=18`; `circuitAssembler` phone ink box 98×97.

## Which rows were already fixed earlier

* **Row 1** (stale `SCALE`, all four failing cases) — already fixed at `d84f69e` / `3f911fee`.
* **Row 2** (scale-relative clip tolerance, chrome-band guard) — already fixed at `3f911fee`,
  re-printed here.
* **Row 3** — partly in `d02d985` (census-after, clip, stills); the silhouette json was missing
  (`node` vs `npx tsx`), regenerated now.
* **Row 4** (`circuitAssembler` 0 px) — **fixed in this pass**.
* **Row 5** (D1 8-band, both outers non-zero) — **fixed in this pass**.
* **Row 6** (byte re-print) — this pass.

## Limitations added by this pass

* Band 5 and band 6 stay at 0 % on both fields: with the world 224 units tall and the width
  term maxed at 455 px the ramp only populates six steps, so the top two stay empty until the
  plate gains a lighter body tone (next ink-budget item).
* `scripts/art003-silhouette.mjs` must be run with `npx tsx` (extensionless import fails under
  bare `node`) — noted here because that is how the file went stale.
* `probe-catchup.mjs` (`103155 → 108136 ms`) still needs `vite preview` on 4173; not re-run.
* `drawSpriteSheet`'s band scale is still the hard-coded 1.8056 (documented carry-over).
