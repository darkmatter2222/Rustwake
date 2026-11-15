/*
 * #236 (option A): the WebGL availability probe, moved VERBATIM out of three/index.ts
 * into this THREE-free module so scene.ts can gate the dynamic import("./three")
 * without statically loading the very chunk it gates. The probe logic, its once-only
 * cache and its rejection of the frozen shell contexts are unchanged:
 *   - jsdom returns null from getContext;
 *   - tests/ui/camera-50's write-only Proxy has getParameter(VERSION) !== string;
 *   - a real browser passes and gets the three.js world.
 * three/index.ts keeps consuming the same cached result (getWorld3D / resetWorld3DProbe
 * delegate here), so probe semantics stay single-sourced across the boundary.
 */

let glAvailable: boolean | null = null;

/** Probe WebGL once on a throwaway canvas. Rejects jsdom null and the write-only Proxy
 * (getParameter(VERSION) must be a real string), never the visible 2D canvas. */
export function probeWebGL(): boolean {
  if (glAvailable !== null) return glAvailable;
  try {
    const probe = document.createElement("canvas");
    const gl =
      (probe.getContext("webgl2") as WebGLRenderingContext | null) ??
      (probe.getContext("webgl") as WebGLRenderingContext | null);
    glAvailable =
      !!gl &&
      typeof gl.getParameter === "function" &&
      typeof gl.getParameter(gl.VERSION) === "string";
  } catch {
    glAvailable = false;
  }
  return glAvailable;
}

/** Reset the cached probe so a test can re-evaluate availability. */
export function resetWebGLProbe(): void {
  glAvailable = null;
}

/** Cache a negative result after a world-construction failure (three/index.ts). */
export function markWebGLUnavailable(): void {
  glAvailable = false;
}