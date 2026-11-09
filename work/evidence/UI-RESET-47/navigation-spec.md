# UI-RESET/NAV (#47) - navigation and information architecture spec

- Issue: https://github.com/darkmatter2222/Rustwake/issues/47 | Parent goal: https://github.com/darkmatter2222/Rustwake/issues/43 | Project 1, milestone 1
- Branch `rw/47-nav-g1` | Base SHA `224e22aa57a68215a2eddfe606ef50462b4d0b5e` | Role: ui-ux | Gate G1
- Predecessor evidence (read, not re-derived): `work/evidence/UI-RESET-45/measures.json` (head `1367a2c610133433cf0ce78c4441205b1c6006ea`), `coverage-matrix.md`, `journey-map.md`
- Prototype of the path in this spec: `work/evidence/UI-RESET-47/captures/` (PNG + `captures-nav.json`), scripts `capture-nav-47.mjs`, `measure-nav-47.mjs`

## 0. How to read this spec

| kind | meaning | source |
|---|---|---|
| **measured** | a number already painted and recorded by the #45 harness | `measures.json`, `captures/*.json` |
| **specified** | a target this issue sets for the implementation issues (#49 shell, #50 camera, #51 HUD, #52 catalog, #54 inspector, #55 fork, #56 store, #58 research, #62/#63 entry and yard) | sections 1 to 6 |
| **predicted** | arithmetic on measured rects, to be confirmed by the implementation captures | section 3 |

The prototype in section 7 runs against the shipped build, so its numbers are measured on the pre-restart shell and are the comparison base, not the target.

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
{Verb} {name} · +{number} {unit}       gain   ->  Sell 35 Ferrous · +70 credits
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
| sell from the ladder or a store row | `Sell 35 Ferrous · +70 credits` |
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

- **P1** the nav row keeps the measured dock geometry exactly (`10,790 370x46` and `10,586 340x46`), so the five 44 px targets keep their measured widths: at 390 Store 50, Yard 45, Build 49, Research 72, Menu 57 = 273 px plus four 4 px gaps inside the measured 370 px box.
- **P2** the primary row costs 54 px of camera band (46 px face plus an 8 px gap). The fitted band is objective bottom to B4 top: 390x844 gives 128 -> 736 = 608 px (measured 662), 360x640 gives 153 -> 532 = 379 px (measured 433).
- **P3** a sheet never resizes when the destination changes: 348 px at 390, 262 px at 360 (the measured heights of the store and research panels). Its content scrolls inside, which is already how the store behaves.
- **P4** no face in any band is under 44 px; the measured set already passes and the specified widths above are the measured widths of the shipped faces.

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
| sell (ladder or row) | `btn.sellNamed`, `value.sellButton` | primary row when it is the ladder head, otherwise the row face inside nav slot 3 | 1 or 2 |
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
