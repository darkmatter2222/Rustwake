/**
 * RW3D T02 (#129): write the checked-in legacy fixtures and their manifest.
 *
 * Run from the repo root:  pnpm exec tsx tests/legacy/generate-fixtures.mjs
 *
 * Deterministic: the simulation has no RNG and no wall clock, and every script
 * uses fixed command ids and tick counts, so re-running this writes byte-identical
 * files. The characterization tests regenerate the same fixtures in-process and
 * compare bytes, so a drift in engine/content/save code fails the suite instead
 * of silently re-pinning the artifacts.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAllFixtures } from "./fixtures-lib.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "fixtures");
mkdirSync(outDir, { recursive: true });

const fixtures = buildAllFixtures();
const manifest = {
  issue: 129,
  generatedBy: "tests/legacy/generate-fixtures.mjs",
  baseSha: "8b78d09f6a1227916fede780eb1682969c49ff1e",
  schemaVersion: 1,
  contentVersion: 1,
  saveKey: "rustwake.save.v1",
  fixtures: fixtures.map((f) => ({
    name: f.name,
    file: f.file,
    scenario: f.scenario,
    seed: f.seed,
    shape: f.shape,
    kind: f.kind,
    sha256: createHash("sha256").update(f.text, "utf8").digest("hex"),
    ...(f.expectedReason ? { expectedReason: f.expectedReason } : {}),
    ...(f.expectedDetail ? { expectedDetail: f.expectedDetail } : {}),
    ...(f.expectedSettings ? { expectedSettings: f.expectedSettings } : {}),
    ...(f.repair ? { repair: f.repair } : {}),
    meta: f.meta,
  })),
};

for (const f of fixtures) {
  writeFileSync(join(outDir, f.file), f.text, "utf8");
}
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

// A single valid-JSON aggregate of every fixture's exact bytes (including the
// intentionally truncated envelope, which cannot be imported as a JSON module on
// its own). The characterization tests import this to assert the checked-in
// artifacts byte-for-byte and to load the real saved text.
const artifacts = Object.fromEntries(fixtures.map((f) => [f.name, f.text]));
writeFileSync(join(outDir, "artifacts.json"), JSON.stringify(artifacts, null, 2) + "\n", "utf8");

console.log(`wrote ${fixtures.length} fixtures + manifest.json + artifacts.json to ${outDir}`);
for (const f of fixtures) {
  const m = f.meta;
  console.log(
    `${f.name.padEnd(24)} ${f.kind.padEnd(8)} tick=${String(m.tick).padStart(6)} rev=${String(m.revision).padStart(3)} cr=${String(m.credits).padStart(4)} units=${String(m.unitTotal).padStart(5)} store=${String(m.storeUnits).padStart(4)} machines=${m.machines} routes=${m.routes} checksum=${m.checksum}`,
  );
}