# Rustwake

A React/TypeScript mobile browser idle salvage game: repair a drone, recover wreckage, build a factory and expand into a cyberpunk industrial world. Full-screen gameplay, no page scrolling.

![Current phone build — presentation quality under revision](docs/screenshots/latest-mobile.png)

**Presentation quality is being reworked.** The current graphics, sound, animation and navigation are functional prototypes and have not met the owner's quality bar. The independent review found a broken narrow research column, indistinct machine silhouettes, an empty grid-heavy world, crude drone motion and placeholder oscillator audio. [Baseline findings](work/review/BASELINE.md) · [Priority board](work/BOARD.md).

**Latest checkpoint (2026-11-03, `727dccf`).** The independent baseline review is published with rubric scores (scene composition 1, asset identity 1, readability/interaction/state fidelity/performance 2, motion/audio pending evidence): first-feel acceptance **not met**, and `Q-001` (research cards, mobile navigation) is in development. [Reviewer baseline](work/review/REV-BASE.md)
Deployment discovery is complete — target host, ingress owner, DNS, TLS coverage and free port verified — and adoption is pending the one-line Vite `base: './'` fix. [Deployment discovery receipt](work/deployments/OPS-001-g1.md)
There is still **no live URL**: the planned route is `https://home.darkmatter2222.com/rustwake/` and it stays unlisted as clickable until end-to-end verification passes after adoption.

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

**Current update.** ORCH-001 concurrency canary passed on OpenCode 2.2.5: asynchronous child dispatch and out-of-order result arrival are verified, with the sanitized receipt at [work/review/CAPABILITY.md](work/review/CAPABILITY.md). Cancel propagation is still open as `ENG-002`. Q-001 (phone research card layout and navigation readability) is in development in the `q001-dev` worktree at base `a8fb14a`; the baseline rubric review is running in parallel. There is **no live deployment URL yet** — no deployment has been verified. [Priority board](work/BOARD.md).

Earlier measurements and the previous detailed README remain in the [preserved checkpoint](docs/STATUS.md) and [docs/history/README-before-studio.md](docs/history/README-before-studio.md). Existing screenshots depict the prior implementation inspected at `6f42c2f`, not this update; no new visual claim is made until Q-001 has independent review.

[Desktop](docs/screenshots/latest-desktop.png) · [Mature yard](docs/screenshots/latest-yard.png) · [Phone research](docs/screenshots/latest-research-phone.png). Live deployment verification remains pending on the user's local environment.
