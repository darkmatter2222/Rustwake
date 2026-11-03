import { useEffect } from "react";
import { BLUEPRINTS, TUNING } from "../game/content/defs";
import type { SimState } from "../game/simulation/types";
import type { PrimaryAction } from "./App";
import { RESOURCE_LABEL, formatNumber, visibleResources } from "./text";

const DOT_COLORS: Record<string, string> = {
  scrap: "#c9713a",
  credits: "#ffb765",
  ferrous: "#6f93ad",
  steel: "#5fd8e8",
};

export function Gate(props: { onBegin: () => void; muted: boolean; onToggleMute: () => void }) {
  return (
    <div className="gate">
      <h1 className="gate__title">RUSTWAKE</h1>
      <p className="gate__sub">Salvage yard 07 · systems waking</p>
      <button className="gate__btn" onClick={props.onBegin}>
        Begin recovery
      </button>
      <button className="icon-btn" onClick={props.onToggleMute}>
        {props.muted ? "Sound off" : "Sound on"}
      </button>
    </div>
  );
}

export function ResourceStrip({ state }: { state: SimState }) {
  const shown = visibleResources(state);
  return (
    <div className="resources" aria-label="Resources">
      <span className="resources__item" key="scrap">
        <span className="resources__dot" style={{ background: DOT_COLORS["scrap"] }} />
        Scrap <strong>{formatNumber(state.store["scrap"] ?? 0)}</strong>
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
      {state.credits > 0 ? (
        <span className="resources__item">
          <span className="resources__dot" style={{ background: DOT_COLORS["credits"] }} />
          Credits <strong>{formatNumber(state.credits)}</strong>
        </span>
      ) : null}
      <span className="resources__item">
        Store {formatNumber(state.storeUnits)}/{formatNumber(state.storeCapacity)}
      </span>
    </div>
  );
}

export function HudTop(props: {
  state: SimState;
  muted: boolean;
  onToggleMute: () => void;
  onHome: () => void;
}) {
  return (
    <div className="hud__top">
      <ResourceStrip state={props.state} />
      <div className="cluster">
        <button className="icon-btn" onClick={props.onToggleMute} aria-label="Toggle sound">
          {props.muted ? "Sound off" : "Sound on"}
        </button>
        <button className="icon-btn" onClick={props.onHome} aria-label="Return to yard view">
          Home
        </button>
      </div>
    </div>
  );
}

export function ObjectiveCard(props: { text: string; hint: string }) {
  return (
    <div className="objective">
      <span>{props.text}</span>
      <div className="objective__row">
        <span className="status-line">{props.hint}</span>
      </div>
    </div>
  );
}

export function DockButtons(props: {
  primary: PrimaryAction;
  buildBlueprint: string | null;
  onPickBlueprint: (id: string) => void;
  onPlace: () => void;
  onCancelBuild: () => void;
  onInventory: () => void;
}) {
  const blueprintIds = Object.keys(BLUEPRINTS);
  if (props.buildBlueprint !== null) {
    return (
      <div className="dock">
        <button className="dock__btn" onClick={props.onCancelBuild}>
          Cancel
        </button>
        <button className="dock__btn dock__btn--primary" onClick={props.onPlace}>
          Place
          <span className="dock__cost">
            {costText(props.buildBlueprint)}
          </span>
        </button>
        <button
          className="dock__btn"
          onClick={() => {
            const index = blueprintIds.indexOf(props.buildBlueprint ?? "sorter");
            props.onPickBlueprint(blueprintIds[(index + 1) % blueprintIds.length]);
          }}
        >
          Next
        </button>
      </div>
    );
  }
  return (
    <div className="dock">
      <button className="dock__btn" onClick={props.onInventory}>
        Store
      </button>
      <button className="dock__btn dock__btn--primary" onClick={props.primary.run}>
        {props.primary.label}
        {props.primary.cost ? <span className="dock__cost">{props.primary.cost}</span> : null}
      </button>
      <button className="dock__btn" onClick={() => props.onPickBlueprint("sorter")}>
        Build
      </button>
    </div>
  );
}

function costText(blueprint: string): string {
  const def = BLUEPRINTS[blueprint];
  if (!def) return "";
  return def.buildCost.map((item) => `${item.qty} ${RESOURCE_LABEL[item.resource]}`).join(" + ");
}

export function Toast(props: { text: string; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(props.onDone, 1800);
    return () => clearTimeout(timer);
  }, [props]);
  return (
    <div className="toast" role="status">
      {props.text}
    </div>
  );
}

export { TUNING };
