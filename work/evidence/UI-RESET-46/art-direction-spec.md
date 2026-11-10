# UI-RESET/ARTDIR (#46) - canonical art-direction and layout spec

- Issue: https://github.com/darkmatter2222/Rustwake/issues/46 - parent goal https://github.com/darkmatter2222/Rustwake/issues/43 - gate G1 - depends on #45 (audit head `224e22aa57a68215a2eddfe606ef50462b4d0b5e`, PR #74, `work/evidence/UI-RESET-45/`).
- Instrument head `224e22aa57a68215a2eddfe606ef50462b4d0b5e`, so the `before` column is directly comparable with `UI-RESET-45/measures.json`. Build under test: `vite build` in this worktree (`dist/assets/index-BB8vPAlp.js` 232.94 kB, `index-BQX-FOQv.css` 8.16 kB), served by `vite preview`, painted by headless Chromium (playwright-core + local Chrome/Edge).
- A direction is one author sheet (`direction-a.css`, `direction-b.css`) injected after the built sheet: same selectors, later in the cascade, i.e. exactly the cascade a token rewrite in `src/ui/styles.css` produces. No game code, no save shape, no simulation touched.
- This file is the single spec for #46; `README.md` is the index into it, the receipts and the scripts.

## 1. Selected direction: A (Salvage ledger), and why B loses

Four-part rationale:

1. **One primary per frame.** Exactly one accent-filled face per action row: `.dock__btn--primary`, `.panel__actions > .icon-btn:first-child`, `.node__buy` share one orange fill; every other face keeps the flat `--panel` fill with a hairline edge. A census counts filled faces by `background-image` being a gradient: one in the dock, one in a panel command row, one on a research card.
2. **Ink-first economy with a role split, one job per hue.** `--a-avail #5fd8e8` = structure and titles, `--a-flow #ffb765` = numbers in flight and prices, `--a-ok #7fdc8f` = a condition that is satisfied, `--a-primary #ff8f3f` = the single primary fill and nothing else. Chrome is translucent (`--panel` alpha 0.84) with a hairline edge and 3 px radius, so the yard keeps its band: painted-ink cover at 844x390 falls from 27.7 % (built) to 19.3 % under A, at 1920x1080 from 17.7 % to 4.6 % with the inspector open, at 2560x1440 from 13.8 % to 0 % with the store open (`measures-46.json`, `machine` and `store` frames).
3. **The authored pixel sheet is the only icon source.** The nine machine/prop roles and the floor kit are the code tables in `src/game/renderer/sprites.ts` (`PARTS`, `FLOOR_KIT`, `FLOOR_POSTS`, `PUDDLES`, `GRAVEL`, `WRECK_HULL`; identity marks in `docs/evidence/asset-provenance.json`). The DOM mirrors the same 16-value `PALETTE` (`styles.css :root`, `Hud.DOT_COLORS`), so a chip pip, a dot and a machine body are the same authored ink. No binary atlas, no unedited primitives, no external font, no emoji.
4. **200 ms stepped transitions with a reduced-motion fallback.** One 200 ms clock, `steps(4, end)`, only on `background-color`, `border-color`, `opacity` for `.dock__btn`, `.icon-btn`, `.node`, `.toast`, `.objective`, so a state change reads as one tick and matches the world's 6-frame quantised cycles (ART-003/006 tests); `@media (prefers-reduced-motion: reduce)` sets `transition: none`.

Why B (Plated console) loses, on the same instrument: it keeps the built `left: 1104px` plate, so the inspector still paints on the ink column - cover 17.3 % at 1920 and 14.1 % at 2560 with a plate open, against A's 4.6 % and 0 %; at 844x390 its cover is 30.9 % against the 27.7 % it starts from (A: 19.3 %); in the machine frame at 390x844 it doubles the inner scroll (112 px against A's 52 px). What B does better is folded into A where it is free: the 3 px rule over the primary became the 2 px accent rule, uppercase letter-spaced titles stayed. B remains the documented fallback (`direction-b.css`), not a parallel track.

## 2. Composed states - which file shows what

- `captures-46.json` - 32 entries: 2 directions x 2 scenarios x 2 bands x 4 surfaces. Pattern `<a|b>-<band>-<fresh|mature>-<surface>.png`, `surface` in `rest | store | machine | build`.
- `captures-extra-46.json` - 12 entries from `capture-extra-46.mjs`: 844x390 and 2560x1440 mature rest/store plus the credits-0 unaffordable frame at 390x844 and 1920x1080 for both sheets.
- Together the two receipts list exactly the 44 PNGs in `captures/`; each entry carries the painted text (chips line, objective card, panel head line, dock labels, `data-afford` classification) and the composition readout (ink box, cover %, inner scroll px, faces under 44 px), so every claim is checkable against its image.

| Surface (all four in one composed frame, no moodboard crops) | A 390x844 | A 1920x1080 | B 390x844 | B 1920x1080 |
| --- | --- | --- | --- | --- |
| Yard at rest: world + chip rail + objective card + dock | `a-390x844-fresh-rest.png`, `a-390x844-mature-rest.png` | `a-1920x1080-fresh-rest.png`, `a-1920x1080-mature-rest.png` | `b-390x844-fresh-rest.png`, `b-390x844-mature-rest.png` | `b-1920x1080-fresh-rest.png`, `b-1920x1080-mature-rest.png` |
| Inventory (Store plate: stock rows, capacity, sell rows) | `a-390x844-fresh-store.png`, `a-390x844-mature-store.png` | `a-1920x1080-fresh-store.png`, `a-1920x1080-mature-store.png` | `b-390x844-fresh-store.png`, `b-390x844-mature-store.png` | `b-1920x1080-fresh-store.png`, `b-1920x1080-mature-store.png` |
| Machine inspector (status page over the world, with the named fork faces in the dock) | `a-390x844-fresh-machine.png`, `a-390x844-mature-machine.png` | `a-1920x1080-fresh-machine.png`, `a-1920x1080-mature-machine.png` | `b-390x844-fresh-machine.png`, `b-390x844-mature-machine.png` | `b-1920x1080-fresh-machine.png`, `b-1920x1080-mature-machine.png` |
| Build catalog (blueprint list, cell ghost, Cancel / Build / Next row) | `a-390x844-fresh-build.png`, `a-390x844-mature-build.png` | `a-1920x1080-fresh-build.png`, `a-1920x1080-mature-build.png` | `b-390x844-fresh-build.png`, `b-390x844-mature-build.png` | `b-1920x1080-fresh-build.png`, `b-1920x1080-mature-build.png` |
| Unaffordable (credits 0), landscape and 2560 rest/store | `a-390x844-mature-unaffordable.png`, `a-844x390-mature-rest.png`, `a-2560x1440-mature-store.png` | `a-1920x1080-mature-unaffordable.png`, `a-2560x1440-mature-rest.png` | `b-390x844-mature-unaffordable.png`, `b-844x390-mature-rest.png`, `b-2560x1440-mature-store.png` | `b-1920x1080-mature-unaffordable.png`, `b-2560x1440-mature-rest.png` |

Scenarios, both plain save envelopes so every sheet replays the same yard:

- `fresh` = `scenario-opening.json`: a no-save boot walked to the first built machine and dumped from `localStorage` at this head - 1 machine, `tutorial 1`, chips `Scrap 0 / Credits 0 / Store 0/900`, ticks 68-130 across the four surfaces.
- `mature` = `scenario-mature.json` (= `docs/evidence/yard-mature.json`): 8 machines, 18 routes, all three research nodes known, ticks 450308-450328, chips at 390 `Scrap 10 / Ferrous 54 / Credits 82 / Store 900/900`, at 1920 seven chips including `Nonferrous 239`, `Steel 10`, `Copper 10`.
- The unaffordable frames carry one synthetic edit, recorded in `captures-extra-46.json`: `payload.sim.credits = 0`.

State coverage in the selected direction:

| State | Painted cue in A | Evidence |
| --- | --- | --- |
| fresh yard, nothing built | 3 chips in one 20 px rail, one primary line plus one numeric line, three dock faces, one filled | `a-390x844-fresh-rest.png`, `a-1920x1080-fresh-rest.png` |
| empty store | plate prints `Capacity 0/900` plus the Measured lines, one Close face | `a-390x844-fresh-store.png`, `a-1920x1080-fresh-store.png` |
| build catalog | hairline Cancel / Next, one filled Build face carrying its own price line, ghost on a cell | `a-390x844-fresh-build.png`, `a-1920x1080-mature-build.png` |
| selected machine | bright selection square stays on the world, the plate opens beside it, the dock swaps to the named fork pair | `a-390x844-mature-machine.png`, `a-1920x1080-mature-machine.png` |
| full storage 900/900 | rail prints `Store 900/900`, plate lists the materials and the sell faces | `a-390x844-mature-store.png`, `a-2560x1440-mature-store.png` |
| payable vs short | green hairline vs rust hairline **plus** the printed price on the face, never colour alone | `affordFaces` in `captures-extra-46.json` (`short: Upgrade 222 / Less power 222 / Faster batches 232`, `ok: Move - cell 9 - 0 credits`) |
| bottleneck | one secondary line in the card; on desktop the plate keeps `Next step` above the fold | `a-1920x1080-mature-machine.png` |
| locked research node | dashed border, inert face - no painted instance exists in either baseline (same finding as #45) | carried to #58 |
| reduced motion | every state transition `none` | the media block in `direction-a.css` |

## 3. Rules the implementation has to keep (direction A)

- **Typography** - one family (the built `system-ui` stack, no webfont), one root size 15 px x the player's text scale, three tiers: 0.95 rem primary line, 0.84-0.86 rem body, plate titles and face labels, 0.72 rem secondary readouts; plate titles and faces are uppercase with 0.06-0.08 em tracking so a face reads as a stamped key; every numeric node keeps `font-variant-numeric: tabular-nums`; the ladder stays monotonic at every text scale. Measured floor 10.8 px (B reaches 11.7 px) - the 12 px floor is ladder work owned by #66.
- **Palette tokens** (`direction-a.css` `:root`) - `--night #0a1118`, `--night-deep #070d13`, `--panel rgba(7,13,19,.84)`, `--paper #eef4f8`, `--steel-light #93b4c9`, `--a-avail #5fd8e8`, `--a-flow #ffb765`, `--a-ok #7fdc8f`, `--a-primary #ff8f3f`, `--a-hair rgba(147,180,201,.28)`, `--a-step 200ms`. Primary ink is `--night` on the orange fill (the built sheet established 5.27:1 there); a disabled face stays at opacity 0.8. The world palette in `sprites.ts` is untouched.
- **Material and lighting** - one light direction and one 1-step-dark contact shadow per footprint, both from the authored sheet; plates are a single 0.84-alpha night wash with a 1 px hairline, no second backdrop layer, no drop shadow, no bevel, no blur; the only gradient in the frame is the two-stop wash on the primary face. Gravel and dot-grid ink stay subordinate (ART-005 census: machine body 1.53 %, gravel 0.12 %, dot grid 0.02 % of the canvas).
- **Icon language** - the authored pixel sheet only: `sprites.ts` `PARTS` per blueprint plus `FLOOR_KIT` / `FLOOR_POSTS` / `PUDDLES` / `GRAVEL` / `WRECK_HULL`; the DOM reuses the same `PALETTE`, and a chip pip is the 6 px square of that palette colour. Letterform faces (`A 1`) and glyph faces (`Sound check`) stay text, not images.
- **Borders** - 1 px hairline `--a-hair`; 3 px radius on plates, 2 px on faces and chips; the objective card is a 2 px left rule with a 0/2/2/2 corner, not a four-sided box. State lives in the border, never in a second fill: known = `rgba(127,220,143,.7)`, open = `rgba(255,183,101,.6)`, locked = dashed `--a-hair`, and the harness `data-afford` classification paints green for payable / rust for short beside the printed price.
- **Animation rules** - one 200 ms clock, `steps(4, end)`, only on `background-color`, `border-color`, `opacity`; `prefers-reduced-motion: reduce` disables all of it (the world keeps one static width per state, as ART-006 shows for the settle bar); no transforms on the HUD column, so no chrome box moves while the player reads it.

## 4. Measured layout problems, verified in `measures-46.json`

Rest frame per band. `ink` is the painted-pixel bbox of the canvas (same instrument as #45), `cover` the share of that bbox hidden behind chrome boxes, `chips/rows` the visible chips and their line count.

| band | sheet | ink rect | cover % | chips | rows | rail height | faces under 44 px |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 390x844 dpr2 | before | 8,154 374x561 | 0 | 4 | 2 | 48 | 0 |
| 390x844 dpr2 | A | 8,152 374x561 | 0 | 3 | 1 | 20 | 0 |
| 390x844 dpr2 | B | 8,147 374x560 | 0 | 3 | 1 | 25 | 0 |
| 844x390 dpr2 | before | 307,28 230x346 | 27.7 | 5 | 1 | 23 | 0 |
| 844x390 dpr2 | A | 307,28 230x346 | 19.3 | 3 | 1 | 20 | 0 |
| 844x390 dpr2 | B | 307,28 230x346 | 30.9 | 3 | 1 | 25 | 0 |
| 1366x768 | before | 414,0 536x766 | 12.5 | 7 | 1 | 23 | 0 |
| 1366x768 | A | 414,0 536x766 | 12.2 | 4 | 1 | 20 | 0 |
| 1366x768 | B | 414,0 536x766 | 13.0 | 4 | 1 | 25 | 0 |
| 1920x1080 | before | 576,20 766x1022 | 4.6 | 7 | 1 | 23 | 0 |
| 1920x1080 | A | 576,20 766x1022 | 4.6 | 5 | 1 | 20 | 0 |
| 1920x1080 | B | 576,20 766x1022 | 4.6 | 5 | 1 | 25 | 0 |
| 2560x1440 | before | 896,168 766x1150 | 0 | 7 | 1 | 23 | 0 |
| 2560x1440 | A | 896,168 766x1150 | 0 | 7 | 1 | 20 | 0 |
| 2560x1440 | B | 896,168 766x1150 | 0 | 7 | 1 | 25 | 0 |

With a plate open (the decisive cells; `scroll` is the inner scroll of `.panel__body`):

| frame | before cover % | A cover % | B cover % | inner scroll px (before / A / B) |
| --- | --- | --- | --- | --- |
| 1920x1080 machine | 17.7 | 4.6 | 17.3 | 0 / 0 / 0 |
| 1920x1080 store | 19.7 | 4.6 | 19.3 | 0 / 0 / 0 |
| 2560x1440 machine | 11.4 | 0 | 11.7 | 0 / 0 / 0 |
| 2560x1440 store | 13.8 | 0 | 14.1 | 0 / 0 / 0 |
| 844x390 store | 72.6 | 64.1 | 75.8 | 364 / 360 / 368 |
| 390x844 machine | 48.0 | 47.6 | 48.3 | 56 / 52 / 112 |

What those numbers say about the two cited problems:

1. **844x390: the world owns 27 % of the width.** Ink `307,28 230x346` in all three runs, 230 / 844 = **27.3 %**, and the same box is in `UI-RESET-45/measures.json` (`landscape-844x390.rest.world.cssW = 230`), so both instruments agree. Neither sheet changes the fitted width - only the camera insets (#50/#51) do - so at this layer the decision is how much of that narrow column the chrome covers: A 19.3 %, B 30.9 %.
2. **2560x1440: the yard is a 766 px column in a 2560 px frame and the plate sits inside it.** Ink `896,168 766x1150` = **29.9 %** of the width, 79.9 % of the height, 896 px of dead gutter at the left and 898 px at the right. The built plate at `left: 1104px` (width 320) lands inside the ink span 896-1662; A's single rule `left: auto; right: max(10px, env(safe-area-inset-right))` moves it to x 2190 and the cover drops to 0 with the store open.
3. **Chip band at 2560x1440, actual numbers.** `measures-46.json` records 7 chips in **1 row** at tops `[8]` for `before`, A and B; `UI-RESET-45/measures.json` gives that band's box as `10,8 628x23`, i.e. **23 px**, and the tallest band in that file is **73 px** (3 rows at 360x640), with 48 px (2 rows at 390x844). The ~91 px figure is **not** in either file - no `h` value 89-92 exists in either, the only `91` there is a chip *width* of 91/91.4 px - so it is not carried as a claim here.
4. **The rest of the audit's findings:** the width-dependent chip count is fixed by both sheets (one row in every band, 20 px rail in A); the unaffordable state now has two signals (border plus printed shortfall); the four-times-printed price is unchanged in all three sheets because the duplicates live in `src/ui/text.ts` and `Hud.tsx` strings - carried to #54/#55.

## 5. Per-band geometry the sheet paints, and the chip ladder

Values painted by `direction-a.css` and read back from `measures-46.json` / `_x.txt` at this head:

| band | chip rail (x,y,w,h) | chips | objective | plate (machine frame) | dock |
| --- | --- | --- | --- | --- | --- |
| 390x844 dpr2 | 10,8 244x20 | 3 | 10,56 370x60 | in-flow sheet 10,442 370x348 | 10,790 370x46 |
| 844x390 dpr2 | 10,8 244x20 | 3 | 10,56 300x60 | in-flow 142,179 560x157 | 188,336 468x46 |
| 1366x768 | 10,8 326x20 | 4 | 10,56 400x60 | 1026,8 330x452 | 403,714 560x46 |
| 1920x1080 | 10,8 436x20 | 5 | 10,56 400x60 | 1580,8 330x452 | 680,1026 560x46 |
| 2560x1440 | 10,8 586x20 | 7 | 10,56 400x60 | 2190,8 360x400 | 1000,1386 560x46 |

Chip priority ladder, fixed once and applied by width so one yard reports the same numbers on every device. DOM order is `Scrap`, materials, `Credits`, `Store`; the sheet hides the tail, never the purse or the capacity:

| budget | chips, in this order | band |
| --- | --- | --- |
| 3 | Scrap, Credits, Store | 390x844, 844x390 |
| 4 | + Ferrous | 1200-1499 |
| 5 | + Nonferrous | 1500-2099 |
| 7 | + Steel, Copper | 2100+ |

Rules that go with the tables: the rail is `nowrap` with one row at every band, so the world never loses a second 20 px line; the plate width is fixed per band (330/360 px) and pinned `right`, never `left: 1104px`; the dock keeps the 44 px target floor (0 faces under 44 px in any frame) and a centred 468-560 px column; the objective card is capped per band (300/400 px) so it lands in the left dead margin beside the stage instead of over it.

## 6. Implementation boundaries

- `src/ui/styles.css`: the `:root` token block takes the A values; the per-band media blocks (380-460, max-height 460, 1200-1499, 1500-2099, 2100+) and the chip ladder are appended in the same file. The 42 % / 26 % plate caps, the 44 px face floor, the `.panel__body` scroller and the Escape stack stay as they are.
- `src/ui/App.tsx`: one line - stamp `data-afford="ok|short"` on a priced face from its own price against the purse (#65 owns it). The sheets already paint both states; without that line the dashed/short cue does not appear.
- `src/game/renderer/scene.ts` and `sprites.ts`: untouched (world art is #60). Save shape, checksum and simulation untouched; no migration.
- Owner map for the follow-up slices: #47 navigation, #48 tokens, #50/#51 camera and HUD hierarchy, #52 build catalogue, #53 placement, #54 inspector, #55 fork, #56 store, #58 research, #65 feedback, #66 accessibility.

## 7. Checks a reviewer can run in one pass

```text
npm ci
node node_modules/vite/bin/vite.js build
node node_modules/vite/bin/vite.js preview --port 4186 --strictPort        (shell 1)
$env:RUSTWAKE_URL = "http://localhost:4186/"                                (each script shell)
node work/evidence/UI-RESET-46/measure-46.mjs        -> measures-46.json
node work/evidence/UI-RESET-46/capture-46.mjs        -> 32 PNGs + captures-46.json
node work/evidence/UI-RESET-46/capture-extra-46.mjs  -> 12 PNGs + captures-extra-46.json
node work/evidence/UI-RESET-46/inspect-46.mjs        -> _m.txt + _c.txt
node work/evidence/UI-RESET-46/_x.mjs                -> _x.txt
npm test                                             -> 32 files / 340 tests passed, 16.81 s
```

Expected, in order: (1) `rows = 1` in all five bands for both sheets with a single `chipRowTops` value and chips 3 / 3 / 4 / 5 / 7 across 390x844, 844x390, 1366, 1920, 2560; (2) `facesUnder44 = 0` everywhere; (3) A `inkCoverPct` 4.6 at 1920 and 0 at 2560 in the rest frame and 4.6 with the inspector open, B 17.3 and 14.1 with a plate open; (4) A plate starts at x 1580 (1920) and x 2190 (2560), right of the measured ink, B stays at 1104; (5) `affordFaces` in `captures-extra-46.json` shows three `short` (222, 222, 232 credits) and one `ok` (Move, 0 credits) against `Credits 0`; (6) the price census still counts `"222 credits": 4` in all three sheets, which is #54/#55 work, not this layer.

## 8. What is not verified here (stated, not smoothed over)

- No real device: every frame is headless Chrome/Edge at the CSS bands 390x844 (dpr 2, so 780x1688 px) and 1920x1080 (dpr 1); safe-area insets are unproven. No screen reader pass (NVDA/VoiceOver), no audio playback pass for the sound face. Pinch-zoom and drag-pan were not exercised (mouse only), and machine selection is a 20 px tap grid inside the measured ink bbox because the canvas has no DOM hit targets - reachability is proven, pixel-exactness is not.
- The ink bbox includes the banner glyphs, so its top and bottom figures are an upper bound (the same caveat #45 carries); the side figures are exact to 1 px.
- The landscape band stays the weakest: with the store open the plate covers 64.1 % of a 230 px-wide ink column. The fitted rect is the limit, so the remainder is #50/#51 camera work, not a token tweak.
- The type floor in A is 10.8 px (B reaches 11.7 px); the 12 px floor is #66's ladder change and is deliberately not smuggled in here. The `prefers-reduced-motion` branch is declared but not exercised. The 360x640 and text-scale-2 cells are outside both receipts.
- `data-afford` is stamped by the harness (`probe-46.mjs`, `applyAfford`) as the stand-in for the one-line `App.tsx` assignment, so the dashed/short cue in the captures depends on that stamp existing.
- The locked research node row has no painted instance in either baseline, and the entry gate frame was not re-shot for these two sheets (only rest, store, machine, build and unaffordable).
- **Direction B is the fallback, not a parallel track**: kept as `direction-b.css` and measurable, nothing in the plan depends on it; its two measured weaknesses are the plate on the ink column and the doubled inner scroll.
