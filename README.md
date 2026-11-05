# Rustwake

A mobile browser strategy-idle game about salvage, metals and automation. Built with React/TypeScript: a full-screen industrial pixel world, no page scrolling, and a factory that keeps carrying out your plans while you are away.

**[Play Rustwake](https://home.darkmatter2222.com/rustwake/)** · **[Team board](work/BOARD.md)** · [Visual board file](work/board.html) · [Start the AI team](docs/START_TEAM.md)

## Current status

The game works, but the owner has reopened **strategy and presentation quality**: repeated bottom-action clicks appear sufficient for progression, the art remains below the desired standard, and published evidence became stale. Technical test passes and pixel measurements do not establish a good game.

| State | Value |
|---|---|
| Integrated revision (tested) | `24daf0e` — 244 tests / 23 files passed, `tsc --noEmit` clean, `0 violation(s)` content + behaviour, build exit 0 |
| Deployed artifact (live) | `rustwake-24daf0e`, source `24daf0e` — entry `index-D14MbFT6.js` **226977 B**, tables 8407 B, css 7403 B, worker 13015 B, `index.html` 778 B |
| Served == built | 5/5 sha256 over HTTPS and loopback; smoke at 390x844 dpr2 (Salvage 0→5, no page scroll), 4/4 external nodes 200, v1 save fixture `eede3c4f` resumes and keeps ticking |
| Evidence | [OPS-008-g1](work/deployments/OPS-008-g1.json) 2026-11-05 01:26 UTC · [release note](work/releases/RELEASE-001.md) · [capture provenance](docs/screenshots/style-slice-provenance.json) |
| Rollback | `rustwake-4c30fb4` retained; restore is the one-line bind path on stack 125 |
| CI | `remote-CI-unverified` — `gh` unauthenticated and the anonymous API returns 404 for this private repo |
| Open | DEF-001 cached HTML naming removed assets, DEF-002 root favicon 404, DEF-003 repeated clip frames, DEF-004 drone position after catch-up; D-6/E-4 phone-ts2 card still over the ≤ 50 % band |

**Player-visible outcome of this build:** the yard is the composed slice — floor kit in empty tiles, a full-frame sprite sheet, and a research card that leaves the yard visible on desktop; the strategy census now says plainly that the scripted ladder, not the player, picks the plan (one option in 293 of 1800 naive rounds, a real build-vs-upgrade fork in only 4). **Next outcome:** one cost-bearing fork (A1, criteria A1-1..A1-6) plus the inspected art candidate `3f7555a`, then re-run the same three policies. [Sprint plan](work/product/SPRINT-002.md) · [Owner feedback](work/feedback/OWNER-002.md) · [STRAT-001 verdict](work/feedback/STRAT-001-g1.md).

Screens are the seeded 12-case slice at `24daf0e` (portrait 360/390/412, mobile landscape 844x390, desktop 1440x900) in [docs/screenshots](docs/screenshots/style-slice-provenance.json); the older role and sheet PNGs are historical captures at `912ef51`.

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
