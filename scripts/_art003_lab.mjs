// Scratch parameter search (ART-003 A3-1/A3-4, ART-004 A-3 per-kind table).
// Gates carried, none weakened:
//  (a) 8x8 mask: >= 12 of 64 cells apart for all 45 role pairs (B2/D-1/G-1), >= 18 inside
//      the lattice family (G-1);
//  (b) every part inside +/-16 units and >= 2 units tall (B4/B6), identity marks >= 3
//      units tall (D-4);
//  (c) A3-1: the 15-pair gray-ramp minimum >= 32 % and the mean above the base 48.69;
//  (d) A3-4: the six-row solid-ink total above the base 2752 units^2.
// Objective: maximise the weakest of the three least-distinguishable pairs. Their readings
// at d84f69e are 37.8 (furnace/wireMill), 38.3 (sorter/furnace), 40.1 (signalLab/drone);
// the ART-004 acceptance row asks for +5 on each. Coordinate descent, 3 rounds.
// Run: npx tsx scripts/_art003_lab.mjs
import { PARTS } from '../src/game/renderer/sprites';

const SHADOW = [-11, 12, 22, 3, 15, 1];
const LATTICE = ['generic', 'polymerRecycler', 'copperSeparator', 'platePress', 'circuitAssembler'];
const NINE = ['sorter', 'furnace', 'wireMill', 'signalLab', ...LATTICE];
const SIX = ['dock', 'sorter', 'furnace', 'wireMill', 'signalLab', 'drone'];
const TUNED = ['furnace', 'wireMill', 'signalLab', 'sorter'];
const WEAK = ['furnace/wireMill', 'sorter/furnace', 'signalLab/drone'];
const WEAK_BASE = { 'furnace/wireMill': 37.8, 'sorter/furnace': 38.3, 'signalLab/drone': 40.1 };

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
const legal = (row) =>
  row.every((t) => t[1] >= -16 && t[0] >= -16 && t[0] + t[2] <= 16 && t[1] + t[3] <= 16 && t[3] >= 2) &&
  row.filter((t) => t[4] !== 15 && t[3] < Math.max(...row.map((u) => u[3]))).every((t) => t[3] >= 3);

/* --- candidate rows: the shipped shapes with the marked parameters free ------------- */
const millRow = ({ bw, by, bh, ci, ri, rx, ry, rw, rh, sci }) => [
  SHADOW,
  [-bw / 2, by, bw, bh, ci], // body
  [-rx - 1, ry, rw, rh, ri], // left reel ring (its own step, so the ring separates)
  [-rx, ry + 1, rw - 2, rh - 2, 6], // left reel hole
  [rx + 1 - rw, ry, rw, rh, ri], // right reel ring
  [rx - rw + 2, ry + 1, rw - 2, rh - 2, 6], // right reel hole
  [-rx - 1, 6, rw, 3, sci], // reel stand, left
  [rx + 1 - rw, 6, rw, 3, sci], // reel stand, right
  [-8, -15, 4, 3, ci], // WM3 tension arm, step 0
  [-4, -15, 4, 3, ci], // WM3 tension arm, step 1
  [0, -12, 4, 3, ci], // WM3 tension arm, step 2 (diagonal)
  [4, -9, 4, 3, 9], // WM3 tension arm, step 3 into the body
];
const labRow = ({ tw, ty, th, ci, mastY, mastH, headW, headY, footW }) => [
  SHADOW,
  [-tw / 2, ty, tw, th, ci], // tower body
  [-2, mastY, 4, mastH, ci], // mast, tip above the head line
  [-(headW / 2) - 1, headY, headW, 3, 8], // scanner head, wider than the tower
  [-5, -4, 6, 3, 6], // visor slot on the body
  [-5, 2, 6, 3, 11], // indicator strip, select tone
  [-footW - 7, 6, footW, 3, ci], // left foot, outboard of the tower
  [7, 6, footW, 3, ci], // right foot, outboard of the tower
  [-8, 9, 16, 3, 16], // L6 plinth, one step lighter than the tower
];
const furnRow = ({ bw, by, bh, ci }) => [
  SHADOW,
  [-bw / 2, by, bw, bh, ci], // squat thermal chamber
  [2, -15, 5, 8, ci], // chimney, proud of the cap line
  [-3, -15, 10, 3, 9], // chimney cap, T-step in rust
  [-6, -6, 8, 3, 6], // intake slot
  [-6, -1, 8, 3, 6], // second chamber slot, one row down
  [11, -2, 5, 8, 6], // vent stub, right column
  [11, 8, 5, 3, 9], // vent foot, right column
  [-15, 3, 4, 3, 6], // feed notch, left column
];
const DISC_SETS = {
  six: [[-9, -6], [-3, -6], [3, -6], [-9, 0], [-3, 0], [3, 0]],
  five: [[-9, -7], [-3, -7], [3, -7], [-6, 0], [2, 0]],
  four: [[-9, -7], [-3, -7], [-9, 0], [-3, 0]],
  three: [[-9, -7], [-3, -7], [3, -7]],
  two: [[-9, -7], [1, 0]],
};
const sortRow = ({ set, ci }) => [
  SHADOW,
  [-12, -11, 24, 22, ci], // full-height frame body (D-4: 22 units, the tallest row)
  ...DISC_SETS[set].map(([x, y]) => [x, y, 5, 4, 6]), // roller discs
  [-9, 5, 8, 3, 6], // chute A
  [1, 5, 7, 3, 11], // chute B, stepped split wedge
];
const build = (name, p) =>
  name === 'furnace' ? furnRow(p) : name === 'wireMill' ? millRow(p) : name === 'signalLab' ? labRow(p) : sortRow(p);

const CART = (spec) =>
  Object.entries(spec).reduce((acc, [k, vals]) => acc.flatMap((x) => vals.map((v) => ({ ...x, [k]: v }))), [{}]);
const GRIDS = {
  furnace: CART({ bw: [18, 20, 22], by: [-9, -8, -7], bh: [12, 14, 16, 18], ci: [3, 4, 5, 16] }),
  wireMill: CART({ bw: [14, 16, 18, 20], by: [-6, -5, -4], bh: [12, 14, 16], ci: [3, 4, 5], ri: [16, 12, 4], rx: [13, 14, 15], ry: [-3, -2, -1], rw: [5, 6, 7], rh: [5, 6, 7], sci: [16] }),
  // A-3 pins: the mast starts at the top of the cell box and the head sits one step below
  // it, so the tip reads above the scanner head instead of being overpainted by it.
  signalLab: CART({ tw: [10, 12, 14], ty: [-8, -7, -6], th: [17, 18, 19, 20, 21], ci: [3, 4, 5, 16], mastY: [-16], mastH: [8], headW: [17, 19, 21], headY: [-13], footW: [5, 7] }),
  sorter: CART({ set: Object.keys(DISC_SETS), ci: [3, 4, 5, 16] }),
};

/** Score one full role table; null when a gate is missed. */
function score(rows) {
  const roles = [...NINE, 'dock', 'drone'];
  for (const r of NINE) if (!legal(rows[r])) return null;
  const masks = new Map(roles.map((r) => [r, mask8(rows[r])]));
  let minMask = 99;
  let minLat = 99;
  for (let i = 0; i < roles.length; i += 1)
    for (let j = i + 1; j < roles.length; j += 1) {
      const d = hamming(masks.get(roles[i]), masks.get(roles[j]));
      if (d < minMask) minMask = d;
      if ([...LATTICE, 'drone'].includes(roles[i]) && [...LATTICE, 'drone'].includes(roles[j]) && d < minLat) minLat = d;
    }
  if (minMask < 12 || minLat < 18) return null;
  const grids = new Map(SIX.map((r) => [r, grayGrid(rows[r])]));
  const pairs = [];
  for (let i = 0; i < SIX.length; i += 1)
    for (let j = i + 1; j < SIX.length; j += 1)
      pairs.push([`${SIX[i]}/${SIX[j]}`, grayDiff(grids.get(SIX[i]), grids.get(SIX[j]))]);
  const min15 = Math.min(...pairs.map((p) => p[1]));
  if (min15 < 32) return null;
  const mean15 = +(pairs.reduce((s, p) => s + p[1], 0) / pairs.length).toFixed(2);
  if (mean15 <= 48.69) return null;
  const ink = SIX.reduce((s, r) => s + area(rows[r]), 0);
  if (ink <= 2752) return null;
  const weak = WEAK.map((k) => pairs.find((p) => p[0] === k)[1]);
  return { weakMin: Math.min(...weak), min15, mean15, minMask, minLat, ink, pairs, rows };
}

const better = (a, b) =>
  a.weakMin > b.weakMin ||
  (a.weakMin === b.weakMin && (a.mean15 > b.mean15 || (a.mean15 === b.mean15 && a.min15 > b.min15)));

/** All combinations of the given rows' grids, as { rowName: params } objects. */
const combosOf = (names) =>
  names.reduce((acc, name) => acc.flatMap((acc2) => GRIDS[name].map((p) => ({ ...acc2, [name]: p }))), [{}]);

const PAIR_OWNERS = {
  'furnace/wireMill': ['furnace', 'wireMill'],
  'sorter/furnace': ['sorter', 'furnace'],
  'signalLab/drone': ['signalLab'],
};

const shipped = Object.fromEntries([...NINE, 'dock', 'drone'].map((r) => [r, PARTS[r]]));
let best = score(shipped);
console.log(`BASE weakMin=${best.weakMin} min15=${best.min15} mean15=${best.mean15} minMask=${best.minMask} minLat=${best.minLat} ink=${best.ink}`);
for (let it = 0; it < 8 && best.weakMin < 45.1; it += 1) {
  const weakest = WEAK.reduce((a, b) =>
    best.pairs.find((p) => p[0] === a)[1] <= best.pairs.find((p) => p[0] === b)[1] ? a : b
  );
  const owners = PAIR_OWNERS[weakest];
  let moved = false;
  for (const combo of combosOf(owners)) {
    const rows = { ...best.rows };
    for (const name of owners) rows[name] = build(name, combo[name]);
    const s = score(rows);
    if (s && better(s, best)) {
      best = s;
      moved = true;
    }
  }
  console.log(`it${it} ${weakest} x [${owners}] -> weakMin=${best.weakMin} min15=${best.min15} mean15=${best.mean15} minMask=${best.minMask} minLat=${best.minLat} ink=${best.ink} moved=${moved}`);
  if (!moved) break;
}
console.log('BEST weak', JSON.stringify(WEAK.map((k) => [k, best.pairs.find((p) => p[0] === k)[1]])));
console.log('BEST pairs', JSON.stringify(best.pairs));
console.log('BEST rows', JSON.stringify(Object.fromEntries(TUNED.map((r) => [r, best.rows[r]]))));
