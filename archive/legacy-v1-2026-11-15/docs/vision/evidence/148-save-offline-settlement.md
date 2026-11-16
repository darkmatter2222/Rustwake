# #148 — Save migration and exact offline transport settlement

- **Issue:** [#148](https://github.com/darkmatter2222/Rustwake/issues/148) `[RW3D][P1][T21]`
- **Role:** developer (one child under the coordinator; no delegation)
- **Branch:** `rw/148`
- **Base:** `origin/main` = `1752861b3fcd5f4f096ecc330c7cba5d56192258` (the #214 starter-economy retune; built ON TOP, not reverted)
- **Implementation head (gated):** `a71eab2c20e9f190107153b21bdd9426ab6a6e0a`
- **Evidence commit:** adds this file only (`docs/`, outside every gate input); the PR head is the evidence commit. Gates were run once on the implementation tree above.
- **Retuned #214 seed used by every fixture:** store `{ scrap: 120, ferrous: 12, steel: 12 }`, `credits 60`, `storeUnits 144`. The OPENING release fixture equals this seed (`createInitialState()`).

## Owned paths

| Path | Change |
| --- | --- |
| `src/game/persistence/save.ts` | G2 bounded-size gate: `MAX_SAVE_TEXT_LENGTH = 1_000_000` (UTF-16 units), new `DecodeFailure "oversized"`, refused before `JSON.parse`. The only `src/` change. |
| `tests/persistence/recovery.test.ts` | Title/comment only on the existing 200k-payload test (below the new cap, still fails on checksum). Assertions unchanged. |
| `tests/persistence/size-cap-148.test.ts` | NEW — 9 tests. |
| `tests/persistence/migration-148.test.ts` | NEW — 7 tests. |
| `tests/simulation/offline-equivalence-148.test.ts` | NEW — 7 tests. |
| `tests/simulation/command-idempotency-148.test.ts` | NEW — 12 tests. |

`src/game/simulation/engine.ts` is **read-only and unchanged**: no defect was found, so no engine fix was needed (the minimal-fix allowance was not exercised). `offline.ts` and `lease.ts` needed no change (equivalence and the writer lease already hold). `transfer.ts` does not exist in this repo; import/export settlement lives in `src/app/store.ts` and is covered through the real store below. No renderer/UI/layout/content-balance/infra changes.

## Acceptance clause map

### E08 — save migration preserves balances/progression or retains an explicit legacy slot; invalid/oversized/partial/duplicate-ID changes nothing; two tabs retain one writer

| Clause | Coverage | Result |
| --- | --- | --- |
| Old balances/progression preserved | `migration-148` "preserves every recorded balance and progression marker": a played pre-#214 yard (store `{scrap:23,ferrous:4,steel:3}`, units 30, dock 900, credits 30, export claimed, 18 pulses of the 30 pool, flying starter drone) decodes+migrates with every balance, `tick`, `revision`, `tutorial`, topology and `seenCommands` intact — never re-seeded to 120/12/12 · 60 · 300. | PASS |
| Versioned eras backfilled, value-preserving | `migration-148` "backfills the missing eras": the fixture is simultaneously pre-research (`research` deleted), pre-fleet (`spares` deleted), pre-counters (machine/route counters + `branch` + `run` deleted) and pre-#214-seed. `migrate` backfills `research {}`, `spares []`, counters 0 without touching balances. | PASS |
| Idempotent migration | `migration-148` "is idempotent and a byte fixed point after one migrate": `migrate(decode(migrate(decode(old))))` equals the first migrate and re-encodes byte-identically. | PASS |
| Progress detection under the re-anchored seed | `migration-148` "still detects progress when old credits sit below the new seed anchor": old credits 30 < new anchor 60 still reads as progress (tick/machines/drone markers); a pristine OLD seed (tick 0, credits 0, empty store) reads as settings-only. | PASS |
| Boots without re-seeding | `migration-148` "boots the old yard at its checkpoint": real `createStore` boot keeps credits 30 / dock 900 / old store / 2 machines; the persisted checkpoint keeps them too. | PASS |
| Explicit legacy slot when undecodable | `migration-148` "retains an undecodable old save verbatim in the explicit legacy slot": checksum-broken old save → fresh fallback yard (credits 60), notice `reason "checksum"`, `preserved true`, `RECOVERY_KEY === raw`, retry keeps the slot. | PASS |
| Oversized changes nothing (G2) | `size-cap-148`: decode boundary (`MAX+1` → `oversized`, exactly `MAX` → ok), import writer (live yard + `SAVE_KEY` bytes unchanged, no slot) and reader (`oversized` before the role gate), boot (fresh yard, notice `{reason:"oversized", preserved:true}`, `RECOVERY_KEY === raw`, retry keeps / discard clears), quota-refusal double (`preserved:false`, `SAVE_KEY` held verbatim). A checksum-valid oversized envelope is still refused for size alone. | PASS |
| Invalid/partial/duplicate-ID changes nothing | Pre-existing `save.test.ts` / `recovery.test.ts` / `transfer.test.ts` (parse/schema/checksum/invalid, partial payloads, duplicate-id envelopes) remain green; `size-cap-148` adds the empty/parse regressions and `migration-148` adds the corrupt-old-save path. | PASS |
| Two tabs retain one writer | Already covered by `lease.test.ts` + `migration.test.ts` (writer lease, read-only refusal, controlled takeover). Inspected; no genuine gap, so no duplicate added. | PASS (existing) |

### E07 — equivalent tick batches and offline event jumps produce identical ledgers/mission results (1h/12h/18h, capacity halt, rollback, under the 12h cap)

`offline-equivalence-148` compares `advance(state, eligibleTicks)` (tick batches) against `catchUp(state, T0, T0+elapsedMs)` (the `advanceTo` idle-jump path) with **full `SimState` deep equality**, then cross-checks the return report (`awayTicks`/`creditedTicks`/`capped`/`nextLastSeenMs`/`deliveries`/`batchesDone`/`gains`) against the actual state deltas. `T0 = 1_700_000_000_000`; `TUNING.offlineCapTicks = 432000` (12h).

| Clause | Coverage | Result |
| --- | --- | --- |
| 1h equivalence | built yard, 36000 ticks: `jumped == tickwise`, report matches deltas. | PASS |
| 12h equivalence | built yard, 432000 ticks (the cap): full equality. | PASS |
| 18h caps at 12h, no re-claimed tail | 18h absence → `creditedTicks 432000`, `capped true`, `nextLastSeenMs = now`; a reload at the new checkpoint credits 0 (`awayTicks 0`, `gains {}`). | PASS |
| Chunk boundaries irrelevant | 7777-tick chunks (not a divisor) == one batch == event jump. | PASS |
| Capacity halt | dock 30, store `{scrap:25}`: both paths saturate at `storeUnits 30`, `bottleneck "storage-full"`, `gains > 0` (the 5 free units), `overflow []` (drone `room 0` stalls, belts `destinationRoom 0` block). A second hour on the saturated yard credits `gains {}` and stays at 30 — identically on both paths. | PASS |
| Clock rollback | `now < lastSeen`: `awayTicks 0`, `creditedTicks 0`, `gains {}`, state unchanged, `nextLastSeenMs = now` (no stacked absence). | PASS |
| Idle-jump branch (spec 21.4) | idle yard (no repaired drone/routes/store stock) over 12h: jump only ages the yard — `gains {}`, `starved`, machine `ageTicks`/`starvedTicks += 432000`, `busyTicks`/`fullTicks` unchanged — equal to 432k tickwise steps. | PASS |

### E02 — duplicate command IDs / rapid double presses charge/grant once (build/upgrade/contract/import/raid settlement)

`command-idempotency-148` proves the core invariant per command: first dispatch executes, an immediate same-id retry returns the FIRST result and leaves the ENTIRE state byte-identical, `seenCommands[id]` records the first revision once; a DIFFERENT id with the same payload is a new command (dedup by id, never content).

| Clause | Coverage | Result |
| --- | --- | --- |
| build / upgrade | `machine.build` (scrap 90 / steel 8; new id builds again), `machine.upgrade` speed (level 2, branch `["speed"]`, charged once). | PASS |
| contract settlement | `contract.export` (steel 2, credits 550; new id refused — claimed), `contract.sell` scrap 5 (+5; new id sells again). | PASS |
| research / fleet / belts | `research.buy` cutters (data 16; new id `already-known`), `drone.add` (spares 1, −45), `route.connect` (priced tile run). | PASS |
| salvage / repair / dismantle | `manual.salvage` (pulses 1, scrap 122), `drone.repair` (scrap 90), `machine.dismantle` (90% refund once). | PASS |
| save round-trip | persisted ids retry to their first results after reload (`reload-build` rev 1, `reload-export` rev 2), state unchanged, credits 550 / steel 10. | PASS |
| real store double press | `createStore` boot from a funded save: same-id build dispatched twice → 1 machine / scrap 90; same-id export twice → credits 550 / `exportClaimed true` (granted once). `store.dispatch` is a straight `applyCommand` after the writer/reconcile checks (no extra gate). | PASS |
| import settlement | `migration-148` "imports the old yard wholesale and a repeat import settles once": identical envelope twice → identical snapshot, no double settlement. Pre-existing `transfer.test.ts` remains green. | PASS |
| raid settlement | No `raid` command exists yet (P3/G3 combat). The current settlement surface is the contract commands above plus engine drone deliveries, whose once-only settlement across tick/event paths is proven by E07. Documented limitation, not a gap in this issue. | N/A (deferred) |

## Reproducible seeds / states (expected vs actual)

- **Fresh seed (`createInitialState()`):** expected store `{scrap:120,ferrous:12,steel:12}`, credits 60, storeUnits 144, dock 300 — actual matches (asserted in `size-cap-148` at-cap import and `migration-148` fresh fallback).
- **Pre-#214 fixture (`oldSeedYard()`):** built through real commands (6 salvage+advance, drone repair, sorter@8 / furnace@9, four routes, advance 600), then economy set to the git-`039a6c7` values (dock 900, wreck pool 30, pulse 6 ticks, export 3 steel / 30 credits) and later-era fields stripped. Expected after migrate: balances verbatim, `research {}`, `spares []`, counters 0 — actual matches; byte fixed point on re-migrate.
- **Funded E02 yard:** #214 seed + 20 data + credits 500 (documented test funding); the round-trip and store tests add +12 steel so build (4) and export (10) are both affordable in one session. Expected once-only deltas — actual matches.
- **Offline yard:** mirrors `tests/simulation/offline.test.ts` `builtYard()`; idle yard omits repair/routes/store stock to force the `advanceTo` jump branch. Expected full-state equality — actual matches at every horizon.

## Save / migration / recovery impact

- The size gate is additive and typed: `oversized` flows through `ImportResult` / `RecoveryResult` / `SaveRecoveryNotice` / `recoveryNoticeFor` / boot `preserveCorruptSave` / reconcile / retry without further wiring (`RecoveryNotice.tsx` already falls back to the raw reason string — no UI edit).
- A maximum-size save (~2 MB) still fits beside the writer lease and the G1 recovery slot under the typical 5 MiB origin quota.
- Migration remains balance-preserving: `migrate` never touches `store` / `credits` / `storeCapacity`; `validateSim` accepts any positive safe-integer capacity (old dock 900 is valid). No save is re-seeded or silently reset.
- G1 (#191/#203) raw preservation, retry/discard/export and the writer lease are unchanged and re-verified green.

## Gates (run once at implementation head `a71eab2`)

| Gate | Command | Exit | Result |
| --- | --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | 0 | clean |
| Content | `npx tsx scripts/validate-content.mjs` | 0 | 0 violations (15 resources, 8 blueprints, 12 recipes, 3 research nodes; behaviour 0 violations) |
| Tests | `npx vitest run` | 0 | `numTotalTests 1411`, `numPassedTests 1411`, `numFailedTests 0`, `success true` — 103 files, 412 suites (35 new) |
| Build | `npm run build` | 0 | built in 1.44s (pre-existing >500 kB chunk-size warning only, not an error) |

## Limitations

- **Non-vision agent:** numeric/state/hash evidence only. Visual, audio and economic-play fidelity are NOT self-certified here; they are owed at the G1 product verdict (#151). No running-build screenshots were produced.
- **Raid settlement** has no command yet (P3/G3); covered surface is contract export/sell + engine drone deliveries (see E02 map).
- **Engine unchanged:** `engine.ts` was read-only; equivalence held analytically and in tests, so the minimal-fix allowance was not used.
- Independent QA and product verdict on the immutable head SHA, and the release-engineer merge, are still required — this handoff does not self-accept or merge.
