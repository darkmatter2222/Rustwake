# STATUS

Active milestone: M2 (a useful small factory). M0 and M1 complete.

Last completed player-visible change: **the 12 h catch-up now runs off the main thread (B-02, D-41).**
`src/game/workers/catchup.ts` carries the versioned protocol, the single `handleCatchUp` function and the
client; `catchup.worker.ts` is the worker entry that calls the same function. Absences of 20 000 ticks
(2 000 s) or more are posted to the worker, the frame loop paints but does not tick during that handoff,
the first 32 taps typed in the window are queued and replayed on the adopted ledger, and one line
(`Catching your yard up`) is painted under the objective card. Shorter gaps keep the inline branch, which
is what jsdom exercises.

- Current commit and remote sync status: **`906d542`** is the code commit of this pass ("Run the 12 h
  catch-up off the main thread (B-02)"), pushed with `git push origin HEAD:main` and verified by
  `git ls-remote origin refs/heads/main` → `906d542650a76384b40ad41f00bef25422ef70b9` (fast-forward from
  `41bd4a6`, no concurrent change). The checkpoint commit(s) sit on top. CI remains unread in this
  environment, so CI is reported **pending**, not green (BL-06: `gh run list` asks for `gh auth login`,
  the unauthenticated API 404s for the private repository).
- Checks run and actual results (this pass):
  - `npx vitest run` — **171 passed / 171** (21 files): six new cases in
    `tests/simulation/catchup-worker.test.ts` (protocol refusal, handler-versus-direct equivalence,
    the worker entry answering one request with one versioned result, the inline client before and after
    a `cancel()`, the store settling a 12 h window once with the same ledger as the handler, and the
    20 000-tick threshold keeping a short gap inline) plus one new case in `tests/ui/i18n.test.tsx`
    (the `Catching your yard up` line is painted only while a handoff is reported pending). The 164
    pre-existing cases still pass, which is the byte-identity proof for the economy.
  - `npm run validate` — **0 violations**: `content: 0 violation(s) in 3 ms`, behaviour marks still
    `firstDrone=308 firstResearch=975 tick=18 298 machines=8 links=18 drones=4 batches=1 864
    credits=165 nodes=3`, equal to the published supply-window rows.
  - `npm run typecheck` clean. `npm run build` — `index.html` 0.68 kB, CSS **5.76 kB (1.83 kB gzip)**,
    JS **224.63 kB (70.19 kB gzip)** plus the **13.02 kB** worker chunk, 52 modules. Artifacts
    `index-ZDmIvNkZ.js`, `index-B8G4dl_D.css`, `catchup.worker-DphWaCEx.js`.
  - `node scripts/probe-catchup.mjs` (new) — the 12 h absence in a page at 390 × 844, one context per
    path: **worker** 0 long tasks (the observer reports ≥ 50 ms only), handoff 405 ms wall, input
    acknowledgement 29 ms, one `.reconcile` node after the gate tap; **inline** one long task of
    **281 ms** (1 over the 100 ms target of spec 21.5), input acknowledgement 31 ms, no reconcile node.
    Both produced the byte-identical report. Table in
    `docs/evidence/2026-11-03-catchup.md`.
  - `node scripts/measure-hud.mjs` (re-run, `src/ui` changed) — restated in
    `docs/evidence/2026-11-03-hud-share.md`: resting ink **19.1 %** and band **20.6 %** at 360 × 640,
    band 21.9 % landscape, 2.0-scale ink peak **38.3 %**, no document scroll in **108/108** states,
    **0 px** inner scroll in every panel at all three scales, minimum contrast **5.77:1** over 11 pairs,
    smallest dock target **44 × 46**. Identical to the previous pass, so the reconcile line does not move
    the resting layout.
  - Not re-run, still valid: the headless CPU table (`tests/perf/bench.test.ts`, 12 h tick-by-tick
    **41.9 ms**), `scripts/probe-supply.mjs` and `scripts/probe-cadence.mjs` — the simulation's arithmetic
    is untouched (the engine imports no worker code, the worker calls the same `catchUp`), and the
    validator's behaviour half reproduces the published numbers exactly. `scripts/probe-dock.mjs` was not
    re-run: no dock label changed.
- Screenshot evidence and capture provenance: all **seven** images were recaptured from this build in one
  run at 17:22–17:24 local (artifact `index-ZDmIvNkZ.js`), and the file timestamps match the printed lines:
  `latest-mobile.png` 17:22:26, `latest-machine-mobile.png`/`latest-yard.png` 17:22:27,
  `latest-multitab.png` 17:22:28, `latest-desktop.png` 17:23:53, `latest-research.png` 17:23:54,
  `latest-research-phone.png` 17:23:55. The README gallery rows and their capture times are written from
  that run's own printed state lines (mobile absence `tick 1 020 → 433 030`, tick 442 700, 306 credits,
  dock `Sell 44 Scrap / +44 credits`; desktop absence `tick 150 419 → 582 419`, tick 582 479, `data 146`,
  `plates 376`, dock `Sell 60 Nonferrous / +120 credits`). The phone research image remains the seeded capture
  (`research phone source: seeded mature yard`), tracked as **B-29**; that one file re-rendered
  byte-identical (116 613 bytes) from the unchanged seed, and the other six changed size as expected.
  The seed `docs/evidence/yard-mature.json` is unchanged from the 13:43 supply-probe write (tick 18 298,
  8 machines, 18 links, four flying units, `data 106`).
- Known blockers with exact unblock conditions:
  - BL-01 real-device frame/thermal traces: needs a connected device or a hosted trace. The new
    `docs/evidence/2026-11-03-catchup.md` is page-level Chrome, so it does not close this row.
  - BL-02 human first-feel playtest (8 of 10 unaided): needs fresh human testers.
  - BL-03 server authority, payments, public launch: needs provisioning and owner authorization.
  - BL-06 CI status read-back: needs an authenticated `gh` or a readable status check.
  - BL-11 human audio review: needs one listening pass.
    (BL-04, BL-05, BL-07 stay resolved.)
- Assumptions/decisions made: `docs/DECISIONS.md` D-01…D-40 as before, plus **D-41** (off-thread catch-up
  from 20 000 ticks with a versioned handoff, one adoption path, a painted-but-not-ticked frame loop, a
  32-deep intent queue, and a 2 s inline fallback). Save schema is unchanged (1); no tuning value changed.
- Next three bounded tasks:
  1. **B-29** organic research panel at phone size: raise the phone session's post-absence phase to the
     1 800 rounds the headless driver runs (or let the ladder prefer the nearest payable blueprint), then
     re-capture and give `latest-research-phone.png` organic provenance.
  2. **B-18** follower-tab smoothness: interpolate a mirrored tab's sprites between the last two adopted
     snapshots (or raise the adopt cadence at a measured cost), with one trace at 390 × 844.
  3. **B-30** long-session soak: one 30-minute repeated-action run with the JS heap and DOM node count
     recorded at fixed intervals plus the worker handoff cost after several absences, published as a
     series so a slope is visible (spec 21.5). **B-31** (a real `Worker` in the automated suite) is the
     natural follow-up to this pass.
- Long-running processes owned by this session: none. The `vite preview` server that ran on port 4173
  during this pass was stopped at its end (`Get-NetTCPConnection -LocalPort 4173` → no listener). Start a
  fresh one with `npm run preview -- --port 4173 --strictPort` in the background when a probe or capture
  is needed.
- Resume instructions: read this file, then `docs/BACKLOG.md`. Run `npm run validate` and
  `npx vitest run` before editing; `tests/simulation/catchup-worker.test.ts` is where the handoff is
  pinned, `tests/ui/i18n.test.tsx` is where a new sentence gets pinned and where the raw-key scan lives,
  `tests/content/validate.test.ts` is the injected-fault gate, `tests/simulation/fleet.test.ts` the fleet
  contract, `tests/persistence/transfer.test.ts` the export/import contract, `tests/ui/app.test.tsx` the
  tutorial walk and the card/dock pairing, `tests/simulation/cadence.test.ts` the two-order comparison,
  `tests/simulation/chain.test.ts` the ladder and self-play regression, `tests/simulation/supply-window.test.ts`
  the floor sweep, `tests/ui/hud-layout.test.ts` the chip budget. Standard loop: `npm run validate` and
  `npx vitest run` → `npm run build` → `npm run preview` (4173, background) → `npx tsx scripts/probe-supply.mjs`
  (writes the seed) and `npx tsx scripts/probe-cadence.mjs` if simulation-facing → `node scripts/probe-dock.mjs`
  if the dock changed → `node scripts/probe-catchup.mjs` if the catch-up path changed →
  `node scripts/measure-hud.mjs` (~70 s, only when `src/ui` changed) → `node scripts/capture.mjs`
  (~17 min, only when `src/` changed, it reads the seed once at start) → README, STATUS, BACKLOG,
  DECISIONS → commit → `git push origin HEAD:main` → verify with `git ls-remote origin refs/heads/main`.
  Any `src/` edit invalidates the seven images until a fresh capture run; a change limited to
  `src/game/content/validate.ts` does not, because the app does not import it. Commit-message files: write
  them with `-Encoding ascii`, because PowerShell's `utf8` writes a BOM that then appears in the committed
  subject line.
