// STRAT-004-g1: side-by-side reading of layout-witness.json (base vs candidate per cell).
// Usage: node work/feedback/STRAT-004-g1/layout-table.mjs
import { readFileSync } from "node:fs";
const j = JSON.parse(readFileSync("work/feedback/STRAT-004-g1/layout-witness.json", "utf8"));
const byCell = new Map();
for (const r of j.rows) {
  if (!byCell.has(r.cell)) byCell.set(r.cell, {});
  byCell.get(r.cell)[r.artifact] = r;
}
for (const [cell, pair] of byCell) {
  const b = pair.base;
  const c = pair.candidate;
  if (!b || !c) {
    console.log(`${cell}: only ${Object.keys(pair).join("/")}`);
    continue;
  }
  const lines = (n) => (n.primaryLines ?? []).length;
  console.log(
    `${cell.padEnd(22)} fill ${b.cardFillPct} -> ${c.cardFillPct} %   ` +
      `face ${b.smallestFace} -> ${c.smallestFace} px   dockH ` +
      `${b.dockH ?? "?"} -> ${c.dockH ?? "?"} px (top ${b.dockTop ?? "?"} -> ${c.dockTop ?? "?"})  ` +
      `canvasH ${b.canvasH ?? "?"} -> ${c.canvasH ?? "?"}   ` +
      `rows ${b.dockRows} -> ${c.dockRows}   ` +
      `scroll ${b.noScroll ? "no" : "YES"} -> ${c.noScroll ? "no" : "YES"}   ` +
      `lines ${lines(b)} -> ${lines(c)}   errors ${b.pageErrors} -> ${c.pageErrors}`
  );
  console.log(`   candidate pending line: ${JSON.stringify(c.primaryLines)}`);
}
