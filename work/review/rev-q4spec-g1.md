# REV-Q4SPEC - implementation-ready spec for Q-004 (generation 1, id `rev-q4spec-g1`)

- Base measured: `0606d3784667d416fea797119deaf328e9212635` (integrated head, remote main; reviewer checkout detached at it, production files unmodified).
- Owns the **motion clock** and the salvage-feedback group. Does not re-open Q-002 geometry: `PARTS`, `AMBER_SHAPES`, `FEATURE_MIN_UNITS = 2`, `LEAN_UNITS = 4`, `STATUS_ACCENTS`, `CELL = 32`, `WORLD_W/H = 192/224`, `WRECK_POSITION = (80, 206.4)`, `DOCK_TILE = 2`, `TICK_MS = 100`, `droneTravelTicks = 10`, `manualPulseTicks = 6`, `routeLatencyTicks = 5` stay as they are.
- Scope files: `src/game/renderer/scene.ts` (`drawDrones`, `drawRoutes`, new `framePhase` use), `src/app/store.ts` (expose the sub-tick phase already computed by the frame loop: `accumulator / TICK_MS`), `src/ui/App.tsx` (pass it into `DrawOptions`), `src/game/renderer/sprites.ts` (feedback part rows only), `tests/renderer/scene-draw.test.ts` (new cases), `scripts/capture-clip.mjs` (new, reuses the `scripts/capture-style.mjs` lease/viewport convention), `docs/evidence/` (clip manifest + frame list).
- Out of scope: the audio bus/listening work (Q-005 / B-11), `Panels.tsx` DOM (Q-001), the two open Q-002 follow-ups **B-01** (element-scoped sheet) and **B-02/B-03** (sampler agreement + D8 mask assert) - this spec requires them as 3D-9 and 3D-10 but does not replace them.
- Clock facts measured at this base: `store.ts` keeps `accumulator` after subtracting whole ticks (line ~236), so the sub-tick phase exists but is not exported; `drawDrones` still derives `t` from the integer `state.tick` (`scene.ts` line 423) and `drawRoutes` from `state.tick` (line 387) - that is the teleport source.
- Baseline measured by this review at the base: `npm test` -> `Test Files 23 passed (23) / Tests 208 passed (208)`; `tsc --noEmit` clean; `validated: no violations` with `firstDrone=268 firstResearch=478 tick=18298 machines=8 links=18 drones=5 batches=1902 credits=82 nodes=3 | 0 violation(s)`; `dist/assets/index-oeY4tDi3.js` = **232,815 bytes** (gzip 73.63 kB, 53 modules); draw census (stub ctx, FS-1 at 390x844, s=1.8056): rest **63** paints / 283 ops, build **66** / 322, selected **64**, mature **168** / 607, mature build **171**; grid strokes 0 at rest and 1 in build; min painted feature height **3.50 CSS px**; ink 46.03 % phone rest.

## 2. The two contracts every number depends on

- **C-1 clock contract.** `store` exposes `getFramePhase(): number` in `[0, 1)` = `accumulator / TICK_MS` read from the same `frameClock` the tick loop already uses; `DrawOptions` gains `framePhase: number`; `App.tsx` reads it once per `requestAnimationFrame` and passes it down. Inside one tick the phase is monotonically increasing; on a tick boundary it restarts at the remainder. A follower (`role === "reader"`) computes the phase from `frameClock()` minus the last adopted snapshot's `lastSeenMs`, clamped to `[0, 1)`.
- **C-2 fixture contract.** FS-1 as in `rev-q2spec-g3` section 2.1 (six salvage pulses, repair, top-up, sorter on tile 8, furnace on tile 14, two links, stopped at the tick where both links carry cargo and the drone is airborne). The behaviour fixture is `docs/evidence/yard-mature.json` (tick **18298**, 8 machines, 18 links, 5 drones, checksum `eede3c4f`). Both are `seeded`. The stub-context census and the clip must use these two states only, so every number below is reproducible from the command list.

## 3. Acceptance checks (all numeric)

### 3A Interpolation (the drone and the cargo tokens move between ticks)

| id | requirement (one line) | limit | how measured |
|---|---|---|---|
| A1 | `t` for a unit is a function of `(inFlight.arrive, framePhase)`, not of `state.tick` alone | two `drawScene` calls with the same `state` and `framePhase` 0.0 vs 0.9 differ in the drone group | stub ctx: drone-group op coords differ in >= 4 of the 6 drone ops |
| A2 | distinct drone sub-positions per tick at 60 Hz, FS-1 **and** the 18298-tick behaviour fixture | **>= 5** per tick (6.0 frames exist per 100 ms tick; one may merge) | 12 consecutive rAF frames recorded in-page, y-coords of the lead drone counted |
| A3 | max per-frame displacement, 390x844 dpr2 | **<= 7.0 CSS px** (14 device px) | leg = 343.74 CSS px / 10 ticks = 34.37 px/tick = 5.73 px/frame + arc term 0.95 px/frame = 6.68 -> cap 7.0 |
| A4 | max per-frame displacement, 1440x900 dpr1 | **<= 15 CSS px** | 761.6/10 = 76.16 px/tick = 12.69 + 2.10 = 14.79 -> cap 15 |
| A5 | not frozen: consecutive frame pairs with a real move | **>= 80 %** of pairs with |delta| >= 0.5 CSS px | frame log over 5 s = 300 frames |
| A6 | follower tab (`role === "reader"`) between two adopted snapshots | **>= 3** distinct positions, and never a backwards jump (|delta| <= A3 limit) | mirrored-tab clip, same fixture |
| A7 | reduced motion keeps documented steps | `t` in {0, 0.5}; lead unit centre at **(166.11 + lean_i, 402.47) +/- 1 CSS px** at 390x844, `lean_i` in {-14.44, -7.22, 0, 7.22, 14.44} | analytic from `WRECK_POSITION`, `DOCK_TILE`, `fitCamera(390)=1.8056`; assert in the stub test |
| A8 | reduced motion still separates the 5 units | 5 distinct x-offsets, pitch **>= 4 units** (7.22 CSS px at phone, 16 CSS px at desktop) | stub test on the recorded drone rows |
| A9 | cargo tokens on links interpolate like the drone | same A2/A3 limits with the 5-tick latency (11.56 px/tick = 1.93 px/frame at phone) | token y monotone within a leg, >= 5 sub-positions |
| A10 | no wall-clock read inside the renderer | the 60-frame op log is identical for two runs of the same (state, framePhase) sequence | determinism case, extends D4 |

### 3B Machine and queue state under motion (world and panel agree in the same frame)

| id | requirement (one line) | limit | how measured |
|---|---|---|---|
| B1 | one state read per rendered frame feeds both surfaces | `store.getState()` called **<= 2** times per rAF | counted in the render effect (stub counter) |
| B2 | the drawn accent equals the panel's status through one table | accent hex == `STATUS_ACCENTS[state.machines[i].status]` for all 8 machines in the 18298 fixture | 8/8, stub test |
| B3 | `powerLimited` is visually distinct from `idle` **while animating** | `#7fd6c2` vs `#6f93ad`, WCAG vs floor **>= 3.0** each (7.10 vs 3.72), and the two differ in >= 2 of 3 channels by >= 20 | fixture with `powerRatio < 1` on the 8-machine yard |
| B4 | number of animating machines equals the number of running accents | exact match, all frames of the clip | 0 mismatches in 300 frames |
| B5 | a starved machine shows no work animation | its part coords identical across 3 consecutive frames (delta **0**), accent `#8a7ad8` | stub test on the 18298 fixture (5 starved machines) |
| B6 | tray/buffer quantities do not flicker between the panel and the world | tray token present iff `trayUnits > 0`; 5-pip gauge filled = `clamp(ceil(ratio x 5), 0, 5)` for `storeUnits/storeCapacity` | 18298 fixture: tray 0/12 -> 0 tokens; store 312/900 -> 2 pips |
| B7 | selection feedback latency | selection outline appears in the **first** `drawScene` after the tap (<= 1 rAF, 16.7 ms) | event timestamp vs op log |

### 3C Salvage feedback (readable multi-frame response, bounded ops)

| id | requirement (one line) | limit | how measured |
|---|---|---|---|
| C1 | one impact group = flash 1 + separation 3 + settle 2 + shadow 1 | **<= 8** paints per active impact | stub census delta vs the same frame with no impact |
| C2 | at most 2 impacts alive at once (6-tick pulse cadence vs <= 5-tick event) | concurrent groups **<= 2** -> <= 16 paints | op log grouping by the impact index |
| C3 | frame-with-feedback paint cap, FS-1 | **<= 75** (measured rest 63 + one 8-paint group + 4 margin) | stub census |
| C4 | frame-with-feedback paint cap, behaviour fixture | **<= 235** = 40 fixed + 8x12 + 18x3 + 5x5 + 2x8 = 231, rounded to 235 (measured 168 + 2x8 = 184) | stub census |
| C5 | standing caps unchanged as the floor | rest <= **80**, build <= **90**, mature <= **215** (measured 63 / 66 / 168) | stub census |
| C6 | total ops (not only paints) stay bounded | FS-1 rest <= **300**, FS-1 build <= **330**, mature <= **700** (measured 283 / 322 / 607) | stub census |
| C7 | the event fits inside one pulse cadence | flash on ticks n..n+1 (<= 200 ms), separation n+1..n+3 (<= 300 ms), settle <= n+5 (<= 500 ms) and the group is gone by tick n+5, i.e. **<= 5 ticks < manualPulseTicks (6)** | tick-stamped op log |
| C8 | the flash is actually visible | the flash rect exists in **>= 2** consecutive frames with the same coords and is absent in frame 4 of the event | 300-frame log |
| C9 | material separation is readable | the debris tokens move **>= 1.5 CSS px per frame** apart, in <= 3 tokens, and stop within 3 ticks | frame log |
| C10 | amber budget holds during feedback | amber ops **<= 12** per frame and every amber tuple in {(2,2),(3,3),(4,4)} units (measured 4 ops in FS-1, 6 in mature) | stub census, as D7 |
| C11 | a working furnace pulses and a paused one quiets | running: glow circle in 3 of 6 ticks; paused: identical coords across 3 frames | stub census per status |

### 3D Evidence: the 5 s clip that unlocks the motion gate

| id | requirement (one line) | limit | how measured |
|---|---|---|---|
| D1 | one headless clip, 390x844 dpr2, FS-1, 5.0 s, frames at **0.0 / 0.5 / 1.0 / 2.0 / 3.0 / 4.0 / 5.0 s** (7 PNGs) plus a 3-frame desktop set at 1440x900 dpr1 (0.0 / 1.0 / 2.0 s) | 10 PNGs, all present, named `clip-phone-<ms>.png` / `clip-desktop-<ms>.png` | file listing in the manifest |
| D2 | every frame carries the header block | candidate SHA, viewport, dpr, scenario id, provenance (`seeded`), timestamp, chromium version | manifest schema check |
| D3 | ink stays in the slice band, phone frames | **45.5 <= ink% <= 48.5** for all 7 frames (measured 46.03 / 46.03 / 46.17 / 47.61) | page-PNG exact-RGB census |
| D4 | ink stays in the slice band, desktop frames | **53.0 <= ink% <= 54.2** (measured 53.53 / 53.51 / 53.71) | same |
| D5 | the six role masks do not drift during the clip | the 8x8 mask hash of dock/sorter/furnace/wireMill/signalLab/wreck is identical in all 7 frames; min pairwise Hamming stays **>= 13/64** | mask strings printed per frame |
| D6 | motion is proven by the frames, not asserted | the lead drone's centre differs from the previous sampled frame in **6 of 7** frame pairs, with per-frame |delta| <= the A3/A4 caps | decoded PNG centroid of the `#5fd8e8` body colour |
| D7 | accompanying draw-bound assertions run on the same fixture | A1, A2, A5, A8, B2, B4, B5, C1-C6, C10 plus the existing D4/D5/D6/D9 equivalents green | `tests/renderer/scene-draw.test.ts` |
| D8 | the clip is captured with `prefers-reduced-motion` off, and a second 7-frame set with it on | the reduced set satisfies A7/A8 exactly (<= 1 px) | both manifests |
| D9 | **B-01 requirement (from rev-q002-g1)**: the silhouette sheet is element-scoped | `slice-sheet-silhouette.png` IHDR equals the printed content box **+/- 1 px** (expected 639x202 today) | IHDR vs the printed box in the receipt |
| D10 | **B-02/B-03 requirements**: evidence-layer agreement + the D8 mask assert | every `samples[key]` equals its palette hex within +/- 2 per channel over all cases; 17/17 first-frame masks non-empty | pixels JSON vs receipt diff; new test case |
| D11 | no new capture dependency | `package.json` diff over the base..candidate range stays empty | `git diff` |

### 3E Regression floor (measured at `0606d37`; nothing here may go down)

| id | requirement | measured at this base | limit |
|---|---|---|---|
| E1 | `npm test` | `Test Files 23 passed (23) / Tests 208 passed (208)`, 0 skipped | >= **208** tests / 23 files, 0 skipped-by-deletion, no existing assertion relaxed (re-measure if another slice lands first) |
| E2 | `npm run typecheck` | clean (`tsc --noEmit`, no output) | clean |
| E3 | `npm run validate` | `validated: no violations` **and** behaviour line `| 0 violation(s)` | 0 + 0, and the behaviour line stays `firstDrone=268 firstResearch=478 tick=18298 machines=8 links=18 drones=5 batches=1902 credits=82 nodes=3` |
| E4 | built js size | `dist/assets/index-oeY4tDi3.js` = **232,815 B** (gzip 73.63 kB, 53 modules) | <= **233,000 B** per `rev-q002-g1` section 5 (185 B of headroom today: 232815 > 232800, which is why the ceiling is 233000 and not 232800) |
| E5 | save compatibility | `schemaVersion: 1`, fixture checksum `eede3c4f` | unchanged; the same command list yields the same checksum |
| E6 | draw census floor | rest 63 / build 66 / mature 168 paints; total ops 283 / 322 / 607; grid strokes 0 / 1; min feature 3.50 CSS px | no paint or op increase beyond C3-C6, and grid strokes still 0 at rest |
| E7 | no new runtime dependency | `package.json` unchanged over the base range | empty diff; devDependencies only if the clip needs a runner, otherwise none |
| E8 | touch and layout floors | dock minimum targets and the 46 px floor from `tests/ui/hud-layout.test.ts`; ink band of 3D D3/D4 | green, ink inside the band |

## 4. What is gateable headlessly and what stays pending

- **Gateable now, headless (chromium + stub ctx):** every row of 3A, 3B, 3C, 3E and 3D except D9's second reader - i.e. A1-A10, B1-B7, C1-C11, D1-D8, D10-D11, E1-E8. The clip is a real capture (7 + 3 PNGs with per-frame ink and mask checks), so it satisfies the DESIGN_BIBLE line 45 motion gate without a phone.
- **Not gateable here, stays pending:** audio listening (**B-11**: per-cue notes and gain pass by a listener), real-device trace (**B-08**: p95 main-thread work < 10 ms on a midrange Android and an iPhone), human first-feel comprehension (**B-09**), and the second independent silhouette reader for Q-002 B1.
- **Categories this spec can move:** `motion` pending -> **>= 3** (A1-A10 + D1-D8), `state fidelity` 2 -> **>= 3** (B1-B6). It does not move `audio` (Q-005 / B-11), `performance/accessibility` beyond the frame-pacing line (B-08), or `readability` (Q-001 closed it).

## 5. Run order and the reviewer queue

1. `npm test` -> `npx tsx probe-scene-g3.mts` (census floor E6) -> `npm run build` -> `npx vite --port 5174 --strictPort` (background) -> `RUSTWAKE_URL=http://localhost:5174/ node scripts/capture-clip.mjs` -> `node scripts/capture-style.mjs` (D9 element-scoped sheet).
2. Handoff must quote: the vitest tail, the `dist/assets/index-*.js` byte length, the frame list with per-frame ink and mask hash, and the C3/C4 census numbers.
3. Reviewer scores 3A-3E only, on the exact candidate SHA, and returns `accept | rework | blocked` with the numbers seen; `motion` and `state fidelity` may rise only with D1-D8 attached.

Prioritized next five (presentation area, updated after `rev-q002-g1`): **1. Q-004** as specified here (unlocks the motion category and closes B7's visual half); **2. B-02 + B-03** evidence-layer hardening, folded in as D10 so one run covers both; **3. Q-003** close-out on 3B-5/3B-6 (one clamp test); **4. Q-007** five-accent colour-distinctness test (`#7fd6c2` already shipped, B3 above pins it); **5. Q-008** keyboard selection cycling, then B-04/B-05/B-06 polish.

Unverified by this file (authored spec, no new browser run beyond the gates in the header): the clip itself (does not exist yet), the real device numbers, the audio listening verdict, human comprehension. Report path: `review-r1/rev-q4spec-g1.md`. Candidate SHA to be reviewed: the developer's tip after `0606d37`.
