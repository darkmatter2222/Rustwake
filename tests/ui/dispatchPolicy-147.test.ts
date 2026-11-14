/**
 * RW3D #147 (T20): the session-only dispatch policy bridge + writer-gated
 * traffic configuration.
 *
 * Acceptance: material filters, reserve floors and minimum fill gate JOB
 * CREATION only (the engine still validates stock/room afterwards); default
 * truck vs per-truck config; capacity writes are writer-gated and integer-
 * validated by the traffic authority. The module store keeps a stable snapshot
 * (useSyncExternalStore-safe) and resets to permissive defaults between cases.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  ALL_RESOURCES,
  DEFAULT_DISPATCH_POLICY,
  checkDispatchPolicy,
  getDispatchPolicy,
  policyRejectionText,
  resetDispatchPolicy,
  setDispatchPolicy,
  setMinFill,
  setReserveFloor,
  subscribeDispatchPolicy,
  togglePolicyResource,
} from "../../src/ui/logistics/dispatchPolicy";
import { c, makeRoadDouble, seedYard } from "./road-147.helpers";

beforeEach(() => resetDispatchPolicy());
afterEach(() => resetDispatchPolicy());

describe("checkDispatchPolicy", () => {
  it("is permissive by default (all materials, floor 0, min fill 1)", () => {
    const double = makeRoadDouble();
    seedYard(double, { sourceStock: 50 });
    expect(DEFAULT_DISPATCH_POLICY).toEqual({ allowedResources: null, reserveFloor: 0, minFill: 1 });
    expect(
      checkDispatchPolicy(getDispatchPolicy(), { sourceBuildingId: 1, cargoType: "scrap", amount: 1 }, double.logistics),
    ).toBeNull();
  });

  it("rejects a filtered material before any stock check", () => {
    const double = makeRoadDouble();
    seedYard(double, { sourceStock: 50 });
    setDispatchPolicy({ allowedResources: ["copper"], reserveFloor: 0, minFill: 1 });
    const rejection = checkDispatchPolicy(
      getDispatchPolicy(),
      { sourceBuildingId: 1, cargoType: "scrap", amount: 1 },
      double.logistics,
    );
    expect(rejection).toEqual({ reason: "material-filtered", resource: "scrap" });
    expect(policyRejectionText(rejection!)).toMatch(/scrap is filtered out/);
  });

  it("rejects below minimum fill", () => {
    const double = makeRoadDouble();
    seedYard(double, { sourceStock: 50 });
    setMinFill(5);
    const rejection = checkDispatchPolicy(
      getDispatchPolicy(),
      { sourceBuildingId: 1, cargoType: "scrap", amount: 3 },
      double.logistics,
    );
    expect(rejection).toEqual({ reason: "below-min-fill", amount: 3, minFill: 5 });
    expect(policyRejectionText(rejection!)).toMatch(/Minimum fill is 5; 3 is too small/);
  });

  it("enforces the reserve floor against free source stock", () => {
    const double = makeRoadDouble();
    seedYard(double, { sourceStock: 10 });
    setReserveFloor(5);
    // 10 free - 6 moved = 4 < floor 5 -> rejected.
    const rejected = checkDispatchPolicy(
      getDispatchPolicy(),
      { sourceBuildingId: 1, cargoType: "scrap", amount: 6 },
      double.logistics,
    );
    expect(rejected).toEqual({ reason: "reserve-floor", resource: "scrap", free: 10, floor: 5, amount: 6 });
    expect(policyRejectionText(rejected!)).toMatch(/Reserve floor keeps 5 scrap/);
    // 10 - 5 = 5 == floor -> allowed.
    expect(
      checkDispatchPolicy(getDispatchPolicy(), { sourceBuildingId: 1, cargoType: "scrap", amount: 5 }, double.logistics),
    ).toBeNull();
  });

  it("checks material filter before minimum fill (precedence)", () => {
    const double = makeRoadDouble();
    seedYard(double);
    setDispatchPolicy({ allowedResources: ["copper"], reserveFloor: 0, minFill: 10 });
    const rejection = checkDispatchPolicy(
      getDispatchPolicy(),
      { sourceBuildingId: 1, cargoType: "scrap", amount: 1 },
      double.logistics,
    );
    expect(rejection?.reason).toBe("material-filtered");
  });
});

describe("policy module store", () => {
  it("keeps a stable snapshot reference between no-op publishes", () => {
    const before = getDispatchPolicy();
    setReserveFloor(0); // already 0 -> no publish
    expect(getDispatchPolicy()).toBe(before);
    setMinFill(1); // already 1 -> no publish
    expect(getDispatchPolicy()).toBe(before);
  });

  it("notifies subscribers on change and stops after unsubscribe", () => {
    let calls = 0;
    const unsubscribe = subscribeDispatchPolicy(() => {
      calls += 1;
    });
    setReserveFloor(3);
    expect(calls).toBe(1);
    expect(getDispatchPolicy().reserveFloor).toBe(3);
    unsubscribe();
    setReserveFloor(4);
    expect(calls).toBe(1);
  });

  it("togglePolicyResource narrows from all, then restores null when full again", () => {
    expect(getDispatchPolicy().allowedResources).toBeNull();
    togglePolicyResource("scrap");
    const narrowed = getDispatchPolicy().allowedResources!;
    expect(narrowed).toHaveLength(ALL_RESOURCES.length - 1);
    expect(narrowed).not.toContain("scrap");
    togglePolicyResource("scrap");
    expect(getDispatchPolicy().allowedResources).toBeNull();
  });

  it("togglePolicyResource adds a material to an explicit allow-list", () => {
    setDispatchPolicy({ allowedResources: ["scrap"], reserveFloor: 0, minFill: 1 });
    togglePolicyResource("copper");
    expect(getDispatchPolicy().allowedResources).toEqual(["scrap", "copper"]);
    togglePolicyResource("scrap");
    expect(getDispatchPolicy().allowedResources).toEqual(["copper"]);
  });

  it("rejects invalid reserve floor / min fill without publishing", () => {
    const before = getDispatchPolicy();
    setReserveFloor(-1);
    setReserveFloor(1.5);
    setMinFill(0);
    setMinFill(2.5);
    expect(getDispatchPolicy()).toBe(before);
    setReserveFloor(2);
    setMinFill(3);
    expect(getDispatchPolicy()).toMatchObject({ reserveFloor: 2, minFill: 3 });
  });
});

describe("writer-gated traffic configuration (real authority)", () => {
  it("default truck profile: writer accepts valid integers, reader and invalid refuse", () => {
    const writer = makeRoadDouble({ role: "writer" });
    expect(writer.api.setTrafficDefaultTruck({ speed: 3, loadTicks: 2, unloadTicks: 1 })).toBe(true);
    expect(writer.traffic.defaultTruck).toEqual({ speed: 3, loadTicks: 2, unloadTicks: 1 });
    expect(writer.api.setTrafficDefaultTruck({ speed: 0 })).toBe(false); // speed >= 1
    expect(writer.traffic.defaultTruck.speed).toBe(3); // unchanged on refusal

    const reader = makeRoadDouble({ role: "reader" });
    expect(reader.api.setTrafficDefaultTruck({ speed: 5 })).toBe(false);
    expect(reader.traffic.defaultTruck.speed).toBe(1);
  });

  it("per-truck override inherits then diverges from the default", () => {
    const double = makeRoadDouble();
    double.api.setTrafficDefaultTruck({ speed: 2 });
    expect(double.api.configureTrafficTruck(7, { speed: 6 })).toBe(true);
    expect(double.traffic.trucks[7].config).toEqual({ speed: 6, loadTicks: 0, unloadTicks: 0 });
    expect(double.traffic.defaultTruck.speed).toBe(2); // default untouched
    expect(double.api.configureTrafficTruck(7, { loadTicks: -1 })).toBe(false);
    expect(double.api.configureTrafficTruck(0, { speed: 2 })).toBe(false); // id must be > 0
  });

  it("bay capacity writes are writer-gated and require capacity >= 1", () => {
    const writer = makeRoadDouble();
    expect(writer.api.setTrafficBayCapacity(c(7, 10), 2)).toBe(true);
    expect(writer.traffic.bayCapacity["7,10"]).toBe(2);
    expect(writer.api.setTrafficBayCapacity(c(7, 10), 0)).toBe(false);
    expect(writer.traffic.bayCapacity["7,10"]).toBe(2); // unchanged

    const reader = makeRoadDouble({ role: "reader" });
    expect(reader.api.setTrafficBayCapacity(c(7, 10), 3)).toBe(false);
    expect(reader.traffic.bayCapacity["7,10"]).toBeUndefined();
  });

  it("junction capacity/cost and retry policy delegate validation to the authority", () => {
    const double = makeRoadDouble();
    expect(double.api.setTrafficJunctionCapacity(2)).toBe(true);
    expect(double.traffic.junctionCapacity).toBe(2);
    expect(double.api.setTrafficJunctionCapacity(null)).toBe(true);
    expect(double.traffic.junctionCapacity).toBeNull();
    expect(double.api.setTrafficJunctionCapacity(0)).toBe(false);
    expect(double.api.setTrafficJunctionCost(3)).toBe(true);
    expect(double.api.setTrafficJunctionCost(-1)).toBe(false);
    expect(double.api.setTrafficRetryPolicy({ maxRetries: 4, baseBackoff: 2, maxBackoff: 32 })).toBe(true);
    expect(double.traffic.maxRetries).toBe(4);
    expect(double.api.setTrafficRetryPolicy({ maxBackoff: 1 })).toBe(false); // maxBackoff >= baseBackoff
  });

  it("enableTraffic is opt-in, writer-gated and idempotent (default OFF, #140 parity)", () => {
    const writer = makeRoadDouble();
    expect(writer.api.isTrafficEnabled()).toBe(false);
    expect(writer.api.enableTraffic()).toBe(true);
    expect(writer.api.isTrafficEnabled()).toBe(true);
    expect(writer.api.enableTraffic()).toBe(true); // idempotent

    const reader = makeRoadDouble({ role: "reader" });
    expect(reader.api.enableTraffic()).toBe(false);
    expect(reader.api.isTrafficEnabled()).toBe(false);
  });
});