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
