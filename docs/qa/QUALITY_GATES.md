# Visual, functional, device, game, security and release quality gates

## Gate definitions
G0: V1 archive/backups, V2 independent app and save key, reproducible build, correct trusted CI/CD provenance. G1: actual beautiful isometric world and complete first-playable 3D factory story, sponsor visual ACCEPT after actual screenshots and physical phone. G2: deep idle industry, 17 currency source/sink loops, multi-day equivalence, routes, power and robust saved logistics. G3: factory-supplied PvE defense and finite expeditions. G4: server-authoritative accounts, trade/co-op/asynchronous protected raids. G5: optional lasting prestige/factions/seasons with observed—not fabricated—player retention.

## Acceptance matrix
| Surface | Evidence and failing cases |
|---|---|
| Camera | 45° yaw/35.264° elevation on open, 360° yaw, tilt bounds, wide zoom range, pointer-locked pan across elevations/zoom, wheel and pinch anchoring, button zoom actually works, accurate ray/ground projection and cancel safety |
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
