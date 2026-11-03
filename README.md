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
offline cap, and a synthesised audio bus with a bounded voice pool.

Planned, not yet functional: research tree, expeditions/sector map, wreck composition
and scan detail, restore/dismantle/sell choices for major objects, policies, prestige,
crews, PvP, store. Those are later milestones in `goal.md` (M2+).

## Milestone and next three goals

Active milestone: **M2 — a useful small factory** (M0 and M1 complete).

1. **B-01 multi-tab single-writer lease**: owner id plus heartbeat, a read-only second tab,
   revision-checked takeover, tests for both paths.
2. **B-05 small research branch**: three purchasable nodes with exact visible effects,
   each applied exactly once, funded by data.
3. **B-15 reserve-floor sweep**: floors {0, 5, 10, 20} through the chain fixture, one table,
   chosen value documented.

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

Keyboard: standard focus order over the semantic buttons (`Tab`), activation with
`Enter`/`Space`. Reduced-motion is honoured for the drone and cargo interpolation; the
economy never depends on animation timing.

## Run it

```bash
npm ci        # install
npm run dev   # http://localhost:5173
npm test      # 79 unit/integration tests
npm run typecheck
npm run build # dist/ (197.40 kB JS, 62.31 kB gzip)
npm run preview
```

Save state lives in `localStorage` under `rustwake.save.v1` as a checksummed envelope
`{schemaVersion, checksum, payload}`. Corrupt or newer-version envelopes are rejected and
a fresh session starts without overwriting the stored raw text until the next successful
checkpoint. On load, one bounded catch-up runs and the reference clock advances through
the entire absence, so repeated reloads cannot double-claim the discarded tail.

To capture the README screenshots: `npm run preview` in one terminal, then
`node scripts/capture.mjs`.

## Latest update (M2: bottleneck assistant with measured evidence, 2026-11-03)

- The machine panel now reports measured occupancy instead of guesses: `Working 62% ·
  waiting for input 38% · output waiting 0% · link 55% busy · power 100%`, where every
  number is a whole percent of the machine's or link's own observed ticks. The store panel
  carries the yard-level version (storage %, power %, busiest link, machines waiting).
- Each machine also gets **one** next step chosen from the strongest evidence, and several
  of them are not purchases: `… the dock is empty. One salvage pulse tops it up; no purchase
  needed`, `Nothing to buy here: the link, not this machine, is the limit`,
  `Runs at full speed 96% of the time. Nothing to fix on this machine`. A purchase is only
  named when the supplier machine is actually the limiter.
- Counters live in the simulation, not the view: `ageTicks`, `busyTicks`, `fullTicks` per
  machine and `ageTicks`/`busyTicks` per route, advanced in one measurement phase at the end
  of each tick. `advanceTo` now also advances the ages (and the waiting count for machines
  with nothing buffered) across a jumped idle range, so tick-by-tick and event-jump runs are
  byte-identical; a test compares the two serialisations.
- Saves gain four additive numeric fields. `migrate` fills missing counters with zero and
  `validateSim` rejects negative or non-integer counters, so a pre-counter save still loads
  and simply reports percentages over a shorter observed window.
- Capture script gained a machine-panel shot: it taps a coarse grid until a panel opens and
  prints the panel text, so the README quotes the actual rendered lines.
- Measured in this run: `npm test` 79 passed / 79 (8 files, 11 new in
  `tests/simulation/diagnostics.test.ts`, 2 new in `tests/simulation/chain.test.ts` and
  `tests/ui/app.test.tsx`), `npm run typecheck` clean, `npm run build` 197.40 kB JS
  (62.31 kB gzip), panel text read back from real Chrome: `Working 0% · waiting for input
  100% · output waiting 0% · link 0% busy · power 100%`.
- One mismatch found in the real browser and fixed: with a machine selected the card named
  one step and the dock another. Selecting a machine now resolves to that machine's own step
  (unmet link → the supplier that is short → its own upgrade) and both surfaces format from
  that one step, so the card sentence and the dock label name the same action and machine.

Known limitations: no research/expedition/crew/PvP/store UI yet; no multi-tab lease; the
no-scroll gate is only structurally verified in jsdom, so a real-device trace is still
pending; the diagnosis percentages are lifetime-since-built, not a sliding 60 s window;
audio quality is unverified by human listening; `data`, motors, battery, plates, alloy, and
chassis exist as content but are not reachable until the plate press, motor bench, and
signal lab blueprints arrive.

## Measured numbers (Node 22.18 on the development machine, `tests/perf/bench.test.ts`)

These are headless CPU costs for the simulation core, not mobile FPS claims.

| Workload | Median of 3 |
| --- | --- |
| 12 h catch-up, 4-machine starter yard, tick-by-tick | 29.9 ms |
| 12 h catch-up, idle yard, event-jump path | < 1 ms |
| 500 machines, 6 000 ticks | 21.8 ms |
| 100 machines, 10 000 ticks | 6.6 ms |
| 50 machines, 10 000 ticks | 3.5 ms |
| 1 machine, 10 000 ticks | 0.5 ms |

The 500-machine case rose from 19 ms to 21.8 ms when the per-tick occupancy counters were
added (one pass over machines and routes per tick); the 12-hour case moved 28 ms → 29.9 ms.

## Screenshot gallery

| File | Capture size | Scenario | Source |
| --- | --- | --- | --- |
| `docs/screenshots/latest-mobile.png` | 390 × 844 @2x | Scripted session to tutorial step 8: 3 machines (sorter ×14, furnace ×3, polymer recycler), 6 routes, 39 credits, tick 1006; the objective card and the dock button both read `Build Copper separator · 25 Scrap + 5 Ferrous` | Same commit as this README, Chrome headless via `scripts/capture.mjs`, captured 2026-11-03 |
| `docs/screenshots/latest-machine-mobile.png` | 390 × 844 @2x | Same mobile session, a few seconds later (the frame loop keeps running): the polymer recycler is selected, its measured line reads `Working 0% · waiting for input 100% · output waiting 0% · link 0% busy · power 100%`, its next step names the missing supplier, and the card and dock still match | Same commit and session, Chrome headless, captured 2026-11-03 |
| `docs/screenshots/latest-desktop.png` | 1440 × 900 @1x | Same scripted sequence, wide viewport: 3 machines (sorter ×14, furnace ×3), 6 routes, 39 credits, tick 1006 | Same commit as this README, Chrome headless, captured 2026-11-03 |

Screenshots demonstrate appearance only: they do not prove audio, persistence, or
long-session behaviour, which are covered by the tests above. The earlier 2026-11-03 pair
(tick 1008, no diagnosis lines) and the 2026-11-02 pair (two machines, tick 750) are
superseded by these captures.

## Architecture

```
src/
  app/store.ts            authoritative state owner, frame loop, save cadence
  game/content/defs.ts    resources, recipes R01-R12, blueprints, tuning
  game/simulation/        types, engine (tick phases), commands, offline, invariants, autoconnect, plan
  game/renderer/scene.ts  camera, world/sprite drawing, ports
  game/audio/audio.ts     buses, cue table, bounded voice pool
  game/persistence/save.ts envelope, checksum, validation, migration hook
  ui/                     App shell, HUD parts, panels, text, store hooks
tests/                    simulation, logistics, offline, persistence, ui, perf
scripts/capture.mjs       playwright-core screenshot capture
docs/                     STATUS, BACKLOG, DECISIONS, BLOCKERS, ARCHITECTURE, screenshots
```

State flow: pointer intent → validated command → simulation transaction → new revision →
subscribed HUD summary plus renderer snapshot → persistence checkpoint. The renderer reads
the mutable state object each frame; React re-renders from a numeric view version, so
moving sprites do not re-render components (see `docs/ARCHITECTURE.md`).

Deeper notes: [ARCHITECTURE](docs/ARCHITECTURE.md),
[STATUS](docs/STATUS.md), [BACKLOG](docs/BACKLOG.md),
[DECISIONS](docs/DECISIONS.md), [BLOCKERS](docs/BLOCKERS.md).
