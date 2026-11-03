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
