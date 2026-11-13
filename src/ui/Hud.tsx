import { useEffect, useRef, useState } from "react";
import { BLUEPRINTS, TUNING } from "../game/content/defs";
import { t } from "../game/content/strings";
import type { SimState } from "../game/simulation/types";
import type { PrimaryAction } from "./App";
import { RESOURCE_LABEL, costSummary, hudChipLimit, priceLine, visibleResources } from "./text";
import { ALL_RESOURCES_ID, AllResources } from "./hud/AllResources";
import { publishHudState } from "./hud/bridge";
import { COPY } from "./hud/copy";
import { HOME_COPY } from "./home/copy";
import { capacityText, hudNumber } from "./hud/format";
import {
  BoltIcon,
  BoxIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  CoinIcon,
  EyeIcon,
  GearIcon,
  GridIcon,
  ResourceGlyph,
  WarnIcon,
} from "./hud/Icons";
import { powerCue, productionCue, storagePressure } from "./hud/pressure";
import { StorageAlert } from "./hud/StorageAlert";
import "./hud/hud.css";

/* STRAT-004 byte trim: the dock's class fragments are painted from one literal each
   (11 call sites in this row), same rendered `class` attribute, one copy in the chunk. */
const BTN = "dock__btn";
const BTN_PRIMARY = "dock__btn dock__btn--primary";
const BTN_BRANCH = "dock__btn dock__btn--branch";
const BTN_BRANCH_PRIMARY = "dock__btn dock__btn--branch dock__btn--primary";
const COST = "dock__cost";
const SOUND_OFF = t("sound.off");
const SOUND_ON = t("sound.on");

/**
 * UI-RESET-62: the title/continue screen. With real save progress the primary
 * face reads Continue and keeps the pinned accessible name prefix ("Begin
 * recovery…") so keyboard and test paths still find it; the actual save is
 * summarised underneath from the loaded state. A settings-only envelope is not
 * progress, so a fresh yard still reads Begin recovery. New game… opens the
 * reset confirmation (never resets directly) and Settings opens the persisted
 * settings before the run starts. Neither secondary face uses `.gate__btn`, so
 * the primary remains the first begin action on the screen.
 */
export function Gate(props: {
  onBegin: () => void;
  muted: boolean;
  onToggleMute: () => void;
  hasProgress: boolean;
  summary: string | null;
  onNewGame: () => void;
  onSettings: () => void;
}) {
  return (
    <div className="gate">
      <h1 className="gate__title">{t("gate.title")}</h1>
      <p className="gate__sub">{t("gate.sub")}</p>
      {props.hasProgress && props.summary !== null ? (
        <p className="gate__save" role="status">
          {HOME_COPY.savedRun} — {props.summary}
        </p>
      ) : (
        <p className="gate__save">{HOME_COPY.freshYard}</p>
      )}
      <button
        className="gate__btn"
        onClick={props.onBegin}
        aria-label={
          props.hasProgress ? "Begin recovery — continue the saved yard" : undefined
        }
      >
        {props.hasProgress ? HOME_COPY.continue : t("gate.begin")}
      </button>
      {props.hasProgress ? (
        <button type="button" className="gate__secondary" onClick={props.onNewGame}>
          {HOME_COPY.newGame}
        </button>
      ) : null}
      <button type="button" className="gate__secondary" onClick={props.onSettings}>
        {HOME_COPY.settings}
      </button>
      <button className="icon-btn" onClick={props.onToggleMute}>
        {props.muted ? SOUND_OFF : SOUND_ON}
      </button>
    </div>
  );
}

export function ResourceStrip({ state, expanded }: { state: SimState; expanded: boolean }) {
  // Spec 5.4: a small number of chips, four on a portrait phone and seven on a wide
  // screen. The credits and Store status chips share that budget, so the pinned
  // resource list gets what is left. Measured reason: docs/evidence/2026-11-03-hud-share.md.
  // PLAY-001 P-5: the credits chip is there at 0 too, so the charge that bought a level
  // leaves its receipt on the screen - the row is two chips in every state.
  const shown = visibleResources(state, hudChipLimit() - 2);
  // UI-RESET-51: pressure and critical-state reads are pure derivations of the same
  // authoritative state. The cue chips below only exist while a condition is live, so
  // a healthy yard paints exactly the chips it always did.
  const pressure = storagePressure(state);
  const power = powerCue(state);
  const production = productionCue(state);
  return (
    <div className="resources" aria-label="Resources">
      <span className="resources__item" key="scrap">
        <ResourceGlyph id="scrap" className="resources__icon" />
        {RESOURCE_LABEL["scrap"]}
        <strong>{hudNumber(state.store["scrap"] ?? 0)}</strong>
      </span>
      {shown
        .filter((key) => key !== "scrap")
        .map((key) => (
          <span className="resources__item" key={key}>
            <ResourceGlyph id={key} className="resources__icon" />
            {RESOURCE_LABEL[key] ?? key}
            <strong>{hudNumber(state.store[key] ?? 0)}</strong>
          </span>
        ))}
      <span className="resources__item resources__item--credits">
        <CoinIcon className="resources__icon" />
        {t("chip.credits")}
        <strong>{hudNumber(state.credits)}</strong>
      </span>
      <span className="resources__item resources__item--store" data-pressure={pressure.tier}>
        <BoxIcon className="resources__icon" />
        {t("chip.store")}
        {/* UI-006: the value is an element, not a bare text node, so it becomes a second flex
            item and inherits this chip's own `gap: 4px` - the same separation `• Scrap 5` and
            `• Credits 0` already get. Two adjacent text nodes share no gap, which is why the
            chip read `Store900/900` at 390 px while its neighbours read spaced. */}
        <strong>{capacityText(state.storeUnits, state.storeCapacity)}</strong>
        {pressure.tier !== "ok" ? <WarnIcon className="resources__warn" /> : null}
      </span>
      {power ? (
        <span className="resources__item resources__item--cue" data-cue="power">
          <BoltIcon className="resources__icon" />
          {`${COPY.power} ${power.percent} %${power.limited > 0 ? ` · ${power.limited} ${COPY.limited}` : ""}`}
          {power.percent < 100 ? <WarnIcon className="resources__warn" /> : null}
        </span>
      ) : null}
      {production ? (
        <span className="resources__item resources__item--cue" data-cue="production">
          <GearIcon className="resources__icon" />
          {[
            production.starved > 0 ? `${production.starved} ${COPY.needInput}` : null,
            production.outputFull > 0 ? `${production.outputFull} ${COPY.cargoFull}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          {production.outputFull > 0 ? <WarnIcon className="resources__warn" /> : null}
        </span>
      ) : null}
      {expanded ? <AllResources state={state} /> : null}
    </div>
  );
}

export function HudTop(props: {
  state: SimState;
  muted: boolean;
  textScale: number;
  onCycleText: () => void;
  onToggleMute: () => void;
  onHome: () => void;
}) {
  // UI-RESET-51: the all-resource drawer is a local toggle; the chip budget is unchanged.
  const [expanded, setExpanded] = useState(false);
  // Publish the state this pass renders so the dock's StorageAlert (which receives no
  // state prop) can read it. HudTop renders before DockButtons in the same App pass.
  publishHudState(props.state);
  return (
    <div className="hud__top">
      <ResourceStrip state={props.state} expanded={expanded} />
      <div className="cluster">
        <button
          className="icon-btn"
          onClick={props.onToggleMute}
          aria-label={props.muted ? SOUND_OFF : SOUND_ON}
        >
          {/* At a large scale the three cluster buttons share one row: the word "Sound"
              is 105 px at 30 px and would push the third button past the viewport. The
              accessible name keeps the long form, and the two glyphs differ in shape,
              not only in colour (spec 6.4). */}
          {props.textScale >= 1.5
            ? props.muted
              ? t("glyph.muted")
              : t("glyph.audible")
            : props.muted
              ? t("btn.soundMuted")
              : t("btn.soundAudible")}
        </button>
        <button
          className="icon-btn"
          onClick={props.onCycleText}
          aria-label={t("aria.textSize", { scale: props.textScale })}
        >
          {t("btn.textScale", { scale: props.textScale })}
        </button>
        {/* UI-RESET-51: the all-resource escape hatch. Inserted BEFORE Home so Home stays
            the cluster's last child (styles.css hides `.cluster .icon-btn:last-child`).
            Icon-only face; the accessible name carries the meaning. */}
        <button
          className="icon-btn"
          onClick={() => setExpanded((v) => !v)}
          aria-label={COPY.allResources}
          aria-expanded={expanded}
          aria-controls={ALL_RESOURCES_ID}
        >
          <GridIcon className="cluster__glyph" size={16} />
        </button>
        <button className="icon-btn" onClick={props.onHome} aria-label={t("aria.home")}>
          {t("btn.home")}
        </button>
      </div>
    </div>
  );
}

/**
 * The resting card in two weight tiers (UI-002). Tier one is the one thing the next tap
 * does; tier two is one numeric readout line - the flying fleet, the shared power budget
 * and, right after a refusal, the carried shortfall as two numbers. The old card printed
 * four lines at nearly one size, so nothing led and the world lost a third of the screen
 * to text at 360 x 640 scale 2.0. The five pips per machine are not repeated here at all:
 * the tiles paint them, and the world outranks the text.
 *
 * UI-RESET-51: the guidance is optional. Three modes - full (the exact card above),
 * concise (the lead line only) and dismissed (a single restore face) - let the player
 * shrink or hide the objective so it never consumes the whole world. The controls are
 * icon-only (no text), so the resting-screen line/tier census is unchanged, and the
 * default mode paints the original DOM verbatim.
 */
export function ObjectiveCard(props: {
  text: string;
  phase?: string;
  numbers: string;
}) {
  const [mode, setMode] = useState<"full" | "concise" | "dismissed">("full");
  const dismissed = mode === "dismissed";
  const className =
    mode === "full" ? "objective" : `objective objective--${mode}`;
  return (
    <div className={className}>
      {!dismissed ? <span className="objective__primary">{props.text}</span> : null}
      {/* L-2: the guidance line is its own block, a sibling of the chip row, so the two
          "step the secondary row back" rules (large text scale, short viewport) -
          which now narrow to the chip row - cannot collapse it to zero height. */}
      {mode === "full" && props.phase ? <span className="status-line">{props.phase}</span> : null}
      {/* A1-4 / PLAY-002 2: one secondary line carries the fleet, the power budget and the
          last shortfall, all from the same readout, so the card never grows a fourth row. */}
      {mode === "full" ? <span className="status-line">{props.numbers}</span> : null}
      <div className="objective__row" />
      <div className="objective__controls">
        {mode === "full" ? (
          <button
            type="button"
            className="objective__btn"
            aria-label={COPY.collapse}
            onClick={() => setMode("concise")}
          >
            <ChevronUpIcon size={16} />
          </button>
        ) : null}
        {mode === "concise" ? (
          <button
            type="button"
            className="objective__btn"
            aria-label={COPY.expand}
            onClick={() => setMode("full")}
          >
            <ChevronDownIcon size={16} />
          </button>
        ) : null}
        {dismissed ? (
          <button
            type="button"
            className="objective__btn"
            aria-label={COPY.restore}
            onClick={() => setMode("full")}
          >
            <EyeIcon size={16} />
          </button>
        ) : (
          <button
            type="button"
            className="objective__btn"
            aria-label={COPY.dismiss}
            onClick={() => setMode("dismissed")}
          >
            <CloseIcon size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

export function DockButtons(props: {
  primary: PrimaryAction;
  buildBlueprint: string | null;
  research: boolean;
  yard: boolean;
  /** UI-RESET-52: the dock no longer cycles blueprints. Both the resting Build
      face and the build phase's third face open the catalog, where every machine
      is named, priced and explained before one is chosen. */
  onOpenCatalog: () => void;
  onPlace: () => void;
  onCancelBuild: () => void;
  onInventory: () => void;
  onResearch: () => void;
  onYard: () => void;
}) {
  if (props.buildBlueprint !== null) {
    const placeCost = priceLine(costText(props.buildBlueprint));
    return (
      <>
        {/* UI-RESET-51: the storage alert leads to recovery in both dock phases. It is a
            sibling of the dock, not a dock face, so the pinned face counts and exact-match
            taps are untouched. */}
        <StorageAlert onInventory={props.onInventory} />
        <div className="dock">
          <button className={BTN} onClick={props.onCancelBuild}>
            {t("btn.cancel")}
          </button>
          {/* PLAY-001 P-3: one committed choice, one label. The build step's own wording
              carries through the phase flip - the same key and the same price the primary
              button printed a tap ago - so the row's face never alternates while the goal
              is unchanged. The phase itself is the `.status-line` under the objective.
              STRAT-004: `priceLine` appends the face's own pending numbers to that price,
              so one `dock__cost` line carries `10 scrap + 5 ferrous · waits 10 scrap ·
              have 5 · in 2s` and a blocked build is countable on the face itself. */}
          <button className={BTN_PRIMARY} onClick={props.onPlace}>
            {t("btn.buildNamed", {
              machine: BLUEPRINTS[props.buildBlueprint]?.label ?? props.buildBlueprint,
            })}
            <span className={COST}>{placeCost}</span>
          </button>
          {/* UI-RESET-52: the third face keeps its pinned label and slot (the shell's
              build-phase census reads exactly Cancel / Build {machine} / Next) but its
              verb is now the catalog, not a blind cycle through the unlock list. */}
          <button className={BTN} onClick={props.onOpenCatalog}>
            {t("btn.next")}
          </button>
        </div>
      </>
    );
  }
  // STRAT-004: the price line of the face the thumb is aimed at carries its own pending
  // numbers, so the same short sentence paints in both dock phases and moves as soon as a
  // delivery lands or a batch closes - the stall is then countable on the face, not only in
  // the `Last need …` tail. The two named fork faces keep their one price line each (their
  // prices are the whole comparison), so the row that already prints two numbers stays two.
  return (
    <>
      <StorageAlert onInventory={props.onInventory} />
      <div className="dock">
        {props.primary.branches && props.primary.branches.length > 0 ? (
          /* The fork (A1-3): one price, three named outcomes, three equal thirds. Each
             button is the whole choice - one tap commits that branch and the row returns
             to its usual targets - so no blind tap can pick an unnamed default.
             UI-002: the row is painted cheapest-first (`sortedBranchOptions`), so the
             leftmost face - the one a blind thumb reaches - carries the single accent fill
             and is the plan the current purse can pay. One accent-filled primary per row. */
          props.primary.branches.map((branch, index) => (
            <button
              className={
                index === 0 ? BTN_BRANCH_PRIMARY : BTN_BRANCH
              }
              key={branch.id}
              onClick={branch.run}
            >
              {branch.label}
              {branch.cost ? <span className={COST}>{branch.cost}</span> : null}
            </button>
          ))
        ) : (
          <>
            <button className={BTN} onClick={props.onInventory}>
              {t("btn.store")}
            </button>
            {/* The yard record and the save transfer, unlocked after the tutorial so the
                first ten minutes keep three targets (spec 5.5 caps a narrow dock at five). */}
            {props.yard ? (
              <button className={BTN} onClick={props.onYard}>
                {t("btn.yard")}
              </button>
            ) : null}
            <button className={BTN_PRIMARY} onClick={props.primary.run}>
              {props.primary.label}
              {props.primary.cost ? <span className={COST}>{priceLine(props.primary.cost)}</span> : null}
            </button>
            <button className={BTN} onClick={props.onOpenCatalog}>
              {t("btn.build")}
            </button>
            {props.research ? (
              <button className={BTN} onClick={props.onResearch}>
                {t("btn.research")}
              </button>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

function costText(blueprint: string): string {
  const def = BLUEPRINTS[blueprint];
  if (!def) return "";
  return costSummary(def);
}

export function Toast(props: { text: string; count?: number; onDone: () => void }) {
  const done = useRef(props.onDone);
  done.current = props.onDone;
  const count = props.count ?? 1;
  // Depend on the text and the event count only: the sim re-renders every animation
  // frame, and a per-render dependency would restart the timer so it never fires.
  // UI-RESET-65 (c2): a repeated identical readout bumps `count`, restarting the
  // window once per group rather than firing a fresh toast for every refused tap.
  // The count is painted by a ::after pseudo-element keyed on data-count, so the
  // live-region text stays the single sentence — no re-announcement spam, and every
  // pinned readout keeps reading the bare sentence. The ×N suffix is language-neutral.
  useEffect(() => {
    const timer = setTimeout(() => done.current(), 1800);
    return () => clearTimeout(timer);
  }, [props.text, count]);
  return (
    <div className="toast" role="status" data-count={count}>
      {props.text}
    </div>
  );
}

export { TUNING };