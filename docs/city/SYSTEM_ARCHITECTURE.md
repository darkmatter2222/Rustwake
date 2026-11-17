# Living City — domain and simulation architecture

## State sources
- World coordinates are X/Z terrain with Y elevation; hidden logical cells remain useful for valid placement, graphs and spatial indexing. Never show a bare grid as the entire game.
- Core entity categories: structure, parcel, road, sidewalk, intersection, vehicle, freight job, citizen, household, workplace, service unit, utility edge, weather cell, contamination cell, disaster incident, civic event, policy and saved player scenario.
- Each entity has a stable ID, version and lifecycle. Ownership/permissions differentiate local single-player from future authoritative online realm.
- Business/economy/simulation state is authoritative for resource and event outcomes. Three.js renders snapshots and can submit validated commands; visuals cannot mint money or delete real reserved cargo.
- Fixed-step/event-jump sim must not change behavior at different render FPS. Near agents receive high-fidelity 3D animation and collision, far agents a cheaper logically equivalent path/traffic model.

## Network graphs
1. Road graph: truck speed, turning, lanes, signs, intersections, route waypoints, closures, bridge grade, traffic occupancy and emergency priority.
2. Walk graph: sidewalks, crossings, parks, doors and sheltered routes; citizen schedules create demand; no walking through walls, roads or factories.
3. Transit graph: stops, buses/trams, capacity, waiting, passenger transfers and fares; people use it only if reachable and funded.
4. Utility graphs: power, water, sewage, health/safety/service access. A broken edge affects only dependent sites, not all city at once.
5. Environmental grids: terrain height, runoff, fuel/vegetation, air/noise/water contamination and hazard exposure; coarse offscreen tiles with correct consequence totals.

## Transportation source-of-truth
A player's named route includes stable version, assigned vehicle types, ordered stops, allowed pickup/drop cargo, dwell/priority policy and graph version. At dispatch reserve available source units; on actual pickup, transfer reservation to truck cargo; at actual destination unload truck cargo into machine/depot; never retain the same unit as spendable both on truck and in bank. Road closures should stop/replan/return cargo, not teleport or silently delete it. Congestion/bay queues are first-class state and alter real throughput.

## People and civic system
A citizen has home, optional workplace, a daily task schedule, location/path mode and relevant needs; household/service accessibility drives satisfaction. Workers arriving late or absent change factory output; citizens walking are visible at appropriate range. Playable policy/strikes/protests/riots are seeded causal events based on employment, service availability, safety, budget and time. Avoid protected-attribute targeting and surprise unavoidable destruction. Show alternatives, nonviolent recovery and accountable municipal cost.

## Hazards and disasters
Hazard events include scenario seed, warning, zone/time/intensity, causal trigger, exposed assets, response policy, persistent damage and recovery. Weather/rain/wind/terrain drive flood/fire effects. Industrial faults come from wear/safety/maintenance. Road closures interrupt actual deliveries; emergency response units require real stations/staff/budget/road access. Saved incidents resume with identical causal history. World rendering shows floods, smoke/damage/debris as effects of incident state, not arbitrary particle theater.

## Replay, offline and data integrity
- Versioned snapshot plus bounded idempotent command journal (build, route edit, shipment, trade, policy, incident response).
- Every command has an ID, validation, expected/actual result, resource delta and causal event link. Repeated command IDs cannot spend twice.
- Offline 1h/12h/day/week settlement uses ordered events and bounded CPU; it must preserve freight, people, weather and hazard costs. Simulation consistency is proven by fixed seed, not claimed based on fast-forward run alone.
- Save migration preserves old V2 save under invalid decode; no V1 save overwritten. Online inventories later require authoritative server and transaction escrow.
- Incident replay/spectator camera reads history without mutating current state.

## UI and player control
Expose route drawing/saving/reassigning, road and sidewalk layout, zoning, public services, traffic rules, signal timing, resource plans and safe hazard toggles through game-first contextual overlays. Show exact world-space routes, queue, cargo, weather risk and civic cause/recovery. Mobile one-finger pan, two-finger twist, pinch anchored zoom, 44px controls and zero document scroll must remain valid.

## Test obligations
Separate pure route/camera math, deterministic sim tests, event/cargo ledgers, native dependency DAG and actual production-built browser capture. Include accident, floods, denied road, blocked footpath, staffing loss and emergency recovery fixtures. In PRs, attach source SHA, seed, actual/expected and a 60-second 3D clip for visible changes. The sponsor's G1 vision signoff remains separate.
