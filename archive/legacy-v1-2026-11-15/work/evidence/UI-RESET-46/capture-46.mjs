import { chromium } from "playwright-core";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PROBE, applyAfford, byText, dir, dock, exe, install, root, selectMachine, summary, tap, url } from "./probe-46.mjs";

// UI-RESET/ARTDIR (#46): composed reference captures for the two directions.
// From the worktree root:
//   node node_modules/vite/bin/vite.js build
//   node node_modules/vite/bin/vite.js preview --port 4186 --strictPort   (separate shell)
//   $env:RUSTWAKE_URL = "http://localhost:4186/"   (or 4177, the probe default)
//   node work/evidence/UI-RESET-46/capture-46.mjs
// One composed frame per (direction, scenario, band, surface): the real build paints the
// world, one author sheet (direction-*.css) is injected after the built sheet, no game
// code is touched. Writes captures/*.png plus captures-46.json, one readout per image.
// The opening scenario is generated once from a no-save boot (see ensureOpening).

const shots = resolve(dir, "captures");
mkdirSync(shots, { recursive: true });
const openingPath = resolve(dir, "scenario-opening.json");
const maturePath = resolve(dir, "scenario-mature.json");
const headSha = process.env.RUSTWAKE_SHA ?? "224e22aa57a68215a2eddfe606ef50462b4d0b5e";
const sheets = {
  a: readFileSync(resolve(dir, "direction-a.css"), "utf8"),
  b: readFileSync(resolve(dir, "direction-b.css"), "utf8"),
};

// The two scenarios the issue names: the opening frame and the mature yard. Both are
// plain save envelopes, so the same yard is reproducible in every frame and in both sheets.
if (!existsSync(maturePath)) {
  writeFileSync(maturePath, readFileSync(resolve(root, "docs/evidence/yard-mature.json"), "utf8"));
}

const browser = await chromium.launch({ executablePath: exe });
const receipt = [];

const info = (page) => page.evaluate(() => {
  const txt = (s) => document.querySelector(s)?.textContent ?? null;
  const raw = localStorage.getItem("rustwake.save.v1");
  const sim = raw ? JSON.parse(raw).payload.sim : null;
  return {
    chips: txt(".resources"),
    objective: txt(".objective"),
    reconcile: txt(".reconcile"),
    toast: txt(".toast"),
    panel: txt(".panel") ? String(txt(".panel")).slice(0, 220) : null,
    dock: [...document.querySelectorAll(".dock__btn, .gate__btn, .icon-btn")].map((n) => (n.textContent ?? "").trim()).filter(Boolean),
    tick: sim ? sim.tick : null,
    machines: sim ? sim.machines.length : 0,
    tutorial: sim ? sim.tutorial : null,
    afford: [...document.querySelectorAll("[data-afford]")].map((n) => (n.getAttribute("data-afford") ?? "") + ":" + (n.textContent ?? "").trim().slice(0, 26)),
  };
});

const shot = async (page, name, note) => {
  const s = await info(page);
  await page.screenshot({ path: resolve(shots, name + ".png") });
  receipt.push({ file: name + ".png", note, ...s });
  console.log(name + ".png - " + note);
};

const make = async (w, h, dpr, mobile, seed, css) => {
  const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  if (seed) await install(c, seed, null);
  const p = await c.newPage();
  await p.goto(url, { waitUntil: "networkidle" });
  await p.waitForSelector("text=Begin recovery");
  if (css) await p.addStyleTag({ content: css });
  await p.click("text=Begin recovery");
  await p.waitForTimeout(1400);
  const dismissed = await byText(p, "Back to yard");
  await p.waitForTimeout(300);
  return { c, p, dismissed };
};

// The opening scenario is a real no-save boot, walked to the first built machine and
// dumped from localStorage, so the "fresh" frames replay exactly one yard state.
const ensureOpening = async () => {
  if (existsSync(openingPath)) return readFileSync(openingPath, "utf8");
  const { c, p } = await make(390, 844, 2, true, null, null);
  for (let i = 0; i < 8; i += 1) {
    await tap(p, ".dock__btn--primary");
    await p.waitForTimeout(320);
  }
  const built = await dock(p, "Build");
  await p.waitForTimeout(260);
  await p.mouse.move(150, 300);
  await p.waitForTimeout(140);
  if (built) {
    await tap(p, ".dock__btn--primary");
    await p.waitForTimeout(420);
  }
  const raw = await p.evaluate(() => localStorage.getItem("rustwake.save.v1"));
  await c.close();
  writeFileSync(openingPath, raw + String.fromCharCode(10));
  return raw;
};

const opening = await ensureOpening();
const mature = readFileSync(maturePath, "utf8");
const scenarios = [
  ["fresh", opening, "opening scenario: no research, one starter machine"],
  ["mature", mature, "mature scenario: 8 machines, 18 routes, all nodes known"],
];
const bands = [["390x844", 390, 844, 2, true], ["1920x1080", 1920, 1080, 1, false]];

try {
  for (const [sheetName, css] of Object.entries(sheets)) {
    for (const [stateName, seed, note] of scenarios) {
      for (const [bandKey, w, h, dpr, mobile] of bands) {
        const { c, p, dismissed } = await make(w, h, dpr, mobile, seed, css);
        const base = sheetName + "-" + bandKey + "-" + stateName;
        const ink = await p.evaluate(PROBE).then((r) => r.world);
        await shot(p, base + "-rest", note + " | yard at rest, chips + objective + dock");
        const afford = await applyAfford(p);
        await p.waitForTimeout(200);
        const storeOpened = await dock(p, "Store");
        await p.waitForTimeout(240);
        await shot(p, base + "-store", (storeOpened ? "Store plate (inventory)" : "Store face absent") + " | " + note);
        await byText(p, "Close");
        await p.waitForTimeout(200);
        const opened = ink
          ? await selectMachine(p, ink.cssX + 4, ink.cssX + ink.cssW - 4, ink.cssY + 4, ink.cssY + ink.cssH - 4)
          : null;
        await shot(p, base + "-machine", (opened ? "machine inspector over the world" : "no machine inspector opened") + " | " + note);
        await byText(p, "Close");
        await p.waitForTimeout(200);
        const built = await dock(p, "Build");
        await p.waitForTimeout(260);
        await p.mouse.move(Math.round(w / 2), Math.round(h * 0.42));
        await p.waitForTimeout(160);
        await shot(p, base + "-build", (built ? "build catalog with a cell ghost" : "Build face absent at this stage") + " | " + note);
        const rest = await p.evaluate(PROBE);
        receipt[receipt.length - 4] = Object.assign(receipt[receipt.length - 4], {
          composition: summary(rest),
          affordFaces: afford.faces.length,
          reportDismissed: dismissed,
          sheet: "direction-" + sheetName + ".css",
          band: bandKey,
          state: stateName,
        });
        await c.close();
      }
    }
  }
  writeFileSync(
    resolve(dir, "captures-46.json"),
    JSON.stringify(
      {
        task: "UI-RESET/ARTDIR #46",
        issue: "https://github.com/darkmatter2222/Rustwake/issues/46",
        headSha,
        tool: "playwright-core plus local Chrome/Edge, vite preview (RUSTWAKE_URL=" + url + ")",
        sheets: { a: "direction-a.css", b: "direction-b.css" },
        scenarios: {
          fresh: "work/evidence/UI-RESET-46/scenario-opening.json (dumped from a no-save boot at this head)",
          mature: "work/evidence/UI-RESET-46/scenario-mature.json (docs/evidence/yard-mature.json, tick 18298)",
        },
        captures: receipt,
      },
      null,
      2,
    ) + String.fromCharCode(10),
  );
  console.log("wrote " + receipt.length + " captures plus captures-46.json");
} finally {
  await browser.close();
}
