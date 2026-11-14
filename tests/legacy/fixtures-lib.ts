/**
 * RW3D T02 (#129): deterministic legacy save fixture library.
 *
 * Every fixture is derived from the REAL command/engine/save path at the merged
 * prerequisite SHA 8b78d09f (#128). No RNG and no wall clock enter the simulation,
 * so a "seed" here is the fixed command script itself: same script, same bytes.
 *
 * Shapes covered:
 * - legacy v1 stripped: `research`, `spares`, machine/route measurement counters,
 *   upgrade `branch` and belt `run` removed, exactly the keys a pre-feature v1
 *   encoder never wrote. `decodeSave` accepts them and `migrate` backfills.
 * - modern: the full current shape, including named upgrade branches, priced
 *   belt runs, a purchased research node and a fleet spare.
 * - damaged orphan: the pre-#100 defect reconstructed (a dismantled machine's
 *   belts left behind with cargo), in both priced and pre-price variants.
 * - adversarial: checksum/parse/schema/invariant/settings attacks for E08.
 *
 * This module is pure (no node APIs) so vitest can import it under jsdom and
 * regenerate every fixture byte-for-byte inside a test. The checked-in JSON is
 * the artifact; `generate-fixtures.mjs` only writes what this module returns.
 */
import { advance } from "../../src/game/simulation/engine";
import {
  applyCommand,
  beltCost,
  refundOf,
  type Command,
  type CommandBody,
} from "../../src/game/simulation/commands";
import {
  createInitialState,
  fleetAccumulated,
  fleetDeliveries,
  type SimState,
} from "../../src/game/simulation/types";
import {
  DEFAULT_SETTINGS,
  checksum,
  encodeSave,
  migrate,
  type SavePayload,
  type SaveSettings,
} from "../../src/game/persistence/save";
import { systemTotals, unitTotal } from "../../src/game/simulation/invariants";
import { TUNING, type ResourceId } from "../../src/game/content/defs";

/** Fixed checkpoint clock for every fixture (epoch ms). Tests pick `now` around it. */
export const LAST_SEEN_MS = 1_700_000_000_000;

export interface FixtureMeta {
  readonly tick: number;
  readonly revision: number;
  readonly credits: number;
  readonly tutorial: number;
  readonly storeUnits: number;
  readonly storeCapacity: number;
  readonly unitTotal: number;
  readonly totals: Record<string, number>;
  readonly wreck: { remaining: number; generation: number; pulses: number };
  readonly fleet: { units: number; deliveries: number; accumulated: number };
  readonly machines: number;
  readonly routes: number;
  readonly exportClaimed: boolean;
  readonly research: Record<string, number>;
  readonly checksum: string;
  readonly byteLength: number;
  readonly lastSeenMs: number;
}

export interface FixtureSpec {
  readonly name: string;
  readonly file: string;
  readonly scenario: string;
  readonly seed: string;
  readonly shape: string;
  readonly kind: "save" | "reject" | "sanitize";
  readonly text: string;
  readonly meta: FixtureMeta;
  /** reject: expected decode failure; sanitize: expected sanitized settings. */
  readonly expectedReason?: string;
  readonly expectedDetail?: string;
  readonly expectedSettings?: SaveSettings;
  /** damaged orphan: quantified repair compensation, derived from TUNING only. */
  readonly repair?: {
    readonly droppedRoutes: number;
    readonly returnedItems: Record<string, number>;
    readonly scrapRefund: number;
  };
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

let seq = 0;
function send(state: SimState, body: CommandBody): void {
  seq += 1;
  const result = applyCommand(state, { ...body, id: `fx${seq}` } as Command);
  if (!result.ok) {
    throw new Error(`fixture script command failed: ${body.type} -> ${JSON.stringify(result)}`);
  }
}

function metaOf(sim: SimState, text: string, lastSeenMs: number): FixtureMeta {
  const envelope = JSON.parse(text) as { checksum: string };
  // Balances are quoted on the LOADED view: decode + migrate is the real save
  // path, and migration must not change a single unit (asserted in the tests).
  const view = migrate({ sim: clone(sim), lastSeenMs, settings: DEFAULT_SETTINGS }).sim;
  return {
    tick: view.tick,
    revision: view.revision,
    credits: view.credits,
    tutorial: view.tutorial,
    storeUnits: view.storeUnits,
    storeCapacity: view.storeCapacity,
    unitTotal: unitTotal(view),
    totals: systemTotals(view),
    wreck: {
      remaining: view.wreck.remaining,
      generation: view.wreck.generation,
      pulses: view.wreck.pulses,
    },
    fleet: {
      units: 1 + view.spares.length,
      deliveries: fleetDeliveries(view),
      accumulated: fleetAccumulated(view),
    },
    machines: view.machines.length,
    routes: view.routes.length,
    exportClaimed: view.exportClaimed,
    research: { ...view.research },
    checksum: envelope.checksum,
    byteLength: text.length,
    lastSeenMs,
  };
}

/**
 * Remove exactly the keys a pre-feature v1 encoder never wrote. Relative key
 * order of the survivors is preserved, so the envelope is a plausible old save,
 * not a reordered new one. `migrate` is the only code that may add them back.
 */
function stripLegacyShape(sim: SimState): SimState {
  const copy = clone(sim) as unknown as Record<string, unknown>;
  delete copy.research;
  delete copy.spares;
  for (const m of copy.machines as Record<string, unknown>[]) {
    for (const key of [
      "ageTicks",
      "busyTicks",
      "fullTicks",
      "starvedTicks",
      "rateAge",
      "rateFrom",
      "rateAgePrev",
      "rateFromPrev",
      "branch",
    ]) {
      delete m[key];
    }
  }
  for (const r of copy.routes as Record<string, unknown>[]) {
    delete r.run;
    delete r.ageTicks;
    delete r.busyTicks;
  }
  return copy as unknown as SimState;
}

/** Six manual pulses, the repair, and 262 ticks of drone work (transfer.test shape). */
function scriptEarly(): SimState {
  const state = createInitialState();
  for (let i = 0; i < 6; i += 1) {
    send(state, { type: "manual.salvage" });
    advance(state, TUNING.manualPulseTicks);
  }
  send(state, { type: "drone.repair" });
  advance(state, 262);
  return state;
}

/** The tutorial-to-export yard (economy.test `tutorialToExport` shape). */
function scriptChain(): SimState {
  const state = scriptEarly();
  send(state, { type: "machine.build", blueprint: "sorter", tile: 8 });
  const sorter = state.machines[0];
  send(state, { type: "route.connect", from: 0, to: sorter.id, filter: "scrap" });
  send(state, { type: "route.connect", from: sorter.id, to: 0, filter: "ferrous" });
  advance(state, 400);
  send(state, { type: "machine.build", blueprint: "furnace", tile: 9 });
  const furnace = state.machines[1];
  send(state, { type: "route.connect", from: sorter.id, to: furnace.id, filter: "ferrous" });
  send(state, { type: "route.connect", from: furnace.id, to: 0, filter: "steel" });
  advance(state, 900);
  send(state, { type: "contract.export" });
  return state;
}

/** Sell scrap/steel in guarded tranches until the credit target is met. */
function sellUntil(state: SimState, target: number): void {
  let guard = 0;
  while (state.credits < target) {
    guard += 1;
    if (guard > 200) throw new Error("fixture script: sell loop did not converge");
    let sold = false;
    for (const resource of ["steel", "scrap"] as ResourceId[]) {
      if (state.credits >= target) break;
      const held = state.store[resource] ?? 0;
      if (held > TUNING.reserveFloor + 20) {
        send(state, { type: "contract.sell", resource, qty: TUNING.sellBatchCap });
        sold = true;
      }
    }
    if (!sold) advance(state, 300);
  }
}

/** Sell steel/scrap/wire tranches whenever they pile up, with no credit target.
 * Keeps the store below capacity during long settle loops so dock-bound cargo
 * (data, steel) always has room to land. */
function sellTranches(state: SimState): void {
  for (const resource of ["steel", "scrap", "wire"] as ResourceId[]) {
    const held = state.store[resource] ?? 0;
    if (held > TUNING.reserveFloor + 20) {
      send(state, { type: "contract.sell", resource, qty: TUNING.sellBatchCap });
    }
  }
}

/**
 * The deep yard: seven machines, the full research chain to data, a named speed
 * upgrade, a named buffer upgrade, a fleet spare, a removed belt and a purchased
 * research node. Every step is a real command; the script asserts each one.
 */
function scriptDeep(): SimState {
  const state = scriptChain();
  const sorter = state.machines[0];
  const furnace = state.machines[1];

  // Fund the first named upgrade from repeatable sales, then buy it (tutorial 9).
  sellUntil(state, 40);
  send(state, { type: "machine.upgrade", machineId: sorter.id, branch: "speed" });

  // A temporary nonferrous store belt keeps the sorter tray from blocking while
  // the yard banks the build costs; it is removed (and refunded) below.
  send(state, { type: "route.connect", from: sorter.id, to: 0, filter: "nonferrous" });
  const tempNonferrous = state.routes[state.routes.length - 1];
  let guard = 0;
  while (
    (state.store.scrap ?? 0) < 260 ||
    (state.store.ferrous ?? 0) < 30 ||
    (state.store.nonferrous ?? 0) < 14
  ) {
    guard += 1;
    if (guard > 60) throw new Error("fixture script: build funds did not accumulate");
    advance(state, 500);
  }

  send(state, { type: "machine.build", blueprint: "copperSeparator", tile: 10 });
  send(state, { type: "machine.build", blueprint: "wireMill", tile: 11 });
  send(state, { type: "machine.build", blueprint: "polymerRecycler", tile: 12 });
  send(state, { type: "machine.build", blueprint: "circuitAssembler", tile: 13 });
  send(state, { type: "machine.build", blueprint: "signalLab", tile: 14 });
  const copper = state.machines[2];
  const wire = state.machines[3];
  const polymer = state.machines[4];
  const circuits = state.machines[5];
  const lab = state.machines[6];

  // The deep chain no longer sells ferrous or nonferrous back to the store.
  send(state, { type: "route.remove", routeId: tempNonferrous.id });
  const ferrousOut = state.routes.find(
    (r) => r.from.id === sorter.id && r.to.kind === "store" && r.filter === "ferrous",
  );
  if (!ferrousOut) throw new Error("fixture script: ferrous store route missing");
  send(state, { type: "route.remove", routeId: ferrousOut.id });

  // sorter->furnace ferrous already exists from the chain script. Single-input
  // machines stay machine->machine. The circuitAssembler has TWO inputs (wire +
  // polymer) sharing one 16-slot buffer; a direct wire belt floods that buffer
  // with fast wire before scarce polymer can land and deadlocks the assembler
  // (destinationRoom == 0 blocks settleArrivals). Feeding it from the store lets
  // pullFromStore throttle each input to a per-batch window, so both always fit.
  send(state, { type: "route.connect", from: sorter.id, to: copper.id, filter: "nonferrous" });
  send(state, { type: "route.connect", from: copper.id, to: wire.id, filter: "copper" });
  send(state, { type: "route.connect", from: copper.id, to: polymer.id, filter: "residue" });
  send(state, { type: "route.connect", from: wire.id, to: 0, filter: "wire" });
  send(state, { type: "route.connect", from: polymer.id, to: 0, filter: "polymer" });
  send(state, { type: "route.connect", from: 0, to: circuits.id, filter: "wire" });
  send(state, { type: "route.connect", from: 0, to: circuits.id, filter: "polymer" });
  send(state, { type: "route.connect", from: circuits.id, to: lab.id, filter: "circuits" });
  send(state, { type: "route.connect", from: lab.id, to: 0, filter: "data" });

  // Let the chain settle until the lab has banked the 4 data the cutters cost,
  // selling surplus each chunk so the dock never saturates and blocks data.
  let dataGuard = 0;
  while ((state.store.data ?? 0) < 4) {
    dataGuard += 1;
    if (dataGuard > 60) throw new Error("fixture script: data did not accumulate");
    advance(state, 1000);
    sellTranches(state);
  }
  send(state, { type: "research.buy", node: "cutters" });

  // A fleet spare and a second named upgrade, both funded by sales.
  sellUntil(state, 45);
  send(state, { type: "drone.add" });
  sellUntil(state, 40);
  send(state, { type: "machine.upgrade", machineId: furnace.id, branch: "buffer" });

  // One boosted pulse (cutters adds +2 scrap) after the cooldown has elapsed.
  advance(state, TUNING.manualPulseTicks);
  send(state, { type: "manual.salvage" });
  advance(state, 600);
  return state;
}

/**
 * Reconstruct the pre-#100 orphan damage on a real chain yard: dismantle the
 * furnace through the live command (which today refunds and drops its belts),
 * then put the two belts back exactly as the old defect left them — cargo still
 * in flight, stale `outRoute` mirror restored. The envelope is re-checksummed so
 * the ONLY damage is the orphan registration, which `repairRegistration` must fix.
 */
function scriptOrphan(): { sim: SimState; dropped: SimState["routes"] } {
  const state = scriptChain();
  const furnace = state.machines[1];
  const sorter = state.machines[0];
  // Two ticks so the belts carry live cargo at the moment of the damage.
  advance(state, 2);
  const orphanRoutes = clone(
    state.routes.filter((r) => r.from.id === furnace.id || r.to.id === furnace.id),
  );
  const staleMirror = sorter.outRoute;
  send(state, { type: "machine.dismantle", machineId: furnace.id });
  state.routes.push(...orphanRoutes);
  sorter.outRoute = staleMirror;
  return { sim: state, dropped: orphanRoutes };
}

function saveFixture(
  name: string,
  scenario: string,
  seed: string,
  shape: string,
  sim: SimState,
  settings: SaveSettings = DEFAULT_SETTINGS,
  repair?: FixtureSpec["repair"],
): FixtureSpec {
  const text = encodeSave(sim, LAST_SEEN_MS, settings);
  return {
    name,
    file: `${name}.json`,
    scenario,
    seed,
    shape,
    kind: "save",
    text,
    meta: metaOf(sim, text, LAST_SEEN_MS),
    ...(repair ? { repair } : {}),
  };
}

function envelopeOf(text: string): { schemaVersion: number; checksum: string; payload: SavePayload } {
  return JSON.parse(text) as { schemaVersion: number; checksum: string; payload: SavePayload };
}

function resealed(envelope: { schemaVersion: number; payload: SavePayload }): string {
  const body = JSON.stringify(envelope.payload);
  return JSON.stringify({ schemaVersion: envelope.schemaVersion, checksum: checksum(body), payload: envelope.payload });
}

/** Quantify the repair compensation from TUNING alone (no repair code involved). */
function repairExpectation(dropped: SimState["routes"]): FixtureSpec["repair"] {
  const returnedItems: Record<string, number> = {};
  let scrapRefund = 0;
  for (const route of dropped) {
    for (const item of route.items) {
      returnedItems[item.resource] = (returnedItems[item.resource] ?? 0) + item.qty;
    }
    scrapRefund += refundOf(beltCost(route.run?.length ?? 0));
  }
  return { droppedRoutes: dropped.length, returnedItems, scrapRefund };
}

export function buildAllFixtures(): FixtureSpec[] {
  seq = 0;
  const fixtures: FixtureSpec[] = [];

  // 1. Early salvage, legacy stripped shape (no research/spares/counters/run/branch).
  const early = scriptEarly();
  fixtures.push(
    saveFixture(
      "salvage-early.legacy",
      "Six pulses, repaired starter drone, 262 ticks of deliveries; pre-machine yard.",
      "scriptEarly: 6x(manual.salvage+6t), drone.repair, 262t",
      "legacy-v1-stripped",
      stripLegacyShape(early),
    ),
  );

  // 2. Tutorial-to-export chain, modern shape.
  const chain = scriptChain();
  fixtures.push(
    saveFixture(
      "chain-export.modern",
      "Sorter+furnace yard, four priced belts, export contract claimed (30 credits).",
      "scriptChain: early + sorter@8 + 2 routes + 400t + furnace@9 + 2 routes + 900t + contract.export",
      "modern",
      chain,
    ),
  );

  // 3. Deep yard with research, fleet spare, named upgrades and a removed belt.
  const deep = scriptDeep();
  fixtures.push(
    saveFixture(
      "deep-yard.modern",
      "Seven-machine research chain, cutters purchased, one spare drone, speed+buffer branches.",
      "scriptDeep: chain + sells + upgrade(speed) + temp nonferrous belt + fund loop + 5 builds + 2 route.remove + 9 routes (store-fed assembler) + settle/sell loop + research.cutters + drone.add + upgrade(buffer) + boosted pulse + 600t",
      "modern",
      deep,
      { muted: true, reducedMotion: true, textScale: 1.5 },
    ),
  );

  // 4/5. Pre-#100 orphan damage, priced and pre-price variants.
  const orphan = scriptOrphan();
  const expectation = repairExpectation(orphan.dropped);
  fixtures.push(
    saveFixture(
      "orphan-route.modern",
      "Dismantled furnace's two belts left orphaned with live cargo (pre-#100 defect, priced runs).",
      "scriptOrphan: chain + 2t + snapshot belts + machine.dismantle(furnace) + restore belts/mirror",
      "damaged-orphan",
      orphan.sim,
      DEFAULT_SETTINGS,
      expectation,
    ),
  );
  const orphanLegacy = stripLegacyShape(orphan.sim);
  fixtures.push(
    saveFixture(
      "orphan-route.legacy",
      "Same orphan damage on a pre-price save: no `run`, so the belt refund is zero.",
      "scriptOrphan + stripLegacyShape (run/counters/research/spares removed)",
      "damaged-orphan-legacy",
      orphanLegacy,
      DEFAULT_SETTINGS,
      repairExpectation(orphanLegacy.routes.filter((r) => orphan.dropped.some((d) => d.id === r.id))),
    ),
  );

  // 6-11. Adversarial envelopes derived from the healthy fixtures (E08 negatives).
  const earlyText = fixtures[0].text;
  const chainText = fixtures[1].text;

  const tampered = envelopeOf(earlyText);
  const flipped = tampered.checksum.slice(0, 7) + (tampered.checksum[7] === "0" ? "1" : "0");
  fixtures.push({
    name: "bad-checksum",
    file: "bad-checksum.json",
    scenario: "Healthy early yard with one checksum digit flipped.",
    seed: "salvage-early.legacy + checksum[7] flip",
    shape: "adversarial",
    kind: "reject",
    text: JSON.stringify({ ...tampered, checksum: flipped }),
    meta: metaOf(early, earlyText, LAST_SEEN_MS),
    expectedReason: "checksum",
  });

  fixtures.push({
    name: "bad-truncated",
    file: "bad-truncated.json",
    scenario: "Early yard envelope cut at 60% of its bytes (interrupted write).",
    seed: "salvage-early.legacy text.slice(0, 60%)",
    shape: "adversarial",
    kind: "reject",
    text: earlyText.slice(0, Math.floor(earlyText.length * 0.6)),
    meta: metaOf(early, earlyText, LAST_SEEN_MS),
    expectedReason: "parse",
  });

  const dup = envelopeOf(chainText);
  dup.payload.sim.machines[1] = { ...dup.payload.sim.machines[1], id: dup.payload.sim.machines[0].id };
  fixtures.push({
    name: "bad-duplicate-id",
    file: "bad-duplicate-id.json",
    scenario: "Chain yard whose furnace carries the sorter's id, re-checksummed.",
    seed: "chain-export.modern + machines[1].id = machines[0].id + reseed checksum",
    shape: "adversarial",
    kind: "reject",
    text: resealed(dup),
    meta: metaOf(chain, chainText, LAST_SEEN_MS),
    expectedReason: "invalid",
    expectedDetail: `machineId:${dup.payload.sim.machines[0].id}`,
  });

  const negative = envelopeOf(earlyText);
  negative.payload.sim.store.scrap = -5;
  fixtures.push({
    name: "bad-negative-store",
    file: "bad-negative-store.json",
    scenario: "Early yard with a negative store quantity, re-checksummed.",
    seed: "salvage-early.legacy + store.scrap = -5 + reseed checksum",
    shape: "adversarial",
    kind: "reject",
    text: resealed(negative),
    meta: metaOf(early, earlyText, LAST_SEEN_MS),
    expectedReason: "invalid",
    expectedDetail: "store",
  });

  const wrongSchema = envelopeOf(earlyText);
  fixtures.push({
    name: "bad-schema",
    file: "bad-schema.json",
    scenario: "Early yard envelope declaring schemaVersion 2.",
    seed: "salvage-early.legacy + schemaVersion = 2",
    shape: "adversarial",
    kind: "reject",
    text: JSON.stringify({ ...wrongSchema, schemaVersion: 2 }),
    meta: metaOf(early, earlyText, LAST_SEEN_MS),
    expectedReason: "schema",
  });

  const hostile = envelopeOf(earlyText);
  hostile.payload = {
    ...hostile.payload,
    settings: { muted: "yes", reducedMotion: 1, textScale: 99 } as unknown as SaveSettings,
  };
  fixtures.push({
    name: "bad-settings",
    file: "bad-settings.json",
    scenario: "Early yard with attacker-controlled settings (textScale 99, non-boolean flags).",
    seed: "salvage-early.legacy + settings {muted:'yes',reducedMotion:1,textScale:99} + reseed checksum",
    shape: "adversarial",
    kind: "sanitize",
    text: resealed(hostile),
    meta: metaOf(early, earlyText, LAST_SEEN_MS),
    expectedSettings: { muted: false, reducedMotion: false, textScale: 2 },
  });

  return fixtures;
}