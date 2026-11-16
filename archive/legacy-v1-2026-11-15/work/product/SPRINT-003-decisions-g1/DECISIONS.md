# SPRINT-003 lane decisions — PROD-ACC-g1 (product owner, generation 1)

Date 2026-11-06. Assignment: accept/revise/revert per lane + four ordered decisions.
Base for all three lanes: `b4e8321e782a4debc55e58a6c7b123e86dd1047a`. `origin/main` = `12cc0e242bc2038be26ef7334ec1a945c3155181`.

Verified heads (read back locally, `git rev-parse`, and present on `origin`):

| lane | branch | head | entry chunk measured | source of reading |
| --- | --- | --- | --- | --- |
| BELT-001 g1 | `rw/belt001-g1` | `5eb4be6f2c9c661789bf934efb1678202941a7a7` | 232673 B (full variant, QA) / 233175 B (`rev-belt001-g1/dist`) | coordinator-quoted + worktree `dist` |
| UI-002 g1 | `rw/ui002-g1` | `b5940c8d95ac909c10f42cb897bf4c1ae2287930` | 231353 B | `ui002-dev/dist/assets/index-Cy798ZOB.js` |
| ART-003 g1 | `rw/art003-g1` | `7f934cf` | 232337 B | `art003-dev/dist/assets/index-BZYYwOmt.js` |

`4789d3a` is **not a valid object** (`git cat-file -t 4789d3a` → "Not a valid object name"), so any number attached to it is treated as unverified worker text and is not cited below.

**Evidence limitations (recorded, not smoothed over).**
1. No lane handoff exists: `work/development/handoffs/{BELT-001-g1,UI-002-g1,ART-003-g1}.md` and `work/review/BELT-001-g1/QA.md` are absent from the object store and from all five worktrees (`git log --all -- <path>` returns nothing). The surviving instruments are `work/feedback/belt001-harness.json` (identical in `belt001-dev` and `rev-belt001-g1`), `work/development/UI-002-g1/measure-ui002.txt`, `docs/evidence/2026-11-06-art003-census-{before,after}.json` and the `tests/**` that pin the same numbers. Process fix for the next sprint: a candidate is not `ready` until its handoff is committed in the same commit chain.
2. `belt001-dev` and `art003-dev` carry **uncommitted** modifications (`belt001-dev`: `src/game/simulation/commands.ts`, `tests/simulation/belt.test.ts` — the `moveMachine` `run === undefined` guard; `art003-dev`: `src/game/renderer/scene.ts`, `tests/renderer/scene-draw.test.ts`). The immutable candidate is the *commit*, so all byte numbers must be re-measured from a clean build of the integrated SHA by the release lane.
3. Three entry-chunk readings exist for the belt lane (232673 / 233175 / and the cost-only 231076). They are not reconciled. One of them (233175) is already **over** the 233000 B ceiling, so the ceiling question is not hypothetical.

---

## D-1 — BELT-001 g1 bench criterion: **(a) integrate the `beltCostPerTile`-only variant as the g1 candidate; per-tile latency moves to g2. The 10 % criterion is not revised.**

**Verdict per lane: REVISE** (candidate chain changes; the lane is not reverted, not rejected).

Why (a) and not (b) or (c):

* The 10 % line is **pre-armed in two places** — acceptance row B-5 and the §Assignment-3 fallback ("ship the cheaper variant (price folded into `latency`, no `run` field)" with the developer's own 2-point estimate). Taking the pre-registered fallback is the cheapest honest move and keeps every future 10 % reading comparable.
* (b) — revising 10 % → 20 % after seeing 17.5 % — un-falsifies the criterion. B-5 was fixed *before* implementation exactly so that the number could not be negotiated afterwards. The failed reading stays on the record below.
* (c) — rejecting the lane — wastes work that measurably passes: `belt001-harness.json` prints distance-dependent prices for five machine/tile pairs (3/2/2/4/9 scrap), the removal row (price 9 → returned 8 at 90 %), the numbered shortfall with no state change (`revisionMoved: 0`, `routesAfter: 0`), and the save row (`eede3c4f`, `schemaVersion 1`, `byteIdentical: true`, 18 routes with `run` undefined replaying at `latency` 5).

The real tradeoff, in bytes, is why (a) also wins on capacity. Deltas are relative to the recorded base 231878 B and summed as if integrated (the release lane must confirm on one clean build):

| variant | belt Δ | + ART-003 (+459) | + UI-002 (−525) | projected merged entry | headroom under 233000 |
| --- | --- | --- | --- | --- | --- |
| full (`run` + per-tile latency) | +795 | +459 | −525 | ≈ 232607 B | ≈ 393 B |
| cost-only (price in `latency`) | −802 | +459 | −525 | ≈ 231010 B | ≈ 1990 B |
| unattributed third reading | +1297 | +459 | −525 | ≈ 233109 B | **−109 B (over)** |

393 B is not a budget: `BELT-001 g2` (belt sprites in `scene.ts`) and ART-003's own follow-up each need more than that. The cost-only variant buys ~2 KB and still ships the player-visible part (the price of a connection now depends on its length, which is what row B-1 prints).

**Failed measurement kept on the record (do not delete):** B-5 12 h offline bench moved **17.5 %** against a pre-armed ceiling of **10 %** → **FAIL** for the full variant. Cost-only variant: **+4.3 %** → PASS. The 17.5 % is not attributed to a line of code; the working hypothesis is the `run` array itself (per-route tile arrays carried in `SimState`, re-walked on `machine.move`), which is precisely what the cost-only variant deletes. g2 must print the bench per variant so the cause is attributed rather than assumed.

**Required follow-up fixes on the accepted candidate:**

1. **`DEF-008`** — *priced-route refund after a save round-trip is untested.* QA labelled this "DEF-007 (decodeRoute drops the optional `run` field so the price is not refunded on load)"; the ledger already has `DEF-007` = team-board CRLF staleness, so the new row is `DEF-008` with "filed by QA as DEF-007" in its reason. Mechanism as literally stated **does not reproduce** at `5eb4be6`: there is no `decodeRoute` function — `decodeSave()` is `JSON.parse` + `validateSim` (save.ts:85-105) and `validateSim` checks `run` (save.ts:199-207). Direct probe on the lane worktree (`work/product/SPRINT-003-decisions-g1/probe-def007.mjs`): `AFTER_CONNECT run=[2,1,0] latency=6 paid=33` → `AFTER_LOAD run=[2,1,0] scrap=267` → `AFTER_REMOVE refund=3 expected=3`, i.e. the run survives and the refund is non-zero. The **real** gap is that the suite never covers it, and that both refund sites (`commands.ts:345` dismantle, `commands.ts:456` remove) compute from `route.run?.length ?? 0`, so any run-less route returns 0 — correct for genuinely pre-price routes (the base `connectRoute` charged nothing) but silently wrong the moment a priced route is ever stored without its run.
2. **The exact assertion QA asked for** — one new case in `tests/simulation/belt.test.ts`, named `refunds the same scrap for a priced link before and after a save round-trip`, using the probe's own fixture (sorter@0, furnace@8, one scrap filter, 300 scrap purse, run length 3):
   * `expect(back.payload.sim.routes[0].run).toEqual(pre.routes[0].run)` and `expect(back.payload.sim.routes[0].run).toBeDefined()`;
   * load itself is neutral: `expect(back.payload.sim.store.scrap).toBe(pre.store.scrap)`;
   * after `route.remove`: `expect(sim.store.scrap - before).toBe(Math.round(TUNING.dismantleRefundPct / 100 * TUNING.beltCostPerTile * 3))` → literal **3**, and `expect(afterLoadRefund).toBe(inSessionRefund)`;
   * documented fallback for a pre-price route decoded from the v1 fixture (`run === undefined`): `expect(refund).toBe(0)` with no throw.
3. One clean-build byte row for the integrated SHA (all three current readings are from different trees).

**Alternatives considered:** (b) prospective 10 %→20 % revision; (c) reject lane; plus "accept the full variant with a 393 B margin".
**Dissent recorded:** the belt harness prints `dropClause.fired = false` and `leads: {compact: 2, spread: 1}`, i.e. the developer reads B-2 as passing. I read it as failing on the primary pattern — see D-2. Both readings are on the record.
**Revisit trigger:** if the cost-only variant's own bench moves >10 % against `b4e8321`, the lane is reverted to `b4e8321` and re-scoped as one 2-point slice.

---

## D-2 — The recorded negative strategy result (B-2)

**What was measured.** `work/feedback/belt001-harness.json` → `layouts.patterns.irregular`: batches 2324 vs 2335, `starvedMax` 80/81, `starvedMean` 52/54, `inputStallPct` 134.9/134.8, `powerLimitedRounds` 394/339, `minPowerRatio` 0.615/0.615 — every one of those gaps is *below* its own MMG (3 / 3 / 3 / 900 / 200 / 0.25). Exactly one column has a leader, `creditsPer1000Batches` 7153.2 vs 6608.1 (+545, 7.6 %, ≥3 % and ≥100), and that leader is `compact` in both patterns.

**Plain statement.** On the primary scored pattern the spread yard leads **no** column, so this slice **adds pricing without producing a second viable plan**. The hypothesis "priced connections create competing plans" is therefore **not supported at the shipped tuning** (`beltCostPerTile` 1, `beltLatencyPerTile` 2, 8 machines, 17 links, 12 h): a price of 1 scrap/tile changes a money column and nothing else. The pre-armed drop clause applies — ship the price change alone, record the negative, do not re-score with a new column set. (`gap6` is a second pattern, not a second column set; it does exist and shows `spread` taking `inputStallPct` 204 vs 100.1, which is the one hint that extent — not price — is where the difference lives.)

**Smallest experiment that could falsify or confirm it.** One file, no code change: 4 harness runs of the committed `scripts/probe-belt.mjs` on the **existing** `irregular` pattern, existing 7 columns, same seed, sweeping only the `TUNING.beltCostPerTile` row over `{0, 1, 2, 4}`.
Reads: `cost 0` must equal the pre-change baseline (instrument check). If any column gains a second leader as the price rises, the hypothesis is confirmed and the price is decision-relevant. If the leader set is unchanged across all four (or the only effect is more `route.connect` refusals), it is falsified for the current map and plan set, and the design response is to make extent a **timing** consequence (`beltLatencyPerTile`, the g2 item) rather than a bigger number. Cost: 4 printed rows. This stays inside the drop clause because the column set does not change.

**Alternatives considered:** adding a 9th column (rejected — the clause forbids re-scoring); a bigger/longer layout (rejected — more compute, same information).
**Dissent recorded:** the developer's harness aggregates `leads` across two patterns and reports `fired: false`. My reading uses only the primary pattern, per the clause. If the release lane prefers the aggregated reading, the negative result must still be printed in the same row, because 6 of 7 columns are inside noise either way.
**Revisit trigger:** the first bench where a column other than `creditsPer1000Batches` changes leader between the two layouts.

---

## D-3 — One ordered list for the developers (art/UI), ranked against the entry-chunk ceiling question

Ranking rule used: (1) does it change what a player can read at a glance, (2) does it gate other work, (3) byte/tap cost. Simulated-persona rows are not treated as comprehension evidence.

| # | item | why here | measured anchor | owner |
| --- | --- | --- | --- | --- |
| 1 | **Plate floor: kill the dead-black band** (plate floats, three-strip composition) | Biggest single change to the read of the screen; everything else is decoration on top of a flat black band. | `art003-census-after.json`: bucket-0 share **96.9 %** (was 96.4 %), `twoDarkestSharePct` **97.5** (was 97.4) — the pass left it marginally worse. `contactShadowPx` 248 → 449 proves the shadow step works already. | `art003` lane, `scene.ts` |
| 2 | **Prove the silhouette pass, don't restate it** (machines known only by their printed digit) | It is the falsification instrument for the whole ART-003 hypothesis *and* it gates `BELT-001 g2`, which needs `scene.ts`. | The census sheet `matrix` is **identical in all 15 pairs** before/after (90.4 / 58.3 / 42.9 / 34 / 11.6 / …) while `slice-sheet-silhouette.png` grew 9941 → 13503 B — so the after-matrix row is stale, not a null result; `tests/renderer/silhouette.test.ts` computes the real matrix in-test (`A3-1 measured …`). And `machineBodySharePct` **fell 0.52 → 0.40**, so A3-4's "machine ink rises" half is unmet. | `art003` lane, `scripts/art003-census.mjs` + A3-4 rows |
| 3 | **Gravel below machinery in salience** | Cheap and mechanical once (2) prints per-layer shares. | `GRAVEL.length` already halved 72 → 36 (pinned in `silhouette.test.ts`); the census has no per-layer share row yet, so "out-salient" is currently unmeasured. Require: gravel ink share < machine ink share, printed. | `art003` lane |
| 4 | **Third pill prints `Store 900/900`** (missing separator) | One string key, ~10 B, same file the lane already touches. | `measure-ui002.txt` chips: `"Store900/900"` in all four cells. | `ui` lane, `src/game/content/strings.ts` |
| 5 | **Empty third card row renders as a lighter ellipsis box** | Last because it is the least visible, but note it still consumes the margin on the deepest cell. | `.objective__row` at ts2: `sh0/ch0` (empty, `sw0/cw0`) and `element separations [0,0]`; deepest cell is **41.8 %** against the 42 % cap — 0.2 pt of margin, so deleting the empty node also protects D-1's closure. | `ui` lane, `src/ui/{Hud,Panels}.tsx` |
| 6 | **Entry-chunk ceiling: keep 233000 B, do not raise it this sprint** (decision, not a task) | 233000 is the only absolute number that correlates with first-paint on a phone; the merge is already inside it *if* the cost-only belt variant ships (≈ 231010 B), and the raise is unnecessary. Raise it once, deliberately, from the first integrated build that actually exceeds it, with the printed byte table attached. | base 231878 → 12cc0e2 231943 (deployed) → projected merged ≈ 231010 (cost-only) / ≈ 232607 (full) / 233175 (unattributed reading, over). | release lane |

**Ready queue for this sprint (≤5, ≤3 workers, prospective):**
R1 belt lane — cost-only variant + `DEF-008` assertion + bench-per-variant print (1 day). R2 art lane — items 1-3 in one pass, one commit, census regenerated (1 day). R3 ui lane — items 4-5 in one pass (half day), then U-1 five-cell harness re-run.
Nothing else from the deferred list is promoted; `C1..C5`, audio, `OPS-101/102/103` activation and the atlas migration keep their existing homes.

**Alternatives considered:** ranking the Store separator first because it is trivially cheap (rejected — cheapest-first ordering optimises the changelog, not the screen); raising the ceiling to 235000 B now (rejected — no integrated build has failed yet).
**Dissent recorded:** the UI harness's own `persona` block is a machine restating machine numbers (`persona/sim agreement` all true); I do not count U-6 as comprehension evidence, so item 5 keeps a low rank purely on the printed geometry.
**Revisit trigger:** the first integrated build whose entry exceeds 233000 B, or a re-run census where the sheet matrix still equals its own before-copy.

---

## D-4 — Sponsor inbox ask: **satisfied by the current pipeline**

Ask (verbatim): "Please make sure we are making feature branches, merging on mina via github." (`mina` = `main`).
Receipt `work/sponsor/intake/SPONSOR-20261106141155404-3e33b40b.json`, already `incorporated`, decision `work/product/SPONSOR-20261106141155404-3e33b40b-decision-g1.md`.
**Home ticket: `OPS-101`** (owns the `rw/` feature-branch flow and the verified-push helper), with `OPS-103` as the publication-path link and `BLD-001` as the demonstrated slice — exactly the three IDs the receipt already carries. No new ticket is created by this ask.

Evidence it is operative now: `git branch -a` shows `origin/rw/belt001-g1 → 7f934cf…`-equivalent exact heads for all three lanes (`5eb4be6`, `b5940c8`, `7f934cf`), i.e. each lane pushed its own branch from its own worktree; `origin/main` advanced `887b5bc..12cc0e2` with `ci` run **42231570081** and `delivery` run **42231679008** success, plus the served-byte check in `work/releases/REL-007-g1.md`. The three lane heads are **pushed but not yet merged** — merging them is the release lane's step in the same path, not a new one.
One housekeeping item for the release lane (not my file): the working-copy `SPONSOR_INBOX.md` still shows the acknowledged line while the receipt records `remaining_text: ""`; reconcile per `docs/SPONSOR_INBOX.md` §Concurrent edits, without force.

**Alternatives considered:** opening a "branches" ticket (rejected — OPS-101 already carries the clause).
**Dissent recorded:** none.
**Revisit trigger:** a lane head that exists only in a local worktree (no `origin` ref) at integration time.

---

## Ledger rows I want (release lane owns `work/backlog.json`, `work/BOARD.md`, `README.md` — I did not edit them)

1. `BELT-001` **new**, type `feature`, P1, 5 points, generation 1. `candidate_sha` = the cost-only variant commit (TBD by the belt lane); `history` note "5eb4be6 superseded by the pre-armed fallback: B-5 bench 17.5 % vs 10 % ceiling"; `review_verdict: revise` on `5eb4be6…`, then `accept` on the new SHA once B-5 reads <10 % and the byte row is printed.
2. `BELT-001` g2 **new**, type `feature`, 2 points, depends on `ART-003`: per-tile latency (`beltLatencyPerTile * run.length` visible on the belt), belt sprite presentation in `scene.ts`, one attributed bench row per variant.
3. `ART-003` **new**, type `feature`, P1, 5 points, `candidate_sha 7f934cfe5ce540b24710156037e011be5b2323f1`, `review_verdict: revise`. Reasons in `history`: A3-1 after-matrix equals its own before-copy (9941 → 13503 B PNG proves the sheet changed); A3-4 half-met (grid 0.53 → 0.01 %, machine ink 0.52 → 0.40 %); plate floor still 96.9 % in bucket 0.
4. `UI-002` **existing** (`triaged`) → move to `review` with `candidate_sha b5940c8d95ac909c10f42cb897bf4c1ae2287930`, `review_verdict: accept`. `history` reason must name the two open rows: U-4's node-row probe printed `rows 0 / lastRow null` (inconclusive instrumentation) and U-6 is machine agreement, not human comprehension.
5. `DEF-008` **new**, defect, P2 — priced-route refund after a save round-trip is untested; `run` survives at `5eb4be6` (probe rows above); assertion list in D-1. Reason field carries "filed by QA as DEF-007".
6. `DEF-009` **new**, defect, P3 — pill prints `Store900/900` with no separator between label and `units/capacity`.
7. `DEF-010` **new**, defect, P3 — an empty `.objective__row` renders as a lighter ellipsis box at text scale 2 and eats 0.2 pt of the 42 % cap in the deepest cell.
8. `OPS-103` — append one line to `history`: sponsor ask `SPONSOR-20261106141155404-3e33b40b` confirmed satisfied by the branch/PR path; `OPS-101` unchanged; local inbox text still needs reconciliation against `remaining_text: ""`.

Files in this folder: `DECISIONS.md` (this file), `probe-def007.mjs` (round-trip/refund probe, exit 0), `measured-rows-g1.json` (the numbers cited above in machine form).
