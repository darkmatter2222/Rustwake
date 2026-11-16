# ART-001 generation 1 — product decision (opening yard slice + motion sample)

Base `24daf0e`; candidate: code `b8537af` + captures `697fb459dbba76910f8544605daf15273a2f1d87` (branch `art001-dev`), superseding `7e10288`, `3f7555a`, `01a2e0d`. Independent QA verdict: **accepted**. Inputs: `docs/DESIGN_BIBLE.md`, `docs/PRODUCT_STRATEGY.md`, `work/feedback/STRAT-001-g1.md`, `work/product/STRAT-002-decision-g1.md`, coordinator-supplied QA numbers for this exact candidate. No tools re-run; no invented studies.

## 1. Decision: **keep**

One reason carries it: the motion gate passed under two independent methods (26 distinct MD5s of the seeded clip frames, 6 distinct `toDataURL` hashes on **both** the candidate and the live shipped build), and DEF-004 is genuinely fixed — a returning player saw one repeated frame before, and sees animation after. That is the difference between a still set and a moving yard, which is exactly what OWNER-002 ("remains ugly") was judged against. The named per-pair improvements (two-tone skyline parapet, lit-top/shaded-underside machine bevels, faced hulk with ports/ribs, dash-stripe ground props, three luminance planes, legible mid-leg drone) show the gain is in the shipped pixels, not only in the harness. Gate line is unchanged (`249 tests`, `validate 0` with the behaviour line verbatim, entry `index-DZe9iZvT.js` 227910 B inside 233000 B, `SCHEMA_VERSION` 1, checksum recompute `eede3c4f`), so keeping it costs nothing in save or byte risk.

## 2. Sprint requirement "materially improved opening yard + short motion sample": **MET**

- Opening yard: MET on the reviewer's named per-pair differences plus the three luminance planes — a described, non-recolor change with actual phone-size captures (`phone-mature` among them), and the mid-leg drone reading at phone size. This is the "scene composition / asset identity" pair that the earlier slice lifted to 3, and nothing in the residual list pulls it below 3.
- Motion sample: MET on the letter of the gate — DESIGN_BIBLE accepts "real short video/frame sequence", and 26 frames with 26 distinct MD5s is a frame sequence, not a still, and it was cross-checked against the live build with 6 hashes.
- What is still **owed**, not invented: (i) the 0–4 category score-card rows for this exact candidate (only "accepted" and named pairs are in hand); (ii) one **interaction** capture — selection feedback, one panel transition, one upgrade assembly — because the current strip is the seeded yard cycle and the bible's animation gate also covers interaction timing; (iii) a real-device check. None of these blocks the keep; they keep audio/real-device/interaction honesty at "explicitly unverified" rather than passed.

## 3. Preview-deploy eligibility: fix **DEF-005 only**; defer the other two

- **Blocks (must fix before a labelled preview): DEF-005.** A 336.5 px then 160.0 px single-frame displacement (frames 11 and 25) against 5.5–16 px neighbour steps is the rejection example the bible names for the motion category ("teleporting drones"), and it repeats once per cycle on the resting screen. Fix is the reviewer's own bounded suggestion: a 1-tick dock hold inside the wrapped cycle. Re-check needs a fresh seeded strip on the new SHA; the 26-distinct-MD5 and 6-hash methods must be reproduced there.
- **Deferred: DEF-006.** The op-recorder 400000-entry cap reporting `draws: 0` on the last row is harness-only, does not touch served bytes, and no player-visible claim depends on that row. Revisit when the harness output is next cited as evidence (then make the last row's count honest or mark it truncated).
- **Deferred: `phone-mature` legibility** (drone at y ≈ 497 crowding the furnace badge and the purple bars). Top item of the next art iteration, with the criterion fixed now: in the mature-yard capture, the drone body, its shadow ellipse and the furnace badge must be separable without overlapping bounding boxes at 360 px. Deferred rather than blocking because it is a composition judgement on one still, it needs the additional capture above to be judged fairly, and preview eligibility is deliberately separate from full quality acceptance.

## 4. Is the seam a real strategic-experience problem?

Real but shallow: the player tracks the drone's leg/pod cycle to read "returning with cargo vs flying empty", and a one-frame 336 px jump resets that read once per cycle. It is not a strategic problem — no decision (build, upgrade, sell, branch) depends on the seam — so it is a motion-quality defect, fixed cheapest-first.

## 5. Priority order for the next two dispatched assignments (after the STRAT-002 fork candidate lands)

1. **Independent QA of the STRAT-002 fork candidate** — A1-2 ("no weakly dominated plan") is the pass/fail gate of the sprint and only an independent run on the exact SHA can certify the per-branch metrics; nothing downstream is trustworthy before it.
2. **Player retest of the same three policies on the merged build** — supplies A1-1 ambiguity census, A1-5 comprehension and the blind-tap check on the naive line, i.e. the two criteria QA cannot produce.
3. Then **integration + deploy** (it needs 1 and 2 as evidence; a preview deployment of the art candidate alone may go ahead once DEF-005 is fixed).
4. Last, **a further art iteration** — needed, but no in-sprint decision waits on it and its input (the `phone-mature` finding) is already recorded; it takes the next free lane after 1–3.

## Appendix — severities and evidence labels

| Item | Severity | Blocks preview deploy | Evidence type |
|---|---|---|---|
| DEF-005 leg seam (336.5 px / 160.0 px jump, frames 11, 25) | minor, visible at phone size, once per cycle | **yes** | visual inspection of seeded frames |
| DEF-006 recorder `draws: 0` last row | cosmetic, harness-only | no | numerical analysis |
| `phone-mature` crowding | minor, one still | no (next art pass, criterion pre-fixed) | visual inspection |
| Category score-card, interaction clip, real device | owed | no | to be labelled when produced |
