// UI-RESET-95: compares the two dom-identity-95.mts receipts (main baseline vs
// branch) and writes the identity verdict. Every panel capture must match on both
// the raw and the normalized DOM hash; the seeded-state digest, the recorded
// command-id sequence and the import calls must match too.
// Usage: node work/evidence/UI-RESET-95/compare-dom-identity-95.mjs <before.json> <after.json> <out.json>
import { readFileSync, writeFileSync } from "node:fs";

const [beforePath, afterPath, outPath] = process.argv.slice(2);
if (!beforePath || !afterPath || !outPath) {
  console.error("usage: compare-dom-identity-95.mjs <before.json> <after.json> <out.json>");
  process.exit(1);
}
const before = JSON.parse(readFileSync(beforePath, "utf8"));
const after = JSON.parse(readFileSync(afterPath, "utf8"));

const failures = [];
const rows = [];
for (const panel of Object.keys(before.panels)) {
  const b = before.panels[panel];
  const a = after.panels[panel] ?? [];
  if (b.length !== a.length) failures.push({ panel, check: "captureCount", before: b.length, after: a.length });
  for (let i = 0; i < b.length; i += 1) {
    const bc = b[i];
    const ac = a[i];
    if (!ac) continue;
    const labelMatch = bc.label === ac.label;
    const rawMatch = bc.rawSha256 === ac.rawSha256;
    const normMatch = bc.normalizedSha256 === ac.normalizedSha256;
    const domMatch = bc.normalizedDom === ac.normalizedDom;
    if (!labelMatch || !rawMatch || !normMatch || !domMatch) {
      failures.push({ panel, label: bc.label, labelMatch, rawMatch, normMatch, domMatch });
    }
    rows.push({
      panel, label: bc.label, bytes: bc.bytes,
      rawSha256: { before: bc.rawSha256, after: ac.rawSha256, identical: rawMatch },
      normalizedSha256: { before: bc.normalizedSha256, after: ac.normalizedSha256, identical: normMatch },
      normalizedDomIdentical: domMatch,
    });
  }
}
const stateMatch = before.seed.stateSha256 === after.seed.stateSha256;
const commandsMatch = before.commandLogSha256 === after.commandLogSha256;
const importsMatch = before.importCallsSha256 === after.importCallsSha256;
const scriptMatch = before.scriptSha256 === after.scriptSha256;
if (!stateMatch) failures.push({ check: "seedStateDigest" });
if (!commandsMatch) failures.push({ check: "commandIdSequence", before: before.commandLog, after: after.commandLog });
if (!importsMatch) failures.push({ check: "importCalls" });
if (!scriptMatch) failures.push({ check: "harnessScriptIdentity" });

const verdict = {
  task: "UI-RESET-95 DOM-identity verdict (main vs branch)",
  issue: "https://github.com/darkmatter2222/Rustwake/issues/95",
  measuredAt: new Date().toISOString(),
  baseline: { worktree: before.worktree, headSha: before.headSha, measuredAt: before.measuredAt },
  branch: { worktree: after.worktree, headSha: after.headSha, measuredAt: after.measuredAt },
  harnessScriptSha256: { before: before.scriptSha256, after: after.scriptSha256, identical: scriptMatch },
  seedStateSha256: { before: before.seed.stateSha256, after: after.seed.stateSha256, identical: stateMatch },
  commandIdSequence: {
    count: before.commandLog.length,
    sha256: { before: before.commandLogSha256, after: after.commandLogSha256, identical: commandsMatch },
    ids: before.commandLog.map((c) => c.id),
  },
  importCalls: { identical: importsMatch, calls: before.importCalls },
  captures: rows,
  summary: {
    panels: Object.keys(before.panels).length,
    captures: rows.length,
    allCapturesIdentical: rows.every((r) => r.rawSha256.identical && r.normalizedSha256.identical && r.normalizedDomIdentical),
    failures: failures.length,
    pass: failures.length === 0,
  },
  failures,
};
writeFileSync(outPath, JSON.stringify(verdict, null, 2) + "\n");
console.log(JSON.stringify(verdict.summary, null, 2));
if (failures.length > 0) { console.error(JSON.stringify(failures, null, 2)); process.exitCode = 1; }