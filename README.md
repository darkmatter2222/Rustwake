# Rustwake

A mobile browser strategy-idle game about salvage, metals and automation. Built with React/TypeScript: a full-screen industrial pixel world, no page scrolling, and a factory that keeps carrying out your plans while you are away.

**[Play Rustwake](https://home.darkmatter2222.com/rustwake/)** · **[Team board](work/BOARD.md)** · [Visual board file](work/board.html) · [Start the AI team](docs/START_TEAM.md)

## Current status

The game works, but the owner has reopened **strategy and presentation quality**: repeated bottom-action clicks appear sufficient for progression, the art remains below the desired standard, and published evidence became stale. Technical test passes and pixel measurements do not establish a good game.

| State | Value |
|---|---|
| Integrated revision (tested) | `8a06e9d` — 268 tests / 27 files passed, `tsc --noEmit` clean, `0 violation(s)` content + behaviour, build exit 0, board `--check` exit 0 |
| Deployed artifact (live) | `rustwake-8a06e9d`, source `8a06e9d` — entry `index-CJfGk59d.js` **231520 B** (1480 B under the 233000 ceiling, same hash as the lane build), tables 9298 B, css 7403 B, worker 13406 B, `index.html` 778 B |
| Served == built | 5/5 sha256 over HTTPS and loopback; the served HTML names the new entry hash and the previous one now 404s; smoke at 390x844 dpr2 (organic, fresh storage): toast `Need 20 scrap · have 0`, resting `Drones 1 · Power 8 · 0 requested · 100 %` with 0 machines, three priced fork options, 0 page errors; save stays `schemaVersion 1` / `eede3c4f` |
| Evidence | [OPS-010-g1](work/deployments/OPS-010-g1.json) · [release note](work/releases/RELEASE-003.md) · [live captures](docs/screenshots/live-8a06e9d-provenance.json) · [capture provenance](docs/screenshots/style-slice-provenance.json) |
| Rollback | `rustwake-c2842e1` retained; restore is the one-line bind path on stack 125 |
| CI | `remote-CI-unverified` — `gh` unauthenticated and the anonymous API returns 404 for this private repo |
| Open | **CHRM-001**: the 360x640 / text-scale-2.0 card is 316.4 px = 49.4 % against the recorded 42 % cap arithmetic, legend collapse owed (CH-1..CH-3); `inputStallPct` run still owed, so `buffer` stays a provisional third branch under `A1-2v3`; 360x640 mature separability boxes and the three-phone interaction set not captured; human audio listening, real-device p95 and one human first-feel unverified; `remote-CI-unverified`; DEF-001 cached HTML naming removed assets and DEF-002 icon answered by the HTML fallback |

**Player-visible outcome of this build:** a blocked tap now states the shortfall in numbers (`Need 20 scrap · have 0`), the resting screen carries `Drones 1 · Power 8 · 0 requested · 100 %` from the first tick even with no machine placed, and the primary button keeps one label per committed choice (`Build Scrap sorter 20 scrap` in both the build and ghost phases) while the named batch rows get a legend (`Batch pips · Scrap sorter 1/5 · Furnace 1/5 · Polymer recycler 0/5 +1`). **Next outcome:** STRAT-003 — unequal named-plan prices, so one sentence can name what the chosen plan costs that the others do not. [Sprint plan](work/product/SPRINT-002.md) · [PLAY-001 decision](work/product/PLAY-001-decision-g1.md) · [STRAT-002 decision + g2 addendum](work/product/STRAT-002-decision-g2.md) · [Owner feedback](work/feedback/OWNER-002.md).

Screens are the seeded 12-case slice at `24daf0e` (portrait 360/390/412, mobile landscape 844x390, desktop 1440x900) in [docs/screenshots](docs/screenshots/style-slice-provenance.json); the ART-001 rows are candidate captures at `87ee90b` ([rest](docs/screenshots/candidate-87ee90b-slice-phone-rest.png), [mature](docs/screenshots/candidate-87ee90b-slice-phone-mature.png), 26 clip frames); the two `live-8a06e9d-*.png` frames are organic captures of the deployed artifact ([provenance](docs/screenshots/live-8a06e9d-provenance.json)), and the older role and sheet PNGs are historical captures at `912ef51`.

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

Target useful ready-work publication every **3–5 minutes**, investigate waits over **10 minutes**; deploy eligible gameplay builds within **5–10 minutes** when accessible. No empty commits, broken builds or documentation-only redeploys. The board is a generated snapshot, not a live agent monitor.

## Start in OpenCode

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
node --test scripts/team-board.test.mjs
```

[Master goal](goal.md) · [Team charter](docs/TEAM_CHARTER.md) · [Workflow](docs/AGENT_WORKFLOW.md) · [Product strategy](docs/PRODUCT_STRATEGY.md) · [Art and experience](docs/DESIGN_BIBLE.md) · [Mechanics reference](docs/GAME_DESIGN.md) · [Deployment](docs/DEPLOYMENT.md).
