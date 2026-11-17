// CAM-05 (#341) — rendered-App wiring proof (jsdom + tsx, real cameraInput).
// src/world.js is leased to ART-07 (#353): a recording stub stands in for it
// via node:module resolve hooks, mirroring the synchronous canvas dataset
// stamp contract. Everything else (App.jsx, inspector.js, dock.js,
// cameraInput.js, camera.js, simulation.js) is the REAL source.
// Asserts: six toolbar panels + sheet collapse/close/reopen + resize never
// move the applied camera or drop the selection; Home DOES refit (negative).
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { register as registerTsx } from "tsx/esm/api";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>",
  { url: "http://localhost/", pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
try { Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true }); } catch {}
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.IS_REACT_ACT_ENVIRONMENT = false;
// Timer-backed MessageChannel so react-dom's scheduler leaves no open handle.
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
    return nextResolve(specifier, context);
  }
});

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const App = (await import("../src/App.jsx")).default;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const canvas = () => document.querySelector(".world-canvas");
const pose = () => {
  const d = canvas().dataset;
  return { yaw: d.cameraYaw, elevation: d.cameraElevation, zoom: d.cameraZoom, x: d.cameraX, z: d.cameraZ };
};
const probe = () => JSON.parse(document.body.dataset.panelProbe || "null");
const click = sel => { const el = document.querySelector(sel); assert.ok(el, "missing " + sel); el.click(); };
const tapCanvas = (x, y) => {
  const cv = canvas();
  cv.dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true, clientX: x, clientY: y, button: 0 }));
  cv.dispatchEvent(new dom.window.MouseEvent("pointerup", { bubbles: true, clientX: x, clientY: y, button: 0 }));
};
const sheetTitle = () => document.querySelector('[data-testid="sheet-title"]')?.textContent;

const root = createRoot(document.getElementById("root"));
root.render(React.createElement(App));
await sleep(250);

test("CAM-05 wiring: intentional pose + real tap selects the Freight Depot", async () => {
  assert.ok(canvas(), "world canvas mounted");
  assert.equal(pose().yaw, "45", "starts at approved isometric yaw");
  click('[aria-label="Zoom in"]');           // 1.15 -> 1.7825, anchored at centre
  click('[title="Orbit camera right"]');     // yaw 45 -> 90
  await sleep(150);
  const posed = pose();
  assert.equal(posed.yaw, "90");
  assert.ok(Number(posed.zoom) > 1.15, "zoom is intentional, not home");
  tapCanvas(720, 450);                       // stub screenToCell -> depot site (13,9)
  await sleep(250);
  assert.equal(sheetTitle(), "Freight Depot", "real tap selected starter depot id 2");
  assert.deepStrictEqual(pose(), posed, "desktop selection unobscured: no auto-frame move");
});

test("CAM-05 wiring: all six toolbar panels keep pose AND selection", async () => {
  const before = pose();
  for (const tool of ["build", "road", "fleet", "research", "market", "select"]) {
    click(`[data-tool="${tool}"]`);
    await sleep(140);
    assert.deepStrictEqual(pose(), before, `${tool} panel must not move the camera`);
    const p = probe();
    assert.equal(p.trigger, "tool:" + tool);
    assert.equal(p.selectedId, 2, `${tool} panel must retain the selected machine`);
    if (tool === "select") assert.equal(sheetTitle(), "Freight Depot", "Inspect re-shows retained selection");
  }
});

test("CAM-05 wiring: sheet collapse/expand and close/reopen keep pose AND selection", async () => {
  const before = pose();
  const toggle = '[aria-controls="context-sheet-body"]';
  click(toggle); await sleep(140);
  assert.equal(document.querySelector('[data-testid="panel-host"]').dataset.collapsed, "true");
  assert.deepStrictEqual(pose(), before, "collapse must not move the camera");
  assert.equal(probe().selectedId, 2);
  click(toggle); await sleep(140);
  assert.equal(document.querySelector('[data-testid="panel-host"]').dataset.collapsed, "false");
  assert.deepStrictEqual(pose(), before, "expand must not move the camera");
  click('[aria-label="Close Freight Depot"]'); await sleep(140);
  assert.equal(probe().trigger, "sheet-close");
  assert.equal(probe().selectedId, 2, "closing the sheet keeps the selection");
  assert.deepStrictEqual(pose(), before, "sheet close must not move the camera");
  click('[data-tool="select"]'); await sleep(200);
  assert.equal(sheetTitle(), "Freight Depot", "inspector re-entry re-shows the machine");
  assert.deepStrictEqual(pose(), before, "inspector re-entry must NOT reframe (framedRef guard)");
});

test("CAM-05 wiring: negative case — Home/Recenter DOES refit to exact isometric home", async () => {
  const before = pose();
  assert.notDeepStrictEqual(before, { yaw: "45", elevation: "35.264", zoom: "1.15", x: "0", z: "0" },
    "precondition: posed camera differs from home");
  click('[title="Fit isometric world (Home)"]');
  await sleep(150);
  assert.deepStrictEqual(pose(), { yaw: "45", elevation: "35.264", zoom: "1.15", x: "0", z: "0" },
    "Home refits to the approved isometric overview (jsdom width 1024 >= 960)");
  assert.equal(probe().trigger, "reset");
  assert.equal(probe().selectedId, 2, "reset refits the camera but keeps the selection");
});

test("CAM-05 wiring: Escape is the explicit deselect and never moves the camera", async () => {
  const before = pose();
  dom.window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await sleep(150);
  assert.deepStrictEqual(probe(), { trigger: "escape", mode: "select", selectedId: null });
  assert.deepStrictEqual(pose(), before, "deselect must not move the camera");
  root.unmount();
  dom.window.close();
});