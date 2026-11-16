/**
 * RW3D #147 (T20): the session-only dispatch policy bridge.
 *
 * GAME_SYSTEMS: "Reserve floors, filter lists and minimum fill govern job
 * creation." The engine stays the authority on stock/room/carriers; this
 * bridge is the player's creation policy layered on top, exactly like the
 * #59 logistics view bridge: a plain module store with a stable snapshot,
 * framework-free, holding NO simulation state and dispatching NO command.
 *
 * Defaults are permissive (all materials, floor 0, min fill 1) so mounting the
 * panels never changes what the yard would otherwise accept. SESSION-ONLY:
 * nothing here reads or writes SAVE_KEY, migration or recovery — persistence
 * of policy is part of the #148 cutover, not this issue.
 */
import type { ResourceId } from "../../game/content/defs";
import type { LogisticsJobRequest, LogisticsState } from "../../game/simulation/logistics";
import { freeStock } from "./fleetModel";
import { MATERIAL_COLORS } from "./material";

/** Every material the yard knows, in the shared colour table's order. */
export const ALL_RESOURCES = Object.keys(MATERIAL_COLORS) as ResourceId[];

export interface DispatchPolicy {
  /** Materials allowed for new jobs; null = all (the permissive default). */
  readonly allowedResources: readonly ResourceId[] | null;
  /** Free units that must remain at the source after a reservation. */
  readonly reserveFloor: number;
  /** Smallest job amount the player may create. */
  readonly minFill: number;
}

export const DEFAULT_DISPATCH_POLICY: DispatchPolicy = {
  allowedResources: null,
  reserveFloor: 0,
  minFill: 1,
};

/** Typed policy rejections, shown before the engine is even asked. */
export type PolicyRejection =
  | { reason: "material-filtered"; resource: ResourceId }
  | { reason: "below-min-fill"; amount: number; minFill: number }
  | { reason: "reserve-floor"; resource: ResourceId; free: number; floor: number; amount: number };

export function policyRejectionText(rejection: PolicyRejection): string {
  switch (rejection.reason) {
    case "material-filtered":
      return `${rejection.resource} is filtered out by the dispatch policy.`;
    case "below-min-fill":
      return `Minimum fill is ${rejection.minFill}; ${rejection.amount} is too small.`;
    case "reserve-floor":
      return `Reserve floor keeps ${rejection.floor} ${rejection.resource} at the source; only ${rejection.free} free, so ${rejection.amount} cannot move.`;
  }
}

/**
 * Pure policy gate for a job draft. Checked BEFORE createLogisticsJob so the
 * player sees the policy reason, not a stock error; the engine still validates
 * everything afterwards (policy never mints stock or bypasses room checks).
 */
export function checkDispatchPolicy(
  policy: DispatchPolicy,
  request: Pick<LogisticsJobRequest, "sourceBuildingId" | "cargoType" | "amount">,
  logistics: LogisticsState,
): PolicyRejection | null {
  if (policy.allowedResources !== null && !policy.allowedResources.includes(request.cargoType)) {
    return { reason: "material-filtered", resource: request.cargoType };
  }
  if (request.amount < policy.minFill) {
    return { reason: "below-min-fill", amount: request.amount, minFill: policy.minFill };
  }
  const free = freeStock(logistics, request.sourceBuildingId, request.cargoType);
  if (free - request.amount < policy.reserveFloor) {
    return {
      reason: "reserve-floor",
      resource: request.cargoType,
      free,
      floor: policy.reserveFloor,
      amount: request.amount,
    };
  }
  return null;
}

let snapshot: DispatchPolicy = DEFAULT_DISPATCH_POLICY;
const listeners = new Set<() => void>();

/** Current policy. Stable reference between changes (useSyncExternalStore-safe). */
export function getDispatchPolicy(): DispatchPolicy {
  return snapshot;
}

function publish(next: DispatchPolicy): void {
  if (
    next.allowedResources === snapshot.allowedResources &&
    next.reserveFloor === snapshot.reserveFloor &&
    next.minFill === snapshot.minFill
  ) {
    return;
  }
  snapshot = next;
  for (const listener of listeners) listener();
}

/** Replace the whole policy (validated by the caller's controls). */
export function setDispatchPolicy(next: DispatchPolicy): void {
  publish(next);
}

/** Toggle one material in the filter list. An empty list means "all" (null). */
export function togglePolicyResource(resource: ResourceId): void {
  const current = snapshot.allowedResources;
  if (current === null) {
    // First filter click narrows to everything EXCEPT the clicked material.
    const all = ALL_RESOURCES.filter((r) => r !== resource);
    publish({ ...snapshot, allowedResources: all });
    return;
  }
  const next = current.includes(resource)
    ? current.filter((r) => r !== resource)
    : [...current, resource];
  publish({ ...snapshot, allowedResources: next.length === ALL_RESOURCES.length ? null : next });
}

export function setReserveFloor(floor: number): void {
  if (!Number.isInteger(floor) || floor < 0) return;
  publish({ ...snapshot, reserveFloor: floor });
}

export function setMinFill(minFill: number): void {
  if (!Number.isInteger(minFill) || minFill < 1) return;
  publish({ ...snapshot, minFill });
}

export function subscribeDispatchPolicy(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper: restore permissive defaults between cases (module global). */
export function resetDispatchPolicy(): void {
  snapshot = DEFAULT_DISPATCH_POLICY;
  for (const listener of listeners) listener();
}
