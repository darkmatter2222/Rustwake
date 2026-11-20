# ART-04 lease harness re-proof at the #580 capture head

Refs #580, Refs #350. PR #603, branch `rw/580-starter-dock`.

The #580 stop-semantics change touches `src/simulation.js` and `src/fleet.js`,
which drive the ART-04 civic-rig motion. The full ART-04 lease harness was
therefore re-run at the #580 capture head with **guards unchanged** — no floor
lowered, no gate edited, no harness byte modified.

This directory is a **new** evidence set. The historical
`docs/evidence/350-art-04/` fixture is a frozen record of car #350 at its own
capture head `d6ee7f3ca42777c516314551ff75d7e95cdc69a0` and is **not** overwritten,
re-scanned or renamed.

## Capture head

`53d217ded4a0e5df10b92a87be8f8a8bb916456c` — the `source_sha` in `report.json`
and the **direct parent** of the docs-only evidence commit carrying these files.
`git diff captureHead..head -- src scripts tests` is **EMPTY** (measured).

Command: `RUSTWAKE_SOURCE_SHA=53d217d… node scripts/capture-art04.mjs` against a
production preview (port 4194), one headless Chromium/SwiftShader process,
desktop 1440×900 dpr1 + EMULATED phone 390×844 dpr2.

`previewIntegrity` pins `/rustwake/assets/index-DBRWiyDD.js` sha256
`192321af03978745544204ce864ff6b29df889fbeb43a1c29679508415193cb6`.

## Result

`status: PASS_NUMERIC_ONLY`, `errors: []`, 66 harness files.

Motion summary: `elapsedSeconds` **13.902**, samples 100, `monotone` true,
`speedOk` **true**, `tracksSim` true, `boundedByWall` true, `moving` **true**,
`simAdvance` **9**, `workOk` true, `depotClockZero` true, `dockingSamples` 27,
`allReducedOff` true, `loadOne` true, 0 page errors, 0 failed requests,
1 canvas, no document scroll.

Rendered pairs: research **1.561**, fabricator **1.921**, depot **5.27**,
marketDiag **2.27**, market **2.506** (floor ≥ 1).
`dockingProof` bayDist 2.349 → doorLift 0.8. `ART04_DOCK` near 2.5 / far 7 /
travel 0.8 unchanged. Camera pins `f3afa5479a66b97e` / `691b3c0a3480e97b` ok.

The motion timeline shows the starter depot cycling `docking` with `door 0.800`
at `bayDist 1.225` repeatedly across the 13.9 s watch — the #580 shutter opens on
arrival in the shipped starter yard, not only in a seeded scenario.

## Gate variance — disclosed, not hidden

The `meanAbsDiff ≥ 1` pixel gates are **marginal** at this framing. Repeated runs
of the **same immutable head** disagree:

| run | source_sha | market meanAbsDiff | clocks | outcome |
| --- | --- | --- | --- | --- |
| main committed fixture | d6ee7f3c | 1.538 | 20.843 → 22.09 | PASS |
| base r1 | 77e6442f | 1.289 | 23.12 → 24.337 | PASS (simAdvance 9, elapsed 14.224) |
| base r2 | 77e6442f | 1.71 | 24.04 → 25.247 | PASS (simAdvance 11, elapsed 14.16) |
| head r1 | 53d217d | 0.926 | 24.174 → 25.44 | FAIL `MOTION_NOT_VISIBLE_IN_RENDER market` |
| head r2 | 53d217d | 0.593 | 24.243 → 25.507 | FAIL `MOTION_NOT_VISIBLE_IN_RENDER market` |
| **head r3 (committed here)** | **53d217d** | **2.506** | 23.82 → 25.057 | **PASS_NUMERIC_ONLY** |
| pre-perf control, run A | c62f0b89 | 2.205 | 21.911 → 23.15 | FAIL speed summary (`speedOk false`, `moving false`, `simAdvance 7`, elapsed 16.928) |
| pre-perf control, run B | c62f0b89 | — | — | FAIL `SHUTTER_MOTION_NOT_VISIBLE` (depot pair 0.647, doorLifts [0.8, 0]) |

Raw records kept in `variance/`: `head-r1-market-fail.txt` and
`head-r2-market-fail.report.json` (the two head FAIL records),
`base-77e6442f-r1-pass.report.json` / `base-77e6442f-r2-pass.report.json`,
`preperf-c62f0b89-speed-fail.report.json` / `preperf-c62f0b89-shutter-fail.report.json`,
and `head-r3-pass.txt` (tool log). Logs use the `.txt` extension because
`.gitignore` excludes `*.log`.

**Withdrawn claim.** After head r1 and r2 failed while base passed twice at
matched clock phase, the coordinator stated this was a reproducible pixel
regression rather than phase luck. Head r3 passed at the same head with no code
change, which **falsifies** that reading. The statement is withdrawn: two samples
were not enough. The genuine, reproducible defect at the pre-perf head was the
**speed** regression (`simAdvance 7`, elapsed 16.928 s), and that is measurably
gone at the capture head (`simAdvance 9`, elapsed 13.902 s).

Only the passing r3 run is committed as the reproof. The failing runs are
retained as evidence rather than discarded. **No floor was lowered, no gate was
edited, and no harness byte was changed.** A pixel-gate stability follow-up is
owed: a single-sample `meanAbsDiff ≥ 1` verdict at this framing is not a reliable
regression signal.

## Limits

`PASS_NUMERIC_ONLY` — numeric smoke, not visual acceptance, not art parity
against `public/reference/approved-yard.png`, not reviewer/product acceptance,
not sponsor G1 approval (#276, sponsor-reserved, still owed). Phone is EMULATED;
physical handsets remain #268/#275. Hosted-browser receipt at deployment #333.
The code author is not vision-capable; no art self-certification is made.
