# #147 — road fleet and routes player display (developer evidence)

- Issue: #147 · Branch: `rw/147` · Base: `origin/main` `89db232577054a347216aa7b0be5f4c6be4e272e`
- Implementation head: `a64c6efb08a3ae9aef0df93bc1ae99cf6d153cd2` (commits `8d02cf7` read model + policy bridge, `96f9299` panels/holds/focus/controls, `a64c6ef` tests)
- Evidence head: `13717a0684817ab4638af4b50338ef35c4533e6c` (`13717a0` evidence + probe; this doc is docs-only on top)
- Role: developer (non-vision). Date: 2026-11-14.

## 1. Gates (real exit codes, run at evidence head `13717a0`)

| Gate | Command | Exit | Result |
| --- | --- | --- | --- |
| 1 typecheck | `npx tsc --noEmit` | 0 | clean |
| 2 content | `npx tsx scripts/validate-content.mjs` | 0 | 15 resources, 8 blueprints, 12 recipes, 3 research; behaviour `firstDrone=379 firstResearch=527 tick=18298 machines=8 links=18 drones=4 batches=1838 credits=157 nodes=3`; 0 violations (old seed — #147 is economy-independent, no content changed) |
| 3 tests | `npx vitest run` | 0 | 95 files / 1327 tests passed (baseline 92 / 1264 + 3 files / 63 new), 11.86 s |
| 4 build | `npm run build` | 0 | built in 1.46 s; `index-wfUcmpXU.js` 830.97 kB (gzip 221.82 kB), `vendor-Bt4lNSbZ.js` 141.66 kB (gzip 45.37 kB) |

Perf bench (`tests/perf/bench.test.ts`, median of 3): 12 h starter yard 49.50 ms, idle
`advanceTo` 0.00 ms, 500 machines / 6000 ticks 41.78 ms — all far under the 400 ms anchor.
No flake, no re-run needed.

Pre-existing, not caused by #147: the >500 kB chunk-size warning (present at base) and the
`ReactDOMTestUtils.act` deprecation notice (same pattern as the existing UI test files).

## 2. What shipped (10 files, +1466/−3, all `src/ui`; `src/game` untouched)

- `fleetModel.ts` (296): pure read model — truck rows (job, cargo/capacity, destination),
  `freeStock`, and a typed `WaitReason` union unifying the engine's `LogisticsHoldReason`
  and `TrafficHoldReason`. Logistics hold wins over the carrier's traffic hold (mirrors
  `renderer/fleet.ts` precedence without importing renderer code).
- `dispatchPolicy.ts` (145): `DispatchPolicy { allowedResources (null = all), reserveFloor 0,
  minFill 1 }`; typed `PolicyRejection` (`material-filtered`, `below-min-fill`,
  `reserve-floor`) checked BEFORE `createLogisticsJob` so the player sees the policy reason;
  the engine still validates everything afterwards (policy never mints stock or bypasses
  room checks).
- `RoadFleet.tsx` (349): opt-in Enable traffic face, honest empty fleet, add-truck form
  (capacity/cell), named select faces, default + per-truck profile editors (default gated
  until traffic active), retry count + backoff readout, junction cost control, focus pan.
- `RoadRoutes.tsx` (381): job creation through the policy gate with typed refusal receipts,
  15 material filters, reserve-floor / min-fill inputs, bay capacity editor, job list.
- `copy.ts` +84, `useRoadLogistics.ts` +35 (session bridge), `App.tsx` +43
  (`PANEL_FLEET`/`PANEL_ROUTES` registration; additive `LogisticsApi`/`TrafficApi`/`RoadApi`
  cast lives only at the registration site), shell `FleetPanel`/`RoutesPanel` wrappers,
  `shell.css` +114.

### Typed wait reasons (E04/U06: focus AND fix, no reset)

Six kinds, each with exact player text naming the blocker, a recovery hint, and a focus
cell: `no-route`, `road-removed`, `destination-full`, `no-carrier`, `bay-full`,
`junction-full`. Capacity blockers point at the contested cell; route blockers at the far
end of the missing leg; destination-full at the destination approach.

### Default-OFF parity (#140)

Traffic boots `legacy (opt-in, default off)`; the Enable face is present and enabled; the
default truck profile stays disabled until traffic is active; once active the Enable face
retires. Session-only — reset on reload.

## 3. New tests (63 across 3 files + 1 helper)

- `tests/ui/fleetModel-147.test.ts` — 29 tests (read model, wait-reason precedence, text,
  recovery, focus cells, freeStock).
- `tests/ui/dispatchPolicy-147.test.ts` — 15 tests (policy gate, typed rejections,
  defaults, engine-still-validates).
- `tests/ui/roadPanels-147.test.tsx` — 19 tests (DOM coverage: default-OFF parity, rows,
  typed holds, focus, policy controls).
- `tests/ui/road-147.helpers.ts` — shared fixtures.

## 4. Headless render evidence from the RUNNING build

Harness: `scripts/probe-fleet147.mjs` (playwright-core + system Chrome) against
`http://localhost:4297/`, desktop 1440x900. Every mutation goes through the panels' own
real forms/buttons; readers are pure DOM projections of the running panels.

- Result: **34/34 checks passed, zero page errors, zero console errors**
  (`docs/evidence/fleet147-headless.json`, stamped `headSha a64c6ef…` — the implementation
  head; `13717a0` adds evidence files only).
- Session-only: no save seeded, no `SAVE_KEY`/migration/recovery touched (#148 owns the
  cutover). Zero stock in the probe session — the production stock feed is #148; no panel
  form seeds stock.
- Scenario DOM facts: fleet default-OFF status + honest empty text + gated default
  profile; add-truck receipt `Truck added.`; enable → `Traffic model: active`, Enable
  retired, profile unlocked; select marks the row pressed, reveals the per-truck profile
  and pans the camera (zoom preserved at scale 6; distance to target 327.75 → 317.49,
  `moved && closer`); second truck appended (capacities 12 / 8). Routes: 15 filters all
  checked, floor 0 / fill 1, honest empty jobs + #217 empty-bay text; two
  `Building registered.` receipts; zero-stock refusal `Reserve floor keeps 0 scrap at the
  source; only 0 free, so 5 cannot move.` with 0 jobs minted; min-fill 10 refuses 5;
  unchecking scrap (14/15 checked) refuses with `scrap is filtered out by the dispatch
  policy.`; floor edits live to 7.

### Render integrity finding (hash-verified, disclosed)

The 9 PNGs in `docs/evidence/fleet147/` reduce to **3 unique viewport captures**:

- `01-fleet-default-off` = `02-fleet-traffic-on` (sha256 `cbfab4e8…`)
- `03-fleet-selected-profile` = `04-fleet-two-trucks` (sha256 `fc98abb1…`)
- `05`…`09` routes stages all identical (sha256 `a9a7ec79…`)

Pixels change only across camera moves (zoom + focus pan between 02 and 03). The panel
state transitions above are evidenced by the 34 DOM/numeric checks against the running
build's rendered React tree, NOT by pixels: the panel content does not appear inside the
captured viewport region (most plausibly below the sheet's scroll fold at 1440x900 — the
DOM readers use `querySelector` regardless of scroll position). This is flagged for G1
#151 visual review and a probe-visibility follow-up; it is not a claim that the panels
are invisible in the product, only that these captures do not show them.

Reproduce: `npx vite build && npx vite preview --port 4297` then
`npx tsx scripts/probe-fleet147.mjs` (`RUSTWAKE_URL`, `FLEET147_SHOTS` overridable).

## 5. Known limitation — #217 (filed, do not re-file)

`roadWorld` lacks a building-declaration path, so `getRoadSockets()` stays empty until the
#148 cutover. The bay editor prints the honest empty state: `No declared loading sockets
yet. Complete a road-taking building to expose its bays.` Live sockets, live stock and
persistence are all deferred to #148.

## 6. Save impact

Session-only UI. No persisted-state mutation; `src/game/*` untouched; no new save fields,
no migration, no store slice on `GameStore` (additive capabilities cast at the registration
site only). Save format, cancellation, approval settings and security unchanged.

## 7. Limitations

- Non-vision developer: the renders and DOM checks are geometric/numeric evidence from the
  running build, NOT a visual-fidelity certification. **Visual inspection PENDING at G1 #151.**
- Render hash finding in §4: per-scenario panel pixels are not captured; DOM checks carry
  the scenario evidence.
- Live loading sockets and production stock pending #148 (#217); persistence deferred #148.