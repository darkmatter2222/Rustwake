// @ts-nocheck
/**
 * Issue #69 RELEASE — before/after capture + mirror probe (re-69, role: release-engineer).
 *
 * Proves the .muted-corner CSS removal (code head b774404382b05a918d4e77d9578a9cfb939aa93e)
 * causes ZERO visual change: representative home + build + store surfaces on phone
 * 390x844@dpr2 and desktop 1440x900@dpr1 (rail mode >= 1200px), captured from the
 * BASELINE build (1ba05f28) and the CLEANUP build, must be pixel-identical.
 *
 * Determinism method (NO vision, AGENT headless emulation — NOT a physical device):
 *   - playwright-core chromium.launch with the installed Chrome executable;
 *   - context reducedMotion:"reduce" (the app's CSS transitions and canvas motion
 *     both honour prefers-reduced-motion; there are no CSS keyframe animations);
 *   - page.clock.install({time: T0}) freezes Date/performance/rAF/timers at a fixed
 *     epoch; fixed runFor() windows advance the sim deterministically, so the same
 *     seed + same windows render the same ticks and the same pixels;
 *   - the mature-yard seed is built by the game's OWN engine (applyCommand/advance)
 *     and persisted by the real encodeSave at lastSeenMs == T0 (no offline catch-up);
 *   - a before-r1 vs before-r2 control run proves the harness itself is deterministic
 *     before the before-vs-after parity claim is made.
 *
 * Each run serves its OWN dist directory through a minimal local static server
 * (base:"./" relative assets; SPA fallback) on a free 127.0.0.1 port. The served
 * dist inventory (bytes + sha256 per file) is recorded in the run receipt, tying
 * every frame to the exact build it came from.
 *
 * Usage (from the worktree root):
 *   pnpm exec tsx tests/ui/release-69.evidence/probe.mjs capture <run> <distDir> <port>
 *       run in {before-r1, before-r2, after}; writes frames/<run>/*.png + receipt.json
 *   pnpm exec tsx tests/ui/release-69.evidence/probe.mjs mirror
 *       census all frames (sha256 + PNG IHDR dims + bytes + nonEmpty + decoded
 *       distinct-color count) and compute control/parity comparisons -> mirror.json
 *   pnpm exec tsx tests/ui/release-69.evidence/probe.mjs prove
 *       committed == ran for this file; results.json.buildSha == code head
 */
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodeSave, DEFAULT_SETTINGS, SAVE_KEY } from "../../../src/game/persistence/save.ts";
import { createInitialState } from "../../../src/game/simulation/types.ts";
import { applyCommand } from "../../../src/game/simulation/commands.ts";
import { advance } from "../../../src/game/simulation/engine.ts";
import { TUNING } from "../../../src/game/content/defs.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const FRAMES = path.join(HERE, "frames");
const ISSUE = "https://github.com/darkmatter2222/Rustwake/issues/69";
const BASELINE_SHA = "1ba05f28baff16e40d34f2c5426b819916c964e9";
const CODE_SHA = "b774404382b05a918d4e77d9578a9cfb939aa93e";
const T0 = Date.UTC(2026, 10, 13, 12, 0, 0); // fixed fake-clock epoch
const RUNS = ["before-r1", "before-r2", "after"];
const git = (...a) => execSync("git " + a.join(" "), { cwd: ROOT, encoding: "utf8" }).trim();
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/* ---------------- mature-yard seed via the real engine ---------------- */
function buildSeed() {
  const sim = createInitialState();
  for (let i = 0; i < 12; i += 1) {
    applyCommand(sim, { id: `ev-salvage-${i}`, type: "manual.salvage" });
    advance(sim, TUNING.manualPulseTicks);
  }
  applyCommand(sim, { id: "ev-repair", type: "drone.repair" });
  for (let tile = 1; tile <= 16; tile += 1) {
    if (applyCommand(sim, { id: `ev-build-${tile}`, type: "machine.build", blueprint: "sorter", tile }).ok) break;
  }
  advance(sim, 300);
  // lastSeenMs == fake-clock now: boot sees NO absence, so no return report and
  // no offline catch-up — the yard renders the seeded state deterministically.
  return { sim, text: encodeSave(sim, T0, DEFAULT_SETTINGS) };
}

/* ---------------- minimal static server for a dist dir ---------------- */
function serve(distDir, port) {
  const rootDir = path.resolve(distDir);
  const mime = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".webmanifest": "application/manifest+json",
  };
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    let p = path.resolve(rootDir, "." + (urlPath === "/" ? "/index.html" : urlPath));
    if (!p.startsWith(rootDir)) { res.writeHead(403); res.end(); return; }
    if (!existsSync(p) || statSync(p).isDirectory()) p = path.join(rootDir, "index.html");
    res.writeHead(200, {
      "Content-Type": mime[path.extname(p).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(readFileSync(p));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

function inventory(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = path.join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else {
        const buf = readFileSync(p);
        out.push({ file: path.relative(dir, p).replaceAll("\\", "/"), bytes: buf.length, sha256: sha256(buf) });
      }
    }
  };
  walk(dir);
  return out;
}

/* ---------------- capture ---------------- */
const FORMS = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
};

async function clickText(page, label, scope) {
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
}

function watch(page, receipt) {
  page.on("console", (msg) => {
    const text = msg.text();
    if (msg.type() === "error") {
      if (/AudioContext|autoplay|user gesture/i.test(text)) receipt.autoplayNotes.push(text);
      else receipt.consoleErrors.push(text);
    }
  });
  page.on("pageerror", (err) => receipt.pageErrors.push(String(err)));
}

async function shot(page, run, form, surface, receipt) {
  const buf = await page.screenshot({ fullPage: false });
  const file = `${form}-${surface}.png`;
  mkdirSync(path.join(FRAMES, run), { recursive: true });
  writeFileSync(path.join(FRAMES, run, file), buf);
  // Decode the PNG in Chromium itself: exact dims + exact distinct-RGB count.
  const stats = await page.evaluate(async (b64) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = `data:image/png;base64,${b64}`; });
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    const colors = new Set();
    for (let i = 0; i < data.length; i += 4) colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    return { width: img.width, height: img.height, distinctColors: colors.size };
  }, buf.toString("base64"));
  const entry = {
    file: `${run}/${file}`, sha256: sha256(buf), bytes: buf.length,
    width: stats.width, height: stats.height, distinctColors: stats.distinctColors,
    nonEmpty: buf.length > 0 && stats.width > 0 && stats.height > 0 && stats.distinctColors > 1,
  };
  receipt.frames.push(entry);
  console.log(`SHOT ${entry.file} ${entry.width}x${entry.height} colors=${entry.distinctColors} bytes=${entry.bytes} sha=${entry.sha256.slice(0, 16)}`);
}

async function captureForm(browser, form, run, receipt, seedText, url) {
  const opts = { ...FORMS[form], reducedMotion: "reduce" };
  // Fresh yard: the home gate + the pre-start settings overlay (both static).
  const fresh = await browser.newContext(opts);
  const fp = await fresh.newPage();
  watch(fp, receipt);
  await fp.clock.install({ time: T0 });
  await fp.goto(url, { waitUntil: "load" });
  await fp.waitForSelector(".gate");
  await fp.clock.runFor(1200);
  await shot(fp, run, form, "home-fresh", receipt);
  await clickText(fp, "Settings", ".gate__secondary");
  await fp.waitForSelector(".gate-settings");
  await fp.clock.runFor(300);
  await shot(fp, run, form, "home-settings", receipt);
  await clickText(fp, "Close", ".gate-settings button");
  await fp.clock.runFor(200);
  await fresh.close();

  // Seeded mature yard: Continue -> yard, then build catalog (key 2) and store (key 3).
  const seeded = await browser.newContext(opts);
  await seeded.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: SAVE_KEY, value: seedText });
  const sp = await seeded.newPage();
  watch(sp, receipt);
  await sp.clock.install({ time: T0 });
  await sp.goto(url, { waitUntil: "load" });
  await sp.waitForSelector(".gate");
  await sp.clock.runFor(800);
  await sp.click(".gate__btn"); // Continue the saved yard
  await sp.clock.runFor(2500);
  await sp.waitForSelector(form === "desktop" ? ".shell-rail" : ".shell-menu-face");
  await shot(sp, run, form, "yard", receipt);
  await sp.keyboard.press("2");
  await sp.waitForSelector(".catalog");
  await sp.clock.runFor(400);
  await shot(sp, run, form, "build", receipt);
  await sp.keyboard.press("3");
  await sp.waitForSelector(".panel");
  await sp.clock.runFor(400);
  await shot(sp, run, form, "store", receipt);
  await seeded.close();
}

async function capture(run, distDir, port) {
  if (!RUNS.includes(run)) throw new Error(`run must be one of ${RUNS.join(", ")}`);
  const executablePath = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean).find((p) => existsSync(p));
  if (!executablePath) throw new Error("No Chromium executable found (set CHROME_PATH)");
  const seed = buildSeed();
  const server = await serve(distDir, port);
  const url = `http://127.0.0.1:${port}/`;
  const receipt = {
    issue: ISSUE, role: "release-engineer", persona: "re-69", run,
    headSha: git("rev-parse", "HEAD"), branch: git("branch", "--show-current"),
    baselineSha: BASELINE_SHA, codeSha: CODE_SHA,
    servedDist: path.resolve(distDir), distInventory: inventory(distDir),
    url, t0: T0, t0Iso: new Date(T0).toISOString(),
    seed: { tick: seed.sim.tick, machines: seed.sim.machines.length, tutorial: seed.sim.tutorial, lastSeenMs: T0, via: "src encodeSave + engine applyCommand/advance (home-62 seed recipe, fixed lastSeenMs)" },
    method: "AGENT headless Chromium; playwright fake clock frozen at T0 with fixed runFor windows; reducedMotion:reduce; NO vision; emulation is NOT a physical device",
    formFactors: FORMS,
    browser: { executablePath, version: null },
    frames: [], consoleErrors: [], pageErrors: [], autoplayNotes: [],
    capturedAt: new Date().toISOString(),
  };
  const browser = await chromium.launch({ executablePath });
  receipt.browser.version = browser.version();
  try {
    for (const form of Object.keys(FORMS)) {
      await captureForm(browser, form, run, receipt, seed.text, url);
    }
  } finally {
    await browser.close();
    server.close();
  }
  mkdirSync(path.join(FRAMES, run), { recursive: true });
  writeFileSync(path.join(FRAMES, run, "receipt.json"), JSON.stringify(receipt, null, 2));
  console.log(`RUN ${run}: frames=${receipt.frames.length} consoleErrors=${receipt.consoleErrors.length} pageErrors=${receipt.pageErrors.length} autoplayNotes=${receipt.autoplayNotes.length}`);
  if (receipt.consoleErrors.length || receipt.pageErrors.length) process.exitCode = 1;
}

/* ---------------- mirror census + comparisons ---------------- */
function pngDims(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return { width: null, height: null, valid: false };
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), valid: true };
}
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
function mirror() {
  const receipts = {};
  for (const run of RUNS) {
    const p = path.join(FRAMES, run, "receipt.json");
    receipts[run] = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
  }
  const colorOf = (rel) => {
    for (const run of RUNS) {
      const hit = receipts[run]?.frames.find((f) => f.file === rel);
      if (hit) return hit.distinctColors;
    }
    return null;
  };
  const pngs = walk(FRAMES).filter((p) => p.toLowerCase().endsWith(".png")).sort();
  const seen = new Map();
  const frames = pngs.map((p) => {
    const buf = readFileSync(p);
    const rel = path.relative(FRAMES, p).replaceAll("\\", "/");
    const d = pngDims(buf);
    const sha = sha256(buf);
    seen.set(sha, (seen.get(sha) || 0) + 1);
    return {
      file: rel, sha256: sha, width: d.width, height: d.height, bytes: buf.length,
      nonEmpty: buf.length > 0 && d.valid, distinctColors: colorOf(rel),
    };
  });
  const byFile = new Map(frames.map((f) => [f.file, f]));
  const keys = frames.filter((f) => f.file.startsWith("before-r1/")).map((f) => f.file.slice("before-r1/".length));
  const comparisons = keys.map((k) => {
    const a = byFile.get(`before-r1/${k}`);
    const ctrl = byFile.get(`before-r2/${k}`);
    const after = byFile.get(`after/${k}`);
    return {
      surface: k,
      control: { a: `before-r1/${k}`, b: `before-r2/${k}`, identical: Boolean(a && ctrl && a.sha256 === ctrl.sha256) },
      parity: { a: `before-r1/${k}`, b: `after/${k}`, identical: Boolean(a && after && a.sha256 === after.sha256) },
    };
  });
  const m = {
    count: frames.length,
    allNonEmpty: frames.every((f) => f.nonEmpty),
    uniqueSha256: seen.size,
    expectedUniqueSha256: keys.length, // 10 surfaces x 3 runs, all byte-equal per surface
    comparisons,
    determinismControlPass: comparisons.length > 0 && comparisons.every((c) => c.control.identical),
    parityPass: comparisons.length > 0 && comparisons.every((c) => c.parity.identical),
    note: "sha256 + PNG IHDR dims + bytes>0/valid-IHDR nonEmpty + decoded exact distinct-RGB count (from each run receipt). control = before-r1 vs before-r2 (same baseline build, independent browser runs) proves harness determinism; parity = before-r1 (baseline 1ba05f28 build) vs after (cleanup b774404 build). .muted-corner had zero references, so every surface must be byte-identical. Duplicate sha256 across runs is the EXPECTED pass condition here.",
    frames,
  };
  writeFileSync(path.join(HERE, "mirror.json"), JSON.stringify(m, null, 2));
  console.log(`MIRROR count=${m.count} allNonEmpty=${m.allNonEmpty} unique=${m.uniqueSha256}/${m.expectedUniqueSha256} control=${m.determinismControlPass} parity=${m.parityPass}`);
  for (const c of comparisons) console.log(`  ${c.surface}: control=${c.control.identical} parity=${c.parity.identical}`);
  if (!m.determinismControlPass || !m.parityPass || !m.allNonEmpty) process.exitCode = 1;
}

/* ---------------- prove committed == ran ---------------- */
function prove() {
  const rel = path.relative(ROOT, path.join(HERE, "probe.mjs")).replaceAll("\\", "/");
  const ran = git("hash-object", "--path", rel, rel);
  const committed = git("rev-parse", `HEAD:${rel}`);
  const ok = ran === committed;
  console.log(`PROBE committed==ran ${ok} (${ran})`);
  let shaOk = false;
  try {
    const results = JSON.parse(readFileSync(path.join(HERE, "results.json"), "utf8"));
    const srcDiff = git("diff", "--name-only", results.buildSha, "HEAD", "--", "src");
    shaOk = results.buildSha === CODE_SHA && srcDiff === "";
    console.log(`RESULTS buildSha=${results.buildSha} codeSha=${CODE_SHA} srcDiffToHead=${srcDiff === "" ? "empty" : srcDiff} ok=${shaOk}`);
  } catch (e) {
    console.log("RESULTS check failed: " + e.message);
  }
  if (!ok || !shaOk) process.exitCode = 1;
}

const cmd = process.argv[2];
if (cmd === "capture") await capture(process.argv[3], process.argv[4], Number(process.argv[5]));
else if (cmd === "mirror") mirror();
else if (cmd === "prove") prove();
else { console.error("usage: probe.mjs capture <before-r1|before-r2|after> <distDir> <port> | mirror | prove"); process.exitCode = 2; }
