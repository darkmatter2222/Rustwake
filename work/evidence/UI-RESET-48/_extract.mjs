import fs from "node:fs";
const base = "work/evidence/";
const m45 = JSON.parse(fs.readFileSync(base + "UI-RESET-45/measures.json", "utf8"));
const m46 = JSON.parse(fs.readFileSync(base + "UI-RESET-46/measures-46.json", "utf8"));

const brief = (r) => (r ? `${r.x},${r.y} ${r.w}x${r.h}` : null);

console.log("=== #45 measures.json (shipped shell, six viewports) ===");
for (const [label, v] of Object.entries(m45.out)) {
  const rest = v.rest ?? v.frames?.rest ?? v;
  const frame = v.rest ? v : (v.frames ? v.frames.rest : null);
  const keys = Object.keys(v);
  console.log(label, "keys:", keys.join(","));
  const f = frame && frame.rects ? frame : null;
  if (f) {
    console.log("  rects:", Object.fromEntries(Object.entries(f.rects).map(([k, r]) => [k, brief(r)])));
    console.log("  chipRows", f.chipRows, "chips", f.chips, "rowTops", JSON.stringify(f.chipRowTops), "facesUnder44", f.facesUnder44);
    console.log("  ink", JSON.stringify(f.ink), "cover", f.inkCoverPct);
  }
}

console.log("=== #46 measures-46.json: A sheet only, per band ===");
for (const [band, sheetset] of Object.entries(m46.bands)) {
  const A = sheetset.A;
  if (!A) continue;
  for (const [frame, d] of Object.entries(A.frames)) {
    console.log(band, frame, "rects", JSON.stringify(Object.fromEntries(Object.entries(d.rects).map(([k, r]) => [k, brief(r)]))));
    console.log("   chipRows", d.chipRows, "chips", d.chips, "rowTops", JSON.stringify(d.chipRowTops), "u44", d.facesUnder44, "cover", d.inkCoverPct, "scroll", JSON.stringify(d.panelScroll), "prices", JSON.stringify(d.pricePrints));
    console.log("   dock", JSON.stringify(d.dockLabels));
    const minpx = Math.min(...d.fonts.map((x) => x.px));
    const sizes = [...new Set(d.fonts.map((x) => x.px))].sort((a, b) => a - b);
    console.log("   fontsizes", JSON.stringify(sizes));
  }
}
