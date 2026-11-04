# Rustwake

A React/TypeScript mobile browser idle salvage game: repair a drone, recover wreckage, build a factory and expand into a cyberpunk industrial world. Full-screen gameplay, no page scrolling.

![Current phone build — presentation quality under revision](docs/screenshots/latest-mobile.png)

**Presentation quality is being reworked.** The current graphics, sound, animation and navigation are functional prototypes and have not met the owner's quality bar. The independent review found a broken narrow research column, indistinct machine silhouettes, an empty grid-heavy world, crude drone motion and placeholder oscillator audio. [Baseline findings](work/review/BASELINE.md) · [Priority board](work/BOARD.md).

**Live build:** [https://home.darkmatter2222.com/rustwake/](https://home.darkmatter2222.com/rustwake/) serves release `rustwake-090260a` (source `090260a`, code `090260a`): HTTPS 200 and LAN `http://192.168.86.48:8700/` 200 with the four served files sha256-identical to the local build — `index-oeY4tDi3.js` 232815 B, `index-Cwg_kGXQ.css` 7224 B, worker `catchup.worker-DphWaCEx.js` 13015 B, `index.html` 700 B; the previous release `rustwake-7f82bec` is retained for rollback. [OPS-005 receipt](work/deployments/OPS-005-g1.json) · [Deployment runbook](docs/DEPLOYMENT.md). Main's integrated head is `1720401` (this docs-only commit on top), so the live build predates the A-17/A-18 snapshot fixes.

**Latest checkpoint (integrated head `1720401`; live release `rustwake-090260a`, i.e. the previous head `090260a`).** `Q-002` stays **review-accepted — accept-with-follow-ups** ([verdict](work/review/rev-q002-g1.md)): 33 PASS of 35 spec lines, scene composition and asset identity 1 → 3; still outstanding before it is called closed: **B-02** (evidence JSON/table agreement) and **B-03** (D8 mask assertion), with B-04/B-05/B-06 as low polish. Style slice = sprite part table + layered painters + palette mirror + 13 draw-bound tests + phase-B finals ([numeric receipt](docs/evidence/2026-11-03-style-slice.md), [pixel samples](docs/evidence/2026-11-03-style-slice-pixels.json), [provenance](docs/evidence/asset-provenance.json), [handoff](q002-handoff.md), captures `docs/screenshots/slice-*.png`). `Q-005` is accepted on its structural half ([verdict](work/review/rev-q005-g1.md)) with A-24/A-25/A-31/A-26/A-29 closed earlier and **A-17/A-18 closed now** (`2cea474`, `1720401`); remaining tidy batch `A-19/A-20/A-22/A-23/A-27/A-28/A-30`. **Motion (`Q-004`, spec [rev-q4spec-g1](work/review/rev-q4spec-g1.md)) and the audio listening half (B-11) stay pending**; `Q-001` stays accepted on both passes ([g4](work/review/REV-Q001.md) · [g5](work/review/REV-Q001R.md)).

**Current work:** the **E3 chunk-split task** (js is over the pinned ceiling), then B-02 + B-03 to close `Q-002`, then `Q-004` ([spec](work/review/rev-q4spec-g1.md)), then `Q-003 → Q-007 → Q-008`, with the audio tidy batch `A-19/A-20/A-22/A-23/A-27/A-28/A-30` and B-04/B-05/B-06 filling gaps. Gates at the tested revision `1720401`: **23 files / 212 tests passed** (exit 0), `tsc --noEmit` clean, `index-CDIgZVOa.js` **233061 B** (gzip 73.75 kB), CSS `index-Cwg_kGXQ.css` 7224 B, validate `0 violation(s)` + `0 violation(s)`. **E3: measured 233061 B against the pinned ceiling 233000 B, i.e. currently exceeded by 61 B** — ceiling unchanged, fix is the developer's chunk-split task ([rev-q002-g1](work/review/rev-q002-g1.md) sec.5). CI is **pending** (`gh` unauthenticated; API 404 for this private repo). [Reviewer baseline](work/review/REV-BASE.md) · [Audio review](work/review/REV-AUD1.md) · [Q-005 verdict](work/review/rev-q005-g1.md) · [Q-002 verdict](work/review/rev-q002-g1.md) · [Q-004 spec](work/review/rev-q4spec-g1.md)

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

**Current update.** Tested revision `1720401`: **23 files / 212 tests** passed (exit 0), `tsc --noEmit` clean, `dist/assets/index-CDIgZVOa.js` **233061 B** (gzip 73.75 kB), CSS 7224 B, worker 13015 B, validate `0 content + 0 behaviour violations`. **E3: 233061 B is 61 B above the pinned 233000 B ceiling at this tip; chunk split in flight (q005d)** — the ceiling itself is not moved. `Q-002` is review-accepted (accept-with-follow-ups) with **B-02** and **B-03** still open, now specified line-by-line in [rev-q2follow-g1](work/review/rev-q2follow-g1.md); `Q-005` keeps its structural acceptance (A-17/A-18 closed at `2cea474`/`1720401`; tidy batch A-19/A-20/A-22/A-23/A-27/A-28/A-30 left) and **motion (`Q-004`, [spec](work/review/rev-q4spec-g1.md)) plus the audio listening pass stay pending**. Live release: [https://home.darkmatter2222.com/rustwake/](https://home.darkmatter2222.com/rustwake/) serves `rustwake-090260a` ([OPS-005 receipt](work/deployments/OPS-005-g1.json)). CI remains **pending** - `gh` is unauthenticated here and the anonymous API returns 404 for this private repo (BL-06). [Priority board](work/BOARD.md).

Earlier measurements and the previous detailed README remain in the [preserved checkpoint](docs/STATUS.md) and [docs/history/README-before-studio.md](docs/history/README-before-studio.md). The `slice-*.png` set is the Q-002 candidate evidence at `8731f69` (seeded scenarios, deterministic sampler); the `latest-*.png` gallery still depicts `6f42c2f`.

Gallery: [Desktop](docs/screenshots/latest-desktop.png) · [Mature yard](docs/screenshots/latest-yard.png) · [Phone research](docs/screenshots/latest-research-phone.png) — style slice: [phone rest](docs/screenshots/slice-phone-rest.png) · [build](docs/screenshots/slice-phone-build.png) · [mature](docs/screenshots/slice-phone-mature.png) · [one machine](docs/screenshots/slice-phone-one-machine.png) · [desktop rest](docs/screenshots/slice-desktop-rest.png) · [build](docs/screenshots/slice-desktop-build.png) · [mature](docs/screenshots/slice-desktop-mature.png) · [silhouette sheet](docs/screenshots/slice-sheet-silhouette.png).
