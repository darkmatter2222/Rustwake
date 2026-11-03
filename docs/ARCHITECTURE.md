# Architecture

## Layers

| Layer | Module | Mutability | Notes |
| --- | --- | --- | --- |
| Content | `game/content/defs.ts` | frozen data | Resources, recipes R01-R12, blueprints, tuning constants |
| Content | `game/content/research.ts` | frozen data | Node costs, prerequisites, `maxRank`, and the derived integer bonuses |
| Plan | `game/simulation/plan.ts` | pure over state | One `YardStep` ladder shared by the objective card and the dock |
| Simulation | `game/simulation/*` | single mutable state object | Authoritative economy, no DOM access |
| Presentation | `game/renderer/scene.ts` | reads simulation each frame | Camera, sprites, ports, selection |
| Audio | `game/audio/audio.ts` | lazy `AudioContext` after gesture | Buses, cue table, bounded voice pool |
| Shell | `app/store.ts` | owns state + subscriptions | Frame loop, save cadence, return report |
| UI | `ui/*` | React, version-driven | HUD, dock, panels, objective card |

## Command flow

```
pointer/tap → React handler → store.dispatch(Command)
  → applyCommand: idempotency check → execute → revision += 1
  → notify()  (view version bump → React re-render)
  → persist() (checksummed envelope)
each animation frame → advance(state, elapsedTicks) → notify()
```

`Command` is a discriminated union; every command carries a client-generated `id`.
A repeated `id` returns the first committed result, so a retried tap cannot spend twice.

## Tab ownership (spec 22.3)

`localStorage` is shared by every tab, so exactly one tab may advance the economy.

```
rustwake.lease.v1 → { owner, heartbeatMs, revision }     heartbeat = epoch ms, TTL 1500 ms

owner  : claim at creation → tick each frame → checkpoint every 1 s → heartbeat with it
follower: no ticks, no writes; every 100 ms refresh the lease and adopt the checkpoint when
          its `tick` or `revision` is ahead; render the adopted snapshot
takeOver: promotes a follower only when the record is absent, its own, or older than the TTL
```

Adoption replaces the whole `sim` object, so a follower's ledger is byte-identical to the
owner's instead of a merge of two partial runs. Commands issued in a follower are rejected
with the `read-only` reason and one local explanation. Two clocks back this up: an absolute
wall clock (`Date.now`) for `lastSeenMs`, the catch-up window, and the heartbeat; the
monotonic page timeline only for frame deltas.

One absence is credited per writer by `creditAbsence()`: at store creation when the tab
already holds the lease, and from `reconcile()` the moment a follower is promoted. The credit
advances `lastSeenMs` to `now`, and an adopted snapshot brings its own write time, so a
reload inside the 1.5 s lease window still settles the gap exactly once and a repeated
reconcile measures no elapsed time.

## Tick pipeline (fixed order, `simulation/engine.ts`)

1. `finishBatches` — accrue-and-complete work whose milli-tick requirement is met and
   whose tray has room.
2. `enqueueCargo` — move each tray onto its outgoing route (with latency), then pull
   store-sourced material into routes that have space, honouring filters and the reserve
   floor.
3. `settleArrivals` — deliver route cargo whose latency elapsed, if the destination input
   has room; round-robin starting from a persistent cursor.
4. `drainOverflow` — fold the overflow hold back into store space.
5. `allocatePower` — sum requested power of machines with active work, derive the ratio.
6. `startBatches` — persistent round-robin start order; inputs reserved exactly once.
7. `advanceProgress` — exact rational accrual at the power ratio.
8. `updateDrone` — extraction and delivery events.
9. `measure` — per-tick occupancy counters: `ageTicks`/`busyTicks`/`fullTicks` per machine,
   `ageTicks`/`busyTicks` per route. Pure bookkeeping; no quantity changes.
10. `tick += 1`, then tutorial sync.

Because the order is fixed and quantities are integers, two runs with the same command
list and the same total ticks are byte-identical; the determinism test proves equality
across tick chunk sizes of 1, 10, and 240, and between `advance` and `advanceTo`. The
event-jump path in `advanceTo` accrues the same counters for the skipped idle range and
always steps the final tick, which is what makes the two serialisations match exactly.

## Yard ladder (spec 3.3, 10.5)

`plan.ts` derives exactly one `YardStep` from the state, in this priority: an unmet
connection for a machine, an affordable build, an affordable research node, an affordable
upgrade (lowest level, then the highest `busyTicks`), a surplus sell whose resource is not
still short for an unbuilt blueprint, the nearest build by total input shortfall, then any
sell. The objective card and the dock label both format that one step, so they cannot name
different actions. Skipping a pending input in the sell scan is what lets a machine price
accumulate while the drone keeps delivering.

Research bonuses are read, not replayed: `researchBonus(state)` returns integers derived from
`state.research`, and the pulse reward, the effective input capacity (`inputCapacityFor`), and
the capacity given to a newly created link are the only three places that consult it. Existing
links keep the capacity they were created with, so a purchase changes the future, not history.

## State locations (spec 8.2)

`store` (dock bulk storage) · `machine.inBuf` (arrived inputs) · `machine.batch`
(reserved for the active batch) · `machine.tray` (finished, awaiting a destination) ·
`route.items` (in transit with an arrival tick) · `overflow` (returns beyond store
capacity) · `drone.inFlight` (delivery in progress). `invariants.ts` sums all of them,
and the conservation test checks that sum against injected units plus recipe net change.

## Statuses

Machines report `idle`, `running`, `starved`, `outputFull`, `powerLimited`, `paused`.
The UI maps them to player language: "Needs input", "Cargo full", "Power limited:
NN% speed". Statuses are derived inside the tick, so they cannot disagree with the
ledger, and they are the same whether time advanced through frames or a catch-up jump.

## Numbers

All quantities are safe nonnegative integers validated on load (`Number.isSafeInteger`,
nonnegative, bounded). Batch progress is integer milli-ticks plus a remainder normalised
on power-epoch changes. Upgrade cost uses `ceil(base × 1.16^(level−1))` computed
iteratively; rate uses `1 + 0.10 × (level−1)` as an integer ratio, so a level-6 sorter
needs `ceil(40 × 10000 / 15)` milli-ticks.

## Determinism contract for future server authority

The simulation is a pure function of `(initialState, [commands with tick positions])`.
An authoritative server can replay the same list, compare the checksum, and reject
mismatches. The renderer and camera live outside the state object, so presentation
changes never alter the revision.
