// RW3D T09 (#136) capture + numeric verification harness (developer role).
// Headless renders of the six authored assets at ACTUAL gameplay scale from
// docs/vision/assets/kit.json, with worker/truck references. Pattern: T04
// prototypes/rw3d-scale-fixture/capture.mjs (read-only reference).
// Non-vision agent: numeric/pixel checks only; capable visual inspection is an
// explicit OPEN GATE (G1 #151). No visual fidelity acceptance is claimed here.
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const PORT = 4316;
const W = 1600;
const H = 900;
const TOL_PX = 2;
const T09 = ["warehouse", "depot", "sorter", "furnace", "generator", "wreckSections"];
const VIEWS = ["front", "side", "iso"];
const EVIDENCE = path.join(root, "docs/evidence");
const PREFIX = "2026-11-14-rw3d-t09";

const kitRaw = fs.readFileSync(path.join(root, "docs/vision/assets/kit.json"));
const manifestRaw = fs.readFileSync(path.join(root, "docs/vision/assets/asset-manifest.json"));
const kit = JSON.parse(kitRaw.toString("utf8"));
const byId = new Map(kit.assets.map((a) => [a.id, a]));
const kitSha256 = createHash("sha256").update(kitRaw).digest("hex");
const manifestSha256 = createHash("sha256").update(manifestRaw).digest("hex");

// Independent Node-side rest AABB + world-space part boxes (chain positions,
// no three.js). Silhouette bounds must come from the union of projected PART
// boxes: in iso view the asset AABB corners are empty space and would
// overestimate the silhouette.
function restAabb(a) {
  const off = { root: [0, 0, 0] };
  for (const g of a.groups) {
    const p = off[g.parent];
    off[g.name] = [p[0] + g.position[0], p[1] + g.position[1], p[2] + g.position[2]];
  }
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const boxes = [];
  for (const p of a.parts) {
    const o = off[p.parent];
    const c = [o[0] + p.center[0], o[1] + p.center[1], o[2] + p.center[2]];
    const h = [p.size[0] / 2, p.size[1] / 2, p.size[2] / 2];
    boxes.push({ c, h });
    for (let i = 0; i < 3; i += 1) {
      min[i] = Math.min(min[i], c[i] - h[i]);
      max[i] = Math.max(max[i], c[i] + h[i]);
    }
  }
  return { min, max, boxes };
}
const nodeAabb = Object.fromEntries(T09.map((id) => [id, restAabb(byId.get(id))]));

// Independent clip sampler (mirrors main.js; nlerp with sign alignment).
function sampleClip(an, t) {
  const ts = an.times;
  if (t <= ts[0]) return [...an.values[0]];
  if (t >= ts[ts.length - 1]) return [...an.values[an.values.length - 1]];
  let i = 0;
  while (ts[i + 1] < t) i += 1;
  const f = (t - ts[i]) / (ts[i + 1] - ts[i]);
  const a = an.values[i];
  const b = an.values[i + 1];
  if (an.path === "rotation") {
    const d = a.reduce((s, v, k) => s + v * b[k], 0);
    const bb = d < 0 ? b.map((v) => -v) : b;
    const q = a.map((v, k) => v + (bb[k] - v) * f);
    const n = Math.hypot(...q);
    return q.map((v) => v / n);
  }
  return a.map((v, k) => v + (b[k] - v) * f);
}

function loadPlaywright() {
  for (const base of [path.join(here, "package.json"), path.join(root, "package.json")]) {
    try {
      return createRequire(base)("playwright-core");
    } catch {}
  }
  throw new Error("playwright-core not resolvable from harness or repo root");
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".gltf": "model/gltf+json",
  ".png": "image/png",
  ".css": "text/css",
};
function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const file = path.normalize(path.join(root, url === "/" ? "/prototypes/rw3d-buildings/index.html" : url));
    if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(PORT, "127.0.0.1", () => resolve(server)));
}

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error(`no Chrome/Edge found; set CHROME_PATH (tried ${candidates.join(", ")})`);
}

const checks = [];
function check(name, expected, actual, pass, detail) {
  checks.push({ name, expected, actual, pass, ...(detail ? { detail } : {}) });
  const mark = pass ? "PASS" : "FAIL";
  console.log(`${mark} ${name} expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
}
function near(a, b, tol) {
  return Math.abs(a - b) <= tol;
}

const STRIPS = [
  { asset: "depot", clip: "door_open", view: "front", times: [0, 0.3, 0.6, 0.9, 1.2] },
  { asset: "warehouse", clip: "vent_fan", view: "iso", times: [0, 3.25, 6.5, 9.75, 13] },
  { asset: "warehouse", clip: "pallet_lift", view: "side", times: [0, 0.75, 1.5, 2.25, 3] },
  { asset: "sorter", clip: "magnet_sweep", view: "front", times: [0, 1, 2, 3, 4] },
  { asset: "furnace", clip: "pour", view: "side", times: [0, 0.6, 1.2, 1.8, 2.4] },
  { asset: "furnace", clip: "vent_puff", view: "iso", times: [0, 0.5, 1, 1.5, 2] },
  { asset: "generator", clip: "fan_spin_down", view: "front", times: [0, 0.9, 1.8, 2.7, 3.6] },
  { asset: "generator", clip: "fan_start", view: "front", times: [0, 0.9, 1.8, 2.7, 3.6] },
];

async function main() {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const server = await serve();
  const { chromium } = loadPlaywright();
  const executablePath = findBrowser();
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
  });
  const pageErrors = [];
  try {
    const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    await page.goto(`http://127.0.0.1:${PORT}/prototypes/rw3d-buildings/index.html`, { waitUntil: "load" });
    await page.waitForFunction("window.__fixture && window.__fixture.ready === true", null, { timeout: 60000 });
    const meta = await page.evaluate(() => window.__fixture.meta);
    check("three revision (ADR-0001 exact 0.187.0)", "187", meta.threeRevision, meta.threeRevision === "187");
    check("page errors", 0, pageErrors.length, pageErrors.length === 0, pageErrors.slice(0, 5));

    const assets = {};
    for (const id of T09) {
      const a = byId.get(id);
      const pageBox = await page.evaluate((x) => window.__fixture.aabb(x), id);
      const nb = nodeAabb[id];
      const aabbDelta = Math.max(
        ...nb.min.map((v, i) => Math.abs(v - pageBox.min[i])),
        ...nb.max.map((v, i) => Math.abs(v - pageBox.max[i]))
      );
      check(`${id} scene AABB vs independent Node AABB`, { min: nb.min, max: nb.max }, pageBox, aabbDelta < 1e-9);
      const entry = {
        footprint: a.footprint,
        envelope: { min: nb.min, max: nb.max },
        sockets: a.sockets.map((s) => ({ name: s.name, kind: s.kind, position: s.position })),
        pivots: a.groups.map((g) => ({ name: g.name, parent: g.parent, position: g.position })),
        paletteTokens: [...new Set(a.parts.map((p) => p.material))].sort(),
        views: {},
      };
      for (const view of VIEWS) {
        await page.evaluate(([x, v]) => window.__fixture.show(x, v), [id, view]);
        await page.screenshot({ path: path.join(EVIDENCE, `${PREFIX}-${id}-${view}.png`) });
        const m = await page.evaluate(([x, v]) => window.__fixture.maskPass(x, v), [id, view]);
        await page.screenshot({ path: path.join(EVIDENCE, `${PREFIX}-${id}-${view}-mask.png`) });
        // Independent expected projection: union of the 8 corners of every
        // rest part box (exact silhouette bounds in any orthographic view).
        const { center, right, up, ppu } = m.cam;
        let exX0 = Infinity, exX1 = -Infinity, exY0 = Infinity, exY1 = -Infinity;
        for (const box of nb.boxes) {
          for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
            const v = [
              box.c[0] + sx * box.h[0] - center[0],
              box.c[1] + sy * box.h[1] - center[1],
              box.c[2] + sz * box.h[2] - center[2],
            ];
            const px = W / 2 + (v[0] * right[0] + v[1] * right[1] + v[2] * right[2]) * ppu;
            const py = H / 2 - (v[0] * up[0] + v[1] * up[1] + v[2] * up[2]) * ppu;
            exX0 = Math.min(exX0, px); exX1 = Math.max(exX1, px);
            exY0 = Math.min(exY0, py); exY1 = Math.max(exY1, py);
          }
        }
        const b = m.bounds;
        const ok = b && near(b.x0, exX0, TOL_PX) && near(b.x1, exX1, TOL_PX) && near(b.y0, exY0, TOL_PX) && near(b.y1, exY1, TOL_PX);
        check(`${id}/${view} silhouette bounds (+/-${TOL_PX}px)`, { x0: exX0, y0: exY0, x1: exX1, y1: exY1 }, b, Boolean(ok));
        if (view !== "iso") {
          // Ground contact: asset minY must be 0 and mask bottom at the ground line.
          const groundOk = nb.min[1] === 0 && b && near(b.y1, m.groundPx - 1, TOL_PX);
          check(`${id}/${view} ground contact (minY=0)`, { minY: 0, groundY: m.groundPx - 1 }, { minY: nb.min[1], maskBottom: b ? b.y1 : null }, Boolean(groundOk));
        }
        entry.views[view] = { bounds: b, expected: { x0: exX0, y0: exY0, x1: exX1, y1: exY1 }, ppu, groundPx: m.groundPx };
      }
      assets[id] = entry;
    }

    // Yard overview (all six authored assets + worker/truck refs, iso).
    await page.evaluate(() => window.__fixture.show("yard", "iso"));
    await page.screenshot({ path: path.join(EVIDENCE, `${PREFIX}-yard-iso.png`) });

    // Motion strips: deterministic samples, per-frame transform cross-check.
    const motion = [];
    for (const s of STRIPS) {
      const an = byId.get(s.asset).animations.find((x) => x.name === s.clip);
      const res = await page.evaluate(
        ([id, clip, times, view]) => window.__fixture.strip(id, clip, times, view),
        [s.asset, s.clip, s.times, s.view]
      );
      const png = Buffer.from(res.dataUrl.split(",")[1], "base64");
      fs.writeFileSync(path.join(EVIDENCE, `${PREFIX}-motion-${s.asset}-${s.clip}.png`), png);
      const frames = s.times.map((t, i) => {
        const expected = sampleClip(an, t);
        const actualNode = res.frames[i].actual;
        const actual = an.path === "translation" ? actualNode.position : an.path === "rotation" ? actualNode.quaternion : actualNode.scale;
        const maxDelta = Math.max(...expected.map((v, k) => Math.abs(v - actual[k])));
        return { t, expected, actual, maxDelta };
      });
      const ok = frames.every((f) => f.maxDelta < 1e-6) && res.frames.length === s.times.length;
      check(`motion ${s.asset}/${s.clip} frames vs independent sampler (1e-6)`, s.times.map((t) => sampleClip(an, t)), frames.map((f) => f.actual), ok);
      motion.push({ ...s, file: `${PREFIX}-motion-${s.asset}-${s.clip}.png`, frames, pass: ok });
    }
    check("page errors after captures", 0, pageErrors.length, pageErrors.length === 0, pageErrors.slice(0, 5));

    const fail = checks.filter((c) => !c.pass).length;
    const report = {
      role: "developer",
      issue: 136,
      acceptance: "V01/V06 numeric + rendered capture evidence; capable visual inspection PENDING (G1 #151)",
      generatedBy: "prototypes/rw3d-buildings/capture.mjs",
      note: "Non-vision agent: numeric/pixel checks only. No visual fidelity acceptance claimed.",
      meta: {
        browser: executablePath,
        three: "0.187.0",
        threeRevision: meta.threeRevision,
        canvas: { w: W, h: H },
        port: PORT,
        kitSha256,
        manifestSha256,
        tolerancePx: TOL_PX,
      },
      assets,
      motion,
      summary: { total: checks.length, pass: checks.length - fail, fail },
      checks,
    };
    fs.writeFileSync(path.join(EVIDENCE, `${PREFIX}-checks.json`), JSON.stringify(report, null, 2) + "\n");
    console.log(`SUMMARY total=${checks.length} pass=${checks.length - fail} fail=${fail}`);
    process.exitCode = fail > 0 ? 1 : 0;
    await context.close();
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
