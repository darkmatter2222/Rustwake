// RW3D T04 (#131) headless capture + numeric pixel checks for the scale fixture.
// House pattern: playwright-core + installed Chrome/Edge (scripts/capture.mjs).
// playwright-core resolves from this prototype's own pinned devDependency first
// (the main repo's copy was an incomplete install: lib/ only, no package.json),
// then falls back to the main repo. No root files are modified.
//
// Usage: pnpm install && pnpm capture   (from prototypes/rw3d-scale-fixture)
// Env:   RUSTWAKE_MAIN_REPO (default C:/Users/ryans/source/repos/Rustwake)
//        PORT (default 4311; legacy previews occupy 4164-4198/5161/8462)
//        CHROME_PATH (optional browser override)
//
// Outputs (worktree docs/evidence/):
//   2026-11-14-rw3d-t04-fixture-{front,side,iso}.png  beauty pass
//   2026-11-14-rw3d-t04-fixture-checks.json           expected/actual per check
// Exit code 0 iff every check passes. Deterministic: static rest pose, fixed
// camera fit, fixed canvas size; no RNG, no clock-dependent scene state.
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const worktree = resolve(here, "../..");
const mainRepo = process.env.RUSTWAKE_MAIN_REPO ?? "C:/Users/ryans/source/repos/Rustwake";
function loadPlaywright() {
  for (const base of [join(here, "package.json"), join(mainRepo, "package.json")]) {
    try {
      return createRequire(base)("playwright-core");
    } catch {
      // try next base
    }
  }
  throw new Error("playwright-core not resolvable from fixture or main repo");
}
const { chromium } = loadPlaywright();

const PORT = Number(process.env.PORT ?? 4311);
const EVIDENCE = join(worktree, "docs", "evidence");
const PREFIX = "2026-11-14-rw3d-t04-fixture";
const TOL_PX = 2;
const VIEWS = ["front", "side", "iso"];
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".gltf": "model/gltf+json",
  ".png": "image/png",
  ".css": "text/css; charset=utf-8",
};

// ---- independent (node-side) recipe extents for scale anchors --------------
const kitPath = join(worktree, "docs", "vision", "assets", "kit.json");
const kitText = readFileSync(kitPath, "utf8");
const kit = JSON.parse(kitText);
const kitSha256 = createHash("sha256").update(kitText).digest("hex");

function extents(asset) {
  const off = { root: [0, 0, 0] };
  for (const g of asset.groups ?? []) {
    const p = off[g.parent ?? "root"];
    off[g.name] = [p[0] + g.position[0], p[1] + g.position[1], p[2] + g.position[2]];
  }
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of asset.parts) {
    const o = off[p.parent ?? "root"];
    for (let a = 0; a < 3; a += 1) {
      min[a] = Math.min(min[a], o[a] + p.center[a] - p.size[a] / 2);
      max[a] = Math.max(max[a], o[a] + p.center[a] + p.size[a] / 2);
    }
  }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}
const ext = Object.fromEntries(kit.assets.map((a) => [a.id, extents(a)]));

// Anchors: silhouette extent in px must equal recipe extent * pixelsPerUnit.
const ANCHORS = [
  { view: "front", id: "worker", axis: "h", units: ext.worker.size[1], label: "worker height (extent)" },
  { view: "front", id: "truck", axis: "h", units: ext.truck.size[1], label: "truck height (extent)" },
  { view: "side", id: "truck", axis: "w", units: ext.truck.size[2], label: "truck length" },
  { view: "front", id: "warehouse", axis: "w", units: ext.warehouse.size[0], label: "warehouse width (roof incl.)" },
  { view: "front", id: "depot", axis: "w", units: ext.depot.size[0], label: "depot width (roof incl.)" },
  { view: "front", id: "wall_gate", axis: "w", units: ext.wall_gate.size[0], label: "wall_gate width" },
];

// ---- static server (worktree root) -----------------------------------------
const server = createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${PORT}`).pathname);
  const file = normalize(join(worktree, urlPath));
  if (!file.startsWith(worktree) || !existsSync(file)) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const candidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));
if (!executablePath) {
  console.error("FAIL no Chrome/Edge executable found");
  process.exit(1);
}

const checks = [];
function record(view, id, name, pass, expected, actual) {
  checks.push({ view, id, name, pass, expected, actual });
  console.log(`${pass ? "PASS" : "FAIL"} [fixture:${view}/${id}] ${name} | expected: ${expected} | actual: ${actual}`);
}
const fmtB = (b) => (b ? `x[${b.x0.toFixed(1)},${b.x1.toFixed(1)}] y[${b.y0.toFixed(1)},${b.y1.toFixed(1)}] ${b.w.toFixed(1)}x${b.h.toFixed(1)}px` : "null");

mkdirSync(EVIDENCE, { recursive: true });
const browser = await chromium.launch({
  executablePath,
  args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
});
const pageErrors = [];
let meta = null;
const viewReports = [];

try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/prototypes/rw3d-scale-fixture/index.html`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__fixture?.ready === true, null, { timeout: 30000 });
  meta = await page.evaluate(() => window.__fixture.meta);

  for (const view of VIEWS) {
    await page.evaluate((v) => window.__fixture.show(v), view);
    await page.waitForTimeout(150);
    const png = join(EVIDENCE, `${PREFIX}-${view}.png`);
    await page.locator("canvas").screenshot({ path: png });
    console.log(`captured ${png}`);

    const report = await page.evaluate((v) => window.__fixture.maskPass(v), view);
    const assetChecks = [];
    for (const a of report.assets) {
      const e = a.expected;
      const m = a.actual;
      const deltas = m ? { x0: m.x0 - e.x0, y0: m.y0 - e.y0, x1: m.x1 - e.x1, y1: m.y1 - e.y1 } : null;
      const boundsPass = Boolean(m) && Math.abs(deltas.x0) <= TOL_PX && Math.abs(deltas.y0) <= TOL_PX && Math.abs(deltas.x1) <= TOL_PX && Math.abs(deltas.y1) <= TOL_PX;
      record(view, a.id, "silhouette bounds match projected recipe corners", boundsPass, fmtB(e), fmtB(m));
      const aspectTol = Math.max(0.04, TOL_PX / Math.max(e.h, 1));
      const aspectPass = Boolean(m) && e.h > 0 && Math.abs(m.w / m.h - e.w / e.h) <= aspectTol;
      record(view, a.id, "silhouette aspect matches expected scale", aspectPass, `${(e.w / e.h).toFixed(3)} (tol ${aspectTol.toFixed(3)})`, m ? (m.w / m.h).toFixed(3) : "null");
      // Front/side orthographic: screen y is world Y, so the silhouette bottom
      // must sit at ground + (hover + localMinY) * ppu. Iso mixes axes: skip.
      let ground = null;
      if (view !== "iso" && m) {
        const expectedBottom = a.groundPx.y - (a.hover + a.localMinY) * report.ppu;
        const pass = Math.abs(m.y1 - expectedBottom) <= TOL_PX;
        ground = { expectedBottom, actualBottom: m.y1, pass };
        record(view, a.id, "sits at recipe height above grid (ground contact)", pass, `${expectedBottom.toFixed(1)}px`, `${m.y1}px`);
      }
      assetChecks.push({ ...a, deltas, boundsPass, aspectPass, ground });
    }
    const anchorChecks = [];
    for (const an of ANCHORS.filter((x) => x.view === view)) {
      const a = report.assets.find((x) => x.id === an.id);
      const expectedPx = an.units * report.ppu;
      const actualPx = a?.actual ? a.actual[an.axis] : null;
      const pass = actualPx !== null && Math.abs(actualPx - expectedPx) <= TOL_PX;
      record(view, an.id, `scale anchor: ${an.label}`, pass, `${an.units.toFixed(3)}u * ${report.ppu.toFixed(2)}px/u = ${expectedPx.toFixed(1)}px`, actualPx === null ? "null" : `${actualPx}px`);
      anchorChecks.push({ ...an, expectedPx, actualPx, pass });
    }
    viewReports.push({ view, ppu: report.ppu, png, assets: assetChecks, anchors: anchorChecks });
  }
  record("all", "page", "no page errors during capture", pageErrors.length === 0, "[]", JSON.stringify(pageErrors));
} finally {
  await browser.close();
  server.close();
}

const pass = checks.filter((c) => c.pass).length;
const fail = checks.length - pass;
const out = {
  role: "developer",
  issue: 131,
  acceptance: "V06",
  generatedBy: "prototypes/rw3d-scale-fixture/capture.mjs",
  meta: {
    browser: executablePath,
    three: "0.160.0",
    threeRevision: meta?.threeRevision ?? null,
    canvas: { w: 1600, h: 900 },
    port: PORT,
    kitSha256,
    tolerancePx: TOL_PX,
    hoverUnits: meta?.hover ?? null,
    assetOrder: meta?.order ?? null,
    note: "Static rest pose; orthographic; front/side rows re-laid per view so assets never overlap on screen. Mask pass isolates each asset on pure white; silhouette threshold <250. Non-vision authoring: visual fidelity not certified.",
  },
  views: viewReports,
  summary: { total: checks.length, pass, fail },
};
const jsonPath = join(EVIDENCE, `${PREFIX}-checks.json`);
writeFileSync(jsonPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(`SUMMARY total=${checks.length} pass=${pass} fail=${fail}`);
console.log(`json report: ${jsonPath}`);
process.exitCode = fail > 0 ? 1 : 0;
