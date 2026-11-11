# OPS-107-g1 — entry chunk split (E3), evidence

- Issue: https://github.com/darkmatter2222/Rustwake/issues/35
- Branch / worktree: `rw/ops107-g1` @ `C:\Users\ryans\AppData\Local\Temp\opencode\ops107-dev`
- Base: `main` = `56105287bc9468a95cdd15d54bc9aa4fccdae415`
- Change: one file, `vite.config.ts` — the existing `manualChunks` E3 split gains three
  pure-data content modules (`src/game/content/strings.ts`, `defs.ts`, `research.ts`)
  next to the audio cue/variant table and the authored sprite part table. No source file
  was touched, so every public export name and every import site is unchanged.

## Why this is the cheapest correct split

`strings.ts` declares that it imports nothing, and `defs.ts` / `research.ts` are the tuning,
blueprint, recipe and research trees. All three are leaf data modules of the same static
entry graph, so naming them in `manualChunks` only moves bytes from the entry into the one
sibling chunk that `index.html` already `<link rel="modulepreload">`s. No dynamic import, no
new runtime dependency, no execution-order change, nothing for the save layer to notice.

## Byte counts (filesystem bytes of the hashed files, one clean build each, this session)

| Chunk | Base `5610528` | After (this head) | Δ |
|---|---|---|---|
| entry (js) | `assets/index-BtXxU2Fb.js` **232792 B** | `assets/index-Djc6AIi9.js` **216514 B** | **−16278 B** |
| tables (js) | `assets/tables-C3W8xgzz.js` 9707 B | `assets/tables-BttRDPML.js` **26409 B** | +16702 B |
| css | `assets/index-CbtyNiLy.css` 8092 B | `assets/index-CbtyNiLy.css` **8092 B** | 0 |
| worker (js) | `assets/catchup.worker-G_Jyr7uh.js` 13406 B | same name, **13406 B** | 0 |

- Acceptance 1 (entry drops ≥ 1000 B): **−16278 B** against the pinned 232792 B.
- Acceptance 2 (every emitted chunk < 233000 B): max emitted chunk is the entry at
  **216514 B**, i.e. **16486 B** headroom; tables 26409 B, css 8092 B, worker 13406 B.
- Honest cost: total emitted js grows by 424 B (242499 → 242923 B uncompressed for the two
  app chunks), which is the chunk-boundary cost of the extra `import`/`export` preamble —
  the same +216 B class of effect recorded for the earlier B-01 split. The ceiling is a
  per-chunk constraint, and the per-chunk constraint improved by 16278 B.
- The `tables` sibling is preloaded in the same document, so the split costs the player no
  extra waterfall round trip; total js is still one parse of the same modules.
- Raw vite output: `build-before.txt` (committed config, built with
  `npx vite build --outDir dist-base`), `build-after.txt`.

## Behaviour gates (real exit codes, `gates-*.txt`)

| Gate | Result |
|---|---|
| `npm run build` (= `tsc --noEmit && vite build`) | exit 0 |
| `npm test` (vitest) | exit 0 — **325 tests / 32 files, 0 failed** |
| `node --test scripts/team-*.test.mjs scripts/sponsor-inbox.test.mjs scripts/package-dashboard.test.mjs scripts/publish-feature.test.mjs tools/team-supervisor/*.test.mjs` (CI step 2 form) | exit 0 — **# tests 59 / # pass 59 / # fail 0** |
| `npm run validate` | exit 0 — `behaviour: firstDrone=379 firstResearch=527 tick=18298 machines=8 links=18 drones=4 batches=1838 credits=157 nodes=3 \| 0 violation(s)` — **identical to the pinned line** |
| `npx tsx work/evidence/OPS-107-g1/print-fixture.mjs` | `docs/evidence/yard-mature.json` 26114 B, `schemaVersion 1`, `envelope.checksum eede3c4f`, `checksum(JSON.stringify(payload)) eede3c4f`, **round trip byte-identical: true** (`fixture-identity.txt`) |

## Browser witnesses (real Chromium via `playwright-core`, `measure-bld001-after.txt`)

`npx vite preview --port 8462` + `BUILD_LABEL=after-ops107 RUSTWAKE_URL=http://localhost:8462/ npx tsx scripts/measure-bld001.mjs`
→ `BLD-001/D-1 cell gates [after-ops107]: ALL PASS`, in all four cells (360x640 and 390x844,
text scale 1.0 and 2.0) and all passes:

- one dock row (`dock rows 1` in all 16 printed rows), smallest face between **44 px and
  50.2 px**, i.e. every face at or above the 44 px floor (16 rows = 4 cells x 4 passes);
- all 16 rows read `no page scroll (scrollHeight == innerHeight)` for their own viewport;
- `pageerrors 0` in **16 of 16** rows, so both chunks really executed in document order;
- the seeded engine read is unchanged: `{"machineId":1,"level":1,"plain":30,"prices":{"speed":40,"draw":30},…}`
  with toast `Need 40 credits · have 30`.

The same instrument on the base build (`npx vite preview --port 8461 --outDir dist-base`,
`measure-bld001-base.txt`) also prints `ALL PASS`, and a line-by-line comparison of the two
logs differs **only** in the header/label rows and in the time-based organic control pass
(one extra wall-clock tap: `primaryTaps 366` → `367`, so the plan step shown is one later).
The three seeded passes (A, C, D) are line-identical.

## Limitations

- Chunk names/hashes are emitted by Rollup; nothing was hand-edited.
- The organic control (`pass B`) is wall-clock driven, so its rows are not reproducible to
  the digit across runs — that is the source of the only diff lines against the base log.
- Not measured in this lane: human audio listening, real-device p95, remote CI at the head
  SHA (read separately below), and the served-route receipts (deployment belongs to the
  release engineer after merge).

## Rollback / save impact

None. One config file; the save layer is untouched and the v1 fixture stays at
`schemaVersion 1` / `eede3c4f` with a byte-identical round trip. Rolling back is `git revert`
of the single commit; a previously served asset set keeps working because every asset name
is content-hashed and referenced from the freshly built `index.html`.
