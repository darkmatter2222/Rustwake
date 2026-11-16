import type { ReactNode } from "react";

/**
 * One panel row: a label, its value, and optionally one control, all inside **one** line
 * box (UI-002, Lane B fold-in). `.panel dl` is a one-column grid and `.panel__row` is a
 * flex line, so the `dt` and its `dd` share a top edge and the value always starts after
 * the label - the old two-column `auto 1fr` grid mixed bare `<dt>/<dd>` pairs with
 * `<div>`-wrapped rows, which is what dropped `20/900` under "Scrap 20" and left
 * "Capacity" standing alone in `docs/../work/review/dispatch-startup/captures/
 * ds-360-ts2-panel-store.png`. Every row is as wide as the panel body: full-width rows.
 */
export function Row(props: { label: string; value: ReactNode; children?: ReactNode }) {
  return (
    <div className="panel__row">
      <dt>{props.label}</dt>
      <dd>{props.value}</dd>
      {props.children}
    </div>
  );
}

let seq = 0;
export function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}${seq}`;
}