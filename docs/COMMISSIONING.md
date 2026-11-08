> **Historical commissioning runbook; not the startup task list.** New team startup reads live GitHub Issues and PRs; no hardcoded startup audit. See [GITHUB_WORKFLOW](GITHUB_WORKFLOW.md). Cap: five agents total, coordinator + four children.

# First-run commissioning sprint

This is the first assignment after loading the revised goal. Complete it through the existing OPS-101/102/103 tickets, not a second competing backlog. Coordinator owns the result in `work/commissioning/RESULT.md`. Initial status: **not run**. Repository tests and prior async canaries do not establish that this installation works.

## Prerequisite: plugin installation is separate from Git pull

`/rustwake-team bind` exists only after the companion plugin is installed, registered in the active OpenCode configuration and loaded after restart. MasterGoal does not provide that command. See START_TEAM. If the command is unknown, report companion-not-loaded and use the CLI planning fallback while resolving registration. Do not reinstall MasterGoal or create another forever loop to fix it.

The companion is a reminder and mapped wait guard, not a child-session scheduler. Empty waitTools means no blocking-wait enforcement. Confirm its status and actual tool mappings before claiming enforcement. If installing it requires a restart, checkpoint useful work and tell the sponsor exactly that one restart is needed; no repeated setup questions.

## Evidence required

| Check | Procedure | Pass evidence |
|---|---|---|
| Reconcile | Read actual sessions, worktrees, leases and latest remote/main/deployment state | No duplicate owners; existing unfinished work preserved |
| Concurrent dispatch | Start three useful independent bounded tasks, within configured capacity; read-only assignments are sufficient for this first test | Actual session IDs and execution timestamps prove overlap; coordinator remains responsive |
| Immediate refill | Process the first completed assignment while two peers remain active, and dispatch its useful successor | Completion and successor timestamps plus peer status; no wait-all barrier |
| Ownership | Give independent write scopes/worktrees; test a proposed overlap through the planner | Safe assignments accepted, overlapping proposal rejected without touching production |
| Stop/recovery | On harmless tasks, verify supported cancel/join and reconcile before resuming | Terminal states verified; no orphan mutation, duplicate task or automatic restart |
| Sponsor intake | Run the intake tests in their temporary fixture; separately process any actual sponsor text through normal product review | Original preserved, linked decision/tasks, removal published atomically with acknowledgement; never insert pretend sponsor demands into the real inbox |
| Publication | Publish a useful board/assignment checkpoint before the entire batch completes | Actual remote commit and timestamp, current README, observed state and sample coverage |
| Critical review | Reviewer opens current game captures and names material visual/gameplay shortcomings | Actual candidate/media references, top three issues and a bounded product decision; no text-only beauty verdict |
| Delivery | Complete local OPS-102 commissioning, then observe one successful automatic release and dashboard update | Actions run, served artifact identity, game and team URLs, smoke/rollback evidence; documentation alone is not a pass |

Use available provider capacity if below four, record the actual limit and reason. Do not manufacture extra model traffic for a synthetic 100% utilization target. Preserve stop control: never test cancellation by killing an active deployment or abandoning an atomic Git operation.

## Report and graduation

For every row record `passed | failed | blocked | not-run`, timestamp, evidence reference and next action. Missing information is not a pass. Keep the summary under one page and link detailed receipts. Publish results as they arrive rather than waiting for every row.

Call the team commissioned only when applicable rows pass. If a genuine local credential/device/runtime blocker remains, state **partially commissioned**, keep that task open and continue safe independent game work. Do not hold all development hostage to server setup. Repeat only failed checks or checks invalidated by runtime/configuration changes, not the entire ceremony every turn.

## Delivery discipline after commissioning

- Each assignment has one player/process outcome, explicit write ownership, criteria, candidate/evidence output and a stopping condition. Aim for 15–30 minutes of productive work per slice; inspect slow work rather than canceling solely by elapsed time. If no reviewable result emerges, split scope or explain the real blocker.
- Bound total assigned child work to three. When two candidates await independent review, use the next available slot for QA/release before creating more implementation inventory, unless an urgent incident takes priority.
- Passing coherent code and useful board changes can publish while deployment continues. Main's single writer need not sit idle until server verification completes.
- Handoffs: outcome, SHA, changed paths, checks, evidence, limitations, next action. Put arithmetic and logs in appendices. Read the active ticket and relevant design sections, not the entire history on every turn.
- Compare throughput with rework, defects, failed releases and demonstrated player improvements. Story points are not a target to inflate.
- After roughly three gameplay releases, product runs one concise retrospective and selects one process experiment. Preserve the stable mission while revising the execution plan.
