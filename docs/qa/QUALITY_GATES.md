# Visual, functional, device, game, security and release quality gates

## Gate definitions
G0: V1 archive/backups, V2 independent app and save key, reproducible build, correct trusted CI/CD provenance. G1: actual beautiful isometric world and complete first-playable 3D factory story, sponsor visual ACCEPT after actual screenshots and physical phone. G2: deep idle industry, 17 currency source/sink loops, multi-day equivalence, routes, power and robust saved logistics. G3: factory-supplied PvE defense and finite expeditions. G4: server-authoritative accounts, trade/co-op/asynchronous protected raids. G5: optional lasting prestige/factions/seasons with observed—not fabricated—player retention.

## Acceptance matrix
| Surface | Evidence and failing cases |
|---|---|
| Camera | 45° yaw/35.264° elevation on open, 360° yaw, tilt bounds, wide zoom range, pointer-locked pan across elevations/zoom, wheel and pinch anchoring, button zoom actually works, accurate ray/ground projection and cancel safety. CAM-01 regression matrix (docs/qa/CAMERA_MATRIX.md): all yaw quadrants × pitch 20–80 × min/max zoom × near-edge targets, ≤1 CSS px cursor grip in math AND production-built browser gestures, fixed-seed golden snapshots, exact-value negative controls and live raycast cross-check |
| UI | 390×844 phone, 844×390 landscape, 1440×900 desktop and wide monitor; no page scroll, 200% text, focus, 44px targets, no world blocked by overlays |
| Art | Actual in-game views vs approved screenshot: roofs/sides, varied silhouettes, roads and real moving vehicles, coherent rustic palette, restrained teal statuses; numeric pixels alone cannot pass |
| Construction | Validity and cost, rotate/move/dismantle, once-only charge and refund, five-stage mechanical rise, mid-stage reload, reduced-motion alternative |
| Roads/fleet | Visible road path to genuine sockets, cargo reservation, loading/traffic/bay constraints, no road/shortage recovery, two-carrier last-pallet conservation, reload mid-delivery |
| Production | Input and energy dependency, nondecorative machine animation, deterministic recipes, source/sink conservation and competing strategies |
| Saves | Versioned V2 isolated from V1, corrupt/partial import refusal, no multi-tab double writing, clock rollback and offline jumps |
| Economy | 17 currency real source/sink ledger and anti-loop arbitrage, research branches, measured early/mid/late progression |
| Security | Authorization and ownership of online balances, idempotent orders/raids, anti-collusion, backup/rollback |
| Runtime | Actual exact PR head CI, main CI, package/deploy receipt, external source SHA/hash, browser console and screenshots; no false deployed claim |

## Visual inspection protocol
A vision-capable reviewer uses actual production-built game screenshots/60-second clips at exact source SHA, same seed, viewport, camera, simulation state and capture tool. Compare with public/reference/approved-yard.png. Inspect distinct materials, convincing industrial density, depth, readable entrances, roads/truck scale, continuous mechanical motion, useful UI and actual player actions. Headless SwiftShader emulation is a useful numeric/capture floor; not a real phone or proof of beautiful art. Sponsor must sign G1 visual acceptance; text-only/geometry-only agent marks PENDING-VISUAL.

## Defect severity
P0: missing/blank world, corrupted save/bank, unsafe security or wrong production artifact. P1: pointer drag not cursor-gripped, zoom button broken, nonfunctional road/truck/build or mobile overlap. P2: advanced partial features, workaround available. P3: minor polish/docs. A green unit suite cannot erase a failed actual browser gesture. QA/product verdict must bind immutable PR head; changed code requires re-review.

## Closure and reporting
Report test command/exit, source SHA, expected/actual, screenshot/video evidence, hardware and emulation note, limitations and specific issue. Never say passed just because a test runs. Release is accepted only after main deployment and actual live SHA receipt, while G1 needs separate sponsor visual approval.

## ART-02 (#348) salvage-structure capture matrix
Capture tool `scripts/capture-art02.mjs` against the production preview (`pnpm build`), one headless Chromium/SwiftShader, capture head `685c3fc1eab80f34c640edf18784af8e6c0ce084` (direct parent of the evidence commit; empty `src scripts tests` diff between them). Evidence: `docs/evidence/348-art-02/report.json` + PNGs. Status **PASS_NUMERIC_ONLY** — numeric smoke only; **G1 visual acceptance (#276) is sponsor-reserved and NOT granted by this matrix**. Phone is emulated (390×844 dpr2, hasTouch/isMobile), not a physical handset (#268/#275).

| Stage | Desktop 1440×900 dpr1 | Phone 390×844 dpr2 | Failing case guarded |
|---|---|---|---|
| Landing still + camera pose | yes | yes | yaw≠45 / elevation≠35.264 / world3d≠ready / schema drift / machineCount≠6. Home zoom is responsive by product design (`App.jsx`: `innerWidth>=960 ? 1.15 : 1`) — desktop lands at 1.15, phone at 1; both are the correct home pose, not a desync |
| Synchronous stamp==applied zoom (Zoom in button) | yes | yes | CAMERA_STAMP_DESYNC (dataset vs lastZoomApplied >1e-6) |
| Real-UI crusher placement (9,9) + observed 5 s assembly | yes | yes | lastSiteOk≠true / inspector still shows "remaining" after 30 s |
| Reduced-motion negative, landing (parked-or-absent) | yes | yes | art02Reduced≠"1" / arm≠"0.000" / roller,screen ∉ {"0.000","none"} / any stamp drifts over 2 s real clock |
| Reduced-motion negative, crusher-live (strict) | yes | yes | any of arm/roller/screen ≠ exactly "0.000" or drifts over a second 2 s real-clock window ("none" NOT accepted once live) |
| Invalid-site ghost + verdict (occupied depot 13,9) | yes | yes | lastSiteOk≠false / missing reason (COLLISION) / no red-ghost frame |
| Trio isometric / front (yaw 0) / side (yaw 90) at strategic zoom | yes | yes | yaw off >0.5° / elevation drift / zoom target missed >1e-3 |
| Inspector picking proof, both machines (1×1) | yes | yes | wrong machine name / footprint ≠1×1 / cell not clickable |
| 96 px silhouette clips + independent PNG decode | yes | yes | meanAbsDiff<6 or diffFractionOver24<0.10 (structures read too alike) |
| Motion timeline (no-preference, ≥12 s, ≥100 samples) | yes | n/a (desktop motion run) | non-monotone rollers / speed out of bounds / arm,screen exceed amplitude / reduced≠"0" / <30 distinct roller values / 4 mid-motion stage frames missing |
| WebGL-failure negative | yes | n/a | world3d ready or any .world-canvas present or zero page errors (must fail loudly, never a fake 2D world) |
| Runtime hygiene (every view) | yes | yes | >1 canvas / document scroll / any pageerror / any same-origin failed request |
| Camera method hash guard | yes | yes | applyCamera≠f3afa5479a66b97e or stampCamera≠691b3c0a3480e97b |

Capture-pipeline integrity: wheels are delivered only to anchors where `document.elementFromPoint` resolves to `.world-canvas` (phone UX-07 sheet collapsed through its real toggle when it covers the anchor); every scripted sheet toggle asserts CAM-05 camera stamps byte-unchanged; a stalled zoom stamp throws `WHEEL_ZOOM_STAMP_STALLED` with delivery diagnostics (no swallowed timeouts); the `1e-3` zoom tolerance and `ZOOM_TARGET_NOT_REACHED` throw are unchanged. Rollback control (`rollback-control.json`): the 11-test ART-02 suite fails 9/11 against main `ec641433`'s unmodified `world.js`+`voxelSchema.js`; the 2 survivors are continuity guards. Full suite `pnpm test` = `node --test tests/*.test.mjs` 282/282, `pnpm validate` + `pnpm build` green.

## BLD-08 (#377) dismantle capture matrix
Capture tool `scripts/capture-dismantle.mjs` against the production preview (`pnpm build`), one headless Chromium/SwiftShader run, capture head recorded in `docs/evidence/377-bld-08/report.json` (`source_sha`, never hand-edited). Status **PASS_NUMERIC_ONLY** — numeric/runtime smoke only; **G1 visual acceptance (#276) is sponsor-reserved and NOT granted by this matrix**. Phone is emulated (390×844 dpr2, hasTouch/isMobile), not a physical handset.

| Stage | Desktop 1440×900 dpr1 | Phone 390×844 dpr2 | Failing case guarded |
|---|---|---|---|
| Two-step confirm dialog, exact refund rows | yes | yes | dialog rows ≠ authoritative refundEntries(dismantleRefund) per resource/label; single-tap removal |
| Keep-machine abort | yes | yes | any bank delta or building loss on abort |
| Confirm → exact bank delta + splice | yes | yes | fleetProbe bank delta ≠ previewed refund; building count not −1 |
| Plain repeat tap at emptied site | yes | yes | re-selection or any payout (MISSING-safe) |
| Persisted-save reload replay (in-node readGame+removeBuilding) | yes | yes | command/plain replay not MISSING or any deposit |
| PROTECTED starter refusal | yes | yes | control enabled, reason drift, opener present, bank moved |
| RESERVED refusal + real fleet-panel cancelFreight | yes | yes | gate reason drift, source bag ≠ 5/20 before/after, cancelProbe totals not conserved, double return |
| Cancel → dismantle with returned cargo | yes | yes | re-reservation of the player machine (seeded decoys must win), refund ≠ recovery+100% cargo |
| Fixture command-id replay (API-SEEDED headline) | yes | yes | duplicate≠true, refund drift, any deposit, registry not persisted, credits chip ≠ fixture bank |
| Runtime hygiene (every context) | yes | yes | any pageerror/console error/same-origin failed request |

Capture-pipeline integrity: every canvas tap is delivered only where `document.elementFromPoint` resolves to `.world-canvas` (checked FIRST, attempts recorded); selection is verified by the inspector eyebrow `SITE x.z`; all waits are condition-based on the app's own `data-fleet-probe` MutationObserver write count (15 s timeout, 25 ms polling) — no fixed sleeps as proof. Seed disclosures are carried in report.json limitations: generator/trucks removed for exact bank deltas; RESERVED context stocks earlier starter candidates and seeds truck speed 0.02 so the dispatcher's immediate post-cancel re-assignment deterministically goes elsewhere (the one-tick re-dispatch race is real gameplay debt, registered in GAPS, not hidden); command-id replay is API-seeded because App.jsx issues no removal command ids yet (registered cross-lease follow-up). Rollback control (`rollback-control.json`): the 15-test dismantle suite fails 15/15 against main's unmodified `simulation.js`; seven guard-break mutants each fail exactly their targeted tests; every restore is sha256-verified against the committed implementation.
