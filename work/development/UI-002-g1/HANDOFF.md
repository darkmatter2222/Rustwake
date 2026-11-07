# UI-002 g1 — "the world outranks the text" (developer-ui)

Lane: `rw/ui002-g1`, worktree `C:/Users/ryans/AppData/Local/Temp/opencode/ui002-dev`.
Contract: `work/product/dispatch-startup/assignments.md` Assignment 2 (rows U-1..U-7) plus
`work/development/dispatch-startup/handoff-next-g1.md` Lane B (the `dl` row fold-in, N-2).

## SHAs

| thing | SHA |
| --- | --- |
| lane base | `b4e8321e782a4debc55e58a6c7b123e86dd1047a` |
| first published checkpoint (WIP as one commit) | `2a63b00f23e75b8a06f080566afa4f419a5ec148` (helper-verified push 2026-11-06T13:44:21Z) |
| + merge of `origin/main` 887b5bc | `b5940c8d95ac909c10f42cb897bf4c1ae2287930` (helper-verified push 2026-11-06T13:47:19Z) |
| candidate under review (measured artifact = this tree) | `78ef6ca86026ead3d9326dcaf78e4b88b88c1120` |
| `origin/main` at integration time | `8d8d2ad7f83beefe3ee24a3f465ca392d5ac9848` (already carries BLD-001 as `12cc0e2`) |

BLD-001 was **not** re-implemented here: after the first publish the branch took `origin/main`,
whose `src/ui/text.ts` sorts the fork row cheapest-first inside `branchOptions`; this lane keeps
that function as-is and only adds the paint (`dock__btn--primary` on the leftmost face) and its
own `nextFreeTile` sentence for the `Move` face. `tests/simulation/fork.test.ts` (main's BLD-001
rows) is untouched and green.

## What the player sees now

1. **The resting card prints two weights, not four.** Tier one (`.objective__primary`,
   `0.95rem`/600) is the one thing the next tap does; tier two (`.status-line`, `0.72rem`/400) is
   a single numeric readout line that carries the fleet, the shared power budget and, after a
   refusal, the carried shortfall. The five batch pips are no longer repeated in text at all —
   the tiles paint them.
2. **Panel rows line up.** `.panel dl` is one `1fr` column and every line is one
   `.panel__row` flex line, so the label and its value share a line box and the value starts
   after the label ends. The `20/900` capacity pair is printed once (`Capacity 900/900` as its
   own row; the yard-summary duplicate line was dropped).
3. **One accent-filled primary per context**, in the dock row, in a panel's command row and on a
   research card.
4. **The machine panel has a `Move` face** beside Upgrade/Dismantle: `Move · cell 0 · 0 credits`,
   wired to the previously un-called `machine.move`, next to `Dismantle · +20 units` and
   `Upgrade · 30 credits` — every face prints the number that command costs.
5. **The dock fork row leads with the plan the purse can pay** (BLD-001 from `main`), and the
   leftmost face is the accent-filled one.

## Gate table (real exit codes, this worktree, tree `78ef6ca`)

| gate | command | exit | reading |
| --- | --- | --- | --- |
| typecheck | `npx tsc --noEmit` | 0 | clean |
| tests | `npx vitest run` | 0 | **287 passed / 28 files** (base 283/27 + 3 new `tests/ui/panel-rows.test.tsx` cases + 1 BLD-001 case from `main`), 4.63 s |
| content | `npx tsx scripts/validate-content.mjs` | 0 | behaviour line **unchanged**: `firstDrone=268 firstResearch=478 tick=18298 machines=8 links=18 drones=5 batches=1902 credits=82 nodes=3 \| 0 violation(s)` |
| build | `npm run build` | 0 | `index-C_K4oMJ5.js` **231262 B**, `index-B1FOV2xO.css` 7849 B, `tables-BB2NPvQ2.js` 9298 B, `catchup.worker-G_Jyr7uh.js` 13406 B |

Entry chunk **231262 B** vs base `index-DGy53fNu.js` 231878 B → **-616 B** (ceiling 233000 B,
headroom 1738 B).

## U-1 — card ≤ 42 % of the `.hud` content box, five cells

`hudContentBox.height` is `.hud`'s `clientHeight`, printed in every row. Instrument:
`scripts/measure-ui002.mjs` (chromium, `vite preview` on the built artifact, dpr 2, `isMobile`,
`hasTouch`), raw log `measure-ui002.txt`; text scale proven three ways per cell (saved
`settings.textScale`, `--text-scale` custom property, resolved `body` font size 15 px / 30 px).

| cell | `hudContentBox.height` | `.objective` | ratio | cap | control on the live route |
| --- | --- | --- | --- | --- | --- |
| 360x640 ts1 2-machine | 640 | 83.31 px | **13.0 %** | pass | 107.02 px = 16.7 % |
| 360x640 ts2 2-machine | 640 | 243.75 px | **38.1 %** | pass | 261.42 px = 40.8 % |
| 390x844 ts1 4-machine | 844 | 83.31 px | **9.9 %** | pass | 89.2 px = 10.6 % |
| 390x844 ts2 4-machine | 844 | 209.56 px | **24.8 %** | pass | 261.42 px = 31.0 % |
| 360x640 ts2 4-machine, fork open, one refused tap | 640 | 267.5 px | **41.8 %** | pass | 285.17 px = **44.6 %** (= `D-1`) |

The control column is the same instrument run against the served artifact
(`index-CUnHr3Cs.js`, CSS byte-identical to the base), so the four CHRM cells reproduce their
recorded 16.7 / 40.8 / 10.6 / 31.0 % exactly and the fifth row reproduces the recorded `D-1`
44.6 %. `D-1` closes at 41.8 %; the CHRM-001/002 rows are untouched.

## U-2 — hierarchy is measurable

* Card tiers: exactly **2** distinct `font-size`/`font-weight` pairs per cell —
  `14.25/600` + `10.8/400` at ts1, `28.5/600` + `21.6/400` at ts2 →
  **primary/secondary = 1.32×** (floor 1.25×) at both scales (0.95rem over 0.72rem).
* Accent census per container: `.dock` at the fork → buttons 2, accent-filled **1**;
  `.panel__actions` → buttons 4, accent-filled **1**; each `.node__foot` → buttons 1,
  accent-filled 1. The fill test is `background-image` starting with `linear-gradient`.
* Computed luminance (alpha composited over the page ground, 32-unit buckets):
  pill row `rgba(11,18,32,0.92)` → L 17.12, bucket **0**; primary face
  `rgba(201,113,58,0.65)` + amber wash → L **90.94**, bucket **2**; the plain face stays
  bucket 0. The two recorded buckets apart (≥ 2). The price line on the fill is `#ffd9a8`
  (4.9:1 on that fill, where the base `--furnace` measured 3.8).

## U-3 — BLD-001 fork row (`main`), re-verified on this candidate

Cell 360x640 ts2, 4 machines, purse 30, fork open. `accent-filled face index 0 of 2` →
`0: Less power 30 credits | 1: Faster batches 40 credits`. One refused tap (face 1) printed
`Need 40 credits · have 30`; then **one leftmost tap** took the machine level sum **4 → 5** and
the purse paid exactly the 30 the face printed. Two prices, two names, same sentences as
STRAT-003. After the paid tap the row returns to the plain ladder
(`Store | Yard | Build Wire mill 30 scrap + 6 nonferrous | Build`).

## U-4 — panel rows at 360x640 and 390x844, ts1/ts2

Per panel: `alignment` is the AND over rows of `|dt.top − dd.top| ≤ 1` **and** `dd.left > dt.right`.

| panel cell | rows | alignment | `dTop` / `leftGap` on every row | row width vs body `clientWidth` | dt/dd overflow | capacity pair printed |
| --- | --- | --- | --- | --- | --- | --- |
| Store 360x640 ts1 | 9 | true | 0 / 8 px | 314 vs 314 | 0 / 0 | `900/900` once |
| Store 360x640 ts2 | 9 | true | 0 / 8 px | 314 vs 314 | 0 / 0 | `900/900` once |
| Store 390x844 ts2 | 13 | true | 0 / 8 px | 344 vs 344 | 0 / 0 | `900/900` once |
| Machine 360x640 ts2 | 10 | true | 0 / 8 px | 314 vs 314 | 0 / 0 | `4.00s` twice, see note |
| Machine 390x844 ts1 | 10 | true | 0 / 8 px | 344 vs 344 | 0 / 0 | `4.00s` twice, see note |
| Research 360x640 ts2 | 3 node cards | n/a (no `dl`) | — | card 314 vs body 314 | card overflow 0 | — |

* `dl` overflow `0` everywhere: the alternating-cell artifact (Q-004: "Smart Buffers" 27.6 px over
  12 one-word lines) cannot recur in a one-column grid. Research node names are single-line boxes
  (`sw == cw`: 204/204, 176/176, 192/192), effects 2–3 lines, foot `sw == cw` 296.
* Last line reachable: at the body's own maximum scrollTop the last row's bottom is inside the
  body box in every cell (`Store` 573 ≤ 573+1, `Scrap sorter` 777 ≤ 777, `Research` last card
  560.22 ≤ 559.59+1 — the +1 px is the integer `clientHeight` against a fractional rect, stated in
  the instrument). The body is the one declared scroller (`overflow: hidden auto`) and its
  dismiss target stays in view while scrolled.
* Repeated-value census prints `[]` for every Store/Research panel. The machine panel's only
  repeat is the string `4.00s` (count 2), which is two different facts (`Cycle 4.00s` and the
  `Next upgrade 4.00s → 3.64s` pair), not a duplicated row.
* `pageScroll == innerHeight` in all six panel cells and in the five U-1 cells (360x640 vs
  360x640, 390x844 vs 390x844). 0 pageerror everywhere.

## U-5 — every overlay closes, nearest first

Per overlay (360x640 ts2): visible target `Close` **87x44 px**, `top 322`, in-view **true** →
panels 1 → 0; reopened → **Back/Escape** → 1 → 0. Same for `Store`, `Research`, `Yard`. The boot
return report retires itself with `Back to yard` (96x44 px at ts1, 119x71 px at ts2). Build mode:
`Ghost on cell 5 · tap again to place` → one Escape → back to `A machine waits for input; check
its empty side.` with 0 panels, i.e. the ghost goes before the older overlay. No pile-up: the
panel slot holds one panel at a time. 0 pageerror across all sessions.

## U-6 — one simulated persona against the same build's sim

See `UI-002-persona-g1.json`. From the resting screen only, the persona states: next tap =
`Less power 30 credits`; last shortfall = need 40 / have 30; readout `Drones 1 · Power 8 ·
5 requested · 100 %`. The instrument's agreement object printed
`{"drones":true,"powerCapacity":true,"powerPercent":true,"powerRequested":true,"nextTapPriceMatchesTable":true}`
in all four rest cells. The same instrument on the control prints a 4-line card at 44.6 %; the
candidate answers the same questions in 3 lines at 41.8 %, which is the strict improvement the
row asks for. Labelled as a simulated persona, one run, no invented cohort.

## U-7 — floor

Smallest dock face **46 px** in every cell; the four machine-panel command faces measure **44 px**
(`actionsInRow [44,44,44,44]`), so the 44 CSS px floor holds. `scrollHeight == innerHeight`,
entry chunk inside the ceiling, behaviour line unchanged (table above).

## Evidence in this directory

* `measure-ui002.txt` — full instrument log (rest 4 cells + panel 6 cells + dismiss chain + fork cell).
* `UI-002-persona-g1.json` — persona read-out, sim comparison, control run.
* `captures/*.png` — 12 screenshots with the cell name in the file name (`UI002_SHOTS`).

## Limitations and remaining gaps

1. The 42 % criterion is unchanged and the deepest cell sits at **41.8 %**, 0.2 pp of headroom.
   One more numeric clause on the secondary line wraps it and the cap fails; that is the honest
   state of the decimal, not a rounding.
2. `scripts/measure-ui002.mjs` needs `npm run build` + `npx vite preview --port 4173` first and
   reads `dist/assets` for the byte census; it is not wired into `npm run` scripts (the base
   instrument `scripts/measure-chrm002.mjs` stays the comparison instrument).
3. The machine-panel cells put their machines in yard **row 4** on purpose: at ts2 the objective
   card covers the top rows, so a tile centre there is not a canvas tap. Row 0 is exercised by
   the rest/fork cells (their level sums come from the plain-ladder row).
4. `Move` prints `0 credits` because `moveMachine` levies nothing at this base; `BELT-001` will
   change that number and the face follows it automatically (one source, `unit(charge, …)`).
5. Untracked `scripts/tmp-probe-g3.mjs` in this worktree is not part of this lane's commit (left
   in place, not mine to edit).
6. Not attempted here (non-goals): the `C1..C5` contrast set, audio, atlas migration, board and
   README publication.

## Rollback / save impact

Presentation only: no `src/game/**` edit beyond three `strings.ts` keys (`btn.move`,
`btn.moveCost`, `btn.dismantleRefund`), no engine/command/TUNING change, so `schemaVersion 1` and
the `eede3c4f` fixture checksum are unchanged (the save tests are part of the 287 green) and a
save written by the previous release loads in this build. Reverting `78ef6ca` restores the
four-line card and the two-column `dl`; no data migration is involved. The previous release
directory stays the rollback target.
