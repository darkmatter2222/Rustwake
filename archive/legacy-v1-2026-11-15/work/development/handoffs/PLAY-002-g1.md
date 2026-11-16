# PLAY-002 generation 1 — developer handoff (candidate)

Role: developer. Task: PLAY-002 g1, three small related UI changes (armed `buffer` drop, TST-001 shortfall on the resting line, CHRM-001 legend collapse).
Base `d836a7a1dc416c58baba369906e512550c698d25` (branch `strat002-g3`, which carries `8a06e9d` + the g2/g3 harness work). Worktree `C:\Users\ryans\.local\share\opencode\worktree\fe4e05\play001-dev`, branch `play002-g1`, one commit, not pushed. Candidate SHA = that commit (`git log -1` in that worktree).
Inputs read: `work/product/STRAT-002-decision-g2.md` (incl. `## g2 addendum`), `work/review/PLAY-001-g1-qa.md` (rows D-2, D-3, D-4), `work/development/handoffs/STRAT-002-g3.md` (the `autoExec` block).
Evidence types: automated gates (real exit codes), jsdom DOM assertions, chromium measurement of the built artifact from this worktree, source inspection. No human playtest; no audio claim.

## 1. What the player sees differently (before → after, literal strings)

Measured on the built artifact, 250 ms primary taps, fresh storage. "before" = `d836a7a` as quoted in `work/review/PLAY-001-g1-qa.md` §3/§7 and `PLAY-001-g1.md` §1.

| surface | before | after (this candidate, measured) |
| --- | --- | --- |
| dock at the fork (360×640 ts 2.0) | `Faster batches 30 credits` \| `More input 30 credits` \| `Less power 30 credits` — three 46 px buttons | `Faster batches 30 credits` \| `Less power 30 credits` — **two** 46 px buttons, one price each |
| second `.status-line` (fleet + power) at rest | `Drones 1 · Power 8 · 0 requested · 100 %` | `Drones 1 · Power 8 · 1 requested · 100 % · Last need 5 ferrous · have 4` |
| same line, jsdom at the 2-machine frame | `Drones 1 · Power 8 · 1 requested · 100 %` | `Drones 1 · Power 8 · 1 requested · 100 % · Last need 25 scrap · have 0` (the copper separator's price, still painted 2.2 s after the toast is gone) |
| toast (unchanged, 1.8 s) | `Need 20 scrap · have 0` | `Need 20 scrap · have 0` — one source: `reject.shortfall` fills `{detail}` of `hud.lastShortfall`, only the first letter goes lowercase |
| pip legend, 2 machines | `Batch pips · Scrap sorter 2/5 · Furnace 2/5` | `Batch pips · Scrap sorter #8 5/5 · Furnace #9 0/5` |
| pip legend, 4 machines | `… 3 entries + 1 tail` (`Scrap sorter 2/5 · Furnace 2/5 · Polymer recycler 0/5 +3` at 8 machines) | `Batch pips · Scrap sorter #8 5/5 · Furnace #9 0/5 +2` — **two** entries, each with its tile, then `+n` |
| objective card, 360×640 ts 2.0, 2 machines | 316.4 px = 49.4 % of the 640 px `.hud` content box | **264.6 px = 41.3 %** |

Nothing else moved: `schemaVersion` stays `1`, the ladder checksum stays `eede3c4f`, no new currency/machine/panel/screen, no audio work. Files touched: `src/ui/text.ts`, `src/ui/App.tsx`, `src/game/content/strings.ts`, `src/ui/styles.css`, `tests/ui/fork-ui.test.tsx`, `tests/ui/resting-screen.test.tsx`, `tests/simulation/fork.test.ts`, this file.

## 2. The three items, as implemented

1. **The armed drop executes.** `branchOptions()` (`src/ui/text.ts`) returns `speed` then `draw`; `btn.branchBuffer` is gone from `STRINGS`. The `upgradeRanks` decoder in `src/game/simulation/types.ts` is untouched, as is the validator in `src/game/persistence/save.ts` (its own literal list still accepts `"buffer"`), so a save written while the name was on the dock keeps its paid ranks. The reason is the g3 run: `inputStallPct` 186.9 (`irregular`) / 181.5 (`gap6`) for `buffer` against 115.5 / 123.3 for the leaders — it leads neither ladder, so the drop clause in the addendum is not a proposal, it is an executed fact, and the dock now matches it.
2. **TST-001 (QA D-3).** `App` keeps the last rejected command in one state slot (`lastReject`) and `restingLine(state, lastReject)` appends `t("hud.lastShortfall", { detail })` to the existing power/fleet `.status-line`. `detail` is the *same string* `labelForReject` handed the toast — computed once per reject — so the two surfaces cannot state different numbers and there is no second table. Measured at the 2-machine frame, 2.2 s after the blocked tap: `.toast` is `null` and the line still reads `… · Last need 5 ferrous · have 4`, no panel open (`panelOpen: false`). Cost: **one** added line box at 360×640 ts 2.0 (that `.status-line` goes 51.8 px → 77.7 px, i.e. 2 wrapped boxes → 3), and the `.status-line` count stays 3 before and after the reject (asserted in the jsdom case).
3. **CHRM-001 (QA D-2/D-4).** `pipLine` now slices the first **two** machines and prints `${label} #${tile} ${lit}/5`, joined by the existing `value.dotSeparator`, then `+${rest}`. Duplicate blueprints are separable (`Scrap sorter #8 5/5 · Scrap sorter #9 0/5`), and the `#n` is the same cell number the build phase prints in `Ghost on cell {tile}`. At 4 machines the tail is `+2`, so nothing is silently dropped.
4. **The band, which the three changes alone could not reach.** With items 1-3 in and no CSS change the card measured **316.4 px = 49.4 %** at 360×640 ts 2.0 (its parts: primary line 2 boxes × 35.64, hint 2, power 3, pips 2, each `.status-line` box 31.59 px, plus 3 × 4 px lead-ins). One rule takes it inside the cap: `.text-large .status-line { font-size: 0.72rem; line-height: 1.2; margin-top: 0 }`, which makes those boxes 25.92 px → card **264.6 px = 41.3 %**, and restores `scrollHeight == clientHeight` on all three lines (at `line-height: 1.15` they were 1-2 px over). 0.72rem is the size `.dock__cost` and `.panel__field` already use, and the font size itself is unchanged at scale 1 (16.4 % / 12.4 %).

## 3. The four-combo table (chromium, `C:\Program Files\Google\Chrome\Application\chrome.exe`, headless, dpr 2, `isMobile`/`hasTouch`, this worktree's `dist/` served on `127.0.0.1:8433`, fresh storage per context, 250 ms primary taps, 2 machines at the measured frame)

| combo | `.hud` content-box h | card h → ratio | `.objective` bottom → `.dock` top | `coversYard` (ink denominator) | `coversYard` (world denominator) | smallest dock tap | scrollH / innerH | chip rows, clip (`.status-line` ovX/ovY) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 360×640 ts 1 | 640 | 105 px → **16.4 %** | 419 px | **13.3 %** (16 805.4 / 126 560) | 8.5 % (10 204.4 / 119 456) | **46 px** | 640 / 640 | 2 rows, 0/0 · 0/0 · 0/0 |
| 360×640 ts 2.0 | 640 | 264.6 px → **41.3 %** | 210.5 px | **63.2 %** (79 939.2 / 126 560) | 61.4 % (73 338.2 / 119 456) | **46 px** | 640 / 640 | 3 rows, 0/0 · 0/0 · 0/0 |
| 390×844 ts 1 | 844 | 105 px → **12.4 %** | 623 px | **0 %** (0 / 148 302) | 0 % (0 / 140 205.5) | **46 px** | 844 / 844 | 2 rows, 0/0 · 0/0 · 0/0 |
| 390×844 ts 2.0 | 844 | 264.6 px → **31.4 %** | 414.5 px | **39.7 %** (58 873.1 / 148 302) | 36.5 % (51 178.6 / 140 205.5) | **46 px** | 844 / 844 | 3 rows, 0/0 · 0/0 · 0/0 |

Denominators, stated so they are unambiguous (`scene.ts` has no `computeLayout`; the drawn yard is the world rect `WORLD_W × WORLD_H = 192 × 224` under the camera the app fitted, and the ink census is the union of the non-`night` pixels of the canvas — the two agree to ~1 px and the second is the canonical series' method):

| frame | ink yard rect | world yard rect (camera scale) | card rect |
| --- | --- | --- | --- |
| 360×640 (both scales) | `[20, 111.5, 320, 395.5]` | `[20, 133.3, 320, 373.3]` (`s = 1.6667`) | ts1 `[10, 62, 312.8, 105]`, ts2 `[10, 110.9, 312.8, 264.6]` |
| 390×844 (both scales) | `[21.5, 196.5, 346.5, 428]` | `[21.7, 219.8, 346.7, 404.4]` (`s = 1.8056`) | ts1 `[10, 62, 340.4, 105]`, ts2 `[10, 110.9, 340.4, 264.6]` |

`coversYard` = `intersect(card, yard) / area(yard)`, the two rows above give numerator and denominator for every cell. The `.hud__top` row and the `.dock` cover **0 %** of the yard in all four cells (both end outside the ink band), so the card is the only covering box at rest.

**Against the persona references.** Card ratio ≤ 42 % — **met in all four cells** (16.4 / 41.3 / 12.4 / 31.4). Min tap 44 — met, 46 px everywhere, on the resting dock *and* on the two-button fork row. No scroll — met (`scrollHeight == innerHeight`, `scrollWidth == innerWidth`). `coversYard` inside 45 ± 2 — **not reproduced as a set**: only 390×844 ts 2.0 is near it (39.7 %), 360×640 ts 2.0 is 63.2 % and both ts-1 cells are 13.3 % / 0 %. Cause, named by element and line count: the band's canonical numbers come from the *panel-open* census (`rev-comp-g1.md` D-6/E-4, panel `[10,442.25,370,347.75]`), while the resting frame has no panel, so the only covering box is the card, whose height is 105 px at ts 1 (above the yard's top edge → 0 %) and 264.6 px at ts 2.0. The 360-column is the tight one: at ts 2.0 the card's bottom is 375.5 and the ink band starts at 111.5.

**The fork frame (one tap deeper, 4 machines, 360×640 ts 2.0), printed because it is the frame the drop changes:** the row is exactly two buttons — `Faster batches` + `30 credits` at `x 10, w 182.7, h 46` and `Less power` + `30 credits` at `x 194.7, w 155.3, h 46`, minimum dimension **46 px**; the card there is 300.3 px = 46.9 % (390×844: 35.6 %) and the cause is the card's **primary** line: `Choose what improves on the Scrap sorter · 30 credits` is 3 wrapped boxes (106.3 px of 35.64), while the three `.status-line`s are 2 + 3 + 2 boxes of 25.92. One tap on the first button records `branch: ["speed"]` with `level 2` and 30 credits spent. At the same 4-machine depth the legend reads `Batch pips · Scrap sorter #8 5/5 · Furnace #9 0/5 +2` — the cap holds, `+2` names the two machines the line does not print.

## 4. Gates (this candidate, real exit codes)

| gate | command | exit | reading |
| --- | --- | --- | --- |
| typecheck | `npm run typecheck` | **0** | no output |
| unit/integration | `npm test` | **0** | **275 passed / 27 files** = 272 (base `d836a7a`) **+3**, no existing case lost |
| content + behaviour | `npm run validate` | **0** | behaviour line verbatim: `firstDrone=268 firstResearch=478 tick=18298 machines=8 links=18 drones=5 batches=1902 credits=82 nodes=3 \| 0 violation(s)`; `content: 0 violation(s)`; `tables: 15 resources, 8 blueprints, 12 recipes, 3 research nodes` |
| build | `npm run build` | **0** | entry below |

Ladder fixture receipts come from the passing suite: `schemaVersion 1` and `checksum(...) === "eede3c4f"` are asserted by `tests/simulation/fork.test.ts` (the pre-fork case and the new decode case both pass), and `validateSim` returns `null` on the decoded state.

**New test cases (3):**

1. `tests/simulation/fork.test.ts` → `still loads and decodes a save written while the dock named three branches` — the §6 proof.
2. `tests/ui/resting-screen.test.tsx` → `TST-001 the shortfall outlives the toast window as a trailing segment` — at 2 machines: the toast matches `/^Need \d+ \w+ · have \d+$/`, the same sentence appears as `Last …` inside a `.status-line`, the `.status-line` count is identical before and after, and after `vi.advanceTimersByTime(2200)` the `.toast` is `null` while the carried line is exactly `Drones 1 · Power 8 · 1 requested · 100 % · Last need 25 scrap · have 0` and contains every digit group of the toast.
3. `tests/ui/resting-screen.test.tsx` → `CHRM-001 the pip legend caps at two tile-indexed entries plus a +n tail` — 4 machines → exactly two `… #n x/5` entries, the two sorters distinguished by `#8` / `#9`, tail `+2`, exactly two `n/5` occurrences, no third machine named.

Existing assertions tightened, not weakened: `tests/ui/fork-ui.test.tsx` now asserts `branchOptions(...) → ["speed","draw"]` **and** the painted order (`^Faster batches30 credits$` then `^Less power30 credits$`, `labels.length === 2`, no `More input`), and taps `Less power` to assert `branch: ["draw"]`; `tests/ui/resting-screen.test.tsx` P-4 now requires the `#tile` inside each entry and cross-checks it against `machines[i].tile`.

## 5. Entry byte ledger

| chunk | base `d836a7a` | this candidate | delta |
| --- | --- | --- | --- |
| entry | `index-CJfGk59d.js` 231,520 B | `index-Bi7lF9Yv.js` **231,706 B** | **+186 B** |
| css | `index-DpiCrzhv.css` 7,403 B | `index-mmTSZ7Fz.css` 7,474 B | +71 B |
| tables | `tables-BB2NPvQ2.js` 9,298 B | same | 0 |
| worker | `catchup.worker-G_Jyr7uh.js` 13,406 B | same | 0 |

231,706 ≤ 233,000 → **1,294 B headroom** left. The entry pays for two string keys (`hud.lastShortfall` in, `btn.branchBuffer` out) and three short helpers; the CSS is a separate chunk and the 42 % band is bought there, not in the entry.

## 6. Save compatibility (the drop is decode-compatible)

`tests/simulation/fork.test.ts`, case `still loads and decodes a save written while the dock named three branches`: a furnace paid to level 3 with `["speed","buffer"]`, written with `encodeSave`, then

* the written text contains `"branch":["speed","buffer"]` (the dropped name really is in the file);
* `decodeSave(text).ok === true`, `loaded.branch === ["speed","buffer"]`, `loaded.level` equals the pre-write level;
* `upgradeRanks(loaded) === { speed: 1, buffer: 1, draw: 0 }` — the decoder still counts the dropped name;
* `inputCapacityOf(loaded, 0) === BLUEPRINTS.furnace.inputBuffer + 6` — the rank still moves the mechanism, so the level the player paid for is not lost;
* `validateSim(decoded.payload.sim) === null` and `encodeSave(...)` reproduces the original text byte-for-byte (no migration touched the record);
* the dock that answers that save is the shipped two-plan dock: `branchOptions(...).map(o => o.id) === ["speed","draw"]`.

The pre-fork fixture case is unchanged and still passing (`checksum eede3c4f`, `schemaVersion 1`, byte-identical re-encode, `branch === undefined` on all eight machines). The seed ladder carries no branch keys, so the checksum cannot move, and it did not.

## 7. What is not proved

* No human playtest; every number above is this developer's own chromium measurement, same viewport/cadence as the ticket's control. Enjoyment and retention not inferred; audio not listened to.
* The `coversYard` 45 ± 2 band was not reproduced (see §3: the canonical cells are the panel-open census). The card-ratio cap, the 44 px floor and the no-scroll gate are all reproduced on this candidate.
* `hudContentBox.height` is read as `document.querySelector(".hud").clientHeight` (640 / 844), which is what the recorded percentages divide by.
* The four combos were measured at the first frame with `machines === 2` (234-275 primary taps, per-combo contexts, so no session is shared); the fork-frame numbers (§3, last paragraph) are a 4-machine frame and are labelled as such. `pageerror`: 0 in all chromium sessions (4 + 2 + 1 runs).
* The trailing segment lives only for the session (component state, never written to the save), and is replaced — not appended — by the next rejected command; it is not cleared by a successful tap, which is why the line is prefixed `Last`.
* The card at 4-machine depth with the fork open is 46.9 % at 360×640 ts 2.0 (cause named in §3: the primary objective line's 3 boxes). The ticket's cap is stated at 2-machine depth, where all four cells are inside it.

## 8. Rollback / save impact

`schemaVersion` 1 untouched, no field added to `SimState` (`lastReject` is component state; the three result fields `need`/`have`/`word` were already return values, never state), so old saves load unchanged and new saves stay byte-identical to the base build for the same tick; checksum `eede3c4f` reproduced in the passing suite. Rollback = revert the single commit: the dock returns three names, the shortfall returns to the toast only, the legend returns three entries. No migration, no persisted-shape change, no asset-name dependency beyond the normal entry/css hash reference in `dist/index.html`.

Receipts (scratch, outside the repo): `C:\Users\ryans\AppData\Local\Temp\opencode\play002-g1-chromium.json` (four combos, rest + idle-after-2.2 s), `play002-g1-fork.json` (the two-button row, both ts-2 cells), `play002-g1-fork-anatomy.json` (per-element boxes at the fork frame), scripts `play002-chromium.mjs`, `play002-fork.mjs`, `play002-fork-anatomy.mjs`, `play002-cover.mjs`.
