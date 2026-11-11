// STRAT-004 g1: re-prints the PLAYER-004-g1 blind timeline in the three mechanism
// buckets this ticket names, so the baseline the acceptance is judged against is on the
// same page as the candidate's own census. Read-only over the recorded json.
// Usage: node work/feedback/STRAT-004-g1/baseline-census.mjs
import { readFileSync } from "node:fs";

const SRC =
  "C:/Users/ryans/.local/share/opencode/worktree/fe4e05/player-a551794/work/feedback/PLAYER-004-g1/policies.json";
const j = JSON.parse(readFileSync(SRC, "utf8"));

for (const r of j.results) {
  const t = r.timeline;
  const noops = t.slice(1).filter((x) => x.revDelta === 0);
  const isShortfall = (s) => typeof s === "string" && /^Need \d+ .+ . have \d+/.test(s.trim());
  let inert = 0;
  let refused = 0;
  let unknown = 0;
  for (let i = 1; i < t.length; i++) {
    const x = t[i];
    if (x.revDelta !== 0) continue;
    if (isShortfall(x.toast)) refused++;
    else if (x.label === t[i - 1].label && !x.toast) inert++;
    else unknown++;
  }
  let run = 0;
  let longest = 0;
  let longestLabel = "";
  for (let i = 1; i < t.length; i++) {
    if (t[i].label === t[i - 1].label && t[i].revDelta === 0) {
      run++;
      if (run > longest) {
        longest = run;
        longestLabel = t[i].label ?? "";
      }
    } else run = 0;
  }
  const applied = t.reduce((s, x) => s + (x.revDelta ?? 0), 0);
  const last = t[t.length - 1];
  console.log(
    JSON.stringify(
      {
        policy: r.policy,
        taps: t.length,
        appliedCommands: applied,
        noopTaps: noops.length,
        buckets: { inertLabel: inert, refusedShortfall: refused, unknown, sum: inert + refused + unknown },
        inertLabelPctOfTaps: +((100 * inert) / t.length).toFixed(1),
        longestIdenticalLabelStallRepeats: longest,
        longestLabel,
        finalTick: last.tick,
        machines: last.machines,
        batches: last.batches,
        credits: last.credits,
        distinctToastShapes: [
          ...new Set(t.map((x) => x.toast).filter(Boolean).map((s) => s.replace(/\d+/g, "N"))),
        ],
        refusalToastCount: t.filter((x) => isShortfall(x.toast)).length,
        toastNonNull: t.filter((x) => x.toast).length,
      },
      null,
      1
    )
  );
}
