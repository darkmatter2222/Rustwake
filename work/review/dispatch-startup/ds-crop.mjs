// Nearest-neighbour crop of a capture, for silhouette inspection at zoom.
// Usage: node ds-crop.mjs <in.png> <x> <y> <w> <h> <scale> <out.png>
import { chromium } from "playwright-core";
import { existsSync, readFileSync } from "node:fs";

const [inFile, x, y, w, h, scale, outFile] = process.argv.slice(2);
const exe = [
  process.env.CHROME_PATH,
  "C:\\Users\\ryans\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe",
].filter(Boolean).find((p) => existsSync(p));
const b64 = readFileSync(inFile).toString("base64");
const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage();
await page.setContent(
  `<img id="s" src="data:image/png;base64,${b64}"><canvas id="c"></canvas>`
);
const dataUrl = await page.evaluate(
  ([sx, sy, sw, sh, sc]) => {
    const src = document.getElementById("s");
    const c = document.getElementById("c");
    c.width = Number(sw) * Number(sc);
    c.height = Number(sh) * Number(sc);
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, Number(sx), Number(sy), Number(sw), Number(sh), 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  },
  [x, y, w, h, scale]
);
const fs = await import("node:fs");
fs.writeFileSync(outFile, Buffer.from(dataUrl.split(",")[1], "base64"));
await browser.close();
console.log(`wrote ${outFile}`);
