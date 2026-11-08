import { useEffect, useRef } from "react";
import { BLUEPRINTS, TUNING } from "../game/content/defs";
import { t } from "../game/content/strings";
import type { SimState } from "../game/simulation/types";
import type { PrimaryAction } from "./App";
import { RESOURCE_LABEL, costSummary, formatNumber, hudChipLimit, priceLine, visibleResources } from "./text";

import { PALETTE } from "../game/renderer/sprites";

/* Q-002: the five hexes shared with the renderer read from the one PALETTE
   source; the rest are chip-only tints. */
const DOT_COLORS: Record<string, string> = {
  scrap: PALETTE.rust,
  credits: PALETTE.amber,
  ferrous: PALETTE.steelLight,
  nonferrous: PALETTE.violet,
  residue: "#7b8a99",
  steel: PALETTE.cyan,
  copper: "#e0975b",
  polymer: "#c9b45d",
  wire: "#9fd0d8",
  plates: "#a9b6c4",
  circuits: "#b39ddb",
  data: "#7fd6c2",
};

export function Gate(props: { onBegin: () => void; muted: boolean; onToggleMute: () => void }) {
  return (
    <div className="gate">
      <h1 className="gate__title">{t("gate.title")}</h1>
      <p className="gate__sub">{t("gate.sub")}</p>
      <button className="gate__btn" onClick={props.onBegin}>
        {t("gate.begin")}
      </button>
      <button className="icon-btn" onClick={props.onToggleMute}>
        {props.muted ? t("sound.off") : t("sound.on")}
      </button>
    </div>
  );
}

export function ResourceStrip({ state }: { state: SimState }) {
  // Spec 5.4: a small number of chips, four on a portrait phone and seven on a wide
  // screen. The credits and Store status chips share that budget, so the pinned
  // resource list gets what is left. Measured reason: docs/evidence/2026-11-03-hud-share.md.
  // PLAY-001 P-5: the credits chip is there at 0 too, so the charge that bought a level
  // leaves its receipt on the screen - the row is two chips in every state.
  const shown = visibleResources(state, hudChipLimit() - 2);
  return (
    <div className="resources" aria-label="Resources">
      <span className="resources__item" key="scrap">
        <span className="resources__dot" style={{ background: DOT_COLORS["scrap"] }} />
        {RESOURCE_LABEL["scrap"]}
        <strong>{formatNumber(state.store["scrap"] ?? 0)}</strong>
      </span>
      {shown
        .filter((key) => key !== "scrap")
        .map((key) => (
          <span className="resources__item" key={key}>
            <span className="resources__dot" style={{ background: DOT_COLORS[key] ?? "#6f93ad" }} />
            {RESOURCE_LABEL[key] ?? key}
            <strong>{formatNumber(state.store[key] ?? 0)}</strong>
          </span>
        ))}
      <span className="resources__item">
        <span className="resources__dot" style={{ background: DOT_COLORS["credits"] }} />
        {t("chip.credits")}
        <strong>{formatNumber(state.credits)}</strong>
      </span>
      <span className="resources__item">
        {t("chip.store")}
        {formatNumber(state.storeUnits)}/{formatNumber(state.storeCapacity)}
      </span>
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
  return (
    <div className="hud__top">
      <ResourceStrip state={props.state} />
      <div className="cluster">
        <button
          className="icon-btn"
          onClick={props.onToggleMute}
          aria-label={props.muted ? t("sound.off") : t("sound.on")}
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
 */
export function ObjectiveCard(props: {
  text: string;
  phase?: string;
  numbers: string;
}) {
  return (
    <div className="objective">
      <span className="objective__primary">{props.text}</span>
      {/* L-2: the guidance line is its own block, a sibling of the chip row, so the two
          "step the secondary row back" rules (large text scale, short viewport) -
          which now narrow to the chip row - cannot collapse it to zero height. */}
      {props.phase ? <span className="status-line">{props.phase}</span> : null}
      {/* A1-4 / PLAY-002 2: one secondary line carries the fleet, the power budget and the
          last shortfall, all from the same readout, so the card never grows a fourth row. */}
      <span className="status-line">{props.numbers}</span>
      <div className="objective__row" />
    </div>
  );
}

export function DockButtons(props: {
  primary: PrimaryAction;
  buildBlueprint: string | null;
  unlocked: string[];
  research: boolean;
  yard: boolean;
  onPickBlueprint: (id: string) => void;
  onPlace: () => void;
  onCancelBuild: () => void;
  onInventory: () => void;
  onResearch: () => void;
  onYard: () => void;
}) {
  const blueprintIds = props.unlocked.length > 0 ? props.unlocked : Object.keys(BLUEPRINTS);
  if (props.buildBlueprint !== null) {
    const placeCost = priceLine(costText(props.buildBlueprint));
    return (
      <div className="dock">
        <button className="dock__btn" onClick={props.onCancelBuild}>
          {t("btn.cancel")}
        </button>
        {/* PLAY-001 P-3: one committed choice, one label. The build step's own wording
            carries through the phase flip - the same key and the same price the primary
            button printed a tap ago - so the row's face never alternates while the goal
            is unchanged. The phase itself is the `.status-line` under the objective.
            STRAT-004: `priceLine` appends the face's own pending numbers to that price,
            so one `dock__cost` line carries `10 scrap + 5 ferrous · waits 10 scrap ·
            have 5 · in 2s` and a blocked build is countable on the face itself. */}
        <button className="dock__btn dock__btn--primary" onClick={props.onPlace}>
          {t("btn.buildNamed", {
            machine: BLUEPRINTS[props.buildBlueprint]?.label ?? props.buildBlueprint,
          })}
          <span className="dock__cost">{placeCost}</span>
        </button>
        <button
          className="dock__btn"
          onClick={() => {
            const index = blueprintIds.indexOf(props.buildBlueprint ?? blueprintIds[0]);
            props.onPickBlueprint(blueprintIds[(index + 1) % blueprintIds.length]);
          }}
        >
          {t("btn.next")}
        </button>
      </div>
    );
  }
  // STRAT-004: the price line of the face the thumb is aimed at carries its own pending
  // numbers, so the same short sentence paints in both dock phases and moves as soon as a
  // delivery lands or a batch closes - the stall is then countable on the face, not only in
  // the `Last need …` tail. The two named fork faces keep their one price line each (their
  // prices are the whole comparison), so the row that already prints two numbers stays two.
  return (
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
              index === 0 ? "dock__btn dock__btn--branch dock__btn--primary" : "dock__btn dock__btn--branch"
            }
            key={branch.id}
            onClick={branch.run}
          >
            {branch.label}
            {branch.cost ? <span className="dock__cost">{branch.cost}</span> : null}
          </button>
        ))
      ) : (
        <>
          <button className="dock__btn" onClick={props.onInventory}>
            {t("btn.store")}
          </button>
          {/* The yard record and the save transfer, unlocked after the tutorial so the
              first ten minutes keep three targets (spec 5.5 caps a narrow dock at five). */}
          {props.yard ? (
            <button className="dock__btn" onClick={props.onYard}>
              {t("btn.yard")}
            </button>
          ) : null}
          <button className="dock__btn dock__btn--primary" onClick={props.primary.run}>
            {props.primary.label}
            {props.primary.cost ? <span className="dock__cost">{priceLine(props.primary.cost)}</span> : null}
          </button>
          <button className="dock__btn" onClick={() => props.onPickBlueprint(blueprintIds[0])}>
            {t("btn.build")}
          </button>
          {props.research ? (
            <button className="dock__btn" onClick={props.onResearch}>
              {t("btn.research")}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

function costText(blueprint: string): string {
  const def = BLUEPRINTS[blueprint];
  if (!def) return "";
  return costSummary(def);
}

export function Toast(props: { text: string; onDone: () => void }) {
  const done = useRef(props.onDone);
  done.current = props.onDone;
  // Depend on the text only: the sim re-renders every animation frame, and a
  // per-render dependency would restart the timer so it never fires.
  useEffect(() => {
    const timer = setTimeout(() => done.current(), 1800);
    return () => clearTimeout(timer);
  }, [props.text]);
  return (
    <div className="toast" role="status">
      {props.text}
    </div>
  );
}

export { TUNING };
