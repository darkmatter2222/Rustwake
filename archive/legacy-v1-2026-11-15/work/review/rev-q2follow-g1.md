# REV-Q2FOLLOW-g1 - the two Q-002 lines that block "closed" (B-02, B-03)

- Head: `090260aa751ec3c6f3d734849b3844b11a2d97cb` (`090260a`, includes A-26/A-29); reviewer checkout detached at it, no production file modified (`git status --short -- src tests scripts package.json vite.config.ts` = empty).
- Finding text is mine (`rev-q002-g1.md` section 6); this file only turns B-02 and B-03 into lines the developer can implement. Severity both **medium** (evidence-layer only, no visual regression risk).
- Repro for every number below: `npx tsx probe-d8-g1b.mts` (stub ctx, FS-1 at 390x844, `s = 1.8056`) and `node scripts/capture-style.mjs`.

## B-02 - sampler/table agreement (medium)

| id | requirement (one line) | measured now | required | acceptance test |
|---|---|---|---|---|
| B-02a | one owner of the numbers: `scripts/capture-style.mjs` writes the JSON and renders the `docs/evidence/2026-11-03-style-slice.md` sec.1 rows from that same in-memory object - no hand-typed tuples anywhere | 2 sources, 2 keys disagree in all 7 cases | exactly 1 writer, 0 differing keys | harness prints `samples-agreement: 7 cases x 7 keys, 0 diffs` |
| B-02b | per-key palette equality: for every case (phone-rest, phone-build, phone-mature, phone-one-machine, desktop-rest, desktop-build, desktop-mature) and every key in {backdrop, floor, wreck, machineTop, machineWell, dockPad, amberToken}: `abs(samples[key][ch] - PALETTE_RGB[key][ch]) <= 2` for ch in {r,g,b} | 14 of 49 checks fail today (2 keys x 7 cases): `dockPad` 244,247,251 vs 127,159,187 (delta 117/88/120), `amberToken` 60,54,51 vs 255,183,101 (delta 195/129/50) | 0 of 49 fail | vitest case `B-02 samples match palette` reading `docs/evidence/2026-11-03-style-slice-pixels.json` + the `PALETTE` import |
| B-02c | printed-tuple equality between the two artifacts: md row tuple == JSON tuple character-for-character, and the md ratio == WCAG(rgb of tuple, floor rgb) +/- 0.005 | C4 md 4.375 (`127,159,187`) vs JSON 11.28 (`244,247,251`), delta 6.905; C5 md 7.049 (`255,183,101`) vs JSON 1.02 (`60,54,51`), delta 6.029 | 0 diffs, every ratio within +/- 0.005 of the recomputed value | same case asserts the md parse (7 rows) against the JSON |
| B-02d | expected values after the fix: `dockPad` = `127,159,187` -> C4 **4.375**; `amberToken` = `255,183,101` -> C5 **7.049**; the other five keys stay `11,18,32` / `34,56,74` / `109,144,171` / `138,169,196` / `14,23,38` | dockPad/amberToken wrong in all 7 cases | both tuples + both ratios as printed, identical in all 7 cases | B-02b/B-02c green; receipt sec.1 rows C4/C5 keep 4.375 and 7.049 |
| B-02e | sampling scope is the role's declared box inside the **canvas element**, first exact match row-major - the reason the two wrong values appeared is page-scope first-match order: `244,247,251` is `select` (#f4f7fb, the selection outline drawn over the pad, 2,295 px at 390x844) and `60,54,51` is #3c3633, the DOM amber button interior (105 px); neither is the role entry (pad body = `bodyMid` #7f9fbb = 127,159,187, canvas amber = #ffb765 = 255,183,101, 898 px) | page screenshot, 1 page-level first-match per key | element clip == canvas box (same clip as B-01/B-04), 2,295 px and 105 px never sampled as those roles | census prints the px count per key (expect 127,159,187 >= 2,100 and 255,183,101 >= 700 at phone rest) |

## B-03 - D8 first-frame mask completeness (medium)

| id | requirement (one line) | measured now | required | acceptance test |
|---|---|---|---|---|
| B-03a | case name: `D8 first-frame mask completeness: 9 RS-1 entities + 8 floor-kit marks non-empty (17/17)` in `tests/renderer/scene-draw.test.ts`, run on the first `drawScene` after the FS-1 start gesture, build mode on (the only frame carrying the ghost) | receipt prints `D8` as **info**, no assert exists | PASS/FAIL line, receipt prints `D8 17/17` | the new case + receipt row `| D8 17/17 |` |
| B-03b | the 17 boxes, 8x8 mask each (units, origin = cell/paint centre; CSS px at `s = 1.8056`): E1 wreck 44x28 (79.4x50.6), E2 dock 26x20 (47.0x36.1, x 142.5 y 230.5), E3 sorter 24x22 (43.3x39.7, 144.5/286.5), E4 furnace 20x16 (36.1x28.9, 148/350), E5 drone 12x8 + shadow rx 5 (21.7x14.4, 148/350 group), E6 cargo tokens 3x3 each x3 (5.4x5.4, 180.5/341 and 163.5/251.5), E7 ghost 28x28 (50.6x50.6, tile 20), E8 `.panel` DOM rect (>= 1 glyph), E9 links 2 strokes (190.5 px span); FK1 path 6x100, FK2 drainage 2x176, FK3 3 puddles rx 10 ry 3, FK4 rails 2x192 + 24 posts 2x3, FK5 2 crates 5x5 + tops 5x2, FK6 pole 2x10 + cable 16x2, FK7 shadows 2x2 ellipses, FK8 gravel ticks 3x3 | the same op log is produced (63 paints rest / 66 build); per-box counts are not printed | 17 boxes each with **>= 1** set cell, total **>= 200** set cells, counts printed | stub ctx: cell set from recorded rect/ellipse coords, no canvas read |
| B-03c | non-vacuity via op-log index windows (measured, FS-1 rest, 63 paint ops): backdrop/floor ops 1-5, FK1-FK8 + gravel 10-139, links 145-151, wreck 160-178, dock 180-202, sorter 204-218, furnace 232-256 (+ tray token amber at 256), drone 264-282 (nose `#f4f7fb` 282), ghost after 282 in build | indices reproduced exactly by the probe | every box claims >= 1 op inside its own window, no window empty | assert `firstIdx(box) < lastIdx(box+1)` and `setCells(box) >= 1` for all 17 |
| B-03d | mutation guard: shrinking any one box to 0x0 must fail the case | not present | 17 single-box mutations all fail | parametrised sub-case `D8-mut-01..17` |

## 3E floor re-verified at `090260a` (all four gates re-run in this checkout)

| gate | tail as printed | vs `rev-q4spec-g1` 3E |
|---|---|---|
| `npx vitest run` | `Test Files 23 passed (23)` / `Tests 210 passed (210)` / `Duration 4.03s` | **E1 holds** (floor `>= 208`, now 210) - the +2 are A-26/A-29 in `tests/game/audio.test.ts`; 0 skipped |
| `npm run typecheck` | `> tsc --noEmit` then no output | **E2 holds** |
| `npm run build` | 53 modules; `assets/index-oeY4tDi3.js` 232.78 kB, gzip 73.63 kB; `index-Cwg_kGXQ.css` 7.22 kB; `catchup.worker-DphWaCEx.js` 13.02 kB | **E4 holds**: byte length read from `dist/assets` = **232,815 B** <= 233,000 (185 B headroom); same content hash as at `0606d37`, because `git diff --stat 0606d37 090260a -- src` is empty (only `tests/game/audio.test.ts` changed, +119/-11) |
| `npm run validate` | `validated: no violations`; `behaviour: firstDrone=268 firstResearch=478 tick=18298 machines=8 links=18 drones=5 batches=1902 credits=82 nodes=3 \| 0 violation(s)` | **E3 holds** (0 + 0, behaviour line unchanged) |
| save fixture | `docs/evidence/yard-mature.json`: `schemaVersion: 1`, `checksum: eede3c4f`, `tick: 18298`, `revision: 1458` | **E5 holds** |

**Floor verdict: holds.** Every 3E number is still met at `090260a` - 210 >= 208, 232,815 <= 233,000, checksum `eede3c4f`, `schemaVersion` 1, 0 + 0 violations, no new dependency (`package.json` unchanged over `0606d37..090260a`).

Spec lines that need the new value (nothing else moves):
1. `rev-q4spec-g1.md` 3E row **E1**: `>= 208 tests / 23 files` -> `>= 210 tests / 23 files` (its own parenthetical "re-measure if another slice lands first" is the clause that fired).
2. `.rustwake-runtime/reviewer/rev-q4spec-g1.json` `baselineMeasured.vitestTail`: `Tests 208 passed (208)` -> `Tests 210 passed (210)`, `Duration 4.06s` -> `4.03s`; add `"reMeasuredAt": "090260a"`.
3. `rev-q4spec-g1.md` header "Baseline measured by this review" sentence: same `208 -> 210` substitution; the js line stays **232,815 B / `index-oeY4tDi3.js`** unchanged.
- Not changed by this head: 3A/3B/3C/3D rows (no `src/` change), the 233,000 ceiling (`rev-q002-g1` sec.5), the ink band and census floors (same bundle, same PNGs).
