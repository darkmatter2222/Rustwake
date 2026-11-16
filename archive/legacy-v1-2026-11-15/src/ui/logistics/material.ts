/**
 * UI-RESET-59 (G3): one material colour source, shared by the canvas arrowhead and the
 * inspector legend so a swatch in the panel always matches the marker on the belt.
 *
 * The base rail stroke stays the pinned cyan (the renderer contract owns it); material is
 * carried by the arrowhead painted on a revealed route and by these legend swatches, never
 * by recolouring the rail itself. Hues are chosen to stay legible on the dark yard floor.
 */
import type { ResourceId } from "../../game/content/defs";
import type { SimState } from "../../game/simulation/types";
import { RESOURCE_LABEL } from "../text";

export const MATERIAL_COLORS: Record<ResourceId, string> = {
  scrap: "#ffb765",
  ferrous: "#9fb4c7",
  nonferrous: "#5fd8e8",
  residue: "#c9713a",
  copper: "#e0894f",
  polymer: "#8a7ad8",
  wire: "#f4d35e",
  plates: "#7fd6c2",
  steel: "#b8c4d0",
  circuits: "#6ee7a8",
  motors: "#f4f7fb",
  battery: "#d8e85f",
  alloy: "#c0a0f0",
  data: "#5fa8f4",
  chassis: "#a0b0c0",
};

/** The colour for a route's cargo. A null filter ("any cargo") keeps a neutral steel. */
export function materialColor(resource: ResourceId | null): string {
  return resource === null ? "#8aa9c4" : MATERIAL_COLORS[resource];
}

/**
 * The rail stroke per status, shared by the canvas and the legend swatches so they cannot
 * drift. `working` is the pinned belt style the renderer contract owns; idle and blocked
 * modulate only the style (no extra paint op), so the rest-frame budget is unchanged.
 */
export const ROUTE_STATUS_COLORS = {
  working: "rgba(95,216,232,0.5)",
  idle: "rgba(95,216,232,0.22)",
  blocked: "rgba(201,113,58,0.6)",
} as const;

export interface MaterialSwatch {
  readonly resource: ResourceId | null;
  readonly label: string;
  readonly color: string;
}

/**
 * The distinct materials actually carried by the yard's routes, in first-seen order, so
 * the legend lists only what is on the floor instead of all fifteen resources. A null
 * filter is shown once as "Any cargo".
 */
export function routeMaterials(state: SimState): MaterialSwatch[] {
  const seen = new Set<ResourceId | null>();
  const swatches: MaterialSwatch[] = [];
  for (const route of state.routes) {
    if (seen.has(route.filter)) continue;
    seen.add(route.filter);
    swatches.push({
      resource: route.filter,
      label: route.filter === null ? "Any cargo" : (RESOURCE_LABEL[route.filter] ?? route.filter),
      color: materialColor(route.filter),
    });
  }
  return swatches;
}
