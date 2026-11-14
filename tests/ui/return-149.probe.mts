import { TUNING, TICK_MS } from "../../src/game/content/defs";
import { applyCommand, DOCK_TILE, YARD_TILES, type Command, type CommandBody } from "../../src/game/simulation/commands";
import { planConnections } from "../../src/game/simulation/autoconnect";
import { advance } from "../../src/game/simulation/engine";
import { createInitialState, fleetDeliveries, type SimState } from "../../src/game/simulation/types";
import { catchUp } from "../../src/game/simulation/offline";
import { deriveReturn } from "../../src/ui/return/model";

let seq = 0;
const send = (s: SimState, body: CommandBody) => applyCommand(s, { ...body, id: `p${(seq += 1)}` } as Command);
const sumStore = (store: Record<string, number>) => Object.values(store).reduce((t, q) => t + (q ?? 0), 0);
function firstFree(s: SimState) { for (let t = 0; t < YARD_TILES; t += 1) if (t !== DOCK_TILE && !s.machines.some((m) => m.tile === t)) return t; return 8; }
function build(s: SimState, bp: string) { const tile = firstFree(s); const r = send(s, { type: "machine.build", blueprint: bp, tile }); if (!r.ok) throw new Error(`build ${bp} ${JSON.stringify(r)}`); const id = s.machines[s.machines.length - 1].id; for (const p of planConnections(s, id)) send(s, { type: "route.connect", from: p.from, to: p.to, filter: p.filter }); return id; }
const T0 = 1_700_000_000_000;
const totalBatches = (s: SimState) => s.machines.reduce((t, m) => t + m.batchesDone, 0);
function show(name: string, s: SimState) {
  const beforeD = fleetDeliveries(s), beforeB = totalBatches(s);
  const { report } = catchUp(s, T0, T0 + 600 * TICK_MS);
  const model = deriveReturn(report);
  console.log(name, JSON.stringify({ bottleneck: report.bottleneck, bottleneckLabel: model.bottleneckLabel, units: s.storeUnits, cap: s.storeCapacity, powerRatio: s.powerRatio, statuses: s.machines.map((m) => m.status), deliveries: report.deliveries, batches: report.batchesDone, dDelta: fleetDeliveries(s) - beforeD, bDelta: totalBatches(s) - beforeB, gains: report.gains, credits: report.creditsGained, credited: report.creditedTicks }));
}

// storage-full
{ const s = createInitialState(); s.tutorial = 9; s.store = { scrap: 300 }; s.storeUnits = 300; show("storage-full", s); }
// power-limited: 4 furnaces
{ const s = createInitialState(); s.tutorial = 9; s.store = { scrap: 200, ferrous: 200, steel: 40 }; s.storeUnits = sumStore(s.store); for (let i = 0; i < 4; i += 1) build(s, "furnace"); advance(s, 120); show("power-limited", s); }
// starved: sorter with no scrap input
{ const s = createInitialState(); s.tutorial = 9; s.store = { scrap: 30, steel: 4, ferrous: 20 }; s.storeUnits = sumStore(s.store); build(s, "sorter"); s.store = { ferrous: 20 }; s.storeUnits = 20; s.wreck.remaining = 0; advance(s, 120); show("starved", s); }
// null idle
{ const s = createInitialState(); s.tutorial = 9; show("null-idle", s); }
// producing yard
{ const s = createInitialState(); for (let i = 0; i < 6; i += 1) { send(s, { type: "manual.salvage" }); advance(s, TUNING.manualPulseTicks); } send(s, { type: "drone.repair" }); advance(s, 262); s.tutorial = 9; build(s, "sorter"); build(s, "furnace"); advance(s, 300); show("producing", s); }
