/**
 * UI-RESET-59 (G3): logistics copy, UI-local like the inspector and HUD copy. The shared
 * string table is read-only for this issue, so new sentences live here as plain literals;
 * every number still comes from the engine through the shared formatters. The i18n gate
 * scans painted text for raw-key shapes, so nothing here may look like a key — these are
 * sentences and single words.
 */
import type { ConnectReject } from "./model";

export const LOGISTICS_COPY = {
  legend: {
    title: "Route legend",
    direction: "Dashes flow toward the destination; the arrowhead marks the receiving end.",
    working: "Working",
    idle: "Idle",
    blocked: "Blocked",
    workingHint: "cargo in transit",
    idleHint: "no cargo right now",
    blockedHint: "belt full or destination cannot accept",
    materials: "Materials",
    noMaterials: "No belts laid yet.",
    visibilityOn: "Hide routes",
    visibilityOff: "Show routes",
    visibilityHint: "Toggle the belt layer to clear clutter; routes keep running while hidden.",
  },
  overview: {
    title: "Yard overview",
    power: "Power",
    production: "Production",
    routes: "Routes",
    bottlenecks: "Bottlenecks",
    noBottlenecks: "No measured bottleneck — every machine is fed and clearing its output.",
    showRoute: "Show route",
    hideRoute: "Clear focus",
    powerLimited: "Over budget — every running machine slows to the same fraction.",
    powerHealthy: "Within budget — machines run at full speed.",
    selectNote:
      "Showing a route reveals it on the yard canvas. Open a machine from the yard to inspect it directly.",
  },
  controls: {
    title: "Route controls",
    connect: "Connect",
    cancel: "Cancel",
    disconnect: "Disconnect",
    focus: "Reveal",
    pending: "Suggested links",
    noPending: "No suggested links — this machine already carries every material it needs.",
    laid: "Laid links",
    noLaid: "No links on this machine yet.",
    custom: "Lay a custom link",
    from: "From",
    to: "To",
    filter: "Material",
    anyCargo: "Any cargo",
    store: "Dock store",
    preview: "Preview",
    cost: "Cost",
    refund: "Refund",
    cargoReturned: "cargo returned",
    tiles: "tiles",
    valid: "Valid — ready to lay.",
    filterNote:
      "A material filter is set when a belt is laid. There is no in-place filter edit: to change a filter, disconnect the belt and lay a new one.",
    unsupported: "Changing a filter in place is not supported by the simulation.",
  },
  status: {
    working: "Working",
    idle: "Idle",
    blocked: "Blocked",
  },
} as const;

/** One plain sentence per connect rejection, mirroring the engine's reason codes. */
export function connectRejectText(reason: ConnectReject): string {
  switch (reason) {
    case "cycle":
      return "Invalid — a belt cannot loop back to its own source.";
    case "not-found":
      return "Invalid — one endpoint no longer exists.";
    case "duplicate":
      return "Invalid — an identical belt already runs between these endpoints.";
    case "insufficient":
      return "Not enough scrap in the store to lay this belt.";
  }
}

/**
 * RW3D #147 (T20): road fleet / routes panel copy. Session-only road logistics
 * (#140/#141) projected for the player; the live default feed arrives with the
 * #148 persistence cutover, so setup faces say so plainly instead of faking it.
 */
export const ROAD_FLEET_COPY = {
  title: "Road fleet",
  lead: "Trucks, their jobs and the exact blocker when one waits. Session-only until the #148 cutover.",
  trafficOff: "Traffic model: legacy (opt-in, default off)",
  trafficOn: "Traffic model: active",
  enable: "Enable traffic model",
  enabledNote: "Traffic is already enabled for this session.",
  empty: "No trucks yet. Add one below — session setup, reset on reload.",
  addTruck: "Add truck",
  capacity: "Capacity",
  cellX: "Cell x",
  cellY: "Cell y",
  idle: "Idle",
  job: "Job",
  cargo: "Cargo",
  destination: "Destination",
  focus: "Focus",
  select: "Select truck",
  truckConfig: "Truck profile",
  defaultConfig: "Default truck profile",
  speed: "Speed",
  loadTicks: "Load ticks",
  unloadTicks: "Unload ticks",
  apply: "Apply",
  junction: "Junction",
  junctionCapacity: "Junction capacity (blank = unlimited)",
  junctionCost: "Junction cost",
  retry: "Retry policy",
  maxRetries: "Max retries",
  baseBackoff: "Base backoff",
  maxBackoff: "Max backoff",
  refused: "Refused — check the values (writer-only, integers).",
  added: "Truck added.",
  addRefused: "Could not add the truck (read-only tab or invalid cell/capacity).",
  reader: "Read-only: another tab owns the save.",
} as const;

export const ROAD_ROUTES_COPY = {
  title: "Road jobs",
  job: "Job",
  cellX: "Cell x",
  cellY: "Cell y",
  lead: "Dispatch policy, jobs and bay capacity. The engine keeps authority over stock and room.",
  policy: "Dispatch policy",
  policyNote: "Filters, reserve floor and minimum fill govern job creation only.",
  materialFilter: "Material filter (unchecked = filtered out)",
  filterAll: "All materials allowed",
  reserveFloor: "Reserve floor",
  minFill: "Minimum fill",
  newJob: "New job",
  source: "Source",
  destination: "Destination",
  material: "Material",
  amount: "Amount",
  priority: "Priority",
  create: "Create job",
  created: "Job created.",
  noBuildings: "No buildings registered. Register an approach cell below to dispatch.",
  emptyJobs: "No road jobs yet. Create one above.",
  cancel: "Cancel",
  focus: "Focus",
  setup: "Session setup",
  setupNote: "Registration is session-only; the production feed arrives with #148.",
  registerBuilding: "Register building",
  buildingId: "Building id",
  buildingCapacity: "Storage capacity",
  registered: "Building registered.",
  registerRefused: "Could not register (read-only tab or invalid values).",
  bays: "Loading bays (#139 sockets)",
  baysEmpty: "No declared loading sockets yet. Complete a road-taking building to expose its bays.",
  bayCapacity: "Bay capacity",
  baySet: "Set",
  bayUnlimited: "unlimited",
  bayOccupancy: "in use",
  disconnected: "no road",
  reader: "Read-only: another tab owns the save.",
  refused: "Refused — check the values (writer-only, capacity >= 1).",
} as const;
