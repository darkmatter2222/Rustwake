# Validation record — initial playable foundation

Performed November 2, 2026 (America/New_York).

## Passed

- 10 deterministic Node tests: active/offline equivalence, offline cap, invalid placement and funds, starvation nonnegativity, paused production, expedition gating/one-time settlement, upgrades/research, one-time contracts, save validation and restore timestamps.
- Strict TypeScript compilation and Vite production build.
- Production JavaScript approximately 70.4 KB gzip; CSS approximately 4.2 KB gzip (remote fonts excluded).
- Full-yard benchmark: 80 level-10 machines, eight hours / 28,800 sequential ticks. 235 ms in this Node runtime after precomputing recipe entries, compared with 1,006 ms before the optimization. This is not an Android/iOS performance measurement.
- Browser UI: initial yard renders; circuit press can be constructed through the accessible plot selector; occupancy increases and credits are charged; automatic production updates balances.
- Browser UI: expedition screen exposes escort requirements; deploying Rustbelt starts a countdown and disables duplicate deployment.
- Browser persistence: reload/navigation retained the constructed machine and active expedition.
- Visual inspection at desktop width and in a 390 × 844 browser iframe: resources reflow into two rows, navigation moves to the bottom, yard and inspector stack without visible horizontal page overflow.

## Not yet verified

Actual Android/iOS hardware, touch precision, Safari lifecycle/eviction, sustained FPS, thermal behavior, battery consumption, assistive-technology end-to-end use, multi-tab concurrency, payment/security/load testing and multi-day balance.

The browser preview environment showed variable animation cadence; no mobile frame-rate claim is made. The target is 30 FPS, not a demonstrated real-device guarantee.

## Known prototype limitations

Shared inventory with insertion-order production priority; cosmetic layout rather than physical transport; finite content and upgrade caps; local-only save authority; one browser tab per save; no service worker offline launch; code-drawn pixel-style visuals instead of production sprite atlases; no real PvP, purchases, native shell or server economy.
