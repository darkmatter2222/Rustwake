// Side-by-side of the two `capture-research.mjs` runs (same script, same seed).
// Usage: node q001-evidence/compare.mjs
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const load = (label) =>
  JSON.parse(readFileSync(resolve(root, `q001-evidence/research-${label}.json`), "utf8"));

const key = (r) => `${r.scale}|${r.viewport}|${r.set}`;
const before = new Map(load("before").summary.map((r) => [key(r), r]));
const afterDoc = load("after");
const after = new Map(afterDoc.summary.map((r) => [key(r), r]));

const linesOf = (row) => {
  const counts = row.blocks.map((b) => b.lines);
  const narrow = row.blocks.reduce((m, b) => Math.min(m, b.w), 9999);
  return { maxLines: counts.length ? Math.max(...counts) : 0, narrow: Math.round(narrow * 10) / 10 };
};

console.log(
  "| scale | viewport | set | contained scroll before → after | max text lines before → after" +
    " | narrowest block before → after | card widths after | buy targets after |"
);
console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
for (const [k, a] of after) {
  const b = before.get(k);
  if (!b) {
    console.log(`| ${a.scale} | ${a.viewport} | ${a.set} | (no before row) | | | | |`);
    continue;
  }
  const lb = linesOf(b);
  const la = linesOf(a);
  // Gate: every painted control lands inside the visual viewport once its own
  // line is brought in (`insideViewport`). `insideBody` is kept as detail: the
  // Close button lives in the panel head, outside the scroller by design.
  const reach = a.reachable
    ? a.reachable.rows.every((r) => r.insideViewport)
      ? `all ${a.reachable.rows.length} inside the viewport (scroller travel ${a.reachable.maxScroll} px)`
      : `NOT REACHED ${JSON.stringify(a.reachable.rows.filter((r) => !r.insideViewport))}`
    : "no scroll needed";
  console.log(
    `| ${a.scale} | ${a.viewport} | ${a.set} | ${b.containedScroll} → ${a.containedScroll} px` +
      ` | ${lb.maxLines} → ${la.maxLines} lines | ${lb.narrow} → ${la.narrow} px` +
      ` | ${a.cardWidths.join(" ")} | ${a.buttons.join(" ; ") || "none"} (${reach}) |`
  );
}
const flat = afterDoc.summary.filter((r) => r.noDocScroll).length;
const clipped = afterDoc.summary.filter((r) => r.clippedText.length).length;
const minTarget = Math.min(...afterDoc.summary.map((r) => r.minTarget).filter((n) => n < 999));
console.log("");
console.log(`after: no document scroll in ${flat}/${after.summary.length} cases;` +
  ` horizontally clipped text blocks in ${clipped} cases;` +
  ` smallest painted control ${minTarget} px;` +
  ` missing panels: ${(afterDoc.missingPanels || []).length ? (afterDoc.missingPanels || []).join(", ") : "none"}`);
const purchase = after.summary.find((r) => r.purchase)?.purchase;
if (purchase) {
  for (const frame of purchase.frames) {
    console.log(
      `purchase ${frame.at}: tapped=${frame.tapped ?? "-"} research ${JSON.stringify(frame.research)}` +
        ` data ${frame.data} states [${frame.states.join(" ")}] disabled [${frame.disabled.join(", ") || "none"}]` +
        ` enabled [${frame.enabled.join(", ")}]`
    );
  }
}
