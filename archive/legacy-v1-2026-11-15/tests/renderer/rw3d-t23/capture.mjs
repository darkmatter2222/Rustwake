/**
 * RW3D T23 (#150) layered machine activity + restrained spatial sound capture.
 * Runs the REAL drawScene (three.js world blit + 2D information overlay) and the
 * REAL createAudio mix graph in a real browser (vite dev server on 4323 + system
 * Chrome/Edge, SwiftShader fallback), scripted at fixed (tick, framePhase) pairs
 * and offline-rendered audio buffers. Numerical checks only — a non-vision agent
 * cannot self-certify visual fidelity; capable visual inspection remains PENDING
 * (architecture G1 #151).
 *
 * Usage: node tests/renderer/rw3d-t23/capture.mjs
 * Writes docs/evidence/2026-11-14-rw3d-t23-* (JSON + PNGs).
 */
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchBrowser, headSha, evidenceDir, repoRoot } from "../rw3d-t07/lib.mjs";

const PORT = 4323;
const PREFIX = "2026-11-14-rw3d-t23";
const URL = `http://localhost:${PORT}/tests/renderer/rw3d-t23/harness.html`;
const SEED = 150;

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  [${detail}]` : ""}`);
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const eq = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const dist = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));

async function startDevServer() {
  const child = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], {
    cwd: repoRoot, shell: true, stdio: ["ignore", "pipe", "pipe"],
  });
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(URL, { signal: AbortSignal.timeout(1500) });
      if (res.ok && (await res.text()).includes("RW3D T23 activity harness")) return child;
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
    const PAL = {};
    const ACC = {};
    const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const rawMeta = await page.evaluate(() => window.__RW3D__.meta);
    for (const [k, v] of Object.entries(rawMeta.PALETTE)) PAL[k] = hexRgb(v);
    for (const [k, v] of Object.entries(rawMeta.STATUS_ACCENTS)) ACC[k] = hexRgb(v);
    const PANNER_MAX = rawMeta.PANNER_MAX;

    // ---- S1: four DISTINCT truthful status readings on the real 3D path ----
    const s1 = await call("render", 344, 0, {});
    const byId = Object.fromEntries(s1.machines.map((m) => [m.id, m]));
    check("S1.running accent reaches the canvas", eq(byId[1].accent, ACC.running), `rgb=${byId[1].accent}`);
    check("S1.starved accent reaches the canvas", eq(byId[6].accent, ACC.starved), `rgb=${byId[6].accent}`);
    check("S1.outputFull accent reaches the canvas", eq(byId[3].accent, ACC.outputFull), `rgb=${byId[3].accent}`);
    check("S1.powerLimited accent reaches the canvas", eq(byId[4].accent, ACC.powerLimited), `rgb=${byId[4].accent}`);
    const accentSet = new Set([1, 6, 3, 4].map((id) => byId[id].accent.join(",")));
    check("S1.four statuses are four distinct colours", accentSet.size === 4, `${accentSet.size} distinct`);
    check("S1.powerLimited carries the shape tick", eq(byId[4].powerTick, PAL.select), `rgb=${byId[4].powerTick}`);
    check("S1.running core is amber", eq(byId[1].coreCenter, PAL.amber), `rgb=${byId[1].coreCenter}`);
    check("S1.starved core is quiet bodyMid, not amber", eq(byId[6].quietCore, PAL.bodyMid) && dist(byId[6].coreCenter, PAL.amber) > 40, `quiet=${byId[6].quietCore}`);
    check("S1.outputFull core is not amber (no fake work)", dist(byId[3].coreCenter, PAL.amber) > 40, `rgb=${byId[3].coreCenter}`);
    check("S1.outputFull retains held cargo (static mark)", eq(byId[3].heldCargo, PAL.bodyMid), `rgb=${byId[3].heldCargo}`);
    check("S1.powerLimited core is not amber (no fake work)", dist(byId[4].coreCenter, PAL.amber) > 40, `rgb=${byId[4].coreCenter}`);
    check("S1.render never mutates sim state", s1.stateIdentical === true);
    await shot("s1-distinct-states");
    scenarios.distinct = s1;

    // ---- S2: 600-tick independence sweep (every tick) on the real 3D path ----
    const frames = [];
    for (let tick = 0; tick < 600; tick += 1) frames.push(await call("render", tick, 0, {}));
    const series = (id) => frames.map((f) => f.machines.find((m) => m.id === id));
    const m1 = series(1); const m2 = series(2); const m5 = series(5);
    check("S2.every frame leaves sim state untouched", frames.every((f) => f.stateIdentical));
    const fanSolid = (ms) => ms.every((m) => m.fanBox && m.fanBox.allBodyLight);
    check("S2.fan blade painted solid at the model position (both sorters + furnace)",
      fanSolid(m1) && fanSolid(m2) && fanSolid(m5),
      `minCount=${Math.min(...[...m1, ...m2, ...m5].map((m) => m.fanBox?.bodyLightCount ?? 0))}/16`);
    const distinct = (ms, key) => new Set(ms.map((m) => m[key])).size;
    check("S2.running machines show motion (ring region changes)",
      distinct(m1, "ringHash") >= 4 && distinct(m2, "ringHash") >= 4 && distinct(m5, "ringHash") >= 4,
      `rings=${distinct(m1, "ringHash")}/${distinct(m2, "ringHash")}/${distinct(m5, "ringHash")}`);
    const amberNear = (p) => dist(p, PAL.amber) <= 16;
    const swellVisits = (ms) => {
      const on = ms.filter((m) => amberNear(m.swellProbe)).length;
      return on > 0 && on < ms.length;
    };
    check("S2.core swell visits both phases per machine (no stuck pulse)",
      swellVisits(m1) && swellVisits(m2) && swellVisits(m5),
      `swellFrames=${m1.filter((m) => amberNear(m.swellProbe)).length}/${m2.filter((m) => amberNear(m.swellProbe)).length}/${m5.filter((m) => amberNear(m.swellProbe)).length} of ${frames.length}`);
    const quietFrozen = [3, 4, 6].every((id) => distinct(series(id), "ringHash") === 1);
    check("S2.starved/blocked/unpowered frames are byte-identical (no fake production)", quietFrozen,
      `rings=${distinct(series(3), "ringHash")}/${distinct(series(4), "ringHash")}/${distinct(series(6), "ringHash")}`);
    // Independence: per-frame change flags must not lock together.
    let only1 = 0; let only2 = 0; let both = 0; let changed = 0;
    const fanPairs = new Set();
    let fanDisagree = 0; let swellDisagree = 0;
    for (let k = 0; k < frames.length; k += 1) {
      fanPairs.add(`${m1[k].fanStep},${m2[k].fanStep}`);
      if (m1[k].fanStep !== m2[k].fanStep) fanDisagree += 1;
      if (amberNear(m1[k].swellProbe) !== amberNear(m2[k].swellProbe)) swellDisagree += 1;
      if (k === 0) continue;
      const c1 = m1[k].ringHash !== m1[k - 1].ringHash;
      const c2 = m2[k].ringHash !== m2[k - 1].ringHash;
      if (c1 || c2) changed += 1;
      if (c1 && c2) both += 1;
      if (c1 && !c2) only1 += 1;
      if (c2 && !c1) only2 += 1;
    }
    check("S2.fan phases are independent (>=4 pair combos, >50% disagreement)",
      fanPairs.size >= 4 && fanDisagree / frames.length > 0.5,
      `pairs=${fanPairs.size}, disagree=${fanDisagree}/${frames.length}`);
    check("S2.swell phases are independent (mixed swell frames exist)", swellDisagree > 0, `mixed=${swellDisagree}/${frames.length}`);
    check("S2.motion never locks in unison (solo changes both ways, both<90%)",
      only1 > 0 && only2 > 0 && both / Math.max(1, changed) < 0.9,
      `only1=${only1}, only2=${only2}, both=${both}/${changed}`);
    const ventQuiet = m5.find((m) => m.ventPuffs === 0);
    const ventActive = m5.filter((m) => m.ventPuffs > 0);
    check("S2.furnace vent puffs appear and stay pool-bounded (<=2)",
      ventActive.length > 0 && m5.every((m) => m.ventPuffs <= 2),
      `puffFrames=${ventActive.length}, max=${Math.max(...m5.map((m) => m.ventPuffs))}`);
    check("S2.vent puffs change the vent region vs the quiet frame",
      ventQuiet !== undefined && ventActive.every((m) => m.ventHash !== ventQuiet.ventHash),
      `distinctVentHashes=${distinct(m5, "ventHash")}`);
    // Motion frames: three ticks where the two sorters disagree on fan AND swell.
    const motionTicks = [];
    for (let k = 0; k < frames.length && motionTicks.length < 3; k += 1) {
      if (m1[k].fanStep !== m2[k].fanStep && amberNear(m1[k].swellProbe) !== amberNear(m2[k].swellProbe)) {
        motionTicks.push(frames[k].tick);
      }
    }
    for (let i = 0; i < motionTicks.length; i += 1) {
      await call("render", motionTicks[i], 0, {});
      await shot(`s2-motion-${"abc"[i]}-tick${motionTicks[i]}`);
    }
    check("S2.three motion frames captured with disagreeing fans", motionTicks.length === 3, `ticks=${motionTicks.join("/")}`);
    scenarios.independence = {
      frames: frames.length, span: [0, 599], step: 1,
      ringDistinct: { m1: distinct(m1, "ringHash"), m2: distinct(m2, "ringHash"), m5: distinct(m5, "ringHash") },
      quietRingDistinct: { m3: distinct(series(3), "ringHash"), m4: distinct(series(4), "ringHash"), m6: distinct(series(6), "ringHash") },
      fanPairs: fanPairs.size, fanDisagree, swellDisagree, only1, only2, both, changed,
      ventPuffFrames: ventActive.length, motionTicks,
      sample: frames.filter((_, k) => k % 120 === 0).map((f) => ({
        tick: f.tick,
        m1: { fanStep: m1[f.tick].fanStep, pulse: m1[f.tick].pulse, ringHash: m1[f.tick].ringHash },
        m2: { fanStep: m2[f.tick].fanStep, pulse: m2[f.tick].pulse, ringHash: m2[f.tick].ringHash },
      })),
    };

    // ---- S3: reduced motion freezes movement, keeps every status readable ----
    const rmFrames = [];
    for (let tick = 0; tick < 600; tick += 29) rmFrames.push(await call("render", tick, 0, { reducedMotion: true }));
    const rm1 = rmFrames.map((f) => f.machines.find((m) => m.id === 1));
    const rm5 = rmFrames.map((f) => f.machines.find((m) => m.id === 5));
    const fanPos = new Set(rm1.map((m) => `${m.fanBox?.x},${m.fanBox?.y}`));
    check("S3.RM fan holds one discrete position", fanPos.size === 1, `positions=${fanPos.size}`);
    const rmRings = [1, 2, 3, 4, 5, 6].every((id) => new Set(rmFrames.map((f) => f.machines.find((m) => m.id === id).ringHash)).size === 1);
    check("S3.RM ring regions byte-identical across 600 ticks", rmRings);
    check("S3.RM never emits moving vent puffs", rm5.every((m) => m.ventPuffs === 0));
    const rmStageFrames = rm5.filter((m) => m.ventStage > 0);
    check("S3.RM keeps the vent stage readable (static mark when stage>0)",
      rmStageFrames.length > 0 && rmStageFrames.every((m) => eq(m.ventStageMark, PAL.bodyLight)),
      `stageFrames=${rmStageFrames.length}/${rm5.length}`);
    const rmAccent = rmFrames.every((f) => {
      const b = Object.fromEntries(f.machines.map((m) => [m.id, m]));
      return eq(b[1].accent, ACC.running) && eq(b[6].accent, ACC.starved) && eq(b[3].accent, ACC.outputFull) && eq(b[4].accent, ACC.powerLimited);
    });
    check("S3.RM retains all four status accents", rmAccent);
    check("S3.RM suppresses the swell (no amber at the swell probe)",
      rmFrames.every((f) => f.machines.filter((m) => [1, 2, 5].includes(m.id)).every((m) => !amberNear(m.swellProbe))));
    check("S3.RM render never mutates sim state", rmFrames.every((f) => f.stateIdentical));
    await call("render", 344, 0, { reducedMotion: true });
    await shot("s3-reduced-motion");
    scenarios.reducedMotion = { frames: rmFrames.length, fanPositions: fanPos.size, ventStageFrames: rmStageFrames.length };

    // ---- S4: far zoom keeps the status marks, throttles the fine layer ----
    const s4 = await call("render", 344, 0, { scale: 1.4 });
    const f4 = Object.fromEntries(s4.machines.map((m) => [m.id, m]));
    check("S4.far zoom keeps all four status accents",
      eq(f4[1].accent, ACC.running) && eq(f4[6].accent, ACC.starved) && eq(f4[3].accent, ACC.outputFull) && eq(f4[4].accent, ACC.powerLimited));
    check("S4.far zoom keeps the amber working core", eq(f4[1].coreCenter, PAL.amber), `rgb=${f4[1].coreCenter}`);
    check("S4.far zoom throttles the fine activity layer", s4.machines.every((m) => m.fanBox === undefined));
    await shot("s4-far-zoom");
    scenarios.farZoom = s4;

    // ---- S5: batch-driven rollers + magnet sweep follow real progress ----
    const batch = [];
    for (const progress of [60, 180, 300, 480]) batch.push(await call("render", 344, 0, { progress }));
    const steps = batch.map((f) => f.machines.find((m) => m.id === 1).rollerStep);
    check("S5.roller walks 0..3 with batch progress", steps.join(",") === "0,1,2,3", `steps=${steps.join(",")}`);
    check("S5.roller dot painted at the model position", batch.every((f) => eq(f.machines.find((m) => m.id === 1).rollerDot, PAL.bodyMid)));
    const sweepFlags = batch.map((f) => f.machines.find((m) => m.id === 1).sweep);
    check("S5.magnet sweep only in the first batch quarter", sweepFlags.join(",") === "true,false,false,false", `sweep=${sweepFlags.join(",")}`);
    check("S5.sweep mark painted only while sweeping",
      eq(batch[0].machines.find((m) => m.id === 1).sweepMark, PAL.select) && dist(batch[1].machines.find((m) => m.id === 1).sweepMark, PAL.select) > 40);
    scenarios.batch = { progress: [60, 180, 300, 480], steps, sweepFlags };

    // ---- A1: gentle machinery voices, restrained pan, offline-rendered ----
    const a1 = await call("audioPan");
    check("A1.mix never clips and stays under the documented ceiling",
      a1.whole.clip === 0 && a1.whole.peak <= 0.738 + 1e-3,
      `peak=${a1.whole.peak.toFixed(4)}, rms=${a1.whole.rms.toFixed(4)}, clip=${a1.whole.clip}`);
    check("A1.drone pans left (restrained, gentle)",
      a1.droneLeft.rmsL > a1.droneLeft.rmsR * 1.25 && a1.droneLeft.peak <= 0.25 && a1.droneLeft.rms <= 0.1,
      `L=${a1.droneLeft.rmsL.toFixed(4)} R=${a1.droneLeft.rmsR.toFixed(4)} peak=${a1.droneLeft.peak.toFixed(4)}`);
    check("A1.sorter pans right (restrained, gentle)",
      a1.sorterRight.rmsR > a1.sorterRight.rmsL * 1.25 && a1.sorterRight.peak <= 0.25 && a1.sorterRight.rms <= 0.1,
      `L=${a1.sorterRight.rmsL.toFixed(4)} R=${a1.sorterRight.rmsR.toFixed(4)} peak=${a1.sorterRight.peak.toFixed(4)}`);
    const fcBal = Math.abs(a1.furnaceCentre.rmsL - a1.furnaceCentre.rmsR) / Math.max(a1.furnaceCentre.rmsL, a1.furnaceCentre.rmsR, 1e-9);
    check("A1.furnace at pan 0 renders centre-balanced", fcBal <= 0.02, `balance=${fcBal.toFixed(5)}, peak=${a1.furnaceCentre.peak.toFixed(4)}`);
    const cnBal = Math.abs(a1.collectNonMachinery.rmsL - a1.collectNonMachinery.rmsR) / Math.max(a1.collectNonMachinery.rmsL, a1.collectNonMachinery.rmsR, 1e-9);
    check("A1.non-machinery cue ignores pan (centre, unchanged grammar)", cnBal <= 0.02, `balance=${cnBal.toFixed(5)}`);
    scenarios.audioPan = a1;

    // ---- A2: the pan clamp is exact (+5 == +PANNER_MAX, NaN == centre) ----
    const a2 = await call("audioClamp");
    const rel = (a, b) => Math.abs(a - b) / Math.max(a, b, 1e-9);
    check("A2.raw +5 clamps to +PANNER_MAX (identical render)",
      rel(a2.hardRight.rmsL, a2.maxRight.rmsL) <= 1e-3 && rel(a2.hardRight.rmsR, a2.maxRight.rmsR) <= 1e-3 && a2.hardRight.clip === 0,
      `hard L/R=${a2.hardRight.rmsL.toFixed(5)}/${a2.hardRight.rmsR.toFixed(5)}, max L/R=${a2.maxRight.rmsL.toFixed(5)}/${a2.maxRight.rmsR.toFixed(5)}`);
    const nanBal = Math.abs(a2.nan.rmsL - a2.nan.rmsR) / Math.max(a2.nan.rmsL, a2.nan.rmsR, 1e-9);
    check("A2.NaN pan falls back to centre", nanBal <= 0.02, `balance=${nanBal.toFixed(5)}`);
    check("A2.clamped voice stays gentle", a2.hardRight.peak <= 0.25, `peak=${a2.hardRight.peak.toFixed(4)} (PANNER_MAX=${PANNER_MAX})`);
    scenarios.audioClamp = a2;

    // ---- A3: mute is digital silence, both late and from start ----
    const a3 = await call("audioMute");
    check("A3.late mute silences cues AND beds (peak exactly 0)",
      a3.late.whole.peak === 0 && a3.late.whole.clip === 0, `peak=${a3.late.whole.peak}`);
    check("A3.muted-from-start renders digital silence",
      a3.fromStart.whole.peak === 0 && a3.fromStart.whole.clip === 0, `peak=${a3.fromStart.whole.peak}`);
    check("A3.unmuted control: beds-on graph is audible and gentle",
      a3.bedsAudible.whole.rms > 0.001 && a3.bedsAudible.whole.peak <= 0.25 && a3.bedsAudible.whole.clip === 0,
      `rms=${a3.bedsAudible.whole.rms.toFixed(4)}, peak=${a3.bedsAudible.whole.peak.toFixed(4)}`);
    scenarios.audioMute = { late: a3.late.whole, fromStart: a3.fromStart.whole, bedsAudible: a3.bedsAudible.whole };

    // ---- A4: 64 plays in 16 bursts — bounded pool, no clipping ----
    const a4 = await call("audioPool");
    const maxVoices = Math.max(...a4.marks.map((m) => m.voices));
    const maxPans = Math.max(...a4.marks.map((m) => m.pans));
    check("A4.voice ledger stays capped at 16 and is actually used",
      maxVoices <= 16 && maxVoices >= 8, `maxVoices=${maxVoices}, marks=${a4.marks.length}`);
    check("A4.pan hops never outnumber their voices", maxPans <= maxVoices, `maxPans=${maxPans}`);
    check("A4.saturated mix never clips and stays under the ceiling",
      a4.whole.clip === 0 && a4.whole.peak <= 0.738 + 1e-3,
      `peak=${a4.whole.peak.toFixed(4)}, rms=${a4.whole.rms.toFixed(4)}`);
    scenarios.audioPool = { marks: a4.marks, whole: a4.whole, maxVoices, maxPans };

    // ---- A5: graph read-back — the spatial hop is real wiring ----
    const a5 = await call("audioGraph");
    check("A5.machinery voice records gain->pan->machinery",
      a5.panEntry !== null && a5.voiceEntry !== null && a5.machineryBus !== null &&
      a5.panEntry.outputId === "machinery" && a5.panEntry.inputIds.includes(a5.voiceEntry.id) &&
      a5.voiceEntry.outputId === a5.panEntry.id && a5.machineryBus.inputIds.includes(a5.panEntry.id),
      `pan=${a5.panEntry?.id}, voice=${a5.voiceEntry?.id}`);
    check("A5.non-machinery voice has no pan hop", a5.collectHasPan === false, `nodes=${a5.totalNodes}`);
    scenarios.audioGraph = a5;

    check("Z.no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
    scenarios.glRenderer = probeRenderer;
  } finally {
    await browser.close();
    stopDevServer(server);
  }

  const failed = checks.filter((c) => !c.pass);
  const evidence = {
    prefix: PREFIX,
    role: "developer",
    issue: 150,
    head,
    seed: SEED,
    capturedAt: new Date().toISOString(),
    method: "vite dev server :4323 + playwright-core system browser; real drawScene (three.js blit + 2D overlay) at scripted (tick, framePhase); real createAudio graph offline-rendered via the additive contextFactory seam; numerical checks only",
    browser: { executablePath, probeRenderer, swiftshaderForced },
    checks,
    scenarios,
    limitations: [
      "Non-vision agent: numerical pixel/hash/offline-audio checks only; capable visual inspection PENDING (architecture G1 #151).",
      "Audio is verified by offline render (peak/RMS/clip/pan balance), not by listening; gentle-by-construction bounds are asserted, loudness perception is owed to capable review.",
      "Session-only/additive: no save shape, migration or simulation change; the activity model reads sim state and never writes it (state-identity witness on every frame).",
      "The fan/roller/vent overlay paints on BOTH the 2D and three.js paths; the recording census contexts (no setLineDash) keep the pinned legacy op census.",
    ],
  };
  writeFileSync(resolve(evidenceDir, `${PREFIX}-activity.json`), JSON.stringify(evidence, null, 2));
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed; evidence: ${PREFIX}-activity.json`);
  if (failed.length > 0) {
    console.log("FAILED:", failed.map((c) => c.name).join("; "));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});