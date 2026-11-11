import { chromium } from "playwright-core";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PROBE, applyAfford, byText, dir, dock, exe, install, selectMachine, summary, url } from "./probe-46.mjs";

// UI-RESET/ARTDIR (#46): the two supplementary bands the #45 audit measured (844x390
// landscape phone, 2560x1440 wide desktop) plus the credits-0 unaffordable state, so the
// selected direction is checked against every band the audit numbers describe.
//   node node_modules/vite/bin/vite.js preview --port 4177 --strictPort
//   node work/evidence/UI-RESET-46/capture-extra-46.mjs   -> captures-extra-46.json
const shots = resolve(dir, "captures");
const sheets = { a: readFileSync(resolve(dir, "direction-a.css"), "utf8"), b: readFileSync(resolve(dir, "direction-b.css"), "utf8") };
const mature = readFileSync(resolve(dir, "scenario-mature.json"), "utf8");
const receipt = [];
const info = (page) => page.evaluate(() => {
  const txt = (s) => document.querySelector(s)?.textContent ?? null;
  return { chips: txt(".resources"), objective: txt(".objective"), panel: txt(".panel") ? String(txt(".panel")).slice(0, 200) : null, dock: [...document.querySelectorAll(".dock__btn")].map((n) => (n.textContent ?? "").trim()), afford: [...document.querySelectorAll("[data-afford]")].map((n) => (n.getAttribute("data-afford") ?? "") + ":" + (n.textContent ?? "").trim().slice(0, 24)) };
});
const shot = async (page, name, note) => { const s = await info(page); await page.screenshot({ path: resolve(shots, name + ".png") }); const comp = summary(await page.evaluate(PROBE)); receipt.push({ file: name + ".png", note, ...s, composition: comp }); console.log(name + ".png - " + note); };
const make = async (w, h, dpr, mobile, mut, css) => {
  const c = await browser0.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  await install(c, mature, mut ?? null);
  const p = await c.newPage();
  await p.goto(url, { waitUntil: "networkidle" });
  await p.waitForSelector("text=Begin recovery");
  if (css) await p.addStyleTag({ content: css });
  await p.click("text=Begin recovery");
  await p.waitForTimeout(1500);
  await byText(p, "Back to yard");
  await p.waitForTimeout(320);
  return { c, p };
};
const browser0 = await chromium.launch({ executablePath: exe });
try {
  for (const [sheetName, css] of Object.entries(sheets)) {
    for (const [bandKey, w, h, dpr, mobile] of [["844x390", 844, 390, 2, true], ["2560x1440", 2560, 1440, 1, false]]) {
      const { c, p } = await make(w, h, dpr, mobile, null, css);
      await shot(p, sheetName + "-" + bandKey + "-mature-rest", "supplementary band " + bandKey + ": world + HUD, seeded mature yard");
      await dock(p, "Store");
      await p.waitForTimeout(260);
      await shot(p, sheetName + "-" + bandKey + "-mature-store", "supplementary band " + bandKey + ": inventory plate at 900/900");
      await c.close();
    }
    for (const [bandKey, w, h, dpr, mobile] of [["390x844", 390, 844, 2, true], ["1920x1080", 1920, 1080, 1, false]]) {
      const { c, p } = await make(w, h, dpr, mobile, { "payload.sim.credits": 0 }, css);
      const ink = (await p.evaluate(PROBE)).world;
      const opened = ink ? await selectMachine(p, ink.cssX + 4, ink.cssX + ink.cssW - 4, ink.cssY + 4, ink.cssY + ink.cssH - 4) : null;
      const faces = await applyAfford(p);
      await p.waitForTimeout(180);
      await shot(p, sheetName + "-" + bandKey + "-mature-unaffordable", "credits 0: priced faces carry the short signal (inspector + fork " + (opened ? "opened" : "NOT opened") + ")", );
      receipt[receipt.length - 1].affordFaces = faces.faces;
      await c.close();
    }
  }
  writeFileSync(resolve(dir, "captures-extra-46.json"), JSON.stringify({ task: "UI-RESET/ARTDIR #46 supplementary bands", issue: "https://github.com/darkmatter2222/Rustwake/issues/46", sheets: { a: "direction-a.css", b: "direction-b.css" }, syntheticEdits: { unaffordable: "payload.sim.credits=0" }, captures: receipt }, null, 2) + String.fromCharCode(10));
  console.log("wrote " + receipt.length + " supplementary captures");
} finally {
  await browser0.close();
}

