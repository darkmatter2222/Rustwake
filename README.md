# Rustwake

A mobile browser strategy-idle game about salvage, metals and automation. Built with React/TypeScript: a full-screen industrial pixel world, no page scrolling, and a factory that keeps carrying out your plans while you are away.

**[Play Rustwake](https://home.darkmatter2222.com/rustwake/)** · **[Team board](work/BOARD.md)** · [Visual board file](work/board.html) · [Start the AI team](docs/START_TEAM.md)

## Sponsor input and team operations

Write requests in **[SPONSOR_INBOX.md](SPONSOR_INBOX.md)** below its marker, locally or through GitHub. When the product owner has incorporated them into existing strategy and linked backlog work, the text is removed and preserved in an intake receipt. Removal means **in the work**, not shipped. [Intake details](docs/SPONSOR_INBOX.md).

The team now supports three concurrent developer instances on independent scopes, with QA/product/release rotated as useful work requires. [Board](work/BOARD.md) shows measured throughput, prospective points, cycle time, rework and observed utilization/coverage. Missing samples are unknown. Current repository update cannot observe local running sessions.

**Dashboard route planned:** `/rustwake/team/` under the existing game host. Automatic packaging/delivery is configured but local runner/host-adapter activation remains OPS-102; it is not yet verified live. [Delivery setup](docs/AUTOMATED_DELIVERY.md) · [Team supervisor setup](docs/TEAM_OPERATIONS.md). Existing game deployment below is preserved.

Operational tooling checks: 36 Node tests and 5 deployment-validation tests pass locally; runtime plugin loading and server commissioning still require the local canaries. Game source is unchanged by this update.

## Current status

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

**First launch:** follow the [commissioning sprint](docs/COMMISSIONING.md). The companion plugin must be installed separately before `/rustwake-team bind`; see the exact install commands in [startup instructions](docs/START_TEAM.md). The preceding operations commit `9555a94` passed GitHub CI; automatic delivery was skipped because commissioning is not enabled.

Stop the existing goal with `/goal stop`, let children checkpoint/stop, preserve local work and pull current main. Reload OpenCode agents, select **rustwake-coordinator**, then run:

```text
/goal forever goal.md
```

Use a fresh forever command to load the edited prompt; resume retains the previous snapshot. Do not launch each role separately. [Full restart and recovery instructions](docs/START_TEAM.md).

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

