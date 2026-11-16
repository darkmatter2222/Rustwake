import { useState } from "react";
import type { SimState } from "../../game/simulation/types";
import type { Command } from "../../game/simulation/commands";
import { formatNumber } from "../text";
import { t } from "../../game/content/strings";
import { nextId } from "./shared";
import {
  completedFocus,
  dataSourceNote,
  deriveResearch,
  focusFor,
  type ResearchNodeView,
} from "../research/model";
import {
  RESEARCH_COPY,
  badgeFor,
  cardLabel,
  dataNote,
  prereqLine,
  progressLine,
  whereFor,
  whyLine,
} from "../research/copy";
import "../research/research.css";

/**
 * UI-RESET-58 (issue #58): the research surface, rebuilt around four readable
 * states — completed / available / unlocked / locked — over the *existing*
 * three-node data branch. No new progression system: every cost, prerequisite,
 * rank ceiling and effect still comes from `content/research.ts`, and a buy tap
 * still issues the identical `research.buy` command through `props.dispatch`.
 *
 * What the rebuild adds is decision information, not mechanics:
 * - a sticky path overview so the whole branch reads at a glance on the desktop
 *   rail and stays reachable on a phone without shrinking any card's type;
 * - a per-card prerequisite line and a four-state badge alongside the legacy
 *   state line (`Known` / `Needs X first` / `Buy · N Data`), which the existing
 *   read-only tests assert verbatim;
 * - the exact reason a target is unavailable: the missing prerequisite, or the
 *   engine's own shortfall numbers (`Need N more Data — have H of C`);
 * - a focus readout naming the machine/resource quantity the next node changes,
 *   with live now -> after values derived from `researchBonus`. The mount
 *   contract exposes no camera/focus command, so the focus lives inside the
 *   panel; a successful buy keeps the readout on the node just bought so the
 *   purchase is reflected immediately.
 *
 * The legacy DOM contract is preserved: `.panel--research.panel--stack`,
 * `article.node[data-node][data-state]` with the known/locked/open values,
 * `p.node__state`, `.node__cost` and the `.node__buy` target. The four-state
 * word rides on a new `data-research-state` attribute so both contracts coexist.
 */
export function ResearchPanel(props: {
  state: SimState;
  dispatch: (command: Command) => unknown;
  onClose: () => void;
}) {
  const view = deriveResearch(props.state);
  // The node the focus readout is pinned to. Null answers "the next one"; a
  // successful buy pins the bought node so its live effect stays on screen.
  const [pinnedId, setPinnedId] = useState<string | null>(null);

  const pinned = pinnedId !== null ? view.nodes.find((n) => n.def.id === pinnedId) : undefined;
  const focusNode = pinned ?? view.next ?? null;
  const focus = view.allDone
    ? completedFocus(props.state)
    : focusFor(props.state, focusNode ? focusNode.def.id : null);
  const focusTitle = view.allDone
    ? RESEARCH_COPY.focusDone
    : pinned && pinned.state === "completed"
      ? RESEARCH_COPY.focusBought
      : pinned
        ? `Where ${pinned.def.label} lands`
        : RESEARCH_COPY.focusNext;

  const buy = (node: ResearchNodeView) => {
    const result = props.dispatch({
      id: nextId("k"),
      type: "research.buy",
      node: node.def.id,
    }) as { ok?: boolean } | null | undefined;
    // Reflect the purchase immediately: pin the readout to the node just bought.
    // A refusal leaves the focus where it was; the shell's toast names the reason.
    if (result && result.ok === true) setPinnedId(node.def.id);
  };

  const source = dataSourceNote();

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

        {/* The overview: the whole branch in one sticky strip, so desktop reads
            every node's state without scrolling and a phone keeps it in reach
            while the cards scroll under it. No type is shrunk to fit. */}
        <div className="research-summary" role="group" aria-label={RESEARCH_COPY.pathLabel}>
          <p className="research-progress">{progressLine(view.completed, view.total)}</p>
          <ol className="research-path">
            {view.nodes.map((node, index) => (
              <li
                key={node.def.id}
                className="research-seg"
                data-research-state={node.state}
              >
                <span className="research-seg__step" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="research-seg__name">{node.def.label}</span>
                <span className="research-seg__state">{badgeFor(node.state)}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Focus: the exact machine/resource quantity the next (or just-bought)
            node changes, with the engine's own now -> after numbers. */}
        <div
          className="research-focus"
          role="group"
          aria-label={focusTitle}
          data-focus={focus.nodeId ?? "done"}
        >
          <p className="research-focus__title">{focusTitle}</p>
          <p className="research-focus__where">{whereFor(focus.nodeId)}</p>
          {focus.rows.length > 0 ? (
            <dl className="research-focus__rows">
              {focus.rows.map((row) => (
                <div className="research-focus__row" key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>

        {/* The no-data state answers "how do I earn this?" from the content
            tables: the Signal lab is the only Data source in the game. */}
        {view.data === 0 && !view.allDone && source ? (
          <p className="research-datanote">{dataNote(source)}</p>
        ) : null}

        <div className="nodes">
          {view.nodes.map((node) => {
            const def = node.def;
            const prereq = node.prereq ? node.prereq.def : null;
            const cost = t("value.dataCost", { cost: def.cost });
            // The legacy state line, verbatim: the existing read-only tests
            // assert these exact strings per data-state.
            const stateLine =
              node.state === "completed"
                ? t("value.known")
                : node.state === "locked"
                  ? t("value.needsPrereq", {
                      node: prereq ? prereq.label : t("value.earlierNode"),
                    })
                  : t("btn.buyData", { cost });
            const why = whyLine(node);
            return (
              <article
                className="node"
                key={def.id}
                data-node={def.id}
                data-state={node.legacyState}
                data-research-state={node.state}
                aria-label={cardLabel(node)}
              >
                <h3 className="node__title">
                  <span className="node__name">{def.label}</span>
                  <span className={`research-badge research-badge--${node.state}`}>
                    {badgeFor(node.state)}
                  </span>
                  <button
                    type="button"
                    className="research-details"
                    aria-label={`Show where ${def.label} lands`}
                    onClick={() => setPinnedId(def.id)}
                  >
                    Details
                  </button>
                </h3>
                <p className="node__effect">{def.effect}</p>
                <p className="research-prereq">{prereqLine(node)}</p>
                <p className="node__state">{stateLine}</p>
                {why ? (
                  <p className="research-why" data-why={node.state}>
                    {why}
                  </p>
                ) : null}
                <div className="node__foot">
                  {/* The exact cost stays in the DOM in every state, not only in
                      the button label (legacy R-11/R-13 contract). */}
                  <span className="node__cost">{cost}</span>
                  {node.state === "completed" ? null : (
                    <button
                      className="icon-btn node__buy"
                      disabled={!node.canBuy}
                      onClick={() => buy(node)}
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