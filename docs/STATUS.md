# STATUS

Active milestone: M2 (a useful small factory). M0 and M1 complete.

Last completed player-visible change: material-sized input pulls plus one link per material
(B-19 and the R01 two-output gap behind it). A store link now draws only two ready batches of
the material its machine is short of, so the surplus stays in the store where build prices,
sells, and the pending-input rule read it; and each tray item ships over the link that actually
carries that material. In the same pass the tick loop gained a per-state lookup table so the
extra routing kept the catch-up cost inside its budget. Measured 30-minute self-play: 3 machines
→ 7 machines on 21 links (sorter ×439, copper separator ×208, furnace ×200, wire mill ×195,
plate press ×84, polymer recycler ×69, circuit assembler ×1); phone session sorter 30 → 619
batches and furnace 5 → 301, with the 12 h report now `Ferrous +9 · Nonferrous +584 ·
Steel +287 · Deliveries 365 · Batches 876`.

Current commit and remote sync status: `47c85c4` ("Size input pulls to machine need and route
each tray item by material") is the pushed `origin/main` head: `git push origin HEAD:main`
reported `4f2ba96..47c85c4 HEAD -> main`, and the following `git fetch origin main` showed
`git rev-parse HEAD origin/main` both equal to
`47c85c4043446cf8643f815026ed991ec4ee96f7` with a clean working tree. Its parent is `4f2ba96`.
CI state: still unread in this environment (BL-06: `gh run list` asks for `gh auth login`, the
unauthenticated API 404s for the private repository), so CI is reported as pending, not green.

Checks run and actual results:
- `npm run typecheck` — clean (tsc 5.6.3, strict).
- `npx vitest run` — 109 passed / 109 (11 files), no skipped tests, no deleted assertions.
  Changed this pass: +1 self-play regression case in `tests/simulation/chain.test.ts` (30
  minutes of the yard ladder: ≥7 machines, ≥ machines' worth of links, credits spent, no
  permanently jammed tray, ≥6 distinct step kinds); the buffer-capacity case in
  `tests/simulation/research.test.ts` restated as the ready-window contract (peak ready 4
  units plain, 10 with Smart Buffers, ≤18); two per-material output links added to the
  fully-linked yard in `tests/simulation/plan.test.ts`. The `advance`/`advanceTo` parity case
  still passes with the new routing, so the index is behaviour-neutral.
- `npm run build` — succeeded: `index.html` 0.68 kB (0.38 gzip), CSS 4.60 kB (1.53 gzip),
  JS 205.41 kB (64.91 gzip), 50 modules, ~466 ms.
- Headless cost (Node 22.18, median of 3, from the same `tests/perf/bench.test.ts` run):
  12 h 4-machine tick-by-tick 59.3 ms; idle event-jump < 1 ms; 500 × 6 000 40.4 ms;
  100 × 10 000 13.8 ms; 50 × 10 000 6.4 ms; 5 × 10 000 1.1 ms; 1 × 10 000 0.8 ms. Before this
  change the same harness read 33.4 / < 1 / 23.2 / 6.7 / 3.7 / 0.7 / 0.5 ms, so the routing
  costs about 1.7-1.9× per tick at 50-500 machines and the 12 h case stays under the 100 ms
  stall budget. Three fixes got it back from an initial 26 ms at 100 machines: a per-state
  machine/link index rebuilt only when a command changes the topology, one link list read per
  machine per tick, and in-place tray compaction.
- Real Chrome through `scripts/capture.mjs`: absence `tick 1010 → 433 020` (432 000 ticks, the
  12 h cap) with the return report quoted above; final mobile state tick 433 630, tutorial 9,
  `sorter L7 ×619, furnace L7 ×301, polymer recycler L7 ×0, copper separator L1 ×0`, 8 links,
  133 credits, HUD `Scrap 5 Ferrous 5 Nonferrous 14 Credits 133 Store 322/900`. The selected
  machine panel read `Polymer recycler · Needs input · Cycle 3.75s · Working 0% · waiting for
  input 100% · output waiting 0% · link 0% busy · power 100%` and named the copper separator as
  the limiter. Two-page lease: follower `Following the other tab` with dock `Take over`; after
  the owner closed, the lease moved `t1-7501 → t1-jdu6`, the tick advanced 433 640 → 433 671,
  and the card returned to the ladder (`Connect Copper separator so its cargo moves.`). The
  separate desktop context reached the same four machines at the same tick this time.

Screenshot evidence and capture provenance: `docs/screenshots/latest-mobile.png`,
`latest-machine-mobile.png`, `latest-multitab.png` (one mobile context, three states) and
`latest-desktop.png` (separate context) all recaptured 2026-11-03 from this build with
`npm run build` → `npm run preview` → `node scripts/capture.mjs`. **Still pending:** the research
panel image (BL-07) — the dock target needs `data > 0`, which the capture window does not reach;
its content stays covered by the jsdom test.

Known blockers with exact unblock conditions:
- BL-01 real-device frame/thermal traces: needs a connected device or a hosted trace.
- BL-02 human first-feel playtest (8 of 10 unaided): needs fresh human testers.
- BL-03 server authority, payments, public launch: needs provisioning and owner authorization.
- BL-06 CI status read-back: needs an authenticated `gh` or a readable status check.
- BL-07 research-panel capture: needs a session that reaches `data > 0`; the scripted session
  gets the circuit assembler at batch ×1 within 30 headless minutes, so either the capture
  gains a third click phase or a context seeds an engine-produced save.
- BL-11 human audio review: needs one listening pass.

Assumptions/decisions made: `docs/DECISIONS.md` D-01…D-24 as before, plus D-25 (a store pull
sizes to two ready batches of one material, widened by Smart Buffers and capped by the
machine's effective input capacity) and D-26 (per-item tray routing over the least-busy
matching link with a null-filter then first-link fallback; `planConnections` proposes one link
per material). `MachineState.tray` is now `TrayItem[]` so a waiting tray compacts in place
instead of reallocating each tick; the serialised shape is unchanged, so no schema bump.

Next three bounded tasks:
1. B-15 reserve-floor sweep: floors {0, 5, 10, 20} through the chain fixture and the 30-minute
   self-play driver, one table in docs, chosen value documented. The floor now trades directly
   against the time to the seventh machine.
2. B-17 rolling 60 s rate window: per-machine recent rate as spec 9.4 asks, with the window
   label beside the maximum rate in the panel.
3. B-22 dead-link audit: report each link's busy ratio from the 30-minute session, then assert
   that a settled yard has no link at 0 % busy (the current run shows
   `machine3>store0:polymer`-style links worth checking).

Long-running processes owned by this session: none. The `vite preview` server on port 4173 was
started for the captures and stopped.

Resume instructions: read this file, then `docs/BACKLOG.md`. Run `npx vitest run` before
editing; `tests/simulation/chain.test.ts` holds the ladder and the new self-play contract,
`tests/simulation/logistics.test.ts` the route ledger and fair allocation, and
`tests/simulation/research.test.ts` the ready-window numbers. To refresh the README evidence:
`npm run build`, start `npm run preview`, then `node scripts/capture.mjs` (~5 minutes; it prints
the session state, the return report, the opened machine panel's text, and the two-page lease
lines).
