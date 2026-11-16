import fs from "node:fs";

// Census of every painted rect height in the two measured files, so the README can say which
// disputed number actually appears in a measurement (run: node work/evidence/UI-RESET-48/_census.mjs)
const files = {
  "UI-RESET-45/measures.json": JSON.parse(fs.readFileSync("work/evidence/UI-RESET-45/measures.json", "utf8")),
  "UI-RESET-46/measures-46.json": JSON.parse(fs.readFileSync("work/evidence/UI-RESET-46/measures-46.json", "utf8")),
};
const heights = new Set();
const widths = new Set();
const walk = (node) => {
  if (!node || typeof node !== "object") return;
  if (!Array.isArray(node) && typeof node.h === "number") heights.add(node.h);
  if (!Array.isArray(node) && typeof node.w === "number") widths.add(node.w);
  for (const v of Object.values(node)) walk(v);
};
for (const f of Object.values(files)) walk(f);
const sorted = [...heights].sort((a, b) => a - b);
const sortedW = [...widths].sort((a, b) => a - b);
console.log("distinct rect heights in both measured files:", JSON.stringify(sorted));
console.log("distinct rect widths in both measured files:", JSON.stringify(sortedW));
for (const probe of [96, 134, 91, 23, 48, 73, 56, 54, 320, 348, 262, 538, 445]) {
  console.log(probe, "h:" + (sorted.includes(probe) ? "PRESENT" : "absent"), "w:" + (sortedW.includes(probe) ? "PRESENT" : "absent"));
}
