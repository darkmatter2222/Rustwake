/**
 * Cargo paths + topology invalidation (issue #139, RW3D T12).
 * Binding acceptance: topology revisions invalidate affected paths WITHOUT
 * deleting cargo (E04); unreachable jobs back off and remain inspectable.
 * Seed 139, flattened start parcel fixture; all walks hand-derived.
 */
import { describe, expect, it } from "vitest";
import { createWorld, terrainIndex } from "../../src/game/world/terrain";
import type { WorldState } from "../../src/game/world/types";
import { worldFingerprint } from "../../src/game/world/transactions";
import {
  createRoadNetwork,
  roadEdgeKey,
  roadFingerprint,
  roadWalkValid,
  type RoadNetworkState,
} from "../../src/game/world/roadGraph";
import { applyRoadCommand, type RoadCommand } from "../../src/game/world/roadTool";
import {
  applyRoadTransaction,
  createRoadCargo,
  findRoadPath,
  invalidateAffectedPaths,
  roadCargoFingerprint,
  spawnCargoBatch,
  tickRoadCargo,
  type RoadCargoState,
} from "../../src/game/simulation/roadPaths";
import type { Cell } from "../../src/game/world/types";

const SEED = 139;

function flatWorld(): WorldState {
  const w = createWorld(SEED);
  for (let y = 0; y < 24; y += 1) {
    for (let x = 0; x < 24; x += 1) w.terrain[terrainIndex(x, y)] = "flat";
  }
  w.stock.scrap = 1000;
  return w;
}

const c = (x: number, y: number): Cell => ({ x, y });

function placeRoad(w: WorldState, net: RoadNetworkState, id: string, cells: Cell[]) {
  const result = applyRoadCommand(w, net, { id, type: "road.place", cells });
  if (!result.ok) throw new Error(`setup road failed: ${JSON.stringify(result.rejection)}`);
  return result;
}

interface Rig {
  w: WorldState;
  net: RoadNetworkState;
  cargo: RoadCargoState;
}

function rig(): Rig {
  return { w: flatWorld(), net: createRoadNetwork(), cargo: createRoadCargo() };
}

/** 3x2 rectangle loop: two parallel routes between (0,0) and (2,0). */
function buildLoop(r: Rig) {
  placeRoad(r.w, r.net, "top", [c(0, 0), c(1, 0), c(2, 0)]);
  placeRoad(r.w, r.net, "bottom", [c(0, 1), c(1, 1), c(2, 1)]);
  placeRoad(r.w, r.net, "left", [c(0, 0), c(0, 1)]);
  placeRoad(r.w, r.net, "right", [c(2, 0), c(2, 1)]);
}

/** Straight five-cell corridor along y = 0. */
function buildCorridor(r: Rig) {
  placeRoad(r.w, r.net, "line", [c(0, 0), c(1, 0), c(2, 0), c(3, 0), c(4, 0)]);
}

describe("deterministic pathfinding", () => {
  it("finds the unique L-shaped walk", () => {
    const r = rig();
    placeRoad(r.w, r.net, "l", [c(0, 0), c(1, 0), c(2, 0), c(2, 1), c(2, 2)]);
    expect(findRoadPath(r.net, c(0, 0), c(2, 2))).toEqual([
      c(0, 0), c(1, 0), c(2, 0), c(2, 1), c(2, 2),
    ]);
  });

  it("breaks shortest-path ties by sorted neighbor order (vertical first)", () => {
    const r = rig();
    placeRoad(r.w, r.net, "a", [c(0, 0), c(1, 0)]);
    placeRoad(r.w, r.net, "b", [c(0, 0), c(0, 1)]);
    placeRoad(r.w, r.net, "d", [c(1, 0), c(1, 1)]);
    placeRoad(r.w, r.net, "e", [c(0, 1), c(1, 1)]);
    // "0,1" < "1,0" in cell-key order, so BFS reaches (1,1) via (0,1).
    expect(findRoadPath(r.net, c(0, 0), c(1, 1))).toEqual([c(0, 0), c(0, 1), c(1, 1)]);
  });

  it("returns null for unreachable or non-road endpoints; trivial walk for from == to", () => {
    const r = rig();
    placeRoad(r.w, r.net, "a", [c(0, 0), c(1, 0)]);
    placeRoad(r.w, r.net, "island", [c(5, 5), c(6, 5)]);
    expect(findRoadPath(r.net, c(0, 0), c(5, 5))).toBeNull();
    expect(findRoadPath(r.net, c(9, 9), c(0, 0))).toBeNull();
    expect(findRoadPath(r.net, c(0, 0), c(0, 0))).toEqual([c(0, 0)]);
  });

  it("respects one-way flow", () => {
    const r = rig();
    placeRoad(r.w, r.net, "line", [c(0, 0), c(1, 0), c(2, 0)]);
    r.net.edges[roadEdgeKey(c(0, 0), c(1, 0))].direction = "one-way"; // flow +x
    expect(findRoadPath(r.net, c(0, 0), c(2, 0))).toEqual([c(0, 0), c(1, 0), c(2, 0)]);
    expect(findRoadPath(r.net, c(2, 0), c(0, 0))).toBeNull();
  });

  it("same network + request reproduce the same walk", () => {
    const r = rig();
    buildLoop(r);
    const a = findRoadPath(r.net, c(0, 0), c(2, 1));
    const b = findRoadPath(r.net, c(0, 0), c(2, 1));
    expect(a).toEqual(b);
    expect(roadWalkValid(r.net, a as Cell[])).toBe(true);
  });
});

describe("cargo lifecycle", () => {
  it("an unreachable request creates a held, inspectable batch (never dropped)", () => {
    const r = rig();
    const batch = spawnCargoBatch(r.cargo, r.net, { resource: "scrap", amount: 7, from: c(0, 0), to: c(4, 0) });
    expect(batch.id).toBe(1);
    expect(batch.phase).toBe("held");
    expect(batch.path).toBeNull();
    expect(batch.heldReason).toEqual({ kind: "no-route", from: c(0, 0), to: c(4, 0) });
    expect(batch.amount).toBe(7);
    expect(r.cargo.nextBatchId).toBe(2);
  });

  it("a reachable request routes immediately with a topology stamp", () => {
    const r = rig();
    buildCorridor(r);
    const batch = spawnCargoBatch(r.cargo, r.net, { resource: "scrap", amount: 7, from: c(0, 0), to: c(4, 0) });
    expect(batch.phase).toBe("moving");
    expect(batch.heldReason).toBeNull();
    expect(batch.path?.topologyVersion).toBe(r.net.revision);
    expect(batch.path?.cells).toEqual([c(0, 0), c(1, 0), c(2, 0), c(3, 0), c(4, 0)]);
  });

  it("ticks advance one cell per tick and deliver at the end; held batches never move", () => {
    const r = rig();
    buildCorridor(r);
    const moving = spawnCargoBatch(r.cargo, r.net, { resource: "scrap", amount: 7, from: c(0, 0), to: c(4, 0) });
    const held = spawnCargoBatch(r.cargo, r.net, { resource: "scrap", amount: 3, from: c(9, 9), to: c(0, 0) });
    tickRoadCargo(r.cargo, 1);
    expect(moving.progress).toBe(1);
    expect(moving.phase).toBe("moving");
    tickRoadCargo(r.cargo, 99);
    expect(moving.progress).toBe(4);
    expect(moving.phase).toBe("delivered");
    expect(held.progress).toBe(0);
    expect(held.phase).toBe("held");
    tickRoadCargo(r.cargo, 0);
    tickRoadCargo(r.cargo, -2);
    tickRoadCargo(r.cargo, 1.5);
    expect(moving.progress).toBe(4);
  });
});

describe("topology invalidation preserves cargo", () => {
  it("re-routes around a cut when an alternate path exists", () => {
    const r = rig();
    buildLoop(r);
    const batch = spawnCargoBatch(r.cargo, r.net, { resource: "scrap", amount: 7, from: c(0, 0), to: c(2, 0) });
    expect(batch.path?.cells).toEqual([c(0, 0), c(1, 0), c(2, 0)]);
    const tx = applyRoadTransaction(r.w, r.net, r.cargo, { id: "cut", type: "road.remove", cells: [c(1, 0)] });
    expect(tx.result.ok).toBe(true);
    expect(tx.invalidation?.rerouted).toEqual([1]);
    expect(batch.phase).toBe("moving");
    expect(batch.path?.cells).toEqual([c(0, 0), c(0, 1), c(1, 1), c(2, 1), c(2, 0)]);
    expect(batch.path?.topologyVersion).toBe(r.net.revision);
    expect(batch.amount).toBe(7);
    expect(batch.resource).toBe("scrap");
    expect(r.cargo.batches).toHaveLength(1);
  });

  it("holds with the exact blocker when no alternate exists; cargo survives", () => {
    const r = rig();
    buildCorridor(r);
    const batch = spawnCargoBatch(r.cargo, r.net, { resource: "scrap", amount: 7, from: c(0, 0), to: c(4, 0) });
    const tx = applyRoadTransaction(r.w, r.net, r.cargo, { id: "cut", type: "road.remove", cells: [c(2, 0)] });
    expect(tx.invalidation?.held).toEqual([1]);
    expect(batch.phase).toBe("held");
    expect(batch.path).toBeNull();
    expect(batch.heldReason).toEqual({ kind: "no-route", from: c(0, 0), to: c(4, 0) });
    expect(batch.id).toBe(1);
    expect(batch.amount).toBe(7);
    expect(batch.resource).toBe("scrap");
    expect(r.cargo.batches).toHaveLength(1);
  });

  it("reports road-removed at the exact cell when the cut lands under the batch", () => {
    const r = rig();
    buildCorridor(r);
    const batch = spawnCargoBatch(r.cargo, r.net, { resource: "scrap", amount: 7, from: c(0, 0), to: c(4, 0) });
    tickRoadCargo(r.cargo, 2);
    expect(batch.progress).toBe(2);
    applyRoadTransaction(r.w, r.net, r.cargo, { id: "cut", type: "road.remove", cells: [c(2, 0)] });
    expect(batch.phase).toBe("held");
    expect(batch.heldReason).toEqual({ kind: "road-removed", at: c(2, 0) });
    expect(batch.amount).toBe(7);
  });

  it("a later repair recovers held batches on the next topology revision", () => {
    const r = rig();
    buildCorridor(r);
    const batch = spawnCargoBatch(r.cargo, r.net, { resource: "scrap", amount: 7, from: c(0, 0), to: c(4, 0) });
    applyRoadTransaction(r.w, r.net, r.cargo, { id: "cut", type: "road.remove", cells: [c(2, 0)] });
    expect(batch.phase).toBe("held");
    const tx = applyRoadTransaction(r.w, r.net, r.cargo, {
      id: "repair",
      type: "road.place",
      cells: [c(1, 0), c(2, 0), c(3, 0)],
    });
    expect(tx.result.ok).toBe(true);
    expect(tx.invalidation?.rerouted).toEqual([1]);
    expect(batch.phase).toBe("moving");
    expect(batch.heldReason).toBeNull();
    expect(batch.path?.topologyVersion).toBe(r.net.revision);
    expect(roadWalkValid(r.net, batch.path?.cells as Cell[])).toBe(true);
  });

  it("a topology bump re-resolves stamped paths even when the walk survives", () => {
    const r = rig();
    buildCorridor(r);
    const batch = spawnCargoBatch(r.cargo, r.net, { resource: "scrap", amount: 7, from: c(0, 0), to: c(4, 0) });
    const walkBefore = batch.path?.cells;
    placeRoad(r.w, r.net, "elsewhere", [c(10, 10), c(11, 10)]);
    const report = invalidateAffectedPaths(r.net, r.cargo);
    expect(report.rerouted).toEqual([1]);
    expect(batch.path?.cells).toEqual(walkBefore);
    expect(batch.path?.topologyVersion).toBe(r.net.revision);
  });

  it("delivered batches are never re-examined, even when all road is cut", () => {
    const r = rig();
    buildCorridor(r);
    const batch = spawnCargoBatch(r.cargo, r.net, { resource: "scrap", amount: 7, from: c(0, 0), to: c(4, 0) });
    tickRoadCargo(r.cargo, 10);
    expect(batch.phase).toBe("delivered");
    const report = invalidateAffectedPaths(r.net, r.cargo);
    expect(report.delivered).toEqual([1]);
    expect(report.rerouted).toEqual([]);
    expect(report.held).toEqual([]);
    applyRoadTransaction(r.w, r.net, r.cargo, {
      id: "raze",
      type: "road.remove",
      cells: [c(0, 0), c(1, 0), c(2, 0), c(3, 0), c(4, 0)],
    });
    expect(batch.phase).toBe("delivered");
    expect(batch.amount).toBe(7);
  });
});

describe("transaction atomicity across world + network + cargo", () => {
  it("a rejected command leaves all three states byte-identical", () => {
    const r = rig();
    buildCorridor(r);
    spawnCargoBatch(r.cargo, r.net, { resource: "scrap", amount: 7, from: c(0, 0), to: c(4, 0) });
    const wBefore = worldFingerprint(r.w);
    const nBefore = roadFingerprint(r.net);
    const cBefore = roadCargoFingerprint(r.cargo);
    const tx = applyRoadTransaction(r.w, r.net, r.cargo, {
      id: "bad",
      type: "road.place",
      cells: [c(5, 5), c(7, 7)],
    });
    expect(tx.result.ok).toBe(false);
    expect(tx.invalidation).toBeNull();
    expect(worldFingerprint(r.w)).toBe(wBefore);
    expect(roadFingerprint(r.net)).toBe(nBefore);
    expect(roadCargoFingerprint(r.cargo)).toBe(cBefore);
  });

  it("an idempotent replay does not re-invalidate", () => {
    const r = rig();
    buildCorridor(r);
    spawnCargoBatch(r.cargo, r.net, { resource: "scrap", amount: 7, from: c(0, 0), to: c(4, 0) });
    const cmd: RoadCommand = { id: "cut", type: "road.remove", cells: [c(2, 0)] };
    const first = applyRoadTransaction(r.w, r.net, r.cargo, cmd);
    expect(first.invalidation?.held).toEqual([1]);
    const cBefore = roadCargoFingerprint(r.cargo);
    const replay = applyRoadTransaction(r.w, r.net, r.cargo, cmd);
    expect(replay.result).toEqual({ ok: true, revision: first.result.ok ? first.result.revision : -1 });
    expect(replay.invalidation).toBeNull();
    expect(roadCargoFingerprint(r.cargo)).toBe(cBefore);
  });

  it("a free reuse no-op does not invalidate paths", () => {
    const r = rig();
    buildCorridor(r);
    const batch = spawnCargoBatch(r.cargo, r.net, { resource: "scrap", amount: 7, from: c(0, 0), to: c(4, 0) });
    const tx = applyRoadTransaction(r.w, r.net, r.cargo, {
      id: "reuse",
      type: "road.place",
      cells: [c(0, 0), c(1, 0), c(2, 0), c(3, 0), c(4, 0)],
    });
    expect(tx.result.ok).toBe(true);
    expect(tx.invalidation).toBeNull();
    expect(batch.path?.topologyVersion).toBe(r.net.revision);
  });

  it("same seed + same commands reproduce identical cargo fingerprints", () => {
    const run = () => {
      const r = rig();
      buildLoop(r);
      spawnCargoBatch(r.cargo, r.net, { resource: "scrap", amount: 7, from: c(0, 0), to: c(2, 0) });
      applyRoadTransaction(r.w, r.net, r.cargo, { id: "cut", type: "road.remove", cells: [c(1, 0)] });
      tickRoadCargo(r.cargo, 2);
      return roadCargoFingerprint(r.cargo);
    };
    expect(run()).toBe(run());
  });
});