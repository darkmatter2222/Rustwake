#!/usr/bin/env node
/**
 * Issue #600 — automated GitHub Release publishing (Refs #600).
 *
 * Binding policy: product ruling comment 7029297423 on issue #600.
 * Scheme doc: docs/release-versioning.md.
 *
 * Architecture follows scripts/delivery-alert.mjs: the DECISION is a set of
 * pure, unit-testable functions (nextVersion / shouldPublish / tagAvailability
 * / buildNotes); the SIDE EFFECT is a thin CLI shell using execFileSync only
 * (no shell strings, token never logged). Tests: tests/releasePublish.test.mjs.
 *
 * Invariants:
 * - Auto patch bump within the highest existing strict vMAJOR.MINOR.PATCH
 *   series, computed purely from the tag list. Minor/major bumps are
 *   product-curated; automation never invents a series (empty/non-semver tag
 *   list => hard error, not a guess).
 * - A failed, cancelled, timed_out or skipped delivery publishes NOTHING.
 * - Never publish unless the verified live source_sha equals the triggering
 *   main head and all four upstream jobs succeeded.
 * - Tags are immutable: an existing tag at a different SHA hard-fails; a
 *   release already at this exact SHA is a no-op success (same-SHA re-run).
 * - Notes are a deploy receipt, never a claim of sponsor visual acceptance.
 *   G1 (Refs #276) is the only visual gate.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SEMVER = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SHA40 = /^[a-f0-9]{40}$/;
const REPO_SLUG = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export const REQUIRED_JOBS = ["package", "deploy", "verify-live", "hosted-browser"];
export const NO_UPSTREAM_CI = "workflow_dispatch (no upstream CI run)";

/** Strict semver with v prefix, no leading zeros. Returns null for anything else. */
export function parseSemver(tag) {
  if (typeof tag !== "string") return null;
  const m = SEMVER.exec(tag);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/** Numeric ordering: -1 / 0 / 1. Never string ordering (v0.10.0 > v0.9.0). */
export function compareSemver(a, b) {
  for (const k of ["major", "minor", "patch"]) {
    if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1;
  }
  return 0;
}

/**
 * Deterministic auto-patch-bump: take the highest MAJOR.MINOR series present
 * in the tag list, then max patch in that series + 1. Pure; never rewrites or
 * reuses an existing tag. Empty or fully non-semver tag lists throw: seeding
 * a series is a product decision, never an automation guess.
 */
export function nextVersion(existingTags) {
  if (!Array.isArray(existingTags)) {
    throw new TypeError("existingTags must be an array of tag names");
  }
  const parsed = existingTags.map(parseSemver).filter(Boolean);
  if (parsed.length === 0) {
    throw new Error(
      "no strict vMAJOR.MINOR.PATCH tags exist; automation never invents a series — " +
      "product must publish a curated seed tag first (Refs #600)"
    );
  }
  let highest = parsed[0];
  for (const v of parsed) if (compareSemver(v, highest) > 0) highest = v;
  // Highest overall version is in the highest MAJOR.MINOR series with that
  // series' max patch; +1 stays inside the series by construction.
  return `v${highest.major}.${highest.minor}.${highest.patch + 1}`;
}

/** Highest existing strict semver tag (the previous release), or null. */
export function previousVersion(existingTags) {
  if (!Array.isArray(existingTags)) return null;
  let best = null;
  let bestTag = null;
  for (const t of existingTags) {
    const v = parseSemver(t);
    if (!v) continue;
    if (!best || compareSemver(v, best) > 0) { best = v; bestTag = t; }
  }
  return bestTag;
}

/**
 * Pure publish decision. jobConclusions maps each required upstream job to
 * its conclusion string; anything !== 'success' (failure, cancelled,
 * timed_out, skipped, missing, unknown) means NO publish. liveSourceSha must
 * be the verified live SHA and must equal the triggering main head.
 * existingReleaseSha: SHA an existing release for this deployment resolves
 * to (null when none). Equal to liveSourceSha => same-SHA re-run no-op.
 */
export function shouldPublish({ jobConclusions, liveSourceSha, mainHead, existingReleaseSha } = {}) {
  const jobs = jobConclusions && typeof jobConclusions === "object" ? jobConclusions : {};
  for (const job of REQUIRED_JOBS) {
    if (jobs[job] !== "success") {
      return {
        publish: false,
        reason: `upstream job '${job}' concluded '${String(jobs[job])}' (!= success) — nothing published`,
      };
    }
  }
  if (typeof liveSourceSha !== "string" || !SHA40.test(liveSourceSha)) {
    return { publish: false, reason: "verified live source_sha missing or not a 40-hex lowercase SHA — nothing published" };
  }
  if (typeof mainHead !== "string" || !SHA40.test(mainHead)) {
    return { publish: false, reason: "triggering main head missing or not a 40-hex lowercase SHA — nothing published" };
  }
  if (liveSourceSha !== mainHead) {
    return {
      publish: false,
      reason: `verified live SHA ${liveSourceSha} !== triggering main head ${mainHead} — nothing published`,
    };
  }
  if (existingReleaseSha != null) {
    if (existingReleaseSha === liveSourceSha) {
      return { publish: false, reason: "no-op: a release already exists at this exact SHA (same-SHA re-run)" };
    }
    return { publish: false, reason: "existing release SHA does not match the verified live SHA — nothing published" };
  }
  return { publish: true, reason: "all four upstream jobs succeeded; verified live SHA equals the triggering main head" };
}

/**
 * Tag immutability check. tagTargets maps tag name -> peeled commit SHA.
 * Absent tag => create. Present at the exact live SHA => no-op. Present at a
 * DIFFERENT SHA => throw (hard fail; never force-move, never delete/recreate).
 */
export function tagAvailability(tag, tagTargets, liveSourceSha) {
  if (!tagTargets || typeof tagTargets !== "object") {
    throw new TypeError("tagTargets must be an object of tag -> commit SHA");
  }
  if (Object.prototype.hasOwnProperty.call(tagTargets, tag)) {
    if (tagTargets[tag] === liveSourceSha) return { action: "noop" };
    throw new Error(
      `tag ${tag} already exists at ${tagTargets[tag]} != verified live ${liveSourceSha}; ` +
      "tags are immutable — never force-move or delete-and-recreate (Refs #600)"
    );
  }
  return { action: "create" };
}

/**
 * Pure release-notes generator. Returns the body string. Required content:
 * full deployed SHA + tag, commit range since the previous tag (one line per
 * commit, git-generated), main CI run (honest workflow_dispatch fallback),
 * delivery run, both receipt artifact names, mechanical game-source
 * classification. FORBIDDEN: any claim of sponsor visual acceptance / G1
 * pass — the hosted-browser smoke is a numeric/liveness receipt only.
 */
export function buildNotes({ tag, sourceSha, previousTag, commits, mainCiRun, deliveryRun, gameSourceChanged }) {
  if (!parseSemver(tag)) throw new TypeError(`tag must be strict vMAJOR.MINOR.PATCH, got: ${tag}`);
  if (typeof sourceSha !== "string" || !SHA40.test(sourceSha)) {
    throw new TypeError("sourceSha must be a 40-hex lowercase SHA");
  }
  if (typeof previousTag !== "string" || !previousTag) throw new TypeError("previousTag required");
  if (!Array.isArray(commits)) throw new TypeError("commits must be an array of {sha, subject}");
  if (typeof deliveryRun !== "string" || !deliveryRun) throw new TypeError("deliveryRun required");
  const ci = typeof mainCiRun === "string" && mainCiRun ? mainCiRun : NO_UPSTREAM_CI;
  const lines = [];
  lines.push(`Deployed source: \`${sourceSha}\` — tag \`${tag}\` resolves to this exact verified live SHA.`);
  lines.push("");
  lines.push(gameSourceChanged
    ? "Classification: game-source changes included."
    : "No game-source changes (docs/infra/dashboard only).");
  lines.push("");
  lines.push(`## Commits since \`${previousTag}\``);
  lines.push(`Range: \`${previousTag}..${sourceSha}\` (git-generated).`);
  if (commits.length === 0) {
    lines.push("- (no commits in range)");
  } else {
    for (const c of commits) {
      if (!c || typeof c.sha !== "string" || typeof c.subject !== "string") {
        throw new TypeError("each commit must be {sha, subject} strings");
      }
      lines.push(`- \`${c.sha}\` ${c.subject}`);
    }
  }
  lines.push("");
  lines.push("## Delivery receipts");
  lines.push(`- Main CI run: ${ci}`);
  lines.push(`- Delivery run: ${deliveryRun}`);
  lines.push(`- Artifact: \`rustwake-live-verification-${sourceSha}\``);
  lines.push(`- Artifact: \`rustwake-hosted-browser-${sourceSha}\``);
  lines.push("");
  lines.push(
    "Automated deploy receipt. This is NOT a visual acceptance: the hosted-browser " +
    "smoke is a numeric/liveness receipt only. Sponsor visual review at G1 (Refs #276) " +
    "remains the only visual gate."
  );
  return lines.join("\n") + "\n";
}

// --- Side-effect shell (CLI only; importing this module runs nothing) -------

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}
function gh(...args) {
  return execFileSync("gh", args, { encoding: "utf8" });
}

/** Resolve any tag/branch/ref to its peeled commit SHA via the GitHub API. */
function resolveRefSha(repo, ref) {
  return gh("api", `repos/${repo}/commits/${ref}`, "--jq", ".sha").trim();
}

function main() {
  const env = process.env;
  const repo = env.GITHUB_REPOSITORY || "";
  if (!REPO_SLUG.test(repo)) throw new Error("GITHUB_REPOSITORY must be owner/name");
  const sourceSha = env.SOURCE_SHA || "";
  const mainHead = env.MAIN_HEAD || "";
  const jobConclusions = {
    "package": env.JOB_PACKAGE,
    "deploy": env.JOB_DEPLOY,
    "verify-live": env.JOB_VERIFY_LIVE,
    "hosted-browser": env.JOB_HOSTED_BROWSER,
  };

  // Authoritative tag list from the API (not a possibly-stale local clone).
  const tags = gh("api", `repos/${repo}/tags`, "--paginate", "--jq", ".[].name")
    .split("\n").map((s) => s.trim()).filter(Boolean);

  // Same-SHA re-run: any existing release whose tag resolves to this exact
  // verified live SHA means the receipt already exists => no-op success.
  let existingReleaseSha = null;
  const releases = JSON.parse(gh("release", "list", "--repo", repo, "--limit", "100", "--json", "tagName"));
  for (const r of releases) {
    if (resolveRefSha(repo, r.tagName) === sourceSha) { existingReleaseSha = sourceSha; break; }
  }

  const decision = shouldPublish({ jobConclusions, liveSourceSha: sourceSha, mainHead, existingReleaseSha });
  console.log(`publish decision: ${decision.publish ? "PUBLISH" : "NO-PUBLISH"} — ${decision.reason}`);
  if (!decision.publish) return;

  const next = nextVersion(tags);
  // Immutability: if the computed tag already exists, it must resolve to this
  // exact SHA (no-op) or we hard-fail. Never force-move a tag.
  let tagTargets = {};
  try {
    tagTargets = { [next]: resolveRefSha(repo, next) };
  } catch {
    tagTargets = {}; // 404: tag absent => create.
  }
  const availability = tagAvailability(next, tagTargets, sourceSha);
  if (availability.action === "noop") {
    console.log(`no-op: tag ${next} already resolves to ${sourceSha}`);
    return;
  }

  const previousTag = previousVersion(tags);
  if (!previousTag) throw new Error("previous semver tag vanished from the tag list");
  // Local clone (checkout fetch-depth: 0) carries history + tags for the range.
  const log = git("log", "--format=%h %s", `${previousTag}..${sourceSha}`);
  const commits = log === "" ? [] : log.split("\n").map((line) => {
    const sp = line.indexOf(" ");
    return { sha: line.slice(0, sp), subject: line.slice(sp + 1) };
  });
  const gameSourceChanged = git("diff", "--name-only", `${previousTag}..${sourceSha}`, "--", "src") !== "";

  const server = env.GITHUB_SERVER_URL || "https://github.com";
  const runId = env.GITHUB_RUN_ID || "";
  if (!/^\d+$/.test(runId)) throw new Error("GITHUB_RUN_ID must be numeric");
  const notes = buildNotes({
    tag: next,
    sourceSha,
    previousTag,
    commits,
    mainCiRun: env.MAIN_CI_RUN || NO_UPSTREAM_CI,
    deliveryRun: `${server}/${repo}/actions/runs/${runId}`,
    gameSourceChanged,
  });

  if (process.argv.includes("--dry-run")) {
    console.log(`[dry-run] would create tag ${next} at ${sourceSha} with notes:\n${notes}`);
    return;
  }

  // Create the tag via the API pointed at the verified SHA. POST fails if the
  // ref already exists — there is no force path. Then publish the release.
  gh("api", "--method", "POST", `repos/${repo}/git/refs`,
    "-f", `ref=refs/tags/${next}`, "-f", `sha=${sourceSha}`);
  const notesFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rw-release-")), "notes.md");
  try {
    fs.writeFileSync(notesFile, notes, "utf8");
    gh("release", "create", next, "--repo", repo, "--target", sourceSha,
      "--title", next, "--notes-file", notesFile, "--latest");
  } finally {
    fs.rmSync(notesFile, { force: true });
  }
  console.log(`published ${next} at ${sourceSha}: ${server}/${repo}/releases/tag/${next}`);
}

const isCli = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    main();
  } catch (err) {
    console.error(`release publish FAILED: ${err.message}`);
    process.exitCode = 1;
  }
}
