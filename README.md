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
5. **Connect dock to sorter** to create two real routes (scrap in, ferrous out) with
   capacity, latency, and visible cargo movement.
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
11. **Open a second tab** and it follows the first: the follower shows
    `Following the other tab`, mirrors the owner's saved yard, and writes nothing. Close the
    first tab and **Take over** promotes the follower, which continues from the same ledger.

After the tutorial, one authoritative ladder decides the next step for both the objective
card and the dock button: an unmet link first, then an affordable build, then a sell
tranche, then an upgrade. The two surfaces cannot disagree.

Implemented systems: manual salvage with cooldown, drone automation, machine
construction/upgrade/dismantle/move, 1×1 placement on a 6×6 yard with a protected dock
tile, route logistics with capacity/latency/filters/fair allocation, shared power budget
with proportional slowdown, storage capacity plus an overflow hold, one-shot onboarding
export contract plus repeatable priced sell contracts, seven blueprints with a progressive
build picker, tutorial state machine (T0-T9), contextual objective card, one localised
explanation per blocked action, measured per-machine and per-link occupancy with one
recommended action, single-canvas HUD, local save with a return report and a 12-hour
offline cap, a synthesised audio bus with a bounded voice pool, and a single-writer
multi-tab lease with read-only followers.

Planned, not yet functional: research tree, expeditions/sector map, wreck composition
and scan detail, restore/dismantle/sell choices for major objects, policies, prestige,
crews, PvP, store. Those are later milestones in `goal.md` (M2+).

## Milestone and next three goals

Active milestone: **M2 — a useful small factory** (M0 and M1 complete).

1. **B-05 small research branch**: three purchasable nodes with exact visible effects,
   each applied exactly once, funded by data (needs the signal lab blueprint to produce it).
2. **B-15 reserve-floor sweep**: floors {0, 5, 10, 20} through the chain fixture, one table,
   chosen value documented.
3. **B-17 rolling 60 s rate window**: per-machine recent rate as spec 9.4 asks, with the
   window shown in the panel next to the maximum rate.

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
npm test      # 88 unit/integration tests
npm run typecheck
npm run build # dist/ (199.30 kB JS, 63.04 kB gzip)
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

## Latest update (M2: one writer per yard, 2026-11-03)

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

Known limitations: no research/expedition/crew/PvP/store UI yet; a follower tab mirrors at
the 10 Hz adopt cadence (B-18); the no-scroll gate is only structurally verified in jsdom, so
a real-device trace is still pending; the diagnosis percentages are lifetime-since-built, not
a sliding 60 s window; audio quality is unverified by human listening; `data`, motors,
battery, plates, alloy, and chassis exist as content but are not reachable until the plate
press, motor bench, and signal lab blueprints arrive; saves written before the wall-clock fix
get exactly one capped 12 h window on their first load.

## Measured numbers (Node 22.18 on the development machine, `tests/perf/bench.test.ts`)

These are headless CPU costs for the simulation core, not mobile FPS claims.

| Workload | Median of 3 |
| --- | --- |
| 12 h catch-up, 4-machine starter yard, tick-by-tick | 41.9 ms |
| 12 h catch-up, idle yard, event-jump path | < 1 ms |
| 500 machines, 6 000 ticks | 24.8 ms |
| 100 machines, 10 000 ticks | 7.0 ms |
| 50 machines, 10 000 ticks | 3.8 ms |
| 5 machines, 10 000 ticks | 0.7 ms |
| 1 machine, 10 000 ticks | 0.5 ms |

Run-to-run spread on this machine is a few milliseconds (the same 12 h case read 29.9 ms in
the previous pass), so treat these as bands. The per-tick occupancy counters added roughly
2 ms at 500 machines; the lease costs two extra `localStorage` operations per second in the
owning tab and one read per 100 ms in a follower, which the headless table does not cover.

## Screenshot gallery

| File | Capture size | Scenario | Source |
| --- | --- | --- | --- |
| `docs/screenshots/latest-mobile.png` | 390 × 844 @2x | Scripted session to tutorial step 8: 3 machines (sorter ×15, furnace ×4, polymer recycler), 6 routes, 39 credits, tick 1030; card and dock both name one step | Same commit as this README, Chrome headless via `scripts/capture.mjs`, captured 2026-11-03 |
| `docs/screenshots/latest-machine-mobile.png` | 390 × 844 @2x | Same mobile session, a few seconds later (the frame loop keeps running): the polymer recycler is selected, its measured line reads `Working 0% · waiting for input 100% · output waiting 0% · link 0% busy · power 100%`, its next step names the missing supplier, and the card and dock still match | Same commit and session, Chrome headless, captured 2026-11-03 |
| `docs/screenshots/latest-multitab.png` | 390 × 844 @2x | Second page in the same browser context while the first still owns the lease: `Following the other tab` with the `Take over` action, counters identical to the owner (`Scrap 10 Ferrous 1 Nonferrous 1 Credits 39 Store 13/900`) | Same commit, two Chrome pages in one context, captured 2026-11-03 |
| `docs/screenshots/latest-desktop.png` | 1440 × 900 @1x | Same scripted sequence, wide viewport: 3 machines, 6 routes, 39 credits, tick 1030 | Same commit as this README, Chrome headless, captured 2026-11-03 |

Screenshots demonstrate appearance only: they do not prove audio, persistence, or
long-session behaviour, which are covered by the tests above. The handover itself is logged as
text by the capture script rather than inferred from these images. The earlier 2026-11-03
captures (tick 1006/1008, no diagnosis lines) and the 2026-11-02 pair (two machines, tick 750)
are superseded by these captures.

## Architecture

```
src/
  app/store.ts            authoritative state owner, frame loop, save cadence
  game/content/defs.ts    resources, recipes R01-R12, blueprints, tuning
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
