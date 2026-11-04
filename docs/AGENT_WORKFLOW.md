# Rustwake continuous studio workflow

## What is configured versus running

The repository contains OpenCode role definitions and operating contracts. It does not claim these Markdown files are a running scheduler. The local coordinator must verify the installed runtime's dispatch/status/cancel capabilities and write a capability receipt before reporting concurrent operation. MasterGoal source confirms forever prompt continuation for its bound session; it does not by itself establish this project's multi-session scheduler.

Roles follow the inspected HomeAILab `.opencode/agents/*.md` conventions: YAML `description`, `mode`, and `permissions` entries with `action`, `resource`, `effect`. Verify the local installed OpenCode accepts them; do not replace the user's provider settings or broad permissions. Keep model selection inherited. Inspect launcher overrides: HomeAILab's text-only 5090 launcher denies image reads; its vision launcher differs. A model family name is not proof that the actual review session can consume screenshots.

## Roles and exclusive ownership

| Role | Owns | May inspect | Must not do |
|---|---|---|---|
| Coordinator | assignment queue, priorities, runtime session ledger | all receipts and artifacts | edit production code concurrently, push main, mutate servers |
| Developer | assigned source/test change in isolated worktree | design, reviews, fixtures | self-approve quality, push main, deploy |
| Reviewer | design critique, hypotheses, screenshots/clips, independent verdicts in its area | immutable candidate build/source | modify production code, rewrite tests to accept its preferences, push/deploy |
| Publisher | integration checkout, main commits/pushes, README and tracked status publication | handoffs, reviews, CI | deploy, invent review approval, push untested source |
| Deployer | Rustwake release operations and deployment receipts | eligible immutable release, scoped HomeAILab references | push main, change other stacks, expose credentials |

Only one writer per checkout and only one publisher/deployer lease. Agent permission frontmatter reduces accidental actions but is not a filesystem/security sandbox against arbitrary shell access. Enforce worktree separation, role-specific tools where supported, and target validation in actual deployment tooling.

## Local paths and worktrees

Discover the actual Rustwake checkout; do not assume the Windows path from a different machine. Use `git worktree` for developer, reviewer/build testing and integration, each with a role/task branch. Never share one mutable source tree among concurrent roles. Capture servers use distinct discovered free localhost ports or a serialized browser/server lease; no visible browser windows by default.

The coordinator maintains a local ignored spool at `<canonical Rustwake>/.rustwake-runtime/`. Add that exact directory to `.gitignore` during activation. It contains process/session IDs, heartbeats, leases, inbox messages, temporary reports and local-only deployment context. Secrets remain in HomeAILab's credential system, never this spool's public receipts. Do not commit local endpoint credentials or provider tokens.

Workers write uniquely named messages to their own spool directory using temporary-file + atomic rename. Coordinator reads only complete messages. Publisher imports selected sanitized artifacts into tracked `work/` and `docs/`. No agent appends concurrently to another agent's file. Tracked `work/BOARD.md` is the published view; live queue changes are coordinator-owned in the spool until publisher commits them.

## Capability canary before activation

1. Inspect installed OpenCode version, actual launcher/config, registered agents and runtime documentation. Preserve user settings. Confirm the coordinator is selected and child role definitions load.
2. Discover supported asynchronous child-session/task submission, status/result retrieval, cancellation and session reuse. Record exact documented mechanism, version and scope in a local receipt. Do not assume the ordinary task tool is nonblocking.
3. Dispatch two harmless bounded read-only tasks with distinct IDs. Observe overlapping execution timestamps while coordinator remains able to inspect state. One task should finish before the other; process its result without waiting for the second.
4. Verify cancel/pause propagation, stale-session reconciliation and output isolation. No child may continue mutating after coordinator relinquishes ownership.
5. Verify reviewer image capability with one authorized repository screenshot, and verify it reports visible facts. Inspect images sequentially for the configured one-image limit.
6. Publish a sanitized capability receipt to `work/review/` with `supported`, `serial-fallback`, or `blocked`. A serial fallback is useful but does not fulfill the parallel-run requirement; keep the adapter/capability task open.

Use supported session APIs if available. Do not copy an SDK example with invented endpoint names or start multiple CLI `run` processes assuming they share lifecycle correctly. If an adapter is needed, build it against the locally installed documented interface, test it with the canary, and keep MasterGoal as the only outer continuation owner. Do not install a competing forever watchdog.

## Coordinator scheduling algorithm

Maintain per-role state: `idle | assigned | running | result-ready | failed | canceled | blocked`; include task ID, session ID, worktree, base SHA, assigned scope, heartbeat time and generation token.

At each available heartbeat (target 30–60 seconds while work is active, subject to host scheduling):

- Drain completed messages and record each once by message ID.
- Process each ready result independently. There is no `wait for all agents` barrier.
- Refill an idle developer from ready implementation tasks.
- Refill reviewer with a completed candidate; if none, review the last stable build or design a bounded next improvement. Never review a half-written checkout.
- Wake publisher when a coherent candidate or useful new progress receipt is ready.
- Wake deployer when a new eligible reviewed revision exists and no deployment is active.
- If capacity is saturated, queue short operations and preserve the primary developer/reviewer pair. Default two heavy model tasks; increase only within configured provider capacity.
- Yield when no immediate coordination work remains. Children may continue under verified host session support.

A slow task is not failed simply because a timer elapsed. Check actual runtime status. For absent heartbeats, investigate and cancel/join before reassigning ownership. Generation tokens prevent an old recovered worker's late result from overwriting a newer assignment. Do not launch duplicates on every coordinator turn.

## Queue and task format

Canonical IDs are stable (`Q-001`, `ENG-001`, `OPS-001`). A task file contains:

```yaml
id: Q-001
status: ready
priority: P0
owner: unassigned
base_sha: observed-source-sha
scope: [src/ui/Panels.tsx, src/ui/styles.css]
problem: visible player-facing failure
expected_outcome: observable improvement
acceptance: [specific checks]
evidence: [path and scenario]
dependencies: []
review_required: true
```

Place prose detail below the frontmatter. Reviewers author findings; coordinator deduplicates and assigns them. Developer submits a handoff with candidate commit, changed files, checks, fresh evidence, known limitations and reproduction. Reviewer returns `accept | rework | blocked`, scoped to the exact SHA and criteria. Findings close only after acceptance evidence, not after a developer marks a checkbox.

Task transitions: proposed → triaged → ready → assigned → implementing → review-ready → accepted/rework/blocked → integrated → published → deployed when relevant. Deployment is not required for a documentation-only task. A review rejection returns only its bounded task to rework; other independent tasks continue.

## Review while development continues

Reviewer tests commit A in its own checkout while developer starts an independent task B from a safe base. If A needs rework, coordinator schedules it without editing B's worktree. At most one unreviewed large visual redesign should accumulate; small isolated fixes can proceed. This bounds wasted work without a global barrier.

Reviewer should allocate time across actual screenshots, gameplay interaction, animation evidence, audio evidence, and concrete experiments. Static metrics alone do not satisfy review. New ideas must state player benefit, estimated scope, risks, and a test. Keep a top-five ready design queue rather than hundreds of unprioritized suggestions.

## Publishing cadence

Publisher is the sole main writer. Target useful ready checkpoints every 3–5 minutes; completed eligible work should normally wait under 10 minutes. Apply a rolling “latest ready” queue, not a fixed all-agent batch. No empty commits, fake tests, or redundant timestamp updates.

For implementation candidates: fetch, inspect/reconcile remote, integrate in the publisher checkout, run `npm test`, `npm run typecheck`, `npm run build`, and `npm run validate` where relevant. Run affected focused browser checks and review evidence; full extended capture/soak suites run on milestone/release cadence or when the change warrants them. Never repeatedly restate expected test values without independent invariant checks and an explained behavior change.

Independent visual review is required for declaring polish accepted and for deployment of visual changes. A technically safe intermediate change may be pushed as explicitly `quality-review pending` so GitHub remains visible; publisher does not mark it accepted or deploy it until the relevant review arrives. No broken functional build goes to main to satisfy frequency.

Every push includes a short truthful README update. Keep detailed measurements/history outside README; aim for a readable landing page, not the current ~80 KB operational transcript. Archive old detail with links rather than deleting useful evidence. Preserve user content. Verify remote head and query CI using whichever authorized path works; a missing `gh` login need not block an already authenticated plugin/API path.

## Evidence cadence

Fast lane: deterministic scenario fixtures for fresh start, one machine, research menu, mature yard, and build picker; screenshots should take seconds once a build is serving. Seeded fixtures are clearly labeled and never claimed as organic progression tests.

Slow lane: full organic progression, offline catch-up, long soak and complete gallery capture. Keep these independent from every small visual edit so a 17-minute suite cannot block the whole team. A target-screen screenshot accompanies its change; a full gallery refresh accompanies a release/milestone.

Store curated artifacts with candidate SHA, viewport, scenario, seed/organic provenance, timestamp and tool version. Avoid a commit's own hash self-reference: evidence records the tested source commit before packaging/publication; publisher records the resulting integration commit separately. Do not claim old screenshots depict a newer build.

## Deployment cadence

After first environment adoption, deploy the latest eligible candidate promptly, target within 5–10 minutes of eligibility when accessible. Coalesce superseded ready candidates; do not redeploy the same digest or deploy every status-only commit. One deployer lease, immutable source SHA/artifact digest and local preflight receipt per operation. Follow `DEPLOYMENT.md` for scoped changes, verification and rollback.

Deployment results return through the spool; publisher writes verified README URL, deployed SHA, scope (LAN/public), health and timestamp. A deployment failure should not block safe code/design work, but prohibit further release promotion until its cause is understood.

## Stop, failure and recovery

On pause/stop: stop scheduling, cancel or safely finish short in-flight atomic operations according to runtime capability, join children, record leases and deployment state, then release. No self-relaunch.

A crash recovery reconciles Git, local spool, runtime session status and deployment receipt before any new mutation. Do not trust a stale lock file alone or steal a live lease by clock age alone. Retry a failing operation at most twice with materially different diagnosis; then back off and record the blocker. Infrastructure failure never authorizes global cleanup, resetting unrelated containers or skipping access controls.
