/**
 * RW3D T16 (#143) fleet motion evidence capture. Runs the REAL three.js
 * YardWorld in a real browser (vite dev server on 4318 + system Chrome/Edge,
 * SwiftShader fallback) against the REAL #140 logistics ledger + #141 traffic
 * runtime, scripted at fixed dt. Numerical checks only — a non-vision agent
 * cannot self-certify visual fidelity; capable visual inspection remains
 * PENDING (architecture G1 #151).
 *
 * Usage: node tests/renderer/rw3d-t16/capture.mjs
 * Writes docs/evidence/2026-11-14-rw3d-t16-* (JSON + PNGs).
 */
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchBrowser, headSha, evidenceDir, repoRoot } from "../rw3d-t07/lib.mjs";

const PORT = 4318;
const PREFIX = "2026-11-14-rw3d-t16";
const URL = `http://localhost:${PORT}/tests/renderer/rw3d-t16/harness.html`;
const SEED = 143;

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
      if (res.ok && (await res.text()).includes("RW3D T16 fleet harness")) return child;
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
    const buf = (name) => readFileSync(resolve(evidenceDir, `${PREFIX}-${name}.png`));

    // ---- S0: empty bridge is the additive default (pixel parity) ----
    const s0 = await call("setup", "empty", SEED);
    check("S0.empty bridge hides every rig", s0.fleet.visibleRigs === 0 && s0.fleet.units.length === 0, `rigs=${s0.fleet.visibleRigs}`);
    check("S0.no jobs, ledger conserved", s0.ledger.jobs === 0 && s0.ledger.conserved && s0.ledger.total === 100);
    await shot("s0-empty-bridge");
    const s0reset = await call("resetBridge");
    await shot("s0-after-reset");
    check("S0.reset keeps the frame byte-identical (additive)", buf("s0-empty-bridge").equals(buf("s0-after-reset")), `${buf("s0-empty-bridge").length}B`);
    check("S0.empty bridge never touches the ledger", s0.fingerprints.logistics === s0reset.fingerprints.logistics && s0.fingerprints.traffic === s0reset.fingerprints.traffic);
    const s0idle = await call("publishIdle");
    check("S0.idle carriers park: 2 rigs, zero cargo, zero motion",
      s0idle.fleet.visibleRigs === 2 && s0idle.fleet.units.every((u) => u.stage === "parked" && u.cargo === 0 && u.cargoType === null && !u.moving && u.wheelTurns === 0 && u.lift === 0),
      `rigs=${s0idle.fleet.visibleRigs}`);
    check("S0.idle publish keeps cargo bound (none) and conserved", s0idle.ledger.bound && s0idle.ledger.loaded === 0 && s0idle.ledger.conserved);
    await shot("s0-idle-parked");
    scenarios.empty = { s0, s0reset, s0idle };

    // ---- S1: real lifecycle stages + cargo binding (E05) ----
    await call("setup", "lifecycle", SEED);
    const expected = { 1: "move-empty", 2: "load", 3: "load", 4: "load", 5: "move-loaded", 6: "depart", 7: "move-loaded", 8: "align", 9: "unload", 10: "unload", 11: "unload", 12: "parked" };
    const lifecycle = [];
    let stagesOk = true;
    let cargoOk = true;
    let boundOk = true;
    let conservedOk = true;
    let liftOk = true;
    const stageSet = new Set();
    for (let t = 1; t <= 12; t += 1) {
      const s = await call("tick", 1, false);
      const u = s.fleet.units[0];
      lifecycle.push({ t, stage: u.stage, cargo: u.cargo, lift: u.lift, pos: u.pos, moving: u.moving });
      stageSet.add(u.stage);
      if (u.stage !== expected[t]) stagesOk = false;
      const wantCargo = t >= 5 && t <= 11 ? 12 : 0;
      if (u.cargo !== wantCargo) cargoOk = false;
      if (!s.ledger.bound) boundOk = false;
      if (!s.ledger.conserved || s.ledger.total !== 100) conservedOk = false;
      if (u.stage === "load" || u.stage === "unload") { if (!(u.lift > 0 && u.lift <= 1)) liftOk = false; }
      else if (u.lift !== 0) liftOk = false;
      if (s.fleet.visibleRigs !== 1) stagesOk = false;
      if (t === 3) await shot("s1-load");
      if (t === 7) await shot("s1-move-loaded");
      if (t === 10) await shot("s1-unload");
    }
    check("S1.stages follow the real lifecycle tick by tick", stagesOk, lifecycle.map((l) => `${l.t}:${l.stage}`).join(" "));
    check("S1.cargo box appears only while job.inTransit > 0", cargoOk);
    check("S1.every visible load is bound to the real ledger", boundOk);
    check("S1.conservation holds every tick (total 100)", conservedOk);
    check("S1.lift rides the real load/unload timers only", liftOk);
    check("S1.all seven lifecycle stages observed", ["move-empty", "parked", "load", "move-loaded", "depart", "align", "unload"].every((x) => stageSet.has(x)), [...stageSet].join(","));
    const s1jobs = await call("jobs");
    check("S1.job completes with 12 delivered", s1jobs[0].status === "complete" && s1jobs[0].delivered === 12 && s1jobs[0].inTransit === 0, JSON.stringify(s1jobs[0]));
    scenarios.lifecycle = { lifecycle, jobs: s1jobs };

    // ---- S2: paused session freezes cargo/delivery/wheels (V04) ----
    await call("setup", "held", SEED); // default profile (L0/U0)
    for (let t = 1; t <= 4; t += 1) await call("tick", 1, false); // progress 2, loaded
    const before = await call("jobs");
    const w0 = (await call("observe", 0, false)).fleet.units[0].wheelTurns;
    const w1 = (await call("observe", 1, false)).fleet.units[0].wheelTurns;
    let pauseOk = true;
    let wheelOk = true;
    let fpOk = true;
    const fp0 = (await call("observe", 0, false)).fingerprints;
    for (const phase of [0, 0.25, 0.5, 0.75, 1, 0, 0.5, 1]) {
      const s = await call("observe", phase, false);
      const u = s.fleet.units[0];
      const j = (await call("jobs"))[0];
      if (j.progress !== before[0].progress || j.delivered !== before[0].delivered || j.inTransit !== before[0].inTransit) pauseOk = false;
      if (u.cargo !== 12 || u.stage !== "move-loaded") pauseOk = false;
      if (s.tick !== 4) pauseOk = false;
      if (!near(u.wheelTurns, w0 + (w1 - w0) * phase, 1e-9)) wheelOk = false;
      if (u.wheelTurns < w0 - 1e-9 || u.wheelTurns > w1 + 1e-9) wheelOk = false;
      if (s.fingerprints.logistics !== fp0.logistics || s.fingerprints.traffic !== fp0.traffic) fpOk = false;
      if (!s.ledger.bound || !s.ledger.conserved) pauseOk = false;
    }
    check("S2.paused session never advances cargo/delivery/progress", pauseOk, `progress=${before[0].progress}`);
    check("S2.wheels only finish the walked window, bounded [w0,w1]", wheelOk, `w0=${w0} w1=${w1}`);
    check("S2.phase sweep never mutates the ledgers (fingerprints)", fpOk);
    await shot("s2-paused");
    scenarios.pause = { before, w0, w1 };

    // ---- S3: bay contention costs real throughput (E05) ----
    await call("setup", "contention", SEED); // cap 1, L2/U0
    const queueBayTicks = [];
    const complete = new Map();
    let loadEvents = 0;
    let deliveryEvents = 0;
    let prevDelivered = 0;
    const prevCargo = new Map();
    let s3conserved = true;
    let s3bound = true;
    let queuedFrozen = null;
    for (let t = 1; t <= 16; t += 1) {
      const s = await call("tick", 1, false);
      if (!s.ledger.conserved || s.ledger.total !== 100) s3conserved = false;
      if (!s.ledger.bound) s3bound = false;
      for (const u of s.fleet.units) {
        if (u.stage === "queue-bay") queueBayTicks.push(t);
        const pc = prevCargo.get(u.carrierId) ?? 0;
        if (pc === 0 && u.cargo > 0) loadEvents += 1;
        prevCargo.set(u.carrierId, u.cargo);
      }
      let delivered = 0;
      for (const j of await call("jobs")) {
        delivered += j.delivered;
        if ((j.status === "complete" || j.status === "cancelled") && !complete.has(j.id)) complete.set(j.id, t);
      }
      if (delivered > prevDelivered) deliveryEvents += 1;
      prevDelivered = delivered;
      if (t === 2) {
        await shot("s3-queue-bay");
        const queued = s.fleet.units.find((u) => u.stage === "queue-bay");
        const loader = s.fleet.units.find((u) => u.stage === "load");
        check("S3.t2 one loads while the other queues bay-full", Boolean(queued) && Boolean(loader) && queued.heldKind === "bay-full" && !queued.moving && queued.cargo === 0, `queued=${queued && queued.heldKind} loader=${loader && loader.stage}`);
        // Freeze sweep on the queued carrier.
        const pos = { ...queued.pos };
        const wheels = queued.wheelTurns;
        let frozen = true;
        for (const phase of [0.25, 0.5, 0.75, 1, 0, 0.5, 1]) {
          const u = (await call("observe", phase, false)).fleet.units.find((x) => x.carrierId === queued.carrierId);
          if (u.stage !== "queue-bay" || u.pos.x !== pos.x || u.pos.y !== pos.y || u.wheelTurns !== wheels || u.moving) frozen = false;
        }
        queuedFrozen = frozen;
      }
    }
    const makespanC = Math.max(...complete.values());
    const firstDoneC = Math.min(...complete.values());
    check("S3.queued bay carrier freezes across a phase sweep", queuedFrozen === true);
    check("S3.bay contention: firstDone 8, makespan 11", firstDoneC === 8 && makespanC === 11, `first=${firstDoneC} makespan=${makespanC}`);
    check("S3.queue-bay ticks exactly [2,3,4]", JSON.stringify(queueBayTicks) === JSON.stringify([2, 3, 4]), queueBayTicks.join(","));
    check("S3.two real load + delivery events", loadEvents === 2 && deliveryEvents === 2, `load=${loadEvents} deliver=${deliveryEvents}`);
    check("S3.conserved + bound throughout contention", s3conserved && s3bound);
    // Free-bay control: cap 2 removes the contention cost.
    await call("setup", "contention", SEED);
    await call("setBay", [0, 0], 2);
    const completeF = new Map();
    const queueFree = [];
    for (let t = 1; t <= 16; t += 1) {
      const s = await call("tick", 1, false);
      for (const u of s.fleet.units) if (u.stage === "queue-bay") queueFree.push(t);
      for (const j of await call("jobs")) if ((j.status === "complete" || j.status === "cancelled") && !completeF.has(j.id)) completeF.set(j.id, t);
    }
    const makespanF = Math.max(...completeF.values());
    check("S3.free bay (cap 2): makespan 8, no queue", makespanF === 8 && queueFree.length === 0, `makespan=${makespanF} queue=${queueFree.join(",")}`);
    check("S3.contention costs exactly three ticks of makespan", makespanC - makespanF === 3, `${makespanC}-${makespanF}`);
    scenarios.contention = { queueBayTicks, makespanC, firstDoneC, makespanF, loadEvents, deliveryEvents };

    // ---- S4: a road cut holds with the exact blocker, then repairs (E05) ----
    await call("setup", "held", SEED);
    for (let t = 1; t <= 4; t += 1) await call("tick", 1, false);
    await call("cutRoad", [[2, 0]]); // cell under the carrier
    const held = await call("tick", 0, false);
    const hu = held.fleet.units[0];
    check("S4.road-removed hold: stage held, cargo intact, frozen", hu.stage === "held" && hu.heldKind === "road-removed" && hu.cargo === 12 && !hu.moving, `stage=${hu.stage} kind=${hu.heldKind}`);
    const hpos = { ...hu.pos };
    const hwheels = hu.wheelTurns;
    let heldFrozen = true;
    for (const phase of [0.25, 0.5, 0.75, 1, 0, 0.5, 1]) {
      const u = (await call("observe", phase, false)).fleet.units[0];
      if (u.stage !== "held" || u.pos.x !== hpos.x || u.pos.y !== hpos.y || u.wheelTurns !== hwheels || u.cargo !== 12 || u.moving) heldFrozen = false;
    }
    check("S4.held carrier never drifts across a phase sweep", heldFrozen);
    await shot("s4-held");
    await call("repairRoad", [[1, 0], [2, 0], [3, 0]]);
    let sawMoving = false;
    let repaired = null;
    for (let t = 0; t < 20; t += 1) {
      const s = await call("tick", 1, false);
      if (s.fleet.units[0].moving) sawMoving = true;
      const j = (await call("jobs"))[0];
      if (j.status === "complete") { repaired = j; break; }
    }
    check("S4.repair recovers the job to complete (12 delivered)", repaired !== null && repaired.delivered === 12 && sawMoving, `delivered=${repaired && repaired.delivered}`);
    // No-route variant: cut ahead of the carrier.
    await call("setup", "held", SEED);
    for (let t = 1; t <= 4; t += 1) await call("tick", 1, false);
    await call("cutRoad", [[3, 0], [4, 0]]);
    const nr = (await call("tick", 0, false)).fleet.units[0];
    check("S4.cut ahead holds no-route, cargo intact, frozen", nr.stage === "held" && nr.heldKind === "no-route" && nr.cargo === 12 && !nr.moving, `kind=${nr.heldKind}`);
    scenarios.held = { heldKind: hu.heldKind, noRouteKind: nr.heldKind, repaired };

    // ---- S5: reduced motion is discrete; full motion interpolates (pixels) ----
    // The pinned camera is top-down, so vertical lift motion projects to zero
    // screen displacement; the visible phase interpolation is horizontal travel.
    // Assert the discrete lift at a load window, and the pixel pair at a travel
    // window where pos.x actually slides across the ground plane.
    await call("setup", "lifecycle", SEED);
    await call("tick", 1, false); // t1
    await call("tick", 1, false); // t2
    const loadFull = await call("tick", 1, false); // t3 load window
    const loadRm = await call("setMotion", true, 0.5);
    check("S5.reduced motion lift is full (discrete)", loadRm.fleet.units[0].lift === 1 && loadRm.fleet.units[0].stage === "load", `lift=${loadRm.fleet.units[0].lift}`);
    check("S5.full motion lift is a fraction mid-timer", loadFull.fleet.units[0].lift > 0 && loadFull.fleet.units[0].lift < 1, `lift=${loadFull.fleet.units[0].lift}`);
    check("S5.motion setting never changes the economy", loadRm.fingerprints.logistics === loadFull.fingerprints.logistics && loadRm.fingerprints.traffic === loadFull.fingerprints.traffic);
    await call("tick", 1, false); // t4 load
    await call("tick", 1, false); // t5 move-loaded (new leg)
    await call("tick", 1, false); // t6 depart
    const travel = await call("tick", 1, false); // t7 move-loaded, travelling
    check("S5.travel window is moving (horizontal slide available)", travel.fleet.units[0].moving && travel.fleet.units[0].stage === "move-loaded", `stage=${travel.fleet.units[0].stage}`);
    const rmA = await call("setMotion", true, 0.13);
    await shot("s5-rm-a");
    const rmB = await call("setMotion", true, 0.87);
    await shot("s5-rm-b");
    check("S5.reduced motion: phase cannot move the frame (pixels)", buf("s5-rm-a").equals(buf("s5-rm-b")), `${buf("s5-rm-a").length}B`);
    check("S5.reduced motion units identical across phase", JSON.stringify(rmA.fleet.units) === JSON.stringify(rmB.fleet.units));
    check("S5.reduced motion rests on the cell centre", rmA.fleet.units[0].pos.x === rmA.fleet.units[0].cell.x + 0.5 && rmA.fleet.units[0].pos.y === rmA.fleet.units[0].cell.y + 0.5, `pos=${JSON.stringify(rmA.fleet.units[0].pos)}`);
    const fmA = await call("setMotion", false, 0.13);
    await shot("s5-full-a");
    const fmB = await call("setMotion", false, 0.87);
    await shot("s5-full-b");
    check("S5.full motion: phase interpolates the frame (pixels differ)", !buf("s5-full-a").equals(buf("s5-full-b")), `${buf("s5-full-a").length}B vs ${buf("s5-full-b").length}B`);
    check("S5.full motion slides pos.x backward over the walked cell", fmA.fleet.units[0].pos.x < fmB.fleet.units[0].pos.x, `${fmA.fleet.units[0].pos.x} -> ${fmB.fleet.units[0].pos.x}`);
    scenarios.reducedMotion = { rmLift: loadRm.fleet.units[0].lift, fullLift: loadFull.fleet.units[0].lift, travelFrom: fmA.fleet.units[0].pos.x, travelTo: fmB.fleet.units[0].pos.x };

    // ---- S6: 60-frame activity clip (V04) — independent timers, pause, starvation ----
    const clipInit = await call("setup", "clip", SEED);
    const c1 = clipInit.fleet.units[0].carrierId;
    const c2 = clipInit.fleet.units[1].carrierId;
    const firstCargo = new Map();
    const prevCargoC = new Map();
    const stagesSeen = new Set();
    let clipLoad = 0;
    let clipDeliver = 0;
    let prevDelC = 0;
    let pauseFrames = 0;
    let engineTicks = 0;
    let clipConserved = true;
    let clipBound = true;
    let starve = null;
    const PAUSE_START = 30;
    const PAUSE_END = 40;
    for (let f = 1; f <= 60; f += 1) {
      if (f >= PAUSE_START && f < PAUSE_END) {
        const jb = await call("jobs");
        const w1map = new Map();
        for (const phase of [0, 0.5, 1]) {
          const s = await call("observe", phase, false);
          if (!s.ledger.bound) clipBound = false;
          for (const u of s.fleet.units) { stagesSeen.add(u.stage); if (phase === 1) w1map.set(u.carrierId, u.wheelTurns); }
        }
        const ja = await call("jobs");
        for (let i = 0; i < ja.length; i += 1) {
          if (ja[i].delivered !== jb[i].delivered || ja[i].inTransit !== jb[i].inTransit || ja[i].progress !== jb[i].progress) clipConserved = false;
        }
        const again = await call("observe", 1, false);
        for (const u of again.fleet.units) if (u.wheelTurns !== w1map.get(u.carrierId)) clipConserved = false;
        pauseFrames += 1;
        continue;
      }
      if (f === 12 || f === 24) await call("spawnJobs", 2, 12);
      if (f === 50) starve = await call("trySpawn", 40, 12);
      const s = await call("tick", 1, false);
      engineTicks += 1;
      if (!s.ledger.conserved || s.ledger.total !== 200) clipConserved = false;
      if (!s.ledger.bound) clipBound = false;
      const early = await call("observe", 0.2, false);
      const late = await call("observe", 0.8, false);
      for (const u of s.fleet.units) {
        stagesSeen.add(u.stage);
        const eu = early.fleet.units.find((x) => x.carrierId === u.carrierId);
        const lu = late.fleet.units.find((x) => x.carrierId === u.carrierId);
        if (eu.stage !== u.stage || lu.stage !== u.stage) clipBound = false;
        const pc = prevCargoC.get(u.carrierId) ?? 0;
        if (pc === 0 && u.cargo > 0) { clipLoad += 1; if (!firstCargo.has(u.carrierId)) firstCargo.set(u.carrierId, s.tick); }
        prevCargoC.set(u.carrierId, u.cargo);
      }
      let delivered = 0;
      for (const j of await call("jobs")) delivered += j.delivered;
      if (delivered > prevDelC) clipDeliver += 1;
      prevDelC = delivered;
      if (f === 4) await shot("s6-clip-load");
      if (f === 8) await shot("s6-clip-move");
    }
    check("S6.independently timed carriers load on different ticks (c1=4, c2=8)", firstCargo.get(c1) === 4 && firstCargo.get(c2) === 8 && firstCargo.get(c1) !== firstCargo.get(c2), `c1=${firstCargo.get(c1)} c2=${firstCargo.get(c2)}`);
    check("S6.event-driven cargo moved (>=4 loads, >=4 deliveries)", clipLoad >= 4 && clipDeliver >= 4, `load=${clipLoad} deliver=${clipDeliver}`);
    check("S6.pause froze the session for 10 frames", pauseFrames === 10 && engineTicks === 50, `pause=${pauseFrames} ticks=${engineTicks}`);
    check("S6.starvation rejected creation (no fake cargo)", starve !== null && starve.rejected >= 1 && starve.reason === "insufficient-stock", `rejected=${starve && starve.rejected} reason=${starve && starve.reason}`);
    check("S6.clip exercised the real lifecycle stages", ["parked", "load", "move-empty", "move-loaded", "depart", "align", "unload"].every((x) => stagesSeen.has(x)), [...stagesSeen].join(","));
    check("S6.conserved + bound + stage-stable across the clip", clipConserved && clipBound);
    const end = await call("observe", 1, false);
    let idleFrozen = true;
    for (const u of end.fleet.units) {
      if (u.jobId === null) {
        if (u.stage !== "parked" || u.cargo !== 0 || u.moving) idleFrozen = false;
        const pos = { ...u.pos };
        const wheels = u.wheelTurns;
        for (const phase of [0, 0.5, 1, 0.5, 1]) {
          const uu = (await call("observe", phase, false)).fleet.units.find((x) => x.carrierId === u.carrierId);
          if (uu.pos.x !== pos.x || uu.pos.y !== pos.y || uu.wheelTurns !== wheels) idleFrozen = false;
        }
      }
    }
    check("S6.starved/idle carriers park frozen (no fake production)", idleFrozen);
    scenarios.clip = { c1, c2, firstCargo: Object.fromEntries(firstCargo), clipLoad, clipDeliver, pauseFrames, engineTicks, starve, stages: [...stagesSeen] };

    check("Z.no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
    const finalStats = await call("sample");
    scenarios.resources = finalStats.stats;
    scenarios.glRenderer = probeRenderer;
  } finally {
    await browser.close();
    stopDevServer(server);
  }

  const failed = checks.filter((c) => !c.pass);
  const evidence = {
    prefix: PREFIX,
    role: "developer",
    issue: 143,
    head,
    seed: SEED,
    capturedAt: new Date().toISOString(),
    method: "vite dev server :4318 + playwright-core system browser; real YardWorld + #140 logistics + #141 traffic; scripted fixed-dt frames; numerical checks only",
    browser: { executablePath, probeRenderer, swiftshaderForced },
    checks,
    scenarios,
    limitations: [
      "Non-vision agent: numerical stage/transform/pixel-diff checks only; capable visual inspection PENDING (architecture G1 #151).",
      "Session-only/additive: the fleet bridge is empty by default (pixel parity); the production store->publish feed is owed to #148 cutover (same precedent as QA-accepted #137 assembly view).",
      "YardWorld needs a real WebGL context, so it is exercised here in the browser; the pure adapter is additionally covered by 22 node vitest motion tests.",
      "Top-down pinned camera (yaw 0 / elev 90); isometric art orientation is a shell/art decision for G1.",
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
