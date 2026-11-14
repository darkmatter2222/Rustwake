// RW3D T04 (#131) headless capture + numeric pixel checks for the scale fixture.
// House pattern: playwright-core + installed Chrome/Edge (scripts/capture.mjs).
// playwright-core resolves from this prototype's own pinned devDependency first
// (the main repo's copy was an incomplete install: lib/ only, no package.json),
// then falls back to the main repo. No root files are modified.
//
// Usage: npm install && npm run capture   (from prototypes/rw3d-scale-fixture)
// Env:   RUSTWAKE_MAIN_REPO (default C:/Users/ryans/source/repos/Rustwake)
//        PORT (default 4311; legacy previews occupy 4164-4198/5161/8462)
//        CHROME_PATH (optional browser override)
//        FIXTURE_PREFIX (optional evidence filename prefix; default keeps the
//        T04 names. T05a (#194) re-runs use 2026-11-14-rw3d-t05a-fixture so the
//        prior T04 evidence is preserved for byte-compare.)
//
// Outputs (worktree docs/evidence/):
//   <prefix>-{front,side,iso}.png        rest beauty pass
//   <prefix>-checks.json                 rest expected/actual per check
//   <prefix>-motion-{a,b}-{front,side,iso}.png  T15 motion beauty passes
//   <prefix>-motion.json                 T15 (#142) inventory/isolation/frame checks
// Exit code 0 iff every check passes (rest AND motion). Deterministic: static
// rest pose, fixed camera fit, fixed canvas size, fixed clip sample times; no
// RNG, no clock-dependent scene state.
//
// T15 (#142) motion pass: clip inventory vs kit.json, numerical isolation proof
// (target moves; every non-subtree pivot group bit-stable) at mid and end of
// every rig clip, and silhouette bounds/aspect for two composed motion poses.
// Clips that return to rest at their end (loop rolls/spins, slew return,
// suspension bounce, load_pallet) are checked for EXACT return instead of
// displacement — glTF channels REPLACE local TRS, so rest is the fixed point.
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
const PREFIX = process.env.FIXTURE_PREFIX ?? "2026-11-14-rw3d-t04-fixture";
// Report the INSTALLED three version (ground truth), and refuse to run if it
// drifts from the fixture's exact pin (ADR-0001). Was hardcoded "0.160.0".
const pinnedThree = JSON.parse(readFileSync(join(here, "package.json"), "utf8")).dependencies.three;
const threeVersion = JSON.parse(readFileSync(join(here, "node_modules", "three", "package.json"), "utf8")).version;
if (threeVersion !== pinnedThree) {
  console.error(`FAIL three version mismatch: installed ${threeVersion} vs pinned ${pinnedThree}`);
  process.exit(1);
}
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

// ---- T15 motion pass (node-side math; browser supplies world transforms) ----
const RIG_IDS = ["truck", "forklift", "crane", "drone", "worker"];
const motionChecks = [];
function mrecord(view, id, name, pass, expected, actual) {
  motionChecks.push({ view, id, name, pass, expected, actual });
  console.log(`${pass ? "PASS" : "FAIL"} [motion:${view}/${id}] ${name} | expected: ${expected} | actual: ${actual}`);
}
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const quatAngleRad = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])));
function subtreeOf(asset, target) {
  const s = new Set([target]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const g of asset.groups ?? []) {
      if (g.parent && s.has(g.parent) && !s.has(g.name)) { s.add(g.name); grew = true; }
    }
  }
  return s;
}
// A clip "returns to rest" when its final key equals the target's rest TRS
// (rest rotations are identity per kit contract). Data-driven, not hardcoded.
function endReturnsToRest(asset, an) {
  const g = asset.groups.find((x) => x.name === an.target);
  const end = an.values[an.values.length - 1];
  if (an.path === "translation") return dist3(end, g.position) <= 1e-9;
  if (an.path === "rotation") return quatAngleRad(end, [0, 0, 0, 1]) <= 1e-9;
  return false;
}
// Two composed poses exercising distinct mechanisms per rig (V04). Times are
// exact key times from kit.json (end holds) or mid-stride/quarter-turn samples.
const POSES = [
  { label: "a", spec: [
    { asset: "truck", clip: "door_open-1", t: 0.8 },
    { asset: "forklift", clip: "lift_pallet", t: 1.4 },
    { asset: "crane", clip: "hoist_place", t: 1.8 },
    { asset: "drone", clip: "cargo_attach", t: 1 },
    { asset: "worker", clip: "carry_arm1", t: 0.5 },
  ] },
  { label: "b", spec: [
    { asset: "truck", clip: "tailgate_open", t: 0.9 },
    { asset: "forklift", clip: "fork_spread_R", t: 0.6 },
    { asset: "crane", clip: "slew_rotate", t: 2.5 },
    { asset: "drone", clip: "rotor1_spin", t: 0.075 },
    { asset: "worker", clip: "walk_leg", t: 0.35 },
  ] },
];
const inventoryReports = [];
const isolationReports = [];
const frameReports = [];

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
      // Aspect tolerance = first-order propagation of the SAME per-corner
      // TOL_PX budget used by the bounds check: with |eps_w|,|eps_h| <= TOL_PX,
      // |d(w/h)| <= (TOL_PX/h) * (1 + w/h). The old formula (TOL_PX/h only)
      // ignored width error and under-bound wide, short silhouettes once T15
      // rig envelopes lowered the global fit ppu ~9% (turret/wreckSections).
      const aspectTol = Math.max(0.04, (TOL_PX / Math.max(e.h, 1)) * (1 + e.w / e.h));
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
  // ---- T15 motion phase 1: clip inventory vs node-side kit.json ------------
  const browserMeta = await page.evaluate(() => window.__fixture.motionMeta());
  for (const id of RIG_IDS) {
    const asset = kit.assets.find((a) => a.id === id);
    const b = browserMeta.find((x) => x.id === id);
    const bNames = (b?.clips ?? []).map((c) => c.name).sort();
    const kNames = asset.animations.map((c) => c.name).sort();
    const setPass = Boolean(b) && JSON.stringify(bNames) === JSON.stringify(kNames);
    mrecord("inventory", id, "clip set matches kit.json (no missing/extra)", setPass, JSON.stringify(kNames), JSON.stringify(bNames));
    const clipReports = [];
    for (const an of asset.animations) {
      const expected = { name: an.name, target: an.target, path: an.path, times: an.times, loop: an.loop, duration: an.times[an.times.length - 1] - an.times[0] };
      const actual = b?.clips.find((c) => c.name === an.name) ?? null;
      const ok = Boolean(actual) && JSON.stringify(actual) === JSON.stringify(expected);
      mrecord("inventory", id, `${an.name}: target/path/times/loop/duration match kit.json`, ok, JSON.stringify(expected), JSON.stringify(actual));
      clipReports.push({ name: an.name, pass: ok, expected, actual });
    }
    inventoryReports.push({ id, setPass, clips: clipReports });
  }

  // ---- T15 motion phase 2: numerical isolation proof per clip --------------
  // Baseline rest world transforms are captured once per rig in the current
  // (iso) layout; applyClip never touches layout, so deltas are pose-only.
  for (const id of RIG_IDS) {
    const asset = kit.assets.find((a) => a.id === id);
    const restList = await page.evaluate((x) => window.__fixture.worldTransforms(x), id);
    const rest = Object.fromEntries(restList.map((g) => [g.name, g]));
    const clipReports = [];
    for (const an of asset.animations) {
      const tMid = (an.times[0] + an.times[an.times.length - 1]) / 2;
      const tEnd = an.times[an.times.length - 1];
      const subtree = subtreeOf(asset, an.target);
      const returns = endReturnsToRest(asset, an);
      const samples = {};
      for (const [label, t] of [["mid", tMid], ["end", tEnd]]) {
        const posed = await page.evaluate((x) => window.__fixture.applyClip(x.id, x.clip, x.t), { id, clip: an.name, t });
        const now = Object.fromEntries(posed.groups.map((g) => [g.name, g]));
        const dPos = dist3(rest[an.target].pos, now[an.target].pos);
        const dAng = quatAngleRad(rest[an.target].quat, now[an.target].quat);
        const moved = dPos > 1e-6 || dAng > 1e-6;
        const exactRest = dPos <= 1e-9 && dAng <= 1e-9;
        let maxDev = 0;
        let worst = null;
        for (const g of asset.groups) {
          if (subtree.has(g.name)) continue;
          const dev = Math.max(dist3(rest[g.name].pos, now[g.name].pos), quatAngleRad(rest[g.name].quat, now[g.name].quat));
          if (dev > maxDev) { maxDev = dev; worst = g.name; }
        }
        const fixedPass = maxDev <= 1e-9;
        mrecord("isolation", id, `${an.name}: non-subtree pivots fixed at ${label}`, fixedPass, "max pos/rot deviation <= 1e-9", `${maxDev.toExponential(2)}${worst ? " @" + worst : ""}`);
        if (label === "mid") {
          mrecord("isolation", id, `${an.name}: target ${an.target} moves at mid`, moved, "pos > 1e-6 or rot > 1e-6 rad", `dPos=${dPos.toExponential(2)} dAng=${dAng.toExponential(2)}`);
        } else {
          const ok = returns ? exactRest : moved;
          mrecord("isolation", id, `${an.name}: target ${returns ? "returns exactly to rest" : "stays displaced"} at end`, ok, returns ? "pos <= 1e-9 and rot <= 1e-9 rad" : "pos > 1e-6 or rot > 1e-6 rad", `dPos=${dPos.toExponential(2)} dAng=${dAng.toExponential(2)}`);
        }
        samples[label] = { t, dPos, dAng, moved, exactRest, maxDev, worst, fixedPass };
      }
      clipReports.push({ name: an.name, target: an.target, returns, samples });
    }
    await page.evaluate((x) => window.__fixture.resetPose(x), id);
    isolationReports.push({ id, clips: clipReports });
  }

  // ---- T15 motion phase 3: composed pose renders + silhouette checks -------
  for (const pose of POSES) {
    for (const view of VIEWS) {
      await page.evaluate((x) => window.__fixture.showMotion(x.view, x.spec, x.label), { view, spec: pose.spec, label: pose.label });
      await page.waitForTimeout(150);
      const png = join(EVIDENCE, `${PREFIX}-motion-${pose.label}-${view}.png`);
      await page.locator("canvas").screenshot({ path: png });
      console.log(`captured ${png}`);
      const report = await page.evaluate((x) => window.__fixture.motionMaskPass(x.view, x.spec), { view, spec: pose.spec });
      const assetChecks = [];
      for (const a of report.assets) {
        const e = a.expected;
        const m = a.actual;
        const deltas = m ? { x0: m.x0 - e.x0, y0: m.y0 - e.y0, x1: m.x1 - e.x1, y1: m.y1 - e.y1 } : null;
        const boundsPass = Boolean(m) && Math.abs(deltas.x0) <= TOL_PX && Math.abs(deltas.y0) <= TOL_PX && Math.abs(deltas.x1) <= TOL_PX && Math.abs(deltas.y1) <= TOL_PX;
        mrecord(`motion-${pose.label}/${view}`, a.id, "posed silhouette bounds match projected recipe corners", boundsPass, fmtB(e), fmtB(m));
        // Same propagated tolerance as the rest pass (see derivation above).
        const aspectTol = Math.max(0.04, (TOL_PX / Math.max(e.h, 1)) * (1 + e.w / e.h));
        const aspectPass = Boolean(m) && e.h > 0 && Math.abs(m.w / m.h - e.w / e.h) <= aspectTol;
        mrecord(`motion-${pose.label}/${view}`, a.id, "posed silhouette aspect matches expected scale", aspectPass, `${(e.w / e.h).toFixed(3)} (tol ${aspectTol.toFixed(3)})`, m ? (m.w / m.h).toFixed(3) : "null");
        assetChecks.push({ ...a, deltas, boundsPass, aspectPass });
      }
      frameReports.push({ pose: pose.label, view, ppu: report.ppu, png, spec: pose.spec, assets: assetChecks });
    }
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
    three: threeVersion,
    threeRevision: meta?.threeRevision ?? null,
    canvas: { w: 1600, h: 900 },
    port: PORT,
    kitSha256,
    tolerancePx: TOL_PX,
    hoverUnits: meta?.hover ?? null,
    assetOrder: meta?.order ?? null,
    extendedBy: [142],
    note: "Static rest pose; orthographic; front/side rows re-laid per view so assets never overlap on screen. Mask pass isolates each asset on pure white; silhouette threshold <250. Non-vision authoring: visual fidelity not certified. T15 (#142) motion pass (inventory/isolation/posed frames) is reported separately in <prefix>-motion.json; rest checks here are unchanged T04 semantics re-run against the current 13-asset kit.",
  },
  views: viewReports,
  summary: { total: checks.length, pass, fail },
};
const jsonPath = join(EVIDENCE, `${PREFIX}-checks.json`);
writeFileSync(jsonPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(`SUMMARY rest total=${checks.length} pass=${pass} fail=${fail}`);
console.log(`json report: ${jsonPath}`);

const mPass = motionChecks.filter((c) => c.pass).length;
const mFail = motionChecks.length - mPass;
const motionOut = {
  role: "developer",
  issue: 142,
  acceptance: "V04 V06",
  generatedBy: "prototypes/rw3d-scale-fixture/capture.mjs",
  meta: {
    browser: executablePath,
    three: threeVersion,
    threeRevision: meta?.threeRevision ?? null,
    canvas: { w: 1600, h: 900 },
    port: PORT,
    kitSha256,
    tolerancePx: TOL_PX,
    hoverUnits: meta?.hover ?? null,
    assetOrder: meta?.order ?? null,
    poses: POSES,
    note: "glTF channel semantics: REPLACE target node local TRS; LINEAR rotation = slerp. Isolation: target moves >1e-6 (pos or rad) at mid; at end, displaced clips stay moved and return clips (loop rolls/spins, slew, suspension, load_pallet) match rest <=1e-9; every non-subtree pivot <=1e-9 at both samples. Posed frames: silhouette bounds/aspect vs projected part corners, TOL_PX=2, mask threshold <250. Non-vision authoring: capable visual inspection PENDING (G1 #151).",
  },
  inventory: inventoryReports,
  isolation: isolationReports,
  frames: frameReports,
  summary: { total: motionChecks.length, pass: mPass, fail: mFail },
};
const motionPath = join(EVIDENCE, `${PREFIX}-motion.json`);
writeFileSync(motionPath, `${JSON.stringify(motionOut, null, 2)}\n`);
console.log(`SUMMARY motion total=${motionChecks.length} pass=${mPass} fail=${mFail}`);
console.log(`SUMMARY combined total=${checks.length + motionChecks.length} pass=${pass + mPass} fail=${fail + mFail}`);
console.log(`motion report: ${motionPath}`);
process.exitCode = fail + mFail > 0 ? 1 : 0;
