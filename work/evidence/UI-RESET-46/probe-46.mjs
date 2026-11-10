import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// UI-RESET/ARTDIR (#46): shared harness helpers for the two composed directions.
// From this worktree root:
//   node node_modules/vite/bin/vite.js build
//   node node_modules/vite/bin/vite.js preview --port 4177 --strictPort
//   node work/evidence/UI-RESET-46/measure-46.mjs
//   node work/evidence/UI-RESET-46/capture-46.mjs
// The real build paints every frame. A direction is one extra author-token sheet
// (direction-*.css in this folder) injected after the built sheet: the same cascade a
// token rewrite in src/ui/styles.css produces. No game code is touched.

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const dir = resolve(root, "work/evidence/UI-RESET-46");
export const url = process.env.RUSTWAKE_URL ?? "http://localhost:4177/";
export const exe = [process.env.CHROME_PATH, "C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe", "C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe"].filter(Boolean).find((x) => existsSync(x));
export const seedText = readFileSync(resolve(root, "docs/evidence/yard-mature.json"), "utf8");

// Bands whose geometry #45 measured (UI-RESET-45/measures.json). Both direction sheets
// carry these numbers as their per-band insets: composition is fixed from measurement.
export const BANDS = {
  "390x844": { inkBefore: [8, 154, 374, 561], chrome: "one column: rail / sheet / dock" },
  "844x390": { inkBefore: [307, 28, 230, 346], chrome: "two side rails + dock" },
  "1366x768": { inkBefore: [414, 0, 536, 766], chrome: "left rail + right plate" },
  "1920x1080": { inkBefore: [576, 20, 766, 1022], chrome: "left rail + right plate" },
  "2560x1440": { inkBefore: [896, 168, 766, 1150], chrome: "left rail + right plate" },
};


export const PROBE = () => {
  const box = (s) => { const n = document.querySelector(s); if (!n) return null; const r = n.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const canvas = document.querySelector("canvas");
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  let world = null;
  if (canvas) {
    const ctx = canvas.getContext("2d");
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1, ink = 0;
    for (let y = 0; y < canvas.height; y += 2) {
      for (let x = 0; x < canvas.width; x += 2) {
        const i = (y * canvas.width + x) * 4;
        if (img[i] > 14 || img[i + 1] > 24 || img[i + 2] > 40) {
          ink += 1;
          if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    world = { cssX: Math.round(minX / dpr), cssY: Math.round(minY / dpr), cssW: Math.round((maxX - minX) / dpr), cssH: Math.round((maxY - minY) / dpr), inkSamples: ink, fillOfFramePct: Math.round((ink / ((canvas.width / 2) * (canvas.height / 2))) * 1000) / 10 };
  }
  const de = document.documentElement;
  const chips = [...document.querySelectorAll(".resources__item")].map((n) => { const r = n.getBoundingClientRect(); return { text: (n.textContent ?? "").trim(), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; });
  const rows = [...new Set(chips.filter((c) => c.h > 0).map((c) => c.y))].sort((a, b) => a - b);
  const fonts = [".resources__item", ".objective__primary", ".status-line", ".dock__btn", ".dock__cost", ".panel dt", ".panel dd", ".panel__title", ".node__title", ".node__cost", ".icon-btn"].flatMap((sel) => [...document.querySelectorAll(sel)].map((n) => ({ cls: String(n.className), px: Math.round(parseFloat(getComputedStyle(n).fontSize) * 100) / 100 })));
  const targets = [...document.querySelectorAll("button")].map((n) => { const r = n.getBoundingClientRect(); const cs = getComputedStyle(n); return { label: (n.textContent ?? "").trim().slice(0, 32), w: Math.round(r.width), h: Math.round(r.height), under44: r.width < 44 || r.height < 44, disabled: n.disabled === true, opacity: cs.opacity, afford: n.getAttribute("data-afford") ?? null, radius: cs.borderRadius, borderStyle: cs.borderStyle }; });
  const prices = [...document.querySelectorAll(".objective, .panel, .dock")].flatMap((n) => (n.textContent ?? "").match(/\d+(?:\.\d+)?\s*(?:credits|scrap|Data)/g) ?? []);
  const pricePrints = {};
  for (const p of prices) pricePrints[p] = (pricePrints[p] ?? 0) + 1;
  const body = document.querySelector(".panel__body");
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight, dpr },
    docScroll: { scrollW: de.scrollWidth, clientW: de.clientWidth, scrollH: de.scrollHeight, clientH: de.clientHeight },
    rects: { top: box(".hud__top"), chips: box(".resources"), cluster: box(".cluster"), objective: box(".objective"), dock: box(".dock"), panel: box(".panel"), toast: box(".toast"), canvas: box("canvas") },
    world,
    chips: { count: chips.filter((c) => c.h > 0).length, items: chips, rows: rows.length, rowTops: rows },
    dockLabels: [...document.querySelectorAll(".dock__btn")].map((n) => (n.textContent ?? "").trim()),
    panelScroll: body ? { clientH: Math.round(body.clientHeight), scrollH: Math.round(body.scrollHeight), innerScrollPx: Math.round(body.scrollHeight - body.clientHeight) } : null,
    fonts, targets, pricePrints,
  };
};


// FNV-1a re-checksum so a patched envelope still loads (identical to #45).
export const install = (ctx, text, mut) => ctx.addInitScript(([raw, m]) => {
  const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); };
  const env = JSON.parse(raw);
  if (m) {
    for (const [p, value] of Object.entries(JSON.parse(m))) {
      let node = env;
      const parts = p.split(".");
      for (const q of parts.slice(0, -1)) node = node[q];
      node[parts[parts.length - 1]] = value;
    }
    env.checksum = fnv(JSON.stringify(env.payload));
  }
  localStorage.setItem("rustwake.save.v1", JSON.stringify(env));
}, [text, mut ? JSON.stringify(mut) : null]);

// Harness stand-in for the one-line JS spec 65 asks for: the face own price is compared
// with the purse printed in the chip row and the result becomes data-afford. The sheet
// does the painting; the harness only classifies, as that future App.tsx line will.
export const applyAfford = (page) => page.evaluate(() => {
  const purse = {};
  for (const el of document.querySelectorAll(".resources__item")) {
    const m = /\s*([A-Za-z][A-Za-z ]*?)\s*([0-9.]+)\s*$/.exec((el.textContent ?? "").trim());
    if (m) purse[m[1].trim().toLowerCase()] = Number(m[2]);
  }
  const out = [];
  for (const b of document.querySelectorAll(".dock__btn, .panel .icon-btn")) {
    const text = (b.textContent ?? "").trim();
    const m = /([0-9.]+)\s*(credits|scrap|Data|Ferrous|Nonferrous)/i.exec(text);
    if (!m) continue;
    const key = m[2].toLowerCase();
    const have = purse[key];
    const need = Number(m[1]);
    if (typeof have !== "number") continue;
    const short = need > have;
    b.setAttribute("data-afford", short ? "short" : "ok");
    out.push({ label: text.slice(0, 36), need, unit: key, have, short });
  }
  return { purse, faces: out };
});

export const byText = (page, label, sel = "button") => page.evaluate(([t, s]) => { const n = [...document.querySelectorAll(s)].find((x) => (x.textContent ?? "").trim().startsWith(t)); if (!n) return false; n.click(); return true; }, [label, sel]);
export const dock = (page, label) => byText(page, label, ".dock__btn");
export const tap = async (page, sel) => { const n = await page.$(sel); if (!n) return false; await n.click(); return true; };

// Coarse tap grid: the canvas has no DOM hit targets (#45 J2 defect 1).
export const selectMachine = async (page, x0, x1, y0, y1) => {
  for (let y = y0; y <= y1; y += 20) {
    for (let x = x0; x <= x1; x += 20) {
      await page.mouse.click(x, y);
      const t = await page.evaluate(() => document.querySelector(".panel")?.textContent ?? null);
      if (t) return t;
    }
  }
  return null;
};

// Percent of the ink bbox covered by chrome boxes.
export const inkCover = (world, rects) => {
  if (!world || world.cssW <= 0 || world.cssH <= 0) return null;
  const step = 2;
  const cells = (Math.floor(world.cssW / step) + 1) * (Math.floor(world.cssH / step) + 1);
  const boxes = Object.entries(rects).filter(([name, r]) => r && name !== "canvas").map(([, r]) => [r.x, r.y, r.x + r.w, r.y + r.h]);
  let covered = 0;
  for (let y = world.cssY; y <= world.cssY + world.cssH; y += step) {
    for (let x = world.cssX; x <= world.cssX + world.cssW; x += step) {
      if (boxes.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1)) covered += 1;
    }
  }
  return { coverPct: Math.round((covered / cells) * 1000) / 10 };
};

// Per-box intersection with the ink bbox (chrome painted on top of the world).
export const inkOverlap = (world, rects) => {
  if (!world) return null;
  const ix0 = world.cssX, iy0 = world.cssY, ix1 = world.cssX + world.cssW, iy1 = world.cssY + world.cssH;
  const inkArea = (ix1 - ix0) * (iy1 - iy0);
  const out = {};
  for (const [name, r] of Object.entries(rects)) {
    if (!r || name === "canvas") continue;
    const w = Math.max(0, Math.min(r.x + r.w, ix1) - Math.max(r.x, ix0));
    const h = Math.max(0, Math.min(r.y + r.h, iy1) - Math.max(r.y, iy0));
    out[name] = { overlapPx: Math.round(w * h), overlapPctOfInk: Math.round(((w * h) / inkArea) * 1000) / 10 };
  }
  return out;
};

// One compact line per frame: what the composition check measured.
export const summary = (probe) => ({
  viewport: probe.viewport,
  rects: probe.rects,
  ink: probe.world,
  inkCoverPct: inkCover(probe.world, probe.rects)?.coverPct ?? null,
  overlap: inkOverlap(probe.world, probe.rects),
  chips: probe.chips?.count ?? null,
  chipRows: probe.chips?.rows ?? null,  chipLabels: (probe.chips?.items ?? []).filter((c) => c.h > 0).map((c) => c.text),
  chipRowTops: probe.chips?.rowTops ?? null,
  dockLabels: probe.dockLabels,
  panelScroll: probe.panelScroll,  fonts: probe.fonts,
  facesUnder44: probe.targets.filter((t) => t.under44).length,
  pricePrints: probe.pricePrints,
});







