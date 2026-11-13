# UI-RESET #65 — Criterion 5: empty / loading / locked / error / reader-tab audit matrix

**Role:** developer | dev-65. **Issue:** https://github.com/darkmatter2222/Rustwake/issues/65
**Head SHA under audit:** `e7c746efd396cc293d736feb88118b65ff875994` (branch `rw/65-feedback`, base `db017227`).

This is an **audit deliverable + targeted unification**, not a rewrite. Every cell below
was read from the shipped source at the head SHA above (file:line cited). The five state
columns are the ones the acceptance names. "OK" = the state is handled coherently by the
existing mature surface; the #65 contribution is the **shared feedback layer** (c1 press
washes, c2 grouped toast, c3 reduced-motion-to-CSS) that now sits over every one of these
surfaces uniformly, plus this matrix. No component was rebuilt; no gameplay was expanded.

## Cross-cutting state architecture (why most cells are already coherent)

The codebase centralises the five states so individual panels rarely need bespoke handling:

- **reader-tab (another tab owns the writer lease):** one gate in `App.tsx:1037-1049`.
  `role === "reader"` swaps the dock primary to `Take over`; a failed `store.takeOver()`
  plays the `blocked` cue and raises the grouped `reader.stuck` toast (`App.tsx:1043-1046`).
  The objective card reads `reader.objective` / `reader.hint` (`App.tsx:1154-1157`) and
  `OnboardCoach` yields entirely (`OnboardCoach.tsx:38` `if (props.reader) return null`).
  Every panel's command face dispatches through the same store, so a reader's taps are
  refused at the single dispatch path — panels stay readable, no panel needs its own lease
  logic. This is the coherent design; #65 does not duplicate it per panel.
- **loading (long absence settled off-thread):** one `role="status"` line,
  `App.tsx:1169-1174` `store.isReconciling()` → `t("report.reconciling")`. The
  `ReturnReportPanel` never mounts before adoption (`ReturnReportPanel.tsx:18-26`), so the
  reconcile line owns the loading moment and the report is a receipt, never a spinner.
  Post-adoption the sim is synchronous; there is no per-panel async load to spinner.
- **empty:** every list surface prints an explicit empty note rather than collapsing
  (store `nothingSellable`, inspector/routes `noLinks`, logistics `noPending`/`noLaid`/
  `noMaterials`/`noBottlenecks`, research `datanote`, return `zeroHeadline`/`noneHeadline`).
  Inventory and the all-resource drawer list **zero-stock** resources rather than hiding
  them (`StorePanel.tsx:140-163`, `AllResources.tsx:23-29`).
- **locked:** disabled **with the reason printed**, never hidden — rail `After tutorial` /
  `Needs data` (`Shell.tsx:65-89`), catalog `lockLine` (`BuildCatalog.tsx:104-105`),
  research `needsPrereq` + `whyLine` (`ResearchPanel.tsx:159-198`), upgrade `maxed`
  (`UpgradeCompare.tsx:166-171`), and ack-gated destructive confirms
  (`ResetDialog.tsx:55-62`, `ImportConfirm.tsx:134-141`).
- **error / refusal:** surfaced through the **grouped toast** (`Hud.tsx:416-436`,
  `App.tsx` `notify`), the **persistent** `lastReject` "Last …" tail
  (`text.ts` `restingLine`, rendered at resting phase), per-surface shortfall/invalid notes
  (place, trade, research, logistics, upgrade), and **read-back receipts** built from the
  applied state, never optimistic guesses (`UpgradeCompare.tsx:84-104`). Destructive acts
  are gated behind an `alertdialog` + acknowledgement checkbox with Cancel auto-focused.

## Per-component matrix

Legend: **OK** = handled by existing surface (citation). **#65** = the shared feedback layer
improves this cell. **n/a** = the state does not arise for this surface (reason given).

### shell — `shell/Shell.tsx`, `shell/ResetDialog.tsx`
| state | finding |
|---|---|
| empty | n/a — navigation faces are always present; `MenuSheet` always lists its rows (`Shell.tsx:200-252`). |
| loading | n/a — nav issues no command (`Shell.tsx:31-33`); reconcile line is App-level. |
| locked | OK — rail yard `After tutorial` (tutorial<9), research `Needs data` (!showResearch), disabled + reason printed (`Shell.tsx:65-89`); Menu Yard disabled `After tutorial`, Return report disabled `No absence yet` (`Shell.tsx:207-228`). |
| error | OK — `ResetDialog` alertdialog, ack-gated confirm, Cancel auto-focus, Escape cancels (`ResetDialog.tsx:26-62`). #65 press wash on `.gate__btn`/`.objective__btn` family. |
| reader-tab | OK — rail/menu render; the single App dispatch gate refuses reader commands; Take over primary owns recovery. |

### home / gate — `Hud.tsx` `Gate`, `home/copy.ts`
| state | finding |
|---|---|
| empty | OK — fresh yard reads `HOME_COPY.freshYard` + `Begin recovery` (`Hud.tsx:66-77`); a settings-only envelope is **not** progress (`App.tsx:1067-1069`). |
| loading | n/a — gate is pre-start; no sim running yet. |
| locked | n/a — gate is the entry; New game / Settings always reachable. |
| error | OK — `New game…` opens `ResetDialog`, never resets directly (`Hud.tsx:78-82`, `App.tsx:1089`). #65 `.gate__btn:active` cyan wash. |
| reader-tab | n/a — reader role applies post-start; with progress the gate reads `Continue` + save summary `role="status"` (`Hud.tsx:62-65`). |

### hud — `Hud.tsx`, `hud/AllResources.tsx`, `hud/StorageAlert.tsx`
| state | finding |
|---|---|
| empty | OK — scrap + credits + store chips paint even at 0 (`Hud.tsx:108-136`); `AllResources` lists every resource incl zero (`AllResources.tsx:23-29`); healthy yard paints no cue chips (`Hud.tsx:137-155`). |
| loading | OK — App `.reconcile` `role="status"` line above the dock (`App.tsx:1169-1174`). |
| locked | OK — dock Yard face only after tutorial (`Hud.tsx:386-390`), Research face only `showResearch` (`Hud.tsx:398-402`); build phase is Cancel / Build {machine} / Next (`Hud.tsx:324-347`). |
| error | OK + **#65 c2** — `Toast` `role="status"` `data-count`, repeated identical readout grouped `×N` via `::after` (bare live-region text, no re-announce spam) (`Hud.tsx:416-436`); `StorageAlert` full→`role="status"` recovery, high→static (no per-tick re-announce) (`StorageAlert.tsx:27-43`); `lastReject` persists in the resting `Last …` tail; dock cost line prints the pending shortfall (`Hud.tsx:333-339`). |
| reader-tab | OK + **#65 c2** — primary `Take over`; failed takeover → `blocked` cue + grouped `reader.stuck` toast (`App.tsx:1043-1046`); objective reads reader copy. |

### build — `build/BuildCatalog.tsx`, `build/catalog.ts`
| state | finding |
|---|---|
| empty | n/a — every shipped blueprint is always listed, locked ones included (`BuildCatalog.tsx:1-8,62-118`). |
| loading | n/a — catalog is a synchronous derivation of tutorial + store. |
| locked | OK — locked cards `disabled` + `lockLine` (unlockAt), `data-locked` (`BuildCatalog.tsx:80-105`); unaffordable → `shortfallLine`, `data-affordable=false` (`BuildCatalog.tsx:106-111`); footer Place disabled unless unlocked + affordable (`BuildCatalog.tsx:46,129-136`). |
| error | OK + **#65 c1** — per-card shortfall printed; Salvage / Store one tap away while planning (`BuildCatalog.tsx:122-127`); `.blueprint:active` press wash. |
| reader-tab | OK — catalog opens read-only; arming a ghost is local UI, the commit dispatch is refused by the App reader gate. |

### place — `place/PlacePreview.tsx`, `place/flow.ts`
| state | finding |
|---|---|
| empty | n/a — strips only mount while an intent is armed (`App.tsx:1198-1218`). |
| loading | n/a — placement check is a synchronous engine mirror (`flow.ts placementCheck`). |
| locked | OK — Move confirm `disabled={!check.valid}` (`PlacePreview.tsx:135-139`); Dismantle confirm `disabled={!impact.fits}`, two-stage arm then commit (`PlacePreview.tsx:198-212`). |
| error | OK + **#65 c1/c2** — `verdictReason` bad + `shortfallLine` + `earnRecoveryHint` (`PlacePreview.tsx:64-84`); no-room → `noRoom(short)` + `recoveryHint` (`PlacePreview.tsx:193-197`); a refused Build keeps the ghost armed (preserve-on-refusal, `App.tsx:1161-1164`) and the refusal rides the grouped toast. |
| reader-tab | OK — strips are informational (`role="status"`/`group`); the commit dispatch is refused by the reader gate. |

### inspector — `panels/MachinePanel.tsx`, `inspector/ContextPanes.tsx`
| state | finding |
|---|---|
| empty | OK — transport `noLinks` note when no plans/links (`MachinePanel.tsx:282-284`); `ContextPanes` routes-empty → `noLinks`, no pane open → hint (`ContextPanes.tsx:54-68`). |
| loading | OK — production `role="progressbar"` with live `aria-valuenow` (`MachinePanel.tsx:190-198`); #65 c3 disables the `.inspector-progress__fill` width transition under reduced motion. |
| locked | OK — Connect face only when `plans.length>0` (`MachinePanel.tsx:323-340`); Upgrade / Move / Dismantle always present, each printing the engine's own charge (`MachinePanel.tsx:341-382`). |
| error | OK + **#65 c1** — starved → `needs` row (`MachinePanel.tsx:245-247`); bottleneck constraint cards `<details>` (`MachinePanel.tsx:253-258`); power-capped rate row (`MachinePanel.tsx:209-228`); diagnosis evidence/advice from the engine. |
| reader-tab | OK — inspector opens read-only; `ContextPanes` dispatch nothing and preserve selection (`ContextPanes.tsx:1-8`); command faces refused by the reader gate. |

### logistics — `logistics/LogisticsOverview.tsx`, `LogisticsLegend.tsx`, `RouteControls.tsx`
| state | finding |
|---|---|
| empty | OK — overview `noBottlenecks` (`LogisticsOverview.tsx:80-81`); legend `noMaterials` (`LogisticsLegend.tsx:42-43`); controls `noPending` / `noLaid` (`RouteControls.tsx:79-80,110-111`). |
| loading | OK — power gauge `role="progressbar"` (`LogisticsOverview.tsx:36-48`); #65 c3 disables `.logistics-gauge__fill` width transition under reduced motion. |
| locked | OK — no in-place filter-edit command exists, so the panel **says so plainly** and offers disconnect + re-lay instead of a fake disabled control (`RouteControls.tsx:13-17,216-217`). |
| error | OK + **#65 c1** — `CustomPreview`/`ConfirmPreview` invalid → `connectRejectText` (`RouteControls.tsx:237-282`); route status working/idle/blocked printed (`RouteControls.tsx:128-131`). |
| reader-tab | OK — connect/disconnect dispatch refused by the reader gate; the view bridge (focus route / toggle belt layer) is local UI and stays usable. |

### research — `panels/ResearchPanel.tsx`, `research/model.ts`
| state | finding |
|---|---|
| empty | OK — no-data → `datanote` naming the only Data source (`ResearchPanel.tsx:146-150`); all-done → `completedFocus` (`ResearchPanel.tsx:64-66`). |
| loading | n/a — research is a synchronous derivation; buy resolves immediately. |
| locked | OK — four-state badges completed/available/unlocked/locked; locked → `needsPrereq` + `whyLine`, buy `disabled={!node.canBuy}` (`ResearchPanel.tsx:159-211`); `showResearch` gate never weakened. |
| error | OK + **#65 c2** — shortfall `whyLine` with the engine's own numbers; a refusal leaves the focus where it was and the shell's grouped toast names the reason (`ResearchPanel.tsx:81-83`). |
| reader-tab | OK — panel read-only; `research.buy` dispatch refused by the reader gate. |

### return — `panels/ReturnReportPanel.tsx`, `return/model.ts`
| state | finding |
|---|---|
| empty | OK — zero-gain → `zeroHeadline`/`zeroBody`, none → `noneHeadline`, `noBottleneck` (`ReturnReportPanel.tsx:106-119,157-159,210-218`). |
| loading | OK — panel never mounts before adoption; the `.reconcile` `role="status"` line owns the loading moment (`ReturnReportPanel.tsx:18-26`). |
| locked | n/a — a receipt only; it dispatches/persists/re-credits nothing (`ReturnReportPanel.tsx:22-26`). |
| error | OK — clipboard failure → `copyFailed` note `role="status"` (`ReturnReportPanel.tsx:94-104,249-253`); cap / long-absence limits inline (`ReturnReportPanel.tsx:190-204`); focus restored on every unmount path (`ReturnReportPanel.tsx:65-90`). |
| reader-tab | OK — receipt read-only; no dispatch to refuse. |

### save — `panels/YardPanel.tsx`, `save/ImportConfirm.tsx`
| state | finding |
|---|---|
| empty | OK — record page prints the yard stats; export idle note (`YardPanel.tsx:47,104-141`). |
| loading | n/a — export/import are synchronous text operations. |
| locked | OK — `ImportConfirm` Replace `disabled={!acknowledged}`, Cancel auto-focused so a stray Enter never replaces (`ImportConfirm.tsx:59-65,134-141`); Escape retires only the dialog (`ImportConfirm.tsx:66-75`). |
| error | OK — import **validates first**: a refused text is a note and never calls `onImport` (`YardPanel.tsx:73-81`); copy/download failure notes; per-page `status-line` `role="status"` (`YardPanel.tsx:56-60`). |
| reader-tab | OK — Yard panel gated after tutorial; the import command path is refused by the reader gate. |

### store — `panels/StorePanel.tsx`, `store/TradeCard.tsx`
| state | finding |
|---|---|
| empty | OK — no sellable face → `nothingSellable` note (`StorePanel.tsx:124-126`); Inventory lists every resource incl zero stock (`StorePanel.tsx:140-163`). |
| loading | n/a — trade faces are a synchronous derivation of store + exportClaimed. |
| locked | OK — `!exportClaimed` → `tradeLocked` note (`StorePanel.tsx:127-129`); reserve floor protects starter stock (`StorePanel.tsx:175-185`). |
| error | OK + **#65 c1/c2** — storage full → cause + largest holds + recovery rows (`StorePanel.tsx:192-206`); `TradeCard` invalid qty → `overSellable`/`invalidQty` preview, Sell `disabled` (`TradeCard.tsx:44-47,109-124`); a refused sell rides the grouped toast. |
| reader-tab | OK — store read-only; `contract.sell` dispatch refused by the reader gate. |

### upgrade — `upgrade/UpgradeCompare.tsx`, `upgrade/model.ts`
| state | finding |
|---|---|
| empty | OK — nothing selected → `buyHint` (`UpgradeCompare.tsx:200`); no last pick → `respecNone` (`UpgradeCompare.tsx:225-227`). |
| loading | n/a — upgrade resolves immediately; receipt read back from applied state. |
| locked | OK — Buy `disabled` until a card is selected and not `noEffect` (`UpgradeCompare.tsx:189-199`); maxed draw rank → disabled `noEffectBadge` card (`UpgradeCompare.tsx:156,166-171`); respec current branch disabled (`UpgradeCompare.tsx:217`). |
| error | OK + **#65 c2** — `short` receipt with the engine's `shortCredits` numbers + `nothingSpent` (`UpgradeCompare.tsx:95-104`); `noop` receipt reports honestly (`UpgradeCompare.tsx:128-133`); `applied` receipt read back from state, never optimistic (`UpgradeCompare.tsx:84-94`). |
| reader-tab | OK — read-only; `machine.upgrade`/`respec` dispatch refused by the reader gate. |

### onboard — `onboard/OnboardCoach.tsx`, `onboard/lessons.ts`
| state | finding |
|---|---|
| empty | n/a — a lesson is always derived from the authoritative tutorial state (`OnboardCoach.tsx:40`). |
| loading | n/a — synchronous derivation. |
| locked | n/a — coaching is guidance, not a gated command. |
| error | OK — place-mode earn trap → reachable recovery (Salvage / Store one tap) instead of repeat refusals (`OnboardCoach.tsx:42-48,98-122`). |
| reader-tab | OK — **yields entirely**: `if (props.reader) return null` (`OnboardCoach.tsx:37-38`); coaching another tab's yard would be noise. Hidden pref → Show face; Skip persisted (`OnboardCoach.tsx:50-63`). |

### panels/shared + primitives — `panels/shared.tsx`, `primitives.tsx`
| state | finding |
|---|---|
| all | n/a — `Row`/`nextId` are presentational/helpers; `primitives.tsx` (`wk-*`, `?ui48` flag) is the shared token slice. #65 c3 disables all 10 `wk-*` chrome transitions under reduced motion via the single `:root[data-reduced-motion="true"]` block; `primitives.css` itself is **not edited** (tokens-48 drift test). |

## #65 unification contributions mapped to the five criteria

- **c1 (coherent press/selection/purchase/build/blocked/success tied to ACTUAL results):**
  the existing surfaces already tie feedback to real `CommandResult`s (commit cue+notify,
  read-back upgrade receipts, place verdicts, trade proceeds). #65 adds restrained cyan
  `:active`/`:hover` washes on the primary action family (`.dock__btn`, `.gate__btn`,
  `.blueprint`, `.objective__btn`) so the tactile press cue is uniform across dock, gate,
  catalog and objective — `styles.css` UI-RESET-65 block.
- **c2 (persistent errors, grouped repeats, no toast spam):** `notify` groups identical
  active readouts into one toast with a `×N` count painted by `::after` (bare live-region
  text → no screen-reader re-announcement spam, all pinned readouts unchanged); the
  `lastReject` "Last …" tail persists past the 1.8 s window at resting phase. Covers every
  reject source (commit shortfalls, `reader.stuck`) — `App.tsx`, `Hud.tsx:416-436`.
- **c3 (restrained motion + reduced-motion alternative, never shift an action under a
  finger):** App mirrors `settings.reducedMotion || osReducedMotion` onto
  `document.documentElement[data-reduced-motion]`; ONE `styles.css` override block disables
  all 10 chrome transitions (primitives `wk-*`, inspector progress fill, logistics gauge
  fill). The canvas motion path (`drawScene`, `App.tsx:824`) is unchanged. Press washes are
  colour-only (no transform/layout), so no action moves under a finger.
- **c4 (integrate EXISTING sound cues with mute/settings, verify honestly):** verify-only.
  The mature mix graph (`src/game/audio/audio.ts`, master-gain single-write mute, CUE_TABLE,
  bounded voice pool, `graphSnapshot()` read-back) is unchanged and covered by
  `tests/game/audio.test.ts`. Headless cannot listen; `graphSnapshot()` is the test proxy
  and the probe asserts the node table. Limitation stated honestly in evidence.md.
- **c5 (this matrix):** every component group audited against all five states above.

## Findings

1. **No blocking defect found.** All five states are handled coherently by the existing
   mature surfaces; the centralised reader gate, reconcile line, empty notes, printed lock
   reasons and read-back receipts are consistent across form factors. #65's job was to
   unify the *feedback layer* over them (c1/c2/c3) and document the audit (c5), not to
   rebuild any panel.
2. **Pre-existing, acceptable (not #65 defects):**
   - The dock Connect face does not pre-print the belt scrap cost (noted in #57 finding 4);
     the refusal is surfaced and resolved by the idle earn path. Out of #65 scope (build /
     connect HUD + tutorial copy owns it).
   - `LogisticsOverview` cannot swap the inspected selection (App contract exposes no
     selection callback); it reveals the route on the canvas and tells the player to open
     the machine. Documented limitation, not worked around with a forbidden edit.
3. **Targeted fixes delivered by #65:** c1 press washes, c2 grouped toast (`::after`),
   c3 reduced-motion-to-CSS. Verified by `tests/ui/feedback-65.test.tsx` and the full ladder
   (tsc 0, validate 0, vitest 746/746, build 0) at the head SHA.

## Limitations

- Audit is source-read + headless DOM/geometry/computed-style verification; no vision. PNG
  frames are mirrors audited for sha256 + dimensions, not visually inspected.
- Project 1 membership is unverifiable with the current gh token (lacks read:project);
  recorded, not invented.
- The landscape-ts2 0px defect is routed to #66 (G4), not #65 scope.