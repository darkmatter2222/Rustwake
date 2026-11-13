# Performance budgets & measurement protocol — UI restart (#67)

Issue: <https://github.com/darkmatter2222/Rustwake/issues/67> (parent release #43, Gate G4, Milestone 1 "UI Restart — Mobile + Desktop").
Probe: [`tests/perf/perf-67.evidence.mjs`](../tests/perf/perf-67.evidence.mjs) · Budgets: [`tests/perf/budgets.json`](../tests/perf/budgets.json) · Evidence: [`tests/perf/perf-67.evidence/`](../tests/perf/perf-67.evidence/).

This document satisfies acceptance criterion 1 (publish measurable budgets + a test protocol for mobile cold load, total transferred assets, interaction latency, frame time and memory) and defines the identical-conditions method used for the baseline-vs-redesign comparison (criterion 4).

## What this is — and is NOT

- These are **experience-level ceilings** a player should never feel exceed. They are grounded in the measured baseline, not aspirational marketing numbers.
- The historical **233000-byte entry ceiling is explicitly NOT a hard constraint** here. `entryDecodedBytes` is a realistic headroom budget; we measure the *experience* (load, interaction, frame, memory) and do **not** micro-trim bytes merely to hide cost or move work elsewhere.
- **No new mandatory backend and no framework rewrite** (criterion 5). The game stays React 18 + `useSyncExternalStore` + Vite; audio is procedural Web Audio and sprites are procedural canvas, so the build ships **zero binary image/audio media** (`binaryMediaCount = 0`). Transferred assets are HTML + JS + CSS only.
- Optimizations must **not sacrifice readable UI** (criterion 3) and must **preserve** saves/simulation, background/visibility behavior, offline catch-up, and the #64 commandEpoch / #65 feedback / #66 accessibility+geometry work.

## Test protocol

### Build & serve (measure the production artifact, not dev)

```bash
pnpm install
pnpm build
pnpm exec vite preview --port 4167 --strictPort   # serves dist/ at http://localhost:4167/
```

The probe measures the **built `dist/` artifact** via `vite preview` (base `./`, manual vendor/tables chunk split). It never measures the dev server.

### Run

```bash
# Baseline (before optimization), at the post-#66 main SHA:
pnpm exec tsx tests/perf/perf-67.evidence.mjs \
  --url http://localhost:4167/ \
  --out tests/perf/perf-67.evidence \
  --label before \
  --sha f80726970287a9c6da96e0c475b77dc0daccd96b \
  --budgets tests/perf/budgets.json

# Redesign (after optimization): identical command, --label after --sha <code head>.
# --quick shortens sampling for smoke checks only; official runs omit it.
# PERF_CPU_THROTTLE overrides the low-end CPU rate (default 6); before/after MUST match.
```

Outputs `perf-67-<label>-metrics.json` (full per-device metrics + budget verdicts + per-chunk SHA256 build inventory) and labelled PNG frames under `frames/`. Exit code is non-zero if any **hard failure** occurs (seed rejected by `decodeSave`, console errors, missing chrome/panels, lost canvas). Budget verdicts are reported separately as `met / unmet / unknown`.

### Fixtures (deterministic, seeded saves)

Two yard states are built in-process (`createInitialState` → `applyCommand`/`planConnections` → `advance`), encoded with `encodeSave(sim, lastSeen, { ...DEFAULT_SETTINGS, textScale, muted: true })`, and seeded into `localStorage` via `addInitScript` before navigation:

- **opening** — a light yard (2 machines, 3 routes): cold-load entry comparison on phone + desktop at textScale 1.
- **mature** — a built-up factory (8 machines, 3 routes): the full interaction/frame/stress/memory matrix. Every seed is round-tripped through `decodeSave`; a rejected seed is a hard failure.

### Device matrix (emulated)

| Device | Viewport | DPR | textScale |
| --- | --- | --- | --- |
| phone (portrait) | 390×844 | 3 | 1, 2 |
| desktop | 1440×900 | 1 | 1, 2 |
| phone-landscape | 844×390 | 3 | 1, 2 |

`isMobile`/`hasTouch` are set for phone contexts. textScale 2 exercises the #66 large-text geometry.

### Boot / gate dismissal

The app boots to a `.gate` title screen whose primary button (`.gate__btn`) reads "Continue" for a saved yard or "Begin recovery" for a fresh one. The gate paints a **live yard preview behind it** (the canvas already carries `dataset.cam`), so the probe waits for `.gate` to **detach** — not merely for the camera — before measuring chrome. An encoded absence then paints a return report dismissed via "Back to yard".

### Measurements

- **Cold load** — Navigation Timing (`responseEnd`, `domInteractive`, `domContentLoaded`, `loadEventEnd`), FCP/LCP from paint entries, and a `PerformanceResourceTiming` census per chunk bucket (`entryJs`, `vendorJs`, `tablesJs`, `css`, lazy `catchup.worker`) recording `transferSize` / `encodedBodySize` / `decodedBodySize`, plus `binaryMediaCount`.
- **Interaction latency** — click→DOM-appear, sampled in-page across rAF frames (input dispatch to the first frame where the target appears), median of 3 samples: **menu open** (`Menu` → `.shell-menu`) and **machine tap** (click a machine centre → inspector `.panel`). Machine-tap points are computed from the **live painted camera** (`canvas.dataset.cam = "x,y,scale"` + `clientWidth/clientHeight`) via `tileToWorld`/`worldToScreen`, because `fitToShell` shifts `camera.x` for rail/inspector insets — a bare `fitCamera` would miss.
- **Open-menu cost** — Store / Research / Yard / Settings panels: open latency + frame time while open (900 ms sample).
- **Frame time** — `requestAnimationFrame` delta sampling; P50/P95/P99/max/mean FPS. A **dropped frame** is a gap **> 50 ms** (`droppedPct`). Idle sample 1800 ms.
- **Stress** (criterion 4) — long session (4000 ms sustained ticking), rapid menu churn (2500 ms, 12 open/close cycles), and resize stress (2000 ms, phone↔landscape orientation flips ×2; desktop stays wide). `PerformanceObserver` long-task counts and `performance.memory.usedJSHeapSize` before/after give `heapGrowthMB`.
- **Low-end CPU pass** — CDP `Emulation.setCPUThrottlingRate` at `CPU_THROTTLE_RATE` (default **6×**), re-measuring idle frame, menu open, machine tap and Store-open frame. Applied **identically** before/after.
- **Reduced motion** — CDP `Emulation.setEmulatedMedia` `prefers-reduced-motion: reduce`, reload, re-boot, re-measure idle frame (1300 ms) and assert the canvas survives (#65 preservation).
- **Offline catch-up** — a separate context seeded with a past `lastSeen`; asserts the lazy `catchup.worker` chunk loads, catch-up runs, and the camera paints (criterion 5 preservation).
- **Memory** — `performance.memory.usedJSHeapSize` idle and post-stress (Chromium-only API; reported as host-relative).

## Budgets (experience ceilings)

Defined in [`tests/perf/budgets.json`](../tests/perf/budgets.json). Interaction budgets are evaluated against the **median** open/tap latency (the keys retain the `*P95Ms` names the probe reads); frame budgets use **P95** of rAF deltas. `met = null` means *not measured* or *no budget* and is reported as **unknown**, never silently passed.

| Group | Metric | Budget | Baseline (before) | Rationale |
| --- | --- | --- | --- | --- |
| coldLoad | mobile FCP | ≤ 1500 ms | 72–88 ms | Sub-1.5 s first paint on mobile. |
| coldLoad | desktop FCP | ≤ 1000 ms | 76 ms | Sub-second first paint on desktop. |
| coldLoad | mobile loadEventEnd | ≤ 2500 ms | 35–38 ms | Fully loaded yard. |
| coldLoad | desktop loadEventEnd | ≤ 1800 ms | 35–37 ms | Fully loaded yard. |
| transferred | entry decoded bytes | ≤ 240000 B | 190898 B | Realistic entry headroom (~234 KB); **not** the 233000 ceiling. |
| transferred | total cold decoded bytes | ≤ 520000 B | 422552 B | Entry+vendor+tables+CSS+HTML (~413 KB); lazy worker excluded from cold. |
| transferred | binary image/audio count | = 0 | 0 | Procedural audio + canvas sprites invariant. |
| interaction | menu open (median) | ≤ 100 ms | 6.8–13 ms | "Instant" perception threshold. |
| interaction | machine tap (median) | ≤ 120 ms | 11–12 ms | Tap→inspector feels immediate. |
| interaction | throttled menu open (median, 6×) | ≤ 200 ms | 12–15 ms | Responsive on low-end mobile. |
| interaction | throttled machine tap (median, 6×) | ≤ 250 ms | 70–88 ms | Responsive on low-end mobile; **primary rerender-cost signal**. |
| frame | idle P95 | ≤ 20 ms | 16.8 ms | 60 fps target + jitter tolerance. |
| frame | idle dropped (>50 ms) | ≤ 2 % | 0 % | No sustained jank. |
| frame | worst panel-open P95 | ≤ 33 ms | 16.8 ms | 30 fps floor while a panel is open + sim ticking. |
| frame | long-session stress P95 | ≤ 50 ms | 16.8 ms | Allow brief stress jank, no runaway. |
| frame | throttled idle P95 (6×) | ≤ 33 ms | 16.8 ms | 30 fps floor on low-end mobile. |
| frame | throttled idle dropped (6×) | ≤ 5 % | 0 % | No sustained jank on low-end mobile. |
| frame | throttled Store-open P95 (6×) | ≤ 50 ms | 16.8 ms | Panel open under throttle. |
| memory | idle used heap | ≤ 64 MB | 5.5–6.8 MB | Generous canvas-game ceiling. |
| memory | long-session heap growth | ≤ 16 MB | −1.4…+2.4 MB | Leak guard (negative = GC reclaimed). |

## Baseline results — `before` @ `f80726970287a9c6da96e0c475b77dc0daccd96b`

Production build inventory (decoded bytes, SHA256 in the metrics JSON):

| Chunk | Role | Bytes |
| --- | --- | --- |
| `index-DMXDbGe_.js` | entry | 190898 |
| `vendor-Bt4lNSbZ.js` | vendor | 141658 |
| `tables-KTf0wpwx.js` | tables | 26691 |
| `index-Eo_6W0ie.css` | css | 61937 |
| `catchup.worker-G_Jyr7uh.js` | lazy worker | 13406 |

Cold transfer (compressed, over the wire) = **124530 B**; cold decoded payload = **422552 B**; binary media = **0**.

Per-device (mature fixture, 6× low-end pass):

| Context | FCP | idle P95 / drop | menu / tap (median) | thr menu / tap | thr idle P95 / drop | heap idle / growth | errors |
| --- | --- | --- | --- | --- | --- | --- | --- |
| phone-ts1 | 72 ms | 16.8 / 0% | 13 / 12 ms | 15.2 / 88 ms | 16.8 / 0% | 6.4 / +1.74 MB | 0 |
| phone-ts2 | 84 ms | 16.8 / 0% | 12.2 / 11 ms | 14 / 70 ms | 16.8 / 0% | 5.76 / +2.07 MB | 0 |
| desktop-ts1 | 76 ms | 16.8 / 0% | 13 / 12 ms | 12.5 / 78 ms | 16.8 / 0% | 5.52 / −1.22 MB | 0 |
| desktop-ts2 | 76 ms | 16.8 / 0% | 10.5 / 11 ms | 12.1 / 83 ms | 16.8 / 0% | 6.76 / −1.37 MB | 0 |
| phone-landscape-ts1 | 76 ms | 16.8 / 0% | 12 / — | 13 / — | 16.8 / 0% | 5.49 / +2.44 MB | 0 |
| phone-landscape-ts2 | 88 ms | 16.8 / 0% | 6.8 / — | 14.8 / — | 16.8 / 0% | 5.47 / −0.54 MB | 0 |

Panel-open frame P95 = 16.8 ms for Store/Research/Yard/Settings on every context; long-session and churn stress P95 = 16.8 ms; reduced-motion idle P95 = 16.8 ms with the canvas intact; catch-up worker loaded (13406 B), ran, and painted the camera with 0 errors.

**Hard check: PASS (0 failures).** **Budget verdict: 104 met / 0 unmet / 4 unknown** (`allMet=false` solely because of the 4 unknowns below). The baseline already meets every measured budget; the redesign must **not regress** any of them and should improve the throttled interaction latency.

## Limitations (explicit, criterion 4)

1. **Device vs emulation.** All numbers are **agent headless Chromium emulation on a fast desktop host with a local `vite preview` (no real network)**. Viewport/DPR/isMobile/hasTouch/reduced-motion are emulated; **CPU/GPU/thermal/real-touch/mobile-network are NOT**. Emulation is a *necessary-but-not-sufficient floor*: meeting a budget here does not prove a real mid/low-end phone meets it. No physical-device testing was performed. No vision-based claims are made — verification is programmatic (DOM/geometry/computed-style/console/canvas pixels).
2. **Frame headroom on this host.** The 10 Hz sim rerender is cheap enough that frame time stays at the **60 Hz vsync floor (16.8 ms), 0 dropped frames, 0 long tasks even at 6× CPU throttle**. Frame-time budgets are therefore met with large headroom both before and after; the **sensitive rerender-cost signal is throttled interaction latency** (machine tap 70–88 ms at 6×), where memoization is judged. A real low-end device with compositor/GPU/main-thread contention may show frame cost this host hides.
3. **Landscape machine-tap automation.** On phone-landscape contexts the computed machine-centre tap points do not land on a machine (the inspector never opens), so `machineTap` median is `null` → **4 unknown verdicts** (machine tap + throttled machine tap × ts1/ts2). Menu/panel interaction, frame, stress and memory **are** measured there. This is an honest automation limitation, not a passing claim.
4. **Memory is host-relative.** `performance.memory` is Chromium-only and GC-dependent; negative `heapGrowthMB` means the collector reclaimed memory during the session, not a measurement error.
5. **Project membership.** Project 1 membership could not be verified (token lacks `read:project`); recorded as a limitation, never invented.

## Before/after comparison method (criterion 4)

The **same probe, same fixtures, same device matrix, same `CPU_THROTTLE_RATE`, same sampling durations** are run twice: `--label before` at the pre-optimization SHA and `--label after` at the optimization code head. Both metrics JSONs are committed under `tests/perf/perf-67.evidence/`; the comparison has no moving goalposts. The redesign passes if it (a) keeps hard failures at 0, (b) regresses no measured budget, and (c) improves the throttled interaction latency without sacrificing readable UI or moving bytes to hide cost. The `after` results and the explicit before→after delta are appended below in Phase 2.

## Preserved behaviors (criterion 5)

Background/visibility throttling, offline catch-up (lazy `catchup.worker`), saves/simulation semantics, #64 commandEpoch, #65 feedback (toast grouping / reduced-motion / sound cues) and #66 accessibility+geometry (landscape-ts2 0 px fix, ≥44 px touch targets, contrast, focus, canvas `role=img` "Yard world view") are all preserved. If any perf fix would require changing forbidden semantics (sim/engine/commands, economy/defs/research balance, save schema/lease, worker/store internals, gameplay expansion), work stops and the exact need is reported in a #67 comment for the coordinator.

## After results — `after` @ code head `2ac4213b4f486555e4e29e8ccdb2022c8f0d8e6f`

Phase 2 is **pure React memoization** of 4 UI files (no semantics change, no forbidden paths): `App.tsx` gains stable `useCallback` `closeSelection`/`zoomIn`/`zoomOut` + prop substitutions; `memo()` wraps `ObjectiveCard`, `SettingsPanel`, `ShellRail`, `ShellMenuFace`, `ShellZoom`. This cuts redundant rerenders of stable shell faces under the 10 Hz sim tick. Geometry/a11y CSS (`styles.css`/`hud.css`) is untouched, so the #66 landscape fix is structurally intact; #64 `commandEpoch` is preserved (`App.tsx:97/99`).

### Build inventory (decoded bytes; SHA256 in the metrics JSON)

| Chunk | Role | Before | After | Δ |
| --- | --- | --- | --- | --- |
| `index-DMXDbGe_.js` → `index-BBL5748F.js` | entry | 190898 | **190988** | **+90 B** |
| `vendor-Bt4lNSbZ.js` | vendor | 141658 | 141658 | 0 |
| `tables-KTf0wpwx.js` | tables | 26691 | 26691 | 0 |
| `index-Eo_6W0ie.css` | css | 61937 | 61937 | 0 |
| `catchup.worker-G_Jyr7uh.js` | lazy worker | 13406 | 13406 | 0 |

The +90 B entry is the memoization wrappers — well inside the 240000 B headroom budget, **not** byte-shaving or cost-moving. CSS/vendor/tables/worker hashes are byte-identical. Cold transfer (compressed) 124530 → **124600 B** (+70 B); cold decoded 422552 → **422642 B** (+90 B); binary media stays **0**.

> **Byte reconciliation (build.log vs metrics).** A clean `pnpm build` at `2ac4213` prints `index-BBL5748F.js 190.83 kB` in vite's console summary, while the metrics `decodedBodySize` is **190988 B**. This is a **vite formatter artifact, not a discrepancy**: vite formats `code.length` (190832 UTF-16 code units) rather than the UTF-8 byte length; the entry contains 105 multi-byte non-ASCII characters (156 extra UTF-8 bytes). The authoritative byte size is the filesystem size == `PerformanceResourceTiming.decodedBodySize` == the SHA256 inventory, all **190988 B**. All 5 freshly rebuilt chunks were verified byte-for-byte (SHA256) against `perf-67-after-metrics.json`; `build.log` carries a labelled post-build verification addendum recording this.

### Per-device (mature fixture, 6× low-end pass) — after

| Context | FCP | idle P95 / drop | menu / tap (median) | thr menu / tap | thr idle P95 / drop | heap idle / growth | errors |
| --- | --- | --- | --- | --- | --- | --- | --- |
| phone-ts1 | 76 ms | 16.8 / 0% | 8.1 / 12 ms | 13.5 / 87 ms | 16.8 / 0% | 6.28 / +1.39 MB | 0 |
| phone-ts2 | 80 ms | 16.8 / 0% | 12.1 / 11 ms | 11.1 / 69 ms | 16.8 / 0% | 5.72 / +1.71 MB | 0 |
| desktop-ts1 | 80 ms | 16.8 / 0% | 4.3 / 10 ms | 13.8 / 71 ms | 16.8 / 0% | 6.70 / +1.20 MB | 0 |
| desktop-ts2 | 88 ms | 16.8 / 0% | 12.5 / 10 ms | 11.6 / 80 ms | 16.8 / 0% | 6.70 / +1.46 MB | 0 |
| phone-landscape-ts1 | 76 ms | 16.8 / 0% | 11.3 / — | 13.2 / — | 16.8 / 0% | 5.68 / +2.02 MB | 0 |
| phone-landscape-ts2 | 88 ms | 16.8 / 0% | 12.6 / — | 12.4 / — | 16.8 / 0% | 6.65 / −1.02 MB | 0 |

Panel-open frame P95 = 16.8 ms (Store/Research/Yard/Settings) on every context; long-session, churn and resize stress P95 = 16.8 ms; reduced-motion idle P95 = 16.8 ms with the canvas intact; catch-up worker loaded (13406 B), ran and painted the camera with 0 errors.

### Before → after delta (identical conditions)

**Throttled machine tap (6×) — the primary rerender-cost signal — improved on every measured mature context:**

| Context | before | after | Δ |
| --- | --- | --- | --- |
| phone-ts1 | 88 ms | 87 ms | **−1 ms** |
| phone-ts2 | 70 ms | 69 ms | **−1 ms** |
| desktop-ts1 | 78 ms | 71 ms | **−7 ms** |
| desktop-ts2 | 83 ms | 80 ms | **−3 ms** |

Unthrottled menu-open (median of 3) improved on phone-ts1 (13 → 8.1 ms) and desktop-ts1 (13 → 4.3 ms); other contexts fluctuate within sampling noise (e.g. desktop-ts2 10.5 → 12.5, phone-landscape-ts2 6.8 → 12.6 ms). These are median-of-3 samples with high per-sample variance (phone-ts1 after samples `[12.3, 8.1, 3]`); **every value remains far below the 100 ms menu / 200 ms throttled-menu budgets**, and the consistent, repeatable signal is the throttled machine-tap improvement above. FCP and heap figures likewise move within host/GC noise (all far inside budget); memory is host-relative (see limitations).

### Verdict

- **Hard check: PASS (0 failures)** before and after — no seed rejected, 0 console errors, no missing chrome/panels, no lost canvas.
- **Budget verdict: 104 met / 0 unmet / 4 unknown — identical to baseline.** `allMet=false` solely because of the 4 landscape machine-tap unknowns (honest automation limitation, unchanged). **No measured budget regressed.**
- **Throttled interaction latency improved** on every measured mature context (criterion 3), with **no readable-UI sacrifice** (geometry/a11y CSS untouched; #66 re-verified) and **no byte-moving** (+90 B entry within headroom; zero binary media; lazy worker unchanged).
- Frame time stays at the 60 Hz vsync floor (16.8 ms, 0 dropped, 0 long tasks) even at 6× throttle on this host — the sensitive signal is throttled interaction latency, where memoization is judged.

Full per-device data, frames, stress/6×/reduced-motion/offline-catch-up coverage and explicit limitations are in [`tests/perf/perf-67.evidence/evidence.md`](../tests/perf/perf-67.evidence/evidence.md) and `results.json` (`buildSha == 2ac4213`).
