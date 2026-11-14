/**
 * Loading-bay approach sockets (issue #139, RW3D T12).
 * Expected approach cells are hand-derived from the #136 kit geometry
 * (integer mu, rotation convention 90: (x,z) -> (z,-x)), NOT recomputed with
 * the code under test, so the test is an independent check of the derivation.
 */
import { describe, expect, it } from "vitest";
import { createWorld, terrainIndex } from "../../src/game/world/terrain";
import type { WorldState } from "../../src/game/world/types";
import { applyWorldCommand } from "../../src/game/world/transactions";
import { advanceWorld } from "../../src/game/world/engine";
import { createRoadNetwork, type RoadNetworkState } from "../../src/game/world/roadGraph";
import { applyRoadCommand } from "../../src/game/world/roadTool";
import {
  roadSocketApproaches,
  roadSocketLinks,
  takesRoadLane,
} from "../../src/game/world/roadSockets";
import { WORLD_KIT } from "../../src/game/world/kit";
import type { Cell, Rotation } from "../../src/game/world/types";

const SEED = 139;

function flatWorld(): WorldState {
  const w = createWorld(SEED);
  for (let y = 0; y < 24; y += 1) {
    for (let x = 0; x < 24; x += 1) w.terrain[terrainIndex(x, y)] = "flat";
  }
  w.stock.scrap = 1000;
  w.stock.steel = 100;
  w.credits = 1000;
  return w;
}

const c = (x: number, y: number): Cell => ({ x, y });

function placeBuilding(w: WorldState, id: string, asset: string, x: number, y: number, rotation: Rotation = 0) {
  const result = applyWorldCommand(w, { id, type: "world.place", asset, cell: { x, y }, rotation });
  if (!result.ok) throw new Error(`setup building failed: ${JSON.stringify(result.rejection)}`);
}

function placeRoad(w: WorldState, net: RoadNetworkState, id: string, cells: Cell[]) {
  const result = applyRoadCommand(w, net, { id, type: "road.place", cells });
  if (!result.ok) throw new Error(`setup road failed: ${JSON.stringify(result.rejection)}`);
}

describe("socket kind filter", () => {
  it("only truck and road sockets take a road lane", () => {
    for (const asset of Object.values(WORLD_KIT)) {
      for (const socket of asset.sockets) {
        const expected = socket.kind === "truck" || socket.kind === "road";
        expect(takesRoadLane(socket)).toBe(expected);
      }
    }
  });
});

describe("warehouse bay approach cells across rotations", () => {
  // Warehouse 6x4 at (6,6); bays at local x = -1.55u / +1.55u, z = +2.15u.
  const cases: { rotation: Rotation; bay0: Cell; bay1: Cell }[] = [
    { rotation: 0, bay0: c(7, 10), bay1: c(10, 10) },
    { rotation: 90, bay0: c(10, 10), bay1: c(10, 7) },
    { rotation: 180, bay0: c(10, 5), bay1: c(7, 5) },
    { rotation: 270, bay0: c(5, 7), bay1: c(5, 10) },
  ];
  for (const { rotation, bay0, bay1 } of cases) {
    it(`rotation ${rotation}: bays approach ${JSON.stringify(bay0)} / ${JSON.stringify(bay1)}`, () => {
      const w = flatWorld();
      const net = createRoadNetwork();
      placeBuilding(w, "b1", "warehouse", 6, 6, rotation);
      advanceWorld(w, 60);
      const links = roadSocketLinks(net, w);
      expect(links.map((l) => l.socket)).toEqual(["bay0", "bay1"]);
      expect(links[0].approach).toEqual(bay0);
      expect(links[1].approach).toEqual(bay1);
      expect(links.every((l) => l.connected)).toBe(false);
    });
  }
});

describe("other road-taking assets", () => {
  it("depot service bay approaches the cell beyond its front face", () => {
    const w = flatWorld();
    const net = createRoadNetwork();
    placeBuilding(w, "d1", "depot", 14, 6);
    advanceWorld(w, 60);
    const links = roadSocketLinks(net, w);
    expect(links).toHaveLength(1);
    expect(links[0].socket).toBe("serviceBay");
    expect(links[0].approach).toEqual(c(16, 10));
  });

  it("wall_gate passage takes a road lane", () => {
    const w = flatWorld();
    const net = createRoadNetwork();
    placeBuilding(w, "g1", "wall_gate", 18, 14);
    advanceWorld(w, 60);
    const links = roadSocketLinks(net, w);
    expect(links).toHaveLength(1);
    expect(links[0].kind).toBe("road");
    expect(links[0].approach).toEqual(c(19, 15));
  });

  it("belt/pallet docks and socket-less assets are excluded", () => {
    const w = flatWorld();
    const net = createRoadNetwork();
    placeBuilding(w, "s1", "sorter", 2, 2);
    placeBuilding(w, "f1", "furnace", 6, 2);
    placeBuilding(w, "g1", "generator", 10, 2);
    advanceWorld(w, 60);
    expect(roadSocketLinks(net, w)).toEqual([]);
  });
});

describe("connection lifecycle", () => {
  it("construction sites do not accept cargo: links appear only on completion", () => {
    const w = flatWorld();
    const net = createRoadNetwork();
    placeBuilding(w, "b1", "warehouse", 6, 6);
    expect(roadSocketLinks(net, w)).toEqual([]);
    advanceWorld(w, 60);
    expect(roadSocketLinks(net, w)).toHaveLength(2);
  });

  it("connected flips when a road edge reaches the approach cell", () => {
    const w = flatWorld();
    const net = createRoadNetwork();
    placeBuilding(w, "b1", "warehouse", 6, 6);
    advanceWorld(w, 60);
    expect(roadSocketLinks(net, w).every((l) => !l.connected)).toBe(true);
    placeRoad(w, net, "lane", [c(7, 10), c(7, 11), c(7, 12)]);
    const links = roadSocketLinks(net, w);
    expect(links.find((l) => l.socket === "bay0")?.connected).toBe(true);
    expect(links.find((l) => l.socket === "bay1")?.connected).toBe(false);
  });

  it("approaches are sorted and deduped", () => {
    const w = flatWorld();
    const net = createRoadNetwork();
    placeBuilding(w, "b1", "warehouse", 6, 6);
    placeBuilding(w, "d1", "depot", 14, 6);
    advanceWorld(w, 60);
    const approaches = roadSocketApproaches(net, w);
    // Sorted by cell key STRING order ("10,10" < "16,10" < "7,10").
    expect(approaches).toEqual([c(10, 10), c(16, 10), c(7, 10)]);
  });
});