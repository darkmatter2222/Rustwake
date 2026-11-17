# Orthographic camera and pointer-grip design contract

## The observed failure
The original V2 camera calculated screen-delta pan using a simplified constant and yaw rotation without dividing the screen-up component by sin(camera elevation). At default 35.264° elevation, the terrain visibly slipped away from the cursor during click-hold drag. Wheel zoom also pivoted about center rather than terrain beneath the cursor. Fix implemented in src/camera.js and src/cameraInput.js, using exact screen-ground anchoring.

## Coordinate and projection math
World axes X east, Y up, Z south. Camera target on Y=0. Yaw 0 views from +Z, 45 approved default; elevation above horizontal. Orthographic frustum world height 80/zoom, CSS pixel canvas size W×H, pixel p relative to actual canvas rect. World units per CSS pixel k=80/(H*zoom). Horizontal screen-right component u=(px-W/2)k, vertical screen-up v=(H/2-py)k. Let theta=yaw, phi=elevation. Ground offset:
dx = cos(theta)u − sin(theta)v/sin(phi)
dz = −sin(theta)u − cos(theta)v/sin(phi).
This is the inverse of the world renderer's right/up camera basis. Test it, do not introduce approximations or separate HUD-specific math.

## Grab-to-drag invariant
At pointer-down record a single anchor world-ground position G under pointer p0. On each drag to p1, solve camera target so groundAtScreen(newView,p1)=G. This is exact even after many small moves; never accumulate guessed deltas. Applies to desktop left-drag and mobile one-finger pan. When the camera is intentionally clamped at target ±90 world units, the anchor can stop moving exactly at the boundary; document and visually communicate that limit.

## Zoom and orbit
Wheel/trackpad: capture ground under actual mouse location before zoom, compute bounded zoom, then adjust target to keep same ground under cursor. Handle DOM deltaMode pixels/lines/pages. Pinch: simultaneous zoom, twist yaw and centroid translation must maintain original world point under gesture centroid. On finger lift, reset remaining finger anchor; never turn the release into a build purchase.

Camera limits: zoom 0.20×–12×, yaw modulo 360°, elevation 20–80°, target ±90 world units; initial yaw45/elevation35.264, desktop zoom1.15, mobile zoom1. UI Zoom in/Zoom out buttons are explicit minimum-44px controls; wheel and pinch are not the only methods. Recenter/Home restores useful isometric view. Right drag or Shift drag rotates/tilts, Q/E orbit, arrow keys pan and Escape cancels a mode.

## Code boundaries
src/camera.js holds pure math, no browser or React dependencies. src/cameraInput.js owns the only mouse/pointer/wheel listeners on the world canvas and dispatches tap only after no movement/cancel. src/world.js renders using same orthographic frustum and updates camera matrix for immediate ray picking. src/App.jsx owns game commands and uses the controller's onTap; never let camera movement directly debit resources. World canvas reports read-only camera yaw/elevation/zoom/x/z and world3d stamps for browser evidence. Stamps do NOT authorize resource edits.

## CAM-01 regression matrix (#337)
The grip contract is now measured by an explicit matrix, not spot checks. Tolerance: the world point under the pointer before and after a gesture must agree within **≤1 CSS px**, converted exactly via the inverse projection u=cos(yaw)gx−sin(yaw)gz, v=−sin(elev)(sin(yaw)gx+cos(yaw)gz), errorCssPx=hypot(u,v)/k with k=80/(H·zoom). No world-unit fudge factor.

Math layer (tests/cameraMatrix.test.mjs, pure src/camera.js):
- 6480 pan cases: 24 yaw steps (0–345°) × pitch {20, 35.264, 50, 65, 80} × zoom {0.20, 1.37, 12} × 3 viewports (1440×900, 390×844, 844×390) × 6 near-edge pixels; max error 1.317e-13 px.
- 360 offset-target cases (target x:9, z:−5) across all quadrants; max 1.287e-13 px.
- 1008 wheel ticks: near-edge 1→12 clamp→out sweep plus center-wheel to the 0.20 clamp and a fresh near-edge tick at min zoom; max 9.592e-13 px.
- 48 orbit/tilt cases at max zoom near-edge including exact pitch clamps 20/80; max 2.469e-13 px.
- Two-finger twist+pinch near a phone edge, 4 steps, one shared anchor; max 5.835e-14 px.
- 24 fixed-seed mulberry32(337) golden screen-to-ground snapshots embedded verbatim (regression lock, <1e-7 coordinate match).
- Cases are constructed inside the ±90 pan envelope so they measure grip, not clamping.

Deterministic negative controls (exact expected constants embedded in the test; the matrix MUST fail if the legacy bugs return):
- Legacy delta-only pan (missing 1/sin(elev)) at yaw115/elev20/zoom1.37, drag (691.2,468)→(+75,+38): expected and actual **25.003235 CSS px** slip; approved math 1.242e-14 px.
- Legacy center-pivot wheel zoom at cursor (1411.2,450), ×1.55: expected and actual **380.160000 CSS px**; approved 0.
- Documented limit, not a bug: zoom-out at extreme corner (1411.2,882) from yaw115/elev20/zoom1 to the 0.20 clamp pins target exactly at (−90,90); anchor slip **520.892780 CSS px** is the panExtent boundary and must be communicated in-world (pending work below).

Browser layer (scripts/capture-v2.mjs, production build, desktop 1440×900): real right-drag orbits and wheel zooms reach 6 poses covering all four yaw quadrants (≈0/90/180/270 plus 225 diagonal and 115 oblique), pitch 20/35.264/80 and zoom 0.20/1.37/12, verified from the rendered camera's dataset stamps. 13 left-drag grips + 6 cursor wheel gestures at HUD-free near-edge pixels: max measured error **1.005e-13 CSS px**. Rendered-world cross-check without source hooks: at yaw≈225 the math-projected depot pixel (567,472) is dragged to center (grip error 0) and a real tap opens the inspector at **SITE 13.9 / LOGISTICS**, proving the live THREE raycaster agrees with the pure math at a non-default quadrant. In-build negative controls at the recorded pose: legacy delta pan **39.478791 px** vs approved 1.005e-13; legacy center zoom **230.999998 px** vs approved 0. Evidence: artifacts/v2-preview/camera-gesture-trace.json + camera-matrix-*.png at the capture's source SHA. Phone/landscape keep the existing zoom-button + stamp checks.

## Acceptance
- Unit tests in tests/camera.test.mjs verify anchor conservation across yaw0/45/115/180/270/350, elevations20/35.264/60/80, viewports390×844/844×390/1440×900/2560×1440, long one-pixel drags, cursor wheel, twist+pinch and clamps.
- tests/cameraMatrix.test.mjs adds the CAM-01 quadrant/pitch/zoom/near-edge matrix, golden snapshots and exact-value negative controls above (≤1 CSS px).
- A single Chromium in scripts/capture-v2.mjs checks actual DOM pointer drag and wheel and visible Zoom in control, with errors under .12 ground world units outside clamping, plus the CAM-01 desktop gesture matrix, raycast cross-check and camera-gesture-trace.json.
- Manual physical-device test: pick a conspicuous scrap pile and drag diagonally, pinch+twist around it and lift one finger; it must remain anchored and never spend resources. Test mouse wheel anchored at edge of a building, right orbit, keyboard controls and phone 200% text.
- Art/UI acceptance separately compares real screenshots and the approved reference; no numerical grip test proves visual quality.

Known pending work: height-aware mesh picking (currently cell intersection), world-edge communication, additional touch devices, smooth camera follow modes and performance tuning. Do not mark these implemented until measured.
