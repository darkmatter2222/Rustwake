import { describe, expect, it } from "vitest";
import { TUNING } from "../../src/game/content/defs";
import {
  applyCommand,
  beltCost,
  beltRun,
  refundOf,
  tileIndexOf,
  DOCK_TILE,
  YARD_COLS,
  YARD_TILES,
  type Command,
  type CommandBody,
} from "../../src/game/simulation/commands";
import { createInitialState, manhattanRun, type SimState } from "../../src/game/simulation/types";
import { planConnections } from "../../src/game/simulation/autoconnect";
import { advance } from "../../src/game/simulation/engine";
import { checksum, decodeSave, encodeSave, validateSim } from "../../src/game/persistence/save";
import harnessJson from "../../work/feedback/belt001-harness.json";
import seedEnvelope from "../../docs/evidence/yard-mature.json";
import { LAYOUTS, ladderRow } from "../../scripts/probe-belt.mjs";

/** The v1 fixture as on disk: the JSON module re-serialises to the same bytes. */
const fixtureRaw = JSON.stringify(seedEnvelope);

type LayoutRow = {
  name: "compact" | "spread";
  batches: number;
  powerLimitedRounds: number;
  minPowerRatio: number;
  starvedMax: number;
  starvedMean: number;
  inputStallPct: number;
  creditsPer1000Batches: number;
  beltScrap: number;
  links: number;
};

/**
 * BELT-001 g1: a connection is a built object with an extent and a price.
 *
 * - the extent is `RouteState.run`, the deterministic Manhattan tile walk between the
 *   two endpoint tiles (row difference first, then the column difference, so at every
 *   corner exactly one next tile is legal); the store endpoint always counts as the
 *   dock tile, which is the single anchor every run is measured against;
 * - the price is `beltCostPerTile x run.length`, charged by `route.connect`;
 * - the latency is `beltLatencyPerTile x run.length`, so a longer belt is slower;
 * - `route.remove` returns `dismantleRefundPct` of what that connect charged;
 * - `machine.move` charges `movePenaltyPct` of the blueprint's own build cost and
 *   re-walks the priced runs of the links touching that machine;
 * - `machine.dismantle` discounts only the build cost, never the tray/batch/buffer.
 *
 * A link saved before the price exists carries no `run`, keeps its stored `latency`
 * (the old constant) and returns 0 on removal, so an old save replays exactly as it
 * did on the pre-change tree.
 */

let seq = 0;
function send(state: SimState, body: CommandBody): boolean {
  seq += 1;
  return applyCommand(state, { ...body, id: `b${seq}` } as Command).ok === true;
}

/** Two identical sorters, one beside the dock (tile 0), one far away (tile 35). */
function twoSorters(scrap = 200): SimState {
  const state = createInitialState();
  state.tutorial = 9;
  state.store["scrap"] = scrap;
  state.storeUnits = scrap;
  send(state, { type: "machine.build", blueprint: "sorter", tile: 0 });
  send(state, { type: "machine.build", blueprint: "sorter", tile: 35 });
  return state;
}

function routeTo(state: SimState, machineId: number) {
  const route = state.routes.find((each) => each.to.id === machineId);
  if (!route) throw new Error(`no link into machine ${machineId}`);
  return route;
}

const scrapOf = (state: SimState): number => state.store["scrap"] ?? 0;
const unitTotal = (state: SimState): number =>
  Object.values(state.store).reduce<number>((sum, value) => sum + (value ?? 0), 0);

describe("B-1 a connection has an extent, a price and a refund", () => {
  it("prices the same machine pair by its tile distance (two layouts printed)", () => {
    const near = twoSorters();
    expect(send(near, { type: "route.connect", from: 0, to: 1, filter: "scrap" })).toBe(true);
    const nearRun = routeTo(near, 1).run;
    expect(nearRun).toEqual([DOCK_TILE, 1, 0]); // dock tile 2 -> tile 1 -> tile 0
    expect(nearRun).toHaveLength(3);
    expect(nearRun && beltCost(nearRun.length)).toBe(3);
    expect(scrapOf(near)).toBe(200 - 20 - 20 - 3);

    const far = twoSorters();
    expect(send(far, { type: "route.connect", from: 0, to: 2, filter: "scrap" })).toBe(true);
    const farRun = routeTo(far, 2).run;
    expect(farRun).toEqual([2, 8, 14, 20, 26, 32, 33, 34, 35]);
    expect(farRun).toHaveLength(9);
    expect(farRun && beltCost(farRun.length)).toBe(9);
    expect(scrapOf(far)).toBe(200 - 20 - 20 - 9);
    // Same blueprint, same endpoints by kind, different tile distance: the far link
    // costs three times the near one, both paid from the same purse.
    expect(beltCost(farRun!.length)).toBe(3 * beltCost(nearRun!.length));
    // And the latency follows the same extent: two ticks per tile.
    expect(routeTo(near, 1).latency).toBe(TUNING.beltLatencyPerTile * 3);
    expect(routeTo(far, 2).latency).toBe(TUNING.beltLatencyPerTile * 9);
    // The harness prints the same ladder of five distances for one dock pair.
    console.log(
      "B-1 same pair at five distances",
      JSON.stringify(harnessJson.prices.samePairAtDifferentDistances)
    );
    expect(harnessJson.prices.samePairAtDifferentDistances.map((row) => row.priceScrap)).toEqual([
      3, 2, 2, 4, 9,
    ]);
  });

  it("returns exactly the recorded refund percentage when a link is removed", () => {
    const state = twoSorters();
    send(state, { type: "route.connect", from: 0, to: 1, filter: "scrap" });
    send(state, { type: "route.connect", from: 0, to: 2, filter: "scrap" });
    const price = beltCost(routeTo(state, 2).run!.length);
    expect(price).toBe(9);
    expect(refundOf(price)).toBe(8); // round(9 x 90 / 100) = round(8.1)
    const before = scrapOf(state);
    expect(send(state, { type: "route.remove", routeId: routeTo(state, 2).id })).toBe(true);
    expect(scrapOf(state) - before).toBe(8);
    expect(state.routes).toHaveLength(1);
    // The near link: 90 % of 3 is 2.7, so the integer purse returns 3. The rounding is
    // the recorded rule and is printed here so the row cannot be read as an exact 90.
    const nearPrice = beltCost(routeTo(state, 1).run!.length);
    const beforeNear = scrapOf(state);
    send(state, { type: "route.remove", routeId: routeTo(state, 1).id });
    expect(scrapOf(state) - beforeNear).toBe(refundOf(nearPrice));
    expect(refundOf(3)).toBe(3);
    expect(harnessJson.prices.removal).toEqual({
      removedRunLength: 9,
      removedPriceScrap: 9,
      returnedScrap: 8,
      refundPct: TUNING.dismantleRefundPct,
      keptPriceScrap: 3,
    });
  });

  it("refuses one tap on a priced link with the numbered shortfall and no state change", () => {
    const state = createInitialState();
    state.tutorial = 9;
    state.store["scrap"] = 22; // the sorter's 20 fits, the 3-scrap belt does not
    state.storeUnits = 22;
    expect(send(state, { type: "machine.build", blueprint: "sorter", tile: 0 })).toBe(true);
    expect(scrapOf(state)).toBe(2);
    const revision = state.revision;
    const encoded = JSON.stringify(state);
    const refused = applyCommand(state, {
      id: "refused",
      type: "route.connect",
      from: 0,
      to: 1,
      filter: "scrap",
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.reason).toBe("insufficient");
      expect(refused.need).toBe(3);
      expect(refused.have).toBe(2);
      expect(refused.word).toBe("scrap");
    }
    expect(state.revision).toBe(revision);
    expect(JSON.stringify(state)).toBe(encoded); // nothing at all moved
    expect(state.routes).toHaveLength(0);
    expect(harnessJson.prices.refusal).toMatchObject({ ok: false, need: 3, have: 2, word: "scrap" });
  });

  it("charges the move penalty once and re-walks only the priced links it touches", () => {
    const state = createInitialState();
    state.tutorial = 9;
    state.store["scrap"] = 300;
    state.store["ferrous"] = 40;
    state.store["nonferrous"] = 40;
    state.storeUnits = 380;
    send(state, { type: "machine.build", blueprint: "sorter", tile: 0 }); // id 1
    send(state, { type: "machine.build", blueprint: "furnace", tile: 8 }); // id 2
    send(state, { type: "route.connect", from: 0, to: 1, filter: "scrap" });
    send(state, { type: "route.connect", from: 1, to: 2, filter: "steel" });
    expect(routeTo(state, 2).run).toEqual([0, 6, 7, 8]);
    const scrapBefore = scrapOf(state);
    const ferrousBefore = state.store["ferrous"] ?? 0;
    // 50 % of the furnace's own price: 10 scrap -> 5 and 5 ferrous -> 3, round(2.5).
    expect(send(state, { type: "machine.move", machineId: 2, tile: 35 })).toBe(true);
    expect(scrapBefore - scrapOf(state)).toBe(5);
    expect(ferrousBefore - (state.store["ferrous"] ?? 0)).toBe(3);
    const moved = routeTo(state, 2);
    expect(moved.run).toEqual([0, 6, 12, 18, 24, 30, 31, 32, 33, 34, 35]);
    expect(moved.latency).toBe(TUNING.beltLatencyPerTile * 11);
    expect(routeTo(state, 1).latency).toBe(TUNING.beltLatencyPerTile * 3); // untouched
    expect(state.machines.find((m) => m.id === 2)!.tile).toBe(35);
  });

  it("refuses a move whose penalty the purse cannot cover, unchanged", () => {
    const state = createInitialState();
    state.tutorial = 9;
    state.store["scrap"] = 25; // a sorter (20) plus its link, nothing left for a move
    state.storeUnits = 25;
    send(state, { type: "machine.build", blueprint: "sorter", tile: 0 });
    expect(scrapOf(state)).toBe(5);
    const encoded = JSON.stringify(state);
    const refused = applyCommand(state, {
      id: "move-refused",
      type: "machine.move",
      machineId: 1,
      tile: 35,
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.reason).toBe("insufficient");
      expect(refused.need).toBe(10); // 50 % of the 20-scrap sorter
      expect(refused.have).toBe(5);
    }
    expect(JSON.stringify(state)).toBe(encoded);
    expect(state.machines.find((m) => m.id === 1)!.tile).toBe(0);
  });

  it("discounts only the build cost on dismantle; contents return in full", () => {
    const state = twoSorters();
    send(state, { type: "route.connect", from: 0, to: 1, filter: "scrap" });
    send(state, { type: "route.connect", from: 0, to: 2, filter: "scrap" });
    const machine = state.machines.find((m) => m.id === 1)!;
    machine.tray = [{ resource: "ferrous", qty: 4 }]; // a finished batch, unshipped
    machine.trayUnits = 4;
    const unitsBefore = unitTotal(state);
    const scrapBefore = scrapOf(state);
    // 90 % of the 20-scrap price is 18, and 90 % of that machine's 3-scrap link is 3.
    expect(send(state, { type: "machine.dismantle", machineId: 1 })).toBe(true);
    expect(scrapOf(state) - scrapBefore).toBe(18 + 3);
    // The tray's 4 units come back whole on top of the two discounted prices.
    expect(unitTotal(state) - unitsBefore).toBe(18 + 3 + 4);
    expect(state.machines).toHaveLength(1);
    expect(state.routes).toHaveLength(1); // the far link survived, and was not paid twice
    const farPrice = beltCost(routeTo(state, 2).run!.length);
    expect(farPrice).toBe(9);
    expect(scrapOf(state)).toBe(scrapBefore + 21);
  });
});

describe("B-1 the walk itself is one deterministic rule", () => {
  it("closes rows before columns, in both directions, and never needs a tie-break", () => {
    expect(manhattanRun(0, 0, YARD_COLS)).toEqual([0]); // one tile: the endpoints coincide
    expect(manhattanRun(DOCK_TILE, 5, YARD_COLS)).toEqual([2, 3, 4, 5]); // one row
    expect(manhattanRun(DOCK_TILE, 31, YARD_COLS)).toEqual([2, 8, 14, 20, 26, 32, 31]);
    expect(manhattanRun(31, DOCK_TILE, YARD_COLS)).toEqual([31, 25, 19, 13, 7, 1, 2]);
    expect(manhattanRun(4, 27, YARD_COLS)).toEqual([4, 10, 16, 22, 28, 27]);
    expect(manhattanRun(0, 35, YARD_COLS)).toEqual([0, 6, 12, 18, 24, 30, 31, 32, 33, 34, 35]);
    // Every step is one row or one column of the 6x6 yard, in order, no repeats, and
    // the length is the Manhattan distance plus the starting tile.
    for (const pair of [
      [0, 35],
      [35, 0],
      [2, 27],
      [7, 30],
    ] as const) {
      const run = manhattanRun(pair[0], pair[1], YARD_COLS);
      expect(run[0]).toBe(pair[0]);
      expect(run[run.length - 1]).toBe(pair[1]);
      expect(new Set(run).size).toBe(run.length);
      for (let i = 1; i < run.length; i += 1) {
        const delta = (run[i] ?? 0) - (run[i - 1] ?? 0);
        expect([1, -1, YARD_COLS, -YARD_COLS]).toContain(delta);
        expect(run[i]).toBeGreaterThanOrEqual(0);
        expect(run[i]).toBeLessThan(YARD_TILES);
      }
      const rows = Math.abs(Math.floor(pair[1] / YARD_COLS) - Math.floor(pair[0] / YARD_COLS));
      const cols = Math.abs((pair[1] % YARD_COLS) - (pair[0] % YARD_COLS));
      expect(run.length).toBe(rows + cols + 1);
    }
    // `beltRun` reads those tiles from the live state: store = dock tile, machine = own.
    const state = twoSorters();
    expect(tileIndexOf(state, 0)).toBe(DOCK_TILE);
    expect(tileIndexOf(state, 1)).toBe(0);
    expect(tileIndexOf(state, 2)).toBe(35);
    expect(beltRun(state, 0, 1)).toEqual(manhattanRun(DOCK_TILE, 0, YARD_COLS));
    expect(beltRun(state, 1, 2)).toEqual(manhattanRun(0, 35, YARD_COLS));
  });

  it("reports the tile count on every auto-connect plan, so a price needs no second pass", () => {
    const state = createInitialState();
    state.tutorial = 9;
    state.store["scrap"] = 100;
    state.store["ferrous"] = 10;
    state.store["nonferrous"] = 1;
    state.storeUnits = 111;
    expect(send(state, { type: "machine.build", blueprint: "furnace", tile: 9 })).toBe(true);
    const plans = planConnections(state, 1);
    expect(plans.length).toBeGreaterThan(0);
    for (const plan of plans) {
      const tiles = manhattanRun(tileIndexOf(state, plan.from), tileIndexOf(state, plan.to), YARD_COLS).length;
      expect(plan.tiles).toBe(tiles);
      expect(beltCost(plan.tiles)).toBe(TUNING.beltCostPerTile * tiles);
    }
    expect(plans.map((plan) => plan.tiles)).toEqual([3, 3]);
    // Charging a plan's own count is exactly what the later connect charges.
    const before = scrapOf(state);
    for (const plan of plans) {
      send(state, { type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
    }
    expect(before - scrapOf(state)).toBe(plans.reduce((sum, plan) => sum + beltCost(plan.tiles), 0));
  });
});

describe("B-2 two deliberate layouts on the scored columns", () => {
  const lowerWins = ["inputStallPct", "starvedMax", "starvedMean", "powerLimitedRounds"];

  it("puts every layout in front on at least one column, per the pre-armed clause", () => {
    for (const pattern of ["irregular", "gap6"] as const) {
      const table = harnessJson.layouts.patterns[pattern];
      console.log(`B-2 ${pattern} leaders`, JSON.stringify(table.leaders));
      // Second, independent reading of the same per-column MMG rule, so a stored leader
      // has to survive a re-derivation: a named leader beats its best rival by the whole
      // gap (and the relative floor where one is defined), a tie or a short gap is null.
      const rows = table.rows as unknown as LayoutRow[];
      for (const column of Object.keys(table.leaders) as (keyof typeof harnessJson.layouts.mmg)[]) {
        const values = rows.map((row) => (row as unknown as Record<string, number>)[column] as number);
        const lowerIsBetter = lowerWins.includes(column);
        const best = lowerIsBetter ? Math.min(...values) : Math.max(...values);
        const owner = rows.find((row) => (row as unknown as Record<string, number>)[column] === best);
        const spec = harnessJson.layouts.mmg[column] as { absolute: number; relative?: number };
        let expected: string | null = null;
        if (owner && values.filter((value) => value === best).length === 1) {
          const rivals = values.filter((value) => value !== best);
          const rival = lowerIsBetter ? Math.min(...rivals) : Math.max(...rivals);
          const gap = lowerIsBetter ? rival - best : best - rival;
          const relative = rival === 0 ? (gap === 0 ? 0 : 1) : gap / rival;
          const clearsAbsolute = gap >= spec.absolute;
          const clearsRelative = spec.relative === undefined || relative >= spec.relative;
          if (clearsAbsolute && clearsRelative) expected = String(owner.name);
        }
        console.log(
          `B-2 ${pattern}/${column}`,
          "stored",
          JSON.stringify(table.leaders[column]),
          "re-derived",
          JSON.stringify(expected),
          "values",
          JSON.stringify(values)
        );
        expect(expected).toBe(table.leaders[column]);
      }
    }
    // Counted over both ladders, each layout is in front somewhere: that is the clause's
    // own test, so it did not fire and the price ships together with the two layouts.
    // gap6: spread owns `inputStallPct` (100.1 against 204), compact owns
    // `creditsPer1000Batches` (8 146.942 against 5 943.845); irregular adds one more
    // `creditsPer1000Batches` lead to compact. Every other column is a miss or a tie.
    expect(harnessJson.layouts.leads).toEqual({ compact: 2, spread: 1 });
    // The pre-armed clause did not fire, so the price change ships with the layouts.
    expect(harnessJson.layouts.dropClause).toEqual({
      armed: true,
      fired: false,
      reading: "each layout leads at least one scored column under the per-column MMG",
    });
  });

  it("reproduces both stored layout rows in-process, field for field", () => {
    for (const [pattern, ladder] of [
      ["irregular", "gap9"],
      ["gap6", "gap6"],
    ] as const) {
      const stored = harnessJson.layouts.patterns[pattern].rows;
      for (const name of ["compact", "spread"] as const) {
        const fresh = ladderRow(null, ladder, LAYOUTS[name]);
        const row = stored.find((each) => each.name === name);
        expect(row).toBeDefined();
        if (!row) continue;
        const { name: storedName, ...storedFields } = row as unknown as LayoutRow & { name: string };
        expect(storedName).toBe(name);
        expect(fresh).toEqual(storedFields);
      }
    }
  });

  it("prices more scrap in the spread yard than in the compact one", () => {
    for (const pattern of ["irregular", "gap6"] as const) {
      const rows = harnessJson.layouts.patterns[pattern].rows;
      const compact = rows.find((row) => row.name === "compact")!.beltScrap;
      const spread = rows.find((row) => row.name === "spread")!.beltScrap;
      console.log(`B-2 ${pattern} belt scrap compact ${compact} spread ${spread}`);
      expect(spread).toBeGreaterThan(compact);
      // Same link count in both, so the whole difference is tile extent.
      expect(rows.every((row) => row.links === 17)).toBe(true);
    }
  });
});

describe("B-3 an old save still runs on a priced model", () => {
  it("decodes the v1 fixture with no run, validates and re-encodes byte-identically", () => {
    const raw = fixtureRaw;
    const envelope = seedEnvelope;
    const decoded = decodeSave(raw);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.checksum).toBe("eede3c4f");
    expect(checksum(JSON.stringify(decoded.payload))).toBe("eede3c4f");
    expect(encodeSave(decoded.payload.sim, decoded.payload.lastSeenMs, decoded.payload.settings)).toBe(raw);
    expect(validateSim(decoded.payload.sim)).toBeNull();
    expect(decoded.payload.sim.routes).toHaveLength(18);
    for (const route of decoded.payload.sim.routes) {
      expect(route.run).toBeUndefined(); // the pre-price shape
      expect(route.latency).toBe(TUNING.routeLatencyTicks); // stored, not re-derived
    }
    expect(harnessJson.saves).toMatchObject({
      fixtureChecksum: "eede3c4f",
      schemaVersion: 1,
      decodeOk: true,
      validateSimNull: true,
      byteIdentical: true,
      routesWithRunUndefined: 18,
    });
  });

  it("replays a pre-price save to the same batch counts as the pre-change tree", () => {
    const runs = [0, 1].map(() => {
      const decoded = decodeSave(fixtureRaw);
      if (!decoded.ok) throw new Error("fixture refused: " + JSON.stringify(decoded));
      const sim = decoded.payload.sim;
      const atDecode = sim.machines.reduce((sum, m) => sum + m.batchesDone, 0);
      advance(sim, 3600); // one hour inside the 12 h catch-up window
      return {
        atDecode,
        tick: sim.tick,
        batches: sim.machines.reduce((sum, m) => sum + m.batchesDone, 0),
        links: sim.routes.length,
        hash: checksum(JSON.stringify(sim)),
      };
    });
    console.log("B-3 pre-price replay", JSON.stringify(runs[0]));
    // 1 902 / 18 298 / 18 links are the fixture's own pinned readings and the base
    // tree's replay numbers; the price cannot move them because no route has a run.
    expect(runs[0]).toEqual(runs[1]);
    expect(runs[0]!.atDecode).toBe(1902);
    expect(runs[0]!.tick).toBe(21898);
    expect(runs[0]!.links).toBe(18);
    expect(runs[0]!.hash).toBe("1493c153");
    expect(runs[0]!.batches).toBe(2356);
  });

  it("refuses a damaged run list instead of renumbering it", () => {
    const decoded = decodeSave(fixtureRaw);
    if (!decoded.ok) throw new Error("fixture refused");
    const sim = decoded.payload.sim;
    const first = sim.routes[0]!;
    expect(validateSim({ ...sim, routes: [{ ...first, run: [1, 2] }] })).toBeNull();
    expect(validateSim({ ...sim, routes: [{ ...first, run: "12" }] })).toBe(`routeRun:${first.id}`);
    expect(validateSim({ ...sim, routes: [{ ...first, run: [1, -2] }] })).toBe(`routeRun:${first.id}`);
    expect(validateSim({ ...sim, routes: [{ ...first, run: [1.5] }] })).toBe(`routeRun:${first.id}`);
  });
});

describe("B-4 the harness is reproducible", () => {
  it("prints one checksum for the stored body, twice read", () => {
    const hash = checksum(JSON.stringify(harnessJson));
    console.log("B-4 harness checksum", hash);
    expect(hash).toBe("52a20c95");
    expect(hash).toBe(checksum(JSON.stringify(harnessJson)));
    expect(harnessJson.generatedBy).toBe("scripts/probe-belt.mjs");
    expect(harnessJson.tuning).toEqual({
      beltCostPerTile: 1,
      beltLatencyPerTile: 2,
      movePenaltyPct: 50,
      dismantleRefundPct: 90,
    });
  });
});
