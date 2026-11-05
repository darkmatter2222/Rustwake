# Rustwake

A mobile browser strategy-idle game about salvage, metals and automation. Built with React/TypeScript: a full-screen industrial pixel world, no page scrolling, and a factory that keeps carrying out your plans while you are away.

**[Play Rustwake](https://home.darkmatter2222.com/rustwake/)** · **[Team board](work/BOARD.md)** · [Visual board file](work/board.html) · [Start the AI team](docs/START_TEAM.md)

## Current status

The game works, but the owner has reopened **strategy and presentation quality**: repeated bottom-action clicks appear sufficient for progression, the art remains below the desired standard, and published evidence became stale. Technical test passes and pixel measurements do not establish a good game.

| State | Value |
|---|---|
| Integrated revision (tested) | `7d7e05c` — 275 tests / 27 files passed, `tsc --noEmit` clean, `0 violation(s)` content + behaviour, build exit 0, board `--check` exit 0 |
| Deployed artifact (live) | `rustwake-7d7e05c`, source `7d7e05c` — entry `index-Bi7lF9Yv.js` **231706 B** (1294 B under the 233000 ceiling, same digest as the independent QA and isolated SHA builds), tables 9298 B, css `index-mmTSZ7Fz.css` 7474 B, worker 13406 B, `index.html` 778 B |
| Served == built | 5/5 sha256 over HTTPS and loopback; the served HTML names the new entry hash and the previous one now 404s; smoke at 390x844 and 360x640 dpr2 (organic, fresh storage): resting `Drones 1 · Power 8 · 0 requested · 100 %` carrying `Last need 20 scrap · have 15`, that trailing segment still painted 2.2 s after `.toast` went null, exactly two priced fork options with `branch:["speed"]` from one tap, 0 page errors; save stays `schemaVersion 1` / `eede3c4f` |
| Evidence | [OPS-011-g1](work/deployments/OPS-011-g1.json) · [release note](work/releases/RELEASE-004.md) · [live captures](docs/screenshots/live-7d7e05c-provenance.json) · [capture provenance](docs/screenshots/style-slice-provenance.json) |
| Rollback | `rustwake-8a06e9d` retained; restore is the one-line bind path on stack 125 |
| CI | `remote-CI-unverified` — `gh` unauthenticated and the anonymous API returns 404 for this private repo |
| Open | the 4-machine fork-open cell is 300.3 px = 46.9 % at 360x640 / text scale 2.0, one step outside the 42 % cap (CHRM-001 is closed at 2-machine depth: 16.4 / 41.3 / 12.4 / 31.4 %); DEF-006 the carried `Last need …` segment is replaced but never cleared (QA label N-1); `coversYard` 45 ± 2 not reproduced at rest (the canonical cells are the panel-open census, one denominator still unnamed); human audio listening, real-device p95 and one human first-feel run unverified; 360x640 mature separability boxes and the three-phone interaction set not captured; `remote-CI-unverified`; DEF-001 cached HTML naming removed assets and DEF-002 icon answered by the HTML fallback |

**Player-visible outcome of this build (three changes):** a blocked tap now leaves its shortfall on the resting screen after the toast is gone (`Drones 1 · Power 8 · 0 requested · 100 % · Last need 20 scrap · have 15`, one source string shared with the toast `Need 20 scrap · have 15`), the upgrade dock offers **two named plans at one price each** (`Faster batches 30 credits` / `Less power 30 credits`, 46 px taps, one tap records the branch) after the `buffer` branch was dropped on the measured `inputStallPct` ladders, and the batch legend is **two tile-indexed entries plus a tail** (`Batch pips · Scrap sorter #8 5/5 · Furnace #9 0/5 +2`), so duplicate blueprints are tellable apart and the card fits the recorded cap at 2-machine depth. **Next outcome:** STRAT-003 — unequal named-plan prices, so one sentence can name what the chosen plan costs that the others do not. [Sprint plan](work/product/SPRINT-002.md) · [PLAY-002 QA](work/review/PLAY-002-g1-qa.md) · [PLAY-001 decision](work/product/PLAY-001-decision-g1.md) · [STRAT-002 decision + g2 addendum](work/product/STRAT-002-decision-g2.md) · [Owner feedback](work/feedback/OWNER-002.md).

Screens are the seeded 12-case slice at `24daf0e` (portrait 360/390/412, mobile landscape 844x390, desktop 1440x900) in [docs/screenshots](docs/screenshots/style-slice-provenance.json); the ART-001 rows are candidate captures at `87ee90b` ([rest](docs/screenshots/candidate-87ee90b-slice-phone-rest.png), [mature](docs/screenshots/candidate-87ee90b-slice-phone-mature.png), 26 clip frames); the four `live-7d7e05c-*.png` frames are organic captures of the currently deployed artifact ([provenance](docs/screenshots/live-7d7e05c-provenance.json)), the two `live-8a06e9d-*.png` frames are the previous release's captures ([provenance](docs/screenshots/live-8a06e9d-provenance.json)), and the older role and sheet PNGs are historical captures at `912ef51`.

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
