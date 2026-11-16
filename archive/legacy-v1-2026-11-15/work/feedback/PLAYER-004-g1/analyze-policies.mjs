// PLAYER-004 g1: numbers from policies.json (blind vs deliberate on the live build).
// Usage: node work/feedback/PLAYER-004-g1/analyze-policies.mjs
import { readFileSync } from "node:fs";

const j = JSON.parse(readFileSync("work/feedback/PLAYER-004-g1/policies.json", "utf8"));
const out = { meta: { url: j.url, viewport: j.viewport, budgetSeconds: j.budgetSeconds, cadenceMs: j.cadenceMs }, policies: {} };

for (const r of j.results) {
  const t = r.timeline;
  const last = t[t.length - 1];
  const simHours = (last.tick ?? 0) * 0.1 / 3600;
  const wallHours = r.wallMs / 3600000;
  const applied = t.reduce((s, x) => s + (x.revDelta ?? 0), 0);
  const noops = t.slice(1).filter((x) => x.revDelta === 0).length;
  const toasts = {};
  for (const x of t) if (x.toast) toasts[x.toast] = (toasts[x.toast] ?? 0) + 1;
  // longest consecutive run of the same primary label with zero applied commands
  let run = 0,
    longest = 0,
    longestLabel = "";
  for (let i = 1; i < t.length; i++) {
    if (t[i].label === t[i - 1].label && t[i].revDelta === 0) {
      run++;
      if (run > longest) ((longest = run), (longestLabel = t[i].label ?? ""));
    } else run = 0;
  }
  out.policies[r.policy] = {
    taps: r.taps,
    wallSec: +(r.wallMs / 1000).toFixed(1),
    finalTick: last.tick,
    simMinutes: +((last.tick ?? 0) * 0.1 / 60).toFixed(1),
    machines: last.machines,
    batches: last.batches,
    credits: last.credits,
    storeUnits: last.storeUnits,
    drones: last.sim?.drones ?? null,
    batchesPerSimHour: simHours > 0 ? Math.round(last.batches / simHours) : null,
    creditsPerSimHour: simHours > 0 ? Math.round((last.credits ?? 0) / simHours) : null,
    batchesPerWallMin: +(last.batches / (r.wallMs / 60000)).toFixed(1),
    appliedCommands: applied,
    commandsPerTap: +(applied / r.taps).toFixed(2),
    noopTaps: noops,
    noopSharePct: +(100 * (noops / (t.length - 1))).toFixed(1),
    longestStalledLabel: { label: longestLabel, repeats: longest },
    distinctPrimaryLabels: [...new Set(t.map((x) => x.label).filter(Boolean))].length,
    toastReasons: toasts,
    finalRow: last.dock,
    finalObjective: last.obj,
    finalStatus: last.status,
    levels: last.sim?.levels ?? null,
  };
}

// first divergence
const [a, b] = j.results;
let firstDiff = null;
for (let i = 0; i < Math.min(a.timeline.length, b.timeline.length); i++) {
  if ((a.timeline[i].label ?? "") !== (b.timeline[i].label ?? "")) {
    firstDiff = {
      tap: a.timeline[i].n,
      tick: a.timeline[i].tick,
      blind: a.timeline[i].label,
      deliberate: b.timeline[i].label,
      why: b.timeline[i].why,
    };
    break;
  }
}
out.firstDivergence = firstDiff;
const A = out.policies.blind,
  B = out.policies.deliberate;
out.delta = {
  batchesPct: +(((B.batches - A.batches) / A.batches) * 100).toFixed(1),
  batchesPerSimHourPct: A.batchesPerSimHour
    ? +(((B.batchesPerSimHour - A.batchesPerSimHour) / A.batchesPerSimHour) * 100).toFixed(1)
    : null,
  machinesAbs: B.machines - A.machines,
};
console.log(JSON.stringify(out, null, 1));
