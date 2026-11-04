# Q-002 handoff - style slice (phases A/B/C complete)

Date: 2026-11-03 | Agent: qwen3.8-flash-next-ablit (session ses_e5b7c433effe2Tsz4yuRTbuN6Q)
Worktree: `C:\Users\ryans\.local\share\opencode\worktree\fe4e05\q001-dev` | Branch: `style-slice`

## Candidate SHA chain

| sha | subject |
| --- | --- |
| `ade4b60` | base (Q-005 audio mix graph) |
| `4d3c4bb` | Q-002: style slice phase A - sprites table, layered scene painters, palette mirror |
| `aff2ec6` | Q-002: style slice phase C - deterministic draw-bound tests (A1-A4, B2-B7, D1-D9, E6) |
| `e8e9035` | Q-002: style slice phase B - capture script, pixel evidence, provenance manifest |

## Changed paths

Phase A (`4d3c4bb`, 4 files, +463/-123)
- `src/game/renderer/sprites.ts` (new): `PALETTE` (17 hexes), `COLOR_KEYS = Object.keys(PALETTE)`, `PARTS` as `PartTuple = [x,y,w,h,cIndex,ellipse?]` for dock/sorter/furnace/wireMill/signalLab/generic/drone, `FLOOR_KIT`, `FLOOR_POSTS`, `PUDDLES`, `GRAVEL`, `WRECK_HULL`, `WRECK_SHARDS`, `GRID_STYLE`, `SELECT_STYLE`, `STATUS_ACCENTS`, `AMBER_SHAPES`, `GRAY_STEPS`, `FEATURE_MIN_UNITS`, `LEAN_UNITS`
- `src/game/renderer/scene.ts`: layered sky -> backdrop -> solid floor, floor kit, build-mode-only single-path grid, table painters, quantised pips, drone shadow + select nose, `drawSpriteSheet` export
- `src/ui/styles.css`: `:root` mirror `--floor #22384a`, `--body-light #8aa9c4`, `--body-mid #7f9fbb`, `--well #0e1726`
- `src/ui/Hud.tsx`: `DOT_COLORS` via `PALETTE`

Phase C (`aff2ec6`, +295)
- `tests/renderer/scene-draw.test.ts`: 13 tests (recording stub ctx)

Phase B (`e8e9035`, 12 files, +962)
- `scripts/capture-style.mjs`
- `docs/evidence/2026-11-03-style-slice.md` (receipt), `docs/evidence/2026-11-03-style-slice-pixels.json`, `docs/evidence/asset-provenance.json`
- `docs/screenshots/slice-{phone,desktop}-{rest,build,mature}.png`, `slice-phone-one-machine.png`, `slice-sheet-silhouette.png`

Untouched as required: `src/ui/Panels.tsx`, `src/game/audio/audio.ts`, `vite.config.ts`; no existing test assertion edited (new lines only).

## Gates (quoted, at `e8e9035`)

```
vitest   : Test Files 23 passed (23) | Tests 205 passed (205) | Duration 4.02s
typecheck: > tsc --noEmit            (no output)
validate : behaviour: firstDrone=268 firstResearch=478 tick=18298 machines=8 links=18
           drones=5 batches=1902 credits=82 nodes=3 | 0 violation(s) / validated: no violations
build    : dist/assets/index-5_4tT5cD.js 232.21 kB | gzip 73.43 kB
           dist/assets/catchup.worker-DphWaCEx.js 13.02 kB
           dist/assets/index-BJ1YTSTT.css 5.83 kB | gzip 1.87 kB  (same hashes as aff2ec6)
```

## Acceptance summary (spec `rev-q2spec-g3`)

- A1-A5 grid: 0 strokes at rest, exactly 1 stroke / 14 `lineTo` segments in build, 1 select stroke on the selected cell only at 5 fitted widths, fitted scale 1.8056 (390) / 4 (1440).
- B1-B7: six role masks + 15-pair Hamming matrix, minimum distance 13 (>= 12); pips quantised, amber budget 5 ops / 1 shape (3 units), lean 4 units keeps 5 distinct x-offsets under reduced motion.
- C1-C5 (measured on the live canvas, both viewports): 1.545 / 3.594 / 4.937 / 4.375 / 7.049 vs limits 1.5 / 3 / 4.5 / 3 / 4.5.
- D1-D9: rest 61 <= 80, build 64 <= 90, mature rest 182 <= 215/240, deterministic op-log equality, half-CSS-px grid with `imageSmoothingEnabled === false`, 5 amber ops, 5 distinct status hexes.
- E1-E6: gates above; camera helpers and `DOCK_TILE = 2` unchanged.

## Evidence

- `docs/evidence/2026-11-03-style-slice.md` - receipt with the C table, mask strings, Hamming matrix, op census, byte table, limitations.
- `docs/evidence/2026-11-03-style-slice-pixels.json` - 7 cases x (samples, points with runX/runY/count, ratios).
- `docs/evidence/asset-provenance.json` - per-role provenance (sourceModule, partsCount, identityMark) + FS-1 command list, tick 344 + mature behaviour line.
- 8 PNGs in `docs/screenshots/` (sizes in the receipt section 6).

## Limitations / open items

1. **E3 byte budget**: `index-5_4tT5cD.js` = 232210 bytes vs the limit <= 229000 -> over by 3210 bytes. The budget predates Q-005 in this chain: base `ade4b60` already measured 229.48 kB, so the Q-002 delta is +2.73 kB. Phase B added no runtime bytes (identical bundle hash). Needs a reviewer call: raise E3 to 233000 or split the audio table out.
2. Contrast ratios are identical across the seven cases because the palette is flat/opaque; the states are distinguished by the coverage counts (amber 515..856 device px, bodyLight 5362..46059).
3. Sheet PNG is a page screenshot of the appended 1800x840 canvas, so it carries the page background.
4. Only headless chromium was exercised locally (playwright-core + installed Chrome/Edge).
5. Rerun recipe: `npx vite --port 5174 --strictPort` then `RUSTWAKE_URL=http://localhost:5174/ node scripts/capture-style.mjs`.
