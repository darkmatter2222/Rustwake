# ART-001 - product decision, generation 4

Role: product owner (skeptical game designer). Candidate `87ee90b`, evidence follow-up `f0e7f65`, base `24daf0e`. Independent QA of the same candidate runs in another lane; its gates are not re-run here. Evidence types used: numerical analysis of the recorded clip JSON (my own read of `docs/evidence/2026-11-04-clip-opening-250ms.json` and `docs/evidence/2026-11-04-clip-opening.json`), source inspection of the handoff, plus the recorded gate receipts. No human listening, no real-device p95, no human first-feel.

## 1. Verdict

**Keep (accept g4) as preview acceptance of the opening-leg motion, at the DEF-005 level only.** Not final polish. The prior g3 acceptance is confirmed, not revised: the two new numbers change nothing g3 rested on, and they close the one open mechanical question (why the seam appeared).

## 2. Accepted as the recorded explanation

`seam = sampling aliasing; the leg itself is smooth at ~5.73 CSS px per drawn frame` - **accepted**, and it survives my own arithmetic on the stored rows rather than only the narrative:

- Leg length 344 px / 10 travel ticks = 34.4 px/tick; 1 tick = 100 ms = 6.0 frames at 60 fps -> **5.73 px/frame average**. Recorded 250 ms strip: 26 samples, `stepCssPxMean` 77.86 over a 2.5-tick sample (mid-leg 2.5 x 34.4 = 86 px), `stepCssPxMax` 108.5 -> average and peak are both consistent with an eased leg whose peak is about 7.2 px/frame (108.5 / 15 frames). Mean below the mid-leg ideal because the 1-tick dock and 1-tick wreck dwells land inside some windows. No unexplained residue.
- Strongest mechanical support, from the stored rows: four consecutive 250 ms samples share one sim tick (`432354`) yet carry four distinct drone positions (`536.5 / 437 / 346.5 / 264.5`). The drawn leg is therefore **not stepped by the tick**; sub-tick interpolation is real and observable, which is what "smooth" has to mean here.
- 250 ms strip: 26/26 distinct `pngSha256`, 26/26 distinct `droneBodyCssPx`, my own recount. This is the acceptance witness.

## 3. The 1000 ms strip's failed distinct-hash check

**Recorded as an expected instrument artifact, not a product defect.** My recount of the control: 26 frames, 23 distinct hashes, 22 distinct positions; the three collisions are `026303d3` @f01/f16, `7bc10672` @f06/f21, `42d2e09f` @f10/f25 - all at spacing D15 samples. A 22-tick (2200 ms) wrapped cycle sampled every 1000 ms is 2.2 samples/cycle, so byte collisions at a fixed spacing are what a coarse sampler must produce; a 250 ms sampler (8.8 samples/cycle) produces none, which is exactly the observed contrast. Roles stay as labelled: **250 ms = witness, 1000 ms = control**, both retained as evidence.

Two instrument notes to keep visible, neither blocking:

1. In the control, `pngSha256` and the per-frame probe are not the same instant: f10/f25 share one PNG hash while the probe reports different `droneBodyCssPx` (304 vs 491) and different `storeGauge` (amber 434 vs 203). Do not treat hash + probe as one atomic record.
2. The two strips are separate organic runs of one deterministic sim (f01 differs between files). Cross-strip hash comparison is meaningless; only within-strip distinctness counts.

## 4. Alternatives, dissent, revisit trigger

- **Alternative 1 (rejected): one spacing, 1000 ms only.** Cheaper, but it is precisely the spacing that aliases this 22-tick cycle, so it cannot certify leg smoothness.
- **Alternative 2 (rejected): accept the seam as the shipped look**, i.e. declare the 1000 ms aliasing the player experience. The same build at the phone-realistic 250 ms spacing shows 26 distinct positions with monotone mid-leg steps, so the seam is a property of the sampler.
- **Alternative 3 (deferred): re-tune `droneTravelTicks` so the period divides 1000 ms** (e.g. 20 or 25 ticks) to make the control self-consistent. Deferred - cosmetic instrument gain, no player-visible change, real regression risk on the DEF-004/DEF-005 wrap tests. Revisit trigger below.
- **Dissent kept on record:** the numeric account is now internally consistent, but a smooth leg on one 390 x 844 organic run is not "the yard is attractive at normal phone size". Per TEAM_CHARTER, numeric and visual acceptance cannot certify beauty or fun; the OWNER-002 complaint stays open until the human dimensions are captured.

**Revisit trigger.** Reopen ART-001 acceptance if any of: (a) the human audio listening or real-device p95 receipt contradicts the desktop numbers; (b) the 360 x 640 mature-separability boxes or the three-phone interaction set land and show machinery that no longer reads as distinct; (c) a later candidate changes `droneTravelTicks` or the dwell counts, which invalidates the 22-tick aliasing arithmetic above and forces a re-derivation of the per-frame step; (d) a human first-feel run does not mention the drone at all, which would mean "alive in motion" is not yet delivered even with a smooth leg.

## 5. Evidence still owed (not re-run in this lane)

360 x 640 mature separability boxes; three-phone interaction set; human audio listening; real-device p95; human first-feel. Plus one arithmetic line: the clip JSON should state the model that predicts the control's D15 collision spacing (2.2 samples/cycle alone predicts an 11-sample phase walk, so the exact 15 needs its own derivation).

## 6. Consequence for the next sprint

The motion lane is not where the next player gain comes from. The single next outcome experiment is the resting-screen legibility slice, recorded in `work/product/STRAT-002-decision-g2.md` section 2. ART-001 contributes at most one deliverable there: a fresh capture set on the merged build at 360 x 640.
