// Number printer for the two new belt.test.ts cases, so the literals in the test are
// read from the shipped code rather than typed from a guess.
// Run from the worktree root: npx tsx work/development/BELT-001-g2/probe-rows.mjs
import { readFileSync } from "node:fs";
import { TUNING } from "../../../src/game/content/defs";
import { applyCommand, beltCost, refundOf } from "../../../src/game/simulation/commands";
import { createInitialState, manhattanRun } from "../../../src/game/simulation/types";
import { checksum, decodeSave, encodeSave } from "../../../src/game/persistence/save";
import { YARD_COLS } from "../../../src/game/simulation/commands";

let seq = 0;
const send = (s, body) => applyCommand(s, { ...body, id: `r${(seq += 1)}` });

// --- distances 2 / 5 / 6 from the dock tile -----------------------------------------
for (const tile of [4, 27, 31]) {
  const run = manhattanRun(2, tile, YARD_COLS);
  const rows = Math.abs(Math.floor(tile / YARD_COLS) - Math.floor(2 / YARD_COLS));
  const cols = Math.abs((tile % YARD_COLS) - (2 % YARD_COLS));
  const price = beltCost(run.length);
  console.log(
    `tile ${tile} distance ${rows + cols} run ${JSON.stringify(run)} len ${run.length}`,
    `price ${price} refund ${refundOf(price)}`,
    `round90 ${Math.round((TUNING.dismantleRefundPct / 100) * TUNING.beltCostPerTile * (rows + cols + 1))}`
  );
}

const s = createInitialState();
s.tutorial = 9;
s.store["scrap"] = 200;
s.storeUnits = 200;
for (const tile of [4, 27, 31]) {
  console.log("build", tile, send(s, { type: "machine.build", blueprint: "sorter", tile }).ok, "scrap", s.store["scrap"]);
  const id = s.machines[s.machines.length - 1].id;
  console.log("connect", tile, "machine", id, send(s, { type: "route.connect", from: 0, to: id, filter: "scrap" }).ok, "scrap", s.store["scrap"]);
}
for (const r of [...s.routes]) {
  const before = s.store["scrap"];
  console.log("remove", r.id, "len", r.run?.length, send(s, { type: "route.remove", routeId: r.id }).ok, "refund", s.store["scrap"] - before);
}

// --- DEF-008 round trip --------------------------------------------------------------
const build = () => {
  const st = createInitialState();
  st.tutorial = 9;
  st.store["scrap"] = 300;
  st.store["ferrous"] = 40;
  st.store["nonferrous"] = 40;
  st.storeUnits = 380;
  send(st, { type: "machine.build", blueprint: "sorter", tile: 0 });
  send(st, { type: "machine.build", blueprint: "furnace", tile: 8 });
  send(st, { type: "route.connect", from: 0, to: 1, filter: "scrap" });
  return st;
};
const ctl = build();
const ctlBefore = ctl.store["scrap"];
send(ctl, { type: "route.remove", routeId: ctl.routes[0].id });
console.log("IN_SESSION run", JSON.stringify(ctl.routes.length ? null : null), "refund", ctl.store["scrap"] - ctlBefore);

const st2 = build();
const preRun = st2.routes[0].run;
const scrapAtEncode = st2.store["scrap"];
const raw = encodeSave(st2, 1700000000000, { muted: false, reducedMotion: false, textScale: 2 });
const back = decodeSave(raw);
if (!back.ok) throw new Error("refused " + JSON.stringify(back));
const ld = back.payload.sim;
console.log("PRE_SAVE_RUN", JSON.stringify(preRun), "SCRAP_AT_ENCODE", scrapAtEncode);
console.log("AFTER_LOAD_RUN", JSON.stringify(ld.routes[0].run), "LATENCY", ld.routes[0].latency, "SCRAP", ld.store["scrap"], "NEUTRAL", ld.store["scrap"] === scrapAtEncode);
const beforeRemove = ld.store["scrap"];
send(ld, { type: "route.remove", routeId: ld.routes[0].id });
console.log("AFTER_LOAD_REFUND", ld.store["scrap"] - beforeRemove);

// --- run-less route from the v1 fixture ---------------------------------------------
const fx = decodeSave(readFileSync("docs/evidence/yard-mature.json", "utf8"));
if (!fx.ok) throw new Error("fixture refused");
const sim = fx.payload.sim;
const empty = sim.routes.filter((r) => r.items.length === 0).map((r) => r.id);
console.log("FIXTURE itemless_route_ids", JSON.stringify(empty), "run_undefined", sim.routes.every((r) => r.run === undefined));
const pick = sim.routes.find((r) => r.items.length === 0);
const pickBefore = sim.store["scrap"];
send(sim, { type: "route.remove", routeId: pick.id });
console.log("RUNLESS_REMOVE", pick.id, "refund", sim.store["scrap"] - pickBefore, "stateHash", checksum(JSON.stringify(sim)));
