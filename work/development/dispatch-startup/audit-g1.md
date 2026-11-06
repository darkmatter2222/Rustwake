# startup-code-audit — findings (generation 1)

- Assignment: `startup-code-audit`, developer lane, no children spawned.
- Inspected tree: main checkout `C:\Users\ryans\source\repos\Rustwake`, `main = b4e8321e782a4debc55e58a6c7b123e86dd1047a` (`origin/main` equal). Deployed artifact is still `rustwake-d7af68a` (`work/deployments/OPS-013-g1.json`); the two later main commits (`8bd0ff1`, `b4e8321`) are docs/tooling only, so no gameplay redeploy is owed by them.
- Evidence types used: automated test, source inspection, visual inspection (actual PNGs opened), numerical analysis. No human playtest and no audio listening exist in this pass; both stay unverified.

## 1. Baseline gates (my own runs at `b4e8321`, this host)

| Gate | Result |
|---|---|
| `npm test` | 27 files / **283 tests passed**, 0 failed, 4.52 s |
| `npm run typecheck` | `tsc --noEmit`, no output (clean) |
| `npm run validate` | `content: 0 violation(s)`; `behaviour: firstDrone=268 firstResearch=478 tick=18298 machines=8 links=18 drones=5 batches=1902 credits=82 nodes=3` |
| `git apply --check --3way` of `6b5cee4` onto main | exit **0** (clean 3-way apply) |

Live-route reproduction (`npx tsx scripts/measure-chrm002.mjs`, `RUSTWAKE_URL=https://home.darkmatter2222.com/rustwake/`, my own run, seeded frames): the harness completed the `360x640 ts1` / `360x640 ts2` / part of `390x844 ts1` cells before my 300 s command timeout; the printed cells show card `16.7 % / 40.8 % / 10.6 %` of the `.hud` content box, minimum dock face **46 px**, `scrollHeight == innerHeight`, **0 pageerror**, and the fork row painted **`Faster batches 40 credits` then `Less power 30 credits`** — i.e. the **leftmost face is still the dearer plan** on the served artifact, so BLD-001 reproduces live and is not fixed.

## 2. What the code actually is (source inspection)

- Simulation is deterministic and command-driven: `src/game/simulation/commands.ts` owns `YARD_COLS/ROWS = 6`, 12 command bodies including `machine.dismantle`, `machine.move`, `route.connect/remove`; `engine.ts` (559 lines) pays batches/power; `autoconnect.ts` proposes links.
- Presentation is code-drawn: `src/game/renderer/sprites.ts` holds the whole look as numeric part tables (`PARTS`, `FLOOR_KIT`, `SKY_*`, `APRON_*`, `GRAVEL`, `PALETTE` of 16 hexes) and `scene.ts` paints them in layers with one `fillRect` group per colour. The HUD is React (`Hud.tsx` 244, `Panels.tsx` 590, `App.tsx` 698) with all wording in `src/game/content/strings.ts` and sentence assembly in `src/ui/text.ts`.
- `machine.move` (`commands.ts:105-107`) has **zero call sites** in `src/` and **zero references** in `tests/` (grep over `*.{ts,tsx}`): the sim supports moving a machine, the UI never dispatches it, and nothing asserts it. `machine.dismantle` refunds **100 %** of the build cost plus tray and input buffer (`dismantleMachine`), i.e. no cost penalty at all.
- Routes paint as one straight cyan segment per route with amber tokens (`scene.ts:506-538`), which is exactly the "connected by straight lines" the sponsor objected to.

## 3. Visual inspection (I opened these PNGs myself)

`work/review/ART-002/captures/live--d7af68a-390-ts1-rest.png`, `-390-ts1-fork.png`, `-360-ts2-fork.png`, `-seed-mature-390.png`, plus `work/review/dispatch-startup/captures/ds-360-ts2-panel-store.png`. What is actually visible:

1. **The world is a small island in a black page.** At 390x844 the yard band occupies roughly the middle third; there is a flat navy gap under the objective text and a flat black band between the bottom of the yard and the dock. At 360x640 ts2 the text card plus four equal-weight lines dominate and the world is a ~200 px strip. (confirms ART-002 D3 / owner "unusable")
2. **The dot field is the loudest object.** In the rest and mature frames the empty cells carry dozens of isolated 3 px marks (`GRAVEL` at alpha 0.5, `FLOOR_KIT` plank/drum/rail families); the eye lands on noise, not on a machine or the wreck. (confirms ART-002 D1)
3. **Machine identity still needs the printed tile number.** Ten bodies share one rounded-rect + header-bar outline; the differences are 2-3 px stripe groups and footer pips. Furnace/sorter/mill are separable only by counting marks. (confirms ART-002 D2)
4. **One light direction and no contact shadows.** Every body is a single flat fill; only `drone` has an ellipse shadow (`PARTS.drone[0]`), and the fallback blueprints (`generic`, `polymerRecycler`, `copperSeparator`, `platePress`, `circuitAssembler`) have **no shadow row at all** in `PARTS`.
5. **The store panel's rows do not line up** (`ds-360-ts2-panel-store.png`): `Scrap 20 20/900` stack in the left column while `Capacity` sits alone on the right with its value printed under the wrong label, and the last line is cut mid-sentence (`…0 of 8 units requested`). `20/900` is also printed twice. Root cause is structural, see finding N-2.
6. The one thing that is genuinely better than "prototype": the drone row and the dock face heights (46 px) read cleanly, and the clip witness (26/26 distinct frames in ART-002) shows motion is smooth.

## 4. New findings from this audit

- **N-1 (minor, P1, player-visible) — mixed children desynchronise the panel's label/value grid.** `.panel dl` is `display: grid; grid-template-columns: auto 1fr` (`src/ui/styles.css:335-341`). In `StorePanel` (`src/ui/Panels.tsx:245-300`) some rows are bare `<dt>/<dd>` pairs (direct grid items → one cell each) while others are wrapped in `<div key=…>` (one grid item → its `dt` and `dd` stack inside the *first* column). After the first wrapper, every subsequent label/value pair is offset by one slot. `ReturnReportPanel` (`Panels.tsx:530-550`) mixes the same way; `MachinePanel` (`Panels.tsx:81-170`) uses only bare pairs and is fine. This is why the shipped store panel reads as shuffled. Cheapest lever: one CSS rule making every row one grid item with its own two columns (`display: contents` on `dl > div`, or a per-row two-column grid), plus a jsdom assertion that each row's label and value share one baseline.
- **N-2 (minor) — duplicated store facts.** `row.capacity` prints `storeUnits/storeCapacity` and `yardSummary` also prints `Storage 2 % full (20/900)`; the same pair appears twice in one panel (`Panels.tsx:271-281`). One of the two should carry the number.
- **N-3 (minor) — the dock can show two faces labelled `Build` side by side** (`ds-360-ts2-panel-store.png` shows `Store | Build Scrap sorter 20 scrap | Build`): the blueprint picker keeps the generic verb on the secondary face while the primary already names the blueprint. Muscle-memory friendly labels need one wording per action.
- **N-4 (info) — `machine.move` is unreachable.** Sim + no UI + no test (source of finding for ticket proposal LOG-002 below).
- **N-5 (info) — dismantle has no cost.** Full refund means "move the yard" is free apart from the tap count, which is why the sponsor's "some penalty" ask is a real gap rather than a misreading.

## 5. Reconciliation of in-flight work (see `recovery-g1.md` for the list)

`strat003-g1` (`43cf3ac`) and `strat002-g3` (`d836a7a`) are already integrated (their `src`/`tests` blobs equal main's except for later main-side work). The only unrecovered **code** is `bld001-g1` → `6b5cee4`; the `audio-fixes` branch is integrated except its final test-only commit (`0d37b0c`, +165 lines in `tests/renderer/scene-draw.test.ts`, the L-5 per-pixel census), which is measurement prose and can wait one slice.

## 6. Honest limits of this audit

No human playtest, no real-device trace, no audio listening (headless Node/Chrome, no loopback capture). The live harness timed out before printing the panel-open cells, so the panel numbers I quote come from the printed cells plus my own inspection of the sibling lane's `ds-*.png` captures. `work/review/dispatch-startup/**` belongs to a sibling worker (written 21:18 this evening) and I only read it.
