/* Issue #151 (U04) — keyboard-only / screen-reader entity list walkthrough.
   AGENT run (headless Chrome, no vision): real key events, real focus, DOM /
   geometry / computed-style checks only. Serves THIS branch's BUILT app via
   `vite preview --strictPort` on 127.0.0.1 (never the live deployment).

   Proves the full U04 loop with keyboard events ONLY (Tab / Enter / Escape /
   digits — no mouse, no element.click(), no programmatic .focus()):
     gate Continue -> key 1 catalog -> select + Place -> dock Build ->
     key 6 entity list -> Tab/Enter building row -> inspector -> Upgrade ->
     Escape back to the list (level worded in the row) -> key 5 trade Sell ->
     Settings -> Yard record -> Backup -> Download (real save artifact) ->
     Escape unwind with focus restored to the opener -> Map toolbar open /
     Escape focus return -> Tab cycle wrap (no trap) -> event-driven status.

   Plus a geometry census: 8 viewports x text-scale 1 & 2 with the Map open and
   the inspector stacked — 44 px row floor, one declared panel scroller, zero
   document scroll, worded accessible names, zero console errors.

   Outputs: docs/evidence/151-keyboard-walkthrough.json (+ .md summary) and
   screenshots under docs/evidence/151-keyboard-walkthrough/. Exit 0 only when
   every step and census cell passes. Run AFTER `npm run build`:
     npx tsx tests/ui/keyboard-walkthrough-151.evidence.mjs

   This proves keyboard operability and focus, NOT visual fidelity (the sponsor
   judges visuals at the live URL; pass 3 captures renders). */
import { chromium } from "playwright-core";
import { spawn, execSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodeSave, SAVE_KEY, DEFAULT_SETTINGS } from "../../src/game/persistence/save.ts";
import { createInitialState } from "../../src/game/simulation/types.ts";
import { applyCommand } from "../../src/game/simulation/commands.ts";
import { advance } from "../../src/game/simulation/engine.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = Number(process.env.RW151_PORT ?? 4195);
const OUTDIR = path.join(root, "docs/evidence");
const SHOTDIR = path.join(OUTDIR, "151-keyboard-walkthrough");
mkdirSync(SHOTDIR, { recursive: true });

if (!existsSync(path.join(root, "dist/index.html"))) {
  console.error("dist/index.html missing — run `npm run build` first.");
  process.exit(2);
}

let buildSha = process.env.RW151_SHA ?? "";
if (!buildSha) {
  try {
    buildSha = execSync("git rev-parse HEAD", {
      cwd: root,
      env: { ...process.env, MSYS_NO_PATHCONV: "1", NODE_EXTRA_CA_CERTS: "C:/Users/ryans/node-extra-ca.pem" },
    }).toString().trim();
  } catch { buildSha = "unknown"; }
}

/**
 * The seeded yard: one running sorter (input+output links), a repaired drone
 * with deliveries, tutorial complete, the export contract claimed (trade desk
 * open) and funds for the keyboard build + upgrade. Stock is topped up AFTER
 * the advance so the keyboard build (30 scrap + 4 steel) and a sell tranche are
 * deterministic regardless of tick timing. The loop still BUILDS, INSPECTS,
 * UPGRADES, TRADES and SAVES through real key events — the seed only funds them.
 */
function buildSeed(textScale) {
  const sim = createInitialState();
  applyCommand(sim, { id: "w-repair", type: "drone.repair" });
  applyCommand(sim, { id: "w-build", type: "machine.build", blueprint: "sorter", tile: 9 });
  applyCommand(sim, { id: "w-route", type: "route.connect", from: 0, to: sim.machines[0].id, filter: "scrap" });
  advance(sim, 1200);
  sim.tutorial = 9;
  sim.exportClaimed = true;
  sim.credits = 240;
  const topUp = (resource, target) => {
    const have = sim.store[resource] ?? 0;
    if (have < target) { sim.store[resource] = target; sim.storeUnits += target - have; }
  };
  topUp("scrap", 90);
  topUp("steel", 8);
  topUp("ferrous", 20);
  return encodeSave(sim, Date.now(), { ...DEFAULT_SETTINGS, muted: true, textScale });
}

const chromeCandidates = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].filter(Boolean);
const executablePath = chromeCandidates.find((p) => existsSync(p));
if (!executablePath) { console.error("No Chrome/Edge executable found (set CHROME_PATH)."); process.exit(2); }

const server = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "preview", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], { cwd: root, stdio: "ignore" });
const url = `http://127.0.0.1:${PORT}/`;
const deadline = Date.now() + 60000;
for (;;) { try { const res = await fetch(url); if (res.ok) break; } catch {} if (Date.now() > deadline) { server.kill(); throw new Error("preview did not start"); } await new Promise((r) => setTimeout(r, 400)); }

const browser = await chromium.launch({ executablePath, headless: true, args: ["--autoplay-policy=user-gesture-required"] });

// ---- step recording -------------------------------------------------------
const results = {
  issue: 151,
  acceptance: "U04 — keyboard-only / screen-reader entity list: build, inspect, upgrade, trade, save, close; focus returns; status not color-only",
  buildSha,
  port: PORT,
  url,
  generatedAt: new Date().toISOString(),
  method: "headless Chrome, real key events only (Tab/Enter/Escape/digits); no mouse, no element.click(), no programmatic focus",
  steps: [],
  census: {},
  defects: [],
  limitations: [
    "Proves keyboard operability and focus, NOT visual fidelity (sponsor judges visuals at the live URL).",
    "Digit-key entry records the body as the opener (existing PanelHost behavior); the toolbar-button path proves real focus return. Documented in tests/ui/entity-list-151.test.tsx.",
    "Drones have no fixed engine cell (they fly store <-> machine); their rows focus the dock cell they operate from.",
  ],
};
let current = null;
const allKeys = [];

function check(name, pass, detail = null) {
  if (!current) throw new Error("check outside step");
  current.checks.push({ name, pass: !!pass, detail });
  if (!pass) results.defects.push({ step: current.name, kind: "step-check", name, detail });
}

async function activeDesc(page) {
  return page.evaluate(() => {
    const a = document.activeElement;
    if (!a || a === document.body) return { tag: "body", cls: "", label: "", slot: null, entity: null, entityId: null, id: "" };
    return {
      tag: a.tagName.toLowerCase(),
      cls: (a.className || "").toString().slice(0, 60),
      label: (a.getAttribute("aria-label") || a.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80),
      slot: a.getAttribute("data-slot"),
      entity: a.getAttribute("data-entity"),
      entityId: a.getAttribute("data-entity-id"),
      id: a.id || "",
    };
  });
}

/** Press a real key and log it into the current step + the global sequence. */
async function press(page, key) {
  allKeys.push({ step: current ? current.name : "(outside)", key });
  if (current) current.keys.push(key);
  await page.keyboard.press(key);
  await page.waitForTimeout(120);
}

/**
 * Reach a control by Tab alone (real key events). `spec` matches the active
 * element descriptor: cls substring, label prefix, data-slot / data-entity /
 * data-entity-id, id, inActions (closest .panel__actions), or rowLabel (the
 * <dt> of the closest .panel__row). Returns the descriptor found and the
 * number of Tab presses it took.
 */
async function tabTo(page, spec, max = 120) {
  for (let i = 0; i < max; i += 1) {
    const d = await activeDesc(page);
    const ok =
      (spec.cls === undefined || d.cls.includes(spec.cls)) &&
      (spec.labelPrefix === undefined || d.label.startsWith(spec.labelPrefix)) &&
      (spec.slot === undefined || d.slot === spec.slot) &&
      (spec.entity === undefined || d.entity === spec.entity) &&
      (spec.entityId === undefined || d.entityId === String(spec.entityId)) &&
      (spec.id === undefined || d.id === spec.id) &&
      (spec.inActions === undefined || (await page.evaluate(() => !!document.activeElement.closest(".panel__actions")))) &&
      (spec.notInUpgradeCards === undefined || (await page.evaluate(() => !document.activeElement.closest(".upgrade-cards")))) &&
      (spec.rowLabel === undefined || (await page.evaluate((rl) => (document.activeElement.closest(".panel__row")?.querySelector("dt")?.textContent ?? "").trim().startsWith(rl), spec.rowLabel)));
    if (ok && d.tag !== "body") return { found: true, presses: i, desc: d };
    await press(page, "Tab");
  }
  return { found: false, presses: max, desc: await activeDesc(page) };
}

async function shot(page, name) {
  const file = path.join(SHOTDIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return path.relative(root, file).replace(/\\/g, "/");
}

async function step(page, name, fn) {
  current = { name, keys: [], focusBefore: await activeDesc(page), checks: [], screenshots: [] };
  results.steps.push(current);
  try {
    await fn();
  } catch (e) {
    check("step-completed", false, String(e).slice(0, 300));
  }
  current.focusAfter = await activeDesc(page);
  current.pass = current.checks.every((c) => c.pass);
  console.log(`${current.pass ? "PASS" : "FAIL"} ${name} keys=[${current.keys.join(",")}]`);
  current = null;
}

const readNumber = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const m = (el.textContent || "").replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}, sel);

/** Boot: seed localStorage, Continue from the gate with Tab+Enter only. */
async function boot(page, textScale) {
  // "load" + the gate selector is the real readiness signal; networkidle is
  // flaky under parallel contexts (the sim keeps timers alive after boot).
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForSelector(".gate__btn", { timeout: 20000 });
}

async function continueFromGate(page) {
  const reach = await tabTo(page, { cls: "gate__btn" }, 20);
  check("gate-continue-reachable-by-tab", reach.found, reach.desc);
  await press(page, "Enter");
  await page.waitForSelector(".toolbar", { timeout: 20000 });
  // A return report may layer over the yard after an absence; Escape unwinds it.
  if (await page.evaluate(() => !!document.querySelector(".panel--report"))) {
    await press(page, "Escape");
    await page.waitForTimeout(250);
  }
}

// ---- the full keyboard-only loop (desktop class viewports) ----------------
async function keyboardLoop(page, vpName) {
  const S = (name) => `${vpName}-${name}`;

  await step(page, "gate-continue", async () => {
    await continueFromGate(page);
    check("toolbar-visible", await page.evaluate(() => !!document.querySelector(".toolbar")));
    check("six-destinations", await page.evaluate(() => document.querySelectorAll(".toolbar__btn").length === 6));
    current.screenshots.push(await shot(page, S("01-yard")));
  });

  let builtId = null;
  await step(page, "build-catalog-place", async () => {
    await press(page, "1");
    await page.waitForSelector('.catalog[role="dialog"]', { timeout: 8000 });
    check("catalog-opened-by-digit-1", true);
    const card = await tabTo(page, { cls: "catalog__card", labelPrefix: "Scrap sorter" });
    check("sorter-card-reachable-by-tab", card.found, card.desc);
    await press(page, "Enter"); // select the blueprint
    check("sorter-card-selected", await page.evaluate(() => document.querySelector('.catalog__card[data-blueprint="sorter"]')?.getAttribute("aria-pressed") === "true"));
    const place = await tabTo(page, { cls: "catalog__place" });
    check("place-face-reachable-by-tab", place.found, place.desc);
    check("place-enabled", await page.evaluate(() => !document.querySelector(".catalog__place").disabled));
    current.screenshots.push(await shot(page, S("02-catalog")));
    await press(page, "Enter");
    await page.waitForSelector(".dock__btn--primary", { timeout: 8000 });
    check("catalog-closed-ghost-armed", await page.evaluate(() => !document.querySelector(".catalog") && !!document.querySelector(".dock__btn--primary")));
  });

  await step(page, "build-commit", async () => {
    const build = await tabTo(page, { cls: "dock__btn--primary", labelPrefix: "Build Scrap sorter" });
    check("build-face-reachable-by-tab", build.found, build.desc);
    current.screenshots.push(await shot(page, S("03-placement")));
    await press(page, "Enter");
    await page.waitForTimeout(400);
    check("build-face-committed", await page.evaluate(() => {
      const b = document.querySelector(".dock__btn--primary");
      return !b || !(b.textContent || "").startsWith("Build Scrap sorter");
    }));
  });

  await step(page, "map-entity-list", async () => {
    await press(page, "6");
    await page.waitForSelector(".entity-list", { timeout: 8000 });
    const rows = await page.evaluate(() => [...document.querySelectorAll(".entity-list__row")].map((r) => ({
      kind: r.getAttribute("data-entity"),
      id: r.getAttribute("data-entity-id"),
      name: r.getAttribute("aria-label"),
      text: (r.textContent || "").trim().replace(/\s+/g, " "),
      tag: r.tagName.toLowerCase(),
      h: Math.round(r.getBoundingClientRect().height),
    })));
    current.rows = rows;
    check("two-buildings-enumerated", rows.filter((r) => r.kind === "building").length === 2, rows.map((r) => r.kind));
    check("buildings-before-units", rows.findIndex((r) => r.kind !== "building") > rows.map((r) => r.kind).lastIndexOf("building"), rows.map((r) => r.kind));
    check("drone-enumerated", rows.some((r) => r.kind === "drone"));
    check("every-row-a-named-button", rows.every((r) => r.tag === "button" && r.name && r.name.length > 10), rows.map((r) => r.name));
    check("status-worded-not-color", rows.every((r) => /(Ready|Working|Needs input|Cargo full|Power limited|Paused|Idle|In flight|Broken|Deliveries)/.test(r.name)), rows.map((r) => r.name));
    check("rows-44px-floor", rows.every((r) => r.h >= 44), rows.map((r) => r.h));
    builtId = rows.filter((r) => r.kind === "building").pop().id;
    current.screenshots.push(await shot(page, S("04-entity-list")));
  });

  await step(page, "inspect-building", async () => {
    const row = await tabTo(page, { cls: "entity-list__row", entity: "building", entityId: builtId });
    check("building-row-reachable-by-tab", row.found, row.desc);
    current.inspectedRow = row.desc;
    await press(page, "Enter");
    await page.waitForSelector('[role="group"][aria-label$="details"]', { timeout: 8000 });
    check("inspector-opened", true);
    check("stack-depth-2", await page.evaluate(() => document.querySelector(".shell-host")?.getAttribute("data-depth") === "2"));
    check("back-face-present", await page.evaluate(() => !!document.querySelector(".shell-host__back")));
    check("focus-entered-host", await page.evaluate(() => !!document.activeElement.closest(".shell-host")));
    current.screenshots.push(await shot(page, S("05-inspector")));
  });

  await step(page, "upgrade", async () => {
    const creditsBefore = await readNumber(page, ".resources__item--credits strong");
    const up = await tabTo(page, { cls: "icon-btn", labelPrefix: "Upgrade", inActions: true, notInUpgradeCards: true });
    check("upgrade-face-reachable-by-tab", up.found, up.desc);
    const cost = Number((up.desc.label.match(/Upgrade · (\d+)/) || [])[1]);
    await press(page, "Enter");
    await page.waitForTimeout(350);
    const creditsAfter = await readNumber(page, ".resources__item--credits strong");
    check("upgrade-charged-exact-cost", creditsBefore !== null && creditsAfter === creditsBefore - cost, { creditsBefore, creditsAfter, cost });
    current.screenshots.push(await shot(page, S("06-upgraded")));
  });

  await step(page, "escape-to-list-level-worded", async () => {
    await press(page, "Escape");
    await page.waitForSelector(".entity-list", { timeout: 8000 });
    check("stack-depth-1", await page.evaluate(() => document.querySelector(".shell-host")?.getAttribute("data-depth") === "1"));
    const label = await page.evaluate((id) => document.querySelector(`.entity-list__row[data-entity="building"][data-entity-id="${id}"]`)?.getAttribute("aria-label") ?? "", builtId);
    check("level-2-worded-in-row", label.includes("level 2"), label);
    current.screenshots.push(await shot(page, S("07-list-after-upgrade")));
  });

  await step(page, "trade-sell", async () => {
    await press(page, "Escape"); // close Map first — one major surface
    await page.waitForTimeout(200);
    await press(page, "5");
    await page.waitForSelector(".panel--store", { timeout: 8000 });
    check("trade-opened-by-digit-5", true);
    const creditsBefore = await readNumber(page, ".resources__item--credits strong");
    const sell = await tabTo(page, { labelPrefix: "Sell " });
    check("sell-face-reachable-by-tab", sell.found, sell.desc);
    const gain = Number((sell.desc.label.match(/\+(\d+)/) || [])[1]);
    current.screenshots.push(await shot(page, S("08-trade")));
    await press(page, "Enter");
    await page.waitForTimeout(350);
    const creditsAfter = await readNumber(page, ".resources__item--credits strong");
    check("sell-paid-exact-tranche", creditsBefore !== null && creditsAfter === creditsBefore + gain, { creditsBefore, creditsAfter, gain });
    await press(page, "Escape");
    check("trade-closed-by-escape", await page.evaluate(() => !document.querySelector(".panel--store")));
  });

  let settingsOpener = null;
  await step(page, "settings-yard-backup-download", async () => {
    const settings = await tabTo(page, { labelPrefix: "Settings" });
    check("settings-reachable-by-tab", settings.found, settings.desc);
    settingsOpener = settings.desc;
    await press(page, "Enter");
    await page.waitForSelector(".panel--settings", { timeout: 8000 });
    check("settings-opened", true);
    // The Row label "Yard record" is a <dt>; the focusable control is the
    // enabled "Open" button inside that row (SHELL_COPY.open). Match by row.
    const yard = await tabTo(page, { labelPrefix: "Open", rowLabel: "Yard record" });
    check("yard-record-reachable-by-tab", yard.found, yard.desc);
    await press(page, "Enter");
    await page.waitForSelector('[role="group"][aria-label="Yard record"]', { timeout: 8000 });
    check("yard-record-opened", true);
    const backup = await tabTo(page, { labelPrefix: "Backup" });
    check("backup-reachable-by-tab", backup.found, backup.desc);
    await press(page, "Enter");
    await page.waitForSelector("#rustwake-save-export", { timeout: 8000 });
    const exportLen = await page.evaluate(() => document.querySelector("#rustwake-save-export").value.length);
    check("save-export-text-present", exportLen > 100, exportLen);
    current.screenshots.push(await shot(page, S("09-backup")));
    const dl = await tabTo(page, { labelPrefix: "Download" });
    check("download-reachable-by-tab", dl.found, dl.desc);
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 10000 }),
      press(page, "Enter"),
    ]);
    const savePath = path.join(SHOTDIR, `${vpName}-save-export.json`);
    await download.saveAs(savePath);
    const buf = readFileSync(savePath);
    current.saveArtifact = {
      file: path.relative(root, savePath).replace(/\\/g, "/"),
      suggestedFilename: download.suggestedFilename(),
      bytes: buf.length,
      sha256: createHash("sha256").update(buf).digest("hex"),
      parsesAsSave: (() => { try { JSON.parse(buf.toString("utf8")); return true; } catch { return false; } })(),
    };
    check("save-downloaded-and-parses", buf.length > 100 && current.saveArtifact.parsesAsSave, current.saveArtifact);
  });

  await step(page, "escape-unwind-focus-restore", async () => {
    await press(page, "Escape"); // Yard record layer
    await page.waitForTimeout(200);
    check("yard-closed-settings-survives", await page.evaluate(() => !!document.querySelector(".panel--settings")));
    await press(page, "Escape"); // Settings layer — stack empties
    await page.waitForTimeout(250);
    check("stack-emptied", await page.evaluate(() => !document.querySelector(".shell-host")));
    const after = await activeDesc(page);
    check("focus-restored-to-settings-opener", after.label === settingsOpener.label && after.label.startsWith("Settings"), { after, settingsOpener });
    current.screenshots.push(await shot(page, S("10-focus-restored")));
  });

  await step(page, "map-toolbar-focus-return", async () => {
    const mapBtn = await tabTo(page, { cls: "toolbar__btn", slot: "map" });
    check("map-toolbar-reachable-by-tab", mapBtn.found, mapBtn.desc);
    await press(page, "Enter");
    await page.waitForSelector(".entity-list", { timeout: 8000 });
    check("map-opened-from-toolbar", true);
    await press(page, "Escape");
    await page.waitForTimeout(250);
    const after = await activeDesc(page);
    check("map-closed", await page.evaluate(() => !document.querySelector(".shell-host")));
    check("focus-restored-to-map-toolbar", after.slot === "map" && after.cls.includes("toolbar__btn"), after);
  });

  await step(page, "digit6-escape-focus", async () => {
    await press(page, "6");
    await page.waitForSelector(".entity-list", { timeout: 8000 });
    check("map-opened-by-digit-6", true);
    await press(page, "Escape");
    await page.waitForTimeout(250);
    const after = await activeDesc(page);
    check("map-closed-by-escape", await page.evaluate(() => !document.querySelector(".shell-host")));
    // Opener was the Map toolbar button (focus rested there) — restore is real.
    check("focus-restored-to-opener", after.slot === "map" && after.cls.includes("toolbar__btn"), after);
  });

  await step(page, "tab-cycle-no-trap", async () => {
    const tabbable = await page.evaluate(() => {
      const els = [...document.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')];
      const list = [];
      for (const el of els) {
        const ti = el.getAttribute("tabindex");
        if (ti !== null && parseInt(ti, 10) < 0) continue;
        if (el.disabled) continue;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none") continue;
        list.push({ tag: el.tagName.toLowerCase(), cls: (el.className || "").toString().slice(0, 40), label: (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40) });
      }
      return list;
    });
    current.tabbableCount = tabbable.length;
    const first = await activeDesc(page);
    const seq = [first];
    for (let i = 0; i < tabbable.length + 2; i += 1) { await press(page, "Tab"); seq.push(await activeDesc(page)); }
    current.tabSequence = seq.slice(0, 80);
    const wrapped = seq.some((a, i) => i > 0 && a.label === first.label && a.cls === first.cls && a.tag === first.tag);
    check("tab-cycle-wraps-no-trap", wrapped, { tabbable: tabbable.length, first });
  });

  await step(page, "status-event-driven-focus-ring", async () => {
    await press(page, "6");
    await page.waitForSelector(".entity-list", { timeout: 8000 });
    const before = await page.evaluate(() => document.querySelector(".entity-list [role='status']")?.textContent ?? "");
    await page.waitForTimeout(1500); // the sim ticks on; the live region must not
    const after = await page.evaluate(() => document.querySelector(".entity-list [role='status']")?.textContent ?? "");
    check("status-not-per-tick", before === after, { before, after });
    const drone = await tabTo(page, { cls: "entity-list__row", entity: "drone" });
    check("drone-row-reachable-by-tab", drone.found, drone.desc);
    const ring = await page.evaluate(() => {
      const cs = getComputedStyle(document.activeElement);
      return { outlineWidth: cs.outlineWidth, outlineStyle: cs.outlineStyle, outlineColor: cs.outlineColor };
    });
    check("visible-focus-ring", ring.outlineStyle !== "none" && parseFloat(ring.outlineWidth) >= 2, ring);
    await press(page, "Enter");
    const announced = await page.evaluate(() => document.querySelector(".entity-list [role='status']")?.textContent ?? "");
    check("activation-announced", announced.startsWith("Focused"), announced);
    check("unit-activation-camera-only", await page.evaluate(() => document.querySelector(".shell-host")?.getAttribute("data-depth") === "1" && !document.querySelector('[aria-label$="details"]')));
    current.screenshots.push(await shot(page, S("11-drone-focused")));
    await press(page, "Escape");
  });
}

// ---- geometry census: 8 viewports x ts1/ts2 --------------------------------
const VIEWPORTS = [
  ["phone-small", { width: 360, height: 640 }, 2, true],
  ["phone", { width: 390, height: 844 }, 2, true],
  ["phone-large", { width: 412, height: 915 }, 2, true],
  ["phone-landscape", { width: 844, height: 390 }, 2, true],
  ["tablet", { width: 768, height: 1024 }, 2, true],
  ["laptop", { width: 1366, height: 768 }, 1, false],
  ["desktop", { width: 1920, height: 1080 }, 1, false],
  ["desktop-large", { width: 2560, height: 1440 }, 1, false],
];

function censusEval() {
  const panel = document.querySelector(".panel--map");
  const body = panel && panel.querySelector(".panel__body");
  const rows = [...document.querySelectorAll(".entity-list__row")].map((r) => {
    const b = r.getBoundingClientRect();
    return { kind: r.getAttribute("data-entity"), h: Math.round(b.height), w: Math.round(b.width), name: r.getAttribute("aria-label") };
  });
  return {
    docScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    textLarge: document.documentElement.classList.contains("text-large"),
    scaleVar: getComputedStyle(document.documentElement).getPropertyValue("--text-scale").trim(),
    panelFound: !!panel,
    body: body ? { overflowY: getComputedStyle(body).overflowY, scrollHeight: body.scrollHeight, clientHeight: body.clientHeight, innerScroll: body.scrollHeight - body.clientHeight } : null,
    rows,
    unnamedRows: rows.filter((r) => !r.name || r.name.length < 10).length,
    statusWorded: rows.every((r) => /(Ready|Working|Needs input|Cargo full|Power limited|Paused|Idle|In flight|Broken|Deliveries|Job|No road route|Road removed|full|No idle truck)/.test(r.name || "")),
  };
}

async function censusCell(page, key) {
  await page.keyboard.press("6");
  await page.waitForSelector(".entity-list", { timeout: 8000 });
  await page.waitForTimeout(300);
  const map = await page.evaluate(censusEval);
  const mapShot = await shot(page, `${key}-map`);
  // Stack the inspector the keyboard way and re-measure the document.
  const reach = await tabTo(page, { cls: "entity-list__row", entity: "building" }, 60);
  let inspector = null;
  if (reach.found) {
    await page.keyboard.press("Enter");
    await page.waitForSelector('[role="group"][aria-label$="details"]', { timeout: 8000 });
    await page.waitForTimeout(250);
    inspector = await page.evaluate(() => ({
      docScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      depth: document.querySelector(".shell-host")?.getAttribute("data-depth"),
    }));
    await shot(page, `${key}-inspector`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }
  const cell = { map, inspector, mapShot };
  const bad = [];
  if (map.docScroll > 0) bad.push({ kind: "page-scroll-map", px: map.docScroll });
  if (!map.panelFound) bad.push({ kind: "map-panel-missing" });
  if (!map.body || map.body.overflowY !== "auto") bad.push({ kind: "panel-scroller-missing", body: map.body });
  if (map.rows.length < 2) bad.push({ kind: "entities-not-enumerated", rows: map.rows.length });
  if (map.rows.some((r) => r.h < 44)) bad.push({ kind: "row-below-44px", rows: map.rows.filter((r) => r.h < 44) });
  if (map.unnamedRows > 0) bad.push({ kind: "unnamed-row", count: map.unnamedRows });
  if (!map.statusWorded) bad.push({ kind: "status-not-worded", rows: map.rows.map((r) => r.name) });
  if (inspector && inspector.docScroll > 0) bad.push({ kind: "page-scroll-inspector", px: inspector.docScroll });
  if (!reach.found) bad.push({ kind: "building-row-not-tabbable" });
  for (const b of bad) results.defects.push({ cell: key, ...b });
  cell.pass = bad.length === 0;
  console.log(`${cell.pass ? "PASS" : "FAIL"} census ${key} rows=${map.rows.length} minH=${Math.min(...map.rows.map((r) => r.h))} docScroll=${map.docScroll} innerScroll=${map.body ? map.body.innerScroll : "?"}`);
  return cell;
}

// ---- run ------------------------------------------------------------------
try {
  // Full keyboard loop on laptop + desktop at ts1.
  for (const [name, viewport, dsf, isMobile] of VIEWPORTS.filter(([n]) => n === "laptop" || n === "desktop")) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf, isMobile, hasTouch: isMobile, acceptDownloads: true });
    await ctx.addInitScript(([k, v]) => { if (localStorage.getItem(k) === null) localStorage.setItem(k, v); }, [SAVE_KEY, buildSeed(1)]);
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160)); });
    page.on("pageerror", (e) => consoleErrors.push(String(e).slice(0, 160)));
    try {
      await boot(page, 1);
      await keyboardLoop(page, name);
    } catch (e) {
      results.defects.push({ loop: name, kind: "loop-error", error: String(e).slice(0, 300) });
      console.log("LOOP ERROR", name, String(e).slice(0, 300));
    }
    if (consoleErrors.length) results.defects.push({ loop: name, kind: "console-error", items: consoleErrors });
    results.steps.filter((s) => s.name && !s.loop).forEach((s) => { s.loop = name; });
    await ctx.close();
  }

  // Geometry census across all 8 viewports x ts1/ts2.
  for (const [name, viewport, dsf, isMobile] of VIEWPORTS) {
    for (const scale of [1, 2]) {
      const key = `${name}-ts${scale}`;
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf, isMobile, hasTouch: isMobile });
      await ctx.addInitScript(([k, v]) => { if (localStorage.getItem(k) === null) localStorage.setItem(k, v); }, [SAVE_KEY, buildSeed(scale)]);
      const page = await ctx.newPage();
      const consoleErrors = [];
      page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160)); });
      page.on("pageerror", (e) => consoleErrors.push(String(e).slice(0, 160)));
      try {
        await boot(page, scale);
        await continueFromGateQuiet(page);
        results.census[key] = await censusCell(page, key);
        results.census[key].consoleErrors = consoleErrors;
        if (consoleErrors.length) results.defects.push({ cell: key, kind: "console-error", items: consoleErrors });
      } catch (e) {
        results.census[key] = { error: String(e).slice(0, 300), consoleErrors };
        results.defects.push({ cell: key, kind: "probe-error", error: String(e).slice(0, 300) });
        console.log("CENSUS ERROR", key, String(e).slice(0, 300));
      }
      await ctx.close();
    }
  }

  // Mirror audit: every frame distinct + non-empty.
  const shots = [];
  const seen = new Set();
  const collect = (dir) => {
    for (const entry of readdirSyncSafe(dir)) {
      const f = path.join(dir, entry);
      if (entry.endsWith(".png")) shots.push(f);
    }
  };
  collect(SHOTDIR);
  const mirror = [];
  for (const f of shots) {
    const buf = readFileSync(f);
    const sha = createHash("sha256").update(buf).digest("hex");
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    const distinct = !seen.has(sha); seen.add(sha);
    mirror.push({ file: path.basename(f), sha256: sha, width: w, height: h, bytes: buf.length, nonEmpty: buf.length > 1000, distinct });
  }
  results.mirror = { count: mirror.length, allNonEmpty: mirror.every((m) => m.nonEmpty), frames: mirror };
  results.keySequence = allKeys;
  const stepList = results.steps;
  results.summary = {
    steps: stepList.length,
    stepsPassed: stepList.filter((s) => s.pass).length,
    stepsFailed: stepList.filter((s) => !s.pass).length,
    censusCells: Object.keys(results.census).length,
    censusPassed: Object.values(results.census).filter((c) => c.pass).length,
    defectCount: results.defects.length,
    defectKinds: [...new Set(results.defects.map((d) => d.kind))],
    frames: mirror.length,
    keysPressed: allKeys.length,
  };
  const ok = results.summary.stepsFailed === 0 && results.summary.censusPassed === results.summary.censusCells && results.defects.length === 0;
  results.verdict = ok ? "PASS" : "FAIL";
  writeFileSync(path.join(OUTDIR, "151-keyboard-walkthrough.json"), JSON.stringify(results, null, 1));
  writeFileSync(path.join(OUTDIR, "151-keyboard-walkthrough.md"), renderMarkdown(results));
  console.log("SUMMARY", JSON.stringify(results.summary));
  console.log("DEFECTS", JSON.stringify(results.defects.slice(0, 40)));
  console.log("WROTE", path.join(OUTDIR, "151-keyboard-walkthrough.json"));
  process.exitCode = ok ? 0 : 1;
} finally {
  await browser.close();
  server.kill();
}

/** Gate Continue without step recording (census cells). */
async function continueFromGateQuiet(page) {
  for (let i = 0; i < 20; i += 1) {
    const isGate = await page.evaluate(() => document.activeElement.classList.contains("gate__btn"));
    if (isGate) break;
    await page.keyboard.press("Tab");
    await page.waitForTimeout(60);
  }
  await page.keyboard.press("Enter");
  await page.waitForSelector(".toolbar", { timeout: 20000 });
  if (await page.evaluate(() => !!document.querySelector(".panel--report"))) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
  }
}

function readdirSyncSafe(dir) {
  try { return readdirSync(dir); } catch { return []; }
}

function renderMarkdown(r) {
  const lines = [];
  lines.push(`# #151 U04 — keyboard-only entity list walkthrough`);
  lines.push("");
  lines.push(`- Build SHA: \`${r.buildSha}\``);
  lines.push(`- Generated: ${r.generatedAt}`);
  lines.push(`- Method: ${r.method}`);
  lines.push(`- Verdict: **${r.verdict}** — ${r.summary.stepsPassed}/${r.summary.steps} steps, ${r.summary.censusPassed}/${r.summary.censusCells} census cells, ${r.summary.defectCount} defects, ${r.summary.keysPressed} real key presses, ${r.summary.frames} frames`);
  lines.push("");
  lines.push("## Keyboard loop steps");
  lines.push("");
  lines.push("| Loop | Step | Keys | Pass | Focus after |");
  lines.push("|---|---|---|---|---|");
  for (const s of r.steps) {
    const keys = s.keys.join(" ").slice(0, 60) || "—";
    const fa = s.focusAfter ? `${s.focusAfter.tag}${s.focusAfter.slot ? `[${s.focusAfter.slot}]` : ""} ${s.focusAfter.label.slice(0, 30)}` : "—";
    lines.push(`| ${s.loop ?? ""} | ${s.name} | ${keys} | ${s.pass ? "PASS" : "FAIL"} | ${fa} |`);
  }
  lines.push("");
  lines.push("## Geometry census (8 viewports x text scale 1 & 2)");
  lines.push("");
  lines.push("| Cell | Rows | Min row px | Doc scroll | Panel scroller | Inner scroll px | Pass |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const [key, c] of Object.entries(r.census)) {
    if (c.error) { lines.push(`| ${key} | — | — | — | — | — | ERROR |`); continue; }
    const minH = c.map.rows.length ? Math.min(...c.map.rows.map((x) => x.h)) : 0;
    lines.push(`| ${key} | ${c.map.rows.length} | ${minH} | ${c.map.docScroll} | ${c.map.body ? c.map.body.overflowY : "?"} | ${c.map.body ? c.map.body.innerScroll : "?"} | ${c.pass ? "PASS" : "FAIL"} |`);
  }
  lines.push("");
  lines.push("## Defects");
  lines.push("");
  if (r.defects.length === 0) lines.push("None.");
  else for (const d of r.defects) lines.push(`- ${JSON.stringify(d)}`);
  lines.push("");
  lines.push("## Limitations");
  lines.push("");
  for (const l of r.limitations) lines.push(`- ${l}`);
  lines.push("");
  lines.push("## Save artifacts");
  lines.push("");
  for (const s of r.steps) {
    if (s.saveArtifact) lines.push(`- ${s.loop}: \`${s.saveArtifact.file}\` (${s.saveArtifact.bytes} bytes, sha256 \`${s.saveArtifact.sha256.slice(0, 16)}…\`, parses: ${s.saveArtifact.parsesAsSave})`);
  }
  lines.push("");
  lines.push(`Screenshots: \`docs/evidence/151-keyboard-walkthrough/\` (${r.mirror.count} frames, all non-empty: ${r.mirror.allNonEmpty}).`);
  lines.push("");
  return lines.join("\n");
}
