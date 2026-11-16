/**
 * RW3D #147 (T20): shared fixtures for the road fleet / routes tests.
 *
 * The double below is a FAITHFUL stand-in for the store's additive
 * LogisticsApi & TrafficApi & RoadApi capability: every mutation delegates to
 * the REAL engine (logistics.ts / traffic.ts) and is writer-gated exactly like
 * `createStore`, so the panels are exercised against genuine validation and
 * projection — not a hand-waved mock. Reads return the live session slices.
 *
 * SOCKETS are a documented READ-ONLY projection double: `getRoadSockets()`
 * returns the `RoadSocketLink[]` handed in at construction. The bay-approach
 * DERIVATION is independently covered by tests/game/roadSockets.test.ts (hand-
 * derived from kit geometry), so here we only feed already-derived links to
 * exercise the bay editor's consumption of them (issue #217: production sockets
 * stay empty until the #148 cutover; the empty-state path is tested separately).
 *
 * Nothing here touches SAVE_KEY, migration or recovery — session-only (#148).
 */
import {
  createLogistics,
  registerBuilding,
  registerCarrier,
  seedStock,
  createJob,
  cancelJob,
  type CargoJob,
  type LogisticsState,
} from "../../src/game/simulation/logistics";
import {
  createTraffic,
  ensureTruck,
  setDefaultTruck,
  configureTruck,
  setBayCapacity,
  setJunctionCapacity,
  setJunctionCost,
  setRetryPolicy,
  type TrafficState,
  type TruckRuntime,
} from "../../src/game/simulation/traffic";
import { createRoadNetwork, type RoadNetworkState } from "../../src/game/world/roadGraph";
import type { RoadSocketLink } from "../../src/game/world/roadSockets";
import type { RoadLogisticsApi } from "../../src/ui/logistics/fleetModel";
import type { StoreRole } from "../../src/app/store";
import type { Cell } from "../../src/game/world/types";

export const c = (x: number, y: number): Cell => ({ x, y });

export interface RoadDouble {
  readonly api: RoadLogisticsApi;
  readonly logistics: LogisticsState;
  readonly traffic: TrafficState;
  readonly net: RoadNetworkState;
  readonly sockets: RoadSocketLink[];
  setRole(role: StoreRole): void;
  notify(): void;
}

export function makeRoadDouble(
  opts: { role?: StoreRole; sockets?: RoadSocketLink[] } = {},
): RoadDouble {
  const logistics = createLogistics();
  const traffic = createTraffic();
  const net = createRoadNetwork();
  const sockets = opts.sockets ?? [];
  let role: StoreRole = opts.role ?? "writer";
  let trafficEnabled = false;
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  const writer = (): boolean => role === "writer";

  const api: RoadLogisticsApi = {
    getRole: () => role,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getLogistics: () => logistics,
    getLogisticsJobs: () => logistics.jobs,
    createLogisticsJob(request) {
      if (!writer()) return { ok: false, reason: { reason: "read-only" } };
      const result = createJob(logistics, request);
      if (result.ok) notify();
      return result;
    },
    cancelLogisticsJob(jobId) {
      if (!writer()) return { ok: false, reason: { reason: "read-only" } };
      const result = cancelJob(logistics, net, jobId);
      if (result.ok) notify();
      return result;
    },
    registerLogisticsBuilding(site) {
      if (!writer()) return false;
      const ok = registerBuilding(logistics, site);
      if (ok) notify();
      return ok;
    },
    registerLogisticsCarrier(request) {
      if (!writer()) return null;
      const carrier = registerCarrier(logistics, request);
      if (carrier !== null) notify();
      return carrier;
    },
    getTraffic: () => traffic,
    isTrafficEnabled: () => trafficEnabled,
    enableTraffic() {
      if (!writer()) return false;
      trafficEnabled = true;
      notify();
      return true;
    },
    setTrafficDefaultTruck(config) {
      if (!writer()) return false;
      const ok = setDefaultTruck(traffic, config);
      if (ok) notify();
      return ok;
    },
    configureTrafficTruck(carrierId, config) {
      if (!writer()) return false;
      const ok = configureTruck(traffic, carrierId, config);
      if (ok) notify();
      return ok;
    },
    setTrafficBayCapacity(cell, capacity) {
      if (!writer()) return false;
      const ok = setBayCapacity(traffic, cell, capacity);
      if (ok) notify();
      return ok;
    },
    setTrafficJunctionCapacity(capacity) {
      if (!writer()) return false;
      const ok = setJunctionCapacity(traffic, capacity);
      if (ok) notify();
      return ok;
    },
    setTrafficJunctionCost(cost) {
      if (!writer()) return false;
      const ok = setJunctionCost(traffic, cost);
      if (ok) notify();
      return ok;
    },
    setTrafficRetryPolicy(policy) {
      if (!writer()) return false;
      const ok = setRetryPolicy(traffic, policy);
      if (ok) notify();
      return ok;
    },
    getRoadSockets: () => sockets,
  };

  return {
    api,
    logistics,
    traffic,
    net,
    sockets,
    setRole(next) {
      role = next;
      notify();
    },
    notify,
  };
}

/** Register two approach cells and seed source stock — a minimal dispatchable yard. */
export function seedYard(
  double: RoadDouble,
  opts: { sourceStock?: number; destCapacity?: number } = {},
): { sourceId: number; destId: number } {
  const sourceId = 1;
  const destId = 2;
  registerBuilding(double.logistics, { id: sourceId, cell: c(0, 0), capacity: 100 });
  registerBuilding(double.logistics, { id: destId, cell: c(5, 0), capacity: opts.destCapacity ?? 100 });
  seedStock(double.logistics, sourceId, "scrap", opts.sourceStock ?? 50);
  return { sourceId, destId };
}

/**
 * A full CargoJob fixture for projection/render tests. Defaults describe a
 * pending, unassigned scrap job; callers override the fields under test. The
 * engine produces these shapes (covered by tests/game); here we feed them
 * straight to the read model so each TYPED hold can be asserted in isolation.
 */
export function fixtureJob(overrides: Partial<CargoJob> = {}): CargoJob {
  return {
    id: 1,
    commandId: "fixture-1",
    sourceBuildingId: 1,
    destBuildingId: 2,
    sourceCell: c(0, 0),
    destCell: c(5, 0),
    carrierId: null,
    cargoType: "scrap",
    amount: 10,
    atSource: 10,
    inTransit: 0,
    delivered: 0,
    returned: 0,
    status: "pending",
    phase: "waiting",
    priority: 0,
    createdTick: 0,
    reservedAt: 0,
    path: null,
    progress: 0,
    pathRevision: 0,
    legFrom: c(0, 0),
    heldReason: null,
    lastAttemptRevision: -1,
    routeCache: null,
    ...overrides,
  };
}

/** A real engine TruckRuntime for a carrier, with optional hold/retry overrides. */
export function fixtureRuntime(
  traffic: TrafficState,
  carrierId: number,
  overrides: Partial<TruckRuntime> = {},
): TruckRuntime {
  const runtime = ensureTruck(traffic, carrierId);
  Object.assign(runtime, overrides);
  return runtime;
}

/** A read-only socket link fixture (derivation covered by roadSockets.test.ts). */
export function fixtureSocket(
  overrides: Partial<RoadSocketLink> & { buildingId: number; socket: string; approach: Cell },
): RoadSocketLink {
  return {
    asset: "warehouse",
    kind: "truck",
    connected: false,
    ...overrides,
  };
}