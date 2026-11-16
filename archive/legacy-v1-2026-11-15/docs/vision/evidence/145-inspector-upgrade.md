# #145 T18 — building inspector + explicit upgrade comparison (developer evidence)

- Issue: #145 · Branch: `rw/145` · Base: `origin/main` `4cb479f715673e9082cd9628e62c5b0157a37bcc`
- Implementation head: `e467fc22b4f18125098e8cf7476a52402e5b49e5` (commits `dc9bb44` U05, `e467fc2` U06)
- Role: developer (non-vision). Date: 2026-11-14.
- Acceptance targets: U05 (inspector production rows + upgrade before/after equal the engine) and U06 (focus source/route/power without losing the selected entity).

## 1. Gates (final tree, real exit codes)

| Gate | Command | Exit | Result |
| --- | --- | --- | --- |
| 1 typecheck | `npx tsc --noEmit` | 0 | clean |
| 2 content | `npx tsx scripts/validate-content.mjs` | 0 | 15 resources, 8 blueprints, 12 recipes, 3 research; behaviour `firstDrone=379 firstResearch=527 tick=18298 machines=8 links=18 drones=4 batches=1838 credits=157 nodes=3`; 0 violations |
| 3 tests | `npx vitest run` | 0 | 90 files / 1242 tests passed (baseline 88 / 1210 + 32 new), 11.46 s, no perf flake |
| 4 build | `npx tsc --noEmit && npx vite build` | 0 | built in 1.41 s; `index-r83wkijZ.js` 806.11 kB (gzip 214.79 kB), `vendor-Bt4lNSbZ.js` 141.66 kB |

Pre-existing, not caused by #145: the >500 kB chunk-size warning (present at base) and the
`ReactDOMTestUtils.act` deprecation notice (same pattern as the 34 existing UI test files).

## 2. New tests (32)

- `tests/ui/inspector-145.test.tsx` — 24 tests. U05: production rows equal engine readings
  (seeded rate window 0.5 batches/60 s; live-yard `maxRate` 0.25; buffers vs
  `inputCapacityOf`/research bonus; recipe quantities; `diagnoseMachine` evidence/advice;
  exact bottleneck sentences for the 0.6 power cap "0.15 batches/s", starved "2 scrap",
  full tray "12/12", busy link 90%, no-links). U06: `focusSource`/`focusRoute` derivations,
  focus faces via real rendered buttons (no dispatch, title/cell intact), logistics-view
  `focusedRouteId` bridge, power pane open/close/re-open, `clampCamera`/`refitCamera` numerics.
- `tests/ui/upgrade-145.test.tsx` — 8 tests. Every card equals `upgradeComparison`
  (rate/power/capacity/cost); branch semantics (speed only rate, buffer +6 capacity only,
  draw only power; sorter draw disabled at the 1-unit floor; furnace draw 2→1); instant-apply
  note; detached shapes; purchase readback (level+1, branch, credits, `rateNow == prior rateNext`);
  blocked tap spends nothing; no auto-choice; copy hygiene.
- Fixtures are deterministic command-path replays (seeded store/credits only, real
  `applyCommand` + `advance`); no RNG. Command ids `i145-N` / `i145u-N`.

### Pre-existing duplicate-key warning (documented, not fixed)

`tests/ui/inspector-100.test.tsx` logs a React duplicate-key warning
(`scrap sorter → dock`) from `src/ui/inspector/ContextPanes.tsx` (`<Row key={row.label}>`,
line 60 at base `4cb479f`). Verified present at base via `git show origin/main:...`; the
#145 diff touches no `key=` lines. Left untouched per scope; flagged for a future issue.

## 3. Headless render evidence from the RUNNING build

Harness: `scripts/probe-inspector145.mjs` (playwright-core + system Chrome) against
`vite preview` of the gate-4 `dist/` at `http://localhost:4295/`. Seeds are encoded at
`Date.now()` (no offline catch-up), lease cleared, once-per-tab seed guard; every scenario
reads the save mirror back through `decodeSave(localStorage[SAVE_KEY])`.

- Result: **150/150 checks passed, exit 0** (`docs/evidence/inspector145-headless.json`,
  stamped `headSha e467fc22b4f18125098e8cf7476a52402e5b49e5`).
- Form factors: 390x844 @2x mobile (touch) and 1920x1080 desktop.
- Scenarios: `starved-source`, `live-route` (material flowing during capture), `power`
  (5 furnaces, demand 10 vs capacity 8, shared speed 80%), `upgrade-buy` (500 credits),
  `upgrade-blocked` (0 credits).
- Determinism witness: all five fixtures re-encode byte-identical
  (`starvedSourceYard f38c54ef`, `liveRouteYard e85b6f28`, `powerYard 3ba96436`,
  `upgradeYard-500 f635e1d0`, `upgradeYard-0 dfddda05`); witness clock 1_700_000_000_000.
- Camera contract: focus pans checked against the top-down clamp interval at both scale
  bounds of the pre-click `data-cam` stamp (pad 0.011, scale eps 0.0005); zoom preserved;
  desktop zooms to near `CAMERA_MAX_SCALE` first because the 192x224 world fits the
  1080p viewport at boot zoom (both axes legitimately pinned there).
- U06 invariants in the live yard: selection title/cell unchanged, revision unchanged by
  focus faces (ticks never bump revision), store balance untouched in inert yards.
- U05 invariants: painted spans equal the read model equal `upgradeComparison`; applied
  receipt read back from engine state (level 2, speed rank 1, 500→460 credits, revision+1);
  blocked purchase prints the engine's exact shortfall and mutates nothing.
- Zero page errors, zero console errors in both cells.
- 22 screenshots: `docs/evidence/inspector145/<cell>-<scenario>-<stage>.png`
  (pre/post focus pans, power pane, upgrade cards/selected/receipts).

Reproduce: `npx vite build && npx vite preview --port 4295` then
`npx tsx scripts/probe-inspector145.mjs` (Chrome or Edge auto-detected; `CHROME_PATH`,
`INS145_SHOTS` overridable).

## 4. Save impact

UI-only, read-only display. No persisted-state mutation by the inspector or the comparison
cards; focus faces dispatch nothing (probe asserts revision unchanged in inert AND live
yards). Purchases go through the existing engine `machine.upgrade` command path — no new
save fields, no migration, no store slice; `src/game/*` and `src/app/store.ts` untouched.
Save format, cancellation, approval settings and security unchanged.

## 5. Limitations

- Non-vision developer: screenshots are geometric/numeric evidence from the running build,
  NOT a visual-fidelity certification. **Capable visual inspection PENDING at G1 #151.**
- Routes context pane is exercised via the model/bridge tests, not opened in the probe
  (deliberate; documented in the test header).
- The 16.5 bpm speed anchor is float arithmetic (`16.4998…`); tests/probe compare within
  0.01 and the painted `formatRate` rounds to 16.50.