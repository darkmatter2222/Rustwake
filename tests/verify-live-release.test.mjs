/**
 * OPS-08 (#332): deterministic offline tests for scripts/verify-live-release.mjs.
 * No live network: a fixture-backed fetchImpl simulates the public HTTPS site,
 * including the deliberate negative cases (wrong source_sha, stale CDN asset).
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {verifyLiveRelease, statusExitCode, DEFAULT_BASE_URL} from "../scripts/verify-live-release.mjs";

const SHA_A = "94e74083cf6a1b19273fc3c492242033bb30978e";
const SHA_B = "006b5e8aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const sha256 = buf => crypto.createHash("sha256").update(buf).digest("hex");

function buildFixture({sourceSha = SHA_A, staleAsset = null, extraEntry = null} = {}) {
  const js = Buffer.from("console.log('rustwake v2 entry');\n");
  const css = Buffer.from("body{margin:0;background:#101c22}\n");
  const gltf = Buffer.from('{"asset":{"version":"2.0"}}\n');
  const servedJs = staleAsset === "js" ? Buffer.from("console.log('STALE OLD BUNDLE');\n") : js;
  const servedCss = staleAsset === "css" ? Buffer.from("/* stale cached css */\n") : css;
  const html = Buffer.from(
    "<!doctype html><html><head>" +
    "<script type=\"module\" src=\"./assets/index-UmXxyUGv.js\"></script>" +
    "<link rel=\"stylesheet\" href=\"./assets/index-Dwe8S8zt.css\">" +
    "</head><body><div id=\"root\"></div></body></html>");
  const files = [
    {path: "assets/index-UmXxyUGv.js", content: js},
    {path: "assets/index-Dwe8S8zt.css", content: css},
    {path: "assets/blockouts/crane.gltf", content: gltf},
    {path: "index.html", content: html},
  ];
  const manifest = {
    version: 1,
    source_sha: sourceSha,
    files: files.map(f => ({path: f.path, sha256: sha256(f.content), bytes: f.content.length})),
  };
  if (extraEntry) manifest.files.push(extraEntry);
  const served = new Map(files.map(f => [f.path, f.content]));
  served.set("assets/index-UmXxyUGv.js", servedJs);
  served.set("assets/index-Dwe8S8zt.css", servedCss);
  served.set("release-manifest.json", Buffer.from(JSON.stringify(manifest, null, 2)));
  return {manifest, served};
}

function mockFetch(served, {failPaths = new Set(), http404 = new Set(), badJson = false} = {}) {
  return async url => {
    const rel = decodeURIComponent(new URL(url).pathname).replace(/^\/rustwake\//, "");
    if (failPaths.has(rel)) throw new Error("simulated network failure for " + rel);
    if (http404.has(rel) || !served.has(rel)) return {status: 404, buffer: Buffer.from("not found")};
    const buffer = badJson && rel === "release-manifest.json" ? Buffer.from("{not json") : served.get(rel);
    return {status: 200, buffer};
  };
}

const base = {expectedSha: SHA_A, baseUrl: DEFAULT_BASE_URL, rollbackSha: SHA_B,
              mainCiRun: "ci-run-1", deliveryRun: "delivery-run-1", now: () => "2026-01-01T00:00:00.000Z"};

test("PASS: manifest SHA and all served entry JS/CSS checksums match", async () => {
  const {served} = buildFixture();
  const r = await verifyLiveRelease({...base, fetchImpl: mockFetch(served)});
  assert.equal(r.status, "PASS");
  assert.equal(statusExitCode(r.status), 0);
  assert.equal(r.manifest_source_sha, SHA_A);
  assert.equal(r.rollback.previous_main_sha, SHA_B);
  assert.equal(r.evidence.main_ci_run, "ci-run-1");
  assert.equal(r.evidence.delivery_run, "delivery-run-1");
  const paths = r.files_checked.map(f => f.path);
  assert.deepEqual(paths, ["assets/index-Dwe8S8zt.css", "assets/index-UmXxyUGv.js", "index.html"]);
  for (const f of r.files_checked) {
    assert.equal(f.status, "PASS");
    assert.equal(f.served_sha256, f.expected_sha256);
    assert.equal(f.served_bytes, f.expected_bytes);
  }
  assert.deepEqual(r.failures, []);
  assert.deepEqual(r.errors, []);
});

test("NEGATIVE: mismatched manifest source_sha => FAILED, exit 1", async () => {
  const {served} = buildFixture({sourceSha: SHA_B});
  const r = await verifyLiveRelease({...base, fetchImpl: mockFetch(served)});
  assert.equal(r.status, "FAILED");
  assert.equal(statusExitCode(r.status), 1);
  assert.equal(r.manifest_source_sha, SHA_B);
  assert.ok(r.failures.some(f => f.includes("source_sha") && f.includes(SHA_A)));
});

test("NEGATIVE: stale CDN JS asset (checksum mismatch) => FAILED even when source_sha matches", async () => {
  const {served} = buildFixture({staleAsset: "js"});
  const r = await verifyLiveRelease({...base, fetchImpl: mockFetch(served)});
  assert.equal(r.status, "FAILED");
  assert.equal(r.manifest_source_sha, SHA_A);
  const js = r.files_checked.find(f => f.path.endsWith(".js"));
  assert.equal(js.status, "FAILED");
  assert.notEqual(js.served_sha256, js.expected_sha256);
  assert.ok(r.failures.some(f => f.includes("stale or altered asset")));
});

test("NEGATIVE: stale CDN CSS asset => FAILED", async () => {
  const {served} = buildFixture({staleAsset: "css"});
  const r = await verifyLiveRelease({...base, fetchImpl: mockFetch(served)});
  assert.equal(r.status, "FAILED");
  const css = r.files_checked.find(f => f.path.endsWith(".css"));
  assert.equal(css.status, "FAILED");
});

test("NEGATIVE: served index.html references an asset absent from the manifest => FAILED", async () => {
  const {served, manifest} = buildFixture();
  manifest.files = manifest.files.filter(f => f.path !== "assets/index-UmXxyUGv.js");
  served.set("release-manifest.json", Buffer.from(JSON.stringify(manifest)));
  const r = await verifyLiveRelease({...base, fetchImpl: mockFetch(served)});
  assert.equal(r.status, "FAILED");
  assert.ok(r.failures.some(f => f.includes("does not cover")));
});

test("UNKNOWN: manifest unreachable (404) => exit 2, never PASS", async () => {
  const {served} = buildFixture();
  const r = await verifyLiveRelease({...base, fetchImpl: mockFetch(served, {http404: new Set(["release-manifest.json"])})});
  assert.equal(r.status, "UNKNOWN");
  assert.equal(statusExitCode(r.status), 2);
});

test("UNKNOWN: network failure fetching manifest => exit 2", async () => {
  const {served} = buildFixture();
  const r = await verifyLiveRelease({...base, fetchImpl: mockFetch(served, {failPaths: new Set(["release-manifest.json"])})});
  assert.equal(r.status, "UNKNOWN");
});

test("UNKNOWN: malformed manifest JSON => exit 2", async () => {
  const {served} = buildFixture();
  const r = await verifyLiveRelease({...base, fetchImpl: mockFetch(served, {badJson: true})});
  assert.equal(r.status, "UNKNOWN");
  assert.ok(r.errors.some(e => e.includes("not valid JSON")));
});

test("UNKNOWN: invalid expected SHA input is rejected before any fetch", async () => {
  let fetched = false;
  const r = await verifyLiveRelease({...base, expectedSha: "94e7408", fetchImpl: async () => {fetched = true; return {status: 200, buffer: Buffer.from("")};}});
  assert.equal(r.status, "UNKNOWN");
  assert.equal(fetched, false);
});

test("UNKNOWN: entry asset unreachable while manifest is fine => overall UNKNOWN", async () => {
  const {served} = buildFixture();
  const r = await verifyLiveRelease({...base, fetchImpl: mockFetch(served, {failPaths: new Set(["assets/index-UmXxyUGv.js"])})});
  assert.equal(r.status, "UNKNOWN");
  const js = r.files_checked.find(f => f.path.endsWith(".js"));
  assert.equal(js.status, "UNKNOWN");
});

test("byte-size mismatch with matching hash claim => FAILED", async () => {
  const {served, manifest} = buildFixture();
  manifest.files.find(f => f.path === "index.html").bytes += 1;
  served.set("release-manifest.json", Buffer.from(JSON.stringify(manifest)));
  const r = await verifyLiveRelease({...base, fetchImpl: mockFetch(served)});
  assert.equal(r.status, "FAILED");
  assert.ok(r.failures.some(f => f.includes("bytes")));
});

test("--all-files mode also verifies non-entry assets (gltf)", async () => {
  const {served} = buildFixture();
  const r = await verifyLiveRelease({...base, allFiles: true, fetchImpl: mockFetch(served)});
  assert.equal(r.status, "PASS");
  assert.ok(r.files_checked.some(f => f.path === "assets/blockouts/crane.gltf" && f.status === "PASS"));
});

test("malformed manifest entry (path traversal / bad hash) => UNKNOWN, not silently skipped", async () => {
  const {served} = buildFixture({extraEntry: {path: "../secret", sha256: "zz", bytes: 1}});
  const r = await verifyLiveRelease({...base, fetchImpl: mockFetch(served)});
  assert.equal(r.status, "UNKNOWN");
  assert.ok(r.errors.some(e => e.includes("malformed manifest file entry")));
});
