# RW3D T13 (#140) — conserved logistics jobs and reservations

Role: developer. Issue: #140 (parent #123, master #121). Specs: GAME_SYSTEMS.md
(logistics / cargo movement), EXECUTIVE_CONTRACT.md, ACCEPTANCE.md E01
(conservation), E03 (fair contention) and E04 (transaction integrity). Branch:
`rw/140-logistics-jobs`. Draft PR: linked on issue #140.

## Heads

| What | SHA |
| --- | --- |
| Base (origin/main) | `8a087cef20e92fa4fb76d94affdeba8cea9e1411` |
| Commit 1 — logistics core + store slice + tests | `3d5f449f97dbe9c0cf7e40863ca93ded0284621e` |

All four gates below were run once at code head `3d5f449` on the exact working
tree that was committed. This evidence document is a docs-only commit on top of
that head; it cannot affect gate results. The PR handoff SHA is the final head
including this document.

## Implementation summary

- **`src/game/simulation/logistics.ts` (new)** — a session-only, deterministic
  cargo-job engine. Pure functions over an explicit `LogisticsState`; integer
  ticks only; no DOM, wall-clock or randomness. Public surface:
  `createLogistics`, `registerBuilding`, `registerCarrier`, `seedStock`,
  `createJob`, `cancelJob`, `tickLogistics`, `logisticsTotals`, `buildingUnits`,
  `logisticsFingerprint`. `LOGISTICS_SCHEMA_VERSION = 1`.
  - **CargoJob** carries `id, commandId, sourceBuildingId, destBuildingId,
    sourceCell, destCell, carrierId, cargoType, amount, atSource, inTransit,
    delivered, returned, status, phase, priority, createdTick, reservedAt, path,
    progress, pathRevision, legFrom, heldReason, lastAttemptRevision, routeCache`.
    Status lifecycle `pending -> active -> partial -> complete | cancelled`;
    phase `waiting -> to-source -> to-dest -> (returning) -> done`.
  - **Reservation** has a unique id per `(job, kind)` where kind is
    `source | destination | carrier`. Source and destination reservations are
    created atomically with the job; the carrier reservation is the carrier's
    single `jobId` assignment. All reservations are released when a job reaches a
    terminal state.
  - **Dispatch** is oldest-first with stable tie-breaks: pending jobs sort by
    `(priority desc, createdTick asc, id asc)`; carrier pick by
    `(manhattan asc, id asc)` with `capacity >= amount` (single-trip). Route
    lookups use the read-only `roadPaths.ts` API; failed routes back off per
    `(topology revision, carrierId)` so a blocked job does not re-BFS every tick.
  - **Movement** advances one road cell per tick via `findRoadPath`. A topology
    revision revalidates in-flight legs; a removed road holds the batch with the
    exact `CargoHoldReason` and retries from the leg origin when a route returns
    (roadPaths parity). Cargo is never deleted or teleported.
  - **Cancellation** returns unloaded cargo immediately (`returned += atSource`)
    and recalls loaded cargo by walking the carrier back (`phase = returning`,
    status stays `active` until arrival, then `cancelled`, `returned += inTransit`).
    A cut route holds the recall exactly like a delivery hold.
- **`src/app/store.ts` (additive only)** — `LogisticsApi` kept off `GameStore`
  (G1 additive pattern): `createStore` returns
  `GameStore & SaveRecoveryApi & RoadApi & LogisticsApi`. The ledger is
  session-only (`const logistics = createLogistics()`), rebuilt each session.
  `tickLogistics` joins both `tickLoop` and `step()` beside `tickRoadCargo`.
  Every mutation is writer-gated (reader tabs get a typed `read-only` rejection)
  and reconciles/notifies; reads are pure and any-role. **No save-envelope,
  SAVE_KEY or migration change.**
- **Tests (new file, existing assertions untouched)** —
  `tests/simulation/reservations.test.ts`, **28 tests / 7 describe blocks**.

### Conservation model (the critical invariant)

Every unit lives in exactly one container at all times:

- building **free stock** (`state.stocks`),
- **`job.atSource`** (reserved, not yet loaded),
- **`job.inTransit`** (loaded on a carrier).

Delivered units land in the destination's free stock; recalled (cancelled) units
land back in the source's free stock. Two laws are asserted at every observation
point in the suite:

1. **Per-job container law:** `amount = atSource + inTransit + delivered + returned`.
   The `returned` counter is the audit trail for cancellation, so the law holds
   even after a job settles as `cancelled`. A settled cancel holds nothing
   (`atSource = inTransit = 0`).
2. **Global ledger law:** `logisticsTotals = free stock + atSource + inTransit`
   is invariant across every command and every tick. `seedStock` is the single
   entry boundary; nothing else creates or destroys cargo.

`logisticsFingerprint` is a canonical sorted-JSON checksum (reusing the
read-only `checksum` from `persistence/save`) used to prove byte-identical
replay and that rejected commands change nothing.

## Acceptance criteria mapping (#140)

| AC | Where satisfied |
| --- | --- |
| 1. Reserve source/dest/carrier with unique ids; no double-booking | `Reservation` per `(job, kind)`; source stock deducted at reservation; carrier single `jobId`; destination room reserved exclusively against other jobs' outstanding intent. Tests: "unique reservation ids", "E03 last pallet", "destination room exclusively" |
| 2. Partial unload / canceled route / full storage preserve remaining cargo | `attemptUnload` delivers `min(inTransit, room)` and holds the remainder; cancel returns/recalls; over-fill holds ALL cargo. Tests: partial-unload, full-destination, 7 cancellation tests |
| 3. Stable tie-breaks + fairness; no double reservation / starvation | `(priority, createdTick, id)` sort; oldest-first drain. Tests: same-tick tie-break, priority outranks age, oldest-first no starvation, byte-identical replay |
| 4. Reproducible seed/state, expected/actual, real exit codes | Seed 140 flat fixture; gates table below with process exit codes; exact cargo counts asserted before/after in every lifecycle test |
| 5. Independent reviewer/product verdict at immutable PR head | Pending handoff — draft PR posted for QA/product; no self-acceptance, no merge by developer |
| 6. Save/migration/recovery impact + limitations documented, no unrelated infra | Section below; diff confined to authorized write paths (`git diff --name-only origin/main HEAD` outside allowed paths is empty) |

E01: container + ledger laws asserted at every step; `seedStock` sole entry.
E03: last-pallet race resolves to exactly one success; oldest-first drains the
queue. E04: road removal holds with the exact blocker and resumes on repair;
rejected creations are byte-identical no-ops; creation/cancel are idempotent.

## Representative expected/actual (seed 140, flat 24x24, scrap)

Fixture: corridor `(0,0)..(4,0)`, buildings b1@(0,0) / b2@(4,0), carriers placed
on road cells. All counts below are asserted in the suite and passed.

| Scenario | Expected | Actual |
| --- | --- | --- |
| Lifecycle haul 7 from stock 10 | t1 dispatch, t2 load, t3-t5 travel, t6 complete; b1=3, b2=7, totals=10, reservations=0 | matched |
| Partial unload (b2 cap 20, +15 external after reserve) | t6 delivered=5, inTransit=2, held `destination-full room 0`; drain 15 -> b1=18, b2=7, totals=25 | matched |
| Full storage (b2 cap 7, +7 external over-fill) | delivered=0, inTransit=7 held; drain 7 -> b1=10, b2=7, totals=17 | matched |
| Cancel mid-transit recall | cargo walks back (no teleport); `returned` accrues; ledger constant | matched |
| Cancel after partial | recalls only remainder; b1=5, b2=20, delivered=5, returned=2 | matched |
| Fairness: 6 jobs / 2 carriers | t1 jobs 1,2 active; t6 complete + jobs 3,4 active; all 6 complete, b2=6, totals=6 | matched |
| Road removed under carrier | hold with exact blocker; repair resumes; totals constant | matched |
| Identical seed + commands | byte-identical `logisticsFingerprint` across two runs | matched |
| Store writer | SAVE_KEY raw + `exportSave()` unchanged by every logistics mutation; step() advances jobs | matched |
| Store reader | every mutation refused `read-only`; ledger empty; writer untouched | matched |

## Gates at head 3d5f449 (real exit codes)

| Gate | Command | Exit | Result |
| --- | --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | 0 | clean |
| Validate | `npx tsx scripts/validate-content.mjs` | 0 | tables 15 resources / 8 blueprints / 12 recipes / 3 research nodes; behaviour firstDrone=379, firstResearch=527, tick=18298, machines=8, links=18, drones=4, batches=1838, credits=157, nodes=3; 0 violations |
| Test | `npx vitest run` | 0 | **82 files / 1100 tests passed** |
| Build | `npx tsc --noEmit && npx vite build` | 0 | index 771.05 kB (gzip 205.02), vendor 141.66 kB (gzip 45.37), tables 26.65 kB, css 60.48 kB, worker 13.41 kB, index.html 1.37 kB; built in 1.35 s; chunk-size warning advisory only |

Focused suite: `npx vitest run tests/simulation/reservations.test.ts` -> exit 0,
**28 / 28 passed**.

Baseline delta vs origin/main `8a087ce`: **81 files / 1072 tests**. Delta:
**+1 test file, +28 tests, 0 failures** (82 / 1100). The diff is purely additive:
`git diff --stat origin/main HEAD -- tests/` shows only the new
`reservations.test.ts`; no existing test assertion was modified. The 2D
`tests/simulation/logistics.test.ts` (economy authority) is untouched.

## Save / migration / recovery impact

- The logistics ledger is **session-only**: not added to the save envelope;
  persistence is owned by #148. Rebuilt deterministically each session.
- `SAVE_KEY` (`rustwake.save.v1`) unchanged; **no migration needed**; no
  persistence files touched (`src/game/persistence/**` diff empty). The store
  tests assert the raw SAVE_KEY value and `exportSave()` are byte-identical
  before/after every logistics mutation.
- Reader tabs never mirror the session ledger (it is not persisted), and every
  reader mutation is refused with a typed `read-only` rejection. Save-recovery
  behavior is unaffected; the recovery suite is green within the 1100.
- `LOGISTICS_SCHEMA_VERSION = 1` is reserved for the future #148 cutover; it is
  not read by any persistence path today.

## Limitations

1. **Single-trip capacity:** a carrier must have `capacity >= amount`; jobs are
   not split across multiple trips or carriers. Multi-trip splitting is out of
   #140 scope.
2. **Approach-cell registration:** buildings register at a road approach cell,
   not a declared bay socket (the #139 socket geometry is not consumed here).
3. **No UI surface:** logistics is exercised through the store API and tests; a
   cargo-order panel is a later issue. No renderer imports (boundary-3d).
4. **Recall retries from the leg origin** (roadPaths parity), so a recalled
   carrier may re-walk cells it already traversed before a cut; cargo is held,
   never lost.
5. **Priority is a caller-supplied integer**; there is no UI to set it yet.
6. Ledger does not survive reload until #148 persistence lands; documented
   above, intentional.

## Confinement audit

`git diff --name-only origin/main HEAD` returns exactly:
`src/app/store.ts`, `src/game/simulation/logistics.ts`,
`tests/simulation/reservations.test.ts` (plus this docs-only evidence file).
No forbidden path was touched: `roadPaths.ts`, `src/game/world/road*.ts`,
`buildCatalog.ts`, `transactions.ts`, `src/game/persistence/**`,
`src/game/renderer/**`, `src/game/economy/**`, the frozen UI panels,
`package.json` and lockfiles are all unchanged. No `pnpm-lock.yaml` or CRLF
phantom was committed.