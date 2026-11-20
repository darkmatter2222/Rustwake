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
 * - Convergent retry (Refs #607): a tag at the verified SHA with NO non-draft
 *   release is a partial-failure orphan — it is ADOPTED (release created for
 *   it, never a version bump), and the commit range base is the highest tag
 *   STRICTLY BELOW the adopted one, so the receipt is never empty and the
 *   src classification is never falsely "No game-source changes".
 * - Draft releases never count as published receipts (Refs #607): the
 *   listing's isDraft field is requested and filtered explicitly, so the
 *   decision is correct whether or not the listing includes drafts.
 * - An unresolvable (HTTP 404) tag on an unrelated historical release is
 *   skipped, not fatal; any other API/auth/network failure aborts (Refs #607).
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

// A deploy receipt must never carry a visual-acceptance claim, even when a
// commit subject itself makes one. Such phrases are neutralized, not echoed.
const FORBIDDEN_CLAIM = /visually verified|sponsor[- ]approved|production[- ]ready|G1 (?:pass(?:ed)?|accept(?:ed|ance)?)/gi;

/** Strict semver with v prefix, no leading zeros. Returns null for anything else. */
export function parseSemver(tag) {
  if (typeof tag !== "string") return null;
  const m = tag.match(SEMVER);
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
 * Highest strict semver tag STRICTLY BELOW `tag` (Refs #607), or null.
 * This is the range base when an orphan tag at the verified SHA is adopted:
 * using the adopted tag itself would render an empty range and a false
 * "No game-source changes" label. Non-semver tags are ignored; `tag` itself
 * and anything above it are excluded.
 */
export function previousVersionBefore(existingTags, tag) {
  if (!Array.isArray(existingTags)) {
    throw new TypeError("existingTags must be an array of tag names");
  }
  const limit = parseSemver(tag);
  if (!limit) throw new TypeError(`tag must be strict vMAJOR.MINOR.PATCH, got: ${tag}`);
  let best = null;
  let bestTag = null;
  for (const t of existingTags) {
    const v = parseSemver(t);
    if (!v || compareSemver(v, limit) >= 0) continue;
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
 * Ref-missing classification (Refs #607 defect 2). Pure over the stderr text
 * of a failed `gh api repos/{repo}/commits/{ref}` call. ONLY an explicit
 * HTTP 404 status marker means "ref does not resolve => skip / absent".
 * Auth (401/403), rate-limit (429), server (5xx) and network failures are NOT
 * missing refs: they must abort the run, never become a silent skip that
 * could publish a wrong release.
 */
export function isRefMissing(stderrText) {
  if (typeof stderrText !== "string") return false;
  return /\bHTTP 404\b/.test(stderrText) || /\(404\)/.test(stderrText) || /\b404 Not Found\b/i.test(stderrText);
}

/**
 * Pure release-existence scan (Refs #607 defects 2+3). `releases` is the raw
 * listing [{tagName, isDraft}]; `resolve(tag)` returns the peeled commit SHA
 * or throws (execFileSync-style error carrying .stderr). Returns sourceSha
 * when a NON-DRAFT release resolves to it, else null.
 *
 * CONSTRAINT (isDraft measured available 2026-11-20 by the coordinator): a
 * release counts only when isDraft !== true, so this decision is identical
 * whether or not the listing includes drafts — a draft NEVER causes a no-op.
 * A proven-404 tag on an unrelated historical release is skipped; any other
 * resolver failure rethrows (never a blanket swallow).
 */
export function existingReleaseSha(releases, sourceSha, resolve) {
  if (!Array.isArray(releases)) throw new TypeError("releases must be an array of {tagName, isDraft}");
  if (typeof resolve !== "function") throw new TypeError("resolve must be a function");
  for (const r of releases) {
    if (!r || typeof r.tagName !== "string") throw new TypeError("each release needs a string tagName");
    if (r.isDraft === true) continue; // draft: not a published receipt, ignore entirely
    let sha;
    try {
      sha = resolve(r.tagName);
    } catch (err) {
      if (isRefMissing(err && err.stderr != null ? String(err.stderr) : "")) continue; // deleted historical tag
      throw err; // genuine API/auth/network failure: abort, do not guess
    }
    if (sha === sourceSha) return sourceSha;
  }
  return null;
}

/**
 * Pure publication plan keyed on tag existence at the verified SHA
 * (Refs #607 defect 1). Caller precondition: shouldPublish passed and
 * existingReleaseSha found NO non-draft release at sourceSha.
 *
 * `tagShas` maps tag name -> peeled SHA for the candidate tags whose
 * resolution succeeded; a missing key means absent-or-proven-404.
 *
 * - Highest semver tag resolves to sourceSha => partial-failure orphan:
 *   ADOPT it (createTag:false), never bump; range base = highest tag
 *   strictly below it.
 * - Otherwise compute nextVersion; if that tag already resolves to
 *   sourceSha (stale-list race) => adopt it the same way; if it resolves
 *   elsewhere => tagAvailability throws (immutability, unchanged).
 * - Otherwise CREATE tag + release; range base = previousVersion(tags).
 *
 * Returns { action: "adopt"|"create", tag, previousTag, createTag }.
 */
export function planPublication({ tags, tagShas, sourceSha } = {}) {
  if (!Array.isArray(tags)) throw new TypeError("tags must be an array of tag names");
  if (!tagShas || typeof tagShas !== "object") throw new TypeError("tagShas must be an object of tag -> commit SHA");
  if (typeof sourceSha !== "string" || !SHA40.test(sourceSha)) {
    throw new TypeError("sourceSha must be a 40-hex lowercase SHA");
  }
  const highest = previousVersion(tags);
  if (highest && tagShas[highest] === sourceSha) {
    const previousTag = previousVersionBefore(tags, highest);
    if (!previousTag) {
      throw new Error(
        `orphan tag ${highest} has no semver tag below it; cannot build an honest non-empty range (Refs #607)`
      );
    }
    return { action: "adopt", tag: highest, previousTag, createTag: false };
  }
  const next = nextVersion(tags);
  const targets = Object.prototype.hasOwnProperty.call(tagShas, next) ? { [next]: tagShas[next] } : {};
  const availability = tagAvailability(next, targets, sourceSha);
  if (availability.action === "noop") {
    const previousTag = previousVersionBefore(tags, next);
    if (!previousTag) {
      throw new Error(
        `orphan tag ${next} has no semver tag below it; cannot build an honest non-empty range (Refs #607)`
      );
    }
    return { action: "adopt", tag: next, previousTag, createTag: false };
  }
  const previousTag = previousVersion(tags);
  if (!previousTag) throw new Error("previous semver tag vanished from the tag list");
  return { action: "create", tag: next, previousTag, createTag: true };
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
      lines.push(`- \`${c.sha}\` ${c.subject.replace(FORBIDDEN_CLAIM, "[claim removed]")}`);
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

  // Same-SHA re-run: a NON-DRAFT release whose tag resolves to this exact
  // verified live SHA means the receipt already exists => no-op success.
  // CONSTRAINT (Refs #607): isDraft is requested and filtered explicitly, so
  // correctness does not depend on whether the listing includes drafts.
  // Assumption (Refs #607): gh release list paginates internally (100/page)
  // up to --limit; 1000 is 200x the current release count and the pure scan
  // below is truncation-free (boundary-tested), so no silent 100-cap remains.
  const releases = JSON.parse(gh("release", "list", "--repo", repo, "--limit", "1000", "--json", "tagName,isDraft"));
  const refCache = new Map();
  const resolveCached = (tag) => {
    if (!refCache.has(tag)) refCache.set(tag, resolveRefSha(repo, tag));
    return refCache.get(tag);
  };
  const existingSha = existingReleaseSha(releases, sourceSha, resolveCached);

  const decision = shouldPublish({ jobConclusions, liveSourceSha: sourceSha, mainHead, existingReleaseSha: existingSha });
  console.log(`publish decision: ${decision.publish ? "PUBLISH" : "NO-PUBLISH"} — ${decision.reason}`);
  if (!decision.publish) return;

  // Resolve the two candidate tags: the highest existing semver tag (orphan
  // adoption, Refs #607 defect 1) and the computed next tag (immutability).
  // A proven HTTP 404 means absent => create; any other failure aborts.
  const next = nextVersion(tags);
  const highest = previousVersion(tags);
  const tagShas = {};
  for (const t of [highest, next]) {
    if (!t || Object.prototype.hasOwnProperty.call(tagShas, t)) continue;
    try {
      tagShas[t] = resolveCached(t);
    } catch (err) {
      if (!isRefMissing(err && err.stderr != null ? String(err.stderr) : "")) throw err;
      // Proven 404: tag absent => leave the key unset (create path).
    }
  }
  const plan = planPublication({ tags, tagShas, sourceSha });
  console.log(`publish plan: ${plan.action} tag ${plan.tag} at ${sourceSha} (range base ${plan.previousTag}, createTag=${plan.createTag})`);

  // Local clone (checkout fetch-depth: 0) carries history + tags for the range.
  const log = git("log", "--format=%h %s", `${plan.previousTag}..${sourceSha}`);
  const commits = log === "" ? [] : log.split("\n").map((line) => {
    const sp = line.indexOf(" ");
    return { sha: line.slice(0, sp), subject: line.slice(sp + 1) };
  });
  const gameSourceChanged = git("diff", "--name-only", `${plan.previousTag}..${sourceSha}`, "--", "src") !== "";

  const server = env.GITHUB_SERVER_URL || "https://github.com";
  const runId = env.GITHUB_RUN_ID || "";
  if (!/^\d+$/.test(runId)) throw new Error("GITHUB_RUN_ID must be numeric");
  const notes = buildNotes({
    tag: plan.tag,
    sourceSha,
    previousTag: plan.previousTag,
    commits,
    mainCiRun: env.MAIN_CI_RUN || NO_UPSTREAM_CI,
    deliveryRun: `${server}/${repo}/actions/runs/${runId}`,
    gameSourceChanged,
  });

  if (process.argv.includes("--dry-run")) {
    console.log(`[dry-run] plan=${plan.action} — would ${plan.createTag ? "create tag + release" : "create release only (adopt existing tag)"} ${plan.tag} at ${sourceSha} with notes:\n${notes}`);
    return;
  }

  // Create the tag via the API pointed at the verified SHA ONLY when the plan
  // says it is absent. POST fails if the ref already exists — no force path.
  // Adoption skips the POST entirely: the orphan tag already resolves to the
  // verified SHA, so a retry converges on exactly ONE tag and ONE release.
  if (plan.createTag) {
    gh("api", "--method", "POST", `repos/${repo}/git/refs`,
      "-f", `ref=refs/tags/${plan.tag}`, "-f", `sha=${sourceSha}`);
  }
  const notesFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rw-release-")), "notes.md");
  try {
    fs.writeFileSync(notesFile, notes, "utf8");
    gh("release", "create", plan.tag, "--repo", repo, "--target", sourceSha,
      "--title", plan.tag, "--notes-file", notesFile, "--latest");
  } finally {
    fs.rmSync(notesFile, { force: true });
  }
  console.log(`published ${plan.tag} at ${sourceSha}: ${server}/${repo}/releases/tag/${plan.tag}`);
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
