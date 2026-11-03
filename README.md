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
objective card, one localised explanation per blocked action, measured per-machine and
per-link occupancy with one recommended action, single-canvas HUD, local save with a return
report and a 12-hour offline cap, a synthesised audio bus with a bounded voice pool, and a
single-writer multi-tab lease with read-only followers.

Planned, not yet functional: expeditions/sector map, wreck composition and scan detail,
restore/dismantle/sell choices for major objects, policies, prestige, crews, PvP, store.
Those are later milestones in `goal.md` (M3+).

## Milestone and next three goals

Active milestone: **M2 — a useful small factory** (M0 and M1 complete).

1. **B-15 reserve-floor sweep**: floors {0, 5, 10, 20} through the chain fixture and the
   30-minute self-play session, one table, chosen value documented. The floor now trades
   directly against how fast the seventh machine is paid for.
2. **B-17 rolling 60 s rate window**: per-machine recent rate as spec 9.4 asks, with the
   window shown in the panel next to the maximum rate.
3. **B-16 HUD area share**: measure the resting HUD's share of the phone viewport against the
   15-22% design target, with the four/five-chip and one-line-objective counts recorded.

## Controls

| Input | Behaviour |
| --- | --- |
| Tap/click object | Select it; the world object shows a high-contrast outline and its panel opens |
| Tap the wreck | Manual cutting pulse (when a pulse is ready) |
| Drag one finger | Pan the camera, clamped to the yard |
| Pinch / two-finger drag | Zoom between 1.2x and 6x |
| Primary dock button | The single next action for the current objective, with cost |
| Machine panel | Status, batch progress, measured and maximum rate, power share, **Measured** line (busy / waiting / output-waiting / busiest link / power) and one **Next step** recommendation, **Connect**, **Upgrade**, **Dismantle** |
| Store panel | Material list with **Sell** buttons, capacity, measured storage/power/link lines, overflow hold |
| Research panel | One line per node with its exact effect, `Buy · n Data`, `Known`, or `Needs <earlier node> first` |
| Build / Place / Next / Cancel | Blueprint selection, ghost confirmation, cycling, abort |
| Sound on/off | Toggles the master bus, persisted |
| Home | Recentres the camera on the yard and clears selection |
| Second tab | Follows the owner: one status line, **Take over** promotes it once the owner's lease (1.5 s) lapses |

Keyboard: standard focus order over the semantic buttons (`Tab`), activation with
`Enter`/`Space`. Reduced-motion is honoured for the drone and cargo interpolation; the
economy never depends on animation timing.

## Run it

```bash
npm ci        # install
npm run dev   # http://localhost:5173
npm test      # 109 unit/integration tests
npm run typecheck
npm run build # dist/ (205.41 kB JS, 64.91 kB gzip, 50 modules)
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

## Latest update (M2: material-sized pulls and one link per material, 2026-11-03)

- **A store link now draws only what its machine still has in hand (B-19).** `pullFromStore`
  sizes each pull to two ready batches of that material — per-batch units × 2, +6 with Smart
  Buffers, capped by the machine's effective input capacity — counted across the input buffer
  and the cargo already in transit, instead of moving everything above the reserve floor.
  The surplus therefore stays where prices and build costs are read. Measured with the new
  headless self-play driver (one ladder tap per second for 30 minutes,
  `tests/simulation/chain.test.ts`): **before, 3 machines** (sorter 29 batches, furnace 5,
  recycler 0) with 895 scrap parked in the store; **after, 7 machines on 21 links** — sorter
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

## Earlier this week (M2: one writer per yard, 2026-11-03)

- Two tabs no longer run two economies. `persistence/lease.ts` holds
  `{owner, heartbeatMs, revision}`; the first tab owns it, extra tabs mirror the saved
  revision at 10 Hz without ticking or writing, and show one status line plus
  **Take over**. Promotion happens only when the lease is absent, own, or older than
  1.5 s, so the new owner continues from the ledger it adopted instead of a fresh yard.
- Found while testing that in a real browser: the store stamped `lastSeenMs` from
  `performance.now()`, which restarts at 0 per document, so a reopened tab computed the
  absence as zero and credited nothing. The store now keeps two clocks — an absolute wall
  clock (`Date.now()`) for the save reference, the catch-up window, and the lease heartbeat,
  and the page-relative timeline for frame deltas. The capture confirms a 13-digit epoch
  stamp (`lastSeenMs: 1793689384704`).
- The owner now checkpoints every second instead of every five, so a follower's mirror and
  a crash both lose at most one second of visible progress.
- Measured in this run: `npm test` 88 passed / 88 (9 files; 7 new in
  `tests/persistence/lease.test.ts`, 1 new in `tests/persistence/save.test.ts`, 1 new in
  `tests/ui/app.test.tsx`), `npm run typecheck` clean, `npm run build` 199.30 kB JS
  (63.04 kB gzip, 49 modules).
- Real-Chrome two-page session (`node scripts/capture.mjs`, which now opens a second page in
  the same context): the follower printed `Following the other tab` with dock `Take over` and
  the same counters as the owner (`Scrap 10 Ferrous 1 Nonferrous 1 Credits 39 Store 13/900`,
  tick 1040, lease `{"owner":"t1-iur","heartbeatMs":1793689386491,"revision":28}`); after the
  owner tab closed, one **Take over** press moved the lease to
  `{"owner":"t1-5atq","heartbeatMs":1793689389781,"revision":28}`, the tick advanced to
  1050, the card returned to the yard ladder, and the scrap counter went 10 → 11.
- Known limitations: a follower's picture steps at the 10 Hz adopt cadence (B-18); the
  no-scroll gate is still only structurally verified in jsdom (BL-01); percentages remain
  lifetime-since-built (B-17); audio is unverified by human listening (BL-11).

## Earlier this week (M2: bottleneck assistant, 2026-11-03)

- Machine panels report measured occupancy (`Working 62% · waiting for input 38% · output
  waiting 0% · link 55% busy · power 100%`) from counters kept inside the simulation
  (`ageTicks`, `busyTicks`, `fullTicks` per machine, `ageTicks`/`busyTicks` per route), plus
  one next step that is often not a purchase; the store panel carries the yard-level version.
- `advanceTo` now accounts for idle time and always steps the final tick, so tick-by-tick and
  event-jump runs serialise identically; `migrate` zero-fills the new counters so pre-counter
  saves still load, and `validateSim` rejects negative or non-integer ones.
- Selecting a machine resolves one `YardStep` (`stepForMachine`) that both the objective card
  and the dock label format from, which fixed a real-browser mismatch where the two named
  different actions.

Known limitations: no expedition/crew/PvP/store UI yet; the research panel is verified by a
jsdom render test but not yet photographed; a follower tab mirrors at the 10 Hz adopt
cadence (B-18); the no-scroll gate is only structurally verified in jsdom, so a real-device
trace is still pending; the diagnosis percentages are lifetime-since-built, not a sliding
60 s window; audio quality is unverified by human listening; motors, battery, plates, alloy,
and chassis exist as content but are not reachable until the plate press and motor bench
blueprints arrive, and `data` needs the signal lab plus the circuit chain; saves written
before the wall-clock fix get exactly one capped 12 h window on their first load.

## Measured numbers (Node 22.18 on the development machine, `tests/perf/bench.test.ts`)

These are headless CPU costs for the simulation core, not mobile FPS claims.

| Workload | Median of 3 (this build) | Median of 3 (before the per-material routing) |
| --- | --- | --- |
| 12 h catch-up, 4-machine starter yard, tick-by-tick | 59.3 ms | 33.4 ms |
| 12 h catch-up, idle yard, event-jump path | < 1 ms | < 1 ms |
| 500 machines, 6 000 ticks | 40.4 ms | 23.2 ms |
| 100 machines, 10 000 ticks | 13.8 ms | 6.7 ms |
| 50 machines, 10 000 ticks | 6.4 ms | 3.7 ms |
| 5 machines, 10 000 ticks | 1.1 ms | 0.7 ms |
| 1 machine, 10 000 ticks | 0.8 ms | 0.5 ms |

Run-to-run spread on this machine is a few milliseconds (the same 12 h case read 41.9 ms and
29.9 ms in earlier passes), so treat these as bands. The per-tick occupancy counters added
roughly 2 ms at 500 machines; the lease costs two extra `localStorage` operations per second
in the owning tab and one read per 100 ms in a follower, which the headless table does not
cover. The per-material routing plus the per-state lookup table is the difference between the
two columns: about 1.7× at 50-100 machines, and the 12 h tick-by-tick case stays inside the
100 ms stall budget of spec 21.5.

## Screenshot gallery

| File | Capture size | Scenario | Source |
| --- | --- | --- | --- |
| `docs/screenshots/latest-mobile.png` | 390 × 844 @2x | Scripted session, then a 12 h absence settled by the real catch-up path: 4 machines (sorter L7 ×619, furnace L7 ×301, polymer recycler L7, copper separator L1), 8 links, tick 433 630, 133 credits, `Scrap 5 Ferrous 5 Nonferrous 14 Credits 133 Store 322/900`, five visible links between five sprites | Same commit as this README, Chrome headless via `scripts/capture.mjs`, captured 2026-11-03 |
| `docs/screenshots/latest-machine-mobile.png` | 390 × 844 @2x | Same mobile session, a few seconds later (the frame loop keeps running): the polymer recycler is selected with `Cycle 3.75s`, `Working 0% · waiting for input 100% · output waiting 0% · link 0% busy · power 100%`, its next step names the copper separator as the limiter, and the dock offers the 45-credit upgrade to it | Same commit and session, Chrome headless, captured 2026-11-03 |
| `docs/screenshots/latest-multitab.png` | 390 × 844 @2x | Second page in the same browser context while the first still owns the lease: `Following the other tab` with the `Take over` action, counters identical to the owner (`Scrap 5 Ferrous 5 Nonferrous 14 Credits 133 Store 322/900`) | Same commit, two Chrome pages in one context, captured 2026-11-03 |
| `docs/screenshots/latest-desktop.png` | 1440 × 900 @1x | Same scripted sequence in a separate context: the same four machines (sorter L7 ×619, furnace L7 ×301, polymer recycler L7, copper separator L1), tick 433 630, 133 credits, five resource chips and three dock targets | Same commit as this README, Chrome headless, captured 2026-11-03 |

Screenshots demonstrate appearance only: they do not prove audio, persistence, or
long-session behaviour, which are covered by the tests above. The handover itself is logged as
text by the capture script rather than inferred from these images, and so is the absence:
`tick 1010 → 433 020` with the report line quoted in the latest-update section, and the
handover line `t1-7501 → t1-jdu6` with the tick advancing 433 640 → 433 671.
**Pending capture:** the research panel has no image yet. Its dock target appears only once
`data > 0`, which needs the full circuit chain, and the scripted session stops before that
within the capture window; `tests/ui/app.test.tsx` therefore asserts the panel's exact
content (effect line, `Buy · 4 Data`, `Known`, and the blocked-node line) until a longer
session can be photographed. The 2026-11-03 set before this one (three machines at
L7/L6/L6, 6 routes, `Store 58/900`) and the 2026-11-02 pair are superseded by these captures.

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
