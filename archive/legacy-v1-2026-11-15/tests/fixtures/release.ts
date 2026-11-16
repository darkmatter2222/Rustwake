/**
 * G1 (#151) release fixtures — ACCEPTANCE.md "Release fixtures" (line 53).
 *
 * One shared, deterministic module for the six first-playable populations:
 *   OPENING       starter seed + economic state in GAME_SYSTEMS
 *   CHOICE-LOCAL  short transport route, processing bottleneck
 *   CHOICE-REMOTE long route, hauling bottleneck
 *   BLOCKED       full storage plus an occupied bay
 *   MATURE        20 buildings / 30 moving units / 200 cargo representations
 *   STRESS        100 buildings / 100 moving units / 1000 jobs
 *
 * Contract (brief #151 pass 1):
 *  - Deterministic: no random input, no wall clock. Every builder fixes its seed
 *    and tick, and uses a LOCAL command-id sequence so two calls produce
 *    byte-identical state (SimState.seenCommands is part of the state, so ids
 *    must repeat exactly). `fixtureSaveText` pins a witness time so the save
 *    envelope is byte-identical too.
 *  - Command-driven where reachable (OPENING, CHOICE yards, BLOCKED storage,
 *    MATURE buildings/drones). Direct fill ONLY where a shipped sim cap makes
 *    the population unreachable through commands; each fill site cites the cap
 *    and the bench precedent (tests/perf/bench.test.ts:13-59 `starterYard`).
 *  - Importable by vitest (.ts) and by `npx tsx` scripts (.mjs). No node-only
 *    APIs: everything here is the same browser-safe engine the game imports.
 *
 * Two deterministic systems are kept distinct, exactly as the architecture does:
 *  - the 2D economy `SimState` is the save authority (encodeSave reads it);
 *  - the session logistics/traffic/road/world layers are NOT persisted (cutover
 *    #148 owns that). They carry the transport axis the 2D sim cannot: the 2D
 *    route latency is a shipped CONSTANT (TUNING.routeLatencyTicks = 5), so
 *    travel-length-dependent throughput (E05) lives in `tickLogistics`, while
 *    belt RUN length still prices the link (beltCostPerTile). CHOICE-LOCAL is
 *    therefore processing-limited in the 2D yard; CHOICE-REMOTE is hauling-
 *    limited in the session corridor. Both start from one identical seed yard.
 */
import { BLUEPRINTS, RECIPES, TUNING } from "../../src/game/content/defs";
import {
  applyCommand,
  type Command,
  type CommandResult,
} from "../../src/game/simulation/commands";
import { addToStore, advance } from "../../src/game/simulation/engine";
import { unitTotal } from "../../src/game/simulation/invariants";
import {
  createLogistics,
  createJob,
  registerBuilding,
  registerCarrier,
  seedStock,
  type LogisticsState,
} from "../../src/game/simulation/logistics";
import {
  createTraffic,
  reserveBay,
  setBayCapacity,
  setDefaultTruck,
  type TrafficState,
} from "../../src/game/simulation/traffic";
import {
  createInitialState,
  fleetUnits,
  type MachineState,
  type SimState,
} from "../../src/game/simulation/types";
import { DEFAULT_SETTINGS, encodeSave, type SaveSettings } from "../../src/game/persistence/save";
import { createRoadNetwork, type RoadNetworkState } from "../../src/game/world/roadGraph";
import { applyRoadCommand } from "../../src/game/world/roadTool";
import { createWorld, terrainIndex } from "../../src/game/world/terrain";
import type { Cell, WorldState } from "../../src/game/world/types";

/** Fixed witness time for byte-identical save envelopes (no Date.now in fixtures). */
export const FIXTURE_WITNESS_MS = 1_700_000_000_000;

/** One world seed shared by every fixture that carries a WorldState. */
export const RELEASE_SEED = 141;

/** CHOICE measurement window: warm the pipeline, then measure a fixed span. */
export const CHOICE_WARMUP_TICKS = 200;
export const CHOICE_WINDOW_TICKS = 400;

/** CHOICE-REMOTE corridor length (cells) and job set — the long-haul axis.
 * 24 cells is the full owned start-parcel width (x 0..23); a 25th cell would be
 * outside-land. Travel cost is 23 (the path excludes the start cell). */
export const REMOTE_CORRIDOR_CELLS = 24;
export const REMOTE_JOB_COUNT = 4;
export const REMOTE_JOB_AMOUNT = 5;
export const REMOTE_DEST_CELL: Cell = { x: REMOTE_CORRIDOR_CELLS - 1, y: 0 };

/** MATURE / STRESS population targets (architecture README §5, ACCEPTANCE.md:53). */
export const MATURE_BUILDINGS = 20;
export const MATURE_UNITS = 30;
export const MATURE_CARGO = 200;
export const STRESS_BUILDINGS = 100;
export const STRESS_UNITS = 100;
export const STRESS_JOBS = 1000;

/** The fixed drone fleet cap (defs.ts fleetCap); carriers are uncapped. */
export const DRONE_FLEET_CAP = TUNING.fleetCap; // 5

export interface OpeningFixture {
  sim: SimState;
  world: WorldState;
}

export interface ChoiceLocalFixture {
  sim: SimState;
  world: WorldState;
}

export interface ChoiceRemoteFixture {
  sim: SimState;
  world: WorldState;
  net: RoadNetworkState;
  log: LogisticsState;
  traffic: TrafficState;
}

export interface BlockedFixture {
  sim: SimState;
  world: WorldState;
  traffic: TrafficState;
  /** The cell whose single bay is held by carrier 1. */
  bayCell: Cell;
}

export interface MatureFixture {
  sim: SimState;
  world: WorldState;
  net: RoadNetworkState;
  log: LogisticsState;
  traffic: TrafficState;
}

export interface StressFixture {
  sim: SimState;
  world: WorldState;
  net: RoadNetworkState;
  log: LogisticsState;
  traffic: TrafficState;
}

/**
 * Encode a fixture sim into the exact save envelope the shell installs at
 * `localStorage[SAVE_KEY]`. `lastSeenMs` defaults to the fixed witness time so
 * repeated calls are byte-identical; pass a real clock ONLY where offline
 * catch-up is intended (pass 3 captures).
 */
export function fixtureSaveText(
  sim: SimState,
  lastSeenMs: number = FIXTURE_WITNESS_MS,
  settings: SaveSettings = DEFAULT_SETTINGS,
): string {
  return encodeSave(sim, lastSeenMs, settings);
}

/** Apply a command and fail loudly if the fixture setup is rejected. */
function send(s: SimState, command: Command): CommandResult {
  const result = applyCommand(s, command);
  if (!result.ok) {
    throw new Error(`fixture command ${command.id} (${command.type}) rejected: ${result.reason}`);
  }
  return result;
}

/**
 * A flattened start parcel with construction scrap, the traffic.test.ts rig
 * precedent (seed 141). Roads need flat ground; the 24x24 start land is flattened
 * deterministically so road placement is reachable for every session fixture.
 */
function flatWorld(seed: number = RELEASE_SEED): WorldState {
  const w = createWorld(seed);
  for (let y = 0; y < 24; y += 1) {
    for (let x = 0; x < 24; x += 1) w.terrain[terrainIndex(x, y)] = "flat";
  }
  w.stock.scrap = 1000;
  return w;
}

/** Straight road corridor along y = 0: (0,0) .. (n-1,0). */
function placeCorridor(w: WorldState, net: RoadNetworkState, id: string, n: number): void {
  const cells: Cell[] = [];
  for (let x = 0; x < n; x += 1) cells.push({ x, y: 0 });
  const result = applyRoadCommand(w, net, { id, type: "road.place", cells });
  if (!result.ok) throw new Error(`fixture road ${id} rejected: ${JSON.stringify(result.rejection)}`);
}

/* ------------------------------------------------------------------ OPENING */

/**
 * OPENING: the pristine starter seed. No commands — this IS the GAME_SYSTEMS
 * economic state. `createInitialState()` (sim mirror) and `createWorld(seed)`
 * (world authority) are both deterministic; the equality test pins them
 * field-by-field against the GAME_SYSTEMS literals, not against each other's
 * output (owed by docs/vision/evidence/214-starter-economy.md:131/207).
 */
export function buildOpening(): OpeningFixture {
  return { sim: createInitialState(), world: createWorld(RELEASE_SEED) };
}

/* -------------------------------------------------------------- CHOICE yard */

/**
 * The shared, command-built CHOICE yard: a sorter + furnace on adjacent tiles
 * with SHORT belt runs. Starter funds build it without salvage (sorter
 * scrap30+steel4, furnace scrap35+steel4; starter store scrap120/steel12).
 *
 * The SORTER (machine 1) is the measured processing stage: scrap is drawn from
 * the store (abundant) and BOTH outputs drain back to the store, so the sorter
 * never starves and never blocks — it runs continuously at its cycle rate. The
 * 2D route latency is the shipped constant 5, far below the 40-tick cycle, so
 * the cycle is the binding term (processing-limited). The furnace pulls ferrous
 * from the store and exports steel; it is downstream and does not gate the
 * sorter. Both strategies start from this identical state (same seed, same
 * commands, same warmup tick).
 */
function choiceYard(): SimState {
  const s = createInitialState();
  let seq = 0;
  const id = () => `choice-${++seq}`;
  send(s, { id: id(), type: "machine.build", blueprint: "sorter", tile: 8 }); // machine 1
  send(s, { id: id(), type: "machine.build", blueprint: "furnace", tile: 9 }); // machine 2
  // Short runs (belt price is per-tile; latency stays the constant 5):
  // dock(2)->sorter(8) scrap, sorter(8)->dock ferrous + nonferrous (drained),
  // dock->furnace(9) ferrous, furnace(9)->dock steel.
  send(s, { id: id(), type: "route.connect", from: 0, to: 1, filter: "scrap" });
  send(s, { id: id(), type: "route.connect", from: 1, to: 0, filter: "ferrous" });
  send(s, { id: id(), type: "route.connect", from: 1, to: 0, filter: "nonferrous" });
  send(s, { id: id(), type: "route.connect", from: 0, to: 2, filter: "ferrous" });
  send(s, { id: id(), type: "route.connect", from: 2, to: 0, filter: "steel" });
  advance(s, CHOICE_WARMUP_TICKS);
  return s;
}

/**
 * CHOICE-LOCAL: short transport route, processing bottleneck. The yard above is
 * the whole strategy — sorter throughput is bound by its cycle (40 ticks), not
 * the 5-tick belt latency. The choice test measures sorter batches completed
 * over CHOICE_WINDOW_TICKS and shifts the bottleneck with a speed-branch upgrade.
 */
export function buildChoiceLocal(): ChoiceLocalFixture {
  return { sim: choiceYard(), world: flatWorld() };
}

/**
 * CHOICE-REMOTE: long route, hauling bottleneck. The SAME seed yard as LOCAL,
 * plus a session corridor of REMOTE_CORRIDOR_CELLS cells. Travel cost (23) far
 * exceeds the 2-tick unload, and a single destination bay serialises the two
 * carriers — hauling-limited. The choice test measures exact completion ticks
 * (E05) and shifts the bottleneck by widening the bay (capacity 1 -> 2).
 */
export function buildChoiceRemote(): ChoiceRemoteFixture {
  const sim = choiceYard();
  const world = flatWorld();
  const net = createRoadNetwork();
  const log = createLogistics();
  const traffic = createTraffic();
  placeCorridor(world, net, "remote-corridor", REMOTE_CORRIDOR_CELLS);
  registerBuilding(log, { id: 1, cell: { x: 0, y: 0 }, capacity: 200 });
  registerBuilding(log, { id: 2, cell: REMOTE_DEST_CELL, capacity: 200 });
  seedStock(log, 1, "scrap", 100);
  // One bay at the destination: the second carrier must wait (bay-full).
  setBayCapacity(traffic, REMOTE_DEST_CELL, 1);
  setDefaultTruck(traffic, { speed: 1, loadTicks: 0, unloadTicks: 2 });
  // Two carriers so bay contention is observable (E05 pattern). Carriers are
  // uncapped by design (logistics.ts registerCarrier); two is a strategy choice.
  registerCarrier(log, { capacity: 12, cell: { x: 0, y: 0 } });
  registerCarrier(log, { capacity: 12, cell: { x: 0, y: 0 } });
  for (let i = 0; i < REMOTE_JOB_COUNT; i += 1) {
    const result = createJob(log, {
      id: `remote-job-${i}`,
      sourceBuildingId: 1,
      destBuildingId: 2,
      cargoType: "scrap",
      amount: REMOTE_JOB_AMOUNT,
    });
    if (!result.ok) throw new Error(`fixture remote job ${i} rejected: ${JSON.stringify(result.reason)}`);
  }
  return { sim, world, net, log, traffic };
}

/* ------------------------------------------------------------------ BLOCKED */

/**
 * BLOCKED: full storage plus an occupied bay (U06/E04 capture evidence).
 *
 * Storage is filled THROUGH COMMANDS: manual.salvage pulses (2 scrap each,
 * 20-tick cooldown) bring the starter store (144 units: scrap120/ferrous12/
 * steel12) to exactly dockCapacity 300 — 78 pulses, 156 scrap, no overflow.
 * No direct fill is needed — the cap is reachable. The wreck pool (240) covers
 * the 156 salvaged units, so no generation rollover perturbs the total.
 *
 * The bay is a held lease in a session TrafficState: reserveBay is idempotent
 * per carrier and exclusive at capacity 1, so a second carrier is refused.
 */
export function buildBlocked(): BlockedFixture {
  const sim = createInitialState();
  const pulses = (TUNING.dockCapacity - sim.storeUnits) / TUNING.manualSalvagePerPulse; // 78
  for (let i = 0; i < pulses; i += 1) {
    send(sim, { id: `blocked-salvage-${i}`, type: "manual.salvage" });
    advance(sim, TUNING.manualPulseTicks);
  }
  const world = createWorld(RELEASE_SEED);
  const traffic = createTraffic();
  const bayCell: Cell = { x: 4, y: 0 };
  setBayCapacity(traffic, bayCell, 1);
  // Carrier 1 holds the only bay; the lease is the occupied-bay witness.
  const lease = reserveBay(traffic, bayCell, 1, 1);
  if (lease === null) throw new Error("fixture blocked bay lease was refused");
  return { sim, world, traffic, bayCell };
}

/* ------------------------------------------------------------------- MATURE */

/**
 * MATURE: 20 buildings / 30 moving units / 200 cargo representations.
 *
 * Buildings fit the 35 buildable cells (36 minus DOCK_TILE 2), so all 20 are
 * placed with REAL machine.build commands. Funding is a bounded direct store
 * fill (bench precedent): the starter economy cannot reach 20 buildings +
 * 5 drones in a bounded fixture, so the store is funded once, then every
 * building/drone is bought through commands. The fill is modest so the final
 * aggregate cargo can be pinned to exactly MATURE_CARGO.
 *
 * 30 moving units = 5 drones (the fleetCap, reached via drone.repair + 4
 * drone.add commands) + 25 carriers. Carriers have no SimState command surface
 * and are UNCAPPED (logistics.ts registerCarrier), so they are registered
 * directly in the session layer — the shipped API, not a cap bypass.
 *
 * 200 cargo representations are AGGREGATE (architecture README §5): storeUnits
 * + machine inBuf/tray + route loads + drone cargo, never per-unit objects.
 * After the yard runs a fixed warmup, `addToStore` tops the conserved total up
 * to exactly 200 (the sanctioned cargo entry boundary), keeping unitTotal == 200.
 */
export function buildMature(): MatureFixture {
  const sim = createInitialState();
  let seq = 0;
  const id = () => `mature-${++seq}`;

  // Bounded funding fill (bench precedent tests/perf/bench.test.ts:13-59). The
  // starter store/credits cannot buy 20 machines + 5 drones; this is the only
  // direct economy fill, and every purchase below still goes through commands.
  sim.store.scrap = 720;
  sim.store.steel = 85;
  sim.storeUnits = 805;
  sim.storeCapacity = 1000;
  sim.credits = 1000;

  // 20 buildings on distinct buildable tiles (skip DOCK_TILE 2): 10 sorters +
  // 10 furnaces, all real machine.build commands.
  const tiles: number[] = [];
  for (let t = 0; tiles.length < MATURE_BUILDINGS; t += 1) {
    if (t !== 2) tiles.push(t);
  }
  for (let i = 0; i < MATURE_BUILDINGS; i += 1) {
    const blueprint = i % 2 === 0 ? "sorter" : "furnace";
    send(sim, { id: id(), type: "machine.build", blueprint, tile: tiles[i] });
  }

  // 5 drones = the fleetCap: repair the starter, then add 4 (cost 45*2^spares).
  send(sim, { id: id(), type: "drone.repair" });
  for (let i = 0; i < DRONE_FLEET_CAP - 1; i += 1) {
    send(sim, { id: id(), type: "drone.add" });
  }

  // A few short belts so route loads exist, then a fixed warmup so machines run,
  // drones fly and cargo is in transit.
  send(sim, { id: id(), type: "route.connect", from: 0, to: 1, filter: "scrap" });
  send(sim, { id: id(), type: "route.connect", from: 1, to: 2, filter: "ferrous" });
  send(sim, { id: id(), type: "route.connect", from: 2, to: 0, filter: "steel" });
  advance(sim, 100);

  // Pin aggregate cargo to exactly 200 via the conserved entry boundary. The
  // funding above leaves the running total well under 200; addToStore keeps
  // storeUnits == sum(store) so the conservation invariant holds.
  const total = unitTotal(sim);
  if (total > MATURE_CARGO) {
    throw new Error(`MATURE cargo ${total} exceeds target ${MATURE_CARGO}; reduce funding`);
  }
  addToStore(sim, "scrap", MATURE_CARGO - total);

  // Session layer: 25 carriers (uncapped) on a short corridor with two buildings.
  const world = flatWorld();
  const net = createRoadNetwork();
  const log = createLogistics();
  const traffic = createTraffic();
  placeCorridor(world, net, "mature-corridor", 12);
  registerBuilding(log, { id: 1, cell: { x: 0, y: 0 }, capacity: 500 });
  registerBuilding(log, { id: 2, cell: { x: 11, y: 0 }, capacity: 500 });
  seedStock(log, 1, "scrap", 300);
  const carriers = MATURE_UNITS - DRONE_FLEET_CAP; // 25
  for (let i = 0; i < carriers; i += 1) {
    registerCarrier(log, { capacity: 12, cell: { x: 0, y: 0 } });
  }
  return { sim, world, net, log, traffic };
}

/**
 * MATURE-RESEARCH (#231): canonical MATURE plus a reachable Research face, for
 * the P03 panel-open instrument ONLY. `showResearch` (App.tsx) requires
 * store.data > 0 OR an owned research node; canonical MATURE seeds scrap/steel
 * only, so the Research dock face never renders and P03 records a hard failure
 * that is a fixture gap, not an app defect.
 *
 * Data is unreachable through commands inside MATURE's pinned population: the
 * only data recipe is R11 (circuits -> data, signalLab), and circuits need the
 * R07 wire+polymer chain — adding those machines would change the 20-machine
 * sorter/furnace population that P01/P02/V02/V05 pin. So data enters through a
 * bounded direct fill at `addToStore`, the SAME sanctioned cargo entry
 * boundary as the MATURE cargo pin above (it moves storeUnits and the store
 * stack together, so every cargo counter shifts by the same delta and
 * canonical MATURE's accounting is carried over unchanged).
 * The purchase itself is a REAL research.buy command (cutters, cost 4 data,
 * no prerequisite). Cutters' only bonus is the manual.salvage pulse scrap
 * multiplier (research.ts researchBonus); P03 never issues manual.salvage, so
 * the running yard economy is unchanged. No ticks after seeding — frozen like
 * canonical MATURE. buildMature()/buildStress() themselves are untouched.
 */
export const MATURE_RESEARCH_DATA = 12;

export function buildMatureResearch(): MatureFixture {
  const fixture = buildMature();
  const sim = fixture.sim;
  addToStore(sim, "data", MATURE_RESEARCH_DATA);
  send(sim, { id: "mature-research-1", type: "research.buy", node: "cutters" });
  return fixture;
}

/* ------------------------------------------------------------------- STRESS */

/**
 * STRESS: 100 buildings / 100 moving units / 1000 jobs.
 *
 * HONEST POPULATION FIXTURE, not a player-reached economy. 100 buildings exceed
 * the yard's 36 placement cells (35 buildable), so machines are filled DIRECTLY
 * with real blueprint data — the bench precedent (tests/perf/bench.test.ts:23:
 * "The stress harness fills machines directly so it can exceed the starter
 * yard's 36 placement cells"). Store funding is the same bounded bench fill.
 *
 * 100 moving units = 5 drones (fleetCap, via commands) + 95 carriers (uncapped
 * registerCarrier). 1000 jobs are created through the real createJob API across
 * 10 session buildings with seeded stock and destination room; the fixture is
 * frozen (no tick) so all 1000 jobs are waiting — a population, not a throughput
 * claim. Conservation (logisticsTotals) holds because createJob only reserves.
 */
export function buildStress(): StressFixture {
  const sim = createInitialState();
  let seq = 0;
  const id = () => `stress-${++seq}`;

  // Bench funding fill (tests/perf/bench.test.ts:13-59): the stress population
  // is beyond anything the starter economy reaches; fund once, fill machines.
  send(sim, { id: id(), type: "manual.salvage" });
  advance(sim, 6);
  sim.store.scrap = 100000;
  sim.store.ferrous = 100000;
  sim.store.nonferrous = 100000;
  sim.storeUnits = 300000;
  sim.storeCapacity = 400000;
  sim.credits = 100000;

  // 100 machines, direct fill (36-cell cap). Real blueprint data, bench pattern.
  for (let i = 0; i < STRESS_BUILDINGS; i += 1) {
    const blueprint = i % 2 === 0 ? "sorter" : "copperSeparator";
    const recipe = RECIPES[BLUEPRINTS[blueprint].recipeId];
    const machine: MachineState = {
      id: sim.nextMachineId++,
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
    };
    sim.machines.push(machine);
  }

  // 5 drones through commands (the fleetCap), funded by the fill above.
  send(sim, { id: id(), type: "drone.repair" });
  for (let i = 0; i < DRONE_FLEET_CAP - 1; i += 1) {
    send(sim, { id: id(), type: "drone.add" });
  }

  // Session layer: 10 buildings on a corridor, 95 carriers, 1000 waiting jobs.
  const world = flatWorld();
  const net = createRoadNetwork();
  const log = createLogistics();
  const traffic = createTraffic();
  placeCorridor(world, net, "stress-corridor", 10);
  const sites = 10;
  for (let b = 1; b <= sites; b += 1) {
    registerBuilding(log, { id: b, cell: { x: b - 1, y: 0 }, capacity: 2000 });
    seedStock(log, b, "scrap", 1000);
  }
  const carriers = STRESS_UNITS - DRONE_FLEET_CAP; // 95
  for (let i = 0; i < carriers; i += 1) {
    registerCarrier(log, { capacity: 12, cell: { x: 0, y: 0 } });
  }
  // 1000 jobs round-robin across the 10 sites: source b -> dest b+1, amount 1.
  // Each source ships 100 (<= 1000 stock); each dest receives 100 (<= 2000 room).
  for (let k = 0; k < STRESS_JOBS; k += 1) {
    const source = (k % sites) + 1;
    const dest = ((k + 1) % sites) + 1;
    const result = createJob(log, {
      id: `stress-job-${k}`,
      sourceBuildingId: source,
      destBuildingId: dest,
      cargoType: "scrap",
      amount: 1,
    });
    if (!result.ok) throw new Error(`fixture stress job ${k} rejected: ${JSON.stringify(result.reason)}`);
  }
  return { sim, world, net, log, traffic };
}

/** Convenience: the drone fleet count of a fixture sim (starter + spares). */
export function droneCount(sim: SimState): number {
  return fleetUnits(sim).length;
}
