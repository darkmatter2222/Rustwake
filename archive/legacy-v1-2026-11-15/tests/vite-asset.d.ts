/** Vite's `?raw` suffix yields the file text; the project does not ship vite/client types. */
declare module "*?raw" {
  const content: string;
  export default content;
}
