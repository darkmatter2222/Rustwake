import { t } from "../../game/content/strings";
import { ResourceGlyph } from "../hud/Icons";
import { RESOURCE_LABEL } from "../text";
import {
  STORE_COPY,
  decreaseLabel,
  factsLine,
  halfLabel,
  increaseLabel,
  invalidQty,
  maxLabel,
  overSellable,
  priceLine,
  proceedsLine,
  quantityGroupLabel,
  setQtyLabel,
  tradeLabel,
} from "./copy";
import { selectQty, type TradeFace } from "./model";

/**
 * UI-RESET-56 (issue #56): one resource's trade card.
 *
 * The card owns the quantity decision (stepper, direct entry, Max/Half presets) and
 * prints the exact proceeds the engine will pay: `qty × price`, where `qty` is the
 * selection clamped to the engine's own `sellableAmount`. The sell face keeps the
 * shared `value.sellButton` shape ("Sell 60 · +900") so every existing contract that
 * reads a sell tranche — the HUD alert recovery, the dock walk — reads the same
 * arithmetic here. The card never dispatches an invalid quantity; the engine still
 * clamps and dedupes behind it, so rapid taps cannot oversell or double-pay.
 */
export function TradeCard(props: {
  face: TradeFace;
  /** The player's raw quantity entry, or undefined for the default full tranche. */
  raw: string | undefined;
  onRaw: (raw: string | undefined) => void;
  onSell: (qty: number) => void;
}) {
  const { face, raw, onRaw, onSell } = props;
  const name = RESOURCE_LABEL[face.resource] ?? face.resource;
  const selection = selectQty(raw, face.sellable);
  const displayed = raw ?? String(face.sellable);
  const half = Math.max(1, Math.floor(face.sellable / 2));
  const reason =
    selection.reason === "high"
      ? overSellable(face.sellable)
      : invalidQty(face.sellable);
  return (
    <section
      className="store-trade"
      data-resource={face.resource}
      aria-label={tradeLabel(name)}
    >
      <header className="store-trade__head">
        <ResourceGlyph id={face.resource} size={20} />
        <h4 className="store-trade__name">{name}</h4>
        <span className="store-trade__price">{priceLine(face.price)}</span>
      </header>
      <p className="store-trade__facts">{factsLine(face.held, face.sellable)}</p>
      <div
        className="store-trade__controls"
        role="group"
        aria-label={quantityGroupLabel(name)}
      >
        <button
          type="button"
          className="icon-btn"
          aria-label={decreaseLabel(name)}
          disabled={selection.qty <= 1}
          onClick={() => onRaw(String(Math.max(1, selection.qty - 1)))}
        >
          -
        </button>
        <input
          className="store-trade__qty"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={setQtyLabel(name)}
          value={displayed}
          onChange={(event) => onRaw(event.target.value)}
        />
        <button
          type="button"
          className="icon-btn"
          aria-label={increaseLabel(name)}
          disabled={selection.qty >= face.sellable}
          onClick={() => onRaw(String(Math.min(face.sellable, selection.qty + 1)))}
        >
          +
        </button>
        <button
          type="button"
          className="store-trade__preset"
          aria-label={maxLabel(name)}
          onClick={() => onRaw(String(face.sellable))}
        >
          {STORE_COPY.max}
        </button>
        <button
          type="button"
          className="store-trade__preset"
          aria-label={halfLabel(name)}
          onClick={() => onRaw(String(half))}
        >
          {STORE_COPY.half}
        </button>
      </div>
      <p className="store-trade__preview" data-valid={selection.valid ? "true" : "false"}>
        {selection.valid ? proceedsLine(selection.qty, face.price) : reason}
      </p>
      <button
        type="button"
        className="icon-btn store-trade__sell"
        disabled={!selection.valid || selection.qty <= 0}
        onClick={() => {
          if (selection.valid && selection.qty > 0) onSell(selection.qty);
        }}
      >
        {t("value.sellButton", {
          qty: selection.qty,
          credits: selection.qty * face.price,
        })}
      </button>
    </section>
  );
}
