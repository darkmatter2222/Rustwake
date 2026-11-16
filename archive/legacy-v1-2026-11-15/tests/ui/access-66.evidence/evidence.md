# UI-RESET #66 — developer evidence (G4 accessibility + desktop input + landscape-ts2 shell-geometry fix)

- **Issue:** https://github.com/darkmatter2222/Rustwake/issues/66
- **Draft PR:** https://github.com/darkmatter2222/Rustwake/pull/115 (`Refs #66`, isDraft=true)
- **Role / persona:** developer | dev-66b (resuming dev-66 after the prior session hit the ~150-turn host cap near completion; the src implementation was already committed by dev-66 and independently verified in-scope by the coordinator, and was **NOT re-authored** here).
- **Branch:** `rw/66-access`
- **Code head under test (src):** `e12578ac8bcaab81a53d1e2fbd1fbb0ab3227eca` — 3 commits (`eb237c9`, `f977e0d`, `e12578a`) on base `fc051406` (#65). `results.json.buildSha == e12578a`.
- **Evidence head:** this commit — an **EVIDENCE-ONLY child of `e12578a`** (no src change). `git diff e12578a <evidence-head> -- src` is empty; the diff touches only `tests/ui/access-66.evidence.mjs` and `tests/ui/access-66.evidence/`. This mirrors the #65 split (PR head `aefe465a` / code head `e7c746e`).
- **Probe SHA256 (committed blob == file that ran):** `CB357D266FA702D8401343DB8E65AD99DCA4B57487F5408B4975A03C95140A6C` (`tests/ui/access-66.evidence.mjs`, committed byte-identical; its scratch `OUTDIR` was **not** edited).
- **Served from:** THIS worktree's own `pnpm build` at `e12578a` via `vite preview` on local 127.0.0.1 (access66 matrix: **http://127.0.0.1:4195/**; #63 regression re-run: **http://127.0.0.1:4196/**, the probe spawns its own `--host 127.0.0.1 --strictPort` preview). **Never** the live deployment — live parity is the coordinator's POST-MERGE job; this file makes **no deployment claim**.
- **Browser:** headless Chrome `C:/Program Files/Google/Chrome/Application/chrome.exe` (playwright-core).
- **access66 run generatedAt:** `2026-11-13T04:58:50.935Z` (results.json).

## Method (no vision, real UI only)

All evidence is **programmatic headless-Chrome**: DOM presence/text, geometry (`getBoundingClientRect`), computed style, persisted-state read-back, console/page-error capture, canvas pixel checks, and a full-frame mirror audit (per-frame non-empty + distinct). **No human vision claims.** Every acceptance ACTION is a real UI click/tap/keypress through the game's own `dispatch -> applyCommand` path; seeds use the game's own `encodeSave`. Agent playtests are labelled **AGENT** (not human playtest).

**Audio:** headless Chrome cannot listen; audio is verified only as a headless boundary proxy (and the existing unit suite), not audible output.

## Scope (4 files, +183/-3 vs main — all in scope, no forbidden paths)

| File | Change |
| --- | --- |
| `src/game/content/strings.ts` (+5) | Adds `"aria.canvas": "Yard world view"` — a UI accessible-name string, **not** economy/balance. |
| `src/ui/App.tsx` (+6) | Canvas `role="img"` + `aria-label={t("aria.canvas")}` **only** (~line 1113). #64 `commandEpoch` (~97/99) **untouched**. No measurement change. |
| `src/ui/hud/hud.css` (+10) | Objective touch targets 36→44px + `padding-right` 76→92px (spec 6.2 ≥44px). |
| `src/ui/styles.css` (+165) | `.objective__btn` 44px width floor + **4 shell-geometry `@media` blocks** (below). Two-panel stacks preserved; #65 toast/reduced-motion rules **not** removed. |

### The 4 shell-geometry `@media` blocks (apply at EVERY text scale, ts1 AND ts2)

1. **Short-landscape gutter** — `(min-width:600px) and (max-height:460px)`: single inspector takes the full-height right gutter; lead bounded left of the gutter with its own themed scroller.
2. **Laptop rail** — `(min-width:1200px)` and height 461–900px: rail composition bounds the lead so the inspector fits.
3. **Phone column** — `(max-width:599px)`: phone column lead bounded so the single inspector fits.
4. **Shortest phone** — `(max-width:599px) and (max-height:700px)`: extra bound for the shortest phone column.

These are **not** gated on `.text-large` — they apply at every text scale on their bands, which is what fixes the routed phone-landscape-ts2 defect without regressing ts1.

### Paint-truth (why no App.tsx measurement change is needed)

`App.tsx chromeInsets()` reads `lead.getBoundingClientRect().bottom` (~117–120) and the `--shell-inspector-top` effect uses a `ResizeObserver` on `.hud__lead` (~433–443). The CSS lead `max-height` bounds therefore flow automatically into `inspector-top` + camera insets. The compositor reads the live bounded lead box; the fix is pure CSS geometry + canvas aria.

**Preserved:** #64 `commandEpoch` and #65 toast grouping / reduced-motion. No sim/engine/commands/economy/defs/research/save-schema/lease/worker/store/gameplay changes.

## Ladder receipts (worktree root, code head e12578a)

| Rung | Command | Result |
| --- | --- | --- |
| Typecheck | `pnpm exec tsc --noEmit` | **exit 0** (`receipts/typecheck.log`) |
| Content/behaviour | `pnpm validate` | **exit 0** — 15 resources / 8 blueprints / 12 recipes / 3 research; 0 content violations; behaviour firstDrone=379 firstResearch=527 tick=18298 machines=8 links=18 drones=4 batches=1838 credits=157 nodes=3, 0 violations (`receipts/validate.log`) |
| Unit suite | `pnpm exec vitest run --minWorkers=4 --maxWorkers=4` | **exit 0** — **60 files / 746 tests passed (746)** (both worker caps required: 32-CPU host OOMs otherwise) (`receipts/vitest.log`, committed whole) |
| Build | `pnpm build` (`tsc --noEmit && vite build`) | **exit 0** — 124 modules transformed (`receipts/build.log`) |

### Build / preview entry receipts (ladder build == probed preview)

| Asset | Bytes | SHA256 |
| --- | --- | --- |
| `dist/assets/index-DMXDbGe_.js` (entry) | 190898 | `D19AD82EB924FC6C8BFEA2E42B10068C37E5941761F9BC9EC687853751FD73D5` |
| `dist/assets/index-Eo_6W0ie.css` | 61937 | `D3845BBE72D85DA6C74D158B573F81DDE6CDD3B76D20224FBA0FD6BCE797ABC8` |
| `dist/index.html` | 1368 | `40D4A5BE932DBBA0527C6FE0EE29861D05355CF14A50EDA9B40021CAE5F85C6E` |

The fresh ladder `pnpm build` at `e12578a` reproduces the entry hash/bytes served by the preview the probes drove (build.log reports 190.74kB / 61.94kB). Evidence is against this branch's build at code head `e12578a`.

## access66 results contract (results.json, buildSha e12578a)

- `buildSha` = `e12578ac8bcaab81a53d1e2fbd1fbb0ab3227eca` ✓
- `defects` = **[]**, `summary.defectCount` = **0**, `summary.defectKinds` = **[]**, `summary.cellErrors` = **0** ✓
- `summary.cells` = **16** (8 viewports × ts1/ts2), `summary.keyboardCells` = **3**, `summary.frames` = **17** ✓
- **Every cell** record/backup/replace `body.overflow` = **0**, `docScroll` = **0** ✓
- `mirror.count` = **17**, `mirror.allNonEmpty` = **true**, `mirror.allDistinct` = **true** ✓
- Contrast **9/9 pass** (normal text need 4.5:1, large text need 3:1; ratios 5.75–18.08) ✓
- `reducedMotion.ruleFound` = **true** (`:root[data-reduced-motion="true"] …` rule present), `probeFound` = true ✓
- Accessible names: canvas `role="img"` `aria-label="Yard world view"`; `unnamedDock`/`unnamedRail`/`unnamedIcon` = **0**; `chipsNonColor` = **true** (non-color status cues) ✓

Viewports (each ts1 AND ts2): phone-small, phone (390×844 dpr2), phone-large, phone-landscape (844×390 dpr2), tablet, laptop, desktop (1920×1080 dpr1), desktop-large.

### Keyboard — complete on 3 cells (phone-ts1, phone-landscape-ts1, desktop-ts1)

`tabbableCount` = 17 (all named); `tabReachedDock`/`tabReachedIcon`/`tabCycleReturns` = true; visible focus ring (outline 2px solid rgb(95,216,232)); menu opens + self-focuses, **Escape closes** (`menuOpenAfterEscape=false` is the pass condition) + `focusRestoredToOpener=true`; `digit3OpensStore`/`digit2OpensBuild`/`escapeClosesStore` = true; `inputSuppress.suppressed=true` (shortcuts suppressed in a focused textarea); **core loop** advances scrap via keyboard (245→250, `increased/changed=true`) AND touch (250→255). No keyboard traps.

### ROUTED DEFECT FIXED — phone-landscape-ts2 (844×390 dpr2, text scale 2)

Previously (main `fc051406`): lead grew past the 390px viewport, inspector body collapsed to a 1–94px band (record overflow 154px / backup 249px / replace 197px) — spec 6.4 "0px inner panel scroll" violated (#63 phone-landscape 383/394).

Now at `e12578a` (record / backup / replace all identical):
- lead bounded **height 240px** (left 110, top 8, right 510), own scroller (`leadScroll.oy="auto"`).
- inspector panel **full gutter height 374px** (left 516, top 8, right 836, bottom 382), `inspectorTop=254px`.
- panel **body 298/298, overflow 0** (`scrollHeight==clientHeight==298`, `scrollTop=0`).
- `worldBand` = **88** (>0), `docScroll` = **0**.
- `leadDockOverlapArea` / `leadPanelOverlapArea` / `dockPanelOverlapArea` = **0**.
- touch targets: record 18 / backup 20 / replace 19, `small=[]` (all ≥44px).
- `panelCascade.matchesCap=true`, `computedHeight=374px`, `consoleErrors=[]`.

## #63 FULL regression re-run at code head e12578a (evidence63-full.json)

Run with the tsx loader (the probe imports the game's TS source: `save.ts` → extensionless `defs`): `pnpm exec tsx tests/ui/save-63.evidence.mjs`, env `RW63_PORT=4196`, `RW63_SHA=e12578ac8bcaab81a53d1e2fbd1fbb0ab3227eca`. The probe spawns its own `vite preview --host 127.0.0.1 --strictPort` against this worktree's `dist`, drives the real UI, and seeds via the game's own `encodeSave`.

| Form factor | Assertions | Passed | Screenshots |
| --- | --- | --- | --- |
| phone (390×844 dpr2) | 394 | **394** | 16 |
| phone-landscape (844×390 dpr2) | 394 | **394** | 16 |
| desktop (1920×1080 dpr1) | 394 | **394** | 16 |
| mirror audit | 2 | **2** | 0 |

`headSha=e12578a`, **`failures=[]`**, exit 0, stderr empty. The **11 previously-failing phone-landscape-ts2 assertions now pass** (phone-landscape was 383/394 at main) and **nothing regressed** (phone/desktop stay 394/394; mirror every frame distinct + non-empty). The prior full run at `f977e0d` (before the 44px touch-target + canvas-aria commit) was also 394×3 + mirror 2/2; this re-run confirms the final code head `e12578a`.

> The probe overwrites the tracked `tests/ui/save-63.evidence.json`; it was restored (`git restore`) after the run so the only committed #63 artifact is this evidence dir's `evidence63-full.json`. The probe's full receipt + frames live in scratch `C:/Users/ryans/AppData/Local/Temp/rw-coord/save-63-evidence/`.

## Acceptance criteria (#66) — VERIFIED programmatically at e12578a

| Criterion | Verdict | Evidence |
| --- | --- | --- |
| Full core loop with keyboard AND touch; focus order/return, Escape, shortcuts, no traps | **VERIFIED** | keyboard 3 cells (above) + #63 core-loop assertions; coreLoopKeyboard/coreLoopTouch increased+changed. |
| Accessible names + semantic equivalents for canvas-only core actions; no per-tick announcement | **VERIFIED** | canvas role=img + aria-label "Yard world view"; unnamedDock/Rail/Icon=0; live region role=status (not per-tick). |
| ≥44px touch targets, contrast 4.5:1 normal, visible focus, non-color statuses, 200% text | **VERIFIED** | touch small=[] across cells; contrast 9/9; 2px focus ring; chipsNonColor=true; ts2 (200%) cells overflow 0. |
| Reduced motion, hover alternatives, keyboard-open menus, shortcut suppression in inputs | **VERIFIED** | reducedMotion ruleFound=true; menu keyboard open/Escape; inputSuppress.suppressed=true. |
| Record defects + exact evidence for all #43 viewports; blockers corrected | **VERIFIED** | 16 cells defects=[]; routed landscape-ts2 blocker fixed; 17 frames + receipts committed. |

## Limitations (honest)

- Playtests/geometry are **AGENT headless-Chrome** DOM/geometry/computed-style/console + canvas pixel checks — **not human vision**. No visual/aesthetic inspection is claimed.
- **Audio** is a headless boundary proxy, not a listening test.
- **Project 1 membership is unverifiable** with this token (lacks `read:project`); recorded, never invented. Milestone 1 membership is confirmed via the issue/PR REST API.
- No deployment claim: evidence is against this branch's own local preview only.

## Reproduction

1. `pnpm build` in this worktree at code head `e12578a` (produces `dist/assets/index-DMXDbGe_.js` / `index-Eo_6W0ie.css`).
2. **access66 matrix:** `node tests/ui/access-66.evidence.mjs` with `RW66A_PORT`/`RW66A_SHA` (defaults 4194 / `git HEAD`). The committed probe writes to its hardcoded scratch `OUTDIR` **`C:/Users/ryans/AppData/Local/Temp/rw-coord/rw-66/access66`** (`results.json` + `frames/`); `OUTDIR` was **not** edited (committed == ran). `results.json.buildSha == e12578a`. The artifacts in this dir are copies of that scratch run.
3. **#63 regression:** `pnpm exec tsx tests/ui/save-63.evidence.mjs` with `RW63_PORT`/`RW63_SHA`; spawns its own 127.0.0.1 preview, prints the summary JSON (captured here as `evidence63-full.json`), overwrites `tests/ui/save-63.evidence.json` (restore after).
4. Ladder: `pnpm exec tsc --noEmit`; `pnpm validate`; `pnpm exec vitest run --minWorkers=4 --maxWorkers=4`; `pnpm build`.
