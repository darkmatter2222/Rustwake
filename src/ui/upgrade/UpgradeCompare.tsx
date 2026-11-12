/**
 * UI-RESET-55 (G2 wave 4): explicit upgrade branch comparison. The old inspector had
 * one plain Upgrade face that silently bought the next scalar level; this surface
 * lays the three named branches side by side as deliberate selectable cards, each
 * printing current → proposed values with units, the engine's own price and the
 * tradeoff. The contracts the acceptance pins:
 *
 * - nothing is auto-selected (least of all the cheapest branch): `selected` starts
 *   null and only a card tap moves it, so repeated taps never drift the target;
 * - the purchase goes through the REAL `machine.upgrade` command with the selected
 *   branch, and the confirmation is built from the state read back AFTER the engine
 *   applied it (level, pick, derived value, credits delta) — never an optimistic guess;
 * - affordability is recomputed from `state.credits` on every render, and a blocked
 *   tap reports the engine's own `shortCredits` numbers, which match the printed price;
 * - a draw rank at the 1-unit power floor is shown as a maxed no-effect card, not a
 *   promised improvement; legacy branch-less machines read their truthful current
 *   values through `upgradeRanks` (unnamed levels count as speed);
 * - the free `machine.respec` re-pick of the LAST named outcome is exposed with the
 *   engine's exact semantics: free, last pick only, no-op when absent or unchanged.
 *
 * The plain unnamed Upgrade face stays in `.panel__actions` (the #54 contract) and is
 * labelled honestly below: an unnamed level counts as one speed rank. This component
 * renders no `.panel__actions` children and no new inspector section, so the seven
 * section landmarks and the three command faces are untouched.
 */
import { useState } from "react";
import type { Command, CommandResult } from "../../game/simulation/commands";
import {
  UPGRADE_BRANCHES,
  machineById,
  upgradeRanks,
  type MachineState,
  type SimState,
  type UpgradeBranch,
} from "../../game/simulation/types";
import { formatNumber, plural, t, unit } from "../../game/content/strings";
import { nextId } from "../panels/shared";
import { UPGRADE_COPY } from "./copy";
import { branchCards, metricValue, respecInfo, respecPreview } from "./model";
import "./upgrade.css";

type Receipt =
  | { kind: "applied"; text: string }
  | { kind: "short"; text: string }
  | { kind: "respec"; text: string }
  | { kind: "noop"; text: string };

/** The dispatch face returns the engine result in the app; test stubs may return void. */
function asResult(value: unknown): CommandResult | null {
  if (value !== null && typeof value === "object" && "ok" in value) {
    return value as CommandResult;
  }
  return null;
}

export function UpgradeCompare(props: {
  state: SimState;
  machine: MachineState;
  dispatch: (command: Command) => unknown;
}) {
  const { state, machine } = props;
  const [selected, setSelected] = useState<UpgradeBranch | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const cards = branchCards(state, machine);
  const info = respecInfo(machine);
  const selectedCard =
    selected === null ? null : (cards.find((card) => card.branch === selected) ?? null);

  /** One tap, one real command; the receipt is read back from the applied state. */
  const buy = () => {
    if (selectedCard === null || selectedCard.noEffect) return;
    const branch = selectedCard.branch;
    const beforeLevel = machine.level;
    const beforeCredits = state.credits;
    const beforeMetric = metricValue(state, machine, branch);
    const result = asResult(
      props.dispatch({
        id: nextId("u55"),
        type: "machine.upgrade",
        machineId: machine.id,
        branch,
      }),
    );
    const after = machineById(props.state, machine.id);
    if (
      after &&
      after.level === beforeLevel + 1 &&
      after.branch?.[after.branch.length - 1] === branch
    ) {
      const paid = beforeCredits - props.state.credits;
      setReceipt({
        kind: "applied",
        text: `${UPGRADE_COPY.receiptApplied}: ${selectedCard.title} ${UPGRADE_COPY.rankWord} ${upgradeRanks(after)[branch]} · ${UPGRADE_COPY.levelWord} ${after.level} · ${selectedCard.metric} ${beforeMetric} → ${metricValue(props.state, after, branch)} · ${UPGRADE_COPY.paidWord} ${unit(paid, t("unit.credit"))} (${formatNumber(beforeCredits)} → ${formatNumber(props.state.credits)})`,
      });
    } else if (result && !result.ok && result.reason === "insufficient") {
      setReceipt({
        kind: "short",
        text: `${UPGRADE_COPY.receiptShort}: ${t("reject.shortfall", {
          need: result.need ?? selectedCard.cost,
          have: result.have ?? beforeCredits,
          word: result.word ?? plural(selectedCard.cost, t("unit.credit")),
        })}. ${UPGRADE_COPY.nothingSpent}`,
      });
    }
  };

  /** Free re-pick of the last named outcome; no-ops report themselves honestly. */
  const respec = (branch: UpgradeBranch) => {
    const beforeRevision = state.revision;
    const beforeCredits = state.credits;
    asResult(
      props.dispatch({
        id: nextId("s55"),
        type: "machine.respec",
        machineId: machine.id,
        branch,
      }),
    );
    const after = machineById(props.state, machine.id);
    if (!after) return;
    if (props.state.revision === beforeRevision) {
      setReceipt({
        kind: "noop",
        text: info.last === branch ? UPGRADE_COPY.respecNoopSame : UPGRADE_COPY.respecNoopNone,
      });
      return;
    }
    const values = UPGRADE_BRANCHES.map(
      (each) =>
        `${UPGRADE_COPY.branches[each].metric} ${metricValue(props.state, after, each)}`,
    ).join(" · ");
    setReceipt({
      kind: "respec",
      text: `${UPGRADE_COPY.respecApplied} ${UPGRADE_COPY.branches[branch].title} (${UPGRADE_COPY.respecFree}) · ${UPGRADE_COPY.levelWord} ${after.level} · ${values} · ${UPGRADE_COPY.creditsUnchanged} (${formatNumber(beforeCredits)} → ${formatNumber(props.state.credits)})`,
    });
  };

  return (
    <div className="upgrade-compare">
      <p className="upgrade-note">{UPGRADE_COPY.intro}</p>
      <div className="upgrade-cards" role="group" aria-label={UPGRADE_COPY.title}>
        {cards.map((card) => (
          <button
            key={card.branch}
            type="button"
            className="upgrade-card"
            data-branch={card.branch}
            aria-pressed={selected === card.branch}
            disabled={card.noEffect}
            onClick={() => setSelected(card.branch)}
          >
            <span className="upgrade-card__head">
              <span>{card.title}</span>
              <span
                className={
                  card.noEffect
                    ? "upgrade-card__badge upgrade-card__badge--maxed"
                    : "upgrade-card__badge"
                }
              >
                {card.noEffect
                  ? UPGRADE_COPY.noEffectBadge
                  : `${UPGRADE_COPY.rankWord} ${card.rankNow} → ${card.rankNext}`}
              </span>
            </span>
            <span className="upgrade-card__metric">
              {card.metric}: {card.currentText} → {card.proposedText}
            </span>
            <span className="upgrade-card__delta">{card.deltaText}</span>
            <span className="upgrade-card__cost">
              {UPGRADE_COPY.costWord}: {card.costText}
              {card.affordable ? (
                <span className="upgrade-card__ok"> · {UPGRADE_COPY.affordable}</span>
              ) : (
                <span className="upgrade-card__short"> · {card.shortfallText}</span>
              )}
            </span>
            <span className="upgrade-card__tradeoff">{card.tradeoff}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="upgrade-buy"
        data-buy=""
        disabled={selectedCard === null || selectedCard.noEffect}
        onClick={buy}
      >
        {selectedCard === null
          ? UPGRADE_COPY.buy
          : `${UPGRADE_COPY.buy} · ${selectedCard.title} · ${selectedCard.costText}`}
      </button>
      {selectedCard === null ? <p className="upgrade-note">{UPGRADE_COPY.buyHint}</p> : null}
      {receipt !== null ? (
        <p className={`upgrade-receipt upgrade-receipt--${receipt.kind}`} role="status">
          {receipt.text}
        </p>
      ) : null}
      <p className="upgrade-note">{UPGRADE_COPY.plainNote}</p>
      <div className="upgrade-respec">
        <span className="upgrade-respec__title">{UPGRADE_COPY.respecTitle}</span>
        {info.available ? (
          <div className="upgrade-respec__tabs" role="group" aria-label={UPGRADE_COPY.respecTitle}>
            {UPGRADE_BRANCHES.map((branch) => (
              <button
                key={branch}
                type="button"
                className="upgrade-respec__btn"
                data-respec={branch}
                disabled={info.last === branch}
                onClick={() => respec(branch)}
              >
                {UPGRADE_COPY.branches[branch].title} · {respecPreview(state, machine, branch)}
                {info.last === branch ? ` (${UPGRADE_COPY.respecCurrent})` : ""}
              </button>
            ))}
          </div>
        ) : (
          <p className="upgrade-note">{UPGRADE_COPY.respecNone}</p>
        )}
        <p className="upgrade-note">{UPGRADE_COPY.respecHelp}</p>
      </div>
    </div>
  );
}
