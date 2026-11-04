# Q-002 handoff - style slice (phases A/B/C complete)

Date: 2026-11-03 | Agent: qwen3.8-flash-next-ablit (session ses_e5b7c433effe2Tsz4yuRTbuN6Q)
Worktree: `C:\Users\ryans\.local\share\opencode\worktree\fe4e05\q001-dev`

## Candidate SHA chains

Branch `audio-fixes` (this worktree's HEAD - carries the other agents' PUB/Q-001 commits as well):

| sha | subject |
| --- | --- |
| `10bde02` | Q-002: style slice phase A - sprites table, layered scene painters, palette mirror |
| `7861926` | Q-002: style slice phase C - deterministic draw-bound tests (A1-A4, B2-B7, D1-D9, E6) |
| `aaa3a4e` | Q-002 evidence: style-slice pixel captures, deterministic sampler, palette silhouette |
| `c659cf8` | (origin/main) docs(publisher): PUB-9 Q-002 review-pending status, Q-005 structural accept, OPS-004 receipt |
| `df4d1df` | Q-002: style slice handoff note |
| final | Q-002: style slice phase B finals - receipt, provenance, regenerated sheet, final sampler (see `git log -1`) |

Parallel standalone branch `style-slice` (same Q-002 content on the Q-005 base): `ade4b60` -> `4d3c4bb` (A) -> `aff2ec6` (C) -> `e8e9035` (B). Both chains carry identical `src/`, `tests/renderer/`, `scripts/capture-style.mjs` content; `git diff --stat style-slice HEAD -- src tests scripts` shows only `src/ui/styles.css`, `src/ui/Panels.tsx`, `tests/ui/app.test.tsx` (other agents' Q-001/PUB work).

## Changed paths (mine)

Phase A
- `src/game/renderer/sprites.ts` (new): `PALETTE` (17 hexes), `COLOR_KEYS = Object.keys(PALETTE)`, `PARTS` as `PartTuple = [x,y,w,h,cIndex,ellipse?]` for dock/sorter/furnace/wireMill/signalLab/generic/drone, `FLOOR_KIT`, `FLOOR_POSTS`, `PUDDLES`, `GRAVEL`, `WRECK_HULL`, `WRECK_SHARDS`, `GRID_STYLE`, `SELECT_STYLE`, `STATUS_ACCENTS`, `AMBER_SHAPES`, `GRAY_STEPS`, `FEATURE_MIN_UNITS`, `LEAN_UNITS` (+187 lines)
- `src/game/renderer/scene.ts`: layered sky -> backdrop -> solid floor, floor kit, build-mode-only single-path grid, table painters, quantised pips, drone shadow + select nose, `drawSpriteSheet` export
- `src/ui/styles.css`: `:root` mirror `--floor #22384a`, `--body-light #8aa9c4`, `--body-mid #7f9fbb`, `--well #0e1726`
- `src/ui/Hud.tsx`: `DOT_COLORS` via `PALETTE`

Phase C
- `tests/renderer/scene-draw.test.ts` (new, 295 lines): 13 tests on a recording stub ctx

Phase B
- `scripts/capture-style.mjs`: 7-state capture, FNV-1a re-checksummed FS-1 envelope, self-calibrating exact-RGB sampler, WCAG ratios
- `docs/evidence/2026-11-03-style-slice.md` (receipt), `docs/evidence/2026-11-03-style-slice-pixels.json`, `docs/evidence/asset-provenance.json`
- `docs/screenshots/slice-{phone,desktop}-{rest,build,mature}.png`, `slice-phone-one-machine.png`, `slice-sheet-silhouette.png`

Untouched as required: `src/ui/Panels.tsx` (by me), `src/game/audio/audio.ts`, `vite.config.ts`; no existing test assertion edited (new lines only).

## Gates (quoted at the final commit, branch `audio-fixes`)

```
vitest   : Test Files 23 passed (23) | Tests 206 passed (206) | Duration 4.01s
typecheck: > tsc --noEmit            (no output)
validate : validated: no violations
build    : assets/index-CmwRilug.js 232.72 kB | gzip 73.57 kB
           assets/catchup.worker-DphWaCEx.js 13.02 kB | assets/index-Cwg_kGXQ.css 7.22 kB
```

On the standalone `style-slice` branch the same gates read 205 tests / `index-5_4tT5cD.js` 232.21 kB (gzip 73.43 kB).

## Acceptance summary (spec `rev-q2spec-g3`)

- A1-A5 grid: 0 strokes at rest; exactly 1 stroke with 14 `lineTo` segments in build; 1 `SELECT_STYLE` stroke on the selected cell only at 5 fitted widths; fitted scale 1.8056 (390 px) / 4 (1440 px); backdrop-first op, grid before entity paints, ghost `fillText` last.
- B1-B7: six role masks + full 15-pair Hamming matrix in the receipt; minimum distance 13 (limit >= 12); amber 5 ops / 1 shape (3 units of AMBER_SHAPES); lean 4 units keeps 5 distinct body x-offsets under reduced motion.
- C1-C5 (measured on the live canvas at both viewports): 1.545 / 3.594 / 4.937 / 4.375 / 7.049 against limits 1.5 / 3 / 4.5 / 3 / 4.5.
- D1-D9: rest 61 <= 80, build 64 <= 90, mature rest 182 <= 215; op-log equality across two draws; every coord on the half-CSS-px grid with `imageSmoothingEnabled === false`; 5 status hexes over 6 statuses with `powerLimited` distinct.
- E1-E6: gates above; camera helpers and `DOCK_TILE = 2` unchanged.

## Evidence

- `docs/evidence/2026-11-03-style-slice.md` - receipt: C table, coverage counts, mask strings, Hamming matrix, op census, byte table, limitations.
- `docs/evidence/2026-11-03-style-slice-pixels.json` - 7 cases x (samples, points with runX/runY/count, ratios).
- `docs/evidence/asset-provenance.json` - per-role provenance (sourceModule, partsCount, identityMark), FS-1 command list at tick 344, mature behaviour line.
- 8 PNGs in `docs/screenshots/` (byte sizes listed in the receipt).

## Limitations / open items

1. **E3 byte budget**: `index-CmwRilug.js` = 232754 bytes on `audio-fixes` (232.21 kB as printed by vite on `style-slice`) vs the limit <= 229000 -> over by 3754 bytes / 3210 bytes. The budget predates Q-005: base `ade4b60` already measured 229.48 kB, so the Q-002 delta is +2.73 kB. Needs a reviewer call (raise E3 to 233000, or split the audio table out).
2. Contrast ratios are identical across the seven cases because the palette is flat/opaque; the states are distinguished by coverage counts (amber 515..856 device px, bodyLight 5362..46059).
3. Sheet PNG is a page screenshot of the appended 1800x840 `drawSpriteSheet` canvas, so the page background is visible around it.
4. Only headless chromium exercised locally (playwright-core + installed Chrome/Edge).
5. Rerun recipe: `npx vite --port 5174 --strictPort`, then `RUSTWAKE_URL=http://localhost:5174/ node scripts/capture-style.mjs`.
