# Rustwake

A React/TypeScript mobile browser idle salvage game: repair a drone, recover wreckage, build a factory and expand into a cyberpunk industrial world. Full-screen gameplay, no page scrolling.

![Current phone build — presentation quality under revision](docs/screenshots/latest-mobile.png)

**Presentation quality is being reworked.** The current graphics, sound, animation and navigation are functional prototypes and have not met the owner's quality bar. The independent review found a broken narrow research column, indistinct machine silhouettes, an empty grid-heavy world, crude drone motion and placeholder oscillator audio. [Baseline findings](work/review/BASELINE.md) · [Priority board](work/BOARD.md).

**Live build:** [https://home.darkmatter2222.com/rustwake/](https://home.darkmatter2222.com/rustwake/) serves release `rustwake-7f82bec` (source `7f82bec`, code `8eb720c`, the Q-001r build): container `rustwake-static-1` healthy, HTTPS 200 with `ssl_verify_result=0` without `-k`, and all four served files sha256-identical to the local build — `index-C26PXQsL.js` 230027 B, `index-DiRtZOre.css` 7149 B, worker unchanged at 13015 B; LAN direct `http://192.168.86.48:8700/` 200 plus an external vantage of 45 of 48 check-host.net nodes at 200 (three node-side timeouts). Main's integrated head is `aaa3a4e` (this docs-only commit on top), so the live build is one code commit behind the reviewed tree. [Deployment receipt](work/deployments/OPS-004-g3.json) · [Deployment runbook](docs/DEPLOYMENT.md).

**Latest checkpoint (integrated head `aaa3a4e`; deployed code `8eb720c`).** `Q-002` is implemented and **quality-review pending**: the approved style slice landed as a hand-authored sprite part table, layered scene painters, a palette mirror and 13 deterministic draw-bound tests ([pixel receipt](docs/evidence/2026-11-03-style-slice-pixels.json), captures `docs/screenshots/slice-*.png`). `Q-005`'s audio mix-graph restructure is **accepted on its structural half** ([verdict](work/review/rev-q005-g1.md)) — one master bus, five category buses, 42 cue variants, capped voice budget, suspend/resume; its listening half stays pending on B-11. `Q-001` stays accepted on both independent passes ([g4](work/review/REV-Q001.md) · [g5](work/review/REV-Q001R.md)).

**Current work:** independent review of the `Q-002` style slice ([spec](work/review/REV-Q2SPEC.md)), then the ordered audio follow-ups `A-25 → A-31 → A-24` (P2) and `A-26 → A-29 → A-17 → A-18` (P3), then `Q-003 → Q-004 → R-16 → Q-007`. Quality-review-pending items are labelled as such in [STATUS](docs/STATUS.md) and are not deployment-eligible. Technical gates at this head: 23 files / 206 tests passed, typecheck, validate and build clean, built JS 232754 B / CSS 7224 B. [Reviewer baseline](work/review/REV-BASE.md) · [Audio review](work/review/REV-AUD1.md) · [Q-005 verdict](work/review/rev-q005-g1.md) · [Q-002 spec](work/review/REV-Q2SPEC.md)

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

**Current update.** The `Q-002` style slice (composed yard, distinct machine sprites) is implemented and **awaiting independent visual review**; `Q-005` is accepted on its structural half with the listening half pending on B-11; `Q-001` is accepted on both passes and ships in the live release. Live URL [https://home.darkmatter2222.com/rustwake/](https://home.darkmatter2222.com/rustwake/) is verified externally (OPS-004 receipt). CI remains **pending** — `gh` is unauthenticated in this environment (BL-06). [Priority board](work/BOARD.md).

Earlier measurements and the previous detailed README remain in the [preserved checkpoint](docs/STATUS.md) and [docs/history/README-before-studio.md](docs/history/README-before-studio.md). The `slice-*.png` set is the new Q-002 candidate evidence (`aaa3a4e`, seeded scenarios, see the [pixel receipt](docs/evidence/2026-11-03-style-slice-pixels.json)); the `latest-*.png` gallery still depicts `6f42c2f`.

Gallery: [Desktop](docs/screenshots/latest-desktop.png) · [Mature yard](docs/screenshots/latest-yard.png) · [Phone research](docs/screenshots/latest-research-phone.png) — style slice: [phone rest](docs/screenshots/slice-phone-rest.png) · [build](docs/screenshots/slice-phone-build.png) · [mature](docs/screenshots/slice-phone-mature.png) · [one machine](docs/screenshots/slice-phone-one-machine.png) · [desktop rest](docs/screenshots/slice-desktop-rest.png) · [build](docs/screenshots/slice-desktop-build.png) · [mature](docs/screenshots/slice-desktop-mature.png) · [silhouette sheet](docs/screenshots/slice-sheet-silhouette.png).
