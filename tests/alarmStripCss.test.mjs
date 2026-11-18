// #559 — CSS layout contracts behind the two runtime proofs owed for UX-06.
// jsdom performs no layout, so (like tests/noticeToast.test.mjs) the REAL
// src/styles.css is parsed from disk; the matching runtime proofs live in
// scripts/capture-ux06-559.mjs (landscape centre hit-test + pan with the
// right-docked sheet OPEN, and a real CDP single-finger swipe reaching the
// off-viewport strip controls). These guards make the load-bearing CSS
// mutations fail the suite instead of silently passing:
//   - widening the landscape sheet past 45vw covers the canvas centre;
//   - dropping touch-action:pan-x / overflow-x:auto makes the strip
//     unreachable by a real thumb (the exact #559 item-2 defect class).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, ""); // strip comments so selectors parse cleanly

// Several @media blocks share each query; select the one carrying the alarm
// rules (marker), and keep its index for the cascade-order assertion.
const mediaBlock = (query, marker) => {
  const all = [...css.matchAll(new RegExp("@media\\(" + query + "\\)\\{([\\s\\S]*?)\\n\\}", "g"))];
  const m = all.find(b => b[1].includes(marker));
  assert.ok(m, "@media(" + query + ") block containing " + marker + " exists");
  return m;
};
const rule = (block, selector) => {
  const m = block.match(new RegExp("(?:^|[}\\n])\\s*" + selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\{([^}]*)\\}"));
  assert.ok(m, selector + " rule exists in block");
  return m[1];
};

test("#559 landscape: alarm detail docks as a RIGHT sheet that cannot cover the canvas centre", () => {
  const landscape = mediaBlock("max-height:600px", ".alarm-detail");
  const detail = rule(landscape[1], ".alarm-detail");
  assert.match(detail, /position:\s*fixed/, "landscape detail is fixed, out of the strip flow");
  assert.match(detail, /left:\s*auto/, "landscape detail is NOT left-anchored");
  assert.match(detail, /right:\s*calc\(8px \+ var\(--sar\)\)/, "landscape detail docks to the right edge");
  // width <= 45vw keeps the centre column (x = 50vw) on the canvas:
  // sheet left edge = 100vw - 8 - min(320, 45vw) >= 55vw - 8 > 50vw.
  assert.match(detail, /width:\s*min\(320px,\s*45vw\)/, "landscape sheet width capped at min(320px,45vw)");
  assert.match(detail, /top:\s*calc\(84px \+ var\(--sat\)\)/, "sheet top clears the HUD");
  assert.match(detail, /bottom:\s*calc\(96px \+ var\(--sab\)\)/, "sheet bottom clears the tool dock");
  // Cascade order is load-bearing: at 667x375 BOTH media blocks match, and the
  // right sheet must win over the phone bottom sheet (which covers the centre).
  const strip = mediaBlock("max-width:770px", ".alarm-rail{order:-1");
  assert.ok(landscape.index > strip.index,
    "landscape block must follow the phone strip block so the right sheet wins the cascade");
});

test("#559 phone strip: horizontally thumb-scrollable (overflow-x:auto + touch-action:pan-x)", () => {
  const block = mediaBlock("max-width:770px", ".alarm-rail{order:-1")[1];
  const rail = rule(block, ".alarm-rail");
  assert.match(rail, /overflow-x:\s*auto/, "strip scrolls horizontally");
  assert.match(rail, /overflow-y:\s*hidden/, "strip is a single row");
  assert.match(rail, /touch-action:\s*pan-x/, "a real finger can pan the strip horizontally");
  assert.match(rail, /overscroll-behavior-x:\s*contain/, "strip swipe does not chain to the page");
});

test("#559 strip controls keep 44px touch targets once swiped into view", () => {
  const label = rule(css, ".alarm-controls label");
  assert.match(label, /min-height:\s*44px/, "warnings toggle label is a 44px target");
  const collapse = rule(css, ".alarm-collapse");
  assert.match(collapse, /min-height:\s*44px/, "collapse button is a 44px target");
});

test("#559 phone HUD cannot wrap over the alarm strip: strip-alert hidden at <=770px by a rule that WINS the cascade", () => {
  // Measured defect at 667x375 (probe before the fix): the base
  // .strip-alert{display:flex} sits later in styles.css than the phone
  // display:none overrides, so the alert button rendered, wrapped the
  // resources grid to a second 44px row, and the centred 92px HUD overflow
  // covered the alarm strip — elementFromPoint(chip centre) hit
  // resources-strip. A display:none override only works if it comes AFTER
  // the base flex rule (media queries add no specificity).
  const flexAt = css.indexOf(".strip-alert{display:flex");
  assert.ok(flexAt >= 0, "base .strip-alert display:flex rule exists");
  const blocks = [...css.matchAll(/@media\(max-width:770px\)\s*\{([\s\S]*?)\n\}/g)];
  assert.ok(blocks.some(b => b.index > flexAt && /\.strip-alert\s*\{\s*display:\s*none/.test(b[1])),
    "a <=770px .strip-alert{display:none} override must follow the base display:flex rule");
});
