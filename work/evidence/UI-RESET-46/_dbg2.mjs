import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dir, exe, install, seedText, url } from "./probe-46.mjs";
const css = readFileSync(resolve(dir, "direction-a.css"), "utf8");
const b = await chromium.launch({ executablePath: exe });
for (const use of [false, true]) {
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await install(c, seedText, null);
  const p = await c.newPage();
  await p.goto(url, { waitUntil: "networkidle" });
  await p.waitForSelector("text=Begin recovery");
  if (use) await p.addStyleTag({ content: css });
  await p.click("text=Begin recovery");
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => { const n = document.querySelector(".resources__item"); const cs = getComputedStyle(n); return { visible: [...document.querySelectorAll(".resources__item")].filter((x) => x.getBoundingClientRect().height > 0).length, tt: cs.textTransform, fs: cs.fontSize, h: Math.round(n.getBoundingClientRect().height), sheets: document.styleSheets.length, radius: getComputedStyle(document.querySelector(".dock__btn")).borderRadius }; });
  console.log("injected=" + use, JSON.stringify(r));
  await c.close();
}
await b.close();

