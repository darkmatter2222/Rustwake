# Rustwake

A mobile browser strategy-idle game about salvage, metals and automation. Built with React/TypeScript: a full-screen industrial pixel world, no page scrolling, and a factory that keeps carrying out your plans while you are away.

**[Play Rustwake](https://home.darkmatter2222.com/rustwake/)** · **[Team board](work/BOARD.md)** · [Visual board file](work/board.html) · [Start the AI team](docs/START_TEAM.md)

## Current status

The game works, but the owner has reopened **strategy and presentation quality**: repeated bottom-action clicks appear sufficient for progression, the art remains below the desired standard, and published evidence became stale. Technical test passes and pixel measurements do not establish a good game.

This update installs an evolving product/team workflow. It does not itself improve the game graphics or start local agents. Next outcome: **“I choose a plan; my yard comes alive”**—a meaningful automation tradeoff, a coherent playable art slice and current release evidence. [Sprint plan](work/product/SPRINT-002.md) · [Owner feedback](work/feedback/OWNER-002.md).

| State | Evidence |
|---|---|
| Source inspected for this team update | `72ec26661ecda78605a4efb5458292614654e1fa` |
| Last evidenced live release | `rustwake-4c30fb4`, source `4c30fb4e247fe2a9da400b8e778296f422d6721e` |
| Deployment verification | [OPS-007](work/deployments/OPS-007-g1.json), 2026-11-04 19:16 UTC; served hashes, gameplay smoke and external HTTPS checks reported |
| Newer main versus live | Newer source exists; do not assume every main commit is deployed |
| Local team | Restart required to load the new roles/goal; runtime liveness is not verified by this commit |
| Screenshots | [Prior style slice](docs/screenshots/slice-phone-mature.png), seeded evidence at `8731f69`; historical, **not a current-build screenshot** |

The live deployment status above comes from repository receipts, not a new external check in this configuration update. Fresh current-game captures and live retesting are prioritized. [Prior detailed checkpoint](docs/history/README-before-team-v2.md).

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
