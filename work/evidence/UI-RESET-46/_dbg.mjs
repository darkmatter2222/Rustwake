import { chromium } from "playwright-core";
import { applyAfford, exe, install, seedText, url, byText } from "./probe-46.mjs";
const b = await chromium.launch({ executablePath: exe });
const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await install(c, seedText, { "payload.sim.credits": 0 });
const p = await c.newPage();
await p.goto(url, { waitUntil: "networkidle" });
await p.waitForSelector("text=Begin recovery");
await p.click("text=Begin recovery");
await p.waitForTimeout(1600);
await byText(p, "Back to yard");
await p.waitForTimeout(300);
const chips = await p.evaluate(() => [...document.querySelectorAll(".resources__item")].map((n) => JSON.stringify(n.textContent)));
console.log("chips", chips.join(" | "));
console.log("afford", JSON.stringify(await applyAfford(p)));
await b.close();

