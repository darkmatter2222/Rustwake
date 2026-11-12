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
