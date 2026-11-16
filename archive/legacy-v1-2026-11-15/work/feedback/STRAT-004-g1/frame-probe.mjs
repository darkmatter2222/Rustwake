// STRAT-004 g2: one-shot print of the candidate's own derivations on the recorded frame,
// so the layout witness's face lines are known before the browser pass.
// Usage: npx tsx work/feedback/STRAT-004-g1/frame-probe.mjs
import { applyCommand, DOCK_TILE, YARD_TILES } from "../../../src/game/simulation/commands";
import { planConnections } from "../../../src/game/simulation/autoconnect";
import { advance } from "../../../src/game/simulation/engine";
import { createInitialState } from "../../../src/game/simulation/types";
import { nextYardStep } from "../../../src/game/simulation/plan";
import { pendingForStep } from "../../../src/ui/text";

const firstFreeTile = (state) => {
  for (let tile = 0; tile < YARD_TILES; tile += 1) {
    if (tile === DOCK_TILE) continue;
    if (!state.machines.some((m) => m.tile === tile)) return tile;
  }
  return 8;
};

let seq = 0;
const state = createInitialState();
const send = (body) => applyCommand(state, { id: "s" + (seq += 1), ...body });
const connectAll = () => {
  for (let pass = 0; pass < 4; pass += 1) {
    // BELT-001 prices a link at 2 scrap, so the frame pays it the way the yard does.
    state.store = { ...state.store, scrap: 60 };
    state.storeUnits = Object.values(state.store).reduce((total, qty) => total + qty, 0);
    for (const m of state.machines) {
      for (const plan of planConnections(state, m.id)) {
        send({ type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
      }
    }
  }
};
state.tutorial = 9;
for (let pass = 0; pass < 6; pass += 1) {
  send({ type: "manual.salvage" });
  advance(state, 26);
}
state.store = { ...state.store, scrap: 24 };
send({ type: "drone.repair" });
advance(state, 262);
state.store = { ...state.store, scrap: 60, ferrous: 20 };
state.storeUnits = 80;
send({ type: "machine.build", blueprint: "sorter", tile: firstFreeTile(state) });
connectAll();
advance(state, 300);
send({ type: "machine.build", blueprint: "furnace", tile: firstFreeTile(state) });
connectAll();
advance(state, 300);
state.credits = 12;
const dump = (tag) => {
  const step = nextYardStep(state);
  console.log(
    tag,
    "step",
    JSON.stringify(step).slice(0, 120),
    "\n     pending",
    JSON.stringify(pendingForStep(state, step)),
    "\n     store",
    JSON.stringify(state.store),
    "items",
    state.routes.map((r) => r.items.length).join(","),
    "prog",
    state.machines.map((m) => `${m.progress}/${m.batchMilli}`).join(","),
    "inFlight",
    JSON.stringify(state.drone.inFlight)
  );
};
dump("covered");
state.store = { scrap: 6, ferrous: 1 };
state.storeUnits = Object.values(state.store).reduce((total, qty) => total + qty, 0);
advance(state, 1);
dump("short");
state.credits = 34;
advance(state, 1);
dump("fork");
