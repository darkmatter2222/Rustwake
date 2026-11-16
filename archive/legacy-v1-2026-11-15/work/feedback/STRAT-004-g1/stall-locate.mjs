// STRAT-004 g1: locates the recorded 32-tap stall inside the blind timeline and prints
// the objective/status pair of those taps, so the fix targets the phase the stall lives in.
// Usage: node work/feedback/STRAT-004-g1/stall-locate.mjs
import { readFileSync } from "node:fs";

const SRC =
  "C:/Users/ryans/.local/share/opencode/worktree/fe4e05/player-a551794/work/feedback/PLAYER-004-g1/policies.json";
const j = JSON.parse(readFileSync(SRC, "utf8"));
const r = j.results.find((x) => x.policy === "blind");
const t = r.timeline;

// the run the analyzer names: longest identical-label, revDelta-0 run
let best = { start: -1, len: 0, label: "" };
let start = 1;
let len = 1;
for (let i = 1; i < t.length; i++) {
  if (t[i].label === t[i - 1].label && t[i].revDelta === 0) {
    len++;
    if (len > best.len) best = { start, len, label: t[i].label ?? "" };
  } else {
    start = i + 1;
    len = 1;
  }
}
console.log("longest run (taps):", JSON.stringify(best));
const from = Math.max(1, best.start - 2);
const to = Math.min(t.length, best.start + best.len + 1);
for (let i = from; i <= to; i++) {
  const x = t[i - 1];
  if (!x) continue;
  console.log(
    `tap ${x.n} tick ${x.tick} mach ${x.machines} batches ${x.batches} credits ${x.credits} ` +
      `rev${x.revDelta === null ? "?" : x.revDelta} label="${x.label}" toast=${x.toast ?? "-"}`
  );
  console.log(`     obj="${x.obj}" status=${JSON.stringify(x.status)}`);
  console.log(`     dock=${JSON.stringify(x.dock)}`);
}
