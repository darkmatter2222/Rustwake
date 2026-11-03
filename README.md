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

Implemented systems: manual salvage with cooldown, drone automation, machine
construction/upgrade/dismantle/move, 1×1 placement on a 6×6 yard with a protected dock
tile, route logistics with capacity/latency/filters/fair allocation, shared power budget
with proportional slowdown, storage capacity plus an overflow hold, one-shot export
contract, tutorial state machine (T0-T8), contextual objective card, one localised
explanation per blocked action, single-canvas HUD, local save with a return report and a
12-hour offline cap, and a synthesised audio bus with a bounded voice pool.

Planned, not yet functional: research tree, expeditions/sector map, wreck composition
and scan detail, restore/dismantle/sell choices for major objects, policies, prestige,
crews, PvP, store. Those are later milestones in `goal.md` (M2+).

## Controls

| Input | Behaviour |
| --- | --- |
| Tap/click object | Select it; the world object shows a high-contrast outline and its panel opens |
| Tap the wreck | Manual cutting pulse (when a pulse is ready) |
| Drag one finger | Pan the camera, clamped to the yard |
| Pinch / two-finger drag | Zoom between 1.2x and 6x |
| Primary dock button | The single next action for the current objective, with cost |
| Store | Paged bulk-material sheet plus overflow hold |
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
npm test      # 44 unit/integration tests
npm run typecheck
npm run build # dist/ (185.98 kB JS, 59.04 kB gzip)
npm run preview
```

Save state lives in `localStorage` under `rustwake.save.v1` as a checksummed envelope
`{schemaVersion, checksum, payload}`. Corrupt or newer-version envelopes are rejected and
a fresh session starts without overwriting the stored raw text until the next successful
checkpoint. On load, one bounded catch-up runs and the reference clock advances through
the entire absence, so repeated reloads cannot double-claim the discarded tail.

To capture the README screenshots: `npm run preview` in one terminal, then
`node scripts/capture.mjs`.

## Latest update (M0/M1 core, 2026-11-02)

- Deterministic fixed-100 ms simulation with the documented phase order, integer
  quantities, exact rational power scaling, fair round-robin batch starts.
- Full first-feel loop: salvage, repair, automated delivery, sorter, real routes,
  furnace, export contract, first upgrade.
- Persistence with checksum validation, forward migration hook, return report,
  12-hour offline cap.
- 44 tests passing, typecheck clean, production build succeeds.

Known limitations: no research/expedition/crew/PvP/store UI yet; no multi-tab lease; the
no-scroll gate is only structurally verified in jsdom, so a real-device trace is still
pending; audio quality is unverified by human listening; `data` and higher-tier recipes
exist as content but are not reachable in the tutorial path.

## Measured numbers (Node 22.18 on the development machine, `tests/perf/bench.test.ts`)

These are headless CPU costs for the simulation core, not mobile FPS claims.

| Workload | Median of 3 |
| --- | --- |
| 12 h catch-up, 4-machine starter yard, tick-by-tick | 33 ms |
| 12 h catch-up, idle yard, event-jump path | < 1 ms |
| 500 machines, 6 000 ticks | 18 ms |
| 100 machines, 10 000 ticks | 6 ms |
| 1 machine, 10 000 ticks | 0.4 ms |

## Screenshot gallery

| File | Capture size | Scenario | Source |
| --- | --- | --- | --- |
| `docs/screenshots/latest-mobile.png` | 390 × 844 @2x | After the gate: six pulses plus primary actions, sorter chain running | Same commit as this README, Chrome headless |
| `docs/screenshots/latest-desktop.png` | 1440 × 900 @1x | Same scripted sequence, wide viewport | Same commit as this README, Chrome headless |

Screenshots demonstrate appearance only: they do not prove audio, persistence, or
long-session behaviour, which are covered by the tests above.

## Architecture

```
src/
  app/store.ts            authoritative state owner, frame loop, save cadence
  game/content/defs.ts    resources, recipes R01-R12, blueprints, tuning
  game/simulation/        types, engine (tick phases), commands, offline, invariants, autoconnect
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
