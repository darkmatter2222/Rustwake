/**
 * UI-RESET-54 (G2 wave 3): the recovery-context panes. The acceptance asks for links
 * into storage, route and power recovery *without losing the machine selection*, and
 * the panel's contract with `App.tsx` (read-only for this issue) has no selection
 * callback — so the context opens in-panel, as local component state beside the
 * existing page toggle precedent. No command is dispatched, `onClose` is never called,
 * and the App's `selected` machine id is untouched while a pane is open.
 */
import { useState } from "react";
import type { MachineState, SimState } from "../../game/simulation/types";
import { Row } from "../panels/shared";
import { COPY } from "./copy";
import { powerContext, routesContext, storageContext } from "./model";

type ContextKind = "storage" | "routes" | "power";

const CONTEXTS: readonly { kind: ContextKind; label: string }[] = [
  { kind: "storage", label: COPY.context.storage },
  { kind: "routes", label: COPY.context.routes },
  { kind: "power", label: COPY.context.power },
];

export function ContextPanes(props: {
  state: SimState;
  machine: MachineState;
  powerRatio: number;
}) {
  const [open, setOpen] = useState<ContextKind | null>(null);
  const { state, machine, powerRatio } = props;
  const pane =
    open === "storage"
      ? storageContext(state, machine)
      : open === "routes"
        ? routesContext(state, machine)
        : open === "power"
          ? powerContext(state, machine, powerRatio)
          : null;

  return (
    <div className="inspector-context">
      <div className="inspector-context__tabs" role="group" aria-label={COPY.sections.recovery}>
        {CONTEXTS.map(({ kind, label }) => (
          <button
            key={kind}
            type="button"
            className="inspector-context__btn"
            aria-pressed={open === kind}
            onClick={() => setOpen(open === kind ? null : kind)}
          >
            {label}
          </button>
        ))}
      </div>
      {pane === null ? (
        <p className="inspector-note">{COPY.context.hint}</p>
      ) : (
        <div className="inspector-context__pane">
          <dl>
            {pane.rows.map((row) => (
              <Row key={row.label} label={row.label} value={row.value} />
            ))}
            {open === "storage" ? (
              <Row label={COPY.rows.reserve} value={storageContext(state, machine).floor} />
            ) : null}
          </dl>
          {open === "routes" && pane.rows.length === 0 ? (
            <p className="inspector-note">{COPY.context.noLinks}</p>
          ) : null}
          <p className="inspector-note">{pane.help}</p>
        </div>
      )}
    </div>
  );
}
