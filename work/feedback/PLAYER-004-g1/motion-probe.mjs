// PLAYER-004 g1: motion evidence for drone/cargo interpolation.
// Plays the yard until machines are running, then samples consecutive animation frames
// inside one page.evaluate: per-frame amber centroid + painted-pixel signature.
// Usage: node work/feedback/PLAYER-004-g1/motion-probe.mjs
import { BASE, openMobile, SNAP } from "./lib.mjs";
import { writeFileSync } from "node:fs";

const OUT = "work/feedback/PLAYER-004-g1/";
const { page } = await openMobile();
await page.getByRole("button", { name: /^Begin recovery/ }).click({ force: true });
for (let i = 0; i < 55; i++) {
  const p = page.locator(".dock__btn--primary");
  if ((await p.count()) > 0) await p.first().click({ force: true });
  await page.waitForTimeout(1000);
}
const before = await page.evaluate(SNAP);

const frames = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const c = document.querySelector("canvas");
      const ctx = c.getContext("2d");
      const out = [];
      const step = (t) => {
        const img = ctx.getImageData(0, 0, c.width, c.height);
        const d = img.data;
        let n = 0,
          sx = 0,
          sy = 0,
          lit = 0;
        for (let y = 0; y < c.height; y += 2) {
          for (let x = 0; x < c.width; x += 2) {
            const i = (y * c.width + x) * 4;
            const r = d[i],
              g = d[i + 1],
              b = d[i + 2];
            if (r + g + b > 90) lit++;
            if (r > 200 && g > 140 && g < 215 && b < 130) {
              n++;
              sx += x;
              sy += y;
            }
          }
        }
        out.push({
          t: +t.toFixed(2),
          amber: n,
          cx: n ? +(sx / n).toFixed(2) : null,
          cy: n ? +(sy / n).toFixed(2) : null,
          lit,
        });
        if (out.length < 12) requestAnimationFrame(step);
        else resolve(out);
      };
      requestAnimationFrame(step);
    }),
);

const stills = [];
for (let f = 1; f <= 6; f++) {
  await page.screenshot({ path: `${OUT}clip-${String(f).padStart(2, "0")}.png` });
  stills.push(`clip-${String(f).padStart(2, "0")}.png`);
}

const deltas = frames
  .slice(1)
  .map((f, i) => ({
    frame: i + 2,
    dMs: +(f.t - frames[i].t).toFixed(2),
    dCx: f.cx !== null && frames[i].cx !== null ? +(f.cx - frames[i].cx).toFixed(2) : null,
    dCy: f.cy !== null && frames[i].cy !== null ? +(f.cy - frames[i].cy).toFixed(2) : null,
    dAmber: f.amber - frames[i].amber,
    dLit: f.lit - frames[i].lit,
  }));
const fps = frames.length > 1 ? +(((frames.length - 1) * 1000) / (frames[frames.length - 1].t - frames[0].t)).toFixed(1) : null;
const movingFrames = deltas.filter((d) => d.dCx !== 0 || d.dCy !== 0 || d.dLit !== 0).length;

const result = { url: BASE, viewport: "390x844 dpr2", stills, fps, movingFrames, frames, deltas };
writeFileSync(OUT + "motion.json", JSON.stringify(result, null, 1), "utf8");
console.log("sim before motion:", JSON.stringify(before.sim));
console.log("fps", fps, "movingFrames", movingFrames, "of", deltas.length);
console.log(JSON.stringify(frames.map((f) => [f.t, f.amber, f.cx, f.cy, f.lit])));
console.log(JSON.stringify(deltas));
await page.context().browser().close();
