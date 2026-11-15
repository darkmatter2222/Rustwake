/**
 * Trust boundary for deployment verification: only the exact release SHA and
 * the manifest's explicitly enumerated public assets are verified.
 */
export function auditManifest(manifest, expectedSha) {
  if (!/^[a-f0-9]{40}$/.test(expectedSha || "")) {
    throw new Error("Expected full immutable source SHA");
  }
  if (!manifest || manifest.version !== 1 || manifest.source_sha !== expectedSha) {
    throw new Error("LIVE_SHA_MISMATCH: served manifest is not the delivered source SHA");
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0 || manifest.files.length > 150) {
    throw new Error("Invalid release-manifest file list");
  }
  const seen = new Set();
  const entries = [];
  for (const item of manifest.files) {
    const p = item?.path;
    if (typeof p !== "string" || !/^[a-zA-Z0-9_./-]+$/.test(p) ||
        p.startsWith("/") || p.split("/").some(x => !x || x === "." || x === "..")) {
      throw new Error("Unsafe manifest asset path");
    }
    if (!/^[a-f0-9]{64}$/.test(item.sha256 || "") ||
        !Number.isSafeInteger(item.bytes) || item.bytes < 0 || item.bytes > 50_000_000) {
      throw new Error("Invalid asset checksum or byte length: " + p);
    }
    if (seen.has(p)) throw new Error("Duplicate manifest asset: " + p);
    seen.add(p);
    entries.push({path:p, sha256:item.sha256, bytes:item.bytes});
  }
  if (!seen.has("index.html") || !entries.some(x => x.path.startsWith("assets/") && x.path.endsWith(".js"))) {
    throw new Error("Release manifest must include index.html and the game JavaScript");
  }
  return entries;
}

export function assertBrowserObservation(o) {
  if (!o || o.world3d !== "ready" || !o.visibleCanvas || !o.canvasWidth || !o.canvasHeight) {
    throw new Error("GAME_RENDER_FAILED: missing visible running 3D game canvas");
  }
  if (o.documentScroll) throw new Error("DOCUMENT_SCROLL: the full-screen game scrolls");
}
