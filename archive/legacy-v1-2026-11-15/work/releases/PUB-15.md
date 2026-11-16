# PUB-15 — `q004a` motion slice integrated

- **Lease:** `pub-15-g15` (publisher session `ses_e5acebf2effeAolzrbFKrGm0aT`).
- **Base:** `f86eff6cb383c839a3d08026740bd39d2bcce2b7` (= `origin/main` at claim time).
- **Code integrated:** three commits cherry-picked from `audio-fixes` (candidate tip `f229704c14d3e6a5230a2d0f65b8702f25acf554`):
  - `173293a` → `8c584f2` timestamp-free sub-tick interpolation for drones and cargo tokens
  - `1f6833e` → `977d7ec` one state read per frame, single accent table, starved/running agreement rows
  - `f229704` → `6d3bfde` numeric motion and world/panel agreement assertions
  - ancestry verified `fe643d5 ← 173293a ← 1f6833e ← f229704` (exit 0 for each `merge-base --is-ancestor`); `fe643d5` is the E3 split already on main as `9dc4895`.
  - code trees identical: `git diff --stat f229704 6d3bfde -- src tests scripts` is empty; the remaining 13-file delta is tracked docs/records only.
- **Records:** `.rustwake-runtime/developer/q004a-g1.json` → `work/development/handoffs/q004a-g1.json` (8208 B, 72 lines, sha256 `F0145EC69FEE4F4C869F98081C3CB32373B16603ED484CA4A24021265B11D500`).

## Gates at the integrated tip (all exit 0)

```
 Test Files  23 passed (23)      Tests  228 passed (228)      Duration  4.12s
 tsc --noEmit  (no output)
 tables: 15 resources, 8 blueprints, 12 recipes, 3 research nodes
 content: 0 violation(s) in 3 ms
 behaviour: firstDrone=268 firstResearch=478 tick=18298 machines=8 links=18 drones=5 batches=1902 credits=82 nodes=3 | 0 violation(s)
 validated: no violations
 assets/index-Bfy3uiX4.js 226081 B | tables-B-vOLV1r.js 7416 B | index-Cwg_kGXQ.css 7224 B | catchup.worker-DphWaCEx.js 13015 B | index.html 778 B
```

Every number matches the developer's own run (`228` tests, entry `index-Bfy3uiX4.js` **226081 B**, headroom **6919 B** under the pinned 233000 B ceiling, unchanged behaviour line). No mismatch.

## Docs

README (78 lines, cap 80): current update now records the tested head `6d3bfde`, **228 tests**, entry `index-Bfy3uiX4.js` 226081 B, and one line that motion is interpolated via sub-tick `getFramePhase()` and the status accents come from one shared accent table; the live line stays `rustwake-3d589aa` as recorded by OPS-006. BOARD: `Q-004` → "`q004a` half integrated (awaiting independent numeric verdict)"; `L-*` / `D-*` / `OPS-*` rows unchanged.

## Publishing

- **CI:** **pending** (`gh` unauthenticated; anonymous API 404 for this private repo) — no pass claimed, so this head is **not deployment-eligible** until CI/verdict state is established.
- **Deployed:** still `rustwake-3d589aa` (OPS-006). The `q004a` slice is integrated but quality-pending: it needs the reviewer's independent numeric verdict and the 5-second clip.
