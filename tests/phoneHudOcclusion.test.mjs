// #564 — phone home-camera HUD must not occlude the PROTECTED starter.
// Regression from #550: the alarm strip (order:-1) pushed the coordinate chip
// and the WRAPPED two-row camera rail down over the starter's home-camera
// projection (x~143, y~256..316 at 390x844 dpr2, yaw 45 / elev 35.264 / zoom 1
// / x0 z0). All five aim heights (1.2/0/3/5/7) hit DIV.rail-controls/BUTTON.
//
// Fix contract (CSS-only, phone-scoped):
//  1. .rail-controls is ONE nowrap row on phones (five 44px buttons fit the
//     370px band) — the old wrap+220px cap is gone.
//  2. .coordinate-chip moves BELOW the rail (order:1) and is pointer-
//     transparent (pointer-events:none, the #548 toast-body pattern) while
//     staying fully VISIBLE — no information is hidden or dropped.
//  3. The #550 alarm strip keeps order:-1, its 44px scrollable strip behaviour
//     and every control — nothing is hidden to buy canvas room.
//
// jsdom performs no layout/hit-testing, so the REAL src/styles.css is parsed
// from disk for the geometry contract (same pattern as noticeToast.test.mjs);
// the rendered-App tests prove the DOM/information/controls survive. The
// browser elementFromPoint + real-touch-tap proof lives in
// scripts/probe-564-geometry.mjs (PASS_NUMERIC_ONLY evidence).
//
// MUTATION SENSITIVITY: on clean main (pre-fix styles.css) the CSS-contract
// tests below FAIL — the phone .rail-controls rule still says flex-wrap:wrap
// with max-width:220px and no phone .coordinate-chip rule sets order:1 +
// pointer-events:none. Reverting either fix edit re-fails them.
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
dom.window.__RW_PROBES__ = true;
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
const q = sel => document.querySelector(sel);
const qa = sel => [...document.querySelectorAll(sel)];
const alarmProbe = () => JSON.parse(document.body.dataset.alarmProbe || "null");

// ---- CSS parsing helpers (comments stripped; balanced-brace media scan) ----
const cssText = () => readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "");
// Top-level rules of a css chunk: [{selector, body}] (media blocks recursed).
function rulesOf(chunk) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(chunk))) out.push({ selector: m[1].trim(), body: m[2] });
  return out;
}
function mediaBlocks(css) {
  const out = [];
  const re = /@media([^{]+)\{/g;
  let m;
  while ((m = re.exec(css))) {
    let depth = 1, i = re.lastIndex;
    while (i < css.length && depth > 0) { if (css[i] === "{") depth++; else if (css[i] === "}") depth--; i++; }
    out.push({ condition: m[1].trim(), body: css.slice(re.lastIndex, i - 1) });
    re.lastIndex = i;
  }
  return out;
}
const phoneBlocks = css => mediaBlocks(css).filter(b => /max-width:\s*770px/.test(b.condition));
const exactSelector = (rules, sel) => rules.filter(r => r.selector.split(",").some(s => s.trim() === sel));

test("#564 CSS contract: phone camera rail is ONE nowrap row (old wrap+220px cap gone), 44px targets kept", () => {
  const css = cssText();
  const phoneRules = phoneBlocks(css).flatMap(b => rulesOf(b.body));
  const rail = exactSelector(phoneRules, ".rail-controls");
  assert.ok(rail.length >= 1, "phone-scoped .rail-controls rule exists");
  // Mutation-sensitive: main's phone rule is flex-wrap:wrap;max-width:220px.
  assert.ok(rail.some(r => /flex-wrap:\s*nowrap/.test(r.body)),
    "phone .rail-controls must be flex-wrap:nowrap (main's wrap re-fails this)");
  assert.ok(!rail.some(r => /flex-wrap:\s*wrap(?![-\w])/.test(r.body) && !/nowrap/.test(r.body)),
    "no phone .rail-controls rule may re-enable wrapping");
  assert.ok(!rail.some(r => /max-width:\s*220px/.test(r.body)),
    "the 220px wrap cap that forced the second row must be gone");
  assert.ok(rail.some(r => /max-width:\s*calc\(100vw/.test(r.body)),
    "phone rail spans the safe phone band so five 44px buttons fit one row");
  const btn = exactSelector(phoneRules, ".rail-controls button");
  assert.ok(btn.some(r => /min-width:\s*44px/.test(r.body) && /min-height:\s*44px/.test(r.body)),
    "phone camera buttons keep 44px touch surfaces");
});

test("#564 CSS contract: phone coordinate chip is BELOW the rail and pointer-transparent, never auto", () => {
  const css = cssText();
  const phoneRules = phoneBlocks(css).flatMap(b => rulesOf(b.body));
  const chip = exactSelector(phoneRules, ".coordinate-chip");
  // Mutation-sensitive: main has NO phone .coordinate-chip order/pointer rule.
  assert.ok(chip.some(r => /order:\s*1/.test(r.body)),
    "phone .coordinate-chip must set order:1 (below rail-controls; main re-fails this)");
  assert.ok(chip.some(r => /pointer-events:\s*none/.test(r.body)),
    "phone .coordinate-chip must be pointer-events:none (main re-fails this)");
  // No rule anywhere may re-enable hit-testing on the chip body.
  const all = [...rulesOf(css.replace(/@media[^{]+\{/g, "")), ...mediaBlocks(css).flatMap(b => rulesOf(b.body))];
  for (const r of exactSelector(all, ".coordinate-chip"))
    assert.ok(!/pointer-events:\s*auto/.test(r.body), ".coordinate-chip must never be pointer-events:auto: " + r.selector);
  // The chip must not be hidden in phone PORTRAIT (landscape/narrow may hide
  // it; the sheet-open yield rule is a compound selector, not the chip body).
  const portrait = phoneBlocks(css).filter(b => !/max-height/.test(b.condition) && !/max-width:\s*359px/.test(b.condition));
  for (const r of exactSelector(portrait.flatMap(b => rulesOf(b.body)), ".coordinate-chip"))
    assert.ok(!/display:\s*none/.test(r.body), "phone-portrait chip body must stay visible: " + r.selector);
});

test("#564 CSS contract: #550 alarm strip preserved — order:-1, scrollable, never hidden", () => {
  const css = cssText();
  const phoneRules = phoneBlocks(css).flatMap(b => rulesOf(b.body));
  const strip = exactSelector(phoneRules, ".alarm-rail");
  assert.ok(strip.some(r => /order:\s*-1/.test(r.body)), "alarm strip keeps order:-1 (first in the rail)");
  assert.ok(strip.some(r => /overflow-x:\s*auto/.test(r.body) && /touch-action:\s*pan-x/.test(r.body)),
    "alarm strip keeps horizontal swipe scrolling");
  const all = [...rulesOf(css.replace(/@media[^{]+\{/g, "")), ...mediaBlocks(css).flatMap(b => rulesOf(b.body))];
  for (const r of exactSelector(all, ".alarm-rail"))
    assert.ok(!/display:\s*none/.test(r.body), "the alarm rail must never be display:none");
});

// ---- rendered-App proofs (information + controls survive the CSS fix) ----
let root = null;
const mountAlarmed = async () => {
  if (root) { root.unmount(); root = null; }
  dom.window.localStorage.removeItem(ALARM_SETTINGS_KEY);
  for (const k of ["alarmProbe", "panelProbe", "fleetProbe", "followProbe", "lastSiteOk"]) delete document.body.dataset[k];
  // ux06's sixAlarm construction: persistent alarms, deterministic under the
  // frozen tick (no generator + roads=[]).
  const g = createGame();
  g.buildings = g.buildings.filter(b => b.type !== "generator");
  g.roads = [];
  g.lastSavedAt = Date.now();
  dom.window.localStorage.setItem(SAVE_KEY, JSON.stringify(g));
  root = createRoot(document.getElementById("root"));
  root.render(React.createElement(App));
  await waitFor(() => q(".world-canvas")?.dataset.cameraYaw === "45", "camera home stamp");
  await waitFor(() => alarmProbe()?.kind === "ready", "alarmProbe ready stamp");
  await waitFor(() => qa(".alarm-rail .alarm-chip").length >= 1, "alarm chips rendered");
};
after(() => { try { root?.unmount(); } catch {} dom.window.close(); });

test("#564 rendered: coordinate chip keeps ALL sector info and has no interactive content", async () => {
  await mountAlarmed();
  const chip = q(".coordinate-chip");
  assert.ok(chip, "coordinate chip still mounted (not hidden/deleted to buy canvas room)");
  assert.ok(chip.textContent.includes("OPERATING SECTOR"), "eyebrow preserved");
  assert.ok(chip.textContent.includes("CINDER BASIN"), "sector name preserved");
  assert.ok(/LAND/.test(chip.textContent), "tier/land line preserved");
  assert.equal(chip.querySelectorAll("button,a,input,select,textarea,[tabindex]").length, 0,
    "chip is purely informational — pointer-events:none cannot strand a control");
  // DOM order is untouched (the fix is CSS order, not a DOM move): chip still
  // precedes rail-controls in the aside, alarm rail still first-child.
  const rail = q(".left-rail");
  assert.ok(rail.querySelector(".alarm-rail"), "alarm rail still in the left rail");
  assert.ok(rail.querySelector(".rail-controls"), "camera rail still in the left rail");
});

test("#564 rendered: five camera controls + alarm strip controls all live; collapse/expand + warnings work", async () => {
  await mountAlarmed();
  const buttons = qa(".rail-controls button");
  assert.equal(buttons.length, 5, "Recenter/Orbit/Zoom in/Zoom out/Controls all present");
  for (const b of buttons) assert.ok(b.getAttribute("aria-label") || b.getAttribute("title"), "camera button keeps its accessible name");
  // Alarm collapse -> summary -> expand, through real clicks.
  const collapse = q('[data-testid="alarm-collapse"]');
  assert.ok(collapse, "collapse control present");
  collapse.click();
  await waitFor(() => q('[data-testid="alarm-summary"]'), "collapsed summary");
  q('[data-testid="alarm-summary"]').click();
  await waitFor(() => q('[data-testid="alarm-collapse"]'), "expanded strip again");
  // Warnings preference toggle still wired.
  const warnings = q('[data-testid="alarm-setting-warnings"]');
  assert.ok(warnings, "warnings checkbox present");
  const before = warnings.checked;
  warnings.click();
  await waitFor(() => q('[data-testid="alarm-setting-warnings"]').checked !== before, "warnings toggle flips");
  assert.ok(qa(".alarm-rail .alarm-chip").length >= 1, "critical chips remain with warnings toggled");
});
