# RW3D T11 (#138) — build catalog and placement/rotation controls

Role: developer (non-vision agent). Issue: #138. Specs: U01 (ghost facts before
commit), U02 (explicit confirm/cancel + repeat, no accidental buys), U03
(locked/unaffordable reasons with preserved context). Authority: the frozen
`validatePlacement` transaction (#133) — the preview calls it directly, so the
ghost never lies.
Branch: `rw/138-build-catalog`. Draft PR: linked on issue #138.

## Heads

| What | SHA |
| --- | --- |
| Base (origin/main) | `66f5fc29efa09ae22b4a6241cb13f6af9f5908e2` |
| Implementation + evidence commit | recorded in the PR head stamp |

All gates below ran once, at the final working tree that became the PR head.

## Continuation fix: why two game tests failed and what changed

The frozen `validatePlacement` rejects in a fixed order: unknown asset →
rotation → cell → land → **terrain** → occupied → keepout → entrance →
clearance → **material** → credits. Cost is checked last, so a cost-only
rejection proves the site is buildable. That order is correct for transactions
and was not changed (transactions.ts is frozen #133 authority).

The product bug was in arming: `firstFitCell` treated cost refusals as site
failures, returned `null` for an unaffordable asset, and the store fell back to
`{0,0}` — which on seed 138 is rough ground. The ghost then printed a terrain
refusal for what was really a cost problem, violating U03 ("unaffordable
entries arm with the exact shortfall").

Fix (all inside authorized paths):

- `src/game/world/buildCatalog.ts`: `firstFitCell` is now cost-tolerant — it
  accepts a cell whose only rejection is `insufficient-material` /
  `insufficient-credits` (`isCostRejection`). When affordable, the scan is
  byte-identical to the full legal scan (frozen parity test vs `findLegalCell`
  stays green). `labelForBuildReject` now names the terrain kind
  ("Rough terrain cannot support this building — pick flat ground.") instead
  of a generic site line.
- `tests/game/buildCatalog.test.ts`: the drained-stock case now pins the
  order contract explicitly — origin preview on drained stock must be
  `terrain-unsupported` with the kind-named label — then asserts the
  cost-tolerant arming: `firstFitCell` finds buildable ground and the preview
  there reports `insufficient-material` with exact shortfalls
  (`Need 8 steel (have 0).`). Determinism test extended: a drained clone
  (steel 0, credits 0) yields the same `firstFitCell` as a fresh world for all
  four rotations. Local `expectBuildOk` / `expectBuildReason` assertions narrow
  `BuildConfirmResult` before delegating to the frozen helpers (which speak
  `WorldCommandResult`); frozen helpers untouched.

Seeds: world-helper tests use SEED 133 (origin footprint crosses salvage at
(1,0)); the store's session yard uses `BUILD_SESSION_SEED = 138` (origin
footprint crosses rough at (4,0)). Both are pinned by tests.

## Design summary

- `BUILD_CATALOG`: all 8 kit assets in `WORLD_ASSET_IDS` order, mirroring kit
  footprint/cost/credits/assembly ticks (kit-parity test).
- `unlockStatusFor`: crane requires Route Dispatch research rank > 0;
  turret/wall_gate require ≥ 1 defense milestone token. Locked cards stay
  visible with their reason and never steal the armed selection.
- `previewBuildPlacement` = `validatePlacement` + typed label + exact
  have/need shortfalls; `BUILD_READY_TEXT` when clear.
- Store slice `BuildPlacementApi` (additive, G1 pattern like `SaveRecoveryApi`):
  select/aim/rotate/confirm/cancel/repeat; confirm is writer-gated and commits
  through `applyWorldCommand` (`build-138-<seq>`); preserve-on-refusal keeps the
  ghost armed with the typed rejection; repeat stays armed and charges each
  placement separately; cancel resets rotation, keeps the repeat preference.
  `step()` advances construction via `advanceWorld` (5 s assembly verified:
  49 ticks no change, tick 50 site → building).
- `src/ui/BuildTool.tsx`: catalog cards (name, footprint, cost, lock/shortfall
  reasons, aria-pressed), SVG minimap ghost (footprint cells, frontage arrow,
  orientation, clearance, cost, reason), rotate button + R key (suppressed in
  text inputs), repeat toggle, confirm/cancel. Reader tabs: cards disabled,
  read-only status line, confirm disabled.
- `src/ui/App.tsx`: additive entry button ("Open build catalog") and
  `PANEL_BUILD_TOOL = -11` panel in the one-panel stack. `shell.css`: additive
  build-tool styles only.

## Session-only yard: save/migration impact

The build yard is session-local per tab. The slice never reads or writes
`SAVE_KEY`; #148 owns the 2D→3D persistence cutover. Test proof: after a
confirm, the save slot has no build-world fields (`terrain`, `parcels`,
`milestoneTokens` absent from the envelope); the legacy sim persists on its
own cadence, unchanged. No migration, no schema change, no renderer/economy/
audio/road files touched.

## Gates (run once at final head)

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | pass, 0 errors |
| Content | `npx tsx scripts/validate-content.mjs` | 0 violations (15 resources, 8 blueprints, 12 recipes, 3 research nodes; behaviour 0 violations) |
| Tests | `npx vitest run` | **77 files / 1028 tests passed** (0 failed, 0 skipped) |
| Build | `npx tsc --noEmit && npx vite build` | built in 1.32 s; pre-existing >500 kB chunk warning only |

New coverage: `tests/game/buildCatalog.test.ts` 26 tests +
`tests/ui/build-catalog.test.tsx` 11 tests = 37 new tests. The UI suite drives
the real App in jsdom (clicks/keys only; ledger drains are fixture facts):
catalog list/costs/lock reasons, arming facts, grid re-aim without spend,
atomic confirm (scrap 120→90, steel 12→4, credits 60→40, 1 site), cancel
byte-identical ledger, repeat (sorter 20 scrap each: 120→100→80, occupied
ghost keeps Confirm disabled until re-aim), rotation button + R key through
all four quarter turns, locked-refusal context, unaffordable arm + top-up
recovery, rough-ground reason order, reader-tab gating.

## Limitations

- Ghost is an SVG minimap preview, not a 3D scene overlay; visual fidelity
  QA on the running build is pending (non-vision agent cannot self-certify).
- No audio feedback; no road interaction (#139 scope).
- Build yard does not survive reload by design (#148 owns persistence).
