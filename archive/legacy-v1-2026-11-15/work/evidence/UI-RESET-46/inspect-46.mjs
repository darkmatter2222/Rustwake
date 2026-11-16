import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// UI-RESET/ARTDIR (#46): one-pass digest of measures-46.json plus captures-46.json into
// _m.txt / _c.txt so the spec quotes numbers that are really in the JSON files.
//   node work/evidence/UI-RESET-46/inspect-46.mjs
const dir = "work/evidence/UI-RESET-46";
const m = JSON.parse(readFileSync(resolve(dir, "measures-46.json"), "utf8"));
const out = [];
for (const b of Object.keys(m.bands)) {
  for (const s of Object.keys(m.bands[b])) {
    const f = m.bands[b][s].frames.rest;
    out.push([b, s, "ink=" + [f.ink.cssX, f.ink.cssY, f.ink.cssW, f.ink.cssH].join(","), "cover=" + f.inkCoverPct, "chips=" + f.chips, "rows=" + f.chipRows, "rowTops=" + JSON.stringify(f.chipRowTops), "u44=" + f.facesUnder44].join(" | "));
  }
}
writeFileSync(resolve(dir, "_m.txt"), out.join(String.fromCharCode(10)));

const c = JSON.parse(readFileSync(resolve(dir, "captures-46.json"), "utf8"));
const r = [];
for (const x of c.captures) {
  const q = x.composition || {};
  const ink = q.ink ? [q.ink.cssX, q.ink.cssY, q.ink.cssW, q.ink.cssH].join(",") : "-";
  r.push([x.file, "tick=" + x.tick, "mach=" + x.machines, "tut=" + x.tutorial, "ink=" + ink, "cover=" + (q.inkCoverPct ?? "-"), "u44=" + (q.facesUnder44 ?? "-"), "chips=" + String(x.chips ?? "").replace(/\s+/g, " ").slice(0, 58), "panel=" + (x.panel ? String(x.panel).replace(/\s+/g, " ").slice(0, 44) : "-"), "aff=" + (x.afford ? x.afford.length : 0)].join(" | "));
}
const png = readdirSync(resolve(dir, "captures")).filter((f) => f.endsWith(".png"));
r.push("PNGCOUNT=" + png.length);
r.push("PNGS=" + png.join(","));
writeFileSync(resolve(dir, "_c.txt"), r.join(String.fromCharCode(10)));
console.log("digest written");
