# #249 — Desktop widescreen camera fit fills the remaining rectangle

Role: developer (Qwen Code runtime, #128). Branch `rw/249`, base `c551f276b0d6bcf70eee3d68de3ab2071724af6a`. Draft PR; no self-acceptance. Visual fidelity ACCEPT reserved to sponsor (G1 pattern).

## Root cause (measured on the production build, real Chrome + SwiftShader)

Fresh yard, after Recenter, 1440x900: `.hud` is a flex column with `justify-content: space-between`; with only lead/dock/toolbar painted, `.dock` floats at the midpoint of free space (top 558 vs toolbar top 832). `chromeInsets` (App.tsx paint-truth) uses `bottomEdge = min(dockTop, toolbarTop)` = 558 → bottom inset 348. The unbounded desktop lead (hud__top 44 + objective 68 + onboard coach 160 + entry row 44 ≈ 328 px) → top inset 342. Usable band 210 px → `fitScale = 210/236 = 0.890` < frozen `fitCamera` floor → #117 whole-yard override pins zoom 0.890 (90.6% background void, 5 structure tones). 1920x1080 same grammar → 1.271. Portrait 824x1830 band 673 px → 2.852 (proven #242).

## Fix (desktop-only CSS; frozen camera chain untouched)

`fitToShell`, `chromeInsets`, `fitCamera`, `BAND_MIN_SCALE`, budgets, gates: **unchanged**. Paint truth flows through the existing chain exactly as the jsdom mocks encode.

1. `src/ui/shell/shell.css` — existing `@media (min-width: 1024px)` block: `.dock { margin-top: auto; }` pins the tray above the toolbar (Option A).
2. `src/ui/styles.css` — new `@media (min-width: 1024px)` block: `.hud__lead` 120 px bounded themed declared scroller (#66 grammar: max-height + overflow-y:auto + scrollbar styling); `.objective` absolute top-right inside the lead band, `max-width: min(40%, 360px)`; `.hud__top` right clearance `min(40%, 360px)` (Option B, contract compact bar). Coach/entries remain DOM children of `.hud__lead` (onboard-64 safe). Portrait rules and the laptop-height cap block untouched.

## Census — 800 samples (20x40), fresh context, gate → resume-dismiss → Recenter → 5 s

| viewport | zoom | structure tones | uniqueColors | nonDominant % | ground % | dominant |
| --- | --- | --- | --- | --- | --- | --- |
| 824x1830 before | 2.852 | 45 | 28 | 60 | 33 | bg 8,13,24 |
| 824x1830 after | **2.852** | **45** | **28** | **60** | **33** | identical |
| 1440x900 before | 0.890 | 5 | 22 | 9 | 5 | bg 90.6% |
| 1440x900 after | **2.712** | **45** | **29** | **64** | **37** | ground 18,31,39 |
| 1920x1080 before | 1.271 | 6 | 22 | 11 | 7 | bg |
| 1920x1080 after | **3.475** | **40** | **33** | **64** | **36** | ground 18,31,39 |

All: world3d ready, 0 errors, machines 0, tutorial 0, objective "Tap the highlighted wreck to salvage scrap.", round-trip "Continue / Saved run found — Tick 80 · 0 machines · drone wrecked · 60 credits". Intermediate Option A (dock pin only): portrait identical; 1440x900 1.830/29/35%; 1920x1080 2.593/31/38% (`249-census-optA.json`).

Files: `249-census-{before,optA,optB}.json`, screenshots `249-{before,optA,optB}-<viewport>.png`, probe `probe-249.mjs` (temp harness; protocol identical to `tests/perf/first-run-242.probe.mjs` extended to 3 viewports).

## Desktop lead-band geometry (numeric, no vision) — `249-overlap.json`

1024x768 / 1440x900 / 1920x1080: objective inside reserved lead band (top 8, bottom 94 ≤ 128), zero overlap with resource bar (`hud__top.right == objective.left` exactly: 654 / 1070 / 1550), declared scroller `overflow-y: auto; max-height: 120px` (scrollHeight 254–258), 0 errors. Coach + road/build entries below the fold on arrival, reachable via the declared scroller (#66 grammar).

## Tests

Full `npx vitest run` (plain, no worker flags): **114 files / 1531 tests passed, exit 0**, first run, no rerun (`249-vitest.log`). Frozen #117 band/tap gates, #66 bounded lead, #64 coach DOM, shell-wiring-135 insets chain, logistics-59 all green. jsdom ignores `@media`, so the desktop-only CSS is invisible to the frozen suite by construction; no CSS-text/DOM test pins the changed rules (verified by grep).

## §5.7 byte attestation — `249-byte-attestation.json`

Baseline rebuilt from the same worktree with the two CSS edits stashed reproduces the deployed #242 inventory exactly (entry `index-_FVz8to1.js` sha256 `126c9288…`, 3D chunk `cbcfc862…`, css `55ecfe0d…`). After the fix:

- entry decoded **324689 ≤ 360000**; mature cold total (disk sum incl. html/worker) **1124612 ≤ 1220000**; fallback2d cold total **575646 ≤ 620000**; **binaryMediaCount 0**; `tests/perf/budgets.json` untouched.
- Byte-identity caveat (honest): vendor/tables/catchup.worker chunks are fully byte-identical (same names + sha256). Entry and 3D chunk keep identical byte lengths; their ONLY diffs are three 8-byte vite asset-hash cross-references (entry→3D chunk name ×2 at offsets 66/127655; 3D chunk→entry name ×1 at offset 196), mechanically unavoidable when the CSS content hash changes (`index-BVohK8qu.css` 66873 → `index-7H--D8XZ.css` 67447, +574 B desktop block). No logic byte changed. Literal whole-file byte-identity of the fallback payload is impossible for ANY CSS edit under content-hashed assets; the fallback JS logic is byte-identical and the ceiling holds with 44354 B headroom.

## Limitations

- Desktop arrival: coach/entry row below the fold of the 120 px declared scroller (documented, #66-proven grammar). Portrait arrival unchanged.
- Headless Chrome + SwiftShader emulation on a desktop host; numeric census only, not physical devices. Visual fidelity ACCEPT reserved to sponsor against the running build/live URL.
- Census dominant-color shift on desktop is the intended yard-fill (ground becomes dominant); structure tones at 1440x900 equal portrait's 45.
