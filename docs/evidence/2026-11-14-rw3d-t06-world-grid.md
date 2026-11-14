# RW3D T06 (#133) — versioned world grid, occupancy and construction transactions

- Role: developer (implementation author; NOT an independent review or product verdict)
- Issue: [#133](https://github.com/darkmatter2222/Rustwake/issues/133) — [RW3D][P1][T06] Build versioned world grid, occupancy and construction transactions (parent #123, master #121, Project 2)
- Branch: `rw/133-world-grid`, worktree `C:/Users/ryans/AppData/Local/Temp/rw-qwen/rw-133`, base main at `a51c4a6df970154aea810d4d865471603d08b3c5` (G0 accepted, #132 merged)
- PR / immutable head SHA: recorded on the linked draft PR and its `role=developer` handoff comment (this document is committed inside that head; checks below ran on the working tree identical to it)
- Acceptance IDs: E01 (conservation), E02 (idempotent commands), U01 (place/rotate/cancel without accidental charge); issue #133 acceptance criteria; binding occupancy rulings from [architecture README §6](../vision/architecture/README.md) (product comment 6871139430 on PR #188)
- Coordinator dispatch guidance: issue comment 6872122099 (exclusive write paths, read-only core reuse)

## 1. Deliverables (owned write paths, exact)

| # | Path | Content |
|---|---|---|
| A | `src/game/world/types.ts` (new) | `WorldState` schema v1: parcels, terrain, buildings, sites, single reservations, stock/committed ledgers, credits, milestone tokens, `seenCommands`, `clearanceMode` as state. Integer milli-units (1 u = 1 cell = 1000 mu); no floats in state |
| B | `src/game/world/terrain.ts` (new) | Deterministic seed -> terrain (mulberry32 uint32 PRNG + Fisher-Yates, no `Math.random`/`Date`); 24x24 owned start land + 16 edge-contiguous 8x8 expansion parcels tiling [-8, 32)^2; starter clear zone [6, 18)^2 never obstructed on any seed; P1 economic seed 120 scrap / 12 ferrous / 12 steel / 60 credits |
| C | `src/game/world/kit.ts` (new) | Embedded placement kit for the 8 placeable assets, transcribed from `docs/vision/assets/kit.json` (parity-guarded); crane swing radius `ceil(sqrt(2500^2 + 200^2)) = 2508 mu`; clearance width `max(nominal, actual) + 2*150 mu`; wall_gate effective rest margin `1350 - 1250 - 50 = 50 mu`; sorter/furnace costs reuse audited v1 `BLUEPRINTS` read-only |
| D | `src/game/world/geometry.ts` (new) | Integer rotation/footprint/socket/corridor math; four yaws 0/90/180/270; frontage +Z -> +X -> -Z -> -X; half-open mu rects; disc-rect clearance test (touching = conflict) |
| E | `src/game/world/transactions.ts` (new) | Atomic validate -> reserve -> commit; fixed validation order; 17 stable typed rejection reasons (discriminated union); idempotent `applyWorldCommand` (E02); cancel refunds 100%/90% floor; contiguous milestone-gated expansion; `worldFingerprint` (FNV-1a via read-only persistence `checksum`) |
| F | `src/game/world/engine.ts` (new) | Construction ticks: 50 ticks (5 sim seconds) per asset; settle exactly once at `startTick + durationTicks`; tick-by-tick == event-jump equivalence; reload (JSON round-trip) settles once; no wall-clock |
| G | `src/game/world/index.ts` (new) | Public API barrel |
| H | `tests/game/world/**` (new, 7 suites + helpers) | 181 tests: rotation permutations, clearance math, kit parity vs authored kit.json, typed atomic rejections, crane keep-out, entrance corridors both directions, wall_gate modes, expansion, construction/cancel/reload, E01 conservation, E02 idempotency, terrain determinism |
| I | `docs/evidence/2026-11-14-rw3d-t06-world-grid.md` (new) | This receipt |

Write-path audit: `git diff --stat a51c4a6..HEAD` outside `src/game/world/**` and `tests/game/world/**` is empty (check 6). No changes to `src/game/simulation|content|economy|persistence`, `src/app`, `src/ui`, `src/game/renderer`, `tests/legacy`, `work/`, `package.json` or lockfiles. Core reuse is import-only: `content/defs` (BLUEPRINTS, types), `simulation/types` (CONTENT_VERSION), `economy/quantity` (isqrt), `persistence/save` (checksum).

## 2. Acceptance criteria mapping (expected vs actual)

| Criterion | Where verified | Expected | Actual |
|---|---|---|---|
| Atomic parcel/rotated-footprint/terrain/entrance validation | `placement.test.ts` (26 tests) | every failure class rejects with typed reason AND byte-identical state (fingerprint, revision, seenCommands unchanged) | all pass; validation is pure and complete before first mutation |
| Material reserved exactly once; construction ticks | `construction.test.ts` (14 tests) | one reservation at placement; nothing charged during work or at completion; settle once at tick 50; reload settles once | all pass; `stock + reserved + committed = initial` after every transition |
| Stable typed rejection reasons | `placement.test.ts`, `transactions.ts` | discriminated union matched on `reason` tag, deterministic order, recovery payloads | 17 tags; order asset -> rotation -> cell -> land -> terrain -> occupancy -> keep-out -> entrances -> entrance obstruction -> vertical clearance -> materials -> credits |
| Four yaw rotations hard-checked (cell sets, socket permutation, frontage) | `geometry.test.ts` (109 tests) | 8 assets x 4 yaws: exact rotated cell sets, rigid socket permutation (pairwise + center distances invariant, integer mu), frontage cycle +Z/+X/-Z/-X, corridors rotate rigidly | all pass |
| Crane keep-out r = 2.508 u is CLEARANCE, not occupancy (3x3 footprint) | `geometry.test.ts`, `placement.test.ts`, `kit-parity.test.ts` | occupancy stays 9 cells; disc blocks foreign footprints, candidate crane disc blocks existing footprints, corridors blocked both ways; radius re-derived from authored boom corner (2500, 200) mu | all pass; `2507^2 < 6290000 <= 2508^2` |
| Clearance = max(nominal, actual) + 2 x 0.15 u | `geometry.test.ts`, `kit-parity.test.ts` | warehouse bays 2500, depot 3500, sorter 1300, furnace 1600, wall_gate 2100 mu; truck wheel-inclusive width 1180 mu re-derived from kit.json | all pass |
| wall_gate 0.05 u blockout margin | `placement.test.ts`, `kit-parity.test.ts` | blockout accepts effective 50 mu (1350 clear - 1250 truck - 50 float); production rejects `vertical-clearance {effectiveMu: 50, requiredMu: 150}` atomically | all pass |
| E01 conservation | `conservation.test.ts` (3 tests) | per-resource `stock + reserved + committed = initial` and separate credit ledger, after EVERY transition incl. rejections | scripted lifecycle + 200 seeded-random commands x 5 seeds + integer workload: all pass |
| E02 duplicate ids charge once | `idempotency.test.ts` (8 tests) | replay returns original revision, no mutation; rejected ids stay retryable; reload does not double-charge | all pass |
| U01 place/rotate/cancel without accidental charge | `construction.test.ts` | 4 place/cancel cycles across all yaws restore exact initial stock/credits | pass |
| Reproducible seed/state | `terrain.test.ts` (7 tests) + all suites | same seed = byte-identical state; no RNG/wall-clock outside seeded PRNG | pass |

## 3. Scenario, seeds, save/migration impact

- Default scenario seed: `SEED = 133` (`tests/game/world/helpers.ts`). Determinism seeds: 0, 1, 133, 424242, 0xffffffff; layout invariants across seeds 0..24; conservation workloads seeds 11/22/33/44/55 (200 commands each, PRNG seed `seed * 7919`); integer workload seed 1234 (PRNG 99); tick/jump equivalence seeds 1/2/3/133/9999 plus mixed workload seed 777; reproducibility stream seed 2026. All scenarios are pure functions of (seed, command stream, ticks).
- **Save impact: NONE.** `WorldState` is not attached to the save envelope (`SAVE_KEY rustwake.save.v1` untouched); no persistence code was modified. `schemaVersion`/`contentVersion` fields and the JSON-round-trip tests reserve the additive seam for #148 T21 (optional-field precedent). Untouched v1 saves remain byte fixed points; `tests/legacy/migration.test.ts` (9 tests) stays green and unmodified.
- Recovery: construction progress derives from integer tick counts, so a mid-construction reload settles each site exactly once (tested); interrupted writes remain governed by the existing persistence lease/checkpoint contract, unchanged here.

## 4. Device / browser / quality

Windows 10.0.26200 x64, Node v26.3.0, vitest 2.1.8. Headless simulation module only — no DOM, no renderer, no device/browser/quality-tier claims, no visual evidence produced. Author is a non-vision agent; visual fidelity is NOT self-certified (architecture §6 capable-inspection gate remains PENDING and is owned by a vision-capable reviewer).

## 5. Checks (real exit codes, worktree root)

`node_modules` was already present in the worktree; no install step was needed. No network access required by any gate.

| # | Command | Expected | Actual | Exit |
|---|---|---|---|---|
| 1 | `npm test` (full suite, run once) | all suites green incl. untouched `tests/legacy` | **70 files / 949 tests passed**, 26.50 s; no failures, nothing skipped | 0 |
| 2 | `npm run typecheck` | strict tsc clean | clean (no diagnostics) | 0 |
| 3 | `npm run validate` | content/behaviour gate clean | 15 resources / 8 blueprints / 12 recipes / 3 research nodes; 0 content + 0 behaviour violations | 0 |
| 4 | `npm run build` | tsc + vite production build | 124 modules transformed, built in 701 ms | 0 |
| 5 | `npx vitest run tests/game/world tests/legacy` | new world suite green; legacy contract green | **10 files / 203 tests passed** (world 181 + legacy 22), 1.44 s | 0 |
| 6 | `git diff --stat a51c4a6..HEAD -- . ':!src/game/world' ':!tests/game/world'` | empty (write-path confinement) | empty; only owned paths + this evidence doc in the PR | 0 |

World suite per-file counts (check 5): geometry 109, placement 26, construction 14, kit-parity 14, idempotency 8, terrain 7, conservation 3. Legacy per-file: fixtures 10, migration 9, conservation 3 — files unmodified (`git diff` empty for `tests/legacy`).

## 6. Limitations and deferred scope (honest gaps)

1. **Costs**: sorter/furnace reuse the audited v1 `BLUEPRINTS` (20 scrap; 10 scrap + 5 ferrous), NOT the GAME_SYSTEMS P1 table numbers — deliberate per architecture §3 (no silent v1 repricing); the P1 table lands with the #148 content-version bump. crane/turret/wall_gate build costs and parcel price (30 scrap + 25 credits + 1 token) are prototype tuning defaults flagged for #148.
2. **Milestone tokens** start at 0 and are granted by progression in a later issue; expansion is fully gated and tested but tokens cannot yet be earned in-game.
3. **Route feasibility** is not modeled: GAME_SYSTEMS roads are an independent graph (later issue). Entrance validation here is geometric clearance (owned/flat/unoccupied/outside crane swing, both directions); the "place without route with explicit UI warning" path belongs to the routing/UI issues.
4. **Expansion ring terrain** is flat until a later issue authors ring content; salvage/rough only on start land outside the clear zone.
5. **wall_gate production mode intentionally rejects** (50 mu < 150 mu) until the kit fixes #164 (gate) / #142 (truck); blockout acceptance is the product ruling. Crane radius reconfirm vs crane rig is tracked at #142 T15.
6. **No integration wiring**: no UI (#138), renderer (#134) or save attachment (#148 T21) in this PR; the module is headless and pure by design. No visual evidence exists for this issue; G1 visual acceptance remains gated on capable inspection.

## 7. Handoff

Independent QA review and product verdict on the immutable PR head are REQUIRED before merge; release engineer merges; main CI/CD verification follows. No self-acceptance. This receipt plus the `role=developer` PR comment carry the head SHA, checks and limitations.