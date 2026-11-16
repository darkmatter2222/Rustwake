// Deterministic manifest post-patch for the T09/T15 production set.
//
// scripts/build-vision-assets.py regenerates every glTF from kit.json and
// rewrites asset-manifest.json with status "blockout" for all assets and a
// fixed 27-entry additionalRequired list (including wreckSections). The
// production acceptance state is a policy layer on top of that regeneration:
// this script restores it so the pipeline is reproducible end to end:
//
//   python scripts/build-vision-assets.py
//   node docs/vision/assets/postpatch-manifest.mjs
//
// T09 (#136): warehouse, depot, sorter, furnace, generator, wreckSections.
// T15 (#142): truck, forklift, crane, drone, worker rigs.
// All production entries carry visualReview "pending" until a capable visual
// inspection passes (G1 gate, #151). The glTF root extras.status remains the
// generator's hardcoded reference string; this manifest is authoritative.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const path = join(here, "asset-manifest.json");
const manifest = JSON.parse(readFileSync(path, "utf8"));

const PRODUCTION = new Set([
  // T09 buildings + wreck sections
  "warehouse", "depot", "sorter", "furnace", "generator", "wreckSections",
  // T15 unit rigs
  "truck", "forklift", "crane", "drone", "worker",
]);

const STATUS_NOTE =
  "T15 (#142): truck, forklift, crane, drone and worker rigs authored to production geometry from the approved kit (T09 buildings + wreckSections retained); capable visual inspection pending (G1 #151). Remaining assets are original procedural references, not shipped production art.";

let patched = 0;
for (const asset of manifest.assets) {
  if (PRODUCTION.has(asset.id)) {
    asset.status = "production";
    asset.visualReview = "pending";
    patched += 1;
  } else {
    asset.status = "blockout";
    delete asset.visualReview;
  }
}
if (patched !== PRODUCTION.size) {
  console.error(`postpatch: expected ${PRODUCTION.size} production assets, patched ${patched}`);
  process.exit(1);
}
manifest.additionalRequired = manifest.additionalRequired.filter((id) => id !== "wreckSections");
if (manifest.additionalRequired.length !== 26) {
  console.error(`postpatch: expected 26 additionalRequired, got ${manifest.additionalRequired.length}`);
  process.exit(1);
}
manifest.status = STATUS_NOTE;
writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
console.log(`postpatch: ${patched} production entries (visualReview pending), 26 additionalRequired`);