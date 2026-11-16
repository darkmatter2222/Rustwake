import fs from "node:fs";
const m = JSON.parse(fs.readFileSync("work/evidence/UI-RESET-48/measures-48.json", "utf8"));
const b = m.bands["390x844"].scale1;
for (const f of b.faces) {
  console.log(
    [
      `state=${f.state}`,
      `afford=${f.afford}`,
      `h=${f.h}`,
      `w=${f.w}`,
      `minH=${f.minHeight}`,
      `border=${f.borderTopStyle}/${f.borderWidth}`,
      `opacity=${f.opacity}`,
      `dur=${f.transitionDuration} ${f.transitionTiming}`,
      `disabled=${f.disabled}`,
      `txt=${f.label}`,
    ].join(" ")
  );
}
console.log("dataNodes uniq:", JSON.stringify([...new Map(b.dataNodes.map((d) => [d.font + "|" + d.variant, 1])).keys()]));
console.log("toast lane:", JSON.stringify(b.laneBox), "toast:", JSON.stringify(b.toastBox), "role", b.toastRole);
console.log("gallery:", JSON.stringify(b.gallery), "sheetHeight", b.sheetHeight);
