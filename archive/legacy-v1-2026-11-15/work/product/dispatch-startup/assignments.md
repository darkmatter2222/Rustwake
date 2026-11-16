# Three independent assignments (base `b4e8321e782a4debc55e58a6c7b123e86dd1047a`)

Non-overlapping ownership is a hard rule: no path appears in two lanes, and no lane edits a shared ledger (`work/backlog.json`, `work/BOARD.md`, `board.html`, `README.md`) — those belong to the release engineer lease. Each lane works in its own worktree/branch, runs `npm run typecheck && npx vitest run && npm run validate && npm run build`, and returns a handoff with real exit codes plus its own entry-chunk byte delta (base: `assets/index-DGy53fNu.js` 231878 B, ceiling 233000 B).

Baseline measured by this pass at `b4e8321`: `npx vitest run` **283 passed / 27 files**, exit 0 (4.49 s); `dist/assets` = `index-DGy53fNu.js` 231878 B, `index-9FriNULu.css` 7474 B, `tables-BB2NPvQ2.js` 9298 B, `catchup.worker-G_Jyr7uh.js` 13406 B; `git diff --stat d7af68a HEAD -- src` is empty, so the deployed artifact `rustwake-d7af68a` and this base carry the same `src`, and every row below is scored against the same numbers.

Stop condition for every lane: one coherent candidate commit chain, its evidence files, its handoff, then stop. No forever loop, no drive-by edits in another lane's files, no push to `main`.

---

## Assignment 1 — ART-003 g1 "silhouette-first world pass" (developer-art, 5 points)

Branch `art003-g1`. Write ownership (exact):

- `src/game/renderer/sprites.ts`
- `src/game/renderer/scene.ts`
- `tests/renderer/scene-draw.test.ts` (restate table-pinned rows with before/after printed)
- `tests/renderer/drone-leg.test.ts` (keep green; extend only)
- `tests/renderer/silhouette.test.ts` (new)
- `scripts/capture-style.mjs`, `scripts/capture-clip.mjs` (only if a new crop/step is needed)
- `docs/screenshots/slice-*.png`, `docs/screenshots/role-*.png`, `docs/screenshots/style-slice-provenance.json`, `docs/screenshots/sheet-provenance.json`
- `docs/evidence/2026-11-06-art003-silhouette.json`, `docs/evidence/2026-11-06-art003-clip.json`
- `work/development/handoffs/ART-003-g1.md`

Non-goals: no `src/ui/**`, no simulation/economy/price change, no save-format change, no new blueprint, no audio work, no PNG-atlas migration, no palette expansion beyond `PALETTE`'s existing 17 keys unless a facet step needs one new tone.

Implementation intent (from `work/review/ART-002/ART-002-g1.md` E1 + `docs/DESIGN_BIBLE.md` §Actual assets, §Animation grammar): per-blueprint part tables that carry **shape**, not surface glyphs — furnace = squat chamber + protruding chimney + 2-step amber core; sorter = frame + three visible roller discs + split-chute wedge; wire mill = two reel rings + diagonal tension arm; dock = pad ring + one loading arm; lab = mast + scanner head. One light direction (upper-left lit, lower-right dark) with a 2-step facet on every body and a 1-step-dark contact shadow ellipse under every static footprint (machines, wreck, dock, props). Grid hidden at rest and revealed only during placement/routing. Motion states: furnace amber pulse while `running`, visibly quiet when `paused`, sorter pip row frozen while `starved`, drone keeps the existing eased leg.

Acceptance rows (fixed before implementation):

- **A3-1** grayscale silhouette sheet at dpr1: every pairwise differing-pixel fraction among the six machine footprints exceeds the base-measured value, printed as a matrix in `docs/evidence/2026-11-06-art003-silhouette.json`.
- **A3-2** blind naming from label-free 390 px crops, committed crop manifest included: furnace/sorter/wire mill each named ≥4/5 by two independent raters (QA plus one persona).
- **A3-3** inside one machine box, luminance bands go from 1 to ≥3; a contact shadow is present under all six machine footprints plus wreck and dock; one light direction across sheet and scene.
- **A3-4** at rest the grid's ink share drops versus its base value while machine ink rises; both printed.
- **A3-5** the four existing witnesses still pass on the candidate: `scrollHeight == innerHeight`, minimum tap ≥44 CSS px, 26/26 distinct canvas hashes at 250 ms, 0 pageerror.
- **A3-6** regression floor: `npm run validate` behaviour line **unchanged**, save `schemaVersion 1` and fixture checksum `eede3c4f` unchanged, 283 tests green plus new cases, entry chunk ≤233000 B with the delta printed.

Falsified if: the grayscale crops still collapse to one box type; or the facet/shadow pass drops the recorded palette contrast values (then the shading is wrong, not richer); or tap geometry shifts >2 px. Then revise per the README revisit trigger (atlas hypothesis).

---

## Assignment 2 — UI-002 g1 "the world outranks the text" (developer-ui, 3 points)

Branch `ui002-g1`. Write ownership (exact):

- `src/ui/App.tsx`, `src/ui/Hud.tsx`, `src/ui/Panels.tsx`, `src/ui/text.ts`, `src/ui/styles.css`
- `src/game/content/strings.ts`
- `tests/ui/resting-screen.test.tsx`, `tests/ui/fork-ui.test.tsx`, `tests/ui/hud-layout.test.ts`, `tests/ui/app.test.tsx`, `tests/ui/i18n.test.tsx` (as needed)
- `scripts/measure-ui002.mjs` (new, modeled on `scripts/measure-chrm002.mjs`)
- `work/feedback/UI-002-persona.json`, `work/evidence/UI-002-census-g1.md`, `work/development/handoffs/UI-002-g1.md`

Non-goals: no `src/game/**` edits other than adding/renaming keys in `src/game/content/strings.ts` (it stays import-free and deterministic); no simulation numbers or prices; no new currency, machine, panel or second screen; no page scroll; no change to the 42 % criterion itself; `scripts/measure-chrm002.mjs` stays as the base instrument for comparison.

Implementation intent (§Menus and navigation): the card prints **two** weight tiers, not four equal lines (primary action, then one secondary line that carries the fleet/power figure and the carried shortfall); the dock is the only accent-filled control in its context; panels use full-width rows with consistent spacing and a visible dismiss target; the machine panel gains **Move** (next valid tile) beside the existing upgrade/dismantle pair, each with its printed cost. `BLD-001` rides here: paint the dock faces cheapest-first.

Acceptance rows (fixed before implementation, measured in chromium on the built artifact, not jsdom):

- **U-1** `card.height <= 0.42 * hudContentBox.height` in **five** cells — 360x640 and 390x844 at text scale 1.0/2.0 at 2- and 4-machine depth, plus the 4-machine fork-open frame with one refused tap; `hudContentBox.height` printed in every row. This is also the closure for `D-1` (44.6 %) and keeps `CHRM-001/002` rows unmodified.
- **U-2** hierarchy is measurable: exactly one accent-filled primary per context; the card uses ≤2 font-weight/size tiers; the primary line's computed font size is ≥1.25× the secondary line's; computed `color`/`background` of the pill row and the dock differ by at least two recorded luminance steps. Print the computed styles.
- **U-3** (`BLD-001`) with a 30-credit purse the leftmost fork face is the 30-credit plan and the **first** leftmost tap lands a command (machine level sum increases); the two faces still print two different prices and the same two plan names, so the `STRAT-003` sentences survive.
- **U-4** research panel at 360x640 ts2.0: every node row has `scrollWidth == clientWidth` (no one-word column), the longest label is fully visible, the alternating-cell `dl` artifact is gone, and no page scroll appears.
- **U-5** every overlay closes with its visible dismiss target and with Back/Escape (nearest context first), no popup pile-up, 0 pageerror across sessions.
- **U-6** one simulated persona (labelled as such) writes, from the resting screen only: what the next tap does, the last shortfall as two numbers, and current output — matching the sim read from the same build; the same run on `b4e8321` is the recorded control and the candidate must be strictly better, otherwise the slice is reverted.
- **U-7** floor: minimum face ≥44 CSS px, `scrollHeight == innerHeight`, entry chunk ≤233000 B with the byte delta printed, behaviour line unchanged.

---

## Assignment 3 — BELT-001 g1 "priced, tile-running connections" (developer-sim, 5 points)

Branch `belt001-g1`. Write ownership (exact):

- `src/game/simulation/commands.ts`, `src/game/simulation/types.ts`, `src/game/simulation/engine.ts`, `src/game/simulation/autoconnect.ts`, `src/game/simulation/diagnostics.ts`
- `src/game/persistence/save.ts` (optional-field decode only)
- `src/game/content/defs.ts` (`TUNING` rows only: `beltCostPerTile`, `beltLatencyPerTile`, `movePenaltyPct`, `dismantleRefundPct`)
- `scripts/probe-belt.mjs` (new harness)
- `tests/simulation/belt.test.ts` (new), `tests/simulation/logistics.test.ts`, `tests/simulation/autoconnect.test.ts`, `tests/simulation/cadence.test.ts`, `tests/simulation/fork.test.ts`, `tests/simulation/supply-window.test.ts`, `tests/persistence/save.test.ts`, `tests/content/validate.test.ts`
- `work/feedback/belt001-harness.json`, `work/development/handoffs/BELT-001-g1.md`

Non-goals: **no** `src/game/renderer/**` edits (belt sprites are `BELT-001 g2`, after ART-003 releases `scene.ts`), no `src/ui/**` and no `src/game/content/strings.ts` (reuse existing keys, or print numbers only), no new resource or machine, no splitter/merger/inserter, no third transport class, no parallel-path routing, no new panel, no offline-catch-up algorithm change.

Implementation intent: a connection becomes a priced object with a real extent.

1. `RouteState` gains optional `run?: readonly number[]` (ordered tile indices from a deterministic Manhattan walk: row-major first, tie-broken by tile index) and its `latency` becomes `beltLatencyPerTile * run.length` for belt runs, with the current constant as the pre-`run` fallback so an old save behaves identically.
2. `route.connect` now charges `beltCostPerTile * run.length` scrap from the store (the existing `shortCost` path already reports the numbered shortfall), and `route.remove` refunds `dismantleRefundPct`.
3. `machine.move` charges `movePenaltyPct` of the blueprint's build cost; `machine.dismantle` refunds `dismantleRefundPct` of `buildCost` (today it is 100 % plus tray and input contents — the tray/batch/inBuf contents still return in full, only the build cost is discounted).
4. `autoconnect.ts` keeps proposing plans, but a plan now reports its tile length so the UI can print a price later without a second pass.

Acceptance rows (fixed before implementation):

- **B-1** the same machine pair costs different scrap at different tile distances (printed for at least two layouts), and a removal returns exactly the recorded refund percentage; one tap on a priced connection with an insufficient purse produces the numbered shortfall and no state change.
- **B-2** two deliberate layouts (compact cluster vs. spread yard) each lead on at least one scored column under the `STRAT-002` A1-2v3 per-column minimum-meaningful-gap thresholds (starved max/mean and `inputStallPct` 3 points absolute; batches 900; `powerLimitedRounds` 200; `minPowerRatio` 0.25; `creditsPer1000Batches` 3 % relative and ≥100 units), same seed, same simulated time, belt prices inside the scored set. **Drop clause, pre-armed:** if neither layout leads a column, ship the price change alone, record the negative result, and do not re-score with a new column set.
- **B-3** save compatibility: the v1 fixture decodes and re-encodes byte-identically (`schemaVersion 1`, checksum `eede3c4f`); a save written before this change decodes with `run` undefined and reproduces the same batch counts; the two-branch and three-branch fork saves still decode with their paid ranks.
- **B-4** determinism: `scripts/probe-belt.mjs` output is byte-identical across two runs (hash printed), and the 12 h offline catch-up equals the online run within the existing tolerance test.
- **B-5** gates with real exit codes: typecheck 0, validate 0 with the restated behaviour line and its before/after values, all tests green (283 + new cases), build 0 with the entry inside the ceiling, plus one `tests/perf/bench.test.ts` reading to show the 12 h tick cost moved less than 10 %.

Fallback if B-3 costs more than one rebase: ship the cheaper variant (price folded into `latency`, no `run` field) and record that the visible belt extent is a g2 item. Developer's own estimate for that variant was 2 points; it is a legitimate fallback, not the first attempt.

---

## Sequencing after the three lanes

1. Independent QA reviews each immutable candidate in its own file (`work/review/ART-003-g1-qa.md`, `work/review/UI-002-g1-qa.md`, `work/review/BELT-001-g1-qa.md`), running the harnesses itself; a reviewer does not reuse the developer's script output as its own.
2. Product owner records keep/revise/revert per lane, then the release engineer integrates per file and deploys the merged artifact (one labelled preview, previous release retained for rollback).
3. `BELT-001 g2` (belt presentation, 2 points) takes the first freed slot after ART-003 merges, because it needs `src/game/renderer/scene.ts`; `MOVE-001` (2 points) follows in the simulation lane.

## What is not in these three assignments

Audio work, the 42 % decimal series beyond U-1, the `C1..C5` contrast set, board/README publication, `OPS-101/102/103` activation, atlas/PNG pipeline adoption, expeditions, defense, PvP, monetization. Each has a home in SPRINT-003.md §Deferred or with the coordinator/release lane, and none of them is a child slot in this sprint.
