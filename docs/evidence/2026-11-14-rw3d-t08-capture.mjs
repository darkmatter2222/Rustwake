// T08 shell/nav render evidence (issue #135). NUMERIC/PIXEL ONLY — the author
// is a non-vision agent; capable visual inspection is PENDING (owed at G1 #151).
//
// Runs against the PRODUCTION BUILD (dist/) of the recorded head SHA, served by
// a throwaway static server inside this script. House capture pattern:
// playwright-core + local Chrome/Edge executablePath (scripts/capture.mjs).
// Pixel stats decode the actual screenshot PNG bytes with the browser's own
// decoder (Image -> canvas -> getImageData); no extra dependency is added.
//
// Usage:  npm run build
//         node docs/evidence/2026-11-14-rw3d-t08-capture.mjs
// Writes  2026-11-14-rw3d-t08-pixels.json + nine PNGs; exits 0/1 on the
// pre-registered checks below (thresholds fixed before the first run).
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const evidenceDir = resolve(root, "docs/evidence");
const OUT = "2026-11-14-rw3d-t08";
const PORT = 4318;
const URL_BASE = `http://localhost:${PORT}/`;
const SLOTS = ["build", "routes", "fleet", "research", "trade", "map"];

const headSha = execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
const porcelain = execSync("git status --porcelain", { cwd: root, encoding: "utf8" }).trim();
const treeCleanAtStart = porcelain === "";

const seedPath = resolve(evidenceDir, "yard-mature.json");
const seedText = readFileSync(seedPath, "utf8");
const seedSha256 = createHash("sha256").update(seedText).digest("hex");
const seedGapHours = (Date.now() - JSON.parse(seedText).payload.lastSeenMs) / 3600000;

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".ico": "image/x-icon", ".wasm": "application/wasm", ".woff2": "font/woff2",
};
const dist = resolve(root, "dist");
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, URL_BASE).pathname);
  let file = resolve(dist, "." + path);
  if (!file.startsWith(dist) || !existsSync(file) || !statSync(file).isFile()) {
    file = resolve(dist, "index.html");
  }
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((ok) => server.listen(PORT, ok));

const candidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));

const checks = [];
const check = (name, expected, actual, pass) => checks.push({ name, expected, actual, pass });
const captures = [];
const consoleErrors = [];

/** Pixel census of the actual screenshot bytes, decoded by the page itself. */
const pixelStats = (page, buf) =>
  page.evaluate(async (b64) => {
    const img = new Image();
    await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = "data:image/png;base64," + b64; });
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    const colors = new Map();
    let sum = 0, sumSq = 0;
    const n = c.width * c.height;
    for (let i = 0; i < data.length; i += 4) {
      const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      colors.set(key, (colors.get(key) ?? 0) + 1);
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      sum += lum; sumSq += lum * lum;
    }
    const mean = sum / n;
    let mode = 0, modeCount = 0;
    for (const [k, v] of colors) if (v > modeCount) { mode = k; modeCount = v; }
    return {
      width: c.width, height: c.height, uniqueColors: colors.size,
      luminanceMean: +mean.toFixed(2),
      luminanceStddev: +Math.sqrt(Math.max(0, sumSq / n - mean * mean)).toFixed(2),
      backgroundFraction: +(modeCount / n).toFixed(4),
      modeColor: "#" + mode.toString(16).padStart(6, "0"),
    };
  }, buf.toString("base64"));

/** Fraction of pixels that differ between two screenshots (same viewport). */
const pixelDiff = (page, a, b) =>
  page.evaluate(async ([ba, bb]) => {
    const load = (b64) => new Promise((ok, bad) => {
      const img = new Image();
      img.onload = () => ok(img); img.onerror = bad;
      img.src = "data:image/png;base64," + b64;
    });
    const [ia, ib] = await Promise.all([load(ba), load(bb)]);
    const grab = (img) => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, c.width, c.height).data;
    };
    const da = grab(ia), db = grab(ib);
    if (da.length !== db.length) return -1;
    let diff = 0;
    const n = da.length / 4;
    for (let i = 0; i < da.length; i += 4) {
      if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2]) diff += 1;
    }
    return +(diff / n).toFixed(4);
  }, [a.toString("base64"), b.toString("base64")]);

/**
 * Direct yard-canvas census. After the #198 rebase the yard canvas is still a
 * 2D canvas: three.js renders offscreen WebGL and blitWorld3D copies it into
 * this context, so getImageData reads the blitted three.js pixels. If WebGL is
 * unavailable the renderer falls back to the legacy 2D yard (byte-identical to
 * the pre-#198 path); the probeRenderer/swiftshaderForced fields below record
 * which rasterizer actually ran.
 */
const canvasStats = (page) =>
  page.evaluate(() => {
    const c = document.querySelector("canvas");
    if (!c) return null;
    const ctx = c.getContext("2d");
    if (!ctx) return { nonCanvas2D: true };
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    const colors = new Set();
    for (let i = 0; i < data.length; i += 4) {
      colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    }
    return { width: c.width, height: c.height, uniqueColors: colors.size };
  });

/** Numeric DOM census of the shell contract. */
const census = (page) =>
  page.evaluate(() => {
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
    };
    const host = document.querySelector(".shell-host");
    const sheet = document.querySelector(".shell-sheet");
    const panel = document.querySelector(".shell-host .panel");
    let save = null;
    try {
      const raw = localStorage.getItem("rustwake.save.v1");
      if (raw) {
        const env = JSON.parse(raw);
        save = { tick: env.payload?.sim?.tick ?? null, checksumChars: (env.checksum ?? "").length };
      }
    } catch { /* recorded as null */ }
    return {
      slots: [...document.querySelectorAll(".toolbar [data-slot]")].map((b) => ({
        slot: b.dataset.slot, ...rect(b), disabled: b.disabled,
        pressed: b.getAttribute("aria-pressed"),
      })),
      depth: host ? Number(host.dataset.depth) : 0,
      paintedPanels: document.querySelectorAll(".shell-host .panel").length,
      panelTitle: panel?.querySelector(".panel__title")?.textContent ?? null,
      inspector: rect(document.querySelector(".shell-inspector")),
      sheet: rect(sheet),
      sheetExpanded: sheet?.classList.contains("shell-sheet--expanded") ?? false,
      expandAria: document.querySelector(".shell-host__expand")?.getAttribute("aria-expanded") ?? null,
      toolbar: rect(document.querySelector(".toolbar")),
      inspectorTopVar: getComputedStyle(document.documentElement).getPropertyValue("--shell-inspector-top").trim(),
      retired: { rail: !!document.querySelector(".shell-rail"), menu: !!document.querySelector(".shell-menu") },
      page: {
        scrollHeight: document.scrollingElement?.scrollHeight ?? 0,
        innerHeight: window.innerHeight,
        bodyOverflow: getComputedStyle(document.body).overflow,
      },
      save,
    };
  });

const shoot = async (page, name, state, viewport, dpr) => {
  const buf = await page.screenshot({ path: resolve(evidenceDir, `${OUT}-${name}.png`) });
  const stats = await pixelStats(page, buf);
  captures.push({ file: `${OUT}-${name}.png`, state, viewport, stats });
  check(`${name}: dimensions`, `${viewport.width * dpr}x${viewport.height * dpr}`,
    `${stats.width}x${stats.height}`, stats.width === viewport.width * dpr && stats.height === viewport.height * dpr);
  check(`${name}: unique colors > 200`, ">200", stats.uniqueColors, stats.uniqueColors > 200);
  check(`${name}: luminance stddev > 8`, ">8", stats.luminanceStddev, stats.luminanceStddev > 8);
  check(`${name}: not a flat fill`, "<0.97", stats.backgroundFraction, stats.backgroundFraction < 0.97);
  return buf;
};

const watch = (page, tag) => {
  page.on("pageerror", (err) => consoleErrors.push({ tag, kind: "pageerror", text: String(err) }));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push({ tag, kind: "console", text: msg.text() });
  });
};
const installSeed = (context) =>
  context.addInitScript((value) => localStorage.setItem("rustwake.save.v1", value), seedText);
const begin = async (page) => {
  await page.goto(URL_BASE, { waitUntil: "networkidle" });
  // With a seeded save the primary reads "Continue" (aria keeps the
  // "Begin recovery" prefix); the class is stable in both cases.
  await page.waitForSelector(".gate__btn");
  await page.click(".gate__btn");
  await page.waitForTimeout(700);
};
const closeReport = async (page) => {
  const resume = await page.$(".return-resume");
  if (resume) { await resume.click(); await page.waitForTimeout(300); }
  return Boolean(resume);
};
const tapSlot = async (page, slot) => {
  await page.click(`.toolbar [data-slot="${slot}"]`);
  await page.waitForTimeout(300);
};
const openSettings = async (page) => {
  await page.click('button[aria-label="Settings"]');
  await page.waitForTimeout(300);
};
const escape = async (page) => {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
};
const slotChecks = (tag, c) => {
  check(`${tag}: six toolbar slots in order`, SLOTS.join(","), c.slots.map((s) => s.slot).join(","),
    JSON.stringify(c.slots.map((s) => s.slot)) === JSON.stringify(SLOTS));
  const small = c.slots.filter((s) => s.w < 44 || s.h < 44);
  check(`${tag}: every slot >= 44x44`, "0 undersized", small.length, small.length === 0);
  check(`${tag}: retired rail/menu absent`, "false/false", `${c.retired.rail}/${c.retired.menu}`,
    !c.retired.rail && !c.retired.menu);
  check(`${tag}: page stays flat`, `scrollHeight<=${c.page.innerHeight + 1}, overflow hidden`,
    `${c.page.scrollHeight}, ${c.page.bodyOverflow}`,
    c.page.scrollHeight <= c.page.innerHeight + 1 && c.page.bodyOverflow === "hidden");
};

// House pattern (tests/renderer/rw3d-t07/lib.mjs): probe headless WebGL first;
// only force SwiftShader if the native headless rasterizer is unavailable, and
// record which one actually produced the pixels (the re-baseline differs from
// the Canvas2D captures, so the rasterizer is load-bearing provenance).
const probeGl = async (b) => {
  const page = await b.newPage();
  try {
    return await page.evaluate(() => {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2") || c.getContext("webgl");
      if (!gl) return null;
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      return dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "unknown";
    });
  } finally {
    await page.close();
  }
};
let browser = await chromium.launch({ executablePath, headless: true });
let probeRenderer = await probeGl(browser);
let swiftshaderForced = false;
if (!probeRenderer) {
  await browser.close();
  browser = await chromium.launch({
    executablePath, headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  probeRenderer = await probeGl(browser);
  swiftshaderForced = true;
  if (!probeRenderer) { await browser.close(); throw new Error("WebGL unavailable even with SwiftShader"); }
}
const canvasCensuses = {};
try {
  // ---------------- Desktop 1440x900 @1x: right inspector ----------------
  const dView = { width: 1440, height: 900 };
  const desktop = await browser.newContext({ viewport: dView, deviceScaleFactor: 1 });
  await installSeed(desktop);
  const dp = await desktop.newPage();
  watch(dp, "desktop");
  await begin(dp);

  let c = await census(dp);
  check("desktop: Begin opens the return report", "depth 1 / 1 painted / While you were away",
    `${c.depth}/${c.paintedPanels}/${c.panelTitle}`,
    c.depth === 1 && c.paintedPanels === 1 && c.panelTitle === "While you were away");
  check("desktop: report paints in the inspector", "inspector present", Boolean(c.inspector), Boolean(c.inspector));
  await shoot(dp, "desktop-report", "return report in inspector", dView, 1);

  await closeReport(dp);
  c = await census(dp);
  slotChecks("desktop", c);
  check("desktop: yard view has no panel", "depth 0 / 0 painted", `${c.depth}/${c.paintedPanels}`,
    c.depth === 0 && c.paintedPanels === 0);
  check("desktop: research earned on mature yard", "enabled", c.slots.find((s) => s.slot === "research")?.disabled === false,
    c.slots.find((s) => s.slot === "research")?.disabled === false);
  check("desktop: save envelope alive", "tick>0, 8-char checksum", JSON.stringify(c.save),
    (c.save?.tick ?? 0) > 0 && c.save?.checksumChars === 8);
  const dYard = await shoot(dp, "desktop-yard", "yard + toolbar, no panel", dView, 1);
  canvasCensuses.desktop = await canvasStats(dp);
  check("desktop: yard canvas non-blank", ">40 unique colors", canvasCensuses.desktop?.uniqueColors,
    (canvasCensuses.desktop?.uniqueColors ?? 0) > 40);

  await tapSlot(dp, "trade");
  c = await census(dp);
  check("desktop: Trade opens ONE inspector surface", "depth 1 / 1 painted / Yard store",
    `${c.depth}/${c.paintedPanels}/${c.panelTitle}`,
    c.depth === 1 && c.paintedPanels === 1 && c.panelTitle === "Yard store");
  check("desktop: inspector width 340", "340", c.inspector?.w, Math.abs((c.inspector?.w ?? 0) - 340) <= 1);
  const topPx = Number.parseFloat(c.inspectorTopVar);
  check("desktop: inspector top honours --shell-inspector-top", c.inspectorTopVar, c.inspector?.y,
    Math.abs((c.inspector?.y ?? 0) - topPx) <= 1);
  // The toolbar is the BOTTOM bar; the inspector must stay vertically clear
  // of it (its bottom inset reserves the chrome band above the toolbar).
  const inspBottom = (c.inspector?.y ?? 0) + (c.inspector?.h ?? 0);
  check("desktop: inspector stays above the bottom toolbar", `bottom<=${c.toolbar?.y}`,
    +inspBottom.toFixed(1), inspBottom <= (c.toolbar?.y ?? 0) + 1);
  const dInspector = await shoot(dp, "desktop-inspector", "Yard store inspector", dView, 1);
  const dDiff = await pixelDiff(dp, dYard, dInspector);
  check("desktop: inspector visibly changes the frame", ">0.02 diff", dDiff, dDiff > 0.02);

  await openSettings(dp);
  c = await census(dp);
  check("desktop: Settings pushes, still ONE surface", "depth 2 / 1 painted / Settings",
    `${c.depth}/${c.paintedPanels}/${c.panelTitle}`,
    c.depth === 2 && c.paintedPanels === 1 && c.panelTitle === "Settings");
  await shoot(dp, "desktop-settings", "Settings over store (one surface)", dView, 1);
  await escape(dp);
  c = await census(dp);
  check("desktop: Escape pops exactly one", "depth 1 / Yard store", `${c.depth}/${c.panelTitle}`,
    c.depth === 1 && c.panelTitle === "Yard store");
  await escape(dp);
  c = await census(dp);
  check("desktop: second Escape empties the stack", "depth 0", c.depth, c.depth === 0);
  await dp.keyboard.press("3"); // fleet via digit shortcut
  await dp.waitForTimeout(300);
  c = await census(dp);
  check("desktop: digit 3 opens Fleet", "depth 1 / fleet pressed", `${c.depth}/${c.slots.find((s) => s.slot === "fleet")?.pressed}`,
    c.depth === 1 && c.slots.find((s) => s.slot === "fleet")?.pressed === "true");
  await escape(dp);
  await desktop.close();

  // ---------------- Phone 390x844 @2x: bottom sheet (EMULATION) ----------------
  const pView = { width: 390, height: 844 };
  const phone = await browser.newContext({
    viewport: pView, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  await installSeed(phone);
  const pp = await phone.newPage();
  watch(pp, "phone");
  await begin(pp);

  c = await census(pp);
  check("phone: Begin opens the report sheet", "depth 1 / 1 painted", `${c.depth}/${c.paintedPanels}`,
    c.depth === 1 && c.paintedPanels === 1);
  check("phone: report sheet in 35vh band", `${(0.35 * 844).toFixed(1)} +/-2`, c.sheet?.h,
    Math.abs((c.sheet?.h ?? 0) - 0.35 * 844) <= 2 && !c.sheetExpanded);
  await shoot(pp, "phone-report", "return report sheet 35vh", pView, 2);

  await closeReport(pp);
  c = await census(pp);
  slotChecks("phone", c);
  check("phone: yard view has no sheet", "depth 0 / no sheet", `${c.depth}/${Boolean(c.sheet)}`,
    c.depth === 0 && !c.sheet);
  const pYard = await shoot(pp, "phone-yard", "yard + toolbar, no sheet", pView, 2);
  canvasCensuses.phone = await canvasStats(pp);
  check("phone: yard canvas non-blank", ">40 unique colors", canvasCensuses.phone?.uniqueColors,
    (canvasCensuses.phone?.uniqueColors ?? 0) > 40);

  await tapSlot(pp, "trade");
  c = await census(pp);
  check("phone: Trade opens ONE sheet surface", "depth 1 / 1 painted / Yard store",
    `${c.depth}/${c.paintedPanels}/${c.panelTitle}`,
    c.depth === 1 && c.paintedPanels === 1 && c.panelTitle === "Yard store");
  check("phone: sheet collapsed at 35vh", `${(0.35 * 844).toFixed(1)} +/-2`, c.sheet?.h,
    Math.abs((c.sheet?.h ?? 0) - 0.35 * 844) <= 2);
  const pSheet = await shoot(pp, "phone-sheet", "Yard store sheet 35vh", pView, 2);

  await pp.click(".shell-host__expand");
  await pp.waitForTimeout(350);
  c = await census(pp);
  check("phone: expand reaches 70vh", `${(0.7 * 844).toFixed(1)} +/-2`, c.sheet?.h,
    Math.abs((c.sheet?.h ?? 0) - 0.7 * 844) <= 2 && c.sheetExpanded && c.expandAria === "true");
  const pExpanded = await shoot(pp, "phone-expanded", "Yard store sheet 70vh", pView, 2);
  const pDiff = await pixelDiff(pp, pSheet, pExpanded);
  check("phone: expansion visibly changes the frame", ">0.02 diff", pDiff, pDiff > 0.02);
  await pp.click(".shell-host__expand");
  await pp.waitForTimeout(350);
  c = await census(pp);
  check("phone: collapse returns to 35vh", `${(0.35 * 844).toFixed(1)} +/-2`, c.sheet?.h,
    Math.abs((c.sheet?.h ?? 0) - 0.35 * 844) <= 2 && !c.sheetExpanded && c.expandAria === "false");

  await openSettings(pp);
  c = await census(pp);
  check("phone: Settings pushes, still ONE surface", "depth 2 / 1 painted / Settings",
    `${c.depth}/${c.paintedPanels}/${c.panelTitle}`,
    c.depth === 2 && c.paintedPanels === 1 && c.panelTitle === "Settings");
  await shoot(pp, "phone-settings", "Settings sheet over store", pView, 2);
  await escape(pp);
  c = await census(pp);
  check("phone: Escape pops exactly one", "depth 1 / Yard store", `${c.depth}/${c.panelTitle}`,
    c.depth === 1 && c.panelTitle === "Yard store");
  await escape(pp);
  c = await census(pp);
  check("phone: second Escape empties the stack", "depth 0", c.depth, c.depth === 0);
  const pYardDiff = await pixelDiff(pp, pYard, pSheet);
  check("phone: sheet visibly changes the frame", ">0.02 diff", pYardDiff, pYardDiff > 0.02);
  await phone.close();
} finally {
  await browser.close();
  server.close();
}

check("runtime: zero page/console errors", "0", consoleErrors.length, consoleErrors.length === 0);

const passed = checks.filter((k) => k.pass).length;
const report = {
  role: "developer (implementation author; NOT an independent review)",
  issue: 135,
  branch: "rw/135-shell-nav",
  headSha,
  treeCleanAtStart,
  capturedAt: new Date().toISOString(),
  method: "production build (dist/) served on a throwaway static server; playwright-core headless; " +
    "three.js renderer (#198) blits offscreen WebGL into the 2D yard canvas; " +
    "pixel stats decoded from the actual screenshot bytes in-browser; numeric DOM census; " +
    "phone context is DESKTOP EMULATION, not a real handset",
  visualInspection: "PENDING — non-vision author; owed at G1 (#151)",
  browser: { version: browser.version(), executablePath: executablePath ?? null, probeRenderer, swiftshaderForced },
  server: { port: PORT, distIndexBytes: readFileSync(resolve(dist, "index.html")).length },
  seed: { file: "docs/evidence/yard-mature.json", sha256: seedSha256, gapHours: +seedGapHours.toFixed(2) },
  thresholds: {
    uniqueColors: ">200 per frame", luminanceStddev: ">8", backgroundFraction: "<0.97",
    canvasUniqueColors: ">40", frameDiff: ">0.02", sheetBands: "35vh/70vh +/-2px",
    inspectorWidth: "340 +/-1px", slotFloor: "44x44",
  },
  canvas: canvasCensuses,
  captures,
  consoleErrors,
  checks,
  summary: { total: checks.length, passed, failed: checks.length - passed },
};
writeFileSync(resolve(evidenceDir, `${OUT}-pixels.json`), JSON.stringify(report, null, 2));
for (const k of checks) if (!k.pass) console.log(`FAIL ${k.name}: expected ${k.expected}, got ${k.actual}`);
console.log(`${OUT}: ${passed}/${checks.length} checks pass; head ${headSha}; treeCleanAtStart=${treeCleanAtStart}`);
process.exit(passed === checks.length ? 0 : 1);
