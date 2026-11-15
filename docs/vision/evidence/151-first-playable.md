# 151 — G1/P1 first-playable gate evidence

- Issue: [#151](https://github.com/darkmatter2222/Rustwake/issues/151) — `[RW3D][P1][T24] Verify accessibility, performance and complete first playable gate`
- Role: **developer (pass 4/4, final)** — non-vision agent. Numeric and geometric evidence only. This document renders **no ACCEPT/REWORK verdict** and does not close #151.
- Branch: `rw/151` (isolated worktree; no direct main push, no merge)
- **Immutable measurement head: `e75ecf3e95dcd86564e5adc216974b6fdc0c6089`** — the head QA and product review.
- App-code heads inside that commit: `src/` = `2d01905a2f9d70cbda719793cbc062ac505dc107`, `tests/` = `f17343b`, `scripts/` = `7ec32526f264382b5be224e376d126fb68dd2f56`.
- PR: the linked **draft** PR for `rw/151` opened by this pass. Its body reads **"Part of #151"** (the publish helper's hardcoded `Closes #151` was replaced). PR number/URL are recorded in the role-stamped handoff comment on #151 and in the publication receipt.
- Rows in scope (`docs/vision/ACCEPTANCE.md:58`): **V01–V06, U01–U07, E01–E09, P01–P03, R01** — 26 rows. E10–E12, D01–D06, N01–N06, R02–R03 belong to later gates and are not claimed here.
- Criteria below are quoted from `docs/vision/ACCEPTANCE.md` (rows 7–47). **No criterion was rewritten, weakened or re-scoped, and no performance budget was lifted.**

## Status vocabulary

| Status | Meaning in this document |
|---|---|
| MET | Proof exists at the cited head for the whole criterion, within the stated capability limits (headless emulation, simulated agent). |
| MET (numeric) + PENDING-VISUAL | Geometric/numeric half proven; the vision-capable half is still owed by the sponsor. Never a visual acceptance. |
| PENDING-VISUAL | Only a vision-capable reviewer can decide; numeric proxies are recorded but do not satisfy the row. |
| PARTIAL | Some clauses proven, at least one clause unproven/unmet. The unproven clause is named. |
| BLOCKED | The required evidence **cannot be produced from the running build at this head**. Named blocker, no workaround claimed. |
| UNKNOWN | No measurement (`met: null`). Stays UNKNOWN; never promoted to MET. |

## 1. Shared measurement context

**Device / browser / quality** (all headless emulation on one desktop host — **not a physical phone**, #190):

- Capture harness (`scripts/capture-g1-151.mjs`): phone `390x844 @2x, isMobile, hasTouch`; desktop `1440x900 @1x`.
- P03 (`tests/perf/perf-151.evidence.mjs --mode p03`): phone `390x844 @2x`; desktop `1920x1080 @1x`; CPU throttle rate **6x** for the throttled passes; `http://localhost:4167/`.
- P01/P02: desktop `1440x900 @1x`, `dpr 1`.
- Browser: `C:\Program Files\Google\Chrome\Application\chrome.exe`, `HeadlessChrome/157.0.0.0`, GPU `ANGLE (NVIDIA, NVIDIA GeForce RTX 5090 (0x00002B85) Direct3D11 vs_5_0 ps_5_0, D3D11)`, `swiftshaderForced: false`, `hardwareConcurrency 32`, `deviceMemory 32`.
- Quality tier (P01, verbatim): `blockout-flat: no shadows, DPR cap 2, hemisphere 1.6 + directional 1.0, instanced batches (no quality auto-tuner exists yet)`. three.js revision **187**. P03 additionally measures the forced **FALLBACK-2D** path.

**Scenario / seed / save hash.** Release fixtures from `tests/fixtures/release.ts` (OPENING, CHOICE-LOCAL, CHOICE-REMOTE, BLOCKED, MATURE = 20 buildings / 30 units / 200 cargo, STRESS = 100 / 100 / 1000), seeded through the game's own `encodeSave` before first paint, only when the slot is empty, with `lastSeenMs` re-stamped at document start so `store.creditAbsence` adds no offline catch-up ticks. Round-trip seed precondition `tutorial=9` (the engine's own unlock value). Save hashes:

- Export A `sha256 01955196345c4542c6c7d547a90f32c1b14832e85dd02d5adbfe3f0fcdae4e44`, 10765 chars, tick 140.
- Export B `sha256 625cc850d8f17ed6fbfa5fae6cca77297229b8c204e2edc25c1677b2cdae7660`, 10854 chars, tick 166.
- Export C `sha256 3ed1045870eb4eb4493e9eab1773c223ff083224a2849d424147a507e68fab81`, 10765 chars, tick 147.
- P02 context-loss save `sha256 020701a2f43d2641ab971420c747bcf274ed2b4bac58e8e50d9c218fc9d9301f`, 11353 bytes before **and** after.

**Commands.** Gates (run once by this pass at `e75ecf3`, §2): `npx tsc --noEmit`, `npx tsx scripts/validate-content.mjs`, `npx vitest run` (plain, no worker flags), `npm run build`. Measurement harnesses (run in passes 1–3, **cited, not re-run**): `node scripts/capture-g1-151.mjs`, `npx tsx tests/perf/perf-151.evidence.mjs --mode p01|p02|p03`, `npx tsx tests/ui/keyboard-walkthrough-151.evidence.mjs`.

**Artifact index and proof heads.** `src/` is **byte-identical** between every measurement SHA below and `e75ecf3` (verified with `git diff --quiet <sha> HEAD -- src` for `df796ef9`, `a58b40a9`, `4b5c4f44`, `7ec32526`, `2d01905a`, `f17343b`). Harness (`tests/`, `scripts/`) and docs changed between some measurements; that is noted per row.

| Artifact | Recorded head | Result |
|---|---|---|
| `docs/evidence/151-g1-captures.json` | `7ec32526f264382b5be224e376d126fb68dd2f56` | `pass: false`, **78/80** checks, 1 finding (V05 GAP) |
| `docs/evidence/151-p01-bench.json` | `df796ef9e0a7c706db088e7372304cd0310d1348` | `pass: true`, **22/22** |
| `docs/evidence/151-p02-loops.json` | `a58b40a92498dd53736c9670f0dd03d3c25260ae` | `pass: true`, **38/38** |
| `docs/evidence/151-p03-coldload.json` | `4b5c4f449067b3b57b9151856d7799cdbdbb55fe` | `pass: false`, **36 met / 6 unmet / 4 unknown / 46** |
| `docs/evidence/151-keyboard-walkthrough.json` (+ `.md`, `151-keyboard-walkthrough/`) | `2d01905a2f9d70cbda719793cbc062ac505dc107` | `verdict: PASS`, 28/28 steps, 16/16 census, 0 defects |
| `docs/evidence/151-roundtrip.json`, `151-v04-frames-{phone,desktop}.json` | `7ec32526…` | raw round-trip / frame hashes |
| `docs/screenshots/151-*.png`, `docs/evidence/151-p03-*.png` | `7ec32526…` / `4b5c4f44…` | running-build pixels (absolute worktree paths + sha256 recorded inside the JSON) |
| `tests/ui/access-66.evidence/results.json` | `e12578ac8bcaab81a53d1e2fbd1fbb0ab3227eca` | 16 cells, 0 cell errors, 3 keyboard cells, 0 defects — **pre-rw3d shell** |
| `docs/evidence/2026-11-14-rw3d-t04-kit-validate.json` | #131 kit validation | **875/875 pass, 0 fail**, 12 assets, `kitSha256 552f441f…` |
| `docs/evidence/2026-11-14-rw3d-t08-shell.md` + `-pixels.json` | `0c40871de4d92ffcde7c15285b8dcc4b6ed8e402` | 73/73 checks, **visual PENDING** (draft PR #199, since merged) |
| `docs/evidence/2026-11-14-rw3d-t03a-phone-declaration.md` | `1b83c58bd103a1a4a0f4529e820a7e4409685def` | real Pixel 8 Pro — **T03 spike only, no save data** |

**Role-stamped developer handoffs cited as proof:** pass 1 `6887332519`, pass 2 `6887708404`, pass 3 `6888981073`. Coordinator gate preconditions: `6871214431`, `6875970663`, `6886586298`. Product ruling on the missing real-player corpus: `6871192050` (PR #189).

## 2. Gates at the final head (real exit codes)

Run once in the `rw/151` worktree at `e75ecf3e95dcd86564e5adc216974b6fdc0c6089`, working tree clean before and after (`git status --short` empty). No assertion was weakened, no test skipped, no rerun was needed (no OOM, no `tests/perf/bench.test.ts:87` wall-clock flake).

| Gate | Command | Exit | Result |
|---|---|---|---|
| Types | `npx tsc --noEmit` | **0** | no diagnostics |
| Content | `npx tsx scripts/validate-content.mjs` | **0** | 15 resources / 8 blueprints / 12 recipes / 3 research; content violations **0**; behaviour `firstDrone=7 firstResearch=705 tick=18382 machines=8 links=18 drones=5 batches=1910 credits=75 nodes=3`, behaviour violations **0** |
| Unit/integration | `npx vitest run` | **0** | **110 test files, 1495 tests passed**, 0 failed, 10.36 s |
| Build | `npm run build` | **0** | `index-mgHy0JIy.js` 843.22 kB (gzip 225.42 kB), vendor 141.66 kB, tables 27.05 kB, css 66.80 kB, worker 13.43 kB; built in 1.36 s; Vite >500 kB chunk warning present (see P03) |

The only change this pass makes on top of `e75ecf3` is markdown (`docs/vision/evidence/151-first-playable.md`, `docs/vision/ACCEPTANCE.md` annotation). `git diff e75ecf3 <publication head> -- src tests scripts` is empty, so the gates above describe exactly the app code QA/product review.

## 3. Row-by-row evidence

### V01 — opening scene style
- **Criterion:** "Opening scene matches approved simple voxel style: legible warehouse/sorter/furnace/depot/generator, coherent scale/palette, no cinematic detail creep. Actual desktop and phone views inspected by vision-capable reviewer."
- **Status: PENDING-VISUAL.**
- **Proof (numeric/geometric proxies only):** `docs/evidence/151-g1-captures.json` → `scenes.v01-phone` / `v01-desktop`: gate button reads **"Begin recovery"**, `tick 20`, `machines 0`, live camera stamped `dataset.cam` `157.17,23.39,0.524` (phone) / `131.92,116.49,0.893` (desktop), `dataset.world3d` ready. Pixels: `docs/screenshots/151-v01-opening-yard-phone.png` (sha256 `29714fb4…`, 126720 B) and `…-desktop.png` (sha256 `1827701a…`, 48479 B). Seed integrity: `tests/simulation/opening-151.test.ts` (16 tests) — "the sim mirror carries the seed field by field", "the fixture applies no commands: it IS the pristine seed", "two calls are byte-identical in state and save envelope".
- **Proof head:** capture `7ec32526…`; tests `e75ecf3` (src identical).
- **Limitations:** style, legibility, scale/palette coherence and "no cinematic detail creep" are **vision judgements**. A non-vision agent cannot certify them; the pixels are handed to the sponsor at https://home.darkmatter2222.com/rustwake/. No visual acceptance is claimed.

### V02 — mature scene readability
- **Criterion:** "Mature scene remains readable at default zoom with 20 buildings and 30 units; entrances/cargo remain identifiable; text is not painted into world textures."
- **Status: PENDING-VISUAL** (population and texture clauses proven numerically).
- **Proof:** `tests/fixtures/release.ts:89-91` pins `MATURE_BUILDINGS 20 / MATURE_UNITS 30 / MATURE_CARGO 200`; 30 units = 5 drones (`DRONE_FLEET_CAP`) + 25 carriers (`const carriers = MATURE_UNITS - DRONE_FLEET_CAP; // 25`), cargo pinned to exactly 200 through `addToStore`. Capture `scenes.v02-phone`: gate **"Continue"**, `tick 150`, `machines 20`, `drones 5`, `routes 3`, `storeUnits 202`; pixels `docs/screenshots/151-v02-mature-phone.png` (sha256 `9cec617b…`, 128688 B) + desktop. **No text in world textures:** `docs/evidence/151-p02-loops.json` check "world textures stay 0 (no text in world textures)" — `renderer.info.memory.textures = 0` across all three 10-minute loops (geometries 3, programs 3, calls 11, triangles 326, deltas 0).
- **Proof head:** capture `7ec32526…`; P02 `a58b40a9…`; fixtures/tests `e75ecf3`.
- **Limitations:** "readable at default zoom" and "entrances/cargo identifiable" are vision judgements → sponsor. `storeUnits 202` is the live sim total at the sampled tick (fixture pins 200 at seed; production continues), not a fixture violation.

### V03 — orbit / resize / inspector / reset projection
- **Criterion:** "360-degree orbit, resize, inspector opening and camera reset preserve accurate selection and placement projection; no unreachable edge cells."
- **Status: MET (numeric/geometric) + PENDING-VISUAL.**
- **Proof:** `tests/renderer/camera-3d.test.ts` (**24 tests**) including the full resize matrix `RESIZE_BANDS` (9 breakpoint-derived bands: 360x640, 390x844, phone-sheet, phone-max, tablet-min, desktop-min-minus, desktop-min, 1440x900, 844x390) and `EDGE_POINTS` (9 world corners, edge midpoints and centre) asserting every edge cell stays reachable/projectable; `tests/renderer/raycast-3d.test.ts` (**8**) selection picking through the real reducer; `tests/renderer/boundary-3d.test.ts` (**9**) placement projection at yard boundaries. Delivered by `8ec8bea` ("full V03 camera resize"). P01 confirms real pointer clicks select/clear correctly through the production gesture reducer + raycast: **5/5 select, 5/5 clear**, `hit: true` on every sample.
- **Proof head:** tests `e75ecf3`; click proof `df796ef9…` (src identical).
- **Limitations:** geometric accuracy only. The sponsor must still confirm the projection *looks* right while orbiting/resizing/inspecting at the live URL; that visual confirmation is part of the mandatory G1 visual pass.

### V04 — 60 s activity clip
- **Criterion:** "60s activity clip shows independently timed mechanisms and event-driven cargo; paused/starved/unpowered machines do not fake production."
- **Status: PENDING-VISUAL** (numeric motion/liveness checks MET).
- **Proof:** capture `v04` (phone + desktop): **113/120 unique canvas hashes** (≥100 required), max consecutive identical frames outside hidden **1** (≤2), hidden paint frozen (**1 unique of 8**), sim alive while hidden (`tickDelta 40` ≥30), paint resumes `true`, 60 s catch-up `tickDelta 600` (band 560..660), `world3d` ready **120/120**, **0 page errors**; starved-crop control **17/20 identical** (≥14) — an unrouted, starved machine does not animate. Frame hashes: `docs/evidence/151-v04-frames-{phone,desktop}.json`; pixels `docs/screenshots/151-v04-phone-f000.png … f114.png` (and desktop). Engine-side independence: `tests/renderer/motion-150.test.ts` (**18**) — "eight running machines never pulse in unison across the 60 s sweep", "each fan is periodic at 1.7 s and drifts independently of its neighbours"; `tests/renderer/activity-scene-150.test.ts` (**8**) — "working/starved/blocked/unpowered paint four distinct status readings", "the census op count is invariant across the tick sweep (no activity ops leak in)".
- **Proof head:** capture `7ec32526…`; tests `e75ecf3`.
- **Limitations:** a hash-diversity census is **not** a visual judgement of "independently timed mechanisms" or "event-driven cargo". The 60 s clip must be watched by the sponsor. Headless emulation, not a phone (#190).

### V05 — staged construction clip + mid-build reload
- **Criterion:** "Construction clip at 0/1/2/3/4/5s shows base/frame/walls/roof/activation; reload mid-build resumes correct stage and charges once."
- **Status: BLOCKED** (staged clip cannot be produced from the running build at this head). **Never MET.**
- **Blocker (verbatim finding, `docs/evidence/151-g1-captures.json` → `findings[0]`, "V05 staged construction GAP"):** at this SHA `machine.build` is **instant** (`src/game/simulation/commands.ts` `buildMachine`, no construction stages in `SimState`) and the running renderer paints the full kit at t0. The staged controller **exists** — `src/game/renderer/assembly.ts:31` `ASSEMBLY_STAGES = ["base","frame","walls","roof","activation"]`, `:68 assemblyStageAt(progressTicks, durationTicks)`, `src/game/renderer/three/assemblyView.ts` — but is **not imported by `three/worldRenderer.ts` or `three/index.ts`**. Verified this pass: the only `src/` files referencing `renderer/assembly` / `assemblyView` are `src/game/renderer/assembly.ts` and `src/game/renderer/kitGeometry.ts`. `progressTicks` exists only in the session world (`src/game/world/types.ts:92`); `src/app/store.ts:1040-1043` advances session-only sites ("construction sites advance with the same authoritative ticks (5 s assembly, #133 engine) … Session-only."). The app join was owned by shell wiring **#199, which is a MERGED PR** (`9d21675`), and the join is still absent at app head `2d01905a`. **No open issue tracks this gap** (searched: no open issue with `assembly` in title; only #151 matches `V05`).
- **Proof of the clauses that ARE met:** single charge + reload persistence, capture `v05` (phone and desktop identical): before `machines 20, scrap 198, steel 5`; dock armed face `Place Scrap sorter` → commit face **`Build Scrap sorter30 scrap + 4 steel`** (`disabled false`); placed `id 21, blueprint sorter, tile 21, status idle, ageTicks 0, routed false`; `scrapDelta −30` (expected "−30 ±6", drone-corrected `scrapCorrected −30`), `steelDelta −4`; reload keeps **21 machines**, `scrapDelta 0` (band [−6,+6]), `steelDelta 0`, `tickDelta 0`, **0 page errors**. Pixels `docs/screenshots/151-v05-{before,catalog,t0,t1,t2,t3,t4,t5,crop,reload}-{phone,desktop}.png`. The placed-machine crop hashes `71bdccb3, 71bdccb3, 71bdccb3, 71bdccb3, fcbb8215, 1f22a66b` (**4 of 6 identical**) are the numeric witness that the kit is painted complete at t0 — there is no base→frame→walls→roof→activation progression to film. Engine-level stage proof (not running-build proof): `tests/renderer/assembly-stage.test.ts` (**23**) — "V05 clip points 0/1/2/3/4/5 s show base/frame/walls/roof/activation/complete"; `tests/renderer/assembly-timing.test.ts` (**24**) — "a reload at every stage boundary resumes that exact stage", "completion settles the reservation exactly once at startTick + duration", "rendering with any motion settings leaves the economy byte-identical"; `tests/renderer/assembly-view.test.ts` (**9**) — "stages visibility in order: 1/3/6/11/18 warehouse parts at the V05 clip points"; `tests/game/world/construction.test.ts` (**14**) — "P1 assembly duration is 5 simulated seconds = 50 ticks for every asset", "moves reservation -> committed at startTick + 50, no second charge", "a reload mid-construction settles once (JSON round-trip seam)".
- **Proof head:** capture `7ec32526…`; tests `e75ecf3`; join verification at app head `2d01905a`.
- **Limitations / owed:** unit tests prove the *controller*, not the shipped scene. Coordinator must file the world↔sim↔renderer assembly-join issue (product condition `6875970663`: "Verify production world<->sim join (#148) drives assembly stages in the running build before G1 sign-off"), then a developer must wire it and re-capture the 0–5 s clip on phone **and** desktop, plus a genuine mid-build reload. Capable visual inspection of assembly stages + deck-mounted upgrade modules (#137/#204) is **PENDING and not waived**.

### V06 — asset bounds, sockets, pivots, clearances
- **Criterion:** "Asset bounds, sockets, pivots and door clearances conform to recipes. Truck fits warehouse/depot; four rotated footprints match occupancy."
- **Status: MET (numeric/geometric, 12 delivered blockout recipes) + PENDING-VISUAL.**
- **Proof:** `docs/evidence/2026-11-14-rw3d-t04-kit-validate.json` — **875/875 checks pass, 0 fail**, 12 assets, `kitSha256 552f441f…`, `manifestSha256 667c5428…`, crane swing radius **2.508 u**, allowed-overhang findings only. `tests/game/world/geometry.test.ts` (**109**) — four-yaw occupancy/socket/frontage permutations, crane radius exactly **2508 mu**, clearance width `max(nominal, actual) + 2×0.15 u`; `tests/game/world/kit-parity.test.ts` (**14**) and `tests/renderer/assembly-kit-parity.test.ts` (**12**) bind renderer kits to the same recipes; `tests/game/world/placement.test.ts` (**26**) footprint/occupancy/frontage; `tests/content/rw3d-t09-kit.test.ts` (**6**), `tests/content/rw3d-t15-rigs.test.ts` (**10**). Gate `npx tsx scripts/validate-content.mjs` exit **0**, 0 content violations at `e75ecf3`.
- **Proof head:** kit validation #131 (`552f441f…` kit); tests `e75ecf3`.
- **Limitations:** `docs/vision/architecture/README.md` §6 — the delivered blockout margin is **0.05 u** while production requires **≥0.15 u** (#164 T37 / #142 T15, open), and **27 `additionalRequired` assets are deferred**: "V06 currently covers the 12 delivered blockout recipes only". Bounds/sockets/pivots are geometric, not artistic; visual conformity is the sponsor's call.

### U01 — select / place / rotate / cancel without accidental charge
- **Criterion:** "Fresh user can select/place/rotate/cancel building without accidental charge. Occupied/outside/no-frontage/poor-terrain/insufficient-resource states explain recovery."
- **Status: MET** (simulated agent usability — **not human research**).
- **Proof:** `tests/ui/place-53.test.tsx` (**26**) — "names a clear affordable cell and the real price, then Build spends it", "an occupied cell is refused and the ghost is preserved for re-aiming", "the dock cell is refused and preserved", "the corner cell is placeable and an out-of-yard tap keeps the last aim"; `tests/ui/build-52.test.tsx` (**14**) — "select → Place enters the explicit preview without spending", "prints have/need on unaffordable cards and keeps recovery one tap away", "keeps a locked card inert: no command, no selection change"; `tests/ui/build-catalog.test.tsx` (**11**); `tests/game/world/construction.test.ts` — "U01: place / rotate / cancel cycles never accidentally charge", "before any work: full refund, reservation released exactly once", "after work began: 90% floor refund, remainder committed"; `tests/game/world/terrain.test.ts` (**7**) poor-terrain refusal; `tests/simulation/opening-151.test.ts` (**16**) pristine-seed parity. Running build: capture `v05` armed-face → commit-face sequence charges exactly once (−30 scrap / −4 steel) and `docs/screenshots/151-v05-catalog-{phone,desktop}.png` shows the priced catalog.
- **Proof head:** tests `e75ecf3`; capture `7ec32526…`.
- **Limitations:** all "fresh user" evidence is a scripted agent plus DOM assertions. No human usability study was run; a human research pass is not claimed.

### U02 — gestures never place unintentionally; focused inputs suppress shortcuts
- **Criterion:** "Mouse drag, pinch, twist and canceled pointer gestures never place/salvage/purchase unintentionally. Focused inputs suppress shortcuts."
- **Status: PARTIAL.**
- **Proof (gesture clause MET):** `tests/renderer/gestures-50.test.ts` (**22**) — "a press and release without travel is one tap at the release point", "travel up to the threshold still taps; one pixel past it never does", "a drag that returns to its start is still a drag, never a tap", "a second pointer turns the gesture into a pinch with a span baseline", "spreading zooms in at the midpoint and carries the midpoint pan"; `tests/ui/camera-50.test.tsx`, `tests/ui/roadTool.test.tsx` canceled-pointer paths; P01 real clicks **5/5 select + 5/5 clear** with no stray command.
- **Unproven clause:** "Focused inputs suppress shortcuts." The behaviour is implemented (`src/ui/App.tsx:811-813`, `src/ui/BuildTool.tsx:126-128`) but **no test asserts it** — a repository-wide search for shortcut-suppression assertions in `tests/` returned nothing. This is recorded as a coverage gap, not fixed in this pass (no `src/`/`tests/` edits allowed).
- **Proof head:** tests `e75ecf3`; implementation read at app head `2d01905a`.
- **Limitations / owed:** a focused-input shortcut-suppression test (typing in the save/import textarea and panel fields must not trigger digit/letter shortcuts) is owed before U02 can be MET. Twist gesture coverage is limited to the pinch/rotate reducer assertions; no physical multi-touch device was used.

### U03 — 8 viewports + 200% text layout census
- **Criterion:** "360x640,390x844,412x915,844x390,768x1024,1366x768,1920x1080,2560x1440 plus 200% text: no document scroll, clipped core action or sub-44px target. Long panels scroll internally."
- **Status: PARTIAL.**
- **Proof that exists:** `tests/ui/access-66.evidence/results.json` — full **8-viewport × text-scale 1 & 2** geometry census, **16 cells, 0 cell errors, 3 keyboard cells, 0 defects, 17 frames**, generated `2026-11-13T04:58:50.935Z`; viewports exactly the eight required (`tests/ui/access-66.evidence.mjs:295-302`). Current-head shell checks: `docs/evidence/2026-11-14-rw3d-t08-pixels.json` **73/73** at `0c40871d…`, including "desktop: every slot >= 44x44", "desktop: page stays flat", "phone: report sheet in 35vh band", "desktop: inspector stays above the bottom toolbar". Unit floors: `tests/ui/legibility.test.tsx` (**5**) `.dock__cost ≥ 12.0 px`, contrast **≥ 4.50:1**, monotonic scaling, 44 px target floors; `tests/ui/hud-layout.test.ts` (**5**), `tests/ui/tokens-48.test.ts` (**20**), `tests/ui/shell-49.test.tsx` (**12**).
- **Unproven clause:** a **current-head running-build census at 200% text across all eight viewports**. (a) `access-66` was produced at `e12578ac…`, **before** the rw3d shell rebuild (#135/#199) and before #149/#151 UI changes, so it does not describe this head. (b) T08's 73/73 covers desktop + phone only, at `0c40871d…`. (c) `tests/ui/legibility.test.tsx:20-24` uses `ROOT_PX = 15`, `TEXT_LARGE_FROM = 1.5`, `STEPS = [1, 1.25, 1.5]` — **no 2.0 step**, although the shipped app cycles `[1, 1.25, 1.5, 2]` (`src/ui/App.tsx:580-584`). So 200% text is unasserted at this head.
- **Proof head:** `e12578ac…` (access-66), `0c40871d…` (T08), `e75ecf3` (unit floors).
- **Limitations / owed:** re-run the 8-viewport × ts1/ts2 census against this head's `dist` (and add a 2.0 legibility step) before U03 can be MET. No new capture was run in pass 4 (brief: cite, do not re-capture).

### U04 — keyboard-only + screen-reader entity list
- **Criterion:** "Keyboard-only and screen-reader entity list can build, inspect, upgrade, trade, save and close dialogs; focus returns; status not color-only."
- **Status: MET** (simulated keyboard agent — **not a human screen-reader user**).
- **Proof:** `docs/evidence/151-keyboard-walkthrough.json` at buildSha `2d01905a2f9d70cbda719793cbc062ac505dc107`, `http://127.0.0.1:4195/`, method "headless Chrome, real key events only (Tab/Enter/Escape/digits); no mouse, no element.click(), no programmatic focus": **28/28 steps passed, 16/16 census cells passed, 0 defects, 54 frames, 349 key presses**, `verdict: PASS`; narrative `docs/evidence/151-keyboard-walkthrough.md`, frames `docs/evidence/151-keyboard-walkthrough/`. `tests/ui/entity-list-151.test.tsx` (**12**) — "names every building with kind, id, level and a worded status — never color alone", "words drone and truck statuses, including the exact typed blocker", "opens the inspector for a building and focuses the dock cell for a drone", "keeps the status line event-driven: sim ticks never rewrite it". Implemented by `2d01905a` (pass 2, handoff `6887708404`).
- **Proof head:** `2d01905a…` (src identical to `e75ecf3`); tests `e75ecf3`.
- **Limitations (verbatim from the artifact):** "Proves keyboard operability and focus, NOT visual fidelity"; "Digit-key entry records the body as the opener (existing PanelHost behavior); the toolbar-button path proves real focus return"; "Drones have no fixed engine cell (they fly store <-> machine); their rows focus the dock cell they operate from." No assistive-technology (NVDA/VoiceOver/TalkBack) run and no human screen-reader user was involved.

### U05 — research/upgrade comparisons and deliberate strategies
- **Criterion:** "Research/upgrade comparisons show actual before/after cost/power/rate; two deliberate strategies and blind prominent-action policy tested from same seed. No universal auto-choice."
- **Status: MET.**
- **Proof:** `tests/simulation/choice-151.test.ts` (**12**) — "LOCAL and REMOTE share a byte-identical sim; the world differs only by the strategy corridor", "the shared yard is command-built and warmed to the same tick", "a speed upgrade shifts the bottleneck: +1 batch, +1 steel in the same 400 ticks", "a draw upgrade moves power, not throughput (furnace power 2 -> 1)", **"a blind tap buys the unnamed plain ladder, never a named plan"**, "an unknown plan is refused before any credit moves (U05/E06 guard)", "the dock prices the tradeoff and reports real before/after (U05)", "the corridor is travel-bound: cost 23, first delivery at tick 27". `tests/ui/upgrade-145.test.tsx` (**8**) — "all three cards equal upgradeComparison exactly: throughput, power, capacity, cost", "branch semantics: speed changes only rate, buffer only capacity, draw only power", "purchase reads back the applied state: the new rateNow equals the prior rateNext", **"no auto-choice: two deliberate strategies from the same seed buy different branches"**. `tests/ui/research-58.test.tsx` (**15**) — "shows the exact cost and effect of every node before purchase", "names prerequisites readably and flips them when the prereq is bought", "answers the no-data state with the content table". `tests/ui/dispatchPolicy-147.test.ts` (**15**) reserve-floor/filter precedence. Fixture constants: `CHOICE_WARMUP_TICKS 200`, `CHOICE_WINDOW_TICKS 400` (`tests/fixtures/release.ts`).
- **Proof head:** tests `e75ecf3`.
- **Limitations:** "blind prominent-action policy" is exercised by a scripted blind tap, not by human subjects; strategy divergence is measured over a 400-tick window, not multi-day progression (that is G2).

### U06 — focus-and-fix for full storage / stuck vehicle / power shortage
- **Criterion:** "Storage full, vehicle stuck and power shortage each provide focus-and-fix path without requiring reset; offline report doesn't obstruct a short tab return."
- **Status: MET.**
- **Proof:** `tests/simulation/diagnostics.test.ts` — "says the storage needs clearing rather than a purchase when it is full", "reports the shared power budget as the limiter when machines oversubscribe", "names the busy link beside a supply-limited machine", "offers a non-purchase action when the dock is the limiter", "explains an unlinked machine as a missing connection", "agrees between tick-by-tick advance and event-jump advance (spec 21.4)". Running build: capture `scenes.blocked-*` at `tick 1600`, `storeUnits 300/300`, alert `role=status` text **"Store full · 300/300 · finish the steel contract to sellOpen store"**; pixels `docs/screenshots/151-blocked-yard-{phone,desktop}.png` (phone sha256 `838d87f9…`, 145422 B). BLOCKED fixture is full storage **through commands** (78 `manual.salvage` pulses, no overflow) plus an occupied bay (`tests/fixtures/release.ts:285-311`, `tests/simulation/opening-151.test.ts` "BLOCKED: storage is exactly full through commands, no overflow"). Stuck-vehicle typed blockers: `tests/simulation/traffic-store.test.ts` (**3**), `tests/simulation/lifecycle-store.test.ts` (**7**), `tests/ui/store-149.test.tsx` (**9**), `tests/ui/return-149.test.tsx` (**11**), `tests/ui/onboard-149.test.tsx` (**7**); short-return report behaviour: `tests/simulation/offline.test.ts` (**5**) "restores progress and applies one capped catch-up window", `tests/ui/return-149.test.tsx`.
- **Proof head:** tests `e75ecf3`; capture `7ec32526…`.
- **Limitations:** the alert text is asserted as a string and `role=status`; whether it *reads* as a clear focus-and-fix path is a vision/UX judgement owed to the sponsor. "sellOpen store" is the shipped concatenated copy at this head (recorded verbatim, not silently corrected).

### U07 — reduced motion / mute preserve information and simulation
- **Criterion:** "Reduced motion/mute preserve all actionable information and simulation; audio permission gesture honored, no forced playback."
- **Status: MET** (numeric; audio verified at the graph boundary, not by listening).
- **Proof:** `tests/game/audio.test.ts` (**26**) — "S-01: every category bus has exactly one parent, the master, and master alone reaches destination", "S-04: mute is one write on the master and the snapshot reads the effective levels", "S-06: the worst-case summed mix sits at or below the declared 0.7 headroom"; `tests/renderer/motion-150.test.ts` (**18**) and `tests/renderer/activity-scene-150.test.ts` (**8**) reduced-motion paths; `tests/renderer/assembly-stage.test.ts` — "reduced motion: discrete static stages, every transform at rest (U07)"; `tests/renderer/assembly-view.test.ts` — "reduced motion keeps staged visibility but every transform at rest"; `tests/renderer/assembly-timing.test.ts` — **"rendering with any motion settings leaves the economy byte-identical"**; `tests/ui/settings-62.test.tsx` (**7**) persists `muted` / `reducedMotion` / `textScale` (asserts `textScale 1.25` survives reload).
- **Proof head:** tests `e75ecf3`.
- **Limitations:** headless Chrome cannot listen — mute/permission-gesture evidence is the audio-graph snapshot and the gesture-gated start path, **not an audible result**. No motion/audio clip was judged visually; the sponsor owes that at the live URL.

### E01 — resource conservation
- **Criterion:** "Resource conservation across stock/input/batch/output/cargo/reserved/overflow before/after every lifecycle command; currencies reconcile to ledger."
- **Status: MET.**
- **Proof:** `tests/game/world/conservation.test.ts` (**3**) and `tests/legacy/conservation.test.ts` (**3**) hold the baseline invariant `unitTotal − netRecipeUnits − fleetAccumulated` (architecture README §2, baseline `1b83c58`); `tests/game/world/construction.test.ts` — "totals stay conserved through every phase of a build", "deducts the full cost exactly once and occupies the footprint"; `tests/game/world/lifecycle.test.ts` (**15**), `tests/simulation/economy.test.ts` (**14**), `tests/simulation/starter-economy.test.ts` (**34**), `tests/simulation/belt.test.ts` (**18**), `tests/simulation/traffic.test.ts` (**23**), `tests/simulation/logistics.test.ts` (**8**), `tests/simulation/fork.test.ts` (**22**), `tests/simulation/reservations.test.ts` (**28**) — "create -> reserve -> dispatch -> load -> travel -> unload with exact counts". Gate `validate-content` behaviour run: `batches=1910 credits=75`, **0 violations**. Capture: V05 `scrapCorrected −30` / `steel −4` with drone correction, context-loss `scrapDelta 0 / steelDelta 0`.
- **Proof head:** tests `e75ecf3`; captures `7ec32526…`.
- **Limitations:** conservation is proven on checked-in fixtures and synthetic workloads, not on a real-player save corpus (see §4).

### E02 — duplicate command IDs charge/grant once
- **Criterion:** "Duplicate command IDs and rapid double presses charge/grant once, including build/upgrade/contract/import/raid settlement."
- **Status: MET** for the G1 command surface (build/upgrade/contract/import). **Raid settlement is G3 and unbuilt.**
- **Proof:** `tests/game/world/idempotency.test.ts` (**8**), `tests/simulation/command-idempotency-148.test.ts` (**12**), `tests/renderer/assembly-timing.test.ts` — "placement reserves the kit cost exactly once (E02 duplicate id)", "duplicate upgrade command id charges and levels exactly once (E02)", "a distinct upgrade charges again exactly once (per-level, not per-frame)"; `tests/persistence/migration-148.test.ts` — "imports the old yard wholesale and a repeat import settles once (E02)"; `tests/persistence/transfer.test.ts` — "is idempotent: the same text applied twice changes nothing the second time"; `tests/simulation/reservations.test.ts` — "creation replay is idempotent; cancel replay returns cargo exactly once"; `tests/ui/onboard-64-command-id.test.tsx`. Running build: capture round-trip `importedDelta.simIdentical: true` at tick 140 and V05 reload `scrapDelta 0`.
- **Proof head:** tests `e75ecf3`; capture `7ec32526…`.
- **Limitations:** raid/battle settlement idempotency cannot be tested at this head (D01–D06 are G3, unbuilt). Deferred, not claimed.

### E03 — source competition and fair ordering
- **Criterion:** "Source competition: two carriers request last pallet; exactly one reserves it. Fair ordering prevents starvation over repeated opportunities."
- **Status: MET.**
- **Proof:** `tests/simulation/reservations.test.ts` (**28**) — **"E03: the last pallet goes to exactly one job; cancel frees it for a retry"**, "issues unique reservation ids, one per job/kind; a carrier serves one job", "reserves destination room exclusively against other jobs", "a rejected creation changes nothing (byte-identical fingerprint)", "rejects invalid requests with stable typed reasons"; `tests/simulation/traffic.test.ts` (**23**) bay contention and ordering; `tests/simulation/supply-window.test.ts` (**3**), `tests/simulation/rate-window.test.ts` (**5**), `tests/simulation/cadence.test.ts` (**3**) repeated-opportunity fairness.
- **Proof head:** tests `e75ecf3`.
- **Limitations:** fairness is asserted over the scripted repeated windows, not over multi-day play (G2).

### E04 — full destination / deleted road / moved building / recalled carrier
- **Criterion:** "Full destination, deleted road, moved building and recalled carrier preserve cargo/reservations and eventually recover or display exact blocker."
- **Status: MET.**
- **Proof:** `tests/simulation/traffic-store.test.ts` (**3**), `tests/simulation/lifecycle-store.test.ts` (**7**), `tests/simulation/logistics.test.ts` (**8**), `tests/simulation/traffic.test.ts` (**23**), `tests/game/world/lifecycle.test.ts` (**15**), `tests/ui/roadPanels-147.test.tsx` / `tests/ui/roadTool.test.tsx` typed blockers; `tests/ui/entity-list-151.test.tsx` — "words drone and truck statuses, including the exact typed blocker". Running build: BLOCKED scene surfaces the exact blocker string with `role=status` (capture `scenes.blocked-*`, `tick 1600`, `300/300`).
- **Proof head:** tests `e75ecf3`; capture `7ec32526…`.
- **Limitations:** "eventually recover" is proven within the scripted windows; long-horizon recovery under real play is G2.

### E05 — measured throughput, not decorative vehicles
- **Criterion:** "Truck travel length, speed, load/unload and bay contention affect measured throughput; decorative vehicles alone fail."
- **Status: MET.**
- **Proof:** `tests/simulation/choice-151.test.ts` — "the corridor is travel-bound: cost 23, first delivery at tick 27", "the sorter runs cycle-bound, not transport-bound", "a speed upgrade shifts the bottleneck: +1 batch, +1 steel in the same 400 ticks"; `tests/simulation/traffic.test.ts` (**23**) travel length/speed/load/unload/bay contention; `tests/simulation/cadence.test.ts` (**3**), `tests/simulation/rate-window.test.ts` (**5**), `tests/simulation/belt.test.ts` (**18**); `tests/renderer/fleet-motion.test.ts` (**7**) and `tests/simulation/fleet.test.ts` (**15**) keep fleet motion derived from the sim. `validate-content` behaviour: `links=18 drones=5 batches=1910`, 0 violations.
- **Proof head:** tests `e75ecf3`.
- **Limitations:** STRESS bay/logistics semantics are still refined under **#226 (open, P2)**; measured throughput here is the G1 fixture set.

### E06 — automated policy respects floors/filters, no deadlock
- **Criterion:** "Automated policy respects reserve floors and filters; no deadlock after consuming all discretionary funds; slow recovery remains available."
- **Status: MET.**
- **Proof:** `tests/ui/dispatchPolicy-147.test.ts` (**15**) — "enforces the reserve floor against free source stock", "rejects a filtered material before any stock check", "rejects below minimum fill", "checks material filter before minimum fill (precedence)", "is permissive by default (all materials, floor 0, min fill 1)"; `tests/simulation/plan.test.ts` (**5**), `tests/simulation/starter-economy.test.ts` (**34**), `tests/simulation/choice-151.test.ts` — "an unknown plan is refused before any credit moves (U05/E06 guard)"; `tests/simulation/diagnostics.test.ts` — "offers a non-purchase action when the dock is the limiter" (slow recovery without spending).
- **Proof head:** tests `e75ecf3`.
- **Limitations:** no multi-day discretionary-funds exhaustion run (G2 scope).

### E07 — tick batches vs offline event jumps (1h/12h/18h)
- **Criterion:** "Equivalent tick batches and offline event jumps produce identical ledgers/mission results for 1h/12h/18h absences, including capacity halt and clock rollback."
- **Status: MET.**
- **Proof:** `tests/simulation/offline-equivalence-148.test.ts` (**7**) — "1-hour absence: identical ledgers and report", "12-hour absence: identical ledgers at the cap boundary", "18-hour absence: caps at 12h, identical ledgers, no re-claimed tail", "chunked tick batches equal one batch equal the event jump (1h)", "capacity halt: both paths saturate the dock and stall identically (1h + 1h)", "clock rollback: zero elapsed, zero credit, ledger untouched", "idle-jump branch equals 432k tickwise steps (spec 21.4, 12h)"; `tests/simulation/offline.test.ts` (**5**), `tests/simulation/catchup-worker.test.ts`, `tests/persistence/save.test.ts` — "restores progress and applies one capped catch-up window", "stamps the save with the shared wall clock, not the page timeline". Running build: capture V04 60 s catch-up `tickDelta 600` (band 560..660); P02 `simCatchUp` continuous == split, hash `1aa81257`, tick 700.
- **Proof head:** tests `e75ecf3`; capture `7ec32526…`; P02 `a58b40a9…`.
- **Limitations:** equivalence is proven on fixtures; a real-player absence corpus does not exist (§4).

### E08 — migration, invalid/oversized saves, single writer
- **Criterion:** "Save migration preserves old balances/progression or retains explicit legacy slot. Invalid/oversized/partial/duplicate-ID save changes nothing. Two tabs retain one writer."
- **Status: PARTIAL.**
- **Proof (clauses MET):** `tests/persistence/migration-148.test.ts` (**7**) — "preserves every recorded balance and progression marker", "backfills the missing eras without touching balances", "is idempotent and a byte fixed point after one migrate", "boots the old yard at its checkpoint without re-seeding", "retains an undecodable old save verbatim in the explicit legacy slot"; `tests/legacy/migration.test.ts` (**9**), `tests/legacy/fixtures.test.ts` (**10**) — 11 checked-in legacy fixtures, byte contract at baseline `1b83c58`; `tests/persistence/size-cap-148.test.ts` (**9**) — "refuses text one character over the cap before parsing", "accepts an envelope exactly at the cap (boundary is inclusive)", "refuses a checksum-valid envelope whose payload alone exceeds the cap", "leaves the live yard and the persisted bytes byte-identical", "refuses oversized text on a reader tab too (decode precedes the role gate)"; `tests/persistence/save.test.ts` (**9**) — "detects a corrupted payload", "rejects an unsupported schema and unusable text", "names the first violated invariant for invalid states"; `tests/persistence/transfer.test.ts` (**9**) — "keeps the running yard when the payload no longer matches its checksum", "refuses a newer schema and unparseable text without touching state", "refuses to write from a follower tab"; `tests/persistence/lease.test.ts` (**7**) — "keeps one writer: the follower never writes the save", "hands over after the heartbeat lapses and demotes the old owner" (`LEASE_KEY rustwake.lease.v1`, TTL 1500 ms); `tests/persistence/recovery.test.ts` (**23**) + `tests/ui/recovery-202.test.tsx` (**14**) + `tests/ui/save-63.test.tsx` (**21**) corrupt-boot slot preservation (#191 merged `c6e187d`, PR #201; UI #202 → PR #209 `4f83a61`; #203 → PR #205 `3be257d`). Running build: capture `roundTrip.importedDelta` `ok: true`, **`simIdentical: true`**, tick 140, **`settingsIdentical: true`**, note "Applied · tick 140, 20 machines"; export A/B/C hashes in §1; pixels `docs/screenshots/151-roundtrip-{export,confirm,invalid}-desktop.png` (sha256 `697e7802…`, `dee8d248…`, `be08edff…`).
- **Two failing strict sub-checks (NOT forced green), `docs/evidence/151-g1-captures.json` `checks[69]`/`checks[70]`:**
  1. `roundtrip: invalid import leaves economy byte-identical` — expected `true`, actual **`false`**.
  2. `roundtrip: invalid import tick drift <=2 (natural only)` — expected `<=2`, actual **`10`**.
  **Triage:** the refusal itself is verified — `invalid.confirmPresent: false`, `invalid.note: "Not a Rustwake file"`, and the refusal check passes. The live sim advanced **10 natural ticks** inside the refusal window (`invalid.tickDelta = 10`), so the byte comparison spans natural production, not a mutation caused by the invalid payload. This is a **measurement limitation of the harness window**, not a confirmed app defect; the strict checks are left failing and the capture document stays `pass: false` (78/80). The unit-level guarantee ("leaves the live yard and the persisted bytes byte-identical", "refuses … without touching state") is asserted in a frozen sim by `size-cap-148`/`transfer`/`save`.
- **Proof head:** capture `7ec32526…`; tests `e75ecf3`.
- **Limitations / owed:** (a) **no real-player save corpus** — evidence is checked-in legacy fixtures plus synthetic round-trips; product ruling `6871192050` accepts this only with the limitation recorded (architecture README §4: "Still owed at the G1/P1 cutover: real-player export/import round-trip evidence, or an explicit no-corpus limitation recorded in gate evidence"). (b) The two strict invalid-import sub-checks need a frozen-tick measurement window and a re-capture. (c) **#223 (open)** bounded `seenCommands` window / false size-cap rejection and **#16 (open)** priced-route refund after a round-trip are untested at this head.

### E09 — upgrade/respec/dismantle cannot mint resources
- **Criterion:** "Upgrade/respec/dismantle cannot generate resources through rounding, old-version refunds or repeated cancellation."
- **Status: MET.**
- **Proof:** `tests/game/world/construction.test.ts` — "odd quantities floor per item (no fractional cargo)", "cancel after completion is site-not-found and never refunds", "after work began: 90% floor refund, remainder committed", "before any work: full refund, reservation released exactly once"; `tests/ui/place-53.test.tsx` — "move charge is movePenaltyPct of each build-cost line, rounded per line", "dismantle refund mirrors refundOf on the build price plus registered belt links"; `tests/renderer/assembly-timing.test.ts` — "a distinct upgrade charges again exactly once (per-level, not per-frame)"; `tests/ui/upgrade-145.test.tsx` (**8**) purchase reads back applied state; `tests/persistence/migration-148.test.ts` old-version balances preserved without re-seeding; `tests/game/world/lifecycle.test.ts` (**15**).
- **Proof head:** tests `e75ecf3`.
- **Limitations:** respec is not a shipped G1 command; the clause is covered by upgrade/dismantle/cancel paths only.

### P01 — normal / stress / battle benchmark
- **Criterion:** "Defined normal/stress/battle benchmark reports p50/p95 frame/input times, draw calls, memory, device and quality tier. No actual phone claim from emulation."
- **Status: PARTIAL** — normal + stress MET; **battle DEFINED, measurement DEFERRED to G3**.
- **Proof:** `docs/evidence/151-p01-bench.json`, `pass: true`, **22/22 checks**, command `npx tsx tests/perf/perf-151.evidence.mjs --mode p01`, protocol "REAL renderer modules at fixed dt=1 tick/frame, 1200-frame scripted timeline (quarter turns + anchored zoom pulses) run TWICE from a fresh fixture decode; real pointer clicks through the production gesture reducer + raycast; renderer.info read from the live three.js singleton".
  - **MATURE (normal):** frame `renderMs p50 0.1 / p95 0.3 / p99 0.4 / max 0.9`; input `samples 10, p50 0.3 / p95 1.8 / max 1.8`; draw calls **11**, triangles 326, instances 20, drones 5; heap **8.95 → 30.05 MB** (limit 4192 MB); determinism run1 == run2 `{"tick":1300,"machines":20,"credits":325}`, pixel hash **`b07d69f7`**; clicks 5/5 select + 5/5 clear; `pageErrors []`; threeRevision 187, dpr 1, HeadlessChrome/157, hardwareConcurrency 32.
  - **STRESS:** 100 machines; frame `p50 0.2 / p95 0.4 / p99 0.6 / max 7.3`; input `p50 0.4 / p95 1.8`; calls **11**, triangles 1286, instances 100; heap **8.71 → 31.26 MB**; determinism `{"tick":1206,"machines":100,"credits":99325}`, hash **`459955df`**; `pageErrors []`.
  - Quality tier recorded verbatim (§1); device/browser recorded; **no phone claim is made**.
  - Battle (verbatim): "DEFINED, measurement DEFERRED: see `tests/perf/battle-protocol-151.md` — defense structures D01-06 are G3 scope and unbuilt at this SHA."
- **Proof head:** `df796ef9e0a7c706db088e7372304cd0310d1348` (src identical to `e75ecf3`).
- **Limitations:** headless desktop emulation on an RTX 5090 host — frame/heap numbers are host-relative and are **not** a phone result (#190). The battle benchmark cannot be measured until G3 defense structures exist. `tests/perf/bench.test.ts` (4 tests) also passes in the gate run.

### P02 — warmed repeated operation, hidden tab, context loss
- **Criterion:** "Warmed repeated operation shows bounded memory/object counts; hidden-tab rendering and context-loss recovery retain save integrity."
- **Status: MET** (emulation).
- **Proof:** `docs/evidence/151-p02-loops.json`, `pass: true`, **38/38 checks**, `--mode p02`, declaredDevice "headless desktop Chrome emulation, 1440x900 @1x (no physical phone, #190)", fixture MATURE 20/30/200. Warmup **60010 ms / 3593 frames / 600 ticks**; three loops **600011 / 600022 / 600022 ms**, **35922 / 35923 / 35923 frames**, **6000 ticks each**; heap growth **5.44% / 0.07% / 0.36%** (spec ≤10%, architecture README §5.6); `renderer.info` calls **11**, triangles **326**, geometries **3**, **textures 0**, programs **3**, all deltas **0**; hidden tab `whileHidden 0` / `afterRestore 0.0047`; `simCatchUp` continuous == split hash **`1aa81257`**, tick 700; context loss `saveUnchanged: true`, **11353 B before and after**, sha256 `020701a2f43d2641ab971420c747bcf274ed2b4bac58e8e50d9c218fc9d9301f`. Capture-side context loss: 2 GL contexts instrumented, active world GL lost → ready, `structureIdentical: true`, `scrapDelta 0 / steelDelta 0` (drone-corrected), `tickDelta 20` natural, 0 page errors; pixels `docs/screenshots/151-context-loss-banner-desktop.png`, `151-context-restored-desktop.png`.
- **Proof head:** `a58b40a92498dd53736c9670f0dd03d3c25260ae` (src identical to `e75ecf3`); capture `7ec32526…`.
- **Limitations:** measured with the pre-`b3451af`/pre-`f17343b` harness (fleet read + tutorial-unlock fixes landed later); **not re-run at the final head** per the pass-4 brief. 3×10 min on one desktop host, not a phone, and not a multi-day session.

### P03 — cold transfer/load and quality fallback budgets
- **Criterion:** "Cold transfer/load and quality fallback meet prospectively recorded budgets; missing hardware evidence remains explicit blocker."
- **Status: PARTIAL — 36 MET / 6 UNMET / 4 UNKNOWN of 46.** `allMet: false`. **No budget was lifted.**
- **Proof:** `docs/evidence/151-p03-coldload.json`, `pass: false`, summary `{"met":36,"unmet":6,"unknown":4,"total":46,"allMet":false}`, `--mode p03`, url `http://localhost:4167/`, `cpuThrottleRate 6`, phone 390x844@2 / desktop 1920x1080@1. Budgets are the prospective `tests/perf/budgets.json` (#67), whose `_meta` states these are experience-level ceilings grounded at main `f8072697…`, that the historical 233000 B ceiling is explicitly not hard, and that `met: null` means UNKNOWN.
  - **UNMET (6) — byte budgets, caused by the pinned three.js bundle:** `entryDecodedBytes` **843492 > 240000** (phone-MATURE, desktop-MATURE); `totalColdDecodedBytes` **1080407 > 520000** (phone-MATURE, desktop-MATURE); `fallbackTotalColdDecodedBytes` **1080407 > 520000** (phone-FALLBACK-2D, desktop-FALLBACK-2D). Build inventory: entry `index-mgHy0JIy.js` **843492 B** sha `3270ae02…`, vendor 141658 B, tables 27090 B, css 66799 B, lazy worker 13430 B. `npm run build` at `e75ecf3` reproduces the same entry (843.22 kB / gzip 225.42 kB) with Vite's >500 kB chunk warning.
  - **UNKNOWN (4) — `value: null`, stay UNKNOWN:** `menuOpenMedian` (limit 100 ms) and `throttledMenuOpenMedian` (limit 200 ms) on phone-MATURE and desktop-MATURE. **Cause verified this pass:** the harness measures `button[aria-label="Menu"]` → `.shell-menu` (`tests/perf/perf-151.evidence.mjs:824,857`), a surface the rw3d T08 shell **retired** — `aria-label="Menu"` / `.shell-menu` now appear in `src/` only inside `src/ui/shell/shell.css:6-7` describing what was removed. Harness target is stale; no app-defect claim.
  - **hardFailures (2):** `phone-MATURE: panel Research did not open`, `desktop-MATURE: panel Research did not open`. **Cause verified this pass:** `showResearch(state)` requires `store.data > 0` or a known node (`src/ui/App.tsx:1833-1836`, spec §5.5), and the MATURE fixture seeds only scrap/steel (`tests/fixtures/release.ts:341-378`) — no `data`, no `research` — so the Research dock face is absent **by design** and `openPanelRobust` cannot find it. Fixture-precondition gap, not an app defect. (The `tutorial=9` unlock fix `f17343b` predates this measurement and does not address `showResearch`.)
  - **MET (36) highlights:** `fcp` **116 ms** phone / **112 ms** desktop (limits 1500 / 1000); `fallbackFcp` **88 / 96**; `loadEventEnd` **47.6 / 47.3** (fallback 52.6 / 49.7); `machineTapMedian` **14 / 11** (≤120); `throttledMachineTapMedian` **96 / 115** (≤250); `idleP95` **16.8** (≤20); `idleDroppedPct` **0** (≤2); `panelOpenP95` **16.8** (≤33); `stressLongSessionP95` **16.8** (≤50); `throttledIdleP95` **16.8** (≤33); `throttledIdleDroppedPct` **0** (≤5); `throttledStoreP95` **16.8** (≤50); `idleUsedHeap` **9.73 / 8.24 MB** (≤64); `sessionHeapGrowth` **−1.57 / +1.39 MB** (≤16); desktop-STRESS `stressFixtureIdleP95` **16.8** (≤50), heap **8.12 MB** (≤64); `binaryMediaCount` **0**; `fallbackIdleP95` **16.8** both.
  - Pixels: `docs/evidence/151-p03-{phone,desktop}-{MATURE,FALLBACK-2D}.png`, `docs/evidence/151-p03-desktop-STRESS.png`.
- **Proof head:** `4b5c4f449067b3b57b9151856d7799cdbdbb55fe` (src identical to `e75ecf3`); build inventory re-confirmed by the gate build at `e75ecf3`.
- **Limitations / owed:** (a) the **6 byte-budget failures are real and unmet** — architecture README §5.7 forbids lifting failing budgets without documenting scene and tradeoff; a code-split / bundle-size ruling or implementation issue is **not filed** (#67 is closed) and is owed to the coordinator. (b) The 4 UNKNOWN interaction medians need the harness re-targeted at the shipped toolbar/inspector surfaces, then re-measurement. (c) The 2 Research hardFailures need a fixture that satisfies `showResearch` (seed `data > 0` or a known node), then re-measurement. (d) **Missing hardware evidence remains an explicit blocker:** all numbers are headless emulation; the only real-phone artifact (`2026-11-14-rw3d-t03a-phone-declaration.md`, Pixel 8 Pro / Mali-G715 / Android 16 / Chrome 157) belongs to the **T03 spike at `1b83c58…` with no save data**, so no G1 app number is an on-device result (#190 closed, app-level re-measurement still owed). (e) "Quality fallback" is the **forced** FALLBACK-2D path; P01 records that **no quality auto-tuner exists yet**.

### R01 — issue/PR/SHA verdicts, CI and deployment linkage
- **Criterion:** "Issue/PR/current-SHA QA/product verdict and CI all linked; deployment separately verified against served SHA."
- **Status: PARTIAL.**
- **Proof that exists:** issue #151 (open, labels `priority:P0, role:reviewer, status:ready, rw3d`); branch `rw/151` at immutable head `e75ecf3e95dcd86564e5adc216974b6fdc0c6089`; the linked **draft PR opened by this pass** with body "Part of #151"; developer evidence handoffs `6887332519` (pass 1), `6887708404` (pass 2), `6888981073` (pass 3) and the pass-4 handoff; gates at this head all exit **0** (§2); this document maps every row to its proof. Precondition linkage verified live this pass: **#191 closed/merged** (`c6e187d`, PR #201) with recovery UI #202 → PR #209 (`4f83a61`) and #203 → PR #205 (`3be257d`); **#148 closed/merged** (`e6e7abf`, PR #222) with `tests/persistence/size-cap-148.test.ts` (9 tests) present — satisfying coordinator conditions `6871214431` and `6875970663`.
- **Unproven clauses:** **independent QA verdict on the immutable head**, **product verdict on the immutable head**, **CI green on the PR head**, and **deployment verified against the served SHA**. None exist yet; a developer cannot supply them (no self-acceptance). The round-trip save-integrity checks sometimes informally associated with "R01" belong to **E08** and are recorded there, including the two failing strict invalid-import sub-checks and their triage.
- **Proof head:** `e75ecf3` (gates, linkage); publication head recorded in the handoff.
- **Limitations / owed:** QA and product must review `e75ecf3` (app code) with this document; the release engineer merges only after both APPROVE; CI/CD and the served-SHA deployment receipt must be verified after merge. **Done never means deployed by itself.**

## 4. Mandatory limitations (apply to every row)

1. **Visual inspection is PENDING sponsor review.** This pass was run by a **non-vision** developer agent: only numeric, geometric and DOM-string evidence was produced. No claim of visual fidelity, art conformity, readability or motion quality is made. V01, V02, V04 and the visual halves of V03, V05, V06, U03, U06, U07 must be inspected by a vision-capable reviewer at **https://home.darkmatter2222.com/rustwake/**. Generated references are style targets, not implementation proof; all pixels cited here come from the running build.
2. **Headless Chrome EMULATION, not a physical phone (#190).** Every device-labelled result (phone 390x844@2, tablet/desktop bands) is emulation on one desktop host (RTX 5090, 32 threads). Frame times, heap and cold-load numbers are host-relative. The only real-device artifact is the T03 spike declaration at `1b83c58…` with no save data. App-level on-device re-measurement is still owed.
3. **Battle benchmark DEFINED but DEFERRED to G3.** `tests/perf/battle-protocol-151.md` exists; D01–D06 defense structures are unbuilt at this SHA, so no battle measurement is claimed (P01, E02 raid settlement).
4. **No real-player save corpus.** Migration/round-trip evidence uses checked-in legacy fixtures (11 fixtures, byte contract at `1b83c58`) plus synthetic round-trips through the shipped Yard panel. Product ruling `6871192050` (PR #189) permits this only with the limitation recorded — recorded here (E08, architecture README §4).
5. **`met: null` / UNKNOWN stays UNKNOWN.** The 4 P03 interaction medians are UNKNOWN and are not counted as MET, not averaged away, and not promoted.
6. **No budget was lifted and no assertion was weakened.** The 6 P03 byte-budget failures stand as UNMET; the 2 capture invalid-import sub-checks stand as failing; the capture document stays `pass: false` (78/80).
7. **Simulated agent usability is not human research.** U01/U04/U05 evidence comes from scripted agents, real key events and DOM assertions — no human usability study, no assistive-technology run, no audible audio verification.
8. **Proof heads differ from the review head for harness artifacts.** All cited artifacts have `src/` byte-identical to `e75ecf3`, but `tests/`/`scripts/` changed after some measurements (P02 at `a58b40a9…`, P03 at `4b5c4f44…`, access-66 at `e12578ac…`, T08 at `0c40871d…`). Those rows say so explicitly; nothing was re-captured in pass 4.

## 5. Gate summary

**Row tally (26 rows in G1/P1 scope):**

| Status | Count | Rows |
|---|---|---|
| MET | **14** | U01, U04, U05, U06, U07, E01, E02, E03, E04, E05, E06, E07, E09, P02 |
| MET (numeric) + PENDING-VISUAL | **2** | V03, V06 |
| PENDING-VISUAL | **3** | V01, V02, V04 |
| PARTIAL | **6** | U02, U03, E08, P01, P03, R01 |
| BLOCKED | **1** | V05 |
| UNKNOWN (row-level) | **0** | — (4 UNKNOWN *metrics* inside P03) |

Sub-counts: P03 budgets **36 MET / 6 UNMET / 4 UNKNOWN**; running-build capture **78/80** (`pass: false`); P01 **22/22** (battle deferred); P02 **38/38**; keyboard walkthrough **28/28 steps, 16/16 census**; kit validation **875/875**; gates **4/4 exit 0**, **110 files / 1495 tests**.

**G1/P1 CANNOT PASS at this head.** It requires all three of:

- **(a) Independent QA APPROVE and product APPROVE on the immutable head `e75ecf3e95dcd86564e5adc216974b6fdc0c6089`** — the reviewer must not be the implementation author (all GitHub posts share one account; role-stamped evidence is required). 1 row is BLOCKED and 6 are PARTIAL, so an APPROVE today would have to be an explicit, documented exception, not a silent pass.
- **(b) Release-engineer merge plus CI/CD and delivery verification green** — including the deployment receipt checked against the **served SHA** (R01). No self-acceptance, no unreviewed merge, no direct main push.
- **(c) Sponsor visual ACCEPT at the live URL** https://home.darkmatter2222.com/rustwake/ — vision-capable review is mandatory (`ACCEPTANCE.md:58`) and is PENDING for V01, V02, V04 and the visual halves of V03, V05, V06.

**Deferred / outstanding items (named, not waived):**

| Item | Live state | What is owed |
|---|---|---|
| Staged-assembly world↔sim↔renderer join (V05) | **no open issue**; #199 is a MERGED PR, #137 closed | Coordinator must file the join issue; developer wires `assemblyView` into `three/worldRenderer.ts`/`three/index.ts` and the authoritative build path; re-capture the 0–5 s clip + mid-build reload on phone and desktop |
| P03 byte budgets (6 UNMET) | #67 **closed**; no open budget/code-split issue | Coordinator files a bundle-size/code-split issue or records a product tradeoff ruling; budgets must not be lifted silently |
| P03 stale Menu target (4 UNKNOWN) + Research fixture gap (2 hardFailures) | harness/fixture limitation, verified causes | Re-target the harness at shipped toolbar/inspector surfaces; seed `data > 0` or a known node so `showResearch` is true; re-measure |
| On-device phone evidence | #190 **closed** (T03 spike only) | App-level re-measurement on the declared reference phone (`docs/vision/devices/reference-phone.md`) |
| Battle benchmark | G3 (#163/#165/#167, D01–D06 unbuilt) | Measure after defense structures exist; protocol already defined |
| #226 bay/logistics refinements | **open**, P2 | Real capacity, multi-bay semantics, load-time refinements (E05 long-horizon) |
| #223 command-ledger compaction | **open** | Bounded `seenCommands` window + false size-cap rejection fix (E08) |
| #16 priced-route refund after round-trip | **open** | Test the refund path across a save round-trip (E08/E09) |
| #164 production clearance ≥0.15 u + 27 `additionalRequired` assets | **open**, P3 | Production margin and remaining kit assets (V06) |
| U02 focused-input shortcut suppression | implemented, **untested** | Add the assertion (no `tests/` edits permitted in this pass) |
| U03 current-head 8-viewport × 200% census | access-66 at pre-rw3d `e12578ac…`; legibility `STEPS` max 1.5 | Re-run the census on this head's `dist`; add a 2.0 text-scale step |
| Real-player save corpus | none exists | Collect real exports/imports or keep the recorded no-corpus limitation (product ruling `6871192050`) |
| #226-adjacent G2 scope (E10–E12, multi-day strategies) | later gate | Not claimed here |

## 6. What each role must still do

- **Independent QA:** review app head `e75ecf3` against this document; re-run the four gates; verify the V05 blocker and the P03 UNMET/UNKNOWN causes independently; audit the two failing invalid-import sub-checks and their triage; record a role-stamped verdict on the immutable head SHA (not on the author's claim).
- **Product:** decide V05 (BLOCKED), the 6 byte-budget failures, the 4 UNKNOWN medians, U02/U03 coverage gaps and the no-corpus limitation; rule on the missing assembly-join and bundle-size issues; render ACCEPT/REWORK with actionable defects.
- **Sponsor / vision-capable reviewer:** inspect the live URL for V01, V02, V04, V03/V06 visual halves, assembly stages and deck-mounted upgrade modules (#137/#204), motion and audio; ACCEPT or REWORK.
- **Release engineer:** merge only after QA + product APPROVE; verify main CI/CD; verify the deployment against the served SHA and publish the receipt (R01).
- **Coordinator:** file the missing follow-up issues (assembly join, bundle-size/code-split, P03 harness re-target + Research fixture, U02 suppression test, U03 current-head census); keep blocked work blocked; do not dispatch G1 sign-off while V05 is BLOCKED.
- **Developer (this pass):** complete. No `src/`, `tests/`, `scripts/` or pass-1/2/3 artifact was modified; no merge, no verdict, no closure of #151.
