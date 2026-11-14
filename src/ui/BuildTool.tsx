/**
 * T11 (#138): the explicit build catalog and placement/rotation controls.
 *
 * Browse -> select -> ghost -> inspect -> explicit confirm (UI_CONTRACT build
 * state machine). The panel is a pure reader of the store's session-only build
 * slice: every validity/cost fact comes from `previewBuildPlacement`, which
 * runs the SAME `validatePlacement` the confirm transaction runs, so the ghost
 * can never promise a placement the ledger would refuse (U01). Nothing spends
 * on a tap, a drag or a key — only the Confirm face commits, and a refused
 * confirm keeps the ghost armed with the exact reason (U02/U03).
 *
 * The ghost is painted as a geometric SVG minimap in grid space (the owned
 * 24x24 start parcel): terrain, the rotated footprint, the frontage arrow and
 * the clearance verdict. No 3D projection is needed here, so no renderer
 * import — the scene.ts bridge remains the only sanctioned path to three
 * (boundary-3d). Clicking a grid cell only re-aims the ghost; it never buys.
 *
 * Locked entries stay on screen with their unlock reason; unaffordable entries
 * arm with the exact have/need shortfall. Both preserve the selection context
 * (U03). Repeat mode is an explicit toggle: each placement is validated and
 * charged separately, and Cancel never spends.
 *
 * Session-only, exactly like the store slice: nothing in this panel reads or
 * writes the save envelope (#148 owns persistence).
 */
import { memo, useEffect } from "react";
import type { BuildPlacementApi, GameStore } from "../app/store";
import { resourceWord, t } from "../game/content/strings";
import {
  BUILD_CATALOG,
  buildShortfalls,
  labelForBuildReject,
  previewBuildPlacement,
  unlockStatusFor,
  type BuildCatalogEntry,
  type BuildShortfall,
} from "../game/world/buildCatalog";
import { cellKey } from "../game/world/geometry";
import { terrainAt } from "../game/world/terrain";
import { START_SIZE, type Cell } from "../game/world/types";
import { Row } from "./panels/shared";
import { useRevision } from "./useGame";

/**
 * The build catalog's panel-stack sentinel. The six toolbar slots are fixed
 * (#135), so the catalog opens from its own lead-block entry face. -11 is the
 * next free negative sentinel after PANEL_REPORT (-9) and the road tool's
 * PANEL_ROAD (-10, #139); negative keys flow through App's hostKey untouched.
 */
export const PANEL_BUILD_TOOL = -11;

const BUILD_COPY = {
  title: "Build catalog",
  lead: "Select a building, inspect the ghost, then confirm one atomic placement.",
  browse: "Select a building to arm its placement ghost.",
  ghost: "Placement ghost",
  grid: "Yard grid — click a cell to aim the ghost (never places)",
  footprint: "Footprint",
  orientation: "Orientation",
  clearance: "Clearance",
  cost: "Cost",
  cell: "Cell",
  clear: "Clear",
  blocked: "Blocked",
  confirm: "Confirm placement",
  cancel: "Cancel",
  rotate: "Rotate (R)",
  repeat: "Repeat placement",
  repeatOn: "Repeat placement: on",
  readOnly: "Read-only tab — previews only; the owner tab confirms placements.",
  lockedHint: "Locked — the reason is printed on the card; your selection is kept.",
};

/** One cost line: materials in kit order, then credits when non-zero. */
function costText(entry: BuildCatalogEntry): string {
  const materials = entry.cost
    .map((item) => `${item.qty} ${resourceWord(item.resource)}`)
    .join(" + ");
  return entry.credits > 0 ? `${materials} · ${entry.credits} credits` : materials;
}

function shortfallText(shortfall: BuildShortfall): string {
  const word = shortfall.resource === "credits" ? "credits" : resourceWord(shortfall.resource);
  return `Need ${shortfall.need} ${word} (have ${shortfall.have})`;
}

/** Frontage as the player reads it: quarter turns plus the grid direction. */
function frontWord(front: { dx: number; dy: number }): string {
  if (front.dx === 1) return "+x";
  if (front.dx === -1) return "-x";
  if (front.dy === 1) return "+y";
  return "-y";
}

export const BuildToolPanel = memo(function BuildToolPanel(props: {
  build: GameStore & BuildPlacementApi;
  /** Reader tabs preview but never commit (the store gates writers too). */
  locked: boolean;
  onClose: () => void;
}) {
  const { build } = props;
  useRevision(build);
  const world = build.getBuildWorld();
  const placement = build.getBuildPlacement();
  const sim = build.getState();
  const unlockCtx = { research: sim.research ?? {}, milestoneTokens: world.milestoneTokens };
  const selected = placement.selectedAsset;
  const ghostCell = placement.ghostCell;
  const preview =
    selected !== null && ghostCell !== null
      ? previewBuildPlacement(world, selected, ghostCell, placement.rotation)
      : null;
  const selectedEntry =
    selected !== null ? BUILD_CATALOG.find((entry) => entry.id === selected) ?? null : null;

  // U02: R rotates the armed ghost, and text fields keep their own keys — the
  // same suppression rule the shell uses for its shortcuts.
  useEffect(() => {
    if (selected === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() !== "r") return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      build.rotateBuildAsset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [build, selected]);

  const statusText =
    placement.lastRejection !== null
      ? labelForBuildReject(placement.lastRejection)
      : props.locked
        ? BUILD_COPY.readOnly
        : preview !== null
          ? preview.reason
          : BUILD_COPY.browse;

  const nudge = (dx: number, dy: number) => {
    if (ghostCell === null) return;
    build.setBuildGhostCell({ x: ghostCell.x + dx, y: ghostCell.y + dy });
  };

  // The orientation arrow: a triangle from the footprint center toward the
  // front edge, in grid units (the SVG viewBox is one unit per cell).
  let arrowPoints: string | null = null;
  if (preview !== null && ghostCell !== null) {
    const cx = ghostCell.x + preview.footprint.w / 2;
    const cy = ghostCell.y + preview.footprint.h / 2;
    const reach = Math.min(preview.footprint.w, preview.footprint.h) / 2;
    const tipX = cx + preview.front.dx * reach;
    const tipY = cy + preview.front.dy * reach;
    const baseX = cx + preview.front.dx * reach * 0.2;
    const baseY = cy + preview.front.dy * reach * 0.2;
    const px = -preview.front.dy * 0.3;
    const py = preview.front.dx * 0.3;
    arrowPoints = `${tipX},${tipY} ${baseX + px},${baseY + py} ${baseX - px},${baseY - py}`;
  }

  const gridCells: Cell[] = [];
  for (let y = 0; y < START_SIZE; y += 1) {
    for (let x = 0; x < START_SIZE; x += 1) gridCells.push({ x, y });
  }

  return (
    <div className="panel panel--stack panel--build-tool" role="group" aria-label={BUILD_COPY.title}>
      <div className="panel__head">
        <h2 className="panel__title">{BUILD_COPY.title}</h2>
        <button className="icon-btn" onClick={props.onClose}>
          {t("btn.close")}
        </button>
      </div>
      <div className="panel__body">
        <p className="status-line">{BUILD_COPY.lead}</p>
        <p className="status-line" role="status" data-testid="build-status">
          {statusText}
        </p>
        <ul className="build-catalog" data-testid="build-catalog">
          {BUILD_CATALOG.map((entry) => {
            const unlock = unlockStatusFor(entry.id, unlockCtx);
            const shortfalls = buildShortfalls(world, entry.id);
            const affordable = shortfalls.length === 0;
            const isSelected = selected === entry.id;
            return (
              <li key={entry.id} className="build-catalog__item">
                <button
                  type="button"
                  className={
                    "build-card" +
                    (isSelected ? " build-card--selected" : "") +
                    (!unlock.unlocked ? " build-card--locked" : "")
                  }
                  data-asset={entry.id}
                  data-locked={unlock.unlocked ? "false" : "true"}
                  data-affordable={affordable ? "true" : "false"}
                  aria-pressed={isSelected}
                  aria-disabled={unlock.unlocked ? undefined : true}
                  disabled={props.locked}
                  onClick={() => build.selectBuildAsset(entry.id)}
                >
                  <span className="build-card__name">{entry.name}</span>
                  <span className="build-card__foot">
                    {entry.footprint.w}×{entry.footprint.h}
                  </span>
                  <span className="build-card__cost">{costText(entry)}</span>
                  {!unlock.unlocked ? (
                    <span className="build-card__reason" data-testid={`build-lock-${entry.id}`}>
                      {unlock.reason}
                    </span>
                  ) : null}
                  {unlock.unlocked && !affordable ? (
                    <span className="build-card__reason" data-testid={`build-short-${entry.id}`}>
                      {shortfalls.map(shortfallText).join("; ")}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
        {preview !== null && ghostCell !== null && selectedEntry !== null ? (
          <section className="build-ghost" aria-label={BUILD_COPY.ghost} data-testid="build-ghost">
            <svg
              className="build-grid"
              viewBox={`0 0 ${START_SIZE} ${START_SIZE}`}
              role="img"
              aria-label={BUILD_COPY.grid}
              data-testid="build-grid"
            >
              {gridCells.map((cell) => (
                <rect
                  key={cellKey(cell)}
                  x={cell.x}
                  y={cell.y}
                  width={1}
                  height={1}
                  className={`build-grid__cell build-grid__cell--${terrainAt(world, cell.x, cell.y)}`}
                  data-cell={`${cell.x},${cell.y}`}
                  onClick={() => build.setBuildGhostCell(cell)}
                />
              ))}
              {preview.cells.map((cell) => (
                <rect
                  key={`foot-${cellKey(cell)}`}
                  x={cell.x}
                  y={cell.y}
                  width={1}
                  height={1}
                  className="build-grid__foot"
                  data-valid={preview.valid ? "true" : "false"}
                />
              ))}
              {arrowPoints !== null ? (
                <polygon
                  className="build-grid__arrow"
                  points={arrowPoints}
                  data-testid="build-arrow"
                  aria-hidden="true"
                />
              ) : null}
            </svg>
            <dl>
              <Row
                label={BUILD_COPY.footprint}
                value={
                  <span data-testid="build-footprint">
                    {preview.footprint.w}×{preview.footprint.h}
                  </span>
                }
              />
              <Row
                label={BUILD_COPY.orientation}
                value={
                  <span data-testid="build-orientation">
                    {placement.rotation}° ({frontWord(preview.front)})
                  </span>
                }
              />
              <Row
                label={BUILD_COPY.clearance}
                value={
                  <span
                    data-testid="build-clearance"
                    data-valid={preview.valid ? "true" : "false"}
                  >
                    {preview.valid ? BUILD_COPY.clear : BUILD_COPY.blocked}
                  </span>
                }
              />
              <Row
                label={BUILD_COPY.cost}
                value={<span data-testid="build-cost">{costText(selectedEntry)}</span>}
              />
              <Row label={BUILD_COPY.cell} value={`(${ghostCell.x}, ${ghostCell.y})`} />
            </dl>
            <p className="status-line" data-testid="build-reason">
              {preview.reason}
            </p>
            <div className="build-nudge" role="group" aria-label="Nudge ghost">
              <button
                type="button"
                className="icon-btn"
                aria-label="Nudge ghost up"
                disabled={props.locked}
                onClick={() => nudge(0, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label="Nudge ghost left"
                disabled={props.locked}
                onClick={() => nudge(-1, 0)}
              >
                ←
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label="Nudge ghost right"
                disabled={props.locked}
                onClick={() => nudge(1, 0)}
              >
                →
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label="Nudge ghost down"
                disabled={props.locked}
                onClick={() => nudge(0, 1)}
              >
                ↓
              </button>
            </div>
          </section>
        ) : null}
        <div className="build-controls">
          <button
            type="button"
            className="icon-btn"
            data-testid="build-rotate"
            aria-label={BUILD_COPY.rotate}
            disabled={props.locked || selected === null}
            onClick={() => build.rotateBuildAsset()}
          >
            {BUILD_COPY.rotate}
          </button>
          <button
            type="button"
            className="icon-btn"
            data-testid="build-repeat"
            aria-pressed={placement.repeat}
            aria-label={placement.repeat ? BUILD_COPY.repeatOn : BUILD_COPY.repeat}
            disabled={props.locked}
            onClick={() => build.toggleBuildRepeat()}
          >
            {BUILD_COPY.repeat}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            data-testid="build-confirm"
            disabled={props.locked || preview === null || !preview.valid}
            onClick={() => build.confirmBuildPlacement()}
          >
            {BUILD_COPY.confirm}
          </button>
          <button
            type="button"
            className="btn"
            data-testid="build-cancel"
            disabled={selected === null}
            onClick={() => build.cancelBuildPlacement()}
          >
            {BUILD_COPY.cancel}
          </button>
        </div>
      </div>
    </div>
  );
});