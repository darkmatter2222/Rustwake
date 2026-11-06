// Scratch: ART-003 witness numbers (unit-grid pairwise matrix, solid-ink totals, gravel
// ticks) for the tree this script sits in. Run: npx tsx scripts/_art003_witness.mjs
import { GRAVEL, PARTS } from "../src/game/renderer/sprites";

function unitGrid(parts) {
  const grid = new Uint8Array(32 * 32);
  for (const t of parts) {
    const x0 = Math.max(0, Math.floor(t[0] + 16));
    const x1 = Math.min(32, Math.ceil(t[0] + t[2] + 16));
    const y0 = Math.max(0, Math.floor(t[1] + 16));
    const y1 = Math.min(32, Math.ceil(t[1] + t[3] + 16));
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) grid[y * 32 + x] = 1;
  }
  return grid;
}

// Gray-bucket grid (mirrors drawSpriteSheet's ramp): cell value = the 0..4 gray step of
// the last tuple covering it; background = 5. Richer than a boolean mask, like the
// pixel-level sheet census used for the A3-1 acceptance row.
const GRAY_RAMP = ["#101b28", "#22384a", "#6d90ab", "#8aa9c4", "#f4f7fb"];
function grayGrid(parts) {
  const grid = new Array(32 * 32).fill(5);
  const keyLum = {};
  GRAY_RAMP.forEach((hex, i) => (keyLum[i] = hex));
  for (const t of parts) {
    const step = Math.min(4, Math.floor(t[4] / 4));
    const x0 = Math.max(0, Math.floor(t[0] + 16));
    const x1 = Math.min(32, Math.ceil(t[0] + t[2] + 16));
    const y0 = Math.max(0, Math.floor(t[1] + 16));
    const y1 = Math.min(32, Math.ceil(t[1] + t[3] + 16));
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) grid[y * 32 + x] = step;
  }
  return grid;
}
function grayDifferingPct(a, b) {
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) diff += 1;
  return +((100 * diff) / a.length).toFixed(1);
}
function differingPct(a, b) {
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff += a[i] ^ b[i];
  return +((100 * diff) / a.length).toFixed(1);
}
// 8x8 mask convention from tests/renderer/scene-draw.test.ts (maskOf): one cell per 4 units.
function mask8(parts) {
  const mask = new Array(64).fill(0);
  for (const t of parts) {
    const x0 = Math.max(0, Math.floor((t[0] + 16) / 4));
    const x1 = Math.min(7, Math.ceil((t[0] + 16 + t[2]) / 4) - 1);
    const y0 = Math.max(0, Math.floor((t[1] + 16) / 4));
    const y1 = Math.min(7, Math.ceil((t[1] + 16 + t[3]) / 4) - 1);
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) mask[y * 8 + x] = 1;
  }
  return mask;
}
function hammingPct(a, b) {
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff += a[i] ^ b[i];
  return +((100 * diff) / a.length).toFixed(1);
}

const ids = ["dock", "sorter", "furnace", "wireMill", "signalLab", "drone"];
const grids = new Map(ids.map((id) => [id, unitGrid(PARTS[id])]));
const ggrids = new Map(ids.map((id) => [id, grayGrid(PARTS[id])]));
const m8 = new Map(ids.map((id) => [id, mask8(PARTS[id])]));
const matrix = {};
const grayMatrix = {};
const mask8Matrix = {};
for (let i = 0; i < ids.length; i += 1) {
  for (let j = i + 1; j < ids.length; j += 1) {
    matrix[`${ids[i]}/${ids[j]}`] = differingPct(grids.get(ids[i]), grids.get(ids[j]));
    grayMatrix[`${ids[i]}/${ids[j]}`] = grayDifferingPct(ggrids.get(ids[i]), ggrids.get(ids[j]));
    mask8Matrix[`${ids[i]}/${ids[j]}`] = hammingPct(m8.get(ids[i]), m8.get(ids[j]));
  }
}
const area = (id) => PARTS[id].reduce((s, t) => (t[5] === 1 || t[4] === 15 ? s : s + t[2] * t[3]), 0);
console.log(
  JSON.stringify({
    matrix,
    grayMatrix,
    mask8Matrix,
    perRowArea: Object.fromEntries(ids.map((id) => [id, area(id)])),
    total: ids.reduce((s, id) => s + area(id), 0),
    gravelTicks: GRAVEL.length,
  })
);
