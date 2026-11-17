# CAM-01 camera and pointer-grip regression matrix (#337)

Contract: the world-ground point under the cursor/finger before and after any pan, wheel/pinch zoom or orbit gesture must stay pinned within **≤1 CSS px** (exact inverse-projection conversion in docs/design/CAMERA.md), except at the documented ±90 pan-extent clamp. Pure-math tests alone are insufficient; the browser layer must measure the rendered camera.

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
| Documented limit: panExtent clamp | corner (1411.2,882), zoom 1→0.20, yaw115/elev20 | target exactly (−90,90); slip 520.892780 px | identical | boundary, not a defect |

## Browser matrix — scripts/capture-v2.mjs (production build, Chromium, desktop 1440×900)
Real right-drag orbits + wheel zooms reach 6 poses verified from rendered-camera dataset stamps (yaw within 0.5°, pitch within 0.5°, zoom 1e-6): q1 yaw≈0/elev20/zoom0.20, q2 yaw≈90/elev80/zoom12, q3 yaw≈180/elev20/zoom12, q4 yaw≈270/elev80/zoom0.20, diagonal yaw≈225/elev35.264/zoom1.37, oblique yaw≈115/elev20/zoom1.37.

- 13 left-drag grips + 6 cursor-wheel gestures at HUD-free near-edge pixels (210,450), (720,760), wheel (1140,450): **max measured grip error 1.005e-13 CSS px** (tolerance 1).
- Rendered-world raycast cross-check at yaw≈225: math-projected depot pixel (567,472) dragged to center with 0 px error; real tap opens inspector **SITE 13.9 / LOGISTICS**, matching math cell (13,9) — live THREE raycaster agrees with pure math at a non-default quadrant, no source hooks added.
- In-build negative controls at the recorded achieved pose (yaw 115.00000854, elev 20, zoom 1.36999999): legacy delta pan (210,450)→(270,510) = **39.478791 px** vs approved 1.005e-13; legacy center zoom (1140,450) ×1.55 = **230.999998 px** vs approved 0. Values differ from the math constants because the browser records the exact achieved float pose and integer gesture pixels; both layers assert legacy > 1 px and approved ≤ 1 px.
- Existing desktop/phone/landscape Zoom-in-button, stamp, world3d-ready and no-scroll checks are preserved and still pass; phone/landscape do not run the gesture matrix (documented limitation).

Evidence artifacts (at capture source SHA): `artifacts/v2-preview/camera-gesture-trace.json`, `camera-matrix-q1-minpitch-minzoom.png`, `camera-matrix-q2-maxpitch-maxzoom.png`, `camera-matrix-q4-maxpitch-minzoom.png`, plus `report.json` (cameraMatrix section) and the three viewport world screenshots. CI uploads these on every PR capture run.

## Re-run recipe
`npm test` (43 tests on main e8240a87: 7 camera + 9 camera matrix + 9 grid occupancy + 5 simulation + 13 verify-live) then `npm run build && node scripts/capture-v2.mjs`. Numeric capture is a floor, not G1 visual acceptance; sponsor still reviews real screenshots/motion per docs/qa/QUALITY_GATES.md.
