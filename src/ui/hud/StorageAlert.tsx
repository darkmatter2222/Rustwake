import { hudState } from "./bridge";
import { COPY } from "./copy";
import { capacityText, hudNumber } from "./format";
import { WarnIcon } from "./Icons";
import { storagePressure } from "./pressure";

/**
 * UI-RESET-51: the storage alert that leads to recovery.
 *
 * Reads the SimState HudTop published this pass (DockButtons receives no state
 * prop). At `full` it is a live `role="status"` region naming the exact recovery
 * - sell to free space once the steel contract is claimed, otherwise finish that
 * contract first - and its action opens the store panel (the same path the dock's
 * Store button uses), where the sell buttons live. At `high` it is a static
 * warning, not a live region, so it does not re-announce on every tick.
 *
 * The button reuses `.objective__btn` (min-height 44 in styles.css) so it clears
 * the shell's touch-target floor even in jsdom, and it is NOT a `.dock__btn`, so
 * the dock face counts and exact-match taps stay pinned.
 */
export function StorageAlert({ onInventory }: { onInventory: () => void }) {
  const state = hudState();
  if (!state) return null;
  const pressure = storagePressure(state);
  if (pressure.tier === "ok") return null;

  const full = pressure.tier === "full";
  const recovery = state.exportClaimed ? COPY.sellToFree : COPY.contractFirst;
  const tail =
    pressure.overflowUnits > 0
      ? ` · ${hudNumber(pressure.overflowUnits)} ${COPY.heldOutside}`
      : "";
  const text = full
    ? `${COPY.storeFull} · ${capacityText(pressure.units, pressure.capacity)}${tail} · ${recovery}`
    : `${COPY.storeHigh} · ${capacityText(pressure.units, pressure.capacity)}${tail}`;

  return (
    <div
      className="hud-alert"
      data-tier={pressure.tier}
      role={full ? "status" : undefined}
    >
      <WarnIcon className="hud-alert__icon" size={16} />
      <span className="hud-alert__text">{text}</span>
      <button
        type="button"
        className="objective__btn hud-alert__action"
        onClick={onInventory}
      >
        {COPY.openStore}
      </button>
    </div>
  );
}