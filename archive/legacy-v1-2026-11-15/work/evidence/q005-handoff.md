# Q-005 handoff - audio mix graph restructure (structural half)

- Branch: q005-audio, base a8fb14a. Candidate SHA: this commit (recorded by the coordinator).
- Changed: src/game/audio/audio.ts (graph rewrite), src/ui/App.tsx (visibility wiring, state-diff cues, distance/zoom), tests/game/audio.test.ts (new).
- Spec: review-r1/rev-aud-g2.md sections 1-3 (S-00..S-22). Node-env stub AudioContext records connect/setValueAtTime/linearRamp/exponentialRamp/start/stop/disconnect.

## S-table (verified against the test run quoted in the commit reply)

| ID | Status | Evidence |
|---|---|---|
| S-00 | pass | graphSnapshot() node table, kinds bus/voice/destination (test S-00) |
| S-01 | pass | all five category buses outputId = "master" |
| S-02 | pass | master.outputId = "destination"; exactly 1 bus -> destination |
| S-03 | pass | 10/10 cues: voice gain outputId === declared bus |
| S-04 | pass | master gain 0.9 -> 0 -> 0.9, one write; all levels read 0 while muted |
| S-05 | pass (numeric) | exactly 1 DynamicsCompressorNode between master and destination; audible limiting = listening-pending |
| S-06 | pass | HEADROOM = 0.7 = round1(0.9 x 0.82); ceiling 0.574 <= 1 |
| S-07 | pass | variant counts 5/4/5/4/4/5/4/5/3/3 = 42 >= 30; pitch |d| <= 0.04, gain |d| <= 0.08 (inside 0.06/0.19) |
| S-08 | pass (numeric) | >= 3 distinct (freq,gain) pairs over repeats; identical sequence on a second fresh instance; perceptual variety = listening-pending |
| S-09 | pass | salvage/repair/sorter: 2 source nodes per voice (osc + noise bufferSource); cached noise buffer |
| S-10 | pass | setValueAtTime(0) -> linearRamp(peak, t+attack) -> expRamp(0.0005, t+dur); attack in [0.002, 0.020] for 10/10 |
| S-11 | pass | 64 play() at frozen currentTime -> <= 16 one-shot voices, no onended delivered |
| S-12 | pass | budget exhausted by machinery: blocked still creates an osc; exactly 1 machinery voice stop() moved earlier; ui > effects > music > machinery > ambience |
| S-13 | pass | same cue at dt = 0.030 -> 1 oscillator; salvage + collect same t -> 2 |
| S-14 | pass | 10/10 cue names have play() call sites (fs call-site count) + stateCues diff fires sorter/furnace/discovery |
| S-15 | pass | both beds in the graph after the start gesture; ambience bed is a loop === true buffer source |
| S-16 | pass | distanceGain monotonic + clamped >= 0.35; distance 0 vs 8 peak ratio = 0.5556 exactly |
| S-17 | partial | App effect writes audio.setMuted(store.getSettings().muted) on every settings.muted change; import/adopt paths covered indirectly |
| S-18 | pass | existing tests/ui/app.test.tsx mute-persistence assertions stay green (untouched) |
| S-19 | pass | exactly one visibilitychange listener; hidden -> suspend x1; visible -> resume x1 |
| S-20 | pass | one play(): non-decreasing times from a single currentTime; no setTimeout in audio.ts (fs-checked) |
| S-21 | pass | dispose(): empty snapshot, node disconnects, ctx.close x1; a later resume() rebuilds |
| S-22 | pass | tests/game/audio.test.ts green under npm test (20 tests); typecheck/build/validate clean |

## Numbers

- Tests: 22 files, 192 passed / 0 failed (audio file = 20). Existing tests untouched.
- Variants per cue (CUE_NAMES order): 5/4/5/4/4/5/4/5/3/3, total 42.
- Headroom: before = 3.2 nominal (six parallel buses at destination). After = 0.7 (single master 0.9 x worst-bus sum 0.82 = 0.738 -> 0.7) with one compressor at the output.
- Built JS: assets/index-*.js 229.48 kB gzip 72.18 kB.

## Listening-pending

- S-05 audible limiting and S-08 perceptual variety: numeric stub evidence recorded, no ear verdict yet (B-11 unchanged).

## Limitations

- StrictMode context-count (S-21 browser half) and real browser AudioContext state unverified headlessly: no browser run in this task; stub counters only.
- S-17 import/follower-adopt paths run through the App effect, not scripted end-to-end in the node test.
- suspend() pairing tested with a stubbed document (visibilitychange is not drivable otherwise in node env).

## Repro

npx vitest run; npm run typecheck; npm run validate; npm run build
