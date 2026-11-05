# Team execution protocol

Read TEAM_CHARTER for roles, decision rights and cadence. This file replaces the earlier five-role operating contract. Existing review/deployment evidence remains historical evidence. The runtime is local OpenCode plus MasterGoal, not these Markdown files or the board renderer.

## Current operations extension

Read [TEAM_OPERATIONS](TEAM_OPERATIONS.md), [sponsor intake](SPONSOR_INBOX.md) and [automatic delivery](AUTOMATED_DELIVERY.md). Use fresh runtime observations and scheduler/checkpoint utilities; multiple developer instances are encouraged on nonoverlapping ownership. Publish changed board snapshots during implementation, not only at release end. The public board is a sanitized deployment, not a copy of private receipts.

## Activation and capability

Follow START_TEAM. Preserve the user's provider/model configuration. Verify all role definitions load in the installed version. The older CAPABILITY receipt proves async overlap but not reliable status polling/cancellation. Discover current documented dispatch/status/cancel mechanisms; do not invent SDK methods. Run two bounded harmless tasks, observe overlap/out-of-order completion, cancel/join a harmless task, and verify no orphan mutation. Confirm vision with an actual image and audio modality separately. Respect one-image context limits if configured.

If only blocking dispatch is available, use bounded serial fallback honestly and create a runtime ticket. Do not launch ad-hoc independent forever processes. MasterGoal owns the coordinator continuation. A new goal file needs stop/start to reload its snapshot.

## Isolation and single-writer integration

Discover the actual Rustwake checkout and `origin`; expected repository is darkmatter2222/Rustwake on GitHub. Do not convert it to GitLab. Preserve dirty user files. Developer, QA, player testing and release integration use separate worktrees or immutable build directories. Distinct localhost servers or an explicit browser/server lease prevent port collisions. Never run two writers in one checkout. Product/player/QA write only their own feedback artifacts, not production code.

Coordinator owns `<canonical checkout>/.rustwake-runtime/` ignored spool and assignment ledger. Each worker writes a unique task/generation/message file via temp-file + atomic rename. PM deduplicates message IDs and rejects stale generations. Release engineer alone imports sanitized receipts and canonical JSON into tracked Git, generates board/README, commits and pushes. Do not concurrently edit the JSON from several roles. Secrets remain in HomeAILab credential storage.

Slot ledger records all active/dispatching children; max three children with coordinator, lower if actual capacity requires. Worker metadata: id, role, task, generation, session, worktree, base SHA, start, heartbeat, status, expected result. A slow worker remains active until completion or verified cancellation. A stale file is not permission to steal its lease. Cancellation prevents new assignments, joins active children, then releases ownership. An in-flight deployment finishes/rolls back its atomic step before ownership transfer.

## Published board and event contract

`work/backlog.json` is canonical published product state. `node scripts/team-board.mjs` validates it and renders BOARD.md plus board.html; `--check` verifies outputs are current. It is a static published snapshot, not a real-time scheduler. Run `python -m http.server 8765` from repo root and open `/work/board.html` if you want a browser view; reloading shows newly generated output. No gameplay route or production service is required for this board.

Workers submit proposed events, not direct JSON edits:

```json
{"message_id":"STRAT-001-g1-result-1","task_id":"STRAT-001","generation":1,"role":"developer","kind":"candidate","candidate_sha":"full-git-sha","summary":"What changed for the player","evidence":["path"],"checks":[],"blockers":[]}
```

PM validates sender/assignment, deduplicates, applies product decisions and sends the complete next snapshot to release engineer. Record events in each ticket's history with actor, from/to, timestamp, reason and evidence. State path: inbox → triaged → ready → implementing → review → accepted → published → deployed → measured. Review can return rework; any active state can block; product can defer/reject with rationale. `measured` means post-release result recorded, not guaranteed success. Documentation tasks may go published → measured without deployment. A failed hypothesis is documented and can be reverted; do not erase failures. A pre-publication experiment rejected by product goes to deferred/rejected with a disposition reason after triage; measured is reserved for a published outcome.

Required ticket intent: problem, hypothesis, scope, non-goals, acceptance, dependencies, priority, product approval, role owner, generation, evidence and outcome. Lifecycle data includes candidate/review/publication/deployment SHAs, verdict and change history. Validator checks structural consistency and transition evidence, not the truth of external receipts; QA/release must inspect them. Board reports unknown rather than pretending a local session is running.

Legacy migration: retain BOARD-legacy, backlog and all receipts. During first planning, map consequential open legacy items to new tickets; do not automatically re-open fixed work or bulk declare everything accepted. Current sprint supersedes the old next-task order. Keep a link to each migrated ID. Existing in-flight candidates get checkpointed and inspected before cancellation/reassignment.

## Candidate and outcome review

Developer returns bounded candidate commit, changed paths, behavior, tests, evidence and known limitations. QA checks the immutable candidate independently; player gets build URL/scenario and goal, not a developer walkthrough or source before first play. Product receives both and makes keep/revise/revert/defer decision. Reviewer cannot approve its own implementation. PM cannot manufacture either approval.

Reports lead with visible/experienced outcome and verdict in under a page; detailed arithmetic goes in a linked appendix. Reject duplicate/blank images and stale evidence. Screenshots carry source SHA, scenario, viewport, date and seeded/organic label. Clips carry duration and observed transitions. Audio claims distinguish actual listening from technical analysis. Simulated player runs identify persona, actions and evidence; no invented cohorts, surveys or retention numbers.

A UI change requires actual affected-screen inspection. Strategic changes require policy comparison, save/offline regression checks and comprehension evidence. No-scroll measurements do not prove usability. Pixel difference, silhouette Hamming distance and test counts do not prove polish. A criterion changed after failure produces a new version and retest, never a retroactive pass.

## Publication and releases

One release-engineer lease covers integration/main ownership; a second exclusive deployment lease protects the server. Old publisher/deployer agents are compatibility modes of this same lane, never concurrent with release engineer or each other. PM maintains GitHub visibility through this role.

Fetch before integration, reconcile current main without force, preserve unrelated changes, test the combined result. Run relevant package checks and existing CI requirements. Board-only changes run board validation; gameplay changes run test/typecheck/validate/build plus affected browser checks. Publish each useful coherent slice; target 3–5 minutes after readiness, investigate >10. Never push broken code or empty timestamp commits. A safe unaccepted prototype may be published with explicit quality-pending state; acceptance is separate.

Use authenticated CI status if available. Missing gh login does not prove CI failed; pending/unavailable is not passed. Required configured branch/CI gates must be honored. If no mandatory remote gate exists, locally verified preview deployment may proceed with explicit remote-CI-unverified status, QA technical acceptance and product preview decision. Do not silently bypass a required check.

Every useful push updates README's compact status with player-visible outcome, next outcome, board link and evidence provenance. Use the tested predecessor SHA or a release label; do not chase a commit's own hash in its content. Display integrated and deployed revisions separately. Do not force a new screenshot for docs-only work; label the last capture accurately. Changed visual/gameplay release gets fresh relevant capture; full gallery at milestones. Keep logs outside README.

Deploy latest eligible immutable gameplay artifact within 5–10 minutes when accessible, coalescing superseded candidates. No redeployment for status/doc-only pushes. Follow DEPLOYMENT and latest receipts, recheck ownership live. Verify served files, HTTPS, smoke, save compatibility and unrelated routes. Preserve rollback and avoid old-client missing assets during promotion; retained previous release directory alone does not guarantee old asset URLs work. A failed deploy rolls back only owned resources and files a defect to PM/product with exact reproduction and severity.

After successful release, request bounded live playtest, compare expected outcome and record measured result. PM reconciles receipt, README and board in the next useful publication. Never leave the README calling a known live route pending. Release delay and stale screenshot age are process signals, not reasons to manufacture activity.

## Recovery and anti-churn

Before restart reconcile runtime sessions, branches, main and deployed receipt. Preserve ownership until a worker is terminal. Retry failures at most twice with different evidence-based diagnosis, then back off and unblock other work. Never continuously poll an unchanged error. If two implementation slices produce only measurement/prose changes, product must pick a player-visible experiment next unless a critical incident takes precedence. No endless scrum roleplay, queues of hundreds of untriaged ideas, or fabricated busy status.

