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

## Acceptance
- Unit tests in tests/camera.test.mjs verify anchor conservation across yaw0/45/115/180/270/350, elevations20/35.264/60/80, viewports390×844/844×390/1440×900/2560×1440, long one-pixel drags, cursor wheel, twist+pinch and clamps.
- A single Chromium in scripts/capture-v2.mjs checks actual DOM pointer drag and wheel and visible Zoom in control, with errors under .12 ground world units outside clamping.
- Manual physical-device test: pick a conspicuous scrap pile and drag diagonally, pinch+twist around it and lift one finger; it must remain anchored and never spend resources. Test mouse wheel anchored at edge of a building, right orbit, keyboard controls and phone 200% text.
- Art/UI acceptance separately compares real screenshots and the approved reference; no numerical grip test proves visual quality.

Known pending work: height-aware mesh picking (currently cell intersection), world-edge communication, additional touch devices, smooth camera follow modes and performance tuning. Do not mark these implemented until measured.
