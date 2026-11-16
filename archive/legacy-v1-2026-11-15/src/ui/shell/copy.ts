/**
 * RW3D #135: plain-English copy for the compact shell's own faces and the three
 * new grounded destination panels (Routes / Fleet / Map). strings.ts is owned by
 * another lane and is not edited here; the i18n census only forbids raw key
 * patterns leaking to the screen, so these literals are safe (same precedent as
 * the retired Menu sheet's "Menu" / "Settings" rows).
 */
import type { ShellSlot } from "./layout";

/** The six toolbar destination labels, in painted order. */
export const DESTINATION_LABEL: Record<ShellSlot, string> = {
  build: "Build",
  routes: "Routes",
  fleet: "Fleet",
  research: "Research",
  trade: "Trade",
  map: "Map",
};

/** Short accessible hints printed under a destination that is not yet earned. */
export const DESTINATION_REASON = {
  research: "Needs data",
} as const;

export const ROUTES_COPY = {
  title: "Routes",
  lead: "Every conveyor link in the yard. Remove a route to refund its belt and free its cargo.",
  empty: "No routes yet. Build a machine and connect it to the store or another machine.",
  remove: "Remove",
  removed: "Route removed",
  overview: "Network",
  store: "Store",
  cargo: "In transit",
  filter: "Carries",
  any: "Any resource",
} as const;

export const FLEET_COPY = {
  title: "Fleet",
  lead: "The drones that haul between the store and the machines. Repair the first, then add more.",
  repair: "Repair drone",
  add: "Add drone",
  repaired: "Drone repaired",
  added: "Drone added",
  unit: "Drone",
  statusFlying: "In flight",
  statusIdle: "Idle",
  statusBroken: "Broken",
  deliveries: "Deliveries",
  fleetFull: "Fleet full",
  needsRepair: "Repair the first drone before adding another",
} as const;

export const MAP_COPY = {
  title: "Map",
  lead: "The yard region you are recovering. New regions open as the story and research advance.",
  region: "Salvage yard",
  regionActive: "Active",
  regionLocked: "Locked",
  machines: "Machines",
  routes: "Routes",
  storeUnits: "Store units",
  wreck: "Wreck remaining",
  lockedHint: "Continue the recovery to unlock new regions.",
} as const;

/**
 * RW3D #151 (U04): the accessible entity enumeration inside the Map destination.
 * Every building and unit is a named button; status is always WORDED (the
 * engine's STATUS_LABEL / fleet words), never color alone. Status words reuse
 * the existing tables — only the list's own framing lives here.
 */
export const ENTITY_COPY = {
  title: "Entities",
  lead: "Every building and unit in the yard. Buildings open the inspector; units focus the camera.",
  buildings: "Buildings",
  units: "Units",
  level: "level",
  cell: "cell",
  truck: "Truck",
  emptyBuildings: "No buildings yet. Open Build to place the first machine.",
  emptyUnits: "No units yet. Repair the starter drone in Fleet.",
  inspecting: "Inspecting",
  focused: "Focused",
} as const;

export const SHELL_COPY = {
  destinations: "Destinations",
  settings: "Settings",
  expandSheet: "Expand panel",
  collapseSheet: "Collapse panel",
  closePanel: "Close panel",
  backPanel: "Back to previous panel",
  back: "Back",
  open: "Open",
  yardRecord: "Yard record",
  yardRecordHint: "Save, export and import",
  returnReport: "Return report",
  returnReportHint: "What the yard did while you were away",
  noAbsence: "No absence yet",
  afterTutorial: "After tutorial",
  fleetSize: "Fleet",
} as const;