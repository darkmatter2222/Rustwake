# Developer handoff — #151 G1 first-playable, pass 13 (recapture + CHRM-002)

- Role: **developer (pass 13)**, non-vision lane. Numeric/geometric evidence only. **No visual-fidelity claim, no ACCEPT/REWORK verdict, no merge, no ready-for-review, no main push.** PR #227 stays **draft**, body "Part of #151".
- Worktree: `C:/Users/ryans/AppData/Local/Temp/rw-qwen/rw-151`, branch `rw/151`. Main worktree untouched. Only child session (coordinator + this = 2/5); no delegation.
- **Measurement head: `cdd87e26b5917a71ed21117bda733251575e4787`** (local == origin == PR #227 `.head.sha`, verified). Capture stamped `headSha e745595e75bb3b67eddde2318de95980f11e535f`; `git diff --name-only e745595..cdd87e2` is **artifacts-only** (docs/evidence + docs/screenshots; no src/tests/scripts), so the capture is valid for `cdd87e2` and was **verified, not re-run**.

## Gates (real exit codes)
- `npm run build` **0** — entry `index-Cvl4BdAr.js` **868472 B raw / 232129 B gzip**, sha256 `8c25322cd871fe0426df1f8b0eaa9efb094fc3cbb1c62aac88ad8d6793b95118`.
- `npm run typecheck` **0** — no diagnostics.
- `npx vitest run` (plain, no worker flags) **0** — **112 files / 1517 tests passed**, 0 failed, 10.91 s. No OOM, no `bench.test.ts:87` flake, no rerun, nothing weakened.

## V05 — MET (numeric) + PENDING-VISUAL
Verified capture `docs/evidence/151-g1-captures.json`: **104/104**, `pass: true`, 0 findings. Atomic method (`assemblyView.userData.progressTicks` stamped same sync as `mesh.visible`) resolves the pass-9 live-vs-persisted divergence; stage crops 5-distinct on phone **and** desktop. Roundtrip invalid-import economy byte-identical, tick drift **0**, applyClicked true. Visual half PENDING-VISUAL.

## U03 — PARTIAL (census green; CHRM-002 real defect)
Census re-run to completion: `work/development/UI-004-g1/legibility-census.json`, `baseSha cdd87e2`, `url :4174`, served entry asserted == `dist/index.html`. **`u03AllPass: true`, 0 floorFailures**, 480 readings / 120 rows / 32 cells, monotonic 120/120, noPageScroll 32/32, coreActionPass 32/32, max card fill **29.644%** (phone360@2), minTargetPx **44**, 0 clipped labels. Floors unchanged (12/4.5/44/42). Pass-9 U03-1/2/3 fixed. 16/32 informational +1px overflow rows (not gated, not clipped) — recorded, not claimed "no overflow".

**CHRM-002 (mandatory worst-case re-measure) — REAL DEFECT.** `work/development/UI-004-g1/chrm002-worst-case.json` + `chrm002-probe.mjs`, `baseSha cdd87e2`, 360x640 dpr2 @2.0, cap 42:
- baseline (no shortfall) 263.81px = **41.221%**
- any refused-tap shortfall (numbers line → 3 boxes; even minimal `need 30 scrap · have 5`, 70 chars) 289.72px = **45.269% > 42%**
- absolute upper bound 326.77px = **51.057%**; `anyOverCap: true`, 0 page errors.
- Reachable via `restingLine` (text.ts:286) appending ` · Last {detail}` on any refused tap (`labelForReject`, App.tsx:1905) while machines run. Census W-3 cadence never refuses a tap, so it misses this state.
- Cause: pass-10 status-line leading **1.1→1.2** fixed +1px overflow rows but grew each wrapped box ~2.16px. **Cap NOT lifted, leading NOT reverted** (reverting re-breaks overflow rows). **No pass fabricated.** U03 not MET — **fix pass owed**.

## P03 — PARTIAL (no budget lifted)
Entry 868472 B raw / 232129 B gzip vs 233000 B ceiling: gzip under (871 B), raw over. P03 budget measures decoded/raw bytes → 6 byte-budget UNMET stand. Live main `17143737` also ~840 KB raw (pre-existing). **Product must rule raw-vs-gzip** / file code-split. P01/P02/P03 not re-run.

## Provenance / safety
Own preview on verified-free **:4174** (PID 34336); **:4173 held by rw-217 PID 10320 — left running**. Served entry asserted byte-identical to dist + capture (`census-provenance.txt`, pass-13 appended, pass-9 preserved). Only own preview stopped at end.

## Artifacts committed this pass
`docs/vision/evidence/151-first-playable.md` (pass-13 binding; pass-9 integrity record preserved), `work/development/UI-004-g1/{legibility-census.json, chrm002-worst-case.json, chrm002-probe.mjs, census-provenance.txt, captures/*.png, *-p13.log}`, this handoff, and prior handoffs `dev-151-p10-fix.md` / `dev-151-p12-crop.md`.

## What remains (owed)
1. **CHRM-002 fix pass** — keep reachable 3-box objective state ≤42% without lifting cap or reverting leading; re-run census + CHRM-002 probe.
2. Independent QA + product verdicts on immutable head; P01/P02/P03 + keyboard re-measurement; raw-vs-gzip ruling.
3. Sponsor visual ACCEPT; release-engineer merge + main CI/CD + served-SHA deployment receipt.

**G1 cannot pass while CHRM-002 is open (U03 PARTIAL). Done does not mean deployed.**