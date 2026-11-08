# PROD-TRIAGE-004 — player-lane findings 1–5 triaged (product owner, generation 1)

Date 2026-11-07T11:10:00+00:00. Input: `work/feedback/PLAYER-004-g1/` (in the player worktree `player-a551794`): `REPORT.md`, `policies.json`, `policy-v2.json`, `legibility.json`, `space.json`, `motion.json`, `audio.json`. Simulated-persona evidence, not human research (BL-02 still open).

**Deployed identity used in every row (coordinator-verified, not inferred).** `main = 1573ac107acc3c9c0bed8e9eafffbd1b9ea3bca2`; served game bytes = the `a551794…` build (`index-C_K4oMJ5.js` 231262 B, `index-B1FOV2xO.css` 7849 B, `tables-BB2NPvQ2.js` 9298 B); `ci 42383452046` + `delivery 42383503917` (deploy job `128435987488` on `databrick-rustwake`). The `891ff04d…` value inside the report is the older canary and is not the measured artifact.

**Window convention used for every number below, so no criterion is compared across windows by accident.**
- **W-3** = 180 s wall at 1 tap/s, 390x844 dpr2, fresh storage, final tick 1800–1810 = **3.00–3.02 simulated minutes** (the whole window is inside the tutorial ladder). This is where all four findings were measured.
- **W-30** = the prior instrument's 1800 rounds = **30 simulated minutes** (STRAT-002/BLD-001 harness rows). Not re-run this sprint.

No earlier criterion is softened. Where a number changed between W-30 and W-3 the two readings are printed side by side with their window, and the older recorded verdict stays as written.

---

## 1. Four of five taps do nothing, and the screen does not say why (no-op census)

- **Measured (W-3, this artifact):** blind run 177 taps → 37 applied commands, 141 no-ops; optimizer v2 178 taps → 37 applied, 142 no-ops (79.8 % as the lane computes it). Longest identical-label stall: `Build Furnace10 scrap + 5 ferrous`, **32 consecutive taps, 0 commands**. 68 refusals, all of the form `Need N · have k`.
- **Player outcome:** during a ~32 s stretch the pressed face keeps the exact same words while the yard waits on a 5-unit drone delivery, so the player cannot distinguish "the game is thinking" from "my tap did not register". The `Last need 8 ferrous · have 3` tail is the only thing that made the cause countable at all — that improvement over `12cc0e2` is real and stays.
- **Verdict: FIX NOW (`STRAT-004`), with the aggregate share demoted and the mechanism split promoted.**
- **Reason:** the 80.1 % aggregate is not a player experience — it mixes three different things and its own denominator is unstable (see the arithmetic note below). The player-perceptible quantity is the **stall length under an unchanged label**, and the fixable half of the no-ops is the two-state dock, where the pressed middle face is inert while the ghost is on a cell.
- **Prospective acceptance (W-3 protocol, same cadence, same artifact family — judged on W-3 only):**
  1. the no-op census is printed in three named buckets — `inert-label` (label identical to previous tap, `revDelta` 0, no toast), `refused-shortfall` (`revDelta` 0 with a `Need N · have k` toast), `unknown` — and the three sum to the total no-ops;
  2. `inert-label` ≤ 20.0 % of taps (the component is 73 of 177 = 41.2 % today, derived as 141 − 68 because the report prints no cross-tab; the lane must print it directly, not derive it);
  3. longest identical-label stall ≤ **16** taps (baseline **32**), and while stalled the primary face itself carries the pending number (`waits 5 ferrous · have 3` on the face's own second line, not only in the status line);
  4. no output regression in the same window: applied commands ≥ 37, machines ≥ 5, batches ≥ 51, credits ≥ 8 (the v2 baseline row).
- **Arithmetic note kept on the record:** `policies.json` prints `noopSharePct: 80.1` for taps 177, but 141/177 = **79.7 %**; 80.1 % is 141/176. The v2 row (142/178 = 79.8 %) uses the other convention. 0.4 pp is immaterial to this decision; the lane must print one denominator from now on.

## 2. The one outcome-moving decision (sell vs hold) has no usable gauge

- **Measured (W-3, this artifact):** hold-until-60 %-of-900 → 2 machines, 48 batches, 0 credits, 164 store units, 0 credits/sim-hour; sell-when-offered → 5 machines, 52 batches, 8 credits, 67 units, 159 credits/sim-hour, 1034 batches/sim-hour. Divergence at tap 76 / tick 770. The chip's observed range **67–164 against the printed 900** = 7–18 % for the entire session.
- **Player outcome:** the only number printed for the store never leaves the bottom fifth of its own scale, so it cannot tell a first-time player when to sell; a rule-following player holds, the purse stays 0, the ladder freezes at two machines and the 30-credit named plan is never reachable. That is a −5.9 % batch and −3-machine loss from one unreadable number.
- **Verdict: FIX NOW (`UI-005`) — print the number that decides, keep the capacity as a secondary.**
- **Reason:** the working ceiling (≈164) is decision-relevant and is what a player can act on twice; `x/900` is a specification constant wearing a gauge's clothes. Cheapest honest fix is one chip string plus the next-stage requirement, no new panel, no engine change.
- **Prospective acceptance (W-3):**
  1. the chip prints `Store <units>/<capacity> · next <required>` with the separator DEF-009 already owns, both integers from the same state the Store panel prints (no UI-side arithmetic);
  2. a machine sell-rule that reads **only the printed chip string** reproduces the v2 outcome inside the same 180 s window: ≥ 5 machines by tap 178 and credits ≥ 8 (the /900-only rule could not: 2 machines, 0 credits);
  3. the chip's units column changes value ≥ 20 times in the window (proof the printed number tracks the state);
  4. witnesses unmoved: the five recorded cells stay ≤ 42 % card fill at text scale 2.0, faces stay ≥ 44 px, `scrollHeight == innerHeight`, entry chunk stays under 233000 B.
- **Discrepancy handled in row 5 below.**

## 3. The price is the weakest text on screen, and the `A` control shrinks it

- **Measured (W-3, this artifact):** `.dock__cost` **10.8 px at 2.67:1** — fails WCAG AA 4.5:1 for small text; the primary face label on the amber fill is **13.2 px at 3.31:1** — also below 4.5:1 at that size; the objective is 14.25 px / 17.42:1 and the dark dock faces 17.42:1. Pressing `A`: objective 14.25 → 17.81 → 21.38 px and chips 12.6 → 15.75 → 18.9 px, but the dock label 13.2 → 16.5 → **13.95** px and the price 10.8 → 13.5 → **11.25** px. The accessibility step is non-monotonic for exactly the two strings the player needs to act.
- **Player outcome:** the number that decides "tap now or wait" is the least readable thing on the 390 px screen, and the control a player reaches for when they cannot read it makes it smaller again.
- **Verdict: FIX NOW (`UI-004`), P1 — this is the single most valuable next change (see the ranking below).**
- **Reason:** it is a deterministic CSS-tier defect (`.text-large .dock__btn` declares 0.62 rem and `.text-large .dock__cost` 0.5 rem, i.e. below their own base rules), it costs no layout, it is felt on the very first screen, and it cannot be argued about: the printed px and contrast either rise or they do not.
- **Prospective acceptance (W-3, all three `A` steps, 390x844 dpr2, plus the five recorded cells):**
  1. `.dock__cost` ≥ 12.0 px with contrast ≥ 4.50:1 at **every** step (baseline 10.8 / 13.5 / 11.25 px at 2.67:1 → **fail as recorded, unchanged**);
  2. the amber-fill face label contrast ≥ 4.50:1 (baseline 3.31:1);
  3. monotonicity: for every element named in the census, px at step `A 1.25` ≥ px at `A 1`, and px at `A 1.5` ≥ px at `A 1.25` (the two regressions above must be gone);
  4. no new failure in the witnesses that already pass: `clipped: false` everywhere, ≥ 44 px tap targets, no page scroll, the four/five-cell 42 % cap unchanged, 0 pageerror.
- **No softening:** UI-002's recorded tier reading (14.25/600 and 10.8/400, ratio 1.32×) stays as a **pass for the objective/status tiers** and is not restated. `UI-004` adds an absolute floor for the two amber strings, judged on W-3 with the three `A` steps — a new criterion, not a re-score of U-2.

## 4. A 224.5 px dead band under the yard

- **Measured (W-3, this artifact, `space.json` + `12-space-rest.png`):** lit content box 347 x 422 (y 197–619), one continuous blank band `height 224.5, fromY 619.5`, dock at y 790 h 46.
- **Arithmetic note:** the two numbers are both correct on different denominators: 619.5 + 224.5 = 844 = the document bottom, so **224.5 px is band-to-bottom and includes the dock row**, while the gap from content bottom to dock top is 790 − 619.5 = **170.5 px**. The lane must print both separately, labelled.
- **Player outcome:** roughly a fifth of the phone column is black between the yard and the dock, which reads as "the picture stopped loading" and flattens the composition the ART lane is already working on.
- **Verdict: DEFER (row `DEF-011`, P3, ready but not in this sprint), riding `ART-003`.**
- **Reason:** the fix lives in the same renderer/canvas-fit lease as ART-003 (and BELT-001 g2 needs `scene.ts` too), and it changes the yard-coverage denominator that at least three published witnesses quote. Two art-adjacent geometry changes in one sprint is how the 42 % cap starts slipping. Real tradeoff: three readable, felt text/label fixes now versus one composition fix that has to be measured against the same capture set anyway.
- **Prospective acceptance (judged on W-3, after ART-003 lands):** printed separately, `blankBandCss.height` ≤ **120 px** and the yard content-box height ≥ **520 px** at 390x844 dpr2 (baselines 224.5 px band / 422 px content), with the 42 % cap, the ≥ 44 px floor and no-scroll unchanged.
- **Revisit trigger:** the first release after ART-003 g2 whose own `space` print still shows a band ≥ 150 px → this becomes P2 and takes a slot in the next sprint.

## 5. Prior-strategy discrepancy: +16.5 % / +44 % per hour vs +2.0 % / −5.9 %

- **Both readings, side by side, nothing erased:** W-30 (1800 rounds = 30 simulated minutes): deliberate sell vs hold **+16.5 %** batches (121002 → 140944) and **+44 %/hour**. W-3 (3.00 sim min, this artifact): v2 sell vs blind **+2.0 %** batches (52 vs 51, +1.4 % batches/sim-hour) and v1 hold **−5.9 %** (48 vs 51), with the same rule set.
- **Verdict: ACCEPT BOTH, no re-run this sprint; the W-30 rows keep their recorded status.**
- **Reason:** these are not conflicting measurements, they are two windows. At W-3 the entire window is the tutorial ladder, so ordering effects are small and the only lever that bites is the sell/hold decision; at W-30 compounding has room. The actionable half for a first-time player is the W-3 row, because the first three minutes are the first session: **holding the sale is what freezes the ladder at two machines with 0 credits.**
- **Prospective criterion attached to the next strategy slice (not now, judged on W-30):** one 30-sim-minute sell-vs-hold pair whose batches/sim-hour gap is ≥ 1 % with the machine count printed, so the rate claim is reproduced at its own scale.
- **Revisit trigger:** any W-30 re-run whose sign differs from the recorded one, or the first build whose tutorial ladder extends past tick 1800.

## 6. Minor measured items — folded, not renumbered

- `Store0/900` / `Store5/900` with no separator: **already `DEF-009`**, with the developer. No new row.
- Two different facts both printed under the label `Measured` in the Store panel: **appended as a second clause to `DEF-009`** (same file, same label/value rendering, one string key each). Exact clause for the release engineer to paste: *"the two Store-panel rows print under distinct labels (no repeated `Measured`), and the chip prints `Store <units>/<capacity>` with one space between label and value at text scale 1 and 2"*.
- No-op aggregate 80.1 % vs recomputed 79.7 % (denominator 176 vs 178): recorded in row 1, one denominator required going forward, no restated pass/fail.
- Audio table (decoded, not played): no change of status; `AUDIO-001` stays deferred, still no supported listening path.

---

## Which of findings 1–4 is the single most valuable next change for a player, and why (one sentence each)

- **Finding 3 (`UI-004`) — CHOSEN.** The price is the number every decision turns on, it is the only AA-failing string at the default size, and the one control meant to rescue it currently shrinks it, so a two-line CSS fix is felt on the very first screen of every session.
- **Finding 1 (`STRAT-004`) — second.** A 32-tap stall under identical words is the moment a player decides the game is broken, but half of that share is the harness cadence and the honest number is the stall length, which the label change already cuts.
- **Finding 2 (`UI-005`) — third.** The unreadable store gauge is what actually freezes a rule-following player at two machines, yet it is one string and rides in the same lane behind the price fix.
- **Finding 4 (`DEF-011`) — fourth.** The 224.5 px black band is the most visible thing on the screen after the text, but it needs the renderer lease and re-bases three published witnesses, so it is worth more in the ART lane's next pass than in this one.

## Alternatives considered

- Aggregate no-op share as the headline metric (rejected: three mechanisms, unstable denominator, no player-visible action).
- Making the dead band step 1 because it is the biggest single pixel number (rejected: shares `scene.ts` with ART-003/BELT-001 g2 and re-bases the coverage denominators mid-sprint).
- Retiring the `A` control instead of fixing its tiers (rejected: it works for the objective and the chips; only the dock rules regress).
- Re-running the sell/hold pair at W-30 before shipping anything (rejected: measurement-only slice after two instrument-only slices; the W-3 sign already names the actionable rule).

## Dissent recorded

The player lane reads its own +2.0 % as "everything except sell/hold is noise" and would leave the store gauge alone. I keep `UI-005` because the gauge is what makes the hold rule reachable at all: the 0-credit, 2-machine arm is a *consequence of the unreadable number*, not of the engine. If the W-30 re-run shows the sell/hold gap below 1 % per hour, the dissent wins and `UI-005` drops to P3.

## Decision and revisit trigger (sprint-level)

Ship `UI-004` → `STRAT-004` → `UI-005` in that order against `1573ac1…` (game bytes `a551794…`), hold `DEF-011` behind ART-003, keep both strategy windows on the record. Full sequence and per-step owned paths: `work/product/PROD-TRIAGE-004/SEQUENCE.md`. Rows for the ledger: `work/product/PROD-TRIAGE-004/proposed-rows.json`. Revisit the whole ordering if `STRAT-004` cannot print its mechanism split in one instrument run — that means the census is not reproducible and the finding needs a new instrument, not a new criterion.

## Ledger notes for the release engineer (I did not edit `work/backlog.json`)

1. Paste the four rows from `proposed-rows.json` verbatim into `tickets`.
2. `STRAT-002`: append one history entry, `at 2026-11-07T11:10:00+00:00`, `actor product-owner`, `from_state measured`, `to_state measured`, reason: *"window reconciliation from PLAYER-004-g1: the recorded W-30 reading (+16.5 % batches, +44 %/hour) stands; the W-3 reading (+2.0 % v2, −5.9 % v1, 3.00 sim min) is window-bound, not a contradiction; no criterion re-scored"*.
3. `DEF-009`: append the second clause named in row 6 to its `acceptance`, and one history entry with the same timestamp noting the `Measured`-label collision from PLAYER-004-g1 §3.
4. Every row carries the same verified identity string so nobody re-derives the deployed SHA from the report's canary value.
