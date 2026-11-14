# RW3D T14 (#141) — road traffic: path cost, bay queues, stuck recovery

Role: developer. Issue: #141 (parent #123, master #121). Specs: TECHNICAL_CONTRACT.md,
EXECUTIVE_CONTRACT.md, ACCEPTANCE.md E04 (transaction integrity under blocked roads)
and E05 (measured throughput), AGENT_EFFICIENCY.md. Branch: `rw/141-road-traffic`.
Draft PR: linked on issue #141. Dependencies #139 (T12) and #140 (T13) are merged
and accepted at base `480722b`.

## Heads

| What | SHA |
| --- | --- |
| Base (origin/main) | `480722b58e541a6324238e331bdb307984930423` |
| Commit 1 — traffic core + logistics integration + simulation tests (WIP checkpoint) | `36a46da1fa98379c1dd2e92685cff96a4aa82b87` |
| Commit 2 — TrafficApi store slice + step() wiring + store contract tests | `933f82d59d65f8a893f4d406b43a6e9e200490c0` |

All four gates below were run once at code head `933f82d` on the exact working
tree that was committed. This evidence document is a docs-only commit on top of
that head; it cannot affect gate results. The PR handoff SHA is the final head
including this document.

This was a bounded continuation: the prior developer session left uncommitted
WIP at the turn cap. Commit 1 checkpoints that WIP verbatim; commit 2 completes
the one unfinished piece (the store slice implementation and `step()` wiring)
and adds the store contract tests. No working simulation code was redesigned.

## Implementation summary

- **`src/game/simulation/traffic.ts` (new, 391 lines)** — an opt-in, session-only
  traffic authority. Pure functions over an explicit `TrafficState`; integer
  ticks only; no DOM, wall-clock or randomness. `TRAFFIC_SCHEMA_VERSION = 1`,
  `TRAFFIC_CELL_COST = 1`, `DEFAULT_TRUCK_CONFIG = { speed: 1, loadTicks: 0,
  unloadTicks: 0 }`. Public surface: `createTraffic`, `setDefaultTruck`,
  `configureTruck`, `setBayCapacity`, `setJunctionCapacity`, `setJunctionCost`,
  `setRetryPolicy`, `ensureTruck`, `isJunction`, `cellEntryCost`, `roadPathCost`,
  `travelTicks`, `bayCapacityAt`/`bayLeasesAt`/`bayFree`, `reserveBay`/`releaseBay`/
  `releaseJobBays`, `junctionFree`, `backoffTicks`/`retryDue`/`recordRetry`/
  `clearRetry`, `queueOrder`, `trafficFingerprint`. Reuses the read-only
  `checksum` from `persistence/save` and `roadDegree` from `roadGraph`.
- **`src/game/simulation/logistics.ts` (+316/-10)** — `tickLogistics(state, net,
  ticks, traffic?)`. With `traffic === undefined` the legacy #140 path runs
  unchanged (default). With a `TrafficState`, `tickLogisticsTraffic` releases
  terminal-job bays, sorts active jobs waiters-first by `(queuedSince, carrierId)`,
  ticks each job through load/unload countdowns, topology revalidation, bounded
  retry and budget-gated movement, then dispatches and advances `traffic.tick`.
  The import is one-way (logistics imports traffic, never the reverse).
- **`src/app/store.ts` (+120/-0 net)** — `TrafficApi` kept off `GameStore` (G1
  additive pattern): `createStore` returns
  `GameStore & SaveRecoveryApi & RoadApi & LogisticsApi & TrafficApi`.
  `const traffic = createTraffic(); let trafficEnabled = false;` — session-only,
  default OFF. Both `tickLoop` and `step()` pass
  `trafficEnabled ? traffic : undefined`. Surface: pure reads `getTraffic`,
  `isTrafficEnabled`; writer mutations `enableTraffic` (idempotent),
  `setTrafficDefaultTruck`, `configureTrafficTruck`, `setTrafficBayCapacity`,
  `setTrafficJunctionCapacity`, `setTrafficJunctionCost`, `setTrafficRetryPolicy`.
  Every mutation reconciles/notifies, refuses readers with `false`, validates
  input, and never calls persist. **No save-envelope, SAVE_KEY or migration change.**
- **Tests (two new files, existing assertions untouched)** —
  `tests/simulation/traffic.test.ts` (722 lines, **23 tests / 9 describes**) and
  `tests/simulation/traffic-store.test.ts` (181 lines, **3 tests**), seed 141,
  flat 24x24 fixtures mirroring the #140 reservations harness.

### Movement and contention model (E05)

- Each truck accrues `moveBudget += speed` per tick. Entering a cell costs
  `cellEntryCost = TRAFFIC_CELL_COST + junctionCost` where the junction surcharge
  applies to degree >= 3 cells (`roadDegree` from #139). A cell is entered only
  when the budget covers its cost; `travelTicks = max(1, ceil(cost / speed))`.
  Waiting on a full junction zeroes the budget (no banking); an unaffordable
  entry keeps it. Longer paths, higher junction cost, slower trucks and longer
  load/unload timers therefore all raise the measured completion tick.
- **Bays:** load/unload requires an exclusive bay lease at the approach cell.
  Leases are idempotent per carrier and released on every terminal path
  (complete, cancelled, recall arrival). Capacity defaults to unlimited;
  `setTrafficBayCapacity(cell, n)` caps simultaneous slots. A waiting truck
  holds the typed blocker `{ kind: "bay-full", at, capacity }`.
- **Junctions:** occupancy is a multiset of carriers on degree >= 3 cells,
  excluding the moving truck itself; `junctionFree` admits a truck only under
  `junctionCapacity` (null = unlimited). Waiting trucks display
  `{ kind: "junction-full", at, capacity }`. No rigid-body pileups: occupancy
  never exceeds capacity in any tick of the suite.
- **Fairness:** `queueOrder` grants the earliest waiter first, ties by carrier
  id — no starvation.

### Stuck recovery model (E04)

- Blocked routes hold the job with the exact typed blocker
  (`TrafficHoldReason = CargoHoldReason | bay-full | junction-full`): a cut
  ahead yields `no-route`, a cut under the carrier yields
  `{ kind: "road-removed", at }`, a full destination yields `destination-full`.
- Retry is bounded exponential backoff:
  `backoffTicks = min(maxBackoff, baseBackoff * 2^retryCount)`; defaults
  `maxRetries = 6, baseBackoff = 2, maxBackoff = 64`. At `maxRetries` the truck
  stops spinning (`retryDue` false). Any topology revision change forces
  `retryDue` true, so a repair recovers the job immediately; `retryCount` resets
  on recovery.
- **Traffic owns no cargo.** The #140 ledger remains the sole cargo authority;
  traffic only schedules movement and occupancy. The conservation invariant
  `amount = atSource + inTransit + delivered + returned` and the global ledger
  law are asserted at every observation point of the traffic suite, including
  200-tick blocked spins and recall-over-cut holds.

## Acceptance criteria mapping (#141)

| AC | Where satisfied |
| --- | --- |
| 1. Path costs affect arrival ticks and throughput | `cellEntryCost`/`roadPathCost`/`travelTicks` + budget-gated movement. Tests: longer corridor t4 vs t8, speed 2 vs 1 (t4 vs t6), junction surcharge 0 vs 2 (t6 vs t8), load/unload (0,0) vs (2,3) (t6 vs t11) |
| 2. Intersections and bays reserve capacity without rigid-body pileups | Exclusive idempotent bay leases + junction occupancy multiset, both released on terminal paths. Tests: bay cap 1 serializes (maxLeases <= 1), junction cap 1 admits one (maxOnJunction <= 1), unlimited variants raise throughput |
| 3. Blocked roads yield visible recoverable jobs with bounded retry/backoff | Typed `heldReason` on job and truck; bounded exponential backoff; revision-forced retry. Tests: cut ahead (retryCount caps 3, 200-tick spin conserved, repair delivers 5), cut under carrier (`road-removed`, repair recovers) |
| 4. Reproducible seed/state, expected/actual, real exit codes | Seed 141 flat fixtures; expected/actual table below; gates table with process exit codes; byte-identical fingerprint replay test |
| 5. Independent reviewer/product verdict at immutable PR head | Pending handoff — draft PR posted for QA/product; no self-acceptance, no merge by developer. Visual verification PENDING at #151 (non-vision developer: numeric checks only) |
| 6. Save/migration/recovery impact + limitations documented, no unrelated infra | Sections below; diff confined to the five authorized write paths (`git diff --name-only origin/main HEAD` outside allowed paths is empty) |

E04: full destination holds the remainder (`destination-full room 0`) then drains
on expansion; deleted road holds with the exact blocker and recovers on repair;
moved building retargets the in-flight job and delivers to the new cell; recalled
carrier walks cargo home (no teleport), and a recall over a cut holds cargo in
transit until the road recovers. Reservations and bay leases are released on every
terminal path. E05: travel length, speed, load/unload duration, bay contention and
junction capacity each measurably change the completion tick and aggregate
throughput (10/11 vs 10/8 for the bay pair) — decorative vehicles alone would fail
every exact-tick assertion. The default profile reproduces #140 tick-for-tick.

## Representative expected/actual (seed 141, flat 24x24, scrap)

All counts below are asserted in the suite and passed at head `933f82d`.
Completion ticks are hand-derived as dispatch(1) + load(1+L) + travel + unload(U).

| Scenario | Expected | Actual |
| --- | --- | --- |
| Legacy parity (default profile vs no traffic) | `logisticsFingerprint` equal every tick for 10 ticks; complete t6, delivered 7, bayLeases 0 | matched |
| Corridor length n=3 vs n=7, speed 1 | t4 (7/4 throughput) vs t8 (7/8); longer is slower | matched |
| Corridor 5, speed 1 vs 2 | t6 vs t4; faster raises throughput | matched |
| Junction surcharge 0 vs 2 on corridor 5 | cost 4 -> t6 vs cost 6 -> t8 | matched |
| Load/unload (0,0) vs (2,3) | t6 vs t11; duration lowers throughput | matched |
| Bay cap 1, unload 2, two 5-unit jobs | A done t8, B queues (`bay-full`) done t11; maxLeases <= 1; totals 10 every tick; leases 0 at end | matched |
| Bay unlimited, same jobs | both done t8; 10/11 < 10/8 contention cost | matched |
| Junction cap 1, two 3-unit jobs across degree-4 cell | A t6, B queues (`junction-full`) t8; maxOnJunction <= 1; totals 6 | matched |
| Junction unlimited | both t6 | matched |
| Cut ahead of carrier at (2,0), policy 3/2/8 | hold `no-route`, inTransit 5 preserved; retryCount caps 3 over 200 ticks; retryDue false; repair -> delivered 5, retryCount 0, leases 0 | matched |
| Cut under carrier | `{ kind: "road-removed", at: (2,0) }`, inTransit 5; repair -> delivered 5 | matched |
| Full destination (room shrunk to 3 mid-transit) | partial: delivered 3, inTransit 4, `destination-full room 0`; expand -> delivered 7, leases 0 | matched |
| Moved destination to (4,1) mid-transit | retarget to (4,1); delivered 6 lands at the moved cell; totals 6 | matched |
| Recall mid-transit | phase `returning`, walks home; cancelled, returned 5, source stock 5, carrier.jobId null, leases 0 | matched |
| Recall over cut road | inTransit 5 held 30 ticks (conserved); repair -> cancelled, returned 5 | matched |
| Conservation + reproducibility | totals invariant across create/tick/cancel/move/seed/road; byte-identical traffic + logistics fingerprints on replay | matched |
| Store writer | default OFF; invalid setters false + fingerprint unchanged; valid setters reflected; enableTraffic idempotent; SAVE_KEY + exportSave byte-identical; step() completes at logistics tick 4 (speed 2), delivered 7, totals {scrap:10}, traffic.tick 4; fresh tab over same storage starts disabled/empty | matched |
| Store reader | all 7 writer mutations refused false; fingerprint unchanged; reader never mirrors session traffic; writer untouched | matched |
| Store default-off vs enabled default profile | `logisticsFingerprint` equal each of 10 steps; both delivered 7; enabled traffic.tick 10 vs legacy 0 | matched |

## Gates at head 933f82d (real exit codes)

| Gate | Command | Exit | Result |
| --- | --- | --- | --- |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | 0 | clean |
| Validate | `npm run validate` (`tsx scripts/validate-content.mjs`) | 0 | tables 15 resources / 8 blueprints / 12 recipes / 3 research nodes; behaviour firstDrone=379, firstResearch=527, tick=18298, machines=8, links=18, drones=4, batches=1838, credits=157, nodes=3; 0 violations |
| Test | `npm run test` (`vitest run`) | 0 | **85 files / 1140 tests passed**, duration 10.87 s |
| Build | `npm run build` (`tsc --noEmit && vite build`) | 0 | index 782.55 kB (gzip 208.12), vendor 141.66 kB (gzip 45.37), tables 26.65 kB (gzip 9.77), css 61.88 kB (gzip 10.46), worker 13.41 kB, index.html 1.37 kB; built in 1.36 s; chunk-size warning advisory only (pre-existing) |

New suites within the full run: `tests/simulation/traffic.test.ts` **23 / 23**,
`tests/simulation/traffic-store.test.ts` **3 / 3**. The #140 regression suite
`tests/simulation/reservations.test.ts` (**28 / 28**) is green unchanged.

Baseline delta vs origin/main `480722b`: **83 files / 1114 tests** (baseline
recorded in the dispatch brief). Delta: **+2 test files, +26 tests, 0 failures**
(85 / 1140), exceeding the required minimum of +1 file / +23 tests. The diff is
purely additive: `git diff --stat origin/main HEAD -- tests/` shows only the two
new traffic test files; no existing test assertion was modified. The 2D
`tests/simulation/logistics.test.ts` (economy authority) is untouched.

## Save / migration / recovery impact

- The traffic authority is **session-only**: not added to the save envelope;
  persistence cutover is owned by #148. Rebuilt deterministically each session;
  `trafficEnabled` defaults to false on every boot.
- `SAVE_KEY` (`rustwake.save.v1`) unchanged; **no migration needed**; no
  persistence files touched (`src/game/persistence/**` diff empty). The store
  tests assert the raw SAVE_KEY value and `exportSave()` are byte-identical
  before/after every traffic mutation, and that a fresh reader tab over the same
  storage starts disabled and empty.
- Reader tabs never mirror session traffic, and all 7 writer mutations are
  refused on readers. Save-recovery behavior is unaffected; the recovery suite
  is green within the 1140.
- `TRAFFIC_SCHEMA_VERSION = 1` is reserved for the future #148 cutover; it is not
  read by any persistence path today.

## Limitations

1. **Opt-in, not wired to the live UI.** Default OFF preserves #140 behavior
   exactly; enabling traffic from the running game is integration work at #150.
   This slice is exercised through the store API and tests only.
2. **No road drag / 3D presentation here** — that is #147. No renderer imports;
   three.js ADR-0001 respected. Visual verification is PENDING at #151; this
   developer is non-vision and provides numeric checks only.
3. **Traffic owns no cargo.** The #140 ledger is the sole cargo authority;
   traffic schedules movement/occupancy only. Conservation is inherited and
   re-asserted, not re-implemented.
4. **Bay capacity keys on the approach cell**, not declared #139 bay sockets
   (same limitation as #140); socket geometry consumption is later work.
5. **Junctions are occupancy + entry-cost, not signal phases or rigid-body
   collision.** No visible trucks exist yet; throughput is measured in ticks.
6. **Inherited #140 behaviors:** single-trip capacity (`capacity >= amount`,
   no multi-trip splitting) and recall retries from the leg origin (roadPaths
   parity), so a recalled carrier may re-walk cells before a cut; cargo is held,
   never lost.
7. Session state does not survive reload until #148 persistence lands;
   documented above, intentional.

## Confinement audit

`git diff --name-only origin/main HEAD` returns exactly:
`src/app/store.ts`, `src/game/simulation/logistics.ts`,
`src/game/simulation/traffic.ts`, `tests/simulation/traffic-store.test.ts`,
`tests/simulation/traffic.test.ts` (+1720/-10; plus this docs-only evidence
file). No forbidden path was touched: `engine.ts`, `commands.ts`, `types.ts`,
`content/defs.ts`, `research.ts` (#144), `App.tsx`, `BuildTool.tsx`, `shell.css`,
`buildCatalog.ts` (#210), the frozen `tests/renderer/boundary-3d.test.ts`,
`src/game/persistence/**`, `src/game/renderer/**`, `package.json` and lockfiles
are all unchanged. No `pnpm-lock.yaml` or CRLF phantom was committed.