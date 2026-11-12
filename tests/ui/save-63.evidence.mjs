/**
 * UI-RESET-63 acceptance evidence: headless Chrome DOM/geometry/console/pixel
 * assertions on THIS branch's BUILT app (pnpm build, then `vite preview` of dist
 * spawned here; RW63_PORT overrides 5163). Form factors: phone 390x844 dsf2
 * portrait, phone landscape 844x390 dsf2, desktop 1920x1080 dsf1 — each at text
 * scale 1 AND 2.0. No visual inspection is claimed: every "look" check is a
 * programmatic DOM, geometry, console or decoded-pixel test.
 *
 * Run from the worktree root AFTER `pnpm build`:
 *   pnpm tsx tests/ui/save-63.evidence.mjs
 * (tsx lets this .mjs import the game's own TypeScript encodeSave/engine/model,
 * so seeds are produced by the real persistence code at lastSeenMs=Date.now(),
 * and every action goes through real UI clicks/keys -> App -> store.importSave.)
 *
 * Live-sim tolerance: the yard steps at ~10 ticks/s while the probe runs, so
 * tick/credits/save-size readouts are asserted as monotonic bounds against an
 * atomic mirror read (rows + localStorage in ONE evaluate), while structural
 * identity (machines, routes, settings, research, spares) is asserted exactly.
 * A refused/canceled import must leave that structural identity untouched and
 * the tick far below the incoming yard's tick — never a silent replacement.
 *
 * Fixture mutations (older-save shape, hostile settings, tampered checksum,
 * impossible values, removed clipboard/download APIs) happen ONLY in this probe
 * code, never in src, and never weaken the decoder they exercise: reseals use
 * the game's own checksum; the hostile settings fixture exercises the sanitizer.
 *
 * Output: full-frame PNGs + receipt.json under
 *   C:/Users/ryans/AppData/Local/Temp/rw-coord/save-63-evidence/
 * and a committed compact receipt at tests/ui/save-63.evidence.json.
 */
import { chromium } from "playwright-core";
import { spawn, execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  encodeSave,
  decodeSave,
  checksum,
  migrate,
  DEFAULT_SETTINGS,
  SAVE_KEY,
} from "../../src/game/persistence/save.ts";
import { LEASE_KEY } from "../../src/game/persistence/lease.ts";
import { createInitialState } from "../../src/game/simulation/types.ts";
import { applyCommand } from "../../src/game/simulation/commands.ts";
import { advance } from "../../src/game/simulation/engine.ts";
import { TUNING } from "../../src/game/content/defs.ts";
import { summarizeYard, settingsChangeLine, exportFileName, previewImport } from "../../src/ui/save/model.ts";
import { SAVE_COPY } from "../../src/ui/save/copy.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const out = "C:/Users/ryans/AppData/Local/Temp/rw-coord/save-63-evidence";
mkdirSync(out, { recursive: true });
const framesDir = resolve(out, "frames");
rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });
const PORT = Number(process.env.RW63_PORT ?? 5163);
const url = `http://127.0.0.1:${PORT}/`;
const headSha = process.env.RW63_SHA ?? execSync("git rev-parse HEAD", { cwd: root }).toString().trim();
const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: root }).toString().trim();
if (!existsSync(resolve(root, "dist/index.html"))) {
  throw new Error("dist/index.html missing — run `pnpm build` in the worktree before this probe (evidence must come from the BUILT app).");
}

/* ---- seeds: the game's own engine + encodeSave, lastSeenMs = Date.now() ---- */

/** The CURRENT yard in the tab: small, real, tutorial complete (B-06 unlock). */
function buildCurrent(textScale) {
  const sim = createInitialState();
  for (let i = 0; i < 6; i += 1) {
    applyCommand(sim, { id: `cur-salvage-${i}`, type: "manual.salvage" });
    advance(sim, TUNING.manualPulseTicks);
  }
  applyCommand(sim, { id: "cur-repair", type: "drone.repair" });
  advance(sim, 262);
  applyCommand(sim, { id: "cur-build", type: "machine.build", blueprint: "sorter", tile: 8 });
  applyCommand(sim, { id: "cur-route", type: "route.connect", from: 0, to: sim.machines[0].id, filter: "scrap" });
  advance(sim, 400);
  // Probe fixture (documented): unlock the Yard destination without playing the
  // tutorial; the same unlock the jsdom suite uses (store.getState().tutorial = 9).
  sim.tutorial = 9;
  return { sim, text: encodeSave(sim, Date.now(), { ...DEFAULT_SETTINGS, textScale }) };
}

/** The INCOMING yard: different tick, two machines, muted + 1.5 text scale. */
function buildIncoming() {
  const sim = createInitialState();
  for (let i = 0; i < 10; i += 1) {
    applyCommand(sim, { id: `inc-salvage-${i}`, type: "manual.salvage" });
    advance(sim, TUNING.manualPulseTicks);
  }
  applyCommand(sim, { id: "inc-repair", type: "drone.repair" });
  advance(sim, 262);
  applyCommand(sim, { id: "inc-build-1", type: "machine.build", blueprint: "sorter", tile: 8 });
  for (const tile of [9, 10, 11, 12]) {
    if (applyCommand(sim, { id: `inc-build-2-${tile}`, type: "machine.build", blueprint: "sorter", tile }).ok) break;
  }
  applyCommand(sim, { id: "inc-route", type: "route.connect", from: 0, to: sim.machines[0].id, filter: "scrap" });
  advance(sim, 2400);
  sim.tutorial = 9;
  const settings = { ...DEFAULT_SETTINGS, muted: true, reducedMotion: false, textScale: 1.5 };
  return { sim, settings, text: encodeSave(sim, Date.now(), settings) };
}

const incoming = buildIncoming();
const incomingSummary = summarizeYard(incoming.sim);
const incomingEnv = JSON.parse(incoming.text);
/** Re-checksum an envelope after a probe-side fixture mutation of its payload. */
const reseal = (env) => JSON.stringify({ ...env, checksum: checksum(JSON.stringify(env.payload)) });

// Older save: strip the fields migrate() backfills (research, spares, the eight
// machine counters and two route counters). Resealed with the REAL checksum.
const olderEnv = JSON.parse(incoming.text);
delete olderEnv.payload.sim.research;
delete olderEnv.payload.sim.spares;
for (const m of olderEnv.payload.sim.machines) {
  for (const k of ["ageTicks", "busyTicks", "fullTicks", "starvedTicks", "rateAge", "rateFrom", "rateAgePrev", "rateFromPrev"]) delete m[k];
}
for (const r of olderEnv.payload.sim.routes) {
  for (const k of ["ageTicks", "busyTicks"]) delete r[k];
}
const olderText = reseal(olderEnv);
const olderPreview = previewImport(olderText, { ...DEFAULT_SETTINGS });
if (olderPreview.status !== "ready") throw new Error("older fixture failed pre-validation: " + olderPreview.note);

// Hostile settings: wrong types + out-of-range scale; the sanitizer must clamp.
const hostileEnv = JSON.parse(incoming.text);
hostileEnv.payload.settings = { muted: "yes", reducedMotion: null, textScale: 99 };
const hostileText = reseal(hostileEnv);

// Tampered payload without reseal: the checksum must refuse it.
const tamperedEnv = JSON.parse(incoming.text);
tamperedEnv.payload.lastSeenMs += 1;
const tamperedText = JSON.stringify(tamperedEnv);

// Unsupported schema version.
const unsupportedText = JSON.stringify({ ...incomingEnv, schemaVersion: 99 });

// Impossible values: negative store quantity, resealed so ONLY the invariant fires.
const impossibleEnv = JSON.parse(incoming.text);
impossibleEnv.payload.sim.store.scrap = -3;
const impossibleText = reseal(impossibleEnv);

const malformedText = "this is not a rustwake save";

const receipt = {
  issue: "https://github.com/darkmatter2222/Rustwake/issues/63",
  pr: "https://github.com/darkmatter2222/Rustwake/pull/108",
  headSha,
  branch,
  server: `vite preview of THIS worktree's pnpm build (dist) at ${url}`,
  capturedAt: new Date().toISOString(),
  seed: {
    via: "src encodeSave + engine applyCommand/advance; lastSeenMs = Date.now() at capture",
    current: { tick: "per-context buildCurrent()", machines: 1, tutorial: 9 },
    incoming: { tick: incoming.sim.tick, machines: incoming.sim.machines.length, settings: incoming.settings },
  },
  fixtureScrutiny: [
    { fixture: "older save", mutation: "delete sim.research, sim.spares, 8 machine counters, 2 route counters; reseal with the game's own checksum", exercises: "migrate() backfill through the REAL UI import path; never weakens decode", where: "probe only" },
    { fixture: "hostile settings", mutation: "payload.settings = {muted:'yes', reducedMotion:null, textScale:99}; reseal", exercises: "sanitizeSettings on import AND the root --text-scale clamp (99 -> 2)", where: "probe only" },
    { fixture: "tampered checksum", mutation: "payload.lastSeenMs += 1 WITHOUT reseal", exercises: "checksum refusal before any mutation", where: "probe only" },
    { fixture: "unsupported version", mutation: "schemaVersion = 99", exercises: "schema refusal before any mutation", where: "probe only" },
    { fixture: "impossible values", mutation: "sim.store.scrap = -3; reseal", exercises: "validateSim invariant refusal (detail 'store')", where: "probe only" },
    { fixture: "malformed / empty", mutation: "plain non-JSON text / empty field", exercises: "parse + empty refusals", where: "probe only" },
    { fixture: "clipboard/download failure env", mutation: "addInitScript removes navigator.clipboard and URL.createObjectURL/revokeObjectURL", exercises: "the manual-copy / download-unavailable notes in a real browser", where: "probe only (browser env, not src)" },
    { fixture: "tutorial unlock", mutation: "seed sim.tutorial = 9", exercises: "B-06 Yard destination reachability without playing the tutorial", where: "probe only" },
  ],
  liveSimTolerance: "yard steps ~10 ticks/s and render/checkpoint may lead each other by a step; tick/credits/save-size asserted as symmetric bounds vs an atomic rows+localStorage read; machines/routes/settings/research/spares asserted exactly; a refused import must keep tick far below the incoming tick",
  formFactors: {},
  failures: [],
};

function record(ff, phase, name, pass, detail) {
  const bucket = (receipt.formFactors[ff] ??= { viewport: null, phases: [] });
  let ph = bucket.phases.find((p) => p.name === phase);
  if (!ph) bucket.phases.push((ph = { name: phase, assertions: [], screenshots: [] }));
  ph.assertions.push({ name, pass, detail });
  if (!pass) receipt.failures.push(`${ff}/${phase}: ${name} — ${detail}`);
}
/** Collect-all (research-58 pattern): one run surfaces every failure so the
 *  CSS can be iterated against the full measured picture. Hard flow breaks
 *  (missing selectors, timeouts) still throw through the waits themselves. */
function assert(ff, phase, name, cond, detail = "") {
  record(ff, phase, name, Boolean(cond), detail);
}

/* ---- full-frame pixel audit (decode the PNG in Chromium itself) ---- */
async function auditFrame(page, buf, ff, phase, file, viewport, dsf, content) {
  const stats = await page.evaluate(
    async ({ b64, content, dsf }) => {
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = `data:image/png;base64,${b64}`;
      });
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      const r = typeof content === "string" ? document.querySelector(content)?.getBoundingClientRect() : content;
      const rx0 = Math.max(0, Math.floor((r?.left ?? 0) * dsf));
      const ry0 = Math.max(0, Math.floor((r?.top ?? 0) * dsf));
      const rx1 = Math.min(c.width, Math.ceil((r?.right ?? 0) * dsf));
      const ry1 = Math.min(c.height, Math.ceil((r?.bottom ?? 0) * dsf));
      const colors = new Set();
      let dark = 0;
      let bright = 0;
      let total = 0;
      for (let y = 0; y < c.height; y += 7) {
        for (let x = 0; x < c.width; x += 7) {
          const i = (y * c.width + x) * 4;
          const rr = data[i];
          const gg = data[i + 1];
          const bb = data[i + 2];
          colors.add(((rr >> 3) << 10) | ((gg >> 3) << 5) | (bb >> 3));
          const lum = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
          if (lum < 40) dark += 1;
          if (lum > 160) bright += 1;
          total += 1;
        }
      }
      let regionBright = 0;
      let regionTotal = 0;
      for (let y = ry0; y < ry1; y += 7) {
        for (let x = rx0; x < rx1; x += 7) {
          const i = (y * c.width + x) * 4;
          const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
          regionTotal += 1;
          if (lum > 160) regionBright += 1;
        }
      }
      return {
        width: img.width,
        height: img.height,
        distinctColors: colors.size,
        darkShare: +(dark / total).toFixed(4),
        brightShare: +(bright / total).toFixed(4),
        samples: total,
        content: typeof content === "string" ? content : "content-box",
        region: { box: { x0: rx0, y0: ry0, x1: rx1, y1: ry1 }, brightShare: regionTotal ? +(regionBright / regionTotal).toFixed(4) : 0, samples: regionTotal },
      };
    },
    { b64: buf.toString("base64"), content, dsf }
  );
  const ph = receipt.formFactors[ff].phases.find((p) => p.name === phase);
  ph.screenshots.push({ file, ...stats });
  assert(ff, phase, `pixel audit ${file}: full frame dims`, stats.width === viewport.width * dsf && stats.height === viewport.height * dsf, JSON.stringify({ w: stats.width, h: stats.height }));
  assert(ff, phase, `pixel audit ${file}: not blank`, stats.distinctColors > 24, `distinctColors=${stats.distinctColors}`);
  assert(ff, phase, `pixel audit ${file}: dark UI`, stats.darkShare > 0.2, `darkShare=${stats.darkShare}`);
  if (typeof content !== "string") {
    const bx = stats.region.box;
    assert(ff, phase, `pixel audit ${file}: card region is NOT the full frame`, (bx.x0 > 0 || bx.y0 > 0) && (bx.x1 < stats.width || bx.y1 < stats.height), JSON.stringify(bx));
  }
  assert(ff, phase, `pixel audit ${file}: lit text in ${stats.content}`, stats.region.samples > 0 && stats.region.brightShare > 0.004, JSON.stringify(stats.region));
}

const allShots = [];
async function shot(page, ff, phase, file, viewport, dsf, content) {
  const buf = await page.screenshot({ fullPage: false });
  const name = `${ff}-${file}`;
  writeFileSync(resolve(framesDir, name), buf);
  allShots.push({ file: name, ff, sha256: createHash("sha256").update(buf).digest("hex"), bytes: buf.length });
  await auditFrame(page, buf, ff, phase, name, viewport, dsf, content);
}

/* ---- real-UI helpers ---- */
const PANEL = '.panel[aria-label="Yard record"]';
const clickText = async (page, label, scope = "button") => {
  const handle = await page.evaluateHandle(
    ({ label, scope }) =>
      [...document.querySelectorAll(scope)].find((node) =>
        (node.getAttribute("aria-label") ?? node.textContent ?? "").trim().startsWith(label)
      ),
    { label, scope }
  );
  const el = handle.asElement();
  if (!el) throw new Error(`clickText: no ${scope} starts with "${label}"`);
  await el.click();
};
const waitNote = async (page, text) => {
  try {
    await page.waitForFunction(
      ({ sel, text }) => document.querySelector(`${sel} .status-line`)?.textContent?.includes(text),
      { sel: PANEL, text },
      { timeout: 8000 }
    );
  } catch {
    const actual = await noteText(page).catch(() => "<unreadable>");
    throw new Error(`waitNote("${text}") timed out; actual note: "${actual}"`);
  }
};
const noteText = (page) => page.evaluate((sel) => document.querySelector(`${sel} .status-line`)?.textContent?.trim() ?? "", PANEL);
const activeLabel = (page) =>
  page.evaluate(() => {
    const a = document.activeElement;
    return (a?.getAttribute("aria-label") ?? a?.textContent ?? "").trim();
  });
/** Atomic mirror read: rows + localStorage in ONE evaluate (no RAF between). */
const readMirror = (page) =>
  page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    const env = raw ? JSON.parse(raw) : null;
    return { raw, sim: env?.payload?.sim ?? null, settings: env?.payload?.settings ?? null };
  }, SAVE_KEY);
const readRecord = (page) =>
  page.evaluate((key) => {
    const rows = [...document.querySelectorAll(`${'.panel[aria-label="Yard record"]'} .save-stat`)].map((n) => ({
      label: n.querySelector("dt")?.textContent?.trim() ?? "",
      value: n.querySelector("dd")?.textContent?.trim() ?? "",
    }));
    const raw = localStorage.getItem(key);
    return { rows, raw, sim: raw ? JSON.parse(raw).payload.sim : null };
  }, SAVE_KEY);
const noScroll = (page) =>
  page.evaluate(() => ({
    ok: document.documentElement.scrollHeight <= window.innerHeight + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1,
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
  }));
/** Panel-body geometry: the spec 6.4 "0 px inner panel scroll" measurement. */
const panelGeom = (page) =>
  page.evaluate((sel) => {
    const panel = document.querySelector(sel);
    const body = panel?.querySelector(".panel__body");
    const root = document.documentElement;
    return {
      present: Boolean(panel),
      body: body
        ? { scrollTop: body.scrollTop, scrollHeight: body.scrollHeight, clientHeight: body.clientHeight, overflowY: getComputedStyle(body).overflowY }
        : null,
      panelRect: panel ? (({ left, top, right, bottom }) => ({ left, top, right, bottom }))(panel.getBoundingClientRect()) : null,
      rootFontSize: getComputedStyle(root).fontSize,
      textLarge: root.classList.contains("text-large"),
      scaleVar: root.style.getPropertyValue("--text-scale"),
      railMode: matchMedia("(min-width: 1200px), (min-width: 600px) and (max-height: 460px)").matches,
      canvas: (() => {
        const c = document.querySelector("canvas");
        return c ? { w: c.width, h: c.height } : null;
      })(),
    };
  }, PANEL);
async function assertPanelFits(page, ff, phase) {
  const geo = await panelGeom(page);
  assert(ff, phase, "panel present", geo.present, JSON.stringify(geo));
  assert(ff, phase, "0px inner panel scroll (body.scrollHeight <= clientHeight)", geo.body && geo.body.scrollHeight <= geo.body.clientHeight, JSON.stringify(geo.body));
  assert(ff, phase, "panel body not scrolled", geo.body && geo.body.scrollTop === 0, JSON.stringify(geo.body));
  const ns = await noScroll(page);
  assert(ff, phase, "no page scroll", ns.ok, JSON.stringify(ns));
  return geo;
}
async function buttonHeights(page, scope) {
  return page.evaluate((scope) => {
    const root = scope ? document.querySelector(scope) : document;
    return [...(root?.querySelectorAll("button") ?? [])]
      .filter((b) => b.getBoundingClientRect().width > 0)
      .map((b) => ({ label: (b.getAttribute("aria-label") ?? b.textContent ?? "").trim().slice(0, 40), h: Math.round(b.getBoundingClientRect().height) }));
  }, scope);
}
async function assertTargets(page, ff, phase, scope) {
  const rows = await buttonHeights(page, scope);
  const bad = rows.filter((r) => r.h < 44);
  assert(ff, phase, `touch targets >= 44px in ${scope ?? "document"}`, bad.length === 0, JSON.stringify(bad.length ? bad : rows.map((r) => r.h)));
}
const contentBox = (page, selectors) =>
  page.evaluate((selectors) => {
    const rects = [...document.querySelectorAll(selectors)].map((n) => n.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
    if (!rects.length) return null;
    return { left: Math.min(...rects.map((r) => r.left)), top: Math.min(...rects.map((r) => r.top)), right: Math.max(...rects.map((r) => r.right)), bottom: Math.max(...rects.map((r) => r.bottom)) };
  }, selectors);
const panelContent = (page) => contentBox(page, `${PANEL} .panel__head, ${PANEL} .panel__body`);

/** The real player path to the Yard record: rail slot where rail mode owns it,
 *  dock Yard button otherwise (phone portrait). */
async function openYard(page) {
  const via = await page.evaluate(() => {
    const slot = document.querySelector('.shell-rail__slot[data-slot="yard"]');
    if (slot && slot.getBoundingClientRect().width > 0) return "rail";
    const dock = [...document.querySelectorAll(".dock button")].find((b) => b.textContent.trim() === "Yard");
    return dock ? "dock" : "none";
  });
  if (via === "rail") await page.click('.shell-rail__slot[data-slot="yard"]');
  else if (via === "dock") await clickText(page, "Yard", ".dock button");
  else throw new Error("openYard: no rail yard slot or dock Yard button");
  await page.waitForSelector(PANEL);
  return via;
}
async function dismissReport(page) {
  const el = await page.$(".panel--report .panel__head .icon-btn");
  if (el) {
    await el.click();
    await page.waitForSelector(".panel--report", { state: "detached" });
    return true;
  }
  return false;
}
async function boot(page) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector(".gate__btn", { timeout: 20000 });
  await page.click(".gate__btn");
  await page.waitForSelector(".dock, .shell-rail", { timeout: 20000 });
  await dismissReport(page);
}
const fillImport = (page, text) => page.fill("#rustwake-save-import", text);
async function openGate(page, text) {
  await fillImport(page, text);
  await clickText(page, "Apply", `${PANEL} button`);
  await page.waitForSelector(".import-confirm", { timeout: 8000 });
}
const gateGeom = (page) =>
  page.evaluate(() => {
    const scrim = document.querySelector(".import-confirm__scrim");
    const d = document.querySelector(".import-confirm");
    if (!d || !scrim) return { present: false };
    const s = scrim.getBoundingClientRect();
    const r = d.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const confirm = d.querySelector(".import-confirm__replace");
    const a = document.activeElement;
    return {
      present: true,
      role: d.getAttribute("role"),
      ariaModal: d.getAttribute("aria-modal"),
      ariaLabel: d.getAttribute("aria-label"),
      scrim: { left: s.left, top: s.top, width: s.width, height: s.height, position: getComputedStyle(scrim).position, zIndex: getComputedStyle(scrim).zIndex },
      dialog: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, scrollHeight: d.scrollHeight, clientHeight: d.clientHeight },
      inner: { w: window.innerWidth, h: window.innerHeight },
      topmost: Boolean(hit?.closest(".import-confirm")),
      confirmDisabled: confirm ? confirm.disabled : null,
      activeLabel: (a?.getAttribute("aria-label") ?? a?.textContent ?? "").trim(),
    };
  });
/** Structural identity of the yard: what a refused/canceled import must NOT touch. */
const structure = (sim) =>
  JSON.stringify({
    machines: sim.machines.map((m) => [m.id, m.tile, m.blueprint]),
    routes: sim.routes.map((r) => [r.from, r.to, r.filter]),
    research: sim.research ?? null,
    spares: sim.spares ?? null,
  });
async function assertUntouched(page, ff, phase, before, incomingTick) {
  const after = await readMirror(page);
  assert(ff, phase, "refusal/cancel: yard structure identical", structure(after.sim) === structure(before.sim), "structure changed");
  assert(ff, phase, "refusal/cancel: settings identical", JSON.stringify(after.settings) === JSON.stringify(before.settings), JSON.stringify(after.settings));
  assert(ff, phase, "refusal/cancel: tick monotonic, never the incoming yard", after.sim.tick >= before.sim.tick && after.sim.tick < incomingTick, JSON.stringify({ before: before.sim.tick, after: after.sim.tick, incomingTick }));
  assert(ff, phase, "refusal/cancel: no dialog left open", (await page.locator(".import-confirm").count()) === 0);
  return after;
}
function watchConsole(page, sink) {
  page.on("console", (msg) => {
    const text = msg.text();
    if (msg.type() === "error") sink.errors.push(text);
    if (/AudioContext|autoplay|user gesture/i.test(text)) sink.autoplay.push(text);
  });
  page.on("pageerror", (err) => sink.pageerrors.push(String(err)));
}
/** Seed ONCE per context: addInitScript runs on EVERY navigation (including
 *  reload and the reader's second page), and re-seeding would overwrite the
 *  live checkpoint the probe is meant to observe. */
const seedInit = (text) =>
  `if (localStorage.getItem(${JSON.stringify(SAVE_KEY)}) === null) localStorage.setItem(${JSON.stringify(SAVE_KEY)}, ${JSON.stringify(text)});`;
const leaseOwner = (page) =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null")?.owner ?? null, LEASE_KEY);
/** The export textarea is the render-time checkpoint; the storage raw is the
 *  last persist. In the live app they may lead each other by a step, so identity
 *  is asserted as: both decode, structure + settings EXACT, tick within bound.
 *  (Same-instant byte identity is proven in the jsdom suite, which has no loop.) */
async function assertExportCurrent(page, ff, phase, selector) {
  const atomic = await page.evaluate(
    ({ key, sel }) => ({ value: document.querySelector(sel)?.value ?? null, raw: localStorage.getItem(key), readOnly: document.querySelector(sel)?.readOnly ?? null }),
    { key: SAVE_KEY, sel: selector }
  );
  const v = decodeSave(atomic.value ?? "");
  const r = decodeSave(atomic.raw ?? "");
  assert(ff, phase, "export textarea decodes as a valid save", v.ok, JSON.stringify(v.ok ? {} : v));
  assert(ff, phase, "export textarea is read-only", atomic.readOnly === true, JSON.stringify(atomic.readOnly));
  if (v.ok && r.ok) {
    assert(ff, phase, "export structure identical to the checkpoint", structure(v.payload.sim) === structure(r.payload.sim), "structure differs");
    assert(ff, phase, "export settings identical to the checkpoint", JSON.stringify(v.payload.settings) === JSON.stringify(r.payload.settings), JSON.stringify({ export: v.payload.settings, checkpoint: r.payload.settings }));
    assert(ff, phase, "export tick within live-sim bound of the checkpoint", Math.abs(v.payload.sim.tick - r.payload.sim.tick) <= 100, JSON.stringify({ exportTick: v.payload.sim.tick, checkpointTick: r.payload.sim.tick }));
  }
}

/* ---- one form factor at one text scale: the full acceptance flow ---- */
async function runScale(browser, ff, viewport, dsf, isMobile, scale) {
  const consoleSink = { errors: [], autoplay: [], pageerrors: [] };
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf, isMobile, hasTouch: isMobile, acceptDownloads: true });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(url).origin });
  const current = buildCurrent(scale);
  await ctx.addInitScript(seedInit(current.text));
  const page = await ctx.newPage();
  watchConsole(page, consoleSink);
  const T = (p) => `ts${scale}-${p}`;
  await boot(page);
  const via = await openYard(page);

  /* record page: every statistic, both transfer entries, geometry */
  {
    const P = T("record");
    const rec = await readRecord(page);
    const expected = summarizeYard(rec.sim);
    const val = (label) => rec.rows.find((r) => r.label === label)?.value;
    assert(ff, P, "six statistics present", rec.rows.length === 6, JSON.stringify(rec.rows));
    assert(ff, P, "Machines exact", val("Machines") === String(expected.machines), JSON.stringify(rec.rows));
    assert(ff, P, "Drones exact", val("Drones") === String(expected.drones), JSON.stringify(rec.rows));
    assert(ff, P, "Links exact", val("Links") === String(expected.links), JSON.stringify(rec.rows));
    // The render and the checkpoint may lead each other by a step (notify vs
    // persist ordering), so the bound is symmetric: same yard, a few ticks apart.
    const tickShown = Number(val("Tick"));
    assert(ff, P, "Tick within live-sim bound", Math.abs(rec.sim.tick - tickShown) <= 100, JSON.stringify({ tickShown, mirror: rec.sim.tick }));
    const creditsShown = Number(val("Credits"));
    assert(ff, P, "Credits within live-sim bound", Math.abs(rec.sim.credits - creditsShown) <= 500, JSON.stringify({ creditsShown, mirror: rec.sim.credits }));
    const saveShown = Number((val("Save") ?? "").replace(/\D/g, ""));
    assert(ff, P, "Save size within live-sim bound", Math.abs(saveShown - rec.raw.length) <= 64, JSON.stringify({ saveShown, rawLength: rec.raw.length }));
    assert(ff, P, "Backup + Import + Close entries", (await page.locator(`${PANEL} button`, { hasText: "Backup" }).count()) === 1 && (await page.locator(`${PANEL} button`, { hasText: "Import" }).count()) === 1 && (await page.locator(`${PANEL} button`, { hasText: "Close" }).count()) === 1);
    const geo = await assertPanelFits(page, ff, P);
    assert(ff, P, `text scale ${scale} applied at root`, geo.scaleVar === String(scale) && geo.textLarge === (scale >= 1.5), JSON.stringify({ scaleVar: geo.scaleVar, textLarge: geo.textLarge, rootFontSize: geo.rootFontSize }));
    assert(ff, P, "yard canvas painted (device buffer)", geo.canvas && geo.canvas.w > 0 && geo.canvas.h > 0, JSON.stringify(geo.canvas));
    await assertTargets(page, ff, P, PANEL);
    receipt.formFactors[ff].phases.find((p) => p.name === P).geometry = { via, ...geo };
    await shot(page, ff, P, `ts${scale}-01-record.png`, viewport, dsf, await panelContent(page));
  }

  /* backup page: byte-identical export, real clipboard + download round trips */
  {
    const P = T("backup");
    await clickText(page, "Backup", `${PANEL} button`);
    await page.waitForSelector("#rustwake-save-export");
    assert(ff, P, "backup heading names the act", (await page.locator(`${PANEL} .save-heading`).textContent()).trim() === SAVE_COPY.backupHeading);
    await assertExportCurrent(page, ff, P, "#rustwake-save-export");
    await assertPanelFits(page, ff, P);
    await assertTargets(page, ff, P, PANEL);
    await shot(page, ff, P, `ts${scale}-02-backup.png`, viewport, dsf, await panelContent(page));

    // Real clipboard round trip: write through the UI, read back through the API.
    const preTick = (await readMirror(page)).sim.tick;
    await clickText(page, "Copy", `${PANEL} button`);
    await waitNote(page, "Copied to the clipboard");
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    const clipDecoded = decodeSave(clip);
    assert(ff, P, "clipboard round trip: valid save written", clipDecoded.ok, JSON.stringify(clipDecoded.ok ? {} : clipDecoded));
    if (clipDecoded.ok) {
      assert(ff, P, "clipboard round trip: tick in live-sim window", clipDecoded.payload.sim.tick >= preTick && clipDecoded.payload.sim.tick <= preTick + 200, JSON.stringify({ clipTick: clipDecoded.payload.sim.tick, preTick }));
    }

    // Real download: the browser's own download event, file bytes decoded.
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 10000 }), clickText(page, "Download", `${PANEL} button`)]);
    const fname = download.suggestedFilename();
    assert(ff, P, "download file name carries the tick", /^rustwake-yard-tick-\d+\.json$/.test(fname), fname);
    const dlPath = await download.path();
    const dlText = readFileSync(dlPath, "utf8");
    const dlDecoded = decodeSave(dlText);
    assert(ff, P, "downloaded file is a valid save", dlDecoded.ok, JSON.stringify(dlDecoded.ok ? {} : dlDecoded));
    if (dlDecoded.ok) {
      assert(ff, P, "downloaded tick matches file name", dlDecoded.payload.sim.tick === Number(fname.match(/tick-(\d+)/)[1]), JSON.stringify({ dlTick: dlDecoded.payload.sim.tick, fname }));
      assert(ff, P, "downloaded file name uses exportFileName()", fname === exportFileName(dlDecoded.payload.sim.tick), fname);
    }
    await waitNote(page, SAVE_COPY.downloadStarted);
    await clickText(page, "Back", `${PANEL} button`);
    await page.waitForSelector(`${PANEL} .save-stats`);
  }

  /* replace page: every refusal explains itself and never mutates */
  {
    const P = T("refusals");
    await clickText(page, "Import", `${PANEL} button`);
    await page.waitForSelector("#rustwake-save-import");
    assert(ff, P, "replace heading names the act", (await page.locator(`${PANEL} .save-heading`).textContent()).trim() === SAVE_COPY.replaceHeading);
    assert(ff, P, "replace hint: nothing replaced until confirm", (await page.locator(`${PANEL} .save-hint`).textContent()).includes("Nothing is replaced until you confirm"));
    await assertPanelFits(page, ff, P);
    const cases = [
      ["empty", "", "Nothing pasted"],
      ["malformed", malformedText, "Not a Rustwake file"],
      ["unsupported version", unsupportedText, "Newer version than this build"],
      ["tampered checksum", tamperedText, "Damaged file"],
      ["impossible values", impossibleText, "Impossible values (store)"],
    ];
    for (const [name, text, note] of cases) {
      const before = await readMirror(page);
      await fillImport(page, text);
      await clickText(page, "Apply", `${PANEL} button`);
      await waitNote(page, note);
      assert(ff, P, `refusal ${name}: note explains`, (await noteText(page)).includes(note), await noteText(page));
      assert(ff, P, `refusal ${name}: no confirmation gate`, (await page.locator(".import-confirm").count()) === 0);
      await assertUntouched(page, ff, P, before, incoming.sim.tick);
    }
    await assertTargets(page, ff, P, PANEL);
    await shot(page, ff, P, `ts${scale}-03-refusal.png`, viewport, dsf, await panelContent(page));
  }

  /* the gate: preview, export-first offer, ack gating, cancel/escape, confirm */
  {
    const P = T("gate");
    const before = await readMirror(page);
    await openGate(page, olderText);
    const geo = await gateGeom(page);
    assert(ff, P, "alertdialog + aria-modal + label", geo.role === "alertdialog" && geo.ariaModal === "true" && geo.ariaLabel === SAVE_COPY.confirmTitle, JSON.stringify({ role: geo.role, ariaModal: geo.ariaModal, ariaLabel: geo.ariaLabel }));
    assert(ff, P, "fixed scrim spans the viewport", geo.scrim.position === "fixed" && Math.abs(geo.scrim.left) < 1 && Math.abs(geo.scrim.top) < 1 && Math.abs(geo.scrim.width - geo.inner.w) < 1 && Math.abs(geo.scrim.height - geo.inner.h) < 1, JSON.stringify(geo.scrim));
    assert(ff, P, "dialog inside the viewport", geo.dialog.left >= 0 && geo.dialog.top >= 0 && geo.dialog.right <= geo.inner.w && geo.dialog.bottom <= geo.inner.h, JSON.stringify(geo.dialog));
    assert(ff, P, "dialog topmost at its center", geo.topmost, JSON.stringify(geo));
    assert(ff, P, "Cancel owns initial focus", geo.activeLabel === "Cancel", geo.activeLabel);
    assert(ff, P, "confirm disabled before acknowledgement", geo.confirmDisabled === true, JSON.stringify(geo.confirmDisabled));
    assert(ff, P, "warning names the consequence", (await page.locator("#import-confirm-warning").textContent()).includes("replaces your current yard"));

    // Preview columns: incoming EXACT (pure decode), current within live bound.
    const cols = await page.evaluate((key) => {
      const read = (sel) => [...document.querySelectorAll(`${sel} .import-confirm__row`)].map((n) => ({ label: n.querySelector("dt")?.textContent?.trim() ?? "", value: n.querySelector("dd")?.textContent?.trim() ?? "" }));
      const columns = [...document.querySelectorAll(".import-confirm__column")];
      return { headings: columns.map((c) => c.querySelector("h3")?.textContent?.trim()), current: read(".import-confirm__column:nth-child(1)"), incoming: read(".import-confirm__column:nth-child(2)"), raw: localStorage.getItem(key) };
    }, SAVE_KEY);
    assert(ff, P, "preview headings Current yard / Incoming save", cols.headings[0] === SAVE_COPY.currentHeading && cols.headings[1] === SAVE_COPY.incomingHeading, JSON.stringify(cols.headings));
    const incVal = (label) => cols.incoming.find((r) => r.label === label)?.value;
    assert(ff, P, "incoming preview exact (migrated older save)", incVal("Tick") === String(olderPreview.preview.summary.tick) && incVal("Machines") === String(olderPreview.preview.summary.machines) && incVal("Drones") === String(olderPreview.preview.summary.drones) && incVal("Links") === String(olderPreview.preview.summary.links) && incVal("Credits") === String(olderPreview.preview.summary.credits), JSON.stringify(cols.incoming));
    const curTick = Number(cols.current.find((r) => r.label === "Tick")?.value);
    const mirrorSim = JSON.parse(cols.raw).payload.sim;
    assert(ff, P, "current preview within live-sim bound", Math.abs(mirrorSim.tick - curTick) <= 100, JSON.stringify({ curTick, mirror: mirrorSim.tick }));
    const expectedLine = settingsChangeLine({ ...DEFAULT_SETTINGS, textScale: scale }, incoming.settings);
    assert(ff, P, "settings consequence line", (await page.locator(".import-confirm__settings").textContent()).trim() === expectedLine, expectedLine);
    assert(ff, P, "export-first offer present", (await page.locator(".import-confirm__offer").textContent()).includes("Back up the current yard first") && (await page.locator(".import-confirm button", { hasText: "Copy current save" }).count()) === 1 && (await page.locator(".import-confirm button", { hasText: "Download current save" }).count()) === 1);
    // The offer's copy button is a real clipboard path too.
    await clickText(page, "Copy current save", ".import-confirm button");
    await page.waitForFunction(() => document.querySelector(".import-confirm .status-line")?.textContent?.includes("Copied"), { timeout: 8000 });
    const offerClip = await page.evaluate(() => navigator.clipboard.readText());
    assert(ff, P, "export-first copy wrote a valid save", decodeSave(offerClip).ok);

    // Ack gating, then bounded-dialog geometry + targets (scroll if it must).
    await page.click(".import-confirm__ack input");
    assert(ff, P, "confirm enabled after acknowledgement", (await page.locator(".import-confirm__replace").isDisabled()) === false);
    await page.locator(".import-confirm__replace").scrollIntoViewIfNeeded();
    const geo2 = await gateGeom(page);
    assert(ff, P, "dialog stays inside viewport after scroll", geo2.dialog.left >= 0 && geo2.dialog.top >= 0 && geo2.dialog.right <= geo2.inner.w && geo2.dialog.bottom <= geo2.inner.h, JSON.stringify(geo2.dialog));
    await assertTargets(page, ff, P, ".import-confirm");
    receipt.formFactors[ff].phases.find((p) => p.name === P).geometry = geo2;
    await shot(page, ff, P, `ts${scale}-04-gate.png`, viewport, dsf, ".import-confirm");

    // Cancel: progress intact, focus returns to Apply, panel stays.
    await clickText(page, "Cancel", ".import-confirm button");
    await page.waitForSelector(".import-confirm", { state: "detached" });
    await assertUntouched(page, ff, P, before, incoming.sim.tick);
    assert(ff, P, "Cancel restores focus to Apply", (await activeLabel(page)) === "Apply", await activeLabel(page));
    assert(ff, P, "panel still open after Cancel", (await page.locator(PANEL).count()) === 1);

    // Escape: one press retires ONLY the gate (window capture), panel stays.
    await openGate(page, olderText);
    await page.keyboard.press("Escape");
    await page.waitForSelector(".import-confirm", { state: "detached" });
    await assertUntouched(page, ff, P, before, incoming.sim.tick);
    assert(ff, P, "Escape leaves the replace page open", (await page.locator("#rustwake-save-import").count()) === 1);
    assert(ff, P, "Escape restores focus to Apply", (await activeLabel(page)) === "Apply", await activeLabel(page));

    // Confirmed replacement: the REAL onImport -> store.importSave path.
    await openGate(page, olderText);
    await page.click(".import-confirm__ack input");
    await clickText(page, "Replace yard", ".import-confirm button");
    await page.waitForSelector(".import-confirm", { state: "detached" });
    await waitNote(page, "Applied · tick");
    const after = await readMirror(page);
    assert(ff, P, "import applied: tick is the incoming yard", after.sim.tick >= incoming.sim.tick && after.sim.tick <= incoming.sim.tick + 300, JSON.stringify({ after: after.sim.tick, incoming: incoming.sim.tick }));
    assert(ff, P, "import applied: machines/routes replaced", after.sim.machines.length === incoming.sim.machines.length && after.sim.routes.length === incoming.sim.routes.length, JSON.stringify({ machines: after.sim.machines.length, routes: after.sim.routes.length }));
    assert(ff, P, "older save migrated: research/spares/counters backfilled", JSON.stringify(after.sim.research) === "{}" && Array.isArray(after.sim.spares) && after.sim.spares.length === 0 && after.sim.machines.every((m) => Number.isFinite(m.ageTicks) && Number.isFinite(m.rateAgePrev)) && after.sim.routes.every((r) => Number.isFinite(r.ageTicks)), JSON.stringify({ research: after.sim.research, spares: after.sim.spares }));
    assert(ff, P, "settings refreshed through the store", JSON.stringify(after.settings) === JSON.stringify(incoming.settings), JSON.stringify(after.settings));
    const rootAfter = await page.evaluate(() => ({ scaleVar: document.documentElement.style.getPropertyValue("--text-scale"), textLarge: document.documentElement.classList.contains("text-large") }));
    assert(ff, P, "root text scale refreshed to 1.5", rootAfter.scaleVar === "1.5" && rootAfter.textLarge === true, JSON.stringify(rootAfter));
    assert(ff, P, "confirm restores focus to Apply", (await activeLabel(page)) === "Apply", await activeLabel(page));
    // Record + export refresh consistently after the import.
    await clickText(page, "Back", `${PANEL} button`);
    await page.waitForSelector(`${PANEL} .save-stats`);
    const recAfter = await readRecord(page);
    assert(ff, P, "record refreshed: machines incoming", recAfter.rows.find((r) => r.label === "Machines")?.value === String(incoming.sim.machines.length), JSON.stringify(recAfter.rows));
    await assertPanelFits(page, ff, P);
    await shot(page, ff, P, `ts${scale}-05-after-import.png`, viewport, dsf, await panelContent(page));
    await clickText(page, "Backup", `${PANEL} button`);
    await page.waitForSelector("#rustwake-save-export");
    await assertExportCurrent(page, ff, P, "#rustwake-save-export");
    await clickText(page, "Back", `${PANEL} button`);
    await page.waitForSelector(`${PANEL} .save-stats`);
  }

  /* reload: no double-apply, the imported yard persists */
  {
    const P = T("reload");
    const preReload = await readMirror(page);
    const preOwner = await leaseOwner(page);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".gate__btn", { timeout: 20000 });
    await page.click(".gate__btn");
    await page.waitForSelector(".dock, .shell-rail", { timeout: 20000 });
    await dismissReport(page);
    // The reloaded document gets a NEW lease id; the old record stays fresh for
    // up to LEASE_TTL_MS (1.5 s), so the page boots reader and the store's own
    // claim() adopts the stale lease on a later step. Wait for that adoption
    // through the app's own lease record before exercising writes again.
    await page.waitForFunction(
      ({ k, old }) => {
        const r = JSON.parse(localStorage.getItem(k) ?? "null");
        return Boolean(r) && r.owner !== old;
      },
      { k: LEASE_KEY, old: preOwner },
      { timeout: 10000 }
    );
    assert(ff, P, "reload: writer lease re-adopted by the new document", (await leaseOwner(page)) !== preOwner, JSON.stringify({ preOwner, post: await leaseOwner(page) }));
    await openYard(page);
    const post = await readMirror(page);
    assert(ff, P, "reload: imported tick persists (no double-apply, no reset)", post.sim.tick >= incoming.sim.tick && post.sim.tick <= preReload.sim.tick + 600, JSON.stringify({ post: post.sim.tick, incoming: incoming.sim.tick, preReload: preReload.sim.tick }));
    assert(ff, P, "reload: machines/routes stable", post.sim.machines.length === incoming.sim.machines.length && post.sim.routes.length === incoming.sim.routes.length, JSON.stringify({ machines: post.sim.machines.length }));
    assert(ff, P, "reload: settings stable", JSON.stringify(post.settings) === JSON.stringify(incoming.settings), JSON.stringify(post.settings));
    const rec = await readRecord(page);
    assert(ff, P, "reload: record shows the imported yard", rec.rows.find((r) => r.label === "Machines")?.value === String(incoming.sim.machines.length), JSON.stringify(rec.rows));
    await assertPanelFits(page, ff, P);
    await shot(page, ff, P, `ts${scale}-06-reload.png`, viewport, dsf, await panelContent(page));
  }

  /* hostile settings: the sanitizer clamps on the real import path */
  {
    const P = T("hostile");
    await clickText(page, "Import", `${PANEL} button`);
    await page.waitForSelector("#rustwake-save-import");
    await openGate(page, hostileText);
    await page.click(".import-confirm__ack input");
    await clickText(page, "Replace yard", ".import-confirm button");
    await page.waitForSelector(".import-confirm", { state: "detached" });
    await waitNote(page, "Applied · tick");
    const after = await readMirror(page);
    assert(ff, P, "hostile settings sanitized on import", JSON.stringify(after.settings) === JSON.stringify({ muted: false, reducedMotion: false, textScale: 2 }), JSON.stringify(after.settings));
    const rootAfter = await page.evaluate(() => ({ scaleVar: document.documentElement.style.getPropertyValue("--text-scale"), textLarge: document.documentElement.classList.contains("text-large") }));
    assert(ff, P, "textScale 99 clamped to 2 at the root", rootAfter.scaleVar === "2" && rootAfter.textLarge === true, JSON.stringify(rootAfter));
    await assertPanelFits(page, ff, P);
    await shot(page, ff, P, `ts${scale}-07-hostile-clamp.png`, viewport, dsf, await panelContent(page));
  }

  assert(ff, T("console"), "no console errors", consoleSink.errors.length === 0, JSON.stringify(consoleSink.errors));
  assert(ff, T("console"), "no page errors", consoleSink.pageerrors.length === 0, JSON.stringify(consoleSink.pageerrors));
  assert(ff, T("console"), "no autoplay warnings", consoleSink.autoplay.length === 0, JSON.stringify(consoleSink.autoplay));
  receipt.formFactors[ff].console ??= {};
  receipt.formFactors[ff].console[`ts${scale}`] = consoleSink;
  await ctx.close();
}

/* ---- reader tab: the second tab may preview, never replace ---- */
async function runReader(browser, ff, viewport, dsf, isMobile) {
  const consoleSink = { errors: [], autoplay: [], pageerrors: [] };
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf, isMobile, hasTouch: isMobile });
  const current = buildCurrent(1);
  await ctx.addInitScript(seedInit(current.text));
  const writer = await ctx.newPage();
  watchConsole(writer, consoleSink);
  await boot(writer);
  await openYard(writer);
  // The writer keeps stepping (lease heartbeat) while the reader boots.
  const reader = await ctx.newPage();
  watchConsole(reader, consoleSink);
  const P = "reader-tab";
  await boot(reader);
  const role = await reader.evaluate(() => document.querySelector(".gate__save")?.textContent ?? "");
  await openYard(reader);
  await clickText(reader, "Import", `${PANEL} button`);
  await reader.waitForSelector("#rustwake-save-import");
  const before = await readMirror(reader);
  await openGate(reader, incoming.text);
  assert(ff, P, "reader may open the preview gate", (await reader.locator(".import-confirm").count()) === 1, role);
  await reader.click(".import-confirm__ack input");
  await clickText(reader, "Replace yard", ".import-confirm button");
  await reader.waitForSelector(".import-confirm", { state: "detached" });
  await waitNote(reader, "Another tab is writing this yard");
  await assertUntouched(reader, ff, P, before, incoming.sim.tick);
  await assertPanelFits(reader, ff, P);
  await shot(reader, ff, P, "reader-01-refused.png", viewport, dsf, await panelContent(reader));
  // The writer's yard is still the original, still running.
  const writerMirror = await readMirror(writer);
  assert(ff, P, "writer yard untouched by the reader's attempt", writerMirror.sim.machines.length === current.sim.machines.length && writerMirror.sim.tick < incoming.sim.tick, JSON.stringify({ machines: writerMirror.sim.machines.length, tick: writerMirror.sim.tick }));
  assert(ff, P, "no console errors (reader context)", consoleSink.errors.length === 0, JSON.stringify(consoleSink.errors));
  assert(ff, P, "no page errors (reader context)", consoleSink.pageerrors.length === 0, JSON.stringify(consoleSink.pageerrors));
  receipt.formFactors[ff].console ??= {};
  receipt.formFactors[ff].console.reader = consoleSink;
  await ctx.close();
}

/* ---- failure environment: no clipboard API, no object URLs ---- */
async function runFailureEnv(browser, ff, viewport, dsf, isMobile) {
  const consoleSink = { errors: [], autoplay: [], pageerrors: [] };
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf, isMobile, hasTouch: isMobile });
  const current = buildCurrent(1);
  await ctx.addInitScript(seedInit(current.text));
  // Probe-side browser restriction (documented in fixtureScrutiny): remove the
  // clipboard API and object-URL download path, exactly the jsdom suite's stubs.
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    URL.createObjectURL = undefined;
    URL.revokeObjectURL = undefined;
  });
  const page = await ctx.newPage();
  watchConsole(page, consoleSink);
  const P = "failure-env";
  await boot(page);
  await openYard(page);
  await clickText(page, "Backup", `${PANEL} button`);
  await page.waitForSelector("#rustwake-save-export");
  const before = await readMirror(page);
  await clickText(page, "Copy", `${PANEL} button`);
  await waitNote(page, "Select the text and copy it");
  assert(ff, P, "clipboard failure: manual-copy note", (await noteText(page)).includes("Select the text and copy it"), await noteText(page));
  await clickText(page, "Download", `${PANEL} button`);
  await waitNote(page, SAVE_COPY.downloadFailed);
  assert(ff, P, "download failure: copy-instead note", (await noteText(page)).includes(SAVE_COPY.downloadFailed), await noteText(page));
  await assertUntouched(page, ff, P, before, incoming.sim.tick);
  await assertPanelFits(page, ff, P);
  await shot(page, ff, P, "failenv-01-notes.png", viewport, dsf, await panelContent(page));
  assert(ff, P, "no console errors (failure env)", consoleSink.errors.length === 0, JSON.stringify(consoleSink.errors));
  assert(ff, P, "no page errors (failure env)", consoleSink.pageerrors.length === 0, JSON.stringify(consoleSink.pageerrors));
  receipt.formFactors[ff].console ??= {};
  receipt.formFactors[ff].console.failureEnv = consoleSink;
  await ctx.close();
}

async function runFormFactor(browser, ff, viewport, dsf, isMobile) {
  receipt.formFactors[ff] = { viewport: { ...viewport, deviceScaleFactor: dsf, isMobile }, phases: [] };
  for (const scale of [1, 2]) {
    await runScale(browser, ff, viewport, dsf, isMobile, scale);
  }
  await runReader(browser, ff, viewport, dsf, isMobile);
  await runFailureEnv(browser, ff, viewport, dsf, isMobile);
}

/* ---- preview server for the BUILT app, then the three form factors ---- */
const viteBin = resolve(root, "node_modules/vite/bin/vite.js");
const server = spawn(process.execPath, [viteBin, "preview", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

const candidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));

let browser;
try {
  const deadline = Date.now() + 30000;
  let up = false;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        up = true;
        break;
      }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!up) throw new Error(`preview server did not start on ${PORT}: ${serverLog.slice(-800)}`);
  browser = await chromium.launch({ executablePath, args: ["--autoplay-policy=user-gesture-required"] });
  await runFormFactor(browser, "phone", { width: 390, height: 844 }, 2, true);
  await runFormFactor(browser, "phone-landscape", { width: 844, height: 390 }, 2, true);
  await runFormFactor(browser, "desktop", { width: 1920, height: 1080 }, 1, false);

  // Full-frame mirror audit: every captured frame is a distinct, non-empty PNG
  // at its form factor's exact device dimensions (dims already asserted above).
  const hashes = new Set(allShots.map((s) => s.sha256));
  assert("mirror", "audit", "every frame distinct (no duplicated/stale captures)", hashes.size === allShots.length, JSON.stringify({ frames: allShots.length, distinct: hashes.size }));
  assert("mirror", "audit", "every frame non-empty", allShots.every((s) => s.bytes > 1000), JSON.stringify(allShots.filter((s) => s.bytes <= 1000)));
  receipt.formFactors.mirror = { viewport: null, phases: [{ name: "audit", assertions: receipt.formFactors.mirror?.phases?.[0]?.assertions ?? [], screenshots: [] }], frames: allShots };
} catch (err) {
  receipt.failures.push(String(err?.stack ?? err));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill();
  const counts = Object.fromEntries(
    Object.entries(receipt.formFactors).map(([ff, data]) => [
      ff,
      {
        assertions: (data.phases ?? []).reduce((n, p) => n + p.assertions.length, 0),
        passed: (data.phases ?? []).reduce((n, p) => n + p.assertions.filter((a) => a.pass).length, 0),
        screenshots: (data.phases ?? []).reduce((n, p) => n + p.screenshots.length, 0),
      },
    ])
  );
  receipt.summary = counts;
  if (receipt.failures.length > 0) process.exitCode = 1;
  receipt.serverLogTail = serverLog.slice(-400);
  writeFileSync(resolve(out, "receipt.json"), JSON.stringify(receipt, null, 2));
  writeFileSync(resolve(root, "tests/ui/save-63.evidence.json"), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ headSha, branch, summary: counts, failures: receipt.failures }, null, 2));
}
