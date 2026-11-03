# STATUS

Active milestone: M2 (a useful small factory). M0 and M1 complete.

Last completed player-visible change: **every sentence now comes from one string table (B-10, D-40).**
`src/game/content/strings.ts` holds ~150 keys with English defaults and named `{slot}` placeholders,
plus the only formatter layer (`formatNumber`, `formatDuration`, `formatSeconds`, `formatRate`,
`formatWholeSeconds`, `wholePercent`, `plural`/`unit`). `Hud.tsx`, `Panels.tsx`, `App.tsx`, `text.ts`
and the bottleneck assistant in `diagnostics.ts` read from it; three wording changes are deliberate
(lowercase material names inside sentences, singular "1 unit"/"1 credit", `Storage full` for the return
report's bottleneck row) and every other string renders byte-identically.

- Current commit and remote sync status: the code commit of this pass is the one titled "One string
  table behind every sentence …(B-10)", with this checkpoint commit on top. Earlier chain: `b1c7bd1`,
  `7c78315`, `6ae2576`, `a3c6c8d`, `926d342`, `88e7257`. CI remains unread in this environment (BL-06:
  `gh run list` asks for `gh auth login`, the unauthenticated API 404s for the private repository), so
  CI is reported as **pending**, not green.
- Checks run and actual results (this pass):
  - `npx vitest run` — **164 passed / 164** (20 files): eight new cases in `tests/ui/i18n.test.tsx`
    (table integrity, `t()` semantics for a known key / an unknown key / an unfilled slot, formatter
    pins, the one plural rule reaching the card and the dock, tutorial prices derived from `TUNING`,
    resource-name casing, and two rendered-surface scans that fail if any raw key such as
    `chip.credits` reaches the page), plus three injected faults in `tests/content/validate.test.ts`.
    The 155 pre-existing cases still pass, which is the byte-identity proof for the wording.
  - `npm run validate` — **0 violations**: `content: 0 violation(s) in 3 ms`, behaviour marks still
    `firstDrone=308 firstResearch=975 tick=18 298 machines=8 links=18 drones=4 batches=1 864
    credits=165 nodes=3`, equal to the published supply-window rows.
  - `npm run typecheck` clean. `npm run build` — `index.html` 0.68 kB, CSS **5.59 kB (1.81 kB gzip)**,
    JS **222.69 kB (69.44 kB gzip)**, 51 modules: +2.32 kB gzip over the previous pass, the price of
    the table, inside spec 21.5's 200 kB preference. Artifact `index-CT1NXZBc.js`.
  - `node scripts/measure-hud.mjs` (re-run, `src/ui` changed) — restated in
    `docs/evidence/2026-11-03-hud-share.md`: resting ink **19.1 %** and band **20.6 %** at 360 × 640
    (identical to the previous pass), band 21.9 % landscape, **2.0-scale ink peak 38.3 %** at
    360 × 640 (was 40.5 %, the shorter cost lines wrap less), no document scroll in **108/108** states,
    **0 px** inner scroll in every panel at all three scales, no painted box passing the visual
    viewport, minimum contrast **5.77:1** over 11 pairs, smallest dock target **44 × 46**.
  - `node scripts/probe-dock.mjs` — the same three ladder states at 360 × 640: starter (primary
    `Sell 39 Ferrous for 78 credits.`, button 110 × 46, band 20.6 %), research (`Research Efficient
    Cutters · 4 Data` over `4 Data`, 130 × 54, band 21.8 %), fleet (`Add a recovery drone · 45 credits`,
    102 × 46, band 20.6 %).
  - Not re-run, still valid: the headless CPU table (`tests/perf/bench.test.ts`) and the supply/cadence
    probes — no simulation file changed except `diagnostics.ts`'s sentence assembly, and the validator's
    behaviour half reproduces the published numbers exactly.
- Screenshot evidence and capture provenance: all **seven** images recaptured from this build in one
  **16:07–16:09** run (artifact `index-CT1NXZBc.js`, CSS `index-DudncZlS.css`), and the capture's printed
  state lines are what the README gallery now quotes: mobile session `tick 442 700`, 361 credits, five
  machines at L15–L18, 11 links, dock `Sell 58 Scrap` / `+58 credits`, machine panel `Batch 28%` and
  `Power 1 unit`, yard panel `Save 14 705 characters` with checksum `55644765`; handover
  `t1-243l → t1-9jvp`, tick 442 720 → 442 749 at unchanged revision 768; seeded desktop session
  `tick 537 643`, 216 credits, `data 146`, `plates 446`, dock `Upgrade` / `215 credits`.
  The phone research image remains the seeded capture (the run printed
  `research phone source: seeded mature yard (docs/evidence/yard-mature.json), captured=true`),
  tracked as B-29. The seed file itself is the one `scripts/probe-supply.mjs` wrote at 13:43 from the
  fleet build (tick 18 298, 8 machines, 18 links, four flying units, `data 106`).
- Known blockers with exact unblock conditions:
  - BL-01 real-device frame/thermal traces: needs a connected device or a hosted trace.
  - BL-02 human first-feel playtest (8 of 10 unaided): needs fresh human testers.
  - BL-03 server authority, payments, public launch: needs provisioning and owner authorization.
  - BL-06 CI status read-back: needs an authenticated `gh` or a readable status check.
  - BL-11 human audio review: needs one listening pass.
    (BL-04, BL-05, BL-07 stay resolved.)
- Assumptions/decisions made: `docs/DECISIONS.md` D-01…D-39 as before, plus **D-40** (one string table
  with named slots, one formatter layer, one plural rule; in-sentence material names lowercase; the
  simulation may import that table because it imports nothing itself). Save schema is unchanged (1);
  the fleet is still five units at 45/90/180/360 credits.
- Next three bounded tasks:
  1. **B-02** worker catch-up: move the 12 h catch-up off the main thread with cancellation and publish
     a measured stall histogram against the 100 ms target of spec 21.5.
  2. **B-29** organic research panel at phone size: raise the phone session's post-absence phase to the
     1 800 rounds the headless driver runs (or let the ladder prefer the nearest payable blueprint),
     then re-capture and give `latest-research-phone.png` organic provenance.
  3. **B-18** follower-tab smoothness: interpolate a mirrored tab's sprites between the last two adopted
     snapshots (or raise the adopt cadence at a measured cost), with one trace at 390 × 844.
- Long-running processes owned by this session: the `vite preview` server on port 4173 (background, for
  the HUD audit, the dock probe and the capture run). Stop it with
  `Get-NetTCPConnection -LocalPort 4173` → `Stop-Process -Id <pid>`.
- Resume instructions: read this file, then `docs/BACKLOG.md`. Run `npm run validate` and
  `npx vitest run` before editing; `tests/ui/i18n.test.tsx` is where a new sentence gets pinned and
  where the raw-key scan lives, `tests/content/validate.test.ts` is the injected-fault gate for content
  and string checks, `tests/simulation/fleet.test.ts` the fleet contract, `tests/persistence/transfer.test.ts`
  the export/import contract, `tests/ui/app.test.tsx` the tutorial walk and the card/dock pairing,
  `tests/simulation/cadence.test.ts` the two-order comparison, `tests/simulation/chain.test.ts` the
  ladder and self-play regression, `tests/simulation/supply-window.test.ts` the floor sweep,
  `tests/ui/hud-layout.test.ts` the chip budget. Standard loop: `npm run validate` and `npx vitest run`
  → `npm run build` → `npm run preview` (4173, background) → `npx tsx scripts/probe-supply.mjs` (writes
  the seed) and `npx tsx scripts/probe-cadence.mjs` if simulation-facing → `node scripts/probe-dock.mjs`
  if the dock changed → `node scripts/measure-hud.mjs` (~70 s, only when `src/ui` changed) →
  `node scripts/capture.mjs` (~17 min, only when `src/` changed, it reads the seed once at start) →
  README, STATUS, BACKLOG, DECISIONS → commit → `git push origin HEAD:main` → verify with
  `git ls-remote origin refs/heads/main`. Any `src/` edit invalidates the seven images until a fresh
  capture run; a change limited to `src/game/content/validate.ts` does not, because the app does not
  import it.
