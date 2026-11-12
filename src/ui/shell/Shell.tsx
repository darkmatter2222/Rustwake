import { forwardRef, useEffect, useRef, useState } from "react";
import { t } from "../../game/content/strings";
import { RESET_COPY } from "../home/copy";
import { SHELL_RAIL_QUERY, SHELL_SLOTS, type ShellSlot } from "./layout";
import "./shell.css";

/**
 * Whether the viewport is in rail mode, from the same query the CSS paints
 * with. The rail renders only here — in phone/column modes the dock row and
 * the Menu face own the destinations, so no hidden duplicate faces exist.
 */
export function useRailMode(): boolean {
  const [rail, setRail] = useState<boolean>(
    () => typeof window !== "undefined" && !!window.matchMedia?.(SHELL_RAIL_QUERY).matches
  );
  useEffect(() => {
    const mql = window.matchMedia?.(SHELL_RAIL_QUERY);
    if (!mql) return;
    const onChange = () => setRail(mql.matches);
    onChange();
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);
  return rail;
}

/**
 * UI-RESET-49 (G2): the shell's own faces. The dock keeps the primary action
 * band; these components own the five destinations (rail on wide/landscape,
 * a thumb-zone Menu face on phones) and the one bounded Menu sheet.
 *
 * Every face here is a plain button with real state behind it — no panel is
 * rebuilt (that is #50+), and no game command is issued by navigation itself.
 */

const SLOT_LABEL: Record<ShellSlot, string> = {
  yard: t("btn.yard"),
  build: t("btn.build"),
  store: t("btn.store"),
  research: t("btn.research"),
  // No `btn.menu` key exists in strings.ts (and this lane must not edit it);
  // the i18n census only forbids raw key patterns, so the literal is safe.
  menu: "Menu",
};

/**
 * R1: the destination rail. Five fixed slots in painted order; a slot the yard
 * has not earned yet stays on screen with its reason printed (E8), never hidden.
 */
export function ShellRail(props: {
  tutorial: number;
  research: boolean;
  selected: number | null;
  buildActive: boolean;
  menuOpen: boolean;
  onSlot: (slot: ShellSlot) => void;
}) {
  const active: Record<ShellSlot, boolean> = {
    yard: props.selected === -4,
    build: props.buildActive,
    store: props.selected === -2,
    research: props.selected === -3,
    menu: props.menuOpen,
  };
  const reason = (slot: ShellSlot): string | null => {
    if (slot === "yard" && props.tutorial < 9) return "After tutorial";
    if (slot === "research" && !props.research) return "Needs data";
    return null;
  };
  return (
    <nav className="shell-rail" aria-label="Destinations">
      {SHELL_SLOTS.map((slot, index) => {
        const why = reason(slot);
        return (
          <button
            key={slot}
            type="button"
            className="shell-rail__slot"
            data-slot={slot}
            aria-pressed={active[slot]}
            disabled={why !== null}
            onClick={() => props.onSlot(slot)}
          >
            <span className="shell-rail__label">{SLOT_LABEL[slot]}</span>
            {why ? <span className="shell-rail__reason">{why}</span> : null}
            <span className="shell-rail__key" aria-hidden="true">
              {index + 1}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

/**
 * The phone/column Menu face. On phones it sits in the dock's reserved 72 px
 * thumb zone beside the nav row; in the column band it takes the corner the
 * deleted Home face (E2) left behind. Hidden in rail mode, where slot 5 owns it.
 */
export const ShellMenuFace = forwardRef<
  HTMLButtonElement,
  { open: boolean; onToggle: () => void }
>(function ShellMenuFace({ open, onToggle }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={"shell-menu-face" + (open ? " shell-menu-face--open" : "")}
      aria-label="Menu"
      aria-expanded={open}
      aria-haspopup="dialog"
      onClick={onToggle}
    >
      Menu
    </button>
  );
});

/**
 * UI-RESET-50: the visible camera controls — zoom in, zoom out, reset view.
 * Plain buttons with real camera state behind them (App steers the same
 * clamped math the wheel and pinch use). Phone mode stacks them in the right
 * gutter above the dock/Menu face, column mode below the Menu face, rail mode
 * paints a row above the primary band. Every face keeps the 44 px floor, and
 * the camera fit reserves their gutter, so no yard cell hides under a control.
 */
export function ShellZoom(props: {
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
        {/* UI-RESET-62: the camera control is labelled for what it does —
            recentre the view — so it can never be mistaken for menu navigation.
            The accessible name stays the pinned "Reset view". */}
        Recenter
      </button>
    </div>
  );
}

/**
 * E3/E5: the one bounded Menu sheet. `role="dialog"`, focus moves in on open
 * and returns to the opener on close (App owns the restore). It is deliberately
 * NOT a `.panel`: the overlay-stack census counts `.panel` siblings, and the
 * menu is navigation, not a thirteenth inspector. While it is up the panels
 * yield their slot (`.hud--menu > .panel`), but the selection underneath is
 * untouched (E4) — closing the menu brings the same context back.
 */
export function MenuSheet(props: {
  onClose: () => void;
  onHome: () => void;
  onYard: () => void;
  yardEnabled: boolean;
  onReport: () => void;
  reportAvailable: boolean;
  muted: boolean;
  onToggleMute: () => void;
  textScale: number;
  onCycleText: () => void;
  onSettings: () => void;
  onReset: () => void;
}) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <section className="shell-menu" role="dialog" aria-label="Menu" tabIndex={-1} ref={ref}>
      <div className="shell-menu__head">
        <h2 className="shell-menu__title">Menu</h2>
        <button type="button" className="icon-btn" onClick={props.onClose}>
          {t("btn.close")}
        </button>
      </div>
      <div className="shell-menu__body">
        <button type="button" className="shell-menu__row" onClick={props.onHome}>
          {t("btn.home")}
          {/* UI-RESET-62: navigation wording, so this row cannot be confused with
              the camera's own Recenter face in the zoom stack. */}
          <span className="shell-menu__hint">Back to the yard overview; clears the selection</span>
        </button>
        <button
          type="button"
          className="shell-menu__row"
          onClick={props.onYard}
          disabled={!props.yardEnabled}
        >
          {t("btn.yard")}
          <span className="shell-menu__hint">
            {props.yardEnabled ? "Save, export and import" : "After tutorial"}
          </span>
        </button>
        <button
          type="button"
          className="shell-menu__row"
          onClick={props.onReport}
          disabled={!props.reportAvailable}
        >
          Return report
          <span className="shell-menu__hint">
            {props.reportAvailable ? "What the yard did while you were away" : "No absence yet"}
          </span>
        </button>
        <button type="button" className="shell-menu__row" onClick={props.onToggleMute}>
          {props.muted ? t("btn.soundMuted") : t("btn.soundAudible")}
          <span className="shell-menu__hint">All sound</span>
        </button>
        <button type="button" className="shell-menu__row" onClick={props.onCycleText}>
          {t("btn.textScale", { scale: props.textScale })}
          <span className="shell-menu__hint">Cycle 1 / 1.25 / 1.5 / 2</span>
        </button>
        {/* UI-RESET-62: the full settings surface and the destructive reset entry,
            appended after the pinned quick rows. Reset never deletes here — it
            opens the confirmation dialog, on phone and desktop alike. */}
        <button type="button" className="shell-menu__row" onClick={props.onSettings}>
          Settings
          <span className="shell-menu__hint">{RESET_COPY.settingsRowHint}</span>
        </button>
        <button
          type="button"
          className="shell-menu__row shell-menu__row--danger"
          onClick={props.onReset}
        >
          {RESET_COPY.title}
          <span className="shell-menu__hint">{RESET_COPY.menuHint}</span>
        </button>
      </div>
    </section>
  );
}
