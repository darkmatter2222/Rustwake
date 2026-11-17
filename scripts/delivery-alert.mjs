/**
 * Issue #549: a cancelled main CI must never silently skip deployment again.
 *
 * Pure guard + alert composition for .github/workflows/delivery-alert.yml.
 * Node built-ins only. The YAML `if:` is a thin mirror of shouldAlert(); the
 * dry-run path shares this exact code and differs ONLY by skipping the final
 * mutating gh call (issue create / issue comment).
 *
 * Injection boundary: run metadata is UNTRUSTED input. Nothing here builds a
 * shell string. Every gh invocation is execFileSync('gh', [args]) with values
 * passed as discrete argv elements or via stdin (--body-file -). Secrets are
 * inherited through the environment (GH_TOKEN) and never printed.
 *
 * Incident being prevented (real, measured): main ec64143340891d4c9fe1829560243d17e753b506,
 * CI run 44063235910 hit ci.yml's 14-minute timeout because a test harness kept
 * the Node event loop alive; GitHub reported `cancelled` (NOT `failure`);
 * delivery.yml's package gate (conclusion == 'success') skipped all four
 * delivery jobs (run 44065451074) and merged code sat undeployed with no alert.
 * Root cause fixed by #545/#546; this script covers the whole non-success class.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

/**
 * Mirror of delivery.yml's package gate, minus the conclusion check, plus the
 * inversion. `!= 'success'` is load-bearing: `== 'failure'` would have missed
 * the actual incident (`cancelled`). Unknown future non-success conclusions
 * (including null/undefined on a completed run) must alert too.
 *
 * @param {object} run plain workflow_run object (GitHub API / event payload)
 * @returns {boolean}
 */
export function shouldAlert(run) {
  if (!run || typeof run !== "object") return false;
  const headRepo = run.head_repository && run.head_repository.full_name;
  const baseRepo = run.repository && run.repository.full_name;
  return (
    run.event === "push" &&
    run.head_branch === "main" &&
    typeof headRepo === "string" &&
    typeof baseRepo === "string" &&
    headRepo.length > 0 &&
    headRepo === baseRepo &&
    run.conclusion !== "success"
  );
}

/**
 * Compose the alert issue title/body. Pure: no I/O, no shell, no network.
 * @param {object} run
 * @param {{repo: string, deliveryRun?: {id:number|string, conclusion?:string, status?:string, html_url?:string}|null}} opts
 * @returns {{title: string, body: string}}
 */
export function composeAlert(run, { repo, deliveryRun } = {}) {
  const id = String(run.id);
  const conclusion = String(run.conclusion);
  const url = run.html_url || `https://github.com/${repo}/actions/runs/${id}`;
  const sha = String(run.head_sha || "(head SHA unavailable)");
  const title = `delivery skipped: main CI run ${id} concluded ${conclusion}`;
  const deliveryLine = deliveryRun
    ? `- Delivery run: ${deliveryRun.id} (\`${deliveryRun.conclusion || deliveryRun.status || "unknown"}\`) — ${deliveryRun.html_url || `https://github.com/${repo}/actions/runs/${deliveryRun.id}`}`
    : "- Delivery run: none found yet for this head SHA (delivery.yml triggers on the same CI completion; its jobs gate on `conclusion == 'success'` and are skipped).";
  const body = [
    "## Deployment was skipped and merged code is NOT live",
    "",
    `Main CI run **${id}** concluded \`${conclusion}\` (event \`${run.event}\`, branch \`${run.head_branch}\`).`,
    "delivery.yml's `package` job gates on `github.event.workflow_run.conclusion == 'success'`, so **all four delivery jobs (`package`, `deploy`, `verify-live`, `hosted-browser`) were skipped**. **Deployment was skipped and merged code is NOT live.** The live site keeps serving the previously deployed SHA until a green main CI delivers this one.",
    "",
    `- CI run: ${id} — ${url}`,
    `- Head SHA: \`${sha}\``,
    `- Conclusion: \`${conclusion}\``,
    `- Event: \`${run.event}\``,
    `- Branch: \`${run.head_branch}\``,
    deliveryLine,
    "",
    "### Root-cause class (#545)",
    "The measured instance of this class: a test harness kept the Node event loop alive, `node --test` never exited, ci.yml's `timeout-minutes: 14` killed the job, and GitHub reported the conclusion as `cancelled` — not `failure`. The known harness hang was fixed by #545 / #546, but ANY non-success conclusion (`cancelled`, `timed_out`, `failure`, `action_required`, `stale`, `skipped`, or a future value) silently skips delivery the same way. This alert exists so that can never again go unnoticed.",
    "",
    "### Next action (release engineer)",
    "1. Open the CI run above and read the failing/timed-out step.",
    "2. Land the fix on main (or re-run the failed CI jobs if transient) until main CI concludes `success`.",
    "3. Confirm the delivery run for the new main SHA completes all four jobs, then verify the live SHA equals main.",
    "",
    "_Filed automatically by `.github/workflows/delivery-alert.yml` (issue #549). Dedupe key: CI run id in the title._",
  ].join("\n");
  return { title, body };
}

/**
 * Dedupe decision: if an OPEN issue already contains this run id in its title,
 * comment on it instead of opening a duplicate. Pure over an injected list.
 * @param {number|string} runId
 * @param {Array<{number:number, title:string}>} openIssues
 * @returns {{action: "comment", issueNumber: number}|{action: "create"}}
 */
export function decideDedupe(runId, openIssues) {
  const needle = String(runId);
  const hit = (openIssues || []).find(
    (i) => i && typeof i.title === "string" && i.title.includes(needle)
  );
  return hit ? { action: "comment", issueNumber: hit.number } : { action: "create" };
}

/** Dispatch input boundary: only a bare numeric run id may reach `gh api`. */
export function validateRunId(value) {
  const s = String(value ?? "");
  if (!/^\d{1,20}$/.test(s) || !Number.isSafeInteger(Number(s))) {
    throw new Error("run_id must be a numeric GitHub Actions run id");
  }
  return s;
}

/** Repo slug boundary before it reaches any gh argv element. */
export function validateRepo(value) {
  const s = String(value ?? "");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s)) {
    throw new Error("repo must be owner/name");
  }
  return s;
}

/** gh argv builders — discrete elements, never a shell string. Exported for tests. */
export function issueListArgs(repo, runId) {
  return [
    "issue", "list", "--repo", validateRepo(repo), "--state", "open",
    "--search", `in:title ${validateRunId(runId)}`,
    "--json", "number,title", "--limit", "100",
  ];
}
export function issueCreateArgs(repo, title, labels) {
  const args = ["issue", "create", "--repo", validateRepo(repo), "--title", String(title), "--body-file", "-"];
  for (const label of labels || []) args.push("--label", String(label));
  return args;
}
export function issueCommentArgs(repo, issueNumber) {
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
    throw new Error("issueNumber must be a positive integer");
  }
  return ["issue", "comment", String(issueNumber), "--repo", validateRepo(repo), "--body-file", "-"];
}

function gh(args, input) {
  // No shell. GH_TOKEN is inherited from the environment and never logged.
  return execFileSync("gh", args, {
    encoding: "utf8",
    input,
    env: process.env,
    maxBuffer: 16 * 1024 * 1024,
  });
}
function ghJson(args) {
  return JSON.parse(gh(args));
}

/** Best-effort delivery-run lookup; never fatal (the alert must still fire). */
function findDeliveryRun(repo, headSha) {
  try {
    const runs = ghJson([
      "run", "list", "--repo", repo, "--workflow", "delivery.yml",
      "--json", "databaseId,conclusion,status,headSha,event", "--limit", "30",
    ]);
    const hit = runs.find((r) => r.headSha === headSha && r.event === "workflow_run");
    if (!hit) return null;
    return {
      id: hit.databaseId,
      conclusion: hit.conclusion,
      status: hit.status,
      html_url: `https://github.com/${repo}/actions/runs/${hit.databaseId}`,
    };
  } catch {
    return null;
  }
}

async function main() {
  const repo = validateRepo(process.env.DELIVERY_ALERT_REPO);
  const eventName = process.env.DELIVERY_ALERT_EVENT;
  const dryRun = process.env.DELIVERY_ALERT_DRY_RUN === "true";

  let run;
  if (eventName === "workflow_run") {
    run = JSON.parse(process.env.DELIVERY_ALERT_RUN_JSON || "null");
  } else if (eventName === "workflow_dispatch") {
    const runId = validateRunId(process.env.DELIVERY_ALERT_RUN_ID);
    run = ghJson(["api", `repos/${repo}/actions/runs/${runId}`]);
  } else {
    throw new Error(`unsupported event: ${eventName}`);
  }

  const verdict = shouldAlert(run);
  const report = { issue: 549, event: eventName, dryRun, shouldAlert: verdict, run: run && run.id };

  if (!verdict) {
    report.action = "none";
    console.log(`delivery-alert: no alert needed (run ${run && run.id}, conclusion ${run && run.conclusion}).`);
  } else {
    const deliveryRun = findDeliveryRun(repo, run.head_sha);
    const { title, body } = composeAlert(run, { repo, deliveryRun });
    report.title = title;
    report.body = body;
    report.deliveryRun = deliveryRun;
    console.log(`delivery-alert: ${title}\n\n${body}`);

    // Same code path for dry-run and real alert; only the mutating call differs.
    const openIssues = ghJson(issueListArgs(repo, run.id));
    const decision = decideDedupe(run.id, openIssues);
    report.dedupe = decision;
    if (dryRun) {
      report.action = `dry-run (would ${decision.action})`;
      console.log(`delivery-alert: DRY RUN — would ${decision.action}${decision.issueNumber ? ` on #${decision.issueNumber}` : " a new issue"}. No issue created or commented.`);
    } else if (decision.action === "comment") {
      gh(issueCommentArgs(repo, decision.issueNumber), body);
      report.action = `commented #${decision.issueNumber}`;
      console.log(`delivery-alert: commented on existing issue #${decision.issueNumber}.`);
    } else {
      // Reuse EXISTING labels only; never depend on creating a new label.
      let labels = [];
      try {
        const existing = ghJson(["label", "list", "--repo", repo, "--json", "name", "--limit", "200"]);
        if (existing.some((l) => l.name === "v2")) labels = ["v2"];
      } catch { /* labels are cosmetic; the alert must still post */ }
      const created = gh(issueCreateArgs(repo, title, labels), body).trim();
      report.action = `created ${created}`;
      console.log(`delivery-alert: created issue ${created}`);
    }
  }

  if (process.env.DELIVERY_ALERT_OUT) {
    fs.mkdirSync(path.dirname(process.env.DELIVERY_ALERT_OUT), { recursive: true });
    fs.writeFileSync(process.env.DELIVERY_ALERT_OUT, JSON.stringify(report, null, 2) + "\n");
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [`### Delivery alert (#549)`, "", `- shouldAlert: **${verdict}**`, `- action: ${report.action}`];
    if (report.title) lines.push(`- title: ${report.title}`);
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) {
  main().catch((err) => {
    console.error(`delivery-alert FAILED: ${err.message}`);
    process.exitCode = 1;
  });
}
