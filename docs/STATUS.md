# STATUS

Active milestone: M2 (a useful small factory). M0 and M1 complete.

Last completed player-visible change: **the headless ladder now runs the same economy the browser
does (D-33), and the two remaining balance questions in M2 are measured rather than assumed (B-21,
B-15, B-25).** The four 30-minute self-play drivers never claimed the one-time onboarding export
contract, so every sell was rejected and the yard finished with eight level-1 machines and 0 credits;
with T7's single `contract.export` press replayed in the loop, the same half hour ends at **8 machines
at L13/L12/L10/L11/L10/L9/L8/L8, 1 757 batch completions on 18 links, 25 credits, 3 research nodes**,
and the step histogram gains `upgrade: 390`. B-21 closed on measurement: swapping `build` and
`upgrade` in the ladder changes nothing (identical totals in both orders) because **0 of 1 800 rounds**
have both branches affordable. B-25 closed with the mechanism recorded: one starter drone delivers
1 scrap/s under an L13 sorter's ~1.2/s, so after a saturating 12 h absence every material pins at the
reserve floor and the organic phone session stops at four machines with `research: {}`.

- Current commit and remote sync status: this pass is uncommitted at the time of writing; the previous
  head is `b492074` (checkpoint) over `5c95e33` (B-26/B-27), both on `origin/main`. Push with
  `git push origin HEAD:main` and verify with `git rev-parse HEAD origin/main`. Earlier chain:
  `5753efc`, `808dbc8`, `0a4964e`, `266d9d6`, `fc99db1`, `4ac39c5`, `0506f46`, `57f15af`.
  CI remains unread in this environment (BL-06: `gh run list` asks for `gh auth login`, the
  unauthenticated API 404s for the private repository), so CI is reported as **pending**, not green.
- Checks run and actual results (this pass):
  - `npx vitest run` — **132 passed / 132** (16 files), no skipped tests, no deleted assertions. One
    new file, `tests/simulation/cadence.test.ts`: it runs the ladder twice with only the
    `build`/`upgrade` pair swapped and pins 8 machines, 1 757 batches, 25 credits, 3 nodes, identical
    levels and histograms, and the 0-ambiguous-round count. Three driver loops (`chain.test.ts`,
    `supply-window.test.ts`, `scripts/probe-supply.mjs`, `scripts/probe-cadence.mjs`) gained the one
    `contract.export` claim; two existing expectation sets were restated to the new numbers, not
    removed.
  - `npm run build` — **unchanged**: `index.html` 0.68 kB, CSS 5.15 kB (1.69 kB gzip), JS 207.60 kB
    (**65.64 kB gzip**), 50 modules; artifacts still `index-BONbSNIw.js` / `index-BTmHMPUU.css`, so
    the layout table and every screenshot keep their provenance (no `src/` change this pass).
  - `npx tsx scripts/probe-supply.mjs` — floor sweep restated with the market open: floors
    {0, 5, 10, 20} → machines **5 / 7 / 8 / 8**, batches **1 456 / 1 457 / 1 757 / 1 677**, credits
    67 / 84 / 25 / 84, nodes 0 / 0 / 3 / 3. 10 stays as the shipped floor. Rewrites
    `docs/evidence/2026-11-03-supply-window.md` and the seed `docs/evidence/yard-mature.json`.
  - `npx tsx scripts/probe-cadence.mjs` — both orders: 8 machines, 1 757 batches (58.6/min), 25
    credits, 3 nodes, `ambiguous 0 / 1 800`, histogram `sell 864, build 534, upgrade 390, connect 9,
    research 3` → `docs/evidence/2026-11-03-cadence.md`.
  - `node scripts/capture.mjs` — six images in one 11:28–11:30 run (see the README gallery). Organic
    phone: absence `tick 1 020 → 433 030`, report `Ferrous +110 · Nonferrous +549 · Steel +219 ·
    Deliveries 342 · Batches 773 · Bottleneck storage-full`, 240 post-absence rounds, final
    `tick 435 390` with 4 machines (sorter L14 ×670, furnace L12 ×276, polymer recycler L10 ×15,
    copper separator L11 ×45), 9 links, 100 credits, `research: {}`, dock primary
    `Sell 1 Steel / +10 credits`; selected recycler panel `Cycle 3.16s`, `Actual rate 0.08 batches/s ·
    60s window`, `Working 0% · waiting for input 100% · output waiting 0% · link 12% busy · power 100%`.
    Lease `t1-jbxx → t1-5et5`, tick 435 400 → 435 431, revision 176 unchanged, promoted card
    `Sell 2 Steel for 20 credits.`. Seeded desktop: absence `tick 26 526 → 458 536`, report `Ferrous
    +154 · Wire +394 · Plates +138 · Data +114 · Deliveries 139 · Batches 992 · storage-full`, final
    `tick 458 586` with 8 machines on 18 links (L12–L15), `data 124`, `wire 404`, `plates 148`, 0
    credits, three nodes known, dock `Sell 60 Ferrous / +120 credits`. Both research images read
    `Data 124`; `research phone source: seeded mature yard`.
  - Headless CPU table unchanged on purpose: no simulation code changed, so `tests/perf/bench.test.ts`
    still describes this build.
- Screenshot evidence and capture provenance: all six images under `docs/screenshots/` recaptured
  2026-11-03 11:28–11:30 local from artifacts `index-BONbSNIw.js` / `index-BTmHMPUU.css` — one run, one
  build. `latest-mobile.png`, `latest-machine-mobile.png`, `latest-multitab.png` at 11:28,
  `latest-desktop.png` and `latest-research.png` at 11:30, `latest-research-phone.png` at 11:30 (new
  file, the phone-size research panel from the seeded mature context). The README gallery carries the
  per-image tick, machine, credit and dock readings.
- Known blockers with exact unblock conditions:
  - BL-01 real-device frame/thermal traces: needs a connected device or a hosted trace.
  - BL-02 human first-feel playtest (8 of 10 unaided): needs fresh human testers.
  - BL-03 server authority, payments, public launch: needs provisioning and owner authorization.
  - BL-06 CI status read-back: needs an authenticated `gh` or a readable status check.
  - BL-11 human audio review: needs one listening pass.
    (BL-04, BL-05, BL-07 stay resolved; BL-07 is now closed at phone size as well.)
- Assumptions/decisions made: `docs/DECISIONS.md` D-01…D-32 as before, plus **D-33** (drivers claim
  `contract.export` once three steel exist, mirroring `offline.ts`), **D-34** (the ladder's
  build-before-upgrade order is kept, 0 ambiguous rounds), **D-35** (one starter drone is the binding
  constraint, so the phone research image is seeded and the organic path is tried first). Save schema
  is unchanged (1); no migration was needed.
- Next three bounded tasks:
  1. **B-06** save export/import: versioned JSON export, validating import, corrupt file keeps the
     previous state (spec 25.3 case 8). One HUD audit plus one capture re-run afterwards.
  2. **B-28** second delivery drone (or a delivery-sized store) inside the first 30 minutes, so the
     post-absence yard keeps a build-sized surplus and the organic phone session unlocks Research
     inside 240 rounds; re-measure the floor sweep and the cadence table with it.
  3. **B-12** content validator in CI: run the typed-content checks in the pipeline.
- Long-running processes owned by this session: the `vite preview` server on port 4173 (started for
  the measurements and the captures; stop it at the end of the pass). Nothing else runs.
- Resume instructions: read this file, then `docs/BACKLOG.md`. Run `npx vitest run` before editing;
  `tests/simulation/cadence.test.ts` holds the two-order comparison, `tests/simulation/chain.test.ts`
  the ladder and self-play regression, `tests/simulation/supply-window.test.ts` the floor sweep,
  `tests/ui/hud-layout.test.ts` the chip budget, `tests/ui/app.test.tsx` the tutorial walk and the
  card/dock pairing. Standard loop: `npx vitest run` → `npm run build` → `npm run preview` (4173,
  background) → `npx tsx scripts/probe-supply.mjs` (writes the seed) and `npx tsx
  scripts/probe-cadence.mjs` if simulation-facing → `node scripts/measure-hud.mjs` (~70 s, only when
  `src/ui` changed) → `node scripts/capture.mjs` (~5 min, read the seed once at start) → README,
  STATUS, BACKLOG, DECISIONS → commit → `git push origin HEAD:main` → verify.
