import { memo, useEffect, useState } from "react";
import {
  PANEL_FLEET,
  PANEL_MAP,
  PANEL_RESEARCH,
  PANEL_ROUTES,
  PANEL_TRADE,
  SHELL_DESKTOP_QUERY,
  SHELL_SLOTS,
  type ShellSlot,
} from "./layout";
import { DESTINATION_LABEL, DESTINATION_REASON, SHELL_COPY } from "./copy";
import "./shell.css";

/**
 * Whether the viewport is in desktop mode, from the same query the CSS paints
 * with. On desktop the inspector docks right and the toolbar centres; below it
 * the panels are bottom sheets (portrait) or a compact side drawer (landscape).
 * The toolbar itself is persistent on every viewport — it is the navigation
 * spine, not a hidden duplicate of the dock.
 */
export function useDesktopMode(): boolean {
  const [desktop, setDesktop] = useState<boolean>(
    () => typeof window !== "undefined" && !!window.matchMedia?.(SHELL_DESKTOP_QUERY).matches
  );
  useEffect(() => {
    const mql = window.matchMedia?.(SHELL_DESKTOP_QUERY);
    if (!mql) return;
    const onChange = () => setDesktop(mql.matches);
    onChange();
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);
  return desktop;
}

/**
 * RW3D #135 (U03): the persistent six-destination toolbar. Build / Routes /
 * Fleet / Research / Trade / Map, in painted order, on every viewport. A
 * destination the yard has not earned yet stays on screen with its reason
 * printed, never hidden. Navigation issues no game command — it only selects a
 * panel (or arms the build ghost); the simulation stays the single authority.
 */
export const Toolbar = memo(function Toolbar(props: {
  research: boolean;
  selected: number | null;
  buildActive: boolean;
  onSlot: (slot: ShellSlot) => void;
}) {
  const active: Record<ShellSlot, boolean> = {
    build: props.buildActive,
    routes: props.selected === PANEL_ROUTES,
    fleet: props.selected === PANEL_FLEET,
    research: props.selected === PANEL_RESEARCH,
    trade: props.selected === PANEL_TRADE,
    map: props.selected === PANEL_MAP,
  };
  const reason = (slot: ShellSlot): string | null => {
    if (slot === "research" && !props.research) return DESTINATION_REASON.research;
    return null;
  };
  return (
    <nav className="toolbar" aria-label={SHELL_COPY.destinations}>
      {SHELL_SLOTS.map((slot, index) => {
        const why = reason(slot);
        return (
          <button
            key={slot}
            type="button"
            className={"toolbar__btn" + (active[slot] ? " toolbar__btn--active" : "")}
            data-slot={slot}
            aria-pressed={active[slot]}
            disabled={why !== null}
            onClick={() => props.onSlot(slot)}
          >
            <span className="toolbar__label">{DESTINATION_LABEL[slot]}</span>
            {why ? <span className="toolbar__reason">{why}</span> : null}
            <span className="toolbar__key" aria-hidden="true">
              {index + 1}
            </span>
          </button>
        );
      })}
    </nav>
  );
});

/**
 * UI-RESET-50: the visible camera controls — zoom in, zoom out, reset view.
 * Plain buttons with real camera state behind them (App steers the same
 * clamped math the wheel and pinch use). Every face keeps the 44 px floor, and
 * the camera fit reserves their gutter, so no yard cell hides under a control.
 */
export const ShellZoom = memo(function ShellZoom(props: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}) {
  return (
    <div className="shell-zoom" role="group" aria-label="Camera zoom">
      <button
        type="button"
        className="shell-zoom__face"
        aria-label="Zoom in"
        onClick={props.onZoomIn}
      >
        +
      </button>
      <button
        type="button"
        className="shell-zoom__face"
        aria-label="Zoom out"
        onClick={props.onZoomOut}
      >
        &minus;
      </button>
      <button
        type="button"
        className="shell-zoom__face shell-zoom__face--reset"
        aria-label="Reset view"
        onClick={props.onReset}
      >
        Recenter
      </button>
    </div>
  );
});