# UI-RESET/ARTDIR (#46) - two composed directions, one selected, with the measured fixes

- Issue: <https://github.com/darkmatter2222/Rustwake/issues/46> · parent goal <https://github.com/darkmatter2222/Rustwake/issues/43> · gate G1 · depends on #45 (audit head `224e22aa57a68215a2eddfe606ef50462b4d0b5e`, PR #74).
- This PR stacks on #74: the audit files under `work/evidence/UI-RESET-45/` are the input, and every number below is re-measured at this head against them.
- Build under test: `vite build` at head `224e22a`, served by `vite preview` on 4177. Painted by headless Chromium (playwright-core + local Chrome), 44 real frames in `captures/`.
- A direction is one author sheet (`direction-a.css`, `direction-b.css`) injected after the built sheet. Same selectors, later in the cascade - exactly the cascade a token rewrite in `src/ui/styles.css` produces. No game code, no save shape, no simulation touched.

## 1. What was measured (before = built sheet, A = direction A, B = direction B)

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

