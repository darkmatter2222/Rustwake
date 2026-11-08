// Scratch number printer for the BELT-001 handoff. Run from the worktree root:
//   npx tsx work/development/BELT-001-g1/numbers.mjs
// Prints exactly the figures belt.test.ts pins, so the two cannot drift.
import { readFileSync } from "node:fs";
import { TUNING } from "../../../src/game/content/defs";
import {
  applyCommand,
  beltCost,
  beltRun,
  refundOf,
  tileIndexOf,
  DOCK_TILE,
  YARD_COLS,
  YARD_TILES,
} from "../../../src/game/simulation/commands";
import { manhattanRun, createInitialState } from "../../../src/game/simulation/types";
import { planConnections } from "../../../src/game/simulation/autoconnect";
import { advance } from "../../../src/game/simulation/engine";
import { checksum, decodeSave, encodeSave, validateSim } from "../../../src/game/persistence/save";

let seq = 0;
const send = (s, body) => applyCommand(s, { ...body, id: `n${(seq += 1)}` });

console.log("DOCK_TILE", DOCK_TILE, "YARD_COLS", YARD_COLS, "YARD_TILES", YARD_TILES);
console.log("manhattanRun(0,0)", JSON.stringify(manhattanRun(0, 0, YARD_COLS)));
console.log("manhattanRun(2,5)", JSON.stringify(manhattanRun(2, 5, YARD_COLS)));
console.log("manhattanRun(2,31)", JSON.stringify(manhattanRun(2, 31, YARD_COLS)));
console.log("manhattanRun(31,2)", JSON.stringify(manhattanRun(31, 2, YARD_COLS)));
console.log("manhattanRun(4,27)", JSON.stringify(manhattanRun(4, 27, YARD_COLS)));
console.log("manhattanRun(0,35)", JSON.stringify(manhattanRun(0, 35, YARD_COLS)));

// --- priced yard -------------------------------------------------------------------
const s = createInitialState();
s.tutorial = 9;
s.store["scrap"] = 200;
s.store["ferrous"] = 20;
s.store["nonferrous"] = 20;
s.storeUnits = 240;
for (const [i, tile] of [0, 1, 3, 10, 35].entries()) {
  const blueprint = ["sorter", "furnace", "copperSeparator", "polymerRecycler", "wireMill"][i];
  console.log("build", blueprint, "tile", tile, "ok", send(s, { type: "machine.build", blueprint, tile }).ok);
  console.log("  connect ok", send(s, { type: "route.connect", from: 0, to: i + 1, filter: "scrap" }).ok);
}
for (const r of s.routes) {
  console.log("route", r.id, "from", r.from.id, "to", r.to.id, "run", JSON.stringify(r.run), "len", r.run?.length, "latency", r.latency, "price", beltCost(r.run?.length ?? 0));
}
console.log("scrap after five connects:", s.store["scrap"], "units", s.storeUnits);
const last = s.routes[s.routes.length - 1];
const scrapBefore = s.store["scrap"];
console.log("remove last ok", send(s, { type: "route.remove", routeId: last.id }).ok, "refund", s.store["scrap"] - scrapBefore, "price", beltCost(last.run?.length ?? 0), "refundOf", refundOf(beltCost(last.run?.length ?? 0)));

// --- numbered shortfall ------------------------------------------------------------
const poor = createInitialState();
poor.tutorial = 9;
poor.store["scrap"] = 22;
poor.storeUnits = 22;
console.log("build sorter ok", send(poor, { type: "machine.build", blueprint: "sorter", tile: 0 }).ok, "scrap", poor.store["scrap"]);
const refused = applyCommand(poor, { id: "refused", type: "route.connect", from: 0, to: 1, filter: "scrap" });
console.log("refused", JSON.stringify(refused), "revision", poor.revision, "routes", poor.routes.length, "scrap", poor.store["scrap"]);
console.log("tileIndexOf(store)", tileIndexOf(poor, 0), "tileIndexOf(machine 1)", tileIndexOf(poor, 1));
console.log("beltRun(0,1)", JSON.stringify(beltRun(poor, 0, 1)), "cost", beltCost(beltRun(poor, 0, 1).length));

// --- move and dismantle ------------------------------------------------------------
const mv = createInitialState();
mv.tutorial = 9;
mv.store["scrap"] = 300;
mv.store["ferrous"] = 40;
mv.store["nonferrous"] = 40;
mv.storeUnits = 380;
send(mv, { type: "machine.build", blueprint: "sorter", tile: 0 });
send(mv, { type: "machine.build", blueprint: "furnace", tile: 8 });
send(mv, { type: "route.connect", from: 0, to: 1, filter: "scrap" });
send(mv, { type: "route.connect", from: 1, to: 2, filter: "steel" });
console.log("before move: scrap", mv.store["scrap"], "routes", JSON.stringify(mv.routes.map((r) => ({ id: r.id, from: r.from.id, to: r.to.id, run: r.run, latency: r.latency }))));
const moveScrap = mv.store["scrap"];
console.log("move machine 2 to 35 ok", send(mv, { type: "machine.move", machineId: 2, tile: 35 }).ok, "scrap", mv.store["scrap"], "charged", moveScrap - mv.store["scrap"]);
console.log("after move:", JSON.stringify(mv.routes.map((r) => ({ id: r.id, from: r.from.id, to: r.to.id, run: r.run, latency: r.latency }))));
const dmScrap = mv.store["scrap"];
console.log("dismantle machine 2 ok", send(mv, { type: "machine.dismantle", machineId: 2 }).ok, "returned", mv.store["scrap"] - dmScrap);
console.log("units total-ish scrap", mv.store["scrap"]);

// --- autoconnect tile counts -------------------------------------------------------
const ac = createInitialState();
ac.tutorial = 9;
ac.store["scrap"] = 100;
ac.store["ferrous"] = 10;
ac.store["nonferrous"] = 1;
ac.storeUnits = 111;
send(ac, { type: "machine.build", blueprint: "furnace", tile: 9 });
console.log("plans", JSON.stringify(planConnections(ac, 1)));

// --- pre-price save decode + 12 h catch-up ----------------------------------------
const raw = readFileSync("docs/evidence/yard-mature.json", "utf8");
const env = JSON.parse(raw);
const decoded = decodeSave(raw);
if (!decoded.ok) throw new Error("fixture refused: " + JSON.stringify(decoded));
const sim = decoded.payload.sim;
console.log("fixture checksum", env.checksum, "recomputed", checksum(JSON.stringify(env.payload)), "schemaVersion", sim.schemaVersion);
console.log("re-encode byte identical", encodeSave(sim, decoded.payload.lastSeenMs, decoded.payload.settings) === raw);
console.log("validateSim null", validateSim(sim) === null);
console.log("routes", sim.routes.length, "with run undefined", sim.routes.filter((r) => r.run === undefined).length, "distinct latency", JSON.stringify([...new Set(sim.routes.map((r) => r.latency))]));
const batchesAtDecode = sim.machines.reduce((sum, m) => sum + m.batchesDone, 0);
console.log("batches at decode", batchesAtDecode, "tick", sim.tick, "machines", sim.machines.length, "links", sim.routes.length, "drones", 1 + sim.spares.length, "credits", sim.credits, "nodes", Object.keys(sim.research).length);
advance(sim, 3600);
console.log("after +3600 ticks: tick", sim.tick, "batches", sim.machines.reduce((sum, m) => sum + m.batchesDone, 0));
console.log("state hash", checksum(JSON.stringify(sim)));
