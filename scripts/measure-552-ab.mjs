// dev-552b C1 economy A/B harness for issue #552 / PR #577 (node-side, NO browser).
// Product condition C1 (verbatim intent, ruling 6958022857): paired 2x2 A/B —
//   dispatcher {pre-#573 = src/simulation.js at --pre-dispatcher-sha (default
//               119326d98480b05039b11a6b2e46318dc1f81d39, main immediately
//               before #573 merged — NOT whatever is in the working tree),
//               post-#573 = src/simulation.js at --dispatcher-sha}
//   x yard     {screening built at t~0 via public buildAt, no screening}
// fresh yard, same seed (createGame seed is fixed at 4073; zero player input
// beyond the single buildAt). Report at t=120s: bank steel (gate > 20),
// per-resource delivered counts (depot arrivals from the real freight ledger,
// including screening's stone/copper pair), and scrap flow (> 0).
// Post-#573: NO zero-delivery output pair. Pre-#573: the #567 player-output
// starvation is pre-existing, but screening must not make bank steel WORSE
// than the no-screening control. stats.produced / total delivered are vanity
// metrics (ruling 6956801701 / 6956802181) — reported, NEVER gated.
//
// DISPATCHER VARIANTS ARE PARAMETERS, not hardcoded edits:
//   node scripts/measure-552-ab.mjs [--dispatcher-sha <40-char SHA>]
//                                   [--pre-dispatcher-sha <40-char SHA>]
// --dispatcher-sha defaults to d8a492a68a8e7415021da431cc520a685041ad97 (#573
// head); on the rebased head point it at the merged main SHA.
// --pre-dispatcher-sha defaults to 119326d98480b05039b11a6b2e46318dc1f81d39
// (main immediately before #573 merged). The harness HARD-FAILS if the two
// arms' simulation.js bytes are identical (a degenerate 2x2 with false labels).
//
// SAFE LOCAL EXPERIMENT (coordinator ratification, brief-dev-552b): for BOTH
// arms the orchestrator writes `git show <sha>:src/simulation.js` into the
// WORKING TREE ONLY (preBuf for the pre573 cells, postBuf for the post573
// cells), measures in fresh child processes, then restores the original bytes
// in a finally block and PROVES the restore (sha256 before/after + git diff
// --stat/--numstat for that path). The variants are NEVER committed. Every
// cell JSON carries the sha256 of the simulation.js bytes it actually
// imported, and the orchestrator cross-checks them per arm.
//
// SRC-PROVENANCE: BOTH arms are synthetic working-tree swaps of
// src/simulation.js against THIS HEAD's content.js — NOT real merged trees.
// The pre arm is #573's parent-main dispatcher at preSha; the post arm is the
// dispatcher at postSha. Both 40-char SHAs and both sha256s are printed with
// every table.
//
// Cell mode (internal): node scripts/measure-552-ab.mjs --cell --screening yes|no
// prints exactly one JSON object on stdout.
import {execFileSync, spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SIM_PATH = path.join(ROOT, "src", "simulation.js");
const DEFAULT_POST573_SHA = "d8a492a68a8e7415021da431cc520a685041ad97";
const DEFAULT_PRE573_SHA = "119326d98480b05039b11a6b2e46318dc1f81d39"; // main immediately before #573 merged
const T = 120, DT = 0.5; // t=120s is the product gate horizon — do not redefine.
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const fileUrl = (p) => new URL("file:///" + p.replace(/\\/g, "/")).href;
const git = (...args) => execFileSync("git", args, {cwd: ROOT});

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };

// ---------------- CELL MODE: one fresh yard, one dispatcher, one JSON ------
if (flag("--cell")) {
  const withScreening = opt("--screening", "no") === "yes";
  const sim = await import(fileUrl(SIM_PATH));
  const {BLUEPRINTS, WORLD_SIZE} = await import(fileUrl(path.join(ROOT, "src", "content.js")));
  const {checkSite} = await import(fileUrl(path.join(ROOT, "src", "gridOccupancy.js")));
  const simBytes = fs.readFileSync(SIM_PATH);
  const g = sim.createGame();
  const depot = g.buildings.find(b => b.type === "depot");
  let build = null;
  if (withScreening) {
    // Deterministic first legal site that is also road-connected to the depot
    // (same scan order as tests/screeningPlant.test.mjs legalSite, plus an
    // explicit freight-reach assertion so the A/B measures a WORKING plant).
    const depotRoad = sim.nearestRoad(g, depot.x, depot.z);
    let site = null;
    for (let z = 1; z < WORLD_SIZE - 1 && !site; z++)
      for (let x = 1; x < WORLD_SIZE - 1 && !site; x++) {
        if (!checkSite(g, "screening", x, z, 0).ok) continue;
        const r = sim.nearestRoad(g, x, z);
        if (r && depotRoad && sim.roadPath(g, r, depotRoad)) site = {x, z};
      }
    if (!site) throw new Error("no road-connected legal screening site");
    const r = sim.buildAt(g, "screening", site.x, site.z, 0); // t~0, public API
    if (!r.ok) throw new Error("buildAt screening failed: " + r.code + " " + r.reason);
    build = {ok: r.ok, code: r.code, id: r.building.id, x: site.x, z: site.z, remaining: r.building.remaining};
  }
  const deliveredByResource = {}, deliveredByPair = {};
  const scrapWindows = [0, 0]; // [0-60s), [60-120s)
  let lastLedgerId = 0, bankSteelAt120 = null;
  for (let t = 0; t < T; t += DT) {
    sim.advanceGame(g, DT);
    for (const e of g.freightLedger) {
      if (e.id <= lastLedgerId) continue;
      lastLedgerId = e.id;
      if (e.kind === "arrive" && e.destId === depot.id) {
        deliveredByResource[e.resource] = (deliveredByResource[e.resource] || 0) + e.amount;
        const k = e.sourceId + ":" + e.resource;
        deliveredByPair[k] = (deliveredByPair[k] || 0) + e.amount;
        if (e.resource === "scrap") scrapWindows[Math.min(1, Math.floor(e.time / 60))] += e.amount;
      }
    }
    if (bankSteelAt120 === null && g.elapsed >= T) bankSteelAt120 = Math.max(0, Number(g.bank.steel || 0));
  }
  // Output pairs = every (production building, output resource) actually present.
  const expectedOutputPairs = [];
  for (const b of g.buildings) {
    const def = BLUEPRINTS[b.type];
    if (!def || b.remaining > 0) continue;
    for (const res of Object.keys(def.outputs || {})) expectedOutputPairs.push(b.id + ":" + res);
  }
  const scrapFlow = deliveredByResource.scrap || 0;
  process.stdout.write(JSON.stringify({
    screening: withScreening, seed: g.seed, elapsed: g.elapsed,
    headSha: git("rev-parse", "HEAD").toString().trim(),
    simSha256: sha256(simBytes),
    build, bankSteelAt120, deliveredByResource, deliveredByPair,
    expectedOutputPairs, scrapWindows, scrapFlow,
    statsDeliveredVanity: g.stats.delivered, statsProducedVanity: g.stats.produced
  }) + "\n");
  process.exit(0);
}

// ---------------- ORCHESTRATOR: 2x2 with safe dispatcher swap --------------
const postSha = opt("--dispatcher-sha", DEFAULT_POST573_SHA);
if (!/^[0-9a-f]{40}$/.test(postSha)) throw new Error("--dispatcher-sha must be a full 40-char SHA");
const preSha = opt("--pre-dispatcher-sha", DEFAULT_PRE573_SHA);
if (!/^[0-9a-f]{40}$/.test(preSha)) throw new Error("--pre-dispatcher-sha must be a full 40-char SHA");
const headSha = git("rev-parse", "HEAD").toString().trim();
const origBuf = fs.readFileSync(SIM_PATH);
const origHash = sha256(origBuf);
const preNumstat = git("diff", "--numstat", "--", "src/simulation.js").toString().trim();
if (preNumstat) throw new Error("src/simulation.js has uncommitted changes BEFORE the experiment:\n" + preNumstat);
const preBuf = git("show", preSha + ":src/simulation.js"); // raw blob bytes
const preHash = sha256(preBuf);
const postBuf = git("show", postSha + ":src/simulation.js"); // raw blob bytes
const postHash = sha256(postBuf);
if (preHash === postHash)
  throw new Error("DEGENERATE 2x2: pre dispatcher (" + preSha + ") and post dispatcher (" + postSha +
    ") have byte-identical src/simulation.js (sha256 " + preHash +
    ") — the two arms would run the SAME code and the pre573 labels would be false. " +
    "Point --pre-dispatcher-sha at a genuinely pre-#573 commit (default " + DEFAULT_PRE573_SHA + ").");

function runCell(dispatcher, screening) {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--cell", "--screening", screening],
    {cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024});
  if (r.status !== 0) throw new Error("cell " + dispatcher + "/" + screening + " failed:\n" + r.stderr + r.stdout);
  const cell = JSON.parse(r.stdout.trim());
  const want = dispatcher === "pre573" ? preHash : postHash;
  if (cell.simSha256 !== want)
    throw new Error("PROVENANCE MISMATCH: cell " + dispatcher + "/" + screening + " imported simulation.js sha256 " +
      cell.simSha256 + " expected " + want);
  if (cell.headSha !== headSha) throw new Error("cell head SHA mismatch");
  return cell;
}

console.log("== C1 2x2 A/B — #552 Screening Plant (PASS_NUMERIC_ONLY, node-side, no browser) ==");
console.log("head SHA (content.js for ALL cells):        " + headSha);
console.log("pre-#573 dispatcher SHA (#573 parent-main): " + preSha);
console.log("post-#573 dispatcher SHA:                   " + postSha);
console.log("SRC-PROVENANCE: BOTH arms are synthetic WORKING-TREE swaps of src/simulation.js against this head's content.js — NOT real merged trees.");
console.log("  pre arm  = simulation.js at " + preSha + " (#573's parent-main dispatcher)");
console.log("  post arm = simulation.js at " + postSha + " (merged/post-#573 dispatcher)");
console.log("simulation.js sha256 pre:  " + preHash);
console.log("simulation.js sha256 post: " + postHash);
console.log("working-tree original sha256 (restored in finally): " + origHash);
console.log("fresh yard, fixed seed 4073, zero player input beyond one public buildAt at t~0; t=120s, 0.5s substeps.\n");

const cells = {};
let restoreProof = null;
try {
  fs.writeFileSync(SIM_PATH, preBuf); // WORKING TREE ONLY — never committed
  cells.pre573 = {yes: runCell("pre573", "yes"), no: runCell("pre573", "no")};
  fs.writeFileSync(SIM_PATH, postBuf); // WORKING TREE ONLY — never committed
  cells.post573 = {yes: runCell("post573", "yes"), no: runCell("post573", "no")};
} finally {
  fs.writeFileSync(SIM_PATH, origBuf); // byte-exact restore, guaranteed
  const afterHash = sha256(fs.readFileSync(SIM_PATH));
  const diffStat = git("diff", "--stat", "--", "src/simulation.js").toString().trim();
  const diffNumstat = git("diff", "--numstat", "--", "src/simulation.js").toString().trim();
  restoreProof = {before: origHash, after: afterHash, byteExact: afterHash === origHash, diffStat, diffNumstat};
}
console.log("== RESTORE PROOF (src/simulation.js) ==");
console.log(JSON.stringify(restoreProof, null, 1));
if (!restoreProof.byteExact || restoreProof.diffNumstat)
  throw new Error("RESTORE FAILED — src/simulation.js not byte-exact; investigate before any commit");
console.log("");

// ---------------- table + gates --------------------------------------------
const failures = [];
const gate = (id, ok, detail) => {
  console.log((ok ? "PASS " : "FAIL ") + id + ": " + detail);
  if (!ok) failures.push(id + ": " + detail);
};
const rows = [["pre573", "yes"], ["pre573", "no"], ["post573", "yes"], ["post573", "no"]];
console.log("== 2x2 TABLE @ t=120s (bank steel gate > 20; scrap flow gate > 0) ==");
for (const [d, s] of rows) {
  const c = cells[d][s];
  console.log("--- dispatcher=" + d + " (" + (d === "pre573" ? preSha : postSha) + ") screening=" + s + " (sim sha256 " + c.simSha256.slice(0, 16) + "…) ---");
  console.log("  bank steel @120s: " + c.bankSteelAt120);
  console.log("  delivered by resource (depot arrivals): " + JSON.stringify(c.deliveredByResource));
  console.log("  delivered by output pair: " + JSON.stringify(c.deliveredByPair));
  console.log("  scrap flow: " + c.scrapFlow + " (60s windows " + JSON.stringify(c.scrapWindows) + ")");
  console.log("  build: " + JSON.stringify(c.build));
  console.log("  vanity (REPORT ONLY, never gated): stats.delivered=" + c.statsDeliveredVanity + " stats.produced=" + c.statsProducedVanity);
}
console.log("\n== GATES ==");
for (const [d, s] of rows) {
  const c = cells[d][s];
  const tag = d + "/screening=" + s;
  gate("scrap-flow[" + tag + "]", c.scrapFlow > 0, "scrap delivered 0-120s = " + c.scrapFlow + " (must be > 0)");
  if (d === "post573") {
    gate("steel-gate[" + tag + "]", c.bankSteelAt120 > 20, "bank steel @120s = " + c.bankSteelAt120 + " (must exceed starter 20)");
    const zero = c.expectedOutputPairs.filter(p => !(c.deliveredByPair[p] > 0));
    gate("no-zero-output-pair[" + tag + "]", zero.length === 0,
      "output pairs " + JSON.stringify(c.expectedOutputPairs) + (zero.length ? " ZERO-DELIVERY: " + JSON.stringify(zero) : " all delivered > 0"));
  } else {
    // Pre-#573 the >20 gate is reported but the #567 starvation is pre-existing;
    // the binding pre-#573 condition is the paired comparison below.
    console.log("INFO steel-gate[" + tag + "]: bank steel @120s = " + c.bankSteelAt120 +
      (c.bankSteelAt120 > 20 ? " (> 20)" : " (<= 20 — pre-existing #567 player-output starvation, pre-#573 dispatcher)"));
  }
}
const preWith = cells.pre573.yes.bankSteelAt120, preWithout = cells.pre573.no.bankSteelAt120;
gate("pre573-no-worse", preWith >= preWithout,
  "screening bank steel " + preWith + " vs no-screening control " + preWithout + " (screening must NOT worsen bank steel pre-#573)");
if (failures.length) {
  console.error("\nC1 FAILED — " + failures.length + " violation(s):");
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log("\nC1 PASS (PASS_NUMERIC_ONLY) — head " + headSha + " content.js x pre dispatcher " + preSha + " vs post dispatcher " + postSha + " (synthetic working-tree swaps, not merged trees)");
console.log("C2 (desktop+phone captures at the DEPLOYED SHA, crusher+screening adjacent in one frame) remains OWED — no browser in this session.");
