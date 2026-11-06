/**
 * Authored part tables for the style slice (Q-002, spec rev-q2spec-g3 sections 2-3).
 * One source for the palette and geometry; `scene.ts` paints these rows and the
 * tests assert them, so a review can read the art as text. Units are world units
 * (CELL = 32); part coords are top-left offsets from the cell centre, y down.
 */

import type { MachineStatus } from "../simulation/types";

/** The one palette (spec 2.3); mirrored 1:1 in `styles.css :root` and `Hud.DOT_COLORS`. */
export const PALETTE = {
  night: "#0b1220",
  nightDeep: "#080d18",
  floor: "#22384a",
  bodyLight: "#8aa9c4",
  bodyMid: "#7f9fbb",
  wreck: "#6d90ab",
  well: "#0e1726",
  amber: "#ffb765",
  cyan: "#5fd8e8",
  rust: "#c9713a",
  violet: "#8a7ad8",
  select: "#f4f7fb",
  path: "#2c4257",
  drain: "#16283a",
  puddle: "#35566b",
  shadow: "#101b28",
  steelLight: "#6f93ad",
} as const;

export type PaletteKey = keyof typeof PALETTE;

/** The grid is the only painter with this stroke style (spec 3A). */
export const GRID_STYLE = "rgba(111,147,173,0.22)";
export const SELECT_STYLE = PALETTE.select;

/** Every painted feature is at least this tall in world units (spec 3B-4). */
export const FEATURE_MIN_UNITS = 2;

/** Lateral spacing between drone units, kept under reduced motion (spec 3B-7). */
export const LEAN_UNITS = 4;

/** The whole-frame amber budget: exactly these three (w, h) tuples (spec 3B-3). */
export const AMBER_SHAPES: readonly (readonly [number, number])[] = [
  [2, 2], // pip: wreck band, store gauge, level pips
  [3, 3], // token: cargo, tray
  [4, 4], // glow: furnace core
];

/** Five distinct hexes over the six statuses; `powerLimited` keeps its own hue (D9). */
export const STATUS_ACCENTS: Record<MachineStatus, string> = {
  idle: PALETTE.steelLight,
  running: PALETTE.cyan,
  starved: PALETTE.violet,
  outputFull: PALETTE.rust,
  powerLimited: "#7fd6c2", // reserved fifth hue (R-08 / Q-007)
  paused: PALETTE.steelLight,
};


/** Part tuple: [x, y, w, h, colourIndex (into COLOR_KEYS), ellipse?]. Units from the cell centre. */
export type PartTuple = readonly [number, number, number, number, number, (0 | 1)?];

/** Colour index -> palette key; same order as the PALETTE declaration. */
export const COLOR_KEYS = Object.keys(PALETTE) as PaletteKey[];

/** Row of parts per sprite id; painted in order, all coords inside +/- 16 units (B6). */
export const PARTS: Readonly<Record<string, readonly PartTuple[]>> = {
  dock: [
    [-13, 9, 26, 3, 15, 1], // D5 pad contact shadow (ellipse, alpha 0.35)
    [-13, -10, 26, 20, 4], // D1 pad
    [-13, -10, 3, 2, 8], // D2 corner ticks (4)
    [10, -10, 3, 2, 8],
    [-13, 8, 3, 2, 8],
    [10, 8, 3, 2, 8],
    [9, -2, 2, 8, 3], // D3 arm post
    [8, 6, 4, 2, 3], // D3 foot
  ],
  sorter: [
    [-11, 12, 22, 3, 15, 1], // S5 contact shadow ellipse (ART-003)
    [-12, -11, 24, 22, 3], // S1 full-height frame body (22-unit, D-4 pinned)
    [-9, -6, 5, 4, 6], // S2 roller disc 1 (dark discs read against the lit body)
    [-3, -6, 5, 4, 6], // S2 roller disc 2
    [3, -6, 5, 4, 6], // S2 roller disc 3
    [-9, 0, 5, 4, 6], // S2 roller disc 4
    [-3, 0, 5, 4, 6], // S2 roller disc 5
    [3, 0, 5, 4, 6], // S2 roller disc 6
    [-9, 5, 8, 3, 6], // S3 chute A
    [1, 5, 7, 3, 11], // S3 chute B, stepped split wedge (select tone)
  ],
  furnace: [
    [-11, 12, 22, 3, 15, 1], // F8 contact shadow ellipse (ART-003)
    [-10, -8, 20, 16, 3], // F1 squat thermal chamber (16-unit body)
    [2, -15, 5, 8, 3], // F2 chimney, proud of the cap line
    [-3, -15, 10, 3, 9], // F2b chimney cap, T-step in rust (identity mark, own gray step)
    [-5, -6, 8, 3, 6], // F3 intake slot (D-4: 3 units tall)
    [-5, -1, 8, 3, 6], // F3b second chamber slot, one row down
    [11, -2, 5, 8, 6], // vent stub, right column
    [11, 8, 5, 3, 9], // vent foot, right column (rust)
    [-15, 3, 4, 3, 6], // feed notch, left column
  ],
  wireMill: [
    [-11, 12, 22, 3, 15, 1], // contact shadow ellipse (ART-003)
    [-12, -4, 24, 16, 3], // body, one row lower than the sorter
    [-15, -1, 6, 6, 3], // WM2 left reel ring
    [-14, 0, 4, 4, 6], // WM2 left reel hole (ring, not block)
    [9, -1, 6, 6, 3], // WM2 right reel ring
    [10, 0, 4, 4, 6], // WM2 right reel hole
    [-15, 6, 6, 3, 16], // reel stand, left (steelLight step)
    [9, 6, 6, 3, 16], // reel stand, right (steelLight step)
    [-8, -15, 4, 3, 3], // WM3 tension arm, step 0 (D-4: 3 units tall)
    [-4, -15, 4, 3, 3], // WM3 tension arm, step 1
    [0, -12, 4, 3, 3], // WM3 tension arm, step 2 (diagonal)
    [4, -9, 4, 3, 9], // WM3 tension arm, step 3 into the body (rust tip)
  ],
  signalLab: [
    [-11, 12, 22, 3, 15, 1], // contact shadow ellipse (ART-003)
    [-6, -7, 12, 20, 3], // L1 narrow 12-unit tower body (A3-1: a third body width)
    [-2, -15, 4, 8, 3], // L2 mast
    [-11, -16, 21, 3, 8], // L3 scanner head, wider than the tower (cyan, identity mark)
    [-5, -4, 6, 3, 6], // L4 visor slot on the body
    [-5, 2, 6, 3, 11], // L4b indicator strip, select tone
    [-14, 6, 5, 3, 3], // L5 left foot, outboard of the tower
    [9, 6, 5, 3, 3], // L5 right foot, outboard of the tower
  ],
  generic: [
    // D-1: its own lattice (two bars, both posts) so it is no longer the sorter's copy.
    [-11, 12, 22, 3, 15, 1], // ART-003 contact shadow ellipse
    [-12, -8, 24, 3, 3], // bar at mask row 2
    [-12, 4, 24, 3, 3], // bar at mask row 5
    [-15, -11, 3, 22, 4], // left post
    [12, -11, 3, 22, 4], // right post
  ],
  polymerRecycler: [
    // D-1: drum stack - three bars with the right-hand post, no shared silhouette.
    [-11, 12, 22, 3, 15, 1], // ART-003 contact shadow ellipse
    [-12, -11, 24, 3, 3], // bar at mask row 1
    [-12, -4, 24, 3, 3], // bar at mask row 3
    [-12, 4, 24, 3, 3], // bar at mask row 5
    [12, -11, 3, 22, 4], // right post
  ],
  copperSeparator: [
    // D-1: three bars one row higher, left-hand post.
    [-11, 12, 22, 3, 15, 1], // ART-003 contact shadow ellipse
    [-12, -15, 24, 3, 3], // bar at mask row 0
    [-12, -8, 24, 3, 3], // bar at mask row 2
    [-12, 1, 24, 3, 3], // bar at mask row 4 (ART-003: one row lower than copper's old pair)
    [-15, -11, 3, 22, 4], // left post
  ],
  platePress: [
    // D-1: two wide plattens between both posts.
    [-11, 12, 22, 3, 15, 1], // ART-003 contact shadow ellipse
    [-12, -11, 24, 3, 3], // bar at mask row 1
    [-12, -1, 24, 3, 3], // bar at mask rows 3-4
    [-15, -11, 3, 22, 4], // left post
    [12, -11, 3, 22, 4], // right post
  ],
  circuitAssembler: [
    // D-1: three sparse bars, the top one flush with the frame, left-hand post.
    [-11, 12, 22, 3, 15, 1], // ART-003 contact shadow ellipse
    [-12, -15, 24, 3, 3], // bar at mask row 0
    [-12, -4, 24, 3, 3], // bar at mask row 3
    [-12, 12, 24, 3, 3], // bar at mask row 7 (G-1: the outer box now clears copper's)
    [-15, -11, 3, 22, 4], // left post
  ],
  drone: [
    [-5, 3, 10, 4, 15, 1], // DR5 shadow ellipse (alpha 0.35)
    [-5, -3, 4, 2, 8], // DR2 rotors
    [1, -3, 4, 2, 8],
    [-3, -2, 6, 4, 8], // DR1 body
  ],
};

/** Wreck hull as a snapped pentagon path (world-unit offsets from its position). */
export const WRECK_HULL: readonly (readonly [number, number])[] = [
  [-22, 10],
  [-14, -12],
  [6, -16],
  [22, 4],
  [16, 12],
];

/** W5: three rust shards, fixed coords. */
export const WRECK_SHARDS: readonly (readonly [number, number])[] = [
  [-30, 12],
  [26, -4],
  [30, 10],
];

/** Floor kit FK1..FK8, fixed world coords as [x, y, w, h, colourIndex] - no random placement. */
export const FLOOR_KIT: readonly PartTuple[] = [
  [64, 96, 6, 100, 12], // FK1 worn path band
  [64, 10, 22, 6, 12], // FK1 spur to the dock
  [8, 190, 176, 2, 13], // FK2 drainage line
  [0, 0, 192, 2, 15], // FK4 top rail
  [0, 190, 192, 2, 15], // FK4 bottom rail
  [104, 12, 5, 5, 4], // FK5 crate 1
  [104, 10, 5, 2, 3], // FK5 crate 1 top
  [112, 16, 5, 5, 4], // FK5 crate 2
  [112, 14, 5, 2, 3], // FK5 crate 2 top
  [56, 0, 2, 10, 15], // FK6 power pole
  [40, 2, 16, 2, 15], // FK6 sagging cable
  // L-5: three kit families on the twelve empty mature-seed cells, so no cell reads as
  // bare floor. Colour indices stay inside the set already in use (4/12/13), which keeps
  // groupFill's paint-group count - and the frame's op count - unchanged.
  // Family A, plank stack (3 bars, 96 of 1024 units = 14.1 %): tiles 12, 16, 21, 28.
  [4, 72, 24, 2, 12], // tile 12
  [4, 76, 24, 2, 12],
  [4, 80, 24, 2, 13],
  [132, 72, 24, 2, 12], // tile 16
  [132, 76, 24, 2, 12],
  [132, 80, 24, 2, 13],
  [100, 104, 24, 2, 12], // tile 21
  [100, 108, 24, 2, 12],
  [100, 112, 24, 2, 13],
  [132, 136, 24, 2, 12], // tile 28
  [132, 140, 24, 2, 12],
  [132, 144, 24, 2, 13],
  // Family B, drum pair on a skid (4 + 36 + 36 + 32 = 104 units = 10.2 %): tiles 13, 17, 24, 29.
  [38, 74, 6, 6, 4], // tile 13
  [48, 76, 6, 6, 4],
  [38, 82, 16, 2, 13],
  [166, 74, 6, 6, 4], // tile 17
  [176, 76, 6, 6, 4],
  [166, 82, 16, 2, 13],
  [6, 138, 6, 6, 4], // tile 24
  [16, 140, 6, 6, 4],
  [6, 146, 16, 2, 13],
  [166, 138, 6, 6, 4], // tile 29
  [176, 140, 6, 6, 4],
  [166, 146, 16, 2, 13],
  // Family C, rail spine with two end ticks (56 + 56 + 4 + 4 = 120 units = 11.7 %): tiles 15, 19, 23, 27.
  [98, 78, 28, 2, 12], // tile 15
  [98, 82, 28, 2, 13],
  [98, 75, 2, 2, 4],
  [124, 75, 2, 2, 4],
  [34, 110, 28, 2, 12], // tile 19
  [34, 114, 28, 2, 13],
  [34, 107, 2, 2, 4],
  [60, 107, 2, 2, 4],
  [162, 110, 28, 2, 12], // tile 23
  [162, 114, 28, 2, 13],
  [162, 107, 2, 2, 4],
  [188, 107, 2, 2, 4],
  [98, 142, 28, 2, 12], // tile 27
  [98, 146, 28, 2, 13],
  [98, 139, 2, 2, 4],
  [124, 139, 2, 2, 4],
];

/**
 * ART-001 depth tiers. Three flat planes, each one path: the far bank (a distant skyline
 * in the night above the top rail), the near bank (a roofline one step lighter), then the
 * foreground apron below the bottom rail. Fixed coords, no random placement, and every
 * entry reuses a colour index already in `FLOOR_KIT`, so no new paint group appears.
 */
export const SKY_FAR: readonly PartTuple[] = [
  [6, -9, 12, 8, 13],
  [22, -13, 7, 12, 13],
  [34, -8, 10, 7, 13],
  [52, -12, 6, 11, 13],
  [62, -8, 14, 7, 13],
  [84, -13, 5, 12, 13],
  [92, -9, 16, 8, 13],
  [116, -12, 7, 11, 13],
  [126, -8, 12, 7, 13],
  [142, -13, 6, 12, 13],
  [152, -9, 14, 8, 13],
  [172, -12, 6, 11, 13],
  [180, -8, 10, 7, 13],
];

export const SKY_NEAR: readonly PartTuple[] = [
  [10, -6, 18, 5, 12],
  [40, -7, 16, 6, 12],
  [66, -6, 26, 5, 12],
  [98, -7, 14, 6, 12],
  [118, -6, 20, 5, 12],
  [146, -7, 18, 6, 12],
  [168, -6, 22, 5, 12],
];

/** Lit kerb on the pad edge plus the two berm ticks; the apron below y = 192 is outside
 *  every 32-unit cell box, so these add no cell ink (L-5). */
export const APRON_EDGE: readonly PartTuple[] = [
  [0, 192, 192, 2, 12],
  [4, 195, 10, 2, 13],
  [178, 195, 10, 2, 13],
];

/** Foreground props at a larger scale than the in-yard kit: crates, a drum, a skid. */
export const APRON_PROPS: readonly PartTuple[] = [
  [6, 198, 12, 12, 4],
  [26, 200, 8, 10, 4],
  [164, 198, 10, 12, 4],
  [150, 202, 6, 8, 4],
];

/** Tops of the same props on the light side (light comes from the upper left). */
export const APRON_TOPS: readonly PartTuple[] = [
  [6, 198, 12, 2, 3],
  [26, 200, 8, 2, 3],
  [164, 198, 10, 2, 3],
  [150, 202, 6, 2, 3],
];

/** Contact shadows under the props, one step under the pad tone. */
export const APRON_SHADOWS: readonly PartTuple[] = [
  [6, 210, 14, 2, 15],
  [26, 210, 10, 2, 15],
  [150, 210, 12, 2, 15],
  [164, 210, 12, 2, 15],
];

/** Lit core inside the FK1 worn band and its spur, inset so no new ink appears. */
export const PATH_CORE: readonly PartTuple[] = [
  [65, 96, 4, 100, 14],
  [65, 11, 20, 4, 14],
];

/** Wreck detail rows: dark voids, ribs, the broken mast and two rust streaks. */
export const WRECK_VOIDS: readonly PartTuple[] = [
  [-7, -6, 6, 3, 6],
  [3, -5, 5, 3, 6],
];

export const WRECK_RIBS: readonly PartTuple[] = [
  [-9, -10, 2, 9, 4],
  [-2, -13, 2, 12, 4],
  [9, -11, 2, 10, 4],
];

export const WRECK_MAST: readonly PartTuple[] = [
  [13, -22, 3, 7, 12],
  [-22, 6, 8, 2, 12],
];

export const WRECK_STREAKS: readonly PartTuple[] = [
  [-16, 2, 3, 3, 9],
  [16, -8, 3, 3, 9],
];

/** FK4 posts: 2x3 every 16 units along both rails. */
export const FLOOR_POSTS: readonly (readonly [number, number])[] = (() => {
  const posts: (readonly [number, number])[] = [];
  for (let x = 0; x <= 176; x += 16) {
    posts.push([x, 0], [x, 189]);
  }
  return posts;
})();

/** FK3 puddles (rx 10 ry 3, alpha 0.14) and FK8 gravel corner ticks, fixed spots. */
export const PUDDLES: readonly (readonly [number, number])[] = [
  [24, 200],
  [88, 204],
  [150, 198],
];

/**
 * ART-003 A3-4: the resting dot field drops from two lit ticks per cell to one dark tick.
 * The painter dims it further (alpha 0.28), so at rest the machines, not the construction
 * dots, carry the brightest pixels. One tick per cell keeps the tiles reading as measured
 * ground without competing with the silhouettes.
 */
export const GRAVEL: readonly (readonly [number, number])[] = (() => {
  const ticks: (readonly [number, number])[] = [];
  for (let tile = 0; tile < 36; tile += 1) {
    const col = tile % 6;
    const row = Math.floor(tile / 6);
    const cx = col * 32 + 16;
    const cy = row * 32 + 16;
    ticks.push([cx + 11, cy + 11]);
  }
  return ticks;
})();

/** Gray steps for the desaturated silhouette sheet, keyed by palette index. */
export const GRAY_STEPS = ["#101b28", "#22384a", "#6d90ab", "#8aa9c4", "#f4f7fb"] as const;
