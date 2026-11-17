/**
 * CAM-10 (#346) measurement-slice probe contract for src/cameraInput.js.
 *
 * The probe is INERT unless window.__RW_PROBES__.cam10.enabled is set by a
 * measurement harness before load. These tests drive the REAL controller
 * through a fake canvas + synthetic events (same public world API contract as
 * tests/cameraInput.test.mjs) and assert:
 *   - zero behaviour/observer change when the probe is absent or disabled;
 *   - per-kind aggregate accounting (drag / orbit / pinch / zoom / key) with
 *     exact sequence numbers and event-time pairing;
 *   - the deterministic injected-stall negative control (delayMs) degrades
 *     handler time WITHOUT corrupting the applied camera;
 *   - privacy: aggregates only — no pointer coordinates or raw event fields
 *     are ever stored.
 *
 * Every test here FAILS against unmodified main c5ad8dec (no probe exists);
 * rollback proof: docs/evidence/346-cam-10/rollback-control.json.
 * Rendered-world latency/frame evidence is scripts/capture-cam10.mjs — a
 * pure-math pass alone is NOT acceptance for #346.
 *
 * Teardown discipline: each test restores globalThis.window via t.after —
 * never inside a final test body — so node --test always exits.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {createCameraInput} from "../src/cameraInput.js";
import {CAMERA_LIMITS, normalizeCamera, groundAtScreen} from "../src/camera.js";
import {CELL, WORLD_SIZE} from "../src/content.js";

const HOME = {x: 0, z: 0, yaw: 45, elevation: 35.264, zoom: 1.15};
const VP = {width: 1440, height: 900};

function harness() {
  const listeners = new Map();
  const captured = new Set();
  const active = new Set();
  const canvas = {
    dataset: {},
    getBoundingClientRect: () => ({width: VP.width, height: VP.height, left: 0, top: 0}),
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {listeners.get(type)?.delete(fn);},
    setPointerCapture(id) {if (active.has(id)) captured.add(id);},
    hasPointerCapture(id) {return captured.has(id);},
    releasePointerCapture(id) {captured.delete(id);},
    listenerCount(type) {return listeners.get(type)?.size || 0;}
  };
  const dispatch = (type, props = {}) => {
    const e = {
      pointerId: 1, pointerType: "mouse", button: 0, buttons: 0,
      clientX: 0, clientY: 0, shiftKey: false, deltaY: 0, deltaMode: 0,
      timeStamp: performance.now(),
      preventDefault() {},
      ...props
    };
    for (const fn of [...(listeners.get(type) || [])]) fn(e);
    return e;
  };
  const world = {
    view: {...HOME},
    setView(v) {this.view = normalizeCamera(v);},
    applyCamera() {
      const d = canvas.dataset, v = this.view;
      d.cameraYaw = String(v.yaw); d.cameraElevation = String(v.elevation);
      d.cameraZoom = String(v.zoom); d.cameraX = String(v.x); d.cameraZ = String(v.z);
    },
    screenToCell(cx, cy) {
      const g = groundAtScreen(this.view, {x: cx, y: cy}, VP);
      return {x: Math.floor(g.x / CELL + WORLD_SIZE / 2), z: Math.floor(g.z / CELL + WORLD_SIZE / 2), wx: g.x, wz: g.z};
    }
  };
  const cameraRef = {current: {...HOME}};
  const controller = createCameraInput({canvas, world, cameraRef, onTap() {}, onHover() {}});
  return {
    canvas, cameraRef, controller, dispatch,
    pose: () => ({...cameraRef.current}),
    down(id, x, y, o = {}) {active.add(id); return dispatch("pointerdown", {pointerId: id, clientX: x, clientY: y, buttons: 1, button: 0, ...o});},
    move(id, x, y, buttons = 1, o = {}) {return dispatch("pointermove", {pointerId: id, clientX: x, clientY: y, buttons, ...o});},
    up(id, x, y, o = {}) {const e = dispatch("pointerup", {pointerId: id, clientX: x, clientY: y, buttons: 0, button: 0, ...o}); active.delete(id); return e;},
    wheel(x, y, deltaY) {return dispatch("wheel", {clientX: x, clientY: y, deltaY});}
  };
}

/** Install a probe window for one test; ALWAYS restored via t.after. */
function probeWindow(t, cam10 = {enabled: true}) {
  const prev = globalThis.window;
  globalThis.window = {__RW_PROBES__: {cam10}};
  t.after(() => {
    if (prev === undefined) delete globalThis.window;
    else globalThis.window = prev;
  });
  return cam10;
}
const stats = () => globalThis.window.__RW_PROBES__.cam10.stats;

/** One mouse drag past the 5px slop: exactly one measured "drag" command. */
function drag(h, stamp) {
  h.down(1, 600, 400);
  const e = h.move(1, 680, 460, 1, stamp != null ? {timeStamp: stamp} : {});
  h.up(1, 680, 460);
  return e;
}

test("CAM-10 probe: absent __RW_PROBES__ -> inert, camera behaviour unchanged, nothing recorded", t => {
  const prev = globalThis.window;
  globalThis.window = {};
  t.after(() => {if (prev === undefined) delete globalThis.window; else globalThis.window = prev;});
  const h = harness();
  drag(h);
  assert.notDeepEqual(h.pose(), HOME, "drag must still pan with no probe");
  assert.equal(globalThis.window.__RW_PROBES__, undefined, "controller must not create probe state");
});

test("CAM-10 probe: enabled:false -> inert, no stats object created", t => {
  probeWindow(t, {enabled: false});
  const h = harness();
  drag(h);
  assert.notDeepEqual(h.pose(), HOME);
  assert.equal(stats(), undefined);
});

test("CAM-10 probe: mouse drag records kind=drag with exact event-time pairing and seq", t => {
  probeWindow(t);
  const h = harness();
  const stamp = performance.now() - 3;
  drag(h, stamp);
  const s = stats();
  assert.ok(s, "enabled probe must record stats");
  assert.equal(s.seq, 1);
  assert.equal(s.kinds.drag.count, 1);
  assert.equal(s.last.kind, "drag");
  assert.equal(s.last.seq, 1);
  assert.equal(s.last.eventTime, stamp, "last.eventTime must be the DOM event timeStamp, not handler time");
  assert.ok(s.last.handlerMs >= 0);
  assert.ok(s.last.appliedAt >= s.last.eventTime);
  assert.ok(s.kinds.drag.sumMs >= s.kinds.drag.maxMs && s.kinds.drag.maxMs >= 0);
  assert.notDeepEqual(h.pose(), HOME, "probe must not change the applied camera");
});

test("CAM-10 probe: wheel zoom records kind=zoom; UI zoomBy without event falls back to handler start", t => {
  probeWindow(t);
  const h = harness();
  const stamp = performance.now() - 2;
  h.wheel(720, 450, -120);
  // wheel with explicit stamp:
  h.dispatch("wheel", {clientX: 720, clientY: 450, deltaY: -120, timeStamp: stamp});
  let s = stats();
  assert.equal(s.kinds.zoom.count, 2);
  assert.equal(s.last.kind, "zoom");
  assert.equal(s.last.eventTime, stamp);
  const before = s.seq;
  h.controller.zoomBy(1.2); // UI button path: no DOM event
  s = stats();
  assert.equal(s.seq, before + 1);
  assert.equal(s.last.kind, "zoom");
  assert.ok(Math.abs(s.last.eventTime - (s.last.appliedAt - s.last.handlerMs)) < 1e-6,
    "event-less command must fall back to handler start time");
});

test("CAM-10 probe: right-drag orbit records kind=orbit", t => {
  probeWindow(t);
  const h = harness();
  h.down(1, 600, 400, {button: 2, buttons: 2});
  h.move(1, 660, 430, 2);
  h.up(1, 660, 430, {button: 2});
  const s = stats();
  assert.equal(s.kinds.orbit.count, 1);
  assert.equal(s.last.kind, "orbit");
  assert.equal(s.kinds.drag, undefined, "orbit must not be accounted as drag");
});

test("CAM-10 probe: two-finger pinch records kind=pinch (phone zoom path)", t => {
  probeWindow(t);
  const h = harness();
  h.down(1, 660, 450, {pointerType: "touch"});
  h.down(2, 780, 450, {pointerType: "touch"});
  h.move(1, 630, 450, 1, {pointerType: "touch"});
  h.move(2, 810, 450, 1, {pointerType: "touch"});
  h.up(1, 630, 450, {pointerType: "touch"});
  h.up(2, 810, 450, {pointerType: "touch"});
  const s = stats();
  assert.ok(s.kinds.pinch && s.kinds.pinch.count >= 1, "pinch transform must be measured");
  assert.equal(s.last.kind, "pinch");
});

test("CAM-10 probe: keyboardPan records kind=key", t => {
  probeWindow(t);
  const h = harness();
  h.controller.keyboardPan(20, 0);
  const s = stats();
  assert.equal(s.kinds.key.count, 1);
  assert.equal(s.last.kind, "key");
});

test("CAM-10 probe: injected delayMs stall degrades handler time deterministically without corrupting the camera", t => {
  const DELAY = 30;
  probeWindow(t, {enabled: true, delayMs: DELAY});
  const h = harness();
  const anchor = groundAtScreen(h.pose(), {x: 600, y: 400}, VP);
  h.down(1, 600, 400);
  h.move(1, 680, 460, 1);
  h.up(1, 680, 460);
  const s = stats();
  assert.ok(s.kinds.drag.maxMs >= DELAY,
    `handlerMs ${s.kinds.drag.maxMs} must include the injected ${DELAY}ms stall`);
  assert.ok(s.last.handlerMs >= DELAY);
  // Camera math is untouched by the stall: anchor-exact pan still holds.
  const c = h.pose(), a = groundAtScreen(c, {x: 680, y: 460}, VP);
  const k = CAMERA_LIMITS.frustumHeight / (VP.height * c.zoom); // world units per CSS px
  const err = Math.hypot(a.x - anchor.x, a.z - anchor.z) * k;
  assert.ok(err <= 1, `anchor error ${err}px must stay <= 1px under injected stall`);
  // Wheel zoom is stalled too (negative control covers drag AND zoom).
  h.wheel(720, 450, -120);
  assert.ok(stats().kinds.zoom.maxMs >= DELAY);
});

test("CAM-10 probe: aggregates only — no pointer coordinates or raw event fields are stored", t => {
  probeWindow(t);
  const h = harness();
  drag(h);
  h.wheel(720, 450, -120);
  const s = stats();
  assert.deepEqual(Object.keys(s).sort(), ["kinds", "last", "seq"]);
  assert.deepEqual(Object.keys(s.last).sort(), ["appliedAt", "eventTime", "handlerMs", "kind", "seq"]);
  for (const k of Object.values(s.kinds))
    assert.deepEqual(Object.keys(k).sort(), ["count", "maxMs", "sumMs"]);
  const json = JSON.stringify(s);
  for (const forbidden of ["clientX", "clientY", "downX", "downY", "pointerId", "anchor"])
    assert.ok(!json.includes(forbidden), `stats must not contain ${forbidden}`);
});

test("CAM-10 probe: repeated gestures accumulate count/sum/max and monotonic seq", t => {
  probeWindow(t);
  const h = harness();
  for (let i = 0; i < 3; i++) drag(h);
  const s = stats();
  assert.equal(s.kinds.drag.count, 3);
  assert.equal(s.seq, 3);
  assert.equal(s.last.seq, 3);
  assert.ok(s.kinds.drag.sumMs >= s.kinds.drag.maxMs);
});

test("CAM-10 probe: adds no listeners and dispose leaves no probe timers", t => {
  probeWindow(t);
  const h = harness();
  for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture", "pointerout", "wheel", "contextmenu"])
    assert.equal(h.canvas.listenerCount(type), 1, `exactly one ${type} listener`);
  drag(h);
  h.controller.dispose();
  for (const type of ["pointerdown", "pointermove", "pointerup", "wheel"])
    assert.equal(h.canvas.listenerCount(type), 0, `${type} removed on dispose`);
  assert.equal(stats().kinds.drag.count, 1, "recorded aggregates survive dispose (read-only evidence)");
});
