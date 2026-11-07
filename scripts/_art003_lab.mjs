// Scratch: joint parameter search over the furnace and signalLab part rows. Constraints:
// (a) the pre-existing 8x8 mask assertion (>= 12 of 64 cells apart for all 45 role pairs),
// (b) the 32x32 gray-ramp A3-1 minimum >= 32 % and the 15-pair mean above the base 48.69,
// (c) the six-row solid-ink total above the base 2752 units^2. Run: npx tsx scripts/_art003_lab.mjs
import { PARTS } from "../src/game/renderer/sprites";

const mask8 = (parts) => {
  const m = new Array(64).fill(0);
  for (const t of parts) {
    const x0 = Math.max(0, Math.floor((t[0] + 16) / 4));
    const x1 = Math.min(7, Math.ceil((t[0] + 16 + t[2]) / 4) - 1);
    const y0 = Math.max(0, Math.floor((t[1] + 16) / 4));
    const y1 = Math.min(7, Math.ceil((t[1] + 16 + t[3]) / 4) - 1);
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) m[y * 8 + x] = 1;
  }
  return m;
};
const grayGrid = (parts) => {
  const g = new Array(32 * 32).fill(5);
  for (const t of parts) {
    const step = Math.min(4, Math.floor(t[4] / 4));
    const x0 = Math.max(0, Math.floor(t[0] + 16));
    const x1 = Math.min(32, Math.ceil(t[0] + t[2] + 16));
    const y0 = Math.max(0, Math.floor(t[1] + 16));
    const y1 = Math.min(32, Math.ceil(t[1] + t[3] + 16));
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) g[y * 32 + x] = step;
  }
  return g;
};
const hamming = (a, b) => a.reduce((s, v, i) => s + (v !== b[i] ? 1 : 0), 0);
const grayDiff = (a, b) => {
  let d = 0;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) d += 1;
  return +((100 * d) / a.length).toFixed(1);
};
const area = (row) => row.reduce((s, t) => (t[5] === 1 || t[4] === 15 ? s : s + t[2] * t[3]), 0);

const roles = ["dock", "sorter", "furnace", "wireMill", "signalLab", "generic", "polymerRecycler", "copperSeparator", "platePress", "circuitAssembler", "drone"];
const six = ["dock", "sorter", "furnace", "wireMill", "signalLab", "drone"];
const SHADOW = [-11, 12, 22, 3, 15, 1];

const labRow = (w, h, scanW) => [
  SHADOW,
  [-w / 2, -7, w, h, 3],
  [-2, -15, 4, 8 - (h > 19 ? 1 : 0), 3],
  [-(scanW / 2) - 1, -16, scanW, 3, 8],
  [-5, -4, 6, 3, 6],
  [-5, 2, 6, 3, 11],
  [-14, 6, 5, 3, 3],
  [9, 6, 5, 3, 3],
];
const furnaceRow = (w, h, y) => [
  SHADOW,
  [-w / 2, y, w, h, 3],
  [2, -15, 5, 8, 3],
  [-3, -15, 10, 3, 9],
  [-6, -6, 8, 3, 6],
  [-6, -1, 8, 3, 6],
  [11, -2, 5, 8, 6],
  [11, 8, 5, 3, 9],
  [-15, 3, 4, 3, 6],
];

function evaluate(label, furnace, lab) {
  const rows = { ...Object.fromEntries(roles.map((r) => [r, PARTS[r]])), furnace, signalLab: lab };
  const masks = new Map(roles.map((r) => [r, mask8(rows[r])]));
  let minH = 99;
  let worst = "";
  for (let i = 0; i < roles.length; i += 1) {
    for (let j = i + 1; j < roles.length; j += 1) {
      const h = hamming(masks.get(roles[i]), masks.get(roles[j]));
      if (h < minH) { minH = h; worst = `${roles[i]}/${roles[j]}`; }
    }
  }
  const grids = new Map(six.map((r) => [r, grayGrid(rows[r])]));
  let minG = 99;
  let sum = 0;
  let n = 0;
  let worstG = "";
  for (let i = 0; i < six.length; i += 1) {
    for (let j = i + 1; j < six.length; j += 1) {
      const d = grayDiff(grids.get(six[i]), grids.get(six[j]));
      sum += d;
      n += 1;
      if (d < minG) { minG = d; worstG = `${six[i]}/${six[j]}`; }
    }
  }
  const ink = six.reduce((s, r) => s + area(rows[r]), 0);
  console.log(`${label}: minHamming=${minH}${minH < 12 ? "!" : ""}(${worst}) minGray=${minG}(${worstG}) mean15=${(sum / n).toFixed(2)} ink6=${ink}${ink < 2752 ? " <2752!" : ""}`);
}

for (const [fw, fh, fy] of [[22, 14, -6], [24, 14, -6], [24, 17, -6], [22, 17, -6], [24, 18, -6], [26, 15, -6], [26, 16, -6]]) {
  for (const [lw, lh, scan] of [[12, 20, 21], [14, 20, 21], [12, 19, 21], [14, 19, 25]]) {
    evaluate(`fur${fw}x${fh}@${fy} lab${lw}x${lh}s${scan}`, furnaceRow(fw, fh, fy), labRow(lw, lh, scan));
  }
}
