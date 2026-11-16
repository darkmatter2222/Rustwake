# REV-AUD1 - Audio SOURCE-STRUCTURAL half (gen 2, `rev-aud-g2`)

- Candidate SHA (immutable): `3f1b4ac4427a362e038cc1f6f1d95ae0c1a51204`
- Checkout: `.local/share/opencode/worktree/fe4e05/review-r1` (detached at the SHA above)
- Scope: source-level structural audit only. Files read: `src/game/audio/audio.ts` (132 lines), `src/ui/App.tsx` (audio call sites), `src/app/store.ts` (settings), `src/game/persistence/save.ts`, `src/main.tsx`, `docs/DESIGN_BIBLE.md` "Sound direction".
- Verdict this report: **rework** for the Q-005 structural half at the SHA above; **blocked** for the listening half (B-11, unchanged from REV-BASE).
- Unverified dimensions (explicitly not claimed here): rendered waveform/spectra, listening approval, real-device behaviour, browser-run AudioContext state, image first-frame. No browser was run for this task, per instruction.

---

## 1. Actual graph, as written

`ensure()` (`audio.ts:68-83`) creates six `GainNode`s in one flat loop over `Object.keys(BUS_LEVELS)` and gives every one of them the identical wiring statement at `audio.ts:78`: `node.connect(ctx.destination)`.

```
salvage/collect/repair  -> effects[0.8]    -> destination   (audio.ts:78, 118)
drone/sorter/furnace    -> machinery[0.45] -> destination   (audio.ts:78, 118)
upgrade/blocked/return  -> ui[0.6]         -> destination   (audio.ts:78, 118)
discovery               -> music[0.25]     -> destination   (audio.ts:78, 118)
(none)                  -> ambience[0.2]   -> destination   (audio.ts:78, no source)
(none)                  -> master[0.9]     -> destination   (audio.ts:78, no input)
```

Confirmations and refutations:

- **Confirmed (refutes "master is a parent mixer")**: the DESIGN_BIBLE claim at line 51 is correct as written. `master` is created at `audio.ts:76` and connected to `ctx.destination` at `audio.ts:78` inside the same flat loop; no line anywhere assigns `buses.<category>.connect(buses.master)`. The only `connect()` calls in the module are `audio.ts:78` (bus to destination) and `audio.ts:117-118` (osc to voice gain to category bus). Therefore `master` is a **dangling sibling with zero incoming connections**: a `GainNode` with no input emits nothing, so its `0.9` level (`audio.ts:53`) is arithmetically inert. Master mixing is not implemented.
- **Consequence for mute**: mute works only because `setMuted` writes `0` into all six nodes individually (`audio.ts:93-95`). It is six parallel writes, not one parent gain. Any future per-bus slider added on top of this will not compose (no single downstream node to cascade into), and the six `GainNode`s all reach `destination` in parallel, so the nominal sum at the output is `0.9+0.25+0.2+0.45+0.8+0.6 = 3.2` before any voice scaling - no limiter exists (`createDynamicsCompressor` appears nowhere in `src/`).
- **Consequence for ambience/music**: `ambience` (`audio.ts:55`) is referenced by **zero** `CueSpec` entries (`audio.ts:39-50`) - an empty named bus, which the bible (line 53) explicitly says is not implementation. `music` (`audio.ts:54`) is referenced only by `discovery` (`audio.ts:49`), which is unreachable (defect A-5).

### Concrete structural defects

| # | Defect | Evidence (line refs) | Player impact |
|---|---|---|---|
| A-1 | Master bus is a dangling node, not a parent mixer | `audio.ts:74-81` (loop), `78` (`connect(ctx.destination)`), `118` (voice to category bus only); no `category -> master` edge exists | Master level 0.9 does nothing; total loudness is not controllable as one unit; future master fades/limiting impossible |
| A-2 | Six parallel buses sum at `destination` with total nominal level 3.2; no compressor/limiter node anywhere in `src/` | `audio.ts:52-59`, `78`; grep for `createDynamicsCompressor` -> 0 hits in `src/` | Clip-prone stacking when machinery + UI + effects fire in the same tick; harsh, non-uniform loudness |
| A-3 | `ambience` bus has zero sources - empty named bus | `audio.ts:55` declared; no `bus: "ambience"` in `39-50` | World is silent between events; no room tone; "industrial place" presence is absent |
| A-4 | `music` bus carries only the unreachable `discovery` accent | `audio.ts:54`, `49`; no call site (A-5) | No evolving bed; discovery is inaudible in normal play |
| A-5 | 3 of 10 declared cues are unreachable (no `play()` site): `sorter`, `furnace`, `discovery` | `audio.ts:44,45,49`; the only call sites are `App.tsx:74,76,234,252` and `cueFor` `App.tsx:540-555`, whose `default` returns `collect` (`App.tsx:553`) | Machine-state sound never fires; sorter/furnace work is silent, so machinery looks decorative (contradicts bible "Animation grammar": motion communicates work and cause) |
| A-6 | No attack stage in any envelope - step-to-peak then decay only | `audio.ts:115` `setValueAtTime(spec.gain, now)` then `116` `exponentialRampToValueAtTime(0.0005, ...)`; `linearRampToValueAtTime` appears nowhere in `src/` | Hard step-in on square/triangle waves -> clicks instead of transients; bible asks for "short attack/decay" |
| A-7 | Zero variation mechanism: `CueSpec` is one object per cue, no variant table, no detune/gain spread | `audio.ts:30-37`, `39-50`, values used verbatim at `111-116` | Repetition fatigue: the same 60-90 ms beep per action forever; bible line 49 requires "several variations with bounded pitch/gain differences" |
| A-8 | Single-layer voices - exactly one oscillator and one gain per cue; no noise layer, so no debris tail | `audio.ts:108-109,117-118` | Cutting sounds like a toy beep, not "metallic impact plus debris tail" (bible line 49) |
| A-9 | Beep-dominant identity: 4 of 10 cues are triangle/sine between 520-1180 Hz | `audio.ts:41` (880->1180 tri), `46` (520->780 tri), `48` (660->990 sine), `49` (740->1110 tri) | Matches the bible named rejection example "high-pitched pure-tone beeps as the dominant identity" |
| A-10 | No voice priorities; uniform drop of the newest voice | `audio.ts:105` `if (active >= voiceBudget) return;` | Under load the UI confirmation click is starved by machinery drones - exactly the wrong ordering; bible asks for "voice priorities" |
| A-11 | Voice ledger depends on `osc.onended`; with `suspend()` (`128-130`) in-flight voices do not end, so up to 16 slots stay occupied until the context resumes (bounded, self-healing, not a leak past 16) | `audio.ts:119`, `120-124`, `128-130` | First sounds after a tab restore can be silently dropped |
| A-12 | No distance/zoom attenuation: `play(cue)` takes no position and the camera/zoom (`App.tsx:53`) is never consulted | `audio.ts:14,98-127` | All machines sound identical at any zoom; no spatial reading of the yard |
| A-13 | `suspend()` is dead code - no caller and no `visibilitychange` listener in `src/` (grep: `suspend` hits only `audio.ts:15,128,129`; the only `addEventListener` in `src/` is the keydown at `App.tsx:122`) | see left | Hidden-tab suspension is not in effect; battery/CPU and restart-click behaviour uncontrolled |
| A-14 | Two sources of truth for mute: closure `isMuted` (`audio.ts:65`) is written only by the constructor arg (`61,66`) and `setMuted` (`90-91`), while the store replaces `settings` wholesale on import/adopt without touching the audio object (`store.ts:203`, `store.ts:328`; the mute toggle path is `App.tsx:258-260` / `283-287`) | see left | After a save import or leader/follower adopt, `isMuted()` can disagree with `store.getSettings().muted` while the glyph shows the new value |
| A-15 | No teardown: `AudioApi` (`audio.ts:10-16`) exposes no `dispose()`/`ctx.close()`; under `StrictMode` (`main.tsx:11`) each fresh App instance allocates a new `AudioContext` | see left | Context-count growth across remounts (count unverified without a browser run) |
| A-16 | Zero unit tests touch audio: grep for `audio|AudioContext|createGain|GainNode` in `tests/` -> 0 hits | see left | No regression guard; the bible "mix graph tests" evidence row (line 76) has no artifact |

Confirmed present (do not regress): mute **persistence** works at the storage level - `SaveSettings.muted` (`save.ts:24-28`, default `false` at `30-34`), serialized in every write (`store.ts:112`) and asserted in `tests/ui/app.test.tsx:109-114`. Start-after-gesture also exists: the context is created lazily inside `resume()` from the Gate handler (`App.tsx:250-252`, `audio.ts:68-83`).

---

## 2. Cue inventory vs the bible layered-industrial list

10 declared cues, all single-oscillator, all with exactly **1 variant** and **0 % pitch / 0 gain spread**. Frequencies are the declared base values; "sweep" is the `to/base` ratio (`audio.ts:112-113`).

| Cue | Bus | Wave | Hz (base->to) | Sweep (approx semitones) | Dur s | Peak gain | Variants | Reachable |
|---|---|---|---|---|---|---|---|---|
| `salvage` (40) | effects | square | 420->240 | x0.571 (-7) | 0.09 | 0.34 | 1 | yes (`App.tsx:543`) |
| `collect` (41) | effects | triangle | 880->1180 | x1.341 (+5) | 0.07 | 0.24 | 1 | yes (`App.tsx:553`, default) |
| `repair` (42) | effects | sawtooth | 320->720 | x2.25 (+14) | 0.22 | 0.30 | 1 | yes (`App.tsx:545`) |
| `drone` (43) | machinery | sine | 190 fixed | none | 0.16 | 0.18 | 1 | yes (`App.tsx:547`) |
| `sorter` (44) | machinery | square | 260->210 | x0.808 (-3.7) | 0.06 | 0.16 | 1 | **no** |
| `furnace` (45) | machinery | sine | 120 fixed | none | 0.24 | 0.20 | 1 | **no** |
| `upgrade` (46) | ui | triangle | 520->780 | x1.5 (+7) | 0.14 | 0.28 | 1 | yes (`App.tsx:252,549`) |
| `blocked` (47) | ui | square | 200 fixed | none | 0.05 | 0.16 | 1 | yes (`App.tsx:76,234`) |
| `return` (48) | ui | sine | 660->990 | x1.5 (+7) | 0.18 | 0.26 | 1 | yes (`App.tsx:551`) |
| `discovery` (49) | music | triangle | 740->1110 | x1.5 (+7) | 0.30 | 0.30 | 1 | **no** |

Totals: 10 cue names, 7 reachable, 3 unreachable; 10 oscillators for 10 cues (1 layer each); per-bus declared levels `music 0.25 / ambience 0.2 / machinery 0.45 / effects 0.8 / ui 0.6 / master 0.9`; sum of simultaneous declared voice peaks if all ten fired = **2.42** before bus scaling.

Mapping onto DESIGN_BIBLE "Sound direction" (line 49), item by item:

| Bible-listed layer | Status | Notes |
|---|---|---|
| Metallic impact for cutting | **partial** | `salvage`/`repair` are single square/saw sweeps (`40`,`42`); no metallic partial stack, no second layer |
| Debris tail after cutting | **missing** | no tail layer, no noise buffer (`createBuffer`/`createBufferSource` absent from `src/`) |
| Cargo clink | **partial** | `return` (`48`) is a pure sine 660->990 - a beep, not a clink; no attack stage (A-6) |
| Mechanical repair lock | **missing** | only the `repair` upward sweep (`42`); the "lock" transient has no separate layer |
| Motor spin-up | **present, thin** | `repair` 320->720 sawtooth is a spin-up shape (`42`) |
| Quiet drone motor **bed** | **missing as a bed** | `drone` (`43`) is a 160 ms one-shot; there is no sustained/looped source at all (every voice is `osc.start(now)`/`osc.stop(now+dur+0.01)`, `125-126`) |
| Sorter clatter | **declared, unreachable** | `sorter` (`44`) has no call site (A-5) |
| Furnace rumble/vent | **declared, unreachable, single-layer** | `furnace` (`45`): one 120 Hz sine, no vent layer, no call site |
| Subtle UI clicks | **partial** | `blocked` (`47`) is a 200 Hz square - a low buzz, not a click; `upgrade` (`46`) is a 7-semitone triangle blip |
| Distinct discovery accent | **declared, unreachable** | `discovery` (`49`) is the only `music` source, so the music bus is silent in play |
| Ambience / room tone | **absent** | `ambience` bus exists with no sources (A-3) |
| Restrained evolving musical bed | **absent** | no looped source of any kind in `src/` |
| Several variations per repetitive cue | **absent** | 1 variant per cue, 0 % spread (A-7) |
| Voice priorities | **absent** | uniform newest-drop (A-10) |
| Distance/zoom attenuation | **absent** | A-12 |
| Interruption cleanup | **partial** | per-voice disconnect exists (`120-124`), but no bus/context teardown and no steal (A-10, A-15) |

Net: of the 16 rows above, 2 present, 4 partial, 10 absent-or-declared-only.

---

## 3. ACCEPTANCE SPEC - Q-005 structural half (implementable offline)

All checks must be automatable in Node with a stubbed `AudioContext` (record calls; no browser). Prerequisite **S-00**: export a pure snapshot from the module - `graphSnapshot(): { id: string; kind: "bus"|"voice"|"destination"; level: number; inputIds: string[]; outputId: string | null }[]` - built from the module own node table, so tests read the graph instead of inferring it from sound.

| # | Check | Expected value |
|---|---|---|
| S-01 | `graphSnapshot()` for each of `music, ambience, machinery, effects, ui`: `outputId` | `"master"` for all five (currently `"destination"`) |
| S-02 | `master.outputId`; and count of bus nodes whose `outputId === "destination"` | `"master"`; and exactly **1** such node (master only) |
| S-03 | For each of the 10 cue names, play it once from a fresh instance; voice gain node `outputId` | equals the cue declared bus per the section 2 table |
| S-04 | `master.gain` recorded value, unmuted | `0.9` exactly; `0` after `setMuted(true)`; `0.9` again after `setMuted(false)`; all category gains `0` while muted |
| S-05 | Output-stage node between master and destination | a `DynamicsCompressorNode` (or a documented hard cap) present; `createDynamicsCompressor` call count >= 1 |
| S-06 | Declared headroom invariant recomputed from constants | `master x max_over_bus(sum of concurrent voice gains on that bus) <= 1.0`; the module `HEADROOM` constant equals the recomputed value |
| S-07 | Variant count per repeated cue (`salvage, collect, repair, drone, sorter, blocked`) | `>= 3` each; total variant specs `>= 30`; each variant satisfies abs(freq/base - 1) <= 0.06 and abs(gain/base - 1) <= 0.19 (+/-1.5 dB) |
| S-08 | Deterministic variation: play the same cue 6 times with a stub whose `currentTime` advances by 0.2 s | at least 3 distinct (freq, gain) pairs observed; with a seeded variant index the same sequence repeats identically on a second fresh instance |
| S-09 | Layer count for the metallic cues | `salvage`, `repair`, `sorter` each create `>= 2` source nodes per voice; at least 1 cue uses `createBufferSource` (debris/noise tail) |
| S-10 | Envelope automation per voice gain (recorded call sequence) | `setValueAtTime(0, t0)` -> `linearRampToValueAtTime(peak, t0+attack)` -> decay to `<= 0.001` by `t0+duration`, with attack in `[0.002, 0.020]` s; attack > 0 for 10/10 cues |
| S-11 | Voice budget | with `voiceBudget = 16` and 64 `play()` calls at frozen `currentTime`, `createOscillator` call count `<= 16` before any `onended` is delivered |
| S-12 | Priority | with the budget exhausted by `machinery` voices, `play("blocked")` still produces an oscillator, and exactly one machinery voice has its `stop()` time moved earlier (documented steal); documented order `ui > effects > machinery` |
| S-13 | Coalescer | same cue twice at dt = 0.030 s -> exactly **1** oscillator; `salvage` + `collect` at the same t -> **2** oscillators |
| S-14 | Reachability | every member of `CueName` has at least 1 `play()` call site: **10/10** (currently 7/10); `sorter`, `furnace`, `discovery` fire in a scripted scenario (sorter cycle, furnace cycle, first discovery) |
| S-15 | Ambience/music content | within 1 s of simulated time after the start gesture, `ambience` bus `inputIds.length >= 1` and `music` bus `inputIds.length >= 1`, and at least one is a looped buffer source (`loop === true`) |
| S-16 | Distance/zoom attenuation | `play` accepts position/zoom; the same cue at distance 0 vs 8 tiles with an identical seed gives a second voice whose effective gain is lower, with a deterministic ratio (assert the exact numeric value from the module attenuation constant) |
| S-17 | Mute single-source-of-truth | after each of (a) gate toggle, (b) HUD toggle, (c) save import, (d) follower adopt (`store.ts:203`, `store.ts:328`): `audio().isMuted() === store.getSettings().muted`, and the gain table matches the expected level set from S-04 |
| S-18 | Mute persistence (regression guard, currently passing) | the serialized save contains `"muted":true` after one toggle; a fresh store decodes `muted === true`; `tests/ui/app.test.tsx:109-114` stays green |
| S-19 | Hidden-tab suspension | exactly one `visibilitychange` listener registered; with `document.visibilityState = "hidden"` the stub records `ctx.suspend` count `1`; returning to `"visible"` records `ctx.resume` count `1` and no `suspend` while visible |
| S-20 | Scheduling determinism | all automation for one `play()` uses non-decreasing times derived from a single `currentTime`; `audio.ts` contains no `setTimeout` (currently none - keep it) |
| S-21 | Teardown | `AudioApi` exposes `dispose()`; after mount/unmount/mount under `StrictMode` (`main.tsx:11`) open contexts `<= 1`, and `ctx.close` call count equals the number of disposed instances |
| S-22 | Test artifact | `tests/game/audio.test.ts` exists, is green under `npm test`, and covers S-01..S-21; `npm run typecheck` and `npm run build` clean |

Any item the stub cannot answer (S-05 audible limiting, S-08 perceptual variety) is a **later listening-gated** item; the structural half must still record the numeric stub evidence.

---

## 4. Expected player-perceptible difference (for later ear review)

If the structural half lands as specified, the first thing a player should notice is one coherent loudness instead of five competing ones: after S-01..S-06 the whole mix ducks and rises as a single unit, so the UI click stays on top of machinery rather than disappearing under it, and stacked voices stop fizzing into a hard-edged wall at the top of a phone speaker. Second, repetition should stop feeling like a stuck buzzer: three to six near-identical-but-not-equal variants per repeated cue (S-07, S-08) make a long salvage or collect run read as work happening rather than as one sample looping, and the new attack stage (S-10) should turn the present click-step onsets into recognizable blips with a small body and a clean end. Third, the world should stop going silent between taps: an ambience bed plus a restrained music layer (S-15) gives the yard a floor hum and a slow evolving bed under the events, so machine states - sorter clatter, furnace rumble and vent, which today are declared but never actually fired (A-5) - become audible evidence that a machine is working, starved or paused, matching what the animation shows, while a metallic impact-plus-tail on cutting (S-09) should make stripping feel physical rather than numeric. Distance attenuation (S-16) should give a soft near/far reading when zoomed out over a mature yard, and tab suspension (S-19) should mean the first sound after returning to the tab is a clean one rather than a swallowed or doubled onset. None of these sentences is a listening verdict; they are the expected observations a later ear review should confirm or refute against the same SHA.

---

## 5. Unverified dimensions and next-five queue

Unverified here: listening approval (B-11, blocked - no rendered artifact), real-device/phone speaker behaviour, actual `AudioContext` state in a browser, `StrictMode` context count (S-21), image/first-frame state (out of this scope).

Prioritized next-five (audio area):

1. **S-01..S-04**: real master parent node + one mute write (highest value per line changed; makes every other mix decision measurable).
2. **S-14 + A-5**: wire the three unreachable cues to machine state events - cheapest perceptible gain, no new synthesis.
3. **S-07/S-08**: variant tables for the six repeated cues (removes the looping-buzzer fatigue).
4. **S-09/S-10**: attack stage + noise-tail layer on the three metallic cues.
5. **S-15 + S-19**: ambience/music sources with a looped bed, then tab suspension with the paired `resume()`.

Report path: `review-r1/rev-aud-g2.md`. Candidate SHA reviewed: `3f1b4ac4427a362e038cc1f6f1d95ae0c1a51204`. Verdict: **rework** (structural half); listening remains **blocked**.
