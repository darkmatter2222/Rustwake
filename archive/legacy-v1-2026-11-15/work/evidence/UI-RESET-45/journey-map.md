# UI-RESET-AUDIT · Journey map (#45)

Same build and evidence set as `coverage-matrix.md` (head `1367a2c610133433cf0ce78c4441205b1c6006ea`, captures 01-43). Every step row is a real painted frame, not a reconstruction; quoted text is verbatim from `captures/*.json`. Wall-clock seconds are not measured, so the budget column counts interactions and the sim tick from the save.

## J1 First minute (fresh save, phone 390x844)

| # | Input | What changes on screen | Evidence |
|---|---|---|---|
| 1 | tap "Begin recovery" (only real face on the gate; "Sound on" is the second) | gate clears, chips appear | 01 |
| 2 | - | chips "Scrap 0 / Credits 0 / Store 0/900"; objective "Tap the highlighted wreck to salvage scrap." + "Tap Salvage until the drone repair is affordable." + "Drones 0 · Power 8 · 0 requested · 100 %"; dock = Store, Salvage, Build | 02, 40 |
| 3 | Store | panel paints exactly 3 lines: "Capacity 0/900", "Measured Power 100% speed (0 of 8 units requested)", "Sell Opens after the first steel contract" + a Close face | 03 |
| 4 | Salvage x7 (the primary face, repeated) | chips "Scrap 20"; objective line 1 becomes "Keep salvaging: 4/6 pulses for the drone repair." while line 2 stays the old instruction | 04 |
| 5 | Build | dock flips to Cancel / "Build Scrap sorter 20 scrap" / Next; objective line 2 "Ghost on cell 0 · tap again to place"; toast "Cutting pulse recharging" | 05 |
| 6 | tap on the ghost cell | chips "Scrap 0", tick 30 to 40, dock returns to the 3 resting faces | 06 |
| 7 | tap the machine | panel page 1: Status "Needs input", Batch 0%, Cycle 4.00s, Actual rate "0.00 batches/s · 1s window", Max rate "0.25 batches/s at full power", Power "1 unit", Measured "Working 0% · waiting for input 100% · output waiting 0% · power 100%", Next step "Needs 2 scrap, which nothing in the yard" + 4 faces | 07 |
| 8 | Recipe | page 2: Inputs "2 Scrap", Outputs "1 Ferrous, 1 Nonferrous", Level 1, In buffer 0/12, Tray 0/12 | 08 |
| 9 | Close + one primary press | tick 51, toast still "Cutting pulse recharging" | 09 |

Budget: **9 table steps = 16 scripted presses** (1 gate + Store + Close + 7 repeated taps on the same primary face + Build + place + select + Recipe + Close + primary) **to reach one machine with 0 batches done**, sim tick 51. The first machine never produces inside the captured window: its own panel says "Actual rate 0.00 batches/s" and the store stays 0/900.

J1 defects:
- Line 1 and line 2 of the objective say the same thing during the salvage phase ("Keep salvaging: 4/6 pulses ..." above "Tap Salvage until the drone repair is affordable.") - two instructions, one action. -> **#51**, **#64**.
- The 4-face machine panel is the densest frame of the first minute (10 label/value lines, 10.8 px type) and arrives before the player has seen a single product. -> **#54**, **#66**.
- Yard and Research are still absent from the dock after the placement (41-43: "Store | Salvage | Build"), so the two panels that explain progress (record, research) never appear in the first minute. -> **#64**, **#47**.
- The toast "Cutting pulse recharging" is the only timed feedback and it shares the `top: 8` band with the chip row. -> **#65**.

## J2 First factory running (mature seed as the end-state, 390x844 and 1920x1080)

The mature save is the first-factory end-state: 8 machines, 18 links, 5 drones, store 900/900, tutorial 9, tick 450 3xx after catch-up.

| # | Input | What changes | Evidence |
|---|---|---|---|
| 1 | tap "Back to yard" on the boot report | rest frame: 4 chips (phone) / 7 chips (1920), objective "Sell 35 Ferrous for 70 credits." + "A machine waits for input; check its empty side." + "Drones 5 · Power 8 · 0 requested · 100 %", dock 5 faces | 14 / 23 |
| 2 | primary face | exactly one action face at rest: "Sell 35 Ferrous +70 credits" - one press, one ladder step | 14, 23 |
| 3 | Store | 9 material rows with 6 sell faces, then Capacity 900/900, "Measured Power 100% speed (0 of 8 units requested)", "Measured Busiest link 97% busy (3/24 in transit)", "Measured 8 machines waiting for input", "Sell floor 10 units kept per material" | 15 / 36 |
| 4 | Build | dock flips to Cancel / "Build <name> 20 scrap" / Next; the desktop label adds a second line "20 scrap · waits 20 scrap · have 15" | 05 / 32, 35 |
| 5 | tap a machine on the canvas | panel page 1: Cycle 1.74s, Max rate "0.57 batches/s at full power", Power "1 unit", Measured "Working 5% · waiting for input 95% · output waiting 0% · link 1% busy · power 100%", Next step "Storage is full at 100%. Sell a surplus in the yard store to free room.", Next upgrade "1.74s → 1.67s · 222 credits", Needs "2 Scrap" + faces Close/Upgrade/Move/Dismantle/Recipe; the dock shrinks to the fork pair | 19 / 24, 27, 38 |
| 6 | fork face | objective line 1 becomes "Choose what improves on the Scrap sorter · 222 credits" (1920: "Plate press · 238 credits") | 19, 21 / 24, 27 |
| 7 | Research | header "Data 102" + 3 nodes with costs "Known 4 Data", "Known 8 Data", "Known" | 16 / 25, 37 |
| 8 | Yard | Tick 450330, Machines 8, Drones 5, Links 18, Credits 82, Save "27839 characters" + raw payload + Copy/Import | 17 |

J2 defects:
- Machine selection has no DOM hit target: the harness needed a 20 px tap grid to open a panel (41-43, 38). With 8 machines in the world there is no list, no overview, and no keyboard-reachable selection - every comparison means re-tapping the world. -> **#47**, **#54**, **#50**.
- The same command is printed in two different formats in one frame: dock "Sell 35 Ferrous+70 credits" vs panel "Sell 35 · +70"; the dock label carries no separator between name and price ("Less power222 credits"). -> **#52**, **#56**, **#48**.
- Build label stacks three numbers ("20 scrap · waits 20 scrap · have 15") at 12 px inside a 46 px face on desktop. -> **#52**, **#66**.
- The two most useful strings in the inspector (Next step, Next upgrade) are the last lines of a 10-line list inside a 42 %-height box, i.e. below the internal scroll fold on phone. -> **#54**.

## J3 Bottleneck recovery (storage full, phone 390x844 + 2560x1440)

| # | Observed | Evidence |
|---|---|---|
| 1 | chip "Store 900/900"; objective line 1 already a sell suggestion | 14, 20, 39 |
| 2 | after the overflow entry appears the suggestion shrinks: line 1 "Sell 2 Ferrous for 4 credits." and the panel grows a 7th row "Overflow hold 35" | 20 |
| 3 | store rows now read Scrap 10, Nonferrous 10, Ferrous 21, Steel 10, Copper 10, Polymer 10, Wire 16, Plates 109, Circuits 40, Data 76 with faces "Sell 2 · +4", "Sell 6 · +24", "Sell 60 · +900", "Sell 22 · +660", "Sell 60 · +300" | 20 |
| 4 | the machine panel repeats the same advice as its Next step line ("Storage is full at 100%. Sell a surplus in the yard store to free room.") while its Measured line says "waiting for input 95%" | 19, 24 |
| 5 | the desktop 2560x1440 frame shows the identical 7-chip row, the same 320 px gutter panel at x 1104 and the same 6 sell faces, so recovery costs the same reading load on a 2560 px screen as on a 390 px one | 39 |

Recovery budget: **2 presses from rest** (Store, then one sell face) - the shortest loop in the game. Its cost is reading 5 to 6 "Measured/Sell floor/Overflow" lines to know which face is right.

J3 defects:
- No saturation gradient: capacity is a ratio string ("900/900") plus an "Overflow hold" row, no per-material fill, so the player cannot see which material is holding the store full without opening the panel and scanning 10 rows. -> **#56**, **#51**.
- Three different strings express the same state (chip "Store 900/900", panel "Capacity 900/900", machine panel "Storage is full at 100%.") with no shared emphasis. -> **#51**, **#59**.
- The suggestion face and the panel face duplicate the action with different number formats (J2 defect 2), so the player compares 4 numbers to pick one. -> **#56**.

## J4 Returning player (12 h absence, then the mirrored tab)

| # | Observed | Evidence |
|---|---|---|
| 1 | 30 ms after "Begin recovery" the boot layer is already the finished report: the "Catching your yard up" progress line never painted for this seed (450k ticks resolve in ~30 ms) | 12 |
| 2 | report content, title plus 9 value rows: "While you were away", "Time Away 124h 24m", "Time Your operation worked for 12h 0m (capped)", "Nonferrous +229", "Ferrous +33", "Wire +59", "Plates +245", "Deliveries 250", "Batches 765", "Bottleneck Storage full" | 13, 22, 26 |
| 3 | the only cue for the 112 h that were dropped is the word "(capped)" inside the second Time line | 13 |
| 4 | the report is not on screen after "Back to yard" and has no face of its own; the closest re-readable substitute is the Yard panel stat line ("Tick 450330", "Save 27839 characters") | 14, 17 |
| 5 | the chip row and the report disagree about which materials matter: phone chips are Scrap/Ferrous/Credits/Store while the report leads with Nonferrous, Wire and Plates | 13, 14 |
| 6 | 1920x1080 and 1366x768 show the same 10-line report as the boot layer over the full-bleed world | 22, 26 |
| 7 | opening the same save in a second tab gives the follower frame: objective "Following the other tab" + "This tab mirrors the yard exactly as the first tab writes it." with a single "Take over" face in the primary slot; Store, Yard, Build and Research stay live in the same dock | 28 |

J4 defects:
- The cap is a parenthetical, not a state: 112 h of unsimulated time is invisible unless the player notices "(capped)". -> **#61**.
- Two material vocabularies in one session (report list vs chip row), and no ordering rule between them. -> **#61**, **#51**.
- The report is single-use; there is no way to re-open it, so a returning player who taps through it loses the only summary of what happened. -> **#61**.
- The follower tab pairs a "mirrors exactly" claim with 4 still-live mutating faces. -> **#49**.

## Cross-journey load table

| Journey | nav faces | action faces visible at once | longest text block | internal scroll needed |
|---|---|---|---|---|
| J1 first minute | 3 | 1 primary (3 in build phase) | machine panel, 10 lines | yes (page 2) |
| J2 factory | 5 | 2 fork + 5 panel faces (10 buttons incl. icons) | machine panel, 10 lines | yes |
| J3 bottleneck | 5 | 6 sell faces + Close (15 buttons incl. icons) | store panel, 9 rows + 6 summary lines | yes |
| J4 returning | 5 | 1 ("Back to yard") | report, title plus 9 rows; yard record adds a 27 839-char payload | yes |

## Reproduce

```text
npm ci && npm run build
node node_modules/vite/bin/vite.js preview --port 4173 --strictPort
node work/evidence/UI-RESET-45/capture-baseline-45.mjs
node work/evidence/UI-RESET-45/capture-extra-45.mjs
node work/evidence/UI-RESET-45/capture-extra2-45.mjs
node work/evidence/UI-RESET-45/measure-baseline-45.mjs
node work/evidence/UI-RESET-45/measure-dock-45.mjs
node work/evidence/UI-RESET-45/probe-afford-45.mjs
```

The capture scripts write into `captures/` and print one line per frame; the synthetic states (900/900 store + overflow, credits 0) are produced by patching the installed envelope and recomputing its checksum in `install()`, so no game code was touched for this audit.
