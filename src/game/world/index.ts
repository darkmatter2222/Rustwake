/**
 * World grid public API (issue #133, RW3D T06).
 *
 * Versioned parcels + terrain, rotated occupancy, crane keep-out clearance,
 * entrance corridors and atomic construction transactions. Read-only reuse
 * of the audited simulation/content/economy cores; no save-format change in
 * this issue (additive seam reserved for #148).
 */
export * from "./types";
export * from "./kit";
export * from "./geometry";
export * from "./terrain";
export * from "./transactions";
export * from "./engine";