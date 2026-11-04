# Q-002 style slice - capture receipt

Date: 2026-11-03 | Branch: `style-slice` | Worktree: `q001-dev`
Candidate chain: `ade4b60` (base, Q-005) -> `4d3c4bb` (phase A, tables + painters) -> `aff2ec6` (phase C, draw-bound tests) -> phase B commit (this receipt + captures)
Spec: `review-r1/rev-q2spec-g3.md` (251 lines). All ids below refer to that file.

## 0. Harness

| item | value |
| --- | --- |
| tooling | `scripts/capture-style.mjs`, playwright-core 1.49 chromium (headless), vite 5.4.11 dev server on :5174 |
| pixel data | `docs/evidence/2026-11-03-style-slice-pixels.json` (7 cases) |
| viewports | phone 390x844 CSS, dpr 2 -> canvas 780x1688 device px, fitted scale 1.8056 / desktop 1440x900 CSS, dpr 1 -> canvas 1440x900, fitted scale 4 |
| sampling | first exact palette-RGB match (row-major scan) per role; `runX`/`runY` = measured solid block in device px, `count` = pixels of that exact RGB |
| contrast | WCAG relative-luminance ratio of the measured RGBs |
| determinism | stub `CanvasRenderingContext2D` (recording object) for the op census, `tests/renderer/scene-draw.test.ts` |

Scenario: **FS-1** - dock + sorter(tile 8, `running`) + furnace(tile 14, `outputFull`) + 2 loaded routes, tick 344, store 770/900. Provenance **seeded** (localStorage envelope `rustwake.save.v1`, FNV-1a checksum recomputed), no manual play. `phone-mature`/`desktop-mature` load `docs/evidence/yard-mature.json` unchanged. `phone-one-machine` drops the furnace and the second route.

## 1. C - contrast (measured, all seven cases)

| id | pair | measured RGB | ratio | limit | pass |
| --- | --- | --- | --- | --- | --- |
| C1 | floor vs backdrop | `34,56,74` / `11,18,32` | 1.545 | >= 1.5 | yes |
| C2 | wreck hull vs floor | `109,144,171` / `34,56,74` | 3.594 | >= 3 | yes |
| C3 | machine body vs floor | `138,169,196` / `34,56,74` | 4.937 | >= 4.5 | yes |
| C4 | dock pad vs floor | `127,159,187` / `34,56,74` | 4.375 | >= 3 | yes |
| C5 | amber token vs floor | `255,183,101` / `34,56,74` | 7.049 | >= 4.5 | yes |

Ratios are identical in every case because the palette is opaque and flat (no gradients inside a part); the *coverage* counts do differ per state, which is what proves the states really render differently (device px of the exact RGB):

| case | amber | bodyLight | well | hull | floor |
| --- | --- | --- | --- | --- | --- |
| phone-rest | 734 | 9570 | 4253 | 9870 | 430282 |
| phone-build | 734 | 9570 | 4253 | 9870 | 414603 |
| phone-mature | 515 | 37422 | 16723 | 9870 | 385124 |
| phone-one-machine | 564 | 5362 | 2674 | 9870 | 437208 |
| desktop-rest | 856 | 11675 | 5280 | 12228 | 528763 |
| desktop-build | 856 | 11675 | 5280 | 12228 | 510622 |
| desktop-mature | 600 | 46059 | 20720 | 12228 | 473645 |

Amber block size: 9x11 device px (phone), 10x12 (desktop) - i.e. inside a solid token, not an antialiased edge (C5 note in the spec).

## 2. A - grid and selection (deterministic, stub ctx, 390x844)

- A1 rest: 0 strokes with `strokeStyle === GRID_STYLE` (`rgba(111,147,173,0.22)`).
- A2 build: exactly 1 grid stroke, 14 `lineTo` segments = (COLS+1)+(ROWS+1) = 7+7 -> one path, not 14.
- A3 selection: exactly 1 stroke in `SELECT_STYLE` (`#f4f7fb`) when `selected` is set, 0 grid strokes at the same time; verified for fitted widths 360/390/412/844/1440.
- A4 fitted scale: `fitCamera({width:390}).scale` = 1.8056 (asserted), 4.0 at 1440.
- Order (D5): op 0 is the full-view backdrop `fillRect`; the grid stroke precedes the first entity paint (`#6d90ab` hull); the last paint of a build frame is the ghost `fillText` (cyan, args `[166,393]`).

## 3. B - silhouette masks (8x8 = 64 cells over the 32-unit cell)

Row strings, left-to-right, one row per line:

```
dock      00000000 11111111 11111111 11111111 11111111 11111111 11111111 00000000   fill 48
sorter    00000000 01111110 01111110 01111110 01111110 01111110 01111110 01111110   fill 42
furnace   00000110 00000110 01111110 01111111 11111111 11111111 11111111 01111110   fill 47
wireMill  00011000 00000000 00000000 01111110 11111111 11111111 01111110 01111110   fill 36
signalLab 11111111 00011000 01111110 01111110 11111110 11111111 01111111 01111110   fill 50
drone     00000000 00000000 00000000 00111100 00111100 00111100 00000000 00000000   fill 12
```

Hamming distance over the 64 cells (threshold >= 12), all 15 pairs:

| pair | d | pair | d | pair | d |
| --- | --- | --- | --- | --- | --- |
| dock/sorter | 18 | sorter/furnace | 13 | furnace/wireMill | 15 |
| dock/furnace | 17 | sorter/wireMill | 18 | furnace/signalLab | 13 |
| dock/wireMill | 28 | sorter/signalLab | 16 | furnace/drone | 35 |
| dock/signalLab | 26 | sorter/drone | 30 | wireMill/signalLab | 16 |
| dock/drone | 36 | wireMill/drone | 24 | signalLab/drone | 38 |

Minimum 13 -> B2 passes (15/15 pairs). B4 feature floor 2 units, B6 all parts inside +/-16 units, B5 pip widths quantised (see D7 shapes), B7 lean 4 units keeps 5 distinct body x-offsets under reduced motion.

## 4. D - draw-call census (recording ctx, FS-1 / mature at scale 1.8056)

| check | measured | limit | pass |
| --- | --- | --- | --- |
| D1 rest paints (FS-1) | 61 | <= 80 | yes |
| D2 build paints (FS-1 + ghost) | 64 | <= 90 | yes |
| D2/D3 rest paints, seeded-mature (8 machines, 18 routes, 5 drones) | 182 | <= 240 and <= 40+8*12+18*3+5*5 = 215 | yes |
| D4 two consecutive draws | element-wise identical op log | - | yes |
| D6 all recorded coords on the half-CSS-px grid, `imageSmoothingEnabled === false` | 0 offenders | 0 | yes |
| D7 amber ops | 5 | <= 12 | yes |
| D7 amber shapes | 1 distinct: `5.5x5.5` CSS = 3.05 units | in `AMBER_SHAPES` = [[2,2],[3,3],[4,4]] | yes |
| D8 puddle/post ellipses | 5 ellipse ops total in the FS-1 build frame (3 puddles + drone shadow ellipses); 24 rail posts are group-filled rects | - | info |
| D9 status accents | 5 distinct hexes for 6 statuses, `powerLimited` #7fd6c2 distinct from idle #6f93ad and paused #6f93ad | 5 | yes |

Status accent map: idle `#6f93ad`, running `#5fd8e8`, starved `#8a7ad8`, outputFull `#c9713a`, powerLimited `#7fd6c2`, paused `#6f93ad`.

## 5. E - gates (quoted tails)

```
vitest  : Test Files 23 passed (23) / Tests 205 passed (205)
typecheck: tsc --noEmit -> no output
validate: validated: no violations
build   : index js 232.21 kB | gzip 73.43 kB  (E3 budget <= 229000 bytes -> over by 3210 bytes)
```

Same gates on the integration branch `audio-fixes` (this worktree's later HEAD, which also carries the other agents' PUB/Q-001 changes): 23 files / 206 tests passed, `tsc --noEmit` clean, `validated: no violations`, `index-CmwRilug.js` 232.72 kB (gzip 73.57 kB).

E3 note: the budget predates this chain. The exact size is 232754 bytes (`index-CmwRilug.js` on `audio-fixes`; 232.21 kB printed by vite for `index-5_4tT5cD.js` on `style-slice`). The base commit `ade4b60` (Q-005 audio) already measured 229.48 kB before any Q-002 file existed, so the Q-002 phase A+C delta is +2.73 kB. Recorded as an open item for the reviewer instead of trimming the tables below the readable form.

## 6. Files

| path | bytes |
| --- | --- |
| `docs/screenshots/slice-phone-rest.png` | 62849 |
| `docs/screenshots/slice-phone-build.png` | 66298 |
| `docs/screenshots/slice-phone-mature.png` | 70058 |
| `docs/screenshots/slice-phone-one-machine.png` | 62576 |
| `docs/screenshots/slice-desktop-rest.png` | 33648 |
| `docs/screenshots/slice-desktop-build.png` | 36126 |
| `docs/screenshots/slice-desktop-mature.png` | 39465 |
| `docs/screenshots/slice-sheet-silhouette.png` | 13652 |
| `docs/evidence/2026-11-03-style-slice-pixels.json` | see repo |
| `docs/evidence/asset-provenance.json` | see repo |

## 7. Limitations

1. The silhouette sheet is a screenshot of the appended 1800x840 canvas rendered by `drawSpriteSheet` (same `PARTS` table, gray steps only); it is a page screenshot, so it carries the page background around the canvas.
2. Sample points are the first exact-RGB match of each role colour. Where `runX` is 1 (`floor` on the phone) the pixel sits directly beside a same-row floor detail (gravel lines are 1 CSS px apart at this scale); `runY` (679) shows the block is solid vertically. Values are exact palette entries either way.
3. Machine-body samples can be a crate top rather than a machine body when both share the `bodyLight` hex - the compared hexes are identical, so C3 is unaffected.
4. E3 byte budget is over by 3.21 kB for the reason above (audio tables in the base); no other budget was changed.
5. Only chromium headless is exercised (the only local browser); no Safari/Firefox numbers.
