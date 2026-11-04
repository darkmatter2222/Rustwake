# Rustwake

A React/TypeScript mobile browser idle salvage game: repair a drone, recover wreckage, build a factory and expand into a cyberpunk industrial world. Full-screen gameplay, no page scrolling.

![Current phone build — presentation quality under revision](docs/screenshots/latest-mobile.png)

**Presentation quality is being reworked.** The current graphics, sound, animation and navigation are functional prototypes and have not met the owner's quality bar. The independent review found a broken narrow research column, indistinct machine silhouettes, an empty grid-heavy world, crude drone motion and placeholder oscillator audio. [Baseline findings](work/review/BASELINE.md) · [Priority board](work/BOARD.md).

**Play URL:** pending verified Databrick deployment. No Rustwake hostname or live deployment has been established by this update. The local deployment agent will inspect existing HomeAILab ingress/DNS, deploy an isolated Rustwake stack, verify it, and replace this line with the real clickable URL and deployed SHA. [Deployment runbook](docs/DEPLOYMENT.md).

## Current gameplay

Implemented: manual salvage and drone repair/automation; eight machine blueprints; real resource routes; construction, movement, dismantling and upgrades; shared power/storage constraints; exports and three research nodes; contextual objectives; local saves, import/export and a single-writer tab lease; 12-hour offline catch-up; basic synthesized sounds.

Planned: expeditions, richer wreck composition, restore/dismantle decisions, policies, prestige, factions/crews, PvP and purchases. There is no account/backend/payment system yet. [Detailed game design](docs/GAME_DESIGN.md).

## Autonomous OpenCode studio

Select **rustwake-coordinator** in OpenCode, then start a new MasterGoal loop:

```text
/goal forever goal.md
```

For an existing loop, stop it and start again to load the new saved prompt. Do not run `/goal init` over this file. The agent files use the inspected HomeAILab format; local runtime loading and asynchronous session support must pass the documented canary before anyone claims the studio is running.

| Role | Responsibility |
|---|---|
| Coordinator | Maintain independent work queues and refill idle roles without waiting for all agents |
| Developer | Implement/test coherent changes in an isolated worktree |
| Designer/reviewer | Inspect actual screenshots, motion/audio evidence and gameplay; write tasks and independent verdicts |
| Publisher | Sole integration/main-push owner; frequent useful checkpoints and README/evidence updates |
| Deployer | Sole scoped Databrick release owner; health checks, DNS/HTTPS verification and Rustwake-only rollback |

Target GitHub cadence: useful ready checkpoints every **3–5 minutes**, with completed eligible work normally waiting under **10 minutes**. No empty commits or broken builds to satisfy a clock. Reviewer and developer run concurrently only through verified runtime support; role Markdown alone is not a scheduler. Publisher/deployer wake for ready work rather than consuming idle model cycles.

[Master goal](goal.md) · [Spirit/style/quality bible](docs/DESIGN_BIBLE.md) · [Agent workflow](docs/AGENT_WORKFLOW.md) · [Agent definitions](.opencode/agents) · [Status](docs/STATUS.md).

## Next quality goals

1. Repair phone research cards and navigation readability.
2. Approve a composed yard style slice with distinct machine sprites, proper drone/wreck art and a contextual grid.
3. Improve motion and sound with independent evidence, then expand the style across the game.

The longer mechanics backlog remains in [BACKLOG.md](docs/BACKLOG.md). Keep technical checks and experiential approval separate.

## Run and verify

Use the repository's supported Node/npm setup and lockfile:

```sh
npm ci
npm run dev
npm test
npm run typecheck
npm run validate
npm run build
```

Serve the production `dist/` artifact for deployment; do not expose the Vite development server. Existing capture scripts and long organic progression checks remain available. The new workflow calls for fast targeted visual fixtures plus full milestone/release captures so the long suite does not block every small improvement.

## Controls and saves

Tap a wreck to salvage; repair the drone after collecting enough scrap. Select machines to connect, upgrade, move or dismantle. Build controls place a ghost before confirmation. Drag to pan; pinch to zoom; Home recenters. Back/Escape closes local context. Sound and text-size controls are available. Local saves stay in this browser; export a backup before clearing browser storage. Only the active owner tab writes.

Current navigation labels and blueprint selection are being redesigned; use the in-game objective for the implemented next action. No claim is made here that navigation polish is complete.

## Evidence and latest update

This update reorganizes the master goal, separates design from execution, adds five OpenCode roles, defines independent asynchronous work and safe publishing/deployment protocols, and seeds six concrete quality tasks. It does **not** change the game's art/audio code, start local agents or deploy Databrick.

Existing screenshots depict the prior implementation, not new visual improvements from this documentation change. Baseline source/evidence was inspected at `6f42c2faff72e85e08dfb924cf50ad7f1153ef5c`; capture details and prior test/performance results remain in the [preserved checkpoint](docs/STATUS.md) and [previous detailed README](docs/history/README-before-studio.md). Those reported tests were not rerun for this documentation-only update.

[Desktop](docs/screenshots/latest-desktop.png) · [Mature yard](docs/screenshots/latest-yard.png) · [Phone research](docs/screenshots/latest-research-phone.png). Runtime concurrency and live deployment verification remain pending on the user's local environment.
