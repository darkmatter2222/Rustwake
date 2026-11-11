> Current planning authority: [GitHub Project and release operations](GITHUB_PROJECT.md). All historical local-board scheduling/publication directions below are retired. Use GitHub Issues/Project/PRs/milestones/Releases; five sessions total. Evidence files and runtime leases are not work boards. Do not run legacy team-scheduler or team-checkpoint for assignments.

# GitHub Issues and PR delivery contract (authoritative from 2026-11-07)

GitHub [Issues](https://github.com/darkmatter2222/Rustwake/issues) is the ONLY active work board. `work/backlog.json`, `work/BOARD.md` and `work/board.html` are historical snapshots, not scheduling inputs; do not keep updating them as a parallel Jira. Use real GitHub issue URLs, issue comments, labels and linked PRs for role handoffs. All personas use the SAME GitHub login: role identity is recorded in a structured comment/labels and dispatch metadata, NOT fake GitHub assignees or self-approval.

Cap model concurrency at **5 active agents total, including coordinator**. This means at most **4 child agents**. Existing running workers must be reconciled before launching a replacement. The runtime dispatcher also enforces the cap.

An implementation begins with an open Issue, gets an isolated `rw/` branch/worktree and a **draft PR** on its first published checkpoint. Every PR targets `main` and references `Closes #<issue-number>`. Developer moves PR to ready after tests; independent reviewer records ACCEPT/REWORK at exact head SHA; product signs off on outcome; release engineer verifies the PR diff and CI, requests rework or merges the PR. **No persona directly pushes to main**, including release engineer. CI/CD deploys only the merged main SHA. The one-time migration commit installing this policy is an explicit sponsor-authorized exception. See `docs/GITHUB_WORKFLOW.md` for CLI commands, role comment format, blockers and migration/recovery.

This section supersedes ALL older six-session/five-worker limits, `work/backlog.json` canonical-ledger language, local-only ticket transitions, direct-main publication steps, and historical branch-only handoff guidance in other files.

# Frequent visible delivery

This contract supersedes older blanket developer no-push rules. Running agents are not shipped outcomes. The sponsor's 2026-11-06 checkpoint followed about nine hours without published commits; it changed 79 files and no src/ files. Treat that as a publication and product-delivery incident, not a successful night of implementation.

## Developers publish their own branches

The coordinator prepares a separate registered Git worktree and unique `rw/<ticket>-g<generation>` branch for each implementation assignment. Use `git worktree add -b rw/TICKET-g1 <separate-directory> origin/main` after fetching origin. Never switch the branch in the shared checkout or discard/stash another worker's work. Set the task's `directory` to the absolute worktree path; the dispatcher verifies repository membership and the rw/ branch before creating the child there. Existing running assignments retain their current location. Finish/checkpoint and reconcile them before moving their changes; don't reset them.

Example task:

```json
{"id":"ART-002-g3","role":"developer","directory":"/absolute/path/to/rustwake-ART-002-g3","write_paths":["src/assigned-component","work/development/ART-002-g3"],"prompt":"Implement the approved playable slice. Run relevant tests and publish coherent feature checkpoints. Return branch, SHA, test results and remaining limitations."}
```

The task must specify exact owned files/paths, acceptance criteria and intended outcome. No permission from the sponsor is needed for normal feature commits or pushes. Product and QA approval are gates to main integration, not to publishing a development branch.

Commit each coherent change. Target a useful feature push every 5–10 minutes when changed work exists; at 15 minutes without a checkpoint, break the assignment into a smaller slice or report the concrete blocker. Do not manufacture empty commits or tiny meaningless edits to meet the clock. Incomplete feature checkpoints are permitted when clearly labeled with failing checks/remaining work and never represented as release-ready. Do not publish credentials, runtime state, dependencies or unrelated files.

From the assigned worktree, publish with:

```sh
node scripts/publish-feature.mjs "feat(ticket): describe the concrete change" src/owned-file.ts work/development/TICKET-g1
```

The helper refuses non-rw branches, unsafe paths and unrelated staged files, commits only explicit owned paths, pushes without force, verifies the remote SHA, and writes a local verified-push receipt under the common Git directory. It does not run tests or certify review. Inspect the staged diff for secrets and unintended changes before using it; filename checks cannot detect every secret. A failed push leaves the local commit intact. Fix auth/connectivity and retry; do not ask the sponsor to push everything. Existing branch commits may also be pushed normally; helper telemetry is unknown for pushes it did not witness.

## Ready work gets released

As soon as a feature checkpoint has a useful reviewable outcome, queue independent review against its exact remote SHA. As soon as accepted work exists, queue one release-engineer assignment. Do not wait for all three current workers or the end of a sprint. The dispatcher prioritizes queued releases, and stops starting new non-release tasks while a release is waiting for safe capacity. It does not interrupt active mutations. Queue only genuinely actionable release tasks; a blocked speculative release would intentionally hold further dispatch.

The release engineer owns the main integration checkout, reconciles origin/main, integrates only approved commits, runs appropriate gates, updates board/README with concrete evidence and pushes main. Target 3–5 minutes from acceptance to integration; investigate delays beyond ten minutes. Feature branches get CI; only successful main CI deploys. Monitor Actions asynchronously by SHA and confirm the deploy job/receipt. Failed/skipped/superseded runs are not successful deployments. No manual server promotion and no force pushes.

Bound assignments to useful slices rather than indefinite research. Product/reviewer/player work should return a decision or actionable handoff, not occupy the same slots all night. After the initial audit, next available implementation capacity must work on an approved playable improvement. A release can publish useful reviewed operational evidence, but documentation-only commits do not substitute for game progress.

## Visible measurements

The sidebar samples publication state at most once per minute: latest local commit, latest feature push verified by the helper, commit count absent from cached origin refs, dirty entries in the coordinator checkout, and latest successful delivery found among the last 20 Actions runs. These are explicitly limited measurements: remote refs may be stale, dirty work in other worktrees is not included, commit time is not push time, and missing gh access is unknown. It must not infer publication from token throughput or running sessions.

At each coordinator pass, inspect these measurements and each handoff. Record first-ready time, acceptance time, branch/SHA and verified push/deploy times in the board's existing evidence fields. Release engineer updates the canonical board using its validator/generator. Do not fabricate timestamps, reset backlog history, or publish private runtime state. Maintain separate tickets for provider failures, publication blockers and game defects.

## First pass after this update

Reconcile existing workers and preserve their output. Read the uploaded startup findings once. Choose a small player-visible implementation, prepare its feature worktree and queue it. Queue a release engineer for any already-approved ready work. Stop extending startup reports indefinitely. Keep at most three child sessions. Upgrade the local plugin to load dispatcher/worktree/telemetry changes; fetching code does not hot-reload an already running plugin.

