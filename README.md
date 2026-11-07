# Rustwake

**Team plugin 0.7.0: fresh employees on each start.** Old runtime sessions and queues are archived, never resumed. Source and unfinished work are preserved. The first coordinator prompt after reopening OpenCode automatically starts the team. [Lifecycle details](docs/TEAM_DISPATCH.md).





A mobile browser strategy-idle game about salvage, metals and automation. Built with React/TypeScript: a full-screen industrial pixel world, no page scrolling, and a factory that keeps carrying out your plans while you are away.

**[Play Rustwake](https://home.darkmatter2222.com/rustwake/)** · **[Team board](work/BOARD.md)** · [Visual board file](work/board.html) · [Start the AI team](docs/START_TEAM.md)

## Frequent feature publication (plugin 0.4.0)

Developers can now commit/push their own `rw/` branches from separate worktrees. CI covers those branches; reviewed main integration still triggers automatic deployment. Queued releases get execution priority, and the sidebar shows verified feature pushes, commit activity, unpublished commit counts and successful deployment evidence. [Publication contract and commands](docs/PUBLICATION.md). Update/reinstall the plugin and restart to load these changes; existing workers are not moved or discarded automatically. Local publication/dispatcher tests passed; actual overnight cadence still requires runtime evidence.

## Team execution update

The prior plugin was advisory and could report progress without launching workers. **Version 0.3 adds executable dispatch.** Update/reinstall the local plugin, restart OpenCode, select rustwake-coordinator, and use `/rustwake-team start` before `/goal forever goal.md`. Binding alone is insufficient. [Exact startup and recovery instructions](docs/TEAM_DISPATCH.md). The sidebar shows actual child IDs, queued/running state and errors. Runtime validation on your machine is still required; repository tests do not prove live worker execution.

## Automatic deployment is enabled

Automatic delivery is enabled. Databrick's stable mounts were verified and [canary run 42144401481](https://github.com/darkmatter2222/Rustwake/actions/runs/42144401481) successfully packaged and deployed source `891ff04dc994ec9b1cffc5035ccb9ad0d38effe3`. The sponsor's successful commissioning output confirms `RUSTWAKE_CD_ENABLED=true`. Hostname HTTPS checks use Databrick's LAN hosts override; external Internet reachability and browser/visual quality are separate checks.

Push reviewed changes to `main`; GitHub Actions runs CI, packages the game/dashboard, and deploys automatically. No routine server commands are needed. [Delivery runs](https://github.com/darkmatter2222/Rustwake/actions/workflows/delivery.yml) · [Live dashboard](https://home.darkmatter2222.com/rustwake/team/) · [Runbook](docs/AUTOMATED_DELIVERY.md).

## Sponsor input and team operations

Write requests in **[SPONSOR_INBOX.md](SPONSOR_INBOX.md)** below its marker, locally or through GitHub. When the product owner has incorporated them into existing strategy and linked backlog work, the text is removed and preserved in an intake receipt. Removal means **in the work**, not shipped. [Intake details](docs/SPONSOR_INBOX.md).

The team now supports three concurrent developer instances on independent scopes, with QA/product/release rotated as useful work requires. [Board](work/BOARD.md) shows measured throughput, prospective points, cycle time, rework and observed utilization/coverage. Missing samples are unknown. Current repository update cannot observe local running sessions.

All eight agent personas now use the automatic delivery contract. The release engineer owns main integration and deployment monitoring; other workers continue independent work while CI runs. Build success and deployment success are tracked separately.

## Historical gameplay evidence (before Actions commissioning)

The table below records the earlier gameplay release and its review evidence. Current deployment provenance is the Actions run above; these historical screenshots and measurements are not fresh canary/browser verification.

The game works, but the owner has reopened **strategy and presentation quality**: repeated bottom-action clicks appear sufficient for progression, the art remains below the desired standard, and published evidence became stale. Technical test passes and pixel measurements do not establish a good game.

| State | Value |
|---|---|
| Integrated revision (tested) | `12cc0e2` — 284 tests / 27 files passed, `tsc --noEmit` clean, `0 violation(s)` content + behaviour with the behaviour line verbatim (`firstDrone=268 firstResearch=478 tick=18298 machines=8 links=18 drones=5 batches=1902 credits=82 nodes=3`), build exit 0, board `--check` exit 0 |
| Deployed artifact (live) | source `12cc0e2` (Actions `delivery` run 19) — entry `index-CUnHr3Cs.js` **231943 B** (65 B above the previous entry), css `index-9FriNULu.css` 7474 B, `tables-BB2NPvQ2.js` 9298 B, `catchup.worker-G_Jyr7uh.js` 13406 B (all three byte-identical to the previous release), served `index.html` 1262 B; the previous entry `index-DGy53fNu.js` still answers 200 at 231878 B |
| Served == built | 4/4 hashed assets sha256-equal over HTTPS to this lane’s own build of `12cc0e2` (entry `e369fe9b…`, css `d3a995b2…`, tables `28bed3b0…`, worker `0c784f3e…`) and the served HTML names the new entry; `index.html` differs from the local file only by CRLF normalisation (28 bytes, `core.autocrlf=true`); the live team dashboard prints `Artifact source: 12cc0e2…` |
| Chrome cap | last captured on the previous artifact (`d7af68a`): card **261.4 px of a 640 px `.hud` content box = 40.8 %** at 360x640 / text scale 2.0 with the fork open (cap **42 %**), and **16.7 / 40.8 / 10.6 / 31.0 %** across the four recorded cells at both depths. The css file is byte-identical in `12cc0e2` and only the two fork faces swap order, so no new capture was forced this cycle — the fresh four-cell run is UI-003 |
| Evidence | [release + delivery receipt](work/releases/REL-007-g1.md) · [ci run 42231570081](https://github.com/darkmatter2222/Rustwake/actions/runs/42231570081) · [delivery run 42231679008](https://github.com/darkmatter2222/Rustwake/actions/runs/42231679008) · [previous deploy receipt](work/deployments/OPS-013-g1.json) · [QA](work/review/CHRM-002-g1-qa.md) · [capture provenance](docs/screenshots/live-d7af68a-provenance.json) |
| Rollback | code: `887b5bc` is the tested predecessor of `12cc0e2` (one cherry-pick, so a plain revert of that one commit is complete). Served: the previous release `rustwake-d7af68a` and its asset names are retained and still served, so the previous entry keeps resolving for cached clients |
| CI | `ci` run **42231570081** (run 89, `push`) completed success for `12cc0e2` with all 15 steps green, including the board check, the node test sweep, the three host python tests, typecheck, validate, test and build; the `delivery` run **42231679008** (run 19, gated on that CI) completed success with the adapter promotion and sanitized receipt steps green |
| Open | **D-1**: the deepest sub-state still misses the band — 4 machines + fork open + one refused tap is `285.2 px = 44.6 %` at 360x640 ts2 (lever named: shorten the `Last need …` tail); **UI-002**: the resting card still names no power quantity; **UI-003**: rest-state yard coverage under one named denominator, the 360x640 mature separability boxes, the three-phone interaction series and the fresh four-cell fork capture are all still uncaptured; **DEF-001** cached HTML naming removed assets (`index.html` still has no `Cache-Control`); **DEF-007** `team-board --check` reports the views stale on a CRLF working copy although the same commit passes on CI; human audio listening, real-device p95 and one human first-feel run unverified |

**Player-visible outcome of this build:** the resting card is **13 px shorter** at phone size with large text, so the world keeps that band between the card and the dock, and every secondary row is still readable — 21.6 px text on 23.8 px leading with 1.8 px of white between wrapped rows, no horizontal clipping, and the two priced faces unchanged (`Faster batches 40 credits` / `Less power 30 credits`, 46 px faces). The change is one css declaration, so the entry chunk is byte-identical and only the css bytes differ, at one position. **Next outcome:** shorten the `Last need …` tail so the deepest cell (44.6 %) also fits (D-1), then the cheapest-first dock order that un-parks blind tapping (BLD-001). [Sprint plan](work/product/SPRINT-002.md) · [CHRM-002 QA](work/review/CHRM-002-g1-qa.md) · [STRAT-003 QA](work/review/STRAT-003-g1-qa.md) · [Owner feedback](work/feedback/OWNER-002.md).

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

**Binding is live plugin state; worker activity is sampled evidence.** The coordinator must refresh actual runtime observations through `scripts/team-checkpoint.mjs`, including `coordinator_session_id` for its bound session. Missing, mismatched or older-than-two-minute observations show **unknown/stale**, not zero workers or fictitious activity. Empty inbox templates are correctly shown as empty. The sidebar does not start workers or guarantee scheduling. If absent, check that the sidebar is visible, the new package dependencies were installed, and the active OpenCode configuration loaded the package; `/rustwake-team status` remains the fallback.

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





## UI/UX specialist and six-session limit

Plugin 0.5.0 permits six total model sessions: coordinator plus five workers. Queue role `ui-ux` to invoke `rustwake-ui-ux`; its workflow lives at `.opencode/skills/rustwake-ui-ux/SKILL.md`. It owns mobile interaction design, first-use clarity, navigation, visual hierarchy, accessibility and implementation-ready briefs. Product prioritizes, developers implement, and reviewers independently accept. Give it a scoped `work/design/<ticket>/` output. Do not turn design into endless audit reports or block ready releases.

For existing teams, queue one bounded UI/UX assignment at the next useful free slot; do not recreate completed startup work or discard active leases. Fresh startup includes a UI/UX assignment. Five is a ceiling, not a requirement to invent work. Maintain release priority and feature publication cadence. Startup failures are now recorded in the dispatcher status and shown as START BLOCKED; preserve the exact error and existing session IDs rather than deleting runtime state. This improves diagnostics but does not establish the cause of an unreported host error.
