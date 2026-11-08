// PLAYER-004 g1: how much of the 390x844 screen is actually used, rest vs panel open.
// Usage: node work/feedback/PLAYER-004-g1/space.mjs
import { BASE, openMobile } from "./lib.mjs";
import { writeFileSync } from "node:fs";

const OUT = "work/feedback/PLAYER-004-g1/";
const { page } = await openMobile();
await page.getByRole("button", { name: /^Begin recovery/ }).click({ force: true });
for (let i = 0; i < 14; i++) {
  const p = page.locator(".dock__btn--primary");
  if ((await p.count()) > 0) await p.first().click({ force: true });
  await page.waitForTimeout(1000);
}

const probe = () =>
  page.evaluate(() => {
    const c = document.querySelector("canvas");
    const ctx = c.getContext("2d");
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    let minX = 1e9,
      maxX = -1,
      minY = 1e9,
      maxY = -1;
    const rowLit = new Array(c.height).fill(0);
    for (let y = 0; y < c.height; y += 2) {
      for (let x = 0; x < c.width; x += 2) {
        const i = (y * c.width + x) * 4;
        if (d[i] + d[i + 1] + d[i + 2] > 90) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          rowLit[y] = 1;
        }
      }
    }
    // largest blank band inside the canvas element
    let best = 0,
      run = 0,
      bestStart = 0,
      start = 0;
    for (let y = 0; y < c.height; y++) {
      if (!rowLit[y]) {
        if (run === 0) start = y;
        run++;
        if (run > best) ((best = run), (bestStart = start));
      } else run = 0;
    }
    const css = (v) => Number((v / (c.height / c.clientHeight)).toFixed(1));
    const rect = (sel) => {
      const n = document.querySelector(sel);
      if (!n) return null;
      const r = n.getBoundingClientRect();
      return { y: Number(r.y.toFixed(1)), h: Number(r.height.toFixed(1)) };
    };
    return {
      canvasCss: { w: c.clientWidth, h: c.clientHeight },
      contentBoxCss: minY <= -1 ? null : { x: css(minX), y: css(minY), w: css(maxX - minX), h: css(maxY - minY) },
      blankBandCss: { height: css(best), fromY: css(bestStart) },
      objective: rect(".objective"),
      dock: rect(".dock"),
      panel: rect(".panel"),
      // 1 px CSS is 2 device px here
      dpr: window.devicePixelRatio,
    };
  });

const rest = await probe();
await page.screenshot({ path: OUT + "12-space-rest.png" });
const store = page.locator(".dock .dock__btn", { hasText: "Store" });
let withPanel = null;
if ((await store.count()) > 0) {
  await store.first().click({ force: true });
  await page.waitForTimeout(400);
  withPanel = await probe();
  await page.screenshot({ path: OUT + "12-space-panel.png" });
}
const out = { url: BASE, rest, withPanel };
writeFileSync(OUT + "space.json", JSON.stringify(out, null, 1), "utf8");
console.log(JSON.stringify(out, null, 1));
await page.context().browser().close();
