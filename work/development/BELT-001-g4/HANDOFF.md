# BELT-001 g4 — the priced extent is visible (lane `rw/belt001-g4`)

Worktree `C:/Users/ryans/.local/share/opencode/worktree/fe4e05/belt001-g4-dev`, sole writer.
What g4 adds on top of the certified g2/g3 facts: `scene.ts` now walks the route's own
`run` array as an orthogonal polyline (so the drawn silhouette *is* the extent the price was
computed from), the cargo token walks that polyline by cumulative path length, and one
printed line — `N tiles · N scrap`, from the same `beltCost` the connect tap charged — sits at
the polyline's midpoint for the machine the player has open and in the machine panel's
`Links` row.

## 1. Commit chain and pushed SHA

| sha | content |
| --- | --- |
| `1573ac1` | `origin/main` tip at dispatch (docs-only, newer than `a551794`) |
| `fb0dca0` | `rw/belt001-g2` tip — the certified sim facts (`run` carried, price ladder, 232914 B) |
| `6b39b21` | merge of `fb0dca0` into the lane — **clean, no conflict**, `scene.ts` included |
| `bcb3d1cdefdc9f84108b8bb91cd95e2736853618` | **g4 feature code**, pushed and verified (`git ls-remote origin refs/heads/rw/belt001-g4`), receipt `.git/rustwake-publication/rw_belt001-g4.json` |
| (this commit) | `scripts/measure-belt001-g4.mjs` + `work/development/BELT-001-g4/**` (bench + phone evidence) |

No `scene.ts` rebase conflict occurred; the merge needed no hand resolution.

## 2. Gates, on this tree

| gate | command | exit | evidence |
| --- | --- | --- | --- |
| typecheck | `npm run typecheck` | **0** | `> tsc --noEmit`, no diagnostics |
| tests | `npx vitest run` | **0** | `Test Files 31 passed (31)` / `Tests 314 passed (314)` / `Duration 4.65s` |
| validate | `npm run validate` | **0** | `content: 0 violation(s)`, `validated: no violations`, behaviour line **unchanged**: `firstDrone=379 firstResearch=527 tick=18298 machines=8 links=18 drones=4 batches=1838 credits=157 nodes=3` |
| build | `npm run build` | **0** | entry `dist/assets/index-0-Iasx2E.js` = **232999 B** (ceiling 233000 → **1 B headroom**); `index-B1FOV2xO.css` 7849 B, `tables-CigJkmRP.js` 9298 B, `catchup.worker-G_Jyr7uh.js` 13406 B |

The 1 B of headroom is real and is the reason the label paint uses unsnapped `fillText`
arguments, a non-rounded font size, one `pathAt` helper (equal-leg assumption, no `legs`
array) and a shared `endpointOf`. It is not a place to add a string.

## 3. Step 1 witness — the drawn segment count *is* `run.length − 1`

`tests/renderer/belt-extent.test.ts` (4 tests, painted through a recording 2D context):

- `draws one segment per tile step: 2 for a 3-tile run, 6 for a 7-tile run` — the number of
  `moveTo`-started polylines and their vertex counts come out **2** and **6**;
- `keeps the single chord for a run-less (pre-price) route` — one segment, both endpoint
  centres, vertex-for-vertex the pre-g4 path;
- `lands the cargo token on the destination tile at its arrival tick, by path length` — the
  token's `t = 1` position is the destination tile centre, on the same `item.arrive` tick;
- `prints the extent line beside the line itself, only for the selected machine`.

Same four numbers read off the **real** canvas at 390×844 / dsf 2 (see §6): every probe point
on both painted polylines has its nearest stroke pixel at offset `[r, 0, 0]` with `r ≤ 4`
device px (mean **0.22 CSS px**), so the shipped camera and the model's `worldToScreen` agree.

## 4. Step 2 witness — the printed scrap *is* the charged scrap

`tests/ui/belt-extent.test.tsx` (5 tests):

- purse delta and printed line for distance 2 / 5 / 6 → **3 / 6 / 7** scrap, asserted from
  `store.scrap` deltas and from `beltExtentLine` (`3 tiles · 3 scrap`, `6 tiles · 6 scrap`,
  `7 tiles · 7 scrap`);
- the machine panel carries that line under the `Links` label;
- two links on one machine stay **one** row, joined with `t("value.comma")`;
- a `run`-less (pre-price) link prints the stored latency form `5 ticks`;
- the Dismantle row's figure equals the scrap the dismantle tap actually returns, link
  refunds included (`refundOf(beltCost(...))` per link plus `refundOf` per build-cost line).

Two printed-vs-charged drifts the merge exposed were fixed inside owned files: the Move face
now prints the engine's `movePenaltyPct` total units, and the Dismantle face the engine's
refund arithmetic. `tests/ui/panel-rows.test.tsx` pins the Move row as
`/^Move · cell \d+ · \d+ units$/`; `tests/ui/i18n.test.tsx` (`1 units`, OPS-106) passes again
because the printed number is now engine-derived.

## 5. Step 3 — 12 h bench, within ±10 %

`npx tsx work/development/BELT-001-g2/bench-variants.mjs` (the certified g2 harness), forward
and `--reverse`, plus matched control pairs — full numbers in `bench-g4.txt`:

| variant | forward | reversed | Δ vs A |
| --- | --- | --- | --- |
| A cost-only (shipped) | 149.30 ms | 148.81 ms | — |
| B per-tile latency (deferred) | 144.21 ms | 154.23 ms | −3.41 % / +3.65 % |
| C no-run | 150.51 ms | 154.34 ms | +0.81 % / +3.72 % |
| D null control (no links) | 32.52 ms | 34.98 ms | −78.22 % / −76.49 % |

`tests/perf/bench.test.ts` matched pairs, control `6b39b21` vs candidate: pair 1
44.65 → 44.53 ms (**−0.27 %**), pair 2 41.94 → 43.98 ms (**+4.86 %**) — both inside ±10 %.
Against the deployed base `1573ac1`: −0.98 %, −5.30 %, and the full-suite pair −17.3 %
(candidate faster). No timing regression.

## 6. Step 4 — phone captures and the pixel readings that back them

`npx vite preview --port 4174` from this worktree, then
`BELT001_SHOTS=work/development/BELT-001-g4/captures RUSTWAKE_URL=http://localhost:4174/ npx tsx scripts/measure-belt001-g4.mjs`.
Three stills, 390×844, `deviceScaleFactor 2`, `isMobile + hasTouch`, `pageerror 0` on all three:

| file | state | what the instrument measured |
| --- | --- | --- |
| `captures/390x844-ts1-rest.png` | nothing selected, both links carrying cargo | 3-tile polyline ink **8/9/12 @ 0.22 px**, chord 4/4/6; 7-tile polyline ink **32/32/36 @ 0 px**, its chord **0/0/6**; stroke class `#418899` = 2716 device px in box x 260…519, y 495…1076 |
| `captures/390x844-ts1-panel-7-tiles.png` | tile-31 sorter selected | panel `Links → 7 tiles · 7 scrap`, world label band light pixels **40** (8 for the unselected link in the same still) |
| `captures/390x844-ts1-label-3-tiles.png` | tile-4 sorter selected | panel `Links → 3 tiles · 3 scrap`, world label band light pixels **171** (128 unselected) |

Reading of the geometry, all in device px: the 3-tile extent is a **straight** run (`corners: 0`,
box 116×0 CSS); the 7-tile extent is an **L** (`corners: 1`, box 58×289 CSS) whose vertical leg is
columns 330–333 (4 device px = the 2 CSS px line) running y 537…1076 and whose bottom leg is
rows 1073–1076 running x 260…333, i.e. the corner sits at device (332, 1076) = CSS (166, 538),
exactly the predicted vertex. The chord of that same route — the old two-point render — gets
**0/6** ink, which is the differential that says the polyline, not the chord, is on the canvas.

**What a player can now tell apart on a phone:** the two links no longer share one silhouette —
the 3-tile link is a short straight dash between dock and sorter, the 7-tile link is a long
vertical run down the yard with a visible corner into the near sorter, so the *length of the
printed extent* is the number in its label. With a machine open, `N tiles · N scrap` is legible
both beside the line and in the panel, and the amber cargo token visibly takes the corner on the
L instead of cutting across the yard. **What stays invisible:** the per-tile latency split
(deferred by D-1(a)), the price of a link whose machine is *not* selected (one label per open
machine, by design, to keep the rest screen clean), and any number for a pre-price link beyond
`5 ticks`.

Instrument detail: `scripts/measure-belt001-g4.mjs`, `BELT001_MAP=1` prints a 16-px ASCII ink map
and `BELT001_MAP=2` adds per-leg run-length colour scans, the exact-colour boxes and the
per-sample nearest-ink offsets (`offsets: [radius, dx, dy]`, `25` = not found in 24 device px).
Full output for the three stills: `measure-390x844.txt`.

## 7. Limitations

1. **The instrument must be pointed at a preview of *this* worktree's `dist`.** A stale
   `vite preview` on another port answers the chord and prints `32/36 → 0/0` for the L; the
   numbers above are from `--port 4174` after `npm run build` here (entry hash
   `index-0-Iasx2E.js`).
2. `node_modules` in `C:\Users\ryans\source\repos\Rustwake` was intermittently partial (one
   `tsc` run failed with `Cannot find type definition file for 'vitest/globals'`). The control
   worktrees `…\Temp\opencode\belt001-g4-base` (`1573ac1`) and `…\belt001-g4-ctrl` (`6b39b21`)
   use junctions to `…\Temp\opencode\belt001-dev\node_modules`, which is stable.
3. The label's light-pixel probe is a band count that includes sprite pixels underneath, so it
   is reported as a *delta* against the same band in the rest still, not as an absolute glyph count.
4. `tests/ui/i18n.test.tsx`'s `1 units` assertion is still substring-fragile (pre-existing).
5. jsdom noise is pre-existing and unchanged: `getContext` is not implemented in the panel
   tests, and the `act(...)` warnings are the same set as before this slice.

## 8. Rollback / save impact

None to the save: `schemaVersion 1`, checksum `eede3c4f`, no new or renamed field. `run` was
already written by g2/g3; g4 only *consumes* it in `drawRoutes` and in `beltExtentLine`. The
`validate` behaviour line is byte-identical to the g2 candidate's, so the deterministic
simulation is untouched (the renderer work is outside the tick loop). Reverting the lane is a
plain fast-forward back to `1573ac1` + `fb0dca0`; an old save still loads in the new build and
vice versa, with the pre-price links falling back to the single chord and `5 ticks`.
