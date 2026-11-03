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

