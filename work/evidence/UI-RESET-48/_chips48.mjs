import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";

// Painted chip census for the shipped ladder at one band, fresh vs mature, with the
// direction-A sheet injected (the cascade the built sheet + primitives.css produce).
import { exe, url } from "./probe-48.mjs";

const seedFresh = readFileSync("work/evidence/UI-RESET-46/scenario-opening.json", "utf8");
const seedMature = readFileSync("work/evidence/UI-RESET-46/scenario-mature.json", "utf8");
const sheetA = readFileSync("work/evidence/UI-RESET-46/direction-a.css", "utf8");

const CENSUS = () => {
  const items = [...document.querySelectorAll(".resources__item")];
  return {
    dom: items.length,
    painted: items
      .filter((n) => n.offsetParent !== null && n.getClientRects().length > 0)
      .map((n) => (n.textContent ?? "").trim()),
    slotOfCredits: items.findIndex((n) => (n.textContent ?? "").trim().startsWith("Credits")) + 1,
    paintedSlotOfCredits:
      items.filter((n) => n.offsetParent !== null).findIndex((n) => (n.textContent ?? "").trim().startsWith("Credits")) + 1,
  };
};

const browser = await chromium.launch({ executablePath: exe });
try {
  for (const [name, seed] of [
    ["fresh", seedFresh],
    ["mature", seedMature],
  ]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await context.addInitScript(
      ([k, v]) => window.localStorage.setItem(k, v),
      ["rustwake.save.v1", seed]
    );
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForSelector("text=Begin recovery");
    await page.click("text=Begin recovery");
    await page.waitForSelector(".resources__item");
    await page.waitForTimeout(200);
    const before = await page.evaluate(CENSUS);
    await page.waitForTimeout(600);
    const after = await page.evaluate(CENSUS);
    console.log(name, "sheet=native", JSON.stringify(before));
    await page.evaluate((css) => {
      const el = document.createElement("style");
      el.textContent = css;
      document.head.appendChild(el);
    }, sheetA);
    await page.waitForTimeout(200);
    console.log(name, "withDirectionA", JSON.stringify(await page.evaluate(CENSUS)));
    void after;
    if (!existsSync("work/evidence/UI-RESET-46")) throw new Error("no evidence dir");
    await context.close();
  }
} finally {
  await browser.close();
}
