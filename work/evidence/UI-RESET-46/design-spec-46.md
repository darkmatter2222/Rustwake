# UI-RESET/ARTDIR (#46) - two composed directions, one selected, with the measured fixes

- Issue: <https://github.com/darkmatter2222/Rustwake/issues/46> · parent goal <https://github.com/darkmatter2222/Rustwake/issues/43> · gate G1 · depends on #45 (audit head `224e22aa57a68215a2eddfe606ef50462b4d0b5e`, PR #74).
- This PR stacks on #74: the audit files under `work/evidence/UI-RESET-45/` are the input, and every number below is re-measured at this head against them.
- Build under test: `vite build` at head `224e22a`, served by `vite preview` on 4177. Painted by headless Chromium (playwright-core + local Chrome), 44 real frames in `captures/`.
- A direction is one author sheet (`direction-a.css`, `direction-b.css`) injected after the built sheet. Same selectors, later in the cascade - exactly the cascade a token rewrite in `src/ui/styles.css` produces. No game code, no save shape, no simulation touched.

Companion document: `art-direction-spec.md` carries the direction decision and the rule set; this file is the layout and state specification.$nl$nl## 1. What was measured (before = built sheet, A = direction A, B = direction B)

Rest frame per band. `ink` is the painted-pixel bbox of the canvas (same instrument as #45), `cover` is the share of that bbox hidden behind chrome boxes, `chips/rows` are the visible resource chips and their line count.

| band | sheet | ink rect | cover % | chips | rows | chips row h | font min px | panel rect (machine frame) |
|---|---|---|---|---|---|---|---|---|
| 390x844 | before | 8,154,374,561 | 0 | 4 | 2 | 48 | 10.8 | 10,442,370,348 |
| 390x844 | **A** | 8,152,374,561 | 0 | 3 | 1 | 20 | 10.8 | 10,442,370,348 |
| 390x844 | B | 8,147,374,560 | 0 | 3 | 1 | 25 | 11.7 | 10,442,370,348 |
| 844x390 | before | 307,28,230,346 | 27.7 | 5 | 1 | 23 | 10.8 | 142,179,560,157 |
| 844x390 | **A** | 307,28,230,346 | 19.3 | 3 | 1 | 20 | 10.8 | 142,179,560,157 |
| 844x390 | B | 307,28,230,346 | 30.9 | 3 | 1 | 25 | 11.7 | 142,179,560,157 |
| 1366x768 | before | 414,0,536,766 | 12.5 | 7 | 1 | 23 | 10.8 | 1104,8,320,473 |
| 1366x768 | **A** | 414,0,536,766 | 12.2 | 4 | 1 | 20 | 10.8 | 1026,8,330,452 |
| 1366x768 | B | 414,0,536,766 | 13.0 | 4 | 1 | 25 | 11.7 | 1104,8,340,460 |
| 1920x1080 | before | 576,20,766,1022 | 4.6 | 7 | 1 | 23 | 10.8 | 1104,8,320,473 |
| 1920x1080 | **A** | 576,20,766,1022 | 4.6 | 5 | 1 | 20 | 10.8 | 1580,8,330,452 |
| 1920x1080 | B | 576,20,766,1022 | 4.6 | 5 | 1 | 25 | 11.7 | 1104,8,340,460 |
| 2560x1440 | before | 896,168,766,1150 | 0 | 7 | 1 | 23 | 10.8 | 1104,8,320,473 |
| 2560x1440 | **A** | 896,168,766,1150 | 0 | 7 | 1 | 20 | 10.8 | 2190,8,360,400 |
| 2560x1440 | B | 896,168,766,1150 | 0 | 7 | 1 | 25 | 11.7 | 1104,8,340,460 |

Open-plate frames (the decisive ones, from `_x.txt` and `captures-extra-46.json`):

| frame | before cover % | A cover % | B cover % | inner scroll px (before / A / B) |
|---|---|---|---|---|
| 1920x1080 machine + fork | 17.7 | 4.6 | 17.3 | 0 / 0 / 0 |
| 1920x1080 store 900/900 | 19.7 | 4.6 | 17.3 | 0 / 0 / 0 |
| 2560x1440 store 900/900 | 13.8 | 0 | 14.1 | 0 / 0 / 0 |
| 844x390 store 900/900 | 72.6 | 64.1 | 75.8 | 364 / 360 / 368 |
| 390x844 machine + fork | 48.2 | 47.6 | 48.3 | 56 / 52 / 112 |

Four findings from the audit are answered by these numbers, none by prose:

1. **#45 finding 1 and 3 (plate on the world, dead margin on wide desktop) - fixed by A only.** At 1920 A puts the plate at x 1580..1910 (ink ends 1342) and at 2560 at x 2190..2550 (ink ends 1662): cover 0 in the rest frame, 4.6 with a plate open. B keeps the built `left: 1104px`, so its plate stays inside the ink at 1920 and 2560 (cover 17.3 and 14.1).
2. **#45 finding 4 (the chip row re-wraps 3/4/7 chips, 23/48/73 px) - fixed by both.** One row in every band (`rowTops` is a single value), heights 20 px (A) and 25 px (B), and the same priority ladder: currency + purse + capacity, then contract materials as the rail grows.
3. **#45 finding 8 (unaffordable has no visual signal) - fixed by both,** through `data-afford` on the face: 3 faces classify `short` (222, 222, 232 credits against 0) and 1 classifies `ok` (Move · 0 credits) - see `captures-46.json` / `captures-extra-46.json`, `affordFaces`.
4. **#45 finding 7 (one price printed 4 times) - not fixable in this layer.** The census still counts `"222 credits": 4` in all three sheets, because the duplicates live in `src/ui/text.ts` and `Hud.tsx` strings. Carried to #54/#55 as the target: one price on the face, one in the state line, nothing else.


## 2. Direction A - "Salvage ledger" (ink-first hairline chrome) - SELECTED

Composition: the painted world owns the frame; chrome only ever occupies the rows and margins it measured.

- **World composition.** Phone portrait: one column - chip rail, objective plate, world, plate above the dock, dock. Landscape phone (844x390): rail and objective are pulled into the left dead margin and the dock narrows to 468 px, so the fitted rect is no longer squeezed on both sides. Desktop: the plate moves out of the ink with `left: auto; right: max(10px, safe-area)` - that single rule is the whole 1920/2560 fix. The dock stays a centred 560 px row on the stage axis.
- **Typography.** One family (the built `system-ui` stack), one ladder: 0.95 rem primary line, 0.84-0.86 rem body and titles, 0.72 rem secondary. Panel titles and face labels uppercase with 0.06-0.08 em tracking, so a face reads as a stamped key; numbers keep `tabular-nums`. Measured floor 10.8 px (gap recorded in section 6).
- **Palette (role split, one job per hue).** `#0a1118` night, `#070d13` deep, `#eef4f8` paper, `#93b4c9` secondary, `#5fd8e8` = structure and available, `#ffb765` = numbers in flight and prices, `#7fdc8f` = a condition that is satisfied, `#ff8f3f` = the one primary fill and nothing else, hairline `rgba(147,180,201,.28)`.
- **Material and lighting.** Plates are a 0.84-alpha night wash with a 1 px hairline: one density, no drop shadow, no bevel, so a plate reads as a stencil laid on the yard rather than as a dashboard card. The world keeps its own night lights and furnace glow untouched.
- **Icon language.** Letterform faces (`A 1`), glyph faces (`Sound check`) and 6 px square pips that mirror the tile pixels of `src/game/renderer/sprites.ts`. No emoji, no pill, no stock icon set.
- **Borders.** 2 px radius on faces, 3 px on plates, 1 px hairlines everywhere, one 2 px accent rule on the left of the guidance card. Selected = filled, inert = dashed, satisfied = green edge.
- **Animation rule.** One clock: 200 ms `steps(4, end)` on background-colour, border-colour and opacity for face, node, toast and card state changes; nothing per-frame; `none` under `prefers-reduced-motion`. The sim tick keeps its own rate, so chrome never costs an extra repaint.


## 3. Direction B - "Plated console" (boxed plates, no fills)

Same surfaces, same information ladder, deliberately heavier material and a different voice.

- **Composition.** The built geometry is kept almost as-is: the plate stays in the built gutter at `left: 1104px`, 340 px wide, `max-height: 70%`; the dock widens to 540 px in landscape and the guidance card to 440 px. The console reads as a stack of boxed instruments.
- **Typography.** Same family, one step larger: 1 rem primary, 0.88-0.95 rem body, 0.78 rem secondary, uppercase labels with 0.05-0.10 em tracking. Measured floor 11.7 px.
- **Palette.** `#0b1220` night, `#f4f7fb` paper, `#a8c3d6` secondary, `#8a7ad8` violet = structure and titles, `#ffc98a` = numbers, quiet steel hairlines. No orange fill anywhere.
- **Material and lighting.** Opaque plates (`rgba(14,23,38,1)`) with an inset 2 px foot in `#38556b`: a pressed-metal edge lit from above. The primary face is the same plate with a 3 px amber rule across its top instead of a fill.
- **Icon language and borders.** 8-12 px radius, 1 px quiet border, 3 px top rule for the primary. States: violet edge = payable, quiet edge = short, dashed = locked.
- **Animation rule.** Same 200 ms, `ease` rather than `steps`: a smooth console instead of a stepped stencil.

## 4. Selected direction: A, and why

1. **Only A removes the plate-from-the-world defect.** Cover of the painted stage falls from 17.7 % to 4.6 % at 1920 and from 13.8 % to 0 % at 2560; B measures 17.3 % and 14.1 %, i.e. it keeps the overlap the audit reported in finding 3.
2. **A costs less of the small screen.** Same 42 % plate cap, but 52 px of inner scroll in the machine frame against 112 px for B, a 20 px chip rail against 25 px, and a 60 px guidance card against 76-94 px. The first minute keeps more yard on screen (J1 of the #45 journey map).
3. **A keeps one unmistakable primary.** One filled face per row (census: one accent-filled face per action row), whereas B removes all fills and distinguishes the primary by a 3 px rule - the weakest of the available signals at text scale 1.0-1.25.
4. **A reads as authored salvage/industrial pixel identity, not a dashboard:** stencil rules, square pips taken from the sprite palette, no pill, no card shadow, no four-sided boxed grid.
5. **A is cheaper to implement:** the same selectors and the same token block, so the change lands in the `:root` block plus the per-band media queries of `src/ui/styles.css`, with no new DOM in `Hud.tsx` or `Panels.tsx`.
6. **B stays as the documented fallback** for a warm boxed console: its 11.7 px type floor is 0.9 px better and its opaque plates are marginally kinder over a busy night frame. Its two measured weaknesses are the plate on the ink and the doubled inner scroll.


## 5. Per-band insets and the chip priority ladder (the numbers, not a re-derivation)

The rails, plates and docks below are the values painted by `direction-a.css` and read back from `measures-46.json` at this head.

| band | painted ink rect | chip rail (x,y,w,h) | chips shown | objective | plate | dock |
|---|---|---|---|---|---|---|
| 390x844 dpr2 | 8,152 374x561 | 10,8 244x20 | 3 | 10,56 370x60 | in-flow sheet 10,442 370x348 | 10,790 372x46 |
| 844x390 dpr2 | 307,28 230x346 | 10,8 244x20 | 3 | 10,56 300x77 | in-flow 142,179 560x157 | 188,336 468x46 |
| 1366x768 | 414,0 536x766 | 10,8 326x20 | 4 | 10,56 400x60 | 1026,8 330x452 | 403,714 560x46 |
| 1920x1080 | 576,20 766x1022 | 10,8 436x20 | 5 | 10,56 400x60 | 1580,8 330x452 | 680,1026 560x46 |
| 2560x1440 | 896,168 766x1150 | 10,8 586x20 | 7 | 10,56 400x60 | 2190,8 360x400 | 1000,1386 560x46 |

Priority ladder, fixed once and applied by width so a yard reports the same numbers on every device. DOM order is `Scrap`, materials, `Credits`, `Store`; the sheet hides the tail, never the purse or the capacity.

| budget | chips, in this order | band |
|---|---|---|
| 3 | Scrap, Credits, Store | 390x844, 844x390 |
| 4 | + Ferrous | 1200-1499 |
| 5 | + Nonferrous | 1500-2099 |
| 7 | + Steel, Copper | 2100+ |

Rules that go with the table:

- the rail is `nowrap` with one row at every band, so the world never loses a second 20 px line;
- plate width is fixed per band (330/360 px) and pinned `right`, never `left: 1104px`, which is what put it on the ink at 1920 and 2560;
- the dock keeps a 44 px target floor (measured: 0 faces under 44 px in any frame) and a centred column of 468-560 px, so it never spans a wide screen;
- the guidance card is capped by band (300/400 px) so it lands in the left dead margin beside the stage instead of over it.


## 6. State coverage in the selected direction

| state | painted cue (A) | evidence |
|---|---|---|
| empty store | plate prints Capacity 0/900 plus the two Measured lines, one Close face | `a-390x844-fresh-store.png`, `a-1920x1080-fresh-store.png` |
| rest, nothing built | 3 chips, one objective line plus one numeric line, three dock faces | `a-390x844-fresh-rest.png`, `a-1920x1080-fresh-rest.png` |
| build catalogue | hairline Cancel/Next, one filled Build face carrying its own price line, ghost on a cell | `a-390x844-fresh-build.png`, `a-1920x1080-mature-build.png` |
| selected machine | the world keeps its bright selection square, the plate opens beside/above it, the dock swaps to the fork pair | `a-390x844-mature-machine.png`, `a-1920x1080-mature-machine.png` |
| unaffordable (credits 0) | dashed border **and** a printed shortfall on the cost line of the face - two signals, not opacity | `a-390x844-mature-unaffordable.png`, `a-1920x1080-mature-unaffordable.png` |
| payable | solid hairline, green edge on the face that can be bought now | same two frames (`affordFaces` in the JSON) |
| full storage 900/900 | chip reads Store 900/900, plate lists the nine materials and the sell faces | `a-390x844-mature-store.png`, `a-2560x1440-mature-store.png` |
| bottleneck | one secondary line in the card, the plate keeps Next step above the fold on desktop | `a-1920x1080-mature-machine.png` |
| locked research node | dashed border, inert face (no painted instance exists in either baseline, as in #45) | carried to #58 |
| reduced motion | all state transitions `none` | `direction-a.css` media block |

## 7. Implementation boundaries

- `src/ui/styles.css`: the `:root` token block takes the A values; the per-band media blocks (380-460, max-height 460, 1200-1499, 1500-2099, 2100+) and the chip ladder are appended in the same file. The 42 %/26 % plate caps, the 44 px face floor, the `panel__body` scroller and the Escape stack stay exactly as they are.
- `src/ui/App.tsx`: one line - stamp `data-afford="ok|short"` on a priced face from its own price against the purse (#65 owns it). The sheets already paint both states; without that line the dashed/short cue simply does not appear.
- `src/game/renderer/scene.ts` and `sprites.ts`: untouched (world art is #60). Save shape, checksum and simulation untouched; no migration.
- Owner map for the follow-up slices: #48 tokens, #51 HUD hierarchy, #52 build catalogue, #53 placement, #54 inspector, #55 fork, #56 store, #58 research, #65 feedback, #66 accessibility, #47 navigation.


## 8. Reproduce and check

```text
npm ci
node node_modules/vite/bin/vite.js build
node node_modules/vite/bin/vite.js preview --port 4177 --strictPort     (shell 1)
node work/evidence/UI-RESET-46/measure-46.mjs                          -> measures-46.json
node work/evidence/UI-RESET-46/capture-46.mjs                           -> 32 PNGs + captures-46.json
node work/evidence/UI-RESET-46/capture-extra-46.mjs                     -> 12 PNGs + captures-extra-46.json
node work/evidence/UI-RESET-46/inspect-46.mjs                           -> _m.txt + _c.txt
node work/evidence/UI-RESET-46/_x.mjs                                   -> _x.txt
```

Expected values a reviewer can check in one pass (`_m.txt`, `_x.txt`):

1. `rows=1` in all five bands for both sheets, `rowTops` a single value, and chips 3 / 3 / 4 / 5 / 7 across 390x844, 844x390, 1366, 1920, 2560.
2. `u44=0` everywhere: no face under 44 px.
3. A: `cover` 4.6 at 1920 and 0 at 2560 in the rest frame; 4.6 with a plate open. B: 17.3 and 14.1 with a plate open.
4. A: plate rect starts at 1580 (1920) and 2190 (2560), i.e. right of the measured ink; B keeps 1104.
5. `affordFaces`: three `short` (222, 222, 232 credits) and one `ok` (Move, 0 credits) against `Credits 0`.
6. `price` census still counts `"222 credits": 4` in all three sheets - the dedupe is #54/#55 work, not this layer.

## 9. What is not verified here (stated, not smoothed over)

- **No real device run, no screen reader pass (NVDA/VoiceOver), no listening test** for the sound face. Every number is headless Chromium at the listed viewports.
- Pinch-zoom and drag-pan were not exercised (mouse only). Machine selection is a 20 px tap grid inside the measured ink bbox, because the canvas has no DOM hit targets - reachability is proven, pixel-exactness is not.
- The ink bbox includes the banner glyphs, so its top/bottom figures are an upper bound (the same caveat the #45 audit carries); the side figures are exact to 1 px.
- The landscape band is still the weakest: with the store open the plate covers 64.1 % of a 230 px-wide ink column. The fitted rect itself is the limit, so the remaining work is a per-band slot in #50/#51, not a token tweak.
- The type floor in A is 10.8 px (B reaches 11.7 px); the 12 px floor is a ladder change owned by #66 and is deliberately not smuggled in here.
- The price census is unchanged (4 prints) for the reason in section 8.
- `data-afford` is stamped by the harness (`probe-46.mjs`, `applyAfford`) as the stand-in for the one-line `App.tsx` assignment; the dashed/short cue in the captures depends on that stamp existing.
- The locked research row is still unpaintable in both baselines, and the entry gate frame was not re-shot for these two sheets (only rest, store, machine, build and unaffordable).


