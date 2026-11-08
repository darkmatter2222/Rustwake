/**
 * Type surface of the BELT-001 harness for the test side. The probe itself is plain
 * JavaScript (`scripts/probe-belt.mjs`) and runs under `tsx`, so `tsc` sees only this
 * declaration; the shapes below are the object the probe writes into
 * `work/feedback/belt001-harness.json`, which the tests import as JSON.
 */
declare module "*.mjs" {
  export const LAYOUTS: Record<"compact" | "spread", number[]>;
  export function ladderRow(
    branch: "speed" | "buffer" | "draw" | "policy" | null,
    ladder: "regular" | "gap9" | "gap6",
    tileOrder: number[] | null
  ): Record<string, unknown>;
  export const MMG: Record<string, { absolute: number; relative?: number }>;
}
