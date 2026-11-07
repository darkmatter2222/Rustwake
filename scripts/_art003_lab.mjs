// Scratch: parameter search for the signalLab part row (ART-003 A3-1). All non-lab rows come
// straight from the shipped PARTS table, so the numbers here equal
// tests/renderer/silhouette.test.ts. Constraints: every one of the 15 pairs >= its own
// base-measured value, the 32x32 gray-ramp minimum >= 32 %, the 8x8 mask Hamming >= 12 and
// the six-role solid-ink total >= the base 2752 units^2. Run: npx tsx scripts/_art003_lab.mjs
import { PARTS } from "../src/game/renderer/sprites";

const ids = ["dock", "sorter", "furnace", "wireMill", "signalLab", "drone"];

const BASE = {
  "dock/sorter": 37.9, "dock/furnace": 58, "dock/wireMill": 56.3, "dock/signalLab": 66.2,
  "dock/drone": 53.3, "sorter/furnace": 49, "sorter/wireMill": 43.8, "sorter/signalLab": 57.2,
  "sorter/drone": 56.3, "furnace/wireMill": 38, "furnace/signalLab": 28.9, "furnace/drone": 50.4,
  "wireMill/signalLab": 36.5, "wireMill/drone": 45.1, "signalLab/drone": 53.5,
};

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
const hamming = (a, b) => a.reduce((s, v, i) => s + (v !== b[i] ? 1 : 0), 0);
const grayPct = (a, b) => {
  let d = 0;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) d += 1;
  return +((100 * d) / a.length).toFixed(1);
};
const area = (row) => row.reduce((s, t) => (t[5] === 1 || t[4] === 15 ? s : s + t[2] * t[3]), 0);

/** Candidate signalLab rows: tower w x h at y, mast, scanner of width sw, two slots, feet. */
const labRow = (w, h, y, sw, footY, mastH) => [
  [-11, 12, 22, 3, 15, 1],
  [-w / 2, y, w, h, 3],
  [-2, y - mastH, 4, mastH, 3],
  [-(sw / 2) - 1, y - mastH - 1, sw, 3, 8],
  [-5, -4, 6, 3, 6],
  [-5, 2, 6, 3, 11],
  [-14, footY, 5, 3, 3],
  [9, footY, 5, 3, 3],
];

function evaluate(label, lab) {
  const rows = { ...Object.fromEntries(ids.map((r) => [r, PARTS[r]])), signalLab: lab };
  const masks = new Map(ids.map((r) => [r, mask8(rows[r])]));
  const grids = new Map(ids.map((r) => [r, grayUnit(rows[r])]));
  let minH = 99;
  let minG = 99;
  let worst = "";
  let below = 0;
  const notes = [];
  let sum = 0;
  let n = 0;
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const key = `${ids[i]}/${ids[j]}`;
      const h = hamming(masks.get(ids[i]), masks.get(ids[j]));
      const g = grayPct(grids.get(ids[i]), grids.get(ids[j]));
      if (h < minH) minH = h;
      if (g < minG) { minG = g; worst = key; }
      sum += g;
      n += 1;
      if (g < BASE[key]) { below += 1; notes.push(`${key} ${g}<${BASE[key]}`); }
    }
  }
  const ink = ids.reduce((s, r) => s + area(rows[r]), 0);
  const flags = [minH < 12 ? "HAM!" : "", minG < 32 ? "GRAY!" : "", ink < 2752 ? "INK!" : ""]
    .filter(Boolean).join(" ");
  console.log(
    `${label}: minHamming=${minH} minGray=${minG}(${worst}) mean15=${(sum / n).toFixed(2)} ink6=${ink} below=${below} ${flags}${notes.length ? ` ${notes.join(",")}` : ""}`
  );
}

console.log("PARTS.furnace=" + JSON.stringify(PARTS.furnace));
evaluate("shipped", PARTS.signalLab);
// Hand-built variants around the shipped row, aimed at the one pair that sits below its base
// (signalLab/drone): keep the tower's own marks out of the drone's rows (y -3..7) and put the
// identity marks above and below them.
const variants = {
  "shipped": PARTS.signalLab,
  "marksAbove": [
    [-11, 12, 22, 3, 15, 1],
    [-7, -8, 14, 21, 16],
    [-2, -16, 4, 8, 16],
    [-11.5, -13, 21, 3, 8],
    [-5, -6, 6, 3, 6],
    [-5, -1, 6, 3, 11],
    [-14, 6, 7, 3, 16],
    [7, 6, 7, 3, 16],
    [-8, 9, 16, 3, 16],
  ],
  "narrowTowerNoPlinth": [
    [-11, 12, 22, 3, 15, 1],
    [-6, -9, 12, 22, 16],
    [-2, -16, 4, 7, 16],
    [-11.5, -13, 21, 3, 8],
    [-4, -5, 5, 3, 6],
    [-4, 0, 5, 3, 11],
    [-14, 5, 7, 3, 16],
    [7, 5, 7, 3, 16],
  ],
  "wideScannerTallMast": [
    [-11, 12, 22, 3, 15, 1],
    [-7, -8, 14, 21, 16],
    [-2, -17, 4, 9, 16],
    [-12.5, -14, 23, 3, 8],
    [-5, -4, 6, 3, 6],
    [-5, 2, 6, 3, 11],
    [-14, 6, 7, 3, 16],
    [7, 6, 7, 3, 16],
    [-8, 9, 16, 3, 16],
  ],
  "twoVisorsTall": [
    [-11, 12, 22, 3, 15, 1],
    [-7, -9, 14, 22, 16],
    [-2, -17, 4, 8, 16],
    [-11.5, -13, 21, 3, 8],
    [-5, -6, 6, 3, 6],
    [-5, -1, 6, 3, 6],
    [-5, 4, 6, 3, 11],
    [-14, 7, 7, 3, 16],
    [7, 7, 7, 3, 16],
  ],
  "wingsWidePlinth": [
    [-11, 12, 22, 3, 15, 1],
    [-7, -8, 14, 21, 16],
    [-2, -16, 4, 8, 16],
    [-11.5, -13, 21, 3, 8],
    [-5, -4, 6, 3, 6],
    [-5, 2, 6, 3, 11],
    [-14, -6, 6, 3, 6], // left wing, outside the tower's column
    [8, -6, 6, 3, 6], // right wing
    [-14, 6, 7, 3, 16],
    [7, 6, 7, 3, 16],
    [-10, 9, 20, 3, 16],
  ],
  "wingsTallMast": [
    [-11, 12, 22, 3, 15, 1],
    [-7, -8, 14, 21, 16],
    [-2, -17, 4, 9, 16],
    [-12.5, -14, 23, 3, 8],
    [-5, -4, 6, 3, 6],
    [-5, 2, 6, 3, 11],
    [-14, -6, 6, 3, 6],
    [8, -6, 6, 3, 6],
    [-14, 6, 7, 3, 16],
    [7, 6, 7, 3, 16],
  ],
  "wingsTwoRows": [
    [-11, 12, 22, 3, 15, 1],
    [-7, -8, 14, 21, 16],
    [-2, -17, 4, 9, 16],
    [-12.5, -14, 23, 3, 8],
    [-5, -4, 6, 3, 6],
    [-5, 2, 6, 3, 11],
    [-14, -6, 6, 3, 6],
    [8, -6, 6, 3, 6],
    [-14, 3, 6, 3, 6],
    [8, 3, 6, 3, 6],
    [-14, 6, 7, 3, 16],
    [7, 6, 7, 3, 16],
    [-10, 9, 20, 3, 16],
  ],
};
for (const [name, row] of Object.entries(variants)) evaluate(name, row);

for (const [w, h, y] of [[12, 20, -7], [12, 22, -8], [10, 22, -8], [14, 20, -7], [12, 24, -9], [10, 24, -9]]) {
  for (const sw of [19, 21, 23]) {
    for (const footY of [6, 8]) {
      for (const mastH of [7, 8]) {
        evaluate(`w${w} h${h} y${y} scan${sw} foot${footY} mast${mastH}`, labRow(w, h, y, sw, footY, mastH));
      }
    }
  }
}
