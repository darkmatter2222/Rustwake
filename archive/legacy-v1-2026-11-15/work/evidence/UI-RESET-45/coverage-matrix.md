# UI-RESET-AUDIT · Screen/state coverage matrix (#45)

- Issue: <https://github.com/darkmatter2222/Rustwake/issues/45> · Goal: <https://github.com/darkmatter2222/Rustwake/issues/43> · Cutover note: #44
- Branch `rw/45-ui-audit-g1` · Head audited `1367a2c610133433cf0ce78c4441205b1c6006ea` (v0.1.0) · Role: ui-ux
- Evidence here: 43 PNGs in `captures/`, painted DOM per state in `captures/captures.json` + `captures/captures-extra.json` + `captures/captures-extra2.json`, geometry in `measures.json` and the dock probe, scripts `capture-baseline-45.mjs`, `capture-extra-45.mjs`, `capture-extra2-45.mjs`, `measure-baseline-45.mjs`, `measure-dock-45.mjs`.
- Every capture is fresh from this build: `vite preview` on `127.0.0.1:4173` + headless Chromium (playwright-core, local Chrome/Edge). `docs/screenshots/*.png` are older captures and are **not** used as the baseline, only as secondary reference.

Baselines: **fresh** = no save, tutorial step 0 (gate + first ladder taps, tick 0-51). **mature** = `docs/evidence/yard-mature.json` installed as `rustwake.save.v1` (seed tick 18298, tutorial 9, 8 machines, 18 links, 5 drones, store 900/900) with a forced 12 h absence so the capped offline catch-up runs (tick 450 298-450 338). Synthetic states come from patching the installed envelope and recomputing its FNV-1a checksum in the init script (`install()`): `storeUnits: 900` + one overflow entry, `credits: 0`.

Viewports: 390x844 dpr2 and 360x640 dpr3 (phone), 844x390 (phone landscape), 1366x768, 1920x1080, 2560x1440 (desktop).

## 1. Surface inventory

| # | Surface as painted | Source | Nested actions observed | Replacement owner |
|---|---|---|---|---|
| S1 | Canvas + camera fit (world ink rect, dock/panel insets) | `src/ui/App.tsx` `computeCamera`, `src/game/renderer/scene.ts` | pan/zoom, tap-select, tap empty to deselect | **#50** camera/zoom, **#67** frame budget |
| S2 | Resource chip row (per-material counters + Store n/900) | `Hud.tsx` `ResourceStrip` | none | **#51** HUD hierarchy, **#66** type floors |
| S3 | Objective card (primary line + 2 status lines) | `Hud.tsx` `ObjectiveCard`, `text.ts` | none | **#51**, **#64** onboarding |
| S4 | Icon cluster: Sound, A (text scale), Home | `Hud.tsx` `HudTop` | mute, cycle text scale, home | **#49** shell, **#62** entry/settings |
| S5 | Dock faces at rest (3 fresh / 5 mature) | `Hud.tsx` `DockButtons` | Store, Yard, Sell n, Build, Research | **#47** navigation/IA, **#52** build catalog |
| S6 | Dock faces in build phase (Cancel / Build X / Next) | `DockButtons`, `App.tsx` `buildPrimary` | cycle ghost, place, cancel | **#52**, **#53** placement |
| S7 | Dock fork pair (Less power / Faster batches) | `DockButtons` | two priced upgrades, mutually exclusive | **#55** upgrade fork |
| S8 | Machine inspector page 1 (status/IO) and page 2 (recipe) | `Panels.tsx` `MachinePanel` | Close, Upgrade, Move, Dismantle, Recipe | **#54** inspector |
| S9 | Store panel (material rows, sell faces, capacity, 6 measured lines, pager) | `Panels.tsx` `StorePanel` | sell faces, prev/next, Close | **#56** store presentation |
| S10 | Research panel (3 nodes, cost per node) | `Panels.tsx` `ResearchPanel` | node faces | **#58** research/logistics |
| S11 | Yard panel: record page (7 stat lines + payload) and import page | `Panels.tsx` `YardPanel` | Copy, Import, Apply, Back, Close | **#63** yard/save |
| S12 | Return report ("While you were away", title plus 9 value rows) | `Panels.tsx` `ReturnReportPanel` | Back to yard | **#61** return report |
| S13 | Reader-tab sheet ("Following the other tab") | `App.tsx` | Take over | **#49**, **#61** |
| S14 | Entry gate + import sheet | `App.tsx` `EntrySheet`/`ImportSheet` | Begin recovery, New, Import, Apply, Cancel | **#62** entry/settings |
| S15 | Slice gate / "The valley" reveal | `scene.ts`, `App.tsx` reveal | progressive unlock | **#57** slice gate |
| S16 | Toast queue | `Hud.tsx` `Toast` | none | **#65** feedback |
| S17 | Shell mechanics: Escape LIFO stack, scrim, 42 %/26 % caps, 1200 px gutter panel | `App.tsx`, `styles.css` | back, close | **#49**, **#47** |
| S18 | Tokens: colours, spacing, 44/46 px faces, 10.8-15 px type | `styles.css` | - | **#48** tokens, **#66** accessibility |
| S19 | World art: iso tiles, sprites, belts, wrecks, night lights, banners | `scene.ts` | - | **#60** world art |
| S20 | Regression + release packaging of the above | `tests/`, `scripts/publish-release.mjs` | - | **#68**, **#69** |

Logistics/bottleneck wording (#59) has no surface of its own: it is carried inside S3 (objective line 2), S8 ("Next step"), S9 ("Busiest link n % busy") and S12 ("Bottleneck").

## 2. Coverage matrix: surface x baseline

Cells hold capture numbers from `captures/`. `-` = not reachable in that baseline (reason in the note column or section 5).

| # | phone 390x844 fresh | phone 390x844 mature | desktop fresh (1920 / 1366) | desktop mature (1920 / 1366 / 2560) | phone landscape 844x390 mature |
|---|---|---|---|---|---|
| S1 camera/world ink | 02, 05, 06 | 14 | 30 / 33, 35 | 23 / 27 | 11 |
| S2 chip row | 02 (3 chips), 04 | 14 (4 chips), 20 | 30 (3) / 33 (3) | 23 (7) / 26 (7) / 39 (7) | 11 (5 chips) |
| S3 objective card | 02, 04, 05 | 14, 19 | 30 / 33 | 23, 24 | 11, 38 |
| S4 icon cluster | 02 | 14 | 30 / 33 | 23 | 11 |
| S5 dock at rest | 02, 40, 41 (3 faces) | 14 (5 faces) | 30 / 33 | 23 | 11 |
| S6 dock build phase | 05 | - (ladder finished at step 9) | 32 / 35 | - | - |
| S7 dock fork pair | - (no upgrade affordable fresh) | 19, 21 | - | 24, 27 | 38 |
| S8 inspector p1 / p2 | 07 / 08 | 19 | - / - | 24 / 27 (p1), 25 | 38 |
| S9 store panel | 03 (empty) | 15, 20 (full) | 31 / 34 | 39 (2560 full) | 36 |
| S10 research panel | - (face absent, see 42) | 16 | - / - | 25 | 37 |
| S11 yard record / import | - (face absent, see 43) | 17 / 18 | - / - | - / - | - / - |
| S12 return report | - (no away time) | 12, 13 | - / - | 22 / 26 | - |
| S13 reader tab | - | 28 | - | - | - |
| S14 entry gate + import | 01 | - (save exists, no gate) | 29 / - | - | - |
| S15 slice gate / reveal | 01 | 14 (gate open, banners gone) | 29 | - | - |
| S16 toast | 05, 06, 07, 08 | - (all mature captures settled, 3.4 s window expired) | 32 | - | - |
| S17 shell (Escape/scrim/caps) | 03, 07, 08 | 15, 16, 17, 18, 19, 20, 21 | 31 / 34 | 22, 24, 25, 26, 27, 39 | 36, 37, 38 |
| S18 tokens + text scale | 10 (scale A 2 at 360x640) | 19 | 32 / 35 | 24, 25, 39 | 11 |
| S19 world art | 01, 04, 05, 06 | 14 | 30 / 33 | 23 | 11 |

Capture numbers 29-43: `29` 1920 gate, `30` 1920 fresh rest, `31` 1920 empty store, `32` 1920 build ghost, `33` 1366 fresh rest, `34` 1366 empty store, `35` 1366 build ghost, `36` landscape store, `37` landscape research, `38` landscape inspector + fork, `39` 2560 store full, `40` fresh rest step 1, `41` fresh dock after first place, `42` fresh research probe (face absent), `43` fresh yard probe (face absent).

## 3. Required states, painted (verbatim DOM)

| State | Phone evidence | Desktop evidence | Painted text (verbatim, from the capture JSON) |
|---|---|---|---|
| empty (fresh, nothing built) | 02, 03, 40 | 30, 31 (1920), 33, 34 (1366) | chips "Scrap 0Credits 0Store 0/900"; objective "Tap the highlighted wreck to salvage scrap. / Tap Salvage until the drone repair is affordable. / Drones 0 · Power 8 · 0 requested · 100 %"; store "Capacity 0/900", "Measured Power 100% speed (0 of 8 units requested)", "Sell Opens after the first steel contract" |
| locked (hidden research node) | not painted: Research face is absent from the fresh dock (42) and the mature seed has 0 unknown nodes (16 lists 3 "Known") | same | available evidence only: "Efficient Cutters ... Known 4 Data", "Smart Buffers ... Known 8 Data", "Route Dispatch ... Known"; the "unknown" row style is unverified - see section 6 |
| unaffordable (credits 0) | 21 | same component at 1920 | dock "Less power 222 credits" / "Faster batches 232 credits", panel "Upgrade · 222 credits", chips "Credits 0"; probe: every face still `disabled:false`, `opacity:1` |
| full storage (900/900 + 35 overflow) | 20 | 39 (2560x1440) | chips "Store 900/900"; store rows "Capacity 900/900", "Measured Power 100% speed (0 of 8 units requested)", "Measured Busiest link 97% busy (3/24 in transit)", "Measured 8 machines waiting for input", "Sell floor 10 units kept per material", "Overflow hold 35" |
| offline catch-up (capped 12 h) | 12 (settled), 13 | 22 (1920), 26 (1366) | "While you were away / Time Away 124h 24m / Time Your operation worked for 12h 0m (capped) / Nonferrous +229 / Ferrous +33 / Wire +59 / Plates +245 / Deliveries 250 / Batches 765 / Bottleneck Storage full" |
| import failure | 18 | same component | "Paste a saved yard, then Apply.", field keeps "{not a rustwake envelope", reason "Not a Rustwake file", faces Apply + Back |
| reader tab | 28 | same component | objective "Following the other tab / This tab mirrors the yard exactly as the first tab writes it."; dock keeps Store, Yard, Build, Research and swaps the primary face to "Take over" |
| bottleneck | 14, 19, 20 | 23, 24 | objective line 2 "A machine waits for input; check its empty side."; machine "Next step Storage is full at 100%. Sell a surplus in the yard store to free room."; store "Busiest link 97% busy (3/24 in transit)"; return report "Bottleneck Storage full" |
| text scale | 10 (360x640, A 2) | 24, 25, 39 (scale 1) | chip row height 23 to 44 px between scale 1 and 2, objective 14.25 to 17.1 px, status lines stay 10.8 px |

## 4. Geometry measured (`measures.json`, mature baseline)

| Viewport | chips rect | icon cluster | objective | dock (faces x rows) | panel | world ink rect |
|---|---|---|---|---|---|---|
| 390x844 dpr2 | 10,8 208x48 (4 in 2 rows) | 226,8 154x44 | 10,62 340x66 | 10,790 370x46 (5 x 1) | store 10,442 370x348 · research 10,442 370x348 | 8,154 374x561 (64 % of the frame) |
| 360x640 dpr3 | 10,8 178x73 (4 in 3 rows) | 196,8 154x44 | 10,87 313x66 | 10,586 340x46 (5 x 1) | store 10,324 340x262 · research 10,324 340x262 | 7,85 345x518 |
| 844x390 landscape | 10,8 472x23 (5 in 1 row) | 680,8 154x44 | 10,58 400x66 | 162,336 520x46 (5 x 1) | store 142,179 560x157 · research 142,124 560x212 | 307,28 230x346 (27 % of the width) |
| 1366x768 | 10,8 628x23 (7 in 1 row) | 1202,8 154x44 | 10,58 420x66 | 403,714 560x46 (5 x 1) | store 1104,8 320x538 · research 1104,8 320x445 | 414,0 536x766 |
| 1920x1080 | 10,8 628x23 (7 in 1 row) | 1756,8 154x44 | 10,58 420x66 | 680,1026 560x46 (5 x 1) | store 1104,8 320x538 · research 1104,8 320x445 | 576,20 766x1022 |
| 2560x1440 | 10,8 628x23 (7 in 1 row) | 2396,8 154x44 | 10,58 420x66 | 1000,1386 560x46 (5 x 1) | store 1104,8 320x538 · research 1104,8 320x445 | 896,168 766x1150 |

Type sizes (computed, 390x844): chip 12.6 px, objective primary 14.25 px, objective status line 10.8 px, machine/panel body 12.75-13.5 px, research node title 13.5 px with 11.7 px cost, dock label 13.2 px, dock cost 12 px, icon cluster 11.7 px, toast 12.6 px. Face heights: icon 44 px, panel faces 44 px, dock faces 46 px, so every visible target passes 44 px. `docScroll` equals the viewport at all six sizes (no page scroll); the store panel scrolls inside its own box.

## 5. Findings (each has one owner issue)

1. **The objective card overlaps the painted world on every viewport except phone portrait.** At 1920x1080 world ink starts at y 20 and at 1366x768 at y 0 while the card occupies y 58-124; in landscape the ink starts at y 28 against a card at y 58-124. Only 390x844 reserves the card (ink y 154, card bottom 128). The camera insets cover the chip row and the dock but not the card. -> **#50**, **#51**.
2. **Landscape phone uses 27 % of the width.** Ink 230 px of 844, dock 520 px centred, chips 472 px; the side gutters stay empty while chips and objective stack top-left. -> **#50**, **#51**, **#47**.
3. **Super-wide desktop repeats the 1920 scale.** 2560x1440 keeps a 766 px world with 896 px of unused ink at the left and 898 px at the right, and the gutter panel is pinned at x 1104 so it lands on top of the world (1104-1424 inside 896-1662) instead of beside it. -> **#50**, **#49**.
4. **The chip row is width-dependent, so the same yard reports different numbers per device**: 3 chips fresh, 4 at 390, 5 at 844x390, 7 at 1366+. Row height also jumps 23 to 48 to 73 px (1 to 3 rows), pushing the world ink down ~50 px between 360 and 390 widths. -> **#51**, **#48**.
5. **Face count per state is unbounded** (measured button count at 390x844): machine + fork = 10 (3 icon + 5 panel + 2 dock), store = 15 (3 icon + 7 panel + 5 dock). All pass 44 px, but the same label hierarchy is painted at three different sizes in one frame (icon 11.7, panel 12.75, dock 13.2 px). -> **#66**, **#48**, **#47**.
6. **Two exits are always on screen**: the panel Close face and the icon-cluster Home face are both visible in 15, 16, 17, 18, 20, 21, 36, 37, 38 and they are not equivalent (Close pops one level of the Escape stack, Home resets to rest). -> **#47**, **#49**.
7. **The upgrade price is printed four times in one frame** (capture 19): objective "Choose what improves on the Scrap sorter · 222 credits", panel line "Next upgrade 1.74s → 1.67s · 222 credits", panel face "Upgrade · 222 credits", dock face "Less power 222 credits". Two of them are the same command. -> **#54**, **#55**.
8. **Unaffordable has no visual signal.** With credits 0 every face still measures `disabled:false` and `opacity:1` (`probe-afford-45.mjs`); the only difference from an affordable state is the number inside the label, and no shortfall line exists. -> **#65**, **#55**.
9. **Storage saturation is stated five times** in the mature store frame (20): chip "Store 900/900", objective line 2 "A machine waits for input; check its empty side.", panel "Capacity 900/900", panel "Measured 8 machines waiting for input", panel "Overflow hold 35", and the machine panel repeats "Storage is full at 100%." in its Next step line. There is no priority order between them. -> **#51**, **#59**.
10. **Machine panel density exceeds its box**: 10 label/value lines (Status, Batch, Cycle, Actual rate, Max rate, Power, Measured, Next step, Next upgrade, Needs) plus 5 faces inside a 348 px box on 390x844, with 10.8 px status type; the panel must scroll internally and the two most actionable lines (Next step, Next upgrade) sit at the bottom of that scroll. -> **#54**, **#66**.
11. **Toasts are invisible in the whole mature set** (`toast: null` in 11-21, 22-27, 36-39): the 3.4 s window has expired before the first screenshot, and the catch-up itself finishes in ~30 ms. Only the fresh ladder shows one ("Cutting pulse recharging"), overlapping the chip row area because both live inside `top: 8`. -> **#65**, **#51**.
12. **Onboarding never reaches two of the five destinations**: the fresh dock reads "Store | Salvage | Build" both before and after the first placement (probes 41, 42, 43 report the Research and Yard faces absent), so Yard and Research appear only after the ladder completes - the player meets the yard record and the research list last, not early. -> **#64**, **#47**.
13. **Import failure is a bare reason string** (18): "Not a Rustwake file" with the malformed text still in the field, no expected-shape hint, no offset/line, and the panel title stays "Yard record" so the mode change is only legible from the Apply/Back face pair. -> **#62**, **#63**.
14. **The yard record panel prints the whole payload**: 7 stat lines (Tick, Machines, Drones, Links, Credits, Save) plus a 27 839-character raw envelope under Copy/Import in a 348 px box on phone; the fresh envelope is 1 024 bytes, so the panel grows 27x with yard size. -> **#63**.
15. **A following tab can still write**: in 28 only the primary face changes to "Take over" while Store, Yard, Build and Research stay live, so the mirror keeps four mutating faces next to a card that says the tab mirrors the other one. -> **#49**, **#61**.

## 6. Unverified / limits
- No real-device run, no screen reader (NVDA/VoiceOver) pass, no listening test for the sound face; all numbers are headless Chromium at the six listed viewports.
- The catch-up progress line ("Catching your yard up") never painted: the 450k-tick seed settles in ~30 ms, so that layout is unverified and needs an injected-delay state.
- The hidden/unknown research node row ("???") is unobservable in both baselines (fresh dock has no Research face; the mature seed has 0 unknown nodes). Needs an envelope with `research: {}` to paint it.
- The world ink rect is a painted-pixel bounding box and includes the banner glyphs, so the top-overlap figures in finding 1 are an upper bound; the side figures are exact to 1 px (they were re-read from the same frame).
- Pinch-zoom and drag-pan were not exercised (headless mouse only); the coarse tap grid is a 20 px scan, so selection is proven reachable but not pixel-exact.
