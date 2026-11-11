import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PROBE, VIEWPORTS, dir, exe, openSlice } from "./probe-48.mjs";

// UI-RESET/TOKENS (#48): the painted measurement of the shared primitives at the six bands
// #45 measured, plus the two extra branches the acceptance asks for: text scale 2 (200 %) and
// the prefers-reduced-motion branch.
//   node work/evidence/UI-RESET-48/measure-48.mjs   -> measures-48.json
const browser = await chromium.launch({ executablePath: exe });
const out = {
  task: "UI-RESET/TOKENS #48 painted measurement",
  issue: "https://github.com/darkmatter2222/Rustwake/issues/48",
  headSha: process.env.RUSTWAKE_SHA ?? "see git log -1 --format=%H at run time",
  bands: {},
};
try {
  for (const vp of VIEWPORTS) {
    const frames = {};
    // 1. the sheet at the natural scale
    {
      const { context, page } = await openSlice(browser, vp);
      frames.scale1 = await page.evaluate(PROBE);
      await context.close();
    }
    // 2. 200 % text, no clipping allowed
    {
      const { context, page } = await openSlice(browser, vp, { scale: 2 });
      frames.scale2 = await page.evaluate(PROBE);
      await context.close();
    }
    // 3. the reduced-motion branch, exercised rather than declared
    {
      const { context, page } = await openSlice(browser, vp, { reduced: true });
      frames.reducedMotion = await page.evaluate(PROBE);
      await context.close();
    }
    out.bands[vp.key] = frames;
    const f = frames.scale1;
    const reduced = frames.reducedMotion;
    const durations = Array.from(new Set(reduced.faces.map((x) => x.transitionDuration + " " + x.transitionTiming)));
    console.log(
      vp.key +
        ": faces=" + f.faces.length +
        " under44=" + f.facesUnder44 +
        " at46=" + f.facesAt46 +
        " stepped=" + f.steppedFaces +
        " sheet=" + f.sheetHeight +
        " lines=" + JSON.stringify(f.labelLineCounts) +
        " clipped=" + JSON.stringify(f.clipped) +
        " reducedMatch=" + reduced.reducedMotion +
        " reducedDurations=" + JSON.stringify(durations)
    );
  }
  writeFileSync(resolve(dir, "measures-48.json"), JSON.stringify(out, null, 2) + "\n");
  console.log("wrote measures-48.json");
} finally {
  await browser.close();
}
