// PLAYER-004 g1: prove which build is served live vs which build this worktree produces.
// Evidence types: HTTP bytes (remote), file bytes (local). Writes verify.json next to this script.
import { writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://home.darkmatter2222.com/rustwake/";
const HERE = dirname(fileURLToPath(import.meta.url));
const dist = join(HERE, "..", "..", "..", "dist");

function fnv(buf) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < buf.length; i++) {
    h ^= buf[i];
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16);
}
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

async function remote(name) {
  const r = await fetch(BASE + name, { cache: "no-store" });
  const ab = await r.arrayBuffer();
  const buf = new Uint8Array(ab);
  return { name, status: r.status, cl: r.headers.get("content-length"), bytes: buf.length, sha256: sha(buf), fnv: fnv(buf) };
}
function local(rel) {
  const buf = new Uint8Array(readFileSync(join(dist, rel.split("/").join("/"))));
  return { name: rel, bytes: buf.length, sha256: sha(buf), fnv: fnv(buf) };
}

const html = await (await fetch(BASE + "?v=" + Date.now(), { cache: "no-store" })).text();
const names = [...html.matchAll(/assets\/([A-Za-z0-9._-]+\.(?:js|css))/g)].map((m) => m[1]);
const uniq = [...new Set(names)];

const rows = [];
for (const n of uniq) {
  const r = await remote("assets/" + n);
  let l = null;
  try { l = local("assets/" + n); } catch { l = { name: n, missing: true }; }
  rows.push({
    asset: n,
    remote: r,
    local: l,
    sameSize: r.bytes === l.bytes,
    sameSha256: r.sha256 === l.sha256,
  });
}
// catchup worker chunk is emitted by the build but not referenced from index.html
let workerRow = null;
try {
  const wfile = readFileSync(join(dist, "assets"), "utf8") , _ = wfile;
} catch { /* dir listing below */ }
const extra = [];
for (const n of ["assets/catchup.worker-G_Jyr7uh.js"]) {
  const l = local(n);
  const r = await remote(n);
  extra.push({ asset: n, remote: r, local: l, sameSize: r.bytes === l.bytes, sameSha256: r.sha256 === l.sha256 });
}

const out = { base: BASE, servedAssetNames: uniq, rows, extra };
writeFileSync(join(HERE, "verify.json"), JSON.stringify(out, null, 1), "utf8");
console.log(JSON.stringify(out, null, 1));
