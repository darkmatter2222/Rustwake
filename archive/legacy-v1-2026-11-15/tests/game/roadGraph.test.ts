/**
 * Road graph primitives + topology-version semantics (issue #139, RW3D T12).
 * Deterministic seed 139; the start parcel is flattened as a test fixture so
 * every scenario is reproducible without depending on terrain noise.
 */
import { describe, expect, it } from "vitest";
import { createWorld, terrainIndex } from "../../src/game/world/terrain";
import type { WorldState } from "../../src/game/world/types";
import { worldFingerprint } from "../../src/game/world/transactions";
import {
  canTraverse,
  createRoadNetwork,
  isAdjacent,
  roadDegree,
  roadEdgeKey,
  roadFingerprint,
  roadNeighbors,
  roadNodes,
  roadWalkValid,
  type RoadNetworkState,
} from "../../src/game/world/roadGraph";
import { applyRoadCommand, type RoadCommand } from "../../src/game/world/roadTool";
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

function placeRoad(
  w: WorldState,
  net: RoadNetworkState,
  id: string,
  cells: Cell[],
  lanes?: 1 | 2,
) {
  const cmd: RoadCommand = { id, type: "road.place", cells, ...(lanes ? { lanes } : {}) };
  const result = applyRoadCommand(w, net, cmd);
  if (!result.ok) throw new Error(`setup place failed: ${JSON.stringify(result.rejection)}`);
  return result;
}

const c = (x: number, y: number): Cell => ({ x, y });

describe("road graph primitives", () => {
  it("starts empty at schema version 1, revision 0", () => {
    const net = createRoadNetwork();
    expect(net.schemaVersion).toBe(1);
    expect(net.revision).toBe(0);
    expect(Object.keys(net.edges)).toHaveLength(0);
    expect(Object.keys(net.cells)).toHaveLength(0);
  });

  it("edge keys are canonical and symmetric", () => {
    expect(roadEdgeKey(c(2, 2), c(3, 2))).toBe(roadEdgeKey(c(3, 2), c(2, 2)));
    expect(roadEdgeKey(c(2, 2), c(3, 2))).toBe("2,2|3,2");
  });

  it("adjacency is orthogonal only", () => {
    expect(isAdjacent(c(2, 2), c(3, 2))).toBe(true);
    expect(isAdjacent(c(2, 2), c(2, 3))).toBe(true);
    expect(isAdjacent(c(2, 2), c(3, 3))).toBe(false);
    expect(isAdjacent(c(2, 2), c(2, 2))).toBe(false);
    expect(isAdjacent(c(2, 2), c(4, 2))).toBe(false);
  });

  it("a placed route stores one edge per step and a ledger per cell", () => {
    const w = flatWorld();
    const net = createRoadNetwork();
    const result = placeRoad(w, net, "r1", [c(2, 2), c(3, 2), c(4, 2)]);
    expect(result.revision).toBe(1);
    expect(net.revision).toBe(1);
    expect(Object.keys(net.edges)).toHaveLength(2);
    expect(Object.keys(net.cells)).toHaveLength(3);
    expect(net.cells["2,2"].paidScrap).toBe(5);
    expect(roadDegree(net, c(3, 2))).toBe(2);
    expect(roadWalkValid(net, [c(2, 2), c(3, 2), c(4, 2)])).toBe(true);
  });

  it("two-way edges traverse both directions; one-way respects flow", () => {
    const w = flatWorld();
    const net = createRoadNetwork();
    placeRoad(w, net, "r1", [c(2, 2), c(3, 2)]);
    const edge = net.edges[roadEdgeKey(c(2, 2), c(3, 2))];
    expect(canTraverse(edge, c(2, 2), c(3, 2))).toBe(true);
    expect(canTraverse(edge, c(3, 2), c(2, 2))).toBe(true);
    edge.direction = "one-way"; // flow is canonical a -> b = +x
    expect(canTraverse(edge, c(2, 2), c(3, 2))).toBe(true);
    expect(canTraverse(edge, c(3, 2), c(2, 2))).toBe(false);
    expect(roadNeighbors(net, c(3, 2))).toEqual([]);
    expect(roadNeighbors(net, c(2, 2))).toEqual([c(3, 2)]);
    expect(roadWalkValid(net, [c(3, 2), c(2, 2)])).toBe(false);
    expect(roadWalkValid(net, [c(2, 2), c(3, 2)])).toBe(true);
  });

  it("derives junction and endpoint nodes from edges", () => {
    const w = flatWorld();
    const net = createRoadNetwork();
    placeRoad(w, net, "h", [c(2, 5), c(3, 5), c(4, 5), c(5, 5), c(6, 5)]);
    placeRoad(w, net, "v", [c(4, 3), c(4, 4), c(4, 5), c(4, 6), c(4, 7)]);
    const nodes = roadNodes(net);
    const junction = nodes.find((n) => n.cell.x === 4 && n.cell.y === 5);
    expect(junction).toEqual({ cell: c(4, 5), kind: "junction", degree: 4 });
    const endpoints = nodes.filter((n) => n.kind === "endpoint").map((n) => `${n.cell.x},${n.cell.y}`);
    expect(endpoints.sort()).toEqual(["2,5", "4,3", "4,7", "6,5"]);
    // Degree-2 through cells are not nodes.
    expect(nodes.some((n) => n.cell.x === 3 && n.cell.y === 5)).toBe(false);
  });

  it("walk validation rejects empty and discontiguous walks", () => {
    const w = flatWorld();
    const net = createRoadNetwork();
    placeRoad(w, net, "r1", [c(2, 2), c(3, 2), c(4, 2)]);
    expect(roadWalkValid(net, [])).toBe(false);
    expect(roadWalkValid(net, [c(2, 2)])).toBe(true);
    expect(roadWalkValid(net, [c(2, 2), c(4, 2)])).toBe(false);
    expect(roadWalkValid(net, [c(2, 2), c(3, 3)])).toBe(false);
  });
});

describe("topology version semantics", () => {
  it("a rejected command leaves revision and both fingerprints untouched", () => {
    const w = flatWorld();
    const net = createRoadNetwork();
    placeRoad(w, net, "r1", [c(2, 2), c(3, 2)]);
    const wBefore = worldFingerprint(w);
    const nBefore = roadFingerprint(net);
    const result = applyRoadCommand(w, net, {
      id: "bad",
      type: "road.place",
      cells: [c(5, 5), c(7, 7)],
    });
    expect(result.ok).toBe(false);
    expect(net.revision).toBe(1);
    expect(worldFingerprint(w)).toBe(wBefore);
    expect(roadFingerprint(net)).toBe(nBefore);
  });

  it("replaying a command id returns the original revision without mutation", () => {
    const w = flatWorld();
    const net = createRoadNetwork();
    const cmd: RoadCommand = { id: "r1", type: "road.place", cells: [c(2, 2), c(3, 2), c(4, 2)] };
    const first = applyRoadCommand(w, net, cmd);
    expect(first).toEqual({ ok: true, revision: 1 });
    const wBefore = worldFingerprint(w);
    const nBefore = roadFingerprint(net);
    const replay = applyRoadCommand(w, net, cmd);
    expect(replay).toEqual({ ok: true, revision: 1 });
    expect(worldFingerprint(w)).toBe(wBefore);
    expect(roadFingerprint(net)).toBe(nBefore);
    expect(w.stock.scrap).toBe(1000 - 15);
  });

  it("a pure reuse no-op does not bump the topology version or charge", () => {
    const w = flatWorld();
    const net = createRoadNetwork();
    placeRoad(w, net, "r1", [c(2, 2), c(3, 2), c(4, 2)]);
    const scrap = w.stock.scrap;
    const result = placeRoad(w, net, "r2", [c(2, 2), c(3, 2), c(4, 2)]);
    expect(result.revision).toBe(1); // unchanged: no topology edit
    expect(net.revision).toBe(1);
    expect(w.stock.scrap).toBe(scrap);
  });

  it("same seed + same commands reproduce identical fingerprints", () => {
    const run = () => {
      const w = flatWorld();
      const net = createRoadNetwork();
      placeRoad(w, net, "h", [c(2, 5), c(3, 5), c(4, 5), c(5, 5)]);
      placeRoad(w, net, "v", [c(4, 3), c(4, 4), c(4, 5), c(4, 6)]);
      placeRoad(w, net, "up", [c(2, 5), c(3, 5), c(4, 5)], 2);
      return { w: worldFingerprint(w), n: roadFingerprint(net) };
    };
    expect(run()).toEqual(run());
  });
});