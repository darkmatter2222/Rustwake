# Executable team dispatcher (0.6.0)

The old 0.2 plugin was advisory: bind, telemetry and a mapped wait guard did not launch workers. Backlog progress counts do not prove active child sessions. Version 0.3 adds an explicit `/rustwake-team start` command using OpenCode 2.0.22's published `session.create`, `session.prompt`, `session.get`, `session.interrupt` and event subscription APIs. Host acceptance still must be verified in the installed OpenCode runtime; mock tests are not live-model evidence.

## Start tonight

Stop the old goal/team and exit OpenCode before updating. Ensure no unmanaged child sessions remain running. In the Rustwake checkout run `git pull --ff-only`, `npm --prefix tools/team-supervisor ci --ignore-scripts`, `npm --prefix tools/team-supervisor test`, and `npm --prefix tools/team-supervisor run install:local`. Restart OpenCode in this checkout, select the rustwake-coordinator agent, then run `/rustwake-team start` followed by `/goal forever goal.md` in the same session. `bind` alone still does not launch anything.

The first start creates four bounded, independent product/reviewer/code-audit/UI-UX assignments; the fifth child slot is available for the next useful task. These are a one-time recovery/triage pass, not a permanent audit carousel. The sidebar must show Dispatcher ON, returned child IDs and queued/running states. Running is set only on a host execution-start event; API acceptance is merely queued. BLOCKED displays real API/queue failures. If execution never starts, diagnose provider/permissions/runtime rather than marking work active from backlog text. No claim of overnight execution is valid without these local observations.

## Coordinator execution contract

While dispatcher is ON, the plugin is the only child launcher. Do not use manual task/spawn calls in parallel. At most five child assignments are reserved, in addition to the coordinator. Continue planning, processing sponsor input and integrating completion notices while workers execute. Use the host's child-message tools to read outputs by the recorded session IDs.

The coordinator owns `.rustwake-runtime/dispatch-queue.json`. Append bounded tasks in this format (real current coordinator ID required):

```json
{
  "coordinator_session_id": "actual-session-id",
  "tasks": [
    {
      "id": "ART-002-g2",
      "role": "developer",
      "prompt": "Complete the approved scoped change; include tests, evidence and a handoff. Do not push or change branches.",
      "write_paths": ["src/assigned-component", "work/development/ART-002-g2"]
    }
  ]
}
```

Allowed roles: developer, reviewer, player, product-owner, release-engineer, ui-ux. IDs are unique and never reused, including after failure. Queue entries are explicit dispatch authorization, so include product approval, dependencies and acceptance details in the prompt. The runtime does not infer readiness from stale board status. Use a temporary file then rename to update the queue atomically. Malformed/mismatched queues fail closed with visible errors.

Path ownership uses explicit relative prefixes, not wildcards. Overlapping writers and parallel release engineers are not dispatched. These leases are cooperative; they are not a filesystem sandbox. Tasks may now supply an absolute `directory` selecting a registered worktree of this repository. Developer publishing tasks require a separate rw/ feature worktree; omitted directory retains legacy shared-checkout behavior for existing/read-only assignments. Do not switch the shared branch, reset/stash peers' work, or broadly stage files. Release integration must coordinate with active writers and stage only reviewed owned files. Plan worktrees separately before authorizing tasks that require them.

After initial triage, queue real implementation, independent QA and release tasks. Keep a useful ready queue. The five-second control tick refills vacant slots from that queue without waiting for all peers. Completed jobs are not automatically re-run. Completion resumes/notifies the coordinator; MasterGoal remains the only model goal loop. If there is no safe work, report a concrete blocker instead of fake utilization or repetitive audits.

## Restart and stop

`.rustwake-runtime/dispatcher.json` is plugin-owned durable state: actual returned session IDs, dispatch intent, outcomes and errors. Do not edit/delete it to manufacture free slots. A restart reconciles recorded sessions using the host API. Unknown dispatch or prompt acceptance reserves capacity and blocks retries to avoid duplicate workers. Run `/rustwake-team start` in the current coordinator session to recover the team. The plugin verifies recorded children, interrupts the previous coordinator, confirms it is idle, transfers queue ownership, and preserves active workers without replaying prompts. Completed tasks remain completed. The sidebar reports the recovered worker count. Old children keep their original host parent IDs; logical supervision transfers, not the host session tree. The retired coordinator is blocked from tool execution by this plugin if its goal loop wakes again. Use one OpenCode process per checkout; this is session recovery, not distributed multi-host orchestration. If a host session cannot be verified, recovery pauses with a visible error and preserves every reservation. Retry start after host access is restored; never delete state to bypass the check. Existing legacy workers are not auto-discovered by this API, hence stop them before first use.

`/rustwake-team stop` disables dispatch and interrupts known workers; it does not claim their mutations are rolled back. Restarting the app does not auto-start the dispatcher; use start in the current coordinator session. Plugin disposal clears its control timer. Stop MasterGoal too when ending the team.

The normal delivery path remains reviewed main push → CI → automatic Databrick deployment. No server reinstallation is needed for this plugin update.

## Frequent publication contract (supersedes older no-push wording)

Read docs/PUBLICATION.md. Developers are authorized and expected to commit and push their own rw/ feature branches from separate registered worktrees, targeting useful checkpoints every 5–10 minutes when changed work exists. They must not push main or peers' files. The coordinator prepares each worktree, supplies its absolute directory in the dispatch task, and queues independent review and a release engineer promptly when ready. A queued release now gets dispatcher priority and drains conflicting work rather than being starved by new assignments. No blanket wait for every worker. The release engineer remains sole main integrator; successful main CI deploys automatically. Feature pushes provide visibility without claiming acceptance. Report real remote SHA, test limitations and deployment receipts. After startup findings, prioritize a player-visible implementation; do not spend another night extending audits. Publication telemetry distinguishes actual verified helper pushes from commit activity and unknown state.


## UI/UX specialist and six-session limit

Plugin 0.5.0 permits six total model sessions: coordinator plus five workers. Queue role `ui-ux` to invoke `rustwake-ui-ux`; its workflow lives at `.opencode/skills/rustwake-ui-ux/SKILL.md`. It owns mobile interaction design, first-use clarity, navigation, visual hierarchy, accessibility and implementation-ready briefs. Product prioritizes, developers implement, and reviewers independently accept. Give it a scoped `work/design/<ticket>/` output. Do not turn design into endless audit reports or block ready releases.

For existing teams, queue one bounded UI/UX assignment at the next useful free slot; do not recreate completed startup work or discard active leases. Fresh startup includes a UI/UX assignment. Five is a ceiling, not a requirement to invent work. Maintain release priority and feature publication cadence. Startup failures are now recorded in the dispatcher status and shown as START BLOCKED; preserve the exact error and existing session IDs rather than deleting runtime state. This improves diagnostics but does not establish the cause of an unreported host error.
