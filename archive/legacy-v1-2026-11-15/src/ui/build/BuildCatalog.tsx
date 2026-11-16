/**
 * UI-RESET-52: the build catalog replaces the dock's Next-button cycling with
 * a deliberate pick. Every shipped machine is listed — locked ones included,
 * with the table's own `unlockAt` requirement printed, never a new gate — and
 * each card carries the machine's silhouette, what it does, its recipe's
 * inputs/outputs/power/time and its real build cost. Unaffordable cards print
 * the store's have/need sentence and the footer keeps Salvage and Store one
 * tap away while the player is still planning.
 *
 * Selecting a card updates the ghost (the camera #93 preview) but keeps the
 * catalog open; the footer's Place button is the explicit step into placement
 * preview. The catalog is NOT a `.panel`: it never joins the report/stack/dock
 * census, and the camera's chrome insets never measure it.
 */
import { t } from "../../game/content/strings";
import type { SimState } from "../../game/simulation/types";
import { costSummary } from "../text";
import { COPY } from "./copy";
import {
  CATEGORIES,
  catalogCards,
  functionLine,
  lockLine,
  recipeReadout,
  shortfallLine,
  shortfalls,
} from "./catalog";
import { MachineIcon } from "./MachineIcon";
import "./build.css";

export interface BuildCatalogProps {
  readonly state: SimState;
  readonly selected: string | null;
  readonly onSelect: (id: string) => void;
  readonly onPlace: () => void;
  readonly onClose: () => void;
  readonly onSalvage: () => void;
  readonly onStore: () => void;
}

export function BuildCatalog(props: BuildCatalogProps) {
  const cards = catalogCards(props.state.tutorial);
  const byId = new Map(cards.map((card) => [card.id, card]));
  const selectedCard = props.selected ? byId.get(props.selected) : undefined;
  const selectedShort = selectedCard ? shortfalls(selectedCard.def, props.state) : [];
  const placeEnabled = Boolean(selectedCard?.unlocked) && selectedShort.length === 0;

  return (
    <section className="catalog" role="dialog" aria-label={COPY.title}>
      <header className="catalog__head">
        <h2 className="catalog__title">{COPY.title}</h2>
        <button
          type="button"
          className="catalog__close"
          aria-label={COPY.close}
          onClick={props.onClose}
        >
          {t("btn.close")}
        </button>
      </header>
      <p className="catalog__lead">{COPY.lead}</p>
      <div className="catalog__body">
        {CATEGORIES.map((category) => (
          <section className="catalog__group" key={category.id} aria-label={category.label}>
            <h3 className="catalog__group-title">{category.label}</h3>
            {category.blueprints.map((id) => {
              const card = byId.get(id);
              if (!card) return null;
              const { def, unlocked } = card;
              const readout = recipeReadout(def);
              const short = unlocked ? shortfalls(def, props.state) : [];
              const isSelected = props.selected === id;
              return (
                <button
                  key={id}
                  type="button"
                  className={
                    "catalog__card" +
                    (isSelected ? " catalog__card--selected" : "") +
                    (unlocked ? "" : " catalog__card--locked")
                  }
                  data-blueprint={id}
                  data-locked={unlocked ? "false" : "true"}
                  data-affordable={unlocked && short.length === 0 ? "true" : "false"}
                  aria-pressed={isSelected}
                  disabled={!unlocked}
                  onClick={() => props.onSelect(id)}
                >
                  <MachineIcon blueprint={id} />
                  <span className="catalog__name">{def.label}</span>
                  <span className="catalog__function">{functionLine(id)}</span>
                  <span className="catalog__recipe">
                    <span>
                      {t("row.inputs")}: {readout.inputs}
                    </span>
                    <span>
                      {t("row.outputs")}: {readout.outputs}
                    </span>
                    <span className="catalog__meta">
                      {t("row.power")} {readout.power} · {readout.time}
                    </span>
                  </span>
                  <span className="catalog__cost">{costSummary(def)}</span>
                  {!unlocked ? (
                    <span className="catalog__lock">{lockLine(def)}</span>
                  ) : short.length > 0 ? (
                    short.map((item) => (
                      <span className="catalog__shortfall" key={item.resource}>
                        {shortfallLine(item)}
                      </span>
                    ))
                  ) : (
                    <span className="catalog__ready">{COPY.ready}</span>
                  )}
                  {isSelected ? <span className="catalog__selected">{COPY.selected}</span> : null}
                </button>
              );
            })}
          </section>
        ))}
      </div>
      <footer className="catalog__foot">
        <button type="button" className="catalog__salvage" onClick={props.onSalvage}>
          {t("btn.salvage")}
        </button>
        <button type="button" className="catalog__store" onClick={props.onStore}>
          {t("btn.store")}
        </button>
        <button
          type="button"
          className="catalog__place"
          disabled={!placeEnabled}
          onClick={props.onPlace}
        >
          {selectedCard ? t("btn.place", { machine: selectedCard.def.label }) : t("btn.build")}
        </button>
      </footer>
      <p className="catalog__hint">{COPY.salvageHint}</p>
    </section>
  );
}
