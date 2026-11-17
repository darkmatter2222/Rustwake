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
