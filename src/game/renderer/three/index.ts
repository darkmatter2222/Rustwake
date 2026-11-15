/*
 * RW3D T07 (#134): the boundary entry for the three.js world layer.
 *
 * #236: scene.ts reaches this module through a probe-gated dynamic import("./three");
 * `blitWorld3D` is the render entry it calls once the chunk resolves. It renders the
 * volumetric yard into a dedicated offscreen WebGL canvas and blits it into the caller's
 * 2D context, returning true so the overlay can skip the flat bodies. It returns false —
 * without touching the context — whenever WebGL is unavailable, so the legacy 2D paint
 * path runs byte for byte. That fallback is what keeps the frozen shell tests green:
 *   - jsdom returns null from getContext;
 *   - tests/ui/camera-50 mocks getContext with a write-only Proxy whose `canvas` is
 *     undefined and whose getParameter(VERSION) is not a string;
 *   - tests/ui/logistics-59's recording context has no drawImage.
 * A real browser passes the probe and gets the three.js world plus the retained 2D
 * information overlay (routes, status, ghost, grid, selection).
 *
 * The renderer reads immutable snapshots + the caller's framePhase only. It holds no save
 * bytes, so a context loss leaves the save unchanged by construction; drawScene paints the
 * context-loss banner itself (world3DStatus), and the onContextLost hook remains available
 * for the shell (#135 wiring delta).
 */
import type { SimState } from "../../simulation/types";
import type { AssemblySnapshot } from "../assembly";
import type { Camera, ViewState } from "../projection";
// #236 (option A): the probe itself now lives in the THREE-free ../webglProbe module so
// scene.ts can gate import("./three") without loading this chunk. Same cached probe,
// same rejection of jsdom null / the write-only Proxy — only its address moved.
import { markWebGLUnavailable, probeWebGL, resetWebGLProbe } from "../webglProbe";
import { YardWorld, type PickResult, type WorldSyncOptions } from "./worldRenderer";

export { YardWorld };
export type { PickResult, WorldSyncOptions };

let world: YardWorld | null = null;

/** The lazy singleton world on its own offscreen canvas (never the visible 2D canvas). */
export function getWorld3D(): YardWorld | null {
  if (typeof document === "undefined") return null;
  if (!probeWebGL()) return null;
  if (!world) {
    try {
      const canvas = document.createElement("canvas");
      world = new YardWorld(canvas);
    } catch {
      world = null;
      markWebGLUnavailable();
    }
  }
  return world;
}

/** Tear down the singleton (tests / hot reload). */
export function disposeWorld3D(): void {
  world?.dispose();
  world = null;
}

/** Reset the cached probe so a test can re-evaluate availability. */
export function resetWorld3DProbe(): void {
  resetWebGLProbe();
}

/**
 * The world layer's health, for the context-loss message: "unavailable" (no WebGL —
 * the legacy 2D paint is the whole renderer), "lost" (context lost — 2D fallback plus
 * the banner in drawScene) or "ready". Never throws.
 */
export function world3DStatus(): "unavailable" | "lost" | "ready" {
  const w = getWorld3D();
  if (!w) return "unavailable";
  return w.isContextLost() ? "lost" : "ready";
}

export interface BlitOptions {
  reducedMotion: boolean;
  framePhase: number;
  selected: number | null;
  /** G1 (#228): build-yard assembly snapshot; absent keeps the legacy instanced frame. */
  assembly?: AssemblySnapshot;
}

/**
 * Render the three.js yard and blit it into `ctx`. Returns false (no context writes) when
 * the 3D path is unavailable, so the caller runs the exact legacy 2D paint. A hidden tab
 * skips the 3D render (hidden-tab pause); the caller's rAF loop is throttled when hidden.
 */
export function blitWorld3D(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  camera: Camera,
  view: ViewState,
  options: BlitOptions
): boolean {
  const canvas = ctx.canvas;
  if (!canvas || typeof ctx.drawImage !== "function") return false;
  if (typeof document !== "undefined" && document.hidden) return false;
  const w = getWorld3D();
  if (!w || w.isContextLost()) return false;
  try {
    w.sync(state, camera, view, {
      reducedMotion: options.reducedMotion,
      framePhase: options.framePhase,
      selected: options.selected,
      assembly: options.assembly,
    });
    w.render();
    ctx.drawImage(w.canvas, 0, 0, view.width, view.height);
    return true;
  } catch {
    return false;
  }
}

/**
 * Raycast selection against the last-synced singleton world. The shell's tap path keeps
 * using projection.screenToWorld + pickTarget (orbit-correct already); this is the extra
 * THREE.Raycaster API for the bench and the #135 shell wiring. Returns null when the 3D
 * world is unavailable (the caller then uses the ground inverse).
 */
export function pickWorld3D(sx: number, sy: number): PickResult | null {
  return world?.pick(sx, sy) ?? null;
}