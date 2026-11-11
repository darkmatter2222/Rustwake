import { describe, expect, it } from "vitest";
import cssRaw from "../../src/ui/primitives.css?raw";
import {
  BANDS,
  CHIP_BAND_HEIGHTS,
  CHIP_LADDER,
  ELEVATION,
  FACE_STATES,
  GEOMETRY,
  MOTION,
  NAV_SLOTS,
  PALETTE,
  SPACING,
  TYPE,
  Z_INDEX,
  bandFor,
  chipBandHeight,
  chipsForWidth,
  chipText,
  faceSentence,
  faceTransition,
  printAmount,
  printPrice,
  sheetHeightFor,
  tokenDeclarations,
  zIndexOf,
} from "../../src/ui/tokens";

/**
 * UI-RESET/TOKENS (#48) acceptance 2 and 5: the token module is the only place these numbers
 * live, every one of them is the measured value, and the CSS block the primitives ship with
 * declares exactly the same set (no second, drifting copy of a number).
 */

describe("tokens: palette and material", () => {
  it("is the selected direction A palette, one job per hue", () => {
    expect(PALETTE).toMatchObject({
      night: "#0a1118",
      nightDeep: "#070d13",
      panel: "rgba(7, 13, 19, 0.84)",
      paper: "#eef4f8",
      steelLight: "#93b4c9",
      avail: "#5fd8e8",
      flow: "#ffb765",
      ok: "#7fdc8f",
      primary: "#ff8f3f",
      hair: "rgba(147, 180, 201, 0.28)",
    });
  });

  it("keeps one hairline, two radii and one contact shadow", () => {
    expect(ELEVATION.hairlineWidth).toBe(1);
    expect(ELEVATION.radiusFace).toBe(2);
    expect(ELEVATION.radiusPlate).toBe(3);
    expect(ELEVATION.contactShadow).toMatch(/^0 1px 0 rgba/);
  });
});

describe("tokens: spacing, type, elevation ladder, z-index", () => {
  it("carries the 4 / 6 / 8 px gaps and the 2 px chip gap", () => {
    expect(SPACING).toMatchObject({ gapFace: 4, gapRow: 6, gapBand: 8, gapChip: 2, insetX: 10 });
  });

  it("is one family, a three-tier ladder and tabular figures", () => {
    expect(TYPE.rootPx).toBe(15);
    expect(TYPE.primaryRem).toBe(0.95);
    expect(TYPE.bodyRem).toBe(0.84);
    expect(TYPE.secondaryRem).toBe(0.72);
    // the ladder is monotonic at every scale: primary >= body >= secondary
    expect(TYPE.primaryPx).toBeGreaterThan(TYPE.bodyPx);
    expect(TYPE.bodyPx).toBeGreaterThan(TYPE.secondaryPx);
    // 0.95 / 0.84 / 0.72 rem on a 15 px root, as `measures-46.json` painted them
    expect(TYPE.primaryPx).toBeCloseTo(TYPE.rootPx * TYPE.primaryRem, 2);
    expect(TYPE.bodyPx).toBeCloseTo(TYPE.rootPx * TYPE.bodyRem, 2);
    expect(TYPE.secondaryPx).toBeCloseTo(TYPE.rootPx * TYPE.secondaryRem, 2);
    expect(TYPE.familyData).toContain("ui-monospace");
  });

  it("paints the four z-index tiers 5 / 20 / 30 / 40 in strict order", () => {
    expect(Z_INDEX).toEqual({ chrome: 5, feedback: 20, sheet: 30, dialog: 40 });
    expect(zIndexOf("chrome")).toBe(5);
    expect(zIndexOf("dialog")).toBe(40);
    expect(Z_INDEX.chrome < Z_INDEX.feedback).toBe(true);
    expect(Z_INDEX.feedback < Z_INDEX.sheet).toBe(true);
    expect(Z_INDEX.sheet < Z_INDEX.dialog).toBe(true);
  });
});

describe("tokens: the measured band rules", () => {
  it("keeps the 44 px target floor, the 46 px face and the measured columns", () => {
    expect(GEOMETRY.touchMinPx).toBe(44);
    expect(GEOMETRY.faceHeightPx).toBe(46);
    expect(GEOMETRY.railWidthPx).toBe(56);
    expect(GEOMETRY.inspectorWidthPx).toBe(320);
    expect(GEOMETRY.frameCapPx).toBe(1600);
    expect(GEOMETRY.chromeBandPx).toBe(GEOMETRY.faceHeightPx + SPACING.gapBand);
  });

  it("pins the chip band to the measured 23 / 48 / 73 px row heights", () => {
    expect(CHIP_BAND_HEIGHTS).toEqual({ rows1: 23, rows2: 48, rows3: 73 });
    expect(chipBandHeight(1)).toBe(23);
    expect(chipBandHeight(2)).toBe(48);
    expect(chipBandHeight(3)).toBe(73);
  });

  it("keeps the measured sheet heights, portrait and desktop", () => {
    expect(sheetHeightFor("390x844")).toBe(348);
    expect(sheetHeightFor("360x640")).toBe(262);
    expect(sheetHeightFor("1920x1080", "store")).toBe(538);
    expect(sheetHeightFor("1366x768", "research")).toBe(445);
    expect(sheetHeightFor("844x390", "store")).toBe(157);
    expect(sheetHeightFor("844x390", "research")).toBe(212);
    // P3: the same band always answers the same height, per kind
    expect(sheetHeightFor("1920x1080", "store")).toBe(sheetHeightFor("2560x1440", "store"));
  });

  it("names every measured band and its kind", () => {
    expect(Object.keys(BANDS)).toEqual([
      "360x640",
      "390x844",
      "844x390",
      "1366x768",
      "1920x1080",
      "2560x1440",
    ]);
    expect(bandFor(390, 844)).toBe("390x844");
    expect(bandFor(2560, 1440)).toBe("2560x1440");
    expect(bandFor(800, 392)).toBe("844x390");
  });

  it("applies the chip ladder by width without renumbering the order", () => {
    expect(chipsForWidth(390)).toEqual(["scrap", "credits", "store"]);
    expect(chipsForWidth(1366)).toEqual(["scrap", "credits", "store", "ferrous"]);
    expect(chipsForWidth(1920)).toEqual(["scrap", "credits", "store", "ferrous", "nonferrous"]);
    expect(chipsForWidth(2560)).toHaveLength(7);
    // every rung is a superset of the one before it, so the purse never disappears
    for (let i = 1; i < CHIP_LADDER.length; i += 1) {
      const prior = CHIP_LADDER[i - 1].chips;
      for (const chip of prior) expect(CHIP_LADDER[i].chips).toContain(chip);
    }
  });

  it("holds the five nav slots in the one fixed order", () => {
    expect(NAV_SLOTS).toEqual(["yard", "build", "store", "research", "menu"]);
  });
});

describe("tokens: the printed formats", () => {
  it("prints one price with exactly one space before the unit", () => {
    expect(printPrice(222)).toBe("222 credits");
    expect(printPrice(0.5, "Data")).toBe("0.5 Data");
    expect(printAmount(70, "credits", true)).toBe("+70 credits");
    expect(printAmount(6, "units")).toBe("6 units");
    // the shipped defect: `Ferrous+70` and `Store900/900` have no space
    expect(printPrice(70, "credits")).toMatch(/^\S+ [a-z]/);
    expect(chipText("Store", "900/900")).toBe("Store 900/900");
  });

  it("paints one single-line sentence with the middle-dot separator only", () => {
    expect(faceSentence("Sell 35 Ferrous", null, "+70 credits")).toBe("Sell 35 Ferrous · +70 credits");
    expect(faceSentence("Build Scrap sorter", "20 scrap", "waits 20 scrap", "have 15", "in 2s")).toBe(
      "Build Scrap sorter · 20 scrap · waits 20 scrap · have 15 · in 2s"
    );
    const line = faceSentence("Upgrade", "222 credits");
    expect(line.includes("\n")).toBe(false);
    expect(line.split(" · ")).toHaveLength(2);
  });
});

describe("tokens: one motion clock with a real reduced branch", () => {
  it("is 200 ms stepped on three properties, none when reduced", () => {
    expect(MOTION.stepMs).toBe(200);
    expect(MOTION.timing).toBe("steps(4, end)");
    expect(MOTION.properties).toEqual(["background-color", "border-color", "opacity"]);
    const full = faceTransition(false);
    expect(full).toBe(
      "background-color 200ms steps(4, end), border-color 200ms steps(4, end), opacity 200ms steps(4, end)"
    );
    expect(faceTransition(true)).toBe("none");
    // three properties, one clock each: the quantiser appears exactly three times
    expect(full.match(/steps\(4, end\)/g)).toHaveLength(3);
    expect(full.match(/200ms/g)).toHaveLength(3);
  });
});

describe("tokens: the CSS block is the same numbers", () => {
  it("declares every token value in primitives.css", () => {
    for (const line of tokenDeclarations()) {
      const [name, value] = line.split(": ");
      expect(cssRaw).toContain(`${name}: ${value};`);
    }
  });

  it("carries the reduced-motion branch with the same none value", () => {
    const block = cssRaw.slice(cssRaw.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block.length).toBeGreaterThan(0);
    expect(block).toContain("transition: none;");
  });

  it("keeps the non-colour state signals in the sheet", () => {
    // unaffordable and locked are dashed/dotted edges plus a printed line, not only a hue
    expect(cssRaw).toContain('.wk-face[data-afford="short"]');
    expect(cssRaw).toMatch(/\.wk-face\[data-afford="short"\][^{]*\{[^}]*border-style: dashed/);
    expect(cssRaw).toMatch(/\.wk-face\[data-state="disabled"\][^{]*\{[^}]*border-style: dashed/);
  });

  it("declares the data face and tabular figures", () => {
    expect(cssRaw).toContain("--wk-font-data:");
    expect(cssRaw).toMatch(/\.wk-data[^{]*\{[^}]*font-variant-numeric: tabular-nums/);
  });

  it("never fixes a text box: the 200 % text rule needs min-height plus wrapping", () => {
    expect(cssRaw).toMatch(/\.wk-face \{[^}]*min-height: var\(--wk-face-h\)/);
    expect(cssRaw).toMatch(/\.wk-face \{[^}]*min-width: var\(--wk-touch-min\)/);
    expect(cssRaw).toMatch(/\.wk-face__label \{[^}]*overflow-wrap: anywhere/);
    expect(cssRaw).toMatch(/\.wk-sheet__body[^{]*\{[^}]*min-height: 0/);
  });
});

describe("tokens: the state group", () => {
  it("names the seven states in the painted order", () => {
    expect(FACE_STATES).toEqual([
      "normal",
      "hover",
      "focus",
      "pressed",
      "disabled",
      "loading",
      "error",
    ]);
  });
});
