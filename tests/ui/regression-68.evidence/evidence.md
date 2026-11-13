# #68 REGRESSION — full UI / save / gameplay regression matrix

Role: reviewer | reg-68 | EVIDENCE (evidence-only; NO src change)

- Issue: https://github.com/darkmatter2222/Rustwake/issues/68
- Linked defect: https://github.com/darkmatter2222/Rustwake/issues/117
- **Live main baseline (buildSha): `7fcaea1c12a9fa0cd8bc608f5b0ffadf0b903207`**
- Branch: `rw/68-regression` (evidence-only descendant of 7fcaea1c; `git diff 7fcaea1c..HEAD -- src/` is EMPTY)
- Evidence head: recorded dynamically in `results.json` (`evidenceHead`) and on the linked DRAFT PR.
- Method: **AGENT** headless Chromium DOM / geometry / computed-style / console + canvas PIXEL checks only. **NO vision; no claim of visual inspection.** All playtests are automated AGENT probes, not human play.
- Machine-readable companion: `results.json` (per-probe summaries, `defects[]`, `overallPass`), `mirror.json` (recursive frame census), `probe.mjs` (consolidated runner; `prove` asserts committed == ran).

## Overall verdict

**overallPass = FALSE — exactly ONE linked defect (#117).**

8 of 9 reused probes PASS at 7fcaea1c. `logistics-59` FAILS: a deterministic
phone-landscape (844x390) furnace canvas-tap **selection** regression that passed
228/228 at the #59 baseline `937698e424232c395abf9f682edbafc3495239f2`. reg-68 made
**no src/ or probe change**; disposition is **STOP-AND-REPORT** — the coordinator
assigns a fix owner. Forbidden paths (sim / engine / save / geometry / a11y CSS)
are untouched. One additional phone pixel check was **flaky** (run1 only, passed
rerun) and is recorded as flaky, NOT a defect.

## Ladder receipts (at 7fcaea1c, force-added under this directory)

| Gate | Result | Receipt |
| --- | --- | --- |
| typecheck | exit 0 | `typecheck.log` |
| validate | exit 0 (0 violations) | `validate.log` |
| vitest | 60 files / **746 tests passed** | `vitest.log` |
| build | exit 0; required chunks match deployed baseline byte-for-byte + SHA256 | `build.log`, `build-verify.json` |

`build-verify.json` pins `buildSha=7fcaea1c…` and `requiredChunksMatch=true`. The
five built chunks (`catchup.worker-G_Jyr7uh.js`, `index-BBL5748F.js`,
`index-Eo_6W0ie.css`, `tables-KTf0wpwx.js`, `vendor-Bt4lNSbZ.js`) cross-match the
`perf-67` `buildInventory` SHA256s — i.e. the preview served the verified build.

## Acceptance-journey × form-factor matrix

Form factors: **phone** (390x844), **phoneland** (844x390), **desktop** (1920x1080)
unless the probe defines a wider set (noted). Verdicts are AGENT probe results.
"PASS" = all checks for that journey/form passed; "FAIL (#117)" = blocked by the
linked phoneland selection regression.

| Journey | Covering probe(s) | phone | phoneland | desktop | Notes |
| --- | --- | --- | --- | --- | --- |
| Fresh run | home-62, research-58, world-60, perf-67, save-63 | PASS | PASS | PASS | Fresh entry gate → menu → settings → reset (home-62); empty research tree; opening world; zero/short catchup. |
| Mature run | logistics-59, research-58, world-60, perf-67, save-63 | PASS | **FAIL (#117)** | PASS | Dense yard; completed/large research; mature world; catchup. phoneland dense furnace selection broken. |
| Bottleneck recovery | logistics-59 (outputfull / missinginput / zeropower), research-58 (partial) | PASS | **FAIL (#117)** | PASS | Blockage/recovery fixtures pass phone/desktop; phoneland machine-targeted flow blocked by selection regression. |
| Trade (connect / disconnect / refund) | logistics-59 | PASS | **FAIL (#117)** | PASS | Refund + custom-route duplicate-preview engine rejection correct on phone/desktop; phoneland cannot reach preview (selection fails first). |
| Branch upgrade | logistics-59 inspector, home-62 settings | PASS | **FAIL (#117)** | PASS | Machine-targeted upgrade reachable phone/desktop; phoneland selection regression blocks targeting. |
| Research | research-58 | PASS | PASS | PASS | 110/110 checks; fresh / completed / partial / large / no-data fixtures; all forms. |
| Import / export | save-63 | PASS | PASS | PASS | 394 assertions × 3 forms + 2 mirror = **1186**, 0 failures; hostile import sanitized; textScale clamped. |
| Offline return | return-61 | PASS | PASS | PASS | 174/174; zero / short / cap / long / large catchup; reload byte-equal. |

Cross-cutting acceptance criteria:

| Criterion | Evidence | Verdict |
| --- | --- | --- |
| All #43 viewports | access-66: 8 viewports × ts1/ts2 = **16 cells**, 0 errors, 0 defects (Chrome + Edge) | PASS |
| Large text | access-66 ts2 cells (text scale 2) all 8 viewports | PASS |
| Keyboard | access-66 keyboard (3 cells) + reduced-motion | PASS |
| Touch | logistics-59 `tapTile` synchronous pointerdown/up; save-63 / home-62 touch forms | PASS phone/desktop; phoneland selection FAIL (#117) |
| Menu states | home-62 fresh gate / menu / settings / reset (229 assertions) | PASS |
| Rapid actions | logistics-59 rapid duplicate commit/cancel; save-63 rapid import | PASS phone/desktop; phoneland FAIL (#117) |
| Orientation / resize | access-66 phone-landscape + responsive geometry; save-63 phone vs phone-landscape | PASS |
| Costs / refunds | logistics-59 refund fixture; vitest sim/engine suite (746) | PASS |
| No duplicate commands | logistics-59 duplicate-preview rejection ("Invalid — an identical belt already runs…") | PASS phone/desktop; phoneland unreachable (#117) |
| Save compatibility | save-63 (1186) + vitest persistence suite (746) | PASS |
| Multitab reader safety | save-63 `runReader` (see below) | PASS |
| No console / page errors | every probe reports consoleErrors=0, pageErrors=0 (including the failing logistics run) | PASS |

## #43 viewport coverage (access-66, full)

16 cells = 8 viewports × {ts1 normal, ts2 large text}. All PASS, 0 console errors,
0 defects, on **both Chrome and Edge**.

| Viewport | Size (px) | dsf | mobile | ts1 | ts2 |
| --- | --- | --- | --- | --- | --- |
| phone-small | 360x640 | 2 | yes | PASS | PASS |
| phone | 390x844 | 2 | yes | PASS | PASS |
| phone-large | 412x915 | 2 | yes | PASS | PASS |
| phone-landscape | 844x390 | 2 | yes | PASS | PASS |
| tablet | 768x1024 | 2 | yes | PASS | PASS |
| laptop | 1366x768 | 1 | no | PASS | PASS |
| desktop | 1920x1080 | 1 | no | PASS | PASS |
| desktop-large | 2560x1440 | 1 | no | PASS | PASS |

Primary forms (phone, phone-landscape, desktop) additionally exercised by
save-63 / logistics-59 / research-58 / return-61 / home-62 / world-60 / perf-67.

## Cross-browser availability (honest; unavailable ≠ pass)

| Browser | Version | Available | Used |
| --- | --- | --- | --- |
| Chrome | 157.0.8103.50 | yes | all 9 probes (chromium, playwright-core) |
| Edge | 157.0.4341.46 | yes | access-66 full 16-cell + keyboard + reduced-motion subset (`CHROME_PATH` override → msedge.exe) |
| Firefox | — | **NO** | Not installed; reused probes launch chromium only; no Firefox probe variant. Recorded unavailable, NOT a pass. |
| Safari / WebKit | — | **NO** | Unavailable on Windows host; no webkit browser in playwright cache; probes chromium-only. Recorded unavailable, NOT a pass. |

Edge identity verified: `executablePath` resolves to `msedge.exe`; **15 of 17**
access-66 frames render differently vs the Chrome run (distinct browser build),
with the same 16 cells / 0 errors / 0 defects. The 2 identical frames are simple
static captures (benign; see frame census).

## Multitab reader safety + console / page errors

- **save-63 `runReader`**: writer + reader share `localStorage`; reader **Replace
  refused** ("Another tab is writing this yard"), writer state untouched, **no
  console/page errors**. PASS.
- **save-63 `runFailureEnv`**: hostile import sanitized; `textScale` clamped. PASS.
- Every probe (including the failing logistics-59 run) reports **consoleErrors=0,
  pageErrors=0**. The #117 regression is a pure functional/geometry failure, not a
  runtime error.

## Per-probe summary (mode labels)

| Probe | Mode | Runner | Checks / assertions | Frames | Verdict |
| --- | --- | --- | --- | --- | --- |
| access-66 (Chrome) | full | tsx | 16 cells, 0 errors, 0 defects, 3 keyboard cells | 17 | PASS |
| access-66-edge (Edge) | full | tsx | 16 cells, 0 errors, 0 defects; 15/17 frames differ vs Chrome | 17 | PASS |
| save-63 | full | tsx | 394 × 3 forms + 2 mirror = **1186**, 0 failures | 48 | PASS |
| logistics-59 | full | node | run1 222/228 (6 fail); rerun 223/228 (5 fail) | 108 (+108 rerun) | **FAIL (#117)** |
| research-58 | full | node | **110/110**, 0 blockers | 48 | PASS |
| return-61 | full | tsx | **174/174**, 0 blockers | 37 | PASS |
| home-62 | full | tsx (vite dev) | phone 113 + desktop 116 = **229**, 0 failures | 16 | PASS |
| world-60 | smoke / reference | node --import tsx | HARD PASS, 4 device-runs, 0 hard failures | 8 | PASS |
| perf-67 | smoke (`--quick`) | tsx | HARD PASS, 9 device-runs, 0 hard failures | 15 | PASS |

- **home-62** records git HEAD (an evidence-only descendant of 7fcaea1c) and runs
  against a **vite DEV server** serving `src` at HEAD; `src` is byte-identical to
  7fcaea1c (no src/ change in this PR), so it exercises the same source as the
  preview build. All other probes run against a local **vite preview** of the
  verified `dist` (127.0.0.1:4198; never a live deployment).
- **world-60** is a fresh after-capture at 7fcaea1c for parity (world art unchanged
  since #60); full before/after delta referenced from committed
  `tests/renderer/world-60-evidence`.
- **perf-67** is a **quick smoke**: shortened sampling, **budget verdicts skipped**;
  latencies are host-relative and NOT comparable to official #67 numbers. Official
  budgets referenced from committed `tests/perf/perf-67.evidence`.

## Seeds / fixtures

All probes seed state **only at setup**, from `docs/evidence/yard-mature.json`
(the mature yard) encoded with the game's own `encodeSave` arithmetic (FNV-1a
checksum), or `createInitialState()` for zero/fresh states. Per-probe seed /
`fixtureScrutiny` fields are recorded verbatim in each `<probe>/results.json`:

- logistics-59: dense / zeropower / missinginput / outputfull / refund fixtures.
- research-58: fresh / completed / partial / large / no-data (Signal lab removed for no-data).
- return-61: `payload.sim` VERBATIM (cap / long / short / large) or `createInitialState()` (zero).
- save-63: phone / phone-landscape / desktop mature yard + hostile-import payload.
- home-62: fresh entry gate / menu / settings / reset.
- world-60 / perf-67: opening / mature (perf adds catchup).

## Defect #117 (the single failure)

- **Probe / form**: logistics-59, `phoneland-dense` (844x390, dsf2).
- **Symptom**: furnace canvas-tap selection regressed — inspector `aria` stays
  "Scrap sorter details" after **6 synchronous tap attempts** (`tapTile` searches a
  ±15-world-unit Chebyshev pick box for `elementFromPoint===canvas`; never taps a
  non-canvas point). Selection never moves to the furnace, cascading into the
  04/05/06 duplicate-preview checks.
- **Deterministic failed checks (5; present in BOTH run1 and rerun)**:
  1. `phoneland-dense/03-select-furnace-dims-unrelated/real tap selects the furnace`
  2. `phoneland-dense/04-custom-duplicate-preview/inline custom preview flags the duplicate as invalid`
  3. `phoneland-dense/04-custom-duplicate-preview/confirm preview repeats the invalid reason with a Cancel`
  4. `phoneland-dense/05-invalid-commit-rejected/engine rejects the duplicate (no route laid)`
  5. `phoneland-dense/06-invalid-cancel/cancel laid no belt (routes unchanged)`
- **Baseline**: `937698e424232c395abf9f682edbafc3495239f2`
  (`work/evidence/UI-RESET-59/results.json`) passed **228/228**; phoneland furnace
  selection PASS, 04/05/06 PASS ("Invalid — an identical belt already runs between
  these endpoints.").
- **Scope isolation**: phone + desktop furnace selection PASS at 7fcaea1c, so the
  duplicate-rejection **engine is not implicated** — the regression is in the
  phoneland tap→selection geometry/pick path.
- **Flaky (NOT a defect)**: `phone-dense/02-show-routes/showing restores cyan rail
  pixels` failed **run1 only** (live-sim cargo variance) and **PASSED rerun**.
  Recorded flaky; excluded from the defect.
- **Disposition**: STOP-AND-REPORT. reg-68 changed no src/ or probe; coordinator
  assigns the fix owner. Issue #117 ↔ this PR cross-linked.

## Frame mirror audit (`mirror.json`)

Recursive PNG census of all evidence frames: **count=422**, `allNonEmpty=true`,
`allDistinct=false`, **uniqueSha256=345**. The 77 duplicate files are fully
classified and **benign** (`other=0`):

| Class | Count | Explanation |
| --- | --- | --- |
| crossRunLogistics | 57 | logistics-59 run1 vs rerun produce byte-identical renders for unchanged steps. |
| crossBrowserAccess | 2 | Chrome vs Edge identical simple/static access-66 frames. |
| withinProbeStatic | 5 | home-62 after-reset == fresh-gate; research-58 fresh entry-gate before == after (probe's own audit marks desktop-fresh/phone-fresh distinct=false); return-61 phone-zero boot before == after == reload (byte-equal). |
| other | 0 | none unexplained. |

Every probe's **own** `frameAudit.ok=true` (each probe audits distinctness within
its own meaningful capture set). The consolidated `allDistinct=false` is expected
once cross-run / cross-browser / static captures are pooled; it is NOT a defect.
Each frame entry records sha256 + PNG IHDR dimensions + nonEmpty.

## Limitations

1. **Headless Chrome EMULATION on a desktop host, NOT physical devices.**
   Viewport / dpr / isMobile / hasTouch / reduced-motion are emulated; CPU / GPU /
   thermal / real touch / mobile network are NOT. Frame-time and memory are
   host-relative; before/after compared under identical conditions (perf-67).
2. **perf-67 quick smoke**: budget verdicts skipped; latencies host-relative, not
   comparable to official #67 numbers (referenced, not re-measured).
3. **Firefox / Safari unavailable** on this host; chromium-only probes. Recorded
   unavailable, NOT a pass. Cross-browser coverage = Chrome + Edge only.
4. **NO vision**: all verdicts are DOM / geometry / computed-style / console /
   canvas-pixel assertions, not human visual inspection. AGENT playtests labeled AGENT.
5. **home-62** uses a vite DEV server (src at HEAD == 7fcaea1c src), not the preview
   dist; all other probes use the verified preview build.
6. The phoneland regression (#117) is reported, not fixed; downstream
   machine-targeted journeys on phoneland are marked blocked-by-#117 rather than
   independently re-verified after a fix (no fix in this evidence-only PR).

## Reproduce / prove committed == ran

```
node tests/ui/regression-68.evidence/probe.mjs restore    # restore overwritten committed receipts
node tests/ui/regression-68.evidence/probe.mjs frames     # recursive frame census -> mirror.json
node tests/ui/regression-68.evidence/probe.mjs aggregate  # per-probe summaries + defects -> results.json
node tests/ui/regression-68.evidence/probe.mjs prove      # git hash-object --path == git rev-parse HEAD:<file>
node tests/ui/regression-68.evidence/probe.mjs all        # restore + frames + aggregate + prove
```

`prove` exits non-zero if any committed evidence file differs from what ran.
`restore` re-checks out the probes' original committed evidence
(`save-63.evidence.json`, `home-62.evidence.json`, `return-61.results.json`,
`work/evidence/UI-RESET-65/seeds.json`) so this PR adds **NEW** evidence only.
The reused #58/#59/#60/#61/#62/#63/#66/#67 probes were run **verbatim** (never
re-authored); fresh results + frames were copied into `<probe>/` subdirectories
here, then the originals restored.

## Scope guardrail

Evidence-only. `git diff 7fcaea1c12a9fa0cd8bc608f5b0ffadf0b903207..HEAD -- src/`
is EMPTY. No sim / engine / save / geometry / a11y-CSS change. `pnpm-lock.yaml`
never staged. The single failure is opened as linked defect #117 and reported
(STOP-AND-REPORT); the coordinator decides the fix owner. This PR stays **DRAFT**
for independent QA at the exact head SHA.
