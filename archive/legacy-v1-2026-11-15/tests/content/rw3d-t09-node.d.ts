/**
 * T09 (#136): minimal ambient Node typings for tests/content/rw3d-t09-kit.test.ts.
 * The root tsconfig sets types:["vitest/globals"] and the root package.json has
 * no @types/node; both are outside #136 write paths, so this shim declares only
 * the exact surface the kit gate uses. Runtime resolution is unaffected: vitest
 * executes the real node builtins. Pattern: tests/simulation/probe-belt.d.ts.
 */
declare module "node:child_process" {
  export function execFileSync(
    file: string,
    args: readonly string[],
    options?: { cwd?: string; encoding?: string }
  ): string;
}
declare module "node:fs" {
  export function readFileSync(path: string, encoding: string): string;
  export function mkdtempSync(prefix: string): string;
}
declare module "node:os" {
  export function tmpdir(): string;
}
declare module "node:path" {
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
}
declare const __dirname: string;
declare const process: { execPath: string };
