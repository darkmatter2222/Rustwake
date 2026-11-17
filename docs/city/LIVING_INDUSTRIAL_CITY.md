# Rustwake V2 — Living Industrial City mandate

## What the executive sponsor asked for
Rustwake evolves from an isometric salvage/factory sandbox into an explorable, dynamic industrial **city simulation**. The game must include player-authored truck routes and waypoints, visibly loaded/offloaded cargo, independent walking residents and shift workers, traffic lights, traffic queues and collisions, physical city services, neighborhoods, local policies, natural and industrial disasters, strikes, peaceful demonstrations, fictional riots, emergency services, and long-term growth.

**This is still Rustwake.** Preserve public/reference/approved-yard.png as the visual foundation: primitive smaller-than-Minecraft voxelcraft, readable isometric 3D with roads, cranes, factory machinery, warm rusty/steel materials, charcoal/sand terrain and limited mint signals. It is not a flat SimCity-clone dashboard; the player can orbit, pan, tilt and zoom freely and see the consequences occur in world space.

## Five interacting player loops
1. **Build and automate:** place machine, watch mechanical staged assembly, process resources, upgrade bottlenecks, save/reload. Resources actually occupy depot/machine/vehicle/in-transit states.
2. **Design routes:** draw roads, intersections, sidewalks, bridge/rail and safe loading bays; author named multi-stop truck routes, schedules and waypoints. Configure dispatch/traffic policies. See actual trucks pick up, drive, queue, unload and return.
3. **Grow a living city:** zone land, build houses/shops/parks/services, offer employment, see citizens leave homes, walk to jobs, use transit, visit places and respond to housing/safety/utility demand.
4. **Manage risk and consequence:** floods, severe storms, wildfires, earthquakes, factory faults, infrastructure failures, labor disputes, public demonstrations and occasional civil unrest have forecastable causes, local damage, vehicle/pedestrian effects and recoverable response decisions. Fire/ambulance/utility teams physically navigate the city.
5. **Master systemic strategy:** build resilient road networks, allocate budgets and taxes, research cleaner/heavier processes, balance worker/public needs and factory throughput, expand sectors, then layer PvE defense and later opt-in authoritative realms/raids/prestige. There must be several viable paths to a thriving settlement.

## Rules of dynamism
- Movement and disasters aren't decorative loops. World-space position, costs, queues, cargo, structure state, citizen action and service access come from the simulation.
- A crash blocks a road and can damage truck/cargo; the route planner reroutes other freight. A flood closes low streets and risks basements, while drainage reduces water. A labor strike interrupts staffing and freight, and negotiation can restore service. An industrial fire stops a machine, activates routed response units and requires repair. A community dispute has understandable economic/safety causes, not an arbitrary random punishment.
- Every situation has a real player lever: road layout, truck assignment, schedules, signals, wages, services, hazard preparedness, budget, maintenance, response and recovery. Some risk is inevitable but survival and restoration are always possible. Respect user hazard-intensity settings and do not make harsh policies mandatory for success.
- Civic mechanics should not target real protected characteristics; use game-relevant geography, service access, employment and safety variables. Strikes/protests are distinct from violent unrest; do not equate public gathering with harm.
- A 3D actor's motion must match deterministic internal state. No invisible teleport of freight, citizens or money. Sim and visuals stay decoupled so low graphics settings do not change economy.

## Phase boundaries (do not derail G1)
- **G1 existing first playable:** isometric yard, camera/phone controls, visible roads/trucks/materials, construction, save and art acceptance (#276).
- **G2 living industry/city:** interactive route control, traffic signals, housing, workers, pathing, district utilities, deterministic environmental simulation and resilient city-scale performance.
- **G3 disruptive events and services:** storms/flood/industrial incidents, emergency routing, protected civic unrest and policy/recovery, plus PvE/expeditions.
- **G4 optional authoritative online:** server-backed trade/realms/raids; local simulated riots and disasters must never become unreviewed griefing mechanics.
- **G5 strategic longevity:** prestige, sectors, collectibles, factions and different recoverable strategies.

## Player acceptance scenario
On a fresh save in the new industrial yard: orbit/zoom; place a freight depot, machine and road; draw a named three-stop route; watch a truck load iron, travel and unload to furnace while workers walk to shift. Add houses, park and fire station; observe busy morning traffic and a traffic light. A seeded heavy rain floods a low road; the truck reroutes while a service vehicle responds. The player funds drainage, resolves the closure, restores freight and saves/reloads. A separate seeded labor dispute shows peaceful negotiation and an optional civil unrest progression with de-escalation. Visual QA captures desktop/phone real 3D footage and checks exact resource/citizen/road state before and after. No static screenshot or numerical texture sample stands in for gameplay.

## Art, UI and performance
World occupies the viewport with compact actionable HUD. Use actual roads/vehicles/people rather than giant grid markers. At mobile, far citizens become affordable simulation/LOD representations, but their job/traffic/hazard results remain equivalent. Use original low-poly rigs and named motion pivots, real collision shapes around relevant nearby agents, cheap graph occupancy when out of view. Preserve accessibility, reduced motion, mute, color+text indicators, 44px touch and no browser scrolling.
