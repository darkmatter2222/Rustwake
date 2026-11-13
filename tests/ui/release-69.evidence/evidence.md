# Release-69 evidence — dead CSS rule removal (`.muted-corner`)

- Role: **release-engineer** | persona **re-69**
- Issue: https://github.com/darkmatter2222/Rustwake/issues/69 (traceability contract: issue comment 6729682186)
- Sponsor goal: https://github.com/darkmatter2222/Rustwake/issues/43 (complete mobile AND desktop UI restart)
- Branch: `rw/69-release` (isolated worktree)
- Base (origin/main): `1ba05f28baff16e40d34f2c5426b819916c964e9`
- CODE head (src commit): `b774404382b05a918d4e77d9578a9cfb939aa93e`
- PR head: evidence-only commit on top of the CODE head (see PR; `git diff origin/main..HEAD -- src` is the cleanup only)
- Project: https://github.com/users/darkmatter2222/projects/1 | Milestone: https://github.com/darkmatter2222/Rustwake/milestone/1

## 1. Independent dead-artifact re-confirmation

Before editing, re-confirmed repo-wide that `.muted-corner` is dead:

```
git grep -n --untracked "muted-corner"
src/ui/styles.css:685:.muted-corner {
```

Exactly one hit: the definition itself. Zero references in `src/` (TS/TSX/CSS/HTML),
`tests/`, `scripts/`, or `work/` HTML/JS. `node_modules/` and `dist/` are gitignored
build artifacts, not sources. No `className`, `classList`, selector string, or test
assertion mentions it. The rule positioned an absolute "muted corner" badge that no
component renders after the UI reset.

## 2. The change (minimal, CSS-only)

Removed from `src/ui/styles.css` exactly the 5-line rule plus one adjacent blank line
(6 deletions, 1 file):

```css
.muted-corner {
  position: absolute;
  top: max(8px, env(safe-area-inset-top));
  right: max(10px, env(safe-area-inset-right));
}
```

`git diff origin/main..HEAD -- src` = `src/ui/styles.css` only. No other src file touched.

### Optional extras considered and PRESERVED (default-to-minimal applied)

| Candidate | Refs | Verdict | Product justification |
|---|---|---|---|
| `layout.ts` `SHELL_RAIL_MIN_WIDTH_PX`, `SHELL_LANDSCAPE_MIN_WIDTH_PX`, `SHELL_LANDSCAPE_MAX_HEIGHT_PX`, `SHELL_PHONE_MAX_WIDTH_PX` | 0 outside definition | **PRESERVE** | Spec-protected: the accepted #47 navigation spec (`work/evidence/UI-RESET-47/navigation-spec.md` §3.6) defines these band literals, and the live `SHELL_RAIL_QUERY` embeds the same 1200/600/460 values. Deleting the named constants would decouple code from the accepted spec's vocabulary for zero runtime benefit. |
| `sprites.ts` `ATLAS_PLACE` | referenced in `work/development/ART-004-g1/handoff.md`, `work/review/ART-004-g1/QA.md` | **PRESERVE** | Art-pipeline contract surface cited by accepted ART-004 handoff/QA evidence; not dead. |
| `sprites.ts` `GRAY_STEPS` | referenced in `q002-handoff.md`, `work/review/rev-q002-g1.md` | **PRESERVE** | Cited by accepted q002 handoff/review evidence; not dead. |

### Forbidden paths — verified untouched

tokens.ts census (incl. `chipsByPosition`, #48 frozen); text.ts `pendingForStep`;
quantity.ts spec helpers; types.ts `spendable`/`powerFor` + commands.ts `RESOURCE_ORDER`;
Panels.tsx facade (#95); validate-content/invariants (CI gate B-12); save migration /
schemaVersion 1 / #100 output mirror / renderer band-fit fallback / research+return
legacyState DOM contracts; `work/*.html`. The src diff is one CSS file; none of these
appear in it.

## 3. Verification ladder (all exit 0)

| Step | Command | Exit | Receipt |
|---|---|---|---|
| 1 | `pnpm typecheck` | 0 | `typecheck.log` |
| 2 | `pnpm validate` | 0 | `validate.log` — content 0 violations, behaviour 0 violations, "validated: no violations" |
| 3 | `pnpm exec vitest run --minWorkers=4 --maxWorkers=4` | 0 | `vitest.log` — **60 files / 746 tests passed** (both worker flags mandatory on this 32-CPU host) |
| 4 | `pnpm build` | 0 | `build.log` — tsc + vite, 124 modules, entry 190.94 kB (< 233000 B ceiling) |

After `pnpm validate`, `work/evidence/UI-RESET-65/seeds.json` was verified unmodified
(regenerated identical); restored defensively with `git checkout --` regardless.

## 4. Build artifacts — on-disk bytes + SHA256 (fs/crypto, NOT vite console)

Baseline build captured from base `1ba05f28` BEFORE the edit (preserved copy), cleanup
build from CODE head `b7744043`. Full per-file inventories: `frames/before-r1/receipt.json`
and `frames/after/receipt.json` (`distInventory`).

| Asset | Before (1ba05f28) | After (b7744043) | Delta |
|---|---|---|---|
| Entry JS | `assets/index-CEQDUmwp.js` 191098 B `b85367da838f1bcfa68d432d975035b0049fbf54e2c3a68083d452be3b304844` | `assets/index-BeYjlKhu.js` 191098 B `b85367da838f1bcfa68d432d975035b0049fbf54e2c3a68083d452be3b304844` | **bytes IDENTICAL**; filename changed (Vite chunk hash includes the CSS dependency hash) |
| CSS | `assets/index-ekc2mZk4.css` 61957 B `fa11d4ed9299a682dbcdaa1e18830fa027f5f74f20367eaff7fcdd5efb5f19af` | `assets/index-CC920g8J.css` 61844 B `6f475fe0fe5543074770a364a31696a47dc219a1a8ca8940eb87a28a4a7e2a52` | −113 B (the removed rule), new hash |
| index.html | 1368 B `7f8f45dded9c5b88b6e322eded92a62bcb1189788bc2fc6beb26ffe8b523dae3` | 1368 B `7c16d3d4acc6f33316c75e6fea56981c3e418d1d914db2a32f8d4b6eef059303` | asset filename references only |
| tables / vendor / catchup.worker | `tables-KTf0wpwx.js` 26691 B, `vendor-Bt4lNSbZ.js` 141658 B, `catchup.worker-G_Jyr7uh.js` 13406 B | same names, same bytes, same hashes | byte-identical |

CSS-only change ⇒ CSS hash changes and JS entry bytes stay identical. This is still a
**real src deploy**: new CSS + new index.html must ship; the old CSS file disappears
from the manifest.

## 5. Before/after headless captures — zero visual regression

Method (AGENT headless emulation, **not** a physical device, **no vision**):
playwright-core 1.65.0 + installed Chrome 157.0.8103.50; each run serves its own dist
via a minimal local static server (before runs: port 4196, after: 4197; foreign ports
4195/4198 left untouched). Determinism: `page.clock.install({time: 2026-11-13T12:00:00Z})`
freezes Date/performance/rAF/timers; fixed `runFor()` windows advance the sim
deterministically; context `reducedMotion: "reduce"` disables all CSS transitions and
canvas motion (the repo has no CSS keyframe animations; renderer motion.ts honours the
OS setting). Seeded mature yard built by the real engine (`applyCommand`/`advance`,
home-62 recipe) and persisted by the real `encodeSave` with `lastSeenMs == T0` (no
offline catch-up, no return report).

Form factors: phone 390×844@dpr2 (isMobile/hasTouch) and desktop 1440×900@dpr1
(rail mode, ≥1200px). Surfaces per form: home-fresh (gate), home-settings (pre-start
settings overlay), yard (seeded, after Continue), build (catalog via key 2), store
(panel via key 3) → 10 surfaces × 3 runs = **30 PNGs** in `frames/`.

Runs: `before-r1` and `before-r2` (independent browser runs of the SAME baseline build
= harness determinism control) and `after` (cleanup build). All three runs: 0 console
errors, 0 page errors.

### Mirror audit (`mirror.json`)

Census per frame: sha256 + PNG IHDR dimensions + bytes/nonEmpty + exact decoded
distinct-RGB count (decoded in Chromium). Result:

- count = 30, allNonEmpty = true
- uniqueSha256 = **10 / 10 expected** (one per surface)
- determinismControlPass = **true** (before-r1 == before-r2, all 10 surfaces byte-identical)
- parityPass = **true** (before == after, all 10 surfaces byte-identical)

Byte-identical PNGs across the baseline and cleanup builds prove the removal caused
**zero visual change** on every captured surface, phone and desktop.

## 6. Audit-matrix reconciliation (single gh query)

`gh issue list --repo darkmatter2222/Rustwake --state all --limit 200 --json number,title,state,labels,milestone`

| Issue | Lane | State | Labels (abridged) | Milestone | Linked PR(s) on main |
|---|---|---|---|---|---|
| #45 | AUDIT | CLOSED | ui-reset, gate:G0, status:done | 1 | #74 |
| #46 | ARTDIR | CLOSED | ui-reset, gate:G1, status:done | 1 | #76 |
| #47 | NAV | CLOSED | ui-reset, gate:G1, status:done | 1 | #75, #79, #86 |
| #48 | TOKENS | CLOSED | ui-reset, gate:G1, status:done | 1 | #80 |
| #49 | SHELL | CLOSED | ui-reset, gate:G2, status:done | 1 | #90 |
| #50 | CAMERA | CLOSED | ui-reset, gate:G2, status:done | 1 | #93 |
| #51 | HUD | CLOSED | ui-reset, gate:G2, status:done | 1 | #94 |
| #52 | BUILD | CLOSED | ui-reset, gate:G2, status:done | 1 | #97 |
| #53 | PLACE | CLOSED | ui-reset, gate:G2, status:done | 1 | #102 |
| #54 | INSPECT | CLOSED | ui-reset, gate:G2, status:done | 1 | #99 |
| #55 | UPGRADE | CLOSED | ui-reset, gate:G2, status:done | 1 | #101 |
| #56 | STORE | CLOSED | ui-reset, gate:G2, status:done | 1 | #98 |
| #57 | SLICE | CLOSED | ui-reset, gate:G2, status:done | 1 | #104 |
| #58 | RESEARCH | CLOSED | ui-reset, gate:G3, status:done | 1 | #107 |
| #59 | LOGISTICS | CLOSED | ui-reset, gate:G3, status:done | 1 | #112 |
| #60 | WORLD | CLOSED | ui-reset, gate:G3, status:done | 1 | #106 |
| #61 | RETURN | CLOSED | ui-reset, gate:G3, status:done | 1 | #109 |
| #62 | HOME | CLOSED | ui-reset, gate:G3, status:done | 1 | #105 |
| #63 | SAVE | CLOSED | ui-reset, gate:G3, status:done | 1 | #108 |
| #64 | ONBOARD | CLOSED | ui-reset, gate:G3, status:done | 1 | #113 |
| #65 | FEEDBACK | CLOSED | ui-reset, gate:G3, status:done | 1 | #114 |
| #66 | ACCESS | CLOSED | ui-reset, gate:G4, status:done | 1 | #115 |
| #67 | PERF | CLOSED | ui-reset, gate:G4, status:done | 1 | #116 |
| #68 | REGRESSION | CLOSED | ui-reset, gate:G4, status:done | 1 | #118 |

**24/24 CLOSED with `status:done`, 24/24 milestone 1.** No exceptions. (All carry
`priority:P0/P1`, `role:*`, `major-ui`, `ui-reset`, `gate:G0–G4` as shown by the query.)
Supporting program PRs also on main: #96 (Panels facade split, #95) and #119
(phoneland furnace tap-selection fix, #117).

## 7. Limitations

1. Project 1 membership cannot be verified with the current gh token (lacks
   read:org/read:project). Recorded, never invented.
2. Headless emulation ≠ physical device; no vision; parity proven by byte-identical
   PNG sha256, not visual inspection.
3. CSS-only change: JS entry bytes identical; filename changes via CSS dependency
   hash. Real src deploy still required.
4. Draft PR only — no merge, gate declaration, label flip, issue close, deployment
   claim, or Release publication by this persona.
5. `release-notes.md` is a DRAFT with tag/CI/deploy placeholders; nothing published.

## 8. Receipts index

- `results.json` — machine-readable summary (buildSha == CODE head, ladder exits,
  before/after hashes+bytes, mirror summary, limitations)
- `probe.mjs` — capture/mirror/probe tool (committed == ran, see `prove`)
- `frames/{before-r1,before-r2,after}/` — 10 PNGs + `receipt.json` each (dist
  inventory, seed, browser, errors)
- `mirror.json` — census + control/parity comparisons
- `typecheck.log`, `validate.log`, `vitest.log`, `build.log` — ladder receipts
- `release-notes.md` — DRAFT release notes (not published)
