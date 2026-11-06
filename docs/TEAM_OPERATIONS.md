# Sponsor-driven autonomous delivery

## Why the execution contract changed

At inspected main `5a024beb625adfe583d42c656bec6cbc06f5bbbd`, commits on November 5 were hours apart. The published runtime still said activation-required with zero sessions. Local observations from the sponsor describe coordinator waiting on one developer despite spare capacity. This repository cannot infer actual utilization retrospectively; it lacked telemetry. GitHub's authenticated API showed the latest five CI runs successful, contradicting repeated remote-CI-unverified README text. Fix evidence collection and scheduling rather than manufacturing a velocity score.

## The coordinator is a dispatcher, not a waiter

Maximum is six model sessions including PM; target all five child slots occupied by useful eligible work during active host time. Roles can have multiple instances: developer-art, developer-economy, developer-UI are valid when they own nonoverlapping paths/worktrees. Do not impose one developer per team. Independent QA, current-live playtest, product research/triage and release are productive alternatives while another candidate builds.

At every completion and every 30–60 second available heartbeat:
1. Refresh real runtime status and drain completed outputs without an all-worker barrier. Count dispatching calls as reserved slots. Unknown/stale status is not permission to launch duplicates.
2. Check SPONSOR_INBOX.md; dispatch product intake in a free slot. Product incorporates requests into the existing agenda, never replaces it wholesale. Use the durable intake protocol.
3. Produce fresh observed runtime JSON and run `node scripts/team-checkpoint.mjs <observation.json>`. The planner reads live observation plus published tasks. Apply newer coordinator spool task changes to a temporary board for planning when not yet published; never lose them by overwriting with stale Git.
4. Dispatch every safe proposed assignment through the verified asynchronous OpenCode mechanism. Reserve ownership before launch, persist returned session IDs immediately, refresh after dispatch. Do not use a blocking task call then wait for completion before launching peers.
5. If slots remain idle, create a bounded useful assignment from prioritized outcomes: split a ready epic by explicit file ownership, QA an immutable prior candidate, critique current screen/motion/audio, triage sponsor input, investigate a defect, or integrate/publish. Three developers are allowed; conflicting CSS/simulation edits are not.
6. If no useful independent work exists, record exact idle reason and next unblock event. Idle is preferable to fake tests, unsolicited features or meaningless meetings. Evaluate capacity by useful outcomes and rework, not GPU utilization alone.
7. Publish changed checkpoints; yield to MasterGoal. Never hold a turn in a long wait while other slots can work. The companion guard can reject mapped blocking waits when a fresh observation proves runnable spare capacity.

Task scheduling fields: `scheduling.enabled`, `write_paths` (real repository path prefixes/globs, not prose), `ready_at`, optional `role`/`base_sha`. Update write ownership for each phase: developer source scope; QA its unique review output; product its decision output; release its exclusive integration lane. Read-only interaction still has a unique evidence/output scope and a leased browser/port. Planner considers dependencies and overdue review/release. All actual launches remain through the host's supported session API. A pure planner is not a scheduler service.

## Telemetry and velocity

Keep active observations in ignored runtime storage, then publish sanitized samples on useful changes. `runtime.observed_at`, `runtime.source`, and `runtime.sessions` reflect actual host reads, not guessed activity. Each session includes session_id, task_id, generation, role, status and write_paths. Public dashboard omits private IDs/paths.

`telemetry.samples` contains `{observed_at, active_children, capacity_children}` from real observations. Collect while host is active roughly every 60 seconds; preserve a bounded rolling 24-hour window with archived daily summaries. Missing intervals over 120 seconds stay unknown, not 0% or 100%. Utilization is observed occupied child-slot time divided by observed available child-slot time; also show coverage. It is not proof of productive thinking or GPU saturation.

Tickets may have `estimate: {points, estimated_at}`. Product and developer estimate before implementation on a consistent 1/2/3/5/8 scale; split larger work. Never retroactively award points, inflate estimates after completion or compare personas by velocity. Board distinguishes published/deployed ticket counts and prospectively estimated points, meaningful cycle duration, rework and observed coverage. Zero-duration backfilled history is not an instantaneous delivery record. Existing work without estimates remains unestimated. Velocity is a planning signal, not the game-quality objective.

## Visible progress with bounded Git churn

Maintain changed runtime checkpoints each heartbeat. Publish new assignments, meaningful state changes, sponsor acknowledgements, blockers and completed work to GitHub at most every 3–5 minutes while changes exist. Investigate eligible work waiting >10 minutes. Do not wait until a deployment is finished to publish accepted code or until a whole sprint ends to publish the board. One integration writer processes small status batches while developers continue in worktrees. No empty commits or fabricated heartbeat-only changes.

README displays a compact current outcome, main versus deployed status and evidence links. Board contains the detail. Use actual Git commit/API times for publication; do not backdate all states to a single time. A missing gh login is not a failed CI: query authenticated connected access or local configured credentials without exposing them. CI success and deployment success remain separate.

HTML board refreshes automatically and exposes freshness. Public `/rustwake/team/` is a sanitized view packaged by delivery, not the private backlog/receipts. Documentation-only board updates can publish this view without redeploying gameplay. See AUTOMATED_DELIVERY for activation. Until deployed and verified, README marks that URL planned.

## Critical product review

The personas are demanding. Each visual review starts by opening actual fresh screenshots and answering: would this look like a polished commercial game at normal phone size, or still an engineering demo? Name the three most damaging visible defects and a concrete design alternative. Inspect scene composition, material/art direction, machinery identity, world/UI hierarchy and motion continuity. Test audio through supported listening; do not substitute wave statistics. A score needs observed evidence; the review cannot be accepted because text exists or dimensions fit.

Compare against the approved style reference and previous build, not an invented market benchmark. A machine made numerically unique by a tiny tick can still fail identity. A cheapest-first button order is not evidence of strategy. Player tests should find meaningful competing plans and visible consequences. QA/product may reject an ugly technically valid candidate, or approve a clearly labeled limited preview without declaring polish complete. After two metric-only implementation slices, product chooses a material player-visible experiment.

## Companion plugin and local activation

`tools/team-supervisor` is a project-local OpenCode 2 companion using the same `Plugin.define`, context hook, command transform and tool hook API inspected in opencode_mastergoal's current server source. It adds contextual operational reminders and a narrow blocking-wait guard; it does not spawn workers, implement cancellation, or run another forever loop. Guard requires actual installed wait-tool names and fresh observations. Do not claim this plugin guarantees throughput or portable runtime compatibility before the local canary.

On the Windows checkout, the local team can run:

```sh
npm --prefix tools/team-supervisor install --ignore-scripts
npm --prefix tools/team-supervisor run install:local
```

This installer preserves provider and MasterGoal config, backs up the project OpenCode configuration and adds only the companion registration. If the launcher uses an external OPENCODE_CONFIG override, apply the registration to that active config instead using its existing maintenance procedure; do not assume project config wins. `waitTools` starts empty deliberately. Discover the installed background wait tool names, add exact names, and test that a spare-capacity wait rejects while cancel/stop still works. Do not guess or block every tool containing “wait”.

Reload OpenCode, select coordinator, `/rustwake-team bind`, then `/goal forever goal.md`. Check `/rustwake-team status`. After host restart binding is lost intentionally; rebind after reconciliation. `/goal stop` remains authoritative; `/rustwake-team stop` clears the guard. No timers or automatic prompts are installed by this companion. If plugin loading fails, continue via scheduler/checkpoint CLI and record runtime incompatibility; do not install arbitrary community plugins blindly.

The team is authorized to perform this local setup and the CI/CD setup using existing HomeAILab procedures. This cloud update cannot install on Ryan's PC or register a server runner; publish an activation receipt when the local team actually does so.

