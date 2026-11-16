// UI-RESET-95: DOM-identity harness for the Panels.tsx -> panels/** split.
//
// Renders all five panels through the PUBLIC `src/ui/Panels` surface under one
// deterministic seeded yard, in jsdom with react-dom/client + act, and hashes the
// serialized DOM (raw + whitespace-normalized). Run the SAME script from each
// worktree root; every module (react, react-dom, jsdom, src/**) resolves from
// process.cwd(), so each run uses that worktree's own code and React instance:
//
//   pnpm exec tsx work/evidence/UI-RESET-95/dom-identity-95.mts <out.json> [headSha]
//
// (from the baseline worktree, pass the absolute path of this script). Compare the
// two receipts: every panel capture hash, the seeded-state digest and the recorded
// command-id sequence must be identical. The command log exercises the shared
// `nextId` counter across Machine/Store/Research panels in one fixed click order -
// a per-panel duplicated counter would change the ids and fail the comparison.
// DOM/console probes only - no visual inspection. Not a test file: no vitest import,
// no tests/** path; it is evidence tooling under work/evidence.
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const cwd = process.cwd();
const outPath = process.argv[2];
const headSha = process.argv[3] ?? "unknown";
if (!outPath) {
  console.error("usage: tsx dom-identity-95.mts <out.json> [headSha]");
  process.exit(1);
}

const req = createRequire(join(cwd, "package.json"));
const { JSDOM } = req("jsdom");
const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
const w = dom.window as any;
for (const key of [
  "window", "document", "navigator", "HTMLElement", "HTMLTextAreaElement",
  "HTMLInputElement", "Node", "Event", "MouseEvent", "KeyboardEvent",
  "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "localStorage",
]) {
  Object.defineProperty(globalThis, key, { value: w[key], configurable: true, writable: true });
}
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const React = req("react");
const { createRoot } = req("react-dom/client");
const act: (cb: () => void) => void = React.act ?? req("react-dom/test-utils").act;
const h = React.createElement;

const src = (p: string) => import(pathToFileURL(join(cwd, "src", p)).href);
const { MachinePanel, StorePanel, ResearchPanel, YardPanel, ReturnReportPanel } = await src("ui/Panels.tsx");
const { createInitialState } = await src("game/simulation/types.ts");
const { advance } = await src("game/simulation/engine.ts");
const { applyCommand } = await src("game/simulation/commands.ts");
const { TUNING, RESOURCES } = await src("game/content/defs.ts");

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

// ---- deterministic seed (same ladder as tests/ui/panel-rows.test.tsx, extended) ----
let wseq = 900;
const send = (state: any, body: any) => applyCommand(state, { ...body, id: `w${(wseq += 1)}` });
const state = createInitialState();
for (let i = 0; i < 6; i += 1) {
  send(state, { type: "manual.salvage" });
  advance(state, TUNING.manualPulseTicks);
}
send(state, { type: "drone.repair" });
advance(state, 262);
send(state, { type: "machine.build", blueprint: "sorter", tile: 8 });
const sorter = state.machines[state.machines.length - 1];
send(state, { type: "route.connect", from: 0, to: sorter.id, filter: "scrap" });
send(state, { type: "route.connect", from: sorter.id, to: 0, filter: "ferrous" });
advance(state, 120);
state.tutorial = 9;
state.exportClaimed = true;
// One known research node -> the card list shows known + open + locked states.
send(state, { type: "research.buy", node: "cutters" });
if ((state.research.cutters ?? 0) === 0) state.research = { ...state.research, cutters: 1 };
// Stock every resource so a second machine (furnace, no links -> pending plans)
// builds and the store shows sell buttons; overflow exercises the overflow row.
for (const r of RESOURCES) state.store[r] = (state.store[r] ?? 0) + 500;
state.storeUnits = Object.values(state.store).reduce((a: number, b: any) => a + (b ?? 0), 0);
send(state, { type: "machine.build", blueprint: "furnace", tile: 9 });
const furnace = state.machines[state.machines.length - 1];
state.overflow = [{ resource: "scrap", qty: 7 }];
const stateDigest = sha(JSON.stringify(state));

// ---- recorders ----
const commands: any[] = [];
const dispatch = (cmd: any) => { commands.push(cmd); return undefined; };
const importCalls: string[] = [];
const onImport = (text: string) => { importCalls.push(text); return { ok: true, tick: 4242, machines: 1 }; };
const onClose = () => undefined;
const exportText = "rustwake-save-export-seed-UI-RESET-95";
const report = {
  awayTicks: 18298, creditedTicks: 7200, capped: true,
  gains: { scrap: 120, ferrous: 45, data: 7, copper: 3 },
  creditsGained: 42, deliveries: 3, batchesDone: 9, bottleneck: "power-limited",
};

// ---- render + capture helpers ----
type Capture = { label: string; bytes: number; rawSha256: string; normalizedSha256: string; normalizedDom: string };
const panels: Record<string, Capture[]> = {
  MachinePanel: [], StorePanel: [], ResearchPanel: [], YardPanel: [], ReturnReportPanel: [],
};
function mount(node: any) {
  const host = w.document.createElement("div");
  w.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(node); });
  return { host, root };
}
function capture(panel: string, label: string, host: any) {
  const html: string = host.innerHTML;
  const normalized = norm(html);
  panels[panel].push({
    label, bytes: html.length,
    rawSha256: sha(html), normalizedSha256: sha(normalized), normalizedDom: normalized,
  });
}
const click = (el: any) => act(() => { el.click(); });
const buttons = (host: any, sel: string) => [...host.querySelectorAll(sel)] as any[];
function setTextarea(el: any, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype, "value")!.set!;
    setter.call(el, value);
    el.dispatchEvent(new w.Event("input", { bubbles: true }));
  });
}

// ---- MachinePanel: sorter (links, page 0 + page 1), furnace (pending plans, power-limited) ----
{
  const { host, root } = mount(h(MachinePanel, {
    state, machine: sorter, tick: state.tick, powerRatio: 1, dispatch, onClose,
  }));
  capture("MachinePanel", "sorter-page0", host);
  const actions = buttons(host, ".panel__actions button");
  for (const btn of actions.slice(0, -1)) click(btn); // command faces, not the page toggle
  click(actions[actions.length - 1]); // -> recipe page
  capture("MachinePanel", "sorter-page1", host);
  act(() => { root.unmount(); });
}
{
  const { host, root } = mount(h(MachinePanel, {
    state, machine: furnace, tick: state.tick, powerRatio: 0.5, dispatch, onClose,
  }));
  capture("MachinePanel", "furnace-powerLimited-page0", host);
  const actions = buttons(host, ".panel__actions button");
  for (const btn of actions.slice(0, -1)) click(btn); // connect plans + command faces
  act(() => { root.unmount(); });
}

// ---- StorePanel: rows + sell buttons ----
{
  const { host, root } = mount(h(StorePanel, { state, dispatch, onClose }));
  capture("StorePanel", "store", host);
  for (const btn of buttons(host, ".panel__row button")) click(btn);
  act(() => { root.unmount(); });
}

// ---- ResearchPanel: known / open / locked cards ----
{
  const { host, root } = mount(h(ResearchPanel, { state, dispatch, onClose }));
  capture("ResearchPanel", "research", host);
  for (const btn of buttons(host, "button.node__buy:not([disabled])")) click(btn);
  act(() => { root.unmount(); });
}

// ---- YardPanel: export page, import page, applied note, back ----
{
  const { host, root } = mount(h(YardPanel, { state, exportText, onImport, onClose }));
  capture("YardPanel", "yard-page0", host);
  const actions0 = buttons(host, ".panel__actions button");
  click(actions0[0]); // Copy (no clipboard in jsdom -> manual-copy note)
  capture("YardPanel", "yard-page0-copyManual", host);
  click(actions0[1]); // Import -> page 1
  capture("YardPanel", "yard-page1", host);
  setTextarea(host.querySelector("textarea.panel__code"), "pasted-save-text-UI-RESET-95");
  const actions1 = buttons(host, ".panel__actions button");
  click(actions1[0]); // Apply -> onImport stub -> note
  capture("YardPanel", "yard-page1-applied", host);
  click(actions1[1]); // Back -> page 0 with the applied note
  capture("YardPanel", "yard-page0-back", host);
  act(() => { root.unmount(); });
}

// ---- ReturnReportPanel: capped report with gains + bottleneck ----
{
  const { host, root } = mount(h(ReturnReportPanel, { report, onClose }));
  capture("ReturnReportPanel", "return-report", host);
  act(() => { root.unmount(); });
}

const receipt = {
  task: "UI-RESET-95 Panels split DOM-identity harness",
  issue: "https://github.com/darkmatter2222/Rustwake/issues/95",
  worktree: cwd,
  headSha,
  measuredAt: new Date().toISOString(),
  tool: "tsx + jsdom 25 + react-dom/client createRoot + act; DOM serialization hashes only (no visual inspection)",
  seed: {
    description: "createInitialState + 6 salvage pulses + drone repair + sorter(tile 8) with 2 links + 120 ticks + tutorial 9 + exportClaimed + cutters research + 500 of every resource + furnace(tile 9, unlinked) + overflow 7 scrap",
    tick: state.tick,
    machines: state.machines.map((m: any) => ({ id: m.id, blueprint: m.blueprint, tile: m.tile })),
    stateSha256: stateDigest,
  },
  panels,
  commandLog: commands,
  commandLogSha256: sha(JSON.stringify(commands)),
  importCalls,
  importCallsSha256: sha(JSON.stringify(importCalls)),
  scriptSha256: sha(readFileSync(fileURLToPath(import.meta.url), "utf8")),
};
writeFileSync(outPath, JSON.stringify(receipt, null, 2) + "\n");
const counts = Object.fromEntries(Object.entries(panels).map(([k, v]) => [k, v.length]));
console.log(`wrote ${outPath}: captures=${JSON.stringify(counts)} commands=${commands.length} stateSha256=${stateDigest}`);