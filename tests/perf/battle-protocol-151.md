# Battle benchmark protocol — issue #151 (G1/P1), pass 3/4

Status: **DEFINED, MEASUREMENT DEFERRED TO G3/P3.** No battle numbers are
reported in pass 3 and none may be inferred from the MATURE/STRESS runs.

NON-VISION DISCLAIMER: this protocol specifies numeric browser/engine readouts
only. Visual fidelity of any battle capture remains PENDING sponsor inspection
at the live URL. All runs are HEADLESS CHROME EMULATION on a desktop host, NOT
a physical phone (#190 blocker); no real-phone claim is permitted.

## Why deferred (verified at head `aabdfb15191ac86fcf69211a8d0f2aa7fd32da9d`)

- `src/game/simulation/` contains no raid/battle/wave/enemy model (grep across
  the module returns nothing; `SimState` has no defense entities). The defense
  acceptance rows D01–D06 are gated at **G3/P3** (`docs/vision/ACCEPTANCE.md`
  phase gates: "G3/P3: D01-06, stress P01/P02, risk UI and finite offline
  defense. Industry visibly supplies battle.").
- `tests/fixtures/release.ts` ships OPENING / CHOICE-LOCAL / CHOICE-REMOTE /
  BLOCKED / MATURE / STRESS only. The ACCEPTANCE fixture census requires a
  **DEFENSE** fixture ("three documented enemy mixes with equal spending")
  which does not exist yet.
- Measuring "battle" today would benchmark an empty yard and fabricate a
  result. The brief for pass 3 explicitly says: define the protocol, defer the
  measurement.

## Protocol (binding once G3 defense lands)

### 1. Fixtures and seeding

- Add `buildDefense()` to `tests/fixtures/release.ts` following the existing
  pattern: `RELEASE_SEED = 141`, `fixtureSaveText(sim, FIXTURE_WITNESS_MS)`
  for byte-identical repeated encodes, `lastSeenMs = Date.now()` at capture
  time so offline catch-up never contaminates a run.
- Three documented enemy mixes (per ACCEPTANCE fixture census), **equal
  spending** across mixes; each mix gets a named, versioned seed and a written
  composition (wave count, enemy types, HP/speed/damage, spawn cadence).
- Defensive compositions: at least two distinct layouts (D06), plus a
  single-turret-spam control at identical spend. Layouts are fixtures, never
  hand-tuned during a run.
- Fix seed and time before any before/after capture; preserve raw logs and raw
  captures with metadata (ACCEPTANCE evidence rules).

### 2. Benchmark harness (reuse, do not reinvent)

- Drive the coordinator-verified `tests/renderer/rw3d-t07` harness pattern
  (`window.__RW3D__.runTimeline(frames)` at fixed dt) with the DEFENSE fixture
  swapped in via the same Playwright route interception used by
  `tests/perf/perf-151.evidence.mjs` (`installFixture`).
- Two identical timeline runs per composition; require identical end-state
  JSON **and** identical pixel hash (the P01 determinism gate). Any divergence
  fails the run — battle must be renderer-FPS-independent (D01).
- Report per composition: p50/p95/p99/max frame ms (render), p50/p95 input
  latency (5 machine taps + 5 empty taps, the P01 gesture set), draw calls /
  triangles / geometries / textures / programs from the real
  `renderer.info`, used heap MB (GC-stable via `--expose-gc`), device
  (viewport/dpr/isMobile), quality tier, browser executable + renderer string
  (SwiftShader fallback flagged).
- Emulation contexts: phone 390x844@2 (isMobile, hasTouch) and desktop
  1920x1080@1, matching `perf-67.evidence.mjs`; 6x CPU throttle variant for
  the throttled budget rows. No `--maxWorkers`-style parallelism hacks; plain
  sequential runs.

### 3. Ledger assertions (D01–D06 numeric core)

- D01: seeded encounter replay matches damage, ammo, power and loot ledger
  exactly across both runs and across two different render cadences (e.g.
  fixed dt 1 vs 2 ticks/frame) — the ledger is a pure function of ticks.
- D02: wall-placement trap cases assert declared siege/invalid-placement
  outcomes; target selection + ranges asserted deterministic from seed.
- D03: ammo starvation / power brownout / repair-kit exhaustion each produce
  the documented defense degradation and recover after supply reroute
  (assert ledger fields, not pixels).
- D04: failure respects protected reserves / loss cap; assert no
  permanent-home wipe under unattended loss; newcomer/opt-in rules covered.
- D05: retreat/reload/disconnect/update mid-expedition locks the loadout
  snapshot and settles remaining cargo exactly once (idempotent command ids,
  the E02 pattern).
- D06: at least two compositions succeed under different wave mixes; the
  turret-spam control must NOT be universally dominant (record win/loss +
  residual HP per mix).

### 4. Budgets and verdicts

- Battle frame/input rows compare against `tests/perf/budgets.json` using the
  same `evaluateBudgets` semantics as P03: **met / unmet / UNKNOWN** (a null
  budget is UNKNOWN, never silently passed). If G3 adds battle-specific
  budgets, they land in `budgets.json` through its own reviewed change — this
  protocol does not edit budgets.
- Software-rendering tolerance: the P01 p95 <= 250 ms software tolerance
  applies to harness frame times only; budget verdicts stay honest and a
  SwiftShader run is always labelled.

### 5. Evidence shape

- `docs/evidence/151-battle-*.json` (or the G3 issue's own prefix) with:
  issue, pass, head SHA, fixture seeds/compositions, device, quality tier,
  determinism hashes, ledger deltas, p50/p95 tables, budget verdicts,
  limitation string, and the non-vision disclaimer on every artifact.
- Raw captures under `docs/screenshots/` with the same naming discipline;
  visual fidelity verdict belongs to the sponsor, never to this script.

## What pass 3 actually measured instead

`tests/perf/perf-151.evidence.mjs --mode p01` reports MATURE (normal) and
STRESS benchmarks with the full P01 readout set; `--mode p02` runs the three
warmed 10-minute MATURE loops; `--mode p03` probes cold load + 2D quality
fallback against the prospective #67 budgets. Battle remains **UNKNOWN /
DEFERRED (G3)** in every pass-3 report.