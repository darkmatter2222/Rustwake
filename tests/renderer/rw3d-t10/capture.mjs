/**
 * RW3D T10 (#137) motion evidence capture. Runs the real renderer in a real
 * browser (vite dev server on 4317 + system Chrome/Edge, SwiftShader
 * fallback) against the real world engine and sim economy, scripted at
 * fixed dt. Numerical phase checks only — a non-vision agent cannot
 * self-certify visual fidelity; capable visual inspection remains PENDING.
 *
 * Usage: node tests/renderer/rw3d-t10/capture.mjs
 * Writes docs/evidence/2026-11-14-rw3d-t10-* (JSON + PNGs).
 */
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchBrowser, headSha, evidenceDir, repoRoot } from "../rw3d-t07/lib.mjs";

const PORT = 4317;
const PREFIX = "2026-11-14-rw3d-t10";
const URL = `http://localhost:${PORT}/tests/renderer/rw3d-t10/harness.html`;
const SEED = 137;

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  [${detail}]` : ""}`);
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

async function startDevServer() {
  const child = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], {
    cwd: repoRoot, shell: true, stdio: ["ignore", "pipe", "pipe"],
  });
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(URL, { signal: AbortSignal.timeout(1500) });
      if (res.ok && (await res.text()).includes("RW3D T10 assembly harness")) return child;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  stopDevServer(child);
  throw new Error(`vite dev server did not start on ${PORT} within 45s`);
}
function stopDevServer(child) {
  if (!child || child.exitCode !== null) return;
  spawnSync("taskkill", ["/T", "/F", "/PID", String(child.pid)], { stdio: "ignore" });
}

async function main() {
  const head = headSha();
  const server = await startDevServer();
  const { browser, executablePath, probeRenderer, swiftshaderForced } = await launchBrowser();
  const scenarios = {};
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(URL);
    await page.waitForFunction("window.__RW3D__ !== undefined", null, { timeout: 30000 });
    const call = (fn, ...args) => page.evaluate(([f, a]) => window.__RW3D__[f](...a), [fn, args]);
    const shot = (name) => page.locator("#scene").screenshot({ path: resolve(evidenceDir, `${PREFIX}-${name}.png`) });

    // ---- A: five-stage timeline (V05 clip points 0/1/2/3/4/5 s) ----
    const initA = await call("init", SEED);
    check("A.init places warehouse and renders", initA.ok && initA.sample.report.length === 1, `cell ${JSON.stringify(initA.cell)}`);
    const timeline = [];
    const expected = [
      { t: 0, name: "base", visible: 1, done: false },
      { t: 10, name: "frame", visible: 3, done: false },
      { t: 20, name: "walls", visible: 6, done: false },
      { t: 30, name: "roof", visible: 11, done: false },
      { t: 40, name: "activation", visible: 18, done: false },
      { t: 50, name: "activation", visible: 18, done: true },
    ];
    for (const [i, e] of expected.entries()) {
      const s = await call("advanceTo", e.t);
      const r = s.report[0];
      timeline.push(s);
      check(`A.t${e.t} stage=${e.name} visible=${e.visible} done=${e.done}`,
        r.stageName === e.name && r.visibleParts === e.visible && r.done === e.done,
        `got ${r.stageName}/${r.visibleParts}/${r.done}`);
      const probe = await call("partProbe", ["foundation", "centerPier", "back", "roofBase", "doorPanel0"]);
      scenarios[`partProbe_t${e.t}`] = probe;
      await shot(`stage-${i}-${e.name}${e.done ? "-complete" : ""}`);
    }
    const vis = timeline.map((s) => s.report[0].visibleParts);
    check("A.visible part count monotone", vis.every((v, i) => i === 0 || v >= vis[i - 1]), vis.join(","));
    const stages = timeline.map((s) => s.report[0].stage);
    check("A.stage index monotone 0..4", stages.every((v, i) => i === 0 || v >= stages[i - 1]) && stages[5] === 4, stages.join(","));
    const p0 = scenarios.partProbe_t0.find((p) => p.name === "foundation");
    const p50 = scenarios.partProbe_t50.find((p) => p.name === "foundation");
    check("A.foundation settles +0.25u -> rest", near(p0.position[1], 0.35) && near(p50.position[1], 0.1), `${p0.position[1]} -> ${p50.position[1]}`);
    const pier10 = scenarios.partProbe_t10.find((p) => p.name === "centerPier");
    check("A.frame rises mid-stage (0 < scaleY < full)", pier10.visible && pier10.scale[1] > 0 && pier10.scale[1] < 2, `scaleY=${pier10.scale[1]}`);
    check("A.parts hidden before their stage",
      scenarios.partProbe_t0.find((p) => p.name === "centerPier").visible === false &&
      scenarios.partProbe_t10.find((p) => p.name === "back").visible === false &&
      scenarios.partProbe_t20.find((p) => p.name === "roofBase").visible === false &&
      scenarios.partProbe_t30.find((p) => p.name === "doorPanel0").visible === false);
    scenarios.timeline = timeline;

    // ---- B: reduced motion (U07) — discrete static stages, same economy ----
    await call("init", SEED);
    await call("advanceTo", 3);
    const fullMid = await call("partProbe", ["foundation"]);
    check("B.full motion interpolates mid-base", near(fullMid[0].position[1], 0.225, 1e-3), `y=${fullMid[0].position[1]}`);
    await call("setMotion", true, 0);
    const rmMid = await call("partProbe", ["foundation"]);
    check("B.reduced motion rests at kit center", near(rmMid[0].position[1], 0.1) && rmMid[0].visible, `y=${rmMid[0].position[1]}`);
    const rm10 = await call("advanceTo", 10);
    const rmPier = await call("partProbe", ["centerPier"]);
    check("B.reduced motion discrete full-size frame", rm10.report[0].stageName === "frame" && near(rmPier[0].scale[1], 2), `scaleY=${rmPier[0].scale[1]}`);
    const rm20 = await call("advanceTo", 20);
    await shot("reduced-motion");
    const fm20 = await call("setMotion", false, 0);
    check("B.motion setting never changes economy", rm20.fingerprint === fm20.fingerprint && rm20.report[0].visibleParts === fm20.report[0].visibleParts, rm20.fingerprint);
    scenarios.reducedMotion = { rmMid, rm10, rm20, fm20 };

    // ---- C: reload mid-build resumes the correct stage, no replay ----
    await call("init", SEED);
    const c25 = await call("advanceTo", 25);
    const cReload = await call("reload", null);
    check("C.reload at tick 25 preserves state byte-for-byte", c25.fingerprint === cReload.fingerprint && JSON.stringify(c25.report) === JSON.stringify(cReload.report), c25.fingerprint);
    check("C.reload resumes walls stage", cReload.report[0].stageName === "walls" && cReload.report[0].visibleParts === 6);
    const c50 = await call("advanceTo", 50);
    await call("init", SEED);
    const control50 = await call("advanceTo", 50);
    check("C.reloaded world completes identically to control", c50.fingerprint === control50.fingerprint && c50.economy.reservations === 0 && c50.economy.buildings === 1, c50.fingerprint);
    scenarios.reload = { c25, cReload, c50, control50 };

    // ---- D: fast-forward is presentation-equivalent ----
    await call("init", SEED);
    const d25 = await call("fastForward", 25);
    check("D.tick-by-tick 25 matches event-jump 25", d25.fingerprint === c25.fingerprint && d25.report[0].stageName === "walls", d25.fingerprint);
    const d50 = await call("fastForward", 25);
    check("D.tick-by-tick 50 matches control", d50.fingerprint === control50.fingerprint && d50.report[0].done === true, d50.fingerprint);
    scenarios.fastForward = { d25, d50 };

    // ---- E: upgrades add modules without replaying costs (E02) ----
    await call("init", SEED);
    const eBase = await call("advanceTo", 50);
    const eUp1 = await call("upgrade", null);
    check("E.upgrade charges once (30 credits)", eUp1.res.ok && eUp1.sample.sim.level === 2 && eBase.sim.credits - eUp1.sample.sim.credits === 30, `credits ${eBase.sim.credits} -> ${eUp1.sample.sim.credits}`);
    check("E.level 2 shows exactly one module", eUp1.sample.report[0].upgradeModules === 1);
    const eDup = await call("duplicateUpgrade", null);
    check("E.duplicate command id charges/levels again never", eDup.res.ok && eDup.sample.sim.level === 2 && eDup.sample.sim.credits === eUp1.sample.sim.credits && eDup.sample.report[0].upgradeModules === 1);
    check("E.sim upgrade never touches world economy", eDup.sample.fingerprint === eBase.fingerprint);
    await call("earn", null);
    const eUp2 = await call("upgrade", null);
    check("E.second distinct upgrade -> two modules", eUp2.res.ok && eUp2.sample.sim.level === 3 && eUp2.sample.report[0].upgradeModules === 2);
    await shot("upgrade-modules");
    scenarios.upgrades = { eBase, eUp1, eDup, eUp2 };

    // ---- F: idle mechanisms run on framePhase, static under reduced motion ----
    const f0 = await call("setMotion", false, 0);
    const f1 = await call("setMotion", false, 0.5);
    const vent = (s) => s.report[0].idleGroups.find((g) => g.name === "ventFan").rotation[1];
    check("F.idle fan advances with framePhase", vent(f1) > vent(f0), `${vent(f0).toFixed(4)} -> ${vent(f1).toFixed(4)}`);
    const fRm = await call("setMotion", true, 0.5);
    check("F.reduced motion idles are identity", fRm.report[0].idleGroups.every((g) => g.rotation[0] === 0 && g.rotation[1] === 0 && g.rotation[2] === 0));
    await call("setMotion", false, 0.5);
    await shot("idle-motion");
    scenarios.idle = { f0, f1, fRm };

    check("Z.no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
    scenarios.resources = f1.resources;
    check("Z.shared resources (1 geometry, 10 materials)", f1.resources.geometries === 1 && f1.resources.materials === 10, JSON.stringify(f1.resources));
  } finally {
    await browser.close();
    stopDevServer(server);
  }

  const failed = checks.filter((c) => !c.pass);
  const evidence = {
    prefix: PREFIX,
    role: "developer",
    issue: 137,
    head,
    seed: SEED,
    capturedAt: new Date().toISOString(),
    method: "vite dev server :4317 + playwright-core system browser; real renderer/engine/sim modules; scripted fixed-dt frames; numerical checks only",
    browser: { executablePath, probeRenderer, swiftshaderForced },
    baseline: { testFiles: 68, tests: 880, base: "dff3e352301d4ac7054024076a9609286f28849a" },
    checks,
    scenarios,
    limitations: [
      "Non-vision agent: numerical phase/transform checks only; capable visual inspection PENDING (architecture G1 #151).",
      "Small assets hold some stages (no new parts in that window); warehouse shows all five distinct stages.",
      "World<->sim level join is harness-side; production wiring owed to #148 cutover / #199 shell.",
      "Per-building named groups instead of full instancing for animated pivots (P1 scale tradeoff, #151 P02).",
    ],
  };
  writeFileSync(resolve(evidenceDir, `${PREFIX}-motion.json`), JSON.stringify(evidence, null, 2));
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed; evidence: ${PREFIX}-motion.json`);
  if (failed.length > 0) {
    console.log("FAILED:", failed.map((c) => c.name).join("; "));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
