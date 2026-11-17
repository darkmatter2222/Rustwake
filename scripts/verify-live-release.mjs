/**
 * OPS-08 (#332): post-promote live release proof.
 *
 * Compares the exact expected main commit SHA against the publicly served
 * release-manifest.json AND recomputes SHA-256 of the served entry JS/CSS
 * (optionally every manifest file) over plain HTTPS. Records the previous-main
 * rollback target plus main CI / delivery run references in a structured
 * receipt and exits non-zero on any mismatch or unverifiable state.
 *
 * Status contract:
 *   PASS    (exit 0) — manifest source_sha equals expected SHA and every
 *                      checked served file matches its manifest sha256/bytes.
 *   FAILED  (exit 1) — definite mismatch: wrong source_sha, stale/altered
 *                      asset bytes, or index.html referencing assets that the
 *                      manifest does not cover.
 *   UNKNOWN (exit 2) — could not verify: network/TLS error, non-200 response,
 *                      malformed manifest, or invalid input SHA.
 *
 * Uses only Node built-ins (node:https/node:http/node:crypto). NODE_EXTRA_CA_CERTS
 * is honored by the default TLS stack for local MITM-proxy environments; GitHub
 * Actions runners use plain HTTPS with no proxy. No new dependencies.
 *
 * CLI:
 *   node scripts/verify-live-release.mjs <expected-main-sha> \
 *     [--base-url https://home.darkmatter2222.com/rustwake/] \
 *     [--rollback-sha <previous-main-sha>] \
 *     [--main-ci-run <id-or-url>] [--delivery-run <id-or-url>] \
 *     [--all-files] [--out receipt.json]
 */
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import {pathToFileURL} from "node:url";

export const DEFAULT_BASE_URL = "https://home.darkmatter2222.com/rustwake/";
const SHA_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

export function statusExitCode(status) {
  if (status === "PASS") return 0;
  if (status === "FAILED") return 1;
  return 2; // UNKNOWN and anything unrecognized
}

/** Built-in HTTPS/HTTP GET returning {status, buffer}; follows a few redirects. */
export function httpsFetch(url, {timeoutMs = 30000, maxRedirects = 3} = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      reject(new Error("Invalid URL: " + url));
      return;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      reject(new Error("Unsupported protocol: " + parsed.protocol));
      return;
    }
    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.get(parsed, {headers: {"user-agent": "rustwake-live-release-verify/1"}}, res => {
      const code = res.statusCode ?? 0;
      if ([301, 302, 307, 308].includes(code) && res.headers.location) {
        res.resume();
        if (maxRedirects <= 0) {
          reject(new Error("Too many redirects for " + url));
          return;
        }
        const next = new URL(res.headers.location, parsed).href;
        resolve(httpsFetch(next, {timeoutMs, maxRedirects: maxRedirects - 1}));
        return;
      }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({status: code, buffer: Buffer.concat(chunks)}));
      res.on("error", reject);
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("Timeout after " + timeoutMs + "ms fetching " + url));
    });
    req.on("error", reject);
  });
}

function joinUrl(baseUrl, relPath) {
  return new URL(relPath, baseUrl.endsWith("/") ? baseUrl : baseUrl + "/").href;
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** Fetch with one retry; never throws — returns {ok, status, buffer, error}. */
async function fetchChecked(url, fetchImpl) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchImpl(url);
      if (res.status !== 200) {
        return {ok: false, status: res.status, buffer: res.buffer ?? null, error: "HTTP " + res.status};
      }
      return {ok: true, status: res.status, buffer: res.buffer, error: null};
    } catch (err) {
      lastError = err;
    }
  }
  return {ok: false, status: null, buffer: null, error: String(lastError && lastError.message || lastError)};
}

function worst(statuses) {
  if (statuses.includes("FAILED")) return "FAILED";
  if (statuses.includes("UNKNOWN")) return "UNKNOWN";
  return "PASS";
}

/**
 * Core verification, injectable for deterministic offline tests.
 * fetchImpl(url) must resolve to {status:number, buffer:Buffer}.
 * Returns the structured receipt; never throws for verification outcomes.
 */
export async function verifyLiveRelease({
  expectedSha,
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = httpsFetch,
  allFiles = false,
  rollbackSha = null,
  mainCiRun = null,
  deliveryRun = null,
  now = () => new Date().toISOString(),
} = {}) {
  const receipt = {
    check: "rustwake-live-release-proof",
    issue: 332,
    status: "UNKNOWN",
    checked_at: now(),
    base_url: baseUrl,
    manifest_url: joinUrl(baseUrl, "release-manifest.json"),
    expected_source_sha: expectedSha ?? null,
    manifest_source_sha: null,
    rollback: {previous_main_sha: rollbackSha || null},
    evidence: {main_ci_run: mainCiRun || null, delivery_run: deliveryRun || null},
    mode: allFiles ? "all-files" : "entry-js-css-and-index",
    files_checked: [],
    failures: [],
    errors: [],
  };
  const fail = msg => {
    receipt.failures.push(msg);
    return "FAILED";
  };
  const unknown = msg => {
    receipt.errors.push(msg);
    return "UNKNOWN";
  };

  if (!SHA_RE.test(String(expectedSha || ""))) {
    unknown("expected main SHA missing or not a full 40-hex commit id");
    receipt.status = "UNKNOWN";
    return receipt;
  }
  if (rollbackSha && !SHA_RE.test(String(rollbackSha))) {
    unknown("rollback SHA provided but not a full 40-hex commit id");
    receipt.rollback.previous_main_sha = null;
  }

  const manifestRes = await fetchChecked(receipt.manifest_url, fetchImpl);
  if (!manifestRes.ok) {
    unknown("release-manifest.json unreachable: " + manifestRes.error);
    receipt.status = "UNKNOWN";
    return receipt;
  }
  let manifest;
  try {
    manifest = JSON.parse(manifestRes.buffer.toString("utf8"));
  } catch (err) {
    unknown("release-manifest.json is not valid JSON: " + err.message);
    receipt.status = "UNKNOWN";
    return receipt;
  }
  if (!manifest || typeof manifest !== "object" ||
      !SHA_RE.test(String(manifest.source_sha || "")) ||
      !Array.isArray(manifest.files)) {
    unknown("release-manifest.json malformed: need source_sha (40-hex) and files[]");
    receipt.status = "UNKNOWN";
    return receipt;
  }
  receipt.manifest_source_sha = manifest.source_sha;

  const statuses = [];
  if (manifest.source_sha !== expectedSha) {
    statuses.push(fail(`manifest source_sha ${manifest.source_sha} != expected main ${expectedSha}`));
  }

  const entries = new Map();
  for (const f of manifest.files) {
    if (!f || typeof f.path !== "string" || !SHA256_RE.test(String(f.sha256 || "")) ||
        !Number.isInteger(f.bytes) || f.path.startsWith("/") ||
        f.path.includes("..") || f.path.includes("\\")) {
      statuses.push(unknown("malformed manifest file entry: " + JSON.stringify(f)));
      continue;
    }
    entries.set(f.path, f);
  }

  // Always verify the served index.html so a stale HTML/manifest pairing is caught.
  const selected = new Set(["index.html"]);
  for (const p of entries.keys()) {
    if (allFiles || /\.(?:js|css)$/.test(p)) selected.add(p);
  }

  const indexRes = await fetchChecked(joinUrl(baseUrl, "index.html"), fetchImpl);
  if (indexRes.ok) {
    const html = indexRes.buffer.toString("utf8");
    const refs = html.match(/assets\/[A-Za-z0-9._\/-]+\.(?:js|css)/g) || [];
    for (const ref of refs) {
      if (!entries.has(ref)) {
        statuses.push(fail(`served index.html references ${ref} which the release manifest does not cover (stale HTML or manifest)`));
      } else {
        selected.add(ref);
      }
    }
  }

  for (const relPath of [...selected].sort()) {
    const url = joinUrl(baseUrl, relPath);
    const entry = entries.get(relPath);
    const record = {path: relPath, url, expected_sha256: entry ? entry.sha256 : null,
                    served_sha256: null, expected_bytes: entry ? entry.bytes : null,
                    served_bytes: null, status: "UNKNOWN"};
    receipt.files_checked.push(record);
    if (!entry) {
      record.status = unknown(`selected file ${relPath} missing from manifest`);
      statuses.push(record.status);
      continue;
    }
    const res = await fetchChecked(url, fetchImpl);
    if (!res.ok) {
      record.status = unknown(`${relPath} unreachable: ${res.error}`);
      statuses.push(record.status);
      continue;
    }
    record.served_bytes = res.buffer.length;
    record.served_sha256 = sha256(res.buffer);
    if (record.served_sha256 !== entry.sha256) {
      record.status = fail(`${relPath} served sha256 ${record.served_sha256} != manifest ${entry.sha256} (stale or altered asset)`);
    } else if (res.buffer.length !== entry.bytes) {
      record.status = fail(`${relPath} served ${res.buffer.length} bytes != manifest ${entry.bytes} bytes`);
    } else {
      record.status = "PASS";
    }
    statuses.push(record.status);
  }

  receipt.status = worst(statuses);
  return receipt;
}

function parseArgs(argv) {
  const opts = {_: []};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all-files") opts.allFiles = true;
    else if (a.startsWith("--")) {
      const key = a.slice(2);
      if (!["base-url", "rollback-sha", "main-ci-run", "delivery-run", "out"].includes(key)) {
        throw new Error("Unknown flag: " + a);
      }
      opts[key] = argv[++i];
      if (opts[key] === undefined) throw new Error("Missing value for " + a);
    } else opts._.push(a);
  }
  return opts;
}

export async function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(err.message);
    return 2;
  }
  const receipt = await verifyLiveRelease({
    expectedSha: opts._[0],
    baseUrl: opts["base-url"] || DEFAULT_BASE_URL,
    allFiles: Boolean(opts.allFiles),
    rollbackSha: opts["rollback-sha"] || null,
    mainCiRun: opts["main-ci-run"] || null,
    deliveryRun: opts["delivery-run"] || null,
  });
  const json = JSON.stringify(receipt, null, 2) + "\n";
  if (opts.out) {
    fs.mkdirSync(path.dirname(path.resolve(opts.out)), {recursive: true});
    fs.writeFileSync(opts.out, json);
  }
  process.stdout.write(json);
  console.error(`live-release-proof: ${receipt.status} expected=${receipt.expected_source_sha} manifest=${receipt.manifest_source_sha} files=${receipt.files_checked.length} failures=${receipt.failures.length} errors=${receipt.errors.length}`);
  return statusExitCode(receipt.status);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(code => {
    process.exitCode = code;
  }).catch(err => {
    console.error("live-release-proof: UNKNOWN unexpected error:", err);
    process.exitCode = 2;
  });
}
