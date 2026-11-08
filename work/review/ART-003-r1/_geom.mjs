// Pure-geometry replication of scripts/art003-census.mjs SHEET() pairwise matrix.
// Uses no canvas pixel data at all - only the mirrored layout constants. If this
// reproduces the committed matrix exactly, that matrix is a function of box geometry
// only and cannot react to a PARTS change.
const ids6 = ["dock", "sorter", "furnace", "wireMill", "signalLab", "drone"];
const allIds = ["dock", "sorter", "furnace", "wireMill", "signalLab", "generic",
  "polymerRecycler", "copperSeparator", "platePress", "circuitAssembler", "drone"];
const idsCount = allIds.length; // census reports sheet.roles = 11
const W = 900, H = 420, LEFT = 15, TOP = 16, BOTTOM = 15, MARGIN = 2;
const bands = [
  { scale: 1.8056, from: 0, to: idsCount },
  { scale: 4, from: 0, to: Math.ceil(idsCount / 2) },
  { scale: 4, from: Math.ceil(idsCount / 2), to: idsCount },
];
const heights = bands.map((b) => (TOP + BOTTOM) * b.scale);
const gap = (H - 2 * MARGIN - heights.reduce((a, b) => a + b, 0)) / (bands.length - 1);
const tops = [];
let top = MARGIN;
for (const h of heights) { tops.push(top); top += h + gap; }
const boxes = {};
for (let r = 0; r < bands.length; r += 1) {
  const s = bands[r].scale;
  const count = bands[r].to - bands[r].from;
  const pitch = count > 1 ? (W - 2 * MARGIN - 2 * LEFT * s) / (count - 1) : 0;
  const cy = tops[r] + TOP * s;
  for (let i = bands[r].from; i < bands[r].to; i += 1) {
    const cx = MARGIN + LEFT * s + (i - bands[r].from) * pitch;
    boxes[allIds[i]] = [Math.round(cx - 16 * s), Math.round(cy - 16 * s), Math.round(32 * s), Math.round(32 * s)];
  }
}
const matrix = [];
for (let i = 0; i < ids6.length; i += 1) {
  for (let j = i + 1; j < ids6.length; j += 1) {
    const [ax, ay, aw, ah] = boxes[ids6[i]];
    const [bx, by, bw, bh] = boxes[ids6[j]];
    const x0 = Math.min(ax, bx), y0 = Math.min(ay, by);
    const x1 = Math.max(ax + aw, bx + bw), y1 = Math.max(ay + ah, by + bh);
    let diff = 0, n = 0;
    for (let py = Math.max(0, y0); py < Math.min(H, y1); py += 1) {
      for (let px = Math.max(0, x0); px < Math.min(W, x1); px += 1) {
        const inA = px >= ax && px < ax + aw && py >= ay && py < ay + ah;
        const inB = px >= bx && px < bx + bw && py >= by && py < by + bh;
        // Inside exactly one box the two sides are always unequal ("r,g,b" vs "bg");
        // inside both they are the same string; inside neither both are "bg".
        if (inA !== inB) diff += 1;
        n += 1;
      }
    }
    matrix.push(`${ids6[i]}/${ids6[j]}:${+((100 * diff) / n).toFixed(1)}`);
  }
}
console.log(matrix.join(" "));
