# UI-RESET/NAV (#47) - instrumented press budget

- Issue: https://github.com/darkmatter2222/Rustwake/issues/47 | Follow-up: https://github.com/darkmatter2222/Rustwake/issues/81 | Goal: https://github.com/darkmatter2222/Rustwake/issues/43 | Branch `rw/81-nav-parity-g1` | Role: ui-ux
- One **press** = one painted face activated once, or one key. Counted, not hand-traced. The prototype enforces this (#81 rework): `tap()` ignores absent, disabled and locked faces, so they are never counted and run no handler. Three committed receipts carry the numbers, each produced by an instrumented harness:
  - shipped shell spec path: `capture-nav-47.mjs` -> `captures/captures-nav.json`, field `presses` (plus `settleWaits`/`settleMs` for auto-settle);
  - dedicated press-budget run, app and model: `tap-budget-47.mjs` -> `tap-budget.json` and `captures/captures-tbudget.json`;
  - specified design path: `capture-proto-47.mjs` -> `captures/captures-proto.json`, field `pressed` (the prototype's own counter `S.pressed`).
- **Auto-settle is not a press.** While the shipped primary reads `waits`, the harness lets the sim run in 500 ms frame steps and counts those separately (`settleWaits`, `settleMs`). Canvas selection probes are recorded as inspector tries, not presses.
- Reference budget, measured in #45: **16 presses to one machine with 0 batches done, 0.00 batches/s, sim tick 51** (`work/evidence/UI-RESET-45/journey-map.md` J1).
- headSha: every receipt is stamped to the captures commit by `stamp-headsha-47.mjs`; the final PR head is the metadata-only stamp commit, so `headSha = head^`. See `README.md`.

## 1. Shipped shell spec path - source `captures/captures-nav.json` (capture-nav-47.mjs), phone 390x844, fresh save

Session A summary in the receipt: **39 presses + 34 auto-settle waits (17000 ms)**. The inspector opened on the second canvas-grid try (`inspectorFirstTry: null`).

| milestone | presses | painted frame | what the save says at that press (receipt `sim`) |
|---|---|---|---|
| gate cleared | 1 | `01-nav-phone-rest-step0` | no save yet, dock reads Store / Salvage / Build |
| salvage counted, repair face in the primary slot | 12 | `02-nav-phone-salvage-counted` | tick 43, tutorial 1, scrap 30, machines 0 |
| drone repaired | 13 | `03-nav-phone-repaired` | tick 200, tutorial 4, scrap 10 |
| build phase, ghost up | 14 | `04-nav-phone-build-ghost` | tick 200, tutorial 4, Cancel / Build Scrap sorter / Next |
| first machine placed | 18 | `08-nav-phone-furnace-placed` | tick 260, tutorial 4, **machines 1**, scrap 0 |
| machine inspected | 22 | `09-nav-phone-two-machines` | tick 280, tutorial 5, inspector painted, 20 px canvas grid still needed |
| store rows open | 35 | `12-nav-phone-store-rows` | tick 340, tutorial 6, credits 0 |
| save record read | 36 | `13-nav-phone-record-copy` | tick 340, `Yard` face absent, `reachable=false` |
| import error state | 37 | `17-nav-phone-import-failure` | tick 350, reason line, title still Yard record |
| text scale one step | 38 | `14-nav-phone-text-scale-2` | tick 360, cluster reads A 1.25 |
| whole path end | 39 | `15-nav-phone-muted` | tick 364, machines 1, credits 0, scrap 6, **batches 0** |

The 18 / 22 / 35 / 39 figures above are the `presses` field of frames `08`, `09`, `12`, `15` in `captures/captures-nav.json`. Two extra instrumented loops on the mature seed: rest to a sell face **2 presses** (`16-nav-phone-store-full`, session B), and the destination tour Store, Yard, Build with a Close each **5 presses for 3 destinations**, with the Research face never painted because the build phase replaces the row (`25-nav-phone-mature-research`, session C `Research=false`).

## 2. Dedicated press-budget run - source `tap-budget.json` (tap-budget-47.mjs)

This harness serves `dist/` itself on 127.0.0.1:4175 and drives the prototype over file://. It embeds the session A decomposition from `captures/captures-nav.json` (`decomposition` field). Its four frames are receipted in `captures/captures-tbudget.json`.

App path (`app`), fresh save, Begin -> Store round trip -> ladder to the first placed machine:

| measure | value | receipt field |
|---|---|---|
| presses to first placed machine | 12 | `app.machinePress` |
| total presses (incl. production hunt) | 28 | `app.presses` / `app.pressProduction` |
| auto-settle waits / ms | 40 / 20000 | `app.settleWaits` / `app.settleMs` |
| canvas selection probes | 107 | `app.probes` |
| Actual rate at first machine | 0.00 batches/s · 9s window | `app.rateAtFirstMachine` |
| production reading | 0.00 batches/s · 9s window | `app.productionReading` |
| sim tick at production reading | 480 | `app.tick` |

Honest finding: the first machine is placed but **does not produce** inside this run - the Scrap sorter needs 2 scrap input that nothing in the yard supplies yet, so the rate stays 0.00 even though the sim ran to tick 480. Frames `60-tbudget-app-machine`, `61-tbudget-app-production`.

Timing note (#81 rework re-run): `settleWaits` is sim-timing dependent, not scripted - the committed run measured 41 waits (20500 ms), this re-run measured 40 (20000 ms); the presses (28 / 12), probes (107) and tick (480) reproduced exactly. The receipt carries the re-run's actual values.

Model path (`prototype`), the prototype's own counter:

| measure | value | receipt field |
|---|---|---|
| fresh ladder presses to the disabled primary | 13 | `prototype.freshPressed` |
| press that places the machine | 12 | `prototype.machinePress` |
| Actual rate (machine inspector from the Yard list) | 0.00 batches/s · 60s window | `prototype.productionReading` |
| mature rest -> Store rows | 1 | `prototype.storePress` |

The model rate is 0.00 **by construction**: `prototype-nav.html` is a static painted model with no sim tick (`prototype.modelNote`), so `productionAtPress` is null. This is a model limit, not a measurement failure. Frames `62-tbudget-proto-machine`, `63-tbudget-proto-store`.

## 3. Specified design path - source `captures/captures-proto.json` (capture-proto-47.mjs), prototype own counter

| frame | pressed | painted frame | last log id |
|---|---|---|---|
| gate (seed=gate, nav not painted) | 0 | `30-proto-phone-gate` | - |
| rest at step 0, five slots | 1 | `31-proto-phone-rest-step0` | gate-begin |
| salvage counted | 7 | `32-proto-phone-salvage` | action-primary |
| repaired at 30 scrap, primary back to Salvage | 8 | `33-proto-phone-repaired` | action-primary |
| Build destination open | 13 | `34-proto-phone-build-catalog` | nav-build |
| blueprint chosen | 14 | `35-proto-phone-build-chosen` | bp-sorter |
| one machine placed | 15 | `36-proto-phone-placed` | action-primary |
| **machine inspected from the Yard list** | **16** | `37-proto-phone-machine` | row-machine-1 |
| Store with the one command format | 17 | `38-proto-phone-store` | nav-store |
| Menu import error | 20 | `39-proto-phone-import-error` | imp-apply |
| two Escape presses back to rest | 22 | `40-proto-phone-back` | key-Escape |

Presses 9-12 have no frame: they are the four Salvage presses between frames 33 and 34 that refill the 20-scrap place price the repair consumed (#81 rework - before it, Place was pressed at 0 scrap while disabled, and frames 36/37 painted no machine). The count jumps 8 -> 13 at the Build frame. Every press in the ladder is now an enabled painted face: Place reads `disabled:false` at press 15, frame 36 paints `machines 1` with the Yard row `Scrap sorter · cell 8`, and frame 37's inspector reads `Scrap sorter · level 1` with the fork faces painted disabled at 0 credits.

## 4. Reading

- To an inspected machine: **16 presses in the design (`37-proto-phone-machine`), 22 in the shipped shell (`09-nav-phone-two-machines`), 16 in the #45 budget**. The design ties the audit budget and beats the shipped shell by 6. The dedicated model run places at **12** (`tap-budget.json` `prototype.machinePress = 12`) because it presses only the primary band, whose `Build Scrap sorter` step places directly; the design's Build-destination route spends 3 more presses painting the catalog and the chosen blueprint (nav-build, bp-sorter, Place) and 1 more inspecting from the Yard list - 12 + 3 + 1 = 16, measured, not estimated. The section 6 target of 13 is the primary-band place (12) plus one Yard-list press; the painted Build-destination route sits 3 above that target and the gap is the catalog detour, recorded not hidden.
- Whole path including the settings faces and the save record: **22 presses in the design (`40-proto-phone-back`) against 39 in the shipped shell (`15-nav-phone-muted`)**, and the shipped shell does not reach the upgrade fork inside 39 (`11-nav-phone-fork` still prints a build face).
- The three rules that pay are the ones in `navigation-spec.md`: a destination row that never changes slots (section 1), a Yard list whose machine faces are real buttons (E4, section 5) and one sheet replaced by the next instead of an open plus a Close pair (E3).

## 5. Measured layout caveats - source `measures.json` (measures-from-captures.mjs)

- **Tap target:** one painted face is under 44 px on 17 of 19 prototype frames - `tgl-scale`, the text-scale toggle, **39 px wide** (44 px tall). The two 360x640 frames after a scale step (`41`, `42`) measure 0 under-44 because the toggle widens at that scale. `measures.json` `summary.facesUnder44 = 17`.
- **Clip:** `summary.clipOK = 17` of 19. The status cluster stays inside the viewport on every band (phone right edge 382 of 390). The two failures are the 360x640 scaled frames `41`/`42`: **10 px horizontal document overflow** (scrollWidth 370 > clientWidth 360), not a cluster clip. Scaling up fixes the tap target but overflows the document - a real trade-off, recorded not hidden.
- Band overlaps: `summary.overlaps = 0`.

## 6. Not verified

No real-device run, no screen-reader pass, no audio listening test. Headless Chromium only. The prototype is a browser-painted model of the specified shell, not the shipped renderer: the world canvas inside it is a flat field, so world ink positions inside the prototype frames are indicative only, while every chrome band is measured from the same painted DOM (`captures/captures-proto.json`, `rects`).
