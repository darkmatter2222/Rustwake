/**
 * Atomic road tool: previews, rejection atomicity, cost/refund ledger
 * (issue #139, RW3D T12). Seed 139, flattened start parcel fixture.
 * Every rejection asserts BOTH fingerprints stay byte-identical.
 */
import { describe, expect, it } from "vitest";
import { createWorld, terrainIndex } from "../../src/game/world/terrain";
import type { WorldState } from "../../src/game/world/types";
import { applyWorldCommand, worldFingerprint } from "../../src/game/world/transactions";
import { advanceWorld } from "../../src/game/world/engine";
import { centerMu } from "../../src/game/world/geometry";
import { WORLD_KIT } from "../../src/game/world/kit";
import {
  createRoadNetwork,
  roadDegree,
  roadFingerprint,
  type RoadNetworkState,
} from "../../src/game/world/roadGraph";
import {
  applyRoadCommand,
  previewRoadPlace,
  previewRoadRemove,
  type RoadCommand,
  type RoadRejection,
} from "../../src/game/world/roadTool";
import type { Cell } from "../../src/game/world/types";

const SEED = 139;
const INITIAL = { scrap: 1000, ferrous: 12, steel: 100 };

function flatWorld(): WorldState {
  const w = createWorld(SEED);
  for (let y = 0; y < 24; y += 1) {
    for (let x = 0; x < 24; x += 1) w.terrain[terrainIndex(x, y)] = "flat";
  }
  w.stock.scrap = INITIAL.scrap;
  w.stock.steel = INITIAL.steel;
  w.credits = 1000;
  return w;
}

const c = (x: number, y: number): Cell => ({ x, y });

function placeRoad(w: WorldState, net: RoadNetworkState, id: string, cells: Cell[], lanes?: 1 | 2) {
  const cmd: RoadCommand = { id, type: "road.place", cells, ...(lanes ? { lanes } : {}) };
  const result = applyRoadCommand(w, net, cmd);
  if (!result.ok) throw new Error(`setup place failed: ${JSON.stringify(result.rejection)}`);
  return result;
}

function placeBuilding(w: WorldState, id: string, asset: string, x: number, y: number, rotation = 0) {
  const result = applyWorldCommand(w, {
    id,
    type: "world.place",
    asset,
    cell: { x, y },
    rotation: rotation as 0 | 90 | 180 | 270,
  });
  if (!result.ok) throw new Error(`setup building failed: ${JSON.stringify(result.rejection)}`);
  return result;
}

function expectRejection(
  w: WorldState,
  net: RoadNetworkState,
  cmd: RoadCommand,
  reason: RoadRejection["reason"],
): RoadRejection {
  const wBefore = worldFingerprint(w);
  const nBefore = roadFingerprint(net);
  const result = applyRoadCommand(w, net, cmd);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("unreachable");
  expect(result.rejection.reason).toBe(reason);
  // Atomicity: a rejected command changes nothing, anywhere.
  expect(worldFingerprint(w)).toBe(wBefore);
  expect(roadFingerprint(net)).toBe(nBefore);
  return result.rejection;
}

function expectConserved(w: WorldState) {
  expect((w.stock.scrap ?? 0) + (w.committed.scrap ?? 0)).toBe(INITIAL.scrap);
}

describe("placement preview", () => {
  it("reports route, new cells, cost and no crossings on open ground", () => {
    const w = flatWorld();
    const net = createRoadNetwork();
    const p = previewRoadPlace(w, net, [c(2, 2), c(3, 2), c(4, 2)]);
    expect(p.valid).toBe(true);
    expect(p.rejection).toBeNull();
    expect(p.newCells).toEqual([c(2, 2), c(3, 2), c(4, 2)]);
    expect(p.reusedCells).toEqual([]);
    expect(p.upgradedCells).toEqual([]);
    expect(p.costScrap).toBe(15);
    expect(p.crossings).toEqual([]);
    expect(p.sockets).toEqual([]);
  });

  it("preview is pure: no state mutation", () => {
    const w = flatWorld();
    const net = createRoadNetwork();
    const wBefore = worldFingerprint(w);
    const nBefore = roadFingerprint(net);
    previewRoadPlace(w, net, [c(2, 2), c(3, 2)]);
    previewRoadRemove(w, net, [c(2, 2)]);
    expect(worldFingerprint(w)).toBe(wBefore);
    expect(roadFingerprint(net)).toBe(nBefore);
  });

  it("reports a crossing where a perpendicular segment becomes a junction", () => {
    const w = flatWorld();
    const net = createRoadNetwork();
    placeRoad(w, net, "h", [c(2, 5), c(3, 5), c(4, 5), c(5, 5), c(6, 5)]);
    const p = previewRoadPlace(w, net, [c(4, 3), c(4, 4), c(4, 5), c(4, 6), c(4, 7)]);
    expect(p.valid).toBe(true);
    expect(p.crossings).toEqual([c(4, 5)]);
    expect(p.newCells).toEqual([c(4, 3), c(4, 4), c(4, 6), c(4, 7)]);
    expect(p.reusedCells).toEqual([c(4, 5)]);
    expect(p.costScrap).toBe(20);
    placeRoad(w, net, "v", [c(4, 3), c(4, 4), c(4, 5), c(4, 6), c(4, 7)]);
    expect(roadDegree(net, c(4, 5))).toBe(4);
  });

  it("lists bay sockets connected by the route", () => {
    const w = flatWorld();
    const net = createRoadNetwork();
    placeBuilding(w, "b1", "warehouse", 6, 6);
    advanceWorld(w, 60);
    const p = previewRoadPlace(w, net, [c(7, 10), c(7, 11), c(7, 12)]);
    expect(p.valid).toBe(true);
    expect(p.sockets.map((s) => `${s.asset}:${s.socket}`)).toEqual(["warehouse:bay0"]);
    expect(p.sockets[0].connected).toBe(true);
  });
});

describe("placement rejection atomicity", () => {
  it("rejects malformed paths", () => {
    const w = flatWorld();
    const net = createRoadNetwork();
    expectRejection(w, net, { id: "e", type: "road.place", cells: [] }, "invalid-path");
    expectRejection(w, net, { id: "s", type: "road.place", cells: [c(2, 2)] }, "invalid-path");
    expectRejection(
      w, net,
      { id: "f", type: "road.place", cells: [{ x: 2.5, y: 2 }, c(3, 2)] },
      "invalid-path",
    );
    expectRejection(
      w, net,
      { id: "d", type: "road.place", cells: [c(2, 2), c(3, 2), c(2, 2)] },
      "invalid-path",
    );
    expectRejection(
      w, net,
      { id: "g", type: "road.place", cells: [c(2, 2), c(4, 2)] },
      "invalid-path",
    );
  });

  it("rejects invalid lane counts", () => {
    const w = flatWorld();
    const net = createRoadNetwork();
    expectRejection(
      w, net,
      { id: "l", type: "road.place", cells: [c(2, 2), c(3, 2)], lanes: 3 as 1 | 2 },
      "invalid-lanes",
    );
  });

  it("rejects unowned land and unsupported terrain", () => {
    const w = flatWorld();
    const net = createRoadNetwork();
    expectRejection(
      w, net,
      { id: "o", type: "road.place", cells: [c(-1, -1), c(0, -1)] },
      "outside-land",
    );
    w.terrain[terrainIndex(3, 2)] = "salvage";
    expectRejection(
      w, net,
      { id: "t", type: "road.place", cells: [c(2, 2), c(3, 2)] },
      "terrain-unsupported",
    );
  });

  it("rejects routes through building footprints and live sites", () => {
    const w = flatWorld();
    const net = createRoadNetwork();
    placeBuilding(w, "b1", "warehouse", 6, 6);
    // Site still under construction: occupancy applies immediately.
    expectRejection(
      w, net,
      { id: "occ", type: "road.place", cells: [c(7, 7), c(8, 7)] },
      "occupied",
    );
    advanceWorld(w, 60);
    expectRejection(
      w, net,
      { id: "occ2", type: "road.place", cells: [c(7, 7), c(8, 7)] },
      "occupied",
    );
  });

  it("rejects routes inside the crane keep-out disc (touching counts)", () => {
    const w = flatWorld();
    const net = createRoadNetwork();
    placeBuilding(w, "crane1", "crane", 2, 2);
    const [cx, cz] = centerMu(c(2, 2), WORLD_KIT.crane.footprint, 0);
    const probe = c(Math.floor((cx + 2000) / 1000), Math.floor(cz / 1000));
    const rejection = expectRejection(
      w, net,
      { id: "k", type: "road.place", cells: [probe, c(probe.x + 1, probe.y)] },
      "keepout",
    );
    expect(rejection.reason === "keepout" && rejection.craneId).toBe(1);
  });

  it("allows roads inside entrance corridors (corridors are keep-clear, not occupancy)", () => {
    const w = flatWorld();
    const net = createRoadNetwork();
    placeBuilding(w, "b1", "warehouse", 6, 6);
    advanceWorld(w, 60);
    // (7,10) is bay0's approach cell, inside the entrance corridor.
    const result = placeRoad(w, net, "corridor", [c(7, 10), c(7, 11), c(7, 12)]);
    expect(result.ok).toBe(true);
  });

  it("rejects lane downgrades", () => {
    const w = flatWorld();
    const net = createRoadNetwork();
    placeRoad(w, net, "wide", [c(2, 2), c(3, 2), c(4, 2)], 2);
    const rejection = expectRejection(
      w, net,
      { id: "down", type: "road.place", cells: [c(2, 2), c(3, 2), c(4, 2)], lanes: 1 },
      "lane-downgrade",
    );
    if (rejection.reason === "lane-downgrade") {
      expect(rejection.have).toBe(2);
      expect(rejection.want).toBe(1);
      expect(rejection.cells).toHaveLength(3);
    }
  });

  it("rejects when scrap is insufficient", () => {
    const w = flatWorld();
    const net = createRoadNetwork();
    w.stock.scrap = 4;
    const rejection = expectRejection(
      w, net,
      { id: "poor", type: "road.place", cells: [c(2, 2), c(3, 2)] },
      "insufficient-material",
    );
    if (rejection.reason === "insufficient-material") {
      expect(rejection.resource).toBe("scrap");
      expect(rejection.need).toBe(10);
      expect(rejection.have).toBe(4);
    }
  });
});

describe("material ledger", () => {
  it("charges new cells once, stock -> committed, conservation holds", () => {
    const w = flatWorld();
    const net = createRoadNetwork();
    placeRoad(w, net, "r1", [c(2, 2), c(3, 2), c(4, 2)]);
    expect(w.stock.scrap).toBe(INITIAL.scrap - 15);
    expect(w.committed.scrap).toBe(15);
    expectConserved(w);
    expect(w.revision).toBe(1);
  });

  it("reuse at the same lane count is free", () => {
    const w = flatWorld();
    const net = createRoadNetwork();
    placeRoad(w, net, "r1", [c(2, 2), c(3, 2), c(4, 2)]);
    const p = previewRoadPlace(w, net, [c(2, 2), c(3, 2), c(4, 2)]);
    expect(p.costScrap).toBe(0);
    expect(p.reusedCells).toHaveLength(3);
    placeRoad(w, net, "r2", [c(2, 2), c(3, 2), c(4, 2)]);
    expect(w.stock.scrap).toBe(INITIAL.scrap - 15);
    expectConserved(w);
  });

  it("lane upgrades charge the cell price and update the ledger", () => {
    const w = flatWorld();
    const net = createRoadNetwork();
    placeRoad(w, net, "r1", [c(2, 2), c(3, 2), c(4, 2)], 1);
    const p = previewRoadPlace(w, net, [c(2, 2), c(3, 2), c(4, 2)], 2);
    expect(p.upgradedCells).toHaveLength(3);
    expect(p.costScrap).toBe(15);
    placeRoad(w, net, "up", [c(2, 2), c(3, 2), c(4, 2)], 2);
    expect(w.stock.scrap).toBe(INITIAL.scrap - 30);
    expect(net.cells["3,2"].paidScrap).toBe(10);
    for (const edge of Object.values(net.edges)) expect(edge.lanes).toBe(2);
    expectConserved(w);
  });

  it("dismantle refunds 80% floor including neighbors left roadless", () => {
    const w = flatWorld();
    const net = createRoadNetwork();
    placeRoad(w, net, "r1", [c(2, 2), c(3, 2), c(4, 2)]);
    const p = previewRoadRemove(w, net, [c(3, 2)]);
    expect(p.valid).toBe(true);
    expect(p.removedEdgeKeys).toHaveLength(2);
    // Cutting the middle leaves all three cells roadless: full closure refund.
    expect(p.refundCells).toEqual([c(2, 2), c(3, 2), c(4, 2)]);
    expect(p.refundScrap).toBe(12); // 3 * floor(5 * 80 / 100)
    const result = applyRoadCommand(w, net, { id: "cut", type: "road.remove", cells: [c(3, 2)] });
    expect(result.ok).toBe(true);
    expect(w.stock.scrap).toBe(INITIAL.scrap - 15 + 12);
    expect(w.committed.scrap).toBe(3);
    expect(Object.keys(net.edges)).toHaveLength(0);
    expect(Object.keys(net.cells)).toHaveLength(0);
    expectConserved(w);
  });

  it("partial cut refunds only the orphaned endpoint", () => {
    const w = flatWorld();
    const net = createRoadNetwork();
    placeRoad(w, net, "r1", [c(2, 2), c(3, 2), c(4, 2), c(5, 2)]);
    const p = previewRoadRemove(w, net, [c(2, 2)]);
    expect(p.refundCells).toEqual([c(2, 2)]);
    expect(p.refundScrap).toBe(4);
    applyRoadCommand(w, net, { id: "cut", type: "road.remove", cells: [c(2, 2)] });
    expect(Object.keys(net.cells)).toHaveLength(3);
    expect(w.stock.scrap).toBe(INITIAL.scrap - 20 + 4);
    expectConserved(w);
  });

  it("rejects removing cells without road", () => {
    const w = flatWorld();
    const net = createRoadNetwork();
    expectRejection(w, net, { id: "nr", type: "road.remove", cells: [c(9, 9)] }, "no-road");
    expectRejection(w, net, { id: "empty", type: "road.remove", cells: [] }, "invalid-path");
  });

  it("reports bay sockets disconnected by a cut", () => {
    const w = flatWorld();
    const net = createRoadNetwork();
    placeBuilding(w, "b1", "warehouse", 6, 6);
    advanceWorld(w, 60);
    placeRoad(w, net, "lane", [c(7, 10), c(7, 11), c(7, 12)]);
    const p = previewRoadRemove(w, net, [c(7, 10)]);
    expect(p.valid).toBe(true);
    expect(p.disconnected.map((s) => `${s.asset}:${s.socket}`)).toEqual(["warehouse:bay0"]);
  });

  it("remove replay does not double-refund", () => {
    const w = flatWorld();
    const net = createRoadNetwork();
    placeRoad(w, net, "r1", [c(2, 2), c(3, 2)]);
    const cmd: RoadCommand = { id: "cut", type: "road.remove", cells: [c(2, 2), c(3, 2)] };
    applyRoadCommand(w, net, cmd);
    const scrap = w.stock.scrap;
    const wBefore = worldFingerprint(w);
    const nBefore = roadFingerprint(net);
    const replay = applyRoadCommand(w, net, cmd);
    expect(replay.ok).toBe(true);
    expect(w.stock.scrap).toBe(scrap);
    expect(worldFingerprint(w)).toBe(wBefore);
    expect(roadFingerprint(net)).toBe(nBefore);
    expectConserved(w);
  });
});