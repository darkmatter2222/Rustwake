import { describe, expect, it } from "vitest";

/**
 * RW3D T07 (#134): architecture §1 boundary, enforced at the source level.
 *
 * The three.js world layer reads immutable snapshots + the caller's framePhase
 * only: no UI imports, no economy logic, no clock reads, no save bytes, and no
 * import cycle back into scene.ts. The reverse direction is pinned too — the
 * simulation, the content tables and the UI never import THREE or the three/
 * module, so no THREE object can leak across the boundary.
 *
 * Sources are read through Vite raw globs (the project tsconfig is browser-only,
 * so node:fs is intentionally not used here).
 *
 * (scene.ts keeps its pre-existing 2D information-overlay imports from the UI
 * logistics bridge; #135 owns that wiring. The THREE layer itself is clean.)
 */

declare global {
  interface ImportMeta {
    glob(
      pattern: string | string[],
      options: { query: string; import: string; eager: true }
    ): Record<string, string>;
  }
}

const threeSources = import.meta.glob("../../src/game/renderer/three/*.ts", { query: "?raw", import: "default", eager: true });
const rendererSources = import.meta.glob("../../src/game/renderer/*.ts", { query: "?raw", import: "default", eager: true });
const uiSources = import.meta.glob("../../src/ui/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true });
const appSources = import.meta.glob("../../src/app/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true });
const mainSources = import.meta.glob("../../src/main.tsx", { query: "?raw", import: "default", eager: true });
const simSources = import.meta.glob("../../src/game/simulation/**/*.ts", { query: "?raw", import: "default", eager: true });
const contentSources = import.meta.glob("../../src/game/content/**/*.ts", { query: "?raw", import: "default", eager: true });

/** Import/export-from specifiers only (comments may mention names freely). */
function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const re = /(?:import|export)\s[^;]*?from\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) specs.push(m[1]);
  const bare = /import\s*["']([^"']+)["']/g;
  while ((m = bare.exec(source)) !== null) specs.push(m[1]);
  return specs;
}

const CLOCK = /\bDate\.now\b|\bperformance\.now\b|\bnew\s+Date\b|\brequestAnimationFrame\b|\bsetTimeout\b|\bsetInterval\b/;
const STORAGE = /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/;

describe("the three.js layer stays inside the renderer boundary", () => {
  const files = Object.entries(threeSources);

  it("has modules to check", () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  it("never imports the UI, the app shell or React", () => {
    for (const [file, source] of files) {
      for (const spec of importSpecifiers(source)) {
        expect(spec, file).not.toMatch(/(^|\/)(ui|app)(\/|$)/);
        expect(spec, file).not.toBe("react");
        expect(spec, file).not.toMatch(/^react\//);
      }
    }
  });

  it("never imports scene.ts (no cycle across the blit boundary)", () => {
    for (const [file, source] of files) {
      for (const spec of importSpecifiers(source)) {
        expect(spec, file).not.toMatch(/(^|\/)scene$/);
      }
    }
  });

  it("reads no clock and no storage — animation comes from framePhase only", () => {
    for (const [file, source] of files) {
      expect(CLOCK.test(source), file).toBe(false);
      expect(STORAGE.test(source), file).toBe(false);
    }
  });

  it("imports the simulation as types only — no commands, no engine, no writes", () => {
    for (const [file, source] of files) {
      const re = /import\s+(type\s+)?[^;]*?from\s*["']([^"']*simulation[^"']*)["']/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(source)) !== null) {
        expect(m[1], `${file}: ${m[2]}`).toBe("type ");
        expect(m[2], file).toMatch(/\/types$/);
      }
    }
  });
});

describe("THREE never leaks out of the three/ module", () => {
  it("the pure renderer modules do not import three", () => {
    for (const [file, source] of Object.entries(rendererSources)) {
      for (const spec of importSpecifiers(source)) {
        expect(spec, file).not.toBe("three");
        expect(spec, file).not.toMatch(/^three\//);
      }
    }
  });

  it("the simulation and content never import three or the three/ module", () => {
    for (const [file, source] of [...Object.entries(simSources), ...Object.entries(contentSources)]) {
      for (const spec of importSpecifiers(source)) {
        expect(spec, file).not.toBe("three");
        expect(spec, file).not.toMatch(/renderer\/three/);
      }
    }
  });

  it("the UI and app shell never import three or the three/ module", () => {
    const files = [
      ...Object.entries(uiSources),
      ...Object.entries(appSources),
      ...Object.entries(mainSources),
    ];
    expect(files.length).toBeGreaterThan(0);
    for (const [file, source] of files) {
      for (const spec of importSpecifiers(source)) {
        expect(spec, file).not.toBe("three");
        expect(spec, file).not.toMatch(/^three\//);
        expect(spec, file).not.toMatch(/renderer\/three/);
      }
    }
  });
});

describe("the renderer reads snapshots, not the clock", () => {
  it("no renderer module reads a clock or storage", () => {
    const files = [...Object.entries(rendererSources), ...Object.entries(threeSources)];
    for (const [file, source] of files) {
      expect(CLOCK.test(source), file).toBe(false);
      expect(STORAGE.test(source), file).toBe(false);
    }
  });
});