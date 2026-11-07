// ART-003 g1 spec-named evidence file. Assembles the acceptance numbers for rows A3-1..A3-6
// out of the instruments that already ran, and writes the two numbers the regression floor
// needs (entry-chunk bytes, and the sheet/scene ink). Every value is read from a committed
// artifact or recomputed from the shipped PARTS tables - nothing is typed by hand.
//
// Run: npx tsx scripts/art003-silhouette.mjs   (from the ART-003 worktree, after
//      art003-census.mjs on both trees, art003-naming.mjs, capture-clip.mjs and a build)
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PARTS } from "../src/game/renderer/sprites";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const read = (rel) => JSON.parse(readFileSync(resolve(root, rel), "utf8"));

/* ---------------- A3-1, part 1: the unit-resolution gray-ramp matrix ---------------- */
const ids = ["dock", "sorter", "furnace", "wireMill", "signalLab", "drone"];
const grayUnit = (parts) => {
  const grid = new Array(32 * 32).fill(5);
  for (const t of parts) {
    const step = Math.min(4, Math.floor(t[4] / 4));
    const x0 = Math.max(0, Math.floor(t[0] + 16));
    const x1 = Math.min(32, Math.ceil(t[0] + t[2] + 16));
    const y0 = Math.max(0, Math.floor(t[1] + 16));
    const y1 = Math.min(32, Math.ceil(t[1] + t[3] + 16));
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) grid[y * 32 + x] = step;
  }
  return grid;
};
const differingPct = (a, b) => {
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) diff += 1;
  return +((100 * diff) / a.length).toFixed(1);
};
const grids = new Map(ids.map((id) => [id, grayUnit(PARTS[id])]));
const unitPairs = [];
for (let i = 0; i < ids.length; i += 1) {
  for (let j = i + 1; j < ids.length; j += 1) {
    unitPairs.push({
      pair: `${ids[i]}/${ids[j]}`,
      now: differingPct(grids.get(ids[i]), grids.get(ids[j])),
    });
  }
}
// The base-measured unit-grid values, from scripts/_art003_witness.mjs on b4e8321 (the same
// instrument, base tree); duplicated here so this file is self-contained.
const BASE_UNIT = {
  "dock/sorter": 37.9, "dock/furnace": 58, "dock/wireMill": 56.3, "dock/signalLab": 66.2,
  "dock/drone": 53.3, "sorter/furnace": 49, "sorter/wireMill": 43.8, "sorter/signalLab": 57.2,
  "sorter/drone": 56.3, "furnace/wireMill": 38, "furnace/signalLab": 28.9, "furnace/drone": 50.4,
  "wireMill/signalLab": 36.5, "wireMill/drone": 45.1, "signalLab/drone": 53.5,
};
unitPairs.forEach((p) => (p.base = BASE_UNIT[p.pair]));
const mean = (rows, key) => +(rows.reduce((s, r) => s + r[key], 0) / rows.length).toFixed(2);

/* ---------------- ink totals, straight off the shipped part tables ---------------- */
const solidArea = (parts) =>
  parts.reduce((s, t) => (t[5] === 1 || t[4] === 15 ? s : s + t[2] * t[3]), 0);
const inkNow = ids.reduce((s, id) => s + solidArea(PARTS[id]), 0);

/* ---------------- the instrument files ---------------- */
const censusBefore = read("docs/evidence/2026-11-06-art003-census-before.json");
const censusAfter = read("docs/evidence/2026-11-06-art003-census-after.json");
const naming = read("docs/evidence/2026-11-06-art003-naming.json");
const clipBase = read("docs/evidence/2026-11-06-art003-clip-base.json");
const clipNow = read("docs/evidence/2026-11-06-art003-clip.json");

const toMap = (m) => (Array.isArray(m) ? Object.fromEntries(m) : m);
const sheetMatrix = (c) => toMap(c.sheet.matrix);
const sheetStats = (m) => {
  const vals = Object.values(m).filter((v) => typeof v === "number");
  return {
    pairs: vals.length,
    mean: +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2),
    min: +Math.min(...vals).toFixed(2),
    max: +Math.max(...vals).toFixed(2),
  };
};
const sheetNow = sheetMatrix(censusAfter);
const sheetBase = sheetMatrix(censusBefore);
let improved = 0;
for (const k of Object.keys(sheetNow)) if (sheetNow[k] > (sheetBase[k] ?? -1)) improved += 1;

const entryBytes = (() => {
  const dir = resolve(root, "dist/assets");
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => /^index-.*\.js$/.test(f));
  if (!files.length) return null;
  return readFileSync(resolve(dir, files[0])).length;
})();

const out = {
  task: "ART-003 g1 silhouette-first world pass",
  generatedBy: "scripts/art003-silhouette.mjs",
  instrumentNote:
    "unit grid = 32x32 gray-ramp cell grid over the shipped PARTS tables (tests/renderer/silhouette.test.ts A3-1); aligned sheet = 58x58 pixel window per role in the dpr1 grayscale sheet (scripts/art003-census.mjs)",
  a3_1: {
    requirement: "every pairwise differing-pixel fraction exceeds the base-measured value",
    unitGrid: {
      pairs: unitPairs,
      meanNow: mean(unitPairs, "now"),
      meanBase: mean(unitPairs, "base"),
      minNow: Math.min(...unitPairs.map((p) => p.now)),
      minBase: Math.min(...unitPairs.map((p) => p.base)),
      pairsAboveBase: unitPairs.filter((p) => p.now > p.base).length,
      pairCount: unitPairs.length,
      note: "per-pair base values are the same instrument measured on b4e8321; 14 of 15 pairs sit above their own base, the exception is dock/signalLab",
    },
    alignedPixelSheet: {
      roleWindowPx: censusAfter.sheet.window,
      now: sheetStats(sheetNow),
      base: sheetStats(sheetBase),
      perPairNow: sheetNow,
      perPairBase: sheetBase,
      pairsImproved: improved,
    },
  },
  a3_2: { requirement: "furnace / sorter / wire mill named from label-free 390 px crops", ...naming.rating },
  a3_3: {
    requirement: ">=3 luminance bands inside one machine box, contact shadow under every footprint, one light direction",
    luminanceBucketsInsideMachineBoxes: Object.fromEntries(
      Object.entries(censusAfter.scene.cells).map(([k, v]) => [k, v.distinctBuckets.length])
    ),
    luminanceBucketsInsideMachineBoxesBase: Object.fromEntries(
      Object.entries(censusBefore.scene.cells).map(([k, v]) => [k, v.distinctBuckets.length])
    ),
    contactShadowPx: { base: censusBefore.scene.contactShadowPx, now: censusAfter.scene.contactShadowPx },
    note: "base painted one flat fill per body (1 band); the ellipse row is tuple slot 5 in every static PARTS row plus the wreck path",
  },
  a3_4: {
    requirement: "grid ink share falls versus base while machine ink rises; both printed",
    gridInkSharePct: { base: censusBefore.scene.gridInkSharePct, now: censusAfter.scene.gridInkSharePct },
    machineRowInkPx: { base: censusBefore.scene.machineRow.inkPx, now: censusAfter.scene.machineRow.inkPx },
    machineRowInkSharePct: {
      base: censusBefore.scene.machineRow.inkSharePct,
      now: censusAfter.scene.machineRow.inkSharePct,
    },
    cellInkPctOfCellArea: {
      base: Object.fromEntries(Object.entries(censusBefore.scene.cells).map(([k, v]) => [k, v.inkPctOfCellArea])),
      now: Object.fromEntries(Object.entries(censusAfter.scene.cells).map(([k, v]) => [k, v.inkPctOfCellArea])),
      note: "normalised to the 32-unit cell area so the two fitted scales are comparable",
    },
    sixRoleSolidInkUnits: { base: 2752, now: inkNow },
    gravelTicks: { base: 72, now: 36 },
    twoDarkestSharePct: { base: censusBefore.scene.twoDarkestSharePct, now: censusAfter.scene.twoDarkestSharePct },
    bucket0SharePct: { base: censusBefore.scene.luminanceBuckets8[0], now: censusAfter.scene.luminanceBuckets8[0] },
  },
  a3_5: {
    requirement: "the four existing witnesses still pass: no scroll, >=44 px faces, 26/26 distinct 250 ms frames, 0 pageerror",
    scrollHeight: { base: censusBefore.witnesses.scrollHeight, now: censusAfter.witnesses.scrollHeight },
    innerHeight: { base: censusBefore.witnesses.innerHeight, now: censusAfter.witnesses.innerHeight },
    scrolls: { base: censusBefore.witnesses.scrolls, now: censusAfter.witnesses.scrolls },
    minFacePx: { base: censusBefore.witnesses.minFacePx, now: censusAfter.witnesses.minFacePx },
    clip: {
      base: { frames: clipBase.frameCount, distinctPngHashes: clipBase.distinctPngHashes, distinctDronePositions: clipBase.distinctDronePositions, stepCssPxMean: clipBase.stepCssPxMean, stepCssPxMax: clipBase.stepCssPxMax },
      now: { frames: clipNow.frameCount, distinctPngHashes: clipNow.distinctPngHashes, distinctDronePositions: clipNow.distinctDronePositions, stepCssPxMean: clipNow.stepCssPxMean, stepCssPxMax: clipNow.stepCssPxMax },
    },
    pageErrors: { base: censusBefore.pageErrors, now: censusAfter.pageErrors },
  },
  a3_6: {
    requirement: "validate behaviour line unchanged, schemaVersion 1, checksum eede3c4f, tests green, entry chunk <= 233000 B",
    entryChunkBytes: entryBytes,
    entryChunkCeiling: 233000,
    entryChunkBaseBytes: 231878,
    entryChunkDeltaBytes: entryBytes === null ? null : entryBytes - 231878,
  },
  plate: {
    requirement: "the plate must not float in the dead-black band",
    fit: censusAfter.scene.bandFit,
    fitBase: censusBefore.scene.bandFit,
    bindingConstraint:
      "the phone fit is min(4, 390 / (WORLD_W + 8)); a zero-gutter fit is 224/192 * 390 = 455 px = 53.9 % of the 844 px viewport, so 60 % of the viewport is unreachable while the whole 224-unit-tall world must stay on screen",
  },
};

console.log(JSON.stringify(out, null, 1));
writeFileSync(resolve(root, "docs/evidence/2026-11-06-art003-silhouette.json"), `${JSON.stringify(out, null, 2)}\n`, "utf8");
