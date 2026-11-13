# DRAFT release notes — Rustwake UI reset complete + dead-CSS cleanup (#69)

> **STATUS: DRAFT — NOT PUBLISHED.** Prepared by release-engineer persona re-69 for
> issue #69. Publication, tagging, merging and deployment are NOT authorized for this
> persona and have NOT happened. Placeholders below must be filled by the release
> authority from real receipts before any GitHub Release is created.

## Summary

Completes the sponsor goal **#43 — complete mobile AND desktop UI restart**: all 24
planned UI-reset issues (#45–#68, gates G0–G4) are CLOSED with `status:done` in
milestone 1, and this release adds the final hygiene change from **#69**: removal of
the dead `.muted-corner` CSS rule (zero references repo-wide), proven to cause zero
visual change on phone and desktop.

## Links

- Release issue: https://github.com/darkmatter2222/Rustwake/issues/69
- Sponsor goal: https://github.com/darkmatter2222/Rustwake/issues/43
- Live cutover reference: https://github.com/darkmatter2222/Rustwake/issues/44
- Project 1: https://github.com/users/darkmatter2222/projects/1
- Milestone 1: https://github.com/darkmatter2222/Rustwake/milestone/1
- Release PR (DRAFT): `<PR URL — fill after publish-feature>` (branch `rw/69-release`)

## Included issues and merged PRs (#45–#68)

| Issue | Lane | PR(s) merged to main |
|---|---|---|
| #45 AUDIT | screen/state inventory | #74 |
| #46 ARTDIR | industrial art direction | #76 |
| #47 NAV | navigation spec | #75, #79, #86 |
| #48 TOKENS | shared tokens/primitives | #80 |
| #49 SHELL | mobile/desktop shell | #90 |
| #50 CAMERA | shell-fit camera + input | #93 |
| #51 HUD | readable HUD | #94 |
| #52 BUILD | visual build catalog | #97 |
| #53 PLACE | placement/move/dismantle | #102 |
| #54 INSPECT | machine inspector | #99 |
| #55 UPGRADE | explicit comparisons | #101 |
| #56 STORE | trade desk + diagnostics | #98 |
| #57 SLICE | G2 slice acceptance | #104 |
| #58 RESEARCH | research/unlocks | #107 |
| #59 LOGISTICS | routes/power/bottlenecks | #112 |
| #60 WORLD | yard lighting/facets | #106 |
| #61 RETURN | offline return report | #109 |
| #62 HOME | gate + settings | #105 |
| #63 SAVE | save management | #108 |
| #64 ONBOARD | onboarding/help/recovery | #113 |
| #65 FEEDBACK | unified feedback | #114 |
| #66 ACCESS | accessibility + desktop input | #115 |
| #67 PERF | performance budgets | #116 |
| #68 REGRESSION | full regression matrix | #118 |

Supporting program PRs also on main: #96 (Panels.tsx facade split, #95), #119
(phoneland furnace tap-selection fix, #117). This release's own change: #69 cleanup
PR (DRAFT, URL above).

Audit-matrix reconciliation: single `gh issue list` query verified **24/24 CLOSED,
`status:done`, milestone 1** (see `evidence.md` §6).

## Version / SHA / runs (PLACEHOLDERS — fill from real receipts)

- Tag: `<TBD by release authority, e.g. v0.2.0-ui-reset>`
- Release commit (full SHA): `<TBD — main merge SHA of the #69 PR after QA/product acceptance>`
- Cleanup CODE head (src commit on PR): `b774404382b05a918d4e77d9578a9cfb939aa93e`
- Base before cleanup (origin/main): `1ba05f28baff16e40d34f2c5426b819916c964e9`
- CI run IDs at exact release head: `<TBD — pull_request + push workflow run IDs, must be green>`
- Deployment run ID + URL: `<TBD — only from main after successful CI; https://home.darkmatter2222.com/rustwake/>`

## What changed in this release's own commit (#69)

- `src/ui/styles.css`: removed dead `.muted-corner` rule (5 lines + 1 blank line;
  6 deletions, 1 file). Zero references repo-wide; no component, test, or script used it.
- Nothing else in src. Forbidden/census/spec-protected surfaces untouched (tokens
  census incl. chipsByPosition, text pendingForStep, quantity spec helpers,
  spendable/powerFor + RESOURCE_ORDER, Panels facade, validate/invariants CI gate,
  save migration/schema, renderer fallbacks, legacyState DOM contracts, work/*.html).

## Verification (all exit 0)

- `pnpm typecheck` — 0
- `pnpm validate` — 0 violations (content + behaviour)
- `pnpm exec vitest run --minWorkers=4 --maxWorkers=4` — 60 files / **746 tests passed**
- `pnpm build` — entry 190.94 kB (< 233000 B ceiling)

### Build artifacts (on-disk bytes + SHA256)

| Asset | Before (1ba05f28) | After (b7744043) |
|---|---|---|
| Entry JS | `index-CEQDUmwp.js` 191098 B `b85367da…b304844` | `index-BeYjlKhu.js` 191098 B `b85367da…b304844` (bytes identical; filename changes via CSS dependency hash) |
| CSS | `index-ekc2mZk4.css` 61957 B `fa11d4ed…5f19af` | `index-CC920g8J.css` 61844 B `6f475fe0…7e2a52` (−113 B) |
| tables/vendor/worker | byte-identical | byte-identical |

Full hashes: `results.json` / `evidence.md` §4.

### Mobile + desktop visual parity evidence

Headless Chromium (AGENT emulation, not a physical device; no vision), frozen clock +
reduced-motion, seeded mature yard via the real engine/save encoder. Phone 390×844@dpr2
and desktop 1440×900@dpr1 (rail mode). 5 surfaces per form (home gate, pre-start
settings, yard, build catalog, store) × 3 runs (baseline twice as determinism control,
cleanup once) = 30 PNGs. Mirror audit: **all 10 surfaces byte-identical before vs after**
(sha256 + IHDR dims + nonEmpty + distinct-color census in `mirror.json`); determinism
control passed. Zero console/page errors in all runs. Evidence:
`tests/ui/release-69.evidence/` (frames/, mirror.json, results.json, probe.mjs, logs).

## Save impact

**None.** CSS-only change. Save schema stays `schemaVersion 1`; no migration, encoder,
or decoder changes; existing saves load unchanged. The #100 output mirror, renderer
band-fit fallback and research/return legacyState DOM contracts are untouched.

## Limitations

- Project 1 membership unverifiable with the current token (no read:org/read:project);
  recorded, not invented.
- Headless emulation ≠ physical device; parity proven by byte-identical PNGs, not vision.
- JS entry bytes unchanged (CSS-only); a real deploy is still required (new CSS +
  index.html; old CSS asset removed from the manifest).
- This document is a DRAFT; no Release has been published, no tag created, no merge or
  deployment performed by re-69.

## Rollback proposal

If the deployed cleanup build misbehaves: re-deploy the prior main artifact
`1ba05f28baff16e40d34f2c5426b819916c964e9` (entry `assets/index-CEQDUmwp.js`, CSS
`assets/index-ekc2mZk4.css`, hashes recorded in `results.json`). The change is a single
dead CSS rule, so rollback risk is minimal; no save/schema rollback is needed. Rollback
must go through the normal main CI/CD path with coordinator + product confirmation —
never a direct push or merged-less deploy.
