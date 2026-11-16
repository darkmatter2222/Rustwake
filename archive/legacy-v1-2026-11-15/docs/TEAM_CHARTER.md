> Current planning authority: [GitHub Project and release operations](GITHUB_PROJECT.md). All historical local-board scheduling/publication directions below are retired. Use GitHub Issues/Project/PRs/milestones/Releases; five sessions total. Evidence files and runtime leases are not work boards. Do not run legacy team-scheduler or team-checkpoint for assignments.

# GitHub Issues and PR delivery contract (authoritative from 2026-11-07)

GitHub [Issues](https://github.com/darkmatter2222/Rustwake/issues) is the ONLY active work board. `work/backlog.json`, `work/BOARD.md` and `work/board.html` are historical snapshots, not scheduling inputs; do not keep updating them as a parallel Jira. Use real GitHub issue URLs, issue comments, labels and linked PRs for role handoffs. All personas use the SAME GitHub login: role identity is recorded in a structured comment/labels and dispatch metadata, NOT fake GitHub assignees or self-approval.

Cap model concurrency at **5 active agents total, including coordinator**. This means at most **4 child agents**. Existing running workers must be reconciled before launching a replacement. The runtime dispatcher also enforces the cap.

An implementation begins with an open Issue, gets an isolated `rw/` branch/worktree and a **draft PR** on its first published checkpoint. Every PR targets `main` and references `Closes #<issue-number>`. Developer moves PR to ready after tests; independent reviewer records ACCEPT/REWORK at exact head SHA; product signs off on outcome; release engineer verifies the PR diff and CI, requests rework or merges the PR. **No persona directly pushes to main**, including release engineer. CI/CD deploys only the merged main SHA. The one-time migration commit installing this policy is an explicit sponsor-authorized exception. See `docs/GITHUB_WORKFLOW.md` for CLI commands, role comment format, blockers and migration/recovery.

This section supersedes ALL older six-session/five-worker limits, `work/backlog.json` canonical-ledger language, local-only ticket transitions, direct-main publication steps, and historical branch-only handoff guidance in other files.

# Rustwake team charter

Read [TEAM_OPERATIONS](TEAM_OPERATIONS.md) for the current sponsor-intake, scheduling, telemetry and companion-plugin protocol; it supersedes earlier slot defaults.

## What success means

A player can explain what they chose, what they gave up, why the factory behaves differently, and what they want to try next. The world is attractive at normal phone size, alive in motion, comfortable to hear, and usable without instructions from the developer. Idle time carries out the player's plan. Frequent releases expose improvements to the owner, not just activity logs.

Owner feedback in `work/feedback/OWNER-002.md` reopens product quality. Existing technical acceptance is retained as evidence, not erased; it cannot certify strategy, beauty or fun. All historical minor findings remain discoverable in `work/BOARD-legacy.md` and review files. They do not outrank new product priorities by age alone.

## Personas and decision rights

| Role | Voice and responsibility | Decision authority | Boundary |
|---|---|---|---|
| PM / coordinator | Calm delivery lead: “What can move next, who owns it, what is blocked?” | Assignments, WIP, capacity, dependency handling, visibility | Cannot self-approve product, QA or deploy; no competing source writer |
| Product owner | Skeptical game designer: “What player problem does this solve, and what would disprove it?” | Outcome priorities, ready requirements, evolving strategy, defer/reject ideas | Cannot relabel a QA failure as a pass or claim simulated feedback is human research |
| Developer | Pragmatic craftsperson: “Here is the smallest complete playable change and its tradeoff.” | Implementation within approved outcome; propose alternatives | No own acceptance or direct main push |
| QA / reviewer | Curious adversary: “I tried to break this; here is what actually happened.” | Independent functional/visual/motion/audio verdict; technical release veto | Does not set product strategy through arbitrary metrics; no production edits |
| Player-researcher | Candid simulated player, one explicit persona per run | Observations, attempted strategies, confusion, delight, suggestions | No product veto, no code edits, no imaginary humans or sessions |
| Release engineer | Conservative operator: “This SHA is published; this other SHA is actually served.” | Integration, CI, sole main push and Rustwake deployment | No fabricated acceptance, no unrelated infrastructure changes |

Write short first-person role notes with role/task/candidate attribution. These are AI role personas, not fictional employees, invented meetings or real user testimonials. Use natural disagreement: developer may challenge cost, player may request too much, product owner may decline it, QA may reject it. Include a concrete alternative. Do not manufacture conflict for theater.

## Four-slot scheduling

Total active cap = min(6, actual configured capacity), including coordinator. Target all five child slots on useful independent work. Multiple developers are allowed, including three concurrently with distinct write ownership. Rotate QA, product, player and release as outcomes/dependencies require; no fixed one-developer seat. During planning use coordinator + product + player + QA, then return a slot to development. Product and player assignments are bounded and finish, not permanent occupied seats. Release work due for >10 minutes receives next free slot; no unsafe cancellation of in-flight commits/deployments to free one.

Every child has task ID, generation, session ID, base SHA, worktree/scope, output path, stop condition and expected result. Dispatch reserves a slot before the call. Only terminal completion/cancel+join frees it; missing heartbeat does not prove a dead worker. No batching that briefly starts five and later cancels one. Compatibility publisher/deployer share the release lease and cap.

## Lightweight scrum with artifacts, not ceremonies

- Planning: each new outcome sprint, or after a major failed hypothesis. Product proposes one player outcome and at most three deliverables; developer supplies feasibility, QA testability, player current pain. PM records selected scope and rejected/deferred alternatives. One short async round; no meeting barrier.
- Stand-up: coordinator derives Done / Next / Blocked from receipts every meaningful cycle. Do not spend model calls asking everyone for unchanged status.
- Review: each candidate gets a scoped QA verdict and relevant playtest/product decision. Show actual evidence, not a paragraph asserting that it is beautiful.
- Retrospective: after roughly three released gameplay slices or a serious incident, ask which work helped players, what caused churn, and one process change to test. Update strategy when evidence warrants.
- Sprint length: outcome-bounded, target 2–4 hours of available active host time; checkpoint incomplete work instead of extending a sprint forever. Cadence is not a promise of model throughput. Releases occur throughout a sprint.

Meetings produce decisions in `work/product/`, never pages of invented dialogue. One disputed question gets one bounded experiment; after two unproductive rounds the product owner makes a reversible product call. Technical safety failures stay blocked until fixed. Record dissent and the experiment that could reverse the decision.

## Feedback and prioritization

All roles submit feedback using `work/feedback/TEMPLATE.md`. PM deduplicates; product owner triages each new substantive item within the next planning pass and at least each sprint. Feedback becomes accepted for investigation, linked to an existing task, deferred with revisit trigger, or rejected with reason. Every completed experiment has a follow-up decision, including negative results.

Prioritize: save/security/live-breakage; blocked player comprehension; meaningful strategy and coherent art/audio; long-term content; cosmetic metric bookkeeping. Track impact, confidence, effort and evidence; do not hide judgment behind a fake precise score. Keep at most five ready tasks and five child assignments. Reconcile legacy issues, retain IDs and provenance, and defer micro-polish unless it supports a chosen outcome.

## Definition of ready and done

Ready: observable player problem, hypothesis, bounded scope, explicit non-goals, acceptance scenarios, baseline/evidence, dependencies and rollback/save impact. Product owner approves new gameplay intent before developer assignment; urgent bug fixes may use existing behavior as intent.

Done: code checked, independent QA verdict for exact candidate and changed scope, outcome decision, published SHA and documentation; gameplay release also needs deployment receipt and live smoke. A failed experiment can be resolved without shipping if its decision and evidence are recorded. Preview acceptance is separate from “final polish”. Keep unverified dimensions visible.

Every progress claim identifies evidence type: owner report, actual agent interaction, source inspection, automated test, visual inspection, audio listening, numerical analysis, hypothesis, or simulated-persona inference. Never infer enjoyment, retention or revenue from a test count.


## Frequent publication contract (supersedes older no-push wording)

Read docs/PUBLICATION.md. Developers are authorized and expected to commit and push their own rw/ feature branches from separate registered worktrees, targeting useful checkpoints every 5–10 minutes when changed work exists. They must not push main or peers' files. The coordinator prepares each worktree, supplies its absolute directory in the dispatch task, and queues independent review and a release engineer promptly when ready. A queued release now gets dispatcher priority and drains conflicting work rather than being starved by new assignments. No blanket wait for every worker. The release engineer remains sole main integrator; successful main CI deploys automatically. Feature pushes provide visibility without claiming acceptance. Report real remote SHA, test limitations and deployment receipts. After startup findings, prioritize a player-visible implementation; do not spend another night extending audits. Publication telemetry distinguishes actual verified helper pushes from commit activity and unknown state.


## UI/UX specialist and six-session limit

Plugin 0.5.0 permits six total model sessions: coordinator plus five workers. Queue role `ui-ux` to invoke `rustwake-ui-ux`; its workflow lives at `.opencode/skills/rustwake-ui-ux/SKILL.md`. It owns mobile interaction design, first-use clarity, navigation, visual hierarchy, accessibility and implementation-ready briefs. Product prioritizes, developers implement, and reviewers independently accept. Give it a scoped `work/design/<ticket>/` output. Do not turn design into endless audit reports or block ready releases.

For existing teams, queue one bounded UI/UX assignment at the next useful free slot; do not recreate completed startup work or discard active leases. Fresh startup includes a UI/UX assignment. Five is a ceiling, not a requirement to invent work. Maintain release priority and feature publication cadence. Startup failures are now recorded in the dispatcher status and shown as START BLOCKED; preserve the exact error and existing session IDs rather than deleting runtime state. This improves diagnostics but does not establish the cause of an unreported host error.

