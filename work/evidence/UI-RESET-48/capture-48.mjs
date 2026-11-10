import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PROBE, VIEWPORTS, dir, exe, openGame, openSlice } from "./probe-48.mjs";

// UI-RESET/TOKENS (#48): the painted receipts, all at the exact measured band.
//   `wk-<band>-<mode>[-a|-b].png`  the primitive sheet in one mode, the band size, the root
//       scroller at the top (-a) and at the bottom (-b) so every state is on an image without
//       ever faking the frame height;
//   `game-<band>.png`              the shipped shell at the same band (the in-game slice);
//   `wk-390x844-focus.png`         the keyboard ring on a focused face.
//   node work/evidence/UI-RESET-48/capture-48.mjs   -> captures/*.png + captures-48.json
const shots = resolve(dir, "captures");
mkdirSync(shots, { recursive: true });
const receipt = [];
const browser = await chromium.launch({ executablePath: exe });

/** Scrolls the gallery root and reports the painted offsets, so nothing is invented. */
const scrollRoot = (page, top) =>
  page.evaluate(([t]) => {
    const root = document.querySelector(".wk-root");
    if (root) root.scrollTop = t;
    return root
      ? { scrollTop: Math.round(root.scrollTop), clientH: Math.round(root.clientHeight), scrollH: Math.round(root.scrollHeight) }
      : null;
  }, [top]);

try {
  for (const vp of VIEWPORTS) {
    for (const [mode, options, note] of [
      ["states", {}, "every primitive in every state"],
      ["scale2", { scale: 2 }, "the same sheet at 200 % text"],
      ["reduced", { reduced: true }, "prefers-reduced-motion: reduce, all transitions none"],
    ]) {
      const { context, page } = await openSlice(browser, vp, options);
      const measured = await page.evaluate(PROBE);
      // top of the sheet, always
      const top = await scrollRoot(page, 0);
      await page.screenshot({ path: resolve(shots, `wk-${vp.key}-${mode}-a.png`) });
      const first = { file: `wk-${vp.key}-${mode}-a.png`, note: `${note} at ${vp.key}, scroll top`, measured, scroll: top };
      if (mode === "reduced") {
        first.reducedMotion = {
          matches: measured.reducedMotion,
          durations: Array.from(new Set(measured.faces.map((f) => f.transitionDuration))),
          timings: Array.from(new Set(measured.faces.map((f) => f.transitionTiming))),
          steppedCount: measured.steppedFaces,
        };
      }
      receipt.push(first);
      console.log(`wk-${vp.key}-${mode}-a.png - ${note} at ${vp.key} (top)`);
      // the rest of the sheet, only when it does not fit the band
      if (top && top.scrollH > top.clientH + 1) {
        const bottom = await scrollRoot(page, top.scrollH);
        await page.screenshot({ path: resolve(shots, `wk-${vp.key}-${mode}-b.png`) });
        receipt.push({ file: `wk-${vp.key}-${mode}-b.png`, note: `${note} at ${vp.key}, scrolled to the bottom`, scroll: bottom });
        console.log(`wk-${vp.key}-${mode}-b.png - ${note} at ${vp.key} (bottom)`);
      }
      await context.close();
    }
    // the in-game component slice, in the shipped shell with the same cascade loaded
    {
      const { context, page } = await openGame(browser, vp);
      await page.screenshot({ path: resolve(shots, `game-${vp.key}.png`) });
      receipt.push({
        file: `game-${vp.key}.png`,
        note: `shipped shell at ${vp.key}: chip band, objective card, dock (the same cascade, no flag)`,
        dockLabels: await page.evaluate(() =>
          [...document.querySelectorAll(".dock__btn")].map((n) => (n.textContent ?? "").trim())
        ),
      });
      console.log(`game-${vp.key}.png - shipped shell at ${vp.key}`);
      await context.close();
    }
  }
  // the keyboard ring, painted rather than inferred
  {
    const { context, page } = await openSlice(browser, VIEWPORTS[1], {});
    await page.focus(".wk-face");
    const measured = await page.evaluate(PROBE);
    await page.screenshot({ path: resolve(shots, "wk-390x844-focus.png") });
    receipt.push({
      file: "wk-390x844-focus.png",
      note: "keyboard focus on the first face, 390x844",
      focusRing: measured.focusRing,
    });
    console.log("wk-390x844-focus.png - focus ring " + JSON.stringify(measured.focusRing));
    await context.close();
  }
  writeFileSync(
    resolve(dir, "captures-48.json"),
    JSON.stringify(
      {
        task: "UI-RESET/TOKENS #48 painted receipts",
        issue: "https://github.com/darkmatter2222/Rustwake/issues/48",
        bands: VIEWPORTS.map((v) => v.key),
        note: "every image is at the exact measured band; -a is the root scroller at the top, -b at the bottom, so all seven states are receipted without faking a frame height",
        captures: receipt,
      },
      null,
      2
    ) + "\n"
  );
  console.log(`wrote ${receipt.length} receipts into captures-48.json`);
} finally {
  await browser.close();
}
