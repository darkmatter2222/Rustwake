// #568 — phone top band must not occlude the PLAYER machine at (10,10).
// Regression from the #564 cascade: after the first selection CAM-05 auto-frames
// the machine pivot to the clear-zone focusPixel (y = max(64, sheet.y*0.42),
// ~136..164 at 390x844 whenever the bottom sheet obscures the home pose). The
// old phone band — interactive resources-strip down to y~121 and the alarm rail
// at y112..156 — covered EVERY aim height (py91..151) of that framed pose, so
// the capture-dismantle.mjs line-350 re-selection after the fleet cancel died
// (docs/evidence/568-top-hud/baseline-a3-run.txt names the occluders).
//
// Fix contract (CSS-only, phone <=770px, src/styles.css):
//  1. .hud-top compacts to grid-template-rows:30px 44px (brand 30 + strip 44,
//     padding 6 + gap 4 => declared strip-row bottom 84). All six resource
//     chips + the ledger button stay live; nothing is hidden.
//  2. .left-rail moves to top:156px (safe-area mirror calc(156px + var(--sat))),
//     putting the 44px alarm rail at y156..200 and camera controls at y206..250
//     — BELOW the framed-machine aim band, ABOVE the starter band (y~256..316).
//  3. The alarm rail is NOT suppressed, hidden or de-duplicated (#566 owns
//     whether a warning should exist; a genuinely uncovered deficit must still
//     raise WARNING). The coordinate chip keeps #564 order:1 + pointer-events:none.
//
// jsdom performs no layout, so the CSS contract is parsed from the REAL
// src/styles.css on disk (phoneHudOcclusion.test.mjs pattern) and the geometry
// tests run the REAL src/inspector.js placement/framing/projection math. The
// browser elementFromPoint + real-touch-tap proof lives in
// scripts/probe-568-topband.mjs and the UNMODIFIED scripts/capture-dismantle.mjs
// (PASS_NUMERIC_ONLY evidence; phone EMULATED).
//
// MUTATION SENSITIVITY: on pre-fix styles.css (grid-template-rows:38px 48px,
// .left-rail top:112px) tests 1-2 FAIL; test 6 is the standing negative control
// proving the SAME framed aim was inside the OLD alarm band y112..156.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { panelPlacement, machineScreenRect, transitionCamera, projectGround, HOME_CAMERA } from "../src/inspector.js";
import { worldFootprint } from "../src/gridOccupancy.js";

const css = readFileSync(fileURLToPath(new URL("../src/styles.css", import.meta.url)), "utf8");

test("CSS contract: phone .hud-top compacts to 30px+44px rows (declared strip-row bottom 84)", () => {
  assert.match(css, /grid-template-rows:30px 44px/);
  assert.doesNotMatch(css, /grid-template-rows:38px 48px/);
});

test("CSS contract: phone .left-rail top:156px with safe-area mirror", () => {
  assert.match(css, /\.left-rail \{top:156px;gap:6px\}/);
  assert.match(css, /\.left-rail\{top:calc\(156px \+ var\(--sat\)\)/);
  assert.doesNotMatch(css, /\.left-rail \{top:112px/);
  assert.doesNotMatch(css, /\.left-rail\{top:calc\(112px \+ var\(--sat\)\)/);
});

test("CSS contract: nothing in the top band is suppressed to buy canvas room", () => {
  // All six headline chips + ledger button stay in the phone strip grid.
  assert.match(css, /grid-template-columns:repeat\(6,minmax\(0,1fr\)\) 44px/);
  // No rule hides the alarm rail itself (scrollbar cosmetics excepted) or the
  // resource chips — #566 owns whether a warning should exist, not this fix.
  assert.doesNotMatch(css, /\.alarm-rail\s*\{[^}]*display:\s*none/);
  assert.match(css, /\.alarm-rail\{display:flex/);
  assert.doesNotMatch(css, /\.resource\s*\{[^}]*display:\s*none/);
  // #564 coordinate-chip transparency contract survives.
  assert.match(css, /\.coordinate-chip[^{}]*\{[^}]*pointer-events:\s*none/);
});

// Declared phone geometry from the CSS contract above (390x844, sat=0):
// strip-row bottom = 6 padding + 30 brand + 4 gap + 44 strip = 84;
// alarm rail top = .left-rail top 156 (order:-1 first child).
const STRIP_ROW_BOTTOM = 84, ALARM_TOP = 156, CONTROLS_BOTTOM = 250;
const viewport = { width: 390, height: 844 };
const b = { type: "salvager", x: 10, z: 10, rot: 0 };
const fp = worldFootprint(b.type, b.x, b.z, 0);
const homeRect = machineScreenRect(HOME_CAMERA, b, viewport);
const aimY = (cam, h) => projectGround(cam, { x: fp.pivot.x, y: h, z: fp.pivot.z }, viewport).y;

test("geometry: every sheet height that obscures the home pose frames the h1.2 aim INTO the 84..156 clear gap", () => {
  let obscuredCases = 0;
  for (const ph of [340, 360, 388]) for (const bottomOffset of [90, 133]) {
    const place = panelPlacement({ machineRect: homeRect, viewport, panelSize: { width: 378, height: ph }, isPhone: true, bottomOffset });
    if (!place.obscured) continue;
    obscuredCases++;
    const framed = transitionCamera({ trigger: "selection", camera: HOME_CAMERA, building: b, viewport, focusPixel: place.focusPixel, obscured: place.obscured, autoFrame: true });
    assert.notEqual(framed, HOME_CAMERA, "obscured selection must reframe (CAM-05)");
    const y = aimY(framed, 1.2);
    assert.ok(y > STRIP_ROW_BOTTOM && y < ALARM_TOP,
      `ph=${ph} bo=${bottomOffset}: framed h1.2 aim y=${y.toFixed(1)} outside clear gap (${STRIP_ROW_BOTTOM},${ALARM_TOP})`);
  }
  assert.ok(obscuredCases >= 3, "expected the tall-panel cases to obscure the home pose");
});

test("geometry: unobscured selection keeps the home pose and the home aim stays below the rail", () => {
  const place = panelPlacement({ machineRect: homeRect, viewport, panelSize: { width: 378, height: 200 }, isPhone: true, bottomOffset: 133 });
  assert.equal(place.obscured, false);
  const kept = transitionCamera({ trigger: "selection", camera: HOME_CAMERA, building: b, viewport, focusPixel: place.focusPixel, obscured: false, autoFrame: true });
  assert.equal(kept, HOME_CAMERA, "unobscured selection must retain the exact pose");
  for (const h of [1.2, 0, 3, 5, 7]) assert.ok(aimY(HOME_CAMERA, h) > CONTROLS_BOTTOM, `home h${h} aim under the rail band`);
});

test("negative control: the SAME framed aim sat inside the OLD alarm band y112..156 (#568 regression)", () => {
  // Measured pre-fix phone geometry (baseline bandBoxes): alarm rail 112..156,
  // resources-strip 29..121 — a continuous interactive cover over y29..156.
  const OLD_ALARM_TOP = 112, OLD_ALARM_BOTTOM = 156;
  let checked = 0;
  for (const ph of [340, 360, 388]) for (const bottomOffset of [90, 133]) {
    const place = panelPlacement({ machineRect: homeRect, viewport, panelSize: { width: 378, height: ph }, isPhone: true, bottomOffset });
    if (!place.obscured) continue;
    const framed = transitionCamera({ trigger: "selection", camera: HOME_CAMERA, building: b, viewport, focusPixel: place.focusPixel, obscured: true, autoFrame: true });
    const y = aimY(framed, 1.2);
    assert.ok(y >= OLD_ALARM_TOP && y <= OLD_ALARM_BOTTOM, `framed aim y=${y.toFixed(1)} should have been occluded by the old band`);
    checked++;
  }
  assert.ok(checked >= 3);
});
