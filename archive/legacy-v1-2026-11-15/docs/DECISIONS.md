# DECISIONS

Format: date · problem · options · choice · reason · reversibility.

## D-01 · 2026-11-02 · Renderer

- Problem: draw a 6×6 yard, machines, cargo, drone, and effects on phones.
- Options: Canvas 2D; PixiJS/WebGL; DOM sprites.
- Choice: Canvas 2D behind a small `renderer/scene.ts` interface.
- Reason: one atlas-free scene, no extra dependency, measurable; the interface keeps a
  later PixiJS swap local. Bundle stays at 59 kB gzip.
- Affects: `src/game/renderer/*`. Reversible: yes, the draw call surface is one module.
- Reconsider when: atlas batching or more than ~200 simultaneously animated entities is
  needed, or a real-device trace shows Canvas 2D above the 10 ms p95 budget.

## D-02 · 2026-11-02 · Numeric representation

- Problem: exact, reproducible economic values across client and future server.
- Options: floating point; fixed-point; integer base units with rational progress.
- Choice: integer quantities everywhere; batch progress as integer milli-ticks plus an
  explicit remainder (`addRational`), normalised when the power epoch changes.
- Reason: no 0.1 + 0.2 drift, cheap validation, replay equality is exact.
- Reversible: yes; a mantissa/exponent type is planned only when values pass 1e12 (M4).

## D-03 · 2026-11-02 · Base timestep

- Problem: recipe cycles (4–30 s) and combat precision need one clock.
- Choice: 100 ms base tick (10 Hz), completion in whole ticks, renderer interpolates.
- Reason: matches `goal.md` 21.4, keeps all cycles as integers (4 s = 40 ticks).
- Reversible: yes, the tick constant is in one place (`content/defs.ts`).

## D-04 · 2026-11-02 · Power model

- Problem: what happens when requested power exceeds the yard budget.
- Options: offline machines; proportional slowdown; priority-first.
- Choice: proportional slowdown, `ratio = min(1, capacity / requested)`, shown as
  `Power limited: NN% speed`; progress uses exact rational accumulation.
- Reason: readable, no dead machine, matches spec 10.4. Priority groups are later.

## D-05 · 2026-11-02 · Store is the only spend source

- Problem: which quantities may pay for construction.
- Choice: purchases draw only from dock store quantities; in-buffer, tray, and in-transit
  units are reserved and not spendable.
- Reason: one honest affordability rule, no double counting, matches spec 8.2.
- Reversible: yes; a summary display of owned totals can be added without changing it.

## D-06 · 2026-11-02 · Store pull reserve floor

- Problem: a fully drained store strands the starter account (no scrap to build with),
  which spec 4.3 forbids.
- Choice: store-sourced routes leave a 10-unit floor per resource; policies can override
  it when they arrive (§7.5).
- Reason: keeps the tutorial's next build affordable while the drone is mid-flight.
- Reversible: yes, one constant in `simulation/engine.ts`, covered by logistics tests.

## D-07 · 2026-11-02 · Route direction rules

- Problem: cycles must not create free material (spec 10.3), yet the tutorial needs
  dock→sorter and sorter→dock.
- Choice: reject a direct machine↔machine reversal; treat the store as a hub that is not
  itself a cycle.
- Reason: preserves the two-phase starter chain while rejecting A→B→A loops.

## D-08 · 2026-11-02 · Batch input timing

- Problem: when inputs leave the input buffer.
- Choice: reserved at batch start into `machine.batch`, committed with outputs at
  completion; a completed batch waits in a bounded tray if the destination is full.
- Reason: matches spec 9.5, keeps `unitTotal` conserved at every tick (tested).

## D-09 · 2026-11-02 · React integration

- Problem: thousands of moving entities versus component renders.
- Choice: mutable authoritative state object owned by `app/store.ts`; React subscribes to
  a numeric view version via `useSyncExternalStore`; the canvas draws the state object
  directly each frame.
- Reason: one render path for HUD text, no per-frame reconciliation.
- Reversible: yes; the version number is the only coupling.

## D-10 · 2026-11-02 · Offline cap

- Problem: how much absence earns production.
- Choice: 12 h eligible production at full rate; the stored clock advances through the
  whole absence so a reload cannot re-claim the tail.
- Reason: spec 18.1 default, tested in `tests/simulation/offline.test.ts`.
- Reversible: yes, one tuning constant; 24 h needs evidence.

## D-11 · 2026-11-02 · Save envelope

- Problem: detect truncated or mismatched local saves.
- Choice: `{schemaVersion, checksum, payload}` with an FNV-1a checksum over the payload;
  rejection codes distinguish empty, parse, schema, checksum, and invalid-value failures;
  validation names the first violated invariant.
- Reason: cheap, no extra dependency, recovery paths are testable.
- Note: this is integrity, not tamper resistance; the online milestone adds server-side
  validation.

## D-12 · 2026-11-02 · Audio

- Problem: distinct feedback without asset weight.
- Choice: synthesised one-shots through six named buses with a 16-voice budget and a
  45 ms identical-cue coalescing window; created only after the Begin gesture.
- Reason: no binary assets yet, deterministic-ish, respects mute and hidden tabs.
- Pending: human listening review (B-11).

## D-13 · 2026-11-03 · One-way export prices

- Problem: after the one-shot onboarding contract, credits must remain earnable without a
  free conversion loop (spec 8.4).
- Options: a live market; per-recipe computed value; a static one-way price table.
- Choice: static `EXPORT_PRICES` per unit (`steel 10`, `copper 6`, `polymer 8`, `wire 4`,
  `circuits 30`, …), sold only above a 10-unit per-material reserve floor, in tranches of
  at most 60 units, and only after `exportClaimed` is set.
- Reason: materials are never repurchased for credits, so value can only grow through
  machine work under a shared power budget and bounded storage; the recipe graph is a
  topologically ordered DAG, verified by a cycle test.
- Reversible: yes, one table plus two tuning constants (`reserveFloor`, `sellBatchCap`).
- Reconsider when: a second sink competes for the same materials, or playtests show the
  tranche cap reads as a chore.

## D-14 · 2026-11-03 · One shared yard ladder

- Problem: the objective card and the dock button drifted (card said "Build Copper
  separator", button said "Upgrade Scrap sorter").
- Options: compute each independently; hardcode a second sequence; one pure planner.
- Choice: `simulation/plan.ts` returns a single `YardStep`
  (connect → affordable build → sell → expensive build → upgrade → salvage) that both
  surfaces format from.
- Reason: one authoritative next-step rule, testable without React, matches spec 3.3 and
  the "one primary action per screen" constraint.
- Reversible: yes; the ladder is one function and the panels take an explicit step.

## D-15 · 2026-11-03 · Progressive blueprint reveal

- Problem: seven blueprints at once violates "teach one action first" and crowds the dock.
- Choice: each blueprint declares `unlockAt` (tutorial step 4, 6, 7, 7, 8, 8, 9); the picker
  cycles only unlocked entries and shows label plus cost.
- Reason: two new machines arrive with the first credit decision, keeping at least two
  viable upgrade targets visible at once.
- Reversible: yes; `unlockAt` is data.

## D-16 · 2026-11-03 · Frame-render-safe timers

- Problem: the action toast never dismissed. Its effect depended on the whole `props`
  object, which is new on every animation-frame render, so the 1.8 s timer was re-armed
  about ten times per second.
- Choice: depend on the toast text only and call the callback through a ref.
- Reason: with a 10 Hz view version, any per-render dependency identity makes a timer
  unreachable. Recorded as a rule for future overlays.
- Evidence: regression test advances 1.9 s of real frames and asserts the toast is gone.

## D-17 · 2026-11-03 · Measured occupancy lives in the simulation state

- Problem: the bottleneck assistant needs percentages (spec 10.5) that survive a catch-up
  jump, not a view-side sampler that only sees the last rendered frame.
- Options: a UI-side sampler keyed by machine id; a fixed 600-tick rolling window in state;
  cumulative per-machine and per-route counters in state.
- Choice: cumulative counters in state (`ageTicks`, `busyTicks`, `fullTicks` per machine,
  `ageTicks`/`busyTicks` per route), incremented in one `measure` phase at the end of the
  tick; the assistant divides them and clamps to 0..100.
- Reason: one pass per tick (+2.8 ms at 500 machines), identical in every run, readable
  from a decoded save without replay, and it makes the jump path account for idle time.
- Reversible: yes; four additive fields, zero-filled on load by `migrate`.
- Reconsider when: a rolling window is needed for "recent rate" (spec 9.4) — that will add
  a small ring per machine, so measure it again at 500 machines.

## D-18 · 2026-11-03 · Jump path accounts for idle time and steps the last tick

- Problem: `advanceTo` skipped idle ranges, so counters and machine status could differ from
  a tick-by-tick run of the same length, which the determinism test compares.
- Choice: during a jump, add the skipped length to each machine's age (and to the waiting
  count when nothing is buffered or in progress), always leave the final tick to
  `stepTick`, and mirror the `starved` status the same way the tick does.
- Reason: keeps the two code paths byte-identical, which is what the offline path relies on;
  verified by a test that serialises both machines and routes.
- Reversible: yes; local to `advanceTo`.

## D-19 · 2026-11-03 · One step per screen, selection-aware

- Problem: with a machine selected, the objective card said "Build Copper separator" while
  the dock said "Upgrade Polymer recycler" — two different instructions on one screen.
- Options: the card always speaks for the yard and the panel carries machine actions; the
  card follows the selection; two independent ladders.
- Choice: one `YardStep` per screen. `stepForMachine` resolves the selected machine's own
  step (unmet link → the stage that is short of the missing material → its own upgrade),
  and the card, the dock label, and the dock action all come from that step. With no
  selection the yard ladder speaks.
- Reason: D-14's promise was that the two surfaces cannot disagree; a selection is part of
  the screen state, so it must feed the same single step.
- Reversible: yes; `objectiveFor(state, selected)` and `primaryFor(state, step)` are the
  only formatting paths, covered by a test that compares the card sentence with the dock
  label for the same machine.

## D-20 · 2026-11-03 · One writer per yard (multi-tab lease)

- Problem: two tabs of the same local save each ran their own frame loop, so each credited
  its own production and the last writer won — the yard's ledger depended on window order
  (spec 22.3).
- Options: last-write-wins with a revision check; both tabs replaying a shared command log;
  one lease holder plus mirroring followers.
- Choice: `persistence/lease.ts` stores `{owner, heartbeatMs, revision}` under
  `rustwake.lease.v1`. The first claimant writes; a later tab sees a heartbeat younger than
  1 500 ms and becomes a follower that (a) does not tick, (b) does not write, (c) adopts whole
  persisted snapshots when `tick` or `revision` moves ahead, and (d) shows one status line
  plus a **Take over** action. `takeOver()` succeeds only when the lease is absent, its own,
  or older than the TTL, so a live owner is never silently displaced; on promotion the new
  owner continues from the adopted ledger, and the demoted tab sees the live heartbeat at its
  next authoritative call.
- Reason: whole-snapshot adoption keeps one authoritative ledger with no merging rules, which
  is what the offline cap and the sell contract rely on. A 1.5 s TTL is imperceptible on a tap
  and short enough that closing the owner tab hands over inside one second.
- Evidence: `tests/persistence/lease.test.ts` (7 cases: claim, TTL boundary, release, corrupt
  record, non-writing follower, mirrored snapshot, handover plus demotion) and a real-Chrome
  two-page session printed by `scripts/capture.mjs`.
- Reversible: yes; the lease is one extra key, and with storage absent (or one tab) the
  single-writer path is unchanged.
- Reconsider when: the online milestone replaces this with server revisions, or a follower's
  10 Hz mirror reads as choppy and needs interpolation from the owner's snapshots.

## D-21 · 2026-11-03 · Two clocks, absolute for the ledger and page-relative for frames

- Problem: with the lease in place it became visible that the store used `performance.now()`
  for everything. That clock restarts at 0 in each document, so a reopened tab computed the
  absence as `(small − large) → 0` and credited nothing, and a lease heartbeat written in one
  tab could not be compared in another.
- Choice: `now()` is the absolute wall clock (`Date.now()`) and feeds `lastSeenMs`,
  `catchUp`, and the lease; the frame delta uses the monotonic page timeline
  (`performance.now`, injected as `frameClock` in tests), seeded from the rAF timestamp.
- Reason: an absence and a lease timeout are cross-document facts; a frame delta is not.
  Injecting both clocks keeps the tests deterministic.
- Evidence: `lastSeenMs` is now a 13-digit epoch stamp in the real capture
  (`1793689384704`), and `tests/persistence/save.test.ts` asserts that shape.
- Reversible: yes; one default per clock.
- Note: envelopes written before this change carry a page-relative `lastSeenMs`, so their
  first load is credited exactly one capped 12 h window and then re-stamped — no repeated
  claim, because the reference moves forward on that first load.

## D-22 - 2026-11-03 - Research as typed content with integer bonuses

- Problem: spec 12.2 wants a research graph whose exact effect is visible before purchase,
  without a formula engine or a per-node special case in the simulation.
- Choice: `game/content/research.ts` holds `{id, label, effect, cost, requires, maxRank}` and
  a derived `researchBonus()` returning plain integers (`pulseScrap`, `inputBuffer`,
  `routeCapacity`). `SimState.research` is `{nodeId: rank}`; the engine reads it through
  `inputCapacityFor` and the command layer through the bonus, so every effect is an integer
  change to a quantity the state already reports.
- Reason: one table drives panel, cost, and effect; `maxRank: 1` makes "applied exactly
  once" a data property that `research.buy` enforces with `already-known`, and the save
  validator rejects an unknown node id or a negative rank instead of clamping them.
- Evidence: `tests/simulation/research.test.ts` (14 cases) checks pulse 5 to 7, buffer 12 to
  18, new-link 24 to 32 with the old link unchanged, parity between `advance` and `advanceTo`
  with nodes owned, and a legacy envelope without the field loading as an empty map.
- Reversible: yes; the field is additive and zero-filled by `migrate`.
- Reconsider when: branches exceed a handful of nodes or a node changes a rule rather than a
  quantity, which is the point to introduce an effect enum instead of an integer triple.

## D-23 - 2026-11-03 - Ladder priority: spend, and never sell a pending input

- Problem: with the lease work done the scripted session exposed a stall - three machines at
  level 1, 964 credits, and the same `Sell 10 Scrap` action forever. Sells were always
  available (the drone delivers every 5 s), so they permanently preempted the upgrade step,
  and each sell trimmed the surplus to the reserve floor, below most machine prices.
- Choice: order is now unmet link, affordable build, affordable research node, affordable
  upgrade (lowest level, then highest `busyTicks`), surplus sell skipping resources that are
  still short for an unbuilt blueprint, nearest build, then any sell.
- Reason: spec 10.5 asks for one evidence-based recommendation and explicitly allows "no
  purchase needed"; a permanent repeatable sell is not a recommendation, and a sell that
  blocks the next machine is the wrong trade.
- Evidence: same scripted session now reaches L7/L6/L6 with 27 credits, and
  `tests/simulation/plan.test.ts` pins each rule, including the skipped-pending sell and the
  two upgrade tie-breaks.
- Reversible: yes; `nextYardStep` is one function with no state beyond the counters it reads.
- Reconsider when: B-19 changes what the store holds, because the pending-input rule reads
  store quantities only.

## D-24 - 2026-11-03 - Credit the absence on promotion as well as at creation

- Problem: `catchUp` ran only when a store was created while already holding the lease. After
  a reload the previous document's lease is usually still under the 1.5 s TTL, so the new tab
  started as a follower and the whole absence was never credited.
- Choice: extract `creditAbsence()` (credit, advance the reference, keep the report only when
  `creditedTicks > 0`, checkpoint), call it at creation for a writer and from `reconcile()`
  whenever a follower is promoted; an adopted snapshot also adopts its `lastSeenMs`.
- Reason: one economy across active and away states (spec 18.1), no double claim because the
  reference moves to `now()` at the first credit and the adopted value is the newest write.
- Evidence: the capture prints `tick 1010 -> 433 020` (exactly the 432 000-tick cap) plus the
  report line, and `tests/persistence/lease.test.ts` now expects 15 credited ticks for a
  1 501 ms following window.
- Reversible: yes; the helper is local to the store.

## D-25 - 2026-11-03 - Size a store pull to two ready batches, not to the whole buffer

- Problem: the full-drain pull left `scrap 54, ferrous 1, nonferrous 1` in the store while
  twelve-unit input buffers held the rest, and every price, sell, and build check reads the
  store only, so the yard could not afford its fourth machine (B-19).
- Choice: `pullNeed` = `min(effective input capacity, per-batch units of that resource × 2 +
  Smart Buffers bonus)` minus what is already ready (input buffer plus this link's in-transit
  cargo). Two batches covers the running batch, whose inputs are reserved separately in
  `machine.batch`, and the next one, and 2 × per-batch ≥ the 5-tick link latency for every
  shipped recipe.
- Reason: the machine still cannot starve between taps, and the surplus becomes affordable
  material where the transaction rules already look.
- Evidence: the 30-minute self-play driver goes from 3 machines (sorter 29, furnace 5,
  recycler 0) to 7 on 21 links with the sorter at 439 batches; the ready window is pinned at
  4 units plain and 10 with Smart Buffers in `tests/simulation/research.test.ts`.
- Reversible: yes, one helper in `engine.ts`.
- Reconsider when: a recipe's two-batch window stops exceeding the link latency (a much higher
  level cap or a longer-lat link), or B-15 changes the reserve floor.

## D-26 - 2026-11-03 - Ship each tray item over the least-busy link that carries it

- Problem: the whole tray moved over `machine.outRoute`, so R01's nonferrous travelled with the
  ferrous into the furnace's 12-unit input buffer, filled it with a material the furnace cannot
  use, and stalled the sorter at 30 batches in a 12-hour session.
- Choice: per-item routing. For each tray item pick the first matching link with room at both
  ends, ranked by fewest `busyTicks` (ties keep creation order), then a null-filter link, then
  the machine's first outgoing link so a half-connected machine still ships.
  `planConnections` proposes one link per output material and one per source/material pair.
- Reason: spec 9.3 gives R01 two outputs and spec 10.1 wants each visible link to carry real
  cargo; the least-busy ranking keeps the dock link and the direct link both busy instead of
  one starving the other, and it is a pure function of serialised state.
- Evidence: phone session sorter 30 → 619 batches and furnace 5 → 301, return report
  `Ferrous +9 · Nonferrous +583 · Steel +286 · Deliveries 365 · Batches 875`; the yard reaches
  the circuit assembler in the headless driver; 109 tests pass, including the existing
  `advance`/`advanceTo` parity case with the new routing.
- Reversible: yes; routing is chosen inside `enqueueCargo`, and the saved `RouteState` shape is
  unchanged.
- Reconsider when: a link's latency or capacity becomes a tuned trade-off worth exposing, or
  the dead-link audit (B-22) shows a link stuck at 0 % busy.

## D-27 - 2026-11-03 - Keep the reserve floor at 10, and size the surplus on real leftovers

- Problem: two supply-knob values were guesses — the reserve floor the sell rule
  leaves in the store, and the two-batch pull window from D-25. Both needed a
  measured value or a measured reason (B-15, B-25).
- Choice: keep `TUNING.reserveFloor = 10` and `pullNeed = 2 × per-batch units`. A
  30-minute self-play run per floor (1 800 rounds at one ladder command per second,
  exactly the driver in `tests/simulation/chain.test.ts`) gives machines
  4 / 5 / 7 / 8 and total batches 670 / 1152 / 1196 / 1137 for floors
  0 / 5 / 10 / 20: floor 0 starves the first builds, floor 20 buys one extra
  machine but 59 fewer batches, and 10 is the best of the four on throughput.
- Choice (B-25): the window is right because the leftover pattern shows it. At
  floor 10 the yard ends with 22 links at 16.6 % aggregate busy, the sorter at
  98 % (439 batches) and the copper separator at 61.8 % (208), and the only idle
  links are the three that duplicate an already-carried material into the last
  machine built. That machine still holds 16 ready units while it waits, so
  `2 × per-batch` is not the binding constraint any more; a larger window would
  only move units out of the store that prices, sells, and builds already read.
- Evidence: `docs/evidence/2026-11-03-supply-window.md` (regenerate with
  `npx tsx scripts/probe-supply.mjs`), and
  `tests/simulation/supply-window.test.ts` reproduces the same four numbers inside
  the suite (112 tests pass), so the tables and the assertions cannot drift apart.
- Reversible: yes; two constants in `src/game/content/defs.ts`.
- Reconsider when: link latency or capacity becomes a tuned value, a recipe with a
  much longer two-batch window ships, or the 1-minute measured rate window (B-17)
  shows a machine below 80 % busy while the store still holds that input.

## D-28 - 2026-11-03 - One link per material, chosen by the endpoint this machine owns

- Problem: the audit in B-22 found three of 22 links at 0 % busy, all pairs that
  already had a link for the same material - `store>machine7:wire` beside
  `machine5>machine7:wire`, `machine3>machine7:polymer` beside
  `store>machine7:polymer`. Spec 10.1 forbids a link that carries nothing.
- Cause: `hasInputLink` matched the *source* id as well as the destination and the
  filter, so a link that already carried the material from another source did not
  count, and the next `connect` tap added a parallel path.
- Choice: key a plan on the endpoint this machine owns - inputs on
  `(destination machine, material)`, outputs on `(source machine, material)` - and
  pick the source by who can actually deliver: the store when it holds at least one
  batch (its pull is window-sized, two ready batches in one tap), otherwise the
  producing machine, otherwise nothing.
- Considered: (a) keep both links and let the router spread cargo, measured at
  1 196 batches with 3 idle links and no research reached; (b) producer-first,
  926 batches, 1 node, 0 idle links; (c) store-first as shipped, 1 018 batches,
  3 nodes, 0 idle links, 18 links total. All from the same 30-minute driver.
- Reason: (c) is the only variant with no idle link that also reaches the signal lab
  and buys research inside the window, and it converts further down the chain: the
  circuit assembler went from 1 batch to 38 and the store ended with `data 20`. The
  lower batch total is two extra low-volume stages sharing one scrap supply, not a
  slower factory; the 12 h catch-up case improved 59.3 ms → 42.2 ms because a
  settled yard walks 18 links per tick instead of 22.
- Supersedes: the floor-sweep table in D-27 (measured on the duplicate-link
  topology). The shipped reserve floor is unchanged: after this change floors
  {0, 5, 10, 20} all finish at 8 machines and 3 nodes with 1 075 / 1 056 / 1 018 /
  1 103 batches, so 10 stays for the sellable-surplus reason and the floor is no
  longer a limiting knob.
- Evidence: `tests/simulation/autoconnect.test.ts` (4 cases: producer link below one
  batch, store link at a full batch, idempotent second call, one link per output
  material), the restated `tests/simulation/supply-window.test.ts` (0 idle links at
  every floor), and `docs/evidence/2026-11-03-supply-window.md`.
- Reversible: yes; one function and two predicates in `autoconnect.ts`, no saved
  shape change, so no schema bump.
- Reconsider when: a machine needs the same material from two sources at once (a
  filtered or weighted link), which is the point to store per-source demand on the
  route instead of one filter per link.

## D-29 - 2026-11-03 - Two samples on a 600-tick grid for the measured rate window

- Problem: the panel's `Actual rate` divided lifetime `batchesDone` by the session
  tick, so a machine that stopped a minute ago still read as if it were running.
  Spec 9.4 asks for a recent rate over a defined window, 60 s, or all available time
  for a new machine.
- Choice: each machine carries two samples `(rateAge, rateFrom)` and
  `(rateAgePrev, rateFromPrev)` on a fixed 600-tick grid keyed on its own
  `ageTicks`. Once one window exists the published span is exactly
  `rateAge - rateAgePrev` = 600 ticks; before that the reading uses all available
  time, which is the spec's own new-machine clause.
- Considered: (a) a single sample reset every 600 ticks - the window length then
  cycles 1..600 ticks, so the same factory reads 0.00 then 0.45 batches/s within one
  minute; (b) a ring of ~32 completion ticks - exact trailing window at any length,
  but the ring size caps the measurable rate and an array enters the hot loop; (c)
  the shipped two-sample grid.
- Reason: (c) keeps a fixed window length, so the label the player reads is stable,
  and costs one integer compare per machine per tick plus a roll once a minute.
  Measured on the existing harness, the numbers stay inside the run-to-run spread
  (12 h case 41.2 ms against 42.2 ms, 100-machine case 13.4 ms against 13.7 ms), and
  the whole-machine JSON is still identical between `advance` and `advanceTo` because
  an event jump covers only ticks in which nothing completes.
- Trade-off stated to the player: a completed window can lag the current tick by up
  to 60 s, so the panel prints the span it used rather than implying "now". The
  lifetime occupancy line stays as the second, longer-window evidence.
- Evidence: `tests/simulation/rate-window.test.ts` (young machine uses all available
  time; the first full window reads 60 s; a starved tail reads 0.00 while the
  lifetime average is positive; byte parity between the two advance paths; a save
  written before the fields existed still yields a finite reading) and the panel
  assertions in `tests/ui/app.test.tsx`.
- Reversible: yes; four integers per machine, one pure reader function, schema
  version unchanged.
- Reconsider when: the panel needs a sub-minute reading (a live sparkline or a
  10-second response), which is the point to switch to the completion-tick ring.

## D-30 – 2026-11-03 – HUD chip budget and dock width from measurement

- Problem: the resting HUD had never been measured against the 15–22 % area target in
  spec 5.2, and the first measurement put the narrowest phone at 24.2 % of the visual
  viewport with three wrapped chip rows.
- Options considered: (a) leave the layout as it is and record 24.2 % as "roughly" the
  target; (b) shrink the fonts, which spec 6.4 subordinates to readability; (c) bound the
  chip count and the dock width, which are the two boxes that scale with content rather
  than with the viewport.
- Chosen: (c). `hudChipLimit(width)` budgets four chips at ≤ 420 CSS px and seven above,
  and the credits and Store status chips pay for themselves out of that budget, so
  `visibleResources` receives what is left. The dock is capped at `min(100%, 560px)` and
  centred, per spec 5.2's "sensible maximum widths" instead of stretching across a wide
  screen. Chip padding went 4 px → 3 px and `.dock__btn` min-height 48 px → 46 px, both
  still above the 44 px minimum of spec 6.2.
- Measured effect (same script, same seed, `docs/evidence/2026-11-03-hud-share.md`):
  360 × 640 ink share **24.2 % → 22.1 %** with the chip block 90 px → 55 px tall;
  390 × 844 **16.2 % → 14.7 %**; landscape 844 × 390 **24.2 % → 21.1 %**; desktop
  1440 × 900 **8.4 % → 5.4 %** once the dock stops spanning 1 420 px. Smallest target
  46.8 × 46 px, four dock targets at rest and three in build mode.
- Trade-off stated: a portrait phone now shows one material chip instead of two
  (plus Scrap, Credits and Store). The full list stays one tap away in the store panel,
  and every contextual cost line still names its materials, as spec 5.4 allows.
- Reversible: yes; one pure helper, one integer argument, three CSS values.
- Reconsider when: the text-scale audit (B-13) shows the larger scale needs a different
  budget, or a fifth chip becomes necessary for a new currency.

## D-31 — 2026-11-03 — Large-text layout: in-flow panels, one scale control, Escape order

- Problem: at 2.0 text scale the absolutely positioned panel overflowed its own box (105 px of
  inner scroll at 360 × 640, 165 px in landscape) with the Close button pushed out of view, the
  15 px base font had no in-game control, and two secondary HUD affordances (focus ring, Escape)
  were not implemented at all. Spec 6.4 requires adjustable text, visible focus, reduced motion
  and a reduced HUD at large settings; spec 5.5 fixes the Back/Escape order.
- Options considered: (a) keep `position: absolute` panels and hand-tune a `bottom` offset per
  scale, which broke as soon as the dock grew past its 46 px minimum; (b) make the panel a normal
  flex child of the HUD column so the column itself does the stacking; (c) four separate
  settings rows in a settings panel, which costs a tap during play for the one setting that is
  checked against the screen.
- Chosen: (b) plus one cycling control. `.panel` is now an in-flow `align-self: center` flex
  column with `margin-top: auto`, a non-scrolling `.panel__head` (title and the only Close
  button) and a scrollable `.panel__body`; every panel in `Panels.tsx` uses that shape. One
  cluster button `A {scale}` cycles 1 → 1.25 → 1.5 → 2 through the persisted `textScale`, and
  `root.style.setProperty("--text-scale", …)` scales the whole HUD. At scale ≥ 1.5 the
  objective's secondary hint line and one chip step back (`.text-large`, `hudChipLimit`), which
  is the reduction spec 6.4 asks for; readable text outranks decoration, so the world loses area
  rather than the type shrinking.
- Also in this record: `prefers-reduced-motion: reduce` is read with `matchMedia` once on mount
  and written into the same settings object the game's own toggle uses; Escape closes the return
  report, then the open panel, then build mode, in that order, and a scripted `focus()` is
  joined by a real `:focus-visible` ring (`2px solid var(--cyan)`, `outline-offset: 2px`).
- Measured effect (`node scripts/measure-hud.mjs`, three scales × six sizes × three states,
  `docs/evidence/2026-11-03-hud-share.md`): every panel reports **0 px inner scroll** and
  `Close inside = yes` with **no dock overlap** in all 18 contexts (store panel at 360 × 640:
  105 px → 0 px, landscape 165 px → 0 px); no document scroll in 18/18; minimum contrast
  5.77:1 over the 10 measured text pairs at all three scales; resting ink share 21.6 % at
  360 × 640 and 14.3 % at 390 × 844 at the default scale, 32.7 % at 1.5 and 57.4 % at 2.0.
- Trade-off stated: at the largest scale on a 360 × 640 screen the HUD paints about 57 % of the
  viewport, which is what 30 px text costs; the alternative is shrinking the type, which spec 6.4
  forbids. The 15–22 % band of spec 5.2 is reported as a default-scale target.
- Reversible: yes; CSS layout plus one helper argument, one button, two effects.
- Reconsider when: a real-device trace (BL-01) shows the 584 px-tall dock row hurting
  reachability, or a fourth cluster button is needed and the top row no longer fits two chips.

## D-32 — 2026-11-03 — HUD density: one-line card, verb-plus-price dock, height-aware chips

- Problem: three measured layout costs survived D-30/D-31 — the row-union band was 23 % at
  360 × 640 and 26.2 % at 844 × 390 (spec 5.2 names 15–22 %), the resting HUD painted 57.4 % of a
  360 × 640 viewport at text scale 2.0, and at that scale the fourth dock target hung 21 px past
  the right edge, hidden by the game root's `overflow: hidden`.
- Options considered for the card: keep the long sentences and let them wrap to two lines; move
  the card beside the chip row (which the 190 px chip block plus a 209 px cluster leaves no room
  for at 360 px); or shorten each ladder sentence to one line and let the panel carry the detail.
  The third wins because spec 4.4 asks for short concrete verbs and spec 12.2 only requires the
  exact effect to be visible *before purchase*, which the research panel does beside its own button.
- Chosen:
  - **One line per card sentence.** `Upgrade the Scrap sorter.` replaces
    `Improve recovery or production: upgrade Scrap sorter.`, and `Research Efficient Cutters · 4
    Data` drops the trailing effect clause. `tests/ui/app.test.tsx` pins ≤ 48 characters.
  - **Verb and price on the dock, noun on the card.** `primaryFor` returns `Upgrade` +
    `30 credits`; the card directly above names the machine and starts with the same verb, so the
    two surfaces still phrase one goal (spec 3.3), tested by the shared first word.
  - **Height-aware chip budget**: `hudChipLimit(width, scale, height)` takes 5 on a viewport
    ≤ 460 px tall, which is the count that fits one wrapping row at 844 px.
  - **Density rules**: `.text-large` gives chips 1.15 leading with 5 px padding, the dock gap 4 px
    with `flex-wrap: wrap`, dock padding `0 3px`, and the sound button the glyph `♪`/`✕` (the
    long form stays as its accessible name). `@media (max-height: 460px)` hides the secondary hint
    line and caps the card at 400 px and the dock at 520 px — 520 px is the four buttons' combined
    min-content width, so a smaller cap would leave them past their own box.
  - **New audit gate**: `scripts/measure-hud.mjs` records the furthest painted right/bottom edge
    per state and lists any box past the visual viewport. This is what exposed the clipped fourth
    dock target; both the 1.5 and 2.0 tables are now clean in 18/18 contexts.
- Measured effect (`docs/evidence/2026-11-03-hud-share.md`): band 23 % → **20.6 %** at 360 × 640
  and 26.2 % → **21.9 %** in landscape at the default scale; ink 21.6 % → **19.2 %** and at 1.5
  32.7 % → **19.5 %**, both inside the spec 5.2 band; at 2.0 57.4 % → **40.5 %** with the dock
  block 144.9 px → 118 px. Smallest dock target 94.6 × 46 px and smallest icon button 44 × 65.2 px
  at 2.0, so spec 6.2 still holds. No document scroll in 18/18.
- Trade-off stated: the dock's fourth target now starts a second wrapped line at 2.0 (a 340 px
  full-width button under three narrower ones) instead of being clipped; the two-line card keeps
  the machine name rather than the numbers, which are on the button and in the panel.
- Reversible: yes; four CSS rules, three string changes, one optional helper argument.
- Reconsider when: a fifth dock target arrives (the wrap budget changes), or a real-device trace
  (BL-01) shows the glyph cluster being read less reliably than the words.

## D-33 — 2026-11-03 — Headless ladder drivers claim the onboarding export contract

- Problem: the 30-minute self-play drivers (`tests/simulation/chain.test.ts`, the floor sweep in
  `tests/simulation/supply-window.test.ts`, `scripts/probe-supply.mjs`) jump from the repaired drone
  to `tutorial = 9`, which skips T7's one dock press on `Sell steel · 30 credits`. `sellResource`
  returns `locked` while `exportClaimed` is false (commands.ts:301), so **every** sell was rejected:
  the ladder ran 1 634 sell steps for 0 credits, never reached an upgrade price, and finished with
  eight machines all at level 1 while the scripted Chrome session of the same build showed L12–L15.
  Two harnesses describing one economy, which is what B-21 was opened for.
- Options considered: (a) set `state.exportClaimed = true` directly, as the pure-ladder cases do —
  it skips the 3-steel payment, so the ledger reconciliation would no longer describe the shipped
  path; (b) replay the tutorial step by step, which is what `tests/ui/app.test.tsx` already covers;
  (c) mirror the app's own mapping inside the loop — claim once the store holds
  `TUNING.exportContractSteel` steel, exactly the condition `offline.ts:90` uses for
  `objective.export`.
- Chosen: (c) in all four drivers, one `contract.export` command on the first round it is possible.
- Measured effect (same scripts, `docs/evidence/2026-11-03-supply-window.md`): the shipped yard now
  ends the half hour at 8 machines with levels L13/L12/L10/L11/L10/L9/L8/L8, 1 757 batch completions
  on 18 links, 25 credits, 3 research nodes, and the ladder's step histogram gains
  `upgrade: 390` where it previously had none. The floor sweep changes shape: floors
  0 / 5 / 10 / 20 give **5 / 7 / 8 / 8** machines and **1 456 / 1 457 / 1 757 / 1 677** batches, so
  a floor below 10 now measurably costs stages (it strips the store below the next blueprint's
  price) and 10 remains the shipped value with the best total. This restates the floor table in
  D-27 and D-28, which were measured with the locked market.
- Trade-off stated: the claim and the ladder step share one round, so the driver runs 1 801
  commands in 1 800 seconds of simulated time; the payment itself is the same transaction the
  player's tap issues.
- Reversible: yes; one condition plus one command in four driver loops, no `src/` change, so the
  bundle is byte-identical (`index-BONbSNIw.js`, `index-BTmHMPUU.css`).
- Reconsider when: the tutorial's own export step moves into the ladder (then the drivers can call
  `nextYardStep` alone), or `exportContractSteel` changes and the claim condition must follow it.

## D-34 — 2026-11-03 — The ladder's build/upgrade priority is not a lever at 30 minutes

- Problem (B-21): the ladder checks `build` before `upgrade` (D-23). Against the headless yard that
  reached eight machines at L1 and the scripted one at L12 with four machines, that order looked
  like the unmeasured variable.
- Chosen: keep the shipped order, on measurement. `scripts/probe-cadence.mjs` runs the same ladder
  twice with only that pair swapped (`upgrade` before `build`), and the totals are identical in both
  rows — 8 machines, 1 757 batches (58.6/min), 25 credits, 3 nodes, the same eight levels, the same
  per-kind step histogram (`sell 864, build 534, upgrade 390, connect 9, research 3`).
- Reason: the swap can only matter on a round where both branches are available. The probe counts
  those rounds: **0 of 1 800** in either order. Credits are consumed the moment they reach the
  cheapest upgrade price (`upgradeCost(30, 1)` for the sorter), so the credit balance is short while
  materials accumulate for the next blueprint, and vice versa; the two states barely overlap.
  Table: `docs/evidence/2026-11-03-cadence.md`.
- Also measured, and the reason the two sessions differ at all: 534 of the 1 800 rounds are the
  `build` kind and only 8 of those are accepted — the rest are the near-goal probe that shows the
  player a price while the store is short, which is by design (D-23, spec 10.5).
- Reversible: yes; the probe is a script and `tests/simulation/cadence.test.ts` pins both rows plus
  the 0-ambiguous count.
- Reconsider when: a second drone or a second currency changes how fast the credit balance and the
  material surplus move relative to each other (B-28), because that overlap is what makes the
  priority matter.

## D-35 — 2026-11-03 — One starter drone is the binding constraint, so the phone research image is seeded

- Problem: with the post-absence phase raised to 240 rounds the phone session still never shows the
  Research dock (`research: {}`), so the phone-size research image stayed uncaptured (B-25).
- Measured cause: that session ends at `tick 435 380` with four machines on 9 links, 100 credits and
  a store of `scrap 10 ferrous 5 nonferrous 11 steel 11 copper 12 polymer 11` — every material at or
  one unit above the reserve floor. The starter drone delivers 5 units per 5 s (1 scrap/s) while the
  sorter at L13 consumes about 1.2/s, so the store's scrap pins at the floor and the 30–50-scrap
  blueprint prices are only met by chance; the ladder therefore spends its rounds on upgrades and
  surplus sells and never reaches the wire mill, whose output the signal lab needs for `data`.
  The headless driver, which starts the same ladder without the saturating 12 h absence, reaches
  eight machines at round 731 and its first node at 797 — the absence is what changes the balance.
- Chosen: photograph `latest-research-phone.png` from the same seeded mature yard the desktop row
  already uses (`docs/evidence/yard-mature.json`, installed before first paint in a 390 × 844 @2x
  context), and keep the organic attempt as the primary path so the image upgrades itself to the
  organic session as soon as that session unlocks the dock. The gallery says which source produced
  each file, and `scripts/capture.mjs` prints `research phone source: …`.
- Trade-off stated: the seeded image proves the panel's appearance at phone size, not that a
  two-minute session reaches it; that comprehension gate stays BL-02.
- Reversible: yes; a context block in the capture script.
- Reconsider when: B-28 (a second drone, or a delivery-sized store) lets the organic session reach
  the signal lab inside 240 rounds, which is expected to make the seed unnecessary.

## D-36 — 2026-11-03 — An imported save takes the importing device's clock as its reference

- Problem: the same envelope can be applied on a second device seconds after the first wrote it.
  If the imported `lastSeenMs` survived, the new device would credit the exporting device's whole
  absence **and** its own, so one yard could claim two overlapping 12 h windows in a row
  (spec 18.1 asks for one economy, spec 28.1 fixes the single-window rule).
- Choice: `store.importSave()` decodes and validates first, refuses while the tab is a read-only
  follower (`reason: "read-only"`), and on success swaps the whole yard in one step, writes
  `lastSeenMs = now()` from this device's clock, checkpoints immediately, and returns
  `{ok: true, tick, machines}`. A refused file changes nothing at all: the live `state`,
  `settings`, and the stored envelope stay exactly as they were, which the tests compare by
  serialised snapshot.
- Reason: the alternative — keeping the imported stamp — makes the return report a function of
  which device happened to write last, and a repeated reload of the same pasted text would claim
  the discarded tail again (spec 18.1 says it must not).
- Evidence: `tests/persistence/transfer.test.ts` (nine cases: byte-identical export, identical
  restore in another store, idempotent second import, the clock rule plus a reopened store whose
  report is `null`, damaged checksum, newer schema, unparseable text, empty text, violated
  invariant named in `detail`, settings carried across, and a follower's refusal), and the
  `App`-level pair in `tests/ui/app.test.tsx` (record page shows the field, Apply settles the
  yard at the source tick 698 with one machine, a damaged paste leaves the JSON snapshot equal).
- Reversible: yes; two store methods and one panel.
- Reconsider when: the cloud milestone (M5) brings a server clock, which replaces `now()` with the
  authoritative timestamp and turns the same rule into a server-side one.

## D-37 — 2026-11-03 — Dock: 44 px width floor, 6 px gap, and the primary takes the spare room

- Problem: the fifth dock target (`Yard`, B-06) at 360 px width pushed the shortest label to
  **41.5 × 56 px**, under the 44 px floor of spec 6.2, and the primary's label wrapped to two
  lines so the stretched row became 56 px tall — the resting HUD band rose from 20.6 % to 22.1 %
  at 360 × 640, outside the 15–22 % target of spec 5.2.
- Choice: `min-width: 44px` on `.dock__btn`, the row gap 8 → 6 px, the button font 0.92 → 0.88rem,
  and `flex: 6 1 auto` on `.dock__btn--primary` so the one two-line button claims the leftover
  width instead of the short labels growing to no purpose.
- Reason: with five targets the row has 340 px, and the five labels need 316 px of content plus
  24 px of gap; the earlier 8 px gap plus a 41 px label left nothing for the primary, so the
  wrap — not the count of targets — was what cost the 1.5 points of band.
- Evidence: `node scripts/probe-dock.mjs` reports the row as five buttons of 47/44/110/46/69 px
  at 46 px height, all labels one line; `node scripts/measure-hud.mjs` then gives band
  **20.6 %** at 360 × 640, 15.7 % at 390 × 844, 14.5 % at 412 × 915, 21.9 % landscape, and the
  smallest dock target **44 × 46** px on the narrowest phone, with no clipping in 108 states.
- Reversible: yes; three CSS declarations.
- Reconsider when: a sixth target is unlocked (spec 5.5 caps the narrow dock at five), or when the
  label set grows past what 340 px holds — `scripts/probe-dock.mjs` prints the per-button boxes for
  both ladder states, and the longest label the ladder produces, `Research Efficient Cutters`,
  measures 130 × 54 px with the row at 54 px and a band of **21.8 %** at 360 × 640.

## D-38 — 2026-11-03 — A credit-priced drone fleet, added one unit at a time

- Problem (B-28): D-35 measured one repaired drone as the binding constraint of the young yard —
  5 units per 5 s (1 scrap/s) against an L13 sorter's ~1.2/s — so the store pinned at the reserve
  floor, blueprint prices were met only by chance, and the post-absence session stopped at four
  machines with `research: {}`.
- Options considered: (a) raise `droneDeliveryUnits` or shorten `droneDeliveryTicks`, which changes
  one number but removes the purchase from the ladder and the choice from the player; (b) raise
  `dockCapacity`, which stores the same trickle without raising it; (c) a second and later third and
  fourth unit bought with credits, each running the same route independently.
- Chosen: (c). `SimState.spares: DroneState[]` sits beside the starter's own `drone` record, so a
  v1 save without the field simply has no spares and `migrate` zero-fills the array;
  `drone.add` costs `TUNING.droneAddBaseCost × 2^spares` = 45 / 90 / 180 / 360 credits up to
  `TUNING.fleetCap = 5` units. The ladder gains one stage, `{ kind: "drone" }`, placed after the
  `build` and `research` stages and immediately above `affordableUpgrade`, so the only purchase that
  raises what the wreck yields goes in before the percentage sinks. Every phase loops per unit, and
  the ledger, the rate window, the offline report, and the renderer sum over the fleet.
- Reason: each unit is the same 5-unit/5 s cycle, so two units are 2 scrap/s while the finite wreck
  pool still decides the total — efficiency and work rate, not new matter (spec 7.2). The doubling
  price keeps the fleet a sequence of real decisions against upgrades (spec 8.6).
- Measured effect (`npx tsx scripts/probe-supply.mjs`, `docs/evidence/2026-11-03-supply-window.md`):
  the 30-minute driver at the shipped floor 10 now ends with **8 machines on 18 links, 4 drones,
  1 864 batches (62.1/min), 165 credits, 3 nodes**, the first spare at round **308**, the signal lab
  at round **931** and its first node at **975**. Before the fleet the same driver stopped at 1 757
  batches and the signal lab arrived later still (D-33, D-34). The floor sweep changed shape and is
  restated here: floors {0, 5, 10, 20} give **6 / 8 / 8 / 8** machines and **1 558 / 1 949 / 1 864 /
  1 753** batches, with the first spare at rounds 104 / 198 / 308 / 385 — three floors now tie within
  6 %, and only floor 0 stays stripped, so 10 remains shipped as the middle value that clears every
  starter blueprint's price with room. D-34's parity result survives: both ladder orders give the
  same 1 864 batches, the same levels, and **0 ambiguous rounds of 1 800**.
- Evidence: `tests/simulation/fleet.test.ts` (8 cases: refusal before the repair with a byte-identical
  state, one payment for one unit plus the idempotent retry, the doubling price and the cap refusal,
  ~1.9× deliveries with two units on the same pool, `advance`/`advanceTo` byte parity with a fleet,
  the ledger counting one leg per unit and the offline report summing the fleet, one phrased step on
  card and dock, and the 240/900-round session marks), the restated pins in
  `tests/simulation/cadence.test.ts` and `tests/simulation/supply-window.test.ts`, and the yard
  panel's new `Drones` row. `npx vitest run` **151 passed / 151** (18 files).
- Trade-off stated: the fleet is not a per-tap multiplier and stops at five units, and the ladder now
  spends the first 45 credits on a drone instead of a machine level, so a 240-round session shows
  five machines with three nodes still locked (measured in the phone capture).
- Reversible: yes; one optional state field, one command, one ladder stage, zero-filled on migrate.
- Reconsider when: drone roles and equipment arrive (spec 11.1), which is when a unit stops being a
  copy of the starter and the fleet cap should become a hull-budget rule; or when a real-device trace
  (BL-01) shows five simultaneous flight legs costing frame work worth bounding.

## D-39 — 2026-11-03 — One content validator, two entry points

- Problem (B-12): broken content references surfaced as a strange yard in a screenshot or a hand
  calculation, not as a failing check - a recipe id no blueprint uses, two recipes producing one
  material, a zero-time cycle, a build cost whose material no unlocked machine makes.
- Options considered: (a) assertions spread through the existing per-module tests; (b) a standalone
  script the developer runs by hand; (c) one module exporting two functions - pure table checks and a
  ladder run - consumed by both a CLI script (which CI runs and which prints the violated invariant
  with its name) and one test file.
- Chosen: (c). `src/game/content/validate.ts` exposes `validateContent()` (12 groups of pure table
  checks) and `validateBehaviour(rounds)` (the real ladder plus the ledger walk, returning violations
  and the measured marks). `scripts/validate-content.mjs` prints both and sets `process.exitCode`;
  `package.json` gains `"validate": "tsx scripts/validate-content.mjs"`; `ci.yml` runs it between
  typecheck and tests so a content break names itself before the 4-second suite starts.
- Reason: one implementation means the pipeline and the local suite cannot disagree, and the pure part
  costs 3 ms, so running it twice a day is free. The behaviour half doubles as the cross-check on the
  probe drivers: it lands on the same `8 machines / 18 links / 4 drones / 1 864 batches / 165 credits /
  3 nodes` with `firstDrone=308` and `firstResearch=975` as
  `docs/evidence/2026-11-03-supply-window.md`, from independently written loops.
- What it rejects, in one line each: an unknown resource in any stack; a missing recipe; two
  blueprints claiming one recipe; a recipe with 0 or >4 inputs or >2 outputs, a non-positive or
  fractional cycle, or no power draw; a buffer smaller than its own batch; a footprint over four cells
  or over `YARD_TILES - 1`; a non-integer price; a material with two producers (spec 7.2); a cycle in
  the material graph; a build cost unpayable at its unlock step; a duplicated, cheaper-than-its-
  predecessor, or wrongly ordered research node; a status, reject code, import reason, objective or
  hint without text; a non-positive tuning constant or a derived constant that stopped deriving
  (432 000 ticks for 12 h, 15 minutes of starter output inside the dock cap, the yard powering its
  largest recipe); an upgrade price that stops rising as a safe integer within 40 levels; and a
  ladder that never reaches `build`, `connect`, `sell`, `research` or `drone`.
- Evidence: `tests/content/validate.test.ts` (4 cases - tables pass, table sizes are non-trivial, an
  injected zero cycle / 4x4 footprint / missing price is named and then repaired, and the behaviour
  marks equal the published probe numbers). `npx vitest run` **155 passed / 155** (19 files);
  `npm run validate` exits 0; the bundle is unchanged at `index-DDfppFoR.js` 213.12 kB (67.12 kB
  gzip) because the app does not import the validator.
- Reversible: yes; one module, one script, one npm script, one CI step. Nothing in `src/app` or
  `src/ui` changed.
- Reconsider when: wreck archetypes and sectors arrive (M3), which need the same two-function shape
  with composition-sum and hazard-reference checks added; or if the behaviour half outgrows 1 800
  rounds and should reuse a cached snapshot instead of re-running the ladder in both places.

## D-40 - 2026-11-03 - One string table with named slots, one formatter layer

- Problem (spec 23.3): player-facing sentences lived in five modules, several numbers were typed into
  the sentence a second time next to the tuning constant that defines them, and the plural rule was
  written out inline where it happened to be needed. A second locale would mean editing every
  component, and one rebalance would leave a surface quoting the old number.
- Options considered: (a) leave the literals where they are and add a key→text mapping beside them;
  (b) a JSON locale file loaded at runtime; (c) one typed table with named `{slot}` placeholders plus
  a shared formatter layer, imported by both the UI and the simulation.
- Chosen: **(c)**, as `src/game/content/strings.ts`. It imports nothing, so the deterministic
  simulation keeps that property (spec 21.1) while `diagnostics.ts` and the panels read the same
  sentences; `src/ui/text.ts` stays as the assembler that decides which key the current state answers.
- Rules the table encodes: `t(key, params)` fills `{name}` slots from `params`; an unknown key returns
  the key itself, so a gap is visible rather than an empty row, and an unfilled slot keeps its own
  marker rather than painting `undefined`. `unit(n, word)` is the only plural rule.
  `formatNumber`, `formatDuration`, `formatSeconds`, `formatRate`, `formatWholeSeconds` and
  `wholePercent` are the only display roundings. `resourceName()` is the chip form ("Ferrous"),
  `resourceWord()` the in-sentence form ("ferrous"), which equals the resource id for all fifteen
  shipped materials - which is why the bottleneck assistant's measured lines stayed identical.
- What changed on screen, deliberately: material names inside a sentence are lowercase
  ("Build a sorter · 20 scrap" rather than "20 Scrap"), a count of one reads "1 unit" and "1 credit",
  and the return report's bottleneck row now reads **Storage full** instead of the raw code
  `storage-full`. Every other rendered string is byte-identical, which is what lets the seven
  screenshots keep one provenance set and what the layout re-measure confirms.
- Measured after the change: the resting HUD at the default scale is unchanged (ink **19.1 %**, band
  **20.6 %** at 360 × 640; 21.9 % landscape), no document scroll in **108/108** states, 0 px inner
  scroll everywhere, minimum contrast **5.77:1**, minimum dock target **44 × 46**. The 2.0-scale ink
  peak falls from 40.5 % to **38.3 %**, because the shorter cost lines wrap less. The dock probe still
  measures the same three ladder states (primaries 110 × 46, 130 × 54, 102 × 46; band 20.6-21.8 %).
- Cost: the bundle grew from 213.12 kB (67.12 kB gzip) to **222.69 kB (69.44 kB gzip)** - about 150
  strings plus the formatters, still inside spec 21.5's preference of 200 kB gzip.
- Validation: the content validator gained group 13 (every default non-empty, slot markers balanced
  and named, and one entry per tutorial card line, hint id, chip, resource, machine status, reject
  code, import reason, and return-report bottleneck), plus an unfilled-slot check on every assembled
  ladder line and price. `tests/content/validate.test.ts` now also deletes a hint key, breaks a slot
  and empties a default to prove those three violations are named. `npm run validate` **0 violations**,
  `npx vitest run` **164 passed / 164** (20 files), `npm run typecheck` clean.
- Reversible: yes; the table is data and each call site is a one-line swap.
- Reconsider when: a second locale is actually requested (then `t()` reads an injected dictionary and
  `STRINGS` becomes the `en` defaults), or when M3's wreck archetypes land - blueprint and research
  labels are still table-owned data in `defs.ts` and `research.ts`, and that is where their display
  keys should be added, so content and UI share one shape.

## D-41 - 2026-11-03 - Off-thread catch-up with one adoption path and a frozen frame loop

- Problem (spec 18.5, spec 21.5): the 12 h catch-up costs 41.9 ms of tick-by-tick work in Node, and the
  same function measured **281 ms** of single long task in a page on the development machine - over the
  100 ms stall target, and likely further over it on a midrange phone (BL-01).
- Options considered: (a) keep the inline loop and shorten the cap; (b) analytic batching of the whole
  window in one pass, which needs a second, provably equivalent model per machine; (c) a module worker
  running the same pure function, with a versioned handoff and the inline path as fallback.
- Chosen: **(c)**. `src/game/workers/catchup.ts` holds the protocol, the one `handleCatchUp` function and
  the client; `catchup.worker.ts` is a small entry (a `handleWorkerMessage` helper plus the `onmessage`
  assignment) that calls the same function, so there is no
  second implementation to drift (the pattern of D-39). An equivalent-by-construction pair is then
  pinned by a test that compares the two paths field by field.
- Threshold: the worker is used from **20 000 ticks (2 000 s)** of absence upward. Derivation: the shipped
  bench measures 41.9 ms for the full 432 000-tick cap, so a 20 000-tick gap costs roughly 2 ms inline -
  less than the cost of fetching and compiling the worker module on a cold cache (the measured handoff is
  405 ms wall for the full cap, of which the compute is ~42 ms).
- Cancellation and staleness: starting a run abandons the previous one, an import abandons the in-flight
  handoff, and a response whose `protocol` or `id` is not the current one is discarded, so an old snapshot
  can never overwrite a newer adopted one. A worker that never answers is replaced by the inline function
  after 2 s, and a page without the worker API uses that function from the start.
- Ordering: while a handoff is in flight the frame loop paints but does not tick, and the first 32 intents
  typed in that window are queued and applied to the adopted snapshot in order - the same order the inline
  path would have used, so command ids, the ledger and the idempotency table are unchanged. A 33rd intent
  is refused with the new `reconciling` reason. `step()` follows the same rule through one accumulated tick
  count. This is why `adoptCatchUp` is the only writer of `state`, the reference clock, the report and the
  freeze flag.
- Visible feedback: one line, `Catching your yard up`, from the string table (spec 18.5's "small in-game
  reconciliation indicator"). Measured effect on layout: none, the resting ink and band are identical to
  the previous pass because the line is gone before the audit's first sample.
- Cost: the main bundle is 222.69 kB → **224.63 kB (70.19 kB gzip)** and a **13.02 kB** worker chunk is
  emitted next to it. Both inside spec 21.5's preferences.
- Validation: `npx vitest run` **171 passed / 171** (21 files, seven new), `npm run typecheck` clean,
  `npm run validate` **0 violations**, `node scripts/probe-catchup.mjs` publishing the table in
  `docs/evidence/2026-11-03-catchup.md`.
- Reversible: yes; removing the threshold returns every absence to the inline branch, which is already the
  tested path in jsdom.
- Reconsider when: the real-device trace lands (BL-01) - if a phone shows the worker's module fetch
  dominating a cold start, inlining the worker with `?worker&inline` is the one-line change; or when the
  event-jump model is proven equivalent per machine (option (b)), at which point the worker becomes a
  convenience rather than the thing that keeps the page responsive.

## D-42 - 2026-11-03 - A sell leaves each consumer's own input window in the store

- Problem (B-29): the phone session and the headless driver disagree about how far thirty minutes gets.
  From a saturated 12 h absence the ladder built eight machines but the store printed
  `"circuits": 1, "data": 2` and `research {}` after 1 800 rounds, while the same ladder with no absence
  bought its first node at 975. The printed link table names the mechanism: a link whose source is a
  machine (`m7->m8:circuits`, `m3->m5:copper`, `m4->m7:polymer`) shows `busy 5/17880` - one 5-tick
  flight in 1 788 ticks - because `planConnections` picks a machine source only while that machine's tray
  holds the material and, once the tray has emptied into the link, the store's surplus is never admitted:
  `hasInputLink` allows one link per material, so the store-sourced alternative cannot be added beside it.
  With the whole store sitting at the reserve floor after the last tranche was sold, the consumer starves
  while its material is on the same page in a warehouse (spec 8.2's locations, 10.3's blocked capacity).
- Options considered: (a) let the planner replace a machine-sourced input link with a store-sourced one
  when the store is stocked - a second ladder pass and a route-rewrite transaction; (b) let
  `pullFromStore` fall back to the store whenever the machine-sourced link is empty - tried first, it
  regressed the shipped 30-minute session to **7 machines, 1 157 batches, 0 nodes**, because a store-sourced
  pull competes with the producer's own tray item for the same 24-unit capacity and the fair allocator then
  feeds the wrong stage, so it was reverted; (c) make the one number the store uses for "surplus" mean the
  same thing to both readers, by stating the machines' own demand in the sell bound.
- Chosen: **(c)**, in `sellableAmount` (`src/game/simulation/commands.ts`). A sell now leaves
  `TUNING.reserveFloor + machineInputDemand(s, resource)`, where the new `machineInputDemand` sums, over
  every machine whose recipe consumes the resource, `min(inputBuffer + bufferBonus, perBatch ×
  PULL_LOOKAHEAD_BATCHES + bufferBonus) − inBuf[resource]` - the same two-batch window `pullFromStore`
  asks for, so the reserve and the window are one stated figure rather than two competing ones
  (spec 8.2's "available + reserved equals owned"). `PULL_LOOKAHEAD_BATCHES` is exported from
  `engine.ts` so the two cannot be typed differently. `pullFromStore` keeps its shipped bound
  (`held − RESERVE_FLOOR`), which is what keeps the store's own surplus visible to the build price.
- Measured, same 1 800-round session and the same shipped tuning, before → after: first research node
  **975 → 478**, total batch completions **1 864 → 1 902** (63.4/min), fleet **4 → 5** units (the cap),
  first drone **308 → 268**, end credits **165 → 82**, store at end `circuits 5 → 40`, `data 106 → 76`,
  and the eight-machine, eighteen-link topology is unchanged so the comparison is stage-for-stage
  (`docs/evidence/2026-11-03-supply-window.md`, both cadence rows in `docs/evidence/2026-11-03-cadence.md`).
  The phone session (`scripts/probe-phone.mjs 1800 12 10`) builds all eight blueprints and sees data at
  round **143** instead of never; its node still lands beyond the 1 800-round phase, so **B-29** stays open.
- Cost: two extra loops over `s.machines` per sell (eight machines, one 1 800-round session: the probe's
  wall time is unchanged at about 1 s), no new state field, save schema still 1.
- Validation: `tests/simulation/chain.test.ts` gained "leaves the consuming machine's own window in the
  store (D-42)", which sets copper to 40 and expects a 28-unit tranche - the 10-unit floor plus the wire
  mill's `min(12, 1 × 2) = 2`-per-batch window - and then checks the mill still works after the sell.
  The three measured pins (`tests/content/validate.test.ts`, `tests/simulation/cadence.test.ts`,
  `tests/simulation/supply-window.test.ts`) are restated to the numbers above, and the floor sweep is
  re-published: floors {0, 5, 10, 20} give **6 / 8 / 8 / 8** machines and **1 533 / 2 028 / 1 902 / 1 792**
  batches, so the shipped floor 10 is still inside ±7 % of its neighbours and floor 0 is still the one
  that strips stages. `npx vitest run` **172 passed / 172** (21 files), `npm run typecheck` clean,
  `npm run validate` **0 violations**.
- Reversible: yes; the floor expression is one line and `pullFromStore` is untouched.
- Reconsider when: a machine-sourced link's tray and its store fallback are proven to be one aggregate
  buffer (then option (b) becomes worth re-measuring), or when the event-jump model of D-16 lands, because
  a stated-window floor is the form that model can consume directly.

