/**
 * RW3D #147 (T20): subscription hook for the road panels.
 *
 * The store notifies on every reconcile (ticks AND traffic/logistics setters),
 * but its SimState reference can stay stable across a setter-only change, so a
 * memoized panel keyed on `state` alone would miss a policy edit. This hook
 * re-reads the session slices on every notification instead — reads are pure
 * and safe for any role; nothing here mutates or persists.
 */
import { useEffect, useReducer } from "react";
import type { LogisticsState } from "../../game/simulation/logistics";
import type { TrafficState } from "../../game/simulation/traffic";
import type { RoadSocketLink } from "../../game/world/roadSockets";
import type { RoadLogisticsApi } from "./fleetModel";

export interface RoadLogisticsSnapshot {
  readonly logistics: LogisticsState;
  readonly traffic: TrafficState;
  readonly trafficEnabled: boolean;
  /** True when another tab owns the save (spec 22.3): every mutation stands down. */
  readonly locked: boolean;
  readonly sockets: RoadSocketLink[];
}

export function useRoadLogistics(api: RoadLogisticsApi): RoadLogisticsSnapshot {
  const [, bump] = useReducer((version: number) => version + 1, 0);
  useEffect(() => api.subscribe(bump), [api]);
  return {
    logistics: api.getLogistics(),
    traffic: api.getTraffic(),
    trafficEnabled: api.isTrafficEnabled(),
    locked: api.getRole() === "reader",
    sockets: api.getRoadSockets(),
  };
}
