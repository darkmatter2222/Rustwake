# STATUS

Active milestone: M2 (a useful small factory). M0 and M1 complete.

Last completed player-visible change: **the yard now moves between devices (B-06, D-36), and the
dock keeps its 44 px floor with five targets (D-37).** A **Yard** target joins the dock when the
tutorial ends; its panel is two pages — the yard record with the export field, then the import field —
so exactly one textarea is on screen and the panel keeps 0 px inner scroll at the 2.0 text scale.
`store.exportSave()` returns byte-identical text to what the checkpoint writes; `store.importSave()`
validates through the same `decodeSave` gate, refuses while the tab is a read-only follower, and on
success swaps the whole yard in one step while taking **this** device's clock as the absence
reference, so two devices cannot stack overlapping 12 h windows. A refused file leaves the live state
byte-identical. The dock change came out of the same audit: with five targets the shortest label had
fallen to 41.5 px, so `min-width: 44px`, a 6 px gap, 0.88rem labels, and `flex: 6 1 auto` on the
primary brought both the target floor and the 20.6 % band back.

- Current commit and remote sync status: the code commit of this pass is the pushed `origin/main`
  head; its hash is written into the checkpoint commit immediately after it, as in previous passes.
  Earlier chain: `cc0c665`, `1b0a091`, `b492074`, `5c95e33`, `5753efc`, `808dbc8`, `0a4964e`,
  `266d9d6`, `fc99db1`, `4ac39c5`. CI remains unread in this environment (BL-06: `gh run list` asks
  for `gh auth login`, the unauthenticated API 404s for the private repository), so CI is reported
  as **pending**, not green.
- Checks run and actual results (this pass):
  - `npx vitest run` — **143 passed / 143** (17 files), no skipped tests, no deleted assertions.
    New `tests/persistence/transfer.test.ts` (9 cases: byte-identical export, identical restore in
    another store, idempotent second import, the imported-clock rule with a reopened store whose
    report is `null`, damaged checksum, newer schema, unparseable text, empty text, the violated
    invariant named in `detail`, settings carried across, a follower's refusal). Two new cases in
    `tests/ui/app.test.tsx`: the Yard target after `tutorial = 9` with the record page and its
    `{"schemaVersion":1,…}` field, and the full import path (Apply settles the yard at the source
    tick 698 with one machine; a damaged paste leaves the serialised state equal). Controlled-field
    typing goes through the `HTMLTextAreaElement` value setter, because React otherwise treats the
    input event as its own and drops the change.
  - `npm run build` — `tsc --noEmit` clean; `index.html` 0.68 kB, CSS **5.59 kB (1.81 kB gzip)**,
    JS **210.60 kB (66.41 kB gzip)**, 50 modules. Artifacts `index-BKbcOrrd.js` /
    `index-DudncZlS.css`, which is the build all seven images and the layout table come from.
  - `node scripts/measure-hud.mjs` — at the default text scale the resting band is **20.6 %** at
    360 × 640 (19.1 % painted ink), 15.7 % at 390 × 844, 14.5 % at 412 × 915, **21.9 %** in
    landscape, 8.8 % tablet, 8.4 % desktop; smallest dock target **44 × 46** px at 360 × 640; five
    dock targets at rest, three in build mode; **no document scroll in 108/108 measured states**
    (six sizes × three scales × six states: return report, rest, build, store, yard record, import
    page); store, yard-record and import panels all report **0 px** inner scroll with Close on
    screen; no clipped box; 11 contrast pairs at or above AA, minimum **5.77:1**, the new
    `.panel__code` field at 17.76:1. Table: `docs/evidence/2026-11-03-hud-share.md`.
  - `node scripts/probe-dock.mjs` (new, ~1 s) — the per-button boxes for both ladder states at
    360 × 640: sell step 47/44/110/46/69 px at 46 px row height, band 20.6 %; research step
    (`Research Efficient Cutters`, the longest label the ladder produces) 44/44/130/44/54 px at a
    54 px row, band 21.8 %.
  - `npx tsx scripts/probe-supply.mjs` — the floor sweep reproduces exactly (floors {0, 5, 10, 20}
    → machines **5 / 7 / 8 / 8**, batches **1 456 / 1 457 / 1 757 / 1 677**, credits 67 / 84 / 25 /
    84, nodes 0 / 0 / 3 / 3), so the UI work is behaviour-neutral; it also rewrote the seed
    `docs/evidence/yard-mature.json` that the capture uses.
  - `node scripts/capture.mjs` — **seven** images in one 12:41–12:43 run. Organic phone: absence
    `tick 1 010 → 433 020`, report `Ferrous +110 · Nonferrous +550 · Steel +220 · Deliveries 342 ·
    Batches 774 · Bottleneck storage-full`, 240 post-absence rounds, final `tick 435 380` with 4
    machines (sorter L14 ×670, furnace L12 ×276, polymer recycler L10 ×16, copper separator L11
    ×50), 9 links, 108 credits, `research: {}`, dock primary `Sell 1 Steel / +10 credits`; the new
    `latest-yard.png` shows `Tick 435 392 · Machines 4 · Links 9 · Credits 108 · Save 6 844
    characters` with a 50 px field. Selected recycler panel `Cycle 3.16s`, `Actual rate 0.08
    batches/s · 60s window`, `Working 0% · waiting for input 100% · output waiting 0% · link 13%
    busy · power 100%`. Lease `t1-fjpv → t1-6hqp`, tick 435 400 → 435 432, revision 172 unchanged,
    promoted card `Sell 3 Steel for 30 credits.`. Seeded desktop: absence `tick 28 906 → 460 916`,
    report `Wire +415 · Plates +267 · Data +118 · Deliveries 141 · Batches 1 159 · storage-full`,
    final `tick 460 966` with 8 machines on 18 links (L12–L14), `data 128`, `wire 425`, `plates 277`,
    110 credits, three nodes known, dock `Sell 60 Wire / +240 credits`. `latest-research.png` reads
    `Data 128`, `latest-research-phone.png` `Data 124` from the seeded context.
  - Headless CPU table unchanged on purpose: no simulation code changed, so `tests/perf/bench.test.ts`
    still describes this build.
- Screenshot evidence and capture provenance: all seven images under `docs/screenshots/` recaptured
  2026-11-03 12:41–12:43 local from artifacts `index-BKbcOrrd.js` / `index-DudncZlS.css` — one run,
  one build. `latest-mobile.png`, `latest-machine-mobile.png`, `latest-yard.png` (new),
  `latest-multitab.png` at 12:41–12:43; `latest-desktop.png`, `latest-research.png`,
  `latest-research-phone.png` at 12:43.
- Known blockers with exact unblock conditions:
  - BL-01 real-device frame/thermal traces: needs a connected device or a hosted trace.
  - BL-02 human first-feel playtest (8 of 10 unaided): needs fresh human testers.
  - BL-03 server authority, payments, public launch: needs provisioning and owner authorization.
  - BL-06 CI status read-back: needs an authenticated `gh` or a readable status check.
  - BL-11 human audio review: needs one listening pass.
    (BL-04, BL-05, BL-07 stay resolved.)
- Assumptions/decisions made: `docs/DECISIONS.md` D-01…D-35 as before, plus **D-36** (an imported
  envelope takes the importing device's clock, and a refused file changes nothing) and **D-37** (dock
  44 px width floor, 6 px gap, 0.88rem labels, `flex: 6 1 auto` on the primary). Save schema is
  unchanged (1); `migrate` still only zero-fills, and an import runs it on the decoded payload.
- Next three bounded tasks:
  1. **B-28** second delivery drone (or a delivery-sized store) inside the first 30 minutes, so the
     post-absence yard keeps a build-sized surplus and the organic phone session unlocks Research
     inside 240 rounds; re-measure the floor sweep and the cadence table with it.
  2. **B-12** content validator in CI: run the typed-content checks in the pipeline so a missing
     reference, an invalid footprint, or a zero-time cycle fails the build.
  3. **B-10** localisation readiness: move the remaining literals into keys with defaults behind the
     shared number/time formatter, with the panel text expansion re-measured at 2.0 scale.
- Long-running processes owned by this session: the `vite preview` server on port 4173 was stopped at
  the end of this pass; nothing else runs.
- Resume instructions: read this file, then `docs/BACKLOG.md`. Run `npx vitest run` before editing;
  `tests/persistence/transfer.test.ts` holds the export/import contract, `tests/ui/app.test.tsx` the
  tutorial walk, the card/dock pairing and the two Yard-panel cases, `tests/simulation/cadence.test.ts`
  the two-order comparison, `tests/simulation/chain.test.ts` the ladder and self-play regression,
  `tests/simulation/supply-window.test.ts` the floor sweep, `tests/ui/hud-layout.test.ts` the chip
  budget. Standard loop: `npx vitest run` → `npm run build` → `npm run preview` (4173, background) →
  `npx tsx scripts/probe-supply.mjs` (writes the seed) and `npx tsx scripts/probe-cadence.mjs` if
  simulation-facing → `node scripts/measure-hud.mjs` (~70 s, only when `src/ui` changed) →
  `node scripts/capture.mjs` (~4 min, reads the seed once at start) → README, STATUS, BACKLOG,
  DECISIONS → commit → `git push origin HEAD:main` → verify.
