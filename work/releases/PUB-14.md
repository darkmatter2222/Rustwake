# PUB-14 — docs/records checkpoint

- **Lease:** `pub-14-g14` (publisher session `ses_e5acebf2effeAolzrbFKrGm0aT`).
- **Base:** `3d589aa811cec54bd2fbe7427a909cde9bab356b` (= `origin/main` at claim time, confirmed by `git ls-remote`).
- **Scope:** records only — no `src/` change. The `audio-fixes` tip `f229704` is **not** integrated (its developer receipt is still unwritten).

## Materialised artifacts (copied verbatim, byte-checked)

| Path | Bytes | Lines |
| --- | --- | --- |
| `work/review/rev-layout-g1.md` | 12410 | 73 |
| `work/review/rev-desk-g1.md` | 12052 | 56 |
| `work/deployments/OPS-006-g1.json` | 10272 | 153 |
| `work/review/rev-layout-g1.json` | 697 | 1 |
| `work/review/rev-desk-g1.json` | 651 | 1 |

## Board changes

- New rows `L-1`..`L-7` from `rev-layout-g1` sec.2 (severities blocker / major / major / major / minor / minor / major); `L-6` depends on `L-1`.
- New rows `D-1`, `D-2`, `D-4`, `D-6` (all major) from `rev-desk-g1` sec.2; merges recorded in outcome text: `D-5 == L-2`, `D-3 == Q-007`, `D-1 == C-01`.
- Slice groupings recorded: `SLICE-A` layout `L-1, L-2, L-3, L-4` (+5 cases, 212 → 217) and `SLICE-B` glyph `D-1, D-2, D-3, D-4` (+4 cases), each with the pixel-diff re-pin rule (DOM-only rows keep 0.000152; geometry rows print their own value under the 0.02 gate).
- `OPS-004` → superseded by `OPS-005`; new `OPS-005` (superseded by `OPS-006`) and `OPS-006` (deployed + verified, release `rustwake-3d589aa`).
- README current update refreshed (78 lines, cap 80).

## Gates at the integrated tip (all exit 0)

`Test Files 23 passed (23)` / `Tests 212 passed (212)`; `tsc --noEmit` clean; `validated: no violations` with `content: 0 violation(s)` and `behaviour: | 0 violation(s)`; build → entry `assets/index-BZ9knt75.js` **225861 B** (inside the pinned 233000 B ceiling), `tables-B-vOLV1r.js` 7416 B, `index-Cwg_kGXQ.css` 7224 B, `catchup.worker-DphWaCEx.js` 13015 B, `index.html` 778 B.

## Publishing

- **CI:** **pending** — `gh` unauthenticated here, anonymous API returns 404 for this private repo (BL-06); no pass is claimed.
- **Deployed:** `rustwake-3d589aa` at [https://home.darkmatter2222.com/rustwake/](https://home.darkmatter2222.com/rustwake/) (OPS-006, external verification 5/5 sha256, 4/4 nodes 200).
- **Not deployment-eligible beyond this:** the layout and glyph slices (`L-1..L-4`, `D-1..D-4`) are quality-pending implementation work.
