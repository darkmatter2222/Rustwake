// PLAYER-004 g1: legibility census across the text scales at 390 px.
// Records font size, contrast against the painted backdrop, and tap-target heights.
// Usage: node work/feedback/PLAYER-004-g1/legibility.mjs
import { BASE, openMobile } from "./lib.mjs";
import { writeFileSync } from "node:fs";

const OUT = "work/feedback/PLAYER-004-g1/";
const { page } = await openMobile();
await page.getByRole("button", { name: /^Begin recovery/ }).click({ force: true });
for (let i = 0; i < 12; i++) {
  const p = page.locator(".dock__btn--primary");
  if ((await p.count()) > 0) await p.first().click({ force: true });
  await page.waitForTimeout(1000);
}

const measure = () =>
  page.evaluate(() => {
    const lum = (c) => {
      const m = /rgba?\((\d+), *(\d+), *(\d+)(?:, *([\d.]+))?\)/.exec(c);
      if (!m) return null;
      const f = (v) => {
        const s = Number(v) / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(m[1]) + 0.7152 * f(m[2]) + 0.0722 * f(m[3]);
    };
    const bgOf = (n) => {
      let p = n;
      while (p) {
        const c = getComputedStyle(p).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c;
        p = p.parentElement;
      }
      return getComputedStyle(document.body).backgroundColor;
    };
    const ratio = (fg, bg) => {
      const l1 = lum(fg) || 0;
      const l2 = lum(bg) || 0;
      return Number((((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05))).toFixed(2));
    };
    const rows = [];
    const want = [
      [".objective__primary", "objective"],
      [".objective .status-line", "status-line"],
      [".dock__btn", "dock btn"],
      [".dock__cost", "dock cost"],
      [".resources__item", "resource chip"],
      [".icon-btn", "icon btn"],
      [".panel__row", "panel row"],
      [".node__effect", "research effect"],
      [".node__cost", "research cost"],
      [".toast", "toast"],
    ];
    for (const pair of want) {
      const sel = pair[0];
      const name = pair[1];
      for (const n of Array.from(document.querySelectorAll(sel)).slice(0, 3)) {
        const cs = getComputedStyle(n);
        const r = n.getBoundingClientRect();
        const bg = bgOf(n);
        rows.push({
          name,
          text: (n.textContent || "").slice(0, 44),
          px: Number(parseFloat(cs.fontSize).toFixed(2)),
          h: Number(r.height.toFixed(1)),
          w: Number(r.width.toFixed(1)),
          color: cs.color,
          bg,
          contrast: ratio(cs.color, bg),
          clipped: n.scrollWidth > Math.ceil(r.width) + 0.5,
        });
      }
    }
    const targets = Array.from(document.querySelectorAll(".dock .dock__btn, .hud .icon-btn")).map((n) => ({
      text: (n.textContent || "").slice(0, 26),
      h: Number(n.getBoundingClientRect().height.toFixed(1)),
      w: Number(n.getBoundingClientRect().width.toFixed(1)),
    }));
    return {
      scaleClass: document.querySelector(".text-large") ? "large" : "default",
      cluster: Array.from(document.querySelectorAll(".hud .icon-btn")).map((n) => n.textContent).join(" | "),
      docH: document.documentElement.scrollHeight,
      vh: window.innerHeight,
      rows,
      targets,
    };
  });

const steps = [];
steps.push({ label: "step1", m: await measure() });
await page.screenshot({ path: OUT + "11-legibility-step1.png" });
for (const n of ["step2", "step3"]) {
  const btn = page.locator(".hud .icon-btn", { hasText: "A " });
  if ((await btn.count()) > 0) await btn.first().click({ force: true });
  await page.waitForTimeout(350);
  steps.push({ label: n, m: await measure() });
  await page.screenshot({ path: OUT + "11-legibility-" + n + ".png" });
}
writeFileSync(OUT + "legibility.json", JSON.stringify(steps, null, 1), "utf8");
for (const s of steps) {
  console.log(s.label, "class=" + s.m.scaleClass, "cluster=[" + s.m.cluster + "]", "docH=" + s.m.docH, "vh=" + s.m.vh);
  console.log(
    "   " +
      s.m.rows
        .map((r) => r.name + ":" + r.px + "px/h" + r.h + "/c" + r.contrast + (r.clipped ? "/CLIPPED" : ""))
        .join("  "),
  );
  console.log(
    "   targets " + s.m.targets.map((t) => t.text + ":" + t.h + "x" + t.w).join(" | "),
  );
}
await page.context().browser().close();
