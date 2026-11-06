# Rustwake

A mobile browser strategy-idle game about salvage, metals and automation. Built with React/TypeScript: a full-screen industrial pixel world, no page scrolling, and a factory that keeps carrying out your plans while you are away.

**[Play Rustwake](https://home.darkmatter2222.com/rustwake/)** · **[Team board](work/BOARD.md)** · [Visual board file](work/board.html) · [Start the AI team](docs/START_TEAM.md)

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
| Integrated revision (tested) | `d7af68a` — 283 tests / 27 files passed, `tsc --noEmit` clean, `0 violation(s)` content + behaviour, build exit 0, board `--check` exit 0 |
| Deployed artifact (live) | `rustwake-d7af68a`, source `d7af68a` — entry `index-DGy53fNu.js` **231878 B** (sha256 equal to the entry that was served before), css `index-9FriNULu.css` **7474 B** (one byte differs from `index-mmTSZ7Fz.css`: `line-height:1.1` vs `1.2`), `tables-BB2NPvQ2.js` 9298 B, `catchup.worker-G_Jyr7uh.js` 13406 B (both byte-identical to the previous release), `index.html` 1290 B |
| Served == built | 5/5 sha256 over HTTPS **and** loopback, cross-equal between the two routes; the served HTML names the new entry and css and the previous entry name now 404s; smoke on the deployed artifact (organic, fresh storage): two priced faces `Faster batches 40 credits` / `Less power 30 credits` with minimum face **46 px**, one tap on the cheapest face charging exactly the printed **30** (`30 → 0`, `branch:["draw"]` at level 2), resting `Drones 1 · Power 8 · 1 requested · 100 %`, `scrollHeight == innerHeight` in every cell, 0 page errors, 0 `/favicon.ico` requests; save stays `schemaVersion 1` / `eede3c4f` |
| Chrome cap | card **261.4 px of a 640 px `.hud` content box = 40.8 %** at 360x640 / text scale 2.0 with the fork open (cap **42 %**), and **16.7 / 40.8 / 10.6 / 31.0 %** across the four recorded cells at both depths — every cell inside the cap; the shipped harness run against the live route prints `CHRM-002 cell gates: ALL PASS` |
| Evidence | [OPS-013-g1](work/deployments/OPS-013-g1.json) · [release note](work/releases/RELEASE-006.md) · [live captures](docs/screenshots/live-d7af68a-provenance.json) · [QA](work/review/CHRM-002-g1-qa.md) · [handoff](work/development/handoffs/CHRM-002-g1.md) · [previous deploy receipt](work/deployments/OPS-012-g1.json) · [capture provenance](docs/screenshots/style-slice-provenance.json) |
| Rollback | `rustwake-0c03572` retained; restore is the two-line compose revert on stack 125 (bind path and `release:` label back) |
| CI | Authenticated GitHub API verified successful CI for inspected main `5a024be` and the preceding four runs; this update’s new run is checked separately |
| Open | **D-1**: the deepest sub-state still misses the band — 4 machines + fork open + one refused tap is `285.2 px = 44.6 %` at 360x640 ts2 (lever named: shorten the `Last need …` tail); **BLD-001**: blind tapping parks on the fork row because the **leftmost** face is the dearer plan (31 leftmost taps, 0 commands; cheapest-first paint order is the candidate fix); `coversYard` 45 ± 2 not reproduced at rest (one denominator still unnamed); DEF-001 cached HTML naming removed assets (`index.html` still has no `Cache-Control`); human audio listening, real-device p95 and one human first-feel run unverified; 360x640 mature separability boxes and the three-phone interaction set not captured |

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



