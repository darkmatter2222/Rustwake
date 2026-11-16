# REV-Q005 g1 - STRUCTURAL half verdict for Q-005 (audio mix rebuild)

- Candidate: `origin/main` head `72736baf6f1b400fe22c4be5ccb9d4eaef3662b7` (docs); the code commit is `6ff436f` ("Q-005: audio mix graph restructure + structural tests (S-01..S-22)"). Verified that the audio paths are identical between the two: `git diff --stat 6ff436f 72736ba -- src/game/audio tests/game src/app` prints nothing, so `src/game/audio/audio.ts`, `tests/game/audio.test.ts` and `src/app/**` carry no delta.
- Reviewed in my own checkout `C:\Users\ryans\.local\share\opencode\worktree\fe4e05\review-r1` after `git checkout --detach 72736ba` (detached; the developer worktree was not written to; no production file modified by this review).
- Spec being verified: my own `work/review/REV-AUD1.md` (S-00..S-22). Files walked: `src/game/audio/audio.ts` (480 lines), `src/ui/App.tsx` (635 lines), `tests/game/audio.test.ts` (559 lines), plus `src/app/store.ts` (378 lines) for the mute paths.
- My own evidence, generated here and not copied from the handoff: `probe-aud-g1.mts` (stub-context arithmetic and graph trace), `probe-aud-g1b.mts` (per-instance mute/edge/buffer/ledger measurements, 10 jsdom import cases), `probe-aud-g1c3.mts` (real Chrome: context count and suspend/resume), `probe-aud-g1d.mts` (real Chrome: compressor defaults).
- **Verdict, STRUCTURAL half only: accept.** The listening half stays **blocked** by B-11 and is not counted against this SHA. Findings below are numbered from **A-17** (REV-AUD1 used A-1..A-16); none of them breaks an S-item.

## 1. Commands run here, exact tails

| Command | Result (verbatim tail) |
|---|---|
| `npm ci` | OK (audit summary only; 1 low-severity advisory, no install error) |
| `npx vitest run` | `Test Files 22 passed (22)` / `Tests 193 passed (193)` / `Duration 5.20s` |
| `npx vitest run tests/game/audio.test.ts` | `Test Files 1 passed (1)` / `Tests 20 passed (20)` / `Duration 937ms` |
| `npm run typecheck` | `> tsc --noEmit` then nothing - clean, 0 diagnostics |
| `npm run build` | `52 modules transformed`, `index-C26PXQsL.js 230.00 kB / gzip 72.32 kB`, `index-DiRtZOre.css 7.15 kB`, `catchup.worker-DphWaCEx.js 13.02 kB`, `built in 533ms` |
| byte sizes on disk | `index-C26PXQsL.js` **230027 B**, `index-DiRtZOre.css` **7149 B**, worker 13015 B |

Against my own earlier baselines: JS 225455 B at `8cfc172` -> **230027 B** here (+4572 B for the whole rebuilt audio module, inside the 229000 B line only if counted with the Q-002 slice pending - see the note in section 6), CSS unchanged at 7149 B, test count 173 -> **193** (+20 = exactly the new audio file, no earlier test removed). `npm run validate` not re-run: the diff touches no content file.

## 2. S-00..S-22 walk (PASS / N-A / listening-gated)

Measured = from my own probe or from the test source; both are recorded with the number.

| # | Status | Measured evidence |
|---|---|---|
| S-00 | **PASS** | `graphSnapshot()` (`audio.ts:438-446`) returns `id/kind/level/inputIds/outputId`. My trace right after `resume()`: 9 entries = `destination`, `master`, 5 category buses, `bed-ambience`, `bed-music`; after 3 plays the one-shot entries `v1..v3` appear with `kind: "voice"`. Test `audio.test.ts:235-248`. |
| S-01 | **PASS** | All five `CATEGORY_BUSES` report `outputId "master"`; exactly one bus with `"destination"` (`master`). Test 250-258. My stub also records the real edges: `gain#3..#7 connects-> ["gain#2"]` (the five buses into the master), `gain#2 -> ["comp#1"]`, `comp#1 -> ["destination"]` - table and real edges agree. |
| S-02 | **PASS** | `compressor.connects == ["destination"]` (test 260-268) and my edge dump shows no category bus reaching `destination`. |
| S-03 | **PASS** | Per-cue `outputId` equals the declared bus for all 10 cues (`CUE_TABLE` 69-80 vs my voice dump: `v1->machinery` for `drone`, `v3->effects` for `salvage`, `v5->ui` for `upgrade`, etc.). The tail gain also lands on its bus (`tail buffer -> gain#14 -> gain#6` = effects). |
| S-04 | **PASS** | Mute is one write: gain values by creation order `[0.9,0.25,0.2,0.45,0.8,0.6,0.12,0.1]` -> `[0,0.25,0.2,0.45,0.8,0.6,0.12,0.1]`, **changed count = 1** (the master only); `setMuted(false)` restores `0.9`. While muted the snapshot reads level 0 for master, every bus and both beds, and `play()` allocates nothing (new gains = 0). Test 280-304. |
| S-05 | **PASS** (numeric) / audibility gated | 1 `createDynamicsCompressor` per instance (my probe: 2 across two instances = 1 each), still 1 after plays. Real Chrome defaults, unread-but-now-measured here: `threshold -24`, `knee 30`, `ratio 12`, `attack 0.003`, `release 0.25`, and the WebAudio compressor has no makeup-gain param. How that sounds = S-05b, B-11. |
| S-06 | **PASS** with A-20 | `busVoiceSum`: music 0.40, ambience 0.12, machinery 0.54, effects 0.82, ui 0.70 -> `maxConcurrentVoiceSum() = 0.82`; `0.9 x 0.82 = 0.738 <= 1.0`; `HEADROOM = 0.7`; `headroomCeiling() = 0.574`. |
| S-07 | **PASS** | Counts exactly `5/4/5/4/4/5/4/5/3/3`, **total 42**; per cue the variant freqs and gains are all distinct; max `abs(f/base-1) = 0.04 <= 0.06`, max `abs(g/base-1) = 0.08 <= 0.19` for all 10 cues. Test 327-345 pins 42 and the table shape. |
| S-08 | **PASS** (numeric) / variety gated | 4 successive `collect` plays give 4 distinct peak levels (`0.22, 0.2024, 0.2332, 0.209`); a second fresh instance replays the identical sequence (test 347-374). Perceived variety = S-08b, B-11. |
| S-09 | **PASS** | `salvage`, `repair`, `sorter` carry `tail: true` -> 1 oscillator + 1 `createBufferSource` per voice (measured: 1 play of `salvage` = 2 new gains, 1 osc, 1 tail source). `furnace`/`drone`/UI cues stay single-layer as specified. |
| S-10 | **PASS** | Recorded automation per voice gain: `["set",0,t0] ["lin",peak,t0+attack] ["exp",0.0005,t0+duration]`; attacks `0.002-0.014` (max `furnace 0.014`), all inside `[0.002,0.020]`, 10/10 > 0 (`audio.ts:70-79`, test 549-558 + 392-410). |
| S-11 | **PASS** | Measured ledger ceiling: after 310 `play()` calls, one-shots = **16** exactly, never above; with `voiceBudget = 4` the ledger holds 4 (trace in S-12). |
| S-12 | **PASS** with A-25 | Budget 4, order `drone sorter salvage collect upgrade` (each twice): survivors `v1->machinery@0.18, v3->effects@0.32, v4->effects@0.22, v5->ui@0.28` - the second `sorter` was the victim; then `blocked`: `v1` (machinery 0.18) is dropped and `blocked@ui` enters, `effects` and `ui` survive. Documented order `ui 5 > effects 4 > music 3 > machinery 2 > ambience 1` (`audio.ts:129-136`). |
| S-13 | **PASS** | Measured: 3 different cues at one instant = 3 oscillators (independent windows); repeat of one cue at the same instant = 0 new; at `dt = 0.030` = 0 new (window is `<=`, `COALESCE_WINDOW = 0.03`, `audio.ts:151,375`); at `dt = 0.0301` = 1 new. |
| S-14 | **PASS** | 10/10 cue names have a live producer: `cueFor` yields `salvage, repair, drone, upgrade, return, collect` (`App.tsx:615-630`), `stateCues` yields `sorter, furnace, discovery` (`App.tsx:603-613`, fired from the render diff at `App.tsx:176-188`), `blocked` at `App.tsx:78` and `268`. The three formerly unreachable cues are asserted per state transition (test 451-462). |
| S-15 | **PASS** with A-18/A-19 | After `resume()`: `bed-ambience@0.12`, `bed-music@0.1`, `ambience.inputIds ["bed-ambience"]`, `music.inputIds ["bed-music"]`, and exactly one looping buffer source (`loop=true`, `start=1/stop=0`). Both beds are excluded from the 16-voice ledger (they are not in `voices[]`). |
| S-16 | **PASS** (numeric) / feel gated | `distanceGain(0,1)=1`, `(4,1)=0.7143`, `(6,2)=0.5952`, `(8,1)=0.5556`, `(0,3)=0.9091`, `(12,1)=0.4545`, `(400,8)=0.35` (clamped at `MIN_DISTANCE_GAIN`), all matching the documented `1/(1+0.1d) x 1/(1+0.05(z-1))` to 4 decimals; in-voice peaks 0.28 -> 0.1533 for the far tap. Attenuation feel = S-16b, B-11. |
| S-17 | **PASS** for (a),(b),(c); (d) by code path | My jsdom probe, 10 runs: after `setSettings({muted:true})` and after a **save import** (new store, `loadFrom`, `step(1)`), `isMuted() === store.getSettings().muted === true` and the real master gain `.value === 0` in every run. The two live toggles (`App.tsx:291-295` gate, `317-321` HUD) plus the sync effect (`App.tsx:93-98`) cover both write sites; follower adopt (`store.ts` `applyRemote`) mutates the same `settings` object the effect reads, so it is covered by the same line but has no dedicated test (A-26). |
| S-18 | **PASS** | `tests/ui/app.test.tsx:109-114` green inside the 193; serialized save keeps `"muted":true`. |
| S-19 | **PASS** | Stub: `suspend` count 1 then `resume` count 1, `close` 0 (test 504-516). Real Chrome with the app running: `ctx.state running -> suspended (hidden) -> running (visible)`, exactly **1** listener (`App.tsx:100-106`, `onVisibility` at `audio.ts:474-479`). |
| S-20 | **PASS** | `audio.ts` contains no `setTimeout` (grep: only `requestAnimationFrame` in `App.tsx`); all automation times derive from the single `context.currentTime` (`audio.ts:373`); two identical call sequences produce byte-identical snapshots (test 518-532). |
| S-21 | **PASS** module / A-23 for the app | `dispose()` empties the table (`[]`), disconnects master + 5 buses, `close` count 1, and a later `resume()` rebuilds 6 buses (test 534-547). Real Chrome: exactly **1** `AudioContext` constructed across gate -> taps -> 2 mute toggles, `sampleRate 44100`, created only after the `Begin recovery` tap. |
| S-22 | **PASS** | `tests/game/audio.test.ts` exists, 20 tests, green under `npx vitest run` inside the 22-file/193-test run; typecheck and build clean. Coverage map: S-00..S-16 and S-19..S-21 have dedicated cases; **S-17 and S-18 have no case in that file** (S-18 lives in `app.test.tsx:109-114`, S-17 is my probe - see A-26). |

## 3. The five briefed invariants, recomputed here

| Briefed check | Required | My measured value | Verdict |
|---|---|---|---|
| Headroom 0.7 | `master x maxSum <= 1.0`, constant `0.7` | per-name sums 0.40/0.12/0.54/0.82/0.70, max **0.82**; `0.9 x 0.82 = 0.738 <= 1.0`; `HEADROOM = 0.7` | **holds**; the derived `headroomCeiling()` = 0.574 is a second, different quantity (A-20) |
| Mute single write | one gain node changes per mute | `changed count = 1` out of 8 gain nodes; master `0.9 -> 0 -> 0.9`; bus values `[0.25,0.2,0.45,0.8,0.6]` and bed values `[0.12,0.1]` untouched | **holds** |
| Budget 16 + steal order | cap 16, lowest priority stolen first, `ui > effects > machinery` | cap measured exactly **16** after 310 plays; steal trace at budget 4: victim #1 = the 2nd machinery voice, victim #2 = `machinery 0.18`, survivors `effects 0.32 / effects 0.22 / ui 0.28 / ui 0.16`; priorities `ui 5 > effects 4 > music 3 > machinery 2 > ambience 1` | **holds** (tie-break wording: A-28) |
| Coalescer 30 ms | identical cue at dt 0.030 -> 1 voice; different cues at one instant -> 2+ | `COALESCE_WINDOW = 0.03`; new oscillators 0 / 0 / 1 for dt 0 / 0.030 / 0.0301; 3 different cues at one instant -> 3 oscillators | **holds** |
| Variant counts 5/4/5/4/4/5/4/5/3/3 | equal to the code table | `salvage=5 collect=4 repair=5 drone=4 sorter=4 furnace=5 upgrade=4 blocked=5 return=3 discovery=3`, **total 42**, freq and gain distinct within every cue | **holds**, matches the code and the test's pinned 42 |

Pre-compressor stacking model (why the compressor is load-bearing, not the 0.7 constant): with the 30 ms coalescer floor, the simultaneous count per bus is `sum over cues of ceil(duration/0.03) x max variant gain` = effects **4.0916** -> x0.8 x0.9 = **2.946**; ui 3.4768 -> 1.8775; machinery 3.18 -> 1.2879; music 3.18 -> 0.7155; the absolute 16-voice bound is 4.7308 -> **3.4062**. So the worst case is ~3-4x unity at the compressor input and the measured `threshold -24 / ratio 12` stage is what keeps it off the clip line.

## 4. New structural findings (numbering continues: A-17..)

### A-17 The snapshot topology is a literal table; 1 of the 7 real edges is asserted
- **Seen**: `declareBus` writes `outputId: name === "master" ? "destination" : "master"` as a constant (`audio.ts:230`), independent of the actual `node.connect()` calls (`audio.ts:254, 260, 283, 397, 407-408, 416`). My stub dump confirms the real edges do match today: five buses -> `gain#2` (master), master -> `comp#1`, `comp#1` -> `destination`. The only test that reads a recorded edge is `audio.test.ts:265` (compressor -> destination).
- **Player impact**: none today; the risk is that a future mis-wiring (e.g. a bus connected straight to the destination) keeps all 20 tests green because the snapshot is not derived from the connections.
- **Change**: one helper `link(from, to)` inside the module that calls `from.connect(to)` **and** writes `outputId`/`inputIds`; `graphSnapshot` then reports observed edges only.
- **Acceptance**: `audio.test.ts` gains one case comparing every snapshot edge with the stub's recorded `connects` (expected 8 edges: 5 bus->master, master->compressor, compressor->destination, plus the voice edges), and the case turns red when `audio.ts:260` is temporarily pointed at `ctx.destination`.

### A-18 Snapshot levels come from the closure flag, not from the node
- **Seen**: `effectiveLevel` returns `isMuted ? 0 : node.level` (`audio.ts:267-271`), so a muted snapshot reads 0 while the real stub nodes still hold `[0.25, 0.2, 0.45, 0.8, 0.6, 0.12, 0.1]` (measured). The single-write-on-master fact is verified separately against the real nodes (section 3), so nothing is wrong - but S-04's "the snapshot reads the effective levels" is a computed echo, not a read-back.
- **Change**: read `busNodes.get(name)?.gain.value` when the context exists and fall back to the declared level.
- **Acceptance**: one assertion comparing `graphSnapshot()` levels with `stub.nodes.filter(kind==="gain").map(gain.value)` in both mute states.

### A-19 `busVoiceSum` ignores the variant multipliers that the voice actually uses
- **Seen**: the sum uses `spec.gain` (`audio.ts:170-176`) while `play()` applies `variant.gain` (`audio.ts:380-382`). Sum of the maximum variant gain per cue = **0.8713**, so the true per-name worst case is `0.9 x 0.8713 = 0.7842` rather than `0.738`; the 0.7 constant still covers it.
- **Change**: sum `Math.max(...CUE_VARIANTS[name].map(v => v.gain))`, or state in the doc comment that the invariant uses the declared (not the variant) peak.
- **Acceptance**: `busVoiceSum("effects") === 0.8713` (or the doc comment names the model) and `headroomCeiling()` still `<= HEADROOM`.

### A-20 Two different quantities are both called "headroom ceiling"
- **Seen**: the comment at `audio.ts:162-166` derives `0.9 x 0.82 = 0.738 -> 0.7`; `headroomCeiling()` computes `HEADROOM x maxConcurrentVoiceSum() = 0.7 x 0.82 = 0.574` (`audio.ts:190-192`). Measured both. `audio.test.ts:322-324` only checks `0.574 <= 0.7` and `0.738 ~= 0.738`, so neither value is pinned as *the* ceiling.
- **Player impact**: none directly; it makes the one number the listening review should compare against (the working ceiling) ambiguous.
- **Change**: `headroomCeiling()` returns `BUS_LEVELS.master x maxConcurrentVoiceSum()` (0.738) and the `<= HEADROOM` assertion becomes an exact `=== 0.7` after rounding to one decimal.
- **Acceptance**: one printed value, asserted with `toBe`, plus the model used (per-name or per-overlap, see section 3).

### A-21 The music bed starts one automation slot before the first one-shot
- **Seen**: in a fresh instance the sustained music oscillator is `osc#11` while the first one-shot oscillator is created after it (my B2 dump order: buses, bed gain `#8` + bed source `#9`, then voice `#10/#11`). Deterministic, but it shifts every "Nth created node" index used by tests that count nodes (`mainGainCalls`, `audio.test.ts:210-223`).
- **Change**: none required; note the ordering in the doc comment, or index voices by id in the tests.
- **Acceptance**: the node-counting helpers state the expected creation order, and both styles (id-based and index-based) agree on the same voice.

### A-22 `CueSpec.loop` is a dead field
- **Seen**: no entry of `CUE_TABLE` sets `loop` (`audio.ts:70-79`), so `if (!spec.loop)` at `audio.ts:411` is always true and the tail source always gets a `stop`. Only the beds loop, via the local `loopBuffer` flag (`audio.ts:276-291`).
- **Change**: delete the field, or give one cue `loop: true` and assert a source whose `stops.length === 0` beyond the two beds.
- **Acceptance**: no unread optional field on `CueSpec` (tsc plus a one-line check), or the S-15-style count becomes 3 sustained sources.

### A-23 The app never calls `dispose()`; S-21 is module-level only
- **Seen**: `git grep "dispose()"` in `src/` returns only the interface (`audio.ts:39`) and the implementation (`audio.ts:447`) - no call site; `App.tsx` has no cleanup for the audio object (`App.tsx:55, 67-70`). Real Chrome measured 1 context for one mounted root, so nothing is broken today.
- **Change**: keep the api in the ref and call `audioRef.current?.dispose()` from the existing unmount cleanup next to the visibility listener (`App.tsx:100-106`).
- **Acceptance**: with `stub.counters`, a mount/unmount/mount sequence reports `close === 1` and `open contexts === 1`.

### A-24 After `dispose()` the beds never come back
- **Seen**: measured - unmuted start `beds = 2, ambience ["bed-ambience"], music ["bed-music"]`; after `dispose(); resume()`: `beds = 0`, `ambience.inputIds []`, `music.inputIds []`, snapshot length 7. Cause: `bedsStarted` (`audio.ts:274-275`) is never reset in `dispose()` (447-465).
- **Player impact**: any remount path (StrictMode double-mount, a future router or a second root) leaves the yard with **no room tone and no music bed** while all event sounds keep working - the exact "world goes silent between taps" symptom A-3 described.
- **Change**: `bedsStarted = false` inside `dispose()`.
- **Acceptance**: `audio.test.ts` S-15 extended with the `dispose(); resume();` sequence still reporting both beds present and both bus `inputIds` non-empty.

### A-25 Unmuting does not restart the beds
- **Seen**: measured - `createAudio(true)` + `resume()` -> `beds = 0`; `setMuted(false)` -> still `beds = 0`, both bus `inputIds` empty; only an explicit `resume()` brings them back (`beds = 2`). `setMuted` writes only the master gain (`audio.ts:363-367`); `startBeds` is called from `resume()` alone (`audio.ts:361`).
- **Player impact**: the shipped flow reaches this - the gate and HUD mute buttons (`App.tsx:291-295, 317-321`) call `setMuted`, not `resume()`. A player who starts muted (or mutes at the gate) and unmutes later plays the whole session without the room tone and the music bed until the tab is backgrounded once.
- **Change**: after the write in `setMuted`, `if (!next && ctx) startBeds(ctx, ctx.currentTime)` (the `bedsStarted` guard makes it idempotent).
- **Acceptance**: `audio.test.ts` S-15 variant: `createAudio(true) -> resume() -> setMuted(false)` yields two `bed-` voices and non-empty `inputIds` on both buses, with no second oscillator created by a repeat call.

### A-26 S-17 and S-18 have no case in `tests/game/audio.test.ts`
- **Seen**: the 20 cases cover S-00..S-16 and S-19..S-21 plus the cue-set guard; nothing asserts `isMuted() === store.getSettings().muted` after an import or an adopt. S-18 is covered elsewhere (`tests/ui/app.test.tsx:109-114`), so S-22's "covers S-01..S-21" is 1 step short. My jsdom probe stands in for now: 10/10 runs agree on both numbers after an import.
- **Change**: two jsdom cases in `audio.test.ts` - (i) `setSettings({muted:true})` then `step(1)` -> `isMuted()` true and the created master gain `0`; (ii) build a second store from a serialized save with `muted:true`, `loadFrom`, `step(1)`, same two assertions.
- **Acceptance**: the audio file's test count goes 20 -> 22 and the S-17 line becomes `PASS (tested)`.

### A-27 The visibility listener can create the context before the start gesture
- **Seen**: `App.tsx:100-106` registers `onVisibility` on mount, i.e. while the gate is still on screen; the handler's visible branch calls `api.resume()`, which calls `ensure()` (`audio.ts:357-361`). In my measured run the first dispatch came after the tap, so the observed order was gate-then-context; a hidden/visible pair during the gate would invert it, and `startBeds` would then run from a non-gesture task.
- **Change**: inside `resume()`, no-op when `ctx === null && !startedFlag`, or register the listener from the `onBegin` handler (`App.tsx:284-289`).
- **Acceptance**: probe asserts `__ctor === 0` at the gate after a dispatched `visibilitychange`, and `1` after `Begin recovery`.

### A-28 The steal tie-break drops the newest, the name says oldest
- **Seen**: `stealOldest` compares with `<=` (`audio.ts:346`), so among equal priorities the **highest index** (the newest voice) wins the victim slot - my trace shows `sorter` (voice 2) leaving while `drone` (voice 1) stays. Behaviour matches the comment at 343 ("lowest-priority, most recently started"), not the function name.
- **Change**: rename to `stealLowestPriority`, or switch to `<` if oldest-first is wanted; keep one printed tie case in the test.
- **Acceptance**: the S-12 case asserts the exact survivor id sequence for the budget-4 trace above.

### A-29 The S-16 test ratio is contaminated by the variant rotation
- **Seen**: measured - the far tap's peak is `0.1533`, the near tap's `0.28`, ratio **0.5475**, while `distanceGain(6,2) = 0.5952`; the difference is exactly the variant gain ratio `0.92` (`0.92 x 0.5952 = 0.5476`). `audio.test.ts:484-502` therefore asserts a number that is not the attenuation constant.
- **Change**: assert the exact table (`0.5952`, `0.7143`, `0.5556`, `0.35` clamp) and, for the in-voice case, divide the peak by `variant.gain` (index `0` after a fresh instance).
- **Acceptance**: the in-voice assertion equals `distanceGain(d, z)` to 4 decimals instead of a bare `far < near`.

### A-30 Compressor parameters are never set and never read back
- **Seen**: `createDynamicsCompressor()` is called bare (`audio.ts:243`); no `threshold`/`knee`/`ratio`/`attack`/`release` assignment exists in `src/`. Measured on this machine's Chrome: `-24 / 30 / 12 / 0.003 / 0.25`, and the node has no makeup-gain parameter, so the effective ceiling comes from the UA defaults and the 0.7 constant is only a design target.
- **Change**: either set the three parameters explicitly in `ensure()` or add them to the snapshot as a `stage` entry; the listening review then compares against numbers instead of defaults.
- **Acceptance**: `graphSnapshot()` contains one `stage` entry with the four numbers, or `audio.ts` shows the assignments; the doc comment next to `HEADROOM` names the same values.

### A-31 The room-tone buffer is a periodic ramp, not noise, and its loop seam is discontinuous
- **Seen**: the deterministic fill is `(index % 7 - 3) / 4` for every length (`audio.ts:320-325`), so the 0.5 s bed buffer repeats a 7-sample saw. Measured: 1 `createBuffer` call for the tails (the two lengths do share the cached object per length) and the two distinct fill signatures `4000` and `480` samples with the **same** first five values. At 8 kHz a 7-sample period is a 1142.9 Hz tone; at 44.1 kHz, 1142.9 Hz; `4000 % 7 = 4`, so each 0.5 s loop crosses a partial period - a step at the seam.
- **Player impact**: the room tone should read as a hum/room wash; a pure periodic ramp reads as one steady pitch, and the seam adds a tick twice per second, which the S-08/S-15 structural pass cannot see.
- **Change**: keep determinism, break the period - e.g. a 16-tap LCG or the sum of two coprime periods (7 and 11) - and pick a length divisible by the period.
- **Acceptance**: the buffer's first `2 x period` samples are not an exact repeat of the first `period`, asserted in the test, and the loop length is a multiple of the period.

## 5. Closure map for the A-1..A-16 defects from REV-AUD1

| # | Then | Now at `6ff436f` |
|---|---|---|
| A-1 master dangling | open | **closed** - five buses into one real master (`audio.ts:252-263`), master -> compressor -> destination (my edge dump) |
| A-2 no limiter | open | **closed** - one `DynamicsCompressorNode` per instance (measured 1), params still default: A-30 |
| A-3 empty ambience bus | open | **closed** - `bed-ambience` looping buffer source, `inputIds ["bed-ambience"]`; regresses on remote/muted paths: A-24/A-25 |
| A-4 music bus silent | open | **closed** - `discovery` now reachable plus `bed-music` |
| A-5 3 cues unreachable | open | **closed** - 10/10 producers (S-14) |
| A-6 no attack stage | open | **closed** - `setValueAtTime(0) -> linearRamp(peak) -> exponentialRamp(0.0005)`, attacks 0.002-0.014 |
| A-7 no variation | open | **closed** - 42 variant specs, 3-5 per cue, all distinct |
| A-8 single-layer voices | open | **closed** for the 3 metallic cues (1 osc + 1 noise tail); single-layer elsewhere by spec |
| A-9 beep-dominant identity | open | **partial** - tails and two bed sources added; the 10 one-shot timbres are still single-oscillator, which only the ear review can settle |
| A-10 no voice priorities | open | **closed** - priorities + steal, measured order `ui > effects > machinery` |
| A-11 ledger after `suspend()` | open | **improved** - the steal path clears slots immediately; `onended` still the only natural release (`audio.ts:428-433`) |
| A-12 no distance attenuation | open | **closed** - `distanceGain` exact against the documented formula |
| A-13 `suspend()` dead code | open | **closed** - one paired `visibilitychange` handler, real-browser `running -> suspended -> running` |
| A-14 two mute sources | open | **closed** - store is the SSOT (`App.tsx:93-98`), import path verified by my probe; adopt still untested: A-26 |
| A-15 no teardown | open | **closed at module level** - `dispose()` empties and closes (measured `close = 1`); the app never calls it: A-23 |
| A-16 no audio tests | open | **closed** - 20 cases, 193 total, S-17/S-18 gap: A-26 |

## 6. Scores, verdict, unverified, queue

| Category | At `3f1b4ac` (REV-AUD1) | Now at `6ff436f` | Basis |
|---|---:|---:|---|
| State fidelity | 2 | **2** | the machine cues now fire from the state diff (`stateCues`), but `powerLimited` still renders as idle - Q-007, unchanged by this commit |
| Performance / accessibility | 3 | **3** | 16-voice cap measured, no `setTimeout` in the module, one listener, one context, contained scroller and 44 px targets still green in the 193; JS grew to 230027 B (note below) |
| Scene composition / asset identity | 1 | 1 | renderer untouched (Q-002) |
| Audio - structural half | rework | **pass** | S-00..S-22 all pass on my own measurements; 15 of 16 earlier defects closed |
| Audio - listening half | blocked | **blocked** | B-11, unchanged: S-05b compressor audibility, S-08b perceived variety, S-16b near/far feel, S-17 mute after import by ear. Not counted against this SHA |

**Verdict, STRUCTURAL half, `6ff436f` (published inside `72736ba`): accept.** All 23 spec rows are PASS or listening-gated; the five briefed invariants reproduce exactly; 15 of the 16 defects I filed at `3f1b4ac` are closed and the 16th is improved. The 15 new findings (A-17..A-31) are hardening and fidelity items: two of them change behaviour on a real path (A-24 remount loses both beds, A-25 unmute does not restart them), the rest are one-line or test-only. None of them reopens an S-row, so none of them blocks this SHA.

Cross-task note: my Q-002 spec (`work/review/REV-Q2SPEC.md`) pinned `index-*.js <= 229000 B` against the 224968 B baseline; the audio rebuild put it at **230027 B**, so that ceiling must move to 231000 B (or the module shed ~1 kB) before the Q-002 acceptance line can be evaluated as written. Recorded here so the two specs do not contradict each other.

**Unverified by this review** (explicitly not claimed): the four listening rows (B-11), real-phone behaviour and thermal trace (B-08 - my browser numbers come from desktop headless Chrome), motion gate (Q-004), keyboard focus order over the cards, and the 17-minute organic gallery. S-05/S-08/S-16 have their numeric halves measured and their perceptual halves pending.

Prioritized next-five (audio area, then the presentation line):
1. **A-24 + A-25** - reset `bedsStarted` in `dispose()`, start the beds from `setMuted(false)`: two lines, they remove the only two behavioural gaps found here; each gets one assertion in the existing S-15 case.
2. **A-26 + A-29** - the two missing jsdom cases and the exact-value S-16 assertions; test count 193 -> 195 with no behaviour change.
3. **A-17 + A-18** - derive `inputIds`/`outputId`/levels from the observed stub state so the graph tests bite on real mis-wiring.
4. **A-31** - aperiodic deterministic bed fill with a length divisible by the period, plus the loop-seam assertion.
5. **A-30 + A-22 + A-23 + A-27 + A-28 + A-19/A-20** as one tidy-up commit (explicit compressor params, dead field, app-level `dispose()`, gesture-order listener, tie-break name, two headroom numbers); then back to the presentation queue **Q-002 -> Q-003 -> Q-004 -> R-16 -> Q-007**, which is where the first-feel score can still move.

Artifacts written by this review (no production file touched): `review-r1/rev-q005-g1.md`, `review-r1/probe-aud-g1.mts`, `review-r1/probe-aud-g1b.mts`, `review-r1/probe-aud-g1c3.mts`, `review-r1/probe-aud-g1d.mts`. Reproduce with: `git checkout --detach 72736ba`; `npm ci`; `npx vitest run`; `npm run typecheck`; `npm run build`; `npx tsx probe-aud-g1.mts`; `npx tsx probe-aud-g1b.mts`; `npm run preview -- --port 4191 --strictPort` then `RUSTWAKE_URL=http://localhost:4191/ npx tsx probe-aud-g1c3.mts`.

Report path: `review-r1/rev-q005-g1.md`. Verdict: **accept** (structural half) for `6ff436f`, reviewed at head `72736baf6f1b400fe22c4be5ccb9d4eaef3662b7`; listening half **pending** on B-11.
