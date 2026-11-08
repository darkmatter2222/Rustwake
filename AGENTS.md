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
