/**
 * CAM-08 (#344): pointer ownership across mouse, stylus, touch and lost capture.
 *
 * These tests drive the REAL src/cameraInput.js controller through a fake canvas
 * and synthetic PointerEvents, against a fake world that implements the PUBLIC
 * world API (setView / applyCamera / screenToCell) with the SAME orthographic
 * ground projection the renderer uses (groundAtScreen + CELL/WORLD_SIZE floor,
 * cross-checked against the live THREE raycaster by CAM-01). They assert exact
 * expected/actual camera state, tap counts and capture ownership.
 *
 * Deterministic NEGATIVE cases (ghost drag after out-of-window release, stuck
 * track after lostpointercapture, purchase after touch cancellation) FAIL against
 * the pre-fix controller and PASS against the CAM-08 fix. The pre-fix failure is
 * recorded in docs/evidence/344-cam-08/report.json (negativeControl).
 *
 * Rendered-world behavior is proven separately by scripts/capture-cam08.mjs on a
 * production build; a pure-math pass alone is NOT acceptance (issue #344).
 */
import test from "node:test";
import assert from "node:assert/strict";
import {createCameraInput} from "../src/cameraInput.js";
import {CAMERA_LIMITS, normalizeCamera, groundAtScreen} from "../src/camera.js";
import {CELL, WORLD_SIZE} from "../src/content.js";

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
const HOME = {x: 0, z: 0, yaw: 45, elevation: 35.264, zoom: 1.15};

/** Fake canvas + world harness. Models active pointers, capture ownership and
 *  synchronous lostpointercapture on release (worst-case re-entrancy). */
function harness({width = 1440, height = 900, left = 0, top = 0, camera = {...HOME}} = {}) {
  const vp = {width, height};
  const listeners = new Map();
  const captured = new Set();
  const active = new Set();
  const calls = {tap: [], hover: [], setView: 0, applyCamera: 0};
  const notFound = id => Object.assign(new Error("NotFoundError " + id), {name: "NotFoundError"});
  const canvas = {
    dataset: {},
    getBoundingClientRect: () => ({width, height, left, top, right: left + width, bottom: top + height}),
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {listeners.get(type)?.delete(fn);},
    setPointerCapture(id) {if (!active.has(id)) throw notFound(id); captured.add(id);},
    hasPointerCapture(id) {return captured.has(id);},
    releasePointerCapture(id) {
      if (!captured.has(id)) throw notFound(id);
      captured.delete(id);
      dispatch("lostpointercapture", {pointerId: id});
    },
    listenerCount(type) {return listeners.get(type)?.size || 0;}
  };
  function dispatch(type, props = {}) {
    const e = {
      pointerId: 1, pointerType: "mouse", button: 0, buttons: 0,
      clientX: 0, clientY: 0, shiftKey: false, deltaY: 0, deltaMode: 0,
      defaultPrevented: false, preventDefault() {this.defaultPrevented = true;},
      ...props
    };
    for (const fn of [...(listeners.get(type) || [])]) fn(e);
    return e;
  }
  const world = {
    view: {...camera},
    setView(v) {this.view = normalizeCamera(v); calls.setView++;},
    applyCamera() {
      calls.applyCamera++;
      const d = canvas.dataset, v = this.view;
      d.cameraYaw = String(v.yaw); d.cameraElevation = String(v.elevation);
      d.cameraZoom = String(v.zoom); d.cameraX = String(v.x); d.cameraZ = String(v.z);
    },
    screenToCell(cx, cy) {
      const g = groundAtScreen(this.view, {x: cx - left, y: cy - top}, vp);
      return {x: Math.floor(g.x / CELL + WORLD_SIZE / 2), z: Math.floor(g.z / CELL + WORLD_SIZE / 2), wx: g.x, wz: g.z};
    }
  };
  const cameraRef = {current: {...camera}};
  const controller = createCameraInput({
    canvas, world, cameraRef,
    onTap: (c, e) => calls.tap.push({cell: c, pointerId: e.pointerId, pointerType: e.pointerType}),
    onHover: c => calls.hover.push(c)
  });
  const pose = () => ({...cameraRef.current});
  const cellAt = (x, y) => {
    const g = groundAtScreen(cameraRef.current, {x: x - left, y: y - top}, vp);
    return {x: Math.floor(g.x / CELL + WORLD_SIZE / 2), z: Math.floor(g.z / CELL + WORLD_SIZE / 2)};
  };
  return {
    canvas, world, cameraRef, controller, calls, vp, pose, cellAt, dispatch,
    captured, active, left, top,
    down(id, x, y, o = {}) {active.add(id); return dispatch("pointerdown", {pointerId: id, clientX: x, clientY: y, buttons: 1, button: 0, ...o});},
    downInactive(id, x, y, o = {}) {return dispatch("pointerdown", {pointerId: id, clientX: x, clientY: y, buttons: 1, button: 0, ...o});},
    move(id, x, y, buttons = 1, o = {}) {return dispatch("pointermove", {pointerId: id, clientX: x, clientY: y, buttons, ...o});},
    up(id, x, y, o = {}) {const e = dispatch("pointerup", {pointerId: id, clientX: x, clientY: y, buttons: 0, button: 0, ...o}); active.delete(id); return e;},
    cancel(id, o = {}) {const e = dispatch("pointercancel", {pointerId: id, buttons: 0, ...o}); active.delete(id); if (captured.has(id)) canvas.releasePointerCapture(id); return e;},
    dropCapture(id) {captured.delete(id); return dispatch("lostpointercapture", {pointerId: id});},
    out(id, x, y, o = {}) {return dispatch("pointerout", {pointerId: id, clientX: x, clientY: y, ...o});},
    wheel(x, y, deltaY, deltaMode = 0) {return dispatch("wheel", {clientX: x, clientY: y, deltaY, deltaMode});}
  };
}

// ---------------------------------------------------------------- mouse pan
test("CAM-08: mouse left-drag pan keeps the down-anchor under the pointer (<=1px) and never taps", () => {
  const h = harness();
  const p0 = {x: 600, y: 400}, p1 = {x: 760, y: 520};
  const anchor = groundAtScreen(h.pose(), p0, h.vp);
  h.down(1, p0.x, p0.y, {pointerType: "mouse"});
  assert.equal(h.captured.has(1), true, "mouse down must acquire capture");
  h.move(1, p0.x + 3, p0.y + 2, 1); // below 6px threshold: no pan yet
  assert.deepEqual(h.pose(), HOME, "sub-threshold move must not pan");
  h.move(1, p1.x, p1.y, 1);
  const err = errorCssPx(h.pose(), anchor, p1, h.vp);
  assert.ok(err <= TOL_PX, `pan anchor error ${err}px must be <= ${TOL_PX}`);
  h.up(1, p1.x, p1.y);
  assert.equal(h.calls.tap.length, 0, "a drag must never tap");
  assert.equal(h.captured.has(1), false, "pointerup must release capture");
});

test("CAM-08: mouse tap fires onTap exactly once with the picked cell", () => {
  const h = harness();
  const p = {x: 700, y: 450};
  const expected = h.cellAt(p.x, p.y);
  h.down(1, p.x, p.y);
  h.up(1, p.x, p.y);
  assert.equal(h.calls.tap.length, 1, "tap must fire exactly once");
  assert.deepEqual({x:h.calls.tap[0].cell.x,z:h.calls.tap[0].cell.z}, expected);
  assert.equal(h.captured.size, 0);
});

// ------------------------------------------------------- right / shift orbit
test("CAM-08: right-drag orbits (yaw changes) without tap and releases capture", () => {
  const h = harness();
  h.down(1, 700, 450, {button: 2, buttons: 2});
  h.move(1, 760, 470, 2);
  const after = h.pose();
  assert.notEqual(after.yaw, HOME.yaw, "right-drag must orbit yaw");
  h.up(1, 760, 470, {button: 2, buttons: 0});
  assert.equal(h.calls.tap.length, 0, "right-drag must never tap");
  assert.equal(h.captured.size, 0);
});

test("CAM-08: shift+left-drag orbits without tap", () => {
  const h = harness();
  h.down(1, 700, 450, {shiftKey: true});
  h.move(1, 740, 480, 1, {shiftKey: true});
  assert.notEqual(h.pose().yaw, HOME.yaw);
  h.up(1, 740, 480, {shiftKey: true});
  assert.equal(h.calls.tap.length, 0);
});

// ---------------------------------------------------------------- wheel zoom
test("CAM-08: wheel zoom anchors the ground under the cursor (<=1px), no tap", () => {
  const h = harness();
  const cursor = {x: 1140, y: 450};
  const anchor = groundAtScreen(h.pose(), cursor, h.vp);
  h.wheel(cursor.x, cursor.y, -120);
  const after = h.pose();
  assert.ok(after.zoom > HOME.zoom, "wheel up must zoom in");
  const err = errorCssPx(after, anchor, cursor, h.vp);
  assert.ok(err <= TOL_PX, `wheel anchor error ${err}px`);
  assert.equal(h.calls.tap.length, 0);
});

// -------------------------------------------------------------------- stylus
test("CAM-08: stylus (pen) contact drag pans anchor-exact; pen hover never pans", () => {
  const h = harness();
  const p0 = {x: 500, y: 350}, p1 = {x: 640, y: 430};
  const anchor = groundAtScreen(h.pose(), p0, h.vp);
  h.down(2, p0.x, p0.y, {pointerType: "pen"});
  h.move(2, p1.x, p1.y, 1, {pointerType: "pen"});
  assert.ok(errorCssPx(h.pose(), anchor, p1, h.vp) <= TOL_PX);
  h.up(2, p1.x, p1.y, {pointerType: "pen"});
  assert.equal(h.calls.tap.length, 0);
  const settled = h.pose();
  // Pen hovering (buttons 0, no track) must only hover, never move the camera.
  h.move(2, 900, 600, 0, {pointerType: "pen"});
  assert.deepEqual(h.pose(), settled, "pen hover must not pan");
});

test("CAM-08: stylus tap fires once; pen barrel (button 2) never taps", () => {
  const h = harness();
  h.down(3, 700, 450, {pointerType: "pen"});
  h.up(3, 700, 450, {pointerType: "pen"});
  assert.equal(h.calls.tap.length, 1);
  h.down(3, 720, 460, {pointerType: "pen", button: 2, buttons: 2});
  h.up(3, 720, 460, {pointerType: "pen", button: 2, buttons: 0});
  assert.equal(h.calls.tap.length, 1, "barrel-button pen must not add a tap");
});

// --------------------------------------------------------------------- touch
test("CAM-08: single touch drag pans anchor-exact and never taps", () => {
  const h = harness({width: 390, height: 844, camera: {...HOME, zoom: 1}});
  const p0 = {x: 180, y: 400}, p1 = {x: 240, y: 500};
  const anchor = groundAtScreen(h.pose(), p0, h.vp);
  h.down(11, p0.x, p0.y, {pointerType: "touch"});
  h.move(11, p1.x, p1.y, 1, {pointerType: "touch"});
  assert.ok(errorCssPx(h.pose(), anchor, p1, h.vp) <= TOL_PX);
  h.up(11, p1.x, p1.y, {pointerType: "touch"});
  assert.equal(h.calls.tap.length, 0);
  assert.equal(h.captured.size, 0);
});

test("CAM-08: single touch tap fires exactly once", () => {
  const h = harness({width: 390, height: 844, camera: {...HOME, zoom: 1}});
  const expected = h.cellAt(200, 420);
  h.down(12, 200, 420, {pointerType: "touch"});
  h.up(12, 200, 420, {pointerType: "touch"});
  assert.equal(h.calls.tap.length, 1);
  assert.deepEqual({x:h.calls.tap[0].cell.x,z:h.calls.tap[0].cell.z}, expected);
});

test("CAM-08: two-finger pinch+twist keeps centroid anchored; lift rebases without target jump", () => {
  const h = harness({width: 390, height: 844, camera: {...HOME, zoom: 1}});
  const c = {x: 240, y: 460};
  const anchor = groundAtScreen(h.pose(), c, h.vp);
  h.down(21, c.x - 70, c.y, {pointerType: "touch"});
  h.down(22, c.x + 70, c.y, {pointerType: "touch"});
  // symmetric pinch out (fingers apart -> zoom in), centroid fixed
  for (let half = 70; half <= 130; half += 20) {
    h.move(21, c.x - half, c.y, 1, {pointerType: "touch"});
    h.move(22, c.x + half, c.y, 1, {pointerType: "touch"});
    assert.ok(errorCssPx(h.pose(), anchor, c, h.vp) <= TOL_PX, "pinch centroid must stay anchored");
  }
  assert.ok(h.pose().zoom > 1, "pinch out must zoom in");
  const beforeLift = h.pose();
  h.up(21, c.x - 130, c.y, {pointerType: "touch"}); // lift one finger
  assert.deepEqual(h.pose(), beforeLift, "finger lift itself must not jump the target");
  assert.equal(h.calls.tap.length, 0, "multi-touch lift must never purchase");
  // Remaining finger continues: its CURRENT ground stays under it (rebased anchor).
  const remainPixel = {x: c.x + 130, y: c.y};
  const remainAnchor = groundAtScreen(h.pose(), remainPixel, h.vp);
  const next = {x: c.x + 150, y: c.y + 30};
  h.move(22, next.x, next.y, 1, {pointerType: "touch"});
  assert.ok(errorCssPx(h.pose(), remainAnchor, next, h.vp) <= TOL_PX, "rebased single-finger pan must anchor");
  h.up(22, next.x, next.y, {pointerType: "touch"});
  assert.equal(h.calls.tap.length, 0, "gesture survivor must never tap");
});

test("CAM-08: one finger's motion does not suppress a stationary second finger's own tap semantics", () => {
  // Per-pointer moved/gestured: a real transform marks BOTH participants, so
  // neither taps; but the shared pre-fix boolean is gone (verified by the
  // transform test above). Here: two fingers down, NO transform, lift one then
  // the other -> the never-moved survivor may tap (per-pointer ownership).
  const h = harness({width: 390, height: 844, camera: {...HOME, zoom: 1}});
  h.down(31, 150, 400, {pointerType: "touch"});
  h.down(32, 250, 400, {pointerType: "touch"});
  h.up(31, 150, 400, {pointerType: "touch"}); // multi lift -> no tap
  assert.equal(h.calls.tap.length, 0);
  h.up(32, 250, 400, {pointerType: "touch"}); // single, never moved/gestured
  assert.equal(h.calls.tap.length, 1, "stationary survivor owns its own tap");
});

// ------------------------------------------- NEGATIVE: ghost drag / stuck state
test("CAM-08 NEGATIVE (fails pre-fix): hover after out-of-window release must NOT ghost-drag", () => {
  const h = harness();
  const p0 = {x: 600, y: 400}, p1 = {x: 760, y: 520};
  h.down(1, p0.x, p0.y);
  h.move(1, p1.x, p1.y, 1); // real drag -> camera pans, track.moved
  const draggedPose = h.pose();
  assert.notDeepEqual(draggedPose, HOME, "drag must have moved the camera");
  // Button released OUTSIDE the window: no pointerup reaches the canvas. The
  // pointer later hovers back over the canvas with buttons===0.
  h.move(1, 900, 650, 0);
  // FIXED: buttons===0 purges the stale track BEFORE panning -> camera unchanged.
  // PRE-FIX: stale track + dragged=true pans to (900,650) -> GHOST DRAG.
  assert.deepEqual(h.pose(), draggedPose,
    "hover with no button held must not move the camera (ghost drag)");
  assert.equal(h.calls.tap.length, 0);
});

test("CAM-08 NEGATIVE (fails pre-fix): lostpointercapture mid-drag purges the stuck track", () => {
  const h = harness();
  h.down(1, 600, 400);
  h.move(1, 700, 480, 1);
  const draggedPose = h.pose();
  h.dropCapture(1); // browser/OS drops capture; no up/cancel delivered
  assert.equal(h.captured.has(1), false);
  // A subsequent hover must not pan from the dead anchor.
  h.move(1, 1000, 700, 0);
  assert.deepEqual(h.pose(), draggedPose,
    "after lostpointercapture a hover must not ghost-drag (stuck pressed state)");
  // A fresh press still works and re-acquires capture.
  h.down(1, 600, 400);
  assert.equal(h.captured.has(1), true);
  h.up(1, 600, 400);
  assert.equal(h.calls.tap.length, 1, "fresh tap after recovery works exactly once");
});

test("CAM-08 NEGATIVE (fails pre-fix): no purchase after touch cancellation, even with a late pointerup", () => {
  const h = harness({width: 390, height: 844, camera: {...HOME, zoom: 1}});
  h.down(41, 200, 420, {pointerType: "touch"});
  h.move(41, 260, 500, 1, {pointerType: "touch"}); // drag
  h.cancel(41, {pointerType: "touch"}); // browser cancels (scroll takeover)
  h.up(41, 260, 500, {pointerType: "touch"}); // late up arrives after cancel
  assert.equal(h.calls.tap.length, 0, "cancelled touch must never purchase");
  assert.equal(h.captured.size, 0, "cancel must release capture");
  // Cancel of a stationary touch + late up also must not tap.
  h.down(42, 180, 400, {pointerType: "touch"});
  h.cancel(42, {pointerType: "touch"});
  h.up(42, 180, 400, {pointerType: "touch"});
  assert.equal(h.calls.tap.length, 0);
});

test("CAM-08: cancel of one finger in a pinch rebases survivor and blocks its purchase", () => {
  const h = harness({width: 390, height: 844, camera: {...HOME, zoom: 1}});
  h.down(51, 170, 460, {pointerType: "touch"});
  h.down(52, 310, 460, {pointerType: "touch"});
  h.move(51, 150, 460, 1, {pointerType: "touch"});
  h.move(52, 330, 460, 1, {pointerType: "touch"});
  const before = h.pose();
  h.cancel(51, {pointerType: "touch"});
  assert.deepEqual(h.pose(), before, "cancel itself must not jump the target");
  const remainAnchor = groundAtScreen(h.pose(), {x: 330, y: 460}, h.vp);
  h.move(52, 350, 490, 1, {pointerType: "touch"});
  assert.ok(errorCssPx(h.pose(), remainAnchor, {x: 350, y: 490}, h.vp) <= TOL_PX);
  h.up(52, 350, 490, {pointerType: "touch"});
  assert.equal(h.calls.tap.length, 0, "survivor of a cancelled pinch must not purchase");
});

// ------------------------------------------- out-of-window release WITH capture
test("CAM-08: captured drag released outside the canvas pans anchor-exact, no tap, capture freed", () => {
  const h = harness();
  const p0 = {x: 600, y: 400};
  const anchor = groundAtScreen(h.pose(), p0, h.vp);
  h.down(1, p0.x, p0.y);
  const outside = {x: 1500, y: 500}; // just beyond the 1440px right edge, inside the +/-90 pan envelope
  h.move(1, outside.x, outside.y, 1); // capture retargets the move to the canvas
  assert.ok(errorCssPx(h.pose(), anchor, outside, h.vp) <= TOL_PX,
    "captured out-of-canvas drag must still anchor exactly");
  h.up(1, outside.x, outside.y);
  assert.equal(h.calls.tap.length, 0, "out-of-window release of a drag must not tap");
  assert.equal(h.captured.size, 0, "capture must be released on up");
  const settled = h.pose();
  h.move(1, 700, 450, 0); // hover back: no stale track
  assert.deepEqual(h.pose(), settled);
});

test("CAM-08: pointerout without capture purges the stale track (no ghost drag)", () => {
  const h = harness();
  // Capture unavailable for this press (inactive pointerId path).
  h.downInactive(1, 600, 400);
  assert.equal(h.captured.has(1), false, "capture must not be held");
  h.move(1, 700, 480, 1);
  const draggedPose = h.pose();
  h.out(1, 1700, 1000); // leaves canvas, no capture -> purge
  h.move(1, 900, 650, 0); // hover back
  assert.deepEqual(h.pose(), draggedPose, "purged track must not ghost-drag");
});

test("CAM-08: pointerout WHILE captured does not purge a legitimate drag", () => {
  const h = harness();
  const p0 = {x: 600, y: 400};
  const anchor = groundAtScreen(h.pose(), p0, h.vp);
  h.down(1, p0.x, p0.y);
  h.out(1, 1500, 500); // boundary event while captured: must NOT purge
  assert.equal(h.captured.has(1), true);
  h.move(1, 1500, 500, 1);
  assert.ok(errorCssPx(h.pose(), anchor, {x: 1500, y: 500}, h.vp) <= TOL_PX);
  h.up(1, 1500, 500);
  assert.equal(h.calls.tap.length, 0);
});

// ------------------------------------------- guarded setPointerCapture
test("CAM-08: setPointerCapture NotFoundError is swallowed; bookkeeping still completes", () => {
  const h = harness();
  // downInactive does not mark the pointer active -> setPointerCapture throws.
  assert.doesNotThrow(() => h.downInactive(7, 600, 400));
  const p0 = {x: 600, y: 400}, p1 = {x: 720, y: 500};
  const anchor = groundAtScreen(h.pose(), p0, h.vp);
  h.move(7, p1.x, p1.y, 1);
  assert.ok(errorCssPx(h.pose(), anchor, p1, h.vp) <= TOL_PX,
    "gesture must work even when capture could not be acquired");
  h.up(7, p1.x, p1.y);
  assert.equal(h.calls.tap.length, 0);
});

// -------------------------------------------------------------------- dispose
test("CAM-08: dispose removes EVERY listener, releases capture, and inertly ignores later events", () => {
  const h = harness();
  h.down(1, 600, 400);
  h.move(1, 700, 480, 1);
  const types = ["pointerdown", "pointermove", "pointerup", "pointercancel",
    "lostpointercapture", "pointerout", "wheel", "contextmenu"];
  for (const t of types) assert.equal(h.canvas.listenerCount(t), 1, `${t} must be registered once`);
  h.controller.dispose();
  for (const t of types) assert.equal(h.canvas.listenerCount(t), 0, `${t} must be removed by dispose`);
  assert.equal(h.captured.size, 0, "dispose must release held capture");
  const settled = h.pose(), taps = h.calls.tap.length, hovers = h.calls.hover.length;
  // Every event type after dispose must be inert (no camera move, tap or hover).
  h.down(1, 600, 400); h.move(1, 800, 600, 1); h.up(1, 800, 600);
  h.cancel(1); h.dropCapture(1); h.out(1, 900, 700); h.wheel(700, 450, -120);
  h.dispatch("contextmenu", {});
  assert.deepEqual(h.pose(), settled, "dispose must stop camera updates");
  assert.equal(h.calls.tap.length, taps, "dispose must stop taps");
  assert.equal(h.calls.hover.length, hovers, "dispose must stop hovers");
});

test("CAM-08: dispose is idempotent and safe with no active pointers", () => {
  const h = harness();
  assert.doesNotThrow(() => {h.controller.dispose(); h.controller.dispose();});
  for (const t of ["pointerdown", "pointermove", "pointerup", "pointercancel",
    "lostpointercapture", "pointerout", "wheel", "contextmenu"])
    assert.equal(h.canvas.listenerCount(t), 0);
});

// ------------------------------------------------- context menu / wheel guard
test("CAM-08: contextmenu is prevented; wheel deltaMode lines/pages convert exactly", () => {
  const h = harness();
  const e = h.dispatch("contextmenu", {});
  assert.equal(e.defaultPrevented, true);
  const cursor = {x: 720, y: 450};
  const anchor = groundAtScreen(h.pose(), cursor, h.vp);
  h.wheel(cursor.x, cursor.y, -3, 1); // 3 lines * 16 = 48px
  assert.ok(errorCssPx(h.pose(), anchor, cursor, h.vp) <= TOL_PX);
  const z1 = h.pose().zoom;
  h.wheel(cursor.x, cursor.y, -1, 2); // 1 page * height
  assert.ok(h.pose().zoom > z1, "page-mode wheel must zoom");
});
