// Scratch: parameter search for the signalLab part row so that (a) the coarse 8x8 mask keeps
// >= 12 of 64 cells apart from every other glyph (the pre-existing B2/D-1/G-1 assertion, which
// must not be weakened), (b) the 32x32 gray-ramp pairwise minimum stays >= 32 % and the mean of
// the 15 A3-1 pairs beats the base mean 48.69. Run: npx tsx scripts/_art003_lab.mjs
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

const SHADOW = [-11, 12, 22, 3, 15, 1];
const others = ["dock", "sorter", "furnace", "wireMill", "generic", "polymerRecycler", "copperSeparator", "platePress", "circuitAssembler", "drone"];
const othersGray = new Map(others.map((id) => [id, grayGrid(PARTS[id])]));
const othersMask = new Map(others.map((id) => [id, mask8(PARTS[id])]));

const fiveIds = ["dock", "sorter", "furnace", "wireMill", "drone"];

function evaluate(name, row) {
  const m = mask8(row);
  const g = grayGrid(row);
  let minH = 99;
  let minHWith = "";
  for (const id of others) {
    const h = hamming(m, othersMask.get(id));
    if (h < minH) { minH = h; minHWith = id; }
  }
  const five = ["dock", "sorter", "furnace", "wireMill", "drone"].map((id) => grayDiff(g, othersGray.get(id)));
  const minGray = Math.min(...five);
  // the ten pairs that do not involve signalLab are fixed; their sum comes from the live table
  let fixedSum = 0;
  for (let i = 0; i < 5; i += 1) {
    for (let j = i + 1; j < 5; j += 1) {
      const a = fiveIds[i];
      const b = fiveIds[j];
      fixedSum += grayDiff(othersGray.get(a), othersGray.get(b));
    }
  }
  const mean = +(((fixedSum + five.reduce((s, v) => s + v, 0)) / 15)).toFixed(2);
  console.log(`${name}: minHamming=${minH}${minH < 12 ? " (" + minHWith + ")" : ""} minGray=${minGray} mean15=${mean} vs=${JSON.stringify(Object.fromEntries(["dock", "sorter", "furnace", "wireMill", "drone"].map((id, i) => [id, five[i]])))}`);
}

for (const bodyW of [12, 14, 16]) {
  for (const bodyY of [-7, -8, -9]) {
    for (const bodyH of [18, 19, 20]) {
      for (const scanW of [13, 17, 21]) {
        for (const tick of [true, false]) {
          const row = [
            SHADOW,
            [-bodyW / 2, bodyY, bodyW, bodyH, 3],
            [-2, -15, 4, 8, 3],
            [-(scanW / 2) - 1, -16, scanW, 3, 8],
            [-5, -4, 6, 3, 6],
            [-5, 2, 6, 3, 11],
            [-14, 6, 5, 3, 3],
            [9, 6, 5, 3, 3],
            ...(tick ? [[-14, -1, 5, 3, 3], [9, -1, 5, 3, 3]] : []),
          ];
          evaluate(`w${bodyW} y${bodyY} h${bodyH} scan${scanW} tick${tick ? 1 : 0}`, row);
        }
      }
    }
  }
}
