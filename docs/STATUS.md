# STATUS

Active milestone: M1 (first-feel vertical slice), M0 complete.

Last completed player-visible change: full first-feel loop is playable end to end —
gate with mute, tap-to-salvage pulses on a finite wreck pool, drone repair at 30 scrap,
autonomous 5-unit deliveries, sorter placement with ghost, two real dock routes, furnace,
first export contract for 30 credits, and a first credit-funded upgrade. Blocked actions
show one local explanation and charge nothing.

Current commit and remote sync status: M0/M1 core implemented locally; see `git log` for
the pushed head. The first checkpoint commit for this implementation is recorded here as
the M1 core commit; remote verification follows the push.

Checks run and actual results:
- `npm run typecheck` — clean (tsc 5.6.3, strict).
- `npm test` — 44 passed / 44 (5 files: economy, logistics, offline, persistence, ui, plus
  the headless perf bench). No skipped tests, no deleted assertions.
- `npm run build` — succeeded: `index.html` 0.68 kB (0.37 gzip), CSS 4.59 kB (1.53 gzip),
  JS 185.98 kB (59.04 gzip), 46 modules, ~456 ms.
- Headless simulation cost (Node 22.18): 12 h tick-by-tick catch-up with 4 machines
  33 ms; idle-yard event jump < 1 ms; 500 machines × 6 000 ticks 18 ms.
- Browser behaviour exercised through jsdom-driven React tests (start gate, salvage,
  tutorial progression, blocked-action toast, mute persistence).

Screenshot evidence and capture provenance: `docs/screenshots/latest-mobile.png`
(390 × 844 @2x) and `docs/screenshots/latest-desktop.png` (1440 × 900 @1x), captured by
`scripts/capture.mjs` (playwright-core, Chrome headless) from the production preview build
at this commit. Capture date: 2026-11-02.

Known blockers with exact unblock conditions:
- Real-device (midrange Android/iPhone) frame and thermal traces: needs a connected
  device or a hosted run; until then the 30/60 FPS targets stay unverified.
- Human first-feel playtest (target 8 of 10 fresh testers completing the automated loop
  unaided): needs at least one human tester; agent self-play is not a substitute.
- Server-authoritative mode, payments, and public launch: need provisioned infrastructure
  and explicit owner authorization.

Assumptions/decisions made: see `docs/DECISIONS.md` (renderer choice, integer quantities,
power model, reserve floor, store-funded purchases, 12 h cap, single-writer loop).

Next three bounded tasks:
1. Copper separation and polymer recovery with a visible bottleneck report, plus a small
   research branch (M2).
2. Multi-tab single-writer lease with revision checks and heartbeat, plus save-export
   import round-trip tests (M2 reliability).
3. Worker-based catch-up for the 8/12-hour window with cancellation and a versioned
   result handoff, keeping main-thread stalls under 100 ms (M2 idle).

Long-running processes owned by this session: one background `vite preview` server on
port 4173 for screenshot capture (stopped after capture).

Resume instructions: read this file, then `docs/BACKLOG.md`. Run `npm test` before
editing; the deterministic engine fixtures in `tests/simulation/` are the contract for
any simulation change.
