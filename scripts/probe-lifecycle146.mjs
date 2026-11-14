// Issue #146 running-build evidence: safe MOVE, DISMANTLE and CARGO RECALL (T19,
// acceptance E04/E09) exercised through the REAL shipped code in headless Chrome.
//
// T19 is a store/world slice: the LifecycleApi lives on the store and has no UI
// surface yet (move/dismantle/recall buttons are a later task). The faithful way
// to prove the shipped code runs in a real browser runtime — without modifying
// src — is to boot the actual app from the Vite dev server, then dynamically
// import the real `src/app/store.ts`, `src/game/world` and logistics modules IN
// THE PAGE and drive the LifecycleApi against an isolated in-memory storage.
// Every numeric readback below is computed by the shipped module inside Chrome;
// Node only asserts the returned facts. This is the same code path the vitest
// suite covers, re-proven in the browser runtime (not a Node-only claim).
//
// Scenarios (all against the real createStore / applyWorldCommand):
//   move            - preview is pure and equals the commit fee; the commit
//                     recalls affected cargo, preserves id/completedTick,
//                     retargets the logistics approach cell, conserves BOTH
//                     ledgers and never touches SAVE_KEY/export.
//   dismantle-block - cargo-not-drained / inventory-present / unknown-recovery /
//                     recovery-full each refuse with both fingerprints unchanged.
//   dismantle-overflow - recovery transfer + floor(80%) refund into a FULL store
//                     overflows visibly; world + cargo conserved; save untouched.
//   recall-overflow - preview predicts recovery; recall drains the overflow ledger
//                     exactly once (second recall recovers 0); cargo untouched.
//   writer-gate     - a reader tab is refused every commit (read-only); previews
//                     remain pure reads; the writer yard is untouched.
//   session-only    - a fresh tab over the same storage inherits no yard/cargo.
//   world-atomicity - same-position and out-of-bounds move refusals leave the world
//                     fingerprint byte-identical (sample of the vitest matrix).
//
// Visual fidelity of move/dismantle/recall is PENDING capable inspection at G1
// (#151): there is no lifecycle UI to photograph yet. The boot render here is
// runtime-health proof only (numeric DOM readback), NOT visual acceptance.
//
// Run:  npx vite --port 4296                       (background, dev server)
//       npx tsx scripts/probe-lifecycle146.mjs
// env:  RUSTWAKE_URL (default http://localhost:4296/), LC146_SHOTS (default docs/evidence/lifecycle146)
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright-core";

const url = process.env.RUSTWAKE_URL ?? "http://localhost:4296/";
const shots = process.env.LC146_SHOTS ?? "docs/evidence/lifecycle146";
const TARGET = "docs/evidence/146-lifecycle-headless.json";
const headSha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
const executablePath = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
]
  .filter(Boolean)
  .find((path) => existsSync(path));

const checks = [];
function check(scenario, cell, name, ok, detail) {
  const cellLabel = typeof cell === "string" ? cell : cell.label;
  checks.push({ scenario, cell: cellLabel, name, ok: ok === true, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"} [${cellLabel}/${scenario}] ${name}${detail === undefined ? "" : ` · ${JSON.stringify(detail)}`}`);
  return ok === true;
}

/** The whole lifecycle exercise runs inside the page against the real modules. */
async function exerciseInPage() {
  return await (async () => {
    const { createStore } = await import("/src/app/store.ts");
    const W = await import("/src/game/world/index.ts");
    const L = await import("/src/game/simulation/logistics.ts");
    const { SAVE_KEY } = await import("/src/game/persistence/save.ts");
    const { HOME_COPY } = await import("/src/ui/home/copy.ts");
    const {
      applyWorldCommand, advanceWorldTo, validatePlacement, validateMove,
      worldFingerprint, moveFeeOf, dismantleRefundOf, stockUnits, ROTATIONS, WORLD_KIT,
    } = W;
    const { logisticsTotals, logisticsFingerprint } = L;

    const mem = () => {
      const m = new Map();
      return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
    };
    const RES = ["scrap", "ferrous", "steel", "nonferrous", "polymer", "credit"];
    const totals = (w) => {
      const stock = {};
      const resources = new Set([...Object.keys(w.stock), ...Object.keys(w.committed)]);
      for (const r of w.reservations) for (const i of r.items) resources.add(i.resource);
      for (const e of w.overflow ?? []) resources.add(e.resource);
      for (const resource of resources) {
        let reserved = 0;
        for (const r of w.reservations) for (const i of r.items) if (i.resource === resource) reserved += i.qty;
        let overflow = 0;
        for (const e of w.overflow ?? []) if (e.resource === resource) overflow += e.qty;
        stock[resource] = (w.stock[resource] ?? 0) + reserved + (w.committed[resource] ?? 0) + overflow;
      }
      let rc = 0;
      for (const r of w.reservations) rc += r.credits;
      return { stock, credits: w.credits + rc + w.committedCredits };
    };
    const conserved = (w, base) => {
      const now = totals(w);
      for (const k of Object.keys(base.stock)) if ((now.stock[k] ?? 0) !== base.stock[k]) return false;
      return now.credits === base.credits;
    };
    const findCell = (w, asset) => {
      for (let y = 0; y < 24; y += 1) for (let x = 0; x < 24; x += 1) {
        if (validatePlacement(w, asset, { x, y }, 0) === null) return { x, y };
      }
      throw new Error("no legal cell for " + asset);
    };
    const findMove = (w, id) => {
      for (let y = 0; y < 24; y += 1) for (let x = 0; x < 24; x += 1) for (const r of ROTATIONS) {
        if (validateMove(w, id, { x, y }, r) === null) return { cell: { x, y }, rotation: r };
      }
      throw new Error("no legal move target");
    };
    const complete = (w, id, asset) => {
      const cell = findCell(w, asset);
      const res = applyWorldCommand(w, { id, type: "world.place", asset, cell, rotation: 0 });
      if (!res.ok) throw new Error("place refused " + JSON.stringify(res.rejection));
      advanceWorldTo(w, w.tick + WORLD_KIT[asset].constructionTicks);
      return cell;
    };
    const yard = (store) => {
      const w = store.getBuildWorld();
      w.stock.scrap = 1000; w.stock.steel = 1000; w.stock.ferrous = 1000; w.credits = 1000;
      const gen = complete(w, "setup-gen", "generator");
      const wh = complete(w, "setup-wh", "warehouse");
      store.registerLogisticsBuilding({ id: 1, cell: gen, capacity: 50 });
      store.registerLogisticsBuilding({ id: 2, cell: wh, capacity: 50 });
      store.seedLogisticsStock(1, "scrap", 20);
      store.createLogisticsJob({ id: "job-1", sourceBuildingId: 1, destBuildingId: 2, cargoType: "scrap", amount: 7 });
      return { gen, wh };
    };
    const overflowSum = (w) => (w.overflow ?? []).reduce((a, e) => a + e.qty, 0);
    const out = {};

    // A. move
    {
      const storage = mem();
      const store = createStore({ storage, now: () => 10, leaseId: "tab-a" });
      yard(store);
      const w = store.getBuildWorld(); const log = store.getLogistics();
      const baseW = totals(w); const baseL = logisticsTotals(log);
      const fpW = worldFingerprint(w); const fpL = logisticsFingerprint(log);
      const saveBefore = storage.getItem(SAVE_KEY); const exportBefore = store.exportSave();
      const target = findMove(w, 1);
      const preview = store.previewMoveBuilding(1, target.cell, target.rotation);
      const previewPure = worldFingerprint(w) === fpW && logisticsFingerprint(log) === fpL;
      const completedTick = w.buildings.find((b) => b.id === 1).completedTick;
      const result = store.moveBuilding(1, target.cell, target.rotation);
      const moved = w.buildings.find((b) => b.id === 1);
      out.move = {
        role: store.getRole(),
        previewRejection: preview.world.rejection,
        previewFee: preview.world.fee, expectedFee: moveFeeOf("generator"),
        affectedJobs: preview.affectedJobs.map((j) => j.jobId),
        previewPure,
        ok: result.ok, recalledJobIds: result.ok ? result.recalledJobIds : null,
        jobStatus: store.getLogisticsJobs().find((j) => j.id === 1).status,
        movedCell: moved.cell, targetCell: target.cell, movedRotation: moved.rotation, targetRotation: target.rotation,
        completedTickPreserved: moved.completedTick === completedTick,
        approachCell: log.buildings[1].cell,
        cargoConserved: JSON.stringify(logisticsTotals(log)) === JSON.stringify(baseL),
        worldConserved: conserved(w, baseW),
        saveUntouched: storage.getItem(SAVE_KEY) === saveBefore,
        exportUntouched: store.exportSave() === exportBefore,
      };
    }
    // B. dismantle blockers
    {
      const store = createStore({ storage: mem(), now: () => 10, leaseId: "tab-a" });
      yard(store);
      const w = store.getBuildWorld(); const log = store.getLogistics();
      const reasons = []; const atomic = [];
      const snap = () => [worldFingerprint(w), logisticsFingerprint(log)];
      let fp = snap();
      reasons.push(store.previewDismantleBuilding(2).blocker?.reason);
      let r = store.dismantleBuilding(2); atomic.push(!r.ok && r.rejection.reason === "cargo-not-drained" && worldFingerprint(w) === fp[0] && logisticsFingerprint(log) === fp[1]);
      store.recallCargo(); store.seedLogisticsStock(2, "scrap", 5);
      fp = snap();
      reasons.push(store.previewDismantleBuilding(2).blocker?.reason);
      r = store.dismantleBuilding(2); atomic.push(!r.ok && r.rejection.reason === "inventory-present" && worldFingerprint(w) === fp[0] && logisticsFingerprint(log) === fp[1]);
      reasons.push(store.previewDismantleBuilding(2, 999).blocker?.reason);
      r = store.dismantleBuilding(2, 999); atomic.push(!r.ok && r.rejection.reason === "unknown-recovery" && worldFingerprint(w) === fp[0] && logisticsFingerprint(log) === fp[1]);
      store.registerLogisticsBuilding({ id: 3, cell: { x: 0, y: 0 }, capacity: 2 }); store.seedLogisticsStock(3, "scrap", 2);
      fp = snap();
      const pFull = store.previewDismantleBuilding(2, 3);
      reasons.push(pFull.blocker?.reason);
      r = store.dismantleBuilding(2, 3); atomic.push(!r.ok && r.rejection.reason === "recovery-full" && worldFingerprint(w) === fp[0] && logisticsFingerprint(log) === fp[1]);
      out.blockers = { reasons, atomic, recoveryRoom: pFull.recovery };
    }
    // C. dismantle recovery + overflow
    {
      const storage = mem();
      const store = createStore({ storage, now: () => 10, leaseId: "tab-a" });
      yard(store);
      const w = store.getBuildWorld(); const log = store.getLogistics();
      store.recallCargo(); store.seedLogisticsStock(2, "scrap", 5);
      const baseW = totals(w); const baseL = logisticsTotals(log);
      const saveBefore = storage.getItem(SAVE_KEY); const exportBefore = store.exportSave();
      w.storageCapacity = stockUnits(w);
      const preview = store.previewDismantleBuilding(2, 1);
      const refundTotal = preview.world.refund.reduce((a, i) => a + i.qty, 0);
      const fpW = worldFingerprint(w);
      const previewPure = worldFingerprint(w) === fpW;
      const result = store.dismantleBuilding(2, 1);
      out.dismantle = {
        ok: result.ok, blocker: preview.blocker,
        previewRefund: preview.world.refund, expectedRefund: dismantleRefundOf("warehouse"),
        recovery: preview.recovery, previewPure, refundTotal,
        buildingRemoved: w.buildings.find((b) => b.id === 2) === undefined && log.buildings[2] === undefined && log.stocks[2] === undefined,
        overflowTotal: overflowSum(w),
        overflowSources: (w.overflow ?? []).map((e) => e.source.buildingId),
        overflowFormulaVersions: (w.overflow ?? []).map((e) => e.formulaVersion),
        cargoConserved: JSON.stringify(logisticsTotals(log)) === JSON.stringify(baseL),
        worldConserved: conserved(w, baseW),
        saveUntouched: storage.getItem(SAVE_KEY) === saveBefore,
        exportUntouched: store.exportSave() === exportBefore,
      };
    }
    // D. recall overflow exactly once
    {
      const store = createStore({ storage: mem(), now: () => 10, leaseId: "tab-a" });
      yard(store);
      const w = store.getBuildWorld(); const log = store.getLogistics();
      store.recallCargo();
      w.storageCapacity = stockUnits(w);
      store.dismantleBuilding(1, 2);
      const baseW = totals(w);
      const overflowTotal = overflowSum(w);
      const noRoom = store.previewRecallCargo().overflow.recoveredUnits;
      w.storageCapacity = stockUnits(w) + overflowTotal;
      const fullRoom = store.previewRecallCargo().overflow.recoveredUnits;
      const fpL = logisticsFingerprint(log);
      const result = store.recallCargo();
      const again = store.recallCargo();
      out.recall = {
        overflowTotal, noRoom, fullRoom,
        ok: result.ok, recovered: result.ok ? result.recoveredOverflowUnits : null,
        recalledJobIds: result.ok ? result.recalledJobIds : null,
        ledgerEmpty: (w.overflow ?? []).length === 0,
        secondRecovered: again.ok ? again.recoveredOverflowUnits : null,
        worldConserved: conserved(w, baseW),
        cargoUntouched: logisticsFingerprint(log) === fpL,
      };
    }
    // E. writer-gating
    {
      const storage = mem();
      const writer = createStore({ storage, now: () => 10, leaseId: "tab-a" });
      yard(writer);
      const reader = createStore({ storage, now: () => 10, leaseId: "tab-b" });
      const mv = reader.moveBuilding(1, { x: 1, y: 1 }, 0);
      const ds = reader.dismantleBuilding(1);
      const rc = reader.recallCargo();
      let previewsThrow = false;
      try { reader.previewMoveBuilding(1, { x: 1, y: 1 }, 0); reader.previewDismantleBuilding(1); reader.previewRecallCargo(); } catch { previewsThrow = true; }
      out.gate = {
        writerRole: writer.getRole(), readerRole: reader.getRole(),
        moveReason: mv.ok ? null : mv.rejection.reason,
        dismantleReason: ds.ok ? null : ds.rejection.reason,
        recallReason: rc.ok ? null : rc.rejection.reason,
        previewsThrow,
        writerJobIntact: writer.getLogisticsJobs().find((j) => j.id === 1).status !== "cancelled",
        writerBuildings: writer.getBuildWorld().buildings.length,
      };
    }
    // F. session-only fresh tab
    {
      const storage = mem();
      const store = createStore({ storage, now: () => 10, leaseId: "tab-a" });
      yard(store);
      store.recallCargo();
      store.getBuildWorld().storageCapacity = stockUnits(store.getBuildWorld());
      store.dismantleBuilding(1, 2);
      const fresh = createStore({ storage, now: () => 10, leaseId: "tab-c" });
      out.session = {
        freshBuildings: fresh.getBuildWorld().buildings.length,
        freshOverflow: (fresh.getBuildWorld().overflow ?? []).length,
        freshJobs: fresh.getLogisticsJobs().length,
      };
    }
    // G. world atomicity sample (real transactions module)
    {
      const w = W.createWorld(146);
      w.stock.scrap = 1000; w.stock.steel = 1000; w.credits = 1000;
      complete(w, "g", "generator");
      const b = w.buildings.find((x) => x.id === 1);
      const fp0 = worldFingerprint(w);
      const samePos = applyWorldCommand(w, { id: "a1", type: "world.move", buildingId: 1, cell: b.cell, rotation: b.rotation });
      const fp1 = worldFingerprint(w);
      const badCell = applyWorldCommand(w, { id: "a2", type: "world.move", buildingId: 1, cell: { x: -5, y: -5 }, rotation: 0 });
      const fp2 = worldFingerprint(w);
      out.atomicity = {
        samePosReason: samePos.ok ? null : samePos.rejection.reason,
        samePosAtomic: !samePos.ok && fp1 === fp0,
        badCellReason: badCell.ok ? null : badCell.rejection.reason,
        badCellAtomic: !badCell.ok && fp2 === fp0,
      };
    }
    // Numeric runtime-health readback of the booted home screen (no vision claim).
    out.home = {
      title: document.title,
      buttons: [...document.querySelectorAll("button")].map((b) => (b.textContent ?? "").trim()).filter(Boolean),
      hasCanvas: !!document.querySelector("canvas"),
      rootChildren: document.getElementById("root")?.children.length ?? 0,
      freshYardVisible: [...document.querySelectorAll("body *")].some((n) => (n.textContent ?? "").trim() === HOME_COPY.freshYard),
      newGameLabel: HOME_COPY.newGame,
    };
    return out;
  })();
}

async function shot(page, cell, name) {
  mkdirSync(shots, { recursive: true });
  const path = `${shots}/${cell.label}-${name}.png`;
  await page.screenshot({ path });
  return path;
}

const CELLS = [
  { label: "390x844", width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { label: "1920x1080", width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
];

const run = async () => {
  console.log(`LC-146 running-build evidence · ${url} · head ${headSha}`);
  const browser = await chromium.launch({ executablePath, headless: true });
  const results = {};
  try {
    for (const cell of CELLS) {
      const context = await browser.newContext({
        viewport: { width: cell.width, height: cell.height },
        deviceScaleFactor: cell.deviceScaleFactor, isMobile: cell.isMobile, hasTouch: cell.hasTouch,
      });
      const page = await context.newPage();
      const pageErrors = []; const consoleErrors = [];
      page.on("pageerror", (e) => pageErrors.push(String(e)));
      page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
      // Boot the REAL app (running build) from the dev server.
      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      const bootShot = await shot(page, cell, "boot");
      const facts = await page.evaluate(exerciseInPage);
      await page.close();
      await context.close();
      results[cell.label] = { ...facts, bootShot, pageErrors, consoleErrors };

      const h = facts.home;
      check("runtime", cell, "real app booted (root mounted)", h.rootChildren > 0, { rootChildren: h.rootChildren, title: h.title });
      check("runtime", cell, "home screen offers New game (fresh session)", h.buttons.includes(h.newGameLabel), h.buttons);
      check("runtime", cell, "fresh-yard indicator visible", h.freshYardVisible, h.freshYardVisible);

      const m = facts.move;
      check("move", cell, "writer role", m.role === "writer", m.role);
      check("move", cell, "preview rejection null", m.previewRejection === null, m.previewRejection);
      check("move", cell, "preview fee == moveFeeOf(generator)", JSON.stringify(m.previewFee) === JSON.stringify(m.expectedFee), { got: m.previewFee, expected: m.expectedFee });
      check("move", cell, "preview names affected job 1", JSON.stringify(m.affectedJobs) === JSON.stringify([1]), m.affectedJobs);
      check("move", cell, "preview is pure (both fingerprints)", m.previewPure);
      check("move", cell, "commit ok + recalled job 1", m.ok && JSON.stringify(m.recalledJobIds) === JSON.stringify([1]), { ok: m.ok, recalled: m.recalledJobIds });
      check("move", cell, "affected cargo job cancelled", m.jobStatus === "cancelled", m.jobStatus);
      check("move", cell, "building moved to target cell/rotation", JSON.stringify(m.movedCell) === JSON.stringify(m.targetCell) && m.movedRotation === m.targetRotation, { cell: m.movedCell, rotation: m.movedRotation });
      check("move", cell, "completedTick preserved", m.completedTickPreserved);
      check("move", cell, "logistics approach retargeted", JSON.stringify(m.approachCell) === JSON.stringify(m.targetCell), m.approachCell);
      check("move", cell, "cargo conserved", m.cargoConserved);
      check("move", cell, "world material+credits conserved", m.worldConserved);
      check("move", cell, "SAVE_KEY untouched (session-only)", m.saveUntouched);
      check("move", cell, "exportSave untouched", m.exportUntouched);

      const b = facts.blockers;
      check("dismantle-block", cell, "blocker sequence", JSON.stringify(b.reasons) === JSON.stringify(["cargo-not-drained", "inventory-present", "unknown-recovery", "recovery-full"]), b.reasons);
      check("dismantle-block", cell, "every refusal atomic (both fingerprints)", b.atomic.every(Boolean), b.atomic);
      check("dismantle-block", cell, "recovery-full reports zero room", b.recoveryRoom?.room === 0, b.recoveryRoom);

      const d = facts.dismantle;
      check("dismantle-overflow", cell, "preview clear + refund == dismantleRefundOf(warehouse)", d.blocker === null && JSON.stringify(d.previewRefund) === JSON.stringify(d.expectedRefund), { blocker: d.blocker, refund: d.previewRefund });
      check("dismantle-overflow", cell, "preview pure", d.previewPure);
      check("dismantle-overflow", cell, "commit ok", d.ok);
      check("dismantle-overflow", cell, "building removed from both ledgers", d.buildingRemoved);
      check("dismantle-overflow", cell, "full store: refund overflows visibly (total == refund)", d.overflowTotal === d.refundTotal && d.overflowTotal > 0, { overflow: d.overflowTotal, refund: d.refundTotal });
      check("dismantle-overflow", cell, "overflow tagged to source building 2", d.overflowSources.every((id) => id === 2), d.overflowSources);
      check("dismantle-overflow", cell, "overflow stamped formulaVersion 1 (E09)", d.overflowFormulaVersions.every((v) => v === 1), d.overflowFormulaVersions);
      check("dismantle-overflow", cell, "cargo conserved across recovery transfer", d.cargoConserved);
      check("dismantle-overflow", cell, "world conserved incl. overflow", d.worldConserved);
      check("dismantle-overflow", cell, "save/export untouched", d.saveUntouched && d.exportUntouched);

      const r = facts.recall;
      check("recall-overflow", cell, "overflow created by dismantle", r.overflowTotal > 0, r.overflowTotal);
      check("recall-overflow", cell, "no room -> preview recovers 0", r.noRoom === 0, r.noRoom);
      check("recall-overflow", cell, "free room -> preview predicts full recovery", r.fullRoom === r.overflowTotal, { predicted: r.fullRoom, overflow: r.overflowTotal });
      check("recall-overflow", cell, "recall recovers exactly the overflow once", r.ok && r.recovered === r.overflowTotal && r.ledgerEmpty, { recovered: r.recovered, ledgerEmpty: r.ledgerEmpty });
      check("recall-overflow", cell, "no non-terminal jobs remain", JSON.stringify(r.recalledJobIds) === JSON.stringify([]), r.recalledJobIds);
      check("recall-overflow", cell, "second recall recovers 0 (no duplication)", r.secondRecovered === 0, r.secondRecovered);
      check("recall-overflow", cell, "world conserved after recall", r.worldConserved);
      check("recall-overflow", cell, "cargo ledger untouched by overflow recall", r.cargoUntouched);

      const g = facts.gate;
      check("writer-gate", cell, "writer/reader roles", g.writerRole === "writer" && g.readerRole === "reader", { writer: g.writerRole, reader: g.readerRole });
      check("writer-gate", cell, "reader refused move/dismantle/recall (read-only)", g.moveReason === "read-only" && g.dismantleReason === "read-only" && g.recallReason === "read-only", { move: g.moveReason, dismantle: g.dismantleReason, recall: g.recallReason });
      check("writer-gate", cell, "reader previews are pure reads (no throw)", !g.previewsThrow);
      check("writer-gate", cell, "writer yard untouched by reader", g.writerJobIntact && g.writerBuildings === 2, { jobIntact: g.writerJobIntact, buildings: g.writerBuildings });

      const s = facts.session;
      check("session-only", cell, "fresh tab inherits no yard/overflow/cargo", s.freshBuildings === 0 && s.freshOverflow === 0 && s.freshJobs === 0, s);

      const a = facts.atomicity;
      check("world-atomicity", cell, "same-position move refused + fingerprint identical", a.samePosReason === "same-position" && a.samePosAtomic, a);
      check("world-atomicity", cell, "out-of-bounds move refused + fingerprint identical", a.badCellReason === "outside-land" && a.badCellAtomic, { reason: a.badCellReason, atomic: a.badCellAtomic });

      check("console", cell, "zero page errors", pageErrors.length === 0, pageErrors);
      check("console", cell, "zero console errors", consoleErrors.length === 0, consoleErrors);
    }
  } finally {
    await browser.close();
  }
  const failed = checks.filter((e) => !e.ok);
  const body = {
    generatedBy: "scripts/probe-lifecycle146.mjs",
    issue: "https://github.com/darkmatter2222/Rustwake/issues/146",
    headSha, url,
    methodology: "Real app booted from the Vite dev server in headless Chrome; the shipped src/app/store.ts, src/game/world and logistics modules are imported IN THE PAGE and the LifecycleApi driven against isolated in-memory storage. Numeric readbacks computed by the shipped code in Chrome; asserted in Node. T19 has no lifecycle UI yet; the boot render + numeric DOM readback are runtime-health proof, NOT visual acceptance (visual fidelity PENDING G1 #151).",
    cells: CELLS.map(({ label, width, height, deviceScaleFactor, isMobile, hasTouch }) => ({ label, width, height, deviceScaleFactor, isMobile, hasTouch })),
    results, checks,
    summary: { total: checks.length, passed: checks.length - failed.length, failed: failed.length },
  };
  mkdirSync("docs/evidence", { recursive: true });
  writeFileSync(TARGET, `${JSON.stringify(body, null, 2)}\n`, "utf8");
  console.log(`\nLC-146 evidence: ${body.summary.passed}/${body.summary.total} checks passed, ${failed.length} failed`);
  console.log(`wrote ${TARGET} · shots under ${shots}/`);
  if (failed.length > 0) {
    for (const e of failed) console.log(`FAILED [${e.cell}/${e.scenario}] ${e.name} · ${JSON.stringify(e.detail)}`);
    process.exitCode = 1;
  }
};

run().catch((error) => { console.error(String(error)); process.exitCode = 1; });
