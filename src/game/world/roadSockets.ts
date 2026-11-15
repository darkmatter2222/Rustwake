/**
 * Loading-bay approach sockets for the road graph (issue #139, RW3D T12).
 *
 * The building kit (#136) declares every bay socket in local integer mu.
 * A road lane "connects" to a bay when a road edge touches the bay's APPROACH
 * cell: the grid cell just outside the front face at the socket's lateral
 * position. Approach cells are derived from the kit geometry on every read,
 * never stored, so a rotated or moved building can never leave a stale
 * connection behind.
 *
 * Only `truck` (warehouse bays, depot service bay) and `road` (wall_gate
 * passage) sockets take road lanes; `pallet`/`belt`/`cargo` docks are
 * forklift/belt interfaces, not road lanes.
 *
 * Pure and integer-only: no DOM, no wall-clock, no stored state.
 */
import { MU_PER_UNIT, type Cell, type PlacedBuilding, type Rotation, type WorldState } from "./types";
import { socketWorldMu } from "./geometry";
import { WORLD_KIT, type KitAsset, type KitSocket, type SocketKind, type WorldAssetId } from "./kit";
import { roadEdgesAt, type RoadNetworkState } from "./roadGraph";

/** Socket kinds whose approach takes a road lane. */
const ROAD_SOCKET_KINDS: readonly SocketKind[] = ["truck", "road"];

export function takesRoadLane(socket: KitSocket): boolean {
  return ROAD_SOCKET_KINDS.includes(socket.kind);
}

/**
 * The approach cell of one socket: the cell containing the socket's world
 * position. Every kit road/truck socket sits just outside the front face
 * (local z > footprint depth / 2), so this cell is always the first cell
 * beyond the footprint along the frontage direction at the socket's lateral
 * offset — the same cell the entrance corridor extends into.
 */
export function socketApproachCell(
  asset: KitAsset,
  cell: Cell,
  rotation: Rotation,
  socket: KitSocket,
): Cell {
  const [wx, wz] = socketWorldMu(asset, cell, rotation, socket);
  return { x: Math.floor(wx / MU_PER_UNIT), y: Math.floor(wz / MU_PER_UNIT) };
}

export interface RoadSocketLink {
  readonly buildingId: number;
  readonly asset: WorldAssetId;
  readonly socket: string;
  readonly kind: SocketKind;
  /** Grid cell a road edge must touch to serve this bay. */
  readonly approach: Cell;
  /** True when at least one road edge is incident to the approach cell. */
  readonly connected: boolean;
}

/**
 * Every road-taking bay of every COMPLETED building, in building-id then
 * kit-socket order (deterministic). Construction sites are excluded: a bay
 * under assembly does not accept cargo yet.
 */
export function roadSocketLinks(net: RoadNetworkState, world: WorldState): RoadSocketLink[] {
  const out: RoadSocketLink[] = [];
  const buildings = [...world.buildings].sort((a, b) => a.id - b.id);
  for (const building of buildings) {
    const asset = WORLD_KIT[building.asset as WorldAssetId];
    if (asset === undefined) continue;
    for (const socket of asset.sockets) {
      if (!takesRoadLane(socket)) continue;
      const approach = socketApproachCell(asset, building.cell, building.rotation, socket);
      out.push({
        buildingId: building.id,
        asset: asset.id,
        socket: socket.name,
        kind: socket.kind,
        approach,
        connected: roadEdgesAt(net, approach).length > 0,
      });
    }
  }
  return out;
}

/**
 * Issue #217 (session-only): the cell a completed building registers with the
 * logistics ledger. It is the approach cell of the building's FIRST road-taking
 * socket in kit-socket order (deterministic for multi-socket buildings such as
 * the warehouse's bay0/bay1), falling back to the footprint-origin cell when the
 * asset declares no road lane. Registering at the approach cell keeps the bay
 * editor's approach-cell capacity coherent with the cell logistics jobs lease
 * (#141 leases bays at sourceCell/destCell). Pure: derived from kit geometry on
 * every read, never stored, so a moved or rotated building never leaves a stale
 * cell behind. The #148 cutover owns persistence; nothing here is serialized.
 */
export function buildingLogisticsCell(building: PlacedBuilding): Cell {
  const asset = WORLD_KIT[building.asset as WorldAssetId];
  if (asset !== undefined) {
    for (const socket of asset.sockets) {
      if (takesRoadLane(socket)) {
        return socketApproachCell(asset, building.cell, building.rotation, socket);
      }
    }
  }
  return { x: building.cell.x, y: building.cell.y };
}

/** True when a completed building declares at least one road-taking socket. */
export function buildingTakesRoadLane(building: PlacedBuilding): boolean {
  const asset = WORLD_KIT[building.asset as WorldAssetId];
  if (asset === undefined) return false;
  return asset.sockets.some(takesRoadLane);
}

/** Approach cells of all road-taking bays, sorted by cell key (deduped). */
export function roadSocketApproaches(net: RoadNetworkState, world: WorldState): Cell[] {
  const seen = new Map<string, Cell>();
  for (const link of roadSocketLinks(net, world)) {
    const key = `${link.approach.x},${link.approach.y}`;
    if (!seen.has(key)) seen.set(key, link.approach);
  }
  return [...seen.values()].sort((a, b) =>
    `${a.x},${a.y}` < `${b.x},${b.y}` ? -1 : `${a.x},${a.y}` > `${b.x},${b.y}` ? 1 : 0,
  );
}