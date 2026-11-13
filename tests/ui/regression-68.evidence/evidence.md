# #68 REGRESSION — full UI / save / gameplay regression matrix (re-run at post-#117-fix baseline)

Role: reviewer | reg-68b | EVIDENCE (evidence-only; NO src change)

- Issue: https://github.com/darkmatter2222/Rustwake/issues/68
- Prior defect (now FIXED, merged, deployed): https://github.com/darkmatter2222/Rustwake/issues/117
- **Live main baseline (buildSha): `3fd883c94d59f2772fc92118c7caf6d4d889887f`**
- Branch: `rw/68-regression` (evidence-only descendant of 3fd883c9 via merge; `git diff 3fd883c9..HEAD -- src/` is EMPTY)
- Evidence head: recorded dynamically in `results.json` (`evidenceHead`) and on the linked DRAFT PR.
- Method: **AGENT** headless Chromium DOM / geometry / computed-style / console + canvas PIXEL checks only. **NO vision; no claim of visual inspection.** All playtests are automated AGENT probes, not human play.
- Machine-readable companion: `results.json` (per-probe summaries, `defects[]`, `overallPass`), `mirror.json` (recursive frame census), `probe.mjs` (consolidated runner; `prove` asserts committed == ran).
- This is the **reg-68b re-run** of the full reg-68 matrix. The prior run (reg-68 @ `7fcaea1c12a9fa0cd8bc608f5b0ffadf0b903207`) found the phoneland-dense furnace-tap selection regression, filed as #117. #117 has since been fixed, merged and deployed; this re-run verifies the ENTIRE matrix at the new live baseline `3fd883c9`.

## Overall verdict

**overallPass = TRUE — 0 defects. All 9 reused probes PASS at 3fd883c9.**

The #117 phoneland-dense furnace canvas-tap selection regression is **RESOLVED**:
`phoneland-dense/03-select-furnace-dims-unrelated/real tap selects the furnace`
and the 04/05/06 duplicate-preview cascades PASS in **both** logistics-59 runs.
logistics-59 run1 passed **228/228**; the verbatim rerun passed **227/228** with a
single **rerun-only** broad-census pixel check failure that is a **pre-existing
unfaithful-probe artifact**, adjudicated as a cited carve-out in the evidence
layer (see below) — NOT a regression defect. The frozen probe was left VERBATIM;
no src/ or probe change was made by reg-68b.

## Ladder receipts (at 3fd883c9, force-added under this directory)

| Gate | Result | Receipt |
| --- | --- | --- |
| typecheck | exit 0 | `typecheck.log` |
| validate | exit 0 (0 violations) | `validate.log` |
| vitest | 60 files / **746 tests passed** (`--minWorkers=4 --maxWorkers=4`) | `vitest.log` |
| build | exit 0; all JS/CSS chunks match deployed baseline byte-for-byte + SHA256 | `build.log`, `build-verify.json` |

`build-verify.json` pins `buildSha=3fd883c9…` and `requiredChunksMatch=true`. The
five built chunks (`catchup.worker-G_Jyr7uh.js` 13406 B, `index-CEQDUmwp.js`
191098 B sha256 `b85367da838f1bcfa68d432d975035b0049fbf54e2c3a68083d452be3b304844`,
`index-ekc2mZk4.css` 61957 B, `tables-KTf0wpwx.js` 26691 B, `vendor-Bt4lNSbZ.js`
141658 B) cross-match the `perf-67` `buildInventory` SHA256s — i.e. the preview
served the verified build. The served entry chunk was additionally verified over
HTTP (curl + sha256sum) before the probe runs.

`index.html` has a **1-byte local residual**: the local Windows CRLF checkout
(1368 B) LF-normalizes to 1341 B vs the deployed Linux LF artifact (1340 B,
sha256 `49e6bb96…`); host-adapter newline normalization is the plausible cause
(vite 5.4.11 identical in package.json/lock/local; delivery workflow builds with
`npm ci` + host-owned adapter). The **deployed artifact is authoritative**; all
JS/CSS chunks are byte-identical, so the entry-chunk hard gate PASSES. Recorded
honestly in `build-verify.json` `docNote`.

## Acceptance-journey × form-factor matrix

Form factors: **phone** (390x844), **phoneland** (844x390), **desktop** (1920x1080)
unless the probe defines a wider set (noted). Verdicts are AGENT probe results.
"PASS" = all checks for that journey/form passed.

| Journey | Covering probe(s) | phone | phoneland | desktop | Notes |
| --- | --- | --- | --- | --- | --- |
| Fresh run | home-62, research-58, world-60, perf-67, save-63 | PASS | PASS | PASS | Fresh entry gate → menu → settings → reset (home-62); empty research tree; opening world; zero/short catchup. |
| Mature run | logistics-59, research-58, world-60, perf-67, save-63 | PASS | PASS | PASS | Dense yard; completed/large research; mature world; catchup. **phoneland dense furnace selection FIXED (#117).** |
| Bottleneck recovery | logistics-59 (outputfull / missinginput / zeropower), research-58 (partial) | PASS | PASS | PASS | Blockage/recovery fixtures pass on all forms. |
| Trade (connect / disconnect / refund) | logistics-59 | PASS | PASS | PASS | Refund + custom-route duplicate-preview engine rejection correct on all forms; phoneland preview reachable again. |
| Branch upgrade | logistics-59 inspector, home-62 settings | PASS | PASS | PASS | Machine-targeted upgrade reachable on all forms. |
| Research | research-58 | PASS | PASS | PASS | 110/110 checks; fresh / completed / partial / large / no-data fixtures; all forms. |
| Import / export | save-63 | PASS | PASS | PASS | 394 assertions × 3 forms + 2 mirror = **1184**, 0 failures; hostile import sanitized; textScale clamped. |
| Offline return | return-61 | PASS | PASS | PASS | 174/174; zero / short / cap / long / large catchup; reload byte-equal. |

Cross-cutting acceptance criteria:

| Criterion | Evidence | Verdict |
| --- | --- | --- |
| All #43 viewports | access-66: 8 viewports × ts1/ts2 = **16 cells**, 0 errors, 0 defects (Chrome + Edge) | PASS |
| Large text | access-66 ts2 cells (text scale 2) all 8 viewports | PASS |
| Keyboard | access-66 keyboard (3 cells) + reduced-motion | PASS |
| Touch | logistics-59 `tapTile` synchronous pointerdown/up (incl. phoneland furnace); save-63 / home-62 touch forms | PASS |
| Menu states | home-62 fresh gate / menu / settings / reset (229 assertions) | PASS |
| Rapid actions | logistics-59 rapid duplicate commit/cancel; save-63 rapid import | PASS |
| Orientation / resize | access-66 phone-landscape + responsive geometry; save-63 phone vs phone-landscape | PASS |
| Costs / refunds | logistics-59 refund fixture; vitest sim/engine suite (746) | PASS |
| No duplicate commands | logistics-59 duplicate-preview rejection ("Invalid — an identical belt already runs…") on all forms | PASS |
| Save compatibility | save-63 (1184) + vitest persistence suite (746) | PASS |
| Multitab reader safety | save-63 `runReader` (see below) | PASS |
| No console / page errors | every probe reports consoleErrors=0, pageErrors=0, blockers=0 (both logistics runs included) | PASS |

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

Edge identity verified: `executablePath` resolves to `msedge.exe`; **12 of 17**
access-66 frames render differently vs the Chrome run (distinct browser build),
with the same 16 cells / 0 errors / 0 defects. The 5 identical frames are simple
static captures (benign; see frame census).

## Multitab reader safety + console / page errors

- **save-63 `runReader`**: writer + reader share `localStorage`; reader **Replace
  refused** ("Another tab is writing this yard"), writer state untouched, **no
  console/page errors**. PASS.
- **save-63 `runFailureEnv`**: hostile import sanitized; `textScale` clamped. PASS.
- Every probe (both logistics-59 runs included) reports **consoleErrors=0,
  pageErrors=0, blockers=0**.

## Per-probe summary (mode labels)

| Probe | Mode | Runner | Checks / assertions | Frames | Verdict |
| --- | --- | --- | --- | --- | --- |
| access-66 (Chrome) | full | tsx | 16 cells, 0 errors, 0 defects, 3 keyboard cells | 17 | PASS |
| access-66-edge (Edge) | full | tsx | 16 cells, 0 errors, 0 defects; 12/17 frames differ vs Chrome | 17 | PASS |
| save-63 | full | tsx | 394 × 3 forms + 2 mirror = **1184**, 0 failures | 48 | PASS |
| logistics-59 | full | node | run1 **228/228**; rerun **227/228** (1 rerun-only broad-census carve-out, cited below; 0 real failures) | 108 (+108 rerun) | PASS |
| research-58 | full | node | **110/110**, 0 blockers | 48 | PASS |
| return-61 | full | tsx | **174/174**, 0 blockers | 37 | PASS |
| home-62 | full | tsx (vite dev) | phone 113 + desktop 116 = **229**, 0 failures | 16 | PASS |
| world-60 | smoke / reference | node --import tsx | HARD PASS, 4 device-runs, 0 hard failures | 8 | PASS |
| perf-67 | smoke (`--quick`) | tsx | HARD PASS, 9 device-runs, 0 hard failures | 15 | PASS |

- All external probes ran against a local **vite preview** of the verified `dist`
  on **127.0.0.1:4196** (never a live deployment). access-66 and save-63 spawn
  their own previews (4197 / 4199 respectively) per their frozen interfaces.
- **home-62** records git HEAD (an evidence-only descendant of 3fd883c9) and runs
  against a **vite DEV server** (127.0.0.1:4200) serving `src` at HEAD; `src` is
  byte-identical to 3fd883c9 (no src/ change in this PR), so it exercises the same
  source as the preview build. The helper pins `buildShaServed=3fd883c9…`.
- **world-60** is a fresh after-capture at 3fd883c9 for parity (world art unchanged
  since #60); full before/after delta referenced from committed
  `tests/renderer/world-60-evidence`.
- **perf-67** is a **quick smoke**: shortened sampling, **budget verdicts skipped**;
  latencies are host-relative and NOT comparable to official #67 numbers. Official
  budgets referenced from committed `tests/perf/perf-67.evidence`. Its
  `buildInventory` entry chunk (`index-CEQDUmwp.js`, 191098 B, `b85367da…`)
  cross-matches `build-verify.json` exactly.

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

## #117 fix verification + rerun-only broad-census carve-out

**#117 verification (the point of this re-run).** At the prior baseline 7fcaea1c,
reg-68 found a deterministic phoneland-dense (844x390) furnace canvas-tap
selection regression (inspector aria stuck on "Scrap sorter details" after 6
synchronous tap attempts), cascading into the 04/05/06 duplicate-preview checks;
filed as #117, since FIXED, merged and deployed. At 3fd883c9 the full verbatim
228-check logistics-59 matrix was re-run twice:

- `phoneland-dense/03-select-furnace-dims-unrelated/real tap selects the furnace`:
  **PASS in run1 AND rerun.**
- `phoneland-dense/04-custom-duplicate-preview` (both checks),
  `05-invalid-commit-rejected`, `06-invalid-cancel`: **PASS in run1 AND rerun.**
- Deterministic failures (failed in BOTH runs): **none.** Flaky (run1-only):
  **none.** Real failures: **none.** `defects[]` is empty.

**Rerun-only carve-out (NOT a defect).** The verbatim rerun failed exactly one
check: `phone-dense/02-show-routes/showing restores cyan rail pixels`
(detail `hidden=64704 shown=56172`). Run1 passed it (228/228). Adjudication,
computed by the evidence-layer helper from the raw per-probe results:

1. **Non-deterministic**: present in only ONE of the two runs (rerun-only). The
   check is a broad cyan-pixel census over the whole canvas taken 350 ms apart
   while the live sim keeps evolving cargo positions — timing-dependent by
   construction.
2. **Pre-existing unfaithful artifact**: qa-117's independent baseline control
   @ 7fcaea1c reproduced the IDENTICAL broad-census failure, proving it pre-exists
   the #117 fix. Citation:
   https://github.com/darkmatter2222/Rustwake/issues/117#issuecomment-6851321851
3. **Faithful sibling PASSES in BOTH runs**:
   `phone-dense/02-show-routes/showing restores working-rail ink (rail-band diff >= floor)`
   (RAIL_DIFF_MIN 10) — the real route-visibility signal — passed in run1 and
   rerun. Carve-out eligibility requires exactly this (sibling absent from both
   failedChecks sets).
4. **The #117 fix is provably inert on this check's forms**: phone scale 1.510 /
   desktop scale 3.065, both ≥ 1.4 (the fix only alters the phoneland pick path).

The frozen probe was left **VERBATIM** (blob unchanged); the classification,
runPattern and citation live only in `results.json` (`probes.logistics-59.carveOut`)
and this document. Per the charter, a one-run-only broad-census failure with a
passing faithful sibling is excluded, never filed as a regression defect.

## Frame mirror audit (`mirror.json`)

Recursive PNG census of all evidence frames: **count=422**, `allNonEmpty=true`,
`allDistinct=false`, **uniqueSha256=348**. The 74 duplicate files form 62
duplicate sha256 groups, fully classified and **benign** (`other=0`):

| Class | Groups | Explanation |
| --- | --- | --- |
| crossRunLogistics | 52 | logistics-59 run1 vs verbatim rerun produce byte-identical renders for unchanged steps. |
| crossBrowserAccess | 5 | Chrome vs Edge identical simple/static access-66 frames. |
| withinProbeStatic | 5 | home-62 after-reset == fresh-gate (phone+desktop); research-58 fresh entry-gate before == after (phone+desktop; probe's own audit marks desktop-fresh/phone-fresh distinct=false); return-61 phone-zero boot before == after == reload (byte-equal reload assertion). |
| other | 0 | none unexplained. |

Every probe's **own** `frameAudit.ok=true` (each probe audits distinctness within
its own meaningful capture set). The consolidated `allDistinct=false` is expected
once cross-run / cross-browser / static captures are pooled; it is NOT a defect.
Each frame entry records sha256 + PNG IHDR dimensions + bytes + nonEmpty.

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
5. **home-62** uses a vite DEV server (src at HEAD == 3fd883c9 src), not the preview
   dist; all other probes use the verified preview build.
6. **Local re-run only**: the live deployment (https://home.darkmatter2222.com/rustwake/)
   was NOT exercised here; coordinator served-verify is a separate step. The
   deployed Linux LF `index.html` artifact is authoritative over the local Windows
   CRLF variant (1-byte residual documented in `build-verify.json`).
7. **GitHub Project 1 membership UNVERIFIABLE** with this token (lacks
   `read:org` / `read:project`); no membership or project status is claimed.
8. The rerun-only broad-census carve-out is an **evidence-layer adjudication**
   with an independent cited baseline control; the frozen probe itself still
   contains the unfaithful timing-dependent check (left verbatim by charter).

## Reproduce / prove committed == ran

```
node tests/ui/regression-68.evidence/probe.mjs restore    # restore overwritten committed receipts
node tests/ui/regression-68.evidence/probe.mjs frames     # recursive frame census -> mirror.json
node tests/ui/regression-68.evidence/probe.mjs aggregate  # per-probe summaries + defects -> results.json
node tests/ui/regression-68.evidence/probe.mjs prove      # git hash-object --path == git rev-parse HEAD:<file>
node tests/ui/regression-68.evidence/probe.mjs all        # restore + frames + aggregate + prove
```

`prove` exits non-zero if any committed evidence file differs from what ran
(this run: `PROVE committed==ran true`, probe.mjs blob
`4a029971e615e01cf6231ca53036da282b9744bd`).
`restore` re-checks out the probes' original committed evidence
(`save-63.evidence.json`, `home-62.evidence.json`, `return-61.results.json`,
`work/evidence/UI-RESET-65/seeds.json`) so this PR adds **NEW** evidence only.
The reused #58/#59/#60/#61/#62/#63/#66/#67 probes were run **verbatim** (never
re-authored; frozen blobs verified unchanged); fresh results + frames were copied
into `<probe>/` subdirectories here, then the originals restored.

## Scope guardrail

Evidence-only. `git diff 3fd883c94d59f2772fc92118c7caf6d4d889887f..HEAD -- src/`
is EMPTY. No sim / engine / save / geometry / a11y-CSS change. `pnpm-lock.yaml`
never staged. reg-68b did **NOT** merge any PR, declare gates, flip issue labels,
close issues, set status:done, or claim deployment — those are coordinator-owned.
This PR stays **DRAFT** for independent QA (qa-68) at the exact head SHA;
coordinator served-verify and the qa-68 review are the next steps.
