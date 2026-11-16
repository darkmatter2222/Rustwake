# Developer handoff — #151 G1 first-playable, pass 14 (CHRM-002 fix evidence + docs)

- Role: **developer (pass 14)**, non-vision lane. Numeric/geometric evidence only. **No visual-fidelity claim, no ACCEPT/REWORK verdict, no merge, no ready-for-review, no main push, no closure of #151.** PR #227 stays **draft**, body "Part of #151".
- Worktree: `C:/Users/ryans/AppData/Local/Temp/rw-qwen/rw-151`, branch `rw/151`. Main worktree `C:/Users/ryans/source/repos/Rustwake` untouched. Only child session (coordinator + this = 2/5); no delegation.
- **Scope: bounded mechanical completion only.** The CHRM-002 fix was already committed at `99af746` and independently verified genuine / guardrail-compliant by the coordinator. This pass did **not** re-design or re-litigate the fix; it closed the census served-bundle provenance gap, re-ran all evidence, reconciled the doc, and published.

## Heads (triple-binding)
- **Fix head: `99af746fca5ea6b1195e87b06d3385aeb64fae18`** — the CHRM-002 `src/` fix (coordinator-verified).
- **Measurement head: `7b652c40afefa07dc5132e29ef9647d44b3e2b7c`** = `99af746` + a single **`scripts/`-only** commit adding a served-bundle identity assertion to `scripts/measure-legibility.mjs`. `git diff 99af746 7b652c4 -- src tests` is **empty**, so every measurement is valid for the fix. Committed FIRST so census/probe `baseSha` == committed head.
- **Publication head:** the commit carrying this handoff + the reconciled doc + re-run evidence (on top of `7b652c4`; `git diff 7b652c4 <publication head> -- src tests scripts` is **empty**). **PR #227 `.head.sha` is the authoritative review head** (local == origin == PR, verified at push).

## The fix (read-only this pass; two info-preserving levers, no guardrail weakened)
1. **Spec-6.4 hint step-back** — `src/ui/styles.css` adds `.text-large .objective__hint { display:none }`; `src/ui/Hud.tsx` gives the phase-hint span `status-line objective__hint` while the **numbers/shortfall line keeps plain `status-line`** (need/have/word stays visible at every scale).
2. **Shortened primaries** — `src/game/content/strings.ts`: `card.upgrade` → "Upgrade a machine: speed or power.", `step.fork` → "Upgrade {machine} · {cost}" (price + dock outcomes retained). Honest test pins updated (`tests/ui/app.test.tsx`, `tests/ui/fork-ui.test.tsx`).
- **Reachability linchpin (verified):** `objectiveFor` (`src/ui/text.ts:77`) returns ONLY `card.*`/`step.*`/`reader.objective`; `objective.research` is a HINT via `suggestedAction` (`offline.ts:92`) → `hintFor` → the PHASE slot (`App.tsx:1348`), `display:none` at text-large. So the probe's `absoluteWorst` (research string painted into the PRIMARY slot) is **genuinely unreachable** — correctly excluded from the `anyOverCap` gate, still reported as `syntheticOverCap`.
- **Cap (42%), leading (1.2), font sizes / px ladder [12,15,16.2,21.6] / 1.32x tier / 12px price / 4.5 AA — all unchanged.** No floor/threshold/check weakened; UNKNOWN never promoted; no pass fabricated.

## Gates (real exit codes, at `7b652c4`)
- `npm run build` **0** — entry `assets/index-Cvs8KQfj.js` **868488 B raw / 232138 B gzip**, sha256 `357857e41e5b57308b5845c945dadc46a60be72547f4f1f711b44a33493ae87e`; CSS `assets/index-BVohK8qu.css` 66873 B sha `55ecfe0d08ecd86df1c6f66ba398e9abc6f8c880884f713cc97dcca75dfd9635`. (Content sha differs from pass-13's `8c25322c` because the two shortened strings changed the JS.)
- `npx tsc --noEmit` **0** — no diagnostics.
- `npx vitest run` (PLAIN, no worker flags) **0** — **112 files / 1517 tests passed**, 0 failed. No `bench.test.ts:87` flake, no rerun, nothing weakened.

## U03 — NUMERIC-MET + PENDING-VISUAL (census green; CHRM-002 FIXED)
Census re-run to completion: `work/development/UI-004-g1/legibility-census.json`, `baseSha 7b652c4`, `url :4174`, generated `2026-11-15T17:03:49.029Z`. **`u03AllPass: true`, `floorFailures: []` (0), 0 pageErrors.** Floors verbatim **`{dockCostPx 12, aaRatio 4.5, tapTargetPx 44, cardFillPct 42}` — unchanged.** 8 viewports × 4 scales [1,1.25,1.5,2] × 15 rows = **480 readings / 120 rows / 32 cells**; monotonic **120/120**, noPageScroll **32/32**, coreActionPass **32/32**, u03Pass **32/32**; **max card fill 21.548%**, **minTargetPx 44**, **0 clipped labels**; 16/32 informational +1px overflow cells (not gated, not clipped — recorded, not claimed "no overflow").

**CHRM-002 worst-case probe re-run — FIXED.** `work/development/UI-004-g1/chrm002-worst-case.json`, `baseSha 7b652c4`, 360x640 dpr2 @2.0, cap 42, generated `2026-11-15T17:04:10.323Z`, 0 pageErrors:
- **`anyOverCap: false`** — every genuinely reachable state ≤ cap.
- baseline (no shortfall) **33.125%**; max reachable sweep **37.173%**; real refused-tap at scale 2 **37.173%** (numbers line 3 boxes, hint 0 boxes at text-large).
- **worst reachable card 237.96 px = 37.181%**, **30.84 px headroom** under the **268.8 px** cap (42% of 640).
- `absoluteWorst` **42.961%** is **synthetic, `reachable: false`** (`syntheticOverCap: true`, excluded from the gate) — research hint painted into the primary slot, which the shipped UI never does at text-large.
- Pass-13 defect (reachable 45.269% > 42%, absolute bound 51.057%, `anyOverCap: true`) is **resolved**; preserved as history in the doc.

## Served-bundle provenance (pass-14 gap CLOSED)
BOTH instruments now self-assert served-bundle identity: fetch served `index.html` → resolve entry chunk ref → fetch chunk → sha256+bytes == on-disk `dist` asset, **abort on mismatch**. The probe already did; `scripts/measure-legibility.mjs` now does too (mirrors the probe; `node --check` passed). Persisted in `legibility-census.json.servedBundleProvenance` and `chrm002-worst-case.json.provenance`: served entry == dist entry **`assets/index-Cvs8KQfj.js`**, sha `357857e4…`, **868488 B both**, **`identical: true`**. `census-provenance.txt` pass-14 section appended (pass-9 / pass-13 preserved). This closes the gap where `baseSha` alone came from git, not the served bundle.

## Provenance / safety
Own preview on verified-free **:4174** (PID **3904**, `vite preview --strictPort 4174`). **:4173 held by rw-217 PID 10320 and :4175 PID 11532 — both left running, not touched.** Only this pass's own preview (3904) stopped at end. No global permission/provider/credential change.

## Artifacts committed this pass (on top of `7b652c4`)
`docs/vision/evidence/151-first-playable.md` (pass-14 binding; pass-13/pass-9 preserved as history), `work/development/UI-004-g1/{legibility-census.json, chrm002-worst-case.json, census-provenance.txt, captures/*.png}` (11 re-rendered census PNGs), and this handoff. The `scripts/measure-legibility.mjs` assertion was committed FIRST as `7b652c4`. `chrm002-probe.mjs` re-run, **not edited**.

## What remains (owed — not waived)
1. **Independent QA + product verdicts** on the immutable PR head (not the author's claim); re-run build/typecheck/vitest + both harnesses + probe with the served-bundle assertion.
2. **P01/P02/P03 + keyboard walkthrough re-measure at the final head** (still cited at earlier heads).
3. **Product raw-vs-gzip ruling** on the 6 P03 byte-budget UNMET: entry **868488 B raw / 232138 B gzip** vs the **233000 B** ceiling — gzip **under by ~862 B**, raw **over**; P03 budget measures decoded/raw bytes. Pre-existing at live main `17143737` (~840 KB raw), not a pass-14 regression. File/rule bundle-size/code-split; budgets must not be lifted silently.
4. **16/32 informational +1px overflow rows** recorded (not gated); P03 stale Menu target (4 UNKNOWN) + Research fixture gap (2 hardFailures) re-target/seed.
5. **Sponsor visual ACCEPT** at https://home.darkmatter2222.com/rustwake/ (V01/V02/V04 + visual halves of V03/V05/V06/U03); **release-engineer merge + main CI/CD + served-SHA deployment receipt** (R01).

## Limitations
Headless Chromium **emulation, not a physical phone (#190)** — host-relative numbers, no real touch/CPU/GPU/thermal/mobile-network. **Numeric/geometric only** — no visual-fidelity, readability or motion claim; the shortened primaries + hint step-back at 200% text must be eyeballed by a vision-capable reviewer. Generated references are style targets, not implementation proof; all pixels cited come from the running build.

**U03 is NUMERIC-MET + PENDING-VISUAL; G1 still cannot pass (4 PARTIAL rows E08/P01/P03/R01 + QA/product APPROVE + merge/CI/CD + sponsor ACCEPT). Done does not mean deployed.**