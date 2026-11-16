// Helper for the UI-006 g2 evidence: prints the raw ink runs (one rect per line box) per chip
// for both the before and after ladder, so "rows = 2" can be checked against the actual tops.
import { readFileSync } from "node:fs";

const fmt = (run) => `${run.kind}:${run.text} L${run.left}-R${run.right}@T${run.top} h${run.heightPx}`;
for (const tag of ["before", "after"]) {
  const json = JSON.parse(readFileSync(`work/evidence/UI-006-g2/ladder-${tag}.json`, "utf8"));
  for (const step of json.steps) {
    console.log(`[${tag}] ${step.label}`);
    for (const group of step.groups)
      for (const chip of group.chips)
        console.log(
          `  ${group.label} "${chip.text}" h ${chip.heightPx} w ${chip.widthPx} rows ${chip.rows}` +
            ` gaps ${JSON.stringify(chip.gaps)} ink ${JSON.stringify(chip.inkRuns.map(fmt))}`
        );
  }
}
