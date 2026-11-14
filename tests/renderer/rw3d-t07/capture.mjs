// RW3D T07 (#134) headless captures + numeric pixel sanity. Reproducible:
// node tests/renderer/rw3d-t07/capture.mjs (seed/state rw3d-t07-capture-v1).
// ACTUAL renders of the production drawScene composite (three.js world blit +
// 2D information overlay) from the deep-yard.modern fixture. Non-vision agent:
// numeric checks only; capable visual inspection remains PENDING (G1 #151).
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  startDevServer, stopDevServer, launchBrowser, headSha,
  evidenceDir, PREFIX, HARNESS_URL,
} from "./lib.mjs";

const checks = [];
function check(name, expected, actual, pass) { checks.push({ name, expected, actual, pass }); }

const server = await startDevServer();
const { browser, executablePath, probeRenderer, swiftshaderForced } = await launchBrowser();
let exitCode = 0;
const shots = {};
const stats = {};
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto(HARNESS_URL, { waitUntil: "load" });
  await page.waitForFunction("window.__RW3D__ && window.__RW3D__.ready === true");

  async function shot(name) {
    await page.evaluate(() => window.__RW3D__.render());
    shots[name] = await page.screenshot();
    stats[name] = await page.evaluate(() => window.__RW3D__.pixelStats());
    writeFileSync(resolve(evidenceDir, `${PREFIX}-${name}.png`), shots[name]);
  }

  // 1. Open: fitted top-down (legacy default orientation).
  await shot("open");

  // 2. Orbit: yaw 45, elev 35.264, zoomed in so the yard exceeds the view.
  await page.evaluate(() => { window.__RW3D__.orbitTo(45, 35.264); window.__RW3D__.setCamera({ scale: 3 }); });
  await shot("orbit");

  // 3. Selection: real click on a machine centre under orbit (raycast path).
  const ids = await page.evaluate(() => window.__RW3D__.machineIds());
  const target = ids[0];
  const p = await page.evaluate((mid) => window.__RW3D__.projectMachine(mid), target);
  await page.mouse.click(p.x, p.y);
  const selection = await page.evaluate(() => ({ selected: window.__RW3D__.selected(), lastTap: window.__RW3D__.lastTap() }));
  await shot("selected");

  // 4. Drag safety with REAL pointer events: a drag must not change selection.
  const before = await page.evaluate(() => window.__RW3D__.selected());
  await page.mouse.move(700, 450);
  await page.mouse.down();
  await page.mouse.move(760, 500, { steps: 4 });
  await page.mouse.move(700, 450, { steps: 4 });
  await page.mouse.up();
  const afterDrag = await page.evaluate(() => window.__RW3D__.selected());

  // 5. Quarter turn from yaw 45 -> 135.
  const quarter = await page.evaluate(() => window.__RW3D__.quarter(1));
  await shot("quarter");

  // 6. Inspector resize: narrower view + measured band, player intent survives.
  const resized = await page.evaluate(() => window.__RW3D__.resize(1000, 900, { top: 64, bottom: 96 }, true));
  await shot("inspector-resize");

  // 7. Hidden-tab pause + reduced-motion discrete stages (numeric, no shot).
  const hidden = await page.evaluate(() => window.__RW3D__.hiddenPause());
  const motion = await page.evaluate(() => window.__RW3D__.reducedMotionPair());

  // 8. Context loss: banner + 2D fallback, save bytes unchanged; then restore.
  const saveBefore = await page.evaluate(() => window.__RW3D__.saveText());
  const lostStatus = await page.evaluate(() => window.__RW3D__.loseContext());
  await shot("context-lost");
  const saveAfter = await page.evaluate(() => window.__RW3D__.saveText());
  const restoredStatus = await page.evaluate(() => window.__RW3D__.restoreContext());
  await shot("restored");

  // 9. Phone-size desktop emulation ONLY (390x844 @2x). Not phone evidence.
  const phoneContext = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  const phonePage = await phoneContext.newPage();
  await phonePage.goto(HARNESS_URL, { waitUntil: "load" });
  await phonePage.waitForFunction("window.__RW3D__ && window.__RW3D__.ready === true");
  await phonePage.evaluate(() => window.__RW3D__.render());
  shots.phoneEmulation = await phonePage.screenshot();
  stats.phoneEmulation = await phonePage.evaluate(() => window.__RW3D__.pixelStats());
  writeFileSync(resolve(evidenceDir, `${PREFIX}-phone-emulation.png`), shots.phoneEmulation);
  await phoneContext.close();

  const notBlank = (s) => s.uniqueColors > 200 && s.luminanceStddev > 10;
  check("no page errors", 0, pageErrors.length, pageErrors.length === 0);
  check("open dimensions", "1440x900", `${stats.open.width}x${stats.open.height}`, stats.open.width === 1440 && stats.open.height === 900);
  check("open not blank", "colors>200, stddev>10", `${stats.open.uniqueColors}, ${stats.open.luminanceStddev}`, notBlank(stats.open));
  check("orbit not blank", "colors>200, stddev>10", `${stats.orbit.uniqueColors}, ${stats.orbit.luminanceStddev}`, notBlank(stats.orbit));
  await page.evaluate(() => window.__RW3D__.reset());
  await page.evaluate(() => window.__RW3D__.render());
  await page.evaluate(() => window.__RW3D__.snapshot());
  await page.evaluate(() => { window.__RW3D__.orbitTo(45, 35.264); window.__RW3D__.setCamera({ scale: 3 }); window.__RW3D__.render(); });
  const orbitDiff = await page.evaluate(() => window.__RW3D__.diffSnapshot());
  check("orbit vs top-down pixel diff > 0.005", ">0.005", orbitDiff, orbitDiff > 0.005);
  check("raycast click selects the aimed machine", target, selection.selected, selection.selected === target);
  check("selected shot has selection ink (select pixels > 50)", ">50", stats.selected.selectPixels, stats.selected.selectPixels > 50);
  check("real drag round-trip keeps selection", before, afterDrag, before === afterDrag);
  check("quarter turn yaw 45 -> 135", 135, quarter.yaw, quarter.yaw === 135);
  check("quarter shot not blank", "colors>200, stddev>10", `${stats.quarter.uniqueColors}, ${stats.quarter.luminanceStddev}`, notBlank(stats.quarter));
  check("inspector resize keeps intent (scale 3 survives)", 3, resized.scale, resized.scale === 3);
  check("inspector shot dimensions", "1000x900", `${stats["inspector-resize"].width}x${stats["inspector-resize"].height}`, stats["inspector-resize"].width === 1000 && stats["inspector-resize"].height === 900);
  check("hidden tab paints nothing (diff = 0)", 0, hidden.whileHidden, hidden.whileHidden === 0);
  check("reduced motion: two phases paint identically (diff = 0)", 0, motion.reducedDiff, motion.reducedDiff === 0);
  check("full motion: phases differ (diff > 0)", ">0", motion.motionDiff, motion.motionDiff > 0);
  check("context loss reported", "lost", lostStatus, lostStatus === "lost");
  check("save bytes unchanged across context loss", "identical", saveBefore === saveAfter ? "identical" : "CHANGED", saveBefore === saveAfter);
  check("context-lost shot not blank (2D fallback + banner)", "colors>200, stddev>10", `${stats["context-lost"].uniqueColors}, ${stats["context-lost"].luminanceStddev}`, notBlank(stats["context-lost"]));
  check("context restored", "ready", restoredStatus, restoredStatus === "ready");
  check("restored shot not blank", "colors>200, stddev>10", `${stats.restored.uniqueColors}, ${stats.restored.luminanceStddev}`, notBlank(stats.restored));
  check("phone-emulation dimensions (390x844 @2x)", "780x1688", `${stats.phoneEmulation.width}x${stats.phoneEmulation.height}`, stats.phoneEmulation.width === 780 && stats.phoneEmulation.height === 1688);
  check("phone-emulation not blank", "colors>200, stddev>10", `${stats.phoneEmulation.uniqueColors}, ${stats.phoneEmulation.luminanceStddev}`, notBlank(stats.phoneEmulation));

  const report = {
    meta: {
      issue: 134, role: "developer", seed: "rw3d-t07-capture-v1", sha: headSha(),
      command: "node tests/renderer/rw3d-t07/capture.mjs",
      timestamp: new Date().toISOString(),
      browser: { executablePath, probeRenderer, swiftshaderForced },
      selection, dragSafety: { before, afterDrag }, quarter, resized, hidden, motion,
      contextLoss: { lostStatus, restoredStatus, saveUnchanged: saveBefore === saveAfter },
      note: "Numeric pixel sanity only. Capable visual inspection PENDING (mandatory at G1 #151). phone-emulation.png is desktop emulation, NOT real phone evidence.",
    },
    images: stats,
    orbitVsTopDownDiffFraction: orbitDiff,
    checks,
  };
  const out = resolve(evidenceDir, `${PREFIX}-pixels.json`);
  writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
  console.log(`pixel report written: ${out}`);
  for (const c of checks) console.log(`[${c.pass ? "PASS" : "FAIL"}] ${c.name}: expected ${c.expected}, actual ${c.actual}`);
  exitCode = checks.every((c) => c.pass) ? 0 : 1;
} catch (err) {
  console.error("capture failed:", err);
  exitCode = 1;
} finally {
  await browser.close();
  stopDevServer(server);
}
process.exit(exitCode);