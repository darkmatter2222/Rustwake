/**
 * T21 (#148): duplicate command ids charge/grant exactly once (E02).
 *
 * tests/ui/onboard-64-command-id.test.tsx already proves the reload-epoch fix and
 * the build round-trip dedup through the real App. This file closes the remaining
 * settlement surface at the simulation and store layers: every charging/granting
 * command (build, upgrade, contract export/sell, research, fleet, belts, salvage,
 * repair, dismantle) must execute once for a repeated id — including rapid double
 * presses back-to-back and retries across a save round-trip — while a DIFFERENT id
 * with the same payload is a new command (dedup is by id, never by content).
 *
 * Import settlement once-only is proven in tests/persistence/transfer.test.ts and
 * tests/persistence/migration-148.test.ts (identical envelope twice -> identical
 * snapshot). "Raid settlement" has no command yet (P3/G3 combat); the current
 * settlement surface is the contract commands below plus engine drone deliveries,
 * whose once-only settlement across tick/event paths is proven by
 * tests/simulation/offline-equivalence-148.test.ts (E07).
 *
 * Non-vision: numeric/state assertions only.
 */
import { describe, expect, it } from "vitest";
import { applyCommand, type Command, type CommandBody } from "../../src/game/simulation/commands";
import { createInitialState, type SimState } from "../../src/game/simulation/types";
import { decodeSave, encodeSave, DEFAULT_SETTINGS, SAVE_KEY } from "../../src/game/persistence/save";
import { createStore } from "../../src/app/store";

const clone = (s: SimState): SimState => JSON.parse(JSON.stringify(s)) as SimState;

/**
 * The retuned #214 seed (scrap 120 / ferrous 12 / steel 12, credits 60) plus
 * documented test funding so every settlement under test is affordable:
 * +20 data (research), credits raised to 500 (upgrades/fleet).
 */
function fundedYard(): SimState {
  const s = createInitialState();
  s.store.data = 20;
  s.storeUnits += 20;
  s.credits = 500;
  return s;
}

let seq = 0;
function send(s: SimState, body: CommandBody, id?: string) {
  seq += 1;
  return applyCommand(s, { ...body, id: id ?? `e02-${seq}` } as Command);
}

/**
 * The core E02 invariant: first dispatch executes, an immediate same-id retry
 * returns the FIRST result and leaves the ENTIRE state byte-identical.
 */
function provesOnceOnly(s: SimState, body: CommandBody, verify: (after: SimState) => void): SimState {
  const id = `dup-${seq + 1}`;
  const first = send(s, body, id);
  expect(first.ok).toBe(true);
  if (!first.ok) throw new Error(first.reason);
  verify(s);
  const snapshot = clone(s);
  // Rapid double press: the exact same id again, immediately.
  const retry = send(s, body, id);
  expect(retry).toEqual(first);
  expect(s).toEqual(snapshot);
  expect(s.seenCommands[id]).toBe(first.revision);
  expect(Object.keys(s.seenCommands).filter((k) => k === id)).toHaveLength(1);
  return s;
}

describe("E02: duplicate command ids settle once (#148)", () => {
  it("machine.build charges the build cost once", () => {
    const s = fundedYard();
    provesOnceOnly(s, { type: "machine.build", blueprint: "sorter", tile: 8 }, (after) => {
      expect(after.machines).toHaveLength(1);
      expect(after.store.scrap).toBe(90); // 120 - 30
      expect(after.store.steel).toBe(8); // 12 - 4
    });
    // A different id is a new command: dedup is by id, not by payload.
    const second = send(s, { type: "machine.build", blueprint: "sorter", tile: 9 });
    expect(second.ok).toBe(true);
    expect(s.machines).toHaveLength(2);
    expect(s.store.scrap).toBe(60);
  });

  it("machine.upgrade charges the plan price once", () => {
    const s = fundedYard();
    expect(send(s, { type: "machine.build", blueprint: "sorter", tile: 8 }).ok).toBe(true);
    const creditsBefore = s.credits;
    provesOnceOnly(s, { type: "machine.upgrade", machineId: 1, branch: "speed" }, (after) => {
      expect(after.machines[0].level).toBe(2);
      expect(after.machines[0].branch).toEqual(["speed"]);
      expect(after.credits).toBeLessThan(creditsBefore);
    });
  });

  it("contract.export grants the contract reward once (settlement)", () => {
    const s = fundedYard();
    provesOnceOnly(s, { type: "contract.export" }, (after) => {
      expect(after.exportClaimed).toBe(true);
      expect(after.store.steel).toBe(2); // 12 - 10
      expect(after.credits).toBe(550); // 500 + 50
    });
    // Even a brand-new id cannot claim a second time: the contract is claimed.
    const again = send(s, { type: "contract.export" });
    expect(again.ok).toBe(false);
    expect(s.credits).toBe(550);
  });

  it("contract.sell grants the sale proceeds once (settlement)", () => {
    const s = fundedYard();
    expect(send(s, { type: "contract.export" }).ok).toBe(true);
    const creditsBefore = s.credits;
    const scrapBefore = s.store.scrap ?? 0;
    provesOnceOnly(s, { type: "contract.sell", resource: "scrap", qty: 5 }, (after) => {
      expect(after.credits).toBe(creditsBefore + 5); // scrap price 1 x 5
      expect(after.store.scrap).toBe(scrapBefore - 5);
    });
    // A different id sells again (above the reserve floor): not content-deduped.
    const second = send(s, { type: "contract.sell", resource: "scrap", qty: 5 });
    expect(second.ok).toBe(true);
    expect(s.credits).toBe(creditsBefore + 10);
  });

  it("research.buy spends data once and never double-applies the rank", () => {
    const s = fundedYard();
    provesOnceOnly(s, { type: "research.buy", node: "cutters" }, (after) => {
      expect(after.research.cutters).toBe(1);
      expect(after.store.data).toBe(16); // 20 - 4
    });
    // A new id at max rank refuses without touching anything.
    const before = clone(s);
    const again = send(s, { type: "research.buy", node: "cutters" });
    expect(again).toEqual({ ok: false, reason: "already-known" });
    expect(s).toEqual(before);
  });

  it("drone.add charges the fleet price once", () => {
    const s = fundedYard();
    expect(send(s, { type: "drone.repair" }).ok).toBe(true);
    const creditsBefore = s.credits;
    provesOnceOnly(s, { type: "drone.add" }, (after) => {
      expect(after.spares).toHaveLength(1);
      expect(after.credits).toBe(creditsBefore - 45); // droneAddBaseCost
    });
  });

  it("route.connect charges the belt price once", () => {
    const s = fundedYard();
    expect(send(s, { type: "machine.build", blueprint: "sorter", tile: 8 }).ok).toBe(true);
    const scrapBefore = s.store.scrap ?? 0;
    provesOnceOnly(s, { type: "route.connect", from: 0, to: 1, filter: "scrap" }, (after) => {
      expect(after.routes).toHaveLength(1);
      expect(after.store.scrap).toBeLessThan(scrapBefore); // priced tile run
    });
  });

  it("manual.salvage grants one pulse per id", () => {
    const s = fundedYard();
    provesOnceOnly(s, { type: "manual.salvage" }, (after) => {
      expect(after.wreck.pulses).toBe(1);
      expect(after.store.scrap).toBe(122); // 120 + 2
    });
  });

  it("drone.repair charges the repair cost once", () => {
    const s = fundedYard();
    provesOnceOnly(s, { type: "drone.repair" }, (after) => {
      expect(after.drone.repaired).toBe(true);
      expect(after.store.scrap).toBe(90); // 120 - 30
    });
  });

  it("machine.dismantle refunds once", () => {
    const s = fundedYard();
    expect(send(s, { type: "machine.build", blueprint: "sorter", tile: 8 }).ok).toBe(true);
    const scrapBefore = s.store.scrap ?? 0;
    provesOnceOnly(s, { type: "machine.dismantle", machineId: 1 }, (after) => {
      expect(after.machines).toHaveLength(0);
      expect(after.store.scrap).toBeGreaterThan(scrapBefore); // 90% refund
    });
  });

  it("keeps settlement once-only across a save round-trip", () => {
    const s = fundedYard();
    // +12 steel so the sorter build (4) AND the export contract (10) are both
    // affordable in one session; the shared fundedYard pins the #214 seed steel.
    s.store.steel = (s.store.steel ?? 0) + 12;
    s.storeUnits += 12;
    const build: Command = { id: "reload-build", type: "machine.build", blueprint: "sorter", tile: 8 };
    const exportCmd: Command = { id: "reload-export", type: "contract.export" };
    expect(applyCommand(s, build).ok).toBe(true);
    expect(applyCommand(s, exportCmd).ok).toBe(true);
    const decoded = decodeSave(encodeSave(s, 1_000_000, { ...DEFAULT_SETTINGS }));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const reloaded = decoded.payload.sim;
    const snapshot = clone(reloaded);
    // Both persisted ids retry to their first results after the reload.
    expect(applyCommand(reloaded, build)).toEqual({ ok: true, revision: 1 });
    expect(applyCommand(reloaded, exportCmd)).toEqual({ ok: true, revision: 2 });
    expect(reloaded).toEqual(snapshot);
    expect(reloaded.credits).toBe(550);
    expect(reloaded.store.steel).toBe(10); // 24 - 4 (build) - 10 (export)
  });
});

describe("E02: rapid double presses through the real store dispatch (#148)", () => {
  function memoryStorage() {
    const map = new Map<string, string>();
    return {
      getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
      removeItem: (key: string) => {
        map.delete(key);
      },
      raw: map,
    };
  }

  it("builds once and exports once when the same id is dispatched twice", () => {
    const storage = memoryStorage();
    const yard = fundedYard();
    // +12 steel so the build (4) and the export contract (10) are both affordable.
    yard.store.steel = (yard.store.steel ?? 0) + 12;
    yard.storeUnits += 12;
    storage.setItem(SAVE_KEY, encodeSave(yard, 1_000_000, { ...DEFAULT_SETTINGS }));
    const store = createStore({ storage, now: () => 1_000_000, leaseId: "tab-a" });
    const build: Command = { id: "press-1", type: "machine.build", blueprint: "sorter", tile: 8 };
    const first = store.dispatch(build);
    expect(first.ok).toBe(true);
    const second = store.dispatch(build); // the double press
    expect(second).toEqual(first);
    expect(store.getState().machines).toHaveLength(1);
    expect(store.getState().store.scrap).toBe(90);

    const exportCmd: Command = { id: "press-2", type: "contract.export" };
    const e1 = store.dispatch(exportCmd);
    expect(e1.ok).toBe(true);
    const e2 = store.dispatch(exportCmd);
    expect(e2).toEqual(e1);
    expect(store.getState().credits).toBe(550); // granted once, not twice
    expect(store.getState().exportClaimed).toBe(true);
    store.stop();
  });
});
