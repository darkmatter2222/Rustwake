# PLAYER-004 generation 1 — live-build playtest

- ID / role / task / generation / date: PLAYER-004-g1, player-researcher, 2026-11-07
- Source: simulated player (actual browser interaction with the deployed build) + HTTP byte checks + in-process audio render
- Build: live `https://home.darkmatter2222.com/rustwake/`; my worktree HEAD `a5517948046f1327cb92cf35a9a02be53345f72f`; comparison build `12cc0e2` (entry `index-CUnHr3Cs.js`, 231943 B)
- Personas: **newcomer** (runs 1 and the still set — no walkthrough, first contact with the gate screen) and **optimizer** (runs 2 and 3 — stated rule sets below). One persona per run.
- Scenario: fresh storage per context, live URL, 390 x 844, `deviceScaleFactor 2`, `isMobile + hasTouch`, 1 tap/s.
- Simulated time reached: tick 1800–1810 = 3.00–3.02 simulated minutes per run (`TICK_MS` 100 → 10 ticks/s); wall clock 180 s per policy.

## 0. Build identity — what is provable (`verify.json`)

`node work/feedback/PLAYER-004-g1/verify-build.mjs` fetches the served `index.html` (cache-busted), reads the asset names it really references, then compares raw bytes with my own `npm run build` output.

| Asset | served bytes | my `dist/assets` | sha256 equal |
|---|---|---|---|
| `index-C_K4oMJ5.js` | 231262 (`content-length` 231262) | 231262 | yes `5b9a984530a7f65d…aca7c0095` |
| `index-B1FOV2xO.css` | 7849 | 7849 | yes `b4308206ea32834e…b055f715` |
| `tables-BB2NPvQ2.js` | 9298 | 9298 | yes `28bed3b02f2f79cb…92c5f968` |
| `catchup.worker-G_Jyr7uh.js` (not referenced by `index.html`, fetched directly) | 13406 | 13406 | yes `0c784f3e68570923…71dd50` |

- **same bytes: proven** (equal length + equal sha256 on all four chunks).
- **same SHA: inferred, not proven.** `a551794` is my HEAD and its build reproduces the served bytes exactly; the only deployment receipt readable in this worktree (`work/deployments/OPS-102-actions-canary.json`) names `891ff04d…`, so the SHA→served-file chain is not closed by a receipt here.
- Trap avoided: `fetch().text()` reports 231220 chars for the 231262-byte entry chunk — 42 CRLF pairs normalised by the text decoder, not a truncated file.

## 1. Blind bottom-button run (newcomer, primary face only)

177 taps in 180.1 s wall (final tick 1800 = 3.00 sim min).

| quantity | value |
|---|---|
| `batches` | 51 |
| `credits` | 8 |
| machines / store units | 5 / 67 |
| applied commands | 37 (0.21 per tap) |
| no-op taps (`revision` unchanged) | 141 → **80.1 %** |
| distinct primary labels | 14 |
| longest identical-label stall | `Build Furnace10 scrap + 5 ferrous` — **32 consecutive taps, 0 commands** |
| refusal toasts | 68 instances, all of the form `Need N · have k` |
| final row text | `Store` · `Yard` · `Build Plate press35 scrap + 8 ferrous` · `Build` |
| final objective / second line | `Build Plate press · 35 scrap + 8 ferrous` / `A machine waits for input; check its empty side.` + `Drones 1 · Power 8 · 3 requested · 100 % · Last need 8 ferrous · have 3` |

Evidence: `policies.json` (`policy: blind`), `probe-dom.json` for the tap-by-tap labels. [interaction]

## 2. Deliberate-plan runs on the same seeded state (optimizer)

Both start from a fresh context on the same URL; the engine is deterministic and both reached the same tick window (1800/1810), so the states are equivalent for comparison.

| policy (rules as executed) | taps | tick | machines | links | `batches` | `credits` | store units | batches/sim-hour | credits/sim-hour | applied cmds | no-op taps |
|---|---|---|---|---|---|---|---|---|---|---|---|
| blind (above) | 177 | 1800 | 5 | – | 51 | 8 | 67 | 1020 | 160 | 37 | 141 (80.1 %) |
| deliberate v1 — hold the sell while the store chip reads < 60 % of 900; fork face by printed price, `Less power` when the power line < 100 % | 178 | 1800 | 2 | – | 48 | 0 | 164 | 960 | 0 | 22 | 157 (88.7 %) |
| deliberate v2 — sell whenever the ladder offers it; same fork rule; keep the yard tidy by letting the ladder drain surplus | 178 | 1810 | 5 | 10 | 52 | 8 | 67 | 1034 | 159 | 37 | 142 (79.8 %) |

- v1 vs blind: **−5.9 %** batches, −3 machines, credits 8 → 0. Divergence is a single rule at tap 76 / tick 770 (`policy: deliberate`, `firstDivergence` in `policies.json`): the hold-sell rule left the purse at 0, so no upgrade, so two stages never appeared. 102 of 178 taps issued no click at all.
- v2 vs blind: **+2.0 %** batches (52 vs 51), +1.4 % batches/sim-hour (1034 vs 1020), same machines, one named automation upgrade bought that the blind line also reaches: tap 100 took the leftmost face `Less power` at 30 credits; the end record reads `sorter:L2:draw furnace:L1 polymerRecycler:L1 wireMill:L1 copperSeparator:L1` (`policy-v2.json`).
- **Against the prior evidence: it does not reproduce on this build at this window.** Prior: deliberate +16.5 % (121002 → 140944) and +44 %/hour. Mine: +2.0 % (v2) / −5.9 % (v1). Both prior figures come from 1800 rounds = 30 simulated minutes; mine are 3.0 simulated minutes, i.e. the whole window is inside the tutorial ladder. That is the honest limitation, and it is also the interesting result: inside the first 3 minutes the only ordering effect comes from the sell/hold decision (−5.9 % when withheld), everything else is within noise of the ladder. [interaction + prior-report comparison]
- Cheapest-first fork painting (BLD-001) verified from the player side: the leftmost face at tap 100 carried the 30-credit `Less power` plan and it was the affordable one.

## 3. What a newcomer sees first

Stills (all 390 x 844 @ dpr 2, live URL): `01-gate-rest`, `02-first-screen`, `03-after-drone-repair`, `04-priced-build-face`, `05-yard-with-machine`, `06-connect-face`, `07-store-panel`, `11-legibility-step1..3`, `12-space-rest`; motion frames `motion-1..6.png`, clip frames `clip-01..06.png`.

- **After 20 seconds can I say my next decision and what it costs?** Yes. By tap 14 the objective line reads `Build a sorter · 20 scrap`, the primary face is `Build Scrap sorter` with `20 scrap` on its own second line, and after a refusal the resting line carries `Last need 20 scrap · have 0`. The price is on the face I have to press — that is a real improvement over one inline string. [interaction: `probe-dom.json`, taps 6-14]
- **Where my eyes go, in order:** (1) the white bold objective line (14.25 px, contrast 17.42), (2) the amber-filled primary face in the dock (13.2 px), (3) the cyan ghost outline in the grid, (4) last and weakest: the amber price line under the primary face.
- **Which label is unreadable at 390 px:** the price line `.dock__cost` — **10.8 px at 2.67:1** (below the 4.5:1 AA bar for small text), and the `A` control does not rescue it: at `A 1.5` the objective grows to 21.38 px while the dock label *shrinks* 16.5 → 13.95 px and the price 13.5 → 11.25 px (`legibility.json`, stills `11-legibility-step1..3`). Secondary: the store chip renders `Store0/900` with no gap between label and value, and the Store panel prints two different facts under the same `Measured` label.
- **Vertical space use, measured (`space.json`, `12-space-rest.png`):** lit canvas content box y 197–619 (347 x 422 px), one continuous blank band of **224.5 px starting at y 619.5**, dock at y 790 (46 px). The yard paints 422 of 844 px of the column; the band between the yard and the dock is dead black.
- **Panel census (`captures.json`):** Store panel at tick ~330 = `Capacity 0/900`, `Measured Power 100% speed (0 of 8 units requested)`, `Measured 1 machine waiting for input`, `Sell Opens after the first steel contract` — readable, but two facts share one label and none of the four rows carries a number I can act on twice.
- **Motion (`motion.json`, `motion-1..6.png`):** 59.8 fps measured over 12 consecutive animation frames; 10 of 11 frame-to-frame deltas are non-zero and the amber centroid moves in fractional steps (`cy` 940.73 → 886.89 → 849.5, `cx` 322.91 → 322.67 → 320.92 → 314.38 → 310) inside a ~200 ms window that spans only ~2 simulated ticks (100 ms/tick, 16.7 ms/frame ≈ 6 frames per tick). So the drone and its cargo are interpolated per rendered frame, not per tile or per tick. [interaction + numerical analysis]

## 4. Audio honesty — `decoded, not played`

There is no waveform asset to decode: the served chunks contain no `.wav`/`.pcm` reference and no `decodeAudioData`; audio is synthesised (`createOscillator`/`createBuffer` live in `tables-BB2NPvQ2.js`). `audio-probe.mjs` extracts the cue table from the served bytes and renders each cue in an `OfflineAudioContext` inside the page, then measures the PCM. **decoded, not played** — no speaker playback was asserted.

| cue | sample rate | frames | seconds | peak | rms |
|---|---|---|---|---|---|
| salvage | 48000 | 4320 | 0.090 | 0.319 | 0.225 |
| collect | 48000 | 3361 | 0.070 | 0.216 | 0.103 |
| repair | 48000 | 10560 | 0.220 | 0.275 | 0.114 |
| drone | 48000 | 7680 | 0.160 | 0.180 | 0.105 |
| sorter | 48000 | 2880 | 0.060 | 0.160 | 0.112 |
| furnace | 48000 | 11520 | 0.240 | 0.200 | 0.117 |
| upgrade | 48000 | 6721 | 0.140 | 0.277 | 0.134 |
| blocked | 48000 | 2400 | 0.050 | 0.153 | 0.113 |
| return | 48000 | 8640 | 0.180 | 0.260 | 0.154 |
| discovery | 48000 | 14400 | 0.300 | 0.295 | 0.144 |

Longest cue 0.300 s, loudest peak 0.319 (`salvage`), i.e. every cue is a short click-like blip under one third of full scale; the bus gains keep the sum well inside 0 dBFS. Unheard by ear: tonal quality, whether `sorter`/`furnace` machinery clicks mask each other at cadence. [render + numerical analysis]

## 5. The three highest-impact player-facing problems

### P1 — Four out of five taps do nothing, and the screen does not say why
- **Reproduction:** fresh context at 390 x 844 on the live URL → `Begin recovery` → tap `.dock__btn--primary` once per second for 180 s (`node work/feedback/PLAYER-004-g1/play-policies.mjs 180`).
- **Measurement:** 177 taps → 37 applied commands (0.21/tap), 141 no-op taps (80.1 %); a single face `Build Furnace10 scrap + 5 ferrous` held for 32 consecutive taps with 0 commands applied; 68 refusals, all `Need N · have k`. Same shape for the optimizer run (142 no-ops of 178).
- **Why it matters:** the primary face keeps the same words while the yard waits for a 5-unit drone delivery, so the player cannot tell "waiting" from "my tap did not register"; the only feedback is a toast that self-destructs after 1800 ms.
- **What improved versus `12cc0e2`:** the refusal now persists as `Last need 8 ferrous · have 3` in the resting line instead of only in the toast, which is what let me count the stall cause at all.
- **Suggested experiment:** keep the label but print the waiting count permanently next to it (`waits 5 more ferrous`), then re-measure the no-op share and the tap count needed to reach 5 machines over 3.0 sim minutes.

### P2 — The one decision that moves the outcome (sell or hold) has no usable fullness gauge
- **Reproduction:** identical start, 3.0 sim-minute window; only difference is the sell rule. `play-policies.mjs` (v1: sell only when `Store x/900` ≥ 60 %) vs `play-v2.mjs` (v2: sell whenever offered).
- **Measurement:** v1 → 2 machines, 48 batches, 0 credits, 164 store units, 0 credits/sim-hour; v2 → 5 machines, 52 batches, 8 credits, 67 store units, 159 credits/sim-hour. Divergence at tap 76 / tick 770. The store's working level (67–164 units) never approaches the printed 900 capacity, so the chip reads 7–18 % and a rule-following player holds every sale.
- **Why it matters:** credits buy the named upgrades, and holding them freezes the ladder at two machines while the store visibly holds material nothing is consuming. The one number the player is given (`x/900`) does not describe the working range.
- **What improved versus `12cc0e2`:** the fork now prints two named plans with their own prices, cheapest-first, one tap each (verified: `Less power` 30 credits taken at tap 100, `sorter:L2:draw`), where the older line offered one unnamed `Upgrade 30 credits` face.
- **Suggested experiment:** print the working ceiling next to the capacity (`164 of 900 · 6 stages need 210`) or show the starved stage's name in the resting line, then re-measure whether a first-time player reaches 5 machines inside 3 minutes without being told the order.

### P3 — The price, the most-needed number, is the weakest text on the screen and the accessibility step shrinks it
- **Reproduction:** `node work/feedback/PLAYER-004-g1/legibility.mjs` (stills `11-legibility-step1..3.png`).
- **Measurement:** default scale — `.dock__cost` 10.8 px, contrast **2.67:1**; dock label 13.2 px (17.42:1 on the dark faces, 3.31:1 on the amber fill). Pressing `A` twice: objective 14.25 → 17.81 → 21.38 px, chips 12.6 → 15.75 → 18.9 px, but the dock label 13.2 → 16.5 → **13.95 px** and the price 10.8 → 13.5 → **11.25 px** — the largest-text setting makes the price relatively smallest. Also `Store0/900` prints label and value with no separator, and the Store panel uses `Measured` twice for two different facts.
- **Why it matters:** the price is what decides whether to tap now or wait, and it is the only AA-failing string at the default size; the `A` control is the tool a player reaches for exactly when it fails.
- **What improved versus `12cc0e2`:** the face is now two tiers on one 46 px button (name 13.2 px, price on its own second line) instead of one run-on string, so the name is legible even when the price is not.
- **Suggested experiment:** raise the cost to the dock-label size at every scale (or ≥ 12 px with the amber lifted to ≥ 4.5:1) and re-run the census; acceptance = every visible string ≥ 4.5:1 and no string shrinking when `A` increases.

Minor, measured, not ranked in the three: 224.5 px dead band between the yard and the dock (P4 candidate); the `Measured` label collision.

## 6. Evidence, labels and unverified dimensions

- interaction: all tap/tick/batch/credit/machine/store numbers in §1–2, the label sequences, the stall census, the toast reasons, the legibility census, the fps and centroid series, the space census — real browser against the live URL, fresh storage per context.
- HTTP/local bytes: §0 (`verify.json`), sha256 on four chunks.
- render + numerical analysis: §4 audio table (`audio.json`) and the frame series (`motion.json`).
- source inspection (labels only, after first play): `TICK_MS`/`PERSIST_MS`, `nextYardStep` order, `branchOptions` cheapest-first sort, `.text-large` dock rules in `styles.css`.
- simulated-persona inference: what the persona says it read first; one AI persona per run, not human research.
- **not verified / unfinished:** 30-sim-minute windows (prior evidence scale) — my window is 3.0 min, so my deltas are tutorial-bound; the `Measured` panel rows for a machine (canvas tap missed the tile in `captures.mjs`, `panel` stayed null there and `12-space-panel.png` was not written); no `.webm` video (6 still frames instead, per the coordinator's instruction to drop the flaky clip); no listening claim for audio; the `A 2` step was not reached (only three census rows); the deliberate plans are machine policies, so "feel" is unmeasured.
- Reproduction: `npm ci` in the worktree, then `node work/feedback/PLAYER-004-g1/<script>` for `verify-build`, `probe-dom`, `play-policies 180`, `play-v2 180`, `captures`, `motion-probe`, `legibility`, `space`, `audio-probe`, `analyze-policies`. Each writes its JSON beside this folder. No `src/**` file was edited.
