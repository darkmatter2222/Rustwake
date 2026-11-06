# Executable team dispatcher (0.3.0)

The old 0.2 plugin was advisory: bind, telemetry and a mapped wait guard did not launch workers. Backlog progress counts do not prove active child sessions. Version 0.3 adds an explicit `/rustwake-team start` command using OpenCode 2.0.22's published `session.create`, `session.prompt`, `session.get`, `session.interrupt` and event subscription APIs. Host acceptance still must be verified in the installed OpenCode runtime; mock tests are not live-model evidence.

## Start tonight

Stop the old goal/team and exit OpenCode before updating. Ensure no unmanaged child sessions remain running. In the Rustwake checkout run `git pull --ff-only`, `npm --prefix tools/team-supervisor ci --ignore-scripts`, `npm --prefix tools/team-supervisor test`, and `npm --prefix tools/team-supervisor run install:local`. Restart OpenCode in this checkout, select the rustwake-coordinator agent, then run `/rustwake-team start` followed by `/goal forever goal.md` in the same session. `bind` alone still does not launch anything.

The first start creates three bounded, independent product/reviewer/code-audit assignments. These are a one-time recovery/triage pass, not a permanent audit carousel. The sidebar must show Dispatcher ON, returned child IDs and queued/running states. Running is set only on a host execution-start event; API acceptance is merely queued. BLOCKED displays real API/queue failures. If execution never starts, diagnose provider/permissions/runtime rather than marking work active from backlog text. No claim of overnight execution is valid without these local observations.

## Coordinator execution contract

While dispatcher is ON, the plugin is the only child launcher. Do not use manual task/spawn calls in parallel. At most three child assignments are reserved, in addition to the coordinator. Continue planning, processing sponsor input and integrating completion notices while workers execute. Use the host's child-message tools to read outputs by the recorded session IDs.

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

Allowed roles: developer, reviewer, player, product-owner, release-engineer. IDs are unique and never reused, including after failure. Queue entries are explicit dispatch authorization, so include product approval, dependencies and acceptance details in the prompt. The runtime does not infer readiness from stale board status. Use a temporary file then rename to update the queue atomically. Malformed/mismatched queues fail closed with visible errors.

Path ownership uses explicit relative prefixes, not wildcards. Overlapping writers and parallel release engineers are not dispatched. These leases are cooperative; they are not a filesystem sandbox. All children currently use the repository directory. Do not switch the shared branch, reset/stash peers' work, or broadly stage files. Release integration must coordinate with active writers and stage only reviewed owned files. Plan worktrees separately before authorizing tasks that require them.

After initial triage, queue real implementation, independent QA and release tasks. Keep a useful ready queue. The five-second control tick refills vacant slots from that queue without waiting for all peers. Completed jobs are not automatically re-run. Completion resumes/notifies the coordinator; MasterGoal remains the only model goal loop. If there is no safe work, report a concrete blocker instead of fake utilization or repetitive audits.

## Restart and stop

`.rustwake-runtime/dispatcher.json` is plugin-owned durable state: actual returned session IDs, dispatch intent, outcomes and errors. Do not edit/delete it to manufacture free slots. A restart reconciles recorded sessions using the host API. Unknown dispatch or prompt acceptance reserves capacity and blocks retries to avoid duplicate workers. A different coordinator cannot take unresolved leases. Reopen the owning coordinator and inspect/interupt its workers as appropriate; retain work before rescheduling. Existing legacy workers are not auto-discovered by this API, hence stop them before first use.

`/rustwake-team stop` disables dispatch and interrupts known workers; it does not claim their mutations are rolled back. Restarting the app does not auto-start the dispatcher; use start in the owning session. Plugin disposal clears its control timer. Stop MasterGoal too when ending the team.

The normal delivery path remains reviewed main push → CI → automatic Databrick deployment. No server reinstallation is needed for this plugin update.
