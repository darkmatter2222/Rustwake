# PROD-TRIAGE-004 — smallest useful sequence (one sprint, against the deployed artifact)

Base for all three steps: `main = 1573ac107acc3c9c0bed8e9eafffbd1b9ea3bca2`, served game bytes = the `a551794…` build (`index-C_K4oMJ5.js` 231262 B, `index-B1FOV2xO.css` 7849 B, `tables-BB2NPvQ2.js` 9298 B), `ci 42383452046` + `delivery 42383503917` (deploy job `128435987488`, `databrick-rustwake`). Every step is measured on **W-3** = 180 s wall, 1 tap/s, 390x844 dpr2, fresh storage, final tick 1800–1810 = 3.00–3.02 simulated minutes. One number set, one window, one denominator.

Three steps, two workers running at once and one follow-on — 1, 2 and 3 are all player-visible; none of them is a measurement-only slice.

| # | Ticket | Owned write paths (exclusive) | Runs | The number this step must print |
|---|---|---|---|---|
| S1 | `UI-004` | `src/ui/styles.css`, `work/evidence/` | worker A, immediately | three-column legibility census (default / A 1.25 / A 1.5): `.dock__cost` ≥ **12.0 px** at ≥ **4.50:1** on all three steps (was 10.8 / 13.5 / 11.25 at 2.67), amber face label ≥ **4.50:1** (was 3.31), plus a monotonicity column where every element's px is ≥ its previous step |
| S2 | `STRAT-004` | `src/ui/text.ts`, `src/ui/Hud.tsx`, `work/feedback/STRAT-004-g1/` | worker B, immediately (no file overlap with S1) | the no-op census split into `inert-label` ≤ **20.0 %** / `refused-shortfall` / `unknown`, summing to the total; longest identical-label stall ≤ **16** (was 32); the output row `applied ≥ 37, machines ≥ 5, batches ≥ 51, credits ≥ 8` |
| S3 | `UI-005` | `src/game/content/strings.ts`, `src/ui/Hud.tsx` (chip block only), `work/evidence/` | after S2 merges (same two files) | the chip line `Store 164/900 · next 210` as printed, the units column changing **≥ 20** times in the window, and a chip-only sell rule reaching **≥ 5 machines by tap 178** with **credits ≥ 8** |

## Why this order and this split

- S1 is first because it is the only change felt on the very first screen by every player, costs no layout, and cannot be argued about — the px and contrast either rise or they do not.
- S2 runs beside it because it touches `text.ts`/`Hud.tsx` while S1 holds `styles.css`: two writers, no shared file, one integration at the end.
- S3 is last only because it edits files S2 owns (single writer per file), not because it matters less: it turns the one decision that moves the outcome (−5.9 % and −3 machines when withheld) into a decidable one.
- Each step is one push on its own `rw/` branch from its own worktree; the release engineer integrates once when both S1 and S2 report ready, and again for S3. No step waits for a full-board review cycle.
- Shared witnesses re-printed once each, unchanged as criteria: five cells ≤ 42 % card fill at text scale 2.0, faces ≥ 44 px, `scrollHeight == innerHeight`, 0 pageerror, entry chunk < 233000 B, save `schemaVersion 1` / fixture `eede3c4f`.

## What I am deliberately NOT doing this sprint, and what would change my mind

- **Finding 4 — the 224.5 px dead band (`DEF-011`, P3, ready but parked).** It needs the same renderer/`scene.ts` lease as ART-003 (and BELT-001 g2), and it re-bases the yard-coverage denominator that three published witnesses quote; two geometry changes in one sprint is how the 42 % cap starts slipping. **Changes my mind:** the first post-ART-003-g2 `space` print still showing a band ≥ 150 px, or any capture where a human reader calls the black band "unfinished" — then it becomes P2 and takes the next slot.
- **The 30-sim-minute (W-30) re-run of the sell-vs-hold pair.** Measurement-only after two instrument-only slices, and the W-3 sign already names the actionable rule (hold ⇒ 0 credits ⇒ frozen ladder at two machines). The recorded W-30 readings (+16.5 %, +44 %/hour) stand untouched. **Changes my mind:** the next strategy slice ships with this pair as one printed row (≥ 1 % batches-per-hour gap, machine count printed), or a reviewer finds the two windows disagree in sign.
- **Audio subjective quality (`AUDIO-001`).** Still `decoded, not played`; no supported listening path in this runtime. **Changes my mind:** any loopback/capture mechanism that yields real playback, then one bounded mix pass labelled separately from the structural checks.
- **The `Measured` label collision and the `Store0/900` separator.** Not sprint steps: folded into `DEF-009`'s existing acceptance (same string file, one clause each) so the developer who already holds it closes all three in one pass.
- **Retiring the `A` control instead of fixing its tiers.** Rejected: the objective and chips already scale correctly (14.25 → 21.38 px, 12.6 → 18.9 px); only two dock rules regress, so the fix is two declarations, not a removed control.

## Stop condition

Sprint closes when S1–S3 each have a candidate SHA with their printed numbers, or after two unproductive rounds on any one of them, at which point the printed baseline stays on the record and the step is reverted to the base artifact rather than re-scored. A failed step is documented, never deleted.
