# Delivery alert (#549) — a cancelled main CI must never silently skip deployment again

## What fires

`.github/workflows/delivery-alert.yml` is an ADDITIVE workflow. `delivery.yml` and `ci.yml` are byte-identical to base main `680c01561331c535c1ad46b477ac09fbdf699397` and must stay that way (hash-guarded in `tests/deliveryAlert.test.mjs`).

Triggers:

- `workflow_run` on `ci` completion, `branches: [main]`. The job guard mirrors delivery.yml's package gate exactly, minus the conclusion check, plus the inversion:
  - `github.event_name == 'workflow_run'`
  - `github.event.workflow_run.event == 'push'`
  - `github.event.workflow_run.head_branch == 'main'`
  - `github.event.workflow_run.head_repository.full_name == github.repository`
  - `github.event.workflow_run.conclusion != 'success'`
- `workflow_dispatch` (main only) with inputs `run_id` (string, required) and `dry_run` (boolean, **default true**).

`!= 'success'` is load-bearing. The real incident (CI run 44063235910, main `ec64143340891d4c9fe1829560243d17e753b506`) was reported `cancelled`, not `failure`; a failure-only comparison would have missed it. The guard covers `cancelled`, `timed_out`, `failure`, `action_required`, `stale`, `skipped` and any unknown future non-success value.

Isolation: own concurrency group `rustwake-delivery-alert` (`cancel-in-progress: false`) — an alert never queues behind or blocks `rustwake-databrick-delivery`. `ubuntu-latest`, `timeout-minutes: 5`, never the self-hosted deploy runner, never a browser. Workflow-level permissions stay `contents: read`; the job alone gets `issues: write` + `actions: read`. Checkout is pinned to `ref: main` because a `workflow_run` payload's head SHA can predate the merge that introduced the script (CI queued before merge, completed after); the alert reads the run payload, not the checkout.

## What it says

Logic lives in `scripts/delivery-alert.mjs` (Node built-ins only, pure exported functions `shouldAlert` / `composeAlert` / `decideDedupe`); the YAML `if:` is a thin text mirror. The alert issue:

- Title: `delivery skipped: main CI run <id> concluded <conclusion>` — the run id in the title is the dedupe key.
- Body: run id + full URL, full 40-char head SHA, conclusion, event, branch, the explicit sentence **"Deployment was skipped and merged code is NOT live"**, the delivery run id/conclusion when one exists for that head SHA (best-effort `gh run list` lookup), the #545 root-cause class (harness keeping the Node event loop alive → ci.yml 14-minute timeout → GitHub reports `cancelled`), and the release engineer's next actions.

## Dedupe

Before creating, the script runs `gh issue list --state open --search "in:title <run id>" --json number,title`. If an OPEN issue already contains the run id in its title, it COMMENTS on that issue instead of opening a duplicate. Only existing labels are reused (`v2` when present); no new label is ever required.

## Injection boundary

Run metadata is untrusted input. All values travel through environment variables into Node (`process.env`); every `gh` call is `execFileSync('gh', [args])` with discrete argv elements and the body via stdin (`--body-file -`). No shell string is ever built. `GH_TOKEN` (`secrets.GITHUB_TOKEN`) is inherited through the environment and never echoed. Dispatch `run_id` must match a bare numeric id before it reaches `gh api`.

## How to dry-run

From main (Actions UI → delivery-alert → Run workflow), or:

```
gh workflow run delivery-alert.yml --ref main -f run_id=44063235910 -f dry_run=true
```

The dry-run shares the EXACT same `shouldAlert`/`composeAlert`/dedupe code path and differs only by skipping the final mutating call (issue create/comment). It prints the composed title/body, the dedupe decision it would take, and writes a step summary. It creates nothing.

Local equivalent (read-only gh calls, no issue created):

```
DELIVERY_ALERT_REPO=darkmatter2222/Rustwake \
DELIVERY_ALERT_EVENT=workflow_run \
DELIVERY_ALERT_DRY_RUN=true \
DELIVERY_ALERT_RUN_JSON="$(cat docs/evidence/549-delivery-alert/fixtures/ci-run-44063235910.json)" \
node scripts/delivery-alert.mjs
```

Committed local dry-run outputs: `docs/evidence/549-delivery-alert/local-dryrun-cancelled.json` (would create; found real delivery run 44065451074 `skipped`) and `local-dryrun-success.json` (no alert).

## Honest limitation

A `workflow_run`-triggered workflow only executes once it exists on the DEFAULT branch. GitHub-side execution of the `workflow_run` alert path is therefore **unproven until the first real non-success main CI after merge**. The YAML tests are text-level contract assertions, not GitHub runtime execution. Post-merge acceptance step (release engineer): dispatch the dry-run against run `44063235910`, confirm the job succeeds, the composed body is correct, and NO issue is created. Only then is the GitHub-side path considered exercised.

## Evidence

No `src/` file changes → no screenshots exist or are claimed. Evidence is `pnpm test` output (327 pass / 0 fail / 0 skip / 0 todo = 309 baseline + 18 new) plus `docs/evidence/549-delivery-alert/report.json`: the two real runs fetched live from the GitHub API, run through the actual functions — cancelled run 44063235910 → alert true; success run 44081765468 → alert false. A mutation check (temporarily weakening the guard to failure-only) broke 4 tests including the named regression control, then was reverted.
