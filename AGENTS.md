# Rustwake agent instructions

**Before any task, read [docs/GITHUB_WORKFLOW.md](docs/GITHUB_WORKFLOW.md) and the role file in .opencode/agents.** This policy is authoritative over older docs, prompts and archived task boards.

- GitHub Issues: only current work tracking system, role-labeled comments, linked PR URLs. `work/backlog.json`, `work/BOARD.md` and `work/board.html` are historical.
- Same GitHub account for every AI persona. Distinguish roles by explicit comments/labels and immutable head SHA, not by GitHub usernames or self-review approvals.
- Five concurrent model agents TOTAL: one coordinator and at most four children. Preserve in-flight leases; never launch an extra session.
- Developer: one Issue, own `rw/` branch/worktree, push checkpoint via `scripts/publish-feature.mjs --issue <url> ...`; helper creates draft PR, then make PR ready with evidence.
- QA: review exact PR head SHA, comment ACCEPT or REWORK with independent evidence.
- Product: record acceptance in Issue and/or PR; no self-acceptance.
- Release engineer: review the actual PR and CI; send it back for fixes or merge via PR. No direct main pushes, cherry-picking around PRs or merged-less deploys.
- Deployment: only from main after successful CI. Never claim deployment merely from a pushed branch.
- Agent task handoffs: always include the GitHub Issue URL and linked PR URL when one exists. Never reconstitute a local Jira.


## Native Project and release authority

## GitHub delivery contract

Read `AGENTS.md`, `docs/GITHUB_WORKFLOW.md` and `docs/GITHUB_PROJECT.md` before every assignment. GitHub Issues and the native Project are the only authoritative planning and handoff system. Read the live assigned issue, labels, dependencies, comments, milestone and linked PRs before acting. Never schedule from `work/backlog.json`, `work/BOARD.md`, `work/board.html`, archived reports or local scheduler recommendations. Files under `work/` may hold evidence linked from GitHub, never a competing work ledger. Runtime queues/leases are ephemeral execution state derived from verified GitHub work.

Current sponsor goal is #43, complete mobile AND desktop UI restart; at least 90% planned capacity. Read #44 for live cutover. Deferred, blocked and superseded issues are ineligible until the coordinator records a reason, resolves dependencies and updates GitHub labels. UI-reset issues belong to Project 1 and milestone 1. No hidden fallback when GitHub or Projects access fails: record the exact blocker in the issue; never invent membership or status.

Use role-stamped issue/PR comments, issue URLs, branch and immutable head SHA. All personas share one GitHub login; do not invent accounts or claim self-review is independent account approval. Five total model sessions: coordinator plus at most four children. Only coordinator dispatches through the installed team plugin. No recursive delegation or extra forever loops.

Every tracked change, including prompts/docs, uses Issue → isolated rw/ branch/worktree → linked draft PR → independent QA/product verdict at current head SHA → release-engineer merge → main CI/CD. Never direct-push main, merge your own unreviewed work, or bypass CI. GitHub Project Done is accepted issue completion, not proof of deployment. A release needs a real tag/SHA, Release notes linking Project/milestone/issues/PRs, successful CI/deployment receipts and rollback reference.

Retain unfinished branches and evidence. Respect cancellation and scope ownership. No routine sponsor permission loops. Report facts, tests, limitations and exact GitHub links. A prompt change takes effect only after the local host reloads it; never claim live agent adoption from a repository commit alone.


## Bounded runtime coordination

Follow `docs/TEAM_DISPATCH.md` runtime health and quiet-wait contract. Only the dispatcher launches children. When no actionable work remains, use `rustwake_wait` with the current dispatcher revision. Do not repeatedly poll CPU, file timestamps, GitHub comments or team.query; none proves delivery. Preserve unknown leases, reconcile exact host child IDs, and never silently replace uncertain work. Treat unrelated reasoning as a context-drift blocker. Every completed handoff requires a GitHub issue/PR URL and evidence at the immutable head SHA. Local plugin reload and an observed execution receipt are required before claiming this contract is live.
