import { useState } from "react";
import type { ReactNode } from "react";
import {
  BLUEPRINTS,
  RECIPES,
  TUNING,
  exportPrice,
  type ResourceId,
} from "../game/content/defs";
import type { MachineState, SimState } from "../game/simulation/types";
import { batchMilliFor, fleetUnits, inputCapacityOf, upgradeRanks } from "../game/simulation/types";
import type { Command } from "../game/simulation/commands";
import { beltCost, refundOf, sellableAmount, upgradeCost } from "../game/simulation/commands";
import {
  planConnections,
  type ConnectionPlan,
} from "../game/simulation/autoconnect";
import {
  RESEARCH,
  RESEARCH_ORDER,
  researchBonus,
} from "../game/content/research";
import {
  diagnoseMachine,
  rateReading,
  yardSummary,
} from "../game/simulation/diagnostics";
import type { ReturnReport } from "../game/simulation/offline";
import {
  RESOURCE_LABEL,
  STATUS_LABEL,
  beltExtentLine,
  formatDuration,
  formatNumber,
  importNoteFor,
  nextFreeTile,
} from "./text";
import {
  formatRate,
  formatSeconds,
  formatWholeSeconds,
  plural,
  t,
  unit,
  wholePercent,
} from "../game/content/strings";
import type { ImportResult } from "../game/persistence/save";

/**
 * One panel row: a label, its value, and optionally one control, all inside **one** line
 * box (UI-002, Lane B fold-in). `.panel dl` is a one-column grid and `.panel__row` is a
 * flex line, so the `dt` and its `dd` share a top edge and the value always starts after
 * the label - the old two-column `auto 1fr` grid mixed bare `<dt>/<dd>` pairs with
 * `<div>`-wrapped rows, which is what dropped `20/900` under "Scrap 20" and left
 * "Capacity" standing alone in `docs/../work/review/dispatch-startup/captures/
 * ds-360-ts2-panel-store.png`. Every row is as wide as the panel body: full-width rows.
 */
function Row(props: { label: string; value: ReactNode; children?: ReactNode }) {
  return (
    <div className="panel__row">
      <dt>{props.label}</dt>
      <dd>{props.value}</dd>
      {props.children}
    </div>
  );
}

/**
 * U-5 (UI-002 g3): which layer a press retires. Two of these can be on the screen at
 * once - the return report the boot left behind, plus the panel the player opened last -
 * and one `Back`/`Escape` press retires exactly one of them, nearest first (LIFO). The
 * markers let the sheet state that order without a second source of truth: the layer the
 * player opened last owns the target nearest the dock (where the thumb already is), the
 * older one sits above it in the column, so repeated presses unwind the stack down to the
 * yard instead of jumping between two buttons.
 */
export function MachinePanel(props: {
  state: SimState;
  machine: MachineState;
  tick: number;
  powerRatio: number;
  dispatch: (command: Command) => unknown;
  onClose: () => void;
}) {
  const { machine } = props;
  const def = BLUEPRINTS[machine.blueprint];
  const recipe = RECIPES[def.recipeId];
  const effectiveSeconds = machine.batchMilli / 10000;
  const maxRate = effectiveSeconds > 0 ? 10000 / machine.batchMilli : 0;
  const reading = rateReading(machine);
  const cost = upgradeCost(def.baseUpgradeCost, machine.level);
  const nextSeconds =
    batchMilliFor(machine.blueprint, machine.level + 1) / 10000;
  const plans = planConnections(props.state, machine.id);
  const diagnosis = diagnoseMachine(props.state, machine);
  const [page, setPage] = useState(0);
  /** Where the `Move` face sends this machine: the first cell nobody holds (UI-002). */
  const moveTile = nextFreeTile(props.state);
  /**
   * BELT-001 g4: the three command faces each carry the arithmetic the engine itself
   * applies to that tap, from the same exported helpers `commands.ts` uses, so a printed
   * number cannot drift from what the tap charges: `moveMachine` takes `movePenaltyPct` of
   * every build-cost line, `dismantleMachine` returns `refundOf` on those lines, the tray
   * and buffer in full, and one belt refund per attached link. `links` is the same set the
   * extent row below prints, and the store's endpoint id (0) never collides with a machine.
   */
  const links = props.state.routes.filter(
    (route) => route.from.id === machine.id || route.to.id === machine.id
  );
  const moveCost = def.buildCost.reduce(
    (sum, item) => sum + Math.round((item.qty * TUNING.movePenaltyPct) / 100),
    0
  );
  const refundUnits =
    def.buildCost.reduce((total, item) => total + refundOf(item.qty), 0) +
    machine.trayUnits +
    machine.inBufUnits +
    links.reduce((total, route) => total + refundOf(beltCost(route.run?.length ?? 0)), 0);

  return (
    <div
      className="panel panel--stack"
      role="group"
      aria-label={t("aria.machineDetails", { machine: def.label })}
    >
      <div className="panel__head">
        <h2 className="panel__title">{def.label}</h2>
        <button className="icon-btn" onClick={props.onClose}>
          {t("btn.close")}
        </button>
      </div>
      <div className="panel__body">
      {page === 0 ? (
        <dl>
          <Row label={t("row.status")} value={STATUS_LABEL[machine.status] ?? machine.status} />
          <Row
            label={t("row.batch")}
            value={t("value.percent", {
              percent: Math.min(
                100,
                Math.round((machine.progress / Math.max(1, machine.batchMilli)) * 100),
              ),
            })}
          />
          <Row
            label={t("row.cycle")}
            value={t("value.seconds", { seconds: formatSeconds(effectiveSeconds) })}
          />
          <Row
            label={t("row.actualRate")}
            value={t("value.actualRate", {
              rate: formatRate(reading.rate),
              window: formatWholeSeconds(reading.windowSeconds),
            })}
          />
          <Row label={t("row.maxRate")} value={t("value.maxRate", { rate: formatRate(maxRate) })} />
          <Row
            label={t("row.power")}
            value={
              <>
                {t("value.powerUnits", {
                  count: machine.batchPower,
                  units: plural(machine.batchPower, t("unit.unit")),
                })}
                {props.powerRatio < 0.999
                  ? t("value.powerLimited", { percent: wholePercent(props.powerRatio) })
                  : ""}
              </>
            }
          />
          <Row label={t("row.measured")} value={diagnosis.evidence} />
          <Row label={t("row.nextStep")} value={diagnosis.advice} />
          <Row
            label={t("row.nextUpgrade")}
            value={t("value.nextUpgrade", {
              from: formatSeconds(effectiveSeconds),
              to: formatSeconds(nextSeconds),
              cost: unit(cost, t("unit.credit")),
            })}
          />
          {plans.length > 0 ? (
            <Row label={t("row.nextLink")} value={describePlans(props.state, plans)} />
          ) : null}
          {/* BELT-001 g4: the extent of every link already on this machine, in the one
              shape the world prints beside the line itself: "3 tiles · 3 scrap". A link
              from before the price has no `run` and prints its stored latency instead. */}
          {links.length > 0 ? (
            <Row
              label={t("row.links")}
              value={links.map(beltExtentLine).join(t("value.comma"))}
            />
          ) : null}
          {machine.status === "starved" ? (
            <Row label={t("row.needs")} value={describeInputs(recipe)} />
          ) : null}
        </dl>
      ) : (
        <dl>
          <Row label={t("row.inputs")} value={describeInputs(recipe)} />
          <Row label={t("row.outputs")} value={describeOutputs(recipe)} />
          <Row label={t("row.level")} value={machine.level} />
          {machine.branch !== undefined ? (
            <Row
              label={t("row.branches")}
              value={(() => {
                const ranks = upgradeRanks(machine);
                return t("value.branches", {
                  speed: ranks.speed,
                  buffer: ranks.buffer,
                  draw: ranks.draw,
                });
              })()}
            />
          ) : null}
          <Row
            label={t("row.inBuffer")}
            value={`${formatNumber(machine.inBufUnits)}/${inputCapacityOf(
              machine,
              researchBonus(props.state).inputBuffer
            )}`}
          />
          <Row label={t("row.tray")} value={`${formatNumber(machine.trayUnits)}/${def.outputBuffer}`} />
        </dl>
      )}
      <div className="panel__actions">
        {plans.length > 0 ? (
          <button
            className="icon-btn"
            onClick={() => {
              for (const plan of plans) {
                props.dispatch({
                  id: nextId("r"),
                  type: "route.connect",
                  from: plan.from,
                  to: plan.to,
                  filter: plan.filter,
                });
              }
            }}
          >
            {t("btn.connect")}
          </button>
        ) : null}
        <button
          className="icon-btn"
          onClick={() =>
            props.dispatch({
              id: nextId("u"),
              type: "machine.upgrade",
              machineId: machine.id,
            })
          }
        >
          {t("btn.upgradeCost", { cost: unit(cost, t("unit.credit")) })}
        </button>
        {/* UI-002: the same machine, one cell over. `moveMachine` re-points the existing
            machine (its id, level, branch and both route ids survive), and the destination
            is the first free cell the yard offers - the ladder `firstFreeTile` uses. Every
            command face prints the number the engine charges it: the upgrade its credits,
            the move its own charge, the dismantle the units it returns. */}
        <button
          className="icon-btn"
          onClick={() =>
            props.dispatch({
              id: nextId("m"),
              type: "machine.move",
              machineId: machine.id,
              tile: moveTile,
            })
          }
        >
          {t("btn.moveCost", { tile: moveTile, charge: unit(moveCost, t("unit.unit")) })}
        </button>
        <button
          className="icon-btn"
          onClick={() =>
            props.dispatch({
              id: nextId("d"),
              type: "machine.dismantle",
              machineId: machine.id,
            })
          }
        >
          {t("btn.dismantleRefund", { refund: unit(refundUnits, t("unit.unit")) })}
        </button>
        <button className="icon-btn" onClick={() => setPage(page === 0 ? 1 : 0)}>
          {page === 0 ? t("btn.recipe") : t("btn.statusPage")}
        </button>
      </div>
      </div>
    </div>
  );
}

export function StorePanel(props: {
  state: SimState;
  dispatch: (command: Command) => unknown;
  onClose: () => void;
}) {
  const rows = (Object.keys(props.state.store) as ResourceId[]).filter(
    (key) => (props.state.store[key] ?? 0) > 0,
  );
  /**
   * The capacity fact once (UI-002, finding N-2). `Capacity` prints `20/900` as its own
   * row, so the yard-summary line that repeats the very same pair in parentheses is the
   * duplicate: the row stays (a label and a number the player can point at), the repeated
   * pair goes. Every other summary line keeps its place.
   */
  const capacityFact = `${formatNumber(props.state.storeUnits)}/${formatNumber(
    props.state.storeCapacity
  )}`;
  const summaryLines = yardSummary(props.state).filter((line) => !line.includes(capacityFact));
  return (
    <div className="panel panel--stack" role="group" aria-label={t("aria.storeContents")}>
      <div className="panel__head">
        <h2 className="panel__title">{t("title.store")}</h2>
        <button className="icon-btn" onClick={props.onClose}>
          {t("btn.close")}
        </button>
      </div>
      <div className="panel__body">
      <dl>
        {rows.map((key) => {
          const amount = sellableAmount(props.state, key);
          const price = exportPrice(key);
          return (
            <Row key={key} label={RESOURCE_LABEL[key] ?? key} value={formatNumber(props.state.store[key] ?? 0)}>
              {props.state.exportClaimed && price > 0 && amount > 0 ? (
                <button
                  className="icon-btn"
                  onClick={() =>
                    props.dispatch({
                      id: nextId("s"),
                      type: "contract.sell",
                      resource: key,
                      qty: amount,
                    })
                  }
                >
                  {t("value.sellButton", { qty: amount, credits: amount * price })}
                </button>
              ) : null}
            </Row>
          );
        })}
        <Row label={t("row.capacity")} value={capacityFact} />
        {summaryLines.map((line) => (
          <Row key={line} label={t("row.measured")} value={line} />
        ))}
        {props.state.exportClaimed ? (
          <Row
            label={t("row.sellFloor")}
            value={t("value.sellFloor", {
              count: TUNING.reserveFloor,
              units: plural(TUNING.reserveFloor, t("unit.unit")),
            })}
          />
        ) : (
          <Row label={t("row.sell")} value={t("value.sellOpens")} />
        )}
        {props.state.overflow.length > 0 ? (
          <Row
            label={t("row.overflow")}
            value={props.state.overflow.reduce((total, item) => total + item.qty, 0)}
          />
        ) : null}
      </dl>
      </div>
    </div>
  );
}

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

/**
 * The yard record plus the two save transfers (spec 22.1, B-06). Two pages so one
 * textarea is on screen at a time and the panel keeps its 0 px inner scroll at the
 * 2.0 text scale (spec 6.4): page 0 shows the record and the export, page 1 the
 * import field. A refused file leaves the running yard untouched.
 */
export function YardPanel(props: {
  state: SimState;
  exportText: string;
  onImport: (text: string) => ImportResult;
  onClose: () => void;
}) {
  const [page, setPage] = useState(0);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState(t("note.exportIdle"));
  const exportId = "rustwake-save-export";
  const importId = "rustwake-save-import";

  const copyExport = () => {
    const clipboard = navigator.clipboard?.writeText;
    if (!clipboard) {
      setNote(t("note.copyManual"));
      return;
    }
    clipboard.call(navigator.clipboard, props.exportText).then(
      () => setNote(t("note.copied")),
      () => setNote(t("note.copyManual"))
    );
  };

  return (
    <div className="panel panel--stack" role="group" aria-label={t("aria.yardRecord")}>
      <div className="panel__head">
        <h2 className="panel__title">{t("title.yard")}</h2>
        <button className="icon-btn" onClick={props.onClose}>
          {t("btn.close")}
        </button>
      </div>
      <div className="panel__body">
        {page === 0 ? (
          <>
            <dl>
              <Row label={t("row.tick")} value={props.state.tick} />
              <Row label={t("row.machines")} value={props.state.machines.length} />
              <Row
                label={t("row.drones")}
                value={fleetUnits(props.state).filter((unitState) => unitState.repaired).length}
              />
              <Row label={t("row.links")} value={props.state.routes.length} />
              <Row label={t("row.credits")} value={props.state.credits} />
              <Row
                label={t("row.save")}
                value={t("value.characters", { count: props.exportText.length })}
              />
            </dl>
            <label className="panel__field" htmlFor={exportId}>
              {t("field.savedYard")}
            </label>
            <textarea
              id={exportId}
              className="panel__code"
              readOnly
              value={props.exportText}
              onFocus={(event) => event.currentTarget.select()}
            />
            <div className="panel__actions">
              <button className="icon-btn" onClick={copyExport}>
                {t("btn.copy")}
              </button>
              <button className="icon-btn" onClick={() => setPage(1)}>
                {t("btn.import")}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="status-line">{t("note.paste")}</p>
            <label className="panel__field" htmlFor={importId}>
              {t("field.pastedText")}
            </label>
            <textarea
              id={importId}
              className="panel__code"
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
            />
            <div className="panel__actions">
              <button
                className="icon-btn"
                onClick={() => setNote(importNoteFor(props.onImport(draft)))}
              >
                {t("btn.apply")}
              </button>
              <button className="icon-btn" onClick={() => setPage(0)}>
                {t("btn.back")}
              </button>
            </div>
          </>
        )}
        <p className="status-line">{note}</p>
      </div>
    </div>
  );
}

export function ReturnReportPanel(props: {
  report: ReturnReport;
  onClose: () => void;
}) {
  const report = props.report;
  const gains = Object.entries(report.gains) as [ResourceId, number][];
  const summary = [
    t("report.away", { duration: formatDuration(report.awayTicks) }),
    report.capped
      ? t("report.workedCapped", { duration: formatDuration(report.creditedTicks) })
      : t("report.worked", { duration: formatDuration(report.creditedTicks) }),
  ];
  return (
    <div className="panel panel--report" role="group" aria-label={t("aria.returnReport")}>
      <div className="panel__head">
        <h2 className="panel__title">{t("title.report")}</h2>
        <button className="icon-btn" onClick={props.onClose}>
          {t("btn.backToYard")}
        </button>
      </div>
      <div className="panel__body">
      <dl>
        {summary.map((line) => (
          <Row key={line} label={t("row.time")} value={line} />
        ))}
        {gains.slice(0, 4).map(([key, value]) => (
          <Row key={key} label={RESOURCE_LABEL[key] ?? key} value={`+${formatNumber(value)}`} />
        ))}
        <Row label={t("row.deliveries")} value={report.deliveries} />
        <Row label={t("row.batches")} value={report.batchesDone} />
        {report.bottleneck ? (
          <Row label={t("row.bottleneck")} value={t(`bottleneck.${report.bottleneck}`)} />
        ) : null}
      </dl>
      </div>
    </div>
  );
}

function describePlans(
  state: SimState,
  plans: readonly ConnectionPlan[],
): string {
  return plans
    .map((plan) => {
      const source = plan.from === 0 ? t("value.dock") : labelOf(state, plan.from);
      const target = plan.to === 0 ? t("value.dock") : labelOf(state, plan.to);
      const thing =
        plan.filter === null
          ? t("value.cargo")
          : (RESOURCE_LABEL[plan.filter] ?? plan.filter);
      return t("value.linkCarries", { source, target, thing });
    })
    .join(t("value.semicolon"));
}

function labelOf(state: SimState, machineId: number): string {
  const machine = state.machines.find((m) => m.id === machineId);
  return machine
    ? BLUEPRINTS[machine.blueprint].label.toLocaleLowerCase()
    : t("unit.machine");
}

function describeInputs(recipe: {
  inputs: readonly { resource: ResourceId; qty: number }[];
}): string {
  return recipe.inputs
    .map((item) => t("value.recipeItem", { qty: item.qty, label: RESOURCE_LABEL[item.resource] }))
    .join(t("value.comma"));
}

function describeOutputs(recipe: {
  outputs: readonly { resource: ResourceId; qty: number }[];
}): string {
  return recipe.outputs
    .map((item) => t("value.recipeItem", { qty: item.qty, label: RESOURCE_LABEL[item.resource] }))
    .join(t("value.comma"));
}

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}${seq}`;
}
