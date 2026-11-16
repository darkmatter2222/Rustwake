/**
 * UI-RESET/TOKENS (#48): the one place the shared UI's numbers live.
 *
 * Every value below carries its source in `TOKEN_SOURCES`. Priority order, as recorded in
 * `work/evidence/UI-RESET-48/README.md`:
 *   1. a number that appears in a measured JSON (`work/evidence/UI-RESET-45/measures.json`,
 *      `work/evidence/UI-RESET-46/measures-46.json`) wins,
 *   2. then `work/evidence/UI-RESET-47/navigation-spec.md`,
 *   3. then `work/evidence/UI-RESET-46/design-spec-46.md` / `art-direction-spec.md`.
 * Where two documents disagree the measured number is used and the disagreement is listed in
 * that README's conflict table; #77 consolidates those numbers and will supersede them.
 *
 * This module is pure data plus pure functions: no DOM, no React, no game state, so it is
 * importable from the harness scripts and from the unit tests unchanged.
 */

/** One job per hue, direction A "Salvage ledger" (selected direction, #46). */
export const PALETTE = {
  night: "#0a1118",
  nightDeep: "#070d13",
  /** the one plate wash: 0.84 alpha, no second backdrop layer, no blur */
  panel: "rgba(7, 13, 19, 0.84)",
  paper: "#eef4f8",
  steelLight: "#93b4c9",
  /** structure and titles, and "available" */
  avail: "#5fd8e8",
  /** numbers in flight and prices */
  flow: "#ffb765",
  /** a condition that is satisfied */
  ok: "#7fdc8f",
  /** the one primary fill, nothing else */
  primary: "#ff8f3f",
  hair: "rgba(147, 180, 201, 0.28)",
} as const;

/** Two material steps only: a hairline plate, and the same plate with a contact shadow. */
export const ELEVATION = {
  /** `art-direction-spec.md` section 3: one 1-step-dark contact shadow per footprint. */
  contactShadow: "0 1px 0 rgba(7, 13, 19, 0.75)",
  radiusPlate: 3,
  radiusFace: 2,
  hairlineWidth: 1,
} as const;

/**
 * The painted stack. Four tiers, mapped from the five logical layers of
 * `navigation-spec.md` section 4: in-flow chrome, the toast lane, one sheet, one dialog.
 */
export const Z_INDEX = {
  /** chip band, control cluster, objective card, nav and primary rows */
  chrome: 5,
  /** the feedback lane, layered inside the world cell */
  feedback: 20,
  /** layer 4: one sheet at a time (build, store, research, menu, machine inspector) */
  sheet: 30,
  /** layer 5 (and the inert report): the top dialog over every sheet */
  dialog: 40,
} as const;

/** Type ladder: three tiers, one family, tabular figures on every numeric node. */
export const TYPE = {
  /** `--font-ui`: the built system stack, no webfont (styles.css line 33). */
  familyUi: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  /** `--font-data`: same metrics, monospaced digits for readouts and prices. */
  familyData: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  rootPx: 15,
  /** rem ladder (direction A): primary line, body and chip, secondary readout, plate title. */
  primaryRem: 0.95,
  bodyRem: 0.84,
  secondaryRem: 0.72,
  titleRem: 0.86,
  /** the same ladder as painted at scale 1 in `measures-46.json`. */
  primaryPx: 14.25,
  bodyPx: 12.6,
  secondaryPx: 10.8,
  titlePx: 12.9,
  /** uppercase tracking on plate titles and face labels. */
  trackTitleEm: 0.08,
  trackFaceEm: 0.06,
  lineHeight: 1.35,
} as const;

/** Rhythm: 4 px inside a face, 6 px between rows, 8 px viewport pad. */
export const SPACING = {
  /** C6 of `navigation-spec.md`: label and price are two children with this gap. */
  gapFace: 4,
  /** P3/1.1: the gap between two chrome rows. */
  gapRow: 6,
  /** the viewport pad every measured band starts from (`measures.json`, y 8). */
  gapBand: 8,
  /** `measures.json`: every band box starts at x 10. */
  insetX: 10,
  /** 2 px inside the chip rail (`direction-a.css`, `.resources` gap). */
  gapChip: 2,
} as const;

/** One clock for the whole interface (`art-direction-spec.md` section 3). */
export const MOTION = {
  /** ms */
  stepMs: 200,
  timing: "steps(4, end)",
  properties: ["background-color", "border-color", "opacity"],
  /** what `prefers-reduced-motion: reduce` sets every property to. */
  reduced: "none",
} as const;

/** Touch and band geometry, all read back from the measured rects. */
export const GEOMETRY = {
  /** no face under this height (measured `facesUnder44` is 0 in all fifteen frames). */
  touchMinPx: 44,
  /** the measured face height of every dock and nav row. */
  faceHeightPx: 46,
  /** the measured nav/dock row box: 5 faces plus four 4 px gaps inside 370 px. */
  navRowWidthPx: 370,
  railWidthPx: 56,
  inspectorWidthPx: 320,
  /** D1: the frame the whole chrome is centred in, so 2560 stops wasting its gutters. */
  frameCapPx: 1600,
  /** the 2560 inspector band top (`navigation-spec.md` 3.3 table). */
  inspectorTopDesktopPx: 8,
  /** the primary band: 46 px face plus the 8 px gap under it (54 px of camera band). */
  chromeBandPx: 54,
} as const;

/**
 * Chip band heights, per painted row count: the measured 1/2/3-row boxes of
 * `UI-RESET-45/measures.json` (23 at one row on every desktop and landscape band, 48 for two
 * rows at 390x844, 73 for three rows at 360x640). The rail itself is pinned to one row.
 */
export const CHIP_BAND_HEIGHTS = { rows1: 23, rows2: 48, rows3: 73 } as const;

/** Sheet heights kept exactly as measured (`GEOMETRY` names the widths). */
export const SHEET_HEIGHTS = {
  portrait390: 348,
  portrait360: 262,
  landscapeStore: 157,
  landscapeResearch: 212,
  desktopStore: 538,
  desktopResearch: 445,
} as const;

/** The five fixed nav slots, in the one order that never changes (section 1 of the nav spec). */
export const NAV_SLOTS = ["yard", "build", "store", "research", "menu"] as const;
export type NavSlot = (typeof NAV_SLOTS)[number];

/** The chip-priority ladder of `design-spec-46.md` section 5, applied by width. */
export const CHIP_LADDER = [
  { minWidth: 0, chips: ["scrap", "credits", "store"] },
  { minWidth: 1200, chips: ["scrap", "credits", "store", "ferrous"] },
  { minWidth: 1500, chips: ["scrap", "credits", "store", "ferrous", "nonferrous"] },
  { minWidth: 2100, chips: ["scrap", "credits", "store", "ferrous", "nonferrous", "steel", "copper"] },
] as const;

/** The named bands this module pins, so the tests and the harness read one table. */
export const BANDS = {
  "360x640": { w: 360, h: 640, dpr: 2, kind: "portrait", chipRows: 3, sheet: SHEET_HEIGHTS.portrait360 },
  "390x844": { w: 390, h: 844, dpr: 2, kind: "portrait", chipRows: 2, sheet: SHEET_HEIGHTS.portrait390 },
  "844x390": { w: 844, h: 390, dpr: 2, kind: "landscape", chipRows: 1, sheet: SHEET_HEIGHTS.landscapeResearch },
  "1366x768": { w: 1366, h: 768, dpr: 1, kind: "desktop", chipRows: 1, sheet: SHEET_HEIGHTS.desktopStore },
  "1920x1080": { w: 1920, h: 1080, dpr: 1, kind: "desktop", chipRows: 1, sheet: SHEET_HEIGHTS.desktopStore },
  "2560x1440": { w: 2560, h: 1440, dpr: 1, kind: "desktop", chipRows: 1, sheet: SHEET_HEIGHTS.desktopStore },
} as const;

export type BandKey = keyof typeof BANDS;

/**
 * Where each number came from. Kept next to the values so a reviewer can check a token
 * against its source without leaving the module; the README carries the same table widened
 * with both sides of every conflict.
 */
export const TOKEN_SOURCES = {
  "palette.*": "work/evidence/UI-RESET-46/art-direction-spec.md section 3 (direction A, :root of direction-a.css)",
  "elevation.contactShadow": "work/evidence/UI-RESET-46/art-direction-spec.md section 3 (one 1-step-dark contact shadow)",
  "zIndex.*": "issue #48 acceptance 2 (5/20/30/40) over navigation-spec.md section 4 layer table",
  "type.rootPx": "src/ui/styles.css line 34 (15px x --text-scale)",
  "type.ladder": "work/evidence/UI-RESET-46/art-direction-spec.md section 3; px values are the measured fonts in measures-46.json",
  "spacing.gapFace": "navigation-spec.md C6 (two children, 4 px)",
  "spacing.gapRow": "navigation-spec.md 1.1 gaps row (6 px)",
  "spacing.gapBand": "measures.json: every band box at y 8",
  "spacing.insetX": "measures.json: every band box at x 10",
  "motion": "art-direction-spec.md section 3 (one 200 ms clock, steps(4, end))",
  "geometry.touchMinPx": "measures-46.json facesUnder44 = 0 in every frame",
  "geometry.faceHeightPx": "measures.json dock 370x46 / 560x46",
  "geometry.railWidthPx": "navigation-spec.md D1 (56); conflicts with nav-spec.md 1.2 (96) - see README",
  "geometry.inspectorWidthPx": "measures.json sheet 320x538 / 320x445",
  "geometry.frameCapPx": "navigation-spec.md D1 (1600, centred)",
  "geometry.chromeBandPx": "measures.json dock h 46 + the 8 px pad = 54 (navigation-spec.md P2); conflicts with nav-spec.md 1.1 (134) - see README",
  "chipBandHeights": "measures.json chip row h: 23 (1 row), 48 (2 rows), 73 (3 rows)",
  "sheetHeights": "measures.json sheet boxes 370x348, 340x262, 320x538, 320x445",
  "chipLadder": "design-spec-46.md section 5",
  "chipPaintOrder": "measures-46.json chipLabels (DOM order: scrap, materials, Credits, Store)",
  "chipsFor (presence keyed)": "measured: _chips48.mjs at 390x844 - fresh DOM 3 chips, Credits slot 2; the A sheet hides 2 chips by :nth-child(2)",
  "printAmount / printPrice": "design-spec-46.md section 2 (tabular-nums) + the single space before the unit every measured face prints",
  "navSlots": "navigation-spec.md section 1 (fixed slot order)",
} as const;

/** The state group every primitive paints. `unaffordable` is carried as a data attribute. */
export const FACE_STATES = [
  "normal",
  "hover",
  "focus",
  "pressed",
  "disabled",
  "loading",
  "error",
] as const;
export type FaceState = (typeof FACE_STATES)[number];

/** The one separator inside a face (C4): U+00B7 with one space each side. */
export const SEPARATOR = " · ";

/**
 * One printed price format: the number, exactly one space, the unit word. Gains carry `+`,
 * costs carry no sign (C2, C3). A bare number is not allowed.
 */
export function printAmount(value: number, unit: string, signed = false): string {
  const body = `${trimmed(value)} ${unit}`;
  return signed ? `+${body}` : body;
}

/** The cost form of `printAmount`: no sign, one space before the unit word. */
export function printPrice(value: number, unit = "credits"): string {
  return printAmount(value, unit, false);
}

/** `1.74` keeps its two digits, `222` keeps none: trailing zeros are trimmed. */
function trimmed(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

/**
 * The single-line face string (C1 to C4): verb, object, then every number segment behind the
 * one separator. Two-line faces are not used, so a 46 px row never stacks three numbers.
 */
export function faceSentence(verb: string, target: string | null, ...segments: (string | null)[]): string {
  return [verb, target, ...segments].filter((p): p is string => !!p && p.length > 0).join(SEPARATOR);
}

/** The chip form: label, one space, the tabular value. Never `Store900/900`. */
export function chipText(label: string, value: string | number): string {
  return `${label} ${value}`;
}

/** The band a viewport paints, from the six measured sizes. */
export function bandFor(width: number, height: number): BandKey | null {
  let best: BandKey | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const [key, band] of Object.entries(BANDS) as [BandKey, (typeof BANDS)[BandKey]][]) {
    const delta = Math.abs(band.w - width) * 2 + Math.abs(band.h - height) * 3;
    if (delta < bestDelta) {
      bestDelta = delta;
      best = key;
    }
  }
  return best;
}

/** The sheet height a band keeps when it opens (P3: a sheet never resizes). */
export function sheetHeightFor(key: BandKey, kind: "store" | "research" = "store"): number {
  const band = BANDS[key];
  if (band.kind === "portrait") return band.sheet;
  if (band.kind === "landscape") return kind === "store" ? SHEET_HEIGHTS.landscapeStore : SHEET_HEIGHTS.landscapeResearch;
  return kind === "store" ? SHEET_HEIGHTS.desktopStore : SHEET_HEIGHTS.desktopResearch;
}

/** The chip band height for a painted row count. */
export function chipBandHeight(rows: 1 | 2 | 3): number {
  return rows === 1 ? CHIP_BAND_HEIGHTS.rows1 : rows === 2 ? CHIP_BAND_HEIGHTS.rows2 : CHIP_BAND_HEIGHTS.rows3;
}

/** The chips one width shows, from the fixed ladder. */
export function chipsForWidth(width: number): readonly string[] {
  let picked: readonly string[] = CHIP_LADDER[0].chips;
  for (const step of CHIP_LADDER) if (width >= step.minWidth) picked = step.chips;
  return picked;
}

/**
 * The chip-priority order (which keys a width pays for) and the painted order (the DOM order
 * `ResourceStrip` uses: scrap, the materials, credits, the capacity). The two differ, so both
 * are named: a ladder position is a *priority*, never a slot.
 */
export const CHIP_PAINT_ORDER = [
  "scrap",
  "ferrous",
  "nonferrous",
  "steel",
  "copper",
  "credits",
  "store",
] as const;

/** The value behind each chip key. `undefined` means the yard has no such value at all. */
export interface ChipValues {
  scrap?: number;
  credits?: number;
  /** `storeUnits` in the sim state: the number the capacity chip prints against its cap. */
  units?: number;
  /** the material stocks, keyed as in `state.store`. */
  materials?: Record<string, number | undefined>;
}

/** Is the value behind one chip key present? A printed zero is present, an empty stock is not. */
function chipValuePresent(key: string, values: ChipValues): boolean {
  if (key === "scrap") return values.scrap !== undefined;
  if (key === "credits") return values.credits !== undefined;
  if (key === "store") return values.units !== undefined;
  return (values.materials?.[key] ?? 0) > 0;
}

/**
 * The chips one width paints, keyed by the presence of the underlying value.
 *
 * This is the P1 fix: the shipped sheet hides `:nth-child(2)`, i.e. a *position*, so a fresh
 * yard (no materials) loses Credits and paints two chips where the ladder promises three
 * (`_chips48.mjs`, fresh with direction A: painted `Scrap 0`, `Store 0/900`). A presence key
 * cannot shift: an absent value drops its own chip and only that one, and Credits keeps slot 2
 * exactly as the shipped DOM already has it (`slotOfCredits: 2`).
 */
export function chipsFor(width: number, values: ChipValues): string[] {
  const budget = chipsForWidth(width);
  return CHIP_PAINT_ORDER.filter((key) => budget.includes(key) && chipValuePresent(key, values));
}

/**
 * The same list under the shipped positional rule, as data: `1` is the 46 px band's first
 * `:nth-child` hide at 390x844. Kept so the test and the README can name both numbers:
 * keyed = 3 chips with Credits at slot 2, positional = 2 painted chips at a fresh yard.
 */
export function chipsByPosition(width: number, values: ChipValues, hiddenPositions = [1]): string[] {
  return chipsFor(width, values).filter((_, index) => !hiddenPositions.includes(index));
}

/** The z-index of one painted layer. */
export function zIndexOf(layer: keyof typeof Z_INDEX): number {
  return Z_INDEX[layer];
}

/**
 * The transition one primitive declares. `reducedMotion` is the value of
 * `prefers-reduced-motion: reduce`, so the JS and the CSS take the same branch.
 */
export function faceTransition(reducedMotion: boolean): string {
  if (reducedMotion) return MOTION.reduced;
  return MOTION.properties
    .map((prop) => `${prop} ${MOTION.stepMs}ms ${MOTION.timing}`)
    .join(", ");
}

/** The CSS custom-property block this module stands for, in declaration order. */
export function tokenDeclarations(): string[] {
  return [
    `--wk-night: ${PALETTE.night}`,
    `--wk-night-deep: ${PALETTE.nightDeep}`,
    `--wk-panel: ${PALETTE.panel}`,
    `--wk-paper: ${PALETTE.paper}`,
    `--wk-steel: ${PALETTE.steelLight}`,
    `--wk-avail: ${PALETTE.avail}`,
    `--wk-flow: ${PALETTE.flow}`,
    `--wk-ok: ${PALETTE.ok}`,
    `--wk-primary: ${PALETTE.primary}`,
    `--wk-hair: ${PALETTE.hair}`,
    `--wk-font-ui: ${TYPE.familyUi}`,
    `--wk-font-data: ${TYPE.familyData}`,
    `--wk-step: ${MOTION.stepMs}ms`,
    `--wk-step-timing: ${MOTION.timing}`,
    `--wk-gap-face: ${SPACING.gapFace}px`,
    `--wk-gap-row: ${SPACING.gapRow}px`,
    `--wk-gap-band: ${SPACING.gapBand}px`,
    `--wk-radius-face: ${ELEVATION.radiusFace}px`,
    `--wk-radius-plate: ${ELEVATION.radiusPlate}px`,
    `--wk-touch-min: ${GEOMETRY.touchMinPx}px`,
    `--wk-face-h: ${GEOMETRY.faceHeightPx}px`,
    `--wk-rail-w: ${GEOMETRY.railWidthPx}px`,
    `--wk-inspector-w: ${GEOMETRY.inspectorWidthPx}px`,
    `--wk-frame-cap: ${GEOMETRY.frameCapPx}px`,
    `--wk-z-chrome: ${Z_INDEX.chrome}`,
    `--wk-z-feedback: ${Z_INDEX.feedback}`,
    `--wk-z-sheet: ${Z_INDEX.sheet}`,
    `--wk-z-dialog: ${Z_INDEX.dialog}`,
    `--wk-chip-h-1: ${CHIP_BAND_HEIGHTS.rows1}px`,
    `--wk-chip-h-2: ${CHIP_BAND_HEIGHTS.rows2}px`,
    `--wk-chip-h-3: ${CHIP_BAND_HEIGHTS.rows3}px`,
  ];
}
