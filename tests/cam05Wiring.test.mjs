// CAM-05 (#341) — rendered-App wiring proof (jsdom + tsx, real cameraInput).
// src/world.js is leased to ART-07 (#353): a recording stub stands in for it
// via node:module resolve hooks, mirroring the synchronous canvas dataset
// stamp contract. Everything else (App.jsx, inspector.js, dock.js,
// cameraInput.js, camera.js, simulation.js) is the REAL source.
// Asserts: six toolbar panels + sheet collapse/close/reopen + resize never
// move the applied camera or drop the selection; Home DOES refit (negative).
//
// Harness contract (#545, P0 CI-hang fix):
//  - NO fixed assertion-gating sleeps. Every wait is condition-based
//    (waitFor polls the real DOM/dataset state) with an explicit 15 s ceiling
//    and a descriptive timeout error, so a loaded 2-core CI runner can never
//    false-FAIL a mount race and a genuine regression fails loudly.
//  - Every wait predicate IMPLIES the assertions that follow it (#545
//    residual flake, CI runs 44067561867 / 44067793813): the bootstrap waits
//    for the canvas AND an applied camera stamp, not the bare element —
//    App.jsx mounts .world-canvas in the mount effect but the first pose
//    publication lands later via the rAF update() -> applyCamera() path.
//    Deterministic reproduction: CAM05_SLOW_STAMP_MS in the world stub.
//  - Teardown (root.unmount + dom.window.close) lives in a guaranteed after()
//    hook AND guards the top-level bootstrap, so no assertion failure can
//    leave the React root + pretendToBeVisual jsdom window keeping the event
//    loop alive. A failing file must exit non-zero promptly — proven by the
//    scoped child-process regression test at the bottom of this file.
//  - No --test-force-exit or other leak-hiding mechanism is used anywhere.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
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

// Poll interval only — never gates an assertion by elapsed time.
const sleep = ms => new Promise(r => setTimeout(r, ms));
const WAIT_TIMEOUT = 15000;
async function waitFor(predicate, { timeout = WAIT_TIMEOUT, interval = 20, label = "condition" } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    let value;
    try { value = predicate(); } catch { value = false; }
    if (value) return value;
    if (Date.now() >= deadline)
      throw new Error(`waitFor timed out after ${timeout} ms waiting for: ${label}`);
    await sleep(interval);
  }
}
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
const collapsed = () => document.querySelector('[data-testid="panel-host"]')?.dataset.collapsed;
const execFileAsync = (cmd, args, opts) => new Promise((resolve, reject) => {
  execFile(cmd, args, opts, (err, stdout, stderr) => err ? reject(Object.assign(err, { stdout, stderr })) : resolve({ stdout, stderr }));
});

const root = createRoot(document.getElementById("root"));
root.render(React.createElement(App));

// Guaranteed teardown (#545): runs after the last test even when any test
// (or the bootstrap below) throws, so the React root and the jsdom window
// can never keep node --test alive. Idempotent.
let tornDown = false;
function teardown() {
  if (tornDown) return;
  tornDown = true;
  try { root.unmount(); } finally { dom.window.close(); }
}
after(teardown);

// #545 regression harness: CAM05_TEARDOWN_PROBE=1 deliberately loses the
// mount race (asserts before React can commit) so the child-process test
// below can prove a failing file still tears down and exits promptly.
// Never set by pnpm test / CI; the default path always waits on the DOM.
if (process.env.CAM05_TEARDOWN_PROBE === "1") {
  try {
    assert.ok(canvas(), "world canvas mounted");
  } catch (err) {
    teardown();
    throw err;
  }
}

// #545 residual flake: waiting on the bare canvas element does NOT imply the
// pose assertion below — the element mounts before the first applyCamera()
// publishes data-camera-* (loaded 2-core runner: yaw undefined !== "45").
// applyCamera writes all five fields in one synchronous pass, so a defined
// yaw implies the full initial pose is published. The exact "45" expectation
// stays a hard assertion, never folded into the wait.
const bootstrapStarted = Date.now();
try {
  await waitFor(() => canvas() && pose().yaw !== undefined,
    { label: "world canvas mounted AND initial camera pose stamped (data-camera-yaw defined)" });
} catch (err) {
  teardown();
  throw err;
}
const bootstrapMs = Date.now() - bootstrapStarted;

test("CAM-05 wiring: intentional pose + real tap selects the Freight Depot", async () => {
  assert.ok(canvas(), "world canvas mounted");
  assert.equal(pose().yaw, "45", "starts at approved isometric yaw");
  click('[aria-label="Zoom in"]');           // 1.15 -> 1.7825, anchored at centre
  click('[title="Orbit camera right"]');     // yaw 45 -> 90
  await waitFor(() => pose().yaw === "90" && Number(pose().zoom) > 1.15,
    { label: "zoom-in + orbit-right applied to the canvas dataset stamps" });
  const posed = pose();
  assert.equal(posed.yaw, "90");
  assert.ok(Number(posed.zoom) > 1.15, "zoom is intentional, not home");
  tapCanvas(720, 450);                       // stub screenToCell -> depot site (13,9)
  await waitFor(() => sheetTitle() === "Freight Depot",
    { label: "real tap selects starter depot id 2 (sheet title Freight Depot)" });
  assert.equal(sheetTitle(), "Freight Depot", "real tap selected starter depot id 2");
  assert.deepStrictEqual(pose(), posed, "desktop selection unobscured: no auto-frame move");
});

test("CAM-05 wiring: all six toolbar panels keep pose AND selection", async () => {
  const before = pose();
  for (const tool of ["build", "road", "fleet", "research", "market", "select"]) {
    click(`[data-tool="${tool}"]`);
    await waitFor(() => { const p = probe(); return p && p.trigger === "tool:" + tool && p.selectedId === 2; },
      { label: `panelProbe stamped trigger tool:${tool} with retained selectedId 2` });
    assert.deepStrictEqual(pose(), before, `${tool} panel must not move the camera`);
    const p = probe();
    assert.equal(p.trigger, "tool:" + tool);
    assert.equal(p.selectedId, 2, `${tool} panel must retain the selected machine`);
    if (tool === "select") {
      await waitFor(() => sheetTitle() === "Freight Depot",
        { label: "Inspect re-shows retained selection (sheet title Freight Depot)" });
      assert.equal(sheetTitle(), "Freight Depot", "Inspect re-shows retained selection");
    }
  }
});

test("CAM-05 wiring: sheet collapse/expand and close/reopen keep pose AND selection", async () => {
  const before = pose();
  const toggle = '[aria-controls="context-sheet-body"]';
  click(toggle);
  await waitFor(() => collapsed() === "true", { label: "panel-host data-collapsed=true after collapse" });
  assert.equal(document.querySelector('[data-testid="panel-host"]').dataset.collapsed, "true");
  assert.deepStrictEqual(pose(), before, "collapse must not move the camera");
  assert.equal(probe().selectedId, 2);
  click(toggle);
  await waitFor(() => collapsed() === "false", { label: "panel-host data-collapsed=false after expand" });
  assert.equal(document.querySelector('[data-testid="panel-host"]').dataset.collapsed, "false");
  assert.deepStrictEqual(pose(), before, "expand must not move the camera");
  click('[aria-label="Close Freight Depot"]');
  await waitFor(() => probe()?.trigger === "sheet-close", { label: "panelProbe stamped trigger sheet-close" });
  assert.equal(probe().trigger, "sheet-close");
  assert.equal(probe().selectedId, 2, "closing the sheet keeps the selection");
  assert.deepStrictEqual(pose(), before, "sheet close must not move the camera");
  click('[data-tool="select"]');
  await waitFor(() => probe()?.trigger === "tool:select" && sheetTitle() === "Freight Depot",
    { label: "inspector re-entry re-shows Freight Depot with trigger tool:select" });
  assert.equal(sheetTitle(), "Freight Depot", "inspector re-entry re-shows the machine");
  assert.deepStrictEqual(pose(), before, "inspector re-entry must NOT reframe (framedRef guard)");
});

test("CAM-05 wiring: negative case — Home/Recenter DOES refit to exact isometric home", async () => {
  const before = pose();
  assert.notDeepStrictEqual(before, { yaw: "45", elevation: "35.264", zoom: "1.15", x: "0", z: "0" },
    "precondition: posed camera differs from home");
  click('[title="Fit isometric world (Home)"]');
  // App.jsx stamps the camera (setView/applyCamera) BEFORE writing the reset
  // probe, so the probe write is a safe completion signal for the refit.
  await waitFor(() => probe()?.trigger === "reset", { label: "panelProbe stamped trigger reset after Home" });
  assert.deepStrictEqual(pose(), { yaw: "45", elevation: "35.264", zoom: "1.15", x: "0", z: "0" },
    "Home refits to the approved isometric overview (jsdom width 1024 >= 960)");
  assert.equal(probe().trigger, "reset");
  assert.equal(probe().selectedId, 2, "reset refits the camera but keeps the selection");
});

test("CAM-05 wiring: Escape is the explicit deselect and never moves the camera", async () => {
  const before = pose();
  dom.window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await waitFor(() => { const p = probe(); return p && p.trigger === "escape" && p.mode === "select" && p.selectedId === null; },
    { label: "panelProbe stamped {trigger:escape, mode:select, selectedId:null}" });
  assert.deepStrictEqual(probe(), { trigger: "escape", mode: "select", selectedId: null });
  assert.deepStrictEqual(pose(), before, "deselect must not move the camera");
});

test("CAM-05 wiring: teardown-on-failure — a sabotaged bootstrap exits non-zero promptly (#545)", async () => {
  // Scoped child-process proof: re-run THIS file with CAM05_TEARDOWN_PROBE=1
  // so the bootstrap assertion fires before React mounts (the exact CI
  // failure mode). The child must fail fast and exit on its own — the
  // guaranteed teardown closes the React root + jsdom window. The child
  // throws at top level before registering any test, so there is no
  // recursion into this regression test.
  const env = { ...process.env, CAM05_TEARDOWN_PROBE: "1" };
  delete env.NODE_TEST_CONTEXT; // grandchild must run as its own test runner
  const repoRoot = fileURLToPath(new URL("../", import.meta.url));
  const self = fileURLToPath(import.meta.url);
  const started = Date.now();
  let failure;
  try {
    await execFileAsync(process.execPath, ["--test", self],
      { cwd: repoRoot, env, timeout: 60000, windowsHide: true });
  } catch (err) { failure = err; }
  const elapsed = Date.now() - started;
  assert.ok(failure, "sabotaged bootstrap must fail (canvas not yet mounted)");
  assert.ok(!failure.killed, "child must exit on its own, NOT be killed by the 60 s timeout (no hang)");
  assert.equal(failure.code, 1, "child must exit with code 1 (fail fast)");
  assert.ok(elapsed < 30000, `child exited in ${elapsed} ms, under the 30000 ms prompt-exit ceiling`);
  assert.match(String(failure.stdout) + String(failure.stderr), /world canvas mounted/,
    "child failed on the sabotaged bootstrap assertion, not on some unrelated error");
});

test("CAM-05 wiring: slow initial stamp — bootstrap waits for the pose, not the bare canvas (#545)", async () => {
  // Deterministic reproduction of the residual CI flake (runs 44067561867 /
  // 44067793813): the world stub defers the INITIAL data-camera-* stamp by
  // 1200 ms after the canvas element mounts. The OLD bootstrap predicate
  // (bare canvas) fails test 1 with `undefined !== '45'` under this switch;
  // the strengthened predicate (canvas AND stamped yaw) must stay green.
  const SLOW_MS = 1200;
  if (process.env.CAM05_SLOW_STAMP_CHILD === "1") {
    // Inside the delayed child: prove the bootstrap actually waited out the
    // deferred stamp instead of racing it. No re-spawn here — the marker
    // bounds recursion to exactly one delayed child per run.
    assert.ok(bootstrapMs >= SLOW_MS,
      `bootstrap waited ${bootstrapMs} ms >= the ${SLOW_MS} ms deferred stamp (waited, not raced)`);
    const p = pose();
    for (const key of ["yaw", "elevation", "zoom", "x", "z"])
      assert.notEqual(p[key], undefined, `initial pose field ${key} published before first assertion`);
    assert.equal(p.yaw, "45", "delayed initial stamp still publishes the approved isometric yaw");
    return;
  }
  const env = { ...process.env, CAM05_SLOW_STAMP_MS: String(SLOW_MS), CAM05_SLOW_STAMP_CHILD: "1" };
  delete env.NODE_TEST_CONTEXT; // child must run as its own test runner
  delete env.CAM05_TEARDOWN_PROBE; // child must run the NORMAL (non-sabotaged) path
  const repoRoot = fileURLToPath(new URL("../", import.meta.url));
  const self = fileURLToPath(import.meta.url);
  const started = Date.now();
  const { stdout, stderr } = await execFileAsync(process.execPath, ["--test", self],
    { cwd: repoRoot, env, timeout: 60000, windowsHide: true });
  const elapsed = Date.now() - started;
  const out = String(stdout) + String(stderr);
  assert.match(out, /# pass 7/, "delayed-stamp child: all 7 tests in this file pass");
  assert.match(out, /# fail 0/, "delayed-stamp child: zero failures (old bare-canvas predicate fails here)");
  assert.ok(elapsed < 60000, `delayed-stamp child exited on its own in ${elapsed} ms (no hang, no timeout kill)`);
});
