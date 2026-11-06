# BELT-001 g1 — priced, tile-running connections (developer-sim)

Lane: `rw/belt001-g1`, base `b4e8321e782a4debc55e58a6c7b123e86dd1047a`, worktree
`C:/Users/ryans/AppData/Local/Temp/opencode/belt001-dev`. Spec: `work/product/dispatch-startup/assignments.md`
Assignment 3, rows B-1..B-5 (with the pre-armed B-2 drop clause and the cheaper B-3 fallback).

Tip/history of this branch (verified pushes, helper `scripts/publish-feature.mjs`):

| push | SHA | time (UTC) | what |
| --- | --- | --- | --- |
| 1 | `5eb4be6f2c9c661789bf934efb1678202941a7a7` | 2026-11-06T13:39:34Z | WIP carried over from the interrupted run, as one coherent commit (19 entries: engine price, `run` field, save decode, probe, restated tables) |
| 2 | recorded in `$(git rev-parse --git-dir)/rustwake-publication/rw_belt001-g1.json` and in the lane report | — | finished slice: rewritten `tests/simulation/belt.test.ts`, byte-shrunk engine helpers, this handoff |

Gap between push 1 and push 2: ~50 minutes of implementation (the WIP was committed at 13:39Z,
the candidate lands after the gates below). Both pushes are on `rw/belt001-g1` only; `main` untouched.

## What changed (behaviour)

1. `RouteState.run?: number[]` — the ordered tile indices of a deterministic Manhattan walk
   (`manhattanRun`, `src/game/simulation/types.ts`): row difference first (one whole row per
   step), then the column difference, both endpoints included, so at every corner exactly one
   next tile is legal and no tie ever needs breaking.
2. `route.connect` charges `beltCostPerTile × run.length` scrap (`spendFromStore`, and the
   existing `shortCost` path prints the numbered shortfall); its `latency` is now
   `beltLatencyPerTile × run.length`. A route decoded without `run` keeps the stored `latency`
   (`routeLatencyTicks`) and returns 0 on removal → an old save replays exactly as before.
3. `route.remove` returns `dismantleRefundPct` of the price that connect charged.
4. `machine.move` charges `movePenaltyPct` of the blueprint's own build cost (per item, rounded)
   and re-walks the runs of the *priced* links touching that machine; pre-price links keep their
   stored latency. `machine.dismantle` discounts only the build cost (plus each dropped link's
   belt refund); tray, started batch and input buffer still return in full.
5. `autoconnect.ts` plans now carry `tiles`, so the dock can print a price without a second pass.

`TUNING`: `beltCostPerTile: 1`, `beltLatencyPerTile: 2`, `movePenaltyPct: 50`,
`dismantleRefundPct: 90` (`src/game/content/defs.ts`). `routeLatencyTicks: 5` stays as the
pre-`run` fallback.

## B-1 — price by distance, exact refund, numbered shortfall

Printed by `scripts/probe-belt.mjs` (`work/feedback/belt001-harness.json → prices`) and asserted in
`tests/simulation/belt.test.ts`. One dock↔machine pair type, five tile distances:

| machine | tile | run length | price (scrap) |
| --- | --- | --- | --- |
| sorter | 0 | 3 | 3 |
| furnace | 1 | 2 | 2 |
| copper separator | 3 | 2 | 2 |
| polymer recycler | 10 | 4 | 4 |
| wire mill | 35 | 9 | 9 |

* Removal: the 9-tile link charged 9, returned **8** = `round(9 × 90 / 100)`; the 3-tile link
  returned **3** = `round(2.7)`. The recorded rule is integer rounding of 90 %, so the small
  prices read back as 100 % — stated here so the row is not read as an exact 90.
* Refused tap (purse 22: sorter 20 paid, belt 3 not affordable): `{ok:false, reason:"insufficient",
  need:3, have:2, word:"scrap"}`, `revision` unmoved, `routes` still 0, `JSON.stringify(state)`
  identical before and after (asserted).
* Move: furnace (build cost 10 scrap + 5 ferrous) charged **5 scrap + 3 ferrous**; its link
  re-walked 4 → 11 tiles, latency 8 → 22; the untouched link stayed at latency 6.
* Dismantle: 18 (= 90 % of 20) + 3 (its belt refund) + tray contents in full.

## B-2 — two deliberate layouts on the STRAT-002 A1-2v3 columns (negative rows included)

Same seed, same simulated time (1 800 rounds, both layouts stop at tick 18 298), belt prices
inside the scored set. Rows: `layouts.patterns.{irregular,gap6}.rows` in the harness JSON.

| column | MMG | irregular: compact / spread | leader | gap6: compact / spread | leader |
| --- | --- | --- | --- | --- | --- |
| `inputStallPct` | 3 abs | 134.9 / 134.8 | none (gap 0.1) | 204 / 100.1 | **spread** (103.9) |
| `starvedMax` | 3 abs | 80 / 81 | none (gap 1) | 79 / 81 | none (gap 2) |
| `starvedMean` | 3 abs | 52 / 54 | none (gap 2) | 52 / 54 | none (gap 2) |
| `batches` | 900 abs | 2324 / 2335 | none (gap 11) | 2273 / 2226 | none (gap 47) |
| `powerLimitedRounds` | 200 abs | 394 / 339 | none (gap 55) | 490 / 316 | none (gap 174) |
| `minPowerRatio` | 0.25 abs | 0.615 / 0.615 | none (tie) | 0.615 / 0.615 | none (tie) |
| `creditsPer1000Batches` | 3 % rel **and** ≥100 | 7153.184 / 6608.137 | **compact** (545.047, 8.2 %) | 8146.942 / 5943.845 | **compact** (2203.097, 37 %) |

* Counted over both ladders: `leads = {compact: 2, spread: 1}` → **the pre-armed drop clause did
  not fire** (`dropClause.fired: false`): each layout leads at least one scored column.
* Honest negative rows, recorded and not re-scored: `starvedMax`, `starvedMean`, `batches`,
  `powerLimitedRounds` and `minPowerRatio` name **no** leader on either ladder (gaps 1–174 under
  the floors, one exact tie). The column set is the one STRAT-002 recorded; nothing was re-derived.
* Extent, not luck: both layouts hold 8 machines and 17 links, and the belt spend is **48 scrap**
  compact vs **72 scrap** spread, so the difference is tile extent alone.
* The stored rows reproduce in-process, field for field, from `ladderRow(null, ladder, LAYOUTS[name])`
  (asserted in `tests/simulation/belt.test.ts`).

## B-3 — save compatibility (no fallback needed)

* `docs/evidence/yard-mature.json`: decode ok, `schemaVersion 1`, envelope checksum and
  recomputed `checksum(JSON.stringify(payload))` both **`eede3c4f`**, `validateSim` → `null`,
  `encodeSave(sim, lastSeenMs, settings) === raw` → **true** (byte-identical).
* All 18 decoded routes have `run === undefined` and keep `latency: 5`; the pre-price field list is
  `id,from,to,filter,capacity,latency,items,inFlight,busyTicks,ageTicks` (measured at `b4e8321`).
* Pre-change replay parity, same snippet on both trees (`decodeSave` → `advance(3600)`):
  batches at decode **1 902**, tick **21 898**, batches after **2 356**, links **18**, state hash
  **`1493c153`** — identical on `b4e8321` (worktree `belt001-base`) and twice inside the candidate's
  own process. So the price does not move an old save.
* The two-branch and three-branch fork saves still decode with their paid ranks
  (`tests/simulation/fork.test.ts`, green in the 298-test run).
* A damaged `run` (`"12"`, `[1,-2]`, `[1.5]`) is refused as `routeRun:<id>`; a good `[1,2]` validates.

`schemaVersion` stays **1**; no required field was added (`run` is optional, so `JSON.stringify`
drops it while undefined).

## B-4 — determinism

* `npx tsx scripts/probe-belt.mjs` twice: printed FNV `probe-belt checksum 52a20c95` both times and
  file `SHA256 = 58f8bcba…`→ exact: `58F8BCBC1ED1EA46EA88818581B2E2AB35B9BB478A0938ADDFAC3D52491D7514`
  both times (11 063 B). `git status` shows no diff after re-running, so the stored JSON is the
  generated one. The test re-derives the same hash from the imported body (`52a20c95`).
* 12 h catch-up: `tests/simulation/catchup-worker.test.ts` "the shared handler reproduces the direct
  catch-up exactly" (report, `nextLastSeenMs`, tick, credits, `unitTotal` all equal) and the 12 h
  cases in `tests/simulation/offline.test.ts` are green; `tests/perf/bench.test.ts` still asserts
  `tick === 6 + TUNING.offlineCapTicks`.

## B-5 — gates with real exit codes (my tree, this candidate)

| gate | exit | reading |
| --- | --- | --- |
| `npm run typecheck` | **0** | no output |
| `npx vitest run` | **0** | **298 passed / 28 files** (base `b4e8321`: 283 / 27; +15 cases in `tests/simulation/belt.test.ts`), 4.45 s |
| `npm run validate` | **0** | `content: 0 violation(s)`, behaviour line below |
| `npm run build` | **0** | entry `assets/index-jp4qHb0Z.js` **232 969 B** ≤ 233 000 (31 B spare); css `index-9FriNULu.css` 7 474 B, `tables-BB2NPvQ2.js` 9 298 B, `catchup.worker-G_Jyr7uh.js` 13 406 B — all three byte-identical to base |
| `npx vitest run tests/perf/bench.test.ts` | **0** | 12 h tick cost, see below |

Behaviour line — **before** (`b4e8321`, my own run) and **after** (this candidate):

```
before: behaviour: firstDrone=268 firstResearch=478 tick=18298 machines=8 links=18 drones=5 batches=1902 credits=82 nodes=3 | 0 violation(s)
after : behaviour: firstDrone=314 firstResearch=498 tick=18298 machines=8 links=18 drones=4 batches=1932 credits=93 nodes=3 | 0 violation(s)
```

Moved: `firstDrone 268 → 314`, `firstResearch 478 → 498`, `drones 5 → 4`, `batches 1902 → 1932`,
`credits 82 → 93`. Unmoved: `tick 18298`, `machines 8`, `links 18`, `nodes 3`, and the ladder
fixture checksum `eede3c4f`. Reading: the same yard now pays scrap per tile for its links, so the
purse reaches the same milestones a few rounds later and buys one spare drone fewer inside the
half hour — the ladder is 30 batches richer because priced links settle the pull cadence.

12 h bench (median of 3, `bench 12h starter yard (4 machines, tick-by-tick)`, isolated file runs):

| tree | run 1 | run 2 | run 3 | median |
| --- | --- | --- | --- | --- |
| base `b4e8321` | 41.18 ms | 45.05 ms | 43.89 ms | **43.89 ms** |
| this candidate | 42.75 ms | 41.04 ms | 43.30 ms | **42.75 ms** |

Δ = **−2.6 %**, inside the ±10 % row. (One reading taken inside the full 28-file run said 68.15 ms;
that is the contended-parallel number, not comparable, and is recorded only for completeness.)

Entry chunk: base **231 878 B** → candidate **232 969 B** = **+1 091 B**, inside the 233 000 B
ceiling with **31 B** spare.

## Files touched by this lane

`src/game/simulation/types.ts`, `src/game/simulation/commands.ts`, `src/game/simulation/autoconnect.ts`,
`src/game/persistence/save.ts`, `src/game/content/defs.ts` (four `TUNING` rows),
`scripts/probe-belt.mjs` (new), `tests/simulation/belt.test.ts` (new), `tests/simulation/probe-belt.d.ts`
(new type surface for the probe), restated `tests/simulation/{autoconnect,cadence,chain,fleet,fork,logistics,rate-window,supply-window}.test.ts`,
`tests/content/validate.test.ts`, `tests/ui/resting-screen.test.tsx` (see the overlap note),
`work/feedback/belt001-harness.json`, `work/development/BELT-001-g1/{HANDOFF.md,numbers.mjs}`.

## Limitations / notes for QA and the release engineer

1. **Bundle ceiling is the real risk in the merge, not in this lane.** This lane alone leaves 31 B
   under 233 000 B. ART-003 and UI-002 also add bytes, so the merged entry will pass the ceiling only
   if the release engineer re-measures after integration and, if it breaks, trims in one place.
2. `tests/ui/resting-screen.test.tsx` is listed under Assignment 2 but its pinned literal line had to
   move with the price (`Last need 25 scrap` → `Last need 3 scrap`, the first refused tap is now the
   3-scrap belt). Integrated per-file, that single literal may need the same one-line restatement in
   the UI lane's version; the two files are otherwise identical in intent.
3. No renderer work, no `src/ui`, no `strings.ts`, no new machines, no third transport class, no
   parallel-path routing: the belt sprites stay `BELT-001 g2`, so the visible extent (how many tiles
   the line crosses) is still a presentation item; the model already carries `run`.
4. `move` re-prices only the link *latency* of touched links; the scrap difference of a
   lengthened run is charged on the next connect, not retro-actively — the move penalty itself is
   `movePenaltyPct` of the build cost, as specced.
5. `manhattanRun` is the row-major-first walk with both endpoints included, so two adjacent tiles
   run over 2 tiles (price 2). Every price in this lane is `1 × tiles`; `dismantleRefundPct` is
   applied with `Math.round`, which is why a 9-scrap link returns 8 and a 3-scrap link returns 3.
6. `scripts/probe-belt.mjs` writes `work/feedback/belt001-harness.json` on import as well (the test
   imports it for the in-process ladder); the bytes are identical, so the tree stays clean.
7. Comparison worktree `C:/Users/ryans/AppData/Local/Temp/opencode/belt001-base` (detached `b4e8321`,
   `node_modules` as a junction) was created for the base readings and removed again after the
   measurements above.
