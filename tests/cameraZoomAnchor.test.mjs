/**
 * CAM-03 (#339): zoom anchored to cursor / touch centroid at ALL angles across
 * the FULL 0.20-12 range, with smooth no-jump clamping at the +/-90 pan envelope
 * and dataset stamps that equal the applied camera state.
 *
 * Tolerance contract (same exact inverse projection as CAM-01): the world point
 * under the cursor/centroid before and after a zoom must agree within <= 1 CSS
 * pixel; k = 80/(H*zoom), u = cos(yaw)gx - sin(yaw)gz,
 * v = -sin(elev)(sin(yaw)gx + cos(yaw)gz), errorCssPx = hypot(u,v)/k.
 *
 * The fix under test: src/camera.js zoomAtPixel / transformGesture clamp the
 * ZOOM smoothly (boundedZoom) when the anchored target would leave the pan
 * envelope, instead of hard-clamping the target and sliding the terrain.
 * Deterministic negative controls reproduce the pre-fix drift by exact constants.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  CAMERA_LIMITS, normalizeCamera, groundAtScreen, zoomAtPixel, transformGesture
} from "../src/camera.js";

const TOL_PX = 1;
const rad = d => d * Math.PI / 180;
const kOf = (vp, zoom) => CAMERA_LIMITS.frustumHeight / (vp.height * zoom);
function errorCssPx(camera, expectedGround, pixel, vp) {
  const c = normalizeCamera(camera), a = groundAtScreen(c, pixel, vp);
  const gx = a.x - expectedGround.x, gz = a.z - expectedGround.z;
  const cs = Math.cos(rad(c.yaw)), sn = Math.sin(rad(c.yaw));
  const u = cs * gx - sn * gz;
  const v = -Math.sin(rad(c.elevation)) * (sn * gx + cs * gz);
  return Math.hypot(u, v) / kOf(vp, c.zoom);
}
const inEnvelope = c => Math.abs(c.x) <= CAMERA_LIMITS.panExtent + 1e-9 && Math.abs(c.z) <= CAMERA_LIMITS.panExtent + 1e-9;
/** Pre-fix NEGATIVE: change zoom only, never re-pin the anchor (center pivot). */
const legacyZoomOnly = (camera, nextZoom) => normalizeCamera({ ...normalizeCamera(camera), zoom: nextZoom });
/** Pre-fix NEGATIVE: pin at requested zoom, then let normalize hard-clamp target. */
function legacyPinClamp(camera, nextZoom, pixel, vp) {
  const c = normalizeCamera(camera), anchor = groundAtScreen(c, pixel, vp);
  const below = groundAtScreen({ ...c, zoom: nextZoom }, pixel, vp);
  return normalizeCamera({ ...c, zoom: nextZoom, x: c.x + (anchor.x - below.x), z: c.z + (anchor.z - below.z) });
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }];
const YAWS = [0, 45, 90, 115, 180, 225, 270, 350];
const PITCHES = [20, 35.264, 80];
const PIXELS = [[.5, .5], [.63, .41], [.98, .5], [.5, .9], [.98, .98], [.02, .02]];

test("CAM-03: center-anchored zoom (the +/- buttons) reaches the FULL 0.20-12 range with zero target shift", () => {
  for (const vp of VIEWPORTS) for (const yaw of YAWS) for (const elevation of PITCHES) {
    const center = { x: vp.width / 2, y: vp.height / 2 };
    let cam = { x: 0, z: 0, yaw, elevation, zoom: 1 };
    const anchor = groundAtScreen(cam, center, vp);
    cam = zoomAtPixel(cam, 999, center, vp); // request far above max -> clamps to 12
    assert.equal(cam.zoom, CAMERA_LIMITS.maxZoom, "must reach maxZoom 12");
    assert.equal(cam.x, 0); assert.equal(cam.z, 0);
    assert.ok(errorCssPx(cam, anchor, center, vp) <= 1e-9, "center anchor fixed at max");
    cam = zoomAtPixel(cam, 0.0001, center, vp); // request far below min -> clamps to 0.20
    assert.equal(cam.zoom, CAMERA_LIMITS.minZoom, "must reach minZoom 0.20");
    assert.equal(cam.x, 0); assert.equal(cam.z, 0);
    assert.ok(errorCssPx(cam, anchor, center, vp) <= 1e-9, "center anchor fixed at min");
  }
  console.log("CAM-03 center sweep: 3 viewports x 8 yaw x 3 pitch reach 12 and 0.20 exactly, zero drift/shift");
});

test("CAM-03: cursor wheel zoom keeps the anchor <= 1 CSS px across the full range at every angle/viewport/pixel", () => {
  let cases = 0, maxErr = 0, clampedCases = 0;
  for (const vp of VIEWPORTS) for (const yaw of YAWS) for (const elevation of PITCHES) for (const [fx, fy] of PIXELS) {
    const pixel = { x: vp.width * fx, y: vp.height * fy };
    let cam = { x: 0, z: 0, yaw, elevation, zoom: 1 };
    const anchor = groundAtScreen(cam, pixel, vp);
    // Zoom IN toward 12 (6 ticks of 1.55 overshoot max), then OUT toward 0.20.
    for (const dir of [1.55, 1 / 1.55]) {
      let prev = cam.zoom;
      for (let i = 0; i < 14; i++) {
        cam = zoomAtPixel(cam, cam.zoom * dir, pixel, vp);
        const err = errorCssPx(cam, anchor, pixel, vp);
        maxErr = Math.max(maxErr, err);
        assert.ok(err <= TOL_PX, `anchor drift ${err}px yaw=${yaw} elev=${elevation} vp=${vp.width}x${vp.height} px=${fx},${fy} dir=${dir} tick=${i}`);
        assert.ok(inEnvelope(cam), `target left envelope: (${cam.x}, ${cam.z})`);
        // monotone zoom in the requested direction; smooth clamp never reverses
        assert.ok(dir > 1 ? cam.zoom >= prev - 1e-12 : cam.zoom <= prev + 1e-12, `zoom jumped: ${prev} -> ${cam.zoom}`);
        if (Math.abs(cam.zoom - prev) < 1e-12) clampedCases++;
        prev = cam.zoom;
        cases++;
      }
    }
  }
  assert.ok(maxErr <= 1e-9, `expected near-exact anchoring, max ${maxErr}`);
  console.log(`CAM-03 angular zoom matrix: ${cases} ticks, max anchor error ${maxErr.toExponential(3)} CSS px, ${clampedCases} smooth-clamp ticks`);
});

test("CAM-03: dataset stamps equal applied state — zoom output is a normalizeCamera fixed point", () => {
  // world.setView runs normalizeCamera then applyCamera/stampCamera writes this.view.
  // If zoom output is already a fixed point of normalizeCamera, the stamped values
  // are EXACTLY the applied THREE camera state (no silent post-stamp clamp).
  let checked = 0;
  for (const vp of VIEWPORTS) for (const yaw of YAWS) for (const elevation of PITCHES) for (const [fx, fy] of PIXELS) {
    const pixel = { x: vp.width * fx, y: vp.height * fy };
    let cam = { x: 3, z: -7, yaw, elevation, zoom: 1.37 };
    for (const req of [12, 0.2, 1.37, 6, 0.5]) {
      cam = zoomAtPixel(cam, req, pixel, vp);
      const re = normalizeCamera(cam);
      for (const key of ["yaw", "elevation", "zoom", "x", "z"]) {
        assert.ok(Math.abs(cam[key] - re[key]) < 1e-12, `stamp mismatch ${key}: ${cam[key]} vs ${re[key]}`);
      }
      checked++;
    }
  }
  console.log(`CAM-03 stamp==applied fixed-point: ${checked} zoom states verified`);
});

test("CAM-03: smooth no-jump clamp at the pan envelope — monotone zoom, bounded target motion, zero slip", () => {
  const vp = { width: 1440, height: 900 };
  const pose = { x: 0, z: 0, yaw: 115, elevation: 20, zoom: 1 };
  const corner = { x: vp.width * .98, y: vp.height * .98 };
  const anchor = groundAtScreen(pose, corner, vp);
  let cam = pose, prevZoom = pose.zoom, prevTarget = { x: 0, z: 0 }, maxStep = 0, maxErr = 0;
  const zooms = [];
  for (let i = 0; i < 20; i++) {
    cam = zoomAtPixel(cam, cam.zoom / 1.55, corner, vp);
    zooms.push(cam.zoom);
    assert.ok(cam.zoom <= prevZoom + 1e-12, "zoom-out must be monotone");
    maxErr = Math.max(maxErr, errorCssPx(cam, anchor, corner, vp));
    maxStep = Math.max(maxStep, Math.hypot(cam.x - prevTarget.x, cam.z - prevTarget.z));
    prevZoom = cam.zoom; prevTarget = { x: cam.x, z: cam.z };
  }
  assert.ok(maxErr <= 1e-9, `clamped sweep slip ${maxErr}`);
  // Once clamped, zoom and target stop moving entirely (no oscillation/jump).
  const tail = zooms.slice(-10);
  assert.ok(tail.every(z => Math.abs(z - tail[0]) < 1e-12), "clamp converges to a steady zoom");
  assert.ok(maxStep < 90, `no target teleport; largest single-tick target step ${maxStep.toFixed(4)} world units`);
  // Zooming back IN from the clamped state resumes smoothly and re-anchors.
  // NOTE: at yaw115/elev20 the corner ground anchor itself lies OUTSIDE the +/-90
  // envelope, so zoom-in legitimately clamps below maxZoom (anchor is sacred; the
  // target can never reach an out-of-envelope anchor). The contract is monotone,
  // jump-free, anchor-exact convergence — NOT necessarily reaching 12 here.
  let back = cam; const backZooms = [];
  for (let i = 0; i < 20; i++) {
    const before = back.zoom;
    back = zoomAtPixel(back, back.zoom * 1.55, corner, vp);
    assert.ok(back.zoom >= before - 1e-12, "zoom-in monotone");
    assert.ok(errorCssPx(back, anchor, corner, vp) <= 1e-9, "zoom-in re-anchors");
    backZooms.push(back.zoom);
  }
  assert.ok(back.zoom > tail[0], "zoom-in resumes upward from the clamp");
  const backTail = backZooms.slice(-10);
  assert.ok(backTail.every(z => Math.abs(z - backTail[0]) < 1e-12), "zoom-in converges to a steady clamp (no jump)");
  console.log(`CAM-03 smooth clamp: steady zoom-out ${tail[0].toFixed(6)}, max slip ${maxErr.toExponential(3)}px, max target step ${maxStep.toFixed(4)}wu, zoom-in converges to ${backTail[0].toFixed(6)}`);
});

test("CAM-03: pinch ZOOM component (transformGesture) clamps smoothly at the envelope with zero centroid slip", () => {
  const vp = { width: 390, height: 844 };
  const centroid = { x: vp.width * .92, y: vp.height * .9 };
  let cam = { x: 0, z: 0, yaw: 45, elevation: 35.264, zoom: 1 };
  const anchor = groundAtScreen(cam, centroid, vp);
  let maxErr = 0, prevZoom = cam.zoom;
  // Aggressive pinch-out (zoom down) far past the envelope. deltaYaw=0 isolates the
  // CAM-03 ZOOM component; a twist that ALONE exceeds the envelope is the documented
  // CAM-01 pan boundary (pan clamps at +/-90), not a zoom-anchor defect.
  for (let i = 0; i < 16; i++) {
    cam = transformGesture(cam, anchor, centroid, vp, 0.6, 0);
    maxErr = Math.max(maxErr, errorCssPx(cam, anchor, centroid, vp));
    assert.ok(inEnvelope(cam), `pinch target left envelope (${cam.x}, ${cam.z})`);
    assert.ok(cam.zoom <= prevZoom + 1e-12, "pinch zoom monotone");
    prevZoom = cam.zoom;
  }
  assert.ok(maxErr <= 1e-9, `pinch centroid slip ${maxErr}px`);
  assert.ok(cam.zoom >= CAMERA_LIMITS.minZoom, "pinch respects minZoom");
  // A modest twist that stays INSIDE the envelope is also anchor-exact (zoom+twist).
  let twistCam = { x: 0, z: 0, yaw: 45, elevation: 35.264, zoom: 2 };
  const mid = { x: vp.width * .5, y: vp.height * .5 };
  const twistAnchor = groundAtScreen(twistCam, mid, vp);
  let twistErr = 0;
  for (let i = 0; i < 8; i++) {
    twistCam = transformGesture(twistCam, twistAnchor, mid, vp, 0.9, 2);
    twistErr = Math.max(twistErr, errorCssPx(twistCam, twistAnchor, mid, vp));
  }
  assert.ok(twistErr <= 1e-9, `in-envelope twist+pinch slip ${twistErr}px`);
  console.log(`CAM-03 pinch zoom clamp: 16 steps, max centroid error ${maxErr.toExponential(3)} CSS px, final zoom ${cam.zoom.toFixed(6)}; in-envelope twist+pinch ${twistErr.toExponential(3)}px`);
});

test("CAM-03 NEGATIVE: zoom-only (no anchor pin) drifts by an exact known amount; approved zoom is zero", () => {
  const vp = { width: 1440, height: 900 };
  const pose = { x: 0, z: 0, yaw: 45, elevation: 35.264, zoom: 1 };
  const cursor = { x: 1140, y: 450 };
  const anchor = groundAtScreen(pose, cursor, vp);
  const legacyErr = errorCssPx(legacyZoomOnly(pose, 1.55), anchor, cursor, vp);
  assert.ok(Math.abs(legacyErr - 231) < 1e-6, `zoom-only drift expected exactly 231px, actual ${legacyErr}`);
  assert.ok(legacyErr > TOL_PX, "negative control MUST fail the 1px contract");
  const approvedErr = errorCssPx(zoomAtPixel(pose, 1.55, cursor, vp), anchor, cursor, vp);
  assert.ok(approvedErr <= 1e-9, `approved zoom drift ${approvedErr}px`);
  console.log(`CAM-03 negative zoom-only: legacy ${legacyErr.toFixed(6)}px (expected 231, > ${TOL_PX}); approved ${approvedErr.toExponential(3)}px`);
});

test("CAM-03 NEGATIVE: pre-fix pin-then-clamp corner zoom-out slips 520.892780px; approved smooth clamp is zero", () => {
  const vp = { width: 1440, height: 900 };
  const pose = { x: 0, z: 0, yaw: 115, elevation: 20, zoom: 1 };
  const corner = { x: vp.width * .98, y: vp.height * .98 };
  const anchor = groundAtScreen(pose, corner, vp);
  const legacy = legacyPinClamp(pose, .2, corner, vp);
  const legacyErr = errorCssPx(legacy, anchor, corner, vp);
  assert.ok(Math.abs(legacyErr - 520.8927797489522) < 1e-6, `pre-fix boundary slip expected 520.892780px, actual ${legacyErr}`);
  assert.ok(legacyErr > TOL_PX);
  const approved = zoomAtPixel(pose, .2, corner, vp);
  const approvedErr = errorCssPx(approved, anchor, corner, vp);
  assert.ok(approvedErr <= 1e-9, `approved boundary slip ${approvedErr}px`);
  assert.ok(approved.zoom > CAMERA_LIMITS.minZoom, "approved clamps zoom above min instead of teleporting target");
  console.log(`CAM-03 negative boundary: pre-fix ${legacyErr.toFixed(6)}px; approved ${approvedErr.toExponential(3)}px at zoom ${approved.zoom.toFixed(6)}`);
});

test("CAM-03: fixed-seed 339 random zoom requests preserve the anchor and envelope across the full range", () => {
  const rand = mulberry32(339);
  let cases = 0, maxErr = 0;
  for (let i = 0; i < 600; i++) {
    const vp = VIEWPORTS[Math.floor(rand() * 3)];
    const cam0 = normalizeCamera({
      x: (rand() - .5) * 160, z: (rand() - .5) * 160,
      yaw: rand() * 360, elevation: 20 + rand() * 60,
      zoom: CAMERA_LIMITS.minZoom + rand() * (CAMERA_LIMITS.maxZoom - CAMERA_LIMITS.minZoom)
    });
    const pixel = { x: vp.width * (.02 + .96 * rand()), y: vp.height * (.02 + .96 * rand()) };
    const anchor = groundAtScreen(cam0, pixel, vp);
    const requested = CAMERA_LIMITS.minZoom + rand() * (CAMERA_LIMITS.maxZoom - CAMERA_LIMITS.minZoom);
    const cam = zoomAtPixel(cam0, requested, pixel, vp);
    const err = errorCssPx(cam, anchor, pixel, vp);
    maxErr = Math.max(maxErr, err);
    assert.ok(err <= TOL_PX, `seeded zoom drift ${err}px case ${i}`);
    assert.ok(inEnvelope(cam), `seeded target outside envelope case ${i}`);
    const re = normalizeCamera(cam);
    assert.ok(Math.abs(cam.zoom - re.zoom) < 1e-12 && Math.abs(cam.x - re.x) < 1e-12 && Math.abs(cam.z - re.z) < 1e-12, "stamp fixed point");
    cases++;
  }
  assert.ok(maxErr <= 1e-9, `seeded max error ${maxErr}`);
  console.log(`CAM-03 seeded(339) zoom: ${cases} cases, max anchor error ${maxErr.toExponential(3)} CSS px`);
});
