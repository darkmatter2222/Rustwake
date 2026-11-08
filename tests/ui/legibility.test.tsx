import { describe, expect, it } from "vitest";
import stylesRaw from "../../src/ui/styles.css?raw";

/**
 * UI-004 g1: the two legibility floors the W-3 census printed as failures, pinned in the
 * stylesheet itself so a later CSS edit cannot silently drop them.
 *
 * The census is `work/development/UI-004-g1/legibility-census.json`; this file pins the
 * *declared* values it resolves from, which is the part a CSS edit can move. Everything here
 * is read off the shipped `styles.css` text plus WCAG relative luminance, so the test does not
 * depend on how much of the cascade jsdom chooses to resolve (`getComputedStyle` in jsdom hands
 * back an unresolved `0.8rem`, and `var()` in a `color:` shorthand is not resolved at all).
 *
 * Baseline (`origin/main` 1573ac1, W-3, 390x844 dpr2) as recorded in PROD-TRIAGE-004 row 3:
 * `.dock__cost` 10.8 / 13.5 / 11.25 px at 2.67:1, the amber-fill face label 13.2 / 16.5 /
 * 13.95 px at 3.31:1 — the `A` control was non-monotonic for both.
 */

/** `html { font-size: calc(15px * var(--text-scale, 1)) }`, so 1rem = 15 px at scale 1. */
const ROOT_PX = 15;
/** `App.tsx`: `root.classList.toggle("text-large", settings.textScale >= 1.5)`. */
const TEXT_LARGE_FROM = 1.5;
/** The three `A` steps the button cycles (`App.tsx` textScale steps), i.e. the census columns. */
const STEPS = [1, 1.25, 1.5] as const;

type Rule = { selectors: string[]; declarations: Record<string, string> };

/** Minimal, source-order-preserving rule table for the shipped sheet (comments removed). */
const rules: Rule[] = (() => {
  const css = stylesRaw.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Rule[] = [];
  for (const [, selectorText, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations: Record<string, string> = {};
    for (const line of body.split(";")) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      const prop = line.slice(0, i).trim();
      const value = line.slice(i + 1).trim();
      if (prop) declarations[prop] = value;
    }
    out.push({ selectors: selectorText.split(",").map((s) => s.trim().replace(/\s+/g, " ")), declarations });
  }
  return out;
})();

/** The winning declaration for one property, honouring the source order and `.text-large`. */
function declared(selector: string, prop: string, scale: number): string | undefined {
  let winner: string | undefined;
  for (const rule of rules) {
    for (const sel of rule.selectors) {
      const large = sel.startsWith(".text-large ");
      const rest = large ? sel.slice(".text-large ".length) : sel;
      if (rest !== selector) continue;
      if (large && scale < TEXT_LARGE_FROM) continue;
      if (rule.declarations[prop] !== undefined) winner = rule.declarations[prop];
    }
  }
  return winner;
}

/** Declared px for one class at one `A` step, straight from the rem value and the root size. */
function declaredPx(selector: string, prop: string, scale: number): number {
  const value = declared(selector, prop, scale);
  if (value === undefined) throw new Error(`no declaration for ${selector} { ${prop} }`);
  const rem = /^([\d.]+)rem$/.exec(value);
  if (rem) return Number((parseFloat(rem[1]) * ROOT_PX * scale).toFixed(2));
  const px = /^([\d.]+)px$/.exec(value);
  if (px) return parseFloat(px[1]);
  throw new Error(`${selector} { ${prop} } is not a px/rem declaration: ${value}`);
}

/** WCAG relative luminance, alpha-stripped — the method the player lane's census used. */
function luminance([r, g, b]: readonly [number, number, number]): number {
  const channel = (raw: number) => {
    const s = raw / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
const hex = (value: string): readonly [number, number, number] => {
  const m = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(value.trim());
  if (!m) throw new Error(`not a hex colour: ${value}`);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
};
function contrast(fg: string, bg: string): number {
  const a = luminance(hex(fg));
  const b = luminance(hex(bg));
  return Number(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2));
}

/** The `--night` token, resolved from the sheet rather than typed in twice. */
const token = (name: string): string => {
  const value = declared(":root", name, 1);
  if (!value) throw new Error(`missing token ${name}`);
  return value;
};
/** An `rgb(...)`/`rgba(...)` colour with its alpha dropped, as the census computes it. */
function rgbaOf(value: string): readonly [number, number, number] {
  const m = /^rgba?\(([^)]+)\)$/.exec(value.trim());
  if (!m) throw new Error(`not an rgb(a) colour: ${value}`);
  const [r, g, b] = m[1].split(",").slice(0, 3).map((part) => parseFloat(part.trim()));
  return [r, g, b];
}
/** The accent fill's own `background-color`, alpha-stripped to the colour the census uses. */
const accentFillRgb = (): readonly [number, number, number] =>
  rgbaOf(declared(".dock__btn--primary", "background-color", 1) ?? "");
const asHex = (rgb: readonly [number, number, number]) =>
  "#" + rgb.map((c) => c.toString(16).padStart(2, "0")).join("");

describe("UI-004 dock legibility floors (PROD-TRIAGE-004 row 3)", () => {
  /** Row 1: the price clears 12.0 px at every `A` step. */
  it("keeps .dock__cost at or above 12.0 px on all three text-scale steps", () => {
    const ladder = STEPS.map((step) => declaredPx(".dock__cost", "font-size", step));
    expect(ladder).toEqual([12, 15, 16.2]);
    for (const px of ladder) expect(px).toBeGreaterThanOrEqual(12);
    // The two declarations that make it happen, pinned as numbers and not as a lucky sum.
    expect(declared(".dock__cost", "font-size", 1)).toBe("0.8rem");
    expect(declared(".dock__cost", "font-size", 1.5)).toBe("0.72rem");
  });

  /** Row 1: the price holds AA on the accent fill it is painted on. */
  it("keeps the accent-fill price at 4.50:1 or better", () => {
    const fill = asHex(accentFillRgb());
    expect(fill).toBe("#c9713a");
    const ink = token("--night");
    expect(ink).toBe("#0b1220");
    expect(declared(".dock__btn--primary .dock__cost", "color", 1)).toBe("var(--night)");
    expect(contrast(ink, fill)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ink, fill)).toBe(5.27);
    // The two recorded failures, restated so a rollback to them is a test failure.
    expect(contrast("#ffd9a8", fill)).toBe(2.67); // the old price ink
    expect(contrast(token("--paper"), fill)).toBe(3.31); // the old face label ink
  });

  /** Row 2: the amber-fill face label holds AA too. */
  it("keeps the amber-fill face label at 4.50:1 or better", () => {
    const fill = asHex(accentFillRgb());
    expect(declared(".dock__btn--primary", "color", 1)).toBe("var(--night)");
    expect(contrast(token("--night"), fill)).toBeGreaterThanOrEqual(4.5);
    // The untouched pairs the census also prints, so the dark faces stay on the record. The
    // `--panel` fill is rgba(11, 18, 32, 0.92), whose alpha-stripped colour is exactly
    // `--night`, which is why one pair covers both dark surfaces.
    const panel = asHex(rgbaOf(token("--panel")));
    expect(panel).toBe("#0b1220");
    expect(contrast(token("--furnace"), panel)).toBe(10.89); // plain-face price
    expect(contrast(token("--paper"), panel)).toBe(17.42); // plain-face label
  });

  /** Row 3: every element named in the census scales monotonically over the `A` steps. */
  it("scales every named element monotonically across the A steps", () => {
    const census: Array<[string, string]> = [
      [".objective__primary", "objective primary"],
      [".status-line", "status line"],
      [".dock__btn", "dock face label"],
      [".dock__cost", "dock price"],
      [".resources__item", "resource chip"],
      [".icon-btn", "cluster button"],
    ];
    for (const [selector, label] of census) {
      const ladder = STEPS.map((step) => declaredPx(selector, "font-size", step));
      for (let i = 1; i < ladder.length; i += 1)
        expect(ladder[i], `${label} @ step ${STEPS[i]}`).toBeGreaterThanOrEqual(ladder[i - 1]);
      expect(ladder[2], `${label} must still grow past step 1`).toBeGreaterThan(ladder[0]);
    }
    // The two regressions by name, with their baseline triples kept as comments in numbers:
    // label 13.2 / 16.5 / 13.95 -> 13.2 / 16.5 / 16.65; price 10.8 / 13.5 / 11.25 -> the ladder above.
    expect(declaredPx(".dock__btn", "font-size", 1)).toBe(13.2);
    expect(declaredPx(".dock__btn", "font-size", 1.25)).toBe(16.5);
    expect(declaredPx(".dock__btn", "font-size", 1.5)).toBe(16.65);
  });

  /** Row 4: the tap-target floors the witnesses already pass are not paid away. */
  it("keeps the 44 px target floors the dock and cluster declare", () => {
    for (const selector of [".dock__btn", ".icon-btn", ".objective__btn"])
      expect(parseFloat(declared(selector, "min-height", 1) ?? "0"), selector).toBeGreaterThanOrEqual(44);
    expect(parseFloat(declared(".dock__btn", "min-width", 1) ?? "0")).toBeGreaterThanOrEqual(44);
  });
});
