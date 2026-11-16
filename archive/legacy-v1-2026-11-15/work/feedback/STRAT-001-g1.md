# STRAT-001 generation 1 - baseline strategy measurement

Persona (one, stated once): short-burst strategy-idle player who reads the dock labels and plans before tapping.

## Outcome summary

- Three policies ran on one deterministic starter yard: naive bottom-button tapping, plus two deliberate plans (throughput-first, storage/power-efficiency-first). All three are harness runs; the naive policy was also repeated in a real browser at 360 x 640 (dev server, port 5175).
- Endpoints after 18 000 ticks (30 simulated minutes): naive 2 175 batches / 8 machines / 49 credits / 3 research nodes; efficiency-first 2 174 batches / 7 machines / 9 credits / 0 nodes; throughput-first 816 batches / 4 machines / 8 203 unspent credits.
- Naive and efficiency-first land within one batch of each other. The only plan with a large cost is throughput-first (2.7 x fewer batches), and its signature is a pile of credits nobody spent.
- The dock offers exactly one non-salvage option in 293 of 1 800 naive rounds (16.3 %) and two or more in 1 507 (83.7 %, of which 120 are three-or-more); a build and an upgrade are both affordable in only 4 rounds. In the browser, 69 of 74 Place taps and about 117 of 200 taps changed no measured value.
- A wrong choice is recoverable: one forced swap (upgrade instead of the first build) costs 4.2 % of batches by the end; skipping the first spare drone costs 3 % and the fleet catches up.

Verdict: is there currently a meaningful strategic choice: **no** - the ladder decides, the player just keeps pace with it.

## Per-policy results (1 800 rounds, one command per second, 18 000 ticks)

| Policy | Method | tick | machines | links | drones | batches | credits | nodes | first spare drone (round) | first research (round) | taps | commands | rejected commands | rounds with exactly two available kinds | rounds with three or more available kinds | rounds with >=2 available kinds (derived) | rounds with build+upgrade both affordable |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P1 naive (repeat the prominent bottom button) | harness | 18 298 | 8 | 17 | 4 | 2 175 | 49 | 3 | 62 | 386 | 1 983 | 1 814 | 249 | 1 387 | 120 | 1 507 (83.7 %) | 4 |
| P2 deliberate, throughput-first | harness | 18 298 | 4 | 7 | 5 | 816 | 8 203 | 0 | 61 | never | 1 818 | 1 810 | 25 | 61 | 1 711 | 1 772 (98.4 %) | 4 |
| P3 deliberate, storage/power-efficiency-first | harness | 18 298 | 7 | 15 | 3 | 2 174 | 9 | 0 | 241 | never | 2 434 | 1 813 | 638 | 1 332 | 370 | 1 702 (94.6 %) | 2 |

Browser (interaction) for the same naive policy, first 200 taps at 360 x 640, port 5175: tick 2 030, 5 machines, 10 links, 1 drone, 69 batches, 0 credits, 0 nodes. The harness at the closest tick (2 028) reports 5 machines, 11 links, 1 drone, 56 batches, 14 credits - same machine count and same build order (sorter, furnace, polymer recycler, wire mill, copper separator, plate press), so the harness reproduces the interaction structurally; batch and credit values drift by up to about 20 % because wall-clock taps do not land exactly on 10-tick boundaries and the tutorial branch issues slightly different commands. [interaction + harness]

### Policy definitions used

- P1 naive: press the primary dock button whenever it exists; that is nextYardStep in src/game/simulation/plan.ts (build, research, drone, upgrade, surplus sell, near-goal build, sell, first-machine upgrade, salvage).
- P2 throughput-first: links, then all unbuilt stages, then the drone fleet, then research, then sell every surplus, then upgrade the busiest stage. Goal: most batches and credits per minute.
- P3 storage/power-efficiency-first: links, then research, then the cheapest lowest-level upgrade, then a build only while the summed recipe power stays within the 8-unit yard budget, then sell only what the yard does not need, fleet capped at 3. Goal: no starved and no power-throttled stage.

## What the player actually faced (naive line, real browser)

23 distinct primary-button labels over 200 taps, in this fixed order: Salvage x6, Repair drone 30 scrap, then Build X / Place X pairs, Connect dock to sorter, Connect sorter to furnace, Sell steel (17 repeats), Connect, Upgrade 30 credits, Sell N nonferrous, Sell N wire, Upgrade 40 credits.
- Consciously understood from the label alone [interaction + harness]: every sell label states quantity and credit gain (Sell 3 Wire +12 credits); every build label names the machine and its material price.
- Only partly understood: the bare Connect label after the tutorial (the tutorial version names both ends, the ladder version does not), and Upgrade 30 credits, which carries the price but not the machine; the objective card above the dock names it. [interaction]
- Not visible anywhere on the resting screen: the shared power budget. Power-limited rounds are measurable in the harness (386 of 1 800 for P1, min ratio 0.615; 317 for P3, min 0.727; 0 for P2) but no label mentions them. [harness + source inspection]
- Tap efficiency: 74 Place taps, of which 69 left the machine count unchanged (the material price was not yet covered); 17 salvage/repair taps. The 200 taps ended with 5 machines, 10 links and 2 machine levels. [interaction]
- Observed confusion point: the objective line at tap 101 read Build Copper separator 25 scrap + 5 ferrous with the hint A machine waits for input; check its empty side, while the primary button stayed on Build Copper separator for about 38 taps (19 alternating Build/Place pairs) - the button name did not change while nothing was happening, so the only progress signal is the material count in the HUD. [interaction]

## Blind tapping versus deliberate plans

- Blind tapping does determine the whole plan for the first 30 minutes: naive and efficiency-first end one batch apart (2 175 versus 2 174), and the naive plan keeps 3 research nodes that the efficiency plan loses. Availability census on the naive line: exactly one non-salvage option in 293 of 1 800 rounds (16.3 %), exactly two in 1 387, three or more in 120 (6.7 %), so two or more in 1 507 (83.7 %), and a simultaneous affordable build and upgrade in 4. [harness]
- Where a real tradeoff does become visible: (1) Sell versus stock. P2 sells every surplus above the reserve floor before anything else and finishes with 8 203 credits, 4 machines and 816 batches, with its polymer recycler and wire mill at 0 batches and 100 % starved. The store is the same pool the chain draws from, so the sell ordering is the one ordering that moves the outcome (2.7 x). [harness]
- (2) Machine count versus the 8-unit power budget. Eight machines throttle (min power ratio 0.615), four do not (1.0). Over the same 30-minute window the throttle is worth about one batch, so the tradeoff is real but invisible; power-gating also keeps the signal lab unbuilt, which costs the whole research line (3 nodes down to 0). [harness]

## Exact divergence point

- P2 versus P3 first diverge at action 56 of 1 800, command applied at tick 848, first differing measured tick 858: P2 pressed Build Polymer recycler (25 scrap + 5 nonferrous), P3 pressed Upgrade (30 credits) on the scrap sorter. [harness]
- Naive versus P3 also first diverge at action 56 (tick 848). Naive versus P2 at action 60 (tick 888): naive Upgrade on machine 1 against P2 Sell 60 Scrap (+60 credits). [harness]

## Was a poor choice recoverable?

- One forced swap at the first ambiguous round (round 56: upgrade instead of the polymer-recycler build): end state 2 084 batches and 220 credits against the baseline 2 175 and 49, same 8 machines. Cost 4.2 % of batches; the run closes most of the gap on its own. Recoverable. [harness]
- Skipping the first spare-drone purchase (round 62): 2 110 batches and 169 credits against 2 175 and 49, and the fleet still reaches 5 drones by the end. Recoverable, and the ladder buys the skipped drone by itself. [harness]

## Bottleneck that emerged (end-of-run measured counters)

| Policy | Busiest stage | Starved stages (share of their own ticks with no input) | Power-limited rounds | Min power ratio |
|---|---|---|---|---|
| P1 naive | sorter, 100 % busy, 802 batches | plate press 80 %, furnace 71 %, polymer recycler 72 %, signal lab 59 %, circuit assembler 58 % | 386 | 0.615 |
| P2 throughput | sorter, 100 % busy, 652 batches | polymer recycler 100 % (0 batches), wire mill 100 % (0 batches), furnace 63 % | 0 | 1.000 |
| P3 efficiency | sorter, 99 % busy, 823 batches | plate press 80 %, furnace 72 %, polymer recycler 73 %, circuit assembler 59 %, wire mill 42 % | 317 | 0.727 |

Every plan ends with the same shape: one saturated scrap sorter and a chain that waits for input, so the effective ceiling is the drone fleet feeding the sorter rather than any decision the player made. [harness]

## Reproduction

    cd C:\Users\ryans\.local\share\opencode\worktree\fe4e05\strat001-player
    npm ci
    npx tsx work/feedback/strat001-harness.mjs    # three policies plus two recovery probes -> work/feedback/strat001-harness.json
    npx tsx work/feedback/strat001-labels.mjs      # dock-label sequence of the naive policy, first 200 rounds
    npx tsx work/feedback/strat001-compare.mjs     # browser/harness cross-check (needs strat001-interact.json)
    npx vite --port 5175 --strictPort              # second terminal, same worktree
    npx tsx work/feedback/strat001-interact.mjs    # 200 real taps on the primary dock button at 360 x 640

Existing helpers that reproduce the same shipped driver rows without my scripts: npx tsx scripts/probe-supply.mjs and npx tsx scripts/probe-cadence.mjs (not re-run here; my harness uses the same boot and the same one-command-per-second cadence).

## Evidence labels and unverified dimensions

- harness: all tick, machine, link, drone, batch, credit and node totals, the divergence ticks, the recovery probes, the power and starvation counters, the availability census. Deterministic; the engine has no random source.
- interaction: the browser label sequence, the 200-tap endpoint numbers, the 69 rejected Place taps, the 17-tap Sell steel run, the objective and hint text at 360 x 640 (localhost port 5175, this worktree).
- source inspection: label assembly (primaryFor in src/ui/text.ts), the ladder order (plan.ts), the tutorial mapping (App.tsx lines 463 to 534), the reject reasons (commands.ts).
- simulated-persona inference: which labels the persona says it understood, and the reading of the 23-label set as narrow but readable. One AI persona, not human research.
- unverified: the two deliberate policies were never played by hand in the browser (harness only), so their feel and tap count under real wall-clock timing are unverified; the reject toast text was not captured; audio and visual polish are outside this task; anything past tick 18 298 is unmeasured; the shipped probe scripts were not re-run for this report.

Suggested next experiment (one, bounded): show the power budget and the next two ladder steps as static text in the dock, then re-measure whether the naive line and an efficiency plan separate at all.
