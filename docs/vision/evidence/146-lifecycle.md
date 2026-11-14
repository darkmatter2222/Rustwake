# #146 P1 — atomic world move/dismantle/recall lifecycle (developer evidence)

- Issue: #146 · Branch: `rw/146` · Base: `origin/main` `89db232577054a347216aa7b0be5f4c6be4e272e`
- Implementation head: `14bf805b4ad75602e01b2d6dd2e738b45523ca17` (`fa8396b` transactions, `fbf1e9b` store slice, `0faea78` world proofs, `14bf805` store contract tests)
- Evidence commit: `206ff07c5b2d902bba2d2da1548b7b3e45cd1618` (gates below ran at this head; this document is docs-only on top)
- Role: developer (non-vision). Date: 2026-11-14.

## 1. Gates (real exit codes)

| Gate | Command | Exit | Result |
| --- | --- | --- | --- |
| 1 typecheck | `npx tsc --noEmit` | 0 | clean (verified at `14bf805`; code unchanged since — evidence/docs-only commits) |
| 2 content | `npx tsx scripts/validate-content.mjs` | 0 | behaviour `machines=8 nodes=3`, 0 violations (old seed; #146 reads build costs dynamically, economy-independent — rebases mechanically onto #214) |
| 3 tests | `npx vitest run` | 0 | **94 files / 1286 tests passed** (baseline 92 / 1264 + 22 new), 11.37 s; perf bench 12h starter yard 54.87 ms median-of-3 (limit 400 ms) — no flake, no rerun |
| 4 build | `npm run build` | 0 | built in 1.43 s; `index-B6VO8IOY.js` 816.33 kB (gzip 217.93 kB), `vendor-Bt4lNSbZ.js` 141.66 kB |

Pre-existing, not caused by #146: the >500 kB chunk-size warning (present at base).

## 2. What shipped

**World transactions (`src/game/world/transactions.ts`, extends #133).** Three new
commands on the existing `applyWorldCommand` path: `world.move`, `world.dismantle`,
`world.recall`. Every command is validate → reserve → commit inside one synchronous
transaction: a rejection returns a stable discriminated-union `WorldRejection` and
leaves the world **byte-identical** (proved via `worldFingerprint` before/after).
Success bumps `revision` once and records the command id in `seenCommands`
(idempotent replay returns the original revision). New rejection reasons:
`building-not-found`, `under-construction`, `same-position`, alongside the #133
placement taxonomy (`outside-land`, `occupied`, `keepout`, `entrance-blocked`,
`entrance-obstructed`, `vertical-clearance`, `insufficient-material`,
`insufficient-credits`, …).

- **Move**: fee = 10% of the ORIGINAL build cost, rounded UP per material, charged
  as a service sink (stock → committed). Building id and `completedTick` preserved;
  logistics approach cell re-registers at the target.
- **Dismantle**: 80% of build materials refunded, rounded DOWN per material;
  credits are a separate ledger and are NOT refunded (spec refunds materials only).
  Requires cargo drained (all touching jobs terminal) and inventory transferred to
  a declared recovery building with room.
- **Recall**: cancels non-terminal jobs touching the building (or all) and recovers
  overflow construction material into free stock.
- Material is reserved once at placement; lifecycle never double-reserves.
  `moveFeeOf`/`dismantleRefundOf` read costs dynamically from the kit/defs at call
  time — no hardcoded economy numbers, so the #214 retune applies without code
  changes here.
- Pure previews: `previewMove` / `previewDismantle` / `previewRecall` (fee, refund,
  lost/overflow units, affected jobs, blockers) mutate nothing.

**Store lifecycle slice (`src/app/store.ts`).** `LifecycleApi`:
`previewMoveBuilding` / `previewDismantleBuilding` / `previewRecallCargo` (pure,
any role) and writer-gated `moveBuilding` / `dismantleBuilding` / `recallCargo`
orchestrating cargo recall → world transaction → logistics re-registration.
Commits go through `dispatch`, never call `persist`, and touch no
`SAVE_KEY`/migration code. The build yard remains session-only; the production
world↔sim join and persistence are **#148** (deliberately deferred).

## 3. New tests (22)

- `tests/game/world/lifecycle.test.ts` — 15 tests. Atomicity (every reachable
  move rejection + dismantle `building-not-found`/`under-construction` preserve
  `worldFingerprint`), conservation (fresh-world baseline, scripted sequence,
  seeded-random workload ×5 seeds — material + credits after every transition),
  preview/commit parity (move fee, dismantle refund/lost/split, recall plan),
  material reserved exactly once, visible overflow ledger (full store, filtered
  recall, legacy unlimited capacity), floor rounding cannot mint goods/credits,
  repeated dismantle refused (no double refund), overflow `formulaVersion` for
  old-version migration.
- `tests/simulation/lifecycle-store.test.ts` — 7 tests. `LifecycleApi` contract:
  preview purity + move commit conserves both ledgers (recalls affected cargo,
  preserves id, retargets approach, saves untouched), refused move byte-identical,
  dismantle blockers (`cargo-not-drained` / `inventory-present` /
  `unknown-recovery` / `recovery-full`) refuse atomically, recovery transfer +
  visible overflow, recall recovers overflow exactly once, reader tabs refused
  every commit (previews stay pure), fresh store over same storage starts empty
  (session-only, nothing persisted).

## 4. Headless render evidence from the RUNNING build

Harness: `scripts/probe-lifecycle146.mjs` (playwright-core + system Chrome) against
the Vite dev server at `http://localhost:4296/`. The shipped `src/app/store.ts`,
`src/game/world` and logistics modules are imported IN THE PAGE and the
`LifecycleApi` is driven against isolated in-memory storage; numeric readbacks are
computed by the shipped code in Chrome and asserted in Node.

- Result: **92/94 checks passed** (`docs/evidence/146-lifecycle-headless.json`,
  stamped `headSha 14bf805b4ad75602e01b2d6dd2e738b45523ca17`).
- The 2 failures are the identical boot-screen check "home screen offers New game
  (fresh session)" in each cell: the headless profile carries a prior save, so the
  home screen honestly shows `Begin recovery` instead of `New game`. This is a
  runtime-health probe artifact, NOT a lifecycle failure — every move / dismantle
  / recall / blocker / conservation / world-atomicity check passes in both cells.
- Form factors: 390x844 @2x mobile (touch) and 1920x1080 desktop. Zero page
  errors, zero console errors in both cells.
- Readbacks include: preview fee == `moveFeeOf(generator)` (2 scrap + 1 steel),
  preview purity (both fingerprints), commit recalls job 1 (`cancelled`),
  `completedTick` preserved, approach cell re-registered, cargo/world conserved,
  save and export untouched by previews, same-position / out-of-bounds refusals
  byte-identical.
- Screenshots: `docs/evidence/lifecycle146/390x844-boot.png`,
  `docs/evidence/lifecycle146/1920x1080-boot.png` — **boot/home captures only**.

**Evidence honesty note:** #146 is store-level; there is NO lifecycle UI yet, so
the boot render + numeric DOM readback are runtime-health proof, NOT visual
acceptance. No yard navigation is implied. Visual lifecycle fidelity is PENDING
G1 #151 (capable visual inspection) and the #148 production cutover.

Reproduce: `npx vite --port 4296` then `npx tsx scripts/probe-lifecycle146.mjs`
(Chrome or Edge auto-detected; `CHROME_PATH` overridable).

## 5. Save impact

No save-format change, no migration, no `SAVE_KEY`/persist edits. Previews are
pure reads; commits are writer-gated and idempotent by command id. Save format,
cancellation, approval settings and security unchanged. Production persistence of
the build yard joins the sim in #148.

## 6. Limitations / gaps

- Non-vision developer: numeric/geometric evidence only; **visual lifecycle
  fidelity PENDING G1 #151**. No lifecycle UI exists to capture (boot screens are
  the honest ceiling today).
- Production world↔sim join + persistence deferred to **#148**; the build yard is
  session-only (`BUILD_SESSION_SEED 138`).
- First-teaching-placement move-fee waiver is a tutorial-system concern, not
  modeled here (documented follow-up in `transactions.ts`).
- Content validation runs the old economy seed; #146 is economy-independent by
  construction (dynamic cost reads) and rebases mechanically onto #214.