# #150 — T23 layered machine activity + restrained spatial sound

- Issue: [#150](https://github.com/darkmatter2222/Rustwake/issues/150) (RW3D T23)
- Role: developer (non-vision)
- Branch: `rw/150`
- Implementation head at capture: `473fed2274fd1b309dc3c92e883f2fecb6ab8600`
  (evidence re-stamped at that head in `c2898e5`; the first capture ran at
  `74a17a8` with byte-identical implementation and produced byte-identical PNGs)
- Base: `origin/main` `89db232577054a347216aa7b0be5f4c6be4e272e`
- Acceptance: **V04** (independently timed mechanisms; paused/starved/unpowered
  machines do not fake production) and **U07** (mute, reduced motion and bounded
  pools retain information; sound is restrained and spatial without clipping).

## Scope of this change

Renderer/audio-side, session-only, additive. Three implementation files:

- `src/game/renderer/motion.ts` (new, +135) — pure activity model.
- `src/game/renderer/scene.ts` (+53/−19 net) — capability-guarded overlay on
  both the 2D and three.js paths; `pickWorld3D`, `projectToScreen`,
  `advanceWorld` and the merged #143 fleet wiring preserved.
- `src/game/audio/audio.ts` (+98 changed) — machinery-only stereo pan hop,
  clamped and NaN-safe, with graph-table cleanup.

No store slice, no mutation, no command dispatch, no persisted-state change.
`src/app/store.ts`, `src/game/simulation/*`, `src/game/content/defs.ts` and
`src/ui/*` were read-only. three.js stays pinned **exactly `0.187.0`**. The
frozen `tests/renderer/boundary-3d.test.ts` has a zero-line diff against base.
Total diff vs base: 15 files, +2506/−19 (implementation, 2 unit-test files,
capture harness, evidence JSON + 6 PNGs).

## Activity model (pure, reads sim state, never writes it)

`machineActivity(machine, tick, framePhase, reducedMotion)` derives every
channel from real sim state on the 0.1 s sim clock:

- FNV-1a `machineSeed(id)` gives stable per-entity variation — no synchronized
  yard reset, no `Math.random`/clock/storage.
- Fan: 17-tick period, 8 discrete blade steps, sub-tick `framePhase` smoothing.
- Core pulse: 6-step cycle, amber swell only on steps q∈{2,3}, only while the
  simulation reports work.
- Vent: 110–190-tick period per entity (11–19 s band); puffs only at stage 1
  while running; pool capped at `MAX_VENT_PUFFS = 2`.
- Roller/sweep: batch-driven (`ratio = progress / batchMilli`); roller walks
  4 steps per batch, magnet sweep only in the first quarter.
- Reduced motion: pulse suppressed, fan frozen at a seed-selected discrete
  position, vent puffs empty, vent stage still cycles as a static readable
  mark; all status accents retained.

The overlay is capability-guarded (`typeof ctx.setLineDash === "function"`) and
the fine layer throttles at `scale < 2`. The recording census contexts (no
`setLineDash`) keep the pinned legacy op census: default-off fingerprint parity
is asserted by unit tests (op count invariant across the tick sweep, ≤240-op
ceiling on the dense yard).

## Audio (restrained, machinery-only spatial)

- `StereoPanner` hop is added **only for machinery cues**, capability-guarded;
  graph table `${id}-pan` cleaned on steal/`onended`/dispose.
- Pan clamps to `PANNER_MAX = 0.35`; NaN falls back to centre.
- Mute is a single master-gain write; beds (ambience noise loop, music sine)
  start only when a context exists (resume or unmute after graph build).
- Voice budget 16 with 30 ms coalesce window; bus levels master 0.9 /
  machinery 0.45 / effects 0.8 / ui 0.6 / music 0.25 / ambience 0.2; documented
  headroom ceiling 0.9 × 0.82 = **0.738**.
- Additive `contextFactory` seam lets the real graph render offline; live
  behaviour is unchanged.

## Gates (real exit codes, run in `rw-150` at head `473fed2`)

| Gate | Command | Exit | Result |
| --- | --- | --- | --- |
| typecheck | `npx tsc --noEmit` | 0 | clean |
| validate | `npx tsx scripts/validate-content.mjs` | 0 | 15 resources / 8 blueprints / 12 recipes / 3 research; 0 violations; behaviour sim 0 violations |
| test | `npx vitest run` | 0 | **94 files / 1290 tests passed** (11.86 s) |
| build | `npm run build` | 0 | built in 1.44 s; pre-existing >500 kB chunk warning only |

Baseline at base `89db232` (separate `rw-150-base` worktree): **92 files /
1264 tests**, exit 0. This change adds 2 test files / 26 tests → 94 / 1290,
exactly as expected. `tests/perf/bench.test.ts:87` did not flake; no gate was
tuned. One earlier full vitest run hit a load-dependent `save-63` tick-race
flake; it passed in isolation and did **not** recur in the final green re-run.
No implementation or test code was changed to accommodate it.

## Unit tests (node vitest, included in the 1290 above)

- `tests/renderer/motion-150.test.ts` — 18 tests (13 + 5-status quiet matrix):
  seed determinism/uniqueness, 11–19 s vent band, eight running machines never
  pulse in unison across 60 s, ≥3 distinct fan positions every tick, 1.7 s fan
  period with independent drift, sub-tick phase smoothing, quiet statuses
  (starved/outputFull/powerLimited/paused/idle) hold fan/vent/roller, batch
  roller + once-per-batch sweep, frozen-input immutability, reduced-motion
  freeze with readable stages, vent pool bound, byte-identical determinism.
- `tests/renderer/activity-scene-150.test.ts` — 8 tests: four distinct painted
  status readings, per-machine fan marks, 60 s divergence (no yard lockstep),
  census parity (240-op ceiling, op-count invariant, amber witness on both
  context kinds), reduced motion and far zoom retain information.

## Running-build capture (54/54 numerical checks, exit 0)

Method: vite dev server `:4323` + playwright-core **system Chrome**
(`C:\Program Files\Google\Chrome\Application\chrome.exe`, renderer
`ANGLE (NVIDIA, NVIDIA GeForce RTX 5090 Direct3D11)`, `swiftshaderForced:
false`). Real `drawScene` (three.js blit + 2D overlay) at scripted
`(tick, framePhase)`; real `createAudio` graph offline-rendered via the additive
`contextFactory` seam. Fixture: 6 machines (2 running sorters, outputFull /
powerLimited / running furnaces, starved sorter), camera scale 3, 960×600.
No generated reference assets were used; every probe reads the live canvas or
the rendered audio buffer.

Artifacts (committed): `docs/evidence/2026-11-14-rw3d-t23-activity.json`
(54 checks + scenario data) and PNGs `…-s1-distinct-states`,
`…-s2-motion-a-tick0` / `-b-tick1` / `-c-tick2`, `…-s3-reduced-motion`,
`…-s4-far-zoom`. Harness: `tests/renderer/rw3d-t23/{harness.html,harness.mjs,capture.mjs}`.

### S1 — distinct truthful states (tick 344)

- Four status accents are four distinct colours: running `(95,216,232)`,
  starved `(138,122,216)`, outputFull `(201,113,58)`, powerLimited `(127,214,194)`.
- powerLimited carries the shape tick `(244,247,251)` (probed in the 3-unit gap
  of the legacy progress-pip band it shares).
- Running core amber `(255,183,101)`; starved core quiet bodyMid
  `(127,159,187)`; outputFull/powerLimited cores `(94,120,130)` — **not amber,
  no fake work**. outputFull retains the static held-cargo mark.
- Render never mutates sim state (JSON identity witness).

### S2 — independent timing, 600-frame step-1 sweep (V04)

- Ring-region hashes: running machines 16/20/20 distinct frames; quiet
  machines 1/1/1 — **byte-identical, no fake production**.
- Fan phases: 16 pair combinations, disagreement 600/600 frames.
- Core swell visits both phases per machine (178/210/210 of 600 frames);
  mixed-swell frames 388/600; solo changes only1=212 / only2=281, both=71/564
  (<90%) — **motion never locks in unison**.
- Vent puffs on 135 frames, max 2 (pool-bounded), 4 distinct vent-region hashes.
- Fan blade painted solid at the model position 16/16 probes.
- Three motion frames captured (ticks 0/1/2) with disagreeing fans AND swells.
- Sim state untouched on every frame.

### S3 — reduced motion (U07)

Fan holds 1 discrete position; ring regions byte-identical across 600 ticks;
zero moving puffs; vent stage stays readable (static mark on 16/21 sampled
frames); all four status accents retained; swell suppressed; no sim mutation.

### S4 — far zoom (scale 1.4)

All four accents and the amber working core retained; fine activity layer
throttled (fan box absent), information preserved.

### S5 — batch-driven roller/sweep

Progress 60/180/300/480 of 600 → roller steps 0,1,2,3 (dot painted at the model
position); magnet sweep true,false,false,false (mark painted only while
sweeping).

### A1–A5 — offline audio verification

- **A1 mix**: peak 0.1601, rms 0.0100, clip 0 (ceiling 0.738). Drone pans left
  (L 0.0066 / R 0.0037, peak 0.0218); sorter pans right (L 0.0054 / R 0.0096,
  peak 0.0446); furnace pan 0 centre-balanced (balance 0.00000, peak 0.1153);
  non-machinery collect cue ignores pan (balance 0.00000).
- **A2 clamp**: raw +5 renders identically to +0.35 (L/R 0.00222/0.00397 both);
  NaN pan → centre; clamped voice peak 0.0227 — gentle.
- **A3 mute**: late mute silences cues AND beds (peak **exactly 0**);
  muted-from-start renders digital silence (peak 0); unmuted beds-on control
  audible and gentle (rms 0.0250, peak 0.0626).
- **A4 pool**: 16 bursts × 4 cues → maxVoices 15 (cap 16, ledger actually
  used), maxPans 12 ≤ voices; saturated mix peak 0.4953, rms 0.0986, clip 0 —
  under the 0.738 ceiling.
- **A5 graph read-back**: machinery voice records gain→pan→machinery
  (`v1`→`v1-pan`); non-machinery voice has no pan hop (10 nodes).
- **Z**: no page errors.

## Save / migration impact

None. Session-only and additive: no save shape, migration or simulation change.
The activity model reads sim state and never writes it — a state-identity
witness is asserted on every rendered frame in both the unit tests and the
running-build capture. Existing saves, cancellation, approval settings and
security paths are untouched.

## Limitations / pending review

- Non-vision agent: numerical pixel/hash/offline-audio checks only. **Capable
  visual inspection PENDING at architecture G1 (#151)** — this evidence cannot
  self-certify visual fidelity.
- Audio verified by offline render (peak/RMS/clip/pan balance), not by
  listening; gentle-by-construction bounds are asserted, loudness perception
  is owed to capable review.
- The powerLimited shape tick shares the legacy progress-pip band; it is
  visible in the 3-unit pip gaps (probe offset 7.5) — legacy geometry, not a
  regression.
- The fan/roller/vent overlay paints on both the 2D and three.js paths; the
  recording census contexts keep the pinned legacy op census (parity asserted).
- Independent QA and product verdict on the immutable PR head are required
  before merge; no self-acceptance.