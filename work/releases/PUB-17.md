# PUB-17 — motion slice `E-1..E-3` integrated (reviewer-accepted)

- **Lease:** `pub-17-g17` (publisher session `ses_e5acebf2effeAolzrbFKrGm0aT`).
- **Base:** `d5c63b3ab67f44ef332ad14ec21df94d6f29677a` (= `origin/main` at claim time).
- **Code integrated:** three cherry-picks from `audio-fixes` (candidate tip `c92899be657b8cdb290d64ceda6b74ba796d82f5`), ancestry verified `49b3152 ← 723e735 ← e14e8de ← c92899b`:
  - `723e735` → `6ec6bee` E-1 one continuous `droneLeg` segment parameter (leg boundary is a frame step, not a teleport)
  - `e14e8de` → `902abd8` E-2 segment parameter driven by the drawn-frame clock (airborne duty → 100 %)
  - `c92899b` → `80f875e` E-3 band-fit floor below the landscape band term (yard clears the dock)
  - combined stat `49b3152..c92899b`: 2 files (`src/game/renderer/scene.ts`, `tests/renderer/scene-draw.test.ts`), **+218/-10**.

## Records materialised

| Path | Bytes | Lines | sha256 |
| --- | --- | --- | --- |
| `work/review/rev-motion-g1.md` | 8967 | 39 | `6E4DC65A…E1F1F20` |
| `work/review/rev-motion-g1.json` | 1912 | 1 | `09E4CE08…0809DB47` |
| `work/development/handoffs/MOTION-C-g1.json` | 7450 | 65 | `67A32E88…47D0942D` |

## Gates at the integrated tip (all exit 0)

```
 Test Files  23 passed (23)      Tests  235 passed (235)      Duration  4.12s
 tsc --noEmit  (no output)
 tables: 15 resources, 8 blueprints, 12 recipes, 3 research nodes
 content: 0 violation(s) in 3 ms
 behaviour: firstDrone=268 firstResearch=478 tick=18298 machines=8 links=18 drones=5 batches=1902 credits=82 nodes=3 | 0 violation(s)
 validated: no violations
 assets/index-DeEJxXGK.js 226888 B | index-gVFVLc-k.css 7313 B | tables-B-vOLV1r.js 7416 B | catchup.worker-DphWaCEx.js 13015 B | index.html 778 B
```

Every expected value reproduced (235 tests / 23 files, entry **226888 B**, headroom **6112 B** under the 233000 B ceiling, css 7313 B unchanged, tables 7416 B, worker 13015 B, behaviour line identical). **No mismatch.**

## Board

`E-1`, `E-2`, `E-3` → **accepted at `c92899b`** citing `work/review/rev-motion-g1.md`; new rows `F-1` (nose mark steps 14.50 px twice per cycle, fix via the `droneLeg` slope, acceptance `maxNoseXStepPx <= 0.50`, minor) and `F-2` (D1 sampled-pair bound 171.87 px next to the per-rAF 7.00 px cap, minor, spec-side); `PIXEL-CLASSES` records the pinned classes **1a ≤ 0.000152**, **1b ≤ 0.003112**, **class 2 `delta <= intended-region sum + 0.01`**; `Q-004` status now names the motion slice as accepted. `D-1 D-2 D-3 D-4 D-6 L-5 L-6 L-7 C-02 E-4` stay ready and untouched.

## Publishing

- **CI: pending** (`gh` unauthenticated; anonymous API 404) — no pass claimed.
- **Deployed:** still `rustwake-3d589aa` (OPS-006). **Next release pending**: this head is newer, CI pending → integrated and reviewer-accepted, not yet deployment-verified.
