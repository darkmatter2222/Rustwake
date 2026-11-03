# STATUS

Active milestone: M2 (a useful small factory). M0 and M1 complete.

Last completed player-visible change: **the content gate is now a pipeline step (B-12, D-39).** The
previous pass shipped the visible one: the credit-priced drone fleet (B-28, D-38). This pass adds
`src/game/content/validate.ts`, which exports `validateContent()` (twelve groups of pure table checks)
and `validateBehaviour(rounds)` (the real ladder plus the ledger walk). `scripts/validate-content.mjs`
wraps them for the CLI, `package.json` publishes it as `npm run validate`, `ci.yml` runs it between
typecheck and tests, and `tests/content/validate.test.ts` keeps the same assertions in the local suite.
The yard itself is unchanged: the app does not import the validator, and the bundle artifact hash is
identical to the previous pass.

- Current commit and remote sync status: **`7c78315` ("Content and behaviour gate in CI: recipe, footprint, cycle, reachability checks (B-12)")
  is the code commit this pass pushes to `origin/main`**, with this checkpoint commit on top. Earlier
  chain: `6ae2576`, `a3c6c8d`, `926d342`, `88e7257`, `cc0c665`, `1b0a091`. CI remains unread in this
  environment (BL-06: `gh run list` asks for `gh auth login`, the unauthenticated API 404s for the
  private repository), so CI is reported as **pending**, not green. The new step is therefore written
  into `ci.yml` but not yet observed running.
- Checks run and actual results (this pass):
  - `npm run validate` — **0 violations**: `content: 0 violation(s) in 3 ms`, and the behaviour run
    gives `firstDrone=308 firstResearch=975 tick=18 298 machines=8 links=18 drones=4 batches=1 864
    credits=165 nodes=3`. Those nine numbers equal the shipped rows of
    `docs/evidence/2026-11-03-supply-window.md`, which comes from a separately written driver - the
    reason to keep both.
  - `npx vitest run` — **155 passed / 155** (19 files, no skips): four new cases in
    `tests/content/validate.test.ts` (tables pass; table sizes pinned at 15 resources / 8 blueprints /
    12 recipes / 3 nodes / 14 prices / ≥20 tuning keys so no check can pass by inspecting nothing; the
    injected zero cycle, 4 × 4 footprint and missing price are each named and then repaired; the
    behaviour marks equal the published probe numbers).
  - `npm run typecheck` clean. `npm run build` — `index.html` 0.68 kB, CSS **5.59 kB (1.81 kB gzip)**,
    JS **213.12 kB (67.12 kB gzip)**, 50 modules: byte-identical artifact names to the previous pass
    (`index-DDfppFoR.js` / `index-DudncZlS.css`), which is why the seven screenshots are still the
    current build's.
  - Not re-run this pass, and still valid: the HUD audit (`docs/evidence/2026-11-03-hud-share.md`,
    band 20.6 % at 360 × 640, 108/108 no-scroll states), the two probe tables, and the headless CPU
    table - no `src/ui`, renderer, or simulation file changed.
- Screenshot evidence and capture provenance: unchanged from 2026-11-03 14:11–14:13 local, artifacts
  `index-DDfppFoR.js` / `index-DudncZlS.css` — the same build this pass produces, so no image was
  re-captured for a non-visual change. The phone research image remains the seeded capture
  (`research phone source: seeded mature yard`), tracked as B-29.
- Known blockers with exact unblock conditions:
  - BL-01 real-device frame/thermal traces: needs a connected device or a hosted trace.
  - BL-02 human first-feel playtest (8 of 10 unaided): needs fresh human testers.
  - BL-03 server authority, payments, public launch: needs provisioning and owner authorization.
  - BL-06 CI status read-back: needs an authenticated `gh` or a readable status check — this is what
    would confirm the new validate step ran on the remote.
  - BL-11 human audio review: needs one listening pass.
    (BL-04, BL-05, BL-07 stay resolved.)
- Assumptions/decisions made: `docs/DECISIONS.md` D-01…D-38 as before, plus **D-39** (one validator
  module, two entry points; the pure checks cost 3 ms so the pipeline can afford them, and the
  behaviour half doubles as the cross-check on the probe drivers). Save schema is unchanged (1); the
  fleet is still five units at 45/90/180/360 credits.
- Next three bounded tasks:
  1. **B-10** localisation readiness: move the remaining player-facing literals into keys with
     defaults behind the shared number/time formatter, with the panel text expansion re-measured at
     the 2.0 text scale (the HUD audit already covers the six sizes).
  2. **B-02** worker catch-up: move the 12 h catch-up off the main thread with cancellation and
     publish a measured stall histogram against the 100 ms target of spec 21.5.
  3. **B-29** organic research panel at phone size: raise the phone session's post-absence phase to
     the 1 800 rounds the headless driver runs (or let the ladder prefer the nearest payable
     blueprint), then re-capture and give `latest-research-phone.png` organic provenance.
- Long-running processes owned by this session: none. The `vite preview` server on port 4173 is
  stopped (verified: no listener), and no browser context is open.
- Resume instructions: read this file, then `docs/BACKLOG.md`. Run `npm run validate` and
  `npx vitest run` before editing; `tests/content/validate.test.ts` is where new content checks get a
  case, `tests/simulation/fleet.test.ts` holds the fleet contract, `tests/persistence/transfer.test.ts`
  the export/import contract, `tests/ui/app.test.tsx` the tutorial walk and the card/dock pairing,
  `tests/simulation/cadence.test.ts` the two-order comparison, `tests/simulation/chain.test.ts` the
  ladder and self-play regression, `tests/simulation/supply-window.test.ts` the floor sweep,
  `tests/ui/hud-layout.test.ts` the chip budget. Standard loop: `npm run validate` and `npx vitest run`
  → `npm run build` → `npm run preview` (4173, background) → `npx tsx scripts/probe-supply.mjs` (writes
  the seed) and `npx tsx scripts/probe-cadence.mjs` if simulation-facing → `node scripts/measure-hud.mjs`
  (~70 s, only when `src/ui` changed) → `node scripts/capture.mjs` (~17 min, only when `src/` changed,
  it reads the seed once at start) → README, STATUS, BACKLOG, DECISIONS → commit →
  `git push origin HEAD:main` → verify with `git ls-remote origin refs/heads/main`. Any `src/` edit
  invalidates the seven images until a fresh capture run; a change limited to
  `src/game/content/validate.ts` does not, because the app does not import it.
