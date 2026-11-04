// B-29 probe: how many ladder rounds does the phone session need before the research
// target unlocks, and which tuning value moves it? Mirrors `scripts/capture.mjs`'s
// phone session in the deterministic engine: six manual pulses, the repair, sixty
// ladder rounds, one absence through the shipped `catchUp`, then ladder rounds until a
// node is bought. Each round is one ladder action plus `advance(state, 10)`, exactly as
// `validateBehaviour` drives it. The engine captures the reserve floor once at module
// load, so each floor re-imports the engine through a cache-busting query while every
// other module stays shared. Run: `npx tsx scripts/probe-phone.mjs [rounds] [hours] [floor]`.
import { BLUEPRINTS } from "../src/game/content/defs";

const ROUNDS = Number(process.argv[2] ?? 1800);
const PRESENCE_ROUNDS = 60;
const HOUR_MS = 3_600_000;
const ABSENCE_HOURS = Number(process.argv[3] ?? 12);
const FLOOR = Number(process.argv[4] ?? 10);

const defs = await import("../src/game/content/defs");
Object.assign(defs.TUNING, { reserveFloor: FLOOR });
const { advance } = await import(`../src/game/simulation/engine?v=${FLOOR}`);
const { applyCommand, DOCK_TILE, YARD_TILES } = await import("../src/game/simulation/commands");
const { createInitialState } = await import("../src/game/simulation/types");
const { nextYardStep } = await import("../src/game/simulation/plan");
const { catchUp } = await import("../src/game/simulation/offline");

let seq = 0;
const send = (state, body) => {
  seq += 1;
  return applyCommand(state, { ...body, id: `p${seq}` });
};

const firstFreeTile = (state) => {
  for (let tile = 0; tile < YARD_TILES; tile += 1) {
    if (tile === DOCK_TILE) continue;
    if (!state.machines.some((m) => m.tile === tile)) return tile;
  }
  return DOCK_TILE;
};

/** One ladder action, the same dispatch table `runStep` in `App.tsx` performs. */
const takeStep = (state, step) => {
  switch (step.kind) {
    case "connect":
      for (const plan of step.plans) {
        send(state, { type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
      }
      return;
    case "build":
      send(state, { type: "machine.build", blueprint: step.blueprint, tile: firstFreeTile(state) });
      return;
    case "sell":
      send(state, { type: "contract.sell", resource: step.resource, qty: step.qty });
      return;
    case "research":
      send(state, { type: "research.buy", node: step.node });
      return;
    case "drone":
      send(state, { type: "drone.add" });
      return;
    case "upgrade":
      send(state, { type: "machine.upgrade", machineId: step.machineId });
      return;
    default:
      send(state, { type: "manual.salvage" });
  }
};

const state = createInitialState();
let clock = 1_700_000_000_000;

for (let i = 0; i < 6; i += 1) {
  send(state, { type: "manual.salvage" });
  advance(state, 6);
}
send(state, { type: "drone.repair" });
for (let round = 0; round < PRESENCE_ROUNDS; round += 1) {
  takeStep(state, nextYardStep(state));
  advance(state, 10);
}

const lastSeenMs = clock;
clock += ABSENCE_HOURS * HOUR_MS;
const settled = catchUp(state, lastSeenMs, clock);

const kinds = {};
const marks = {};
const log = [];
for (let round = 0; round < ROUNDS; round += 1) {
  // The dock offers the onboarding contract before the ordinary sells, exactly as
  // `validateBehaviour` claims it; without that claim every sell is refused.
  if (!state.exportClaimed && (state.store["steel"] ?? 0) >= 3) {
    send(state, { type: "contract.export" });
  }
  const step = nextYardStep(state);
  kinds[step.kind] = (kinds[step.kind] ?? 0) + 1;
  takeStep(state, step);
  advance(state, 10);
  if (marks.firstSpare === undefined && state.spares.length > 0) marks.firstSpare = round + 1;
  if (marks.firstData === undefined && (state.store.data ?? 0) > 0) marks.firstData = round + 1;
  if (marks.firstNode === undefined && Object.keys(state.research).length > 0) {
    marks.firstNode = round + 1;
  }
  const reached = round + 1;
  if (reached % 600 === 0 || reached === marks.firstNode) {
    const lab = state.machines.find((m) => m.blueprint === "signalLab");
    log.push(
      `round ${reached}: machines ${state.machines.length} | credits ${state.credits} | ` +
        `store ${JSON.stringify(state.store)} | lab ${
          lab ? `${lab.status} L${lab.level} batches ${lab.batchesDone}` : "none"
        } | nodes ${Object.keys(state.research).length}`
    );
  }
  if (marks.firstNode !== undefined && reached > marks.firstNode + 120) break;
}

console.log(
  `floor ${FLOOR} absence ${ABSENCE_HOURS}h cap ${ROUNDS}: marks ${JSON.stringify(marks)} | ` +
    `machines ${state.machines.length} links ${state.routes.length} credits ${state.credits} ` +
    `research ${JSON.stringify(state.research)}`
);
for (const line of log) console.log(`  ${line}`);
console.log(`  step kinds ${JSON.stringify(kinds)}`);
console.log(
  `  links ${state.routes
    .map(
      (r) =>
        `${r.from.kind === "store" ? "store" : `m${r.from.id}`}->${
          r.to.kind === "store" ? "store" : `m${r.to.id}`
        }:${r.filter ?? "*"} cap${r.capacity} fly${r.inFlight} busy${r.busyTicks}/${r.ageTicks}`
    )
    .join(" ")}`
);
console.log(
  `  machines ${state.machines
    .map(
      (m) =>
        `${m.blueprint} L${m.level} ${m.status} b${m.batchesDone} inBuf ${JSON.stringify(
          m.inBuf
        )} tray ${m.tray.reduce((n, i) => n + i.qty, 0)}`
    )
    .join(" | ")}`
);
console.log(
  `  catalog complete: ${Object.keys(BLUEPRINTS).every((id) =>
    state.machines.some((m) => m.blueprint === id)
  )}`
);
