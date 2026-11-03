# STATUS

Active milestone: M2 (a useful small factory). M0 and M1 complete.

Last completed player-visible change: **the yard now flies a credit-priced drone fleet (B-28, D-38).**
`SimState.spares` sits beside the starter's own record and one new command, `drone.add`, buys the next
unit for `TUNING.droneAddBaseCost × 2^spares` = 45 / 90 / 180 / 360 credits up to `TUNING.fleetCap = 5`.
Every engine phase runs per unit (launch, land, batch completion), so two units hand over about 2 scrap/s
on the same finite wreck pool (spec 7.2: work rate, not new matter). The yard ladder gained exactly one
stage, `{ kind: "drone" }`, between the research node and the credit sink, and the objective card, the
dock primary, the yard panel's new `Drones` row, the ledger, the rate window, the return report, the
event-jump horizon and the renderer all read the same fleet. Refusals are explained locally: `Every drone
is already flying`, `Repair your drone first`.

- Current commit and remote sync status: **`__CODE_COMMIT__` ("Recovery drones fly as a fleet: 45 credits
  then doubling, five units, one new ladder stage (B-28)") is the code commit this pass pushes to
  `origin/main`**, with this checkpoint commit on top, as in previous passes. Earlier chain: `926d342`,
  `88e7257`, `cc0c665`, `1b0a091`, `b492074`, `5c95e33`, `5753efc`, `808dbc8`. CI remains unread in this
  environment (BL-06: `gh run list` asks for `gh auth login`, the unauthenticated API 404s for the private
  repository), so CI is reported as **pending**, not green.
- Checks run and actual results (this pass):
  - `npx vitest run` — **151 passed / 151** (18 files), no skipped tests, no deleted assertions. New
    `tests/simulation/fleet.test.ts` (8 cases: refusal before the repair leaves the state byte-identical,
    one payment for one unit and the idempotent retry of the same command id, the doubling price with the
    `fleet-full` refusal at the cap, ~1.9× deliveries with two units on one pool, `advance`/`advanceTo`
    byte parity with a fleet in flight, the ledger counting one cargo leg per unit and the offline report
    summing the fleet (13 deliveries in 600 ticks where one unit can land 12), one phrased step priced the
    same on card and dock, and the 240/900-round session marks). Pins restated from fresh measurement in
    `tests/simulation/cadence.test.ts` (`first.totals` 1 757 → **1 864**, plus `fleet 4`, a `drone` count
    in both orders, and fleet parity between them) and `tests/simulation/supply-window.test.ts` (floors
    {0,5,10,20} → machines 6/8/8/8, batches 1 558/1 949/1 864/1 753, idle ceiling `floor >= 5 ? 0 : 3`,
    ±6 % band, ready-units floor 10 against 2 at floor 0).
  - `npm run build` — `tsc --noEmit` clean; `index.html` 0.68 kB, CSS **5.59 kB (1.81 kB gzip)**,
    JS **213.12 kB (67.12 kB gzip)**, 50 modules. Artifacts `index-DDfppFoR.js` / `index-DudncZlS.css`,
    which is the build all seven images and the layout table come from. +0.71 kB gzip over `926d342`.
  - `npx tsx scripts/probe-supply.mjs` — shipped floor 10: **8 machines on 18 links, 4 drones, 1 864
    batches (62.1/min), 165 credits, 3 nodes**, first spare round **308**, signal lab round **931**, first
    node **975**. Full sweep floors {0, 5, 10, 20}: machines **6 / 8 / 8 / 8**, drones **5 / 4 / 4 / 4**,
    batches **1 558 / 1 949 / 1 864 / 1 753**, credits 1 / 194 / 165 / 78, aggregate 10.5 / 8.8 / 8.6 /
    7.6 %, first spare at rounds 104 / 198 / 308 / 385, first node – / 549 / 975 / 728. It rewrote the
    seed `docs/evidence/yard-mature.json` (tick 18 298, 8 machines, 18 links, 3 spares, `data 106`, three
    nodes) and `docs/evidence/2026-11-03-supply-window.md`.
  - `npx tsx scripts/probe-cadence.mjs` — both ladder orders still identical with the fleet in them:
    **1 864 batches, 62.1/min, 165 credits, 3 nodes, the same eight levels, 0 ambiguous rounds of 1 800**,
    8th machine at round 931 (D-34's conclusion survives; table regenerated).
  - `node scripts/measure-hud.mjs` — resting band **20.6 %** at 360 × 640 (19.1 % painted ink), 15.7 % at
    390 × 844, 14.5 % at 412 × 915, **21.9 %** landscape, 8.8 % tablet, 8.4 % desktop; ink peak **26.2 %**
    at 1.5 scale and **40.4 %** at 2.0; smallest dock target **44 × 46**; five targets at rest, three in
    build mode; **no document scroll in 108/108 states**; store, yard-record (now with the `Drones` row)
    and import panels all **0 px** inner scroll with Close on screen; 11 contrast pairs at or above AA,
    minimum **5.77:1**. Table: `docs/evidence/2026-11-03-hud-share.md`.
  - `node scripts/probe-dock.mjs` — now three ladder states, each in its own browser context (two tabs on
    one origin share localStorage, so a second tab mirrors the first): sell step 47/44/110/46/69 px in a
    46 px row at a **20.6 %** band; research step 44/44/130/44/54 px in a 54 px row at **21.8 %**; the new
    fleet step `Store 50×46 · Yard 44×46 · Add drone 45 credits 102×46 · Build 48×46 · Research 72×46` in
    a 46 px row at **20.6 %**, so the 44 px floor of D-37 holds for the new label.
  - `tests/perf/bench.test.ts` re-run: 12 h tick-by-tick **41.94 ms**, idle event-jump **< 1 ms**, 500
    machines **43.16 ms**, 100/50/5/1 machines over 10 000 ticks **14.05 / 6.53 / 0.99 / 0.77 ms**. The
    README table is restated from this run, with `926d342`'s numbers in the comparison column.
  - `node scripts/capture.mjs` — seven images in one **14:11–14:13** run. Organic phone (post-absence
    phase raised from 240 to **1 000 rounds**): absence `tick 1 010 → 433 020`, report `Ferrous +110 ·
    Nonferrous +550 · Steel +220 · Deliveries 342 · Batches 774 · Bottleneck storage-full`, final `tick
    442 690` with 5 machines (sorter L19 ×1111, furnace L17 ×496, copper separator L16 ×258, wire mill L15
    ×238, polymer recycler L15 ×85), 11 links, 24 credits, `research: {}`, dock primary `Sell 1 Steel /
    +10 credits`; `latest-yard.png` reads `Tick 442 700 · Machines 5 · Drones 5 · Links 11 · Credits 24 ·
    Save 14 569 characters` with a 50 px field. Selected recycler panel `Status Working`, `Batch 4%`,
    `Cycle 2.50s`, `Actual rate 0.10 batches/s · 60s window`, `Working 1% · waiting for input 99% · output
    waiting 0% · link 14% busy · power 100%`, 417-credit next step. Lease `t1-g56r → t1-g8rx`, tick
    442 710 → 442 739, revision 771 unchanged, promoted card `Sell 49 Scrap for 49 credits.`. Seeded
    desktop: absence `tick 36 018 → 468 028`, report `Nonferrous +294 · Plates +219 · Deliveries 168 ·
    Batches 525 · storage-full`, final `tick 468 078` with 8 machines on 18 links at L12–L14, `data 146`,
    `plates 376`, `nonferrous 308`, 43 credits, dock `Sell 60 Nonferrous / +120 credits`;
    `latest-research.png` and `latest-research-phone.png` both read `Data 146`.
- Screenshot evidence and capture provenance: all seven images under `docs/screenshots/` recaptured
  2026-11-03 14:11–14:13 local from artifacts `index-DDfppFoR.js` / `index-DudncZlS.css` — one run, one
  build. `latest-mobile.png`, `latest-machine-mobile.png`, `latest-yard.png`, `latest-multitab.png` at
  14:11; `latest-desktop.png`, `latest-research.png`, `latest-research-phone.png` at 14:13. The phone
  research image is still the **seeded** context: `research phone source: seeded mature yard`, because the
  organic 1 000-round session ends with `research: {}` (measured, recorded in the gallery row).
- Known blockers with exact unblock conditions:
  - BL-01 real-device frame/thermal traces: needs a connected device or a hosted trace.
  - BL-02 human first-feel playtest (8 of 10 unaided): needs fresh human testers.
  - BL-03 server authority, payments, public launch: needs provisioning and owner authorization.
  - BL-06 CI status read-back: needs an authenticated `gh` or a readable status check.
  - BL-11 human audio review: needs one listening pass.
    (BL-04, BL-05, BL-07 stay resolved.)
- Assumptions/decisions made: `docs/DECISIONS.md` D-01…D-37 as before, plus **D-38** (fleet added one unit
  at a time, credit-priced with a doubling curve, one new ladder stage above the upgrade sink; the two
  rejected alternatives were a bigger/shorter delivery cycle and a bigger dock store). Save schema is
  unchanged (1); `migrate` zero-fills `spares` and normalises every unit through `unitOf`/`flightOf`, so a
  pre-fleet v1 save loads and runs the starter exactly as before, and `validateSim` now checks every
  unit's counters and cargo leg.
- Next three bounded tasks:
  1. **B-12** content validator in CI: run the typed-content checks in the pipeline so a missing
     reference, an invalid footprint, or a zero-time cycle fails the build.
  2. **B-10** localisation readiness: move the remaining literals into keys with defaults behind the
     shared number/time formatter, with the panel text expansion re-measured at 2.0 scale.
  3. **B-02** worker catch-up: move the 12 h catch-up off the main thread with cancellation and publish a
     measured stall histogram against the 100 ms target of spec 21.5.
- Long-running processes owned by this session: the `vite preview` server on port 4173 is stopped at the
  end of this pass; nothing else runs.
- Resume instructions: read this file, then `docs/BACKLOG.md`. Run `npx vitest run` before editing;
  `tests/simulation/fleet.test.ts` holds the fleet contract, `tests/persistence/transfer.test.ts` the
  export/import contract, `tests/ui/app.test.tsx` the tutorial walk and the card/dock pairing,
  `tests/simulation/cadence.test.ts` the two-order comparison, `tests/simulation/chain.test.ts` the ladder
  and self-play regression, `tests/simulation/supply-window.test.ts` the floor sweep,
  `tests/ui/hud-layout.test.ts` the chip budget. Standard loop: `npx vitest run` → `npm run build` →
  `npm run preview` (4173, background) → `npx tsx scripts/probe-supply.mjs` (writes the seed) and
  `npx tsx scripts/probe-cadence.mjs` if simulation-facing → `node scripts/measure-hud.mjs` (~70 s, only
  when `src/ui` changed) → `node scripts/capture.mjs` (~17 min now that the phone phase runs 1 000 rounds;
  it reads the seed once at start) → README, STATUS, BACKLOG, DECISIONS → commit →
  `git push origin HEAD:main` → verify. Any `src/` edit invalidates the seven images until a fresh
  capture run.
