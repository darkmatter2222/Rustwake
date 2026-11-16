# REV-LAYOUT-g1 - measured layout review at `3d589aa` (phone research layout = critical path)

- Head: origin/main tip `3d589aa811cec54bd2fbe7427a909cde9bab356b` = PUB-13, the docs child of `9dc4895` (E3 chunk split); `9fca373` (PUB-12) is its grandparent - both present after `git fetch`. Reviewed detached at the tip; `git status --short -- src tests scripts package.json vite.config.ts` = 0 modified.
- Gates (mine, at this tip): `npx vitest run` -> `Test Files 23 passed (23)` / `Tests 212 passed (212)` / `Duration 4.14s`; `npm run typecheck` -> `tsc --noEmit` no output; `npm run validate` -> `validated: no violations` + `| 0 violation(s)`; `npm run build` -> 53 modules, entry chunk `dist/assets/index-BZ9knt75.js` **225,861 B** (gzip 70.59 kB) + `tables-B-vOLV1r.js` 7,416 B + `index-Cwg_kGXQ.css` 7,224 B + `catchup.worker-DphWaCEx.js` 13,015 B -> the E3 split is in, **7,139 B** under the 233,000 ceiling.
- Conversion used: **device px = CSS px x dpr**; the bitmap is `round(css x dpr)` (`App.tsx:153-158`) and every painter works in CSS px under `setTransform(dpr,0,0,dpr,0,0)`; `dpr = clamp(devicePixelRatio,1,2)`. So: 844x390 dpr2 -> bitmap 1688x780; 390x844 dpr2 -> 780x1688; 1440x900 dpr1 -> 1440x900.
- Probes (untracked, in this worktree root): `probe-layout-g1.mts` (stub-context census + analytic projection), `probe-layout-g1b.mjs` (canvas `getImageData` census + element rects, 13 cases), `probe-layout-g1c.mjs` (DOM boxes with `--text-scale` forced to 1 and 2 exactly as `App.tsx:88-90` writes it). Camera facts: `fitCamera` = `clamp(view.width / 216, 1.4, 4)`, world centred at `(96, 112)`, `worldToScreen` = `(w - 96)s + W/2`, `(h - 112)s + H/2`.
- Landscape gap confirmed: `docs/screenshots/` holds **15 PNGs, none landscape** (no `slice-landscape-*.png`), so the 844x390 row of the Q-002 receipt (E4) has never been captured.

## 1. Measured frames - geometry and ink (all values from my runs; ink = pixels that differ from the two navy field colours, feature = additionally excludes the floor `34,56,74`)

| case | viewport | canvas CSS box | bitmap | s | yard rect x,y,w,h | world visible frac | ink % | feature % | ink bbox (dev px) |
|---|---|---|---|---|---|---|---|---|---|
| landscape rest | 844x390 dpr2 | 0,0,844,390 | 1688x780 | 3.9074 | 46.89, -242.63, 750.22, 875.26 | **0.4456** | 88.86 | 5.70 | 94,0,1500,780 |
| landscape build | 844x390 dpr2 | 0,0,844,390 | 1688x780 | 3.9074 | 46.89, -242.63, 750.22, 875.26 | **0.4456** | 88.98 | 7.37 | 93,0,1502,780 |
| landscape mature | 844x390 dpr2 | 0,0,844,390 | 1688x780 | 3.9074 | 46.89, -242.63, 750.22, 875.26 | **0.4456** | 88.86 | 3.37 | 94,0,1500,780 |
| phone rest | 390x844 dpr2 | 0,0,390,844 | 780x1688 | 1.8056 | 21.67, 219.78, 346.67, 404.44 | 1.0000 | 37.85 | 5.16 | 43,440,693,799 |
| phone build | 390x844 dpr2 | 0,0,390,844 | 780x1688 | 1.8056 | 21.67, 219.78, 346.67, 404.44 | 1.0000 | 38.11 | 6.62 | 42,416,696,823 |
| phone mature | 390x844 dpr2 | 0,0,390,844 | 780x1688 | 1.8056 | 21.67, 219.78, 346.67, 404.44 | 1.0000 | 37.85 | 8.60 | 43,438,694,801 |
| phone mature + research | 390x844 dpr2 | 0,0,390,844 | 780x1688 | 1.8056 | 21.67, 219.78, 346.67, 404.44 | 1.0000 | 37.85 | 8.60 | 43,438,694,801 |
| desktop rest | 1440x900 dpr1 | 0,0,1440,900 | 1440x900 | 4.0000 | 336.00, 2.00, 768.00, 896.00 | 1.0000 | 47.22 | 6.43 | 336,2,768,886 |
| desktop build | 1440x900 dpr1 | 0,0,1440,900 | 1440x900 | 4.0000 | 336.00, 2.00, 768.00, 896.00 | 1.0000 | 47.46 | 8.06 | 335,0,770,888 |
| desktop mature | 1440x900 dpr1 | 0,0,1440,900 | 1440x900 | 4.0000 | 336.00, 2.00, 768.00, 896.00 | 1.0000 | 47.23 | 10.68 | 336,1,768,887 |

Projection facts (mine): landscape visible band = world y **62.10..161.90** units; the dock (`DOCK_TILE` 2, y 16) projects to screen y **-180.11** (above the canvas) and the wreck (206.4) to **563.86** (below 390); the per-cell census gives row 0 = `null` (zero pixels) and rows 1-5 present. Phone: dock at y 248.67 and wreck at 592.44, both inside. Desktop: dock 66.0, wreck 827.6, both inside.

| case | `.hud__top` | `.objective` | `.status-line` | `.dock` | `.panel` | dock row |
|---|---|---|---|---|---|---|
| landscape rest ts1 | 10,8,824,44 | 10,58,400,29.8 | **0,0,0,0 (h=0)** | 162,336,520,46 | none | Store 90.3 + Salvage 328.5 + Build 89.2, h 46, 1 row |
| landscape rest ts2 | 10,8,824,44 | 10,58,400,83.3 | **0,0,0,0 (h=0)** | 162,336,520,46 | none | Store 105.1 + Salvage 304 + Build 102.9, h 46, 1 row |
| landscape mature ts1 | 10,8,824,44 | 10,58,400,29.8 | **0,0,0,0 (h=0)** | 162,336,520,46 | none | 5 buttons, h 46, x 162..682 |
| landscape mature ts2 | 10,8,824,63.9 | 10,77.9,400,47.6 | **0,0,0,0 (h=0)** | 162,315.2,520,66.8 | none | 5 buttons, h 66.8, x 162..682, 1 row |
| phone rest ts1 | 10,8,370,44 | 10,58,340.4,49.6 | 23,85.8,242.9,15.8 | 10,790,370,46 | none | Store 71.5 + Salvage 216 + Build 70.5, h 46 |
| phone rest ts2 | 10,8,370,65.2 | 10,79.2,340.4,83.3 | **0,0,0,0 (h=0)** | 10,790,370,46 | none | Store 86.3 + Salvage 191.5 + Build 84.2, h 46 |
| phone mature + research ts1 | 10,8,370,48 | 10,62,340.4,49.6 | 23,89.8,244.2,15.8 | 10,790,370,46 | 10,361.6,370,428.4 (ch 426 = sh 426) | 5 buttons, h 46, x 10..380 |
| phone mature + research ts2 | 10,8,370,96.9 | 10,110.9,340.4,83.3 | **0,0,0,0 (h=0)** | 10,719.2,370,**116.8** | 10,229.7,370,489.5 (ch 488 = sh 488) | 3 buttons h 66.8 at y 719.2 + 2 buttons h 46 at y 790 |
| desktop mature ts1 | 10,8,1420,44 | 10,58,420,49.6 | 23,85.8,244.2,15.8 | 440,846,560,46 | none | 5 buttons, h 46, x 440..1000 |

No case overflows the document (`scrollWidth == innerWidth`, `scrollHeight == innerHeight` in all 9); the panel never overlaps the dock (panel bottom 790.0 == dock top 790.0 at ts1, 719.2 == 719.2 at ts2) and never scrolls internally (clientHeight == scrollHeight).

## 2. Defect rows

| id | measured evidence (section 1, verbatim) | expected outcome | severity |
|---|---|---|---|
| L-1 | 844x390 dpr2: world visible fraction **0.4456**, yard `46.89, -242.63, 750.22, 875.26` in a 390 px canvas (`s = 3.9074`); dock projects to screen y **-180.11**, wreck **563.86**, per-cell census row 0 = `null`; unobstructed band 52..336 = **284 px** (32.4 % of the column) | the full focal column (dock, machine rows, wreck) plus the status line plus the 3 dock buttons inside 52..336, no clipping, no overlap, at ts1 **and** ts2: `s = 1.2034`, yard `231.05 x 269.56` at `306.47, 59.22`, dock 78.50, wreck 307.60 | **blocker** |
| L-2 | `.status-line` = **0,0,0,0** (`offsetHeight` 0) in the 4 landscape cases and in both phone ts2 cases, against **15.8** px at ts1 (`23,85.8,242.9,15.8`, `23,89.8,244.2,15.8`) - `.text-large .objective__row { display: none }` and `@media (max-height: 460px) { .objective__row { display: none } }` hide the whole row | `offsetHeight >= 14` at ts1 and `>= 18` at ts2 in all 9 cases, with the hint text unchanged | **major** |
| L-3 | phone mature+research ts2: `.dock` = **10,719.2,370,116.8** (two rows: 3 buttons h **66.8** at y 719.2 + 2 buttons h 46 at y 790) vs **10,790,370,46** at ts1 | one dock row of h 46 at ts2 (labels shorten before the row wraps), dock top stays at 790, so the panel keeps 489.5 px and the chrome total drops from 213.7 px | **major** |
| L-4 | row-0 level digit glyph box **[-0.25, 4.00]** units vs the perimeter rail **[0, 2]** -> overlap **2.00 units = 8.00 CSS px** at `s = 4`, **7.81** at 3.9074, **3.61** at 1.8056 (chromium metrics: ascent 17 / 16 / 8 px for fonts 24 / 23 / 11 px, width("14") 25.88 / 24.8 / 11.86); rows 1-5 overlap **0** | overlap **0** for all six rows; row-0 glyph box **[4.75, 9.00]** units (anchor `p.y - 12 * s` -> `p.y - 9 * s`) | **major** |
| L-5 | mature per-cell feature ink: **1.76** (desktop) / **1.81** (phone) for 21 of 36 cells against **54.70-68.96** in the occupied ones, 19.63 where the FK1 path crosses, max/min ratio **39.2** | every empty cell **>= 8.0 %**, max **<= 70 %**, max/min **<= 8.0** via kit tuples that reuse colour indices 4/12/13 (0 new paint groups): 10.2 / 11.7 / 14.1 % families | **minor** |
| L-6 | landscape census ink **88.86 / 88.98 / 88.86 %** but feature **5.70 / 7.37 / 3.37 %** (floor plus kit only - no object row is on screen) | feature ink **>= 20 %** in all three landscape cases once L-1 restores the object rows | **minor** |
| L-7 | `docs/screenshots/` = **15 PNGs, none landscape**; the Q-002 pixel manifest lists 7 cases (4 phone + 3 desktop), so the 844x390 row of E4 has no capture | the manifest carries **10** cases including `landscape-rest/build/mature` with the 7-field header block and the B-02 sample contract (7 keys = palette hexes +/- 2) | **major** |

## 3. Acceptance tests - one runnable check per id

| id | the check a developer pastes in | expected numeric value / tolerance |
|---|---|---|
| L-1 | vitest (pure, `src/game/renderer/scene.ts`): `const { scale } = fitCamera({ width: 844, height: 390 }, { top: 52, bottom: 46 })`; then `screenY(16)` / `screenY(206.4)` from the returned camera through `worldToScreen` | `scale == 1.2034 +/- 0.001`; `top == 59.22 +/- 0.5`, `bottom == 328.78 +/- 0.5`; dock **78.50** and wreck **307.60**, both in [52, 336]; unchanged at (390,844,{48,46}) `1.8056` and (1440,900,{48,46}) `4.0000` |
| L-2 | vitest + jsdom: render, then `getComputedStyle(document.querySelector('.status-line')).display !== "none"` and the same inside the two rules' breakpoints (`--text-scale` = 1 and 2 as `App.tsx:88-90` writes it) | `display == "block"`, computed `font-size == 12.48px` at ts1 (0.78rem) and `== 24.96px` at ts2, +/- 0.05; the harness prints the rect heights **>= 14 / >= 18** (jsdom rects are 0 by construction, so the box comes from the capture harness) |
| L-3 | vitest + jsdom: `getComputedStyle(dock)` and each `.dock__btn` after setting `--text-scale: 2` + `.text-large` | `flex-wrap == "nowrap"`, every button `min-height == 46px`; harness prints the dock box `10,790,370,46` (+/- 0.5) instead of today's `10,719.2,370,116.8` |
| L-4 | vitest (stub ctx, mature fixture, `s` in {1.2034, 1.8056, 3.9074, 4}): per row 0..5 compute `glyphTop = baseline - 0.708 * 6` from the recorded `fillText` anchor and print `overlap = max(0, min(bottom, railTop + 2) - max(top, railTop))` | `overlap == 0` for all 6 rows; row 0 prints `top=4.75 rail=[0,2] overlap=0.00` |
| L-5 | vitest (stub ctx + the same cell census): feature ink per cell for tiles 12,13,15,16,17,19,21,23,24,27,28,29 plus the two max/min ratios, and the census caps | `min == 10.20 >= 8.0`, `max == 68.96 <= 70`, `ratio == 6.76 <= 8.0`; `maturePaints == 170 <= 215`, `amberOps == 6 <= 12`, `gridStrokes == 0`, `minFeaturePx == 3.50` |
| L-6 | the capture harness prints the landscape census; assert it inside the band | feature `>= 20.0` for the 3 landscape cases (today 5.70 / 7.37 / 3.37), ink stays **86.0-90.0** |
| L-7 | harness + manifest check: 10 cases, `viewport == 844x390` on exactly 3, all 7 header fields non-empty, 7 sample keys within +/- 2 of the palette hex | `landscape frames == 3/3`, `key diffs == 0 over 10 x 7`, ink `88.86 / 88.98 / 88.86 +/- 0.3` |

- Suite arithmetic: **212** today (measured) -> **217** with the five new vitest cases (L-1, L-2, L-3, L-4, L-5); L-6 and L-7 are printed by the capture harness and reviewed against section 1, so they add no count. `>= 212` is the E1 floor for this slice, 217 afterwards. No existing assertion may be relaxed.
- Pixel diff: DOM-only rows (L-2, L-3) must keep the present max changed-pixel fraction **0.000152**; L-1, L-4 and L-5 deliberately change geometry and each prints its own new value next to the pair list, which must stay under the 0.02 E-gate.

## 4. Not provable headlessly

- **B-08** real-device trace: p95 main-thread work < 10 ms on a midrange Android and an iPhone (headless chromium gives no usable frame pacing).
- **B-09** human first-feel pass: two readers naming the six roles and the current objective without prompting, at ts1 and ts2.
- **B-11** audio listening pass: per-cue note and gain judgements for the five cues; the S-01..S-22 structural assertions do not cover how the mix sounds.
- **Q-004 5 s clip**: still uncapturable until `getFramePhase()` exists, so `motion` stays pending.
- Real-device font metrics: the digit advance 25.88 / 24.8 / 11.86 px above is headless chromium's `system-ui`; a device may differ by a few tenths, which is why L-4 asserts the overlap, not the raw advance.