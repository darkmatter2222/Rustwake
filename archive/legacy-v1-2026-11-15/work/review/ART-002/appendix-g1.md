# ART-002 g1 — appendix: capture inventory, measurements, gate audit

Candidate under review: live route `https://home.darkmatter2222.com/rustwake/`, deployed artifact **rustwake-d7af68a** (source SHA `d7af68a1df31d6b0cb5e313330f7cb5853d74a32`, ancestor of review base `b5fdb845492aad1979b99f6592235eb171a4ce68`). Served asset fingerprints at capture time matched the recorded d7af68a provenance byte names: `index-DGy53fNu.js`, `index-9FriNul.css` (exact: `index-9FriNULu.css`), `tables-BB2NPvQ2.js`.

All captures below were taken fresh in this session (2026-11-05, UTC) with `work/review/ART-002/tooling/art002-capture.mjs` and `art002-clip.mjs` (playwright-core + system headless Chrome). Stored `docs/screenshots/*.png` were used only as secondary cross-checks, never as sole evidence.

## 1. Still captures (10 files, all PNG, all distinct sha256)

| file | viewport | dpr | text scale | kind | moment | taps | sha256 (first 12) |
|---|---|---|---|---|---|---|---|
| live--d7af68a-390-ts1-fork.png | 390x844 | 2 | 1 | organic | fork row open | 310 | 53c28be63deb |
| live--d7af68a-390-ts1-rest.png | 390x844 | 2 | 1 | organic | rest (1.2 s no tap) | 310 | 0e54617ef956 |
| live--d7af68a-360-ts2-fork.png | 360x640 | 2 | 2 | organic | fork row open | 313 | f5f7eef6cea7 |
| live--d7af68a-360-ts2-rest.png | 360x640 | 2 | 2 | organic | rest | 313 | 41c231e9d4a9 |
| live--d7af68a-412-ts1-fork.png | 412x915 | 2 | 1 | organic | fork row open | 312 | 67de0adadc72 |
| live--d7af68a-412-ts1-rest.png | 412x915 | 2 | 1 | organic | rest | 312 | 5cb5f1cfa521 |
| live--d7af68a-desktop-1440-fork.png | 1440x900 | 1 | 1 | organic | fork row open | 312 | aacf7ced0a0b |
| live--d7af68a-desktop-1440-rest.png | 1440x900 | 1 | 1 | organic | rest | 312 | 6c42c52e7819 |
| live--d7af68a-seed-mature-390.png | 390x844 | 2 | 1 | seeded | mature yard, report dismissed | – | 7b1b61c1d688 |
| live--d7af68a-seed-mature-desktop.png | 1440x900 | 1 | 1 | seeded | mature yard, report dismissed | – | 81e55676d7bc |

- Text scale 2.0 was set through the player's own control (`[aria-label^="Text size"]`, steps [1, 1.25, 1.5, 2] in `src/ui/App.tsx`), not a device factor.
- Full-sha rows: `captures/art002-stills-provenance.json`. All ten frames had `scrollHeight == innerHeight` (no page scroll) and 0 page errors.
- Fork-row dock faces (measured, CSS px): 390: 191.8x46 / 172.3x46 · 360-ts2: 182.7x46 / 155.3x46 · 412: 202.8x46 / 183.3x46 · desktop: 286.8x46 / 267.3x46. All ≥ 46 px height (above the 44 px minimum).
- Organic fork was reached at tap 310–313 in this session (the stored 0c03572/d7af68a notes recorded 114–115; the difference comes from ticks-per-tap under this session's evaluation overhead between taps, not from a different build behavior — the same fork content appears).

## 2. Motion clip — 250 ms witness spacing

`art002-clip-250ms-f01..f26.png` + `art002-clip-250ms.json` (canvas-only surface, 390x844 dpr2, backing 780x1688):

- 26/26 distinct PNG sha256; 26/26 distinct drone-body positions (from the wrapped 2D context, i.e. the ops the painter really emitted).
- Body centre: x constant 180.5 (the store→sorter leg is vertical in FS-1), y sweeps 248.5 → 591.0; mid-leg steps 82–102.5 px/250 ms; dwell frames 1.5–20 px (dock/pad dwells) — same signature as the ART-001 g4 witness (mean 77.86 there, 77.84 here).
- Sim ticks 432344 → 432414 across the clip: 4+ samples share one tick yet positions keep changing → sub-tick interpolation confirmed live, not just in stored rows.
- No blank/duplicate frame: file bytes 49953–50991, all distinct hashes.

## 3. Geometry at the fork moment (my own probe, `art002-geom.mjs`)

| viewport | canvas CSS | objective card | dock row |
|---|---|---|---|
| 390x844 ts1 | 390x844 full-bleed | y 62, 340.4x89.2 → **10.6 %** of height | y 790, 370x46 |
| 360x640 ts2 | 360x640 full-bleed | y 110.9, 312.8x261.4 → **40.8 %** of height | y 586, 340x46 |
| 1440x900 ts1 | 1440x900 full-bleed | y 58, 420x89.2 → 9.9 % | y 846, 560x46 centred |

Visible world bands read from the inspected PNGs (approximate, CSS px):

- 390x844: machine row ~55–265 · sparse dot field ~265–645 (~45 % of the viewport height carrying only dots and 3 tiny motifs) · wreck/drone/crates strip ~645–780 · gap to dock ~790.
- Desktop 1440x900: the authored world column spans ~x 390–1050 (≈ 46 % of the width); the left/right gutters are flat backdrop; resource pills sit at the far left/right of the 1440 px strip, disconnected from the column.

## 4. Audio — technical inspection only

No listening took place in this runtime (headless Chrome + Node, no loopback capture, no supported audio-listening mechanism engaged). **Subjective sound quality: unverified.** Technical facts read from source (`src/game/audio/audio.ts`, same artifact):

- One real master gain above five category buses (`music, ambience, machinery, effects, ui`) with declared `BUS_LEVELS`, per-cue envelopes (attack 0.002–0.014 s, durations 0.05–0.3 s), voice priorities and headroom arithmetic (0.9 x 0.82 ≈ 0.7) — i.e. the old "every bus straight to destination" defect is structurally corrected.
- Cue set is oscillator one-shots (square/triangle/saw/sine sweeps: salvage 420→240 Hz square, repair 320→720 saw, furnace 120 Hz sine …) plus ambience/music bed gains. Whether this now sounds like a "layered restrained industrial mix" is exactly the unverified dimension.

## 5. Numeric art-gate audit (which gates earn their keep)

| gate | keep / noise | why |
|---|---|---|
| clip: N distinct PNG hashes + distinct drone positions at 250 ms | **keep** | cheap, catches blank/stale frames and teleport-vs-interpolate; reproduced identically live (26/26, mean step 77.8) |
| no page scroll (`scrollHeight == innerHeight`) | **keep** | real mobile constraint, binary |
| min dock face height ≥ 44 CSS px | **keep** | touch usability, binary |
| pageerror == 0 | **keep** | cheap crash witness |
| sheet ink-bbox non-empty / ink fraction | **keep** | catches an empty or mis-transformed render |
| C1..C5 WCAG contrast set per case | **noise as currently built** | identical in all 12 cases by construction (fixed palette; the provenance file itself says so) — one-time palette check, not a per-scene signal |
| firstOf exact-pixel sample points + runX/runY block sizes | **noise** | instrument precision beyond what any decision uses; the 3-decimal `stepCssPxMean` likewise (one decimal suffices) |
| card ratio 42 % cap | keep as a coarse cap only | the CHRM-002 0.9 pp chase was instrument work, not art progress |

## 6. File inventory

`work/review/ART-002/captures/`: 10 stills + 26 clip frames + `art002-stills-provenance.json` + `art002-clip-250ms.json` (38 files).
`work/review/ART-002/tooling/`: `art002-capture.mjs`, `art002-clip.mjs`, `art002-geom.mjs` (read-only wrt the primary checkout except their own outputs).
