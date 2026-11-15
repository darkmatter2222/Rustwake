# INVALID census artifacts — mis-served preview (superseded, preserved)

**Do not cite these numbers as `rw/151` evidence.**

The pass-9 U03 census committed at `fa3d54323cfe8847017be6cdad7c43fb0e2dfae2`
(`legibility-census.json`, `generated 2026-11-15T14:16:52.556Z`, `baseSha 1d98bfb…`,
`url http://localhost:4173/`, **32** `captures/legibility-<vp>-<w>x<h>-dpr<d>-<scale>.png`)
was measured against the **wrong build**.

## What happened

- `scripts/measure-legibility.mjs:41` defaults to `RUSTWAKE_URL ?? "http://localhost:4173/"`.
- Port **4173 was already held by another worktree's preview**: PID 10320,
  `node …/rw-qwen/rw-217/node_modules/…/vite.js preview --port 4173 --strictPort`,
  started **2026-11-14 19:17:40** local, still listening.
- The preview started for this pass (PID 24172, `rw-151` worktree, started
  **2026-11-15 09:15:00** local) logged
  `Port 4173 is in use, trying another one... Local: http://localhost:4174/`
  and bound **4174** instead. The census was left pointed at **4173**.
- Positive bundle-identity check (after the fact):
  - `http://localhost:4173/` serves `assets/index-DJmWAE3x.js` (**rw-217**).
  - `http://localhost:4174/` serves `assets/index-BHuJAK_X.js` + `assets/index-GWtdmgwN.css`,
    byte-identical names to this worktree's `dist/index.html` built from `db6eadb…`.
- `baseSha` in the report is computed from **git in this worktree**, not from the served
  bundle, so the JSON *claimed* `rw/151` provenance while the pixels came from `rw-217`.

## Disposition

- Every number, floor verdict, defect label and PNG in this directory is **invalid for #151**
  and is preserved only so the mistake is auditable. Nothing here was deleted or rewritten.
- The three legacy `legibility-A1*-390x844-dpr2.png` files that shared the directory are
  **not** part of this run (added by PR #29, commit `5610528`); they were moved back to
  `../captures/` unchanged.
- The census was **re-run against this worktree's own build** on `http://localhost:4174/`
  with the served entry chunk asserted equal to `dist/index.html` before measuring
  (`baseSha f6871b55d06c79545e1881259c857d3e8bd945a9`, `generated 2026-11-15T14:29:52.653Z`,
  entry `index-BHuJAK_X.js` 868378 B, 0 page errors, 32 PNGs). The valid report is
  `../legibility-census.json`; see `../census-provenance.txt` and the pass-9 record in
  `docs/vision/evidence/151-first-playable.md`.
- **The re-run reproduced the same substantive findings** (`u03AllPass: false`, 65
  floorFailures = 32 `tapTargetPx` + 32 `u03` + 1 `cardFillPct`; dock price
  `[12, 15, 16.2, 21.6]`; monotonic 120/120; land844 @200% card fill 44.968%; six clipped
  dock-face-label rows on the three phones; `minTargetPx 0` from the hidden "Home" control).
  Agreement does **not** retro-validate the mis-served run: only the re-run is citable.
- No floor, threshold or check was changed. The V05 capture harness is **not** affected:
  `scripts/capture-g1-151.mjs:122` spawns its own preview with `--strictPort` on **:4168**
  and kills it on exit; :4168 was free before and after that run.
