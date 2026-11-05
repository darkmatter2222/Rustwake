# Rustwake

A mobile browser strategy-idle game about salvage, metals and automation. Built with React/TypeScript: a full-screen industrial pixel world, no page scrolling, and a factory that keeps carrying out your plans while you are away.

**[Play Rustwake](https://home.darkmatter2222.com/rustwake/)** · **[Team board](work/BOARD.md)** · [Visual board file](work/board.html) · [Start the AI team](docs/START_TEAM.md)

## Current status

The game works, but the owner has reopened **strategy and presentation quality**: repeated bottom-action clicks appear sufficient for progression, the art remains below the desired standard, and published evidence became stale. Technical test passes and pixel measurements do not establish a good game.

| State | Value |
|---|---|
| Integrated revision (tested) | `0c03572` — 283 tests / 27 files passed, `tsc --noEmit` clean, `0 violation(s)` content + behaviour, build exit 0, board `--check` exit 0 |
| Deployed artifact (live) | `rustwake-0c03572`, source `0c03572` — entry `index-Cmh4A1Sb.js` **231878 B** (1122 B under the 233000 ceiling, same digest as the independent QA and isolated SHA builds), tables 9298 B, css `index-mmTSZ7Fz.css` 7474 B, worker 13406 B (all three byte-identical to the previous release), `index.html` 1290 B |
| Served == built | 5/5 sha256 over HTTPS and loopback; the served HTML names the new entry hash and the previous one now 404s; smoke at 390x844 / ts1 and 360x640 / ts2 (organic, fresh storage): **two priced fork faces at two prices** (`Faster batches 40 credits` / `Less power 30 credits`, 46 px minimum face), one tap charging exactly the printed 30 (`30 → 0`, `branch:["draw"]` at level 2), the dearer face refused at purse 30 with `Need 40 credits · have 30` and no state change, resting `Drones 1 · Power 8 · 0 requested · 100 %`, `scrollHeight == innerHeight` in every cell, 0 page errors, 0 `/favicon.ico` requests; save stays `schemaVersion 1` / `eede3c4f` |
| Evidence | [OPS-012-g1](work/deployments/OPS-012-g1.json) · [release note](work/releases/RELEASE-005.md) · [live captures](docs/screenshots/live-0c03572-provenance.json) · [persona A/B](work/feedback/STRAT-003-g1-persona.json) · [QA](work/review/STRAT-003-g1-qa.md) · [capture provenance](docs/screenshots/style-slice-provenance.json) |
| Rollback | `rustwake-7d7e05c` retained; restore is the two-line compose revert on stack 125 (bind path back, drop the `release:` label) |
| CI | `remote-CI-unverified` — `gh` unauthenticated and the anonymous API returns 404 for this private repo |
| Open | the 4-machine fork-open cell is 274.4 px = **42.9 %** at 360x640 / text scale 2.0, 0.9 pp outside the 42 % cap and identical in the previous build (CHRM-001 back to triaged, lever named: `.text-large .status-line` line-height `src/ui/styles.css:608`); `coversYard` 45 ± 2 not reproduced at rest (the canonical cells are the panel-open census, one denominator still unnamed); the persona numbers name the price but not the effect; human audio listening, real-device p95 and one human first-feel run unverified; 360x640 mature separability boxes and the three-phone interaction set not captured; `remote-CI-unverified`; DEF-001 cached HTML naming removed assets (`index.html` still has no `Cache-Control`) |

**Player-visible outcome of this build (four changes):** the two upgrade plans now **print their own prices** — `Faster batches 40 credits` and `Less power 30 credits` at the first rank of a base-30 ladder (50 and 40 on the furnace rank), so one sentence can name what the chosen plan costs that the other one does not; one tap charges exactly the number the tapped face printed, and with a purse in between (`30`) the dearer plan is refused with `Need 40 credits · have 30` and no state change; the carried shortfall segment now **retires** on the next accepted command (`Drones 1 · Power 8 · 1 requested · 100 %` again after a paid pick, DEF-006) and the tab **icon ships inline** in the HTML so no `/favicon.ico` request is issued (DEF-002). The A/B counts: the priced arm satisfies all three test sentences while the equal-price control fails sentence (2) — both its plans print 30 and both charge 30, so the paid amount identifies nothing. **Next outcome:** the css-only card polish that takes the 4-machine fork-open cell from 42.9 % back inside the 42 % band (CHRM-001), then the effect-on-the-face test (`+10 % batches`) from the persona note. [Sprint plan](work/product/SPRINT-002.md) · [STRAT-003 QA](work/review/STRAT-003-g1-qa.md) · [STRAT-003 handoff](work/development/handoffs/STRAT-003-g1.md) · [STRAT-002 decision + g2 addendum](work/product/STRAT-002-decision-g2.md) · [Owner feedback](work/feedback/OWNER-002.md).

Screens are the seeded 12-case slice at `24daf0e` (portrait 360/390/412, mobile landscape 844x390, desktop 1440x900) in [docs/screenshots](docs/screenshots/style-slice-provenance.json); the ART-001 rows are candidate captures at `87ee90b` ([rest](docs/screenshots/candidate-87ee90b-slice-phone-rest.png), [mature](docs/screenshots/candidate-87ee90b-slice-phone-mature.png), 26 clip frames); the nine `live-0c03572-*.png` frames are organic captures of the currently deployed artifact ([provenance](docs/screenshots/live-0c03572-provenance.json)); the four `live-7d7e05c-*.png` frames are the previous release's captures ([provenance](docs/screenshots/live-7d7e05c-provenance.json)), the two `live-8a06e9d-*.png` frames the one before that ([provenance](docs/screenshots/live-8a06e9d-provenance.json)), and the older role and sheet PNGs are historical captures at `912ef51`.

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
