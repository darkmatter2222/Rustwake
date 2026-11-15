// @ts-nocheck
/**
 * Issue #151 (G1/P1 gate) pass-3 running-build captures: V01/V02/V05/BLOCKED
 * scene renders (desktop + phone), V04 60 s motion clips with per-frame hashes,
 * export/import round-trip, hidden-tab paint freeze and WebGL context-loss
 * behaviour — all against the REAL built app (vite preview of this branch's
 * dist), seeded with the pass-1 release fixtures through the game's own
 * encodeSave before first paint.
 *
 * NON-VISION DISCLAIMER: every check here is a numeric browser/engine readout
 * (sha256 frame hashes, dataset stamps, decoded save fields, pixel crops).
 * No visual-fidelity claim is made; capable visual inspection is PENDING the
 * sponsor at the live URL (G1 #151). HEADLESS CHROME EMULATION on a desktop
 * host, NOT a physical phone (#190 blocker): viewport/dpr/isMobile/hasTouch are
 * emulated; CPU/GPU/thermal/real-touch/mobile-network are NOT.
 *
 * V05 HONESTY NOTE: at this SHA the sim's machine.build is INSTANT
 * (src/game/simulation/commands.ts buildMachine) and the staged assembly
 * presentation (src/game/renderer/assembly.ts + three/assemblyView.ts, T10
 * #137) is unit-tested but NOT imported by the running renderer
 * (three/worldRenderer.ts / three/index.ts); the shell wiring join is owned by
 * #199. This script therefore captures what the running build ACTUALLY does
 * (instant placement, exact single charge, reload persistence, 0-5 s frame
 * sequence) and records the missing staged-construction clip as a GAP finding
 * for pass 4 / the sponsor. It never fabricates stage frames.
 *
 * Usage (tsx resolves the .ts fixture/save imports):
 *   npm run build                      # once, produces dist/
 *   npx tsx scripts/capture-g1-151.mjs # self-manages vite preview on :4168
 *
 * Exit codes: 0 iff every HARD numeric check passes; 1 on any hard failure or
 * crash. Findings (V05 gap, soft crop statistics) are recorded, not crashed on.
 *
 * Writes only docs/screenshots/151-*.png and docs/evidence/151-*.{json,md}.
 * Never touches src/.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import {
  launchBrowser, headSha, evidenceDir, repoRoot, percentile,
} from "../tests/renderer/rw3d-t07/lib.mjs";
import {
  buildOpening, buildMature, buildBlocked, fixtureSaveText,
  MATURE_BUILDINGS, MATURE_UNITS,
} from "../tests/fixtures/release.ts";
import {
  SAVE_KEY, DEFAULT_SETTINGS, decodeSave, encodeSave,
} from "../src/game/persistence/save.ts";
import { BLUEPRINTS } from "../src/game/content/defs.ts";
import { tileToWorld, worldToScreen } from "../src/game/renderer/scene.ts";
import { ASSEMBLY_STAGES } from "../src/game/renderer/assembly.ts";

const SHA = headSha();
const GENERATED = new Date().toISOString();
const LIMITATION =
  "HEADLESS CHROME EMULATION on a desktop host, NOT a physical phone (#190). " +
  "Numeric checks only; visual fidelity PENDING sponsor inspection at the live URL (G1 #151). " +
  "Frame-time/memory are host-relative; a concurrent P02 background loop may add host contention.";
const PORT = 4168;
const URL = `http://localhost:${PORT}/`;
const shotDir = resolve(repoRoot, "docs/screenshots");
mkdirSync(shotDir, { recursive: true });
mkdirSync(evidenceDir, { recursive: true });

const DEVICES = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
};

/* ---- checks / reporting ---------------------------------------------------- */
const checks = [];
const findings = [];
const artifacts = [];
function check(name, expected, actual, pass) { checks.push({ name, expected, actual, pass }); }
function finding(name, detail) { findings.push({ name, detail }); console.log(`[FINDING] ${name}: ${detail}`); }
const round = (n, p = 2) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** p) / 10 ** p);
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

function writeReport(name, report) {
  const out = resolve(evidenceDir, name);
  writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
  console.log(`written: ${out}`);
  artifacts.push(out);
  return out;
}
function finish(report) {
  report.checks = checks;
  report.findings = findings;
  const failed = checks.filter((c) => !c.pass);
  report.pass = failed.length === 0;
  for (const c of checks) console.log(`[${c.pass ? "PASS" : "FAIL"}] ${c.name}: expected ${c.expected}, actual ${c.actual}`);
  console.log(`capture-g1-151: ${report.pass ? "PASS" : "FAIL"} (${checks.length - failed.length}/${checks.length} hard checks, ${findings.length} findings)`);
  return report.pass ? 0 : 1;
}

/* ---- preview server -------------------------------------------------------- */
async function startPreview(port) {
  const child = spawn("npx", ["vite", "preview", "--port", String(port), "--strictPort"], {
    cwd: repoRoot, shell: true, stdio: ["ignore", "pipe", "pipe"],
  });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1000) });
      if (res.ok && (await res.text()).includes('id="root"')) return child;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  spawnSync("taskkill", ["/T", "/F", "/PID", String(child.pid)], { stdio: "ignore" });
  throw new Error(`vite preview did not start on ${port} within 30s (run npm run build first)`);
}
const stopServer = (child) => { if (child && child.exitCode === null) spawnSync("taskkill", ["/T", "/F", "/PID", String(child.pid)], { stdio: "ignore" }); };

/* ---- seeded contexts ------------------------------------------------------- */
const appSeed = (sim) => fixtureSaveText(sim, Date.now(), { ...DEFAULT_SETTINGS, muted: true });

/** Seed before first paint + instrument GL contexts and tab visibility.
 *  The hidden/visibilityState getters are the SAME emulation the coordinator-
 *  verified T07 harness hiddenPause() uses (Object.defineProperty on document);
 *  the app's own document.hidden guard (scene.ts) does the rest. */
async function newSeededContext(browser, device, sim) {
  const context = await browser.newContext({ ...device, reducedMotion: "no-preference" });
  const seed = appSeed(sim);
  if (!decodeSave(seed).ok) throw new Error("fixture seed rejected by decodeSave");
  await context.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, [SAVE_KEY, seed]);
  await context.addInitScript(() => {
    window.__rwGL = [];
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...a) {
      const ctx = orig.call(this, type, ...a);
      if (ctx && /webgl/.test(String(type))) window.__rwGL.push(ctx);
      return ctx;
    };
    window.__rwHidden = false;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => window.__rwHidden === true });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (window.__rwHidden === true ? "hidden" : "visible") });
  });
  return context;
}

async function openApp(context) {
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForSelector(".game canvas", { timeout: 30000 });
  const gate = await page.evaluate(() => {
    const b = document.querySelector(".gate__btn");
    if (!b) return null;
    const label = (b.textContent || "").trim();
    b.click();
    return label;
  });
  await page.waitForFunction(() => {
    const c = document.querySelector(".game canvas");
    return c && (c.dataset.world3d === "ready" || c.dataset.world3d === "unavailable");
  }, { timeout: 30000 });
  await page.waitForTimeout(2500); // settle: camera fit + first batches
  return { page, pageErrors, gate };
}

/** Numeric truth of the RUNNING app: the live persisted envelope (PERSIST_MS
 *  1000) decoded through the game's own decodeSave. No debug globals exist in
 *  the built app; this is the shipped persistence path, read-only. */
async function readSave(page) {
  const raw = await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY);
  const d = decodeSave(raw);
  if (!d.ok) return { ok: false, reason: d.reason, raw };
  const s = d.payload.sim;
  return {
    ok: true, raw, sha: sha256(Buffer.from(raw, "utf8")),
    tick: s.tick, credits: s.credits,
    machines: s.machines.length, drones: s.drones.length, routes: s.routes.length,
    scrap: s.store.scrap, steel: s.store.steel,
    storeUnits: s.storeUnits, storeCapacity: s.storeCapacity,
    machineList: s.machines.map((m) => ({ id: m.id, blueprint: m.blueprint, tile: m.tile, status: m.status, ageTicks: m.ageTicks })),
    lastSeenMs: d.payload.lastSeenMs, settings: d.payload.settings,
  };
}

/** Refresh lastSeenMs so a reload exercises persistence WITHOUT a long offline
 *  catch-up window (same envelope rewrite pattern as scripts/capture.mjs). */
async function refreshLastSeen(page) {
  await page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    if (!raw) return;
    const env = JSON.parse(raw);
    env.payload.lastSeenMs = Date.now();
    const body = JSON.stringify(env.payload);
    let hash = 0x811c9dc5;
    for (let i = 0; i < body.length; i += 1) { hash ^= body.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; }
    env.checksum = hash.toString(16).padStart(8, "0");
    localStorage.setItem(k, JSON.stringify(env));
  }, SAVE_KEY);
}

async function shot(page, name) {
  const path = resolve(shotDir, `151-${name}.png`);
  const buf = await page.screenshot({ path });
  const rec = { name: `151-${name}.png`, path, sha256: sha256(buf), bytes: buf.length };
  artifacts.push(path);
  return rec;
}

const canvasStamp = (page) => page.evaluate(() => {
  const c = document.querySelector(".game canvas");
  return c ? { cam: c.dataset.cam ?? null, world3d: c.dataset.world3d ?? null } : null;
});

const clickDock = (page, label) => page.evaluate((want) => {
  const faces = [...document.querySelectorAll(".dock .dock__btn")];
  const texts = faces.map((b) => (b.textContent || "").replace(/\s+/g, " ").trim());
  const index = texts.indexOf(want);
  if (index >= 0) faces[index].click();
  return { index, faces: texts };
}, label);

const clickByText = (page, text) => page.evaluate((label) => {
  const b = [...document.querySelectorAll("button")].find((n) => (n.textContent ?? "").trim().startsWith(label));
  if (!b) return false;
  b.click();
  return true;
}, text);

async function setHidden(page, hidden) {
  await page.evaluate((h) => {
    window.__rwHidden = h;
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

/* ---- scene renders: V01 / V02 / BLOCKED ------------------------------------ */
async function captureScenes(browser, report) {
  const opening = buildOpening();
  const mature = buildMature();
  const blocked = buildBlocked();
  const scenes = {};
  for (const [devName, device] of Object.entries(DEVICES)) {
    // V01 — opening: fresh yard, gate reads Begin recovery.
    {
      const context = await newSeededContext(browser, device, opening.sim);
      const { page, pageErrors, gate } = await openApp(context);
      const gateShot = await shot(page, `v01-opening-yard-${devName}`);
      const save = await readSave(page);
      const stamp = await canvasStamp(page);
      scenes[`v01-${devName}`] = { gate, save: { tick: save.tick, machines: save.machines }, stamp, shot: gateShot, pageErrors };
      check(`v01-${devName}: gate offered`, "Begin recovery", gate, gate === "Begin recovery");
      check(`v01-${devName}: fresh yard machines`, 0, save.machines, save.machines === 0);
      check(`v01-${devName}: world3d ready`, "ready", stamp?.world3d, stamp?.world3d === "ready");
      check(`v01-${devName}: no page errors`, 0, pageErrors.length, pageErrors.length === 0);
      await context.close();
    }
    // V02 — mature: 20 buildings / 30 units, routed economy running.
    {
      const context = await newSeededContext(browser, device, mature.sim);
      const { page, pageErrors, gate } = await openApp(context);
      await page.waitForTimeout(2500);
      const s = await shot(page, `v02-mature-${devName}`);
      const save = await readSave(page);
      const stamp = await canvasStamp(page);
      scenes[`v02-${devName}`] = { gate, save: { tick: save.tick, machines: save.machines, drones: save.drones, routes: save.routes, storeUnits: save.storeUnits }, stamp, shot: s, pageErrors };
      check(`v02-${devName}: gate offered`, "Continue", gate, gate === "Continue");
      check(`v02-${devName}: mature machines`, MATURE_BUILDINGS, save.machines, save.machines === MATURE_BUILDINGS);
      check(`v02-${devName}: mature drones`, 5, save.drones, save.drones === 5);
      check(`v02-${devName}: world3d ready`, "ready", stamp?.world3d, stamp?.world3d === "ready");
      check(`v02-${devName}: sim ticking`, ">0", save.tick, save.tick > 0);
      check(`v02-${devName}: no page errors`, 0, pageErrors.length, pageErrors.length === 0);
      await context.close();
    }
    // BLOCKED — storage full + occupied bay: the recovery-blocked witness.
    {
      const context = await newSeededContext(browser, device, blocked.sim);
      const { page, pageErrors, gate } = await openApp(context);
      await page.waitForTimeout(1500);
      const s = await shot(page, `blocked-yard-${devName}`);
      const save = await readSave(page);
      const stamp = await canvasStamp(page);
      const alert = await page.evaluate(() => {
        const a = document.querySelector(".hud-alert");
        return a ? { present: true, role: a.getAttribute("role"), text: (a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160) } : { present: false };
      });
      scenes[`blocked-${devName}`] = { gate, save: { tick: save.tick, storeUnits: save.storeUnits, storeCapacity: save.storeCapacity }, stamp, alert, shot: s, pageErrors };
      check(`blocked-${devName}: storage at capacity`, blocked.sim.storeCapacity, save.storeUnits, save.storeUnits >= save.storeCapacity);
      check(`blocked-${devName}: storage alert visible`, true, alert.present, alert.present === true);
      check(`blocked-${devName}: world3d ready`, "ready", stamp?.world3d, stamp?.world3d === "ready");
      check(`blocked-${devName}: no page errors`, 0, pageErrors.length, pageErrors.length === 0);
      await context.close();
    }
  }
  report.scenes = scenes;
}

/* ---- V05: construction reality at this SHA --------------------------------- */
async function captureV05(browser, report) {
  const mature = buildMature();
  const v05 = {};
  for (const [devName, device] of Object.entries(DEVICES)) {
    const context = await newSeededContext(browser, device, mature.sim);
    const { page, pageErrors } = await openApp(context);
    const before = await readSave(page);
    const beforeShot = await shot(page, `v05-before-${devName}`);
    // Dock Build face -> catalog (arms first unlocked blueprint + first free tile).
    const dock = await clickDock(page, "Build");
    await page.waitForSelector(".catalog", { timeout: 10000 });
    await page.waitForTimeout(400);
    const catalogShot = await shot(page, `v05-catalog-${devName}`);
    const armed = await page.evaluate(() => {
      const b = document.querySelector(".catalog__place");
      return b ? { label: (b.textContent || "").trim(), disabled: b.disabled } : null;
    });
    // Commit the build through the shipped Place button.
    await page.evaluate(() => document.querySelector(".catalog__place")?.click());
    await page.waitForTimeout(350);
    const t0 = await shot(page, `v05-t0-${devName}`);
    const after = await readSave(page);
    const placed = after.machineList.find((m) => !before.machineList.some((b) => b.id === m.id)) ?? null;
    const cost = placed ? BLUEPRINTS[placed.blueprint]?.buildCost ?? [] : [];
    const costOf = (r) => cost.find((c) => c.resource === r)?.qty ?? 0;
    const scrapDelta = after.scrap - before.scrap;
    const steelDelta = after.steel - before.steel;
    check(`v05-${devName}: catalog opened`, true, armed !== null && !armed.disabled, armed !== null && armed.disabled === false);
    check(`v05-${devName}: machine added`, before.machines + 1, after.machines, after.machines === before.machines + 1);
    check(`v05-${devName}: scrap charged exactly once`, -costOf("scrap"), scrapDelta, placed !== null && scrapDelta === -costOf("scrap"));
    check(`v05-${devName}: steel charged exactly once`, -costOf("steel"), steelDelta, placed !== null && steelDelta === -costOf("steel"));
    // 0-5 s frame sequence after placement (the V05 acceptance timeline).
    const seq = [{ t: 0, ...t0 }];
    for (let t = 1; t <= 5; t += 1) {
      await page.waitForTimeout(1000);
      seq.push({ t, ...(await shot(page, `v05-t${t}-${devName}`)) });
    }
    const seqUnique = new Set(seq.map((f) => f.sha256)).size;
    // Crop the placed machine tile across the sequence: staged construction
    // would change its pixels stage by stage; instant build paints the full
    // kit at t0. Occlusion tolerance: drones/overlay may cross the crop.
    let crop = null;
    if (placed) {
      const geom = await page.evaluate(() => {
        const c = document.querySelector(".game canvas");
        const r = c.getBoundingClientRect();
        const parts = (c.dataset.cam || "").split(",").map((v) => parseFloat(v));
        return { left: r.left, top: r.top, width: c.clientWidth, height: c.clientHeight, cam: parts };
      });
      if (geom.cam.length >= 3 && geom.cam.every((v) => Number.isFinite(v))) {
        const w = tileToWorld(placed.tile);
        const p = worldToScreen({ x: geom.cam[0], y: geom.cam[1], scale: geom.cam[2] }, { width: geom.width, height: geom.height }, w.x, w.y);
        const half = Math.max(18, 26 * geom.cam[2]);
        const clip = {
          x: Math.max(geom.left, geom.left + p.x - half),
          y: Math.max(geom.top, geom.top + p.y - half),
          width: Math.min(2 * half, geom.left + geom.width - Math.max(geom.left, geom.left + p.x - half)),
          height: Math.min(2 * half, geom.top + geom.height - Math.max(geom.top, geom.top + p.y - half)),
        };
        if (clip.width > 8 && clip.height > 8) {
          const hashes = [];
          for (let i = 0; i < 6; i += 1) {
            const buf = await page.screenshot({ clip });
            hashes.push(sha256(buf));
            if (i === 0) { const cp = resolve(shotDir, `151-v05-crop-${devName}.png`); writeFileSync(cp, buf); artifacts.push(cp); }
            await page.waitForTimeout(900);
          }
          const mode = hashes.sort((a, b) => hashes.filter((h) => h === b).length - hashes.filter((h) => h === a).length)[0];
          crop = { tile: placed.tile, hashes, identicalToMode: hashes.filter((h) => h === mode).length, samples: hashes.length };
        }
      }
    }
    // Reload mid-"build": persistence + no second charge. Refresh lastSeenMs
    // first so the reload is a persistence test, not an offline catch-up test.
    await refreshLastSeen(page);
    const preReload = await readSave(page);
    await page.reload({ waitUntil: "load" });
    await page.waitForSelector(".game canvas", { timeout: 30000 });
    await page.evaluate(() => document.querySelector(".gate__btn")?.click());
    await page.waitForFunction(() => {
      const c = document.querySelector(".game canvas");
      return c && (c.dataset.world3d === "ready" || c.dataset.world3d === "unavailable");
    }, { timeout: 30000 });
    await page.waitForTimeout(1500);
    const reloaded = await readSave(page);
    const reloadShot = await shot(page, `v05-reload-${devName}`);
    const reloadScrapDelta = reloaded.scrap - preReload.scrap;
    const reloadTickDelta = reloaded.tick - preReload.tick;
    check(`v05-${devName}: reload keeps machine`, after.machines, reloaded.machines, reloaded.machines === after.machines);
    check(`v05-${devName}: reload no second build charge`, "[-3,0] (natural consumption only)", reloadScrapDelta, reloadScrapDelta <= 0 && reloadScrapDelta >= -3);
    check(`v05-${devName}: no page errors`, 0, pageErrors.length, pageErrors.length === 0);
    v05[devName] = {
      before: { machines: before.machines, scrap: before.scrap, steel: before.steel },
      placed, cost, scrapDelta, steelDelta,
      armed, dockFaces: dock.faces,
      sequence: seq.map(({ t, sha256, name }) => ({ t, sha256, name })), seqUnique,
      placedMachineCrop: crop,
      reload: { machines: reloaded.machines, scrapDelta: reloadScrapDelta, tickDelta: reloadTickDelta, shot: reloadShot },
      beforeShot, catalogShot, pageErrors,
    };
    await context.close();
  }
  finding("V05 staged construction GAP",
    "ACCEPTANCE V05 requires a 0/1/2/3/4/5 s base/frame/walls/roof/activation clip and mid-build reload resume. " +
    "At this SHA machine.build is INSTANT (src/game/simulation/commands.ts buildMachine: no construction stages in SimState) " +
    "and the running renderer paints the full kit at t0. The staged assembly controller EXISTS " +
    "(src/game/renderer/assembly.ts ASSEMBLY_STAGES=" + JSON.stringify(ASSEMBLY_STAGES) + ", three/assemblyView.ts, " +
    "unit-tested by tests/renderer/assembly-stage.test.ts / assembly-timing.test.ts / assembly-view.test.ts and the rw3d-t10 harness) " +
    "but is NOT imported by three/worldRenderer.ts or three/index.ts; the app join is owned by shell wiring #199. " +
    "Captured instead: instant placement, exact single charge, 0-5 s frame sequence, reload persistence. " +
    "The staged clip CANNOT be produced from the running build at this SHA — pass 4 must record this as unmet/pending, not pass.");
  report.v05 = v05;
}

/* ---- V04: 60 s motion clips + truthful freeze ------------------------------ */
async function captureV04(browser, report) {
  const mature = buildMature();
  const v04 = {};
  const FRAMES = 120; // 2 fps x 60 s
  const HIDDEN_FROM = 60, HIDDEN_TO = 67; // t=30..33.5 s: 8 frozen frames
  for (const [devName, device] of Object.entries(DEVICES)) {
    const context = await newSeededContext(browser, device, mature.sim);
    const { page, pageErrors } = await openApp(context);
    await page.waitForTimeout(2000);
    const canvas = page.locator(".game canvas");
    const start = Date.now();
    const frames = [];
    let tickStart = null, tickEnd = null, hiddenTickStart = null, hiddenTickEnd = null;
    let readyCount = 0;
    for (let i = 0; i < FRAMES; i += 1) {
      const target = start + i * 500;
      const wait = target - Date.now();
      if (wait > 0) await page.waitForTimeout(wait);
      if (i === HIDDEN_FROM) {
        await setHidden(page, true);
        hiddenTickStart = (await readSave(page)).tick;
      }
      if (i === HIDDEN_TO + 1) {
        hiddenTickEnd = (await readSave(page)).tick;
        await setHidden(page, false);
      }
      // Canvas-only capture: the painted yard is the motion surface. A full-
      // page shot would include the ticking HUD DOM and make hashes vacuous.
      const buf = await canvas.screenshot();
      const stamp = await canvasStamp(page);
      if (stamp?.world3d === "ready") readyCount += 1;
      const rec = { i, tMs: Date.now() - start, sha256: sha256(buf), world3d: stamp?.world3d ?? null, cam: stamp?.cam ?? null };
      if (i % 10 === 0 || i === FRAMES - 1) {
        const save = await readSave(page);
        rec.tick = save.tick;
        if (tickStart === null) tickStart = save.tick;
        tickEnd = save.tick;
      }
      if (i % 6 === 0) {
        const path = resolve(shotDir, `151-v04-${devName}-f${String(i).padStart(3, "0")}.png`);
        writeFileSync(path, buf);
        artifacts.push(path);
        rec.png = `151-v04-${devName}-f${String(i).padStart(3, "0")}.png`;
      }
      frames.push(rec);
    }
    const hashes = frames.map((f) => f.sha256);
    const unique = new Set(hashes).size;
    let maxRun = 1, run = 1;
    for (let i = 1; i < hashes.length; i += 1) {
      run = hashes[i] === hashes[i - 1] ? run + 1 : 1;
      if (i <= HIDDEN_FROM || i > HIDDEN_TO) maxRun = Math.max(maxRun, run);
    }
    const hiddenHashes = hashes.slice(HIDDEN_FROM, HIDDEN_TO + 1);
    const hiddenFrozen = new Set(hiddenHashes).size === 1;
    const resumedDiffers = hashes[HIDDEN_TO + 1] !== hiddenHashes[hiddenHashes.length - 1];
    const tickDelta = tickEnd - tickStart;
    const hiddenTickDelta = hiddenTickEnd - hiddenTickStart;
    check(`v04-${devName}: independent motion (unique canvas hashes)`, ">=100 of 120", unique, unique >= 100);
    check(`v04-${devName}: no frozen run outside hidden window`, "<=2", maxRun, maxRun <= 2);
    check(`v04-${devName}: hidden-tab paint frozen`, "8/8 identical", `${new Set(hiddenHashes).size} unique of 8`, hiddenFrozen);
    check(`v04-${devName}: sim alive while hidden (tick delta)`, ">=30", hiddenTickDelta, hiddenTickDelta >= 30);
    check(`v04-${devName}: paint resumes after restore`, true, resumedDiffers, resumedDiffers);
    check(`v04-${devName}: 60 s sim catch-up (tick delta)`, "560..660", tickDelta, tickDelta >= 560 && tickDelta <= 660);
    check(`v04-${devName}: world3d ready every frame`, FRAMES, readyCount, readyCount === FRAMES);
    check(`v04-${devName}: no page errors`, 0, pageErrors.length, pageErrors.length === 0);
    // Repeated-hash guard demanded by the brief: a clip whose frames repeat
    // outside the truthful hidden window is NOT motion evidence.
    if (unique < 100 || maxRun > 2) throw new Error(`v04-${devName}: repeated frame hashes — motion clip rejected (unique=${unique}, maxRun=${maxRun})`);
    v04[devName] = {
      frames: FRAMES, fps: 2, durationMs: Date.now() - start,
      uniqueHashes: unique, maxConsecutiveIdenticalOutsideHidden: maxRun,
      hiddenWindow: { from: HIDDEN_FROM, to: HIDDEN_TO, frozen: hiddenFrozen, tickDelta: hiddenTickDelta, resumedDiffers },
      tickStart, tickEnd, tickDelta, readyCount,
      keyframes: frames.filter((f) => f.png).map((f) => ({ i: f.i, tMs: f.tMs, png: f.png, sha256: f.sha256 })),
      pageErrors,
    };
    writeReport(`151-v04-frames-${devName}.json`, {
      issue: 151, pass: "3/4", headSha: SHA, generated: GENERATED, device: devName, limitation: LIMITATION,
      note: "Per-frame sha256 of CANVAS-ONLY screenshots at 2 fps for 60 s. Frames 60-67 are the emulated hidden-tab window (paint must freeze, sim must keep ticking). Every 6th frame is persisted as PNG; all 120 hashes are listed.",
      frames,
    });
    await context.close();
  }
  // Starved vs working machine crops (desktop): the 2D overlay paints an
  // animated working core (scene.ts S5/F5) and static starved marks. A starved
  // machine's tile must NOT fake motion; a working one should change.
  {
    const context = await newSeededContext(browser, DEVICES.desktop, mature.sim);
    const { page } = await openApp(context);
    await page.waitForTimeout(2000);
    const save = await readSave(page);
    const working = save.machineList.find((m) => m.status === "running" || m.status === "working") ?? save.machineList[0];
    const starved = save.machineList.find((m) => m.status === "starved" || m.status === "idle");
    const geom = await page.evaluate(() => {
      const c = document.querySelector(".game canvas");
      const r = c.getBoundingClientRect();
      const parts = (c.dataset.cam || "").split(",").map((v) => parseFloat(v));
      return { left: r.left, top: r.top, width: c.clientWidth, height: c.clientHeight, cam: parts };
    });
    const cropFor = (m) => {
      const w = tileToWorld(m.tile);
      const p = worldToScreen({ x: geom.cam[0], y: geom.cam[1], scale: geom.cam[2] }, { width: geom.width, height: geom.height }, w.x, w.y);
      const half = Math.max(18, 26 * geom.cam[2]);
      const x = Math.max(geom.left, geom.left + p.x - half);
      const y = Math.max(geom.top, geom.top + p.y - half);
      return { x, y, width: Math.min(2 * half, geom.left + geom.width - x), height: Math.min(2 * half, geom.top + geom.height - y) };
    };
    const sample = async (m, label) => {
      const clip = cropFor(m);
      const hashes = [];
      for (let i = 0; i < 20; i += 1) {
        const buf = await page.screenshot({ clip });
        hashes.push(sha256(buf));
        if (i === 0) { const p = resolve(shotDir, `151-v04-crop-${label}-desktop.png`); writeFileSync(p, buf); artifacts.push(p); }
        await page.waitForTimeout(480);
      }
      const counts = {};
      for (const h of hashes) counts[h] = (counts[h] ?? 0) + 1;
      const mode = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      return { machine: m, clip, hashes, unique: Object.keys(counts).length, modeCount: mode[1], samples: 20 };
    };
    const starvedCrop = starved ? await sample(starved, "starved") : null;
    const workingCrop = working ? await sample(working, "working") : null;
    if (starvedCrop) {
      check("v04-starved-crop: no fake motion (>=14/20 identical, drone occlusion tolerance)", ">=14", starvedCrop.modeCount, starvedCrop.modeCount >= 14);
    }
    if (workingCrop && workingCrop.unique < 6) {
      finding("v04-working-crop low variation", `working machine ${working.id} crop unique=${workingCrop.unique}/20 — batch cadence may be slower than the 10 s window; full-frame motion checks remain authoritative`);
    }
    v04.desktopCrops = { starved: starvedCrop, working: workingCrop };
    await context.close();
  }
  report.v04 = v04;
}

/* ---- export/import round-trip from the running build ----------------------- */
async function captureRoundTrip(browser, report) {
  const mature = buildMature();
  const context = await newSeededContext(browser, DEVICES.desktop, mature.sim);
  const { page, pageErrors } = await openApp(context);
  await page.waitForTimeout(1500);
  const openYardBackup = async () => {
    await clickDock(page, "Yard");
    await page.waitForSelector(".panel", { timeout: 10000 });
    await clickByText(page, "Backup");
    await page.waitForSelector("#rustwake-save-export", { timeout: 10000 });
    return page.evaluate(() => document.querySelector("#rustwake-save-export").value);
  };
  const closePanel = async () => {
    await page.evaluate(() => { for (const b of document.querySelectorAll(".panel__head button")) b.click(); });
    await page.waitForTimeout(250);
  };
  const A = await openYardBackup();
  const shotA = await shot(page, "roundtrip-export-desktop");
  await closePanel();
  await page.waitForTimeout(2200); // live ticks advance the ledger
  const B = await openYardBackup();
  await closePanel();
  const dA = decodeSave(A), dB = decodeSave(B);
  const abDelta = {
    byteIdentical: A === B,
    tickDelta: dB.payload.sim.tick - dA.payload.sim.tick,
    lastSeenDeltaMs: dB.payload.lastSeenMs - dA.payload.lastSeenMs,
    simIdentical: JSON.stringify(dA.payload.sim) === JSON.stringify(dB.payload.sim),
  };
  // Import A back: Replace -> Import -> paste -> Apply -> ack -> Replace yard.
  await clickDock(page, "Yard");
  await page.waitForSelector(".panel", { timeout: 10000 });
  await clickByText(page, "Import");
  await page.waitForSelector("#rustwake-save-import", { timeout: 10000 });
  await page.fill("#rustwake-save-import", A);
  await clickByText(page, "Apply");
  await page.waitForSelector(".import-confirm", { timeout: 10000 });
  const shotConfirm = await shot(page, "roundtrip-confirm-desktop");
  await page.evaluate(() => { const c = document.querySelector(".import-confirm__ack input"); if (c && !c.checked) c.click(); });
  await page.evaluate(() => document.querySelector(".import-confirm__replace")?.click());
  await page.waitForTimeout(400);
  const note = await page.evaluate(() => document.querySelector(".panel .status-line")?.textContent?.trim() ?? null);
  await closePanel();
  const C = await openYardBackup();
  await closePanel();
  const dC = decodeSave(C);
  const simNoTick = (s) => JSON.stringify({ ...s, tick: 0 });
  const acDelta = {
    byteIdentical: A === C,
    tickDelta: dC.payload.sim.tick - dA.payload.sim.tick,
    lastSeenDeltaMs: dC.payload.lastSeenMs - dA.payload.lastSeenMs,
    simIdenticalExceptTick: simNoTick(dA.payload.sim) === simNoTick(dC.payload.sim),
    settingsIdentical: JSON.stringify(dA.payload.settings) === JSON.stringify(dC.payload.settings),
  };
  check("roundtrip: import restores sim (tick may advance <=5 naturally)", true, acDelta.simIdenticalExceptTick && acDelta.tickDelta >= 0 && acDelta.tickDelta <= 5, acDelta.simIdenticalExceptTick === true && acDelta.tickDelta >= 0 && acDelta.tickDelta <= 5);
  check("roundtrip: settings preserved", true, acDelta.settingsIdentical, acDelta.settingsIdentical === true);
  check("roundtrip: live export advances between reads (A!=B)", false, abDelta.byteIdentical, abDelta.byteIdentical === false);
  // Invalid import must change NOTHING (natural tick progression excepted).
  await clickDock(page, "Yard");
  await page.waitForSelector(".panel", { timeout: 10000 });
  await clickByText(page, "Import");
  await page.waitForSelector("#rustwake-save-import", { timeout: 10000 });
  const D1 = await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY);
  await page.fill("#rustwake-save-import", "rw-invalid{{{not-a-save");
  await clickByText(page, "Apply");
  await page.waitForTimeout(400);
  const invalid = await page.evaluate(() => ({
    confirmPresent: !!document.querySelector(".import-confirm"),
    note: document.querySelector(".panel .status-line")?.textContent?.trim() ?? null,
  }));
  const D2 = await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY);
  const shotInvalid = await shot(page, "roundtrip-invalid-desktop");
  await closePanel();
  const d1 = decodeSave(D1), d2 = decodeSave(D2);
  const economy = (s) => JSON.stringify({ machines: s.machines, routes: s.routes, store: s.store, credits: s.credits, drones: s.drones, storeUnits: s.storeUnits });
  const invalidDelta = {
    confirmPresent: invalid.confirmPresent, note: invalid.note,
    economyIdentical: economy(d1.payload.sim) === economy(d2.payload.sim),
    tickDelta: d2.payload.sim.tick - d1.payload.sim.tick,
  };
  check("roundtrip: invalid import refused (no confirm gate)", false, invalid.confirmPresent, invalid.confirmPresent === false);
  check("roundtrip: invalid import leaves economy byte-identical", true, invalidDelta.economyIdentical, invalidDelta.economyIdentical === true);
  check("roundtrip: invalid import tick drift <=2 (natural only)", "<=2", invalidDelta.tickDelta, invalidDelta.tickDelta >= 0 && invalidDelta.tickDelta <= 2);
  check("roundtrip: no page errors", 0, pageErrors.length, pageErrors.length === 0);
  report.roundTrip = {
    protocol: "Yard panel -> Backup export textarea (#rustwake-save-export) / Replace import (#rustwake-save-import) -> Apply -> ImportConfirm ack -> Replace yard; the shipped UI path, no store shortcuts.",
    exportA: { sha256: sha256(Buffer.from(A, "utf8")), chars: A.length, tick: dA.payload.sim.tick, shot: shotA },
    exportB: { sha256: sha256(Buffer.from(B, "utf8")), chars: B.length, tick: dB.payload.sim.tick },
    exportC: { sha256: sha256(Buffer.from(C, "utf8")), chars: C.length, tick: dC.payload.sim.tick },
    abDelta, acDelta, importNote: note, invalid: { ...invalidDelta, shot: shotInvalid },
    confirmShot: shotConfirm, pageErrors,
    envelopeA: A, envelopeC: C,
  };
  writeReport("151-roundtrip.json", {
    issue: 151, pass: "3/4", headSha: SHA, generated: GENERATED, limitation: LIMITATION,
    ...report.roundTrip,
  });
  await context.close();
}

/* ---- WebGL context loss in the built app ----------------------------------- */
async function captureContextLoss(browser, report) {
  const mature = buildMature();
  const context = await newSeededContext(browser, DEVICES.desktop, mature.sim);
  const { page, pageErrors } = await openApp(context);
  await page.waitForTimeout(1500);
  const before = await readSave(page);
  const glCount = await page.evaluate(() => window.__rwGL.length);
  check("context-loss: WebGL context instrumented", ">=1", glCount, glCount >= 1);
  await page.evaluate(() => {
    const ext = window.__rwGL[0]?.getExtension("WEBGL_lose_context");
    if (ext) ext.loseContext();
  });
  await page.waitForTimeout(800);
  const lostStamp = await canvasStamp(page);
  const lostShot = await shot(page, "context-loss-banner-desktop");
  const during = await readSave(page);
  await page.evaluate(() => {
    const ext = window.__rwGL[0]?.getExtension("WEBGL_lose_context");
    if (ext) ext.restoreContext();
  });
  await page.waitForTimeout(1500);
  const readyStamp = await canvasStamp(page);
  const restoredShot = await shot(page, "context-restored-desktop");
  const after = await readSave(page);
  const economy = (s) => JSON.stringify({ machines: s.machineList, routes: s.routes, credits: s.credits, scrap: s.scrap, steel: s.steel });
  check("context-loss: dataset.world3d=lost", "lost", lostStamp?.world3d, lostStamp?.world3d === "lost");
  check("context-loss: dataset.world3d=ready after restore", "ready", readyStamp?.world3d, readyStamp?.world3d === "ready");
  check("context-loss: save economy untouched", true, economy(before) === economy(after), economy(before) === economy(after));
  check("context-loss: no page errors", 0, pageErrors.length, pageErrors.length === 0);
  report.contextLoss = {
    glContexts: glCount, lostStamp, readyStamp,
    tickDelta: after.tick - before.tick,
    economyIdentical: economy(before) === economy(after),
    lostShot, restoredShot, pageErrors,
    note: "Banner/fallback VISUALS are pending sponsor inspection; numeric proof is the dataset.world3d transition + unchanged save economy. The byte-strict save check lives in the P02 harness run (151-p02-loops.json).",
  };
  await context.close();
}

/* ---- main ------------------------------------------------------------------ */
async function main() {
  if (!existsSync(resolve(repoRoot, "dist/index.html"))) {
    console.error("dist/index.html missing — run `npm run build` first (this script never builds).");
    process.exit(1);
  }
  const report = {
    issue: 151, pass: "3/4", gate: "G1/P1", headSha: SHA, generated: GENERATED,
    mode: "running-build-captures", limitation: LIMITATION,
    build: "vite preview of THIS branch's dist (npm run build at head " + SHA + ")",
    fixtures: "pass-1 release fixtures (tests/fixtures/release.ts) seeded via the game's own encodeSave before first paint; lastSeenMs=Date.now() so no offline catch-up contaminates captures",
    devices: DEVICES,
  };
  const preview = await startPreview(PORT);
  const { browser, executablePath, probeRenderer, swiftshaderForced } = await launchBrowser();
  report.browser = { executablePath, probeRenderer, swiftshaderForced };
  console.log(`capture-g1-151: head=${SHA} browser=${executablePath} preview=:${PORT}`);
  try {
    await captureScenes(browser, report);
    await captureV05(browser, report);
    await captureV04(browser, report);
    await captureRoundTrip(browser, report);
    await captureContextLoss(browser, report);
  } finally {
    await browser.close();
    stopServer(preview);
  }
  report.artifacts = artifacts;
  writeReport("151-g1-captures.json", report);
  process.exit(finish(report));
}

main().catch((e) => {
  console.error("capture-g1-151 CRASH:", e);
  process.exit(1);
});