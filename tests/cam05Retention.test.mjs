// CAM-05 (#341) — panel/resize camera + selection retention policy.
// Proves the transitionCamera guard is REAL (identity by reference for
// panel/resize) and NOT a no-op: the same inputs reframe under the explicit
// selection/focus/reset triggers, with exact pixel/world-unit measurements.
// Fixture: starter Freight Depot id 2 at cell (13,9), intentional pose
// yaw 115 / elevation 20 / zoom 1.37 / pan (9,-5) — deliberately NOT home.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { createGame } from "../src/simulation.js";
import {
  machineScreenRect, panelPlacement, frameSelection, projectGround,
  transitionCamera, CAMERA_TRIGGERS, HOME_CAMERA
} from "../src/inspector.js";
import { worldFootprint } from "../src/gridOccupancy.js";
import { sheetMaxHeight, dockBottomOffset, classifyViewport, nextToolMode } from "../src/dock.js";

const g = createGame();
const depot = g.buildings.find(b => b.id === 2);
assert.ok(depot && depot.x === 13 && depot.z === 9, "fixture depot must exist");
const pivot = worldFootprint(depot.type, depot.x, depot.z, depot.rot || 0).pivot;
const POSE = Object.freeze({ yaw: 115, elevation: 20, zoom: 1.37, x: 9, z: -5 });
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const TOOLS = ["select", "build", "road", "fleet", "research", "market"];

function placement(vp, preference) {
  const isPhone = vp.width <= 770;
  const panelSize = { width: isPhone ? vp.width - 12 : 356, height: sheetMaxHeight(vp) };
  return panelPlacement({
    machineRect: machineScreenRect(POSE, depot, vp), viewport: vp, panelSize, isPhone,
    preference, bottomOffset: dockBottomOffset(classifyViewport(vp))
  });
}
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b} (eps ${eps})`);
const slipPx = (camA, camB, vp) => {
  const a = projectGround(camA, pivot, vp), b = projectGround(camB, pivot, vp);
  return Math.hypot(a.x - b.x, a.y - b.y);
};

test("CAM-05 panel/resize triggers retain the EXACT camera reference (guard matrix)", () => {
  const poses = [POSE, { yaw: 45, elevation: 35.264, zoom: 1.15, x: 0, z: 0 },
    { yaw: 359, elevation: 80, zoom: 12, x: 90, z: -90 }];
  let cases = 0;
  for (const trigger of ["panel", "resize"])
    for (const vp of [DESKTOP, PHONE])
      for (const camera of poses)
        for (const obscured of [false, true])
          for (const autoFrame of [false, true]) {
            const place = placement(vp, vp === PHONE ? "auto" : "left");
            const next = transitionCamera({
              trigger, camera, building: depot, viewport: vp, focusPixel: place.focusPixel, obscured, autoFrame
            });
            assert.strictEqual(next, camera, `${trigger} must return the same reference`);
            assert.deepStrictEqual(next, camera, `${trigger} must not mutate the pose`);
            cases++;
          }
  assert.equal(cases, 2 * 2 * 3 * 2 * 2);
});

test("CAM-05 toolbar keeps selection: nextToolMode retention matrix", () => {
  for (const tool of TOOLS.filter(t => t !== "select"))
    for (const sel of [null, 2])
      assert.equal(nextToolMode(tool, sel), tool, `${tool} stays ${tool}`);
  assert.equal(nextToolMode("select", 2), "inspect", "Inspect re-shows retained selection");
  assert.equal(nextToolMode("select", null), "select");
  assert.equal(nextToolMode("inventory", 2), "inventory", "ledger chip never drops selection");
});

test("CAM-05 guard is REAL: selection trigger reframes obscured phone sheet to exact focus pixel", () => {
  const place = placement(PHONE, "auto");
  assert.equal(place.obscured, true, "phone fixture must naturally obscure the depot");
  assert.deepStrictEqual(place.focusPixel, { x: 195, y: 151.0992 });
  const next = transitionCamera({
    trigger: "selection", camera: POSE, building: depot, viewport: PHONE,
    focusPixel: place.focusPixel, obscured: true, autoFrame: true
  });
  assert.notStrictEqual(next, POSE, "explicit new-selection framing must move the camera");
  assert.equal(next.yaw, POSE.yaw); assert.equal(next.elevation, POSE.elevation); assert.equal(next.zoom, POSE.zoom);
  const pinned = projectGround(next, pivot, PHONE);
  near(pinned.x, 195, 1e-9, "pivot pinned x"); near(pinned.y, 151.0992, 1e-9, "pivot pinned y");
  near(next.x, 54.916240546731636, 1e-12, "reframed pan x");
  near(next.z, -31.90974831870926, 1e-12, "reframed pan z");
});

test("CAM-05 negative control: legacy panel-open framing slipped 271.66px phone / 107.22px desktop; approved policy slips 0", () => {
  // Phone 390x844, bottom sheet naturally obscures the depot.
  const pp = placement(PHONE, "auto");
  const legacyPhone = frameSelection(POSE, depot, PHONE, pp.focusPixel);
  near(Math.hypot(legacyPhone.x - POSE.x, legacyPhone.z - POSE.z), 53.2206322822418, 1e-9, "legacy phone pan delta (world units)");
  near(slipPx(POSE, legacyPhone, PHONE), 271.65732663398177, 1e-9, "legacy phone pivot slip (px)");
  assert.ok(slipPx(POSE, legacyPhone, PHONE) > 1, "negative control must be falsifiable");
  const keptPhone = transitionCamera({ trigger: "panel", camera: POSE, building: depot, viewport: PHONE, focusPixel: pp.focusPixel, obscured: true, autoFrame: true });
  assert.strictEqual(keptPhone, POSE);
  assert.equal(slipPx(POSE, keptPhone, PHONE), 0, "approved panel transition: exactly 0px slip");
  // Desktop 1440x900, adversarial obscured=true input (worst case for the guard).
  const dp = placement(DESKTOP, "left");
  assert.deepStrictEqual(dp.focusPixel, { x: 898, y: 405 });
  const legacyDesk = frameSelection(POSE, depot, DESKTOP, dp.focusPixel);
  near(legacyDesk.x, 17.867683821160533, 1e-12, "legacy desktop pan x");
  near(legacyDesk.z, -1.8907367334617504, 1e-12, "legacy desktop pan z");
  near(Math.hypot(legacyDesk.x - POSE.x, legacyDesk.z - POSE.z), 9.396985389619184, 1e-9, "legacy desktop pan delta (world units)");
  near(slipPx(POSE, legacyDesk, DESKTOP), 107.21827875948571, 1e-9, "legacy desktop pivot slip (px)");
  const keptDesk = transitionCamera({ trigger: "resize", camera: POSE, building: depot, viewport: DESKTOP, focusPixel: dp.focusPixel, obscured: true, autoFrame: true });
  assert.strictEqual(keptDesk, POSE);
  assert.equal(slipPx(POSE, keptDesk, DESKTOP), 0, "approved resize transition: exactly 0px slip");
});

test("CAM-05 explicit Focus button never dies: focus trigger moves even with autoFrame=false", () => {
  const place = placement(PHONE, "auto");
  const next = transitionCamera({
    trigger: "focus", camera: POSE, building: depot, viewport: PHONE,
    focusPixel: place.focusPixel, obscured: false, autoFrame: false
  });
  assert.notStrictEqual(next, POSE);
  const pinned = projectGround(next, pivot, PHONE);
  near(pinned.x, place.focusPixel.x, 1e-9, "focus pin x"); near(pinned.y, place.focusPixel.y, 1e-9, "focus pin y");
  // UX-04 opt-out respected for implicit triggers only.
  for (const trigger of ["selection", "settings"]) {
    assert.strictEqual(transitionCamera({ trigger, camera: POSE, building: depot, viewport: PHONE, focusPixel: place.focusPixel, obscured: true, autoFrame: false }), POSE, `${trigger} honours autoFrame=false`);
    assert.strictEqual(transitionCamera({ trigger, camera: POSE, building: depot, viewport: PHONE, focusPixel: place.focusPixel, obscured: false, autoFrame: true }), POSE, `${trigger} honours unobscured machine`);
  }
});

test("CAM-05 Home/reset is the ONLY refit: exact isometric home, clamped by normalizeCamera", () => {
  const deskHome = transitionCamera({ trigger: "reset", camera: POSE, home: { yaw: 45, elevation: 35.264, zoom: 1.15, x: 0, z: 0 } });
  assert.deepStrictEqual(deskHome, { yaw: 45, elevation: 35.264, zoom: 1.15, x: 0, z: 0 });
  const phoneHome = transitionCamera({ trigger: "reset", camera: POSE, home: { yaw: 45, elevation: 35.264, zoom: 1, x: 0, z: 0 } });
  assert.deepStrictEqual(phoneHome, { yaw: 45, elevation: 35.264, zoom: 1, x: 0, z: 0 });
  assert.notDeepStrictEqual(deskHome, POSE, "reset must actually refit (negative case)");
  assert.ok(slipPx(POSE, deskHome, DESKTOP) > 1, "home refit moves the pivot measurably");
  // Default home when caller omits one, and envelope clamping.
  assert.deepStrictEqual(transitionCamera({ trigger: "reset", camera: POSE }), { ...HOME_CAMERA });
  assert.deepStrictEqual(
    transitionCamera({ trigger: "reset", camera: POSE, home: { yaw: 405, elevation: 5, zoom: 99, x: 500, z: -500 } }),
    { yaw: 45, elevation: 20, zoom: 12, x: 90, z: -90 });
  assert.deepEqual([...CAMERA_TRIGGERS], ["selection", "panel", "resize", "focus", "reset", "settings"]);
});

test("#307 camera invariants: world.js applyCamera/stampCamera method hashes unchanged", () => {
  const src = fs.readFileSync(new URL("../src/world.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const method = name => {
    const start = src.indexOf(name + "(){"); assert.ok(start >= 0, name + " missing");
    let depth = 0, j = src.indexOf("{", start);
    for (; j < src.length; j++) { if (src[j] === "{") depth++; else if (src[j] === "}") { depth--; if (depth === 0) { j++; break; } } }
    return src.slice(start, j);
  };
  const hash = name => crypto.createHash("sha256").update(" " + method(name)).digest("hex").slice(0, 16);
  assert.equal(hash("applyCamera"), "f3afa5479a66b97e");
  assert.equal(hash("stampCamera"), "691b3c0a3480e97b");
});

test("CAM-05 App.jsx wiring contract: retention paths, no hidden refits", () => {
  const src = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const choose = /const choose=useCallback\(id=>\{([\s\S]*?)\},\[\]\);/.exec(src);
  assert.ok(choose, "choose() callback found");
  assert.ok(choose[1].includes("nextToolMode(id,selectedRef.current)"), "toolbar routes through nextToolMode");
  assert.ok(!choose[1].includes("setSelectedId"), "toolbar must never drop selection");
  assert.ok(src.includes("world.resize();updatePlacement(false);"), "resize uses the panel (retain) trigger");
  assert.ok(src.includes("updatePlacement(isNewSelection)"), "auto-frame only on NEW selection");
  assert.ok(src.includes('trigger:"reset"') && /resetCam[\s\S]{0,700}applyCamera/.test(src), "Home refits via public applyCamera");
  assert.ok(/e\.key==="Escape"[\s\S]{0,600}setSelectedId\(null\);setMode\("select"\)/.test(src), "Escape is the explicit deselect");
  assert.ok(!src.includes("frameSelection"), "App delegates all framing to the transitionCamera policy");
  assert.ok(!/addEventListener\("pointer/.test(src), "App owns no pointer listeners (cameraInput lease)");
});