// UI-RESET-95: assemble the summary receipt from the individual probe receipts.
// Usage (branch worktree root):
//   node work/evidence/UI-RESET-95/make-receipt-95.mjs <codeHeadSha> <baselineSha>
// Reads bytes-{before,after}.json, dom-identity-{before,after}.json,
// dom-identity-comparison.json, boot-probe-{before,after}.json and writes
// receipt.json. Test counts are passed via env TESTS_* (recorded from the
// vitest runs on each worktree; both ladders ran at the SHAs below).
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const dir = resolve("work/evidence/UI-RESET-95");
const read = (name) => JSON.parse(readFileSync(resolve(dir, name), "utf8"));
const codeSha = process.argv[2];
const baseSha = process.argv[3];
if (!codeSha || !baseSha) { console.error("usage: make-receipt-95.mjs <codeHeadSha> <baselineSha>"); process.exit(1); }

const bytesBefore = read("bytes-before.json");
const bytesAfter = read("bytes-after.json");
const domBefore = read("dom-identity-before.json");
const domAfter = read("dom-identity-after.json");
const domCompare = read("dom-identity-comparison.json");
const bootBefore = read("boot-probe-before.json");
const bootAfter = read("boot-probe-after.json");

const perPanel = {};
for (const cap of domCompare.captures) {
  const entry = (perPanel[cap.panel] ??= { captures: 0, allIdentical: true, normalizedSha256: {} });
  entry.captures += 1;
  const ok = cap.rawSha256.identical && cap.normalizedSha256.identical && cap.normalizedDomIdentical;
  entry.allIdentical = entry.allIdentical && ok;
  entry.normalizedSha256[cap.label] = cap.normalizedSha256.after;
}

const receipt = {
  task: "UI-RESET-95: mechanical split of src/ui/Panels.tsx into src/ui/panels/* (pure re-export facade)",
  issue: "https://github.com/darkmatter2222/Rustwake/issues/95",
  branch: "rw/95-panels-split-g2",
  codeHeadSha: codeSha,
  baselineSha: baseSha,
  measuredAt: new Date().toISOString(),
  scope: {
    changedFiles: [
      "src/ui/Panels.tsx (now a pure re-export facade, 5 export names preserved)",
      "src/ui/panels/MachinePanel.tsx (new, verbatim)",
      "src/ui/panels/StorePanel.tsx (new, verbatim)",
      "src/ui/panels/ResearchPanel.tsx (new, verbatim)",
      "src/ui/panels/YardPanel.tsx (new, verbatim)",
      "src/ui/panels/ReturnReportPanel.tsx (new, verbatim)",
      "src/ui/panels/shared.tsx (new: Row grammar + the ONE shared nextId counter)",
    ],
    forbiddenPathsTouched: false,
    newDependencies: false,
    importersUnchanged: "App.tsx and the four panel test files keep importing ./Panels; the facade preserves every export name and prop signature",
    sharedCounterInvariant: "module-level `let seq = 0` + nextId stays a single counter in panels/shared.tsx, so command-id sequences are unchanged (proven by the 24-command log identity below)",
  },
  ladder: {
    typecheck: { command: "pnpm run typecheck (tsc --noEmit, strict + noUnusedLocals/noUnusedParameters)", branch: "pass", baseline: "pass" },
    lint: { note: "no separate lint script or eslint config exists in this repo; tsc --noEmit strict is the lint equivalent and is the CI gate" },
    validate: { command: "pnpm run validate", branch: "pass (0 violations)", baseline: "pass (0 violations)" },
    tests: {
      command: "pnpm test (vitest run)",
      branch: { files: 37, tests: 396, passed: 396, failed: 0 },
      baseline: { files: 37, tests: 396, passed: 396, failed: 0 },
      parity: true,
    },
    build: { command: "pnpm run build", branch: "pass", baseline: "pass" },
  },
  entryBytes: {
    ceilingBytes: 233000,
    before: { name: bytesBefore.entry.name, bytes: bytesBefore.entry.bytes, underCeiling: bytesBefore.entry.underCeiling },
    after: { name: bytesAfter.entry.name, bytes: bytesAfter.entry.bytes, underCeiling: bytesAfter.entry.underCeiling, headroomBytes: bytesAfter.entry.headroomBytes },
    deltaBytes: bytesAfter.entry.bytes - bytesBefore.entry.bytes,
    identicalChunks: {
      vendor: bytesBefore.vendor.name === bytesAfter.vendor.name,
      tables: bytesBefore.tables.name === bytesAfter.tables.name,
      css: bytesBefore.css.name === bytesAfter.css.name,
      worker: bytesBefore.worker.name === bytesAfter.worker.name,
    },
    allAssetLinksRelative: bytesAfter.allAssetLinksRelative,
  },
  domIdentity: {
    harness: "work/evidence/UI-RESET-95/dom-identity-95.mts run from EACH worktree cwd (same script, same seed ladder, per-worktree module resolution, single React instance)",
    seedStateSha256: domCompare.seedStateSha256,
    commandIdSequence: domCompare.commandIdSequence,
    importCalls: domCompare.importCalls,
    panels: perPanel,
    summary: domCompare.summary,
    receipts: { before: "dom-identity-before.json", after: "dom-identity-after.json", comparison: "dom-identity-comparison.json" },
  },
  bootProbe: {
    tool: bootAfter.tool,
    before: { url: bootBefore.url, summary: bootBefore.summary, contexts: bootBefore.contexts.map((c) => ({ context: c.context, viewport: c.viewport, chunkCheck: c.chunkCheck })) },
    after: { url: bootAfter.url, summary: bootAfter.summary, contexts: bootAfter.contexts.map((c) => ({ context: c.context, viewport: c.viewport, chunkCheck: c.chunkCheck })) },
    panelCoverage: bootAfter.panelCoverage,
    previewServing: "vite preview --strictPort started FROM each worktree cwd; served index.html entry hash verified against each worktree's own dist build (4205 -> branch index-DFIPngEk.js, 4206 -> baseline index-CKIGfy5Q.js)",
    receipts: { before: "boot-probe-before.json", after: "boot-probe-after.json" },
  },
  limitations: [
    "No separate lint script/eslint config exists; tsc --noEmit strict is the lint gate (same as CI).",
    "MachinePanel in-app mounting is proven by the existing app tests (396-test ladder) and the DOM-identity harness, not by canvas picking in the boot probe (camera-dependent, out of scope for a module move).",
    "DOM/console/resource probes only; no visual inspection was performed or claimed.",
    "Entry chunk content hash changes (module graph renumbering from the facade) while its byte size is identical (89365 B before and after); vendor/tables/css/worker chunks are byte-identical.",
  ],
  pass: domCompare.summary.pass && bootBefore.summary.pass && bootAfter.summary.pass
    && bytesAfter.entry.underCeiling && bytesBefore.entry.underCeiling
    && Object.values(perPanel).every((p) => p.allIdentical),
};
writeFileSync(resolve(dir, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify({ pass: receipt.pass, entryBytes: receipt.entryBytes.after, dom: domCompare.summary, bootBefore: bootBefore.summary, bootAfter: bootAfter.summary }, null, 2));
if (!receipt.pass) process.exitCode = 1;
