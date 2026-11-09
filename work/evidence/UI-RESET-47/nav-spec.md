# UI-RESET #47 · Navigation and information architecture (gate G1)

- Issue: https://github.com/darkmatter2222/Rustwake/issues/47 · Parent goal: https://github.com/darkmatter2222/Rustwake/issues/43 · Cutover note: #44
- Role: ui-ux · Branch rw/47-nav-g1 · Base 224e22aa57a68215a2eddfe606ef50462b4d0b5e (the #45 audit head, PR #74). This spec stacks on #74: it reuses that audit as its constraint set instead of re-deriving it.
- Prototype: prototype.html (self-contained, no build step, loads over file://). Harness: capture-47.mjs (painted PNGs, per-frame painted DOM, band rects, press log) and measure-47.mjs (band insets, face counts, press budget, disabled/error probes). Generated evidence: captures/, captures/captures.json, measures.json.

## 0. Constraints inherited from the #45 audit (measured, not re-derived)

| ID | Measured fact (audit reference) | Consequence for this design |
|---|---|---|
| C1 | Dock face set changes by stage: 3 faces through the whole first minute (Store, Salvage, Build) and 5 in the mature frame with the orange primary; Yard and Research are absent at every fresh step (frames 02, 40, 41; probes 42, 43) | The number of slots stops changing. Five nav slots are painted in a fixed order at every stage; a not-yet-reachable destination is a locked slot, not a missing one |
| C2 | Two non-equivalent exits are always on screen: the panel Close face pops one Escape level, the icon-cluster Home face resets to rest (frames 15-21, 36-38) | One exit function per frame, painted once; the nav row carries destinations, not exits |
| C3 | One command prints in two formats in the same session: dock "Sell 35 Ferrous+70 credits" vs panel "Sell 35 · +70"; the fork frame repeats one price four times (frames 14, 15, 19, 21) | One printed command format and one price per frame |
| C4 | The chip row re-wraps by width: 3/4/5/7 chips and band heights 23/48/73 px, pushing the world ink about 50 px between 360 and 390 width (frames 02, 10, 11, 14, 23) | The chip band is pinned to one fixed height per breakpoint, so the world band stops moving |
| C5 | The only timed feedback shares the top: 8 band with the chip row (frame 05, "Cutting pulse recharging") | Toasts get a reserved band of their own directly above the action row |
| C6 | Unaffordable has no visual signal: every face still disabled:false and opacity:1 at credits 0 (probe-afford-45.mjs, frame 21) | Disabled and error states become explicit, with a printed shortfall |
| C7 | The measured first-minute budget is 16 scripted presses for one non-producing machine at 0.00 batches/s (tick 51) | Budget target for the redesigned path: 10 presses or fewer |
| C8 | The objective card overlaps painted world ink on every viewport except phone portrait (ink y 20 at 1920, y 0 at 1366, y 28 at 844x390, against a card at y 58-124) | No region may overlap the world: the shell is one grid, not absolute layers |
| C9 | Landscape 844x390 gives the world 230 px of 844 (27 %); 2560x1440 keeps a 766 px world with 896 and 898 px empty and pins the 320 px gutter panel at x 1104 on top of ink 896-1662 | Landscape and wide viewports use a real 3-column shell with a side inspector column |
| C10 | Machine selection has no DOM hit target; the harness needed a 20 px tap grid on the canvas | The Yard destination lists every machine as a tappable row, so selection is reachable by tap, key and reader |
| C11 | Two implemented commands have no face anywhere (machine.respec and route.remove: zero occurrences in src/ui), and reducedMotion has no face at all (written only from the OS media query) | Section 5 assigns a destination to each of them |
| C12 | The mature frame paints one label hierarchy at three sizes (icon 11.7 px, panel 12.75 px, dock 13.2 px) with up to 15 faces at once | One type ramp, two tiers per surface, and a face cap: nav 5 + action 1-3 + inspector 1-6 |

## 1. Shell: one grid, six named regions, no absolute overlap

The shell is a single CSS grid. Every region is a grid area, so no region can land on top of the world ink (this is the structural fix for C8 and C9). Only the toast is layered, and it is layered inside the world cell, so it never changes the camera inset.

- N1 Yard - the rest frame: world ink plus the objective card. Always the row/column index 1 destination.
- N2 Build - blueprint catalog, one selected blueprint drives the ghost.
- N3 Store - Storage and Trade in one destination: material rows with fill, sell faces, capacity and one measured line.
- N4 Research - node list with costs.
- N5 Menu - settings (sound, text scale, motion), the yard record, the import sheet and the last away report.

- A1 Action row - the only place a game command is committed. Exactly one primary face, or the 2-face upgrade fork, or the 3-face build phase.
- A2 System cluster - the three state toggles (Sound, A scale, MOTION) in the top band. These are the only non-nav faces in the chrome, and they change no destination.
- A3 Inspector - one body at a time (machine, store, research, menu, report). 0 or 1 painted, never 2.

### 1.1 Portrait shell (360 to 599 px width)

| Region | Pinned height | Source of the number |
|---|---|---|
| R1 top band (chip row + system cluster) | 8 px pad + 44 px = 52 px | Measured cluster faces are 44 px (audit 4) and the chip row is 23 px inside them; the band is pinned so it can no longer become 23/48/73 px (C4) |
| R2 objective card | 66 px | Measured 10,62 340x66 at 390x844 (audit 4) |
| R3 world | 1fr | leftover, see the measured table in section 6 |
| R4 action row | 46 px | Measured dock face height 46 px (audit 4) |
| R5 nav row | 44 px | Measured icon-face height 44 px (audit 4) |
| gaps | 6 px between rows, 8 px bottom pad | keeps the 44 px faces 6 px apart, matching the measured 46/44 rhythm |

Total portrait chrome is 134 px, so the world cell is 374 x 710 at 390x844 against the measured 374x561 (frame 14). The chip band is one row of at most 4 chips; the system cluster prints glyphs only below 380 px width so that one row and the cluster still share the pinned 44 px line (measured need: 4 chips about 220 px plus a 132 px glyph cluster).

### 1.2 Short landscape shell (844x390) and desktop shell (600 px and wider)

| Region | Width | Notes |
|---|---|---|
| N1-N5 rail (left) | 96 px, 5 stacked slots of 62 px | side navigation replaces the bottom nav as soon as width is 600 or more |
| world column | 1fr | band 52 px, card 30 px (one line at height under 460), action row 46 px |
| A3 inspector (right) | 320 px, painted only when a destination is open | a real grid column, so the world shrinks instead of being covered |
| content cap | 1600 px centred | stops the 2560x1440 waste of 896 and 898 px (C9) |

Measured targets: 844x390 rest = world 732x236 against the measured 230x346 (C9); with the inspector open = 424x236. 1366x768 = world about 918x614 with a 320 px inspector beside it, not on top of it. 1920x1080 = world about 1172x926 inside a 1600 px cap.

## 2. Destination table per tutorial stage

Slot states: `ready` (tappable), `active` (the destination being painted), `locked` (inert face, printed lock reason, no press consumes it). The five slots are painted in this order at every stage: Yard, Build, Store, Research, Menu. One primary face per frame, printed in the CF format of section 3.

| Stage (sim state) | Yard | Build | Store | Research | Menu | The one action-row face | Extra action faces |
|---|---|---|---|---|---|---|---|
| S0 entry gate (no save) | not painted - the gate is a single-face layer, "Begin recovery" is the only real face (frame 01) | - | - | - | - | Begin recovery | Sound toggle |
| S1 salvage (tutorial 0-1, no drone) | active | ready | ready | locked - "Needs 1 Data" | ready | Salvage | none |
| S2 repair (tutorial 2, 30 scrap in hand) | active | ready | ready | locked - "Needs 1 Data" | ready | Repair drone / 30 scrap | none |
| S3 first build (tutorial 3-6, no sorter) | active | ready | ready | locked - "Needs 1 Data" | ready | Build Scrap sorter / 20 scrap | none |
| S4 first link (tutorial 3-6, sorter placed, no routes) | active | ready | ready | locked - "Needs 1 Data" | ready | Connect sorter to the dock | none |
| S5 furnace (tutorial 3-6, furnace missing) | active | ready | ready | locked - "Needs 1 Data" | ready | Build Furnace / 20 scrap 5 ferrous | none |
| S6 furnace link (plans pending) | active | ready | ready | ready once the first Data lands | ready | Connect furnace to the store | none |
| S7 first contract (tutorial 7) | active | ready | ready | ready | ready | Sell Steel contract / 3 steel +30 credits | none |
| S8 yard ladder (tutorial 8-9) | active | ready | ready | ready | ready | one face from the ladder: Sell / Build / Connect / Buy data / Add drone / Upgrade | none |
| S9 upgrade fork (a machine selected, upgrade is the next step) | inactive | ready | ready | ready | ready | replaced by the fork: Less power / 222 credits | Faster batches / 232 credits (2 faces total, cheapest first, only the cheapest carries the accent) |
| S10 build phase (a blueprint is chosen) | inactive | active | ready | ready | ready | Place Scrap sorter / 20 scrap | Cancel, Next (3 faces total) |
| M1 reader tab (mirror) | inactive | inert | inert | inert | inert | Take over / (1 face - the other four are inert while a second tab owns the write lease) | none |
| M2 offline catch-up (report pending) | inactive | inert | inert | inert | inert | Catching your yard up (inert status line) | none |
| M3 return report open | inactive | ready | ready | ready | ready | Back to yard / (1 face, the report owns the frame) | none |

Stage rules:

- R-1 The five slots never appear, disappear or reorder. Only their state changes, so the thumb learns five positions once (fixes C1).
- R-2 A locked slot is inert: it has `aria-disabled=true`, no accent fill, and its lock reason is the second line of its own face ("Needs 1 Data"). A locked slot is not an exit and never consumes a press.
- R-3 Exactly one face in the whole frame carries the accent fill (the amber primary of the measured mature dock). The fork gives it to the cheapest branch, as measured today.
- R-4 A machine selected on the canvas moves the inspector to that machine but does not change the destination; the destination only changes through a nav slot or the browser back step. This keeps the objective card free to name the same one command the action row prints.

## 3. One printed command format (CF)

Every commit face is generated by one function and paints exactly two lines:

```text
CF face  =  line 1: "<Verb> <target>"
           line 2: "<amount> <unit>[ · <amount> <unit>]"
```

- CF-1 Line 1 always carries the verb and the target name, never a number. Line 2 carries the numbers with their unit words. This is the only allowed arrangement.
- CF-2 Unit words are always printed: `units`, `scrap`, `credits`, `Data`, `s`. No bare "Sell 35".
- CF-3 One price per command per frame. When the same command id is painted on two surfaces, only the committing surface (the action row) prints line 2; the other surface prints line 1 alone. List rows are separate command ids and each keeps its own line 2.
- CF-4 Pending/waiting numbers ("waits 20 scrap · have 15") are not face text: they live on the single numeric readout line of the objective card, so a 46 px face never stacks three numbers (measured defect in audit J2).

| Measured today (two formats) | The one CF string |
|---|---|
| dock "Sell 35 Ferrous+70 credits" / store row "Sell 35 · +70" (frames 14, 15) | "Sell Ferrous" / "35 units · +70 credits" |
| "Less power222 credits" and "Upgrade · 222 credits" and the card "…222 credits" (frame 19) | "Upgrade Less power" / "222 credits", printed once |
| "Build Scrap sorter20 scrap" plus a desktop second line "20 scrap · waits 20 scrap · have 15" (frames 05, 32, 35) | "Build Scrap sorter" / "20 scrap" |
| "Move · cell 9 · 0 credits" (frame 19) | "Move to cell 9" / "0 credits" |
| "Dismantle · +20 units" (frame 19) | "Dismantle" / "+20 units" |
| "Buy · 4 Data" (frame 16) | "Research Efficient Cutters" / "4 Data" |
| "Add drone" (no price printed) | "Add drone" / "45 credits" |

## 4. Exit semantics: Close, Back, Escape, browser back, focus, exclusivity

- E-1 One pop function. The inspector header Close face, the Escape key and the browser back button all call the same pop. This replaces the two measured non-equivalent exits (C2): the old Home face is gone because the Yard slot is the rest frame.
- E-2 The stack has three level kinds and pops exactly one per activation: L0 destination, L1 entity (machine id, store row, research node), L2 subpage (recipe, links, import sheet, away report). With an empty stack Escape is a no-op; the page never scrolls (measured: docScroll equals the viewport at all six sizes).
- E-3 The Yard slot is the only reset: it pops to L0, repaints the rest frame and refits the camera, which is what the measured Home face did. It is a destination, so it is also the browser-back anchor.
- E-4 Focus return. Every push stores the id of the face that opened it (`returnFocus`). A pop focuses that face again: nav faces are `nav-yard`, `nav-build`, `nav-store`, `nav-research`, `nav-menu`; the primary is `action-primary`; list rows are `row-<id>`. Tapping empty world or Escape after selecting a machine returns focus to the Yard list row of that machine, so a keyboard or reader user never loses its place.
- E-5 Panel exclusivity: 0 or 1 inspector body. A new destination replaces the body in the same grid column; there is no second scrim and no stacked pair. In portrait the scrim belongs to the sheet and tapping it pops one level.
- E-6 Selection persistence: the selected machine id, the chosen blueprint, the ghost cell, the store scroll offset and the subpage index survive destination switches, sheet closes and toasts. They are session state only and are never written into the save, so the save shape and the simulation stay byte-identical.
- E-7 Browser back: opening a destination or pushing a level adds one history entry; a tap on the already-active slot adds none. Five back activations walk the stack to the rest frame; the sixth leaves the page. There is exactly one entry per visible level, so the back button and the Close face cannot disagree.
- E-8 The toast is not a target: `role=status`, its own band inside the world cell, at most one at a time, 1.8 s, no interaction required and none blocked while it is up.
- E-9 Reader (follower) tab: only Take over is live; the four other slots are inert, so the mirror claim and the painted faces agree (measured defect in audit J4 row 7).
- E-10 No essential function is hover-only or gesture-only. Camera pan and zoom keep their gestures and also get two painted faces in the world cell (`Zoom -`, `Zoom +`, 44 px each); refit is the Yard slot. Hover only brightens an already-visible face.

## 5. Every existing action has one documented destination

Command ids are the sim contract in `src/game/simulation/commands.ts`. Face = a painted, 44 px, keyboard-reachable element. The three state toggles are printed once, as faces; the Menu lists them as state rows with no second face, so no toggle is duplicated.

| Action (command id or setting) | Destination | Where the face is | Notes |
|---|---|---|---|
| manual.salvage | Yard | action row, primary slot | the S1 primary face, repeated taps stay one face |
| drone.repair | Yard | action row, primary slot | S2 |
| drone.add | Yard | action row, primary slot | the ladder step; CF line 2 carries the 45 credit price |
| machine.build | Build | catalog row selects, action row commits ("Place Scrap sorter") | the ghost is seeded on the first free cell, so no canvas tap is required |
| machine.upgrade | Yard with a machine selected | inspector header face plus the fork pair in the action row | the fork replaces the primary, one accent |
| machine.respec | Yard with a machine selected | inspector subpage L2 "Branches" | had no face at all in the audited build (C11); it now owns the second line of that subpage |
| machine.dismantle | Yard with a machine selected | inspector face | CF "Dismantle" / "+20 units" |
| machine.move | Yard with a machine selected | inspector face | CF "Move to cell 9" / "0 credits" |
| route.connect | Yard | action row primary, and one face per link row in the inspector subpage L2 "Links" | one press sends the pair as today |
| route.remove | Yard with a machine selected | inspector subpage L2 "Links", one face per link row | had no face at all in the audited build (C11) |
| contract.export | Yard | action row, primary slot | S7 |
| contract.sell | Store | one face per material row; the same id is also the primary when it is the next ladder step | CF-3 keeps the price on the committing surface only |
| research.buy | Research | one face per node row | locked nodes print the lock line, not a face |
| settings.muted | - | system cluster face 1 | Menu row shows the state, no second face |
| settings.textScale | - | system cluster face 2 | cycles 1, 1.25, 1.5, 2 as today |
| settings.reducedMotion | - | system cluster face 3 ("MOTION") | new face: the setting existed with no face at all (C11) |
| save export (Copy) | Menu | record page face | the payload prints as one collapsed field, Copy is the only writer |
| save import (Apply, Back) | Menu | import page, L2 | Apply is disabled while the field is invalid, see section 7 |
| away report (Back to yard) | Menu (re-readable as "Last away report") | single face owning the frame, mode M3 | the measured report was single-use and unrecoverable (audit J4 row 4); it is now a Menu row |
| world select (machine) | Yard | canvas tap, or the matching Yard list row `row-machine-<id>` | the list is the DOM hit target the audit lacked (C10) |
| world deselect | Yard | tap on empty world | one press, identical to one pop |
| camera pan, zoom | - | painted `Zoom -` and `Zoom +` in the world cell, drag and pinch in addition | E-10 |
| camera refit | Yard | the Yard slot | replaces the measured Home face |
