/**
 * Store-level TrafficApi contract (issue #141, RW3D T14). Mirrors the #140
 * store logistics harness (tests/simulation/reservations.test.ts):
 *  - writer-gating: every traffic mutation is refused for a reader tab;
 *  - opt-in: enableTraffic is idempotent and default OFF (legacy tick path);
 *  - session-only (G1): traffic mutations never touch SAVE_KEY or the export,
 *    and a fresh store over the same storage starts with traffic disabled;
 *  - config setters validate (false on invalid input, no mutation);
 *  - default-off step() reproduces the enabled default-profile ledger
 *    tick-for-tick (#140 parity through the real store tick path).
 * Roads/buildings are placed explicitly on the start parcel; all arrival
 * ticks are hand-derived (speed 2 over a five-cell straight corridor).
 */
import { describe, expect, it } from "vitest";
import { SAVE_KEY } from "../../src/game/persistence/save";
import { logisticsFingerprint, logisticsTotals, type LogisticsJobRequest } from "../../src/game/simulation/logistics";
import { trafficFingerprint } from "../../src/game/simulation/traffic";
import type { Cell } from "../../src/game/world/types";
import { createStore } from "../../src/app/store";

const c = (x: number, y: number): Cell => ({ x, y });

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

function request(id: string, amount: number): LogisticsJobRequest {
  return { id, sourceBuildingId: 1, destBuildingId: 2, cargoType: "scrap", amount };
}

/** Five-cell straight corridor (8,12)..(12,12) with sites at both ends. */
function setupYard(store: ReturnType<typeof createStore>) {
  const road = store.commitRoad({
    id: "road-1",
    type: "road.place",
    cells: [c(8, 12), c(9, 12), c(10, 12), c(11, 12), c(12, 12)],
  });
  expect(road.result.ok).toBe(true);
  expect(store.registerLogisticsBuilding({ id: 1, cell: c(8, 12), capacity: 20 })).toBe(true);
  expect(store.registerLogisticsBuilding({ id: 2, cell: c(12, 12), capacity: 20 })).toBe(true);
  expect(store.seedLogisticsStock(1, "scrap", 10)).toBe(true);
  const carrier = store.registerLogisticsCarrier({ capacity: 12, cell: c(8, 12) });
  expect(carrier).not.toBeNull();
  expect(store.createLogisticsJob(request("job-1", 7)).ok).toBe(true);
  return carrier!;
}

describe("store TrafficApi (session-only, writer-gated, opt-in)", () => {
  it("writer opts in idempotently; setters validate; step() runs the traffic model; saves untouched", () => {
    const storage = memoryStorage();
    const store = createStore({ storage, now: () => 10, leaseId: "tab-a" });
    expect(store.getRole()).toBe("writer");
    const carrier = setupYard(store);

    // Opt-in default: OFF, so the legacy tick path is the default behavior.
    expect(store.isTrafficEnabled()).toBe(false);
    const saveBefore = storage.getItem(SAVE_KEY);
    const exportBefore = store.exportSave();
    const trafficBefore = trafficFingerprint(store.getTraffic());

    // Invalid config is refused with no mutation (validation lives in the authority).
    expect(store.setTrafficDefaultTruck({ speed: 0 })).toBe(false);
    expect(store.setTrafficDefaultTruck({ loadTicks: -1 })).toBe(false);
    expect(store.configureTrafficTruck(0, { speed: 2 })).toBe(false);
    expect(store.setTrafficBayCapacity(c(12, 12), 0)).toBe(false);
    expect(store.setTrafficJunctionCapacity(0)).toBe(false);
    expect(store.setTrafficJunctionCost(-1)).toBe(false);
    expect(store.setTrafficRetryPolicy({ baseBackoff: 2, maxBackoff: 1 })).toBe(false);
    expect(trafficFingerprint(store.getTraffic())).toBe(trafficBefore);

    // Valid config shapes future ticks; reads are pure and reflect the authority.
    expect(store.setTrafficDefaultTruck({ speed: 2 })).toBe(true);
    expect(store.configureTrafficTruck(carrier.id, { speed: 2 })).toBe(true);
    expect(store.setTrafficBayCapacity(c(12, 12), 1)).toBe(true);
    expect(store.setTrafficJunctionCapacity(2)).toBe(true);
    expect(store.setTrafficJunctionCost(1)).toBe(true);
    expect(store.setTrafficRetryPolicy({ maxRetries: 3, baseBackoff: 2, maxBackoff: 8 })).toBe(true);
    const t = store.getTraffic();
    expect(t.defaultTruck).toEqual({ speed: 2, loadTicks: 0, unloadTicks: 0 });
    expect(t.trucks[carrier.id].config.speed).toBe(2);
    expect(t.bayCapacity["12,12"]).toBe(1);
    expect(t.junctionCapacity).toBe(2);
    expect(t.junctionCost).toBe(1);
    expect(t.maxRetries).toBe(3);

    // enableTraffic is writer-only and idempotent.
    expect(store.enableTraffic()).toBe(true);
    expect(store.enableTraffic()).toBe(true);
    expect(store.isTrafficEnabled()).toBe(true);

    // Session-only (G1): none of the above touched SAVE_KEY or the export.
    expect(storage.getItem(SAVE_KEY)).toBe(saveBefore);
    expect(store.exportSave()).toBe(exportBefore);

    // Hand-derived with speed 2, zero load/unload, straight corridor (no
    // junctions): dispatch 1, load 2, two 2-cell moves 3-4, complete tick 4.
    store.step(1);
    expect(store.getLogisticsJobs()[0].status).toBe("active");
    store.step(3);
    const j = store.getLogisticsJobs()[0];
    expect(store.getLogistics().tick).toBe(4);
    expect(j.status).toBe("complete");
    expect(j.delivered).toBe(7);
    expect(store.getLogisticsReservations()).toHaveLength(0);
    expect(logisticsTotals(store.getLogistics())).toEqual({ scrap: 10 });
    expect(store.getTraffic().bayLeases).toHaveLength(0); // released on terminal path
    expect(store.getTraffic().tick).toBe(4);

    // A fresh store over the same storage starts with traffic disabled and
    // empty: nothing about the traffic authority was persisted.
    const fresh = createStore({ storage, now: () => 10, leaseId: "tab-c" });
    expect(fresh.isTrafficEnabled()).toBe(false);
    expect(fresh.getTraffic().tick).toBe(0);
    expect(fresh.getTraffic().trucks).toEqual({});
    expect(fresh.getTraffic().bayLeases).toHaveLength(0);
  });

  it("reader tabs are refused every traffic mutation and never mirror session traffic", () => {
    const storage = memoryStorage();
    const writer = createStore({ storage, now: () => 10, leaseId: "tab-a" });
    setupYard(writer);
    expect(writer.enableTraffic()).toBe(true);
    expect(writer.setTrafficDefaultTruck({ speed: 2 })).toBe(true);
    writer.step(4); // complete under the traffic model
    expect(writer.getLogisticsJobs()[0].status).toBe("complete");

    const reader = createStore({ storage, now: () => 10, leaseId: "tab-b" });
    expect(reader.getRole()).toBe("reader");
    // Session-only: the reader starts disabled and empty even after reconcile.
    expect(reader.isTrafficEnabled()).toBe(false);
    expect(reader.getTraffic().tick).toBe(0);
    expect(reader.getTraffic().trucks).toEqual({});
    const readerBefore = trafficFingerprint(reader.getTraffic());

    expect(reader.enableTraffic()).toBe(false);
    expect(reader.setTrafficDefaultTruck({ speed: 3 })).toBe(false);
    expect(reader.configureTrafficTruck(1, { speed: 3 })).toBe(false);
    expect(reader.setTrafficBayCapacity(c(12, 12), 1)).toBe(false);
    expect(reader.setTrafficJunctionCapacity(1)).toBe(false);
    expect(reader.setTrafficJunctionCost(1)).toBe(false);
    expect(reader.setTrafficRetryPolicy({ maxRetries: 1 })).toBe(false);
    expect(reader.isTrafficEnabled()).toBe(false);
    expect(trafficFingerprint(reader.getTraffic())).toBe(readerBefore);

    // The writer's session traffic is untouched by the reader's attempts.
    expect(writer.isTrafficEnabled()).toBe(true);
    expect(writer.getTraffic().defaultTruck.speed).toBe(2);
    expect(writer.getLogisticsJobs()[0].delivered).toBe(7);
  });

  it("default-off step() reproduces the enabled default-profile ledger tick-for-tick (#140 parity)", () => {
    const legacy = createStore({ storage: memoryStorage(), now: () => 10, leaseId: "tab-a" });
    const enabled = createStore({ storage: memoryStorage(), now: () => 10, leaseId: "tab-a" });
    setupYard(legacy);
    setupYard(enabled);
    expect(legacy.isTrafficEnabled()).toBe(false);
    expect(enabled.enableTraffic()).toBe(true); // default profile: speed 1, zero durations
    for (let t = 0; t < 10; t += 1) {
      legacy.step(1);
      enabled.step(1);
      expect(logisticsFingerprint(enabled.getLogistics())).toBe(logisticsFingerprint(legacy.getLogistics()));
    }
    // Hand-derived legacy schedule: dispatch 1, load 2, four moves, complete 6.
    expect(legacy.getLogistics().tick).toBe(10);
    expect(legacy.getLogisticsJobs()[0].status).toBe("complete");
    expect(legacy.getLogisticsJobs()[0].delivered).toBe(7);
    expect(enabled.getLogisticsJobs()[0].status).toBe("complete");
    expect(enabled.getTraffic().tick).toBe(10); // traffic clock rode the same budget
    expect(legacy.getTraffic().tick).toBe(0); // legacy path never touches traffic
    expect(enabled.getTraffic().bayLeases).toHaveLength(0);
  });
});
