/**
 * T12 (#139): the atomic road tool panel.
 *
 * One draft = one transaction. The panel derives an orthogonal route from two
 * integer cells, asks the store for the PURE preview (route, cost, crossings,
 * bay sockets, typed rejection) and only spends on an explicit Confirm —
 * `commitRoad` is the single atomic entry point (world ledger + network +
 * cargo paths). Cancel clears the draft without any command. A rejected or
 * unaffordable draft disables Confirm and states the recovery (U01); a
 * read-only tab can preview but never commit (the store gates writers too).
 *
 * The ghost is painted as a geometric SVG minimap in grid space (the yard's
 * owned 24x24 parcel): terrain, existing road, the draft route and bay socket
 * approaches. No 3D projection is needed here, so no renderer import — the
 * scene.ts bridge remains the only sanctioned path to three (boundary-3d).
 *
 * Session-only, exactly like the store slice: nothing in this panel reads or
 * writes the save envelope (#148 owns persistence).
 */
import { memo, useState } from "react";
import type { GameStore, RoadApi } from "../app/store";
import { t } from "../game/content/strings";
import { cellKey } from "../game/world/geometry";
import { roadCells, type RoadLanes } from "../game/world/roadGraph";
import type { RoadCommand, RoadRejection } from "../game/world/roadTool";
import { terrainAt } from "../game/world/terrain";
import { START_SIZE, type Cell } from "../game/world/types";
import { Row, nextId } from "./panels/shared";
import { useRevision } from "./useGame";

/**
 * The road destination's panel-stack sentinel. The six toolbar slots are fixed
 * (#135), so the road tool opens from its own lead-block entry face; -10 is the
 * next free negative sentinel after PANEL_REPORT (-9). Negative keys flow
 * through App's hostKey untouched.
 */
export const PANEL_ROAD = -10;

const ROAD_COPY = {
  title: "Road tool",
  lead: "Draft a route, review the ghost, then confirm one atomic transaction.",
  place: "Place",
  remove: "Dismantle",
  lanes: "Lanes",
  from: "From",
  to: "To",
  repeat: "Repeat placement (chain the next segment from this endpoint)",
  route: "Route",
  newCells: "New cells",
  reusedCells: "Reused (free)",
  upgradedCells: "Lane upgrades",
  cost: "Cost",
  crossings: "Crossings",
  sockets: "Bay sockets",
  targets: "Road cells cut",
  edges: "Edges removed",
  refundCells: "Refunded cells",
  refund: "Refund",
  disconnected: "Bays disconnected",
  confirmPlace: "Confirm road placement",
  confirmRemove: "Confirm road removal",
  cancel: "Cancel draft",
  locked: "Read-only: another tab owns the yard. Take over to build roads.",
  empty: "Enter two integer cells to draft a route.",
  ready: "Ghost valid — confirm to commit.",
  cargo: "Cargo batches",
  cargoEmpty: "No cargo batches yet.",
  held: "held",
  moving: "moving",
  delivered: "delivered",
} as const;

/**
 * Pure orthogonal L-route, horizontal first: walk x at the start row, then y
 * at the goal column. Integer cells only; a trivial from == to draft yields a
 * single cell (the preview rejects it as too-short, with a typed reason).
 */
export function orthogonalRoute(from: Cell, to: Cell): Cell[] {
  const route: Cell[] = [];
  const stepX = Math.sign(to.x - from.x);
  const stepY = Math.sign(to.y - from.y);
  for (let x = from.x; ; x += stepX) {
    route.push({ x, y: from.y });
    if (x === to.x) break;
  }
  for (let y = from.y + stepY; ; y += stepY) {
    route.push({ x: to.x, y });
    if (y === to.y) break;
  }
  return route;
}

/** Typed rejection -> one human line with the recovery path (U01). */
export function roadRejectionLabel(rejection: RoadRejection): string {
  switch (rejection.reason) {
    case "invalid-path":
      return `Route rejected (${rejection.detail}): need at least two adjacent integer cells.`;
    case "invalid-lanes":
      return "Lanes must be 1 or 2.";
    case "outside-land":
      return "Route leaves owned land — re-aim inside the yard or buy the parcel.";
    case "terrain-unsupported":
      return `Terrain is ${rejection.terrain} at (${rejection.cells[0].x}, ${rejection.cells[0].y}) — roads need flat ground.`;
    case "occupied":
      return `Cell (${rejection.cells[0].x}, ${rejection.cells[0].y}) is occupied by building #${rejection.occupantId}.`;
    case "keepout":
      return `Route crosses crane #${rejection.craneId}'s keep-out zone.`;
    case "lane-downgrade":
      return `Existing road carries ${rejection.have} lanes — it cannot be downgraded to ${rejection.want}.`;
    case "insufficient-material":
      return `Need ${rejection.need} ${rejection.resource} · have ${rejection.have} — salvage or sell to recover.`;
    case "no-road":
      return "No road on the selected cells.";
    case "read-only":
      return "Read-only: another tab owns the yard. Take over to build roads.";
  }
}

function parseCell(x: string, y: string): Cell | null {
  if (x.trim() === "" || y.trim() === "") return null;
  const nx = Number(x);
  const ny = Number(y);
  if (!Number.isInteger(nx) || !Number.isInteger(ny)) return null;
  return { x: nx, y: ny };
}

const CELL_PX = 10;
const MAP_PX = START_SIZE * CELL_PX;

/**
 * Geometric ghost minimap over the owned parcel [0, START_SIZE)^2: non-flat
 * terrain, existing road cells, the draft route (green when valid, red when
 * blocked; reused cells outlined) and bay socket approaches. Pure grid-space
 * SVG — the numerical rows above carry the authoritative preview.
 */
function GhostMap(props: {
  road: RoadApi;
  route: Cell[] | null;
  valid: boolean;
  reused: Set<string>;
}) {
  const world = props.road.getWorld();
  const net = props.road.getRoadNetwork();
  const terrain: { x: number; y: number; kind: string }[] = [];
  for (let y = 0; y < START_SIZE; y += 1) {
    for (let x = 0; x < START_SIZE; x += 1) {
      const kind = terrainAt(world, x, y);
      if (kind !== undefined && kind !== "flat") terrain.push({ x, y, kind });
    }
  }
  const routeKeys = new Set((props.route ?? []).map(cellKey));
  const ghostFill = props.valid ? "#3fae5a" : "#c2453a";
  return (
    <svg
      className="road-map"
      viewBox={`0 0 ${MAP_PX} ${MAP_PX}`}
      width={MAP_PX}
      height={MAP_PX}
      role="img"
      aria-label={`Road ghost preview: ${props.route?.length ?? 0} cells, ${props.valid ? "valid" : "blocked"}`}
    >
      <rect x={0} y={0} width={MAP_PX} height={MAP_PX} fill="#1d232b" />
      {terrain.map((c) => (
        <rect
          key={`t${c.x},${c.y}`}
          x={c.x * CELL_PX}
          y={c.y * CELL_PX}
          width={CELL_PX}
          height={CELL_PX}
          fill={c.kind === "salvage" ? "#8a6d2f" : "#4a4f57"}
        />
      ))}
      {roadCells(net).map((c) => (
        <rect
          key={`r${cellKey(c)}`}
          x={c.x * CELL_PX + 1}
          y={c.y * CELL_PX + 1}
          width={CELL_PX - 2}
          height={CELL_PX - 2}
          fill="#6b7684"
        />
      ))}
      {(props.route ?? []).map((c) => {
        const reused = props.reused.has(cellKey(c));
        return (
          <rect
            key={`g${cellKey(c)}`}
            x={c.x * CELL_PX + 1}
            y={c.y * CELL_PX + 1}
            width={CELL_PX - 2}
            height={CELL_PX - 2}
            fill={reused ? "none" : ghostFill}
            stroke={ghostFill}
            strokeWidth={reused ? 1.5 : 0}
            opacity={0.85}
          />
        );
      })}
      {props.road.getRoadSockets().map((link) => (
        <circle
          key={`s${link.buildingId}-${link.socket}`}
          cx={link.approach.x * CELL_PX + CELL_PX / 2}
          cy={link.approach.y * CELL_PX + CELL_PX / 2}
          r={2.5}
          fill={link.connected || routeKeys.has(cellKey(link.approach)) ? "#e0b23f" : "none"}
          stroke="#e0b23f"
          strokeWidth={1}
        />
      ))}
    </svg>
  );
}

/**
 * The road destination. `locked` mirrors the store role for the visible
 * read-only context; the store itself writer-gates every commit regardless.
 */
export const RoadToolPanel = memo(function RoadToolPanel(props: {
  road: GameStore & RoadApi;
  locked: boolean;
  onClose: () => void;
}) {
  const { road, locked } = props;
  useRevision(road);
  const [mode, setMode] = useState<"place" | "remove">("place");
  const [lanes, setLanes] = useState<RoadLanes>(1);
  const [fromX, setFromX] = useState("8");
  const [fromY, setFromY] = useState("12");
  const [toX, setToX] = useState("14");
  const [toY, setToY] = useState("12");
  const [repeat, setRepeat] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const from = parseCell(fromX, fromY);
  const to = parseCell(toX, toY);
  const route = from !== null && to !== null ? orthogonalRoute(from, to) : null;
  const preview =
    route === null
      ? null
      : mode === "place"
        ? road.previewRoadPlace(route, lanes)
        : road.previewRoadRemove(route);
  const valid = preview !== null && preview.valid && !locked;
  const reused = new Set(
    preview !== null && preview.kind === "place" ? preview.reusedCells.map(cellKey) : []
  );
  const cargo = road.getRoadCargo();

  const onConfirm = () => {
    if (route === null || preview === null || !preview.valid || locked) return;
    const command: RoadCommand =
      mode === "place"
        ? { id: nextId("road"), type: "road.place", cells: route, lanes }
        : { id: nextId("road"), type: "road.remove", cells: route };
    const outcome = road.commitRoad(command);
    if (!outcome.result.ok) {
      setMessage(roadRejectionLabel(outcome.result.rejection));
      return;
    }
    if (preview.kind === "place") {
      setMessage(`Placed ${preview.route.length} cells · −${preview.costScrap} scrap`);
      if (repeat && from !== null && to !== null) {
        // Chain: the next segment starts where this one ended and keeps the
        // same displacement, so repeated confirms lay a continuous road.
        const last = route[route.length - 1];
        setFromX(String(last.x));
        setFromY(String(last.y));
        setToX(String(last.x + (to.x - from.x)));
        setToY(String(last.y + (to.y - from.y)));
      }
    } else {
      setMessage(`Dismantled · +${preview.refundScrap} scrap refund`);
    }
  };

  const onCancel = () => {
    // Cancel is pure draft retirement: no command, no spend, no topology edit.
    setFromX("");
    setFromY("");
    setToX("");
    setToY("");
    setMessage(null);
  };

  const status =
    message ??
    (locked
      ? ROAD_COPY.locked
      : preview === null
        ? ROAD_COPY.empty
        : preview.valid
          ? ROAD_COPY.ready
          : preview.rejection !== null
            ? roadRejectionLabel(preview.rejection)
            : ROAD_COPY.empty);

  return (
    <div className="panel panel--stack panel--road" role="group" aria-label={ROAD_COPY.title}>
      <div className="panel__head">
        <h2 className="panel__title">{ROAD_COPY.title}</h2>
        <button className="icon-btn" onClick={props.onClose}>
          {t("btn.close")}
        </button>
      </div>
      <div className="panel__body">
        <p className="status-line">{ROAD_COPY.lead}</p>
        {locked ? (
          <p className="status-line" role="status">
            {ROAD_COPY.locked}
          </p>
        ) : null}
        <div className="panel__row">
          <button
            className="icon-btn"
            aria-pressed={mode === "place"}
            onClick={() => setMode("place")}
          >
            {ROAD_COPY.place}
          </button>
          <button
            className="icon-btn"
            aria-pressed={mode === "remove"}
            onClick={() => setMode("remove")}
          >
            {ROAD_COPY.remove}
          </button>
          {mode === "place" ? (
            <>
              <button className="icon-btn" aria-pressed={lanes === 1} onClick={() => setLanes(1)}>
                1
              </button>
              <button className="icon-btn" aria-pressed={lanes === 2} onClick={() => setLanes(2)}>
                2
              </button>
            </>
          ) : null}
        </div>
        <div className="panel__row">
          <label>
            {ROAD_COPY.from} x{" "}
            <input
              type="number"
              step={1}
              value={fromX}
              aria-label="From x"
              onChange={(e) => setFromX(e.target.value)}
            />
          </label>
          <label>
            y{" "}
            <input
              type="number"
              step={1}
              value={fromY}
              aria-label="From y"
              onChange={(e) => setFromY(e.target.value)}
            />
          </label>
          <label>
            {ROAD_COPY.to} x{" "}
            <input
              type="number"
              step={1}
              value={toX}
              aria-label="To x"
              onChange={(e) => setToX(e.target.value)}
            />
          </label>
          <label>
            y{" "}
            <input
              type="number"
              step={1}
              value={toY}
              aria-label="To y"
              onChange={(e) => setToY(e.target.value)}
            />
          </label>
        </div>
        {mode === "place" ? (
          <label className="status-line">
            <input
              type="checkbox"
              checked={repeat}
              onChange={(e) => setRepeat(e.target.checked)}
            />{" "}
            {ROAD_COPY.repeat}
          </label>
        ) : null}
        <GhostMap road={road} route={route} valid={preview !== null && preview.valid} reused={reused} />
        <dl>
          {preview === null ? (
            <Row label={ROAD_COPY.route} value="—" />
          ) : preview.kind === "place" ? (
            <>
              <Row label={ROAD_COPY.route} value={`${preview.route.length} cells`} />
              <Row label={ROAD_COPY.newCells} value={preview.newCells.length} />
              <Row label={ROAD_COPY.reusedCells} value={preview.reusedCells.length} />
              <Row label={ROAD_COPY.upgradedCells} value={preview.upgradedCells.length} />
              <Row label={ROAD_COPY.cost} value={`${preview.costScrap} scrap`} />
              <Row label={ROAD_COPY.crossings} value={preview.crossings.length} />
              <Row label={ROAD_COPY.sockets} value={preview.sockets.length} />
            </>
          ) : (
            <>
              <Row label={ROAD_COPY.targets} value={preview.cells.length} />
              <Row label={ROAD_COPY.edges} value={preview.removedEdgeKeys.length} />
              <Row label={ROAD_COPY.refundCells} value={preview.refundCells.length} />
              <Row label={ROAD_COPY.refund} value={`+${preview.refundScrap} scrap`} />
              <Row label={ROAD_COPY.disconnected} value={preview.disconnected.length} />
            </>
          )}
        </dl>
        <p className="status-line" role="status">
          {status}
        </p>
        <div className="panel__row">
          <button
            className="icon-btn"
            aria-label={mode === "place" ? ROAD_COPY.confirmPlace : ROAD_COPY.confirmRemove}
            disabled={!valid}
            onClick={onConfirm}
          >
            {mode === "place"
              ? `${ROAD_COPY.place}${preview !== null && preview.kind === "place" ? ` · ${preview.costScrap} scrap` : ""}`
              : `${ROAD_COPY.remove}${preview !== null && preview.kind === "remove" ? ` · +${preview.refundScrap} scrap` : ""}`}
          </button>
          <button className="icon-btn" aria-label={ROAD_COPY.cancel} onClick={onCancel}>
            {ROAD_COPY.cancel}
          </button>
        </div>
        <p className="status-line">{ROAD_COPY.cargo}</p>
        {cargo.batches.length === 0 ? (
          <p className="status-line">{ROAD_COPY.cargoEmpty}</p>
        ) : (
          <ul className="shell-list">
            {cargo.batches.map((batch) => (
              <li key={batch.id} className="shell-list__item">
                <span className="shell-list__label">
                  #{batch.id} {batch.resource} ×{batch.amount} ·{" "}
                  {batch.phase === "held"
                    ? ROAD_COPY.held
                    : batch.phase === "moving"
                      ? ROAD_COPY.moving
                      : ROAD_COPY.delivered}
                  {batch.heldReason !== null ? (
                    <span className="status-line">
                      {batch.heldReason.kind === "no-route"
                        ? `no-route (${batch.heldReason.from.x}, ${batch.heldReason.from.y}) → (${batch.heldReason.to.x}, ${batch.heldReason.to.y})`
                        : `road-removed at (${batch.heldReason.at.x}, ${batch.heldReason.at.y})`}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
});