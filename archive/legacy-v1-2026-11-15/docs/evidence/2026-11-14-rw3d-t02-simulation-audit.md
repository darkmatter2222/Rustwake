# RW3D T02 (#129) — Reusable simulation audit and legacy save fixtures

- Role: developer (implementation author; not a review verdict)
- Issue: #129 (parent #122, master #121, Project 2)
- Branch: `rw/129-simulation-audit`, base `8b78d09f6a1227916fede780eb1682969c49ff1e` (main, #128 receipt)
- PR / immutable head SHA: recorded on the linked draft PR and the issue evidence comment (this document is committed inside that head).
- Acceptance rows exercised: E01 (resource conservation / ledger), E08 (migration, invalid-save refusal, single writer).
- Environment: Windows 10.0.26200 x64, Node v26.3.0, vitest 2.1.8 (jsdom), pnpm. Headless characterization only — no device/browser/quality-tier claims, no visual evidence (none required for this issue).

## 1. Command / state boundary inventory (at base SHA)

### Simulation core — `src/game/simulation/` (reusable as-is)
| Module | Boundary | Notes |
|---|---|---|
| `engine.ts` (598 ln) | `advance(s, ticks)`, `advanceTo(s, target)` | Fixed per-tick phase order (finish batches → enqueue cargo → settle arrivals → allocate power → start batches fairly → drone/contract events). `advanceTo` event-jumps only idle ranges and is numerically identical to `advance` for one target. No RNG, no wall clock, no DOM inside a tick. Derived `SimIndex` rebuilt on revision/topology change. |
| `commands.ts` (607 ln) | `applyCommand(s, command)` | 13 named commands: `manual.salvage`, `drone.repair`, `drone.add`, `machine.build/upgrade/respec/dismantle/move`, `route.connect/remove`, `contract.export/sell`, `research.buy`. Idempotency by `command.id` via `s.seenCommands` (retried id returns the recorded revision, changes nothing). Each command validates/reserves/commits fully or rejects with a reason (`insufficient`, `cooldown`, `no-room`, `blocked-placement`, `cycle`, …); revision increments only on success. Exports table-derived pricing helpers (`beltCost`, `beltRun`, `branchPrice`, `droneAddCost`, `refundOf`, `sellableAmount`). |
| `types.ts` (345 ln) | `SimState`, `createInitialState`, versions | `SCHEMA_VERSION = 1`, `CONTENT_VERSION = 1`. Integer state throughout; machine progress in exact milli-ticks. Output registration DERIVED from the route table (`outputRouteIds`, #100); `outRoute` is a legacy byte-compat mirror only. `manhattanRun` is the deterministic BELT-001 tile walk. Optional fields (`branch`, `run`, counters, `research`, `spares`) are the migration seams. |
| `invariants.ts` (68 ln) | Ledger helpers | `systemTotals` counts every unit once across store/overflow/inBuf/tray/batch/cargo/drone-flight; `unitTotal`, `netRecipeUnits` (recipe net × batchesDone), `allQuantities` (nonnegative-safe-integer gate). |
| `offline.ts` (96 ln) | `catchUp(s, lastSeenMs, nowMs)` | Cap `TUNING.offlineCapTicks = 432000` (12 h at 100 ms). Clock rollback clamps to zero extra production (`Math.max(0, …)`); `lastSeenMs` replaced by caller so the discarded tail cannot be re-claimed. Return report: gains, credits, deliveries, batches, bottleneck. |
| `plan.ts`, `autoconnect.ts`, `diagnostics.ts` | Planning / suggestion helpers | Pure reads of state; no authority. |

### Economy / content — reusable as-is
- `content/defs.ts`: `TICK_MS = 100` (100 ms economy tick retained per technical contract); 15 resources, 8 blueprints, 12 recipes; `TUNING` incl. `dockCapacity 900`, `beltCostPerTile 1`, `dismantleRefundPct 90`, `reserveFloor 10`, `sellBatchCap 60`, `starterWreckPool 30`, `manualSalvagePerPulse 5`, `manualPulseTicks 6`, `offlineCapTicks 432000`.
- `content/research.ts`: 3 nodes (`cutters`, `buffers`, third node), integer effects via `researchBonus`.
- `economy/quantity.ts`: integer quantity gate (`isQuantity`/`assertQuantity`), exact rational milli-tick accumulation `addRational` (power-limited progress), deterministic `isqrt`.
- `content/validate.ts` + `scripts/validate-content.mjs` (`pnpm validate`): one content+behaviour gate shared by tests and CI; 0 violations at this SHA.

### Persistence — `src/game/persistence/` (reusable; gaps in §6)
- `save.ts`: `SAVE_KEY = "rustwake.save.v1"`. Envelope `{schemaVersion, checksum, payload{sim,lastSeenMs,settings}}`; FNV-1a checksum over the serialized payload. `decodeSave` order: empty → parse → schema → checksum → `repairRegistration` (#100 load-path repair, before validation) → `validateSim` (first violated invariant as `detail`) → `sanitizeSettings` (UI-RESET-63: textScale clamped [1,2], booleans literal-only). `migrate` backfills pre-feature v1 keys (research, spares, measurement counters, rate windows) without moving a unit; idempotent; does NOT invent `run`/`branch` (pre-price/pre-fork arithmetic preserved). `clearSave` removes save + lease atomically-enough for reset (guarded).
- `lease.ts`: `LEASE_KEY = "rustwake.lease.v1"`, `LEASE_TTL_MS = 1500`. One writer; claim adopts only absent/own/expired leases; corrupt records read as absent; storage failures degrade to in-memory.

### Workers — `src/game/workers/` (reusable)
- `catchup.ts`: `CATCHUP_PROTOCOL = 1`; worker hop only for absences ≥ `CATCHUP_WORKER_MIN_TICKS = 20000` (≈33 min); 2 s timeout then identical inline fallback; version+id matching rejects stale responses; `cancel()` invalidates in-flight results. One implementation (`handleCatchUp`) shared by worker entry and sync path.
- `catchup.worker.ts`: 21-line message entry around the same pure function.

### App boundary — `src/app/store.ts` (reusable; renderer-agnostic)
Two clocks (epoch `now` for absence/lease, monotonic `frameClock` for interpolation). Writer persists a checkpoint every `PERSIST_MS = 1000`; followers reconcile every `RECONCILE_MS = 100` and adopt whole snapshots (tick/revision newer wins). `MAX_TICKS_PER_FRAME = 20`, accumulator clamped at 40 ticks. During a worker handoff the world freezes; typed commands queue (≤32) and replay in order on the adopted snapshot. `importSave` is an atomic whole-yard swap that resets `lastSeenMs` to now; any refusal leaves live state untouched. `getFramePhase()` gives the renderer an interpolation phase without clock reads. Boot: decode+migrate, else fresh yard (see gap G1).

### Renderer / UI boundary (replace, do not extend)
`src/game/renderer/{scene,camera,gestures,motion,sprites}.ts` is Canvas 2D presentation reading state; `src/ui/**` React dispatches named commands. The technical contract replaces the Canvas 2D world behind this boundary; gesture correctness and economic coverage are retained.

### Version pins
`schemaVersion 1`, `contentVersion 1` (stored in every sim), `CATCHUP_PROTOCOL 1`, save key `rustwake.save.v1`, lease key `rustwake.lease.v1`. No content-version migration branch exists yet (gap G4).

## 2. Reuse verdict for the voxel rebuild

Retain unchanged behind the renderer boundary: simulation core, economy/content tables, quantity math, save/lease persistence, catch-up worker, store loop. The 13 commands map onto the contract's command families (building.place/move/upgrade/dismantle, road/route, contract, research, fleet); `commandId` idempotency and validate-or-nothing semantics already match. 2D `machine.tile` integers + `manhattanRun` are the deterministic input a 3D plot mapping must consume (contract: nonoverlapping plots, deterministic mapping, overflow retained, explicit conversion preview when exact mapping is unavailable). New 3D fields must follow the existing optional-field migration seam so untouched v1 saves stay byte fixed points (§5 tests enforce this).

## 3. Checked-in fixture inventory (`tests/legacy/fixtures/`)

11 fixtures + `manifest.json` + `artifacts.json` (valid-JSON aggregate of exact envelope texts, needed because `bad-truncated` is intentionally invalid JSON). All produced by the REAL command/engine/save path at base SHA via `tests/legacy/fixtures-lib.ts`; the simulation has no RNG/wall clock, so each fixture's "seed" is its fixed command script. Fixed checkpoint clock `lastSeenMs = 1700000000000` for all. Balances below are the LOADED view (decode+migrate) as pinned in `manifest.json`; orphan rows quote STORED (damaged) balances with the quantified repair delta.

### Healthy saves
| Fixture | Shape | Seed (command script) | tick / rev | credits | unitTotal (store) | machines / routes | Per-resource totals | sha256 |
|---|---|---|---|---|---|---|---|---|
| `salvage-early.legacy` | legacy-v1-stripped (research/spares/counters/run/branch removed) | 6×(manual.salvage+6t), drone.repair, 262t | 298 / 7 | 0 | 25 (25) | 0 / 0 | scrap 25 | `89629a19640b819bf67cf5d0a4a4b23976268d7c657ae6da427238e19fea3f7c` |
| `chain-export.modern` | modern | early + sorter@8 + 2 routes + 400t + furnace@9 + 2 routes + 900t + contract.export | 1598 / 14 | 30 | 98 (90) | 2 / 4 | scrap 60, ferrous 3, nonferrous 28, steel 7 | `01a19ee2b6582cbc1c1398159846897d761fdba040604d6b3e2a0c0128456e64` |
| `deep-yard.modern` | modern (settings: muted, reducedMotion, textScale 1.5) | chain + sells + upgrade(speed) + temp belt + fund loop + 5 builds + 2 route.remove + 9 routes (store-fed assembler) + settle/sell loop + research.cutters + drone.add + upgrade(buffer) + boosted pulse + 600t | 11704 / 47 | 1437 | 418 (396) | 7 / 12 | scrap 111, ferrous 48, nonferrous 167, steel 31, wire 34, polymer 10, data 12, copper 1, residue 3, circuits 1 | `5e9269975edc29463eef2e068bbca820ab9610640cd3fa9ae49535a847cb250d` |

Wreck/fleet balances (all three): early wreck {remaining 5, generation 2, pulses 6}, fleet {1 unit, 5 deliveries, 25 accumulated}; chain wreck {25, 7, 6}, fleet {1, 31, 155}, exportClaimed true, tutorial 7; deep wreck {30, 43, 7}, fleet {2 units, 244 deliveries, 1225 accumulated}, research {cutters: 1}, exportClaimed true, tutorial 9. Store capacity 900 everywhere.

### Damaged saves (pre-#100 orphan registration, reconstructed)
| Fixture | Stored balances | Repair on load (quantified from TUNING only) | sha256 |
|---|---|---|---|
| `orphan-route.modern` (priced runs) | tick 1600 / rev 15, credits 30, unitTotal 117 (store 111), 1 machine / 4 routes; totals scrap 74, ferrous 8, nonferrous 28, steel 7 | drop 2 orphan belts; returned cargo 0 units (belts empty at damage tick); scrap refund **+5** → loaded unitTotal 122, store 116, scrap 79, routes 2 | `1e62fe6c4d9c3c01cfb6004efe6a78953dad52ea1960a3239fbf7f0e0c5ea17e` |
| `orphan-route.legacy` (pre-price, no `run`) | same stored balances | drop 2 orphan belts; refund **0** (no priced run) → loaded unitTotal 117 unchanged, routes 2 | `0fa600f152651c8537acfa60c2d24ff9eb319f3bfd0f18b0023a2ee6c03ba51d` |

Damage recipe: live `machine.dismantle(furnace)` (which today refunds/drops belts), then the two belts and the stale `outRoute` mirror restored exactly as the old defect left them, envelope re-checksummed — so the ONLY damage is the orphan registration.

### Adversarial envelopes (E08 negatives; meta quotes the healthy source yard)
| Fixture | Attack | Expected decode result | sha256 |
|---|---|---|---|
| `bad-checksum` | one checksum digit flipped | reject `checksum` | `7c7155444094af9b8618e94a799d0adf7bdbf15f086fa5f5136c855ada9ecd91` |
| `bad-truncated` | envelope cut at 60% of bytes (584 of 974; interrupted write) | reject `parse` | `6cd54fb99a1b764ad3c1aa22cd031352adf120ee77b280578368227c11450156` |
| `bad-duplicate-id` | furnace carries sorter's id, re-checksummed | reject `invalid`, detail `machineId:1` | `bc7660f24605f4a13d9ac94a929746641216fff85bd132826fe64bd935f63d6e` |
| `bad-negative-store` | store.scrap = −5, re-checksummed | reject `invalid`, detail `store` | `00e85229a7f1c0a713aeef7de9d770cadff053a2d08fd7bc063d475ba348f51a` |
| `bad-schema` | schemaVersion 2 | reject `schema` | `038511abdcfdc514fd7383729d828de002727aff7b8921123b81d73abed00481` |
| `bad-settings` | settings {muted:"yes", reducedMotion:1, textScale:99}, re-checksummed | accept, sanitized to {muted:false, reducedMotion:false, textScale:2} | `ca02b98e212062a661d26e6770f15c966831c18294cc9ec7aee4ec7d572a756b` |

Aggregates: `manifest.json` sha256 `aa04dc64e71e39fb70cc70db693153fb7c35414e852e673f5b3f1d95e0448fec`; `artifacts.json` sha256 `c26cf5da9c5f05bedbb9465d7707cc9a730c78a5323ae6e529b2275bc8035fba`.

### Reproducibility (verified, not claimed)
`pnpm exec tsx tests/legacy/generate-fixtures.mjs` regenerated all 13 files; sha256 of every file before vs after is identical (exit 0). The characterization suite additionally regenerates every fixture in-process and asserts byte equality against the checked-in aggregate, so engine/content/save drift fails the suite instead of silently re-pinning artifacts.

## 4. Checks run (real exit codes)

| # | Command (worktree root) | Expected | Actual | Exit |
|---|---|---|---|---|
| 1 | `pnpm exec vitest run tests/legacy` | all legacy characterization green | 3 files / 22 tests passed (fixtures 10, conservation 3, migration 9), 1.20 s | 0 |
| 2 | `pnpm test` (full suite, run once) | characterize current state | 63 files / 768 tests passed, 18.91 s; no pre-existing failures | 0 |
| 3 | `pnpm exec tsx tests/legacy/generate-fixtures.mjs` + sha256 before/after | byte-identical regeneration | 11 fixtures + manifest + artifacts written; all 13 sha256 identical | 0 |
| 4 | `pnpm validate` | content/behaviour gate clean | 15 resources / 8 blueprints / 12 recipes / 3 nodes; 0 content + 0 behaviour violations | 0 |
| 5 | `pnpm typecheck` | strict tsc over src+tests incl. new files | clean | 0 |

`pnpm-lock.yaml` is a local install artifact, deliberately untracked and NOT committed (repo tracks `package-lock.json`).

### E01 coverage (`tests/legacy/conservation.test.ts`)
- Pure-advance conserved quantity `unitTotal − netRecipeUnits − fleetAccumulated` held for all 5 save fixtures across steps [1, 9, 90, 400, 1500]; every internal quantity a safe nonnegative integer at each step; wreck-pool drain equals fleet extraction during pure advance.
- Per-command lifecycle accounting on `deep-yard.modern`: sell (−qty units, +price×qty credits), build (−buildCost units), connect (−beltCost(run) scrap), upgrade (−branchPrice credits, 0 units), remove (+refund), dismantle (+90% build-cost refund), research.buy (−data cost), drone.add (−credits, +1 spare, 0 units), manual.salvage (+pulse amount from wreck, incl. research bonus) — each delta exactly table-derived.
- Command-id retry: same id returns the same revision and leaves the serialized state byte-identical.

### E08 coverage (`tests/legacy/migration.test.ts`, `fixtures.test.ts`)
- Legacy backfill without adding `run`/`branch`; every balance (totals, unitTotal, credits, tick, revision, tutorial, wreck) preserved across migrate for every save fixture; migrate idempotent.
- `repairRegistration` drops exactly the dangling belts and refunds exactly the priced scrap (modern +5 / legacy +0), no-op on healthy saves, idempotent on repaired ones; no route may reference a missing machine afterwards.
- All 5 reject envelopes refused by `importSave` with the documented reason/detail while the live yard object is unchanged; hostile settings sanitized on boot and import.
- Round trip is a byte fixed point after one migrate (encode→decode→migrate→encode identical).
- Store boots a saved yard at its checkpoint tick as writer; deeper-yard import swaps wholesale.
- Two tabs on one storage: second tab read-only (dispatch and import refused `read-only`), only the owner advances; after `LEASE_TTL_MS + 1` the follower takes over and the original owner is demoted — still one writer.

## 5. Save / migration / recovery impact for the rebuild

1. The checked-in bytes are now a contract: any change to engine/content/save code that alters these envelopes fails `tests/legacy` (byte-equality + pinned balances). The voxel rebuild must keep `decodeSave`+`migrate` accepting them unchanged.
2. 3D plot mapping must be additive via the optional-field seam (`run`/`branch` precedent): migrate backfills defaults, never renumbers or discards; untouched saves stay byte fixed points; migration stays idempotent and fixture-tested (technical contract "Saves and migration").
3. Interrupted writes: the writer checkpoints every 1 s; a truncated envelope is refused (`parse`) and the last complete checkpoint is what boot loads — characterized by `bad-truncated`. Up to ~1 s of progress can be lost between checkpoints; that is the existing recovery semantics, unchanged here.
4. Offline settlement (cap 12 h, rollback → 0, event-jump ≡ tick-by-tick) is already covered by `tests/simulation/offline.test.ts` and `catchup-worker.test.ts`; not duplicated in `tests/legacy`.

### Gaps found (characterized, NOT fixed in this issue)
- **G1 — corrupt boot discards silently.** On any decode failure at boot the store falls back to a fresh yard; no legacy slot / snapshot of the damaged save is retained (`migration.test.ts` pins this behavior). Conflicts with the executive contract's "never silently discard or reset"; needs a follow-up issue before 3D migration ships.
- **G2 — no payload size cap.** `decodeSave` imposes no bounded-size check before `JSON.parse` (contract requires bounded sizes pre-import). Adversarial oversized envelopes are not yet refused for size.
- **G3 — single-writer lease is cooperative.** TTL 1500 ms with storage-mediated claims; a hostile tab can rewrite the lease record. Adequate for local multi-tab, insufficient for online authority (contract's server-owned section).
- **G4 — `contentVersion` stored but never branched on.** No migration path exists for a future content-table version bump; must be designed with the 3D content tables.

## 6. Obsolete renderer / art-pinning retirement candidates (for #132 — NOTHING deleted here)

Listed separately from economic invariants per the technical contract ("exact pixel-count and paint-operation tests are historical characterization, not a mandate for the 3D renderer").

Retire/replace when the 3D renderer lands:
| Test file | its | Why obsolete in 3D |
|---|---|---|
| `tests/renderer/silhouette.test.ts` | 37 | ART-003/004/005/006/007 silhouette distinctness, ink shares, contact shadows, paint-op counts, rasterized pixel rows, and the 233000 B entry-chunk ceiling — all pin Canvas 2D art. The byte ceiling must be re-declared against the contract's ≤8 MB compressed payload, not lifted silently. |
| `tests/renderer/scene-draw.test.ts` | 46 | Canvas 2D drawScene paint-operation/pixel characterization. |
| `tests/renderer/world-60.test.ts` | 16 | World paint pinning (apron/palette/part tuples) + `world-60.evidence.mjs` capture tooling. |
| `tests/renderer/belt-extent.test.ts` | 4 | 2D belt extent line drawing. Belt ECONOMICS (cost/run length/refund) live in simulation tests and are retained. |
| `tests/renderer/drone-leg.test.ts` | 11 | Drawn-leg parameter for the 2D painter (DEF-004). Underlying stale-anchor simulation behavior stays covered by `tests/simulation/fleet.test.ts`. |
| `tests/renderer/camera-50.test.ts` | 18 | 2D camera clamp/zoom math bound to `WORLD_W/H`; retarget to the 3D camera contract rather than keep as-is. |

> **Erratum (2026-11-14, issue [#195](https://github.com/darkmatter2222/Rustwake/issues/195); original §6 table preserved above by reference — not rewritten).** The `its` column is wrong for three of the six retirement candidates. Corrected counts: **silhouette 37 → 28**, **scene-draw 46 → 43**, **drone-leg 11 → 5**. The other three are confirmed correct: world-60 16, belt-extent 4, camera-50 18. Independently verified by the PR #192 reviewer (comment [6871705424](https://github.com/darkmatter2222/Rustwake/issues/192#issuecomment-6871705424)) and re-verified here for #195 (dispatched by coordinator guidance 6876145505).
>
> **Verification method — historical SHA, because the files no longer exist at main.** All six `tests/renderer/*.test.ts` retirement candidates were retired by #198 and are absent at current main (`9a31ffc`), so counts were taken at the audit's merge SHA `1b83c58bd103a1a4a0f4529e820a7e4409685def` via `MSYS_NO_PATHCONV=1 git show 1b83c58:tests/renderer/<file>` and counting `it(` declarations (regex `(^|[^A-Za-z0-9_.])it\(` — a bare `it(` not preceded by an identifier character or `.`). No `it.each`, `it.skip`, `it.only` or `it.todo` occurs in any of the six files, so each `it(` is exactly one vitest test (no parameterized expansion, no skipped tests). Per-file results at `1b83c58`:
>
> | File | §6 as written | Verified `it(` | Δ |
> |---|---|---|---|
> | `silhouette.test.ts` | 37 | **28** | −9 |
> | `scene-draw.test.ts` | 46 | **43** | −3 |
> | `drone-leg.test.ts` | 11 | **5** | −6 |
> | `world-60.test.ts` | 16 | 16 | 0 (control) |
> | `belt-extent.test.ts` | 4 | 4 | 0 (control) |
> | `camera-50.test.ts` | 18 | 18 | 0 (control) |
>
> Honesty notes: (1) `silhouette.test.ts` also contains one `test(` at line 898, but it is a local predicate parameter (`const band = (test: (x: number, y: number) => boolean) => …`, line 897), not a vitest test — the file imports only `{ describe, expect, it }` from vitest, so it is excluded from the count. (2) The three corrected blobs are byte-identical between the audit's base `8b78d09f` and its merge `1b83c58` (silhouette `9f645769`, scene-draw `f261a68f`, drone-leg `f290ab03`), so §6 was inaccurate at the audit's own base rather than a later drift — matching the PR #192 reviewer's empty `git diff 8b78d09 HEAD -- tests/renderer/` finding. (3) This is a docs-only correction by reference: no test, source or contract file is touched, and the §6 retirement verdicts are unchanged (only the counts). The corrected counts are carried independently by G0 / PR #192.

Keep (explicitly NOT retirement candidates):
- `tests/renderer/gestures-50.test.ts` (16 its) — gesture state machine is presentation-agnostic; the contract mandates keeping gesture correctness. Retarget inputs to the 3D view, keep the contract.
- All economic invariants: `tests/simulation/**` (17 files: economy, belt, chain, fleet, fork, logistics, offline, catchup-worker, registration-100, research, cadence, rate-window, supply-window, plan, autoconnect, diagnostics), `tests/persistence/**` (save, lease, transfer), `tests/content/validate.test.ts`, `tests/perf/bench.test.ts` (headless CPU core timings — keep, re-baseline with declared 3D scene/hardware), and the new `tests/legacy/**`.
- UI tests asserting command dispatch, settings, save/import flows (e.g. `save-63`, `settings-62`, `onboard-64-command-id`) — retarget with the UI, not retire.
- Historical art evidence (`docs/evidence/*art*`, `scripts/art003-*.mjs`, `scripts/measure-*.mjs`, `src/game/renderer/PROVENANCE.md`) stays preserved as legacy evidence per AGENTS.md.

## 7. Limitations

- Fixtures are derived from the live engine at base SHA, not captured from real historical player saves (no such corpus exists in-repo). The legacy shape is reconstructed by deleting exactly the keys a pre-feature v1 encoder never wrote, preserving survivor key order; `migrate` is the only code that adds them back.
- "Seed" = fixed command script (simulation has no RNG/wall clock); `lastSeenMs` pinned to 1700000000000. Orphan damage is reconstructed (live dismantle + belt/mirror restore); at the damage tick the orphan belts carried no cargo, so returnedItems is empty and compensation is the belt refund only.
- Tests run under jsdom with in-memory storage doubles: no real-browser localStorage multi-tab or real worker-thread evidence here (worker path is covered separately by `catchup-worker.test.ts`).
- No src/ or existing-test modifications; no infrastructure changes. G1–G4 are documented, not fixed. No visual evidence produced or required (audit-only issue); visual fidelity remains for vision-capable review of the renderer issues.
- Full suite green at this SHA (768/768); nothing pre-existing was fixed, skipped or deleted.

## 8. Evidence template fields

Role: developer · Issue: #129 · PR: linked draft (see issue comment) · Immutable SHA: PR head (base 8b78d09f) · Scenario+seed+save hash: §3 table (script seeds, per-fixture sha256, lastSeenMs 1700000000000) · Device/browser/quality: headless Node v26.3.0 / vitest 2.1.8 jsdom on Windows 10.0.26200 — not device evidence · Commands: §4 · Expected/actual: §4 · Exit codes: all 0 (§4) · Screenshots/motion/audio: none (not applicable) · Capability gaps: G1–G4 (§5), §7 · Verdict: handed off for independent QA + product decision; author does not self-accept.