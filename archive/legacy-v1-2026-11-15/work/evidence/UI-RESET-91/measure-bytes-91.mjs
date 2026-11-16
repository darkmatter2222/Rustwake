// UI-RESET-91: exact built-asset byte census against the pinned 233000 B entry
// ceiling, plus the base "./" subpath-safety check on dist/index.html.
// Usage (worktree root, after pnpm build):
//   node work/evidence/UI-RESET-91/measure-bytes-91.mjs <output.json> [minHeadroomBytes]
// minHeadroomBytes (e.g. 50000) additionally fails the run when the entry
// headroom is below it; the before/after acceptance check uses 50000.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const CEILING = 233000;
const outPath = process.argv[2];
const minHeadroom = Number(process.argv[3] ?? 0);
if (!outPath) { console.error("usage: measure-bytes-91.mjs <output.json> [minHeadroomBytes]"); process.exit(1); }

const dist = resolve("dist");
const assets = readdirSync(resolve(dist, "assets")).sort();
const files = assets.map((name) => ({ name, bytes: statSync(resolve(dist, "assets", name)).size }));
const pick = (re) => files.find((f) => re.test(f.name)) ?? null;
const entry = pick(/^index-.*\.js$/);
const vendor = pick(/^vendor-.*\.js$/);
const tables = pick(/^tables-.*\.js$/);
const css = pick(/^index-.*\.css$/);
const worker = pick(/^catchup\.worker-.*\.js$/);
const html = readFileSync(resolve(dist, "index.html"), "utf8");
const links = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => u.startsWith("./assets/") || u.startsWith("/assets/") || u.startsWith("assets/"));
const relativeLinks = links.length > 0 && links.every((u) => u.startsWith("./assets/"));
const headroom = entry ? CEILING - entry.bytes : null;

const report = {
  task: "UI-RESET-91 vendor chunk split",
  issue: "https://github.com/darkmatter2222/Rustwake/issues/91",
  measuredAt: new Date().toISOString(),
  ceilingBytes: CEILING,
  minHeadroomBytes: minHeadroom,
  entry: entry ? { ...entry, headroomBytes: headroom, underCeiling: entry.bytes < CEILING } : null,
  vendor, tables, css, worker,
  indexHtmlBytes: statSync(resolve(dist, "index.html")).size,
  assetLinks: links,
  allAssetLinksRelative: relativeLinks,
  files,
};
writeFileSync(resolve(outPath), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
if (!entry || !relativeLinks) process.exitCode = 1;
if (minHeadroom > 0 && (headroom === null || headroom < minHeadroom)) process.exitCode = 1;
