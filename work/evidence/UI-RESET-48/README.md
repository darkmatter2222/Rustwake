# UI-RESET/TOKENS (#48) — shared primitives, typography and design tokens

- Issue: <https://github.com/darkmatter2222/Rustwake/issues/48> · parent goal <https://github.com/darkmatter2222/Rustwake/issues/43> · gate G1 · milestone 1 · Project 1
- Branch `rw/48-tokens-g1` · base `baff7e754626728d99b14c9155e0d2c1b4b34875` (the head that carries the accepted #46 and #47 docs) · role: developer
- Code: `src/ui/tokens.ts` (the one number table), `src/ui/primitives.tsx` (the primitives), `src/ui/primitives.css` (the token block and the state sheet), one gallery branch in `src/ui/App.tsx` (`?ui48`).
- Harness: `probe-48.mjs` (shared), `measure-48.mjs` → `measures-48.json`, `capture-48.mjs` → `captures/*.png` + `captures-48.json`. `_extract.mjs`, `_extract45.mjs`, `_census.mjs`, `_rects.mjs` are the read-back helpers for the two inherited measured files and for this folder's receipts.

## 0. Number authority

Order used, highest first:

1. a number that appears in a **measured** JSON: `work/evidence/UI-RESET-45/measures.json` (head `1367a2c`), `work/evidence/UI-RESET-46/measures-46.json` (head `224e22a`);
2. `work/evidence/UI-RESET-47/navigation-spec.md`;
3. `work/evidence/UI-RESET-46/design-spec-46.md` and `art-direction-spec.md`.

`_census.mjs` walks both measured files and prints every painted rect height and width, so a disputed number can be checked for presence instead of argued. Its output at this head:

```text
distinct rect heights in both measured files: [14.6,16.2,17,17.1,18.2,19.8,20,23,25,34,44,46,48,57,60,66,73,76,77,83,94,157,212,262,348,390,400,445,452,460,473,517,525,538,640,768,844,1080,1440]
96  h:absent w:PRESENT      134 h:absent w:absent      91  h:absent w:PRESENT
23  h:PRESENT                48  h:PRESENT              73  h:PRESENT
56  h:absent w:absent        54  h:absent w:PRESENT     320 h:absent w:PRESENT
348 h:PRESENT                262 h:PRESENT              538 h:PRESENT        445 h:PRESENT
```

## 1. Conflict table (recorded, not invented away — #77 supersedes)

| # | subject | value A (source) | value B (source) | value in a measured JSON | used here | why |
|---|---|---|---|---|---|---|
| 1 | rail width | **56 px** — `UI-RESET-47/navigation-spec.md` D1 and the 3.4 band table (`8,8 56x752`) | 96 px — `UI-RESET-47/nav-spec.md` 1.2 ("N1-N5 rail (left) 96 px") | no rail rect exists in either measured file (the shipped build has no rail: the measured chrome row is the dock `370x46` / `560x46`). As a number, `96` is present only as a *width* (`96`, `96.3`, a chip), `56` appears nowhere | **56 px** | the higher-priority document of the two (item 2 over item 3 in section 0) is also the one whose value is arithmetically consistent with its own band table (5 faces + four 4 px gaps inside the row) |
| 2 | face text format | single line, ` · ` separator — `UI-RESET-47/navigation-spec.md` 2.2 (C1 to C4, C6) | two lines (`line 1` verb+target, `line 2` numbers) — `UI-RESET-47/nav-spec.md` section 3 (CF-1) | the measured `dockLabels` are single strings (`"Sell 35 Ferrous+70 credits"`, `"Less power222 credits"`), and `.dock__cost` already paints as a separate child (`measures-46.json`, `fonts`), i.e. one printed line with two children | **single line + ` · `**, label and price as two children with the 4 px gap | the measured shape is one line; C4 is also the separator `priceLine` in `src/ui/text.ts` already uses |
| 3 | portrait chrome total | **54 px** — `navigation-spec.md` 3.1 P2 (46 px face + 8 px gap) | 134 px — `nav-spec.md` 1.1 ("Total portrait chrome is 134 px") | `134` appears nowhere in either file; `54` is composed of the measured dock height 46 and the measured 8 px band pad (every band box in `measures.json` starts at y 8) | **54 px** | both parts of 54 are measured values; 134 is the sum of that document's own pinned rows (52 + 66 + 46 + 44 + gaps) and is not a measured rect |
| 4 | chip band at 2560x1440 | 91 px — `nav-spec.md` 1.1 note (the "2560 chip-band height 91" of the assignment) | 73 px — `art-direction-spec.md` section 4 ("the tallest chip band anywhere in that file is 73 px, 3 rows at 360x640") | the 2560 band itself measures **23 px** (`10,8 628x23`, one row, `chipRowTops: [8]`) in both files; `73` is present as a height (the 360x640 three-row band), `91` appears only as a *width* (`91`, `91.4`) | **23 px at 2560; the ladder is 23 / 48 / 73 px for 1 / 2 / 3 rows** | the measured band height wins over both documents; 73 is kept as the 3-row rung because it is the tallest height any measured band has |

Nothing else in those documents disagrees with a measured value at this head. If a later measurement moves one of these, `src/ui/tokens.ts` is the single place to change and `tests/ui/tokens-48.test.ts` will fail loudly.

## 2. Token list with the source of every number

`src/ui/tokens.ts` carries the same table next to the values as `TOKEN_SOURCES`.

| token | value | source |
|---|---|---|
| `--wk-night` | `#0a1118` | `art-direction-spec.md` section 3 (direction A `:root`) |
| `--wk-night-deep` | `#070d13` | same |
| `--wk-panel` | `rgba(7, 13, 19, 0.84)` | same (one density, no second backdrop layer) |
| `--wk-paper` | `#eef4f8` | same |
| `--wk-steel` | `#93b4c9` | same |
| `--wk-avail` | `#5fd8e8` (structure, titles, available) | same, role split |
| `--wk-flow` | `#ffb765` (numbers in flight, prices) | same |
| `--wk-ok` | `#7fdc8f` (condition satisfied) | same |
| `--wk-primary` | `#ff8f3f` (the one primary fill) | same; `navigation-spec.md` P1 (one accent per frame) |
| `--wk-hair` | `rgba(147, 180, 201, 0.28)` | same |
| `--wk-font-ui` | `system-ui, -apple-system, "Segoe UI", sans-serif` | `src/ui/styles.css` line 33 (the built stack, no webfont) |
| `--wk-font-data` | `ui-monospace, "SF Mono", Menlo, Consolas, monospace` + `font-variant-numeric: tabular-nums` | #48 acceptance 2; `tabular-nums` already painted at `styles.css` 84/477/500/563 |
| type ladder | 15 px root, 0.95 / 0.84 / 0.72 rem (+0.86 rem title) | `art-direction-spec.md` section 3 |
| measured px ladder | 14.25 / 12.6 / 10.8 px (title 12.9 px) | `measures-46.json`, `fonts` of the `A` frames |
| tracking | 0.08 em titles, 0.06 em faces | `art-direction-spec.md` section 3 |
| `--wk-gap-face` | 4 px | `navigation-spec.md` C6 (label and price as two children) |
| `--wk-gap-row` | 6 px | `navigation-spec.md` 1.1 gaps |
| `--wk-gap-band` | 8 px | `measures.json`: every band box at y 8 |
| `--wk-radius-face` / `--wk-radius-plate` | 2 px / 3 px | `art-direction-spec.md` section 3 (2 px faces, 3 px plates) |
| contact shadow | `0 1px 0 rgba(7,13,19,.75)` | `art-direction-spec.md` section 3 (one 1-step-dark contact shadow) |
| `--wk-z-chrome/feedback/sheet/dialog` | 5 / 20 / 30 / 40 | #48 acceptance 2, mapped onto the five logical layers of `navigation-spec.md` section 4 |
| `--wk-touch-min` | 44 px | `measures-46.json`: `facesUnder44 = 0` in every frame |
| `--wk-face-h` | 46 px | `measures.json`: dock `370x46`, `560x46` |
| `--wk-rail-w` | 56 px | `navigation-spec.md` D1 (conflict 1) |
| `--wk-inspector-w` | 320 px | `measures.json`: sheet `320x538`, `320x445` |
| `--wk-frame-cap` | 1600 px | `navigation-spec.md` D1 |
| `--wk-chip-h-1/2/3` | 23 / 48 / 73 px | `measures.json`: chip box for 1 / 2 / 3 rows (2560 = 23, 390 = 48, 360 = 73) |
| sheet heights | 348 (390x844), 262 (360x640), 157 / 212 (844x390 store / research), 538 / 445 (desktop store / research) | `measures.json`, `panel` boxes; `navigation-spec.md` 3.1 P3 |
| portrait chrome total | 54 px | `navigation-spec.md` 3.1 P2 (conflict 3) |
| chip ladder | 3 chips, +Ferrous ≥1200, +Nonferrous ≥1500, +Steel/Copper ≥2100 | `design-spec-46.md` section 5 |
| nav slots | yard, build, store, research, menu, fixed | `navigation-spec.md` section 1 |
| one clock | 200 ms `steps(4, end)` on `background-color`, `border-color`, `opacity`; `none` under `prefers-reduced-motion: reduce` | `art-direction-spec.md` section 3, `direction-a.css` animation block |
| printed price | `{number} {unit}`, one space, no sign; gains carry `+` | `navigation-spec.md` C2, C3 |
| one printed format | `{Verb} {name} · {n} {unit}[ · …]` | `navigation-spec.md` C1 to C4 (conflict 2) |
| accent rule | the accent fill is only on the cheapest fork branch | `navigation-spec.md` P1, P2 |

## 3. Painted receipts (`measures-48.json`, `captures-48.json`)

Every primitive (face, nav face/slot, sheet, dialog, inspector section, resource amount, help, toast lane) painted in `normal / hover / focus / pressed / disabled / loading / error`, plus unaffordable as `data-afford="short"`, at the six measured bands. `wk-<band>-<mode>-a.png` is the band with the root scroller at the top, `-b` at the bottom, `game-<band>.png` is the shipped shell at the same band, `wk-390x844-focus.png` is the keyboard ring.

| band | faces | under 44 px | at `min-height: 46` | stepped 200 ms | sheet px | toast px | clipped at 200 % | reduced branch |
|---|---|---|---|---|---|---|---|---|
| 360x640 dpr2 | 23 | 0 | 23 | 23 | 262 | 23 | 0 | `transition: none`, duration `0s` |
| 390x844 dpr2 | 23 | 0 | 23 | 23 | 348 | 23 | 0 | idem |
| 844x390 dpr2 | 23 | 0 | 23 | 23 | 157 | 23 | 0 | idem |
| 1366x768 | 23 | 0 | 23 | 23 | 538 | 23 | 0 | idem |
| 1920x1080 | 23 | 0 | 23 | 23 | 538 | 23 | 0 | idem |
| 2560x1440 | 23 | 0 | 23 | 23 | 538 | 23 | 0 | idem |

Notes a reviewer can check in one pass:

1. `transition-timing-function` reads back as `steps(4)` in Chromium: `steps(4, end)` and `steps(4)` are the same quantiser (`end` is the default jump term), so the declared and the painted value agree.
2. Price strings painted: `222 credits`, `+70 credits`, `10 scrap`, `8 Data`, `4 Data`, `82 credits`, `1.74 s`, `900 / 900` — always one space before the unit, never `Ferrous+70` (the two children carry the 4 px gap).
3. `dataNodes` reads `{font: "ui-monospace", variant: "tabular-nums"}` for every numeric node.
4. Non-colour state signals, from the same probe: `disabled` → `borderTopStyle: dashed`, `loading` → `dotted`, `error` → `solid` at `2px`, `short` → `dashed`; the unaffordable face also prints its own line `Needs 222 credits · have 0`, so the state survives a 1-bit screen. The audit's `disabled:false, opacity:1` at credits 0 is closed by the `data-afford` attribute plus that printed line.
5. Focus ring: `outline: solid 2px rgb(95, 216, 232)` (`wk-390x844-focus.png`), i.e. `--wk-avail`.
6. 200 % text: `clipped = []` and `labelLineCounts = [1 … 1]`, so no label wraps out of its box and no face grows past the row rhythm.

## 4. Tests and build

```text
npm test    -> 34 files / 374 tests passed, 15.29 s   (baseline at the base SHA: 32 / 342, 15.58 s)
npm run build -> dist/assets/index-Ckf3ZcTG.js 240.48 kB (gzip 75.95 kB), index-Dxjet9HZ.css 16.25 kB (gzip 3.86 kB)
```

New coverage: `tests/ui/tokens-48.test.ts` (the token module, the CSS parity, the printed formats, both motion branches) and `tests/ui/primitives-48.test.tsx` (one primitive per state group: face, nav row, sheet, dialog, inspector section, resource amount, help, toast lane, and the whole gallery). Save format and simulation are untouched: no file under `src/game/**`, `src/app/**` changed.

## 5. Not verified here (stated, not smoothed over)

- **No real device**: all frames are headless Chromium at the CSS bands listed above; safe-area insets are unproven.
- **No screen-reader pass** (NVDA/VoiceOver): the roles, names and `aria-*` wiring are asserted in the unit tests, but nothing was read out.
- **No audio pass**: cue presence and timing were not listened to.
- The `hover` and `pressed` states are painted twice on purpose — once by the real pseudo-class (`:hover`, `:active`) and once by `[data-state="hover"]` / `[data-state="pressed"]` so a static receipt can show them; a live pointer move was exercised only through the focus capture.
- The in-game slice (`game-*.png`) is the shipped shell, so it still shows the pre-restart dock (three to five faces, `Sell 35 Ferrous+70 credits`): migrating those consumers is #51/#54/#55 work, and the primitives were kept additive so no existing test moved.
- Pixel-exact machine selection is still a 20 px tap grid (the canvas has no DOM hit targets), as in #45 and #46.

## 6. Reproduce

```text
npm ci
node node_modules/vite/bin/vite.js build
node node_modules/vite/bin/vite.js preview --port 4188 --strictPort     # separate shell
node work/evidence/UI-RESET-48/measure-48.mjs    # -> measures-48.json
node work/evidence/UI-RESET-48/capture-48.mjs    # -> captures/*.png + captures-48.json
node work/evidence/UI-RESET-48/_census.mjs       # -> the measured-height census of section 0
npm test
```
