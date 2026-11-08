// BLD-001/D-1 g1 probe: the save layer before and after the two micro-fixes, side by side.
// Prints the envelope's `schemaVersion`, the stored `checksum`, and the sha256 + byte length
// of the exact save string for one deterministic 4-machine frame (the same frame builder the
// measurement script seeds). Run it on the base SHA and on the candidate: the three lines
// must be identical, which is the save-compatibility statement for this slice.
//
//   npx tsx scripts/probe-save-bld001.mjs
import { createHash } from "node:crypto";
import { BLUEPRINTS, TUNING } from "../src/game/content/defs";
import { applyCommand, DOCK_TILE, YARD_TILES } from "../src/game/simulation/commands";
import { advance } from "../src/game/simulation/engine";
import { planConnections } from "../src/game/simulation/autoconnect";
import { createInitialState } from "../src/game/simulation/types";
import { encodeSave } from "../src/game/persistence/save";
import { branchOptions } from "../src/ui/text";

const SETTINGS = { muted: false, reducedMotion: false, textScale: 1 };
const FOUR = ["sorter", "furnace", "copperSeparator", "polymerRecycler"];

const firstFreeTile = (state) => {
  for (let tile = 0; tile < YARD_TILES; tile += 1) {
    if (tile === DOCK_TILE) continue;
    if (!state.machines.some((m) => m.tile === tile)) return tile;
  }
  return 8;
};

/** The same seeded frame `scripts/measure-bld001.mjs` paints. */
function yardFrame(depth, credits) {
  const state = createInitialState();
  let seq = 0;
  const send = (body) => applyCommand(state, { id: "s" + (seq += 1), ...body });
  const connect = (machineId) => {
    for (const plan of planConnections(state, machineId)) {
      send({ type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
    }
  };
  const fund = (scrap, ferrous, nonferrous) => {
    state.store = { ...state.store, scrap, ferrous };
    if (nonferrous !== undefined) state.store.nonferrous = nonferrous;
    state.storeUnits = Object.values(state.store).reduce((total, qty) => total + qty, 0);
  };
  state.tutorial = 9;
  for (let pass = 0; pass < 6; pass += 1) {
    send({ type: "manual.salvage" });
    advance(state, TUNING.manualPulseTicks);
  }
  send({ type: "drone.repair" });
  advance(state, 262);
  FOUR.slice(0, depth).forEach((blueprint, index) => {
    const need = {};
    for (const item of BLUEPRINTS[blueprint].buildCost) need[item.resource] = item.qty;
    fund(60, 20, index >= 2 ? need.nonferrous ?? 0 : undefined);
    send({ type: "machine.build", blueprint, tile: firstFreeTile(state) });
    connect(state.machines[state.machines.length - 1].id);
    advance(state, 300);
  });
  state.credits = credits;
  state.store = { scrap: 9 };
  state.storeUnits = 9;
  advance(state, 1);
  return state;
}

const state = yardFrame(4, 30);
const text = encodeSave(state, 10, SETTINGS);
const envelope = JSON.parse(text);
const sha = createHash("sha256").update(text).digest("hex").slice(0, 16);
console.log(
  `save: schemaVersion=${envelope.schemaVersion} checksum=${envelope.checksum}` +
    ` sha256=${sha} bytes=${new TextEncoder().encode(text).length} tick=${state.tick}` +
    ` machines=${state.machines.length} credits=${state.credits}`
);
console.log(`dock: ${JSON.stringify(branchOptions(state, state.machines[0].id))}`);
for (const [id, level] of state.machines.map((m) => [m.id, m.level])) {
  const machine = state.machines.find((m) => m.id === id);
  console.log(`machine #${id} level=${level} branch=${JSON.stringify(machine.branch)} branchLine=${JSON.stringify(branchOptions(state, id))}`);
}
