// B-15 / B-25 probe: reserve-floor sweep plus per-link busy ratios.
// The engine captures TUNING.reserveFloor once at module load (engine.ts:270),
// so each floor re-imports the engine through a cache-busting query while every
// other module stays shared. Run: `npx tsx scripts/probe-supply.mjs`.
import { mkdirSync, writeFileSync } from "node:fs";

const ROUNDS = 1800; // 18 000 ticks = 30 minutes of active play
const FIRST_SNAPSHOT = 50; // 500 ticks in, the first useful ratio
const FLOORS = [0, 5, 10, 20];
const TARGET = "docs/evidence/2026-11-03-supply-window.md";

/** One reserve floor: boot the tutorial yard, then run the ladder for 30 minutes. */
async function singleRun(floor) {
  const defs = await import("../src/game/content/defs");
  Object.assign(defs.TUNING, { reserveFloor: floor });
  const { advance } = await import(`../src/game/simulation/engine?v=${floor}`);
  const { applyCommand, DOCK_TILE, YARD_TILES } =
    await import("../src/game/simulation/commands");
  const { createInitialState } = await import("../src/game/simulation/types");
  const { nextYardStep } = await import("../src/game/simulation/plan");

  let seq = 0;
  const send = (state, body) => {
    seq += 1;
    return applyCommand(state, { ...body, id: `p${seq}` });
  };
  const freeTile = (state) => {
    for (let tile = 0; tile < YARD_TILES; tile += 1) {
      if (tile === DOCK_TILE) continue;
      if (!state.machines.some((m) => m.tile === tile)) return tile;
    }
    return 8;
  };
  const percent = (busy, age) =>
    age > 0 ? Number(((busy * 100) / age).toFixed(1)) : 0;
  const snapshot = (state) => ({
    tick: state.tick,
    links: state.routes.map((route) => ({
      id: route.id,
      from: `${route.from.kind}${route.from.id}`,
      to: `${route.to.kind}${route.to.id}`,
      filter: route.filter ?? "*",
      capacity: route.capacity,
      inFlight: route.inFlight,
      busy: percent(route.busyTicks, route.ageTicks),
    })),
    machines: state.machines.map((machine) => ({
      id: machine.id,
      blueprint: machine.blueprint,
      level: machine.level,
      busy: percent(machine.busyTicks, machine.ageTicks),
      batches: machine.batchesDone,
      status: machine.status,
      inBuf: Object.values(machine.inBuf).reduce(
        (sum, value) => sum + value,
        0,
      ),
      tray: machine.tray.reduce((sum, item) => sum + item.qty, 0),
    })),
  });

  const state = createInitialState();
  for (let i = 0; i < 6; i += 1) {
    send(state, { type: "manual.salvage" });
    advance(state, defs.TUNING.manualPulseTicks);
  }
  send(state, { type: "drone.repair" });
  advance(state, 262);
  state.tutorial = 9; // the tutorial is complete, so every blueprint is known

  let early = null;
  for (let round = 0; round < ROUNDS; round += 1) {
    const step = nextYardStep(state);
    if (step) {
      switch (step.kind) {
        case "connect":
          for (const plan of step.plans) {
            send(state, {
              type: "route.connect",
              from: plan.from,
              to: plan.to,
              filter: plan.filter,
            });
          }
          break;
        case "build":
          send(state, {
            type: "machine.build",
            blueprint: step.blueprint,
            tile: freeTile(state),
          });
          break;
        case "sell":
          send(state, {
            type: "contract.sell",
            resource: step.resource,
            qty: step.qty,
          });
          break;
        case "research":
          send(state, { type: "research.buy", node: step.node });
          break;
        case "upgrade":
          send(state, { type: "machine.upgrade", machineId: step.machineId });
          break;
        case "salvage":
          send(state, { type: "manual.salvage" });
          break;
      }
    }
    advance(state, 10); // one second between taps, as the scripted session does
    if (round + 1 === FIRST_SNAPSHOT) early = snapshot(state);
  }

  return {
    floor,
    ticks: state.tick,
    machines: state.machines.length,
    totals: state.machines.reduce(
      (sum, machine) => sum + machine.batchesDone,
      0,
    ),
    credits: state.credits,
    research: Object.keys(state.research).length,
    store: Object.entries(state.store)
      .filter(([, value]) => value > 0)
      .map(([key, value]) => `${key}=${value}`)
      .join(" "),
    early,
    late: snapshot(state),
  };
}

const aggregate = (run) => {
  const values = run.late.links.map((link) => link.busy);
  return (
    values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
  ).toFixed(1);
};

const table = (rows, columns) => {
  const lines = [
    `| ${columns.map(([key]) => key).join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
  ];
  for (const row of rows)
    lines.push(`| ${columns.map(([, get]) => get(row)).join(" | ")} |`);
  return lines;
};

const LINK_COLUMNS = [
  ["Link", (row) => row.id],
  ["From", (row) => row.from],
  ["To", (row) => row.to],
  ["Filter", (row) => row.filter],
  ["Cap", (row) => row.capacity],
  ["In flight", (row) => row.inFlight],
  ["Busy %", (row) => row.busy],
];
const MACHINE_COLUMNS = [
  ["Machine", (row) => row.id],
  ["Blueprint", (row) => row.blueprint],
  ["Level", (row) => row.level],
  ["Busy %", (row) => row.busy],
  ["Batches", (row) => row.batches],
  ["Status", (row) => row.status],
  ["Input buffer", (row) => row.inBuf],
  ["Tray", (row) => row.tray],
];

function assemble(runs) {
  const lines = [];
  lines.push(
    "# Supply-window probe — reserve floor (B-15) and link utilisation (B-25)",
  );
  lines.push("");
  lines.push(
    `Command: \`npx tsx scripts/probe-supply.mjs\`. Runtime: Node ${process.version}.` +
      ` Each floor is scripted exactly like the 30-minute self-play driver in` +
      ` \`tests/simulation/chain.test.ts\`: tutorial completed, then ${ROUNDS} rounds at one` +
      ` ladder command per second (${ROUNDS * 10} ticks = 30 minutes of active play).` +
      ` Busy % is ` +
      `\`busyTicks / ageTicks\`, the same counters the bottleneck assistant reads (spec 10.5).`,
  );
  lines.push("");
  lines.push("## Reserve-floor sweep (B-15)");
  lines.push("");
  lines.push(
    ...table(runs, [
      ["Floor", (run) => run.floor],
      ["Machines", (run) => run.machines],
      ["Total batches", (run) => run.totals],
      ["Credits", (run) => run.credits],
      ["Research nodes", (run) => run.research],
      ["Store at end", (run) => run.store],
      ["Aggregate link busy %", (run) => aggregate(run)],
    ]),
  );
  lines.push("");
  for (const run of runs) {
    const dead = run.late.links.filter((link) => link.busy === 0);
    lines.push(`## Floor ${run.floor}`);
    lines.push("");
    lines.push(
      `After ${run.early.tick} ticks, ${run.early.links.length} links:`,
    );
    lines.push("");
    lines.push(...table(run.early.links, LINK_COLUMNS));
    lines.push("");
    lines.push(
      `After ${run.ticks} ticks, ${run.late.links.length} links and ${run.machines} machines:`,
    );
    lines.push("");
    lines.push(...table(run.late.links, LINK_COLUMNS));
    lines.push("");
    lines.push(...table(run.late.machines, MACHINE_COLUMNS));
    lines.push("");
    lines.push(
      `Aggregate link utilisation ${aggregate(run)} %; dead links: ${
        dead.length
          ? dead.map((l) => `${l.from}>${l.to}:${l.filter}`).join(", ")
          : "none"
      }.`,
    );
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

const runs = [];
for (const floor of FLOORS) runs.push(await singleRun(floor));
mkdirSync("docs/evidence", { recursive: true });
writeFileSync(TARGET, assemble(runs), "utf8");
for (const run of runs) {
  console.log(
    `floor=${run.floor} machines=${run.machines} batches=${run.totals} credits=${run.credits}` +
      ` research=${run.research} aggregate=${aggregate(run)}% store ${run.store}`,
  );
}
console.log(`wrote ${TARGET}`);
