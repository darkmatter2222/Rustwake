import { memo, useEffect, useRef, useState, type ReactNode } from "react";
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
 * RW3D #135 (U03/U04): the ONE panel host. Exactly one major surface paints at
 * a time — a right-docked inspector on desktop, a bottom sheet on phones, a
 * compact side drawer on short landscape (the CSS owns which, from the same
 * breakpoints the camera fit measures). The host owns the stack chrome: a Back
 * face whenever the stack is deeper than one layer, and the sheet expand /
 * collapse toggle on phones. Focus enters the host when a layer opens and
 * returns to the opener when the last layer closes, so keyboard and switch
 * users never drop to the body.
 */
export const PanelHost = memo(function PanelHost(props: {
  desktop: boolean;
  /** Top of the panel stack, or null when no panel is painted. */
  activeKey: number | null;
  depth: number;
  expanded: boolean;
  onBack: () => void;
  onToggleExpand: () => void;
  children: ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const prevKeyRef = useRef<number | null>(null);

  useEffect(() => {
    const prev = prevKeyRef.current;
    prevKeyRef.current = props.activeKey;
    if (props.activeKey !== null) {
      if (prev === null) {
        openerRef.current = (document.activeElement as HTMLElement | null) ?? null;
      }
      // Focus enters the panel layer on every top change. A panel that focused
      // its own control on mount (the report's Resume face) keeps it: the host
      // only takes focus when nothing inside already holds it.
      const host = hostRef.current;
      if (host && !host.contains(document.activeElement)) host.focus();
      return;
    }
    if (prev !== null) {
      // The stack emptied: restore the opener, else the first enabled toolbar
      // destination. Hidden/disconnected openers are skipped, never focused.
      const opener = openerRef.current;
      const usable = (el: HTMLElement | null): el is HTMLElement => {
        if (!el || !el.isConnected || (el as HTMLButtonElement).disabled) return false;
        const cs = getComputedStyle(el);
        return cs.display !== "none" && cs.visibility !== "hidden";
      };
      const fallback = document.querySelector<HTMLElement>(".toolbar__btn:not([disabled])");
      const target = usable(opener) ? opener : usable(fallback) ? fallback : null;
      if (target && typeof target.focus === "function") target.focus();
      openerRef.current = null;
    }
  }, [props.activeKey]);

  if (props.activeKey === null) return null;
  const sheet = !props.desktop;
  return (
    <div
      ref={hostRef}
      tabIndex={-1}
      data-depth={props.depth}
      className={
        "shell-host " +
        (props.desktop ? "shell-inspector" : "shell-sheet") +
        (sheet && props.expanded ? " shell-sheet--expanded" : "")
      }
    >
      <div className="shell-host__bar">
        {props.depth > 1 ? (
          <button
            type="button"
            className="icon-btn shell-host__back"
            aria-label={SHELL_COPY.backPanel}
            onClick={props.onBack}
          >
            {SHELL_COPY.back}
          </button>
        ) : (
          <span className="shell-host__spacer" aria-hidden="true" />
        )}
        {sheet ? (
          <button
            type="button"
            className="icon-btn shell-host__expand"
            aria-expanded={props.expanded}
            aria-label={props.expanded ? SHELL_COPY.collapseSheet : SHELL_COPY.expandSheet}
            onClick={props.onToggleExpand}
          >
            {props.expanded ? "–" : "+"}
          </button>
        ) : null}
      </div>
      {props.children}
    </div>
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