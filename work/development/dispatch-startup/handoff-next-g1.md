# Implementation handoff — next slices (startup-code-audit, generation 1)

Base for every lane: `main = b4e8321e782a4debc55e58a6c7b123e86dd1047a`. Baseline gates (my run): 283 tests / 27 files, typecheck clean, validate 0 violations. Each lane below owns disjoint files, so three developers can run them in parallel and the release engineer can integrate them one at a time.

**Reconciliation with the published plan.** The product-owner lane (`work/product/dispatch-startup/`, same base SHA) already numbers these lanes `ART-003` / `UI-002` / `BELT-001 g1` with per-lane acceptance rows fixed in advance; this handoff is the audit-side detail for those IDs, not a competing plan. Mapping and one ownership correction:

- Lane A == `ART-003`; Lane B == `UI-002` (its U-1/U-4 rows already absorb `D-1` and `UI-001`, so nothing here should be implemented as a separate ticket); Lane D.1 == `BELT-001 g1`, Lane D.2/D.3 == `MOVE-001`.
- **BLD-001 rides inside `UI-002`**, because that lane owns `src/ui/text.ts` (see `assignments.md`, Assignment 2). The two other files `6b5cee4` touches (`tests/simulation/fork.test.ts`, `tests/ui/fork-ui.test.tsx`) are also in that lane's list, so a single cherry-pick of `6b5cee4` into the `ui002-g1` branch is the cheapest path and no extra lane is needed.
- My N-1/N-2/N-3 (audit `audit-g1.md` §4) are **proposed extra rows for `UI-002`** (call them U-8/U-9), and my N-4/N-5 are the already-planned `MOVE-001` content with the missing facts attached: `machine.move` has no call site and no test today, and `dismantleMachine` currently refunds 100 % with no penalty.
- One numeric correction for whoever runs the gates: the entry-chunk budget quoted in `assignments.md` (231878 B under a 233000 B ceiling) was measured at `d7af68a`; `b4e8321` adds only docs/tooling, so the same numbers still apply — but re-print `dist/assets` byte counts per lane rather than reusing the base line.

**Best next implementable improvement: ART-003 (the silhouette-first world slice).** It is the only candidate that moves the owner's loudest complaint ("the game looks like total trash") inside one bounded change, it is already specified by an independent reviewer (`work/review/ART-002/ART-002-g1.md`, experiment E1) and confirmed by my own inspection of the same captures, and it touches only the two renderer files plus captures — no save, no engine, no chrome numbers to re-record.

---

## Lane A — ART-003 "silhouette-first world" (recommended, primary)

**Player problem.** At phone size the opening yard reads as a dotted grid with pale boxes: the eye finds the dot noise first, machine kinds are not separable without the printed tile number, and nothing in the frame says where the light comes from or what is standing on the ground.

**Hypothesis.** Hand-composed silhouettes for the five opening parts, one light direction (a 2-step facet per body) and a contact shadow under every footprint will let a reviewer name furnace / sorter / mill from a 390 px crop without labels, without touching footprint or state schemas.

**Scope (write ownership).** `src/game/renderer/sprites.ts` (per-blueprint `PARTS` rows), `src/game/renderer/scene.ts` (facet + contact-shadow pass, `GRAVEL`/`FLOOR_KIT` density on the twelve empty cells), regenerated captures via `scripts/capture-style.mjs` / `scripts/capture-clip.mjs` (`docs/screenshots/slice-*.png` + provenance JSON), one new test section in `tests/renderer/scene-draw.test.ts`.

**Non-goals.** No new `PALETTE` keys (reuse existing indices so `groupFill` keeps its paint-group count and the palette census stays byte-stable). No new panel, no chrome-cap decimal chasing, no audio change, no save-schema change, no new blueprint or recipe.

**Acceptance (all on the candidate SHA).**
1. Blind naming: from a 390-px-wide crop, two reviewers name furnace / sorter / wire mill without labels, target >= 4/5 each; record the crops.
2. Grayscale silhouette separation: the pairwise differing-pixel fraction between machine footprint masks does not fall below the value recorded in `tests/renderer/scene-draw.test.ts` (the >= 12 distance assertion), and the five fallback blueprints each gain at least one row that no other blueprint paints.
3. One light direction: inside one machine body box there are >= 3 luminance steps (body light / facet mid / facet dark) where today there is 1, and every static footprint (dock, five machines, wreck) has a shadow row in its `PARTS` table — asserted by name, not by eye.
4. Existing witnesses stay green: `npm test` >= 283 with no assertion weakened, `tsc --noEmit` clean, `npm run validate` prints the same behaviour line (`firstDrone=268 firstResearch=478 tick=18298 …`), `npm run build` exit 0, no-scroll and >= 44 px faces unchanged (they are css-side and untouched), `node scripts/team-board.mjs --check` exit 0.
5. One short real clip (the existing 250 ms / 26-frame flow) re-captured on the candidate, with distinct-frame count >= the recorded 26/26.

**Falsified if** the grayscale crops still collapse to one box type; or the facet/shadow pass drops any recorded contrast/inventory number below its stored value; or any tap face moves more than 2 px (footprint discipline broken).

**Rollback / save impact.** Presentation only: `schemaVersion 1` and the `eede3c4f` fixture unchanged, no command or engine change, so an old save loads in the new build and the previous release directory stays the rollback target.

---

## Lane B — UI-002 panel rows line up (cheap, same publication window)

**Player problem.** The most-opened panel (Yard store) prints its numbers under the wrong labels: `20/900` lands under `Scrap 20` while `Capacity` sits alone on the right, and the last line is cut mid-sentence (`…0 of 8 units requested`). Evidence: `work/review/dispatch-startup/captures/ds-360-ts2-panel-store.png` (my own inspection) and `src/ui/Panels.tsx:245-300` + `src/ui/styles.css:335-341`.

**Hypothesis.** Making every `dl` row exactly one grid item (`.panel dl > div { display: contents }`, or a per-row two-column grid) aligns label/value pairs in all panels at once, because the misalignment is caused by mixing bare `<dt>/<dd>` children with `<div>`-wrapped rows in one two-column grid.

**Scope.** `src/ui/styles.css` (the `dl` rules), `src/ui/Panels.tsx` only if a row needs the wrapper normalised (`StorePanel`, `ReturnReportPanel`), one jsdom case in `tests/ui/*`.

**Non-goals.** No new panel, no change to the 42 % card cap, no wording changes beyond dropping the duplicate capacity fact (finding N-2), no dock layout change (N-3 may ride along only if the dock label table is already in the touched file).

**Acceptance.** At 360x640 ts1 and ts2, for every row of the opened Store panel: the `dt` and its `dd` share the same line box (`dt.top == dd.top` within 1 px) and `dd.left > dt.right`; the last painted line is fully visible inside `.panel__body` (`scrollHeight <= clientHeight` or the body scrolls with a visible target); `20/900` appears exactly once; page `scrollHeight == innerHeight` unchanged; the four recorded chrome-cap cells unchanged (16.7 / 40.8 / 10.6 / 31.0 %).

**Rollback / save impact.** CSS/jsdom only; no save impact.

---

## Lane C — BLD-001 recovery (already implemented, integrate it)

- Candidate `6b5cee4f4fcc1bfe9c9703a5ad1df18ed06c4949` (branch `bld001-g1`, worktree `…/fe4e05/polish001-dev`): paints the dock fork row **cheapest-first** so a blind leftmost tap reaches an affordable plan. Files: `src/ui/text.ts`, `tests/simulation/fork.test.ts`, `tests/ui/fork-ui.test.tsx`, plus `scripts/measure-bld001.mjs` and `scripts/probe-save-bld001.mjs`.
- My verification at this base: `npm test` in that worktree = **284 tests / 27 files passed**; `git apply --check --3way` of `git format-patch -1 6b5cee4` onto main `b4e8321` = exit **0** (three files, clean).
- Live confirmation the defect is still open: my own `npx tsx scripts/measure-chrm002.mjs` run against the served artifact printed the fork row as `Faster batches 40 credits` then `Less power 30 credits` with a 30-credit purse.
- Handoff action: the release engineer cherry-picks `6b5cee4` (or applies the patch) onto current main and re-runs the four gates; no re-authoring needed. Prices, ids and the committed branch are untouched, so the STRAT-003 priced-fork sentences still hold.

---

## Lane D — next sprint, from the sponsor's new inbox text (needs a product call first)

The uncommitted `SPONSOR_INBOX.md` block asks for exactly what the code half-supports:

1. **LOG-001 tile-chain logistics.** Today `drawRoutes` (`src/game/renderer/scene.ts:506-538`) paints one straight segment per route with amber tokens. Propose the first bounded step only: paint an existing route as the **stepped tile chain** between its two endpoints (the cells are already 6x6 of 32 units) with the tokens walking that chain, keeping `latency`, `items` and the save format identical. Second step (later ticket): a real belt blueprint that owns cells.
2. **LOG-002 wire the existing move command.** `machine.move` already exists (`commands.ts:105-107`, `moveMachine`) with **no UI call site and no test**. Mirror the existing build-mode machinery (`buildBlueprint` + `ghostTile`, `App.tsx:429-445`): a `Move` button in `MachinePanel` sets a `moveTile` ghost, the next canvas tap dispatches `machine.move`, `validTile` already rejects occupied/blocked cells. Add one jsdom case (move changes `machine.tile`, keeps `id`, level, branch and the two route ids; a blocked tile returns `blocked-placement`).
3. **LOG-003 dismantle cost.** `dismantleMachine` refunds 100 % of build cost + tray + input buffer with no penalty. Propose a single named `TUNING.dismantleRefund` ratio (e.g. 0.8) applied to the build cost only, printed on the button face (`Dismantle +16` style), tray and buffer still refunded in full so material is never destroyed. Needs a product decision on the ratio and one new save-checksum note, so it is a follow-up ticket, not part of Lane A/B/C.

All three keep `schemaVersion 1` compatible if the added fields stay optional; state that in the candidate receipts.

## Suggested order

C (15-minute integration) → A (primary art milestone) → B (pairs with A in one publication) → product call on D1/D2/D3.
