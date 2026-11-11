import { readFileSync, writeFileSync } from "node:fs";
const m = JSON.parse(readFileSync("work/evidence/UI-RESET-46/measures-46.json", "utf8"));
const f = (n) => (n ? [n.x, n.y, n.w, n.h].join(",") : "-");
const L = [];
for (const b of Object.keys(m.bands)) {
  for (const s of Object.keys(m.bands[b])) {
    const r = m.bands[b][s];
    for (const k of ["rest", "machine", "store"]) {
      const x = r.frames[k];
      const px = x.fonts.map((v) => v.px);
      L.push([b, s, k, "panel=" + f(x.rects.panel), "cluster=" + f(x.rects.cluster), "dock=" + f(x.rects.dock), "obj=" + f(x.rects.objective), "chipsR=" + f(x.rects.chips), "fontMin=" + Math.min(...px), "fontMax=" + Math.max(...px), "scroll=" + (x.panelScroll ? x.panelScroll.innerScrollPx : "-"), "price=" + JSON.stringify(x.pricePrints)].join(" | "));
    }
  }
}
writeFileSync("work/evidence/UI-RESET-46/_x.txt", L.join(String.fromCharCode(10)));
console.log("x written");

