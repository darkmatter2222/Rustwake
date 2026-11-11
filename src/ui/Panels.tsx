/**
 * UI-RESET-95 (G2 enabler): pure re-export facade. The five panels moved verbatim into
 * `src/ui/panels/` so wave-3 children can each own one module (#54 MachinePanel,
 * #56 StorePanel) without sharing a single file. Every export name and prop signature
 * is preserved; importers (`App.tsx` and the panel tests) keep importing `./Panels`.
 * The shared row grammar and the one command-id counter live in `panels/shared.tsx`,
 * so the id sequence stays a single counter across all panels, exactly as before.
 */
export { MachinePanel } from "./panels/MachinePanel";
export { StorePanel } from "./panels/StorePanel";
export { ResearchPanel } from "./panels/ResearchPanel";
export { YardPanel } from "./panels/YardPanel";
export { ReturnReportPanel } from "./panels/ReturnReportPanel";