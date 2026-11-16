import { chromium } from "playwright-core";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PROBE, applyAfford, byText, dock, dir, exe, install, seedText, selectMachine, summary, url } from "./probe-46.mjs";

// UI-RESET/ARTDIR (#45 companion): composition instrument for the two directions.
// Runs the same probe three ways per band - before (built sheet only), direction A,
// direction B - in the mature baseline, plus the chip inventory of the opening frame.
//   node work/evidence/UI-RESET-46/measure-46.mjs   -> measures-46.json

const sheetA = readFileSync(resolve(dir, "direction-a.css"), "utf8");
const sheetB = readFileSync(resolve(dir, "direction-b.css"), "utf8");
const SHEETS = { before: "", A: sheetA, B: sheetB };
const BANDS = [[390, 844, 2, true], [844, 390, 2, true], [1366, 768, 1, false], [1920, 1080, 1, false], [2560, 1440, 1, false]];

const runBand = async (browser, [w, h, dpr, mobile], css) => {
  const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  await install(c, seedText, null);
  const p = await c.newPage();
  await p.goto(url, { waitUntil: "networkidle" });
  await p.waitForSelector("text=Begin recovery");
  if (css) await p.addStyleTag({ content: css });
  await p.click("text=Begin recovery");
  await p.waitForTimeout(1400);
  await byText(p, "Back to yard");
  await p.waitForTimeout(300);
  const rest = await p.evaluate(PROBE);
  const afford = await applyAfford(p);
  const restStamped = await p.evaluate(PROBE);
  const ink = rest.world ?? { cssX: 40, cssY: 60, cssW: w - 80, cssH: h - 160 };
  const opened = await selectMachine(p, ink.cssX + 4, ink.cssX + ink.cssW - 4, ink.cssY + 4, ink.cssY + ink.cssH - 4);
  const machine = await p.evaluate(PROBE);
  await byText(p, "Close");
  await dock(p, "Store");
  await p.waitForTimeout(220);
  const store = await p.evaluate(PROBE);
  await c.close();
  return {
    machineOpened: Boolean(opened),
    afford,
    frames: { rest: summary(restStamped), machine: summary(machine), store: summary(store) },
  };
};

const browser = await chromium.launch({ executablePath: exe });
const out = { headSha: process.env.RUSTWAKE_SHA ?? "224e22aa57a68215a2eddfe606ef50462b4d0b5e", seed: "docs/evidence/yard-mature.json", bands: {} };
try {
  for (const band of BANDS) {
    const key = band[0] + "x" + band[1];
    out.bands[key] = {};
    for (const [name, css] of Object.entries(SHEETS)) {
      out.bands[key][name] = await runBand(browser, band, css);
      const f = out.bands[key][name].frames.rest;
      console.log(key, name, "ink", f.ink ? [f.ink.cssX, f.ink.cssY, f.ink.cssW, f.ink.cssH].join(",") : "-", "| cover", f.inkCoverPct, "| chips", f.chips, "rows", f.chipRows, "| under44", f.facesUnder44);
    }
  }
  writeFileSync(resolve(dir, "measures-46.json"), JSON.stringify(out, null, 2) + String.fromCharCode(10));
  console.log("wrote measures-46.json");
} finally {
  await browser.close();
}


