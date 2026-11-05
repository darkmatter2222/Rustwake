# Rustwake

A mobile browser strategy-idle game about salvage, metals and automation. Built with React/TypeScript: a full-screen industrial pixel world, no page scrolling, and a factory that keeps carrying out your plans while you are away.

**[Play Rustwake](https://home.darkmatter2222.com/rustwake/)** · **[Team board](work/BOARD.md)** · [Visual board file](work/board.html) · [Start the AI team](docs/START_TEAM.md)

## Current status

The game works, but the owner has reopened **strategy and presentation quality**: repeated bottom-action clicks appear sufficient for progression, the art remains below the desired standard, and published evidence became stale. Technical test passes and pixel measurements do not establish a good game.

| State | Value |
|---|---|
| Integrated revision (tested) | `c2842e1` — 259 tests / 26 files passed, `tsc --noEmit` clean, `0 violation(s)` content + behaviour, build exit 0, board `--check` exit 0 |
| Deployed artifact (live) | `rustwake-c2842e1`, source `c2842e1` — entry `index-Br0Eyz3s.js` **230583 B**, tables 9298 B, css 7403 B, worker 13406 B, `index.html` 778 B |
| Served == built | 5/5 sha256 over HTTPS and loopback; the served HTML names the new entry hash and the previous three names now 404; smoke at 390x844 and 360x640 (fork row of three named branches, one tap commits `speed`, resting line `Power 8 · 0 requested · 100 %`), organic 250 ms run 6/6 distinct frames and ticks, v1 save fixture `eede3c4f` loads unchanged |
| Evidence | [OPS-009-g1](work/deployments/OPS-009-g1.json) · [release note](work/releases/RELEASE-002.md) · [capture provenance](docs/screenshots/style-slice-provenance.json) |
| Rollback | `rustwake-24daf0e` retained; restore is the one-line bind path on stack 125 |
| CI | `remote-CI-unverified` — `gh` unauthenticated and the anonymous API returns 404 for this private repo |
| Open | `A1-2` is **NOT MET** as recorded and `A1-2v2` is approved prospectively (g2 onward), so its re-run is owed; DEF-001 cached HTML naming removed assets and DEF-002 icon answered by the HTML fallback (site root 404 153 B; `/rustwake/favicon.ico` 200 `text/html` 778 B — a fallback, not an icon); audio, real-device p95 and human first-feel unverified; dock buttons clip at 360x640 / text scale 2 — identical at the base, so pre-existing; **UI-001** triaged ([census](work/evidence/UI-001-census-g1.md)) |

**Player-visible outcome of this build:** each machine upgrade now names the quantity it improves — the dock offers `Faster batches`, `More input` or `Less power` at one price, and the resting screen carries the power line `Power 8 · 1 requested · 100 %`; the supply drone’s leg eases through its turnaround instead of snapping back (26/26 distinct frames in the 250 ms witness, 6/6 re-checked live). **Next outcome:** PLAY-001 — the resting screen answers three questions without a tap (stable primary label, shortfall numbers, one numeric idle beat). [Sprint plan](work/product/SPRINT-002.md) · [Owner feedback](work/feedback/OWNER-002.md) · [STRAT-001 verdict](work/feedback/STRAT-001-g1.md) · [STRAT-002 QA](work/review/STRAT-002-g1-qa.md).

Screens are the seeded 12-case slice at `24daf0e` (portrait 360/390/412, mobile landscape 844x390, desktop 1440x900) in [docs/screenshots](docs/screenshots/style-slice-provenance.json); the ART-001 rows are candidate captures at `87ee90b` ([rest](docs/screenshots/candidate-87ee90b-slice-phone-rest.png), [mature](docs/screenshots/candidate-87ee90b-slice-phone-mature.png), 26 clip frames), and the older role and sheet PNGs are historical captures at `912ef51`.

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
