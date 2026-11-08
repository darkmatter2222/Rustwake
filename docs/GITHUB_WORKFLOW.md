# Rustwake GitHub-native development and release policy

**Effective 2026-11-07.** This supersedes older local-board workflow and branch-only integration instructions.

## Source of truth and identities

[GitHub Issues](https://github.com/darkmatter2222/Rustwake/issues) is the sole active backlog, assignment ledger, triage queue and defect tracker. [GitHub PRs](https://github.com/darkmatter2222/Rustwake/pulls) are the code review, revision and integration ledger. The checked-in `work/backlog.json`, `work/BOARD.md` and `work/board.html` are archived evidence only; DO NOT write new tickets, states or role assignments there. `.rustwake-runtime/dispatch-queue.json` is a temporary, ignored execution queue derived from open GitHub Issues, not a separate product board.

All personas authenticate as the same GitHub account. GitHub assignee/reviewer account identity DOES NOT distinguish AI workers, and a self-review on that account is not a genuine independent GitHub approval. Use labels when supported and structured PR/issue comments for provenance. The supervisor also validates each queued Issue URL by calling authenticated GitHub CLI before launching a worker:

```text
Role: developer | Issue: #123 | Branch: rw/123-short-name | Head SHA: <full SHA>
Role: reviewer | Verdict: ACCEPT or REWORK | PR: #456 | Head SHA: <full SHA> | Evidence: <tests, screenshots, links>
Role: product-owner | Decision: ACCEPT or REVISE | Issue: #123 | PR: #456 | Head SHA: <full SHA>
Role: release-engineer | Verdict: MERGE or REWORK | PR: #456 | Head SHA: <full SHA> | CI: <actual status and run URL>
```

Use issue numbers and URLs, not GitHub user mentions, for dispatch identity. Suggested labels: `priority:P0`–`priority:P3`; `role:developer`, `role:reviewer`, `role:product-owner`, `role:ui-ux`; and `status:triage`, `status:ready`, `status:doing`, `status:review`, `status:rework`, `status:blocked`. Create missing labels with `gh label create ... --repo darkmatter2222/Rustwake`; if label permissions are unavailable, retain status in issue comments without inventing success. Do not assign fictional GitHub accounts.

## End-to-end lifecycle

1. **Product / coordinator:** query `gh issue list --repo darkmatter2222/Rustwake --state open --limit 100`, reconcile the latest issue/PR comments and dependencies, create/update Issues with player outcome, scoped acceptance, priority, owner persona, dependencies and links. Use a single Issue for each bounded outcome, not hundreds of micro-tasks. Existing imported Issues are a migration starting point; do not recreate the historical backlog.
2. **Coordinator:** select a ready open Issue; write a transient bounded assignment with `issue_url` (exact canonical URL), `role`, explicit `write_paths`, task ID and optional registered worktree `directory`. Verify live worker IDs, open issue state and non-overlapping paths. Maximum **five active model sessions TOTAL: coordinator plus four workers**. The plugin is the only session launcher.
3. **Developer:** fetch main; create unique `rw/<issue-number>-<slug>-g<n>` branch in an isolated registered worktree, using `git worktree add -b ... <absolute-path> origin/main`. Never edit another worker's worktree or push `main`. Commit only owned paths. Use `node scripts/publish-feature.mjs --issue https://github.com/darkmatter2222/Rustwake/issues/<N> "feat: meaningful change" <paths...>` from that worktree. This publishes without force, verifies remote SHA and **opens or reuses a draft PR** with `Closes #N`. If GitHub CLI authentication is unavailable, treat PR creation as blocked; a branch push alone is not a handoff.
4. **Developer review-ready handoff:** attach exact SHA, tests, before/after screenshots where visual, limitations, migration/save impact and Issue URL in PR description/comments. Mark `gh pr ready <PR-URL>` only when genuinely ready. Do not make an incomplete PR ready merely to fill a review slot.
5. **QA/reviewer:** read Issue, fetch exact PR head, inspect the actual diff, run required tests, test affected UI/audio/gameplay and post a role-stamped PR comment with ACCEPT or REWORK and the immutable head SHA. If REWORK, developer pushes fixes to the **same PR**, QA rechecks new head SHA. A prior acceptance does not approve later commits.
6. **Product owner:** document keep/revise decision and why the actual player outcome meets acceptance in the linked Issue or PR. A passing unit test alone does not make artwork or strategy acceptable.
7. **Release engineer:** single integration lease, read Issue, current PR diff, independent QA head-SHA verdict, product decision, mergeability and current `gh pr checks` / Actions CI. If missing, stale or failing, post `Role: release-engineer | Verdict: REWORK` with exact correction in PR and assign developer role through Issue comments/labels; do not merge. If green and accepted, post an explicit merge decision at head SHA and `gh pr merge <PR-URL> --squash --delete-branch` (or approved merge method). The release engineer MUST NOT direct-push, merge an unknown branch, or cherry-pick around the PR. With one login, these role comments are process traceability, not GitHub identity separation.
8. **CI/CD and release:** only the merged `main` SHA can reach deployment. Verify CI run SHA, deploy job and served receipt separately; report failure/recovery in Issue. Issue can be closed through `Closes #N` on merge. Reopen or create a follow-up Issue for regressions.

## Agent concurrency, handoffs and recovery

The hard ceiling is **5 concurrent agents inclusive of coordinator**, regardless of number of roles or GPU availability. Allow multiple independent developers in non-overlapping worktrees; rotate QA, product, UI/UX and release into four child slots. A queued release takes precedence but must not unsafely interrupt an active writer. Never infer idle capacity from stale runtime snapshots. On restart, archive and cancel previous host sessions per dispatcher, retain branches/PRs/Issues, reconcile before assigning more work and **do not repeat the startup audit carousel**.

`/rustwake-team start` now starts a fresh coordinator-owned dispatcher with an empty queue. Coordinator reads real open GitHub Issues and fills safe slots. `/goal forever goal.md` remains the ONLY long-lived project goal loop. Stop old sessions before restarting OpenCode. Upgrade plugin dependencies and reload runtime before expecting changed dispatch behavior. A repository commit does not modify already loaded agent instructions until restart.

## GitHub CLI requirements

`gh` must be available on the machine running OpenCode and authenticated to the repo. Verify `gh auth status`, `gh repo view darkmatter2222/Rustwake`, `gh issue list --repo darkmatter2222/Rustwake`, and `gh pr list --repo darkmatter2222/Rustwake`. The agent must report and stop dispatching GitHub-dependent work on failure; never silently fall back to local JSON. If GitHub branch protection is enabled, respect all required checks. Branch protection and real multi-user approval are distinct controls and cannot be faked by the single AI GitHub account.

## Existing branches

Keep any existing `rw/` branch with commits not in `main`; open a **draft PR** and link the matching Issue. Reviewer/release engineer inspect divergence, conflicts, superseded changes and the current CI; rebase or supersede via a fresh branch when appropriate. Do not auto-merge these branches. Branches with zero commits ahead of main are historical and need no PR. Preserve evidence and never force-delete unfinished work.

## Bootstrap exception

The initial sponsor-authorized GitHub-native policy implementation may be committed directly to main to install these instructions. **Thereafter every tracked change uses a PR**, including agent prompt edits and operational documents. Do not use the bootstrap exception as a standing permission.
