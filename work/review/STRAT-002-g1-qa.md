# STRAT-002 g1 - independent QA (worktree fe4e05/strat002-qa, HEAD 4b6e32c, base 24daf0e)

Probe: work/review/strat002-probe.mjs (chromium, 390x844 and 360x640, seed = yard-mature with re-stamped checksum).

## 1. Gates - PASS
typecheck exit 0; npm test exit 0 - 25 files / 254 tests; validate exit 0; build exit 0. Entry assets/index-7328OjsX.js = 229546 B on disk (inside 233000). Behaviour line verbatim: firstDrone=268 firstResearch=478 tick=18298 machines=8 links=18 drones=5 batches=1902 credits=82 nodes=3 | 0 violation(s).

## 2. Harness determinism + A1-1 - PASS
npx tsx work/feedback/strat002-harness.mjs run twice: stdout byte-identical (SHA256 F943843D...23AF both runs) and equal to the committed strat002-harness.json. My own pricedGe2: naive 121, speed 121, buffer 101, draw 107. legacyAmbiguous = 4 on every row. A1-1 (naive >= 120): 121 -> PASS. Note: plain node cannot load the harness (extensionless TS import); it needs tsx.

## 3. Per-policy table + A1-2 - two readings, stated plainly
My reproduction (identical to the JSON): naive/speed batches=2175 taps=1983 rejects=249 credits=49 powerLimited=386 minPower=0.615 pricedGe2=121; buffer batches=1158 taps=2046 rejects=625 credits=190 powerLimited=234 minPower=0.727 pricedGe2=101; draw batches=1191 taps=2045 rejects=318 credits=49 powerLimited=0 minPower=1 pricedGe2=107. Starved from stages strings: naive/speed max 80 mean 51.0; buffer max 84 mean 57.4; draw max 85 mean 58.1.
Uniqueness among the three NAMED branches: speed leads batches/starved%/taps/rejects; draw leads minPowerRatio (1.0) and powerLimitedRounds (0); buffer leads ONLY credits (190 vs 49 vs 49).
credits IS a column in rows[] (keys: policy,branch,tick,machines,links,drones,batches,credits,nodes,taps,commands,rejects,milestones,kinds,powerLimitedRounds,minPowerRatio,legacyAmbiguous,pricedGe2,levels). credits is NOT one of the four acceptance metrics (batches, starved %, min power ratio, taps-to-next-milestone); starved max/mean are likewise not rows[] columns, only leads/stages.
Reading A (recorded metrics = the harness rows[] table): A1-2 PASSES - every branch uniquely leads one (speed batches, draw minPower, buffer credits).
Reading B (strict four listed): A1-2 FAILS - buffer leads none of the four (3rd on batches, 3rd starved, 2nd minPower, 3rd taps). The failure under Reading B is the METRIC SET, not the mechanism: the three orders are genuinely distinct (2175/1191/1158 batches), the naive row matching speed exactly is by construction (fork.test.ts: "an unnamed level *is* a speed rank", and speed reproduces the pre-fork scalars at L121-124).

## 4. A1-3 fork dock - PASS
At the fork the dock holds EXACTLY three .dock__btn: "Faster batches"/"More input"/"Less power", each with its own .dock__cost "30 credits", one row [10,790,370,46] at 390x844, [10,586,340,46] at 360x640, all h=46. ONE tap on Faster batches: machine 1 level 1 -> 2, branch ["speed"], credits 30 -> 0; row returns to Store/Yard/Sell/Build. Blind run (40 taps always primary, fresh save): 0 fork-visible taps, no branch committed unnamed - the first commit lands at ~tap 400 (tick ~900) and only ever with the three-option row present.

## 5. A1-4 power line - PASS
.objective ends with the power line at every combo, no panel opened: 360x640 s1/s2 and 390x844 s1/s2 all read "Power 8 · 0 requested · 100 %" (seeded mature) and "Power 8 · 1 requested · 100 %" (organic) - matches Power 8 · <n> requested · <p> %. The base build at the same seeds shows the objective WITHOUT the power line, so it is new here.

## 6. A1-6 real-layout floor - no regression
390x844: scrollHeight==innerHeight==844 at both scales, dock [10,790,370,46] (base: [10,790,370,46]), min tap dimension 44.0 (base 44.0), h 46. At 2.0 all three branch labels: no ellipsis (scrollWidth<=clientWidth), one client rect - fully visible. 360x640: scroll==inner==640 both scales, dock [10,586,340,46] s1 / [10,572.6,340,59.4] s2, min tap 44.0. Pre-existing note: at 360x640 + scale 2.0 Store/Sell/Build/Research show scrollWidth>clientWidth - the BASE build shows the identical numbers, so not a candidate regression; the three fork labels are not clipped there.

## 7. Save compatibility - PASS
fork.test.ts (8 passed): L73-75 schemaVersion toBe(1) + checksum eede3c4f twice; L78 per machine expect(machine.branch).toBeUndefined(); L79 expect(encodeSave(payload.sim, payload.lastSeenMs, payload.settings)).toBe(raw) - byte-for-byte fixture re-encode; L88-89 unnamed upgrade keeps branch undefined and JSON has no "branch" key; L168 respec: expect(JSON.stringify(furnace)).toBe(record). L312-313 census(null)/census("buffer") >= 120.

## Defect-ticket candidates
- D1: A1-2 metric-set gap - buffer's only unique lead (credits 190) is outside the four listed metrics; either add credits (or powerLimitedRounds, also unique per row) to the acceptance list or re-anchor it on the harness rows[]. Mechanism itself needs no rework.
- D2 (pre-existing, non-blocking): dock buttons clip horizontally at 360x640 with text scale 2.0 (Store/Sell/Build/Research), identical at base.
- D3 (harness): strat002-harness.mjs needs npx tsx; plain node fails on the extensionless TS import - note it in the handoff.
- Observation: legacyAmbiguous = 4 per row is the expected unnamed ladder's ambiguity count, kept as a row field.

## Verdict
accepted with notes - the mechanism is fully verified under my own runs (deterministic harness, 121 >= 120, three distinct branch orders, one-tap named commit, power line and layout floor clean against the base-measured numbers); the single most important reason it is not a plain accepted: under the strict four-metric reading A1-2 fails for buffer, and that is a METRIC-SET defect (D1) - the leading metric exists but is not in the listed four - so the next step is amending the acceptance metric set, not the implementation.
