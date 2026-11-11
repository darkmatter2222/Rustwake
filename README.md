# Rustwake

**[Product & Releases Project](https://github.com/users/darkmatter2222/projects/1)** · **[UI restart milestone](https://github.com/darkmatter2222/Rustwake/milestone/1)** · [Goal #43](https://github.com/darkmatter2222/Rustwake/issues/43) · [Project/release operating contract](docs/GITHUB_PROJECT.md)

**Current delivery workflow:** [GitHub Issues](https://github.com/darkmatter2222/Rustwake/issues) → isolated `rw/` feature branch → [draft pull request](https://github.com/darkmatter2222/Rustwake/pulls) → independent QA/product verdict → release-engineer PR merge → main CI/CD. **Five model agents maximum, including coordinator (four children).** The old `work/` board is an archive, not an active Jira. [Binding policy](docs/GITHUB_WORKFLOW.md) · [Agent instructions](AGENTS.md). All personas share one GitHub account, distinguished by structured role comments.


**Team plugin 0.7.0: fresh employees on each start.** Old runtime sessions and queues are archived, never resumed. Source and unfinished work are preserved. The first coordinator prompt after reopening OpenCode automatically starts the team. [Lifecycle details](docs/TEAM_DISPATCH.md).





A mobile browser strategy-idle game about salvage, metals and automation. Built with React/TypeScript: a full-screen industrial pixel world, no page scrolling, and a factory that keeps carrying out your plans while you are away.

**[Play Rustwake](https://home.darkmatter2222.com/rustwake/)** · **[GitHub Issues](https://github.com/darkmatter2222/Rustwake/issues)** · [Archived visual board](work/board.html) · [Start the AI team](docs/START_TEAM.md)

## Frequent feature publication (plugin 0.4.0)

Developers can now commit/push their own `rw/` branches from separate worktrees. CI covers those branches; reviewed main integration still triggers automatic deployment. Queued releases get execution priority, and the sidebar shows verified feature pushes, commit activity, unpublished commit counts and successful deployment evidence. [Publication contract and commands](docs/PUBLICATION.md). Update/reinstall the plugin and restart to load these changes; existing workers are not moved or discarded automatically. Local publication/dispatcher tests passed; actual overnight cadence still requires runtime evidence.

## Team execution update

The prior plugin was advisory and could report progress without launching workers. **Version 0.3 adds executable dispatch.** Update/reinstall the local plugin, restart OpenCode, select rustwake-coordinator, and use `/rustwake-team start` before `/goal forever goal.md`. Binding alone is insufficient. [Exact startup and recovery instructions](docs/TEAM_DISPATCH.md). The sidebar shows actual child IDs, queued/running state and errors. Runtime validation on your machine is still required; repository tests do not prove live worker execution.

## Automatic deployment is enabled

**Deployed build:** `main` at `5610528` (full `56105287bc9468a95cdd15d54bc9aa4fccdae415`), carried by `ci` run [42468347121](https://github.com/darkmatter2222/Rustwake/actions/runs/42468347121) and `delivery` run [42468399072](https://github.com/darkmatter2222/Rustwake/actions/runs/42468399072) (package job 128693167841, deploy job 128693253890, both success).

**Player-visible outcomes in this build:** each machine keeps a distinct **machinery silhouette identity** (ART-004) and the amber strings read at **>= 4.5:1 with monotonic text scaling** (UI-004).

**Open follow-ups:** [#18](https://github.com/darkmatter2222/Rustwake/issues/18) the pressed face names its next tap · [#24](https://github.com/darkmatter2222/Rustwake/issues/24) legacy belt reconciliation · [#30](https://github.com/darkmatter2222/Rustwake/issues/30) chip row spacing and equal heights · [#31](https://github.com/darkmatter2222/Rustwake/issues/31) census gravel share · [#32](https://github.com/darkmatter2222/Rustwake/issues/32) visible output-blocked settle.

Merge reviewed PRs into `main`; GitHub Actions runs CI, packages the game/dashboard, and deploys automatically. No routine server commands are needed. [Delivery runs](https://github.com/darkmatter2222/Rustwake/actions/workflows/delivery.yml) · [Live dashboard](https://home.darkmatter2222.com/rustwake/team/) · [Runbook](docs/AUTOMATED_DELIVERY.md).

## Sponsor input and team operations

Create requests in **[GitHub Issues](https://github.com/darkmatter2222/Rustwake/issues)** and add them to Project 1. The old SPONSOR_INBOX.md is legacy intake only. When the product owner has incorporated them into existing strategy and linked backlog work, the text is removed and preserved in an intake receipt. Removal means **in the work**, not shipped. [Intake details](docs/SPONSOR_INBOX.md).

The team now supports three concurrent developer instances on independent scopes, with QA/product/release rotated as useful work requires. [Project](https://github.com/users/darkmatter2222/projects/1) is the current planning board; historical local-board metrics are not live status. Missing samples are unknown. Current repository update cannot observe local running sessions.

All eight agent personas now use the automatic delivery contract. The release engineer owns main integration and deployment monitoring; other workers continue independent work while CI runs. Build success and deployment success are tracked separately.

## Historical gameplay evidence (before Actions commissioning)

**Historical release record, not current work authorization or a fresh deployment check. Current scope and dispatch come from [UI restart #43](https://github.com/darkmatter2222/Rustwake/issues/43) and the GitHub Project.**

The table below records the integrated gameplay release (`4bdd1de`, REL-010: the priced belt plus the UI-002 g3 stack plus the polish slice) and the source the host is now serving from (`d72213d`, the same source tree `3eacdaf…` packaged by its own delivery run). Current deployment provenance is the Actions runs named per row; the older screenshot sets in `docs/screenshots` are historical captures and are not fresh verification of this artifact.

The game works, but the owner has reopened **strategy and presentation quality**: repeated bottom-action clicks appear sufficient for progression, the art remains below the desired standard, and published evidence became stale. Technical test passes and pixel measurements do not establish a good game.

| State | Value |
|---|---|
| Integrated revision (tested) | `4bdd1de` — three zero-conflict merges on `1573ac1` (`24864e2` = `1573ac1` + `0daab63` UI-002 g3, `0e5d24f` = + `fb0dca0` BELT-001 cost-only, `c32e22c` = + `97f7f15` POLISH-001) plus the OPS-106 assertion fix: **309 tests / 30 files** passed, `tsc --noEmit` clean, `npm run validate` exit 0 with `0 violation(s)` and the behaviour line verbatim (`firstDrone=379 firstResearch=527 tick=18298 machines=8 links=18 drones=4 batches=1838 credits=157 nodes=3`), build exit 0, board `--check` exit 0 |
| Built artifact (this SHA) | entry `assets/index-CWtGNGYE.js` **232365 B** (**635 B** headroom under the unchanged 233000 B ceiling; the reviewer's three-way print was 232364 B and the 1-byte difference is exactly the DEF-009 separator space), css `index-DbNBovuF.css` **8091 B**, `tables-BB2NPvQ2.js` **9298 B**, `catchup.worker-G_Jyr7uh.js` **13406 B** |
| Deployed artifact (live) | source `d72213d` (Actions `ci` run **42417753041** then `delivery` run **42417809148**, deploy job **128539641658** on the `databrick-rustwake` environment) — entry `index-CWtGNGYE.js` **232365 B**, css `index-DbNBovuF.css` **8091 B**, `tables-BB2NPvQ2.js` **9298 B**, `catchup.worker-G_Jyr7uh.js` **13406 B**; served `index.html` 1262 B with `Cache-Control: no-store`. The packaged source `d72213d` and the tested source `4bdd1de` share one tree (`3eacdaf…`), the docs commit changed no source file |
| Served == built | 3/3 hashed assets named by the served HTML are sha256-equal over HTTPS to this lane’s own `dist/assets` build of `4bdd1de` (entry `a95687e7…` 232365 B, css `dcfaf118…` 8091 B, tables `28bed3b0…` 9298 B), and the unchanged worker chunk `0c784f3e…` 13406 B is byte-identical to the previous release’s; the two retained previous pairs `index-C_K4oMJ5.js` 231262 B + `index-B1FOV2xO.css` 7849 B and `index-CUnHr3Cs.js` 231943 B + `index-9FriNULu.css` 7474 B still answer 200, so cached clients keep their assets and the rollback set is intact |
| Chrome cap | five cells at phone size on `588c1fa`, from the lane’s own chromium instrument (lane-reported, not re-run by the release lane): **13.0 / 38.1 / 9.9 / 24.8 / 41.8 %** of the `.hud` content box, all under the unchanged **42 %** cap — the deepest cell leaves **0.2 pp**; the control run reproduces the previously served artifact exactly (`16.7 / 40.8 / 10.6 / 31.0 / 44.6 %`). Two type tiers `14.25/600` and `10.8/400` (1.32×), dock face 46 px, command faces 44 px, `dTop 0`, `leftGap 8`, zero overflow, 0 pageerror. Captures: [work/development/UI-002-g1/captures](work/development/UI-002-g1/captures) |
| Evidence | [REL-010 release receipt](work/releases/REL-010-g1.md) · [QA-BELT-001-g4](work/review/BELT-001-g4/QA.md) · [QA-ART-004-g1](work/review/ART-004-g1/QA.md) · [PLAYER-004-g1 playtest](work/feedback/PLAYER-004-g1/REPORT.md) · [PROD-TRIAGE-004 decisions](work/product/PROD-TRIAGE-004/DECISIONS.md) · [previous release + delivery receipt](work/releases/REL-009-g1.md) · [UI-002 handoff](work/development/UI-002-g1/HANDOFF.md) · [product decisions](work/product/SPRINT-003-decisions-g1/DECISIONS.md) |
| Rollback | code: `1573ac1` is the tested predecessor of `4bdd1de` (three merges plus one fix commit on top, so three `git revert -m 1` then one revert, or reset `main` to `1573ac1`). Served: the previous release pair `index-CUnHr3Cs.js` 231943 B + `index-9FriNULu.css` 7474 B is retained and still answers 200, and the current pair `index-C_K4oMJ5.js` 231262 B + `index-B1FOV2xO.css` 7849 B is the atomic-symlink previous release inside `/srv/rustwake-delivery/releases` |
| CI | the pair for the served source is `ci` run **42417753041** (job `build` **128539409626**, all 14 numbered steps success: board `--check`, the node script tests, the three host python tests, `npm ci`, typecheck, validate, `npm test`, build) + `delivery` run **42417809148** (package job **128539577586**, deploy job **128539641658** on `databrick-rustwake`). Earlier evidenced pairs: **42348495320** + **42348528636** for `a551794`, **42383452046** + **42383503917** for `1573ac1` |
| Open | **BELT-001** published at `4bdd1de` (cost-only variant certified: 1 scrap per tile of the run, 90 % refund, `+21 units` pinned in the test, ladder 3/6/7 paid against 3/5/6 back); **POLISH-001** published (`Store 24/900` separator, the CRLF-tolerant board check, the `.gitattributes` LF pin) which closes **DEF-007** and **OPS-107** and the first clause of **DEF-009**; **OPS-102** deployed (automatic delivery plus the sanitized dashboard); new rows **UI-004** (ready: the price at 10.8 px / 2.67:1 and the `A` control shrinking it), **STRAT-004** (ready: the 32-tap identical-label stall, printed by mechanism), **UI-005** (triaged behind UI-004: the store chip prints `x/900`, which never leaves 7–18 %), **DEF-011** (deferred: the 224.5 px dead band, behind ART-003), **DEF-012** (triaged: at 390x844 the machine panel folds 8 px short so three of six faces need an inner scroll, about 125 px recoverable), **DEF-013** (triaged: nine stale numeric rows in the silhouette aggregator file, closed by one regeneration in the art lane); still open: the **DEF-009** second clause (two Store-panel rows under one `Measured` label), **UI-003** capture set, **ART-003** in review at `7f934cf`, **ART-004** held for REL-011 at `c30c07d` (its own entry 232825 B fits, the four-way merge prints 233311 B, 311 B over the ceiling), `rw/belt001-g4 = bcb3d1c` held for REL-011 with its own QA; **DEF-001** cached HTML naming removed assets; human audio listening (audio stays decoded-not-played), real-handset p95 and one human first-feel run unverified |

**Player-visible outcome of this build (integrated `4bdd1de`, packaged and served from `d72213d`):** connections are now **priced by their extent** — a link costs 1 scrap per tile it crosses and pays back 90 % when dropped, so a short link is measurably cheaper than a long one (distances 2/5/6 tiles cost 3/6/7 and return 3/5/6), and a link restored from an older save refunds 0 without throwing. The clock did not move in this slice: every fresh link still waits the same 5 ticks, so an old yard replays identically (1902 batches, 82 credits, fixture checksum `eede3c4f`). On the chrome side the machine panel now closes **one layer per press** (LIFO painted order), the `Store 24/900` chip has its separator back, and the two-line dock face from UI-002 is unchanged. Known costs, stated plainly: the priced extent is **still not drawn** (each route renders as one chord, so 3 tiles and 7 tiles look the same until the polyline slice lands), three of six machine-panel faces sit below the fold at 390x844 (`DEF-012`), the price line is still the weakest text on screen (`UI-004`), and 141 of 177 blind taps changed nothing (`STRAT-004`). **Historical next-outcome plan (superseded by #43):** `UI-004` lifts the amber strings to a 12 px / 4.5:1 floor at every `A` step, then `STRAT-004` prints the no-op census by mechanism with the pending number on the pressed face; `rw/belt001-g4 = bcb3d1c` (polyline plus printed price) and `rw/art004-g1 = c30c07d` join at REL-011 once the byte decision is taken. [REL-010 receipt](work/releases/REL-010-g1.md) · [QA-BELT-001-g4](work/review/BELT-001-g4/QA.md) · [PLAYER-004-g1](work/feedback/PLAYER-004-g1/REPORT.md) · [product decisions](work/product/PROD-TRIAGE-004/DECISIONS.md) · [Sprint plan](work/product/SPRINT-002.md) · [Team board](work/BOARD.md).

Screens are the seeded 12-case slice at `24daf0e` (portrait 360/390/412, mobile landscape 844x390, desktop 1440x900) in [docs/screenshots](docs/screenshots/style-slice-provenance.json); the ART-001 rows are candidate captures at `87ee90b` ([rest](docs/screenshots/candidate-87ee90b-slice-phone-rest.png), [mature](docs/screenshots/candidate-87ee90b-slice-phone-mature.png), 26 clip frames); the four `live-d7af68a-*.png` frames are organic captures of the currently deployed artifact ([provenance](docs/screenshots/live-d7af68a-provenance.json)); the nine `live-0c03572-*.png` frames are the previous release's captures ([provenance](docs/screenshots/live-0c03572-provenance.json)), the four `live-7d7e05c-*.png` frames the one before that ([provenance](docs/screenshots/live-7d7e05c-provenance.json)), the two `live-8a06e9d-*.png` frames before those ([provenance](docs/screenshots/live-8a06e9d-provenance.json)), and the older role and sheet PNGs are historical captures at `912ef51`.

## The development team

| Role | Job |
|---|---|
| Coordinator / project manager | Keep work flowing, manage dependencies/capacity and publication visibility |
| Product owner | Evolve requirements and strategy, prioritize feedback, decide what to defer |
| Developer | Build complete playable changes and evidence |
| QA / reviewer | Independently test correctness, visuals, motion and sound |
| Simulated player-researcher | Try real gameplay paths and competing strategies; report confusion and enjoyment honestly |
| Release engineer | Integrate, verify CI, push main, maintain this README/board and deploy safely |

**Four active sessions maximum, including the coordinator.** Roles rotate through three child slots. Publisher/deployer remain compatibility aliases of the single release lane. Every role can feed problems and ideas back to product. Simulated player feedback is clearly labeled; it is not real-user research.

Target useful ready-work publication every **3–5 minutes**, investigate waits over **10 minutes**; deploy eligible gameplay builds within **5–10 minutes** when accessible. No empty commits, broken builds or documentation-only redeploys. The board is a timestamped generated snapshot with automatic browser refresh and stale-age reporting; fresh runtime observations must be published regularly.

## Start in OpenCode

**The Rustwake companion plugin is separate from MasterGoal.** Pulling this repository does not install it. The command `/rustwake-team bind` is available only after the companion is installed, registered in the active configuration and loaded by OpenCode.

1. Stop the existing loop with `/goal stop` and let its children checkpoint and stop. Preserve unfinished local work, then pull current `origin/main` into a clean integration checkout.
2. From the root of your local Rustwake checkout, install and register the companion:

   ```powershell
   npm --prefix tools/team-supervisor install --ignore-scripts
   npm --prefix tools/team-supervisor run install:local
   ```

3. **Check your active configuration.** The installer updates the project OpenCode configuration while preserving MasterGoal and provider settings. If your launcher sets `OPENCODE_CONFIG`, register the companion in that active configuration using your existing configuration procedure; the project registration may be overridden.
4. Fully restart OpenCode and select **rustwake-coordinator**. Run these commands one at a time:

   ```text
   /rustwake-team bind
   /rustwake-team status
   /goal forever goal.md
   ```

If `/rustwake-team bind` is unknown, the companion has not loaded. Check installation and the active configuration; do not reinstall MasterGoal or launch duplicate forever loops. The companion's blocking-wait guard also requires the local team to map the installed runtime's actual wait-tool names and verify them. Installation alone does not prove enforcement or concurrent scheduling.

Use a fresh `/goal forever goal.md` command to load the edited prompt; `/goal resume` retains the previous snapshot. Do not launch individual roles yourself. The coordinator begins the [commissioning sprint](docs/COMMISSIONING.md), verifies concurrent dispatch/refill and stop behavior, and records actual activation results. Server runner and deployment-adapter commissioning are separate from installing this companion.

[Full restart and recovery instructions](docs/START_TEAM.md) · [Companion configuration and operational checks](docs/TEAM_OPERATIONS.md) · [Automatic delivery setup](docs/AUTOMATED_DELIVERY.md).

## Team telemetry sidebar

Companion **0.2.0** adds a **RUSTWAKE TEAM** section to OpenCode's existing sidebar, alongside MasterGoal. It refreshes every two seconds without sending model prompts. It shows binding for the selected session, wait-guard configuration, observed worker slots and role/task/state rows, ready assignments, sponsor inbox state and board freshness.

**Upgrade an existing installation:** safely stop/checkpoint the running goal and children, pull main, run the following from the Rustwake checkout, then fully restart OpenCode:

```powershell
npm --prefix tools/team-supervisor ci --ignore-scripts
npm --prefix tools/team-supervisor run install:local
```

Select the coordinator and run `/rustwake-team bind`, then `/goal forever goal.md`. Package export `./tui` supplies the sidebar through the same OpenCode 2 mechanism used by MasterGoal; there is no separate TUI registration to add. The active launcher configuration must still load the companion package.

**Binding is live plugin state; worker activity is sampled evidence.** Use the installed dispatcher and `/rustwake-team status` for actual bound-session and worker evidence. The legacy `scripts/team-checkpoint.mjs` local-board planner is retired; do not invoke it. Missing, mismatched or older-than-two-minute observations show **unknown/stale**, not zero workers or fictitious activity. Empty inbox templates are correctly shown as empty. The sidebar does not start workers or guarantee scheduling. If absent, check that the sidebar is visible, the new package dependencies were installed, and the active OpenCode configuration loaded the package; `/rustwake-team status` remains the fallback.

Server/RPC, session-switching and telemetry tests pass locally; rendering in your actual OpenCode host remains part of the local commissioning check.

## Current gameplay and development

Implemented foundation: manual salvage, repairable automated drones, eight machine blueprints, resource routes, construction/upgrades, power/storage constraints, exports/research, local saves and offline catch-up. Strategic depth, art/audio and navigation remain under active development. Accounts, purchases and multiplayer are not implemented.

Tap salvage to begin recovery; repair your drone, build machines and route resources. Select machinery for available actions. Drag to pan, pinch to zoom; Home recenters. Back closes context. Saves remain browser-local; export a backup before clearing storage.

```sh
npm ci
npm run dev
npm test
npm run typecheck
npm run validate
npm run build
node scripts/team-board.mjs --check
node --test scripts/team-*.test.mjs scripts/sponsor-inbox.test.mjs tools/team-supervisor/supervisor.test.mjs
```

[Master goal](goal.md) · [Team charter](docs/TEAM_CHARTER.md) · [Workflow](docs/AGENT_WORKFLOW.md) · [Product strategy](docs/PRODUCT_STRATEGY.md) · [Art and experience](docs/DESIGN_BIBLE.md) · [Mechanics reference](docs/GAME_DESIGN.md) · [Deployment](docs/DEPLOYMENT.md).





## UI/UX specialist and five-session limit

The current policy permits five total model sessions: coordinator plus at most four workers. Queue role `ui-ux` to invoke `rustwake-ui-ux`; its workflow lives at `.opencode/skills/rustwake-ui-ux/SKILL.md`. It owns mobile and desktop interaction design, first-use clarity, navigation, visual hierarchy, accessibility and implementation-ready briefs. Product prioritizes, developers implement, and reviewers independently accept. Give it a scoped `work/design/<ticket>/` output. Do not turn design into endless audit reports or block ready releases.

For existing teams, queue one bounded UI/UX assignment at the next useful free slot; do not recreate completed startup work or discard active leases. Fresh startup selects dependency-ready work from live GitHub issues; UI/UX is assigned when ready. Five is a ceiling, not a requirement to invent work. Maintain release priority and feature publication cadence. Startup failures are now recorded in the dispatcher status and shown as START BLOCKED; preserve the exact error and existing session IDs rather than deleting runtime state. This improves diagnostics but does not establish the cause of an unreported host error.

