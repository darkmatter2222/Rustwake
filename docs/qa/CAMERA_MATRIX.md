# CAM-01 / CAM-03 camera and pointer-grip regression matrix (#337, #339)

Contract: the world-ground point under the cursor/finger before and after any pan, wheel/pinch zoom or orbit gesture must stay pinned within **≤1 CSS px** (exact inverse-projection conversion in docs/design/CAMERA.md). CAM-03 (#339) extends this to the **full 0.20–12 zoom range at all angles**: when an anchored zoom would push the target past the ±90 pan envelope, the **zoom clamps smoothly** (zero anchor slip, no jump) instead of hard-clamping the target. A pure drag-pan/twist that alone exceeds the envelope still stops at the documented ±90 boundary (CAM-01). Pure-math tests alone are insufficient; the browser layer must measure the rendered camera.

## Math matrix — tests/cameraMatrix.test.mjs (node --test)
| Case family | Coverage | Cases | Max error (CSS px) | Result |
|---|---|---|---|---|
| Pan grip | yaw 0–345° step 15 × pitch {20, 35.264, 50, 65, 80} × zoom {0.20, 1.37, 12} × viewports {1440×900, 390×844, 844×390} × 6 near-edge pixels | 6480 | 1.317e-13 | PASS |
| Offset target | target (9, −5), all quadrants, mid zoom | 360 | 1.287e-13 | PASS |
| Wheel sweep | near-edge ticks 1→12 clamp→out, center wheel to 0.20 clamp, fresh near-edge tick at min zoom | 1008 | 9.592e-13 | PASS |
| Orbit/tilt | near-edge cursor, zoom 12, pitch clamps hit exactly 20/80 | 48 | 2.469e-13 | PASS |
| Two-finger gesture | phone near-edge twist+pinch+pan, shared anchor, 4 steps | 4 | 5.835e-14 | PASS |
| Golden snapshots | fixed seed mulberry32(337), 24 embedded screen-to-ground rows | 24 | 5.193e-14 | PASS |

All cases are constructed inside the ±90 pan envelope so they measure grip, not clamping.

## Deterministic negative controls (must FAIL the ≤1px contract by exact known amounts)
| Control | Input | Expected legacy error | Actual legacy error | Approved math error |
|---|---|---|---|---|
| Delta-only pan (missing 1/sin elev) | yaw115/elev20/zoom1.37, (691.2,468)→(+75,+38), 1440×900 | 25.003235 px | 25.003235 px | 1.242e-14 px |
| Center-pivot wheel zoom | cursor (1411.2,450), ×1.55, same pose | 380.160000 px | 380.160000 px | 0 px |
| CAM-03 boundary: pin-then-clamp (FIXED) | corner (1411.2,882), zoom 1→0.20, yaw115/elev20 | 520.892780 px (legacy target hard-clamped to (−90,90)) | 520.892780 px | 0 px (smooth clamp zoom ≈0.533999, target (−66.1384,90)) |
| CAM-03 zoom-only (no anchor pin) | cursor (1140,450), yaw45/elev35.264/zoom1, ×1.55, 1440×900 | 231.000000 px | 231.000000 px | 0 px |

## Browser matrix — scripts/capture-v2.mjs (production build, Chromium, desktop 1440×900)
Real right-drag orbits + wheel zooms reach 6 poses verified from rendered-camera dataset stamps (yaw within 0.5°, pitch within 0.5°, zoom 1e-6): q1 yaw≈0/elev20/zoom0.20, q2 yaw≈90/elev80/zoom12, q3 yaw≈180/elev20/zoom12, q4 yaw≈270/elev80/zoom0.20, diagonal yaw≈225/elev35.264/zoom1.37, oblique yaw≈115/elev20/zoom1.37.

- 13 left-drag grips + 6 cursor-wheel gestures at HUD-free near-edge pixels (210,450), (720,760), wheel (1140,450): **max measured grip error 1.005e-13 CSS px** (tolerance 1).
- Rendered-world raycast cross-check at yaw≈225: math-projected depot pixel (567,472) dragged to center with 0 px error; real tap opens inspector **SITE 13.9 / LOGISTICS**, matching math cell (13,9) — live THREE raycaster agrees with pure math at a non-default quadrant, no source hooks added.
- In-build negative controls at the recorded achieved pose (yaw 115.00000854, elev 20, zoom 1.36999999): legacy delta pan (210,450)→(270,510) = **39.478791 px** vs approved 1.005e-13; legacy center zoom (1140,450) ×1.55 = **230.999998 px** vs approved 0. Values differ from the math constants because the browser records the exact achieved float pose and integer gesture pixels; both layers assert legacy > 1 px and approved ≤ 1 px.
- Existing desktop/phone/landscape Zoom-in-button, stamp, world3d-ready and no-scroll checks are preserved and still pass; phone/landscape do not run the gesture matrix (documented limitation).

Evidence artifacts (at capture source SHA): `artifacts/v2-preview/camera-gesture-trace.json`, `camera-matrix-q1-minpitch-minzoom.png`, `camera-matrix-q2-maxpitch-maxzoom.png`, `camera-matrix-q4-maxpitch-minzoom.png`, plus `report.json` (cameraMatrix section) and the three viewport world screenshots. CI uploads these on every PR capture run.

## CAM-03 math matrix — tests/cameraZoomAnchor.test.mjs (node --test, 8 tests)
| Case family | Coverage | Cases | Max error (CSS px) | Result |
|---|---|---|---|---|
| Center full-range sweep | 3 viewports × 8 yaw × 3 pitch, request overshoot to 12 and 0.20 | 72 | 0 (exact limits, zero target shift) | PASS |
| Cursor wheel angular matrix | 3 viewports × 8 yaw {0,45,90,115,180,225,270,350} × 3 pitch {20,35.264,80} × 6 pixels × in/out 14 ticks | 12096 | 3.133e-12 | PASS |
| dataset == applied fixed point | normalizeCamera(pose) == pose for yaw/elev/zoom/x/z | 2160 | <1e-12 per field | PASS |
| Smooth no-jump clamp | yaw115/elev20 corner zoom-out 20 ticks + zoom-in 20 ticks | 40 | 7.835e-14 (max target step 70.39 wu <90) | PASS |
| Pinch zoom component | phone corner 16 pinch-out steps (deltaYaw 0) + in-envelope twist+pinch 8 steps | 24 | 3.672e-14 | PASS |
| Seeded random zoom | mulberry32(339), random pose/pixel/request across full range | 600 | 1.801e-12 | PASS |

Clamp behavior: 5860 of the 12096 angular ticks bind the envelope and clamp the zoom smoothly; zoom is monotone in the requested direction, the target never teleports (largest single-tick step 70.39 world units), and the anchor stays fixed (≤1e-9 px). Center-anchored zoom (K=0) always reaches both 0.20 and 12 exactly.

## CAM-03 browser matrix — scripts/capture-cam03.mjs (production preview, Chromium/SwiftShader)
Desktop 1440×900 + phone 390×844, real input through the production cameraInput → world.applyCamera/stampCamera path; every pose read from the synchronous canvas dataset stamps.

- Center +/- buttons: reach exactly **12** and **0.20** (16 clicks), max anchor error **0**, zero target shift, body `lastZoomApplied` == canvas `cameraZoom` (≤1e-6) on every click.
- Cursor wheel at (1140,450): anchor (22.955,−22.955) fixed, max error **6.783e-13 px** over 18 ticks; reaches 12 then clamps smoothly to zoom **0.233709** at envelope corner (−90,90), max single-tick target step 56.09 wu, monotone, no jump; dataset pose is a normalizeCamera fixed point on every tick.
- Phone two-finger pinch (CDP `Input.dispatchTouchEvent`) about a fixed centroid (62%,55%): max centroid error **5.982e-5 px** (integer touch-coordinate jitter) over 32 ticks; pinch-out reaches 0.20, pinch-in re-anchors to 1.5; no document scroll.
- In-build negative control at the recorded pose: legacy center-pivot zoom ×1.55 drifts **230.999999 px** (>1, fails contract) vs approved anchored wheel **0 px** (passes).
- Zero page errors and zero failed requests in both contexts.

Evidence (at capture source SHA): `docs/evidence/339-cam-03/report.json` (status PASS_NUMERIC_ONLY) + `desktop-cam03-{home,zoom-max,zoom-min,cursor-max,cursor-clamp,negative}.png` + `phone-cam03-{home,pinch-clamp,pinch-in}.png`.

## Re-run recipe
`npm test` (117 tests at CAM-03 head: prior 109 + 8 cameraZoomAnchor) then `npm run build && node scripts/capture-cam03.mjs` (CAM-03 zoom-anchor trace) and `node scripts/capture-v2.mjs` (CAM-01 gesture matrix). Numeric capture is a floor, not G1 visual acceptance; sponsor still reviews real screenshots/motion per docs/qa/QUALITY_GATES.md.

## CAM-08 pointer-ownership matrix — tests/cameraInput.test.mjs (node --test, 22 tests)
Real controller through a fake canvas + synthetic PointerEvents; contract: stale tracks never ghost-drag/stick/duplicate/jump/purchase; survivors rebase ≤1 CSS px with zero target jump.

| Case family | Coverage | Result |
|---|---|---|
| Anchor-exact drag, no tap | mouse left-drag, single touch, stylus contact, captured out-of-canvas release (≤1px) | PASS |
| Tap-once semantics | mouse tap, touch tap, stylus tap; pen barrel never taps; stationary second finger keeps own tap | PASS |
| Orbit / wheel | right-drag, shift+left-drag (yaw changes, no tap, capture freed); wheel anchor ≤1px; deltaMode lines/pages exact | PASS |
| Two-finger transform | pinch+twist centroid anchored; lift rebases survivor without target jump; cancel-of-one-finger rebases survivor and blocks its purchase | PASS |
| NEGATIVE ghost-drag (fails pre-fix) | hover after out-of-window release: target step 0 (pre-fix slip 191.049732 px) | PASS |
| NEGATIVE lost capture (fails pre-fix) | lostpointercapture mid-drag purges stuck track: target step 0 (pre-fix slip 372.021505 px) | PASS |
| NEGATIVE cancel purchase (fails pre-fix) | touchcancel + late pointerup for cancelled id submits NO build | PASS |
| Capture hygiene | pointerout purges only when uncaptured; captured pointerout keeps drag; setPointerCapture NotFoundError swallowed; buttons===0 purge | PASS |
| Dispose | removes every listener, releases capture, inert afterwards; idempotent with no active pointers | PASS |

Negative proof: 11 of 22 FAIL against the pre-fix src/cameraInput.js, 22/22 PASS against the fix. Full suite at CAM-08 head: **239** (217 main baseline + 22 new; zero existing tests deleted/skipped/weakened).

## CAM-08 browser matrix — scripts/capture-cam08.mjs (production preview, Chromium/SwiftShader)
Desktop 1440×900 + EMULATED phone 390×844 dpr2; poses read from synchronous canvas dataset stamps; phone multi-touch via CDP Input.dispatchTouchEvent with per-step delivery assertion.

- Desktop pan (600,400)→(760,520), out-of-window release (1300,450)→(1500,490), cursor wheel (1140,450): anchor error **0 px** each; capture freed; hover inert; structures 6→6.
- Ghost-drag negative: actual target step **0** vs computed pre-fix legacy drift **300 px**. Lost-capture negative: capturedBefore true → capturedAfter false, actual step **0** vs legacy stuck drift **356.089876 px**.
- Phone pinch+twist about centroid (234,422): max centroid error **6.12e-15 px**, zoom 1→2.333333; finger lift target step **0**; survivor rebase error **1.79e-14 px**; event log shows exactly one continuing pointermove (id 3) and **no fresh pointerdown**.
- Touch-cancel negative (build mode, canvas-verified press point (195,295)): structures **6→6**, lastSiteOk **null**, late synthetic pointerup for cancelled id 4 inert.
- Tap-once: projected building cell (13,9) tapped at (387,467) → inspector populated, status **"Online"**; second identical tap keeps one selection; select mode never purchases (structures 6).
- Both views: zero page errors, zero failed requests, documentScroll false, webglContextCount 1, yaw 45 / elevation 35.264 preserved.

Harness root-cause note: the earlier SURVIVOR_REBASE_DRIFT 50.000000000000014 px FAIL was a harness artifact — CDP touchMove events queue until the next compositor frame/next dispatch, so the old capture measured the pre-move pose (50 px == hypot(40,30), the full unapplied move). Page.startScreencast forces frames; every step asserts delivery via the canvas pointer-event log before measuring; touchEnd lists RELEASED points; touchCancel carries empty points and ends the sequence (late-up case uses a synthetic PointerEvent with the cancelled id — documented limitation). No gate widened; src/cameraInput.js unchanged for this case.

Evidence (at capture source SHA 314a14476f59628677598196b49509b889997ebc, direct parent of the evidence commit): `docs/evidence/344-cam-08/report.json` (PASS_NUMERIC_ONLY) + `desktop-cam08-{home,pan,ghost-negative,lostcapture-negative,outofwindow}.png` + `phone-cam08-{home,pinch-lift,cancel-negative,tap-once}.png` + `nonblank.json` (full-frame zlib decode: 14471–24399 distinct colours, luminance stddev 41.1–47.5).

CAM-08 re-run: `pnpm test` (239) then `pnpm build && GITHUB_SHA=<head> node scripts/capture-cam08.mjs`. Phone is EMULATED (#268/#275); G1 visual acceptance (#276) sponsor-reserved — numeric capture is a floor, not visual approval.
## CAM-05 panel-transition retention matrix (#341)

Contract: opening/closing any of the six toolbar panels, the inspector, the sheet collapse toggle or the ledger chip — and any responsive viewport resize — must keep the intentional camera pose **byte-identical** (dataset yaw/elevation/zoom/x/z) and the selected machine selected. Only explicit Home/Recenter (`reset`) refits; explicit Focus (`focus`) re-pins; a genuinely new obscured selection with auto-frame enabled (`selection`/`settings`) may reframe (UX-04). Decision point: pure `transitionCamera` in src/inspector.js; `panel`/`resize` return the camera **by reference**.

### Unit matrix — tests/cam05Retention.test.mjs (8 tests) + tests/cam05Wiring.test.mjs (5 jsdom rendered-App tests)
| Case family | Coverage | Cases | Tolerance | Result |
|---|---|---|---|---|
| Panel/resize reference identity | 2 triggers {panel,resize} × 2 viewports {desktop 1440×900, phone 390×844} × 3 poses {intentional yaw115/elev20/zoom1.37/target(9,−5); desktop home; envelope corner yaw359/elev80/zoom12/target(90,−90)} × 2 obscured × 2 autoFrame, depot selected | 48 (2×2×3×2×2) | returned camera === input camera (reference) | PASS |
| nextToolMode selection retention | select→inspect iff selectedId!=null; every tool keeps its mode; toolbar never drops selection | matrix | exact mode | PASS |
| Phone new-selection pin | obscured new selection pins machine to focusPixel (195,151.0992) | 1 | ≤1e-9 px | PASS |
| focus / selection / settings policy | focus moves with autoFrame=false; selection/settings honour opt-out and unobscured case | matrix | exact pose | PASS |
| reset homes + clamp | exact {45,35.264,1.15,0,0} desktop / {45,35.264,1,0,0} phone; out-of-range home clamps to {45,20,12,90,−90} | 3 | exact fields | PASS |
| #307 hash guard + App source contract | applyCamera f3afa5479a66b97e / stampCamera 691b3c0a3480e97b; choose uses nextToolMode, no setSelectedId; resize retain-trigger; framedRef; Escape deselect; no pointer listeners | 2 | sha256-16 / regex | PASS |
| Rendered-App wiring (jsdom, real cameraInput/simulation) | zoom+orbit pose → tap selects Freight Depot (pose unchanged) → six tools open/close (pose + probe selectedId 2) → collapse/expand → close + inspect re-entry → Recenter exact home → Escape probe, pose unchanged | 5 | byte-identical dataset pose | PASS |

Full suite at CAM-05 head (rebased onto main 8bdb722356604c11560417398795796f5a8cc5eb after CAM-08 #540): **252 pass / 0 fail** (239 main + 8 retention + 5 wiring; zero existing tests deleted/skipped/weakened).

### Deterministic negative controls (guard-is-real; exact constants embedded in tests)
| Control | Input | Expected legacy slip | Actual legacy slip | Approved panel slip |
|---|---|---|---|---|
| Legacy reframe on phone panel open | yaw115/elev20/zoom1.37/target(9,−5), 390×844, depot obscured by sheet | 271.65732663398177 px (Δtarget 53.2206322822418 wu) | 271.65732663398177 px | 0 px |
| Legacy reframe on desktop (forced obscured worst case) | same pose, 1440×900, focusPixel (898,405), legacy target (17.867683821160533,−1.8907367334617504) | 107.21827875948571 px (Δtarget 9.396985389619184 wu) | 107.21827875948571 px | 0 px |

### Browser matrix — scripts/capture-cam05.mjs (production preview, Chromium/SwiftShader)
Desktop 1440×900 dpr1 + emulated phone 390×844 dpr2 touch; every pose read from synchronous canvas dataset stamps; selection/trigger observability via panelProbe dataset.

- Intentional poses via real gestures: desktop Orbit button + Zoom in → yaw 90 / zoom 1.7825; phone wheel-zoom at a verified canvas pixel near the machine + ArrowDown keyboardPan → zoom 1.1972173631218102, recorded intentional pose target (21.334745659837534,7.334745659837537); after the obscured-retention sequence + explicit Focus + one ArrowDown nudge the six-panel loop and negative controls run at target (28.124383853659552,14.124383853659559). (A centre-anchored phone orbit button would swing the pinned machine off-canvas at 390px — orbit retention is proven on desktop, pan+zoom retention on phone.)
- Six-panel loop (build/road/fleet/research/market/**select** — select re-enters the inspector; the freight ledger is the separate seventh `inventory` panel exercised via the strip chip below): open and close each with **byte-identical pose** and probe selectedId 2; sheet titles verified; close unmounts the panel-host; inspector re-entry pose-identical; sheet collapse/expand pose-identical; ledger chip via resource strip pose-identical.
- Responsive resize 1440↔390 both directions: pose-identical, selection retained, probe trigger resize.
- Phone naturally-obscured retention: 3 real ArrowDown pans move the machine under the bottom sheet; Focus button appears; build open/close + inspector re-entry retain the obscured pose exactly; explicit Focus re-pins above the sheet with pin error **5.684341886080802e-14 px**.
- In-build negative controls at the recorded poses: legacy reframe would slip desktop **105.81259439933739 px** (Δtarget 9.137701995411415 wu) and phone **35 px** (Δtarget 4.799625837653429 wu) vs approved **0 px**.
- Home negative: exact refit {45,35.264,1.15,0,0} desktop / {45,35.264,1,0,0} phone, selection retained (probe reset selectedId 2). Escape: probe {trigger:"escape",mode:"select",selectedId:null}, pose unchanged. Empty-plot guard: build open with no selection never moves the home camera.
- Invariants: stampMatchesApplied true, buttonZoom==appliedZoom, world3d ready, exactly one WebGL context, motion frames differ, 18 audited taps ≥44px, no document scroll, zero page errors in both views.

Evidence (at capture source SHA d8ea1e6d2b063314c73d76294731a515d9a06b38, direct parent of the evidence commit): `docs/evidence/341-cam-05/report.json` (status **PASS_NUMERIC_ONLY**) + 6 desktop PNGs (inspector-posed, build-catalog-open, inspector-reentry, sheet-collapsed, resized-390x844, home-refit) + 7 phone PNGs (same set + obscured-retained, resized-1440x900). Non-blank full-frame decode now reports real meanLuma (desktop 89.00331811491156, phone 68.61826531113404; distinctColors 2651 / 2032).

Coupled CAM-08 re-run (reviewer merge-order requirement — #540 pointer ownership × #541 camera retention are semantically coupled): `scripts/capture-cam08.mjs` re-run at the SAME capture head d8ea1e6d2b063314c73d76294731a515d9a06b38 → **PASS_NUMERIC_ONLY**, receipt + 9 PNGs in `docs/evidence/341-cam-05/cam08-coupled-rerun/`. Desktop pan/out-of-window/wheel anchor error 0 px; ghost negative actual step 0 vs legacy 300 px; lost-capture actual 0 vs legacy 356.0898762952971 px; phone pinch centroid max error 6.120628068700403e-15 px (zoom 2.3333333333333326), finger-lift step 0, survivor rebase 1.785170308651107e-14 px with survivorMoveDelivered true and no fresh pointerdown; touchCancel structures 6→6, lastSiteOk null; tap-once selects "Online"; zero page errors, one WebGL context, no document scroll in both views.

### CAM-05 re-run recipe
`pnpm test` (252 tests) then `pnpm build && node scripts/capture-cam05.mjs`. Phone is emulated, not a physical handset (#268/#275); numeric capture is a floor, not G1 visual acceptance (#276, sponsor-reserved); the hosted-browser receipt at the deployed SHA is produced at release (#333).

### CAM-05 wiring harness contract (#545, P0 CI-hang fix)
`tests/cam05Wiring.test.mjs` must never gate an assertion on a fixed `sleep(N)`: every wait is a `waitFor(predicate, {timeout: 15000, label})` poll on real DOM/dataset state (`.world-canvas` mount, `data-camera-*` stamps, `panelProbe` writes, `data-collapsed` transitions, sheet title) with a descriptive timeout error. Teardown (`root.unmount(); dom.window.close()`) lives in a guaranteed idempotent `after()` hook registered before the bootstrap, and the bootstrap wait is try/catch-guarded — a failing test (or failed bootstrap) must exit non-zero promptly, never keep `node --test` alive via the React root + `pretendToBeVisual` jsdom window. `--test-force-exit` and other leak-hiding mechanisms are forbidden. The `CAM05_TEARDOWN_PROBE=1` env switch exists solely for the in-file child-process regression test that proves this guarantee (sabotaged bootstrap → exit code 1, <30 s); it is never set by `pnpm test` or CI. Fixed at implementation head f4cbf4f62c019f60a0ba6b767e3e54b47a4ce818 (PR #546): suite 272/272 (271 baseline + 1 regression test), negative control exit 1 in 631 ms, 5 load runs at concurrency 16 plus one under 6 CPU hammers all 272/272. Harness-only change: no rendered-world delta, no browser capture required.

Residual mount-race flake fixed at implementation head b89cc0b912e4c8cea639a2206fa56d9bc011bbe7 (#545 follow-up, PR #546): the condition-based bootstrap still resolved too early — `waitFor(() => canvas())` is satisfied the instant the `.world-canvas` ELEMENT mounts, but App.jsx publishes the first pose later via the rAF `update()` → `applyCamera()` dataset-stamp path, so on a loaded 2-core runner `pose().yaw` was `undefined !== '45'` (push run 44067561867 and pull_request run 44067793813 failed at f4cbf4f6/d5289b99 while push 44067783042 passed the same code; tests 10–12 were pure cascade). Harness rule added: **every wait predicate must imply the assertions that follow it.** The bootstrap now waits for `canvas() && pose().yaw !== undefined` (applyCamera writes all five `data-camera-*` fields in one synchronous pass, so a defined yaw implies the full published pose); the exact `'45'` expectation remains a hard assertion, never folded into the wait. Full-file audit: every other `waitFor` already implies its following assertions — `panelProbe` JSON writes are atomic single stamps, App.jsx stamps the camera BEFORE writing the reset probe (Home wait), and the sheet-toggle probe is written synchronously in the click handler before the `data-collapsed` render; pose/selection-retention checks are negative invariants ("must NOT move/drop") and stay hard assertions. No expected value was relaxed, no timeout raised, no `--test-force-exit`.

Deterministic reproduction switch (test-only fixture `tests/fixtures/cam05WorldStub.mjs`): `CAM05_SLOW_STAMP_MS=<ms>` (default 0, normal runs unaffected) defers the INITIAL camera stamp by `<ms>` while the canvas is already mounted; once it lands, later stamps are synchronous again, preserving the production stamp-before-probe ordering. `dispose()` clears the pending timer so teardown never leaks. Reviewer re-run recipe: `CAM05_SLOW_STAMP_MS=2000 node --test tests/cam05Wiring.test.mjs`. Measured at 2000 ms: OLD bare-canvas predicate → test 1 fails `undefined !== '45'`, tests 2–4 cascade, exit 1 in 32796 ms (no hang); NEW predicate → 7/7 pass, exit 0 in 6071 ms. A second in-file child-process regression test re-runs the file with a 1200 ms deferred stamp and requires exit 0 / 7 pass / 0 fail (env marker `CAM05_SLOW_STAMP_CHILD` bounds recursion to one delayed child, whose in-child branch asserts the bootstrap actually waited out the stamp). Suite is now **273** (271 baseline + 2 regression tests). Evidence at b89cc0b9: `pnpm test` 273/273 (4684 ms), `pnpm validate` + `pnpm build` green, teardown negative control `CAM05_TEARDOWN_PROBE=1` exit 1 in 718 ms wall, 10 consecutive full-suite runs at `--test-concurrency=16` under 6 verified CPU hammers all 273/273 (4321–4385 ms) plus 10 unloaded runs (4129–4719 ms); push CI run 44069303351 success at b89cc0b9 (final-head run IDs recorded in PR #546). Harness-only: no `src/`, workflow, `package.json` or lockfile change; no rendered-world delta, no browser capture required.
## CAM-02 interaction state-machine matrix (#338)

Contract: ONE classifier in src/cameraInput.js decides whether a contact sequence is a **click** (the only gesture that may commit a build/road or change selection) or a **camera gesture** (pan / orbit / pinch-twist / chord / cancel) that must NEVER spend materials. Click slop is **5 CSS px for mouse/pen, 10 CSS px for touch**, measured from the down pixel and **latched** (displacement ≥ slop is a drag forever, even if the pointer returns to the down pixel). The commit cell is the cell picked at **pointer down** (`downCell`), never the release pixel. A tap requires ALL of: track alive at the FINAL button release (`e.buttons===0`), single-pointer session, displacement strictly below slop, never gestured (no two-finger transform, no button chord, no wheel/Q-E/arrow/zoom-button camera command during contact), primary press AND primary release (button 0, no shift orbit intent), and the down-cell commit rule. Design: docs/design/CAMERA.md CAM-02; gesture ownership: docs/design/INTERACTION_PATTERNS.md.

### Unit matrix — tests/cameraInputGesture.test.mjs (node --test, 25 tests)
Real controller through a fake canvas + synthetic PointerEvents against a fake world implementing the public setView/applyCamera/screenToCell API with the same orthographic ground projection; asserts exact tap counts, the COMMIT CELL, camera pose and the read-only `state()` snapshot.

| Case family | Coverage | Result |
|---|---|---|
| 5px/10px thresholds | mouse drag at exactly 5px pans anchor-exact (≤1px) and never taps; 4px mouse jitter is still a click (one tap, pose unchanged); touch drag at exactly 10px pans and never taps; 8px touch jitter is inside the 10px slop (one tap); 9px touch jitter commits once at the DOWN cell | PASS |
| Latch | 120px+80px out-and-back to the exact down pixel never re-arms a click (`moved` latch survives) | PASS |
| Right / middle / back / shift | right-drag orbits (phase "orbit") and never taps, stationary right press never taps; middle (button 1) and back/forward (buttons 3/4) never commit; shift+left stationary press is orbit intent (`primary:false`), shift micro-drag <5px never taps | PASS |
| Button chords | orbit+click chord: same-pointerId secondary down keeps the original track (phase "chord", gestured), non-final left release AND final right release both emit 0 taps; left-drag → right-click chord → left release emits 0 taps | PASS |
| Two-finger turn | 40° twist + slight pinch about centroid (200,420): centroid anchored ≤1px every step, yaw changes, BOTH fingers phase "multi"/gestured, neither lift taps; one moving + one stationary finger both lift with 0 taps | PASS |
| pointercancel | cancel mid single-finger drag + late up: 0 taps, capture freed, state idle; cancel of a STATIONARY touch + late up: 0 taps; cancel of one pinch finger rebases survivor ≤1px with zero target jump and blocks its purchase | PASS |
| Camera command during contact | wheel zoom, Q/E rotate, arrow-key pan and zoom-button command during a stationary press each mark the contact gestured → release emits 0 taps | PASS |
| Intentional click / road | clean click commits exactly once at the pressed cell, capture freed, state idle→press→idle; road = two clean clicks emit exactly two taps (origin cell, post-pan destination cell), a drag between them pans and emits none | PASS |
| State phases | press→pan, press→orbit, multi, chord, idle transitions asserted via `state()` | PASS |

Deterministic NEGATIVE cases (fail against the pre-fix controller, pass against the fix): sub-threshold jitter across a cell boundary (pre-fix committed the RELEASE cell), middle click, back/forward buttons, shift stationary press, orbit+click chord (pre-fix re-armed a fresh track and tapped on the non-final release), wheel/Q-E/arrow/zoom-button during a stationary press (pre-fix release SPENT). Per the committed measured proof `docs/evidence/338-cam-02/prefix-proof.json` (real `node --test tests/cameraInputGesture.test.mjs` run against the pre-fix controller from main 5dd3fe295de0345d52ab82353fec730c7cd7b105, raw TAP embedded), **20 of the 25** new tests fail pre-fix (14 behavioral + 6 state-contract, classified by first failed assertion frame) and 5 pass; 25/25 pass post-fix. Full suite at CAM-02 head: **298 pass / 0 fail** (273 main baseline 5dd3fe295de0345d52ab82353fec730c7cd7b105 + 25 new; zero existing tests deleted/skipped/weakened).

### Browser matrix — scripts/capture-cam02.mjs (production preview, Chromium/SwiftShader)
Desktop 1440×900 + EMULATED phone 390×844 dpr2; real input through the production cameraInput → onTap → buildAt/roadLine path; poses read from synchronous canvas dataset stamps; bank deltas measured against a `createGame()` fixture with `vehicles:[]` so freight income cannot pollute them. Every spend row below has **actual bank delta == expected bank delta exactly**; every negative row has **bank delta {} and lastSiteOk null** (no tap reached buildAt).

| Gesture | Input | Expected | Actual (report.json) | Result |
|---|---|---|---|---|
| Desktop 5px drag (negative) | build mode, site (10,1), press (1008,228), +5px | pan anchor ≤1px, spend NOTHING | errorCssPx **7.50574650604848e-14**, bankDelta {}, structures 6 / roads 73 unchanged, lastSiteOk null, build mode retained, no selection | PASS |
| Desktop 4px jitter commit | down cell (10,1), release pixel projects to (10,0), press (1036,228)→(1040,228) | ONE salvager at the DOWN cell, bank == −cost | bankDelta **{credits:−180, scrap:−28, stone:−12}** == expected; structures 6→7, roads 73; lastSiteOk "true"; inspector **SITE 10.1**; newBuildingId 10; second tap: bankDelta {}, structures 7, selectionKept true | PASS |
| Desktop right-drag orbit (negative) | build mode, site (11,1) | yaw orbits, spend NOTHING | yaw 45 → **11.399999999999977**, bankDelta {}, structures 7, lastSiteOk null | PASS |
| Desktop middle click (negative) | button 1 at site (11,1) | spend NOTHING (pre-fix tapped) | bankDelta {}, structures 7, lastSiteOk null | PASS |
| Desktop shift stationary (negative) | Shift+left press at site (11,1) | orbit intent, spend NOTHING (pre-fix tapped) | bankDelta {}, structures 7, lastSiteOk null | PASS |
| Desktop orbit+click chord (negative) | right hold + left chord, two releases | NEITHER release spends (pre-fix tapped on left release) | afterLeftRelease AND afterFinalRelease: bankDelta {}, structures 7, lastSiteOk null | PASS |
| Desktop wheel during press (negative) | wheel while contact held | zoom marks gesture, release spends NOTHING (pre-fix tapped) | zoom 1.15 → **1.3767999675900815**, bankDelta {}, structures 7, lastSiteOk null | PASS |
| Desktop pointercancel (negative) | synthetic pointercancel with the REAL mouse pointerId, then REAL CDP mouseReleased late up | spend NOTHING, capture freed | capturedBefore true → capturedAfter **false**, bankDelta {}, structures 7, lastSiteOk null | PASS |
| Desktop clean click commit | build mode, site (11,1), press (1040,247) | ONE salvager, bank == −cost, inspector selects new building, build mode auto-exits | bankDelta **{credits:−180, scrap:−28, stone:−12}** == expected; structures 7→8; lastSiteOk "true"; inspector **SITE 11.1**; newBuildingId 13 | PASS |
| Road gesture | road mode, origin (2,2) → destination (7,2) | drag (armed or not) paves NOTHING; origin click arms without spend; destination click paves the route ONCE: roads +N, bank −{4N credits, 3N stone} | dragOnly / originClick / dragBetween: bankDelta {}, roads 73, lastSiteOk null; destinationClick: bankDelta **{credits:−24, stone:−18}** == expected (N=6), roads 73→**79** (+6), structures 8 unchanged | PASS |
| Select tap | select mode, building cell (7,9) | selects, spends NOTHING | "Scrap Extractor" selected true, bankDelta {}, structures 8 / roads 79 | PASS |
| Phone 10px drag (negative) | build mode, site (1,1), +10px touch | pan anchor ≤1px, spend NOTHING | errorCssPx **0**, bankDelta {}, structures 8 / roads 79, lastSiteOk null | PASS |
| Phone 9px jitter commit | down cell (1,1), release pixel projects to (1,0) | ONE salvager at the DOWN cell (pre-fix >6px slop panned and spent nothing) | bankDelta **{credits:−180, scrap:−28, stone:−12}** == expected; structures 8→9; lastSiteOk "true"; inspector **SITE 1.1**; newBuildingId 17 | PASS |
| Phone two-finger turn (negative) | 40° twist in the top 30% gesture zone | yaw orbits, centroid anchored ≤1px, NEITHER finger spends | yaw 45 → **84.99999997971395**, maxCentroidErrorCssPx **8.435723809348083e-6**, bankDelta {}, structures 9, lastSiteOk null | PASS |
| Phone pinch + finger lift | pinch in the gesture zone, then lift one finger | centroid anchored ≤1px, lift zero target jump, survivor rebase ≤1px, NOTHING spent at any stage | maxPinchErrorCssPx **4.2724609447601375e-6**, pinchZoom **2.399999999999999**, fingerLiftTargetStep **0**, survivorRebaseErrorCssPx **1.525878903596692e-5**, bankDelta {}, structures 9, lastSiteOk null | PASS |
| Phone cancel stationary (negative) | cancelled STATIONARY build press (id 8) + late synthetic up | spend NOTHING (stationary press is exactly the pre-fix tap shape) | bankDelta {}, structures 9, lastSiteOk null | PASS |
| Phone cancel mid-drag (negative) | cancelled touch DRAG (id 9) + late up | spend NOTHING | bankDelta {}, structures 9, lastSiteOk null | PASS |
| Phone clean tap commit | build mode, site (3,1), press (247,136) | ONE salvager, bank == −cost, inspector selects new building | bankDelta **{credits:−180, scrap:−28, stone:−12}** == expected; structures 9→10; lastSiteOk "true"; inspector **SITE 3.1**; newBuildingId 20 | PASS |

Both views: zero page errors, zero failed requests, documentScroll false, webglContextCount 1, home pose yaw 45 / elevation 35.264 (zoom 1.15 desktop / 1 phone). Phone multi-touch via CDP `Input.dispatchTouchEvent` with per-step delivery assertion (Page.startScreencast forces BeginFrames; the CAM-08 harness lesson applies); the real NOTICE toast is dismissed before phone two-finger sweeps so it cannot intercept contacts. touchCancel carries no points and ends the CDP sequence, so the phone late-up-after-cancel negatives use a synthetic PointerEvent with the cancelled pointerId against the real canvas listener (desktop uses a REAL CDP mouseReleased) — documented limitation, not a relaxed gate.

Evidence (at capture source SHA **501bc9dab220ae016268f7f7e55f92f50d740793**, direct parent of the evidence commit; `git diff 501bc9da…HEAD -- src scripts tests` is EMPTY; capture originally ran at pre-rebase code head eafae2346100efee5be2358335ddffa6e3ffca8c — src/cameraInput.js, scripts/capture-cam02.mjs and tests/cameraInputGesture.test.mjs byte-identical across the docs-only rebase onto main 5dd3fe29): `docs/evidence/338-cam-02/report.json` (status **PASS_NUMERIC_ONLY**, errors []) + `prefix-proof.json` (measured pre-fix failure proof) + 13 PNGs — desktop/phone × home, clean-commit, jitter-commit, road (desktop) and negatives (desktop drag5 / orbit / cancel; phone drag10 / twist / cancel) — + `nonblank.json` (zlib full-frame decode: **15621–28859** distinct colours, luminance stddev **42.754–47.856**, gates min 500 colours / stddev 5).

### CAM-02 re-run recipe
`pnpm test` (298 tests = 273 main + 25 gesture) then `pnpm build && node scripts/capture-cam02.mjs`. Phone is EMULATED, not a physical handset (#268/#275); numeric capture is a floor, not G1 visual acceptance (#276, sponsor-reserved); the hosted-browser receipt at the deployed SHA is produced at release (#333). Branch CI success is NOT a production release.

## CAM-10 latency and smoothness matrix (#346, measurement slice)

Capture: scripts/capture-cam10.mjs, production preview, ONE headless Chromium/SwiftShader browser (HeadlessChrome/159.0.8154.6, ANGLE Vulkan 1.3.0 SwiftShader Subzero), code head **ee34fef55c363582b1d614f590e66b8a63823bda** (train-turn rebase onto main 0f54b2cf3f72e4c89158dc601e5dd1e6e0ef1a7f; evidence RE-CAPTURED on the rebased build 2026-11-17 because main's src moved underneath the prior capture). Evidence: docs/evidence/346-cam-10/report.json (**PASS_NUMERIC_ONLY**, errors []) + 4 PNGs + rollback-control.json (control re-run at the new head). Input-to-photon is an event-to-next-rendered-frame PROXY (no physical display; GPU presentation/compositor latency excluded). Synthetic gestures only; aggregates only.

### Unit matrix — tests/cameraInputProbe.test.mjs (11) + tests/cam10Stats.test.mjs (10)

Full suite **466 = 445 coordinator-verified main baseline at 0f54b2cf + 21** (cam10Stats 10/10, cameraInputProbe 11/11 new; per-file 21/21). Windows-local 465/466 — the single fail is main's OWN pre-existing tests/deliveryAlert.test.mjs LF-only permissions regex (CRLF checkout; known Windows failure, coordinator-verified on main, Linux CI authoritative); the file is byte-identical to main on this branch. Historical figures: 380 = 359 main b56fded + 21 at the prior base; main has since grown to 445 (#576/#566 and the alarm/dismantle/dispatch train).

### Browser matrix — 60 s baseline per view, drag and zoom SEPARATE

| View | Frames / duration | FPS | Frame mean / P50 / P95 / max (ms) | Jank (>50ms) | Dropped | Drag latency mean/P95 (ms, n=15) | Zoom latency mean/P95 (ms, n=15) | Handler drag mean/max (ms) | Handler zoom mean/max (ms) |
|---|---|---|---|---|---|---|---|---|---|
| Desktop 1440×900 dpr1 (mouse drag + wheel) | 851 / 58.91 s | 14.45 | 69.19 / 66.70 / **83.40** / 133.4 | 819 | 2682 | 63.16 / **67.90** (min 55.40) | 207.67 / **226.40** (min 192.70) | 0.140 / 0.40 | 0.127 / 0.70 |
| Phone 390×844 dpr2 EMULATED (CDP touch drag + two-finger pinch) | 761 / 59.20 s | 12.86 | 77.77 / 83.30 / **116.70** / 183.3 | 677 | 2790 | 231.11 / **270.20** (min 179.80) | 236.77 / **310.20** (min 176.60) | 0.213 / 0.90 | 0.020 / 0.10 |

Provenance both views: SwiftShader true, drawingBuffer 1440×900 / 780×1688, webglContexts 1, zero page errors, zero contact refinds (elementFromPoint verified before AND at each gesture), delivery counters confirm every gesture reached the canvas.

### Deterministic negative (delayMs=120 injected stall, 16 commands) — exact expected/actual

| Gate | Desktop expected | Desktop actual | Phone expected | Phone actual | Verdict |
|---|---|---|---|---|---|
| drag min sample ≥ 120 ms | ≥120 | 121.6 | ≥120 | 261.0 | PASS |
| drag degraded P95 ≥ baseline+60 | ≥127.90 | 191.70 | ≥330.20 | 345.80 | PASS |
| zoom min sample ≥ 120 ms | ≥120 | 320.7 | ≥120 | 368.6 | PASS |
| zoom degraded P95 ≥ baseline+60 | ≥286.40 | 347.90 | ≥370.20 | 456.40 | PASS |
| jank frames ≥ 16 injected | ≥16 | 74 | ≥16 | 68 | PASS |

### Recovery (flag cleared, 6 commands)

| Gate | Desktop expected | Desktop actual | Phone expected | Phone actual | Verdict |
|---|---|---|---|---|---|
| drag recovered P95 ≤ baseline+60 | ≤127.90 | 66.20 | ≤330.20 | 152.10 | PASS |
| zoom recovered P95 ≤ baseline+60 | ≤286.40 | 220.00 | ≤370.20 | 147.50 | PASS |

### Guard-is-real proof (rollback-control.json)

RE-RUN at rebased code head ee34fef: src/cameraInput.js rolled back to main 0f54b2cf blob (main never touched the file since b56fded, so the blob is unchanged) → **9/11 probe tests FAIL** (2 survivors are inertness continuity guards that must hold on main too); restored byte-exact. scripts/cam10-stats.mjs JANK_MS mutated 50→5000 → **2/10 stats tests FAIL** (declared constants; exact jank trace); restored. git diff HEAD 0 bytes + sha256 equality + post-restore 21/21 green.

### Runner-load disclosure and interpretation

Shared host: other agents run concurrently and idle dev servers remain from earlier sessions — the 14.45/12.86 fps baselines INCLUDE that contention and are NOT quiet-host guarantees. No CPU-heavy work (tests, rollback proof) ran during the capture. Handler cost ≤0.9 ms max shows the input/raycast path is not the bottleneck; proxy latency is dominated by time-to-next-rendered-frame (software WebGL render cost + host load). The optimization half of #346 (world.js frame-cadence paths) is deferred to a scoped follow-up issue — no quality setting was changed to obtain any number here.

### CAM-10 re-run recipe
`pnpm test` (466 = 445 main + 21) then `pnpm build && RUSTWAKE_PREVIEW_PORT=<free-port> node scripts/capture-cam10.mjs`. Phone is EMULATED (#268/#275); numeric capture is a floor, not G1 visual acceptance (#276, sponsor-reserved); hosted-browser receipt at the deployed SHA is produced at release (#333). Branch CI success is NOT a production release.
