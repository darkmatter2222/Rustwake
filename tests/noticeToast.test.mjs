// #548 — NOTICE toast must never intercept world-canvas gestures.
// Same rendered-App harness as tests/alarmsWiring.test.mjs (CAM-05 world stub,
// empty styles for App.jsx, frozen tick for seeded fixtures). The REAL
// src/styles.css is parsed from disk for the pointer-events contract because
// jsdom performs no layout/hit-testing — the browser elementFromPoint proof
// lives in scripts/capture-ux06.mjs (PASS_NUMERIC_ONLY evidence).
//
// Gesture delivery: jsdom 25 has NO PointerEvent constructor, so pointer
// events are MouseEvents with pointerId/pointerType defined before dispatch.
// cameraInput.js's guarded setPointerCapture path supports jsdom's missing
// capture API, so the real two-finger transformGesture code runs unchanged.
//
// Spend detector: the world stub's screenToCell always returns the occupied
// depot cell {13,9}, so a leaked single-finger tap stamps lastSiteOk="false"
// (build refused) WITHOUT spending — lastSiteOk presence is therefore the
// primary tap-leak assertion; bank/buildings equality is the secondary
// conservation check. A positive-control stationary tap proves the detector
// is live (predicate-implies-assertion weakness is closed).
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { register as registerTsx } from "tsx/esm/api";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>",
  { url: "http://localhost/", pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
try { Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true }); } catch {}
try { Object.defineProperty(globalThis, "localStorage", { value: dom.window.localStorage, configurable: true }); } catch {}
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
dom.window.__RW_PROBES__ = true; // test-gated alarmProbe observability
globalThis.IS_REACT_ACT_ENVIRONMENT = false;
globalThis.MessageChannel = class {
  constructor() {
    this.port1 = { onmessage: null, close() {} };
    this.port2 = { postMessage: () => { setTimeout(() => this.port1.onmessage?.({ data: null }), 0); }, close() {} };
  }
};

registerTsx();
registerHooks({
  resolve(specifier, context, nextResolve) {
    const fromApp = context.parentURL && context.parentURL.replace(/\\/g, "/").endsWith("/src/App.jsx");
    if (fromApp && specifier === "./world.js")
      return { url: new URL("./fixtures/cam05WorldStub.mjs", import.meta.url).href, shortCircuit: true };
    if (fromApp && specifier === "./styles.css")
      return { url: new URL("./fixtures/cam05Empty.mjs", import.meta.url).href, shortCircuit: true };
    if (fromApp && specifier === "./simulation.js")
      return { url: new URL("./fixtures/ux06SimFreeze.mjs", import.meta.url).href, shortCircuit: true };
    return nextResolve(specifier, context);
  }
});

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const App = (await import("../src/App.jsx")).default;
const { createGame } = await import("../src/simulation.js");
const { SAVE_KEY } = await import("../src/content.js");
const { ALARM_SETTINGS_KEY } = await import("../src/alarms.js");

const waitFor = async (fn, what, ms = 6000) => {
  const t0 = Date.now();
  for (;;) {
    let v; try { v = fn(); } catch { v = false; }
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timeout waiting for " + what);
    await new Promise(r => setTimeout(r, 15));
  }
};
const canvas = () => document.querySelector(".world-canvas");
const pose = () => {
  const d = canvas().dataset;
  return { yaw: d.cameraYaw, elevation: d.cameraElevation, zoom: d.cameraZoom, x: d.cameraX, z: d.cameraZ };
};
const q = sel => document.querySelector(sel);
const click = sel => { const el = q(sel); assert.ok(el, "missing " + sel); el.click(); };
const alarmProbe = () => JSON.parse(document.body.dataset.alarmProbe || "null");
const fleetProbe = () => JSON.parse(document.body.dataset.fleetProbe || "null");

// jsdom has no PointerEvent: MouseEvent + defined pointerId/pointerType.
const pe = (type, id, x, y) => {
  const e = new dom.window.MouseEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y,
    button: 0, buttons: type === "pointerup" ? 0 : 1
  });
  Object.defineProperty(e, "pointerId", { value: id });
  Object.defineProperty(e, "pointerType", { value: "touch" });
  canvas().dispatchEvent(e);
};

let root = null;
// Mount the brownout fixture and act on the alarm remedy so a REAL NOTICE
// toast (build-tool guidance) is on screen — the exact #548 repro condition.
const mountWithToast = async () => {
  if (root) { root.unmount(); root = null; }
  dom.window.localStorage.removeItem(ALARM_SETTINGS_KEY);
  for (const k of ["alarmProbe", "panelProbe", "fleetProbe", "followProbe", "lastSiteOk"]) delete document.body.dataset[k];
  const g = createGame();
  g.buildings = g.buildings.filter(b => b.type !== "generator"); // real brownout
  g.lastSavedAt = Date.now();
  dom.window.localStorage.setItem(SAVE_KEY, JSON.stringify(g));
  root = createRoot(document.getElementById("root"));
  root.render(React.createElement(App));
  await waitFor(() => canvas()?.dataset.cameraYaw === "45", "camera home stamp");
  await waitFor(() => alarmProbe()?.kind === "ready", "alarmProbe ready stamp");
  await waitFor(() => q('[data-testid="alarm-chip-power-brownout"]'), "brownout chip");
  click('[data-testid="alarm-chip-power-brownout"]');
  await waitFor(() => q('[data-testid="alarm-detail"]'), "alarm detail");
  click('[data-testid="alarm-action"]');
  const toast = await waitFor(() => q(".toast"), "remedy NOTICE toast");
  assert.equal(toast.getAttribute("role"), "status");
  return toast;
};
after(() => { try { root?.unmount(); } catch {} dom.window.close(); });

test("#548 CSS contract: toast body is pointer-transparent in EVERY rule; dismiss button stays interactive at 44px", () => {
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, ""); // strip comments so selectors parse cleanly
  // Every rule whose selector list contains exactly `.toast` (the body) must
  // never re-enable pointer events — base rule sets none, no override auto.
  const bodyRules = [...css.matchAll(/(?:^|[}\n])\s*([^{}]*\.toast[^{}]*)\{([^}]*)\}/g)]
    .filter(m => m[1].split(",").some(s => s.trim() === ".toast"));
  assert.ok(bodyRules.length >= 1, "base .toast rule exists");
  for (const m of bodyRules) {
    assert.ok(!/pointer-events:\s*auto/.test(m[2]), ".toast body must never be pointer-events:auto: " + m[1].trim());
  }
  assert.ok(bodyRules.some(m => /pointer-events:\s*none/.test(m[2])), "base .toast rule sets pointer-events:none");
  // The dismiss button re-enables hit-testing and keeps the 44px touch target.
  const btnRules = [...css.matchAll(/\.toast button\{([^}]*)\}/g)].map(m => m[1]);
  assert.ok(btnRules.some(r => /pointer-events:\s*auto/.test(r)), ".toast button is pointer-events:auto");
  assert.ok(btnRules.some(r => /min-width:\s*44px/.test(r) && /min-height:\s*44px/.test(r)), ".toast button keeps 44px target");
});

test("#548 regression: two-finger sweep straddling the toast region pans the camera, spends nothing, leaks no tap", async () => {
  await mountWithToast();
  const before = pose(), bankBefore = fleetProbe().bank, buildingsBefore = fleetProbe().buildings.map(b => b.id);
  assert.equal(before.x, "0");
  // Desktop toast region from styles.css (right:24, bottom:145, max-width:320
  // on the 1440x900 stub canvas): x ~1096..1416, y ~695..755. Finger A starts
  // INSIDE that region; finger B is on open canvas. jsdom cannot hit-test —
  // the capture script proves elementFromPoint over the real rendered toast.
  const A = { x: 1250, y: 720 }, B = { x: 620, y: 420 };
  pe("pointerdown", 1, A.x, A.y);
  pe("pointerdown", 2, B.x, B.y);
  for (let i = 1; i <= 6; i++) {
    pe("pointermove", 1, A.x + 18 * i, A.y + 9 * i);
    pe("pointermove", 2, B.x + 18 * i, B.y + 9 * i);
  }
  const mid = pose();
  assert.notEqual(mid.x, before.x, "straddling two-finger sweep must pan cameraX");
  assert.notEqual(mid.z, before.z, "straddling two-finger sweep must pan cameraZ");
  assert.equal(mid.yaw, "45", "parallel translation is pure pan — no orbit");
  assert.ok(Math.abs(Number(mid.zoom) - Number(before.zoom)) < 1e-9, "no pinch zoom from parallel translation (float tolerance)");
  pe("pointerup", 1, A.x + 108, A.y + 54);
  pe("pointerup", 2, B.x + 108, B.y + 54);
  // Neither finger may lift into a purchase (cameraInput marks both gestured).
  assert.equal(document.body.dataset.lastSiteOk, undefined, "no tap leaked from either straddling finger");
  assert.deepEqual(fleetProbe().bank, bankBefore, "gesture spent nothing");
  assert.deepEqual(fleetProbe().buildings.map(b => b.id), buildingsBefore, "no structure placed/removed");
  assert.ok(q(".toast"), "toast persists through the gesture (not dismissed by canvas contacts)");
  assert.equal(JSON.parse(document.body.dataset.panelProbe).mode, "build", "tool mode unchanged");
  // Positive control: a stationary single-finger tap DOES reach the build
  // path and stamps lastSiteOk ("false" — occupied depot site from the stub),
  // proving the leak detector above is meaningful, not vacuously true.
  pe("pointerdown", 9, 400, 300);
  pe("pointerup", 9, 400, 300);
  await waitFor(() => document.body.dataset.lastSiteOk !== undefined, "positive-control tap stamps lastSiteOk");
  assert.equal(document.body.dataset.lastSiteOk, "false", "occupied site refuses the build");
  assert.deepEqual(fleetProbe().bank, bankBefore, "refused build still spends nothing");
});

test("#548 regression: single-finger drag starting over the toast region pans; toast text is untouched", async () => {
  const toast = await mountWithToast();
  const textBefore = toast.textContent, before = pose();
  pe("pointerdown", 3, 1250, 720); // inside the toast body region
  for (let i = 1; i <= 6; i++) pe("pointermove", 3, 1250 + 18 * i, 720 + 9 * i);
  pe("pointerup", 3, 1358, 774);
  const after = pose();
  assert.notEqual(after.x, before.x, "drag over the toast region pans the world");
  assert.equal(after.yaw, "45", "left-button drag is pan, not orbit");
  assert.equal(document.body.dataset.lastSiteOk, undefined, "moved finger is not a tap");
  assert.ok(q(".toast"), "toast still visible");
  assert.equal(q(".toast").textContent, textBefore, "canvas gesture did not mutate/dismiss the notice");
});

test("#548 controls: dismiss button clears the notice; clicking the pointer-transparent body does not", async () => {
  const toast = await mountWithToast();
  const btn = toast.querySelector('button[aria-label="Dismiss notice"]');
  assert.ok(btn, "44px dismiss button present");
  assert.equal(toast.getAttribute("role"), "status", "live-region semantics preserved");
  // Body click bubbles but has no handler any more (pointer-events:none means
  // real browsers never deliver this contact to the toast at all).
  toast.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  // #559 N2: React 18 flushes a (regressed) body onClick dismissal in a
  // microtask/scheduler tick AFTER dispatchEvent returns — a synchronous
  // assert here scored 4/4 PASS even with the pre-#548 body onClick re-added
  // (coordinator comment 6951565246). Await one flush tick (the reviewer's
  // measured 120ms probe), THEN assert persistence, so a re-added dismissal
  // handler actually fails this guard. The dismiss-button half below is
  // unchanged — it was already load-bearing (3/1 FAIL under its mutation).
  await new Promise(r => setTimeout(r, 120));
  assert.ok(q(".toast"), "body click no longer dismisses — dismissal is button-only");
  btn.click();
  await waitFor(() => !q(".toast"), "dismiss button clears the toast");
});
