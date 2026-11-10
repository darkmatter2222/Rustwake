import fs from "node:fs";
const m45 = JSON.parse(fs.readFileSync("work/evidence/UI-RESET-45/measures.json", "utf8"));
const brief = (r) => (r ? `${r.x},${r.y} ${r.w}x${r.h}` : null);
for (const [label, frames] of Object.entries(m45.out)) {
  console.log("##", label, "head", m45.headSha);
  for (const [fname, d] of Object.entries(frames)) {
    const rects = d.rects ?? {};
    const line = Object.entries(rects).map(([k, r]) => `${k}=${brief(r)}`).join("  ");
    console.log(` ${fname}: ${line}`);
    console.log(`   chips=${d.chips} rows=${d.chipRows} tops=${JSON.stringify(d.chipRowTops)} u44=${d.facesUnder44} ink=${JSON.stringify(d.ink)} cover=${d.inkCoverPct}`);
    if (d.dockLabels) console.log("   dock", JSON.stringify(d.dockLabels));
    if (d.chipLabels) console.log("   chipLabels", JSON.stringify(d.chipLabels));
    if (d.panelScroll) console.log("   scroll", JSON.stringify(d.panelScroll));
    if (d.pricePrints) console.log("   prices", JSON.stringify(d.pricePrints));
    if (d.fonts) console.log("   sizes", JSON.stringify([...new Set(d.fonts.map((x) => x.px))].sort((a, b) => a - b)));
  }
}
