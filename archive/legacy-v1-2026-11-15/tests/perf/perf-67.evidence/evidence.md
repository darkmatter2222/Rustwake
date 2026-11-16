# UI-RESET-67 — performance evidence (Phase 3)

- **Issue:** https://github.com/darkmatter2222/Rustwake/issues/67
- **PR:** https://github.com/darkmatter2222/Rustwake/pull/116
- **Branch:** `rw/67-perf`
- **Code head (FROZEN):** `2ac4213b4f486555e4e29e8ccdb2022c8f0d8e6f` — Phase-2 memoization. `src/` is byte-identical to this commit across every evidence commit (`git diff 2ac4213 HEAD -- src/` is empty). No source was re-authored, reverted or "improved" while finishing this issue.
- **Before baseline:** `f80726970287a9c6da96e0c475b77dc0daccd96b` (main, pre-optimization).
- **Role:** developer | dev-67b (resume-to-finish; evidence/verification only).
- **Probe generated:** before `2026-11-13T07:33:43Z`, after `2026-11-13T07:55:21Z`.

This file is the narrative receipt. Machine-readable summary: [`results.json`](./results.json).
Budgets and protocol: [`docs/PERF_BUDGETS.md`](../../../docs/PERF_BUDGETS.md).

## Method and honest scope

All measurements come from the **frozen probe** `tests/perf/perf-67.evidence.mjs`, run against the
**built** app (`pnpm build`, then `vite preview` of `dist`). The probe is byte-identical between the
committed copy and the copy that ran:

```
git hash-object tests/perf/perf-67.evidence.mjs == 6b9f121c88a75fa26db3cf0cff2dc099efdbbc89
```

**AGENT headless Chromium emulation** (`playwright-core`, host Chrome) — **NOT a physical device**.
Viewport / deviceScaleFactor / isMobile / hasTouch / reduced-motion are emulated; CPU is throttled via
CDP `Emulation.setCPUThrottlingRate` (6×). **CPU/GPU/thermal/real-touch/mobile-network are NOT emulated.**
Every "look" check is a programmatic DOM / geometry / computed-style / console / decoded-canvas-pixel
assertion. **No visual inspection or vision claim is made.** Frame-time and memory are **host-relative**;
before and after were captured under identical host conditions so the comparison is fair, but absolute
numbers are not device forecasts.

Nine device fixtures: phone / phone-landscape / desktop × text-scale 1 & 2 (mature yard), plus
phone-ts1-opening, desktop-ts1-opening, and phone-ts1-catchup (offline catch-up worker). Frames are
counted **recursively**: **30** total (15 before + 15 after) under `frames/`.

## What changed (Phase 2, already committed at 2ac4213)

React 18 memoization (`useCallback` / `memo()`) on stable shell faces and the settings inspector to cut
10 Hz sim-tick rerenders, in 4 UI files. This is an experience-level optimization, **not** a byte-shaving
exercise. The historical 233000-byte entry ceiling is explicitly **not** a hard constraint here (see
`budgets._meta` in the metrics). No simulation / engine / commands / economy / save-schema / lease /
worker-store internals were touched (forbidden paths respected).

## Build inventory (decoded bytes, authoritative)

| Chunk | Role | Before (B) | After (B) | Δ | After SHA-256 |
|---|---|---:|---:|---:|---|
| `index-DMXDbGe_.js` → `index-BBL5748F.js` | entry JS | 190898 | 190988 | **+90** | `15d2315635bfa92e2f4a7babe3ec2fae41a1e578a21ea77a7ecb4d3a3c73d7b1` |
| `vendor-Bt4lNSbZ.js` | vendor JS | 141658 | 141658 | 0 | `a58625f8076320045a88e2acaa800218823508f519a191c9bcce8466767ca0d0` |
| `tables-KTf0wpwx.js` | tables JS | 26691 | 26691 | 0 | `3a817e9984a6ef0e6a8940cc870d47ed38bb517f8fff2bb1accc58774a155142` |
| `index-Eo_6W0ie.css` | CSS | 61937 | 61937 | 0 | `d3845bbe72d85da6c74d158b573f81dde6cdd3b76d20224fba0fd6bce797abc8` |
| `catchup.worker-G_Jyr7uh.js` | lazy worker JS | 13406 | 13406 | 0 | `0c784f3e68570923a088c2449818efc64a65c88ccceb4c6c60931c756271dd50` |

Only the entry chunk changed (+90 B from the memoization wrappers); vendor / tables / CSS / worker are
byte-identical. **Binary media: 0** (procedural audio + procedural canvas sprites).

> **Byte reconciliation (build.log vs metrics).** `build.log` prints vite's `190.83 kB` for the entry,
> while the metrics record `190988 B`. This is **not** a stale build: vite's size formatter reports
> `code.length` (UTF-16 code units = 190832), not the UTF-8 byte length (190988); the 105 multi-byte
> non-ASCII characters account for the 156-byte difference. `build.log` carries a labelled post-build
> addendum verifying every chunk's on-disk **bytes + SHA-256** against `perf-67-after-metrics.json`
> (all MATCH), so the after-metrics describe exactly the current `dist`. No probe re-run was needed.

## Cold load

| Metric | Before | After | Δ |
|---|---:|---:|---:|
| Total transferred (B) | 124530 | 124600 | +70 |
| Total decoded (B) | 422552 | 422642 | +90 |
| FCP / LCP (ms, mature devices) | 72–88 | 76–88 | host noise |

FCP/LCP stay ≤ 88 ms on every mature fixture, far under the 1500 ms FCP / 2500 ms loadEventEnd budgets.
The +90 B decoded delta is exactly the entry-chunk growth; transferred +70 B reflects gzip framing.

## Interaction latency (click → DOM-appear, median of 3)

**6× CPU-throttled machine-tap median (`thrTap`) — the meaningful signal — improved on all four
measurable devices:**

| Device | Before (ms) | After (ms) | Δ |
|---|---:|---:|---:|
| phone-ts1 | 88 | 87 | −1 |
| phone-ts2 | 70 | 69 | −1 |
| desktop-ts1 | 78 | 71 | −7 |
| desktop-ts2 | 83 | 80 | −3 |

Unthrottled machine-tap median: phone-ts1 12→12, phone-ts2 11→11, desktop-ts1 12→10, desktop-ts2 11→10.

> **Honest note on unthrottled menu-open latency.** Unthrottled `menuOpen` medians are sub-15 ms and
> dominated by host scheduling noise (e.g. desktop-ts2 10.5→12.5, phone-landscape-ts2 6.8→12.6 went
> *up*; desktop-ts1 13→4.3 went down). These single-digit-ms swings are not a reliable optimization
> signal and are not claimed as wins. The throttled machine-tap path above is the stable, repeatable
> interaction improvement.

## Frame time, stress, reduced motion, memory

- **Idle frame:** P50/P95/P99 ≈ 16.7/16.8/16.8 ms, **0 frames dropped > 50 ms**, **0 long tasks**,
  **0 console errors** on **every** device, before and after (~60 fps).
- **6× throttled idle:** P95 16.8 ms, 0 dropped on every device.
- **Stress** (long-session 240 frames / churn 150 / resize 120): **0 dropped > 50 ms**, **0 long tasks**
  everywhere; heap growth small and host-relative (−1.37 … +2.44 MB, GC noise).
- **Reduced motion:** idle P95 16.8 ms, 0 dropped on every device; the `data-reduced-motion` rule is
  present and honored (cross-checked by access-66, below).
- **Memory (idle, host-relative):** used JS heap 5.47–6.76 MB; `performance.memory` is Chromium-only and
  host-relative — not a device memory forecast.

## Offline catch-up worker

`phone-ts1-catchup` exercises the lazy catch-up worker: transferred 129074→129144 B (+70), decoded
435958→436048 B (+90), worker chunk 13406 B loaded lazily, 0 console errors. Catch-up behavior preserved.

## Budget verdicts

`budgetVerdicts.summary` is **identical before and after**:

```
{ "met": 104, "unmet": 0, "unknown": 4, "total": 108, "allMet": false }
```

- **0 unmet, 0 hard failures** (`hardFailures: []`), `pass: true` on both runs.
- `allMet: false` is **only** because of the **4 unknowns**, never a silent pass. The 4 unknowns are
  `machineTapMedian` and `throttledMachineTapMedian` for `phone-landscape-ts1-mature` and
  `phone-landscape-ts2-mature`: `value: null`, `met: null`, note `"not measured / no budget"`. The
  landscape mature fixture does not place tappable machine tiles in the viewport, so the probe records
  **unknown** rather than inventing a number. This is unchanged from baseline.

## Preservation re-verified at code head 2ac4213

### access-66 (UI-RESET-66 accessibility / layout matrix)

Re-ran `tests/ui/access-66.evidence.mjs` with `RW66A_SHA=2ac4213…` against the rebuilt `dist`
(its own preview on port 4194). Durable receipt: [`access66-preservation.json`](./access66-preservation.json)
(`buildSha == 2ac4213b4f486555e4e29e8ccdb2022c8f0d8e6f`).

- **16 cells, 0 cell errors, `defects: []`, `defectCount: 0`, `defectKinds: []`.**
- **phone-landscape-ts2 0 px overlap defect FIXED:** `leadDockOverlapArea`, `leadPanelOverlapArea`,
  `dockPanelOverlapArea` all **0**; `docScroll 0`; world band 88 px.
- **Contrast:** 52/52 checks pass across the 6 a11y-instrumented cells (min ratio **5.75**, needs 3 / 4.5).
- **Naming:** `unnamedDock / unnamedRail / unnamedIcon` all **0**; canvas has accessible name
  ("Yard world view", role img); chips convey non-color cues (`chipsNonColor: true`).
- **Keyboard:** 3 cells (phone-ts1, phone-landscape-ts1, desktop-ts1) all-true — 17 tabbable, tab reaches
  dock/icon, cycle returns, Escape closes menu + restores focus to opener, digit-3 Store / digit-2 Build,
  input-field shortcut suppression, and **core loop advances via both keyboard and touch** (Salvage
  scrap 245→250→255).
- **Reduced motion:** `data-reduced-motion="true"` rule found and probe-confirmed.
- **Mirror:** 17 frames, all non-empty and all distinct (SHA-256 audit).
- **Touch-target nuance (honest):** the probe's small-tap-target defect check evaluates the **record
  (primary Yard) view** only (`rec.touch.small.length`), which is **0** on all 16 cells. The raw touch
  census additionally lists a 26 px-tall save-code `<textarea>` in the **backup/replace** sub-views of
  4 cells; the probe intentionally does not flag text fields as tap-target defects. This matches the
  committed #66 baseline — **not a memoization regression**.

### save-63 (UI-RESET-63 save / core-loop acceptance)

Re-ran `tests/ui/save-63.evidence.mjs` with `RW63_SHA=2ac4213…` against the rebuilt `dist`
(its own preview on port 5163). Durable receipt: [`save63-preservation.json`](./save63-preservation.json)
(`headSha == 2ac4213b4f486555e4e29e8ccdb2022c8f0d8e6f`).

- **`failures: []`**, exit 0.
- **phone / phone-landscape / desktop: 394/394 assertions passed each** (16 screenshots each),
  **mirror 2/2** — 1184 assertions total, 0 failures. **48** full-frame PNGs (recursive).
- Covers record/backup/replace pages, reload + lease-adoption catch-up, older-save migration, hostile
  settings sanitization, tampered-checksum refusal, impossible-value rejection, and removed
  clipboard/download APIs — all through real UI clicks/keys → App → `store.importSave`, with the
  spec 6.4 "0 px inner panel scroll" budget asserted. Fixture mutations live only in probe code, never
  in `src`, and never weaken the decoder.
- **Repo hygiene:** the probe regenerates `tests/ui/save-63.evidence.json`; it was **restored to the
  committed bytes** afterward (disk hash == committed `f9366dfab5ed1fdfbad4b5b8aef71f2651fae3b6`).
  `data/seeds.json` is not a tracked file and was **never created** by either save-63 script.

### #64 / #65 and gameplay

No `src/` changes means #64/#65 behavior is preserved by construction; the green vitest suite (746 tests,
below) exercises the simulation, save/persistence, lease and catch-up worker suites. No gameplay
regression observed in the access-66 core-loop or save-63 acceptance probes.

## Green ladder receipts (at code head 2ac4213)

| Step | Command | Result | Receipt |
|---|---|---|---|
| Typecheck | `pnpm exec tsc --noEmit` | exit 0, **0 errors** | [`typecheck.log`](./typecheck.log) |
| Content/behaviour validate | `pnpm validate` | exit 0, **0 violations** (15 resources / 8 blueprints / 12 recipes / 3 research) | [`validate.log`](./validate.log) |
| Unit suite | `vitest run --minWorkers=4 --maxWorkers=4` | exit 0, **60 files / 746 tests passed** (20.63 s) | [`vitest.log`](./vitest.log) |
| Production build | `pnpm build` | exit 0, **0 errors** + byte/SHA-256 addendum | [`build.log`](./build.log) |

## Limitations

- **AGENT headless Chromium emulation, NOT a physical device.** No CPU/GPU/thermal/real-touch/mobile-network
  emulation beyond the 6× CDP CPU throttle. Frame-time and memory are host-relative.
- **No vision claims** — all checks are programmatic DOM/geometry/computed-style/console/pixel assertions.
- **4 landscape interaction unknowns** (`machineTapMedian` / `throttledMachineTapMedian` on
  phone-landscape-ts1/ts2) are `null` = not measured, never silently passed; `allMet: false` reflects this.
- **Memory** is Chromium `performance.memory`, host-relative — not a device forecast.
- **Unthrottled menu-open latency** is single-digit-ms host noise; not claimed as a win.
- **GitHub Project 1 / milestone 1 membership** cannot be verified from this worktree; recorded as a
  limitation, not invented.

## Integrity

- Probe committed == ran: `6b9f121c88a75fa26db3cf0cff2dc099efdbbc89` (byte-identical, frozen).
- `results.json` / after-metrics `buildSha == 2ac4213b4f486555e4e29e8ccdb2022c8f0d8e6f` (hard invariant).
- **30** recursive frames (15 before + 15 after).
- `src/` frozen at 2ac4213 (empty diff across all evidence commits and working tree); forbidden paths
  (sim/engine/commands, economy/defs/research balance, save schema/lease, worker/store internals,
  gameplay expansion) untouched.
- `pnpm-lock.yaml` never staged.

## Verdict

**No performance regression and no functional regression.** Budgets 104 met / 0 unmet / 4 unknown
(identical to baseline), 0 hard failures; throttled interaction improved on all 4 measurable devices;
idle/stress/reduced-motion frames clean everywhere; access-66 (16 cells, 0 defects, landscape overlap
fixed) and save-63 (failures=[], 394×3 + mirror) re-verified at the frozen code head; ladder fully green.

**Ready for independent QA + product decision at the final evidence head. Do NOT merge yet** —
release-engineer merge requires independent QA ACCEPT and product acceptance at the immutable head SHA.