// BELT-001 g2: one attributed 12 h bench row per variant, so the B-5 reading names a
// mechanism instead of assuming one (DECISIONS D-1 asks for exactly this).
//
// Three variants, each starting from the byte-identical built yard (one JSON clone each,
// so only the named difference can move the number):
//   A cost-only      - the shipped candidate: `run` carried, latency = routeLatencyTicks (5)
//   B per-tile       - the deferred item: latency = beltLatencyPerTile x run.length
//   C no-run         - the shipped numbers with the `run` array deleted: isolates what
//                      carrying per-route tile arrays itself costs the tick loop
// Plus D, the bench.test.ts shape (4 machines, no routes at all) as the null control.
//
// Run from the worktree root: npx tsx work/development/BELT-001-g2/bench-variants.mjs
import { BLUEPRINTS, RECIPES, TUNING } from "../../../src/game/content/defs";
import { applyCommand } from "../../../src/game/simulation/commands";
import { createInitialState } from "../../../src/game/simulation/types";
import { advance } from "../../../src/game/simulation/engine";
import { checksum } from "../../../src/game/persistence/save";

const REPEATS = 5;
const planConnections = (s, id) => {
  const machine = s.machines.find((m) => m.id === id);
  if (!machine) return [];
  const recipe = RECIPES[BLUEPRINTS[machine.blueprint].recipeId];
  const plans = [];
  for (const input of recipe.inputs) {
    if ((s.store[input.resource] ?? 0) <= 0) continue;
    plans.push({ from: 0, to: machine.id, filter: input.resource });
  }
  return plans;
};

/** The scored yard shape: eight machines on the compact order, every link priced. */
function buildYard() {
  const s = createInitialState();
  applyCommand(s, { id: "v-seed", type: "manual.salvage" });
  advance(s, 6);
  s.store["scrap"] = 100000;
  s.store["ferrous"] = 100000;
  s.store["nonferrous"] = 100000;
  s.storeUnits = 300000;
  s.storeCapacity = 400000;
  s.credits = 100000;
  s.tutorial = 9;
  const order = [8, 9, 0, 1, 3, 4, 7, 10];
  const blueprints = [
    "sorter",
    "furnace",
    "copperSeparator",
    "polymerRecycler",
    "wireMill",
    "sorter",
    "furnace",
    "copperSeparator",
  ];
  for (let i = 0; i < order.length; i += 1) {
    applyCommand(s, {
      id: `v-b${i}`,
      type: "machine.build",
      blueprint: blueprints[i],
      tile: order[i],
    });
    for (const plan of planConnections(s, s.nextMachineId - 1)) {
      applyCommand(s, { id: `v-c${i}-${plan.filter}`, type: "route.connect", ...plan });
    }
  }
  return s;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function timed(build) {
  const samples = [];
  const saves = [];
  let last;
  for (let i = 0; i < REPEATS; i += 1) {
    const state = build();
    const start = performance.now();
    advance(state, TUNING.offlineCapTicks);
    samples.push(performance.now() - start);
    // The save path is the other place a carried array can cost something: it is a
    // byte-per-byte copy, so print its size and its round-trip time next to the tick cost.
    const t0 = performance.now();
    const text = JSON.stringify(state);
    JSON.parse(text);
    saves.push(performance.now() - t0);
    last = state;
  }
  return {
    ms: median(samples),
    samples: samples.map((v) => Number(v.toFixed(2))),
    saveMs: Number(median(saves).toFixed(3)),
    saveBytes: JSON.stringify(last).length,
    tick: last.tick,
    batches: last.machines.reduce((sum, m) => sum + m.batchesDone, 0),
    links: last.routes.length,
    latencySum: last.routes.reduce((sum, r) => sum + r.latency, 0),
    hash: checksum(JSON.stringify(last)),
  };
}

const base = buildYard();
const text = JSON.stringify(base);
const clone = () => JSON.parse(text);

const variants = {
  // A: exactly what `route.connect` produces in this candidate.
  "A cost-only (shipped: run carried, latency = routeLatencyTicks)": () => clone(),
  // B: the deferred g2 item, applied to the same built state.
  "B per-tile latency (deferred: 2 x run.length)": () => {
    const s = clone();
    for (const r of s.routes) if (r.run) r.latency = TUNING.beltLatencyPerTile * r.run.length;
    return s;
  },
  // C: same numbers, `run` never present. Built by destructuring rather than `delete`,
  // because deleting a property pushes the object into dictionary mode and would measure
  // that shape change instead of the array.
  "C no-run (latency 5, run array absent)": () => {
    const s = clone();
    s.routes = s.routes.map(({ run, ...rest }) => rest);
    return s;
  },
  // D: the bench.test.ts shape - four machines, no routes, so the belt model is inert.
  "D null control (4 machines, no routes)": () => {
    const s = createInitialState();
    applyCommand(s, { id: "d-seed", type: "manual.salvage" });
    advance(s, 6);
    s.store["scrap"] = 100000;
    s.store["ferrous"] = 100000;
    s.store["nonferrous"] = 100000;
    s.storeUnits = 300000;
    s.storeCapacity = 400000;
    s.credits = 100000;
    for (let i = 0; i < 4; i += 1) {
      const blueprint = i % 2 === 0 ? "sorter" : "copperSeparator";
      const recipe = RECIPES[BLUEPRINTS[blueprint].recipeId];
      s.machines.push({
        id: s.nextMachineId++,
        blueprint,
        tile: i,
        orientation: 0,
        level: 1 + (i % 3),
        inBuf: { scrap: 12, nonferrous: 12, ferrous: 12 },
        inBufUnits: 36,
        tray: [],
        trayUnits: 0,
        batch: [],
        progress: 0,
        progressRem: 0,
        progressDen: 0,
        batchMilli: recipe.cycleTicks * 1000,
        batchPower: recipe.power,
        status: "idle",
        inRoutes: [],
        outRoute: null,
        starvedTicks: 0,
        batchesDone: 0,
        ageTicks: 0,
        busyTicks: 0,
        fullTicks: 0,
        rateAge: 0,
        rateFrom: 0,
        rateAgePrev: 0,
        rateFromPrev: 0,
      });
    }
    return s;
  },
};

const entries = Object.entries(variants);
if (process.argv.includes("--reverse")) entries.reverse();
console.log(
  `12 h bench, ${TUNING.offlineCapTicks} ticks, median of ${REPEATS}, built yard identical,` +
    ` order ${process.argv.includes("--reverse") ? "reversed" : "forward"}`
);
const rows = {};
for (const [name, build] of entries) {
  const row = timed(build);
  rows[name] = row;
  console.log(
    `${name}\n  ${row.ms.toFixed(2)} ms  samples ${JSON.stringify(row.samples)}` +
      `  tick ${row.tick} batches ${row.batches} links ${row.links} latencySum ${row.latencySum} hash ${row.hash}`
  );
}
const a = rows["A cost-only (shipped: run carried, latency = routeLatencyTicks)"].ms;
for (const [name, row] of Object.entries(rows)) {
  if (name.startsWith("A ")) continue;
  console.log(`delta vs A: ${name} ${(((row.ms - a) / a) * 100).toFixed(2)} %`);
}
console.log(
  "shipped tuning",
  JSON.stringify({
    beltCostPerTile: TUNING.beltCostPerTile,
    beltLatencyPerTile: TUNING.beltLatencyPerTile,
    routeLatencyTicks: TUNING.routeLatencyTicks,
  })
);
