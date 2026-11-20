# #580 starter-yard shutter — capture provenance

Refs #580. PR #603, branch `rw/580-starter-dock`. Companion design note:
`docs/design/CIVIC_RIGS.md`. Backlog row: `docs/backlog/GAPS.md` (ART-04 row,
residual column — UPDATED, not added).

## Capture head

`53d217ded4a0e5df10b92a87be8f8a8bb916456c`

This is the `source_sha` recorded in `report.json` and the **direct parent** of
the docs-only evidence commit that carries these files. Measured invariant:
`git diff captureHead..head -- src scripts tests` is **EMPTY** — the evidence
commit changes zero game-source, harness or test bytes, so the artifacts below
describe exactly the code at the capture head.

The capture head is a descendant of main
`77e6442f04dce6529e3888535a73d3f75af1d9b6` (the deployed SHA at capture time).

## How these artifacts were produced

Production preview (`vite build` then `vite preview`, port 4195), one headless
Chromium/SwiftShader process, sequential desktop then emulated-phone contexts,
preview child killed in `finally`.

- `report.json`, 12 PNGs, `capture.txt` (tool log) —
  `RUSTWAKE_SOURCE_SHA=53d217d… node scripts/capture-580-dock.mjs`.
  Desktop 1440×900 dpr1; phone EMULATED 390×844 dpr2 `isMobile`/`hasTouch`.
  Fresh shipped starter yard via `createGame()` as-is: `INITIAL_BANK` and tier
  untouched, no seed, no camera gesture — the DEFAULT home pose is never moved.
  15 s real-clock watch plus a real open/closed pixel pair.
- `zeroinput-base-77e6442f.json`, `zeroinput-head-53d217d.json` —
  `node scripts/diag-dock-zeroinput.mjs <srcDir> 660` (660 sim-s, dt 0.25,
  2640 steps) against `src` materialized from each commit. Node-only, no browser.
- `baseline-diag.txt` — the original base-defect probe (960 steps, 4 rotations),
  retained unchanged from the code commit.

`previewIntegrity` pins the served entry bundle
`/rustwake/assets/index-DBRWiyDD.js` sha256
`192321af03978745544204ce864ff6b29df889fbeb43a1c29679508415193cb6`, so a foreign
build cannot pass as this head (`PREVIEW_SERVES_FOREIGN_BUILD`).

## Measured result

`status: PASS_NUMERIC_ONLY`, `errors: []`.

| clause | base main 77e6442f | capture head 53d217d |
| --- | --- | --- |
| docking steps (of 2640) | 0 | 538 |
| firstDockT (sim-s) | null (never) | 7.25 |
| minBayDist (world) | 5.775 | 1.225 |
| clause1 | FAIL | PASS |
| delivered | 2725 | 2638 |
| shipments | 291 | 271 |

Throughput cost, disclosed not gated: delivered **96.8%**, shipments **93.1%** of
base.

Rendered at the home pose: `shutterEverOpens` true on both viewports, first dock
wall-clock desktop **7.6 s** / phone **7.95 s**, `maxDoorLift` **0.8**,
`minBayDist` 1.225 / 1.274, `dockingSamples` 11 / 10.
`motionDetectableAtHome` true, pair `meanAbsDiff` desktop **3.706** / phone
**5.598** (floor ≥ 1). `shutterTravelPx` 8.45 / 6.89, `bboxFitsCanvas` true, no
clamped clips (`MOTION_CLIP_AMPUTATED` / `DOCKING_CLIP_AMPUTATED` intact), 0 page
errors, 0 failed requests, all 12 PNGs above `SANITY_BLANK_OR_FLAT_FRAME`
(minColors 824, minSigma 37.167). Camera pins `f3afa5479a66b97e` /
`691b3c0a3480e97b` unchanged. `ART04_DOCK` near 2.5 / far 7 / travel 0.8
unchanged. `createGame` still ships exactly **3 trucks**, tier 0.

`maxDoorLift` reads **0** in the node zero-input probe BY DESIGN:
`bayApproachDistance` does not expose `doorLift`. Shutter lift is proven by the
browser capture only and is never claimed from the node probe.

## Limits

`PASS_NUMERIC_ONLY` is **numeric smoke, not visual acceptance**. No art-parity
claim against `public/reference/approved-yard.png` is made. The code author is
not vision-capable and makes no art self-certification.

Still owed: sponsor G1 visual review #276; physical handsets #268/#275 (phone is
EMULATED, one headless run); hosted-browser receipt at deployment #333;
independent reviewer + product ACCEPT at the immutable evidence head;
release-engineer merge and deployed-SHA verification. Branch CI success is not a
production release.
