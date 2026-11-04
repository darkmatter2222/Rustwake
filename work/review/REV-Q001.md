# REV-Q001 - independent verdict for Q-001 (gen 4, id `rev-q001-verdict-g4`)

- Candidate source commit: `24429e1a1d5135dc5b989f44767353512c4702b0` (branch `q001-dev`, base `a8fb14a`); tip with the handoff docs is `e35a642`; integrated on main as `85caa3b`/`1f0f722`, published inside `ad379e3`.
- Reviewed checkout: `C:\Users\ryans\.local\share\opencode\worktree\fe4e05\review-r1`, `git checkout --detach e35a642` (source identical to the candidate; the delta over `24429e1` is `q001-handoff.md` only). Production files unmodified by this review.
- Scope under review: `src/ui/Panels.tsx` `ResearchPanel`, `src/ui/styles.css` research rules, `q001-evidence/` (2 scripts, 2 JSON, 80 PNG). Closing input: REV-BASE finding **R-01**.
- Image capability: verified this session (one PNG per read, five frames inspected sequentially).
- Verdict for this SHA and this scope: **accept** (Q-001 gates). Follow-ups R-11..R-13 are new bounded tasks, not blockers for this scope.

## 1. Commands run here, exact results

| Command | Result |
|---|---|
| `npx vitest run` | **21 files, 172 tests passed, 0 failed**, duration 3.90 s - identical counts to the `a8fb14a` baseline, so no test was added or weakened for this change (see R-13) |
| `npm run typecheck` | clean, no diagnostics |
| `npm run build` | OK, 52 modules; `index-*.css` **7013 bytes** (was 5755, +1258), `index-*.js` **225485 bytes** (was 224968, +517), `catchup.worker` 13015 unchanged |
| `npm run validate` | not re-run here; the handoff records `content: 0 violation(s)` and the behaviour pass unchanged (the simulation is untouched by this diff) |

Non-image files in the diff: `q001-evidence/capture-research.mjs`, `compare.mjs`, `research-before.json`, `research-after.json`, `q001-handoff.md`, `src/ui/Panels.tsx`, `src/ui/styles.css`. No simulation, renderer, store or test file changed - consistent with the claimed scope.

## 2. Frame-by-frame inspection (5 of 36 after-frames, one image per read)

| Frame (in-game size) | What is visible |
|---|---|
| `research-after-phone-360x640-s2-fresh.png` (360x640 @2) | One card per screenful: `Efficient Cutters` title, effect wrapped as `One cutting pulse gives 7 / scrap instead of 5.` (5 words then 3), amber `4 Data` + `Buy . 4 Data` on one foot row. No one-word column anywhere. Chips still read `Store900/900` (unspaced, carry-over Q-009). Cards 2-3 are below the contained fold. |
| `research-after-phone-390x844-s1.5-mixed.png` (390x844 @2) | Three full-width cards in one column, in `RESEARCH_ORDER`: `Efficient Cutters` with a `Known` badge and cyan border; `Smart Buffers` with 3-line effect, `8 Data` and a live `Buy . 8 Data`; `Route Dispatch` dashed border with `Needs Smart Buffers first` + effect, its foot row below the fold. Lead row `Data 40`. Objective card and dock primary both read the same ladder step (`Research Smart Buffers / 8 Data`). |
| `research-after-landscape-844x390-s1.5-mixed.png` (844x390 @1) | 1.6 cards visible: card 1 complete (title, `Known`, effect, `4 Data`), card 2 title only. Dock wraps to two rows at this scale. |
| `research-after-landscape-844x390-s2-fresh.png` (844x390 @1) | **No card at all** in the first frame: the panel shows `Research / Close` and `Data 22`, then the dock. The card list area is a strip too short to show one line. This is R-11. |
| `research-after-phone-360x640-s2-mixed-scrolled.png` (360x640 @2) | After one contained scroll the third card is complete inside the body: `Needs Smart Buffers first`, 3-line effect, `12 Data`, and a visibly dimmed disabled `Buy . 12 Data` (opacity .55), above the dock. Scroll reaches every action. |

## 3. Cross-check of the developer's numbers against `research-after.json`

All 36 cases have a panel (`missingPanels: []`). Recomputed from the JSON:

| Claim | My check | Result |
|---|---|---|
| One-word columns gone, tallest block 10 -> 3 lines | tallest `lines` per case read from `tallestBlock`: portrait s1 10->3 (360/390), 8->3 (412); s1.5 10->3 / 10->2; s2 10->3; landscape s1 2->3, s1.5 8->2, s2 10->2 | **confirmed**, one nuance: landscape s1 *gained* one line (2 -> 3) because the wrapper block now carries title+state; immaterial |
| Card widths 314 / 344 / 366 / 534 | `cardWidths` equals `bodyWidth` in 36/36, all three cards share the same `x` (23 portrait, 155 landscape) | **confirmed**, exact to 0 px, so within the +/- 1 px gate |
| No document scroll 36/36 | `noDocScroll: true` in 36/36; `docScroll` string equals the viewport in every row | **confirmed** |
| Smallest control 44.0 px | every `buttons[]` entry is `h44` (93.6-179.8 px wide); `minTarget` 44 in all 24 cases that have a target, 999 in the 12 `all-known` cases where no target exists | **confirmed** |
| Longest effect >= 3 words per non-final line | direct read on the 5 sampled frames (4-6 words per non-final line) plus the width/line invariant: 292-516 px wide over <= 3 line boxes, i.e. >= 24 chars/line | **confirmed** |
| Purchase sequence, no double charge | `purchase.frames`: data 40 -> 32 -> 20 with ranks `cutters` -> `+buffers` -> `+dispatch`, and a retap on a `Known` card changes nothing (the `Known` card renders no target) | **confirmed**, and note the `data` value is the post-catch-up figure, not the seeded 20 - labelled-seed provenance, not organic |
| `narrowest block` metric | after the change the narrowest block is 33.6 px = the `4 Data` cost chip (1 line), while before it was 47-235.9 px | the metric is now dominated by the cost chip, not by the effect text - keep `tallestBlock` as the reported column-collapse signal (R-13) |

## 4. Per-gate verdict against the Q-001 acceptance lines (`work/review/inbox/Q-001.md`) and R-01

| Gate | Required | Observed | Verdict |
|---|---|---|---|
| Full-width node cards | one column, card width = panel body +/- 1 px | 314 / 344 / 366 / 534 px, delta 0 px in 36/36 | **pass** |
| Five decision fields | title, exact effect, cost, prerequisite, buy/known state | all five legible in the 390 s1.5 mixed frame; effect strings match `research.ts` lines 26/34/42 character-for-character; costs 4/8/12 match `cost:` | **pass** |
| Size matrix | 360/390/412 + landscape x scales 1/1.5/2 | 36/36 captured with a panel | **pass** |
| No one-word columns | >= 3 words on non-final lines | <= 3 line boxes over 292-516 px; sampled frames show 4-6 words per non-final line; worst line count 3 | **pass** |
| No clipped actions | every action inside the visible area | 33/36 cases: `clip` <= 1 px and every target `insideViewport` after its own `scrollIntoView`. **Landscape s2 `fresh`: the three `Buy` rows report `insideBody: false` even after `scrollIntoView`** (R-11) | **pass with one exception** |
| No page scroll | document never exceeds the visual viewport | `noDocScroll: true` 36/36 | **pass** |
| Purchases and prerequisites preserved | engine-true state changes | data 40 -> 32 -> 20 equals the shipped 8/12 costs; the `Known` card has no target so a retap cannot double-charge; `tests/ui/app.test.tsx` research case still green | **pass** |
| Card order | `RESEARCH_ORDER` top-to-bottom | cutters -> buffers -> dispatch in every inspected frame | **pass** |
| Buy / disabled / known states | all three captured | `mixed` (all three at once), `fresh`, `all-known`, plus the after-buy transition | **pass** |

## 5. Scores (REV-BASE rubric, observed categories only)

| Category | Before (`a8fb14a`) | Now | Basis |
|---|---:|---:|---|
| Readability | 2 | **3** | the named defect is gone and measured (3/3 line-count collapse fixed, 44 px targets, no doc scroll); held back from 4 by the landscape s2 strip and the 337-523 px scroll at 360 s2 |
| Interaction | 2 | **3** | one obvious primary per card, inert prerequisite target, no double charge, stable dock primary matching the objective card; still no keyboard path to world objects (R-10b, unchanged) |
| Scene composition | 1 | 1 | renderer untouched (Q-002) |
| Asset identity | 1 | 1 | renderer untouched (Q-002) |
| State fidelity | 2 | 2 | `powerLimited` still renders as idle (R-08 untouched) |
| Performance / accessibility | 2 | **3** | measured 44 px minimum, contained scroller instead of document scroll, `:focus-visible` retained; no focus-order test for the new cards yet |
| Motion | pending | pending | no frame sequence at this SHA (Q-004) |
| Audio | pending | pending | unchanged (REV-AUD1, B-11) |

First-feel acceptance for the whole build is still **not met** - scene composition and asset identity remain at 1, which is exactly what Q-002 exists to move. Within its own scope, Q-001 is accepted.

## 6. Findings (numbering continues from R-10)

### R-11 Landscape at text scale 2 collapses the research body to an unreachable strip

- **Seen** (`research-after-landscape-844x390-s2-fresh.png`): the panel shows only `Research / Close` and `Data 22`; no card is visible. JSON for that case: `panelH 104 px`, `containedScroll 471 px`, and all three `Buy` rows report `insideBody: false` after their own `scrollIntoView`. Mixed at the same size: `panelH 139.6 px`, `contained 424 px`, both targets `OUTSIDE` at rest.
- **Why it harms the player**: at 844x390 (a phone turned sideways, the common one-handed case) with a large text setting, the research panel is a header with no content; a 44 px target cannot fit inside a ~30 px window, so the purchase path is only reachable by luck of the scroll position.
- **Proposed change** (CSS only, one block inside the existing `@media (max-height: 460px)`): give `.panel__body` a floor (`min-height: 34dvh`), fold the `.panel__lead` Data row into the head line so the body starts one row higher, and let the dock keep a single row by trimming `.dock` to `max-width: min(100%, 560px)` with the existing `flex-wrap` (accept a second row only above scale 1.5).
- **Measurable acceptance**: in `landscape-844x390` at scales 1/1.5/2 and all three state sets, at rest the body shows >= 1 complete card (its title, effect and foot row inside `bodyBox`), `panelH >= 150 px` at s2, and every `Buy` row reports `insideBody: true` after `scrollIntoView`; document still never scrolls (36/36 stays 36/36).
### R-12 Two thumb flicks are needed at 360x640 scale 2

- **Measured**: `containedScroll` 337 px (all-known), 446 px (mixed), 523 px (fresh) against a 271 px panel; only one card is on screen at rest. The document itself never scrolls, so this is the intended contained scroller - the cost is discoverability of nodes 2 and 3.
- **Proposed change**: keep the full text, add a rank/state glyph so a partially visible card is recognisable, and test one bounded experiment - a 2-line clamp on `.node__effect` at `.text-large` with the remainder shown when the card is selected - measured as flick count to reach the third card. If the clamp does not reduce the flick count by at least 1, keep the unclamped text and record the null result.
- **Acceptance**: flick count from rest to the third card <= 1 at 360x640 s2 for all three sets, or the null result recorded next to the numbers.

### R-13 The layout gates live only in an ad-hoc script, not in the test suite

- **Measured**: `npx vitest run` is 172 tests before and after this change, and the diff contains no `tests/` file. The five gates (card width = body width, line-box ceiling, 44 px minimum, no document scroll, per-card field presence) are therefore only asserted by `q001-evidence/capture-research.mjs`, which nobody runs automatically.
- **Proposed change**: promote the script to `scripts/capture-research.mjs`, have it exit non-zero when any gate breaks, and add one jsdom test for the parts jsdom can see (card count = 3, one `.nodes` child per node, presence of the five field classes, `disabled` on the prerequisite target). No layout numbers in jsdom - its `getBoundingClientRect` is zeroed, so the pixel gates stay with the Playwright script by design.
- **Acceptance**: `npm test` count grows above 172; `node scripts/capture-research.mjs` returns exit code 0 on the candidate and non-zero when one rule is perturbed locally (a one-line experiment proving the gate bites).

### Carry-overs (not caused by this change, unchanged by it)

`Store900/900` still has no separator in every frame (Q-009 / R-10a); the world still renders the always-on grid and one amber primitive (Q-002); the tracked gallery image `docs/screenshots/latest-research-phone.png` still shows the old two-column layout, so the publisher must refresh the gallery at the next milestone or label it stale (the handoff says this openly).

## 7. Unverified dimensions, and the queue after this verdict

Unverified here: keyboard focus order over the new cards (no test, no capture), real-device behaviour and thermal trace (B-08), the 17-minute organic gallery (still shows the pre-change layout), audio and motion gates (Q-005 / Q-004, B-11), and human first-feel comprehension (B-09). The five inspected frames are a sample of the 36-case matrix; the remaining 31 are covered by the numeric gates in section 3, not by eye.

Prioritized next-five (presentation area, unchanged by this verdict): **Q-002** (style slice, spec `rev-q2spec-g3`), **Q-003** (level pips, subsumes R-02), **Q-004** (interpolated motion + the clip that unlocks the motion gate), **R-11** (landscape text-scale-2 panel strip), **Q-007/R-08** (fifth status accent). R-12 and R-13 ride along with whichever task touches the same files.

Publisher note: this verdict is scoped to `24429e1` (tip `e35a642`, integrated as `85caa3b`/`1f0f722`). Board line for Q-001 may move to `accepted` with `rework items R-11/R-12/R-13` listed; the gallery refresh stays a milestone action.

Report path: `review-r1/rev-q001-g4.md`. Verdict: **accept** for the Q-001 scope at `24429e1a1d5135dc5b989f44767353512c4702b0`.
