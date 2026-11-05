# PLAY-001 generation 1 — developer handoff (candidate)

Role: developer. Task: PLAY-001 g1, "the resting screen answers three questions without a tap".
Base SHA `c2842e1c853a146f22afda5667e7410253f88ddf` (worktree started at `7c8d8e7497e79d983da267c6af3e43d02221ce9a`, the docs-only commit the release lane published on top of it; the two differ in `README.md`/`work/*` only). Worktree `C:\Users\ryans\.local\share\opencode\worktree\fe4e05\play001-dev`, branch `PLAY-001-g1`, one commit, not pushed. Candidate SHA = that commit (`git log -1` in that worktree).
Evidence types: automated gates (real exit codes), jsdom DOM assertions, chromium measurement of the built artifact (visual inspection of the shipped pixels + numeric readouts), source inspection. No human playtest; no audio claim.

## 1. What the player sees differently (before → after, literal strings)

Measured on the built artifact at 390×844 dpr2, fresh storage, 250 ms taps on the primary button.

| surface | before (control `24daf0e`, as quoted in the ticket) | after (this candidate, measured) |
|---|---|---|
| blocked toast at tap 20 | `Not enough material` | `Need 20 scrap · have 0` |
| blocked toast, later price | `Not enough material` | `Need 5 ferrous · have 2` (tap 200), `Need 45 credits · have 4` (credit case) |
| resting power line, 0 machines | absent until a machine has `progress > 0` | `Drones 1 · Power 8 · 0 requested · 100 %` from the first tick |
| drone count | none | numeric, on that line: `Drones 0` before the repair, `Drones 1` after, `Drones 5` on a five-drone fleet |
| primary label, build choice | `Build sorter 20 scrap` ↔ `Place Scrap sorter 20 scrap` on nearly every tap | `Build Scrap sorter 20 scrap` in both phases; the phase moved to `.status-line`: `Open Build and place the sorter on a lit cell.` ↔ `Ghost on cell 8 · tap again to place` |
| pip legend | none (5 pips, no name) | `Batch pips · Scrap sorter 2/5 · Furnace 2/5 · Polymer recycler 0/5 +3` (8-machine yard, tap 900) |
| credits chip | row disappears at 0 | `Credits 0` stays in the chip row |

Nothing else moved: no new currency, machine, panel or system; `schemaVersion` stays `1`; the CSS is untouched (chunk hash `index-DpiCrzhv.css` 7403 B, identical bytes before and after).

## 2. Gate results (this candidate, real exit codes)

| gate | command | exit |
|---|---|---|
| typecheck | `npm run typecheck` | **0** |
| unit/integration | `npm test` | **0** — **265 tests, 27 files** (base: 259 tests / 26 files, +6 in one new file) |
| content+behaviour | `npm run validate` | **0** |
| build | `npm run build` | **0** |

Behaviour line, verbatim after the change (identical to base and to OPS-009):

```
behaviour: firstDrone=268 firstResearch=478 tick=18298 machines=8 links=18 drones=5 batches=1902 credits=82 nodes=3 | 0 violation(s)
```

Content line: `content: 0 violation(s)`; `tables: 15 resources, 8 blueprints, 12 recipes, 3 research nodes`. **No number moved, so the golden line needs no re-anchoring.** The engine's state transitions are untouched: the only simulation-side change is three extra *optional* fields (`need`, `have`, `word`) on the rejected `CommandResult`, which is a return value, not part of `SimState`, and so never enters `JSON.stringify(state)`, the save envelope or the checksum. `tests/simulation/fork.test.ts` still asserts `schemaVersion 1` and `checksum(...) === "eede3c4f"` and passes.

## 3. Entry byte ledger

| chunk | base `c2842e1` | this candidate | delta |
|---|---|---|---|
| entry | `index-Br0Eyz3s.js` 230,583 B | `index-CJfGk59d.js` **231,520 B** | **+937 B** |
| css | `index-DpiCrzhv.css` 7,403 B | same | 0 |
| tables | `tables-BB2NPvQ2.js` 9,298 B | same | 0 |
| worker | `catchup.worker-G_Jyr7uh.js` 13,406 B | same | 0 |

231,520 ≤ 233,000 → **1,480 B headroom left**. Paid for by four new string keys (`hud.drones`, `hud.pips`, `reject.shortfall`, `phase.ghost`), two short helpers in `text.ts`, three in `commands.ts`; `tut.buildSorter`/`tut.buildFurnace` were dropped and their two uses folded onto the existing `btn.buildNamed` key, which gave back ~48 B.

## 4. Chromium receipts (`C:\Users\ryans\AppData\Local\Temp\opencode\`)

Session: chromium (playwright-core, `C:\Program Files\Google\Chrome\Application\chrome.exe`), 390×844, dpr 2, `hasTouch`, fresh storage, 250 ms between taps on `.dock__btn--primary`, served from this worktree's `dist/`.

- `play001-chromium.mjs` → `play001-g1-chromium.json` (60-tap window + 200-tap tail). At **tap 20** the literal strings are:
  - chips `Scrap0`, `Credits0`, `Store0/900`
  - `.objective` = `Your drone now works for you.Open Build and place the sorter on a lit cell.Drones 1 · Power 8 · 0 requested · 100 %`
  - primary = `Build Scrap sorter20 scrap`, toast = `Need 20 scrap · have 0`
  - `scrollHeight` **844** = `innerHeight` **844**; every button ≥ **44 px** tall (44 on the icon cluster, 46 on the dock) → `minTapHeight` **44**
  - **primary-label distinct strings over 60 taps: 1 per committed goal**, 3 label mutations in the whole 60-tap window (control: 45). The 3 mutations are the three real goal changes (`Salvage` → `Repair drone 30 scrap` → `Build Scrap sorter 20 scrap`).
- `play001-twomachines.mjs` → `play001-g1-twomachines.json` (900 taps). First two-machine frame at **tap 232**: `Batch pips · Scrap sorter 2/5 · Furnace 0/5`, min button 44, `scrollHeight` 844 = `innerHeight` 844. Last frame (8 machines): `Batch pips · Scrap sorter 2/5 · Furnace 2/5 · Polymer recycler 0/5 +3` and `Drones 1 · Power 8 · 7 requested · 100 %`. Across 900 taps and 21 committed goals, **20 goals carry exactly 1 distinct primary label**; the one exception is the tutorial stage `Refine metal into trade goods · build a furnace`, whose single authored card line covers three *different* ladder steps (`Build Furnace 10 scrap + 5 ferrous` → `Connect sorter to furnace` → `Salvage`) — a step advance, not the old build/place alternation. `pageerror`: none in either run.
- `play001-shots.mjs` → `play001-g1-tap20.png`, `play001-g1-tap200.png`, `play001-g1-chrome-rows.json`. Inspected: both frames are the live yard (pad, machines with level pips and a cyan batch row, the drone mid-leg, the outlined wreck), not blank and not an empty card. Measured chrome boxes: top cluster `y=8 h=48`, objective card `y=62 h=89`, dock `y=790 h=46` — the resting block is ~197 px of 844 (**23.3 %**), and the card costs one row (≈17 px, `.status-line` = 0.78rem + 4 px lead) more per extra line than the control's two lines.
- `play001-card.mjs` prints the card next to the state at taps 16-24, which is where the phase flip is visible: tap 21 `…Open Build and place the sorter on a lit cell.Drones 1 · Power 8 · 0 requested · 100 %` with primary `Build Scrap sorter20 scrap`; tap 22 the same primary and the same power line with `Ghost on cell 8 · tap again to place` in the hint slot.

## 5. The five items, as implemented

1. **Numeric shortfall** — `src/game/simulation/commands.ts` returns `{ ok: false, reason: "insufficient", need, have, word }` from three helpers (`shortOf` / `shortCost` / `shortCredits`) at all eight insufficient sites, so the numbers come from the same table the button's price is printed from. `src/ui/App.tsx` `labelForReject` renders `reject.shortfall` = `Need {need} {word} · have {have}`; other reject reasons keep their existing one-liners. `spendFromStore` pre-checks every stack, so a failed price leaves the store untouched and `have` is truthful. A multi-resource price names the first stack it cannot cover (`20 scrap + 5 ferrous` with 2 ferrous → `Need 5 ferrous · have 2`). **There is no power-blocked command reject**: `CommandReject` has 15 codes and none is power (`powerLimited` is a machine *status*, and throttling changes rates, not the answer), so there was no second path to number.
2. **Resting power line + drone count** — `src/ui/App.tsx` now passes `power={restingLine(state)}` with no length gate; `restingLine` (in `src/ui/text.ts`) is `Drones {n} · Power 8 · {requested} requested · {percent} %`. The `progress > 0` per-machine sum inside `powerLine` is unchanged (it is the right definition of "requested"); what stopped gating the line is the card. `n` is the flying fleet: the starter once repaired plus every spare, i.e. `0` before the repair and `1` after, matching `fleetUnits` semantics.
3. **One label per committed choice** — both the tutorial's build steps and `primaryFor` already say `btn.buildNamed`; the build-mode row in `src/ui/Hud.tsx` now prints that same key plus the same `costSummary`, so entering/leaving build mode no longer changes the button's face. The phase detail is `phase.ghost` in the `.status-line` slot (`Ghost on cell 8 · tap again to place`). `btn.place` stays in the table (the i18n and content-validator cases read it directly).
4. **Pip legend** — `pipLine(state)` renders `hud.pips` = `{what} pips · {detail}` with `what` = the existing `row.batch` name and one `{label} {lit}/5` per machine, using the *renderer's own* quantisation (`max(1, ceil(ratio×5))` over `progress/batchMilli`), so `4/5` is four lit marks and matches the panel's `Batch` percent. Three machines named, then `+n`. The line is empty (so absent) while no machine exists.
5. **Credits at 0** — `ResourceStrip` renders the chip unconditionally and the chip budget is a constant `hudChipLimit() - 2`; at 0 credits the row now has exactly the budgeted four chips instead of the previous five, which is what spec 5.4 asks for anyway.

## 6. Tests

New file `tests/ui/resting-screen.test.tsx` (6 cases, jsdom):

1. `P-1 the blocked toast names the shortfall in numbers` — toast is exactly `Need 20 scrap · have 0`, no machine charged, scrap still 0; the same tap pair also proves the ghost phase line appears.
2. `P-1 a credit shortfall names the price and the purse` — `labelForReject` on a real `drone.add` rejection at 4 credits → `Need 45 credits · have 4`.
3. `P-2 the resting screen states power and drones with zero machines` — `Power 8 · 0 requested · 100 %` and `Drones 0` on the first rendered frame, `Drones 1` after the repair, still 0 machines.
4. `P-3 the primary label is unchanged across the build and place flip` — 6 primary taps → `labels.size === 1` (`Build Scrap sorter 20 scrap`), `goals.size === 1`; the secondary line is where the 2-state flip lives.
5. `P-4 the pip legend names the counted quantity per machine` — one machine → `Batch pips · Scrap sorter n/5`; two machines → `… · Furnace n/5`; the denominator is 5, never a buffer capacity.
6. `P-5 the credits chip stays at zero` — a chip whose text is exactly `Credits0` while `state.credits === 0`.

Existing assertions adjusted (not weakened): the two buttons the old tests probed by name (`tests/ui/app.test.tsx`, `tests/ui/fork-ui.test.tsx` boot use `Build Scrap sorter` / `Build Furnace`, and the Escape case now probes the build row by its `Cancel` target, which is the mode marker); the blocked-toast expectation in `tests/ui/app.test.tsx` is the numeric line; `tests/simulation/research.test.ts` now expects `need 4 / have 3 / word "data"` on the insufficient result; `tests/ui/i18n.test.tsx` gained `hud` and `phase` in its raw-key prefix list so a leaked key in the new lines is still caught.

## 7. What is not proved

- No human playtest; the "persona" numbers quoted above are this developer's own chromium measurement, same viewport and cadence as the ticket's control.
- The control's card height was not re-measured side by side; the ~17 px per added row is derived from `.status-line` (0.78rem, 4 px lead) plus the measured card box (89 px for 4 rows). The no-scroll and 44 px floor are measured on this candidate, not inferred.
- The dock's amber pip row (store fullness) is still unnamed in the legend line; its numbers are on the adjacent `Store 19/900` chip, which is why the legend only names the machine rows.
- The wreck's 3-pip remaining band and the 3 level marks are also unnamed; a legend for those two would cost a third row on a screen that now carries four.
- Pip values are per-tick instantaneous (`progress/batchMilli`), so the printed `n/5` animates on the same cadence as the canvas; no rounding stage was added.

## 8. Save and rollback impact

`schemaVersion` 1, `SCHEMA_VERSION` untouched, `docs/evidence/yard-mature.json` untouched and still re-encoding byte-for-byte to `eede3c4f` (asserted by the existing fork case). No field was added to `SimState`, so old saves load unchanged and new saves are byte-identical to the base build's for the same tick. Rollback = revert the single commit; no migration, no persisted-shape change, no asset-name dependency beyond the normal entry-hash reference in `dist/index.html`.
