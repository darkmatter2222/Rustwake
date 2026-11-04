# STATUS

Active milestone: M2 (a useful small factory). M0 and M1 complete.

Last completed player-visible change: **a sell now leaves each consuming machine's own input window in the
store (B-29's named cause, decision D-42).** `sellableAmount` bounds a tranche by
`TUNING.reserveFloor + machineInputDemand(s, resource)`, where the new helper sums, per consumer,
`min(inputBuffer + bufferBonus, perBatch × PULL_LOOKAHEAD_BATCHES + bufferBonus) − inBuf[resource]` — the same
two-batch window `pullFromStore` draws, so the store has one meaning for "surplus" in both readers. The
engine's pull rule is unchanged (`held − RESERVE_FLOOR`); the store-fallback variant of `pullFromStore` was
measured and reverted (7 machines, 1 157 batches, 0 nodes).

- Current commit and remote sync status: the head before this pass was **`efd25c2`** (the B-02 checkpoint);
  this pass's code commit is `906d542` + 1, written below after the commit is made. `git push origin HEAD:main`,
  then verified with `git ls-remote origin refs/heads/main`. CI remains unread in this environment, so CI is
  reported **pending**, not green (BL-06: `gh run list` asks for `gh auth login`).
- Checks run and actual results (this pass):
  - `npm run validate` — **0 violations**, behaviour marks `firstDrone=268 firstResearch=478 tick=18298
    machines=8 links=18 drones=5 batches=1902 credits=82 nodes=3`, equal to the restated supply-window rows.
  - `npx vitest run` — **172 passed / 172** (21 files): one new case in `tests/simulation/chain.test.ts`
    ("leaves the consuming machine's own window in the store (D-42)", 28-unit tranche from a 40-unit stock,
    the mill's own window left behind, and the mill still working after the sell); the three measured pins in
    `tests/content/validate.test.ts`, `tests/simulation/cadence.test.ts` and
    `tests/simulation/supply-window.test.ts` restated to this build (fleet 4 → 5, totals 1 864 → 1 902,
    ±7 % band, floor-0 ready max ≤ 4).
  - `npm run typecheck` clean. `npm run build` — `index.html` 0.68 kB, CSS **5.76 kB (1.83 kB gzip)**,
    JS **224.94 kB (70.28 kB gzip)** plus the **13.02 kB** worker chunk, 52 modules. Artifacts
    `index-CRPFBKba.js`, `index-B8G4dl_D.css`, `catchup.worker-DphWaCEx.js`.
  - `npx tsx scripts/probe-supply.mjs` (re-published) — floors {0, 5, 10, 20} give **6 / 8 / 8 / 8** machines
    and **1 533 / 2 028 / 1 902 / 1 792** batches, first spare at 104 / 198 / 268 / 330, first node at
    – / 738 / 478 / 691; the floor-10 yard ends with `plates 103 circuits 40 data 76` on 18 links with no dead
    link. `npx tsx scripts/probe-cadence.mjs` — both ladder orders finish at **1 902** batches (63.4/min),
    0 ambiguous rounds of 1 800. Both tables and the seed `docs/evidence/yard-mature.json` regenerated.
  - `npx tsx scripts/probe-phone.mjs 1800 12 10` (new script) — the phone path in the engine: builds all eight
    blueprints, `data > 0` first at round **143**, still `research {}` at 1 800 rounds; at 0 h absence the node
    arrives at round **453**. Floor sweep at 12 h: 10 / 5 / 3 / 0 all still `research {}`, so the absence, not
    the floor, is the remaining gap (B-29).
  - `node scripts/measure-hud.mjs` (re-run) — restated in `docs/evidence/2026-11-03-hud-share.md`: resting ink
    **19.2 %** and band **20.6 %** at 360 × 640, band 21.9 % landscape, 26.1 % ink peak at 1.5 and **38.5 %** at
    2.0, no document scroll in **108/108** states, **0 px** inner scroll in every panel, minimum contrast
    **5.77:1**, smallest dock target **44 × 46**.
  - `node scripts/probe-dock.mjs` — three ladder states, band **20.6 %–21.8 %**, smallest target **44 px** wide.
  - `npx vitest run tests/perf/bench.test.ts` (isolated, the way the README table is quoted) — 12 h tick-by-tick
    **41.82 ms**, 500 machines **45.73 ms**, 100/50/10/1-machine 13.57 / 6.48 / 0.99 / 0.75 ms; inside the full
    172-test run the same 12 h case reads ≈80 ms because the workers contend, which the README now says.
  - `node scripts/capture.mjs` — one 18:59–19:00 run over this build, seven images, printed lines used verbatim
    in the README gallery.
- Screenshot evidence and capture provenance: all **seven** images recaptured from this build (artifact
  `index-CRPFBKba.js`) at **18:59–19:00** local: `latest-mobile.png`/`latest-machine-mobile.png` 18:59:01,
  `latest-yard.png` 18:59:02, `latest-multitab.png` 18:59:03, `latest-desktop.png` and `latest-research.png`
  19:00:28, `latest-research-phone.png` 19:00:30. Organic mobile session: absence `tick 1 010 → 433 020`
  (`Ferrous +110 · Nonferrous +550 · Steel +220 · Deliveries 342 · Batches 774 · Bottleneck Storage full`),
  1 000 further rounds → tick 442 760, **6 machines on 13 links**, five drones, 402 credits, dock
  `Sell 1 Polymer / +8 credits`. Seeded desktop: absence `tick 35 354 → 467 354` (`Nonferrous +267 · Plates
  +201 · Deliveries 150 · Batches 480 · Storage full`), tick 467 414, `data 102`, `plates 406`, 89 credits,
  three nodes known. Lease `t1-9wps → t1-c3j5`, tick 442 780 → 442 810 at unchanged revision 661. The phone
  research image is still the seeded capture (`research phone source: seeded mature yard`, **B-29**).
- Known blockers with exact unblock conditions:
  - BL-01 real-device frame/thermal traces: needs a connected device or a hosted trace.
  - BL-02 human first-feel playtest (8 of 10 unaided): needs fresh human testers.
  - BL-03 server authority, payments, public launch: needs provisioning and owner authorization.
  - BL-06 CI status read-back: needs an authenticated `gh` or a readable status check.
  - BL-11 human audio review: needs one listening pass.
    (BL-04, BL-05, BL-07 stay resolved.)
- Assumptions/decisions made: `docs/DECISIONS.md` D-01…D-41 as before, plus **D-42** (one stated surplus figure:
  a sell leaves the reserve floor plus the machines' two-batch windows). Save schema unchanged (1); no tuning
  value changed, so `TUNING.reserveFloor` stays 10.
- Next three bounded tasks:
  1. **B-29** organic research panel at phone size: the cause is named (one link per material, a machine-sourced
     input link that stops carrying when the tray empties). Try re-sourcing that link from the store while the
     store is stocked (replace rather than add, so D-28's one-link rule survives), re-measure
     `npx tsx scripts/probe-phone.mjs 1800 12 10` and re-capture.
  2. **B-18** follower-tab smoothness: interpolate a mirrored tab's sprites between the last two adopted
     snapshots (or raise the adopt cadence at a measured cost), with one trace at 390 × 844.
  3. **B-30** long-session soak: one 30-minute repeated-action run with the JS heap and DOM node count
     recorded at fixed intervals plus the worker handoff cost after several absences, published as a
     series so a slope is visible (spec 21.5). **B-31** (a real `Worker` in the automated suite) follows it.
- Long-running processes owned by this session: the `vite preview` server on **4173** (background shell) is
  stopped at the end of this pass; `Get-NetTCPConnection -LocalPort 4173` should show no listener. Start a fresh
  one with `npm run preview -- --port 4173 --strictPort` when a probe or capture is needed.
- Resume instructions: read this file, then `docs/BACKLOG.md`. Run `npm run validate` and
  `npx vitest run` before editing; `tests/simulation/chain.test.ts` holds the D-42 window case,
  `tests/simulation/cadence.test.ts` and `tests/simulation/supply-window.test.ts` pin the measured marks
  (restate them whenever the ladder or the sell rule changes), `tests/simulation/catchup-worker.test.ts` the
  handoff, `tests/content/validate.test.ts` the injected faults, `tests/persistence/transfer.test.ts` the
  export/import contract, `tests/ui/app.test.tsx` the tutorial walk, `tests/ui/hud-layout.test.ts` the chip
  budget. Standard loop: `npm run validate` and `npx vitest run` → `npm run build` → `npm run preview`
  (4173, background) → `npx tsx scripts/probe-supply.mjs` (writes the seed) and `npx tsx
  scripts/probe-cadence.mjs` if simulation-facing → `npx tsx scripts/probe-phone.mjs 1800 12 10` if the
  absence path or the ladder changed → `node scripts/probe-dock.mjs` if the dock changed → `node
  scripts/probe-catchup.mjs` if the catch-up path changed → `node scripts/measure-hud.mjs` (~70 s, only when
  `src/ui` changed) → `node scripts/capture.mjs` (~17 min, only when `src/` changed, it reads the seed once at
  start) → README, STATUS, BACKLOG, DECISIONS → commit → `git push origin HEAD:main` → verify with `git
  ls-remote origin refs/heads/main`. Any `src/` edit invalidates the seven images until a fresh capture run; a
  change limited to `src/game/content/validate.ts` does not, because the app does not import it.
  Commit-message files: write them with `-Encoding ascii`, because PowerShell's `utf8` writes a BOM that then
  appears in the committed subject line.
