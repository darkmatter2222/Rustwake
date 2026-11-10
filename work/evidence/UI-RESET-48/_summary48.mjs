import fs from "node:fs";
const m = JSON.parse(fs.readFileSync("work/evidence/UI-RESET-48/measures-48.json", "utf8"));
for (const [band, frames] of Object.entries(m.bands)) {
  for (const [frame, d] of Object.entries(frames)) {
    const dur = [...new Set(d.faces.map((x) => x.transitionDuration + " " + x.transitionTiming))];
    const styles = [...new Set(d.faces.map((x) => x.borderTopStyle + "/" + x.borderTopWidth + "/o" + x.opacity))];
    const states = [...new Set(d.faces.map((x) => x.state + "|" + x.afford))];
    console.log(`## ${band} ${frame}`);
    console.log(`  faces=${d.faces.length} u44=${d.facesUnder44} at46=${d.facesAt46} stepped=${d.steppedFaces} sheet=${d.sheetHeight} lane=${JSON.stringify(d.laneBox)} toastRole=${d.toastRole} textScale=${d.textScale} docScroll=${JSON.stringify(d.docScroll)}`);
    console.log(`  durations=${JSON.stringify(dur)}`);
    console.log(`  borderStyles=${JSON.stringify(styles)}`);
    console.log(`  states=${JSON.stringify(states)}`);
    console.log(`  prices=${JSON.stringify(d.prices)}`);
    console.log(`  data=${JSON.stringify(d.dataNodes.slice(0, 2))} n=${d.dataNodes.length}`);
    console.log(`  clipped=${JSON.stringify(d.clipped)} focus=${JSON.stringify(d.focusRing)} dialogs=${JSON.stringify(d.dialogs)}`);
    console.log(`  gallery=${JSON.stringify(d.gallery)} lines=${JSON.stringify(d.labelLineCounts)}`);
  }
}
