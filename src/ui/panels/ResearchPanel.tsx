import type { SimState } from "../../game/simulation/types";
import type { Command } from "../../game/simulation/commands";
import {
  RESEARCH,
  RESEARCH_ORDER,
} from "../../game/content/research";
import { formatNumber } from "../text";
import { t } from "../../game/content/strings";
import { nextId } from "./shared";

/**
 * Research as one full-width card per node (Q-001, design bible "Menus and
 * navigation"). A definition-list grid treats every node `<div>` as another
 * alternating cell of `auto 1fr`, which is what squeezed "Smart Buffers" into a
 * one-word column in docs/screenshots/latest-research-phone.png; the card list
 * below is a single column by construction, so a card is as wide as the panel.
 * Each card carries the five things a purchase decision needs: title, exact
 * effect, cost, prerequisite, and its own state — `Known`, an inert buy target
 * while the prerequisite is missing, or a live one. The rank, cost and
 * prerequisite rules themselves come from the same tables as before, so the
 * engine sees the identical `research.buy` command.
 */
export function ResearchPanel(props: {
  state: SimState;
  dispatch: (command: Command) => unknown;
  onClose: () => void;
}) {
  const owned = props.state.research;
  return (
    <div className="panel panel--research panel--stack" role="group" aria-label={t("aria.research")}>
      <div className="panel__head">
        <h2 className="panel__title">{t("title.research")}</h2>
        <button className="icon-btn" onClick={props.onClose}>
          {t("btn.close")}
        </button>
      </div>
      <div className="panel__body">
        <p className="panel__lead">
          <span className="panel__lead-key">{t("row.data")}</span>
          <span className="panel__lead-value">{formatNumber(props.state.store.data ?? 0)}</span>
        </p>
        <div className="nodes">
          {RESEARCH_ORDER.map((id) => {
            const def = RESEARCH[id];
            const rank = owned[def.id] ?? 0;
            const prereq = def.requires ? RESEARCH[def.requires] : null;
            const blocked = prereq !== null && (owned[prereq.id] ?? 0) <= 0;
            const known = rank > 0;
            const cost = t("value.dataCost", { cost: def.cost });
            // R-12: one state line per card, in its own row under the effect.
            const stateLine = known
              ? t("value.known")
              : blocked
                ? t("value.needsPrereq", {
                    node: prereq ? prereq.label : t("value.earlierNode"),
                  })
                : t("btn.buyData", { cost });
            return (
              <article
                className="node"
                key={def.id}
                data-node={def.id}
                data-state={known ? "known" : blocked ? "locked" : "open"}
              >
                <h3 className="node__title">
                  <span className="node__name">{def.label}</span>
                </h3>
                <p className="node__effect">{def.effect}</p>
                <p className="node__state">{stateLine}</p>
                <div className="node__foot">
                  {/* R-13: the exact cost text lives in the DOM in every state,
                      not only in the button label; R-11: it is a chip with its
                      own box, its own row, and a 6 px gap under the stack. */}
                  <span className="node__cost">{cost}</span>
                  {known ? null : (
                    <button
                      className="icon-btn node__buy"
                      disabled={blocked}
                      onClick={() =>
                        props.dispatch({
                          id: nextId("k"),
                          type: "research.buy",
                          node: def.id,
                        })
                      }
                    >
                      {t("btn.buyData", { cost })}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}