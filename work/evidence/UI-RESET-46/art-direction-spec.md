# UI-RESET/ARTDIR (#46) — selected industrial art direction, with composed references

Issue: https://github.com/darkmatter2222/Rustwake/issues/46 · parent goal #43 · milestone 1 · gate G1
Head SHA of every artefact below: `224e22aa57a68215a2eddfe606ef50462b4d0b5e` (branch `rw/46-artdir-g1`)
Built revision under test: `vite build` in this worktree (`dist/assets/index-BB8vPAlp.js`, 232.94 kB; `index-BQX-FOQv.css`, 8.16 kB).
Reference geometry: `work/evidence/UI-RESET-45/measures.json` and `work/evidence/UI-RESET-45/coverage-matrix.md` (#45, read-only).
Own instrument: `measures-46.json` (same probe, three runs per band: `before` = built sheet only, `A`, `B`).

Companion document: `design-spec-46.md` carries the measured per-band inset table, the chip-priority ladder, the state-coverage table, the implementation boundaries and the acceptance checks. This file carries the direction decision and why.$nl$nl## 1. Selected direction: A — "Salvage ledger" (`direction-a.css`)

A is one author-token sheet injected after the built sheet — the exact cascade a token rewrite in
`src/ui/styles.css` produces. No game code is touched. Four reasons it is selected:

1. **One primary per frame.** Exactly one accent-filled face per action row:
   `.dock__btn--primary`, `.panel__actions > .icon-btn:first-child`, `.node__buy` share one orange
   fill; every other face keeps the flat `--panel` fill with a hairline edge. A census can count
   the filled faces (`background-image` is a gradient) — one in the dock, one in a panel command
   row, one on a research card.
2. **Ink-first economy with a role split, one job per hue.** `--a-avail #5fd8e8` = structure and
   titles, `--a-flow #ffb765` = numbers in flight and prices, `--a-ok #7fdc8f` = a condition that
   is satisfied (known node, payable face); `--a-primary #ff8f3f` is used only on the single
   primary face. Chrome is translucent (`--panel` at alpha 0.84), hairline `rgba(147,180,201,.28)`,
   radius 3 px, so the yard keeps its band: measured chrome-over-ink cover 19.3 % at 844×390
   against 27.7 % before and 30.9 % under B (`measures-46.json`).
3. **The authored pixel sheet is the only icon source.** All nine machine/prop roles and the floor
   kit are the code tables in `src/game/renderer/sprites.ts` (`PARTS`, `FLOOR_KIT`, `FLOOR_POSTS`,
   `PUDDLES`, `GRAVEL`, `WRECK_HULL`; see `docs/evidence/asset-provenance.json`). The DOM takes the
   same palette (mirrored in `styles.css :root` and `Hud.DOT_COLORS`), so a dot, a chip and a
   machine body are the same authored ink. No binary atlas, no unedited primitives, no external font.
4. **200 ms stepped transitions with a reduced-motion fallback.** One 200 ms clock on
   `background-color` / `border-color` / `opacity` for `.dock__btn`, `.icon-btn`, `.node`, `.toast`,
   `.objective`, quantised with `steps(4, end)` so a state change reads as a tick, matching the
   world's own 6-frame quantised cycles (ART-003/006 tests); `@media (prefers-reduced-motion: reduce)`
   sets `transition: none`.

**Why B loses (`direction-b.css`, kept as the fallback).** Measured on the same probe: B pushes
the chrome-over-ink cover at 844×390 to **30.9 %**, worse than the **27.7 %** it starts from, while A
brings it to **19.3 %**; at 1366×768 B measures **13.0 %** against A's **12.2 %**. B also keeps the
plate pinned at `left: 1104px`, so on 1366/1920/2560 the inspector still paints **on** the ink column
instead of beside it (A's flush-right rule moves it out), and its `ease` transitions do not line up
with the quantised world cycles. Both sheets do hold the 44 px floor and both keep the phone band at
one chip row (`measures-46.json`, 390×844: `before` 4 chips in 2 rows at tops `[8,33]`; A and B 3
chips in 1 row at tops `[8]`, ink top 152 px and 147 px against 154 px before), so the separation is
the wide-band cover and the gutter pinning, not the touch targets. What B is good at — a heavier,
more legible plate with a double rule over the primary — is folded into A as needed (rule weight,
letter-spacing), so B stays the fallback sheet rather than a parallel track.

## 2. Composed states — which file shows what

The receipt `captures-46.json` lists 32 composed frames: 2 directions × 2 scenarios × 2 bands ×
4 surfaces (`-rest`, `-store`, `-machine`, `-build`). Filename pattern:
`<a|b>-<band>-<fresh|mature>-<surface>.png`. `a-*` = direction A, `b-*` = direction B.

| Surface shown | A 390×844 | A 1920×1080 | B 390×844 | B 1920×1080 |
| --- | --- | --- | --- | --- |
| Yard at rest (world + chip band + objective card + dock) | `a-390x844-fresh-rest.png`, `a-390x844-mature-rest.png` | `a-1920x1080-fresh-rest.png`, `a-1920x1080-mature-rest.png` | `b-390x844-fresh-rest.png`, `b-390x844-mature-rest.png` | `b-1920x1080-fresh-rest.png`, `b-1920x1080-mature-rest.png` |
| Inventory (Store plate: stock rows, capacity, sell rows) | `a-390x844-fresh-store.png`, `a-390x844-mature-store.png` | `a-1920x1080-fresh-store.png`, `a-1920x1080-mature-store.png` | `b-390x844-fresh-store.png`, `b-390x844-mature-store.png` | `b-1920x1080-fresh-store.png`, `b-1920x1080-mature-store.png` |
| Machine inspector (status page over the world, plus the named fork faces) | `a-390x844-fresh-machine.png`, `a-390x844-mature-machine.png` | `a-1920x1080-fresh-machine.png`, `a-1920x1080-mature-machine.png` | `b-390x844-fresh-machine.png`, `b-390x844-mature-machine.png` | `b-1920x1080-fresh-machine.png`, `b-1920x1080-mature-machine.png` |
| Build catalog (blueprint list, cell ghost, Cancel/Build/Next row) | `a-390x844-fresh-build.png`, `a-390x844-mature-build.png` | `a-1920x1080-fresh-build.png`, `a-1920x1080-mature-build.png` | `b-390x844-fresh-build.png`, `b-390x844-mature-build.png` | `b-1920x1080-fresh-build.png`, `b-1920x1080-mature-build.png` |

Scenarios, both plain save envelopes so every sheet replays the same yard:

- `fresh` = `scenario-opening.json` — a no-save boot walked to the first built machine and dumped
  from `localStorage` at this head: 1 machine, `tutorial 1`, chips `Scrap 0 / Credits 0 / Store 0/900`,
  tick 68–130 across the four surfaces.
- `mature` = `scenario-mature.json` (= `docs/evidence/yard-mature.json`): 8 machines, 18 routes, all
  three research nodes known, tick 450308–450328, chips at 390 `Scrap 10 / Ferrous 54 / Credits 82 /
  Store 900/900`, at 1920 seven chips including `Nonferrous 239`, `Steel 10`, `Copper 10`.

`captures/captures-46.json` carries, per file, the painted text it actually shows (chips line,
objective card, panel head line, dock labels, `data-afford` classifications) plus the composition
readout (ink box, cover %, faces under 44 px), so a claim can be checked against the image itself.
Twelve further PNGs in `captures/` come from `capture-extra-46.mjs` in the same naming scheme and
carry the extra cells: 844×390 and 2560×1440 mature rest/store plus the credits-0 unaffordable
frame at 390×844 and 1920×1080 for both sheets (`b-` twins) — they are receipted in
`captures-extra-46.json` (12 entries), so the folder holds 44 PNGs in total across the two receipts.
The 56-entry intermediate receipt `captures/captures-46.json`, the scratch probes `_dbg.mjs` and `_dbg2.mjs` and `composition-table.txt` were removed at this head:
`captures-46.json` plus `captures-extra-46.json` are the only two receipts, and
nothing below depends on the removed files.

## 3. Rules the implementation has to keep (direction A)

- **Typography** — one family (`system-ui` stack, no webfont), one root size 15 px × the player's
  text scale, three tiers only: 0.95 rem (14.25 px) primary line, 0.84 rem (12.6 px) body and chip,
  0.72 rem (10.8 px) secondary readouts; the plate title is 0.86 rem uppercase with 0.08 em tracking
  so it cannot be confused with a value. Every numeric node carries `font-variant-numeric: tabular-nums`.
  Label hierarchy is monotonic: primary ≥ body ≥ secondary at every text scale.
- **Palette tokens** (`direction-a.css` `:root`) — `--night #0a1118`, `--night-deep #070d13`,
  `--panel rgba(7,13,19,.84)`, `--paper #eef4f8`, `--steel-light #93b4c9`,
  `--a-avail #5fd8e8` (structure/available), `--a-flow #ffb765` (numbers and prices),
  `--a-ok #7fdc8f` (condition satisfied), `--a-primary #ff8f3f` (the one primary fill),
  `--a-hair rgba(147,180,201,.28)`, `--a-step 200ms`. The primary's ink is `--night` on the orange
  fill (the built sheet established 5.27:1 there); a disabled face stays at opacity 0.8.
- **Material and lighting** — one light direction and one 1-step-dark contact shadow per footprint,
  both from the authored sheet; chrome is matte translucent (no second backdrop layer, no inner
  shadow, no blur), the only gradient in the frame is the two-stop wash on the primary face. Gravel
  and dot-grid ink stay subordinate (measured ink shares in the ART-005 census: machine body 1.53 %,
  gravel 0.12 %, dot grid 0.02 % of the canvas).
- **Icon language** — the authored pixel sheet only: `src/game/renderer/sprites.ts` `PARTS` per
  blueprint (identity marks in `docs/evidence/asset-provenance.json`), `FLOOR_KIT`/`FLOOR_POSTS`/
  `PUDDLES`/`GRAVEL`/`WRECK_HULL`; the DOM reuses the same 16-value `PALETTE`, and a chip's dot is
  the 6 px square of that palette colour. No primitive placeholder shapes, no emoji, no third palette.
- **Borders** — 1 px hairline `--a-hair`, radius 3 px (2 px inside chips, nodes and dock faces);
  the objective card is a 2 px left rule with a 0/2/2/2 corner, not a boxed plate; state is carried
  by the border, never by a second fill: known = `rgba(127,220,143,.7)`, open = `rgba(255,183,101,.6)`,
  locked = dashed `--a-hair`, and the harness's `data-afford` classification paints green for
  payable / rust for short beside the printed price, so colour is never the only signal.
- **Animation rules** — one 200 ms clock, `steps(4, end)`, only on `background-color`,
  `border-color`, `opacity`; `prefers-reduced-motion: reduce` disables all of it (the world keeps a
  single static width per state, as ART-006 proves for the settle bar). No transforms on the HUD
  column, so no chrome box moves while the player reads it.

## 4. Measured layout problems, verified against the instruments

From `work/evidence/UI-RESET-46/measures-46.json` (three runs per band: `before`, `A`, `B`):

- **844×390 (landscape phone): the world owns 27 % of the width.** Ink box
  `307,28 230×346` in all three runs → 230 / 844 = **27.3 %**; the same box is in
  `UI-RESET-45/measures.json` (`landscape-844x390.rest.world.cssW = 230`), so the number is
  confirmed by both instruments. Chrome laid over that ink: **27.7 %** before, **19.3 %** under A,
  **30.9 %** under B. The fitted ink width did not change under either sheet, so the 27 % itself is
  a camera-inset problem (#50/#51 code work), not something a token sheet can buy back; the sheet
  only decides how much of that narrow column the chrome then covers.
- **2560×1440: the yard is a 766 px column in a 2560 px frame, and the plate sits inside it.**
  Ink box `896,168 766×1150` in all three runs → the ink covers **29.9 %** of the width and 79.9 %
  of the height; 896 px of empty gutter at the left and 898 px at the right (#45 coverage matrix,
  row 3). The inspector plate pinned at `left: 1104px` (width 320) lands inside the ink span
  896–1662; A's flush-right rule at ≥1200 px moves it outside.
- **Chip band height at 2560×1440 — the actual measured numbers.** `measures-46.json` records the
  band as 7 chips in **1 row** at tops `[8]` for `before`, `A` and `B`; `UI-RESET-45/measures.json`
  gives that band's box as `10,8 628×23`, i.e. **23 px**, and the tallest chip band anywhere in that
  file is **73 px** (3 rows at 360×640), with 48 px at 390×844 (2 rows). The "~91 px" figure is
  **not** in `UI-RESET-45/measures.json` or in `measures-46.json` (no `h` value of 89–92 exists in
  either; the only `91` there is a chip width `91`/`91.4` px), so it is not carried as a claim here.
- **Faces:** 0 touch targets below 44 px in any of the fifteen measured frames
  (`facesUnder44 = 0` everywhere).

## 5. Not verified here

- No real device: all frames are headless Chrome/Edge at the CSS bands 390×844 (dpr 2 → 780×1688
  pixels) and 1920×1080 (dpr 1), not an iPhone/Android panel; safe-area insets are unproven.
- No screen reader pass: the accessibility tree and the 200 ms state changes were not read out.
- No audio playback pass: cue presence/timing was not listened to; only the DOM state was captured.
- Not measured: perceptual contrast of the new `#7fdc8f`/`#ff8f3f` pairs beyond the printed ratios
  in the built sheet's census, the `prefers-reduced-motion` branch (declared, not exercised), and
  the 360×640 / text-scale-2 cells (they are in the 56 companion PNGs, not in the 32-file receipt).
- Direction **B is the fallback**, not a parallel track: it is kept as `direction-b.css` and stays
  measurable, but nothing in the plan depends on it, and its two known costs (chrome cover 30.9 %
  at 844×390, plate still on the ink column at ≥1200 px) are the reason it is not selected.

### Reproduce

```text
node node_modules/vite/bin/vite.js build
node node_modules/vite/bin/vite.js preview --port 4186 --strictPort     # separate shell
$env:RUSTWAKE_URL = "http://localhost:4186/"
node work/evidence/UI-RESET-46/measure-46.mjs    # -> measures-46.json
node work/evidence/UI-RESET-46/capture-46.mjs    # -> captures/*.png + captures-46.json
node work/evidence/UI-RESET-46/inspect-46.mjs    # -> _m.txt / _c.txt digests
npm test                                          # 32 files / 340 tests passed, 16.99 s at this head
```

