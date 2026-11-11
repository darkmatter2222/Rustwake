# UI-RESET/NAV (#47) - navigation and information architecture spec

- Issue: https://github.com/darkmatter2222/Rustwake/issues/47 | Follow-up: https://github.com/darkmatter2222/Rustwake/issues/81 | Parent goal: https://github.com/darkmatter2222/Rustwake/issues/43 | Project 1, milestone 1
- Branch `rw/81-nav-parity-g1` | Base SHA `a365c192926087796bd6ba25a263816a53804418` | Role: ui-ux | Gate G1
- This is the **single** spec file for the issue. The earlier `nav-spec.md` and the broken `prototype.html` / `prototype.js` entry point were deleted in #81; `prototype-nav.html` is the one painted entry point and `README.md` indexes every committed file.
- Predecessor evidence (read, not re-derived): `work/evidence/UI-RESET-45/measures.json` (head `1367a2c610133433cf0ce78c4441205b1c6006ea`), `coverage-matrix.md`, `journey-map.md`
- Receipts behind every number here: `captures/captures-nav.json` (shipped spec path), `captures/captures-proto.json` (design path), `tap-budget.json` + `captures/captures-tbudget.json` (instrumented press-budget run), `captures/measures-nav.json` (shipped band geometry), `measures.json` (prototype geometry, clip and tap-target inventory), `captures/parity.json` (PNG/receipt parity). Harnesses: `capture-nav-47.mjs`, `capture-proto-47.mjs`, `measure-nav-47.mjs`, `tap-budget-47.mjs`, `measures-from-captures.mjs`, `parity-47.mjs`, `dom-shim-47.mjs`, `stamp-headsha-47.mjs`.
- headSha convention: every receipt is stamped to the captures commit by `stamp-headsha-47.mjs`; the final PR head is the metadata-only stamp commit, so `headSha = head^`. See `README.md`. Section 9 is the consolidated numeric table, every row tagged measured (with its source file) or specified.

## 0. How to read this spec

| kind | meaning | source |
|---|---|---|
| **measured** | a number already painted and recorded by the #45 harness | `measures.json`, `captures/*.json` |
| **specified** | a target this issue sets for the implementation issues (#49 shell, #50 camera, #51 HUD, #52 catalog, #54 inspector, #55 fork, #56 store, #58 research, #62/#63 entry and yard) | sections 1 to 6 |
| **predicted** | arithmetic on measured rects, to be confirmed by the implementation captures | section 3 |

The prototype in section 7 runs against the shipped build, so its numbers are measured on the pre-restart shell and are the comparison base, not the target.

Rule labels are unique across this one file: `C1`-`C8` command format (2.2), `P1`-`P4` primary-action invariants (2.3), `LP1`-`LP4` portrait layout (3.1), `L1`-`L5` landscape (3.2), `D1`-`D6` desktop (3.3), `N1`-`N4` narrow laptop (3.4), `R1`-`R3` painted corrections (3.6), `E1`-`E9` stack semantics (4). Section 9 gathers the load-bearing numbers into one table, each row tagged **measured** with its source receipt or **specified** with its section.

## 1. Destination table per tutorial stage

Five named destinations, one fixed slot order, never renumbered, never re-labelled:

| slot | destination | what the frame holds when it is current | source of truth in code |
|---|---|---|---|
| 1 | **Yard** | the rest frame: chip band, objective card, world canvas, no sheet | `selected === null` (absorbs the old `Home` face) |
| 2 | **Build** | build catalog, one blueprint per row, the chosen ghost, Cancel and Next | `buildBlueprint`, `unlockedBlueprints(tutorial)` |
| 3 | **Store** (Storage/Trade) | material rows with one sell face each, Capacity, measured lines, sell floor | `selected === -2`, `title.store` = "Yard store" |
| 4 | **Research** | node rows with one buy face each, the Data counter | `selected === -3`, `title.research` |
| 5 | **Menu** | sound, text scale, reduced motion, yard record with Copy, Import/Apply, last return report | new sheet; absorbs the old `Home` and `Yard` record faces |

Slots 1 to 5 are painted in every stage. A destination with nothing to show yet is painted **disabled with a printed reason**, not removed. That is what makes the row predictable and what fixes audit finding 12 (the fresh dock read "Store | Salvage | Build" and the Research and Yard faces were simply absent, captures 40 to 43).

The **contextual primary action is not a sixth slot**: it is its own band, one face, directly above the nav row, and it is the only accented face in the frame.

### 1.1 Stage table (stages from `engine.ts syncTutorial`; 0 to 9, `>= 9` is independent)

| stage | tutorial | reachable destinations | disabled slot and printed reason | the one primary face | measured frame today |
|---|---|---|---|---|---|
| A first taps | 0 to 1 (pulses < 6) | Yard, Build, Store, Menu | 4 Research - "Needs data" | `Salvage` | 3 faces, dock "Store / Salvage / Build" (capture 40) |
| B repair | 2 | Yard, Build, Store, Menu | 4 Research - "Needs data" | `Repair drone · 30 scrap` | 3 faces (capture 04) |
| B first line | 3 to 6 | Yard, Build, Store, Menu; Research as soon as `store.data > 0` or one node is known (`showResearch`) | 4 Research - "Needs data" | `Build Scrap sorter · 20 scrap`, then `Connect dock to sorter`, then `Build Plate press · ...`, then `Connect sorter to furnace` | 3 faces before the first place, still 3 after it (capture 41) |
| B first sale | 7 | all five; Research enabled | none | `Sell steel · 3 steel · 30 credits` (`tut.sellSteel` plus `value.exportContract`) | - |
| C complete | 8 to 9+ | **all five enabled** | none | head of the `nextYardStep` ladder: connect, build, research, drone, upgrade, sell, build, sell, upgrade, salvage; with a machine selected its own step leads (`stepForMachine`) | 5 faces, dock "Store / Yard / Sell 35 Ferrous+70 credits / Build / Research" (capture 14) |

Special frames, exactly one accented face each:

| frame | primary face | secondary faces | nav row |
|---|---|---|---|
| entry gate, no save | `Begin recovery` | `Sound ✓` / `Sound ✕` | not painted, the gate is the whole frame |
| return report after an absence | `Back to yard` | - | painted, inert (stack layer 3, section 4) |
| build phase, ghost on a cell | `Build {machine} · {cost}` | `Cancel`, `Next` | painted but inert while the ghost is up; `Cancel` or Escape returns it |
| machine selected, upgrade step (the fork) | cheapest branch, `Faster batches · 232 credits` | `Less power · 222 credits`, sheet faces | painted; today the fork replaces the whole dock row (capture 19) |
| machine selected, any other step | that machine step face | sheet faces | painted |
| reader, second tab | `Take over` | - | painted; sheets open read-only (E7) |
| import page | `Apply` | `Back` | painted, inert |
| store full, 900/900 plus overflow | the sell face the ladder names | other sell faces stay live | painted |
| unaffordable, credits 0 | same label plus the shortfall line, `disabled` true | - | painted |

## 2. One primary action per frame, and ONE printed command format

### 2.1 Why one format is needed (measured)

In one frame at 390x844 the same command is printed twice in two shapes: the dock face reads `Sell 35 Ferrous+70 credits` (`measures.json`, `dockLabels` for every band) and the store row reads `Sell 35 · +70` (`measures.json`, `targets` for `withStore`, six sell faces at 44 px). A third and fourth printing of the upgrade price sit in the same frame: objective `Choose what improves on the Scrap sorter · 222 credits`, panel row `Next upgrade 1.74s -> 1.67s · 222 credits`, panel face `Upgrade · 222 credits`, dock face `Less power 222 credits` (coverage-matrix finding 7, capture 19).

### 2.2 The one printed format (specified)

```text
{Verb} {name} · {number} {unit}        cost   ->  Upgrade · 222 credits
{Verb} {name} {number} {unit} · +{number} {unit}   gain   ->  Sell Ferrous 35 units · +70 credits
```

- **C1** one face, one sentence: verb, then the object name, then ` · `, then the numbers.
- **C2** every number carries its unit word (`credits`, `scrap`, `steel`, `Data`, `units`). A bare `+70` is not allowed, so `Sell 35 · +70` and `Sell 35 Ferrous+70 credits` both collapse into the single string below.
- **C3** gains carry `+`, costs carry no sign; the sign is never inside the name.
- **C4** ` · ` (U+00B7 with one space each side) is the only separator inside a face; it is the separator `priceLine` already uses.
- **C5** a price is printed **once per frame**: on the accented face. The objective card names the choice without the number, the sheet row that repeats it is dropped (fixes finding 7, four printings to one).
- **C6** the label and the price are two child elements with `gap: 4px` on the face, the same fix UI-006 applied to the chip row, so the two never paint as `Ferrous+70`.
- **C7** pending numbers append as further ` · ` segments in the existing `priceLine` shape: `Build Scrap sorter · 20 scrap · waits 20 scrap · have 15 · in 2s`.
- **C8** a disabled face keeps the same label and prints its reason as a second line in the 10.8 px status style, never a third format.

| action | face string under the one format |
|---|---|
| salvage | `Salvage` |
| repair the drone | `Repair drone · 30 scrap` |
| build | `Build Scrap sorter · 20 scrap` |
| place the ghost | `Build Scrap sorter · 20 scrap` (unchanged across the phase flip) |
| connect | `Connect dock to sorter`, `Connect sorter to furnace` |
| sell from the ladder or a store row | `Sell Ferrous 35 units · +70 credits` |
| first steel contract | `Sell steel · 3 steel · 30 credits` |
| upgrade, plain | `Upgrade · 222 credits` |
| upgrade fork | `Faster batches · 232 credits`, `Less power · 222 credits` |
| add a drone | `Add drone · 25 credits` |
| research a node | `Research Smart Buffers · 8 Data`, row face `Buy · 8 Data` |
| move | `Move · cell 12 · 4 credits` |
| dismantle | `Dismantle · +6 units` |
| take over the mirrored tab | `Take over` |
| unpriced chrome | `Close`, `Back`, `Cancel`, `Next`, `Copy`, `Import`, `Apply`, `Yard`, `Build`, `Store`, `Research`, `Menu`, `Sound ✓`, `A 1` |

### 2.3 One primary per frame (invariants)

- **P1** exactly one accented face exists per frame (the shipped `.dock__btn--primary` slot). Nav faces are never accented, so a frame with a sheet open still has one primary and five quiet slots.
- **P2** the fork is the only frame with two priced faces in the primary band; the cheapest keeps the single accent, so a blind thumb gets the affordable plan.
- **P3** visible button count per frame is capped at 8. Measured today: 10 with a machine plus the fork, 15 with the store open (coverage-matrix finding 5). The cap is met by moving `Sound`, `A` and the record faces into Menu (section 5) and by the single price line of C5.
- **P4** a face never changes its label while its goal is unchanged (the PLAY-001 P-3 rule, kept); a phase change moves the accent, not the wording.

## 3. Layout model

Every band is anchored to the viewport, never to the flowing content above it. That is the fix for measured finding 4: the chip row is width-dependent (3 chips fresh, 4 at 390, 5 at 844x390, 7 at 1366+) and its height jumps 23 -> 48 -> 73 px, which today pushes the world ink down about 50 px between 360 and 390 px widths. The nav and primary rows keep their measured y at every text scale and with any sheet open; only the world column absorbs the delta.

### 3.1 Portrait phone - bottom navigation and bottom sheets (390x844, 360x640)

| band | rule | 390x844 (measured -> specified) | 360x640 (measured -> specified) |
|---|---|---|---|
| B1 chip row | unchanged, left, wraps inside its own box | 10,8 208x48 | 10,8 178x73 |
| B1b control cluster | 2 faces only (`Sound`, `A n`), right edge fixed at the viewport right minus 8 | 226,8 154x44 -> 272,8 108x44 | 196,8 154x44 -> 196,8 108x44 |
| B2 objective card | unchanged, 1 primary line plus at most 2 status lines | 10,62 340x66 | 10,87 313x66 |
| B3 sheet | bottom sheet, keeps its **measured height**, floats above B4, one at a time | 10,442 370x348 -> 10,380 370x348 | 10,324 340x262 -> 10,262 340x262 |
| B4 primary row | 1 face, 46 px, full width, bottom-anchored above B5 | 10,736 370x46 (predicted) | 10,532 340x46 (predicted) |
| B5 nav row | 5 faces, 46 px, fixed slot order Yard Build Store Research Menu, y unchanged | 10,790 370x46 (measured) | 10,586 340x46 (measured) |

- **LP1** the nav row keeps the measured dock geometry exactly (`10,790 370x46` and `10,586 340x46`), so the five 44 px targets keep their measured widths: at 390 Store 50, Yard 45, Build 49, Research 72, Menu 57 = 273 px plus four 4 px gaps inside the measured 370 px box.
- **LP2** the primary row costs 54 px of camera band (46 px face plus an 8 px gap). The fitted band is objective bottom to B4 top: 390x844 gives 128 -> 736 = 608 px (measured 662), 360x640 gives 153 -> 532 = 379 px (measured 433).
- **LP3** a sheet never resizes when the destination changes: 348 px at 390, 262 px at 360 (the measured heights of the store and research panels). Its content scrolls inside, which is already how the store behaves.
- **LP4** no shipped face in any band is under 44 px; the measured shipped set passes (`captures/measures-nav.json`, `targets`) and the specified widths above are the measured widths of the shipped faces. The painted prototype has one exception, `tgl-scale` at 39 px wide, recorded as a measured deviation in 3.7.

### 3.2 Landscape phone 844x390 - one row, six faces

Measured: chips 10,8 472x23 (5 in one row), cluster 680,8 154x44, objective 10,58 400x66 (bottom 124), dock 162,336 520x46, store sheet 142,179 560x157, research sheet 142,124 560x212, ink 307,28 230x346.

- **L1** the primary face joins the nav row instead of costing a second row, because the height is the scarce axis: 6 faces, widths 65 + 60 + 64 + 87 + 72 (nav) + 220 (primary) = 568 px plus five 4 px gaps = 588 px, inside the measured 824 px band; centred, so x = 128. The measured dock already centres a 520 px row at x 162, so the row stays a single 46 px line at y 336.
- **L2** the sheet keeps its measured box (560x157 store, 560x212 research) and its measured bottom at 336. The 124 px of objective plus the 46 px row leave the 212 px band 124 -> 336 as the only unobstructed strip.
- **L3** the world must be height-fitted into 124 -> 336 (212 px). At the measured scale the ink is 230 px wide inside 346 px of height, so a height fit costs about a third of the width; **#50** owns the fit and must raise the scale so the ink lands near 380 px wide in that 212 px strip. The 27 % width finding (finding 2) is only closed by that scale change together with the 588 px row, which leaves 128 px of side gutter per side for the sheet.
- **L4** the cluster keeps its measured 680,8 154x44 box with 2 faces (108 px), right-aligned to 824.
- **L5** no second row may appear at this height: at `max-height: 460px` the objective card shows its primary line only (measured line height 17.1 px at scale 1, so the card box drops from 66 to about 28 px, predicted), which returns about 38 px to the world strip.

### 3.3 Desktop - left side navigation and right inspector (1920x1080, 2560x1440)

Measured at 1920x1080: chips 10,8 628x23, cluster 1756,8 154x44, objective 10,58 420x66, dock 680,1026 560x46, store sheet 1104,8 320x538, research sheet 1104,8 320x445, ink 576,20 766x1022. At 2560x1440 the same chrome is painted (chips 628x23, cluster 2396,8, dock 1000,1386 560x46, sheet still 1104,8 320x538) while the ink moved to 896,168 766x1150, so the gutter sheet lands on top of the world instead of beside it (finding 3).

- **D1** three columns inside a frame capped at 1600 px and centred: rail 56 px, world column flexible, inspector 320 px. The cap is what fixes finding 3: the inspector is pinned to the right edge of the capped frame, not to the fixed `left: 1104px` of `styles.css` line 409.
- **D2** the rail is vertical, 5 faces of at least 44x44 with the label under the glyph, slot order identical to portrait (Yard, Build, Store, Research, Menu). The horizontal dock disappears at this width, which returns 54 px to the world column.
- **D3** the primary row keeps the measured 560 px width, centred under the world column only, at the measured dock y: 1026..1072 at 1920x1080 (measured dock top 1026 plus the 8 px bottom margin) and 1386..1432 at 2560x1440.
- **D4** the inspector keeps the measured sheet boxes (320x538 store, 320x445 research); `max-height: 70%` is the measured 538/768 ratio and is unchanged.
- **D5** the objective card sits in the world column and the camera band starts below its measured bottom (124 at all three desktop widths); today the ink starts at y 20 and y 0 against a card at 58..124 (finding 1).
- **D6** the chip row keeps the measured 628 px width at the frame left and the cluster keeps 154 px at the frame right with 2 faces (108 px of face).

| band | 1920x1080 measured -> specified | 2560x1440 measured -> specified |
|---|---|---|
| frame | 1920 full -> 160..1760, capped 1600, centred | 2560 full -> 480..2080, capped 1600, centred |
| rail | none (dock 680,1026 560x46) -> 168,8 56x1064 | none (dock 1000,1386 560x46) -> 488,8 56x1424 |
| world column | ink 576,20 766x1022 -> column 232..1432 x 132..1026 | ink 896,168 766x1150 -> column 552..1752 x 176..1386 |
| primary row | 680,1026 560x46 -> 552,1026 560x46 | 1000,1386 560x46 -> 872,1386 560x46 |
| inspector | 1104,8 320x538 -> 1440,8 320x538 | 1104,8 320x538 -> 1760,168 320x538 |

### 3.4 Narrow laptop 1366x768 - explicit budget

Measured: chips 10,8 628x23 (7 in one row), cluster 1202,8 154x44, objective 10,58 420x66, dock 403,714 560x46, store sheet 1104,8 320x538, research 320x445, ink 414,0 536x766, `docScroll` equals the viewport (no page scroll).

| band | specified box | arithmetic from the measured rects |
|---|---|---|
| rail | 8,8 56x752 | 5 faces at 44 px plus four 4 px gaps = 244 px, so all five fit without scrolling inside 752 px |
| world column | 72..1030 x 132..714, 958 x 582 | top = measured objective bottom 124 + 8; bottom = measured dock top 714; right = inspector left minus 8 |
| primary row | 271,714 560x46 | measured 560 px, centred in the 958 px column: 72 + (958 - 560) / 2 |
| inspector | 1038,8 320x538 | measured 320x538 with its right edge at 1358 = 1366 - 8 |
| chip row | 72,8 628x23 | measured 628x23, moved into the world column so it never sits over the rail |

- **N1** 768 px is a hard budget: 8 margin + 44 chip band + 6 gap + 66 objective + 2 gap + 582 world + 46 primary + 8 gap + 8 margin = 770 against a 768 viewport, so the world column is the donor and lands at 580 px; nothing else may grow inside the frame.
- **N2** at text scale 1.5 or 2 the chip band grows by one 23 px row per wrap (measured 23, 48 and 73 px for 1, 2 and 3 rows across the phone widths); the objective card then drops its two status lines and keeps the primary line, and the world column loses exactly that growth. The rail, the primary row and the inspector do not move.
- **N3** the inspector at 320 px plus the rail at 56 px leaves 958 px of world, wider than the measured 536 px ink, so this size is height-limited: 580 px of band against the measured 766 px of ink height. #50 fits into that band and must not restore the measured overlap of the card at y 58..124 over ink starting at y 0.
- **N4** the 538 px store sheet against a 580 px world strip means the sheet is beside the world, not over it, so the 9 measured material rows plus the 6 measured summary lines keep the same reading load as at 1920 with no extra internal scroll.

### 3.5 Composition summary (all six measured bands)

| viewport | chip row, measured | objective, measured | primary row, specified | nav, specified | sheet, measured height kept | ink, measured |
|---|---|---|---|---|---|---|
| 360x640 dpr3 | 10,8 178x73, 4 chips in 3 rows | 10,87 313x66 | 10,532 340x46 | 10,586 340x46, 5 faces | 340x262 | 7,85 345x518 |
| 390x844 dpr2 | 10,8 208x48, 4 chips in 2 rows | 10,62 340x66 | 10,736 370x46 | 10,790 370x46, 5 faces | 370x348 | 8,154 374x561 |
| 844x390 | 10,8 472x23, 5 in 1 row | 10,58 400x66 | one row with the nav, 128,336 588x46 | same single row | 560x157 store, 560x212 research | 307,28 230x346 |
| 1366x768 | 72,8 628x23, 7 in 1 row | 10,58 420x66 | 271,714 560x46 | left rail 8,8 56x752 | 320x538 store, 320x445 research | 414,0 536x766 |
| 1920x1080 | 168,8 628x23, 7 in 1 row | 170,58 420x66 | 552,1026 560x46 | left rail 168,8 56x1064 | 320x538 store, 320x445 research | 576,20 766x1022 |
| 2560x1440 | 488,8 628x23, 7 in 1 row | 490,58 420x66 | 872,1386 560x46 | left rail 488,8 56x1424 | 320x538 store, 320x445 research | 896,168 766x1150 |

The 2560 row changes most against the shipped build: the chrome moves from the viewport edges into the capped 1600 px frame, so the measured 896 px and 898 px of empty side gutters become the frame margin and the 896..1662 ink sits beside the inspector instead of under it. Note that `measures.json` records `dpr: 2` for the label `phone-360x640-dpr3` because the probe clamps `Math.min(2, devicePixelRatio)` (`measure-baseline-45.mjs` line 16), which is the same clamp the renderer uses.

### 3.6 As painted by the prototype, and the three figures it corrected

`prototype-nav.html` is the specified shell painted at the six bands (`captures/30-` to `48-`, geometry in `captures/captures-proto.json`). Its measured boxes are now the authoritative figures and supersede the predicted ones above.

| band | nav | chip band | card | sheet | world | primary row |
|---|---|---|---|---|---|---|
| 390x844 dpr2 | 8,792 374x44 | 8,8 374x44 | 8,58 374x54 | 8,118 374x29 rest, x129 store, x457 import | 8,153 374x581 | 8,740 374x46 |
| 360x640 dpr3 | 8,588 344x44 | 8,8 344x44 | 8,58 344x66 | 8,130 344x52 rest, x348 menu | 8,188 344x342 | 8,536 344x46 |
| 844x390 | 8,8 96x374 | 110,8 726x44 | 110,58 726x30 | 516,94 320x288 | 110,94 400x236 | 110,336 400x46 |
| 1366x768 | 8,8 96x752 | 110,8 1248x44 | 110,58 1248x40 | 1038,104 320x656 | 110,104 922x604 | 110,714 922x46 |
| 1920x1080 | 168,8 96x1064 | 270,8 1482x44 | 270,58 1482x40 | 1432,104 320x968 | 270,104 1156x916 | 270,1026 1156x46 |
| 2560x1440 | 488,8 96x1424 | 590,8 1482x44 | 590,58 1482x40 | 1752,104 320x1328 | 590,104 1156x1276 | 590,1386 1156x46 |

Three corrections, each because the painted result disagreed with the predicted figure:

- **R1 the rail is 96 px, not 56 px.** The label under the glyph needs it; at 96 px the five slots still leave 400 px of world at 844x390 and 922 px at 1366x768.
- **R2 the three-column layout starts at 600 px, not 1200 px.** The shipped breakpoint (`styles.css` line 406) leaves 844x390 landscape in the phone stack, which is exactly why that band paints 230 px of ink in an 844 px frame. The prototype paints the rail, a 400 px world and the 320 px inspector side by side in the same frame, so **landscape stops being a second-class band** and one 46 px primary row is enough.
- **R3 the inspector is pinned to the right edge of the centred 1600 px capped frame (D1), not to the shipped fixed `left: 1104px` (`styles.css` line 409) and not to the viewport edge.** The painted x is **1432 at 1920 and 1752 at 2560** (right edge 1752 and 2072; `captures/captures-proto.json` frames 46-48 `rects.insp`), with the world column taking the remainder inside the frame. This removes the 1104 overlap of finding 3 and keeps the chrome inside the frame margin instead of stranding it at the viewport edges. The earlier draft of this row quoted 1592/2232 from a pre-cap capture; the regenerated receipt supersedes it.

Everything else in 3.1 to 3.5 holds as written: the two portrait bands keep the measured heights (46 px primary, 44 px nav), the sheet keeps its measured height and only the world column absorbs a new band, and the card, chip band and cluster keep their measured boxes.

### 3.7 Measured deviations in the painted prototype (source `measures.json`)

`measures-from-captures.mjs` derives `measures.json` from `captures/captures-proto.json` and adds a per-frame clip check and a tap-target inventory. Two deviations are measured, not assumed away:

- **Tap target.** One painted face is under 44 px on **17 of 19** prototype frames: `tgl-scale`, the text-scale toggle, **39 px wide** (44 px tall). The two 360x640 frames after a scale step (`41`, `42`) measure 0 under-44 because the toggle widens at that scale. `measures.json` `summary.facesUnder44 = 17`. This is a prototype deviation from LP4; the shipped faces pass (`captures/measures-nav.json`). The implementation (#49) must widen `tgl-scale` to at least 44 px.
- **Clip.** `summary.clipOK = 17` of 19. The status cluster stays inside the viewport on every band (phone right edge **382 of 390**). The two failures are the 360x640 scaled frames `41`/`42`: **10 px horizontal document overflow** (scrollWidth 370 > clientWidth 360), not a cluster clip. Scaling up fixes the tap target but overflows the document - a real trade-off the implementation must resolve (fit the scaled cluster without widening the document).
- Band overlaps: `summary.overlaps = 0`. The shipped cluster right edge is **380 of 390** with no overflow (`captures/measures-nav.json`, phone-390 rest).

## 4. Stack semantics: close, back, Escape, persistence, focus, exclusivity, browser back

The shipped shell already keeps one panel value (`selected`: `null`, `-2` store, `-3` research, `-4` record, positive machine id) and an Escape handler that retires one layer per press (`App.tsx` 169 to 191). Both are kept; the gaps are the inner page, focus, the second exit and history.

| layer | content | opened by | closed by |
|---|---|---|---|
| 5 (top) | sheet inner page: machine recipe/status, record import | `Recipe` / `Status`, `Import` | `Back`, then Escape |
| 4 | sheet: Build catalog, Store, Research, Menu, machine inspector | nav slot, a canvas selection | `Close`, Escape, another nav slot |
| 3 | return report, "While you were away" | a boot with away time | `Back to yard`, Escape |
| 2 | build ghost | the Build destination or the ladder build step | `Cancel`, Escape |
| 1 | rest frame (Yard) | everything else closed | - |

- **E1 Escape** retires exactly one layer, top first, in the order 5, 4, 3, 2. This is the shipped behaviour with the inner page inserted above the sheet; no press clears two layers and no pile-up survives a thumb.
- **E2 one exit per layer.** The sheet Close face is the only close control; the `Home` face is deleted and its reset-to-rest behaviour becomes nav slot 1 (Yard), which removes measured finding 6 (two always-visible exits that are not equivalent, captures 15 to 21 and 36 to 38).
- **E3 exclusivity.** Exactly one sheet at layer 4: a nav press replaces the sheet rather than stacking it, which is what the single `selected` value already guarantees, and the return report becomes its own exclusive layer 3 so the two-slot gutter hack (`styles.css` 416 to 423) can go. While layer 3 or 5 is up, the nav faces stay visible and inert, which is also what a screen reader needs (one named region changes per press).
- **E4 selection persistence.** The selected machine id survives opening and closing any sheet, a text-scale change, a mute toggle and a tab mirror change; it is cleared only by nav slot 1, by Escape at layer 1 with nothing above it, and by a successful import. Today `Close` sets `selected` to `null`, so a player who checks the store loses the machine and has to find it again by tapping the world with no DOM hit target. Spec: the sheet is closed from the machine, the machine stays selected; reopening the machine face is not needed.
- **E5 focus return.** The face that opened a sheet regains focus when that sheet closes; the sheet root is `role=dialog` with `tabindex=-1` and receives focus on open, so a keyboard or screen-reader user is never dropped to the document body. Tab order is the visual order: B1 chips, cluster, objective, sheet, primary row, nav row.
- **E6 browser back.** One history entry per layer push (`pushState`), so Back retires exactly one layer and equals Escape; the last Back leaves the page as it does today. The save is written per command and is unchanged by this, so no Back press can lose a yard.
- **E7 reader tab.** With `role === "reader"` the only mutating face is `Take over`; the Store, Build and Research sheets open read-only and every mutating face inside them is `disabled` with the reason "This tab follows the other tab". Yard and Menu stay live. This closes measured finding 15 (four mutating faces beside a card that says the tab mirrors the other one, capture 28).
- **E8 disabled states are explicit.** An unaffordable face keeps its label, prints its shortfall line (C8) and is `disabled`; the shipped probe shows every face at `disabled:false` with `opacity:1` at `credits: 0` (`probe-afford-45.mjs`, capture 21), so today the only signal is a number inside the label.
- **E9 error states are explicit.** A failed import prints the reason line plus the expected shape and keeps the pasted text, with `Apply` disabled until the text parses; the shipped state is a bare "Not a Rustwake file" under a title that still says "Yard record" (capture 18).

## 5. A documented destination for every existing action

Every face painted by the shipped build (`Hud.tsx`, `Panels.tsx`, `App.tsx`, keys from `strings.ts`), with its destination under this spec and the presses needed from the rest frame.

| shipped face or function | key | destination under this spec | presses from rest |
|---|---|---|---|
| entry gate begin | `gate.begin` | unchanged, the gate is its own frame | 1 |
| gate sound toggle | `btn.soundAudible` / `btn.soundMuted` | one face, kept on the gate; the same state is the first Menu row | 1 |
| sound toggle in play | `btn.sound*` | B1 cluster (mirrored state line in Menu, not a second face) | 1 |
| text scale | `btn.textScale` (`A n`) | B1 cluster | 1 |
| home / reset to rest | `btn.home` | deleted as a face; becomes nav slot 1 (Yard) | 1 |
| store panel | `btn.store` | nav slot 3 | 1 |
| yard record panel | `btn.yard` | Menu, section "Yard record" (a save artefact, not a place) | 2 |
| build catalog | `btn.build` | nav slot 2 | 1 |
| research list | `btn.research` | nav slot 4, disabled with a reason before the first data unit | 1 |
| salvage | `btn.salvage` | primary row | 1 |
| repair drone | `tut.repair` | primary row | 1 |
| place the ghost | `btn.buildNamed` | primary row; `Cancel` and `Next` are its secondaries | 2 total for one placed machine |
| next blueprint / step the ghost cell | `btn.next` | secondary face in the primary band, plus the `N` key | 2 |
| cancel build | `btn.cancel` | secondary face in the primary band, plus Escape | 1 |
| connect | `btn.connect`, `tut.connectSorter`, `tut.connectFurnace` | primary row when the ladder head is that connect | 1 |
| sell, one string for both faces | `Sell Ferrous 35 units · +70 credits`, painted as two elements (`Sell Ferrous` then `35 units · +70 credits`, 4 px gap, C6) | primary row when it is the ladder head, otherwise the row face inside nav slot 3 | 1 or 2 |
| first steel contract | `tut.sellSteel` | primary row | 1 |
| upgrade, plain | `btn.upgradeCost` | primary row | 1 after selection |
| upgrade fork | `btn.branchSpeed`, `btn.branchDraw` | the primary band, two faces, cheapest accented; nav row stays painted | 1 after selection |
| add drone | `btn.addDrone` | primary row | 1 |
| research a node | `btn.researchNamed`, `btn.buyData` | one row face inside nav slot 4 | 2 |
| machine inspector, status | `title.machine` rows | sheet, opened by `M` or a world tap | 1 |
| recipe page | `btn.recipe` / `btn.statusPage` | sheet inner page (layer 5) | 2 |
| move | `btn.moveCost` | sheet secondary face | 2 |
| dismantle | `btn.dismantleRefund` | sheet secondary face, then one confirm face | 3 |
| copy the record | `btn.copy` | Menu, section "Yard record" | 3 |
| import a record | `btn.import`, `btn.apply`, `btn.back` | Menu, section "Yard record", inner page | 3 plus the paste |
| return report | `btn.backToYard` | layer 3, plus a re-readable "Last return report" inside Menu | 1, and 2 to re-read |
| take over the mirror | `btn.takeOver` | primary row in the reader role | 1 |
| toast | `.toast` | not a face; it becomes a line in the objective card band (`#65` owns the wording) | 0 |
| close a sheet | `btn.close` | one face per sheet, layer 4 | 1 to open, 1 to close |

No hover-only or gesture-only essential function (specified):

The shipped shell registers exactly two listeners: `visibilitychange` and one `keydown` for Escape (`App.tsx` 151 and 189), and no `tabIndex` anywhere. That leaves four essential functions reachable only through pointer gestures. The specification gives each one a key equivalent as well:

| essential function | shipped input | specified key equivalent |
|---|---|---|
| open a destination | tap the dock face | `1` `2` `3` `4` `5` for Yard, Build, Store, Research, Menu |
| commit the accented action | tap the primary face | `Enter` or `Space` |
| retire the top layer | tap Close, or Escape | `Escape` (unchanged) |
| select a machine | canvas tap only; the harness needed a 20 px tap grid because there is no DOM hit target (`journey-map.md` J2 defect 1) | `M` next machine, `Shift+M` previous, in machine id order |
| pan the camera | pointer drag | Arrow keys |
| zoom | pinch only - there is no wheel listener, so a mouse-only desktop cannot zoom at all | `+` and `-`, one step each |
| choose the ghost cell | pointer position while the ghost is up | `N` steps the cell one tile; the cell also follows a plain tap |
| cycle the blueprint | tap `Next` | `N` with the ghost already placed |

The shortcut list is printed as plain lines inside the Menu sheet, so nothing depends on a tooltip or a hover state.

## 6. Press-count comparison

The measured first-session budget is **16 scripted presses to reach one machine with 0 batches done, 0.00 batches/s, sim tick 51** (`journey-map.md` J1, captures 01 to 09, phone 390x844). The design target is the same milestone in fewer presses, with a machine that actually produced.

Sources for the table below: the measured shipped column is `captures/captures-nav.json` (session A); the measured design column is `captures/captures-proto.json` (`pressed`); the dedicated instrumented run is `tap-budget.json` (app `machinePress = 12`, model `machinePress = 12`, model `freshPressed = 13`, model `storePress = 1`). The target column is specified by this issue, not measured.

| milestone, one continuous session on phone 390x844 | shipped build, measured this run | target this spec designs to | against the J1 budget of 16 |
|---|---|---|---|
| M0 gate cleared | 1 | 1 | 1 of 16 |
| M1 first machine placed and inspected | 18 placed, 22 inspected | 13 | -3 |
| M2 first sale landed | not reached in 39 | 16 | 0 |
| M3 first upgrade committed | not painted in 39 | 19 | +3 beyond M2 |
| M4 settings and save read, Menu then record then Copy | 39 with the record face absent | 22 | +3 beyond M3 |
| destination tour from rest, all five destinations at one press each | 5 for 3 of 4 | 5 | 5 |
| bottleneck check, rest to store rows and back to rest | 2 | 2 | measured 2 in J3 |

Where each saving comes from, one rule per line:
- **the Close round trip disappears** (E3): a nav press replaces the sheet, so the five-destination tour costs 5 presses where the shipped build spends an open plus a Close each, and J1 itself spends 2 of its 16 on the Store round trip.
- **selection survives closing** (E4): J1 spends one press to select and loses the selection at Close, so a second look at the same machine is another hunt through a 20 px grid.
- **the destination row is stable** (section 1): no press is spent rediscovering where Research went, and Research is present-with-a-reason instead of absent (finding 12).
- **the price is printed once** (C5): the reading load of the fork frame drops from four number strings to one, which is the difference between 19 presses and the same 19 presses spent comparing numbers.

### 6.1 Measured session log, phone 390x844, shipped build (source `captures/captures-nav.json`, session A; headSha stamped to the captures commit, see README.md)

Cumulative presses at each painted frame of `captures/captures-nav.json` (session A, fresh save, one continuous session). Session A totals **39 presses + 34 auto-settle waits (17000 ms)**; the waits are 500 ms sim frame steps while the primary reads `waits`, counted separately and never as presses:

| capture | presses | painted sim |
|---|---|---|
| 01 rest, step 0 | 1 | no save yet |
| 02 salvage counted, the repair face in the primary slot | 12 | tick 43, tutorial 1, scrap 30, machines 0 |
| 03 the repair committed | 13 | tick 200, tutorial 4, scrap 10, machines 0 |
| 04 build phase, ghost up | 14 | tick 200 |
| 05 after the first placing press | 15 | tick 210, machines 0, the face still reads `waits 20 scrap` |
| 06 canvas grid, no panel yet | 15 | tick 220 |
| 08 the furnace build step, still waiting | 18 | tick 260, tutorial 4, **machines 1**, scrap 0 |
| 09 inspector painted on the phone | 22 | tick 280, 1 machine, inspector opens at this press |
| 10 ladder head before any credit lands | 22 | credits 0 |
| 11 still the second build, `waits 10 scrap · have 1` | 34 | tick 330, tutorial 6, routes 2, credits 0 |
| 12 store rows | 35 | tick 340, tutorial 6, one scrap row, no sell face yet |
| 13 record page, `Yard` face absent | 36 | `reachable=false`, tutorial 6 |
| 17 import error state | 37 | reason line under a title that still reads Yard record |
| 14 text scale after one press | 38 | cluster reads A 1.25 |
| 15 sound muted after one press | 39 | tick 364, machines 1, credits 0, scrap 6, cluster reads Sound X |

Session B, the same rest-to-sell loop at the mature stage: **2 presses** (Store, then the first sell face), the shortest loop in the game. Session C, the destination tour from the mature rest frame: **5 presses for 3 destinations** - Store, Yard and Build each cost an open plus a Close, and after the Build face the row is replaced by Cancel, Build and Next, so the **Research face is not painted at all** inside that phase and the fourth destination costs a sixth press. At the mature stage every band measures 8 faces at rest, 15 with the store open and 9 with the research list open, all at 44 px or more (`captures/measures-nav.json`).

The three facts the implementation has to beat: **18 presses for one machine**, **39 presses without ever printing a fork or a credit**, and **a destination row that loses faces when a phase starts**. The target column above is what section 1 to 5 design to: 13 presses for one machine inspected (the primary-band place at 12 plus one Yard-list press), one accented face per frame, five stable slots and the same price printed once. The painted prototype's Build-destination route measures **16** to that same inspected machine (§6.2) - 3 above the 13 target, the catalog detour, recorded not hidden - and the dedicated primary-band model run places at **12** (`tap-budget.json` `prototype.machinePress`).

### 6.2 The same path inside the prototype, counted by the prototype itself

`prototype-nav.html` counts every painted face it presses (`S.pressed`), so the design is measured rather than estimated (`captures/captures-proto.json`). One press is one painted face activated once, or one key: the prototype enforces this (#81 rework) - `tap()` ignores absent, disabled and locked faces, so they are never counted and run no handler.

| frame | presses | the same frame on the shipped build |
|---|---|---|
| 30 gate | 0 | 1 (the gate itself) |
| 31 rest at step 0 | 1 | 1 |
| 32 salvage counted | 7 | 12 |
| 33 repaired, primary back to Salvage | 8 | 13 |
| 34 Build destination open, nav unchanged | 13 | 14 |
| 35 blueprint chosen | 14 | - |
| 36 one machine placed | 15 | 15 |
| 37 **machine inspected from the Yard list** | **16** | 22 |
| 38 Store with the one command format | 17 | 35 |
| 39 Menu import error | 20 | 37 |
| 40 two Escape presses back to rest | 22 | 39 |

Presses 9-12 are four `Salvage` presses: the repair at press 8 consumed all 30 scrap, so the primary band returns to `Salvage` (frame 33) and Place would be disabled at 0 scrap. The four refills bring scrap back to the 20-scrap place price, the primary then reads `Build Scrap sorter`, and press 13 opens the Build destination. Every press in the ladder is on an enabled painted face - the disabled `Place` at 0 scrap is never pressed and never counted (#81 rework). Frame 36 paints `machines 1` with the primary back to `Connect sorter to the dock`; frame 37 is one `row-machine-1` press from the Yard list and paints the inspector `Scrap sorter · level 1` with the fork's 30/40-credit faces disabled at 0 credits.

So the same journey is **16 presses to an inspected machine in the prototype against 22 on the shipped shell and the J1 budget of 16** - it ties the audit budget and beats the shipped shell by 6 - and **22 presses for the whole path including the settings faces and the save record against 39**. The dedicated primary-band model run places at 12 (`tap-budget.json`); the painted Build-destination route spends 3 more presses on the catalog detour (nav-build, bp-sorter, Place) and 1 more inspecting from the Yard list, 12 + 3 + 1 = 16 measured. The three rules that pay: the destination row never changes slots, so no press is spent finding it again; the Yard list carries one face per machine, so selection is a face and not a canvas hunt; and a sheet replaces a sheet, so a tour of five destinations costs five presses instead of an open-and-Close pair each.

The prototype also holds the two states the shipped build does not paint at all: the locked Research slot with its reason ("Needs 1 Data", capture 31) and the unaffordable priced faces inside the fork (capture 44).
## 7. The prototype path and its states

`capture-nav-47.mjs` drives one continuous session through **salvage, build, inspect, sell, upgrade** and then the settings and save faces, in the harness style already committed for #45 (`info()` reads the painted DOM in the same frame as the PNG, `install()` patches the seed envelope and recomputes its FNV-1a checksum, `byText()` clicks by painted label, `shot()` writes one PNG plus one JSON entry). `measure-nav-47.mjs` records the band rects and every button that is under 44 px for the same path.

| # | press | frame captured, phone 390x844 | state class |
|---|---|---|---|
| 1 | `Begin recovery` | 01-nav-phone-rest-step0 | rest, fresh, 3 dock faces |
| 2..7 | `Salvage` repeated | 02-nav-phone-salvage-counted | ladder step, repeated face |
| 8 | `Repair drone` | 03-nav-phone-repair-priced | priced primary |
| 9 | `Build` | 04-nav-phone-build-ghost | build phase, 3 faces |
| 10 | place | 05-nav-phone-placed | rest, 4 faces |
| 11 | select the machine | 06-nav-phone-inspect | sheet over the world |
| 12 | `Connect dock to sorter` | 07-nav-phone-connected | ladder step |
| 13 | `Build` then place the furnace | 08-nav-phone-furnace-placed | build phase |
| 14 | `Connect sorter to furnace` | 09-nav-phone-two-machines | ladder step |
| 15 | `Sell steel` | 10-nav-phone-first-sale | M2, credits change |
| 16 | select a machine, then a fork face | 11-nav-phone-fork | 2 priced faces, 1 accented |
| 17 | `Store` | 12-nav-phone-store-rows | 12, 6 sell faces plus Close |
| 18 | `Yard` then `Copy` | 13-nav-phone-record-copy | save read |
| 19 | `A 1` then `Sound` | 14-nav-phone-text-scale-2 | settings faces |

Additional painted states from the same harness, one synthetic patch each:

| capture | state | how it is painted |
|---|---|---|
| 15-nav-phone-store-full | store 900/900 plus an overflow hold | seed patch `storeUnits: 900` plus one overflow entry |
| 16-nav-phone-unaffordable | credits 0, priced faces with no shortfall signal | seed patch `credits: 0` |
| 17-nav-phone-import-failure | malformed paste, reason line, Apply and Back | typed into the import field |
| 18-nav-phone-research-absent | the destination that has no face at this stage | fresh seed, no data |
| 19-nav-desktop1920-inspect | desktop inspector at 1920x1080 | mature seed |
| 20-nav-desktop1366-store | narrow laptop, store beside the world | mature seed |
| 21-nav-desktop2560-store | superwide, sheet over ink | mature seed |
| 22-nav-landscape844-store | landscape sheet | mature seed |

Explicit state list the path must show, all painted above: **rest**, **ladder step**, **priced primary**, **build phase**, **sheet open**, **fork**, **disabled for want of data** (research before the first data unit), **disabled for want of credits** (unaffordable), **empty** (store before the first contract, which prints "Sell Opens after the first steel contract"), **full** (900/900 plus overflow), **error** (import failure), **settings** (text scale, sound), **save** (record with Copy), **mirror** (reader tab, `Take over`).

### 7.1 Painted index as produced, with the press count each frame cost

| file | presses from its session start | note |
|---|---|---|
| 01-nav-phone-rest-step0 | 1 | rest at tutorial 0: three dock faces, Store / Salvage / Build |
| 02-nav-phone-salvage-counted | 12 | salvage counted, the priced repair face has taken the primary slot |
| 03-nav-phone-repair-priced | 13 | the drone repair just committed |
| 04-nav-phone-build-ghost | 14 | build phase: Cancel / Build Scrap sorter / Next |
| 05-nav-phone-placed | 15 | after the placing press: the dock is back to its resting faces |
| 06-nav-phone-inspect | 15 | machine inspector over the world, 20 px canvas grid |
| 07-nav-phone-connected | 15 | the connect step committed from the primary slot |
| 08-nav-phone-furnace-placed | 18 | furnace placed from the same two-press build step |
| 09-nav-phone-two-machines | 22 | inspector painted on the phone at the first machine, ladder head moved on |
| 10-nav-phone-first-sale | 22 | the first sale landed, the credits chip changes |
| 11-nav-phone-fork | 34 | the upgrade fork: two priced faces, one accented, dock Store / Build Furnace10 scrap + 5 ferrous ┬╖ waits 10 scrap ┬╖ have 1 / Build |
| 12-nav-phone-store-rows | 35 | store rows with their sell faces |
| 13-nav-phone-record-copy | 36 | yard record page with Copy and Import, reachable=false |
| 17-nav-phone-import-failure | 37 | error state: malformed paste, reason line, Apply and Back |
| 14-nav-phone-text-scale-2 | 38 | settings face pressed once: the text scale steps to A 1.25 |
| 15-nav-phone-muted | 39 | the second settings face: sound muted, the label flips to Sound X |
| 16-nav-phone-store-full | 1 | full state: 900/900 plus the overflow hold row |
| 18-nav-phone-unaffordable | 1 | disabled state to paint: credits 0, the priced faces still read enabled |
| 25-nav-phone-mature-research | 5 | the research sheet at the mature stage, one Close face |
| 19-nav-phone-research-absent | 0 | disabled state to paint: the Research destination has no face at this stage |
| 20-nav-desktop1920-inspect | 1 | 1920x1080 inspector in the right gutter, five dock faces behind it |
| 21-nav-desktop1366-store | 1 | 1366x768 narrow laptop: the store sheet is the gutter column at x 1104 |
| 22-nav-desktop2560-store | 1 | 2560x1440: the sheet at x 1104 lands inside the 896..1662 ink (finding 3) |
| 23-nav-landscape844-store | 1 | 844x390 landscape: sheet 560x157 over a 230 px ink column |
| 24-nav-landscape844-inspect | 3 | 844x390 landscape: inspector plus the fork inside a 46 px row band |

The 22 planned rows of section 7 and this index differ in three places, all of them real: the muted settings frame is `15-nav-phone-muted`, the landscape pair is `23` and `24`, and the mature research sheet is `25-nav-phone-mature-research`. `10-nav-phone-first-sale` was painted while the credits chip still read 0 because the fresh ladder had not closed a contract yet, which is why section 6 lists M2 as not reached inside 39 presses.

## 8. Limits of this evidence

- No real-device run, no screen-reader pass (NVDA or VoiceOver), no listening test; every number is headless Chromium at the six listed viewports, the same tool set as #45.
- The prototype presses are counted on the shipped pre-restart shell, because this issue specifies the navigation and the implementation issues (#49, #50, #51) paint it. The target column of section 6 is therefore a design figure, and the measured column is the comparison it has to beat.
- The `844x390`, `1920x1080` and `2560x1440` ink figures are the painted-pixel bounding box of #45, which includes the banner glyphs (its section 6 note), so the top-overlap arithmetic is an upper bound and the side figures are exact to 1 px.
- The camera band arithmetic of section 3 is arithmetic on measured rects, not a re-measurement; the implementation captures of #50 replace it.
- Machine selection inside the harness still needs the 20 px tap grid on the canvas, because the `M` key of section 5 does not exist yet; that is why the measured press counts in section 6 sit above the target column.

## 9. Consolidated numeric table (every row tagged)

One **press** = one painted face activated once, or one key. `presses` = shipped-shell painted-face activations; `pressed` = the prototype's own counter `S.pressed`. The prototype enforces this (#81 rework): `tap()` ignores absent, disabled and locked faces, so they are never counted and run no handler. Auto-settle waits and canvas selection probes are counted separately and are never presses. Every measured row names the committed receipt it comes from; every specified row names the section that sets it. headSha in each receipt is stamped to the captures commit (README.md).

### 9.1 Press budgets

| figure | value | kind | source |
|---|---|---|---|
| #45 reference budget to one machine | 16 presses, 0.00 batches/s, tick 51 | measured | `work/evidence/UI-RESET-45/journey-map.md` J1 |
| shipped gate cleared | 1 press | measured | `captures/captures-nav.json` frame 01 |
| shipped first machine placed | 18 presses | measured | `captures/captures-nav.json` frame 08 |
| shipped machine inspected | 22 presses | measured | `captures/captures-nav.json` frame 09 |
| shipped store rows open | 35 presses | measured | `captures/captures-nav.json` frame 12 |
| shipped whole path end | 39 presses | measured | `captures/captures-nav.json` frame 15 |
| shipped session A auto-settle | 34 waits / 17000 ms | measured | `captures/captures-nav.json` session A `autoSettle` |
| shipped rest-to-sell loop (mature) | 2 presses | measured | `captures/captures-nav.json` session B / frame 16 |
| shipped destination tour (mature) | 5 presses for 3 destinations | measured | `captures/captures-nav.json` session C |
| design gate | 0 pressed | measured | `captures/captures-proto.json` frame 30 |
| design machine inspected from Yard list | 16 pressed | measured | `captures/captures-proto.json` frame 37 |
| design whole path end | 22 pressed | measured | `captures/captures-proto.json` frame 40 |
| tap-budget app first machine placed | 12 presses | measured | `tap-budget.json` `app.machinePress` |
| tap-budget app total / auto-settle / probes | 28 presses / 40 waits (20000 ms) / 107 probes | measured | `tap-budget.json` `app` (re-run; settleWaits is sim-timing dependent, committed run 41/20500, see tap-budget.md §2) |
| tap-budget app production reading | 0.00 batches/s · 9s window, tick 480 | measured | `tap-budget.json` `app.productionReading` / `app.tick` |
| tap-budget model fresh ladder to disabled primary | 13 pressed | measured | `tap-budget.json` `prototype.freshPressed` |
| tap-budget model machine place press | 12 pressed | measured | `tap-budget.json` `prototype.machinePress` |
| tap-budget model rest-to-Store (mature) | 1 press | measured | `tap-budget.json` `prototype.storePress` |
| tap-budget model rate (static, no sim tick) | 0.00 batches/s · 60s window | measured | `tap-budget.json` `prototype.productionReading` / `modelNote` |
| target machine inspected | 13 presses | specified | section 6 target column |
| target first sale | 16 presses | specified | section 6 target column |
| target first upgrade | 19 presses | specified | section 6 target column |
| target settings and save read | 22 presses | specified | section 6 target column |

### 9.2 Layout, tap targets and clip

| figure | value | kind | source |
|---|---|---|---|
| shipped phone-390 cluster right edge | 380 of 390, no overflow | measured | `captures/measures-nav.json` phone-390 rest `rects.cluster` |
| shipped rest faces per band | 8 (15 store open, 9 research open) | measured | `captures/measures-nav.json` `buttons` |
| shipped phone nav row box | 10,790 370x46 | measured | `captures/measures-nav.json` phone-390 rest `rects.dock` |
| prototype phone-390 cluster right edge | 382 of 390 | measured | `measures.json` frames 31-40 `clusterRight` |
| prototype faces under 44 px | 17 of 19 frames; `tgl-scale` 39 px wide | measured | `measures.json` `summary.facesUnder44` |
| prototype clipOK | 17 of 19; frames 41/42 overflow 10 px (370 > 360) | measured | `measures.json` `summary.clipOK` |
| prototype band overlaps | 0 | measured | `measures.json` `summary.overlaps` |
| prototype rail width | 96 px | measured | `captures/captures-proto.json` `rects.nav` (R1) |
| prototype three-column breakpoint | 600 px | measured | `captures/captures-proto.json` landscape rects (R2) |
| prototype inspector pin | right edge of centred 1600 px frame (x 1432 at 1920, 1752 at 2560) | measured | `captures/captures-proto.json` `rects.insp` (R3) |
| minimum tap target | 44 px | specified | section 3.1 LP4 |
| visible button cap per frame | 8 | specified | section 2.3 P3 |
| fixed nav slot count | 5 (Yard Build Store Research Menu) | specified | section 1 |
| accented faces per frame | 1 (fork band excepted) | specified | section 2.3 P1 / P2 |
| desktop frame cap | 1600 px, centred | specified | section 3.3 D1 |

### 9.3 Integrity checks (this follow-up, #81)

| figure | value | kind | source |
|---|---|---|---|
| prototype entry points that paint | 1 (`prototype-nav.html`) | measured | `dom-shim-47.mjs` run |
| DOM-shim painted root length | fresh 1825, mature 3101 chars; every destination body non-empty | measured | `dom-shim-47.mjs` run (node v22.18.0) |
| PNG / receipt parity | 48 PNGs = 48 entries; both diffs empty; no duplicates; all press fields present | measured | `captures/parity.json` (`parity-47.mjs`) |
| prototype disabled / locked / absent taps counted | 0 - `tap()` returns early on absent, `disabled` or `aria-disabled` faces (no count, no handler); the fresh ladder never presses `Place` at 0 scrap, it refills via four `Salvage` presses (9-12) and places enabled at 15 | measured | `prototype-nav.html` `tap()`; `captures/captures-proto.json` frames 33-36 (#81 rework) |
| spec files | 1 (`navigation-spec.md`) | measured | this folder (`nav-spec.md` deleted) |
| test suite at final state | 32 files / 342 tests passed | measured | `npm test` (vitest) |
