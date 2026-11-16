> Current planning authority: [GitHub Project and release operations](GITHUB_PROJECT.md). All historical local-board scheduling/publication directions below are retired. Use GitHub Issues/Project/PRs/milestones/Releases; five sessions total. Evidence files and runtime leases are not work boards. Do not run legacy team-scheduler or team-checkpoint for assignments.

# GitHub Issues and PR delivery contract (authoritative from 2026-11-07)

GitHub [Issues](https://github.com/darkmatter2222/Rustwake/issues) is the ONLY active work board. `work/backlog.json`, `work/BOARD.md` and `work/board.html` are historical snapshots, not scheduling inputs; do not keep updating them as a parallel Jira. Use real GitHub issue URLs, issue comments, labels and linked PRs for role handoffs. All personas use the SAME GitHub login: role identity is recorded in a structured comment/labels and dispatch metadata, NOT fake GitHub assignees or self-approval.

Cap model concurrency at **5 active agents total, including coordinator**. This means at most **4 child agents**. Existing running workers must be reconciled before launching a replacement. The runtime dispatcher also enforces the cap.

An implementation begins with an open Issue, gets an isolated `rw/` branch/worktree and a **draft PR** on its first published checkpoint. Every PR targets `main` and references `Closes #<issue-number>`. Developer moves PR to ready after tests; independent reviewer records ACCEPT/REWORK at exact head SHA; product signs off on outcome; release engineer verifies the PR diff and CI, requests rework or merges the PR. **No persona directly pushes to main**, including release engineer. CI/CD deploys only the merged main SHA. The one-time migration commit installing this policy is an explicit sponsor-authorized exception. See `docs/GITHUB_WORKFLOW.md` for CLI commands, role comment format, blockers and migration/recovery.

This section supersedes ALL older six-session/five-worker limits, `work/backlog.json` canonical-ledger language, local-only ticket transitions, direct-main publication steps, and historical branch-only handoff guidance in other files.

# Executable team dispatcher (0.8.0)

The old 0.2 plugin was advisory: bind, telemetry and a mapped wait guard did not launch workers. Backlog progress counts do not prove active child sessions. Version 0.3 adds an explicit `/rustwake-team start` command using OpenCode 2.0.22's published `session.create`, `session.prompt`, `session.get`, `session.interrupt` and event subscription APIs. Host acceptance still must be verified in the installed OpenCode runtime; mock tests are not live-model evidence.

## Start tonight

Stop the old goal/team and exit OpenCode before updating. Ensure no unmanaged child sessions remain running. In the Rustwake checkout run `git pull --ff-only`, `npm --prefix tools/team-supervisor ci --ignore-scripts`, `npm --prefix tools/team-supervisor test`, and `npm --prefix tools/team-supervisor run install:local`. Restart OpenCode in this checkout, select the rustwake-coordinator agent, then run `/rustwake-team start` followed by `/goal forever goal.md` in the same session. `bind` alone still does not launch anything.

The first start creates an EMPTY dispatcher queue. The coordinator reads the open GitHub Issues and PRs, then prepares bounded assignments with canonical issue_url; at most four children can run. No automatic startup audit carousel. The sidebar must show Dispatcher ON, returned child IDs and queued/running states. Running is set only on a host execution-start event; API acceptance is merely queued. BLOCKED displays real API/queue failures. If execution never starts, diagnose provider/permissions/runtime rather than marking work active from backlog text. No claim of overnight execution is valid without these local observations.

## Coordinator execution contract

While dispatcher is ON, the plugin is the only child launcher. Do not use manual task/spawn calls in parallel. At most four child assignments are reserved, in addition to the coordinator (five total). Continue planning, processing sponsor input and integrating completion notices while workers execute. Use the host's child-message tools to read outputs by the recorded session IDs.

The coordinator owns `.rustwake-runtime/dispatch-queue.json`. Append bounded tasks in this format (real current coordinator ID required):

```json
{
  "coordinator_session_id": "actual-session-id",
  "tasks": [
    {
      "id": "ART-002-g2",
      "issue_url": "https://github.com/darkmatter2222/Rustwake/issues/12",
      "role": "developer",
      "prompt": "Complete the approved scoped change; include tests, evidence and a handoff. Use own rw/ branch, push and open a linked draft PR; do not push main.",
      "write_paths": ["src/assigned-component", "work/development/ART-002-g2"]
    }
  ]
}
```

Allowed roles: developer, reviewer, player, product-owner, release-engineer, ui-ux. IDs are unique and never reused, including after failure. Queue entries are explicit dispatch authorization, so include product approval, dependencies and acceptance details in the prompt. The runtime does not infer readiness from stale board status. Use a temporary file then rename to update the queue atomically. The dispatch plugin verifies each canonical issue_url is an OPEN GitHub Issue via authenticated gh CLI; missing gh access blocks dispatch. Malformed/mismatched queues fail closed with visible errors.

Path ownership uses explicit relative prefixes, not wildcards. Overlapping writers and parallel release engineers are not dispatched. These leases are cooperative; they are not a filesystem sandbox. Tasks may now supply an absolute `directory` selecting a registered worktree of this repository. Developer publishing tasks require a separate rw/ feature worktree; omitted directory retains legacy shared-checkout behavior for existing/read-only assignments. Do not switch the shared branch, reset/stash peers' work, or broadly stage files. Release integration must coordinate with active writers and stage only reviewed owned files. Plan worktrees separately before authorizing tasks that require them.

After initial triage, queue real implementation, independent QA and release tasks. Keep a useful ready queue. The five-second control tick refills up to four vacant child slots from GitHub-Issue-derived assignments in that transient queue without waiting for all peers. Completed jobs are not automatically re-run. Completion resumes/notifies the coordinator; MasterGoal remains the only model goal loop. If there is no safe work, report a concrete blocker instead of fake utilization or repetitive audits.

## Fresh start and stop

Fresh-team lifecycle (0.7.0): every explicit `/rustwake-team start` starts new employees with new host sessions. On a newly loaded plugin, the first prompt in the rustwake-coordinator agent also starts a fresh team automatically; bind alone remains advisory. Archive previous dispatcher and queue under `.rustwake-runtime/archive/`; cancel known old executions, treating Session.NotFoundError as already gone. Never resume archived queues, poll missing old employees, or retain their capacity reservations. Preserve all repository files, backlog, sponsor input, branches and uncommitted worktree edits. New employees inspect current work and create a new agenda; they must not blindly overwrite unfinished edits. A genuine cancellation transport failure is a visible startup blocker to prevent competing writers. One OpenCode process per checkout. Coordinator plus at most four employees. Fresh startup launches no automatic triage; the coordinator queues only eligible GitHub assignments.

Stop MasterGoal and use `/rustwake-team stop` to end execution. There is no recovery retry loop. Restart OpenCode after installing this update.

## Frequent publication contract (supersedes older no-push wording)

Read docs/PUBLICATION.md. Developers are authorized and expected to commit and push their own rw/ feature branches from separate registered worktrees, targeting useful checkpoints every 5–10 minutes when changed work exists. They must not push main or peers' files. The coordinator prepares each worktree, supplies its absolute directory in the dispatch task, and queues independent review and a release engineer promptly when ready. A queued release now gets dispatcher priority and drains conflicting work rather than being starved by new assignments. No blanket wait for every worker. The release engineer remains sole main integrator; successful main CI deploys automatically. Feature pushes provide visibility without claiming acceptance. Report real remote SHA, test limitations and deployment receipts. After startup findings, prioritize a player-visible implementation; do not spend another night extending audits. Publication telemetry distinguishes actual verified helper pushes from commit activity and unknown state.


## UI/UX specialist and five-session limit

Current dispatcher permits five total model sessions: coordinator plus four workers. Queue role `ui-ux` to invoke `rustwake-ui-ux`; its workflow lives at `.opencode/skills/rustwake-ui-ux/SKILL.md`. It owns mobile interaction design, first-use clarity, navigation, visual hierarchy, accessibility and implementation-ready briefs. Product prioritizes, developers implement, and reviewers independently accept. Give it a scoped `work/design/<ticket>/` output. Do not turn design into endless audit reports or block ready releases.

For existing teams, queue one bounded UI/UX assignment at the next useful free slot; do not recreate completed startup work or discard active leases. Queue UI/UX only when an eligible issue needs it. Four children is a ceiling, not a requirement to invent work. Maintain release priority and feature publication cadence. Startup failures are now recorded in the dispatcher status and shown as START BLOCKED; preserve the exact error and existing session IDs rather than deleting runtime state. This improves diagnostics but does not establish the cause of an unreported host error.



## Runtime health and quiet waiting (0.8.0)

When no safe scheduling or handoff action remains, call `rustwake_wait` with the revision from dispatcher status. This holds a tool wait until a team transition, cancellation, stop, or a five-minute health deadline. Do not run repeated model turns polling CPU, file modification times, GitHub comments or `team.query`. CPU activity and timestamp changes do not prove a useful deliverable. At a deadline inspect the exact recorded child ID once, record an actionable blocker if needed, then wait again. The five-second plugin control tick is bookkeeping, not a model prompt loop. MasterGoal may independently resume turns; these instructions apply to every resumed turn.

A start without an execution event is unconfirmed after two minutes. No observed host progress for ten minutes raises a warning; neither warning proves a worker is dead. Host token/tool activity is liveness evidence only. Completion requires issue/PR/artifact evidence and acceptance at the current SHA. Unrelated reasoning or repeated identical checks requires a context-drift blocker and controlled handoff, not continued unsupported progress claims.

Host requests have bounded waits. An ambiguous timeout retains the worker lease and blocks unsafe replacement. Event-stream failure blocks new dispatch and is visible. Repeated terminal events do not repeatedly wake the coordinator. The sidebar counts tracked leases, not all processes on the machine. The published SDK has no session-list API here, so children that predate the subscription cannot be auto-enumerated. Use `/rustwake-team reconcile <child-session-id> [more-ids]` to register known children of this coordinator before considering spare capacity. An unmanaged child blocks launches until stopped/reconciled; historical completed outcomes alone do not prove it is currently idle. Preserve unknown creation intents; do not delete dispatcher state to bypass them.

The plugin suppresses known manual launch tools (`task`, `team.launch`, `team.spawn`); additional host aliases can be configured in `manualLaunchTools`. This is cooperative enforcement, not a sandbox against arbitrary shell launchers. All personas must use the dispatcher as the sole child launcher. The optional legacy mapped wait guard can still say “not configured”; the core quiet wait is `rustwake_wait`.

Local adoption is required: stop the goal/team, preserve dirty work and feature branches, update main using a fast-forward only, run `npm --prefix tools/team-supervisor ci --ignore-scripts`, `npm --prefix tools/team-supervisor test`, then `npm --prefix tools/team-supervisor run install:local`. Restart OpenCode. Do not discard local changes to force a pull. Confirm plugin 0.8.0, bound coordinator ID, tracked child IDs, and an observed execution-start/completion transition. Record that receipt in GitHub issue #72/#44. Repository merge and game deployment do not prove local plugin adoption.
