# STATUS

Active milestone: M2 (a useful small factory). M0 and M1 complete.

Last completed player-visible change: the research branch (spec 12.2, 27.5). Once the yard
makes `data`, the dock gains a fourth target, **Research**, whose panel shows each node's
exact effect and cost before purchase; one tap buys one rank and the effect applies exactly
once. In the same pass the yard ladder learned to spend (an affordable upgrade now precedes
the sell tranche, and sells no longer strip the input the next machine is still short of),
and a refresh that lands inside the 1.5 s lease window now credits the absence when the tab
is promoted from follower to writer.

Current commit and remote sync status: the head created by this commit is pushed with
`git push origin HEAD:main`; the follow-up docs commit records the verified hash together
with the CI read-back. CI state: still unread in this environment (BL-06: `gh`
unauthenticated, the unauthenticated API 404s for the private repository), so CI is reported
as pending rather than green; the three local checks plus a real-Chrome session are this
pass's gate.

Checks run and actual results:
- `npm run typecheck` — clean (tsc 5.6.3, strict).
- `npx vitest run` — 108 passed / 108 (11 files: economy, logistics, offline, chain,
  diagnostics, plan, research, persistence ×2, ui, perf). No skipped tests, no deleted
  assertions. New: 14 cases in `tests/simulation/research.test.ts` (cost/prerequisite/rank
  contract, pulse = 7 scrap, buffer capacity 12 → 18, link capacity 24 → 32 only for new
  links, tick vs event-jump parity with research owned, save round-trip plus a legacy save
  with the field absent, two invalid payloads), 5 cases in `tests/simulation/plan.test.ts`
  (pending-input sells, build priority, nearest target, upgrade tie-breaks), 1 case in
  `tests/ui/app.test.tsx` (dock target appears with data, panel content, one purchase).
  `tests/persistence/lease.test.ts` updated once: the handover now expects the 1 501 ms
  following window to be credited (15 ticks) and reports `creditedTicks: 15`.
- `npm run build` — succeeded: `index.html` 0.68 kB (0.38 gzip), CSS 4.60 kB (1.53 gzip),
  JS 204.02 kB (64.46 gzip), 50 modules, ~461 ms.
- Headless simulation cost (Node 22.18, median of 3): 12 h tick-by-tick 4-machine 33.4 ms;
  idle event-jump < 1 ms; 500 machines × 6 000 ticks 23.2 ms; 100 × 10 000 6.7 ms;
  50 × 10 000 3.7 ms; 5 × 10 000 0.7 ms; 1 machine 0.5 ms. Bands, not point values.
- Real Chrome through `scripts/capture.mjs`, which now also settles a 12 h absence between
  the two click phases: `tick 1010 → 433 020` (exactly 432 000 ticks, the 12 h cap) and the
  return report read from the live panel — `Away 12h 0m · Your operation worked for 12h 0m
  (capped) · Scrap +881 · Steel +1 · Deliveries 182 · Batches 15 · Bottleneck storage-full`.
  Final mobile state: tick 433 640, tutorial 9, `sorter L7 ×30, furnace L6 ×5, polymer
  recycler L6`, 6 routes, 27 credits, HUD `Scrap 54 Ferrous 1 Nonferrous 1 Credits 27
  Store 58/900`. Two-page lease: follower `Following the other tab` with dock `Take over`,
  then after the owner closed, the lease moved `t1-9gr4 → t1-26dg` and the tick advanced
  433 650 → 433 680 with the card back on the yard ladder.
- Measured ladder effect: with the new priority the same scripted session spent its credits
  (964 → 27) and reached L7/L6/L6, where the previous build stopped at three level-1
  machines with 964 credits and a repeated `Sell 10 Scrap`.

Screenshot evidence and capture provenance: `docs/screenshots/latest-mobile.png`,
`latest-machine-mobile.png`, `latest-multitab.png` (one mobile context, three states) and
`latest-desktop.png` (separate context, so a few seconds behind) all recaptured 2026-11-03
from this build via `node scripts/capture.mjs` against `npm run preview`. **Pending:** the
research panel is not photographed — its dock target needs `data > 0`, which the capture
window does not reach; its content is asserted in `tests/ui/app.test.tsx` instead.

Known blockers with exact unblock conditions:
- BL-01 real-device frame/thermal traces: needs a connected device or a hosted trace.
- BL-02 human first-feel playtest (8 of 10 unaided): needs fresh human testers.
- BL-03 server authority, payments, public launch: needs provisioning and owner
  authorization.
- BL-06 CI status read-back: needs an authenticated `gh` (`gh auth login`) or a readable
  status check; until then the badge is reported as pending.
- BL-11 human audio review: needs one listening pass.

Assumptions/decisions made: `docs/DECISIONS.md` D-01…D-21 as before, plus D-22 (research as
typed content with `maxRank: 1` and integer bonuses read from `sim.research`, zero-filled by
`migrate` so pre-research saves still load), D-23 (ladder priority: link → affordable build →
affordable node → affordable upgrade → surplus sell that is not a pending input → nearest
build), and D-24 (the absence is credited on promotion as well as at store creation, and an
adopted snapshot carries its own write time so the window cannot be counted twice).

Next three bounded tasks:
1. B-19 size store→machine pulls to the machine's real need, then re-measure the scripted
   session's machine count (the yard currently stops at three machines because ferrous and
   nonferrous sit in input buffers while their prices are read from the store).
2. B-15 reserve-floor sweep: {0, 5, 10, 20} through the chain fixture, one table in docs,
   chosen value documented.
3. B-17 rolling 60 s rate window: per-machine recent rate as spec 9.4 asks, with the window
   label next to the maximum rate.

Long-running processes owned by this session: the `vite preview` server on port 4173 is
running in the background for the captures and should be stopped when the captures are done.

Resume instructions: read this file, then `docs/BACKLOG.md`. Run `npx vitest run` before
editing; `tests/simulation/plan.test.ts` and `tests/simulation/chain.test.ts` are the
contract for the ladder, `tests/simulation/research.test.ts` for the research branch,
`tests/persistence/lease.test.ts` for the lease roles, TTL boundary, non-writing follower,
credited handover, and demotion. To refresh the README evidence: `npm run build`, start
`npm run preview`, then `node scripts/capture.mjs` (it prints the session state, the return
report, the opened machine panel's text, and the two-page lease lines; allow about five
minutes because the scripted session now runs two click phases around a 12 h absence).
