import { chromium } from "playwright-core";
import { exe, openSlice, VIEWPORTS } from "./probe-48.mjs";

// Where each painted block and primitive actually sits at one band (run:
//   node work/evidence/UI-RESET-48/_rects.mjs)
const browser = await chromium.launch({ executablePath: exe });
try {
  const { context, page } = await openSlice(browser, VIEWPORTS[1]);
  const rects = await page.evaluate(() => {
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
    };
    const de = document.documentElement;
    return {
      docHeight: de.scrollHeight,
      rootHeight: Math.round(document.querySelector(".wk-root")?.getBoundingClientRect().height ?? 0),
      gallery: box(document.querySelector(".wk-gallery")),
      blocks: [...document.querySelectorAll(".wk-gallery__block")].map(box),
      sheets: [...document.querySelectorAll(".wk-sheet")].map((el) => ({
        title: el.querySelector(".wk-sheet__title")?.textContent,
        box: box(el),
      })),
      dialog: box(document.querySelector(".wk-dialog")),
      lanes: [...document.querySelectorAll(".wk-toast-lane")].map(box),
    };
  });
  console.log(JSON.stringify(rects, null, 1));
  await context.close();
} finally {
  await browser.close();
}
