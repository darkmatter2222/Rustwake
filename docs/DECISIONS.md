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
