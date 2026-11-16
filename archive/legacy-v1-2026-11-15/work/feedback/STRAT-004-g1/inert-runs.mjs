// STRAT-004 g1: where are the `inert-label` taps? Prints every maximal run of
// inert-label taps with its face text, plus the state columns that did move.
// Usage: node work/feedback/STRAT-004-g1/inert-runs.mjs [artifact] [policy]
import { readFileSync } from "node:fs";

const j = JSON.parse(readFileSync("work/feedback/STRAT-004-g1/policy-census.json", "utf8"));
const wantArtifact = process.argv[2] ?? "candidate";
const wantPolicy = process.argv[3] ?? "blind";
const row = j.results.find((r) => r.artifact === wantArtifact && r.policy === wantPolicy);
if (!row) throw new Error(`no row for ${wantArtifact}/${wantPolicy}`);
const timeline = row.timeline;
const shortfallToast = (s) => typeof s === "string" && /^Need \d+ .+ . have \d+/.test(s.trim());

let runs = [];
let current = null;
for (let i = 1; i < timeline.length; i++) {
  const x = timeline[i];
  const inert =
    x.revDelta === 0 && !shortfallToast(x.toast) && x.label === timeline[i - 1].label && !x.toast;
  if (inert) {
    if (!current) current = { from: x.n, to: x.n, label: x.label, rows: [timeline[i - 1], x] };
    else {
      current.to = x.n;
      current.rows.push(x);
    }
  } else if (current) {
    runs.push(current);
    current = null;
  }
}
if (current) runs.push(current);

console.log(`inert runs: ${runs.length}, taps: ${runs.reduce((s, r) => s + (r.to - r.from + 1), 0)}`);
for (const r of runs) {
  const first = r.rows[0];
  const moved = new Set();
  for (const t of r.rows) {
    if (t.batches !== r.rows[0].batches) moved.add("batches");
    if (t.storeUnits !== r.rows[0].storeUnits) moved.add("storeUnits");
    if (t.credits !== r.rows[0].credits) moved.add("credits");
    if (t.power !== r.rows[0].power) moved.add("power");
    if ((t.status ?? []).join("") !== (r.rows[0].status ?? []).join("")) moved.add("status");
  }
  console.log(
    `taps ${r.from}-${r.to} (${r.to - r.from + 1}) moved=[${[...moved].join(",")}] ` +
      `face="${r.label}"`
  );
  console.log(
    `     status="${(r.rows[r.rows.length - 1].status ?? []).join(" | ")}"`
  );
}
