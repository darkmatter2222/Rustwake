// UX-06 (#364) — rendered-App wiring proof (jsdom + tsx).
// Mirrors the CAM-05 wiring harness: src/world.js is leased to ART-02 (#348),
// so the recording stub stands in via node:module resolve hooks; styles.css is
// stubbed empty. App.jsx, alarms.js, inspector.js, dock.js, resourceStrip.js,
// fleet.js, cameraInput.js and camera.js are the REAL source; simulation.js is
// real everywhere except App.jsx's tick, which sees a frozen advanceGame
// (tests/fixtures/ux06SimFreeze.mjs) so seeded fixtures stay deterministic.
// Asserts: seeded failure fixtures surface actionable chips + detail with
// problem AND remedy text, colour is never the only cue (severity words, icons,
// ARIA), every alarm interaction is camera-neutral (CAM-05), settings persist
// across remount, Escape closes the detail before deselecting, and the
// inspector/ledger carry contextual alarm states.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { register as registerTsx } from "tsx/esm/api";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>",
  { url: "http://localhost/", pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
try { Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true }); } catch {}
// simulation.js readGame/persist use the BARE localStorage identifier — bridge
// it to jsdom so seeded saves actually load (otherwise readGame silently falls
// back to createGame and every fixture would render a fresh yard).
try { Object.defineProperty(globalThis, "localStorage", { value: dom.window.localStorage, configurable: true }); } catch {}
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
// UX-06 alarmProbe is test-gated in App.jsx (window.__RW_PROBES__); opt in here
// so the wiring harness observes the same stamp the capture script does.
dom.window.__RW_PROBES__ = true;
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
    // jsdom's rAF cadence advances the sim far faster than wall time, drifting
    // seeded fixtures mid-test. App.jsx alone sees a frozen advanceGame; every
    // other module (alarms.js, resourceStrip.js, inspector.js, fleet.js) keeps
    // the REAL simulation. Sim authority is proven in tests/alarms.test.mjs.
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
const { ALARM_SETTINGS_KEY, ALARM_DEFAULTS } = await import("../src/alarms.js");

// Condition-based waits only — never a fixed sleep as an assertion gate.
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
const HOME = { yaw: "45", elevation: "35.264", zoom: "1.15", x: "0", z: "0" };
const probe = () => JSON.parse(document.body.dataset.panelProbe || "null");
const alarmProbe = () => JSON.parse(document.body.dataset.alarmProbe || "null");
const q = sel => document.querySelector(sel);
const click = sel => { const el = q(sel); assert.ok(el, "missing " + sel); el.click(); };
const tapCanvas = (x, y) => {
  const cv = canvas();
  cv.dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true, clientX: x, clientY: y, button: 0 }));
  cv.dispatchEvent(new dom.window.MouseEvent("pointerup", { bubbles: true, clientX: x, clientY: y, button: 0 }));
};
const escape = () => dom.window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

let root = null;
// Remount per fixture: unmount the previous React root (clears its intervals),
// seed the REAL save key with a real sim state, then wait for both the camera
// home stamp and the alarmProbe observability stamp before asserting.
const mount = async (mutate, { keepAlarmPrefs = false } = {}) => {
  if (root) { root.unmount(); root = null; }
  if (!keepAlarmPrefs) dom.window.localStorage.removeItem(ALARM_SETTINGS_KEY);
  // Clear stale observability stamps so waits below prove THIS mount's state.
  for (const k of ["alarmProbe", "panelProbe", "fleetProbe", "followProbe"]) delete document.body.dataset[k];
  const g = createGame();
  mutate?.(g);
  g.lastSavedAt = Date.now(); // no offline catch-up
  dom.window.localStorage.setItem(SAVE_KEY, JSON.stringify(g));
  root = createRoot(document.getElementById("root"));
  root.render(React.createElement(App));
  await waitFor(() => canvas()?.dataset.cameraYaw === "45", "camera home stamp");
  await waitFor(() => alarmProbe()?.kind === "ready", "alarmProbe ready stamp");
  return g;
};
after(() => { try { root?.unmount(); } catch {} dom.window.close(); });

// --- Seeded failure fixtures (real sim conditions, never fabricated flags) ---
const brownout = g => { g.buildings = g.buildings.filter(b => b.type !== "generator"); };
const noRoads = g => { g.roads = []; };
const starved = g => {
  g.bank.iron = 0; g.bank.fuel = 0;
  const f = g.buildings.find(b => b.type === "furnace");
  f.inventory = { iron: 1, fuel: 0 };
  g.vehicles.forEach(v => v.job = null);
};
const bayBackup = g => {
  const f = g.buildings.find(b => b.type === "furnace");
  f.inventory = { iron: 10, fuel: 7, steel: 15 };
  g.vehicles.forEach(v => v.job = null);
};

test("UX-06 wiring: fresh yard is honestly nominal — empty state, live region, zero-alarm probe", async () => {
  await mount();
  const empty = await waitFor(() => q('[data-testid="alarms-empty"]'), "nominal empty chip");
  assert.match(empty.textContent, /YARD NOMINAL/);
  assert.match(empty.textContent, /NO ALARMS/);
  assert.equal(q('[data-testid="alarm-chip-power-brownout"]'), null);
  const live = q('[data-testid="alarm-live"]');
  assert.equal(live.getAttribute("aria-live"), "polite");
  assert.equal(live.getAttribute("role"), "status");
  assert.equal(live.textContent, "All yard systems nominal");
  assert.deepEqual(alarmProbe(), { kind: "ready", ids: [], counts: { critical: 0, warning: 0, total: 0 }, power: { supply: 12, demand: 5, available: true, percent: 42 } });
  assert.deepEqual(pose(), HOME, "nominal rail never moves the camera");
});

test("UX-06 wiring: brownout chip carries severity WORD + icon + full ARIA remedy, camera-neutral", async () => {
  await mount(brownout);
  const chip = await waitFor(() => q('[data-testid="alarm-chip-power-brownout"]'), "brownout chip");
  assert.equal(chip.dataset.kind, "power");
  assert.equal(chip.dataset.severity, "critical");
  assert.equal(chip.dataset.state, "ready");
  assert.match(chip.textContent, /CRITICAL/, "severity is explicit text, not colour alone");
  assert.match(chip.textContent, /⌁/, "power icon shape cue");
  const label = chip.getAttribute("aria-label");
  assert.match(label, /^CRITICAL: /);
  assert.match(label, /Remedy: /, "screen readers get the remedy without expanding");
  assert.equal(chip.getAttribute("aria-pressed"), "false");
  assert.equal(chip.tagName, "BUTTON", "keyboard-reachable native button");
  assert.match(q('[data-testid="alarm-live"]').textContent, /CRITICAL/);
  const p = alarmProbe();
  assert.deepEqual(p.ids, ["power-brownout"]);
  assert.equal(p.counts.critical, 1);
  assert.equal(p.power.supply, 0);
  assert.deepEqual(pose(), HOME, "alarm appearance must not reframe the camera");
});

test("UX-06 wiring: expanding the detail and acting on it keeps pose; remedy opens the build tool", async () => {
  await mount(brownout);
  await waitFor(() => q('[data-testid="alarm-chip-power-brownout"]'), "brownout chip");
  click('[data-testid="alarm-chip-power-brownout"]');
  const detail = await waitFor(() => q('[data-testid="alarm-detail"]'), "alarm detail");
  assert.equal(detail.getAttribute("role"), "group");
  assert.equal(detail.dataset.state, "ready");
  assert.ok(q('[data-testid="alarm-problem"]').textContent.length > 10, "problem text present");
  assert.match(q('[data-testid="alarm-remedy"]').textContent, /REMEDY/);
  const chip = q('[data-testid="alarm-chip-power-brownout"]');
  assert.equal(chip.getAttribute("aria-expanded"), "true");
  assert.equal(chip.getAttribute("aria-controls"), "alarm-detail");
  assert.deepEqual(pose(), HOME, "expanding an alarm must not move the camera");
  assert.equal(probe(), null, "no camera transition was triggered");
  click('[data-testid="alarm-action"]');
  await waitFor(() => probe()?.trigger === "tool:build", "build tool opened");
  assert.equal(probe().mode, "build");
  assert.deepEqual(pose(), HOME, "alarm remedy action is camera-neutral");
  assert.equal(q('[data-testid="alarm-detail"]'), null, "detail closes after acting");
  await waitFor(() => q(".toast"), "remedy toast");
  assert.match(q(".toast").textContent, /tap a free pad/, "novice gets placement guidance");
});

test("UX-06 wiring: roadless yard raises one road alarm per completed machine; remedy opens road engineer", async () => {
  const g = await mount(noRoads);
  const completed = g.buildings.filter(b => b.remaining <= 0).length;
  await waitFor(() => document.querySelectorAll('[data-kind="road"]').length === completed, "road chips");
  assert.equal(alarmProbe().counts.critical, completed);
  click('[data-testid="alarm-chip-road-2"]');
  const detail = await waitFor(() => q('[data-testid="alarm-detail"]'), "road detail");
  assert.equal(detail.dataset.kind, "road");
  assert.match(q('[data-testid="alarm-remedy"]').textContent, /asphalt/i);
  click('[data-testid="alarm-action"]');
  await waitFor(() => probe()?.trigger === "tool:road", "road tool opened");
  assert.deepEqual(pose(), HOME, "road remedy is camera-neutral");
  await waitFor(() => q(".toast"), "road guidance toast");
  assert.match(q(".toast").textContent, /within 3 cells/, "ROAD_REACH guidance from the sim constant");
});

test("UX-06 wiring: starvation chips mirror the strip; locked fuel names its tier and routes to the Exchange", async () => {
  await mount(starved);
  await waitFor(() => q('[data-testid="alarm-chip-starve-iron"]'), "iron starvation chip");
  const iron = q('[data-testid="alarm-chip-starve-iron"]');
  assert.equal(iron.dataset.severity, "critical");
  assert.match(iron.textContent, /CRITICAL/);
  click('[data-testid="alarm-chip-starve-iron"]');
  await waitFor(() => q('[data-testid="alarm-detail"]'), "iron detail");
  click('[data-testid="alarm-action"]');
  await waitFor(() => probe()?.trigger === "tool:build", "cheapest iron producer build tool");
  assert.deepEqual(pose(), HOME);
  const fuel = q('[data-testid="alarm-chip-starve-fuel"]');
  assert.equal(fuel.dataset.state, "locked", "fuel producer is tier-1 locked at tier 0 — honest state");
  click('[data-testid="alarm-chip-starve-fuel"]');
  await waitFor(() => q('[data-testid="alarm-detail"]')?.dataset.state === "locked", "locked fuel detail");
  assert.match(q('[data-testid="alarm-remedy"]').textContent, /INDUSTRIAL AGE/, "remedy names the unlocking tier");
  assert.match(q('[data-testid="alarm-action"]').textContent, /Exchange/, "locked remedy routes to the Exchange");
  click('[data-testid="alarm-action"]');
  await waitFor(() => probe()?.trigger === "tool:market", "market remedy for locked fuel");
  assert.deepEqual(pose(), HOME, "every starvation remedy path is camera-neutral");
  assert.ok(alarmProbe().ids.includes("starve-iron") && alarmProbe().ids.includes("starve-fuel"));
});

test("UX-06 wiring: storage backup warning + warnings toggle persists across remount", async () => {
  await mount(bayBackup);
  const chip = await waitFor(() => q('[data-testid^="alarm-chip-storage-"]'), "storage chip");
  assert.equal(chip.dataset.severity, "warning");
  assert.equal(chip.dataset.kind, "storage");
  assert.match(chip.textContent, /WARNING/, "warning severity is explicit text");
  const box = q('[data-testid="alarm-setting-warnings"]');
  assert.equal(box.checked, true);
  box.click(); // jsdom fires change on checkbox click
  await waitFor(() => !q('[data-testid^="alarm-chip-storage-"]'), "warning hidden");
  assert.equal(JSON.parse(dom.window.localStorage.getItem(ALARM_SETTINGS_KEY)).showWarnings, false);
  assert.deepEqual(pose(), HOME, "settings toggle is camera-neutral");
  await mount(bayBackup, { keepAlarmPrefs: true });
  await waitFor(() => alarmProbe().ids.some(id => id.startsWith("storage-")), "storage alarm still derived");
  assert.equal(q('[data-testid^="alarm-chip-storage-"]'), null, "pref persists across remount");
  assert.equal(q('[data-testid="alarm-setting-warnings"]').checked, false);
  q('[data-testid="alarm-setting-warnings"]').click();
  await waitFor(() => q('[data-testid^="alarm-chip-storage-"]'), "warning restored");
  assert.equal(JSON.parse(dom.window.localStorage.getItem(ALARM_SETTINGS_KEY)).showWarnings, true);
});

test("UX-06 wiring: rail collapse persists; summary button restores chips; camera never moves", async () => {
  await mount(brownout);
  await waitFor(() => q('[data-testid="alarm-chip-power-brownout"]'), "brownout chip");
  click('[data-testid="alarm-collapse"]');
  const summary = await waitFor(() => q('[data-testid="alarm-summary"]'), "collapsed summary");
  assert.equal(summary.getAttribute("aria-expanded"), "false");
  assert.match(summary.textContent, /1 ALARM/);
  assert.equal(JSON.parse(dom.window.localStorage.getItem(ALARM_SETTINGS_KEY)).railOpen, false);
  assert.deepEqual(pose(), HOME);
  await mount(brownout, { keepAlarmPrefs: true });
  await waitFor(() => q('[data-testid="alarm-summary"]'), "collapsed pref persists");
  click('[data-testid="alarm-summary"]');
  await waitFor(() => q('[data-testid="alarm-chip-power-brownout"]'), "chips restored");
  assert.equal(JSON.parse(dom.window.localStorage.getItem(ALARM_SETTINGS_KEY)).railOpen, true);
  assert.deepEqual(pose(), HOME, "collapse/expand is camera-neutral");
});

test("UX-06 wiring: Escape closes the alarm detail FIRST, keeping selection and pose; second Escape deselects", async () => {
  await mount(noRoads);
  tapCanvas(720, 450); // stub screenToCell -> depot site (13,9)
  await waitFor(() => q('[data-testid="sheet-title"]')?.textContent === "Freight Depot", "depot selected");
  const posed = pose();
  click('[data-testid="alarm-chip-road-2"]');
  await waitFor(() => q('[data-testid="alarm-detail"]'), "detail open over selection");
  escape();
  await waitFor(() => !q('[data-testid="alarm-detail"]'), "detail closed by Escape");
  assert.notEqual(probe()?.trigger, "escape", "Escape on a detail must NOT stamp the deselect trigger");
  assert.deepEqual(pose(), posed, "closing the detail never moves the camera");
  assert.equal(q('[data-testid="sheet-title"]').textContent, "Freight Depot", "selection retained — sheet still shows the machine");
  escape();
  await waitFor(() => probe()?.trigger === "escape", "second Escape deselects");
  assert.deepEqual(probe(), { trigger: "escape", mode: "select", selectedId: null });
  assert.deepEqual(pose(), posed, "deselect is camera-neutral (CAM-05)");
});

test("UX-06 wiring: inspector shows contextual alarms for the selected machine + honest depot capacity note", async () => {
  await mount(noRoads);
  tapCanvas(720, 450);
  await waitFor(() => q('[data-testid="inspector-alarm-road-2"]'), "contextual road alarm in inspector");
  const line = q('[data-testid="inspector-alarm-road-2"]');
  assert.equal(line.dataset.severity, "critical");
  assert.match(line.textContent, /CRITICAL/);
  assert.match(line.textContent, /asphalt/i, "remedy visible in context");
  assert.ok(q('[data-testid="inspector-depot-capacity"]'), "depot uncapped honesty note");
  assert.match(q('[data-testid="inspector-depot-capacity"]').textContent, /uncapped/);
  const posed = pose();
  click('[data-testid="inspector-alarm-action-road-2"]');
  await waitFor(() => probe()?.trigger === "tool:road", "contextual remedy opens road tool");
  assert.equal(probe().selectedId, 2, "contextual action keeps the selection");
  assert.deepEqual(pose(), posed, "contextual action is camera-neutral");
});

test("UX-06 wiring: freight ledger carries the storage section with problem + remedy text", async () => {
  await mount(bayBackup);
  await waitFor(() => alarmProbe().ids.some(id => id.startsWith("storage-")), "storage alarm derived");
  click('[aria-label="Open full freight ledger"]');
  const section = await waitFor(() => q('[data-testid="ledger-storage"]'), "ledger storage section");
  const row = section.querySelector('[data-testid^="storage-"]');
  assert.ok(row, "storage row present");
  assert.equal(row.dataset.state, "ready");
  assert.match(row.textContent, /WARNING/);
  assert.match(row.textContent, /truck/i, "remedy names the freight fix");
  assert.deepEqual(pose(), HOME, "opening the ledger from the rail context is camera-neutral");
});

test("UX-06 wiring: chips and detail controls are native keyboard-reachable buttons with pressed state", async () => {
  await mount(brownout);
  const chip = await waitFor(() => q('[data-testid="alarm-chip-power-brownout"]'), "brownout chip");
  chip.focus();
  assert.equal(document.activeElement, chip, "chip takes keyboard focus");
  assert.equal(chip.type, "button");
  assert.ok(chip.tabIndex >= 0);
  chip.click();
  await waitFor(() => q('[data-testid="alarm-detail"]'), "detail");
  assert.equal(chip.getAttribute("aria-pressed"), "true");
  const close = q('[data-testid="alarm-detail-close"]');
  close.focus();
  assert.equal(document.activeElement, close, "detail close is keyboard-reachable");
  assert.equal(close.getAttribute("aria-label"), "Close alarm detail");
  close.click();
  await waitFor(() => !q('[data-testid="alarm-detail"]'), "detail closed");
  assert.equal(chip.getAttribute("aria-pressed"), "false");
  assert.deepEqual(pose(), HOME);
  assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(ALARM_SETTINGS_KEY)) || ALARM_DEFAULTS, ALARM_DEFAULTS,
    "interactions alone never write prefs — only explicit settings changes do");
});
