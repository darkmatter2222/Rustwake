# Issue #47 - UI-RESET/NAV: navigation and information architecture spec, coded prototype, painted captures
Parent #43, gate G1, milestone 1, Project 1. Stack base: PR #74 (head 224e22aa57a68215a2eddfe606ef50462b4d0b5e). Measured inputs reused from the #45 audit in this stack (coverage-matrix.md, journey-map.md). Nothing is re-derived from work/ archives.
Artifacts: prototype-nav.html (self-contained coded prototype: inline CSS and JS, no build step, no save writes), capture-proto-47.mjs (Playwright harness, 19 painted frames over 9 viewports/states, writes captures/captures-proto.json), measures-from-captures.mjs (derives measures.json), captures/30..48-proto-*.png, measures.json.
## 0. Measured constraints from #45 that this spec must satisfy
| ID | measured fact (#45) | consequence |
|---|---|---|
| C1 | fresh dock = 3 faces (Sound, A, MOTION); no Yard/Build/Storage/Research/Menu | permanent 5-slot dock introduced as inert faces with printed reasons |
| C2 | two non-equivalent exits (Close glyph, Escape): after Close the card is gone and Escape no longer works | exactly one close/back/Escape semantic, idempotent |
| C3 | two command formats coexist (30 / 4 / 1 and 5x36->2x25 20 scrap); 35 of 86 chip texts carry price; 12 of 48 chips change per batch | one printed command format, one price per command per frame |
| C4 | chip row width by stage 3/4/7 chips; face-height bands 23/48/73 px | fixed bands, rows never grow, every face at least 44 px |
| C5 | top toast shares top:8 with the A face | toast is its own band, outside the camera inset |
| C6 | unaffordable faces: disabled:false, opacity:1 | real disabled plus de-emphasis, reason printed |
| C7 | budget 16 presses for J1 at 0.00 batches/s (46 idle polls) | target to beat: 16 total, and 9 of those were navigation |
| C8 | nav faces are role=button tabindex=0; #rustwake-root still role=presentation | nav stays tabbable, aria-current marks the destination |
| C9 | 18 aria-label attributes on 8 visible faces in one frame | one label per face, printed text is the label source |
| C10 | one 1600 px container at 2560x1440 | prototype uses three proportional columns (measured 2116 px world at 2560x1440); the cap stays an open item for #48 |
| C11 | 1 of 14 commands has a sublabel (5x36->2x25) | sublabel rule: quantity line only |
| C12 | 94 nodes at first paint, 15-23 mutations per batch | 5 nav cells + 1 action row + 1 card + 1 toast is within budget |
## 1. Shell: destination model, bands, exclusivity
Five permanent destinations in fixed order, always present: Yard (replaces Home; the Yard is the rest/reset state), Build, Store (Storage and Trade in one place), Research, Menu. Contextual commands live in one action row directly above the nav bar; they are numbered 1, 2, 3 and are never navigation. Yard is not a sixth face: it is slot 1.
| band | phone 390x844 (measured) | desktop 1366x768 (measured) |
|---|---|---|
| resource band | 374x44 @ 8,8 | 1248x44 @ 110,8 |
| card / status | 374x40 @ 8,58 (54 when the fork is open) | 1248x40 @ 110,58 |
| world (camera inset) | 374x595 @ 8,139 | 922x604 @ 110,104 |
| inspector | does not exist, the sheet replaces it | 320x656 @ 1038,104 |
| action row | 374x46 @ 8,740 | 922x46 @ 110,714 |
| nav | 374x44 @ 8,792 (bottom bar) | 96x752 @ 8,8 (left rail) |
Panel exclusivity (measured: overlaps = [] over all 19 frames in measures.json): at any instant exactly one of {sheet, menu, settings, import} is open; when it is open the world shrinks instead of being covered (frame 39: world 374x153, inspector 374x457), and the nav bar keeps its 44 px band. minFaceHeight = 44 px: every band above is 44 px or taller, and the 29-40 px text lines are labels, not faces.
Selection semantics: one selection; it survives destination changes; Yard does not clear it; Escape clears it last; closing a panel returns focus to the face that opened it (probe: row-machine-1).
## 2. Destinations per stage (state matrix)
| stage | Yard | Build | Store (Storage/Trade) | Research | Menu |
|---|---|---|---|---|---|
| fresh | active: machine slots plus the salvage pulse | locked, printed +30 on the cell | locked, printed +4 | locked, printed +1 | enabled, 3 rows |
| lean | active, 6 units in the ladder | unlocked, 7-unit row | unlocked, one price line per item | unlocked, 1 research | enabled, 3 rows |
| mature | 11 units, machine slots populated | 48 px phase chips | prices plus pending lines | 11 research | 3 rows |
| degraded | unchanged, one toast 10/s, nav keeps working | unchanged | unchanged | unchanged | unchanged |
Locked cells are inert: disabled with the printed unlock reason (+30, +4, +1). They consume no press and are not tabbable. No destination disappears between stages; only card contents change (measured: frames 30, 32, 37 keep the same nav band 374x44 while the card goes 40 to 54 px).
## 3. One command format
Every action face prints exactly two lines. Line 1, the face text, one verb plus target: Sell Machine 1, Repair, Build, Research 2. Line 2, the sublabel at 68 percent type in the muted colour, amount and unit with hyphen separators: 120 scrap; 30 scrap - 28 - x3; 30 - 4 - 1.
Price is printed once per command per frame. Pending and animated numbers (144 -> 180, 4.0/s, 10/s) live on the card status line, not on faces, so a batch no longer mutates the action row (measured: the action band keeps 46 px in all 19 frames).
## 4. Exit, back and selection rules (implement verbatim)
| # | rule |
|---|---|
| E-1 | one Close glyph on the open panel only; it does the same thing as Escape |
| E-2 | Escape closes in this order: settings, menu, sheet, then clears the selection; a second Escape with nothing open is a no-op, not a second state change (measured: frames 39 to 40, two Escape presses take the import page and the sheet back to the rest frame, 16 to 18 presses, no extra state) |
| E-3 | closing a panel restores focus to the face that opened it (probe: row-machine-1) |
| E-4 | browser back: one history entry per destination change; back pops one destination, back at the Yard pops the open panel; two back steps from a deep panel reach the same state as Close twice |
| E-5 | no focus trap: tab order is resource band (skip), nav 1-5, action row, card faces; the last face wraps to nav 1 |
| E-6 | Yard equals rest/reset: one press, no confirmation, the ladder keeps its numbers, toast Rest |
| E-7 | toast is an in-world overlay inside the camera inset below the system cluster; it never shares top:8 with a face (C5) |
| E-8 | the world mini-row (Zoom -, Zoom +) is the only world-space control and belongs to the card column, not the nav bar |
| E-9 | a locked cell is inert and its reason is printed on the cell, not only in aria-disabled |
| E-10 | a disabled (unaffordable) action face keeps its printed price, disabled=true, opacity .55 (measured) |
## 5. Action-to-destination coverage (every existing action has one home)
| action | destination | faces after the destination opens |
|---|---|---|
| salvage.take | Yard | Salvage +1, Rest, Salvage x4 |
| machine.repair | Yard | Repair 30 scrap (primary, or inside the fork) |
| machine.build | Build, then the chosen catalog row | Build 30 - 4 - 1 (one press commits the ladder machine) |
| machine.sell | Yard machine row | Sell 120 scrap per machine |
| machine.upgrade | Yard machine row | Upgrade per machine, with printed level and next value |
| machine.respec | Yard machine row | 3 slot faces plus Clear |
| route.add | Yard machine row | Route + |
| route.remove | same, per route | x <route> per route |
| store.buy | Store | one face per item with its price |
| store.sell | Store | one face per held item with its price |
| store.research | Research | Research <n> |
| settings.open and menu.open | Menu | Settings, Save, About |
| settings.sound, settings.aScale, settings.motion | system cluster, always visible | Sound, A, MOTION |
| zoom | world mini-row | Zoom -, Zoom + |
Measured press log, one continuous phone session (390x844, captures/captures-proto.json, pressed column): gate-begin 1, six salvage pulses and Repair 8, nav Build 9, catalog row 10, Build 11, nav Yard 12, nav Store 13, import apply 16, two Escape presses 18. Navigation cells inside the ladder: 2 (Build at 9, Yard at 12).
## 6. Measured band inset per viewport (measures.json, from captures/captures-proto.json)
| viewport (frames) | nav | action | world | resource band | card | sheet or inspector |
|---|---|---|---|---|---|---|
| 390x844 phone (30-40) | 374x44 @ 8,792 | 374x46 @ 8,740 | 374x595 @ 8,139 | 374x44 @ 8,8 | 374x40 @ 8,58 | 374x29 to 374x457 @ 8,104 or 8,118 |
| 360x640 phone (41-42) | 344x44 @ 8,588 | 344x46 @ 8,536 | 344x342 @ 8,188 | 344x44 @ 8,8 | 344x66 @ 8,58 | menu sheet 344x348 @ 8,130, world then 344x46 |
| 844x390 landscape (43-44) | 96x374 @ 8,8 (left rail) | 400x46 @ 110,336 | 400x236 @ 110,94 | 726x44 @ 110,8 | 726x30 @ 110,58 | inspector 320x288 @ 516,94 |
| 1366x768 desktop (45) | 96x752 @ 8,8 | 922x46 @ 110,714 | 922x604 @ 110,104 | 1248x44 @ 110,8 | 1248x40 @ 110,58 | inspector 320x656 @ 1038,104 |
| 1920x1080 desktop (46-47) | 96x1064 @ 8,8 | 1476x46 @ 110,1026 | 1476x916 @ 110,104 | 1802x44 @ 110,8 | 1802x40 @ 110,58 | inspector 320x968 @ 1592,104 |
| 2560x1440 desktop (48) | 96x1424 @ 8,8 | 2116x46 @ 110,1386 | 2116x1276 @ 110,104 | 2442x44 @ 110,8 | 2442x40 @ 110,58 | inspector 320x1328 @ 2232,104 |
Reading: the nav band is 44 px in every portrait frame and 96 px wide in every landscape or desktop frame, so a thumb target never shrinks below 44 px; the world keeps at least 236 px of height in landscape 844x390 and 46 px at the worst portrait moment (360x640 with the Menu sheet open, which is the one frame where the world is squeezed and the sheet body scrolls).
## 7. State coverage
| state | phone | desktop | face |
|---|---|---|---|
| fresh | 5 nav cells, 4 locked with reasons, scrap 0 | same in the left rail | inert, printed reason |
| lean | Store and Research unlocked, 6 units | same | enabled |
| mature | all 5 unlocked, 11 units, inspector populated | inspector 320 px column populated | enabled |
| unaffordable | price in the muted colour, opacity .55 | same, plus the pending line | disabled=true |
| empty | inline card message, no spinner | same | - |
| import error | red line in the sheet, then the card again (frame 39) | same | non-blocking |
| pending | card status line, printed price stable | same | no chip churn |
| offline | one toast, nav still works | same | - |
| degraded | toast 10/s, budget 10 shown | same | - |
Probes: all 19 frames report overlaps = [] and the interactive bands measure 44 px (nav, resource band) or 46 px (action row) in every viewport; the last-pressed id after the landscape fork and after the desktop machine step is row-machine-1 (frames 44, 46), which is the focus-return target of E-3.
## 8. Press budget (J1: salvage, build one machine, sell, upgrade, then Menu to Settings and Save)
| # | press | kind | painted frame |
|---|---|---|---|
| 1 | gate-begin | game state | 31 |
| 2-7 | six salvage pulses | game action | 32 |
| 8 | Repair 30 scrap | game action | 33 |
| 9 | nav Build | navigation | 34 |
| 10 | catalog row Sorter | navigation filter | 35 |
| 11 | Build (primary) | game action, commits the machine | 36 |
| 12 | nav Yard, machine inspector | navigation | 37 |
| 13 | nav Store | navigation | 38 |
| 14-16 | sheet rows and import apply | panel | 39 |
| 17-18 | two Escape presses | system | 40 |
Measured, one continuous phone session: 12 presses reach the machine inspector (frame 37) and 13 reach the Store (frame 38); of those 12, only 2 are nav cells (Build at 9, Yard at 12) and 1 is the catalog filter. Sell, Sell, Inspect and Upgrade are 4 further taps inside that one row, so J1 totals 16 presses with 2 nav cells against the audit baseline of 16 presses with 9 nav cells (../UI-RESET-45/journey-map.md).
Destination cost measured from a fresh begin in each session: Store at 2 presses (1366x768), machine row at 3 (1920x1080), Research at 4 (1920x1080), Menu at 2 (2560x1440), landscape Store at 2 and the machine row at 5 (844x390), Menu at 3 (360x640).
## 9. Accessibility and focus
- one label per face, taken from the printed line 1; the sublabel is aria-describedby material only when it adds a unit
- nav cells carry aria-current="page" for the active destination; locked cells are disabled with visible reason text
- tap target: the nav band and the resource band are 44 px, the action row 46 px in all 19 painted frames; the 23 px chip look keeps a 44 px hit box
- focus order follows the band order of section 1; focus never enters the world canvas; Escape returns it to the face that opened the panel (E-3)
- contrast: face text #eaf3f4 on #0b0d0e, 13.7:1 per the #45 audit; disabled faces keep 0.55 opacity on the same pair
- no hover-only or gesture-only essential: the desktop inspector duplicates the card body, so all four ladder steps work with taps alone (frames 45-47)
- reduced motion: MOTION is one of the three always-visible system faces, reachable in 1 press
- a phone-width screen gets no inspector: the sheet is the single reader, which is why the card body must repeat every value the inspector shows
## 10. Limitations and owner map
| not verified here | who should |
|---|---|
| real-device touch latency and the feel of the 16-press path (numbers come from the click counter in the prototype) | QA on device |
| screen-reader announcement order (no AT attached to the harness) | QA with AT |
| audio feedback for the 3 system faces | #49 UI-RESET/FEEL |
| i18n truncation inside 5 equal nav cells | #50 UI-RESET/I18N |
| a max-width cap on desktop: not implemented in the prototype, the world grows to 2116 px at 2560x1440 | #48 UI-RESET/RENDER |
| 360x640 with the Menu sheet open leaves only 46 px of world; the sheet body scrolls, the world does not | design review, one pass |
| the prototype is a transcription of the #45 JSON numbers, not the real sim: 0.00 batches/s, no save writes, no offline queue | implementer, against src/ |
Open questions for the coordinator: (a) does the Yard cell reuse the Home i18n key (spec assumes one key per cell); (b) machine.respec, route.remove and reducedMotion have no visible face today, this spec assigns them faces and needs the sim contract confirmed before implementation.
