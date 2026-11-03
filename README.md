# Rustwake

A full-screen, mobile-first browser idle salvage game. You operate a small recovery
outfit: cut scrap from wrecks, repair a drone, let it work for you, then build and
connect processing machines into a yard that keeps producing while you plan.

![Rustwake on a phone viewport](docs/screenshots/latest-mobile.png)

Prototype build: React 18 + TypeScript + Vite, Canvas 2D world, deterministic integer
simulation core. English only so far. No account, no server, no payments yet.

## Current playable loop (implemented)

1. **Begin recovery** on the start gate; this also unlocks audio.
2. **Tap the wreck** (or press *Salvage*) to fire a cutting pulse. Each pulse gives
   5 scrap with a 0.6 s recharge, six pulses giving the 30 scrap needed for repair.
3. **Repair drone** for 30 scrap. The drone then extracts 5-unit loads every 5 s and
   flies them to the dock, which is visibly filled by the delivered cargo.
4. **Build sorter** (20 scrap) on a free yard tile using the placement ghost.
5. **Connect dock to sorter** to create real routes with capacity, latency, filters, and
   visible cargo movement. Each link carries one material, so a machine gains one link per
   material it needs or emits: the sorter's second output (nonferrous) appears with the next
   **Connect** tap, which is when a two-output recipe stops being half-wired.
6. **Build furnace** and connect it, then **Sell steel** to earn the first 30 credits.
7. **Upgrade a machine** with those credits. Upgrades change speed only
   (`ceil(base * 1.16^(level-1))` cost, `1 + 0.10 * (level-1)` speed).
8. **Extend the chain**: the copper separator (2 nonferrous → 1 copper + 1 residue),
   the polymer recycler (3 residue → 1 polymer), and the wire mill (1 copper → 3 wire)
   unlock in that order, each with its own route and its own upgrade price.
9. **Sell a surplus** from the store panel at published per-unit prices, then spend the
   credits on whichever machine is the current bottleneck.
10. **Read the diagnosis** in a machine's panel: measured working/waiting/output-waiting
    percentages, the busiest link, and the yard power speed, followed by one next step that
    is sometimes "no purchase needed".
11. **Research a node** once the yard produces data: the dock gains a fourth target,
    **Research**, which lists each node's exact effect and cost, and one tap buys one rank.
12. **Open a second tab** and it follows the first: the follower shows
    `Following the other tab`, mirrors the owner's saved yard, and writes nothing. Close the
    first tab and **Take over** promotes the follower, which continues from the same ledger.

After the tutorial, one authoritative ladder decides the next step for both the objective
card and the dock button: an unmet link first, then an affordable build, then an affordable
research node, then the cheapest useful upgrade, then a sell of a surplus that is not the
next machine's missing input, then the build that is closest to payable. The two surfaces
cannot disagree.

Implemented systems: manual salvage with cooldown, drone automation, machine
construction/upgrade/dismantle/move, 1×1 placement on a 6×6 yard with a protected dock
tile, route logistics with capacity/latency/per-material filters/fair allocation,
demand-sized input pulls, shared power budget with proportional slowdown, storage capacity plus an overflow hold, one-shot onboarding
export contract plus repeatable priced sell contracts, eight blueprints (including the
signal lab) with a progressive build picker, a three-node research branch bought with data
where each effect applies exactly once, tutorial state machine (T0-T9), contextual
objective card, one localised explanation per blocked action, a measured 60 s rate window per
machine plus per-machine and per-link occupancy with one recommended action, single-canvas HUD,
local save with a return
report and a 12-hour offline cap, a synthesised audio bus with a bounded voice pool, and a
single-writer multi-tab lease with read-only followers.

Planned, not yet functional: expeditions/sector map, wreck composition and scan detail,
restore/dismantle/sell choices for major objects, policies, prestige, crews, PvP, store.
Those are later milestones in `goal.md` (M3+).

## Milestone and next three goals

Active milestone: **M2 — a useful small factory** (M0 and M1 complete).

1. **B-06 save export/import**: a versioned JSON export and a validating import so a yard can move
   between devices, with the corrupt-file path keeping the previous state (spec 25.3 case 8).
2. **B-28 second delivery drone**: the measured 30-minute stall in decision D-35 is one drone's
   1 scrap/s against an L13 sorter's ~1.2/s, so the store never reaches the next blueprint's price.
   A second drone (or a delivery-sized store) inside the first 30 minutes, then the same driver
   reaches the signal lab from a post-absence start.
3. **B-12 content validator in CI**: run the typed-content checks in the pipeline so a missing
   reference, an invalid footprint, or a zero-time cycle fails the build instead of the playtest.

## Controls

| Input | Behaviour |
| --- | --- |
| Tap/click object | Select it; the world object shows a high-contrast outline and its panel opens |
| Tap the wreck | Manual cutting pulse (when a pulse is ready) |
| Drag one finger | Pan the camera, clamped to the yard |
| Pinch / two-finger drag | Zoom between 1.2x and 6x |
| Primary dock button | The single next action for the current objective: the verb, with the price on its own line (`Upgrade` / `92 credits`). The objective card above names the machine |
| Machine panel | Status, batch progress, measured rate over its named window (`60s window`, or all available time for a new machine), maximum rate at full power, power share, **Measured** line (busy / waiting / output-waiting / busiest link / power) and one **Next step** recommendation, **Connect**, **Upgrade**, **Dismantle** |
| Store panel | Material list with **Sell** buttons, capacity, measured storage/power/link lines, overflow hold |
| Research panel | One line per node with its exact effect, `Buy · n Data`, `Known`, or `Needs <earlier node> first` |
| Build / Place / Next / Cancel | Blueprint selection, ghost confirmation, cycling, abort |
| Sound on/off | Toggles the master bus, persisted (`Sound ✓` / `Sound ✕`) |
| Text size (`A 1`) | Cycles the HUD text 1 → 1.25 → 1.5 → 2, persisted; from 1.5 the objective's second line and one resource chip step back |
| Home | Recentres the camera on the yard and clears selection |
| Second tab | Follows the owner: one status line, **Take over** promotes it once the owner's lease (1.5 s) lapses |

Keyboard: standard focus order over the semantic buttons (`Tab`, visible 2 px cyan ring on the
focused control), activation with `Enter`/`Space`, and `Escape` closing the most local context
first — return report, then the open panel, then build mode (spec 5.5). Reduced-motion is honoured
for the drone and cargo interpolation, from the operating-system preference as well as the saved
setting; the economy never depends on animation timing.

## Run it

```bash
npm ci        # install
npm run dev   # http://localhost:5173
npm test      # 132 unit/integration tests
npm run typecheck
npm run build # dist/ (207.60 kB JS, 65.64 kB gzip, 50 modules)
npm run preview
```

Save state lives in `localStorage` under `rustwake.save.v1` as a checksummed envelope
`{schemaVersion, checksum, payload}`, plus a `rustwake.lease.v1` writer record
`{owner, heartbeatMs, revision}`. Corrupt or newer-version envelopes are rejected and
a fresh session starts without overwriting the stored raw text until the next successful
checkpoint. On load, one bounded catch-up runs and the reference clock (epoch ms) advances
through the entire absence, so repeated reloads cannot double-claim the discarded tail.

To capture the README screenshots: `npm run preview` in one terminal, then
`node scripts/capture.mjs`.

To regenerate the supply-window tables (reserve-floor sweep and per-link utilisation):
`npx tsx scripts/probe-supply.mjs`, which writes `docs/evidence/2026-11-03-supply-window.md`
(about 4 s). The same four numbers are asserted by `tests/simulation/supply-window.test.ts`.

To regenerate the build-versus-upgrade table: `npx tsx scripts/probe-cadence.mjs`, which writes
`docs/evidence/2026-11-03-cadence.md` (about 2 s); `tests/simulation/cadence.test.ts` pins both rows
and the ambiguous-round count. Note the order: only `scripts/probe-supply.mjs` writes the mature-yard
seed `docs/evidence/yard-mature.json`, and `scripts/capture.mjs` reads that file once at start-up, so
refresh the seed before capturing.

To regenerate the HUD share, no-scroll, large-text and contrast table: `npm run preview`, then
`node scripts/measure-hud.mjs`, which writes `docs/evidence/2026-11-03-hud-share.md` (about 70 s,
six sizes × three text scales × three states in one Chrome instance).

## Latest update (M2: the headless and browser harnesses now describe one economy, 2026-11-03)

- **The 30-minute self-play drivers were running with the market shut (D-33).** They jump from the
  repaired drone to `tutorial = 9`, which skips the tutorial's one press on
  `Sell steel · 30 credits`, and `sellResource` returns `locked` while the one-time onboarding export
  contract is unclaimed. So all 1 634 sell steps of the headless half hour earned nothing: eight
  machines, every one at level 1, 0 credits — while real Chrome on the same build showed L12–L15. All
  four drivers now issue one `contract.export` command on the first round the store holds three
  steel, exactly the condition `offline.ts` uses for the objective. The same half hour now ends at
  **8 machines at L13/L12/L10/L11/L10/L9/L8/L8, 1 757 batch completions on 18 links, 25 credits, 3
  research nodes**, and the ladder's step histogram gains `upgrade: 390` where it had none. No `src/`
  change, so the bundle is byte-identical to the previous pass's screenshots.
- **The ladder's build-before-upgrade order is not a lever (B-21, D-34).**
  `scripts/probe-cadence.mjs` runs that ladder twice with only the `build`/`upgrade` pair swapped, and
  both rows finish identical — 8 machines, **1 757 batches (58.6/min)**, 25 credits, 3 nodes, the same
  eight levels, the same histogram `sell 864, build 534, upgrade 390, connect 9, research 3` — because
  **0 of 1 800 rounds** have both branches affordable at once. Credits are spent the moment they reach
  the cheapest upgrade price while materials accumulate for the next blueprint, so the two states
  barely overlap. Shipped order unchanged in `plan.ts`; both rows plus the 0-ambiguous count are
  pinned by `tests/simulation/cadence.test.ts`. Table: `docs/evidence/2026-11-03-cadence.md`.
- **The reserve-floor sweep restated with the market open (B-15).** Floors {0, 5, 10, 20} now give
  machines **5 / 7 / 8 / 8** and total batches **1 456 / 1 457 / 1 757 / 1 677** where the earlier
  table read 4/5/7/8 and 670/1152/1196/1137. A floor below 10 now measurably costs stages outright —
  it strips the store under the next blueprint's price — so 10 stays as the shipped value with the
  best total (`docs/evidence/2026-11-03-supply-window.md`).
- **Why the phone session stops at four machines, and where the phone research image comes from
  (D-35, B-25).** The 240-round organic phase still ends with `research: {}`, and the reason is now
  measured rather than assumed: one starter drone delivers 1 scrap/s while the sorter at L13–L14
  consumes about 1.2/s, so after a saturating 12 h absence every material pins at the reserve floor and
  the 30–50-scrap blueprint prices are only met by chance. The headless driver, which runs the same
  ladder without that absence, reaches its eighth machine at round 731 and its first node at 797 — the
  absence is what changes the balance. `latest-research-phone.png` therefore comes from the same
  seeded mature yard as the desktop row (390 × 844 @2x), the organic path is still tried first, and
  the script prints which source produced the file. The fix is one more delivery drone (**B-28**).
- Checks in this run: `npx vitest run` **132 passed / 132** (16 files, one new
  `tests/simulation/cadence.test.ts`), `npm run build` unchanged at **207.60 kB JS (65.64 kB gzip)**
  and CSS 5.15 kB (1.69 kB gzip), 50 modules, with the same artifact names
  `index-BONbSNIw.js` / `index-BTmHMPUU.css` — so the layout table and the six images below all still
  describe this build. The simulation core is untouched, so the headless CPU table still applies.
- Known limitations: the organic phone session still does not reach `data > 0` (**B-28** is that
  fix); the phone research image is a seeded-context photograph, so it proves the panel's appearance
  at phone size, not how fast a player gets there; CI read-back stays pending (**BL-06**); frame rate,
  thermals and human listening remain **BL-01**, **BL-02**, **BL-11**.

## Earlier this week (M2: HUD band inside 22 %, dock compact at large text, 2026-11-03)

- **The strict row-union measure is inside the design band now (B-26, spec 5.2).** At the default
  text scale the `band` column — the union of the three HUD layout rows, so it counts the empty
  space between the chips and the buttons too — is **20.6 %** at 360 × 640 (was 23 %) and
  **21.9 %** at 844 × 390 (was 26.2 %). Painted-box share fell with it: **19.2 %** at 360 × 640,
  **14.3 %** at 390 × 844, **13.0 %** at 412 × 915, **15.9 %** in landscape, **6.9 %** tablet,
  **5.1 %** desktop, and the peak across all six sizes at text scale 1.5 is **19.5 %**.
- **What made the rows shorter.** Each objective from the yard ladder now fits one line at 360 px
  (`Upgrade the Polymer recycler.`, `Research Efficient Cutters · 4 Data`), the objective card's
  second line disappears on a short viewport, the chip budget takes the viewport height into
  account so a landscape phone gets the five-chip one-row layout instead of two rows of a 24 px
  block, and the dock and card take narrower columns in landscape (`@media (max-height: 460px)`).
  The research node's effect sentence lives in the research panel beside its own buy button, as
  before, and in the card only as the price.
- **The dock is compact at large text (B-27).** The primary button carries the verb and the price
  (`Upgrade` + `30 credits`) while the card directly above names the machine, so a dock row at text
  scale 2.0 is 118 px instead of 144.9 px and the resting HUD paints **40.5 %** of a 360 × 640
  viewport instead of 57.4 %. The 30 px labels are kept (spec 6.4), the chip rows take 1.15 leading,
  and the sound button shows `♪`/`✕` from 1.5 so all three cluster buttons share one row. The two
  surfaces still state one goal: a test pins the shared first word and the card's ≤ 48 characters.
- **A new audit gate catches clipped chrome.** `scripts/measure-hud.mjs` now records the furthest
  painted right and bottom edge in every state and lists any box past the visual viewport. That is
  how the previous build's fourth dock target — 21 px past a 360 px screen at scale 2.0, hidden by
  `overflow: hidden` — was found, and all 18 contexts now report **none**. Smallest dock target
  94.6 × 46 px and smallest icon button 44 × 65.2 px at scale 2.0, four dock targets at rest and
  three in build mode (spec 6.2, spec 5.5); no document scroll in 18/18; contrast unchanged at a
  minimum of 5.77:1; every panel still reports 0 px inner scroll.
- Checks in this run: `npx vitest run` **129 passed / 129** (15 files; two new cases — the
  height-aware chip budget at 390/460/461 px viewports, and the card/dock pairing that keeps the
  card ≤ 48 characters and the same leading verb), `npm run build` **207.60 kB JS (65.64 kB gzip)**,
  CSS 5.15 kB (**1.69 kB gzip**), 50 modules (+0.02 kB gzip over `808dbc8`). The simulation core is
  untouched, so the headless timing table below still applies.
- Known limitations: at 2.0 the fourth dock target starts a second wrapped line and is full width
  where its three neighbours are narrower; the mobile capture session still ends before `data > 0`,
  so the research image comes from the seeded desktop context (**B-25**); frame rate, thermals and
  human listening remain BL-01, BL-02 and BL-11.

## Earlier this week (M2: panels fit at large text, one text-scale control, 2026-11-03)

- **Every panel now fits its box at every text scale (B-13, spec 6.4).** The panels are in-flow
  flex children of the HUD column with a non-scrolling head (title plus the only Close button) and
  a scrollable body. Measured in real Chrome over six sizes × three scales × three states: the
  store panel's inner scroll went **105 px → 0 px** at 360 × 640 and **165 px → 0 px** in
  landscape, the Close button is inside the viewport in all 18 contexts, and no panel overlaps the
  dock or the objective card any more. No document scroll in 18/18 contexts.
- **One control changes text size.** The top-right cluster is now `Sound ✓` / `A 1` / `Home`; the
  middle button cycles 1 → 1.25 → 1.5 → 2, is written to the save as `textScale`, and drives
  `--text-scale`. At ≥ 1.5 the objective's secondary hint line and one resource chip step back, so
  the HUD shortens instead of shrinking type. `prefers-reduced-motion: reduce` is read from the
  operating system once on mount and applied through the same setting as the in-game toggle.
- **Contrast is measured, not assumed.** Ten text roles are composed over the real background and
  judged against WCAG AA (4.5:1, 3:1 for large text). Minimum observed **5.77:1** (the objective
  hint) at all three scales; every pair passes at every size. Keyboard focus now has an explicit
  `:focus-visible` ring, and the audit presses a real `Tab` and reads the ring Chrome computes.
- **Resting HUD share, default scale (spec 5.2 target 15–22 %):** **21.6 %** at 360 × 640,
  **14.3 %** at 390 × 844, **13.0 %** at 412 × 915, **20.2 %** in landscape, **6.9 %** tablet,
  **5.1 %** desktop. Adding the third cluster button had squeezed the chip row to one chip per
  line, so the cluster padding, the gap and the chip padding were each trimmed a pixel and the
  labels shortened (`Sound ✓` instead of `Sound on`): the chip block is two rows again, 190 × 48 px.
- **Escape now walks the layers** — return report, then open panel, then build mode — as spec 5.5
  asks, and a build that never gets `Place` commits nothing.
- Checks in this run: `npx vitest run` **127 passed / 127** (15 files; two new cases: the text-scale
  cycle persisting to the save with the `.text-large` class, and Escape leaving build mode without
  building), `npm run build` **207.57 kB JS (65.61 kB gzip)**, CSS 4.82 kB (1.59 kB gzip), 50
  modules (+0.39 kB gzip over `266d9d6`; the growth is the panel head/body markup and the focus
  rule). The simulation core is untouched, so the headless timing table below still applies.
- Known limitations: at the largest scale on 360 × 640 the HUD paints 57.4 % of the viewport
  (30 px labels plus a cost line make each dock row 144.9 px) — recorded as **B-27** rather than
  hidden; the stricter row-union measure is still 23 % at 360 × 640 and 26.2 % in landscape
  (**B-26**); frame rate, thermals and human listening remain BL-01 and BL-11.

## Earlier this week (M2: HUD area share measured, chips and dock capped, 2026-11-03)

- **The 15–22 % HUD target now has numbers (B-16, spec 5.2).** `scripts/measure-hud.mjs` opens the
  production build in headless Chrome at the six sizes spec 25.1 names, with the mature-yard save
  installed, and unions the painted HUD boxes over the visual viewport. Resting share: **22.1 %** at
  360 × 640, **14.7 %** at 390 × 844, **13.5 %** at 412 × 915, **21.1 %** at 844 × 390 landscape,
  **7.2 %** at 820 × 1180, **5.4 %** at 1440 × 900. Method and full table:
  `docs/evidence/2026-11-03-hud-share.md`.
- **Two levers brought the narrowest phone into the band (decision D-30).** A width-derived chip
  budget (`hudChipLimit`: four chips on a portrait phone, seven on a wide screen, with the credits
  and Store status chips paying for themselves out of that budget) took the chip block from three
  rows to two, and a centred 560 px dock stopped the bottom row stretching across wide screens:
  24.2 % → 22.1 % at 360 × 640, 24.2 % → 21.1 % in landscape, 8.4 % → 5.4 % on desktop. Chip padding
  4 → 3 px and dock `min-height` 48 → 46 px are both still above the 44 px minimum.
- **The no-scroll gate has real-Chrome evidence now** (the structural half of BL-01): at all six
  sizes the document's `scrollWidth`/`scrollHeight` equal the visual viewport exactly, in the
  resting, build-mode and store-panel-open states. The jsdom suite cannot show this, because
  `scrollHeight` is always 0 there.
- **Touch limits verified at the narrowest size**: smallest dock target 46.8 × 46 px, smallest icon
  button 50.3 × 44 px, four primary dock targets at rest and three in build mode, so spec 6.2 and
  the five-target rule of spec 5.5 both hold.
- Checks in this run: `npm run typecheck` clean, `npx vitest run` **124 passed / 124** (15 files: +3
  in the new `tests/ui/hud-layout.test.ts`, which pins the chip budget at both widths and the
  sell-order cap), `npm run build` 206.35 kB JS (65.22 kB gzip, 50 modules, +0.06 kB gzip). The
  simulation core is untouched, so the headless timing table below carries over unchanged.
- Known limitations: the stricter row-union (`band`) measure is still over the ceiling at the two
  short-viewport sizes — 24 % at 360 × 640 and 27.9 % at 844 × 390 — because the objective card costs
  two or three lines there, which is B-26; a portrait phone now shows one material chip instead of
  two, with the rest one tap away in the store panel; every measurement above is at the 15 px base
  font, so the 2.0 text-scale audit is still open (B-13); `isMobile` plus `deviceScaleFactor` is not
  a real-device trace (BL-01); audio is unverified by human listening (BL-11).

## Earlier this week (M2: measured 60 s rate window, 2026-11-03)

- **The machine panel now reports a windowed rate (B-17, spec 9.4).** `Actual rate` reads the last
  complete 60 s window — or all available time while a machine is younger than one window — and the
  line names the span it covers: `Actual rate 0.00 batches/s · 60s window`. The lifetime average is
  no longer presented as the current rate, so a machine that stopped a minute ago reads as stopped.
- **How it is measured.** Each machine keeps two `(machine age, batchesDone)` samples on a fixed
  600-tick grid, written once a minute per machine from the tick loop, plus the same rule inside the
  event-jump branch, so `advance` and `advanceTo` still produce byte-identical machine state
  (asserted on the whole `machines` array). Decision D-29 records the alternatives considered.
- **Cost is inside the noise.** Same harness, median of 3, Node 22.18: 41.2 ms / < 1 ms / 41.7 ms /
  13.4 ms / 6.4 ms / 0.97 ms / 0.71 ms against 42.2 / < 1 / 41.0 / 13.7 / 6.1 / 1.0 / 0.76 last
  pass. Four integers and one compare per machine per tick.
- **Real Chrome, both contexts.** Mobile: absence `tick 1 020 → 433 030` with the report
  `Ferrous +110 · Nonferrous +549 · Steel +219 · Deliveries 342 · Batches 773 · Bottleneck
  storage-full`; final yard 4 machines (sorter L6 ×582, furnace L6 ×232, polymer recycler L5 ×1,
  copper separator L6 ×4) on 9 links, 130 credits, HUD `Scrap 10 Ferrous 5 Nonferrous 83 Credits 130
  Store 332/900`. The selected recycler's panel reads `Actual rate 0.00 batches/s · 60s window`
  directly above `Max rate 0.23 batches/s at full power` and the lifetime `Measured Working 0% ·
  waiting for input 100% · output waiting 0% · link 10% busy · power 100%` line - the two windows are
  deliberately different and both are labelled. Desktop from the probe's seed save: 8 machines on 18
  links, `research {cutters, buffers, dispatch}`, `circuits 16, data 20`, tick 454 259, research
  panel open on `Data 20`. Lease handover `t1-7by6 → t1-7eik` with the tick advancing
  433 650 → 433 679.
- Checks in this run: `npm run typecheck` clean, `npx vitest run` **121 passed / 121** (14 files: +5
  in the new `tests/simulation/rate-window.test.ts`, +2 assertions on the panel's window label),
  `npm run build` 206.21 kB JS (65.16 kB gzip, 50 modules, +0.26 kB gzip), and
  `npx tsx scripts/probe-supply.mjs` prints the same four floors as the previous pass
  (1 075 / 1 056 / 1 018 / 1 103 batches), which shows the new counters are behaviour-neutral.
- **Save compatibility:** schema 1 unchanged. A save written without the four fields loads through
  `migrate` with the window restarting at zero and still yields a finite reading; `validateSim`
  rejects non-integer or negative window fields (test-covered in `tests/persistence/*`).
- Known limitations: the **Measured** occupancy percentages stay lifetime-since-built - only the
  rate is windowed; a completed window can lag the current tick by up to 60 s, so the newest
  delivery appears in the reading at the next sample; the short mobile session still ends before
  `data > 0` (B-25); the mature yard's own absence stays storage-limited (`Deliveries 4 · Batches
  39`); machines are level 1 in the headless session and level 4-6 in the click-paced one (B-21); a
  follower's picture steps at the 10 Hz adopt cadence (B-18); the no-scroll gate is still only
  structurally verified in jsdom (BL-01); audio is unverified by human listening (BL-11).

## Earlier this week (M2: one link per material, dead links gone, 2026-11-03)

- **Each material now reaches a machine over exactly one link (B-23).** `planConnections` keys a
  suggested input on `(destination machine, material)` and an output on `(source machine,
  material)`, ignoring the far endpoint, so the yard cannot grow a second parallel link for the
  same material. The store is preferred when it already holds a whole batch, because its pull is
  window-sized (two ready batches in one tap); below one batch the producing machine is used (D-28).
- **Measured in the 30-minute self-play session** (`npx tsx scripts/probe-supply.mjs`, tables in
  `docs/evidence/2026-11-03-supply-window.md`, assertions in `tests/simulation/supply-window.test.ts`):
  duplicate-link build **22 links with 3 at 0 % busy, 7 machines, 1 196 batches, 0 research nodes,
  aggregate link busy 16.6 %** → one-link build **18 links with 0 at 0 % busy, 8 machines,
  1 018 batches, 3 research nodes, aggregate 9.3 %**. Fewer links, no idle ones, and the yard gets
  further down the chain: the circuit assembler went from 1 batch to 38 and the signal lab appeared
  with `data 20` in the store, which is why the research panel can now be photographed. Total
  batches fell 15 % because two more stages share the same scrap supply, and both new stages are
  low-volume (22 and 38 batches).
- **Producer-first versus store-first was measured, not guessed.** Producer-first gives 926 batches
  and 1 research node at floor 10; store-first gives 1 018 and 3, so store-first shipped
  (decision D-28). The reserve-floor sweep was repeated after the change and stays non-committal:
  floors {0, 5, 10, 20} finish at 8 machines and 3 nodes each with 1 075 / 1 056 / 1 018 / 1 103
  batches, so 10 is kept and the floor is no longer the limiting knob.
- **Real Chrome, both contexts.** Mobile: `tick 1010 → 433 020` after a 12 h absence, report
  `Ferrous +110 · Nonferrous +550 · Steel +220 · Deliveries 342 · Batches 774 · Bottleneck
  storage-full`, final yard 4 machines (sorter L6 ×582, furnace L6 ×232, polymer recycler L5 ×1,
  copper separator L6 ×4) on 9 links, 130 credits, HUD `Scrap 10 Ferrous 5 Nonferrous 83 Credits 130
  Store 332/900`; the selected recycler read `Cycle 4.29s · Working 0% · waiting for input 100% ·
  link 10% busy` and named the copper separator as its limiter. Desktop, from the probe's seed save:
  8 machines on 18 links with `research {cutters, buffers, dispatch}`, `circuits 16, data 20`,
  and the research panel open showing `Data 20` and the three known effect lines. Lease handover:
  `t1-kou8 → t1-7ujv` with the tick advancing 433 640 → 433 669.
- Measured in this run: `npm run typecheck` clean, `npx vitest run` **116 passed / 116** (13 files:
  +4 in the new `tests/simulation/autoconnect.test.ts` for the one-link rule, and the three
  supply-window cases restated for the new topology), `npm run build` 205.44 kB JS (64.90 kB gzip,
  50 modules), and the 12 h catch-up case fell from 59.3 ms to 42.2 ms because a settled yard walks
  18 links per tick instead of 22.
- Known limitations: the short mobile session still ends before `data > 0`, so the research image
  comes from the seeded desktop context; the mature yard's own 12 h absence is storage-limited
  (`Deliveries 3 · Batches 33`) because it starts with a nearly full store; every machine is still
  level 1 in the headless session and level 4-6 in the click-paced one (B-21); panel percentages
  remain lifetime-since-built (B-17); a follower's picture steps at the 10 Hz adopt cadence (B-18);
  the no-scroll gate is still only structurally verified in jsdom (BL-01); audio is unverified by
  human listening (BL-11).

## Earlier this week (M2: supply window measured — reserve floor and link utilisation, 2026-11-03)

- **Both supply knobs now have measured values instead of guesses (B-15, B-25).** A new probe,
  `scripts/probe-supply.mjs`, runs the 30-minute self-play session once per reserve floor, and
  `tests/simulation/supply-window.test.ts` reproduces the same four numbers inside the suite.
  Floors {0, 5, 10, 20} give machines **4 / 5 / 7 / 8** and total batches
  **670 / 1152 / 1196 / 1137**, so 10 stays: floor 0 starves the first builds, floor 20 buys one
  extra machine but 59 fewer batches. Aggregate link utilisation at the end of the floor-10 run is
  **16.6 %** across 22 links.
- **Dead-link audit (B-22).** 19 of 22 links carry cargo; the three at 0 % are all on the
  last-built circuit assembler — `machine3>machine7:polymer`, `machine7>store0:circuits`,
  `store0>machine7:wire` — while `machine5>machine7:wire` (97.7 % busy) and
  `store0>machine7:polymer` (92 %) do the work. Two of the three duplicate an already-carried
  material into the same machine, which is now B-23. The assembler itself holds a full 16-unit
  ready set and stays at 0.6 % busy on a scarce input, so the two-batch ready window is not the
  binding constraint and stays at 2 (decision D-27). Machine occupancy over the same session:
  sorter 98 % (439 batches), copper separator 61.8 % (208), wire mill 48 % (195), furnace 45.3 %
  (200), plate press 27 % (84), polymer recycler 24.1 % (69).
- Tables land in **`docs/evidence/2026-11-03-supply-window.md`**, regenerated with
  `npx tsx scripts/probe-supply.mjs` (about 4 s for all four floors).
- Measured in this run: `npm run typecheck` clean, `npx vitest run` **112 passed / 112**
  (12 files: +3 in the new `tests/simulation/supply-window.test.ts`, and the existing
  `tests/simulation/chain.test.ts` self-play contract reproduces the same 7 machines, batch
  counts, and 22 links as the probe), `npm run build` unchanged at 205.41 kB JS (64.91 kB gzip,
  50 modules) — this pass changed no source, only the probe, one test file, and the docs.
- Known limitations: no visual change, so the four screenshots keep their `16e8d1f` provenance and
  the research panel is still unphotographed (BL-07); CI read-back is still pending (BL-06);
  panel percentages remain lifetime-since-built until B-17; a follower's picture steps at the 10 Hz
  adopt cadence (B-18); the no-scroll gate is still only structurally verified in jsdom (BL-01);
  audio is unverified by human listening (BL-11).

## Earlier this week (M2: material-sized pulls and one link per material, 2026-11-03)

- **A store link now draws only what its machine still has in hand (B-19).** `pullFromStore`
  sizes each pull to two ready batches of that material — per-batch units × 2, +6 with Smart
  Buffers, capped by the machine's effective input capacity — counted across the input buffer
  and the cargo already in transit, instead of moving everything above the reserve floor.
  The surplus therefore stays where prices and build costs are read. Measured with the new
  headless self-play driver (one ladder tap per second for 30 minutes,
  `tests/simulation/chain.test.ts`): **before, 3 machines** (sorter 29 batches, furnace 5,
  recycler 0) with 895 scrap parked in the store; **after, 7 machines on 22 links** — sorter
  ×439, copper separator ×208, furnace ×200, wire mill ×195, plate press ×84, polymer
  recycler ×69, circuit assembler ×1 — with 0 credits left unspent and a balanced store
  (`scrap 16, ferrous 10, nonferrous 10, steel 20, copper 10, polymer 66, wire 542,
  plates 225, circuits 1`).
- **A two-output recipe now really needs two links (spec 9.3 R01, 10.1).** `enqueueCargo`
  matches each tray item to the least-busy matching link with room at both ends, then a link
  that carries anything, then the machine's first link, so a half-connected machine still
  ships. Previously the sorter's whole tray (ferrous *and* nonferrous) went to one
  destination, which filled the furnace's input buffer with a material it cannot use and
  stalled the sorter: in the phone session the sorter went from 30 batches to 619 and the
  furnace from 5 to 301.
- `planConnections` proposes one link per output material and one per source/material pair,
  so the single **Connect** action still creates the whole working set in one tap.
- Real Chrome, the same scripted session plus a 12 h absence: `tick 1010 → 433 020`, and the
  return report now reads `Away 12h 0m · Your operation worked for 12h 0m (capped) · Ferrous
  +9 · Nonferrous +584 · Steel +287 · Deliveries 365 · Batches 876 · Bottleneck
  storage-full`, where the previous build reported `Steel +1 · Deliveries 182 · Batches 15`.
- Measured in this run: `npm test` 109 passed / 109 (11 files: +1 self-play regression case
  in `tests/simulation/chain.test.ts`; the buffer case in `tests/simulation/research.test.ts`
  restated as the ready-window contract, now 4 units plain and 10 with Smart Buffers; two
  per-material-link expectations in `tests/simulation/plan.test.ts`), `npm run typecheck`
  clean, `npm run build` 205.41 kB JS (64.91 kB gzip, 50 modules).
- **Cost of the new routing, and what was done about it.** The first measurement after the
  change roughly quadrupled the per-tick cost (100 machines × 10 000 ticks: 6.9 → 26 ms),
  because every tray item rescanned the whole route list and rebuilt the tray array. Three
  fixes brought it back: one per-state lookup table of machines and outgoing links rebuilt
  only when a command changes the topology, one link list per machine read once per machine
  per tick, and in-place tray compaction (with a mutable `TrayItem.qty`). The remaining
  difference is about 1.9× at 100 machines and 1.7× at 500, inside the 100 ms catch-up budget
  in spec 21.5; both before and after numbers are in the table below.
- Known limitations: the 30-minute self-play run leaves every machine at level 1 because the
  ladder funds builds first, so the upgrade curve is exercised only by the shorter real-Chrome
  session (L7/L7/L7 there); the research panel is still unphotographed (BL-07); a follower's
  picture steps at the 10 Hz adopt cadence (B-18); the no-scroll gate is still only
  structurally verified in jsdom (BL-01); percentages remain lifetime-since-built (B-17);
  audio is unverified by human listening (BL-11).

## Earlier this week (M2: research branch and a ladder that spends, 2026-11-03)

- **Research branch (spec 12.2, 27.5).** `game/content/research.ts` declares three nodes in
  one short chain — Efficient Cutters (4 data, "one cutting pulse gives 7 scrap instead of
  5"), Smart Buffers (8, +6 input capacity per machine), Route Dispatch (12, +8 capacity for
  links created after purchase). Costs, prerequisite, and `maxRank: 1` are content data; the
  effect is an integer change to a quantity the simulation already reports, so a node can be
  checked without a formula. Purchases live in `sim.research` as `{nodeId: rank}`;
  `research.buy` refuses an unknown node, an unmet prerequisite (`prereq`), an unaffordable
  node, and a second rank (`already-known`), and a retried command id returns the first
  result. The panel shows the exact effect before the buy, and the dock gains a fourth
  target only once data exists. The signal lab blueprint (R11, 1 circuit → 2 data per 15 s)
  produces the currency.
- **The ladder now spends.** `nextYardStep` puts an affordable upgrade above the sell
  tranche and skips selling a resource that is still short for the next unbuilt machine, so
  a yard no longer sits at three machines with 900 credits and nothing bought. The upgrade
  target is the lowest level, then the busiest stage. Measured in the same scripted session:
  the three machines reached L7/L6/L6 with 27 credits left, where the previous build had
  964 credits, three level-1 machines, and a repeated "Sell 10 Scrap".
- **A refresh inside the lease window now credits the absence.** The store credited only at
  construction time, when the tab was already the writer; after a reload the previous
  document's 1.5 s lease was still live, so the new tab started as a follower and the gap was
  never credited. `creditAbsence()` now also runs when a reconcile promotes a follower, and an
  adopted snapshot carries its own write time so the window cannot be counted twice. The
  capture shows `tick 1010 → 433020` (432 000 ticks = the 12 h cap) and the report
  `Away 12h 0m · Your operation worked for 12h 0m (capped) · Scrap +881 · Steel +1 ·
  Deliveries 182 · Batches 15 · Bottleneck storage-full`.
- Measured in this run: `npm test` 108 passed / 108 (11 files; 14 new in
  `tests/simulation/research.test.ts`, 5 new in `tests/simulation/plan.test.ts`, 1 new in
  `tests/ui/app.test.tsx`, 1 updated handover expectation in
  `tests/persistence/lease.test.ts`), `npm run typecheck` clean, `npm run build` 204.02 kB JS
  (64.46 kB gzip, 50 modules).
- **Open finding, recorded as B-19.** In a long scripted session the yard reaches three
  machines and stops: the store holds `scrap 54, ferrous 1, nonferrous 1` while the furnace
  and recycler input buffers hold up to 12 each, and build prices are read from the store
  only. The store→machine links pull everything above the reserve floor in one go, so the
  price of the next machine never accumulates. B-19 sizes those pulls to the machine's real
  need; the ladder's pending-input rule already stops the surplus sells from adding to it.
- Known limitations: the research panel has no screenshot yet because the scripted session
  does not finish the circuit chain in the capture window, so its content is covered by the
  jsdom render test instead (see the gallery note); a follower's picture still steps at the
  10 Hz adopt cadence (B-18); the no-scroll gate is still only structurally verified in
  jsdom (BL-01); percentages remain lifetime-since-built (B-17); audio is unverified by human
  listening (BL-11).

## Earlier passes in one line

- **One writer per yard**: `persistence/lease.ts` keeps `{owner, heartbeatMs, revision}`, extra tabs
  mirror at 10 Hz without ticking, and promotion happens only once the 1.5 s TTL lapses. The store
  now keeps two clocks — `Date.now()` for the save reference, catch-up window and heartbeat, the
  page-relative timeline for frame deltas — which is what made a refresh inside the lease window
  credit its absence.
- **Bottleneck assistant**: per-machine `ageTicks`/`busyTicks`/`fullTicks` and per-route
  `ageTicks`/`busyTicks` counters live inside the simulation, so the panel's occupancy line is a
  measurement rather than a formula; `advanceTo` always steps the final tick, so both advance paths
  serialise identically, and `migrate` zero-fills the counters for older saves.
- Still true from those passes: motors, battery, plates, alloy and chassis exist as content but are
  unreachable until the plate press and motor bench blueprints arrive, and a save written before the
  wall-clock fix gets exactly one capped 12 h window on its first load.
- Full text of both passes is in the git history of `README.md` (before `0506f46`).


## Measured numbers (Node 22.18 on the development machine, `tests/perf/bench.test.ts`)

These are headless CPU costs for the simulation core, not mobile FPS claims.

| Workload | Median of 3 (this build, 60 s rate window) | Median of 3 (previous build) |
| --- | --- | --- |
| 12 h catch-up, 4-machine starter yard, tick-by-tick | 41.2 ms | 42.2 ms |
| 12 h catch-up, idle yard, event-jump path | < 1 ms | < 1 ms |
| 500 machines, 6 000 ticks | 41.7 ms | 41.0 ms |
| 100 machines, 10 000 ticks | 13.4 ms | 13.7 ms |
| 50 machines, 10 000 ticks | 6.4 ms | 6.1 ms |
| 5 machines, 10 000 ticks | 0.97 ms | 1.0 ms |
| 1 machine, 10 000 ticks | 0.71 ms | 0.8 ms |

Run-to-run spread on this machine is a few milliseconds (the same 12 h case read 41.9 ms and
29.9 ms in earlier passes), so treat these as bands, and every row above is inside that band: the
four new integers and the one extra compare per machine per tick are not measurable here. Earlier
reference points on the same harness: 33.4 ms / < 1 ms / 23.2 ms / 6.7 ms / 3.7 ms / 0.7 ms / 0.5 ms
before per-material routing, and 59.3 ms for the 12 h case at 22 links (B-23 took it to 18 links per
tick). The per-tick
occupancy counters added roughly 2 ms at 500 machines; the lease costs two extra `localStorage`
operations per second in the owning tab and one read per 100 ms in a follower, which the headless
table does not cover. The 12 h case stays inside the 100 ms stall budget of spec 21.5. This pass
changed only `src/ui/*` and CSS, so the table is the previous build's and still applies.

Layout numbers for this build are in `docs/evidence/2026-11-03-hud-share.md`: resting HUD ink share
**5.1 %–21.6 %** across the six sizes of spec 25.1 at the default text scale (32.7 % peak at 1.5,
57.4 % at 2.0), the no-scroll gate met in 18/18 contexts (six sizes × three text scales × three HUD
states), smallest touch target 46.8 × 46 px, every panel reporting 0 px of inner scroll with its
Close button on screen, and a minimum WCAG AA contrast of 5.77:1 over ten text pairs. That harness
is Chrome through `playwright-core` with `deviceScaleFactor` 2 on the phone sizes; it reports areas,
scroll extents and computed colours, not frame rate, so the real-device FPS and thermal rows of
spec 21.5 remain BL-01.

## Screenshot gallery

| File | Capture size | Scenario | Source |
| --- | --- | --- | --- |
| `docs/screenshots/latest-mobile.png` | 390 × 844 @2x | Scripted session, then a 12 h absence settled by the real catch-up path: 4 machines (sorter L14 ×670, furnace L12 ×276, polymer recycler L10 ×15, copper separator L11 ×45), 9 links, tick 435 390, 100 credits, store `scrap 10 ferrous 5 nonferrous 10 steel 11 copper 10 polymer 11`, four-chip HUD `Scrap 10 Ferrous 5 Credits 100 Store 59/900` as logged immediately before the shot, and a three-target dock whose primary reads `Sell 1 Steel` over `+10 credits` | Same commit as this README, Chrome headless via `scripts/capture.mjs`, captured 2026-11-03 11:28 local |
| `docs/screenshots/latest-machine-mobile.png` | 390 × 844 @2x | Same mobile session, a few seconds later (the frame loop keeps running): the polymer recycler is selected, its panel head row reads `Polymer recycler` beside `Close`, and the scrolling body under it shows `Status Needs input`, `Cycle 3.16s`, `Actual rate 0.08 batches/s · 60s window`, `Max rate 0.32 batches/s at full power`, `Working 0% · waiting for input 100% · output waiting 0% · link 12% busy · power 100%`, its next step names the copper separator as the limiter, and the dock offers the 197-credit upgrade to it (`3.16s → 3.00s`) | Same commit and session, Chrome headless, captured 2026-11-03 11:28 local |
| `docs/screenshots/latest-multitab.png` | 390 × 844 @2x | Second page in the same browser context while the first still owns the lease: `Following the other tab` with the `Take over` action, counters identical to the owner (`Scrap 10 Ferrous 5 Credits 100 Store 57/900`) | Same commit, two Chrome pages in one context, captured 2026-11-03 11:28 local |
| `docs/screenshots/latest-research-phone.png` | 390 × 844 @2x | Research panel at phone size on the mature yard: `Data 124`, then `Efficient Cutters - One cutting pulse gives 7 scrap instead of 5. Known`, `Smart Buffers - Every machine holds 6 more units of input, so short gaps do not halt it. Known`, `Route Dispatch - A newly connected link carries 8 more units per trip`. **Seeded context**: the same organic 240-round phone session is tried first and ended at 4 machines with `research: {}`, so this image shows the panel's appearance at 390 × 844, not a two-minute player path (D-35) | Same commit, separate phone-sized context with `docs/evidence/yard-mature.json` installed before first paint, Chrome headless, captured 2026-11-03 11:30 local |
| `docs/screenshots/latest-desktop.png` | 1440 × 900 @1x | Seeded mature yard (the save `scripts/probe-supply.mjs` writes, then the same 12 h absence): 8 machines at level 12–15 - sorter L15 ×1414, copper separator L13 ×680, wire mill L13 ×633, furnace L13 ×356, polymer recycler L12 ×226, circuit assembler L12 ×211, signal lab L12 ×188, plate press L12 ×168 - 18 links, tick 458 586, `data 124`, `wire 404`, `plates 148`, 0 credits left after the last upgrade, three research nodes known, and the centred 560 px dock reading `Sell 60 Ferrous` over `+120 credits` | Same commit as this README, separate Chrome context with `docs/evidence/yard-mature.json` installed before first paint, captured 2026-11-03 11:30 local |
| `docs/screenshots/latest-research.png` | 1440 × 900 @1x | Research panel open on that mature yard: `Data 124` and the same three effect lines, each ending in `Known`, with the buy buttons retired | Same commit and session as `latest-desktop.png`, Chrome headless, captured 2026-11-03 11:30 local |

Screenshots demonstrate appearance only: they do not prove audio, persistence, or
long-session behaviour, which are covered by the tests above. The handover and the two absences are
logged as text by the capture script rather than inferred from these images: organic mobile absence
`tick 1 020 → 433 030` with `Ferrous +110 · Nonferrous +549 · Steel +219 · Deliveries 342 · Batches
773 · Bottleneck storage-full`; seeded desktop absence `tick 26 526 → 458 536` with `Ferrous +154 ·
Wire +394 · Plates +138 · Data +114 · Deliveries 139 · Batches 992 · Bottleneck storage-full` (that
store starts near its 900-unit cap, so the credited window is storage-limited from the first minute);
lease `t1-jbxx → t1-5et5` with the tick advancing 435 400 → 435 431 at an unchanged revision 176 and
the promoted tab's card reading `Sell 2 Steel for 20 credits.` over the hint `A machine waits for
input; check its empty side.`
**Research panel:** two photographs, one per viewport width, both of the mature yard installed as a
seed save (`docs/evidence/yard-mature.json`, written by the supply probe), so the images and the
headless tables describe the same 8-machine, 18-link yard. The short organic phone session still ends
before `data > 0` — measured cause in decision D-35, fix recorded as B-28 — which is why the phone row
is a seeded context; `scripts/capture.mjs` tries the organic session first and prints
`research phone source:` with the answer. All six images were recaptured in one 11:28–11:30 run from
this build (artifacts `index-BONbSNIw.js` and `index-BTmHMPUU.css`), so they show the same HUD the
layout table describes: three buttons in the top-right cluster (`Sound ✓`, `A 1`, `Home`), a two-line
chip block at 390 px, a one-line objective card, and the dock's primary showing the verb over its
price.

## Architecture

```
src/
  app/store.ts            authoritative state owner, frame loop, save cadence
  game/content/defs.ts    resources, recipes R01-R12, blueprints, tuning
  game/content/research.ts research nodes, rank table, derived integer bonuses
  game/simulation/        types, engine (tick phases), commands, offline, invariants, autoconnect, plan
  game/renderer/scene.ts  camera, world/sprite drawing, ports
  game/audio/audio.ts     buses, cue table, bounded voice pool
  game/persistence/save.ts  envelope, checksum, validation, migration hook
  game/persistence/lease.ts single-writer lease (owner id, heartbeat, TTL)
  ui/                     App shell, HUD parts, panels, text, store hooks
tests/                    simulation, logistics, offline, persistence, ui, perf
scripts/capture.mjs       playwright-core screenshot capture plus the two-page lease check
scripts/probe-supply.mjs  reserve-floor sweep, link utilisation, and the mature-yard seed
scripts/probe-cadence.mjs build-before-upgrade versus upgrade-before-build (B-21)
docs/                     STATUS, BACKLOG, DECISIONS, BLOCKERS, ARCHITECTURE, screenshots
```

State flow: pointer intent → validated command → simulation transaction → new revision →
subscribed HUD summary plus renderer snapshot → persistence checkpoint. The renderer reads
the mutable state object each frame; React re-renders from a numeric view version, so
moving sprites do not re-render components (see `docs/ARCHITECTURE.md`). The lease holder is
the only tab that runs this flow; followers adopt whole checkpoints and render them.

Deeper notes: [ARCHITECTURE](docs/ARCHITECTURE.md),
[STATUS](docs/STATUS.md), [BACKLOG](docs/BACKLOG.md),
[DECISIONS](docs/DECISIONS.md), [BLOCKERS](docs/BLOCKERS.md).
