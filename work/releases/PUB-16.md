# PUB-16 — layout slice `L-1..L-4` integrated (reviewer-accepted)

- **Lease:** `pub-16-g16` (publisher session `ses_e5acebf2effeAolzrbFKrGm0aT`).
- **Base:** `fb342f11c91b78638d5377095525dc32efdcd6fa` (= `origin/main` at claim time).
- **Code integrated:** four cherry-picks from `audio-fixes` (candidate tip `49b3152d2c8d48dcb04829c228669e0bc6232b94`), ancestry verified `f229704 ← fc61c2b ← 50799d7 ← 9d94246 ← 49b3152`:
  - `fc61c2b` → `fb12b62` L-1 camera fitted to the measured chrome band
  - `50799d7` → `b049ed8` L-2 guidance line as its own block
  - `9d94246` → `db16222` L-3 one 46 px dock row at text scale 2
  - `49b3152` → `84f2872` L-4 level digit clear of the perimeter rail
  - combined stat `f229704..49b3152`: 8 files, +343/-25 (`scene.ts`, `App.tsx`, `Hud.tsx`, `styles.css`, two test files, `vite-asset.d.ts`, `vite.config.ts`).

## Records materialised

| Path | Bytes | Lines | sha256 |
| --- | --- | --- | --- |
| `work/review/rev-q4a-lay-g1.md` | 13112 | 62 | `2350ECA4…6B854C` |
| `work/review/rev-q4a-lay-g1.json` | 2081 | 1 | `B240383F…8A96443` |
| `work/development/handoffs/LAYOUT-A-g1.json` | 8753 | 76 | `D5B9A1EB…C35772` |

## Gates at the integrated tip (all exit 0)

```
 Test Files  23 passed (23)      Tests  232 passed (232)      Duration  4.14s
 tsc --noEmit  (no output)
 tables: 15 resources, 8 blueprints, 12 recipes, 3 research nodes
 content: 0 violation(s) in 3 ms
 behaviour: firstDrone=268 firstResearch=478 tick=18298 machines=8 links=18 drones=5 batches=1902 credits=82 nodes=3 | 0 violation(s)
 validated: no violations
 assets/index-CnTKM6SY.js 226717 B | tables-B-vOLV1r.js 7416 B | index-gVFVLc-k.css 7313 B | catchup.worker-DphWaCEx.js 13015 B | index.html 778 B
```

Every expected number reproduced exactly (developer + reviewer): 232 tests / 23 files, entry 226717 B (headroom 6283 B under the 233000 B ceiling), tables 7416 B, css 7313 B, worker 13015 B, unchanged behaviour line. **No mismatch.**

## Board

`L-1`, `L-2`, `L-3`, `L-4` → **accepted at `49b3152`** citing `work/review/rev-q4a-lay-g1.md` sec.2. New rows: `E-1` leg-boundary teleport (343.50 px vs the 7.00 cap), `E-2` airborne duty (75.3 % mature / 18.4 % FS-1 vs ≥ 80 %), `E-3` landscape 3 px yard/dock overlap (`BAND_MIN_SCALE 1.2 → 1.1`), `E-4` desktop gutters + panel coverage (= `D-6`). `Q-004` → 3A/3B accepted 13/14 with A5 rework tracked as `E-1`/`E-2`. `D-1 D-2 D-3 D-4 D-6 L-5 L-6 L-7 C-02` remain ready and untouched.

## Publishing

- **CI: pending** (`gh` unauthenticated; anonymous API 404) — no pass claimed.
- **Deployed:** still `rustwake-3d589aa` (OPS-006, 5/5 sha256, 4/4 nodes). **Next release pending**: this head is newer than `3d589aa`, and CI is pending, so the slice is integrated but not yet deployment-verified.
