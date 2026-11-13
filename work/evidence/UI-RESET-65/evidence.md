# UI-RESET #65 — developer evidence (G3 feedback / motion / notification unification)

- **Issue:** https://github.com/darkmatter2222/Rustwake/issues/65
- **Draft PR:** https://github.com/darkmatter2222/Rustwake/pull/114 (`Refs #65`, isDraft=true)
- **Role / persona:** developer | dev-65b (resuming dev-65 after the prior session hit the host turn cap mid-evidence; the src implementation was already committed by dev-65 and was NOT re-authored here).
- **Branch:** `rw/65-feedback`
- **Code head under test (src):** `e7c746efd396cc293d736feb88118b65ff875994` — `git diff e7c746e HEAD -- src` is **empty** (no src change since).
- **Evidence head (this commit series):** `347bf5921b9b911938842f3fe34a083b2fe73213` (probe-only fix commit).
- **Probe SHA256 (committed blob == file that ran):** `3cffafc4067c4a92afda870df3cb0631887f1250292dc1b9181f80619c913795`
- **Served from:** THIS branch's own `pnpm build` via `vite preview` on a fresh local port **http://127.0.0.1:4166/** (HTTP 200 verified before probing). **Never** the live deployment — live parity is the coordinator's POST-MERGE job; this file makes **no deployment claim**.
- **Browser:** headless Chrome `C:/Program Files/Google/Chrome/Application/chrome.exe` (playwright-core 1.65.0).
- **Run generatedAt:** `2026-11-13T02:53:38.073Z` (results.json; seeds.json regenerated 02:46:14.972Z by validate-fixtures.ts, then consumed by this run — fixture envelopes byte-identical, only the metadata timestamp differs).

## Method (no vision, real UI only)

All evidence is **programmatic headless-Chrome**: DOM presence/text, geometry, computed style, persisted-state read-back, console/page-error capture, canvas pixel checks, and a full-frame mirror audit (per-frame SHA256 + PNG dimensions + non-empty). **No human vision claims.** Every acceptance ACTION is a real UI click/tap through `dispatch -> applyCommand`; machine selection taps the canvas at the cell's computed screen point guarded by `document.elementFromPoint === "CANVAS"`. Agent playtests are labelled **AGENT** (not human playtest).

**Audio (c4):** headless Chrome **cannot listen**, so the Web Audio API boundary is instrumented via `addInitScript` (AudioContext ctor + createGain/createDynamicsCompressor/createOscillator/createBufferSource + AudioNode.connect). The master is the gain feeding the compressor; `masterLevel` is read live from the real gain node — the browser equivalent of `audio.ts graphSnapshot()`. The full module node table + mute are independently asserted by `tests/game/audio.test.ts` at the same SHA. This is an honest proxy, not a listening test.

### Fixture scrutiny (a–d)

- **(a)** The only state mutation is SETUP seeding via the game's OWN save envelope (FNV-1a checksum recomputed = `save.ts checksum()`). Seeds come from `seeds.json`, produced/validated by `validate-fixtures.ts` using the game's own `encodeSave/decodeSave/repairRegistration/validateSim`. No src is touched; every acceptance action is a real UI click/tap.
- **(b)** Method documented in `probe.mjs` header, `validate-fixtures.ts`, `seeds.json`, `results.json`, this `evidence.md`, and `audit-matrix.md`.
- **(c)** Sim validation is NOT weakened: every injected envelope passes the game's full `decodeSave/validateSim` on load. No invariant bypassed.
- **(d)** No action faked by direct state injection; `localStorage` is read ONLY as a mirror of the game's own persistence (written on every ok dispatch).

**Fixture validator receipt:** `pnpm exec tsx work/evidence/UI-RESET-65/validate-fixtures.ts` → **FIXTURE VALIDATION: PASS** (14 ok lines: validateSim(mature)===null, repairRegistration idempotent, validateSim(repaired)===null, decodeSave matureNow/matureOld/settings-variant/brokeNow ok, machine-count + lastSeenMs round-trips, broke credits===0). Exit 0.

## Ladder receipts (worktree root, code head e7c746e)

| Rung | Command | Result |
| --- | --- | --- |
| Typecheck | `pnpm exec tsc --noEmit` | **exit 0** |
| Content/behaviour | `pnpm validate` | **exit 0** — 15 resources / 8 blueprints / 12 recipes / 3 research; 0 content violations; behaviour firstDrone=379 firstResearch=527 tick=18298 machines=8 links=18 drones=4 batches=1838 credits=157 nodes=3, 0 violations |
| Unit suite | `pnpm exec vitest run --minWorkers=4 --maxWorkers=4` | **exit 0** — **60 files / 746 tests passed** (both worker caps required: 32-CPU host OOMs otherwise) |
| Named #65 suites | `pnpm exec vitest run --minWorkers=4 --maxWorkers=4 tests/ui/feedback-65.test.tsx tests/game/audio.test.ts` | **exit 0** — feedback-65 **9 tests**, audio **26 tests** = **35 passed / 2 files** |
| Build | `pnpm build` (`tsc --noEmit && vite build`) | **exit 0** — 124 modules transformed |

> Environment note: the worktree's `node_modules` symlinks (top-level AND `.pnpm` internal) had been pruned. Repaired locally with `pnpm install --frozen-lockfile --offline --force --ignore-scripts` (232 packages relinked from the existing store, **0 downloaded**, lockfile unchanged). `pnpm-lock.yaml` was **never staged**. This is a local execution-environment repair, not a source/dependency change.

### Build / preview entry receipts (ladder build == probed preview, byte-identical)

| Asset | Bytes | SHA256 |
| --- | --- | --- |
| `dist/assets/index-B_ACfUcJ.js` (entry) | 190857 | `442a297fbfc21a028ae295ae6810b5f41fe89c3c757995d45c463dc8300b8c59` |
| `dist/index.html` | 1368 | `2c7ddad5abc6a460a5bd609b3d802d641688701a9eb5c11323304c68274cb5be` |
| `dist/assets/index-DrCUIU3_.css` | 60254 | `6b45109cb0714badc14e721a3a39c5a56efc9fd81be9d4f28bae8dc5dd5f875b` |

The fresh ladder `pnpm build` reproduces the exact entry hash/bytes served by the preview on :4166 that the probe drove — so the evidence is against this branch's build at code head e7c746e.

## Clean results contract (results.json)

- `buildSha` = `e7c746efd396cc293d736feb88118b65ff875994` ✓
- `frameAudit.ok` = **true**, **0** bad frames (dimsOk && hashOk && nonEmpty for every frame) ✓
- `frameAudit.distinctFramesPerForm` = **18/18 true** (phone/phoneland/desktop × opening/mature/error/reader/loading/motion) ✓
- `counts.frames` = **153** (≥150) ✓
- `counts.steps` = **80**, `counts.checks` = **277**, `counts.failedChecks` = **0** ✓
- `counts.blockers` = **0**, `counts.consoleErrors` = **0**, `counts.pageErrors` = **0** ✓
- `counts.audioEvents` = **24** (also `audioBoundary.events`) ✓

Forms: phone (390×844 dpr2, dock shell), phoneland (844×390 dpr2, rail shell), desktop (1920×1080 dpr1, rail shell). 6 states each = 18 form-state dirs.

## Acceptance criteria — VERIFIED / UNVERIFIED

All five criteria are **VERIFIED programmatically** against the real UI at code head e7c746e. Check counts (all passing):

| Criterion | Checks | Verdict | What was proven |
| --- | --- | --- | --- |
| **c1** press/selection/purchase/build/blocked/success linked to real command results | 30/30 | **VERIFIED** | Press wash + read-back receipts on salvage/repair/build/connect (opening) and build/sell/upgrade (mature); purchase/build/blocked/success states tied to real `applyCommand` outcomes, not injected state. |
| **c2** important errors persistent + GROUP repeated events (no toast spam) | 48/48 | **VERIFIED** | Connect refusal grouped (`data-count`, `::after ×N`, bare live-region text); broke seed (credits=0) deterministic upgrade shortfall → grouped toast + persistent `Last …` resting-line tail + short receipt. |
| **c3** restrained motion + reduced-motion alternative; never shift an action under a finger | 39/39 | **VERIFIED** | pressProbe geometry shows no layout shift while held; motionLoop proves OS media query AND in-app toggle both mirror `:root[data-reduced-motion="true"]`, preference persists to save and re-mirrors after reload; `?ui48` primitive `transition:none`. |
| **c4** integrate EXISTING sound cues with mute/settings | 33/33 | **VERIFIED (boundary proxy)** | Real Settings mute toggle drives master gain **0.9 → 0 → 0.9** on all 3 forms (pre-mute/muted/unmuted events, voices=9), `aria-pressed` + persistence; node table independently asserted by `audio.test.ts`. **Limitation:** headless cannot listen — verified via instrumented Web Audio boundary + unit suite, not audible output. |
| **c5** empty/loading/locked/error/reader-tab audit | 37/37 | **VERIFIED** | `audit-matrix.md` deliverable + loadingLoop (catch-up reconcile line + return report), readerLoop (two tabs, lease, takeover blocked→promote), locked rail reasons, empty-yard checks. |
| other (setup/geometry/fixture/console guards) | 90/90 | **VERIFIED** | Supporting structural guards. |

**Total: 277/277 checks pass; 0 failedChecks; 0 blockers.**

### c4 mute transition receipt (master gain, all forms)

```
phone-mature/pre-mute   master=0.8999999761581421 voices=9
phone-mature/muted      master=0                  voices=9
phone-mature/unmuted    master=0.8999999761581421 voices=9
phoneland-mature/pre-mute master=0.8999999761581421 voices=9
phoneland-mature/muted    master=0                  voices=9
phoneland-mature/unmuted  master=0.8999999761581421 voices=9
desktop-mature/pre-mute master=0.8999999761581421 voices=9
desktop-mature/muted    master=0                  voices=9
desktop-mature/unmuted  master=0.8999999761581421 voices=9
```

Distinct masterLevel values across all 24 audio events: `{0.8999999761581421, 0}` — exactly the unmuted/muted pair.

## Findings (carried; none blocking, none a #65 src defect)

1. **steel-reserve-floor** — *intentional-design-not-defect.* Mature fixture holds exactly 10 steel and `reserveFloor=10`, so `sellableAmount(steel)=0`; the sell step sells the dearest genuinely-sellable face through its real Max preset + Sell. Carried from #57. Source: `src/ui/store/model.ts tradeFaces`; `src/game/simulation/commands.ts sellableAmount`.
2. **dock-context-sensitivity** — *intentional-design-not-defect.* With a machine selected at tutorial≥8 the dock renders the upgrade-branch row; tapping an empty yard cell returns it to rest. Documented one-selection dock model. Carried from #57. Source: `src/ui/App.tsx pickTarget`; `src/ui/Hud.tsx DockButtons`.
3. **belt-cost-on-guided-connect** — *minor-friction-not-blocking.* The guided Connect face does not pre-print the belt scrap cost, so the first tap at 0 scrap refuses with a grouped shortfall toast + persistent Last tail; the drone banks scrap and the same primary connects. Used here as the deterministic c2 grouping demonstration. Out of #65 scope to re-price (BELT-001 / #57 finding 4). Source: `src/game/simulation/commands.ts connectRoute`; `src/ui/App.tsx commit/notify/setLastReject`.

## Probe fixes this session (probe-only; no src touched)

Commit `347bf59` `test(UI-RESET-65): fix sell-step dock rest + catch-up reconcile capture`:

- **Catch-up reconcile capture (loading):** `createStore()` runs at `main.tsx` module load before the gate; with a `networkidle` wait the worker adopts before Begin, so the reconcile `<p>` (rendered only when `started && reconciling`) never appeared. Fixed by navigating with `waitUntil:"domcontentloaded"` and a robust `MutationObserver` that records the FIRST non-empty `.reconcile` text (added-node scan + characterData + capture). All loading reconcile checks now pass.
- **phoneland mature upgrade selection:** landscape geometry missed the furnace tap. Fixed with a bounded retry (≤4) verifying the `.panel--stack` `aria-label` matches `/Furnace/i`, with `resetView` between tries.
- **phone mature sell dock-rest:** the dock branch row is driven by `nextYardStep(state)` (upgrade), not selection, so deselect alone left the branch row up and hid the Store face. Fixed by **reordering upgrade BEFORE sell** in matureLoop: the new furnace lv1 is the only affordable upgrade; spending ~50 of 82 credits leaves no affordable upgrade, so the ladder falls through to sell/build/research and the Store face returns after deselect. New steps `05-upgrade-furnace` then `06-sell-resource` (openStore → `.store-trade` data-resource → Max preset → Sell).
- **Frame-audit hygiene:** `main()` now `rmSync(FRAMES, {recursive,force})` before `mkdirSync`, so the one-pass mirror audit only sees the current run's captures. Previously, orphan frames from the pre-reorder step names (`05-sell-resource`/`06-upgrade-furnace`) had no `frameMeta` entry → `hashOk=false` → `frameAudit.ok=false` at 165 frames. After the fix: **153 frames, auditOk=true, 0 bad frames.**

These are probe/test-harness corrections only. **No genuine src defect was found**; no file under `src/` was edited (forbidden paths respected: simulation, economy/content balance, persistence, workers, `src/app/store.ts`, gameplay expansion). #64 `commandEpoch` (App.tsx:97–99), `showResearch` gate, and dedup are preserved (src diff empty).

## Limitations / handoff notes

- **AGENT playtest, not human.** All playthroughs are labelled AGENT; no human vision or listening was used.
- **Audio is a boundary proxy.** Headless cannot listen; c4 is verified via the instrumented Web Audio graph + `audio.test.ts`, not audible output.
- **No deployment claim.** Evidence is against this branch's own preview build on :4166. Live served parity (https://home.darkmatter2222.com/rustwake/) is the coordinator's POST-MERGE responsibility; this PR is a draft and has not been merged or deployed.
- **Belt re-pricing out of scope** (BELT-001 / #57); finding 3 is documented friction, not a #65 blocker.
- Independent QA/product verdict at the current head SHA and release-engineer merge are still required per the GitHub delivery contract; this evidence does not self-accept.

## Deliverables in this directory

- `probe.mjs` (probe-only; SHA256 above), `validate-fixtures.ts`, `seeds.json`, `audit-matrix.md` (c5 matrix) — tracked.
- `results.json` (authoritative machine evidence), `frames/` (153 PNG mirrors), `evidence.md` (this file).
