# Living Industrial City — reproducible system scenarios

These are product-level tests to prevent the autonomous team from implementing decorative but inert features. Every scenario captures immutable source SHA, fixed seed, start/end game state and inventory/agents/routes/incidents, actual desktop/phone screenshot/clip, performance and a negative/recovery case. Passes are independent of GPU FPS and never substitute for executive sponsor G1 art approval.

## G1 foundation — do not delay
Fresh V2 world visually matches approved voxel industrial language; camera starts yaw45/elev35.264 and permits pointer-gripped drag and true zoom; roads, truck loading and unloading, build preview/staged construction and save/reload are usable on actual phone. User inspects a furnace and material transport. All core mechanics conserve resources and no page scrolling. Sponsor acceptance remains explicit.

## C01 — Manual logistics and route strategy (G2)
Player creates a named route with three stops and waypoints, assigns HAULER-01, observes 10 iron reserved, loaded at depot, traveling along legal roads, queueing and unloaded to furnace. A second truck takes a faster alternate road; compare time/consumption. Delete a segment mid-delivery: cargo is retained, truck reports blocked, player adds a detour and it arrives once. Reopen save while cargo onboard: totals reconcile. Capture truck wheel movement and actual on-board visible cargo.

## C02 — A living workday (G2)
At dawn, citizens leave physically represented homes, walk via sidewalks and marked crossings to factories and commercial districts. Shift workers arrive and change industrial output; shops receive actual freight from their depots. At rush hour, intersection queue and transit wait grow. Player adds a bus route or modifies signals, reducing measured commute/travel time at budget and operating cost. Offscreen crowd LOD changes visuals only, not worker arrival or economy.

## C03 — Localized factory accident and emergency (G3)
A seeded industrial equipment failure begins with wear/power/safety cause and warning. Factory output stops, smoke/damage and road blockage are actual incident states. Fire service uses a real staffed station/road, dispatches a unit, reaches the site and mitigates damage. Player repairs machine using steel/parts and production resumes. Without service, event is worse but recoverable. No magical industry reset or invisible firefighting.

## C04 — Storm and river flood (G3)
Forecast heavy rainfall; low terrain floods based on actual height/drainage, closing a road and delaying a truck. Two strategies: player raises/grades road or builds drainage/retention. Both have meaningful costs and distinct service/throughput outcomes. Sheltered citizens evacuate along valid walking routes and emergency unit travels legal streets. Post-storm city retains damage until player repairs; source/cargo/treasury reconcile after reload.

## C05 — Traffic collision and towing (G2/G3)
At a busy intersection, heavy trucks queue and collide under a reproducible incident seed. Physical truck movement, contact, damage and blocking are visible, traffic re-routes, and the stopped carrier retains its cargo. Dispatch tow/repair from staffed facility; road clears and shipment completes exactly once. Turning down speed or upgrading intersection changes incident risk at measurable throughput cost. No random impossible collision explosion.

## C06 — Civic unrest with recovery choices (G3)
An under-serviced district suffers unemployment, poor commute and service outage. Residents organize a peaceful demonstration; player can fund jobs/transit or negotiate service changes. Optional harder seed escalates unresolved grievances to a fictional riot causing bounded local damage and routed emergency repairs. Neither protest nor crowd formation automatically becomes violence. Nonviolent policy response succeeds, and no citizen identity trait unrelated to gameplay changes risk. Costs, public trust and job restoration are visible over days.

## C07 — Large city mobile stress test (G2)
Run 500+ modeled citizens and freight/service vehicles, hundreds of roads and 50+ buildings across expanding parcels, with a flood plus rush hour. Renderer shows only nearby fine-detail agents while simulating far neighborhoods at lower fidelity. Report phone/desktop actual cold load, FPS p95, memory and input latency; economy/cargo/population state identical across quality settings and 30/60 FPS.

## C08 — Multi-system crisis sandbox and time controls (G3)
Player selects weather intensity, traffic, employment/strike conditions, city budget and optional incident type. Paused/0.5x/1x/4x simulation remains deterministic. At a seeded late-afternoon storm, flooding blocks roads; shift workers can't commute, factory loses production, emergency unit reroutes, civic satisfaction falls temporarily. A recovery plan reconnects roads, restores jobs, controls spending and reopens freight. Save/reload and scrubbing historical timeline cannot duplicate money or alter previous events.

## Evidence rubric
Each scenario must produce (a) original linked GitHub issue and immutable accepted PR head; (b) deterministic input/commands and model seed; (c) expected vs observed game state; (d) negative/failure path; (e) actual running-build 3D captures at desktop and phone, distinguishing emulation from physical hardware; (f) main CI/CD/live verified source; (g) honest remaining debt. A pretty screenshot of 3D trucks without conserved cargo movement is a failed logistics scenario; a glowing riot overlay without civic simulation or player response is a failed civic scenario.
