/**
 * RW3D #147 (T20): the pure road fleet / routes read model.
 *
 * Acceptance: job/cargo/destination/wait-reason projection; every TYPED hold
 * (no-route, road-removed, destination-full, no-carrier, bay-full, junction-full)
 * names its blocker, its fix and its focus cell; fleet/job row ordering; free
 * stock/room; bay rows deduped on the #139 approach cell; typed rejection text.
 *
 * Method: pure projection assertions over engine-shaped fixtures. The engine's
 * own hold production is covered by tests/game (roadPaths/logistics/traffic);
 * here we feed each typed hold the engine can emit and assert the projection.
 */
import { describe, expect, it } from "vitest";
import {
  bayRows,
  cancelRejectionText,
  cellKey,
  cellLabel,
  effectiveTruckConfig,
  fleetRows,
  freeRoom,
  freeStock,
  jobRows,
  jobWaitReason,
  rejectionText,
  waitReasonFocusCell,
  waitReasonRecovery,
  waitReasonText,
  type WaitReason,
} from "../../src/ui/logistics/fleetModel";
import { registerCarrier } from "../../src/game/simulation/logistics";
import { createTraffic } from "../../src/game/simulation/traffic";
import type { CreateJobResult, CancelJobResult } from "../../src/game/simulation/logistics";
import { c, fixtureJob, fixtureRuntime, fixtureSocket, makeRoadDouble, seedYard } from "./road-147.helpers";

describe("cell helpers", () => {
  it("keys and labels a cell deterministically", () => {
    expect(cellKey(c(3, 7))).toBe("3,7");
    expect(cellLabel(c(3, 7))).toBe("(3, 7)");
  });
});

describe("jobWaitReason precedence", () => {
  it("the logistics hold wins over the carrier traffic hold", () => {
    const traffic = createTraffic();
    fixtureRuntime(traffic, 9, { heldReason: { kind: "bay-full", at: c(1, 1), capacity: 1 } });
    const job = fixtureJob({
      carrierId: 9,
      heldReason: { kind: "destination-full", buildingId: 2, room: 0 },
    });
    expect(jobWaitReason(job, traffic)).toEqual({ kind: "destination-full", buildingId: 2, room: 0 });
  });

  it("falls back to the carrier traffic hold when the job has none", () => {
    const traffic = createTraffic();
    fixtureRuntime(traffic, 9, { heldReason: { kind: "junction-full", at: c(2, 2), capacity: 2 } });
    const job = fixtureJob({ carrierId: 9, heldReason: null });
    expect(jobWaitReason(job, traffic)).toEqual({ kind: "junction-full", at: c(2, 2), capacity: 2 });
  });

  it("is null for an unassigned job and for a carrier with no runtime", () => {
    const traffic = createTraffic();
    expect(jobWaitReason(fixtureJob({ carrierId: null }), traffic)).toBeNull();
    expect(jobWaitReason(fixtureJob({ carrierId: 42 }), traffic)).toBeNull();
  });
});

describe("typed holds: text, recovery and focus", () => {
  const job = fixtureJob({ sourceCell: c(0, 0), destCell: c(5, 0) });
  const cases: { reason: WaitReason; text: RegExp; recovery: RegExp; focus: { x: number; y: number } }[] = [
    {
      reason: { kind: "no-route", from: c(0, 0), to: c(5, 0) },
      text: /No road route \(0, 0\) → \(5, 0\)/,
      recovery: /Build or repair road/,
      focus: c(5, 0),
    },
    {
      reason: { kind: "road-removed", at: c(3, 1) },
      text: /Road removed at \(3, 1\)/,
      recovery: /Rebuild the missing road segment/,
      focus: c(3, 1),
    },
    {
      reason: { kind: "destination-full", buildingId: 2, room: 0 },
      text: /Destination 2 full \(room for 0\)/,
      recovery: /Free storage at the destination/,
      focus: c(5, 0),
    },
    {
      reason: { kind: "no-carrier", needCapacity: 12 },
      text: /No idle truck fits 12 units/,
      recovery: /Add a truck with enough capacity/,
      focus: c(0, 0),
    },
    {
      reason: { kind: "bay-full", at: c(7, 10), capacity: 1 },
      text: /Bay \(7, 10\) full \(capacity 1\)/,
      recovery: /Raise this bay's capacity/,
      focus: c(7, 10),
    },
    {
      reason: { kind: "junction-full", at: c(4, 4), capacity: 2 },
      text: /Junction \(4, 4\) full \(capacity 2\)/,
      recovery: /Raise the junction capacity/,
      focus: c(4, 4),
    },
  ];
  for (const { reason, text, recovery, focus } of cases) {
    it(`${reason.kind}: names blocker, fix and focus cell`, () => {
      expect(waitReasonText(reason)).toMatch(text);
      expect(waitReasonRecovery(reason)).toMatch(recovery);
      expect(waitReasonFocusCell(reason, job)).toEqual(focus);
      // Never a generic "blocked" with no blocker named.
      expect(waitReasonText(reason).length).toBeGreaterThan(8);
    });
  }
});

describe("effectiveTruckConfig", () => {
  it("uses the per-truck override when present, else the default", () => {
    const traffic = createTraffic();
    traffic.defaultTruck = { speed: 1, loadTicks: 0, unloadTicks: 0 };
    fixtureRuntime(traffic, 3, { config: { speed: 4, loadTicks: 2, unloadTicks: 1 } });
    expect(effectiveTruckConfig(traffic, 3)).toEqual({ speed: 4, loadTicks: 2, unloadTicks: 1 });
    expect(effectiveTruckConfig(traffic, 99)).toEqual({ speed: 1, loadTicks: 0, unloadTicks: 0 });
  });
});

describe("fleetRows", () => {
  it("projects each carrier's job, cargo, destination, wait and engine cell", () => {
    const double = makeRoadDouble();
    const carrier = registerCarrier(double.logistics, { capacity: 12, cell: c(2, 3) })!;
    const job = fixtureJob({
      id: 7,
      carrierId: carrier.id,
      inTransit: 5,
      atSource: 5,
      status: "active",
      phase: "to-dest",
      heldReason: null,
    });
    double.logistics.jobs.push(job);
    carrier.jobId = job.id;
    // bay-full is a TRAFFIC hold on the carrier runtime, surfaced via the job's carrier.
    fixtureRuntime(double.traffic, carrier.id, {
      config: { speed: 3, loadTicks: 1, unloadTicks: 1 },
      heldReason: { kind: "bay-full", at: c(5, 0), capacity: 1 },
    });

    const rows = fleetRows(double.logistics, double.traffic);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.carrier.id).toBe(carrier.id);
    expect(row.job?.id).toBe(7);
    expect(row.config).toEqual({ speed: 3, loadTicks: 1, unloadTicks: 1 });
    expect(row.wait).toEqual({ kind: "bay-full", at: c(5, 0), capacity: 1 });
    expect(row.cell).toEqual(c(2, 3));
  });

  it("keeps the engine's carrier order and surfaces an idle carrier's traffic hold", () => {
    const double = makeRoadDouble();
    const a = registerCarrier(double.logistics, { capacity: 8, cell: c(0, 0) })!;
    const b = registerCarrier(double.logistics, { capacity: 8, cell: c(1, 1) })!;
    fixtureRuntime(double.traffic, b.id, { heldReason: { kind: "junction-full", at: c(9, 9), capacity: 1 } });
    const rows = fleetRows(double.logistics, double.traffic);
    expect(rows.map((r) => r.carrier.id)).toEqual([a.id, b.id]);
    expect(rows[0].job).toBeNull();
    expect(rows[0].wait).toBeNull();
    expect(rows[1].job).toBeNull();
    expect(rows[1].wait).toEqual({ kind: "junction-full", at: c(9, 9), capacity: 1 });
    expect(rows[1].config).toEqual(double.traffic.defaultTruck);
  });
});

describe("jobRows", () => {
  it("sorts newest first, includes terminal history, and computes remaining units", () => {
    const double = makeRoadDouble();
    double.logistics.jobs.push(
      fixtureJob({ id: 1, atSource: 3, inTransit: 2, status: "active", phase: "to-dest" }),
      fixtureJob({ id: 3, atSource: 0, inTransit: 0, delivered: 10, status: "complete", phase: "done" }),
      fixtureJob({ id: 2, atSource: 4, inTransit: 0, status: "pending", phase: "waiting" }),
    );
    const rows = jobRows(double.logistics, double.traffic);
    expect(rows.map((r) => r.job.id)).toEqual([3, 2, 1]);
    expect(rows.find((r) => r.job.id === 1)?.remaining).toBe(5);
    expect(rows.find((r) => r.job.id === 3)?.remaining).toBe(0);
  });
});

describe("freeStock and freeRoom", () => {
  it("reads unreserved stock and remaining room across resources", () => {
    const double = makeRoadDouble();
    seedYard(double, { sourceStock: 30, destCapacity: 20 });
    expect(freeStock(double.logistics, 1, "scrap")).toBe(30);
    expect(freeStock(double.logistics, 1, "copper")).toBe(0);
    expect(freeStock(double.logistics, 999, "scrap")).toBe(0);
    // Destination holds 20 capacity, 5 used -> 15 room.
    double.logistics.stocks[2] = { scrap: 3, copper: 2 };
    expect(freeRoom(double.logistics, double.logistics.buildings[2])).toBe(15);
    // Overfull stock clamps room at zero, never negative.
    double.logistics.stocks[2] = { scrap: 50 };
    expect(freeRoom(double.logistics, double.logistics.buildings[2])).toBe(0);
  });
});

describe("bayRows", () => {
  it("dedupes by approach cell, combines labels, and reads cap + live occupancy", () => {
    const double = makeRoadDouble({
      sockets: [
        fixtureSocket({ buildingId: 1, socket: "bay0", approach: c(7, 10), connected: true }),
        fixtureSocket({ buildingId: 2, socket: "bay0", approach: c(7, 10), connected: false }),
        fixtureSocket({ buildingId: 3, socket: "serviceBay", approach: c(16, 10) }),
      ],
    });
    double.traffic.bayCapacity["7,10"] = 2;
    double.traffic.bayLeases.push(
      { id: 1, carrierId: 1, jobId: 1, cell: c(7, 10) },
      { id: 2, carrierId: 2, jobId: 2, cell: c(7, 10) },
    );
    const rows = bayRows(double.traffic, double.sockets);
    expect(rows).toHaveLength(2);
    const shared = rows.find((r) => cellKey(r.cell) === "7,10")!;
    expect(shared.label).toBe("1/bay0 + 2/bay0");
    expect(shared.connected).toBe(true); // OR of the two sockets
    expect(shared.capacity).toBe(2);
    expect(shared.leases).toBe(2);
    const solo = rows.find((r) => cellKey(r.cell) === "16,10")!;
    expect(solo.capacity).toBeNull(); // unconfigured = unlimited
    expect(solo.leases).toBe(0);
    expect(solo.connected).toBe(false);
  });

  it("is empty when no sockets are declared (#217 honest empty state)", () => {
    const double = makeRoadDouble({ sockets: [] });
    expect(bayRows(double.traffic, double.sockets)).toEqual([]);
  });
});

describe("rejectionText", () => {
  const cases: { result: CreateJobResult; match: RegExp }[] = [
    { result: { ok: false, reason: { reason: "invalid-amount", amount: 0 } }, match: /positive whole number \(got 0\)/ },
    { result: { ok: false, reason: { reason: "invalid-resource", resource: "unobtanium" } }, match: /Unknown material "unobtanium"/ },
    { result: { ok: false, reason: { reason: "invalid-building", buildingId: -1 } }, match: /positive whole number \(got -1\)/ },
    { result: { ok: false, reason: { reason: "invalid-priority", priority: 1.5 } }, match: /whole number \(got 1.5\)/ },
    { result: { ok: false, reason: { reason: "unknown-building", buildingId: 9 } }, match: /Building 9 is not registered/ },
    { result: { ok: false, reason: { reason: "same-building" } }, match: /different buildings/ },
    { result: { ok: false, reason: { reason: "same-location" } }, match: /share an approach cell/ },
    { result: { ok: false, reason: { reason: "insufficient-stock", resource: "scrap", need: 5, have: 2 } }, match: /Only 2 scrap free .*need 5/ },
    { result: { ok: false, reason: { reason: "insufficient-room", buildingId: 2, need: 5, have: 1 } }, match: /Destination 2 has room for 1 \(need 5\)/ },
    { result: { ok: false, reason: { reason: "read-only" } }, match: /read-only/ },
  ];
  for (const { result, match } of cases) {
    it(`renders ${(result as { reason: { reason: string } }).reason.reason}`, () => {
      expect(rejectionText(result)).toMatch(match);
    });
  }
  it("is empty on success", () => {
    expect(rejectionText({ ok: true, job: fixtureJob(), replayed: false })).toBe("");
  });
});

describe("cancelRejectionText", () => {
  it("names unknown-job and read-only, empty on success", () => {
    const unknown: CancelJobResult = { ok: false, reason: { reason: "unknown-job" } };
    const locked: CancelJobResult = { ok: false, reason: { reason: "read-only" } };
    expect(cancelRejectionText(unknown)).toMatch(/no longer exists/);
    expect(cancelRejectionText(locked)).toMatch(/read-only/);
    expect(cancelRejectionText({ ok: true, job: fixtureJob() })).toBe("");
  });
});