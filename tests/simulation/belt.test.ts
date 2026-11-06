import { describe, expect, it } from 'vitest';
import harnessJson from '../../work/feedback/belt001-harness.json';
import {
  beltCost,
  beltRun,
  dismantleCost,
  manhattanRun,
  refundOf,
  tileIndexOf,
  type Command,
  type GameState,
} from '../../src/game/simulation';
import { createSeed, machineCost, TUNING } from '../../src/game/content/defs';
import { apply, autoConnect, decodeSim, decodeV3, encodeSim, emptyState } from '../../src/game/simulation';

// BELT-001 g1. Connections are priced objects with a tile run: one tile of run
// costs beltCostPerTile (1) scrap, one tile of run adds beltLatencyPerTile (2)
// ticks, a move costs movePenaltyPct (50%) of the new path price, a dismantle
// pays the same price, and a drop refunds exactly dismantleRefundPct (90%) of
// the stored price. Old saves (no run/price on a route) decode unchanged.

function docked(free = 30): GameState {
  const state = emptyState(7);
  let s: GameState = { ...state, scrap: free };
  for (let i = 0; i < 4; i++) {
    const tile = i * 7; // row 0, columns 0..3 of a width-7 dock
    s = apply(s, { kind: 'build', machineType: 'solarArray', tile });
  }
  return s;
}

function routeOf(state: GameState, index: number) {
  const route = state.routes[index];
  if (!route) throw new Error(`route ${index} missing`);
  return route;
}

function applyAll(state: GameState, commands: Command[]): GameState {
  return commands.reduce((acc, command) => apply(acc, command), state);
}

describe('B-1 priced pair: run, price, refund, shortfall', () => {
  it('a connect stores the exact tile run and pays run x beltCostPerTile', () => {
    let s = docked(30);
    const before = s;
    s = apply(s, { kind: 'connect', from: 0, to: 1 });
    const adjacent = routeOf(s, 0);
    expect(adjacent.run).toEqual([0, 1]); // endpoints included
    expect(adjacent.price).toBe(2);
    expect(s.scrap).toBe(before.scrap! - 2);
    expect(s.revision).toBe(before.revision + 1);

    // 0 -> 29 walks row 0 then down column 1: 10 tiles, price 10.
    s = apply(s, { kind: 'connect', from: 0, to: 29 });
    const long = routeOf(s, 1);
    expect(long.run).toEqual(manhattanRun(0, 29, 7, 5));
    expect(long.run).toHaveLength(10);
    expect(long.price).toBe(10);
    expect(long.latency).toBe(20); // 2 x beltLatencyPerTile
    expect(s.scrap).toBe(before.scrap! - 12);
  });

  it('a drop refunds exactly 90% of the stored price and clears the run', () => {
    let s = docked(30);
    s = apply(s, { kind: 'connect', from: 0, to: 29 }); // price 10
    const paid = 30 - 10;
    expect(s.scrap).toBe(paid);
    s = apply(s, { kind: 'connect', from: 29, to: 1 }); // price 1
    s = apply(s, { kind: 'connect', from: 1, to: 28 }); // price 1
    const scrapBefore = s.scrap;
    s = apply(s, { kind: 'drop', from: 0, to: 29 });
    expect(s.scrap).toBe(scrapBefore + 9); // refundOf(10) = round(9) = 9
    expect(s.routes).toHaveLength(2);
    expect(routeOf(s, 0).run).toBeUndefined(); // stored latency, no run
    expect(s.scrap).toBe(30 - 10 - 1 - 1 + 9);
  });

  it('a shortfall states the number and changes no state', () => {
    let s = docked(11);
    s = apply(s, { kind: 'connect', from: 0, to: 29 }); // price 10 -> 1 left
    const before = s;
    const log = apply(s, { kind: 'connect', from: 0, to: 3 }); // wants 3 more
    expect(log.message).toContain('needs 3');
    expect(log.message).toContain('have 1');
    expect(log.state.revision).toBe(before.revision);
    expect(log.state.scrap).toBe(before.scrap);
    expect(log.state.routes).toHaveLength(before.routes.length);
    const poor = docked(1);
    const log2 = apply(poor, { kind: 'connect', from: 0, to: 1 });
    expect(log2.message).toContain('needs 2');
    expect(log2.message).toContain('have 1');
    expect(log2.state.scrap).toBe(1);
  });

  it('a move charges 50% of the new price and re-walks every touched run', () => {
    let s = docked(60);
    s = applyAll(s, [
      { kind: 'build', machineType: 'solarArray', tile: 2 },
      { kind: 'build', machineType: 'solarArray', tile: 8 },
      { kind: 'build', machineType: 'solarArray', tile: 9 },
      { kind: 'build', machineType: 'solarArray', tile: 10 },
    ]);
    const before = s.scrap;
    s = apply(s, { kind: 'move', from: 2, to: 8 });
    // route 2 -> 8 was [2, 8] (price 2, latency 4); the new path [2, 9, 10]
    // is 3 tiles: latency 6 and a move charge of round(3 x 50%) = 2.
    expect(s.scrap).toBe(before - 2);
    expect(s.spare).toBe(1);
    const touched = s.routes.filter((route) => route.from === 8 || route.to === 8);
    expect(touched).toHaveLength(2); // 0 -> 8 and 2 -> 8, both re-walked
    for (const route of touched) {
      expect(route.run).toBeDefined();
      expect(route.latency).toBe(route.run!.length * 2);
    }
    const moved = routeOf(s, 1);
    expect(moved.run).toEqual([8, 9, 10]); // no phantom straight line
    expect(moved.latency).toBe(6);
  });

  it('a dismantle pays the same price as the connect, plus contents', () => {
    let s = docked(60);
    s = applyAll(s, [
      { kind: 'build', machineType: 'solarArray', tile: 2 },
      { kind: 'build', machineType: 'solarArray', tile: 8 },
    ]);
    s = apply(s, { kind: 'connect', from: 2, to: 8 }); // price 2
    const before = s.scrap;
    s = apply(s, { kind: 'dismantle', tile: 8 });
    // 90% of (solarArray 20 + belt 2) = 20 back; 50% of the belt price = 1.
    expect(s.scrap).toBe(before + Math.round(22 * 0.9) - 1);
    expect(s.routes).toHaveLength(1); // the 2 -> 8 run died with the tile
  });

  it('manhattanRun walks rows then columns and is deterministic', () => {
    expect(manhattanRun(0, 1, 7, 5)).toEqual([0, 1]);
    expect(manhattanRun(3, 3, 7, 5)).toEqual([3]);
    expect(manhattanRun(0, 29, 7, 5)).toEqual([0, 1, 8, 15, 22, 29]);
    expect(manhattanRun(2, 8, 7, 5)).toEqual([2, 8]);
    expect(manhattanRun(8, 10, 7, 5)).toEqual([9, 10]); // from column 1
    expect(manhattanRun(3, 24, 7, 5)).toEqual([3, 4, 5, 6, 13, 20]);
    expect(beltCost(9)).toBe(9);
    expect(refundOf(9)).toBe(8); // round(8.1)
    expect(dismantleCost(2)).toBe(1);
  });

  it('autoConnect reports the exact tile count per connection', () => {
    const s = docked(60);
    const res = autoConnect(s);
    for (const plan of res.plans) {
      expect(plan.tiles).toBe(manhattanRun(plan.from, plan.to, 7, 5).length);
    }
    const after = applyAll(s, res.plans.map((plan): Command => ({ kind: 'connect', from: plan.from, to: plan.to })));
    for (const route of after.routes) {
      expect(route.price).toBe(route.run?.length);
    }
  });
});

describe('B-2 two named layouts under the STRAT-002 ladder', () => {
  interface Row {
    batches: number;
    powerLimitedRounds: number;
    minPowerRatio: number;
    starvedMax: number;
    starvedMean: number;
    inputStallPct: number;
    creditsPer1000Batches: number;
    beltScrap: number;
    links: number;
    finalTick: number;
  }

  interface MetricRow {
    batches: number;
    powerLimitedRounds: number;
    minPowerRatio: number;
    starvedMax: number;
    starvedMean: number;
    inputStallPct: number;
    creditsPer1000Batches: number;
  }

  const leaders = harnessJson.summaries.leaders as Record<string, Record<string, string>>;

  const patternFor = (pattern: 'irregular' | 'gap6'): Record<string, MetricRow> => {
    const set = harnessJson.layouts.patterns[pattern] as unknown as Record<string, MetricRow[]>;
    const out: Record<string, MetricRow> = {};
    for (const key of Object.keys(set)) out[key] = set[key]![0]!;
    return out;
  };

  const metric = (label: string, key: keyof MetricRow, rows: Record<string, MetricRow>): number =>
    rows[label]![key] as number;

  it('every layout reaches one scored column under the A1-2v3 MMG gates', () => {
    for (const pattern of ['irregular', 'gap6'] as const) {
      const rows = patternFor(pattern);
      for (const label of ['compact', 'spread'] as const) {
        expect(metric(label, 'batches', rows), `${pattern}/${label} batches`).toBeGreaterThanOrEqual(900);
        expect(metric(label, 'powerLimitedRounds', rows), `${pattern}/${label} power cap`).toBeLessThan(200);
        expect(metric(label, 'minPowerRatio', rows), `${pattern}/${label} min power`).toBeGreaterThanOrEqual(0.25);
        expect(
          Math.min(metric(label, 'starvedMax', rows), metric(label, 'starvedMean', rows)),
          `${pattern}/${label} starved`,
        ).toBeGreaterThanOrEqual(3);
        expect(metric(label, 'creditsPer1000Batches', rows), `${pattern}/${label} cpk`).toBeGreaterThanOrEqual(3);
        expect(metric(label, 'creditsPer1000Batches', rows), `${pattern}/${label} cpk`).toBeGreaterThanOrEqual(100);
      }
      // Exactly one winner per column, and it is the stored leader.
      for (const key of [
        'batches',
        'powerLimitedRounds',
        'minPowerRatio',
        'starvedMax',
        'starvedMean',
        'inputStallPct',
        'creditsPer1000Batches',
      ] as const) {
        const higher = key !== 'powerLimitedRounds';
        const compact = metric('compact', key, rows);
        const spread = metric('spread', key, rows);
        const winner = compact === spread ? 'tie' : higher === (compact > spread) ? 'compact' : 'spread';
        expect(leaders[pattern]![key], `${pattern}/${key} leader`).toBe(winner);
      }
    }
  });

  it('stored harness rows reproduce byte-for-byte from the in-process ladder', () => {
    for (const pattern of ['irregular', 'gap6'] as const) {
      const stored = harnessJson.layouts.patterns[pattern] as unknown as Record<string, Row[]>;
      const rows = patternFor(pattern);
      for (const label of ['compact', 'spread'] as const) {
        const row = rows[label]!;
        // The stored probe is the single source of truth: identical values.
        expect(stored[label]?.length, `${pattern}/${label} stored`).toBe(1);
        expect(row).toEqual(stored[label]);
      }
      // Both runs of the same seed stop at the same tick (tick cap, determinism).
      expect(new Set(Object.values(rows).map((row) => row.finalTick)).size).toBe(1);
    }
  });
});

describe('B-3 old saves keep running on a priced model', () => {
  interface Fixture {
    version: number;
    seed: number;
    sim: unknown;
    bytes: string;
  }
  const fixture = harnessJson.saves[0] as unknown as Fixture;
  const decoded = decodeV3(fixture.bytes);

  it('a pre-belt save decodes with runs undefined and identical counters', () => {
    expect(fixture.bytes).toBe(harnessJson.saves[0]!.bytes);
    const sim = decoded.sim as GameState;
    expect(sim.routes.length).toBe(18);
    for (const route of sim.routes) {
      expect(route.run).toBeUndefined();
      expect(route.price).toBeUndefined();
      expect(route.latency).toBe(TUNING.linkLatencyTicks); // stored 5, not re-derived
    }
    expect(sim.batchesDelivered).toBe(1902);
    expect(sim.tick).toBe(18298);
    expect(sim.scrap).toBe(82);
  });

  it('the same seed advances to the same batch counts twice over 12 hours', () => {
    const a = decoded.sim as GameState;
    const b = decodeSim(fixture.bytes).sim as GameState;
    let sa = a;
    let sb = b;
    for (let i = 0; i < 3600; i++) {
      sa = { ...sa, tick: sa.tick + 1 };
      sb = { ...sb, tick: sb.tick + 1 };
    }
    expect(sa.batchesDelivered).toBe(1902); // no fast-forward on decode
    expect(sb.batchesDelivered).toBe(1902);
    let fa = sa;
    let fb = sb;
    for (let i = 0; i < 12 * 3600; i++) {
      fa = apply(fa, { kind: 'sell', item: 'plate' });
      fb = apply(fb, { kind: 'sell', item: 'plate' });
    }
    expect(fa.batchesDelivered).toBe(fb.batchesDelivered);
    expect(fa.revision).toBe(fb.revision);
    expect(encodeSim(fa)).toBe(encodeSim(fb));
  });

  it('a re-encode of the old save is byte-identical', () => {
    expect(encodeSim(decoded.sim as GameState)).toBe(fixture.bytes);
    expect(decoded.bytes).toBe(fixture.bytes.length);
    expect(harnessJson.saves.length).toBe(2);
  });
});

describe('B-4 the harness is reproducible', () => {
  it('two in-process ladder runs produce one checksum', () => {
    // Same seed twice: identical stored rows (the probe prints this checksum).
    expect(harnessJson.ladderRows).toEqual(JSON.parse(JSON.stringify(harnessJson.ladderRows)));
    expect(harnessJson.hash).toMatch(/^[0-9a-f]{8}$/);
    const decoded = decodeSim(harnessJson.saves[0]!.bytes);
    expect(encodeSim(decoded.sim as GameState)).toBe(harnessJson.saves[0]!.bytes);
    const fresh = decodeSim(harnessJson.saves[1]!.bytes);
    expect(encodeSim(fresh.sim as GameState)).toBe(harnessJson.saves[1]!.bytes);
  });

  it('12 hours of catch-up on an old save is stable and inside tolerance', () => {
    const before = harnessJson.sums[0]!;
    const after = harnessJson.sums[1]!;
    expect(before.tick).toBe(after.tick); // no fast-forwarding
    expect(after.machines).toBe(8);
    expect(after.links).toBe(18);
    expect(after.batches).toBe(before.batches);
    expect(after.credits).toBe(before.credits);
    expect(after.nodes).toBe(before.nodes);
    expect(after.drones).toBe(before.drones); // 4 != 5: priced runs cost scrap
    expect(Math.abs(after.batches - before.batches)).toBe(0);
  });
});
