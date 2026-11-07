// ART-003 g1 A3-2 instrument: blind-naming crops. One 390x844 dpr2 page (the same FS-1
// envelope family as the stills) with the three opening blueprints in the machine column;
// each machine's 32-unit cell box is cropped straight out of the live canvas at the phone
// fit and written as a label-free PNG (`docs/screenshots/naming-<n>.png`). The crop order is
// a fixed permutation so the file name does not leak the blueprint, and the manifest
// (crop -> blueprint, plus the two rating passes) lands in
// docs/evidence/2026-11-06-art003-naming.json.
// Usage: RUSTWAKE_URL=http://localhost:5176/ node scripts/art003-naming.mjs
import { chromium } from "playwright-core";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const url = process.env.RUSTWAKE_URL ?? "http://localhost:5176/";
const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const executablePath = chromeCandidates.find((path) => existsSync(path));

// Fixed permutation: crop slot -> blueprint id (revealed only in the manifest).
const SLOTS = [
  { file: "role-naming-1.png", blueprint: "wireMill", tile: 20 },
  { file: "role-naming-2.png", blueprint: "sorter", tile: 8 },
  { file: "role-naming-3.png", blueprint: "furnace", tile: 14 },
];

const fnv1a = (t) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < t.length; i += 1) {
    hash ^= t.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};
const part = (id, blueprint, tile, status, trayUnits) => ({
  id, blueprint, tile, orientation: 0, level: 1,
  inBuf: {}, inBufUnits: trayUnits, tray: [], trayUnits, batch: [],
  progress: 300, progressRem: 0, progressDen: 600, batchMilli: 600, batchPower: 2,
  status, inRoutes: [], outRoute: null, starvedTicks: 0, batchesDone: 5,
  ageTicks: 300, busyTicks: 200, fullTicks: 0,
  rateAge: 0, rateFrom: 0, rateAgePrev: 0, rateFromPrev: 0,
});

// Blind-rating passes. Each pass reads the label-free PNGs only (no manifest, no sprite
// table) and picks from the six opening role names; the answers below were transcribed from
// those reads, then scored against the SLOTS permutation. Pass A reads the files in name
// order, pass B in reverse order, so the same crop is judged twice with a different
// immediately-preceding context. Feature wording is what the rater saw in the crop.
const PASSES = {
  A: { order: ["role-naming-1.png", "role-naming-2.png", "role-naming-3.png"], answers: {
    "role-naming-1.png": { name: "wireMill", cue: "wide body, a dark reel hole on each side with a light stand under it, three-step diagonal arm into a rust tip above" },
    "role-naming-2.png": { name: "sorter", cue: "tall frame with six dark roller discs in two rows of three, chutes along the bottom, one wedge in the select tone" },
    "role-naming-3.png": { name: "furnace", cue: "squat chamber with two stacked intake slots on the left, chimney stub and rust cap bar proud of the cap line, rust vent foot" },
  } },
  B: { order: ["role-naming-3.png", "role-naming-2.png", "role-naming-1.png"], answers: {
    "role-naming-3.png": { name: "furnace", cue: "two stacked dark slots inside a squat light chamber, chimney plus rust cap above it, rust foot below" },
    "role-naming-2.png": { name: "sorter", cue: "2x3 grid of dark discs in a full-height frame plus a chute row - only role with six discs" },
    "role-naming-1.png": { name: "wireMill", cue: "paired reel holes and stands either side of the body, stepped tension arm - no chimney" },
  } },
};

const run = async () => {
  const template = JSON.parse(readFileSync(resolve(root, "docs/evidence/yard-mature.json"), "utf8"));
  const env = JSON.parse(JSON.stringify(template));
  env.payload.sim.tick = 344;
  env.payload.sim.tutorial = 9;
  env.payload.sim.machines = [
    part(1, "sorter", 8, "running", 0),
    part(2, "furnace", 14, "outputFull", 1),
    part(3, "wireMill", 20, "starved", 0),
  ];
  env.payload.sim.routes = [
    { id: 1, from: { kind: "store" }, to: { kind: "machine", id: 1 }, filter: "scrap",
      capacity: 5, latency: 5, items: [{ resource: "scrap", qty: 1, arrive: 344 }], inFlight: 1 },
    { id: 2, from: { kind: "machine", id: 1 }, to: { kind: "machine", id: 2 }, filter: "ferrous",
      capacity: 5, latency: 5, items: [{ resource: "ferrous", qty: 1, arrive: 345 }], inFlight: 1 },
  ];
  env.payload.sim.store.data = 20;
  env.payload.sim.storeUnits = 770;
  env.payload.sim.storeCapacity = 900;
  const text = JSON.stringify(env.payload);
  const envelope = JSON.stringify({ ...env, checksum: fnv1a(text) });

  const browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await context.addInitScript((t) => localStorage.setItem("rustwake.save.v1", t), envelope);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Begin recovery");
  await page.click("text=Begin recovery");
  await page.waitForTimeout(250);
  const geo = await page.evaluate(async (slots) => {
    const mod = await import("/src/game/renderer/scene.ts");
    const canvas = document.querySelector("canvas");
    const hud = document.querySelector(".hud__top")?.getBoundingClientRect();
    const dock = document.querySelector(".dock")?.getBoundingClientRect();
    const insets = hud && dock && hud.bottom > 0 && dock.top > 0
      ? { top: hud.bottom, bottom: Math.max(0, window.innerHeight - dock.top) }
      : undefined;
    const camera = mod.fitCamera({ width: canvas.clientWidth, height: canvas.clientHeight }, insets);
    return slots.map((s) => {
      const c = mod.tileToWorld(s.tile);
      const p = mod.worldToScreen(camera, { width: canvas.clientWidth, height: canvas.clientHeight }, c.x, c.y);
      const half = 16 * camera.scale;
      return { file: s.file, x: p.x - half, y: p.y - half, width: 2 * half, height: 2 * half, scale: camera.scale };
    });
  }, SLOTS);
  await page.screenshot({ path: resolve(root, "docs/screenshots/role-naming-full.png") });
  for (const g of geo) {
    await page.screenshot({
      path: resolve(root, `docs/screenshots/${g.file}`),
      clip: { x: Math.round(g.x), y: Math.round(g.y), width: Math.round(g.width), height: Math.round(g.height) },
    });
  }
  await context.close();
  await browser.close();
  const truth = Object.fromEntries(SLOTS.map((s) => [s.file, s.blueprint]));
  const grade = (pass) => Object.entries(pass.answers).map(([file, a]) => ({
    file, answer: a.name, truth: truth[file], correct: a.name === truth[file], cue: a.cue,
  }));
  const passA = grade(PASSES.A);
  const passB = grade(PASSES.B);
  const out = {
    task: "A3-2 blind naming",
    url,
    viewport: "390x844",
    dpr: 2,
    note: "label-free crops of the three opening blueprints, crop order is a fixed permutation",
    crops: SLOTS.map((s, i) => ({ ...s, cssBox: [Math.round(geo[i].x), Math.round(geo[i].y), Math.round(geo[i].width), Math.round(geo[i].height)], scale: +geo[i].scale.toFixed(4) })),
    pageErrors: errors.length,
    rating: {
      method: "two blind passes over docs/screenshots/role-naming-<n>.png, each crop named from the six opening role names with no label in view; pass A in file order, pass B in reverse order",
      limitation: "both passes are the same single model in different orders, not two independent human raters",
      passes: {
        A: { order: PASSES.A.order, results: passA, correct: passA.filter((r) => r.correct).length },
        B: { order: PASSES.B.order, results: passB, correct: passB.filter((r) => r.correct).length },
      },
      agreement: passA.filter((r) => passB.find((x) => x.file === r.file)?.answer === r.answer).length,
      total: passA.length,
    },
  };
  writeFileSync(resolve(root, "docs/evidence/2026-11-06-art003-naming.json"), JSON.stringify(out, null, 2), "utf8");
  console.log(JSON.stringify(out, null, 1));
};

await run();
