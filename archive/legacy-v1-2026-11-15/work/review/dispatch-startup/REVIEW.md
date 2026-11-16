# dispatch-startup — startup review of the live build (QA / reviewer)

**Candidate inspected:** `main` = `b4e8321`, served at `https://home.darkmatter2222.com/rustwake/`.
Served assets are byte-equal to my local build of this source: `index-DGy53fNu.js` 231878 B `sha256 5376ec71cb0c4415…`, `index-9FriNULu.css` 7474 B `d3a995b2c520590a…`, `tables-BB2NPvQ2.js` 9298 B `28bed3b02f2f79cb…` (read over HTTPS, cross-checked against local `dist/`). `git diff --stat d7af68a..b4e8321` touches only `scripts/`, so the served bundle *is* the current main game code.
**My environment:** headless Chromium 151 (`playwright-core` 1.49.1), `deviceScaleFactor 2`, `isMobile + hasTouch`, fresh storage per context, real tap-driven sessions plus one seeded mature save. Evidence: `captures/` (15 stills, 6-frame clip, 3 zoom crops), `captures/ds-measure.json` (all numbers), `captures/run2.log`, harness `ds-capture.mjs` / `ds-crop.mjs`. Captured 2026-11-06T02:31Z.

## Verdict

**REWORK.** The technical layer is clean and I could not break it: 283 tests / 27 files pass, `tsc --noEmit` exit 0, `npm run validate` = 0 violations, 0 `pageerror` in every cell, `scrollHeight == innerHeight` everywhere, every dock face ≥ 44 px, drone motion interpolates (6/6 clip frames distinct: `86A769A7… 6142825D… 98115F6E… 65097015… 61AC2A62… D2AA8BEF…`). None of that contradicts the owner: at normal phone size the product still reads as an **instrumented diagram**, not a game you would show someone. The three defects below are the ones a player feels first, and none of them is touched by the numeric gates that currently pass.

---

## D1 — The world is a flat plate floating in dead navy: no filled frame, no depth, two luminance tiers

What I see (`ds-390-rest.png`, `ds-390-seed-mature.png`, `ds-1440-seed-mature.png`): the yard is one uniform `#22384a` rectangle in the middle of the screen with hard edges, a field of small pale squares on it, a few marks, and nothing else. Above and below it is a single flat navy fill.

Measured, from the painted canvas of my own captures (`ds-measure.json`):

| Cell | ink coverage per 1/8 of canvas height | canvas colour census |
|---|---|---|
| 390x844, organic | `0, 5, 86, 89, 89, 82, 0, 0` → the plate spans y≈211–633 of 844 = **50 % of the frame** | `#0b1220` 56.2 % + `#22384a` 31.6 % = **88 % of all pixels are two flat fills** |
| 390x844, seeded mature | `0, 5, 86, 89, 89, 82, 0, 0` | same two fills = 84.7 %, 500 distinct colours total |
| 1440x900, seeded mature | authored column x≈403–1043 = **44 % of width**, dock 560/1440 = 38.9 %, flat gutters either side | — |

Luminance histogram over the whole canvas (8 equal buckets): `61.9 / 34.6 / 0.4 / 0.6 / 2 / 0.4 / 0 / 0` % — **96.5 % of the image is below L≈64 and only 0.4 % is above L≈191**. There is one light direction nowhere: the dock, the machine bodies, the wreck and the drone carry no highlight, no shade, no contact shadow; they all hover. This is the bible's "mostly blank grid; unclear focal action" and "uniformly dim navy-on-navy" case, and the desktop case is worse, not better, because the extra width becomes dead margin.

**Why it harms the player:** the first thing they meet has no centre of interest and no sense of a place. Nothing tells them where the wreck, the dock and the first machine are in relation to each other, so the objective card has to do all the work in words, and the screen reads like a form with a picture in it.

Why, exactly: the authored world is `WORLD_W = 192`, `WORLD_H = 224` (`scene.ts:33-35`), ratio 0.857, while the portrait chrome band at 390x844 is about 390 × 690, ratio 0.57. In `fitCamera` (`scene.ts:71-81`) `bandScale` (≈2.92) is therefore larger than `widthScale` (390/216 = 1.8056), so line 77 returns the **legacy width-only fit** on every portrait phone: plate = 347 × 404 px, centred in the canvas at y 222–626 — 42 % of the canvas area, and not even centred in the *band* (band centre ≈ 460 vs painted centre 422). The letterboxing is a geometry consequence of a near-square world in a tall frame, not a palette choice.

**Concrete change (bounded):** (a) extend the authored world vertically so the band term becomes binding: `WORLD_H` from 224 to ≈336 units (ten to eleven cell rows) by adding the bible's missing depth rows — a distant skyline strip above the rail and a foreground apron with kerb, worn path, drainage and perimeter posts below the wreck — which makes the plate ≈ 390 × 680 at 390x844 (≥ 80 % of canvas height) and turns the band path in `fitCamera` live; then use the band centre (line 80) rather than the canvas centre for the resting camera. On desktop let the yard keep its ratio and paint the two gutters as the same distant-bank band instead of flat night, so the frame is filled; (b) give every `PARTS` body a 2-step facet (top-left lighter, bottom-right darker) and one ellipse contact shadow under each static footprint, drawn in `scene.ts` from the existing `PALETTE.shadow`; (c) reduce the resting grid to one dot per cell at ≤ 0.12 alpha and reveal the full lattice only during placement, so the dots stop competing with the parts.

**How I re-measure it:** fresh 390x844 and 1440x900 captures → plate ink in ≥ 5 of 8 height bands above 70 % and bands 0/7 non-zero; painted plate ≥ 75 % of canvas height; luminance: at least three buckets above bucket 1 each ≥ 3 %; the two most common fills ≤ 80 % of pixels; the 6-frame clip, no-scroll and ≥ 44 px face witnesses unchanged.

## D2 — Machines are one box type; identity lives in a printed number and 2–3 px marks

What I see (`ds-crop-machines-2x.png`, `ds-crop-machine-4x.png`, `ds-390-panel-machine.png`): eight bodies that are all "rounded rectangle + white cap bar + dark slot marks", differentiated by a gray number painted above them (14, 13, 11, 12, 11, 10, 10) and by the count of small dark bars inside. The furnace's chimney is a ~7x11 px tab that disappears next to the cap bar; the sorter's rollers and the wire mill's reels are the same 3-unit bars; the dock is only "a paler box with corner ticks". The 5-square pip rows under the machines are near-black squares that read as holes in the plate. The level number sometimes sits **on top of** the white cap bar (machine "12" in the 2x crop), so the label and the sprite collide.

The identification actually in use is textual: the resting card is `Sell 35 Ferrous for 70 credits.` + `Batch pips · Scrap sorter #0 0/5 · Furnace #1 0/5 +6`, i.e. the numbers and the card lines are doing the distinguishing. In grayscale at 390 px the whole machine cluster collapses to one texture — the bible's exact rejection example. The amber-outlined wreck pentagon and the drone pod are the only two marks with real shape identity, and the drone is ~14 px wide.

**Why it harms the player:** they cannot look at the yard and know what they own. Every check forces a tap → panel → text, which turns a "watch your factory" game into a "read your tables" game, and makes the mature yard feel like noise instead of a machine network they built.

**Concrete change:** implement the bible's five silhouettes as *outline-level* differences, not surface marks, in `src/game/renderer/sprites.ts`: furnace = squat chamber + protruding chimney block + 2-step amber core; sorter = frame + three visible roller discs + split-chute wedge; wire mill = two reel rings outside the body + diagonal tension arm; lab = mast + scanner bar; dock = pad ring + one loading arm. Move the tile/level number off the sprite (single row above the footprint, own baseline), and lift the pip squares to two luminance steps instead of near-black.

**How I re-measure it:** I re-crop the mature row at 2x and, in grayscale, compare pairwise differing-pixel fraction per footprint box against today's baseline (recorded in `ds-measure.json` colour census: three body tones carry every machine); plus a blind-naming pass — two reviewers name furnace / sorter / wire mill from the 390 px crop without labels, target ≥ 4/5 each; plus footprint tap geometry unchanged within 2 px.

## D3 — The bottom button is one repeated face; the first minute is a stalled gate with a four-line telemetry card

Measured on the live route, organic, no seeded save:

- 390x844, **260 taps** of the primary face at ~120 ms: tick 330, machines `["sorter:1:starved:0"]`, 2 routes, credits 0, `scrap 5`. The card is 4 lines (`Build a sorter… / A machine waits for input; check its empty side. / Drones 1 · Power 8 · 0 requested · 100 % · Last need 10 scrap · have 5 / Batch pips · Scrap sorter #8 0/5`) = 105 px = 12.4 % of the HUD content box.
- 360x640, 200 taps: same shape, tick 250, one machine, `scrap 0`; card 167.2 px = **26.1 %** of the HUD content box (that cell ended at text scale 1 — see the unverified list).
- The shipped ladder policy, measured deterministically (`npx tsx scripts/probe-phone.mjs 1400 12 10`): step kinds over 1400 rounds = **`{build:6, connect:6, drone:4, upgrade:159, sell:1225}`** — the same face is the whole action 87.5 % of the time, six builds total, and the research node list is still empty at round 1400 (`firstData` at round 143). `npm run validate` prints the intended ladder: `firstDrone=268 firstResearch=478 tick=18298 machines=8` — at `TICK_MS = 100`, a full 8-machine yard is about **30 minutes of continuous sim time**.

So for long stretches the primary face does not change, taps are absorbed by an unmet price (the only feedback is the toast `Need 5 ferrous · have 0`, which itself lands on top of the open panel — see S6), and the visible world changes only by the drone pod sliding ~30 px. The card's own lines are engineering prose: `0 requested`, `100 %`, `Batch pips · Scrap sorter #8 0/5`, which is a diagnostics readout, not a player sentence.

**Why it harms the player:** there is no moment where a plan of theirs visibly pays off. They tap one button, wait, tap again; the named fork (Faster batches / Less power) is the only place a decision exists, and it is small, rare and text-only. That is exactly the owner's "clicked through the entire progression" complaint, and it is measurable without any opinion about art.

**Concrete change (one sprint-sized slice):** (a) put the *consequence* on the face and next to it the *queue*: `plan.ts` is deterministic, so show the next three planned steps as a numbered strip under the card (`1 Sell 35 Ferrous +70 · 2 Upgrade Furnace 30c · 3 Connect → Recycler`), so the player can state what will happen; (b) make each paid step visibly land in the world — a 400–800 ms skippable assembly beat on the affected machine plus one delta line (`steel 12 → 20 since last action`); (c) collapse the resting card to two lines at text scale ≥ 1.5 and move `Power / requested / Batch pips` into the Store panel body where the rest of the telemetry already lives.

**How I re-measure it:** organic 260-tap session at 390x844 must show ≥ 2 distinct plan steps executed (not just `sell`), a numbered step strip present, and the card ≤ 2 lines at ts 1.5/2.0; the ladder probe must print the same machine/research milestones while `sell` falls below 70 % of step kinds; no-scroll and ≥ 44 px faces unchanged.

---

## Secondary findings (each is a small, located fix)

- **S1 — panel label/value pairing is broken.** In the Store panel the value `10/900` sits under `10` in the left column while its own label `Capacity` sits in the right column, and four `Measured` lines alternate between columns (`ds-390-panel-store.png`). Cause: `.panel dl` is `grid-template-columns: auto 1fr` (`styles.css:335-341`) but some rows are bare `<dt>/<dd>` and others are wrapped in a `<div>` (`Panels.tsx:245-297`), so the div occupies one cell and the bare pair two. Fix: one `<div>` per row with two child spans in every panel. This is the bible's named rejection case.
- **S2 — clipped panel content with no affordance.** `.panel { max-height: 42 % }` + `.panel__body { overflow: hidden auto }`: in `ds-390-panel-machine.png` the last two rows are cut in half under `Needs 2 Scrap`, and the Research panel's third node is sliced mid-glyph (`ds-390-seed-research.png`). The scroll exists but nothing on screen says so. Fix: a visible pager (`1/3 ▸`) or a bottom fade + chevron.
- **S3 — the store chip has no separator:** `Store900/900` in every capture. `Hud.tsx:70-73` puts one text child in a flex row whose spacing comes from the gap between children, so the label and value collide. One character of fix.
- **S4 — `Sound ✓` wraps to two lines** and is taller than the two neighbours in the cluster row (`ds-390-rest.png`), so the top-right cluster has three mismatched heights.
- **S5 — two adjacent dock faces both start with "Build"** — the primary `Build Furnace / 10 scrap + 5 ferrous` and a plain `Build` (`ds-measure.json` → faces). Different behaviour, one visible word.
- **S6 — toast over panel text:** `Need 5 ferrous · have 0` lands on the `Next step` sentence in `ds-390-panel-machine.png`; the toast has no dismiss target. Both texts are partially unreadable at the same time.
- **S7 — route ink outweighs the parts:** the thickest mark in the frame is the gray/steel route beam, drawn straight through machine bodies (visible in `ds-crop-machines-2x.png`), and the amber in-transit tokens are the same size as the grid dots, so tokens and grid read as one texture.
- **S8 — tile numbers collide with sprite parts** (machine "12" in `ds-crop-machines-2x.png`).

## Explicitly unverified in this pass

- **Audio:** no listening took place. This runtime is headless Chromium + Node with no loopback capture, so I have **no** sound verdict — not even a "quiet/harsh" judgement. Only source-level facts (`src/game/audio/audio.ts` oscillator cues, bus wiring) are known, and those are structural, not perceptual.
- **Real-device behaviour:** touch latency, safe-area on a notched phone, and per-device p95 frame time were not measured; my numbers are headless emulation at `deviceScaleFactor 2`.
- **Human comprehension:** my "the player cannot tell X" statements are reviewer inference from captures plus my own scripted interaction, not human testing.
- **Text scale 2.0 at 360x640:** my harness's scale cycling did not reach 2.0 inside one synchronous evaluate (React batches the re-render), so that cell is at scale 1 here; the historical `CHRM-002` receipt covers ts 2.0 and should be re-run, not trusted, at the next candidate.
- **Landscape 844x390, offline catch-up, and the two-tab lease** were not re-inspected in this pass; prior receipts cover them.

## What I would do next, in order

1. E1 silhouette-first slice exactly as specified in `work/review/ART-002/ART-002-g1.md` (it is still the right experiment) **plus** my D1(a) band-fit so the plate fills the frame — one candidate, both measured on the same 390x844 + 1440x900 pair.
2. S1-S4 as one chrome-hygiene commit (all four are 1-5 line changes with a re-capture).
3. D3(a) numbered plan strip, which is the smallest change that makes "I made a plan and it ran" observable.

*Reviewer: QA/reviewer persona, session `ses_e5169044fffePwQOJXKKfxyoKc`, base `b4e8321`, harness in this folder. Numbers: `captures/ds-measure.json`; run log: `captures/run2.log`. Note: an earlier harness revision clicked `Cancel` after every tap and stalled the yard at 0 machines; that stall was my harness artifact, fixed before the run whose numbers are quoted above.*
