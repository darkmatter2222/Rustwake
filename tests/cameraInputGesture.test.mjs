/**
 * CAM-02 (#338): one interaction state machine — click vs pan/orbit/pinch/chord.
 *
 * Drives the REAL src/cameraInput.js controller through a fake canvas + synthetic
 * PointerEvents against a fake world implementing the PUBLIC world API
 * (setView / applyCamera / screenToCell) with the SAME orthographic ground
 * projection the renderer uses. Asserts exact tap counts, the COMMIT CELL, camera
 * pose and the read-only state() snapshot.
 *
 * Contract (issue #338 acceptance): simulated pointercancel, right-drag,
 * two-finger turn and the 5px (mouse/pen) / 10px (touch) thresholds NEVER spend
 * materials (emit a tap); an intentional click commits EXACTLY ONCE at the cell
 * picked at pointer-down and selection stays correct.
 *
 * Deterministic NEGATIVE cases (middle/back click, shift stationary press, button
 * chord during orbit, sub-threshold jitter across a cell boundary, camera command
 * during a stationary press) FAIL against the pre-fix controller and PASS against
 * the CAM-02 fix. Rendered-world behavior is proven separately by
 * scripts/capture-cam02.mjs on a production build; pure-math alone is NOT acceptance.
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
const PHONE = {width: 390, height: 844, camera: {...HOME, zoom: 1}};

function harness({width = 1440, height = 900, left = 0, top = 0, camera = {...HOME}} = {}) {
  const vp = {width, height};
  const listeners = new Map();
  const captured = new Set();
  const active = new Set();
  const calls = {tap: [], hover: []};
  const notFound = id => Object.assign(new Error("NotFoundError " + id), {name: "NotFoundError"});
  const canvas = {
    dataset: {},
    getBoundingClientRect: () => ({width, height, left, top, right: left + width, bottom: top + height}),
    addEventListener(type, fn) {if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn);},
    removeEventListener(type, fn) {listeners.get(type)?.delete(fn);},
    setPointerCapture(id) {if (!active.has(id)) throw notFound(id); captured.add(id);},
    hasPointerCapture(id) {return captured.has(id);},
    releasePointerCapture(id) {if (!captured.has(id)) throw notFound(id); captured.delete(id); dispatch("lostpointercapture", {pointerId: id});},
    listenerCount(type) {return listeners.get(type)?.size || 0;}
  };
  function dispatch(type, props = {}) {
    const e = {pointerId: 1, pointerType: "mouse", button: 0, buttons: 0, clientX: 0, clientY: 0,
      shiftKey: false, deltaY: 0, deltaMode: 0, defaultPrevented: false,
      preventDefault() {this.defaultPrevented = true;}, ...props};
    for (const fn of [...(listeners.get(type) || [])]) fn(e);
    return e;
  }
  const world = {
    view: {...camera},
    setView(v) {this.view = normalizeCamera(v);},
    applyCamera() {
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
    onTap: (c, e) => calls.tap.push({cell: {x: c.x, z: c.z}, pointerId: e.pointerId, pointerType: e.pointerType}),
    onHover: c => calls.hover.push(c)
  });
  const pose = () => ({...cameraRef.current});
  const cellAt = (x, y) => {
    const g = groundAtScreen(cameraRef.current, {x: x - left, y: y - top}, vp);
    return {x: Math.floor(g.x / CELL + WORLD_SIZE / 2), z: Math.floor(g.z / CELL + WORLD_SIZE / 2)};
  };
  return {
    canvas, world, cameraRef, controller, calls, vp, pose, cellAt, dispatch, captured, active, left, top,
    // Tolerant introspection: the pre-fix controller has no state(); behavioral
    // assertions (tap counts/cells/pose) are always asserted FIRST so a pre-fix
    // run fails on real mis-commits, not on the absence of this read-only API.
    state: () => (typeof controller.state === "function" ? controller.state() : {mode: "no-state-api", pointers: []}),
    down(id, x, y, o = {}) {active.add(id); return dispatch("pointerdown", {pointerId: id, clientX: x, clientY: y, buttons: 1, button: 0, ...o});},
    // chord: another button on an ALREADY-active pointer id (no new active entry)
    chordDown(id, x, y, o = {}) {return dispatch("pointerdown", {pointerId: id, clientX: x, clientY: y, buttons: 3, button: 0, ...o});},
    move(id, x, y, buttons = 1, o = {}) {return dispatch("pointermove", {pointerId: id, clientX: x, clientY: y, buttons, ...o});},
    up(id, x, y, o = {}) {const e = dispatch("pointerup", {pointerId: id, clientX: x, clientY: y, buttons: 0, button: 0, ...o}); active.delete(id); return e;},
    cancel(id, o = {}) {const e = dispatch("pointercancel", {pointerId: id, buttons: 0, ...o}); active.delete(id); if (captured.has(id)) canvas.releasePointerCapture(id); return e;},
    wheel(x, y, deltaY, deltaMode = 0) {return dispatch("wheel", {clientX: x, clientY: y, deltaY, deltaMode});}
  };
}
const tapCells = h => h.calls.tap.map(t => t.cell);
// Deterministic pixel where a +4px x-jitter crosses a cell edge (sub-threshold
// for mouse): pre-fix committed the RELEASE cell here, the fix the DOWN cell.
function jitterCrossing(h, y = 450) {
  for (let x = 200; x < h.vp.width - 10; x++) {
    const a = h.cellAt(x, y), b = h.cellAt(x + 4, y);
    if (a.x !== b.x || a.z !== b.z) return {p0: {x, y}, cellA: a, cellB: b};
  }
  throw new Error("no 4px cell-boundary crossing found");
}

// ---------------------------------------------------- 5px / 10px thresholds
test("CAM-02: mouse drag at exactly the 5px threshold pans and NEVER taps", () => {
  const h = harness();
  const p0 = {x: 600, y: 400};
  const anchor = groundAtScreen(h.pose(), p0, h.vp);
  h.down(1, p0.x, p0.y);
  h.move(1, p0.x + 5, p0.y, 1); // hypot == 5 == slop -> drag latch
  const mid = h.state();
  const err = errorCssPx(h.pose(), anchor, {x: p0.x + 5, y: p0.y}, h.vp);
  h.up(1, p0.x + 5, p0.y);
  // behavioral first: pre-fix (uniform >6px slop) treated 5px as a click and SPENT
  assert.equal(h.calls.tap.length, 0, "a 5px mouse drag must never spend");
  assert.ok(err <= TOL_PX, "5px drag must pan anchor-exact");
  assert.equal(mid.pointers[0]?.moved, true, "5px must latch moved");
  assert.equal(mid.pointers[0]?.phase, "pan");
  assert.equal(h.state().mode, "idle");
});

test("CAM-02: mouse 4px jitter is still a click — commits exactly once at the DOWN cell", () => {
  const h = harness();
  const {p0, cellA, cellB} = jitterCrossing(h);
  h.down(1, p0.x, p0.y);
  h.move(1, p0.x + 4, p0.y, 1); // hypot 4 < 5 -> click
  const mid = h.state();
  h.up(1, p0.x + 4, p0.y);
  assert.equal(h.calls.tap.length, 1);
  assert.deepEqual(h.pose(), HOME, "sub-threshold jitter must not pan");
  // pre-fix committed screenToCell(release) == cellB; fix commits the DOWN cell
  assert.deepEqual(tapCells(h)[0], cellA, "commit cell must be the DOWN cell");
  assert.notDeepEqual(tapCells(h)[0], cellB);
  assert.equal(mid.pointers[0]?.moved, false);
});

test("CAM-02: touch drag at exactly the 10px threshold pans and NEVER taps", () => {
  const h = harness(PHONE);
  const p0 = {x: 180, y: 400};
  const anchor = groundAtScreen(h.pose(), p0, h.vp);
  h.down(11, p0.x, p0.y, {pointerType: "touch"});
  h.move(11, p0.x + 10, p0.y, 1, {pointerType: "touch"}); // hypot 10 == touch slop
  const mid = h.state();
  const err = errorCssPx(h.pose(), anchor, {x: p0.x + 10, y: p0.y}, h.vp);
  h.up(11, p0.x + 10, p0.y, {pointerType: "touch"});
  assert.equal(h.calls.tap.length, 0, "a 10px touch drag must never spend");
  assert.ok(err <= TOL_PX);
  // 8px touch drag: inside the 10px touch slop -> still a tap. Pre-fix (>6px
  // uniform slop) panned and spent NOTHING here: a real behavioral difference.
  const q0 = {x: 180, y: 600};
  const qCell = h.cellAt(q0.x, q0.y);
  h.down(13, q0.x, q0.y, {pointerType: "touch"});
  h.move(13, q0.x + 8, q0.y, 1, {pointerType: "touch"});
  h.up(13, q0.x + 8, q0.y, {pointerType: "touch"});
  assert.equal(h.calls.tap.length, 1, "8px touch jitter is inside the 10px slop: one tap");
  assert.deepEqual(tapCells(h)[0], qCell);
  assert.equal(mid.pointers[0]?.moved, true);
});

test("CAM-02: touch 9px jitter is still a tap — commits once at the DOWN cell", () => {
  const h = harness(PHONE);
  const p0 = {x: 180, y: 400};
  const expected = h.cellAt(p0.x, p0.y);
  h.down(12, p0.x, p0.y, {pointerType: "touch"});
  h.move(12, p0.x + 9, p0.y, 1, {pointerType: "touch"}); // 9 < 10 -> tap
  const mid = h.state();
  h.up(12, p0.x + 9, p0.y, {pointerType: "touch"});
  // pre-fix (>6px uniform) panned a 9px touch drag and emitted NO tap
  assert.equal(h.calls.tap.length, 1);
  assert.deepEqual(tapCells(h)[0], expected);
  assert.equal(mid.pointers[0]?.moved, false);
});

test("CAM-02 NEGATIVE (fails pre-fix): sub-threshold jitter across a cell boundary commits the DOWN cell, not the release cell", () => {
  const h = harness();
  // Deterministic pixel where a +4px x-jitter (still a click, <5px) crosses a cell edge.
  const {p0, cellA, cellB} = jitterCrossing(h);
  assert.notDeepEqual(cellA, cellB);
  h.down(1, p0.x, p0.y);
  h.move(1, p0.x + 4, p0.y, 1); // click latch stays false; camera unchanged
  h.up(1, p0.x + 4, p0.y);
  assert.equal(h.calls.tap.length, 1);
  // PRE-FIX committed screenToCell(release) == cellB (wrong cell). FIX: cellA.
  assert.deepEqual(tapCells(h)[0], cellA, "commit must be the pressed cell, not the jittered release cell");
  assert.notDeepEqual(tapCells(h)[0], cellB);
});

test("CAM-02: drag out-and-back to the down pixel never re-arms a click (latch)", () => {
  const h = harness();
  const p0 = {x: 600, y: 400};
  h.down(1, p0.x, p0.y);
  h.move(1, p0.x + 120, p0.y + 80, 1); // real pan
  h.move(1, p0.x, p0.y, 1); // return exactly to down pixel
  const mid = h.state();
  h.up(1, p0.x, p0.y);
  assert.equal(h.calls.tap.length, 0, "returning to start must not purchase");
  assert.equal(mid.pointers[0]?.moved, true, "moved latch must survive return-to-start");
});

// ---------------------------------------------------- right / middle / shift
test("CAM-02: right-drag orbits and never taps (even sub-threshold right press)", () => {
  const h = harness();
  h.down(1, 700, 450, {button: 2, buttons: 2});
  h.move(1, 760, 470, 2);
  const mid = h.state();
  h.up(1, 760, 470, {button: 2, buttons: 0});
  assert.equal(h.calls.tap.length, 0, "right-drag must orbit, never spend");
  assert.notEqual(h.pose().yaw, HOME.yaw);
  assert.equal(mid.pointers[0]?.phase, "orbit");
  // stationary right press also never taps
  h.down(1, 700, 450, {button: 2, buttons: 2});
  h.up(1, 700, 450, {button: 2, buttons: 0});
  assert.equal(h.calls.tap.length, 0);
});

test("CAM-02 NEGATIVE (fails pre-fix): middle-button click never commits", () => {
  const h = harness();
  h.down(1, 700, 450, {button: 1, buttons: 4});
  h.up(1, 700, 450, {button: 1, buttons: 0});
  assert.equal(h.calls.tap.length, 0, "middle click must not place a building");
});

test("CAM-02 NEGATIVE (fails pre-fix): back/forward mouse buttons never commit", () => {
  const h = harness();
  for (const button of [3, 4]) {
    h.down(1, 700, 450, {button, buttons: 8});
    h.up(1, 700, 450, {button, buttons: 0});
  }
  assert.equal(h.calls.tap.length, 0);
});

test("CAM-02 NEGATIVE (fails pre-fix): shift+left stationary press is orbit intent, never a click", () => {
  const h = harness();
  h.down(1, 700, 450, {shiftKey: true});
  const mid = h.state();
  h.up(1, 700, 450, {shiftKey: true});
  // pre-fix had no orbit-intent exclusion: a stationary shift press SPENT
  assert.equal(h.calls.tap.length, 0, "shift press must not purchase");
  assert.equal(mid.pointers[0]?.primary, false);
});

test("CAM-02: shift+left micro-drag below slop orbits-armed and never taps", () => {
  const h = harness();
  h.down(1, 700, 450, {shiftKey: true});
  h.move(1, 703, 452, 1, {shiftKey: true}); // < 5px
  h.up(1, 703, 452, {shiftKey: true});
  assert.equal(h.calls.tap.length, 0);
});

test("CAM-02 NEGATIVE (fails pre-fix): orbit+click button chord never lifts into a purchase", () => {
  const h = harness();
  const p0 = {x: 700, y: 450}, p1 = {x: 780, y: 480};
  h.down(1, p0.x, p0.y, {button: 2, buttons: 2}); // right press
  h.move(1, p1.x, p1.y, 2); // orbit drag
  assert.notEqual(h.pose().yaw, HOME.yaw);
  // Left button pressed DURING the right hold: same pointerId chord.
  h.chordDown(1, p1.x, p1.y, {button: 0, buttons: 3});
  const mid = h.state();
  h.up(1, p1.x, p1.y, {button: 0, buttons: 2}); // left released, right still held
  // pre-fix re-armed a fresh track on the chord down and TAPPED on this release
  assert.equal(h.calls.tap.length, 0, "non-final chord release must not tap");
  const mid2 = h.state();
  h.up(1, p1.x, p1.y, {button: 2, buttons: 0}); // final right release
  assert.equal(h.calls.tap.length, 0, "orbit+click chord must never purchase");
  assert.equal(mid.pointers[0]?.phase, "chord");
  assert.equal(mid.pointers[0]?.gestured, true);
  assert.equal(mid2.mode, "single", "contact survives until final release");
  assert.equal(h.state().mode, "idle");
});

test("CAM-02: left-drag then right-click chord then left release never taps", () => {
  const h = harness();
  h.down(1, 600, 400, {button: 0, buttons: 1});
  h.move(1, 720, 500, 1); // pan
  h.chordDown(1, 720, 500, {button: 2, buttons: 3}); // right pressed mid-drag
  h.up(1, 720, 500, {button: 2, buttons: 1}); // right released, left held
  h.up(1, 720, 500, {button: 0, buttons: 0}); // left final release
  assert.equal(h.calls.tap.length, 0);
});

// ---------------------------------------------------- two-finger turn / pinch
test("CAM-02: two-finger turn (twist) never taps for either finger; centroid anchored", () => {
  const h = harness(PHONE);
  const c = {x: 200, y: 420};
  const anchor = groundAtScreen(h.pose(), c, h.vp);
  h.down(21, c.x - 60, c.y, {pointerType: "touch"});
  h.down(22, c.x + 60, c.y, {pointerType: "touch"});
  // rotate the finger pair about the centroid (twist) + slight pinch
  for (let deg = 0; deg <= 40; deg += 10) {
    const r = rad(deg), half = 60 + deg * 0.5;
    const ax = c.x - Math.cos(r) * half, ay = c.y - Math.sin(r) * half;
    const bx = c.x + Math.cos(r) * half, by = c.y + Math.sin(r) * half;
    h.move(21, ax, ay, 1, {pointerType: "touch"});
    h.move(22, bx, by, 1, {pointerType: "touch"});
    assert.ok(errorCssPx(h.pose(), anchor, c, h.vp) <= TOL_PX, "twist centroid must stay anchored");
  }
  const mid = h.state();
  h.up(21, c.x - 80, c.y - 40, {pointerType: "touch"});
  h.up(22, c.x + 80, c.y + 40, {pointerType: "touch"});
  assert.equal(h.calls.tap.length, 0, "two-finger turn must never spend");
  assert.notEqual(h.pose().yaw, HOME.yaw, "twist must orbit yaw");
  assert.equal(mid.mode, "multi");
  assert.ok(mid.pointers.length === 2 && mid.pointers.every(p => p.gestured && p.phase === "multi"));
});

test("CAM-02: one moving finger + one stationary finger, both lift -> no tap", () => {
  const h = harness(PHONE);
  h.down(31, 150, 400, {pointerType: "touch"});
  h.down(32, 250, 400, {pointerType: "touch"});
  h.move(31, 190, 430, 1, {pointerType: "touch"}); // transform marks BOTH gestured
  h.up(31, 190, 430, {pointerType: "touch"});
  h.up(32, 250, 400, {pointerType: "touch"});
  assert.equal(h.calls.tap.length, 0);
});

// ---------------------------------------------------- pointer cancellation
test("CAM-02: pointercancel mid single-finger drag never taps; late up inert", () => {
  const h = harness(PHONE);
  h.down(41, 200, 420, {pointerType: "touch"});
  h.move(41, 260, 500, 1, {pointerType: "touch"});
  h.cancel(41, {pointerType: "touch"});
  const mid = h.state();
  h.up(41, 260, 500, {pointerType: "touch"}); // late up
  assert.equal(h.calls.tap.length, 0, "cancel + late up must never spend");
  assert.equal(h.captured.size, 0);
  assert.equal(mid.mode, "idle");
});

test("CAM-02: pointercancel of a stationary touch never taps", () => {
  const h = harness(PHONE);
  h.down(42, 180, 400, {pointerType: "touch"});
  h.cancel(42, {pointerType: "touch"});
  h.up(42, 180, 400, {pointerType: "touch"});
  assert.equal(h.calls.tap.length, 0);
});

test("CAM-02: cancel of one finger in a pinch rebases survivor and blocks its purchase", () => {
  const h = harness(PHONE);
  h.down(51, 170, 460, {pointerType: "touch"});
  h.down(52, 310, 460, {pointerType: "touch"});
  h.move(51, 150, 460, 1, {pointerType: "touch"});
  h.move(52, 330, 460, 1, {pointerType: "touch"});
  const before = h.pose();
  h.cancel(51, {pointerType: "touch"});
  assert.deepEqual(h.pose(), before, "cancel must not jump the target");
  const remainAnchor = groundAtScreen(h.pose(), {x: 330, y: 460}, h.vp);
  h.move(52, 350, 490, 1, {pointerType: "touch"});
  assert.ok(errorCssPx(h.pose(), remainAnchor, {x: 350, y: 490}, h.vp) <= TOL_PX);
  h.up(52, 350, 490, {pointerType: "touch"});
  assert.equal(h.calls.tap.length, 0);
});

// ------------------------------------ camera command during a stationary press
test("CAM-02 NEGATIVE (fails pre-fix): wheel zoom during a stationary press blocks the release commit", () => {
  const h = harness();
  const p = {x: 700, y: 450};
  h.down(1, p.x, p.y);
  h.wheel(p.x, p.y, -120); // zoom while held
  const mid = h.state();
  h.up(1, p.x, p.y);
  // pre-fix: wheel did not mark the held contact -> release SPENT materials
  assert.equal(h.calls.tap.length, 0, "a zoom during contact is a gesture, not a click");
  assert.ok(h.pose().zoom > HOME.zoom, "wheel must zoom");
  assert.equal(mid.pointers[0]?.gestured, true);
});

test("CAM-02 NEGATIVE (fails pre-fix): Q/E orbit during a stationary press blocks the release commit", () => {
  const h = harness();
  h.down(1, 700, 450);
  h.controller.rotate(24, 0);
  assert.notEqual(h.pose().yaw, HOME.yaw);
  h.up(1, 700, 450);
  assert.equal(h.calls.tap.length, 0);
});

test("CAM-02 NEGATIVE (fails pre-fix): arrow-key pan during a stationary press blocks the release commit", () => {
  const h = harness();
  h.down(1, 700, 450);
  h.controller.keyboardPan(35, 0);
  assert.notEqual(h.pose().x, HOME.x);
  h.up(1, 700, 450);
  assert.equal(h.calls.tap.length, 0);
});

test("CAM-02 NEGATIVE (fails pre-fix): zoom-button command during a stationary press blocks the release commit", () => {
  const h = harness();
  h.down(1, 700, 450);
  h.controller.zoomBy(1.2);
  assert.ok(h.pose().zoom > HOME.zoom);
  h.up(1, 700, 450);
  assert.equal(h.calls.tap.length, 0);
});

// ---------------------------------------------------- intentional click / road
test("CAM-02: intentional clean click commits exactly once; state returns to idle; selection cell correct", () => {
  const h = harness();
  const p = {x: 700, y: 450};
  const expected = h.cellAt(p.x, p.y);
  const before = h.state();
  h.down(1, p.x, p.y);
  const mid = h.state();
  h.up(1, p.x, p.y);
  assert.equal(h.calls.tap.length, 1, "intentional click commits exactly once");
  assert.deepEqual(tapCells(h)[0], expected);
  assert.equal(h.captured.size, 0);
  assert.equal(before.mode, "idle");
  assert.equal(mid.pointers[0]?.phase, "press");
  assert.equal(h.state().mode, "idle");
});

test("CAM-02: road gesture = two clean clicks emit two taps; a drag between them emits none", () => {
  const h = harness();
  const a = {x: 600, y: 400}, b = {x: 760, y: 520};
  const cellA = h.cellAt(a.x, a.y);
  h.down(1, a.x, a.y); h.up(1, a.x, a.y); // origin click
  // a drag toward the destination pans the camera but must NOT arm/commit anything
  h.down(1, a.x, a.y); h.move(1, b.x, b.y, 1); h.up(1, b.x, b.y);
  assert.ok(h.pose().x !== HOME.x || h.pose().z !== HOME.z, "drag panned the camera");
  // destination cell is read in the POST-pan view: commit uses the down cell, not a stale projection
  const cellB = h.cellAt(b.x, b.y);
  h.down(1, b.x, b.y); h.up(1, b.x, b.y); // destination click
  assert.equal(h.calls.tap.length, 2, "exactly the two intentional clicks");
  assert.deepEqual(tapCells(h), [cellA, cellB]);
});

test("CAM-02: state machine phases press->pan, press->orbit, multi, chord, idle", () => {
  const h = harness();
  assert.equal(h.state().mode, "idle");
  h.down(1, 600, 400);
  assert.equal(h.state().pointers[0].phase, "press");
  h.move(1, 700, 480, 1);
  assert.equal(h.state().pointers[0].phase, "pan");
  h.up(1, 700, 480);
  h.down(1, 600, 400, {button: 2, buttons: 2});
  h.move(1, 700, 480, 2);
  assert.equal(h.state().pointers[0].phase, "orbit");
  h.up(1, 700, 480, {button: 2, buttons: 0});
  assert.equal(h.state().mode, "idle");
});
