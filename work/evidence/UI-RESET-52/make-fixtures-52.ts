/**
 * UI-RESET-52 (issue #52): seeded save fixtures for the headless catalog probe.
 *
 * Run from the worktree root:
 *   pnpm exec tsx work/evidence/UI-RESET-52/make-fixtures-52.ts
 *
 * Both fixtures are produced by the REAL engine and the REAL save encoder —
 * no hand-edited sim fields. The only test-side mutations are the documented
 * ones below, and they live in this evidence script, never in src/:
 *
 *   fresh.json   createInitialState + 1 tick. Tutorial 0, empty store, wreck
 *                intact: the gate floors at step 4, so only the sorter is
 *                unlocked and every card is unaffordable (have 0). Written at
 *                Date.now() so no catch-up window runs.
 *   mature.json  the overlay-stack yard(8) walk: six salvage pulses, repaired
 *                drone, tutorial 9, all eight blueprints built and connected
 *                through machine.build/route.connect, 300 ticks after each.
 *                Then +60 scrap / +30 ferrous (storeUnits +90) so the furnace
 *                placement under test is affordable with a 3x margin — the
 *                same funding the acceptance suite uses. Written 60 s in the
 *                past so the boot settles a return report inline (the paired
 *                overlay budget and the Escape stack are part of the proof).
 *
 * Settings: muted (headless has no audio device). The probe derives the 200%
 * text variant in memory from mature.json (settings.textScale = 2, checksum
 * recomputed) — that mutation is documented in the probe receipt.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BLUEPRINTS, TUNING } from "../../../src/game/content/defs";
import {
  applyCommand,
  DOCK_TILE,
  YARD_TILES,
  type Command,
  type CommandBody,
} from "../../../src/game/simulation/commands";
import { planConnections } from "../../../src/game/simulation/autoconnect";
import { advance } from "../../../src/game/simulation/engine";
import { createInitialState, type SimState } from "../../../src/game/simulation/types";
import { DEFAULT_SETTINGS, encodeSave } from "../../../src/game/persistence/save";

const here = path.dirname(fileURLToPath(import.meta.url));

const ORDER = [
  "sorter",
  "furnace",
  "copperSeparator",
  "polymerRecycler",
  "wireMill",
  "platePress",
  "circuitAssembler",
  "signalLab",
] as const;

const firstFree = (state: SimState): number => {
  for (let tile = 0; tile < YARD_TILES; tile += 1) {
    if (tile === DOCK_TILE) continue;
    if (!state.machines.some((m) => m.tile === tile)) return tile;
  }
  return 8;
};

function matureYard(): SimState {
  const state = createInitialState();
  let seq = 0;
  const send = (body: CommandBody) =>
    applyCommand(state, { ...body, id: `s${(seq += 1)}` } as Command);
  for (let pass = 0; pass < 6; pass += 1) {
    send({ type: "manual.salvage" });
    advance(state, TUNING.manualPulseTicks);
  }
  send({ type: "drone.repair" });
  advance(state, 262);
  state.tutorial = 9;
  for (const blueprint of ORDER) {
    for (const item of BLUEPRINTS[blueprint].buildCost) {
      state.store = { ...state.store, [item.resource]: item.qty };
    }
    state.storeUnits = Object.values(state.store).reduce((total, qty) => total + qty, 0);
    send({ type: "machine.build", blueprint, tile: firstFree(state) });
    const machineId = state.machines[state.machines.length - 1].id;
    for (const plan of planConnections(state, machineId)) {
      send({ type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
    }
    advance(state, 300);
  }
  state.credits = 100;
  state.store = { ...state.store, data: 12 };
  state.storeUnits += 12;
  // Documented test-side funding: the placement under test must be affordable.
  state.store = {
    ...state.store,
    scrap: (state.store.scrap ?? 0) + 60,
    ferrous: (state.store.ferrous ?? 0) + 30,
  };
  state.storeUnits += 90;
  advance(state, 1);
  return state;
}

const settings = { ...DEFAULT_SETTINGS, muted: true };

const fresh = createInitialState();
advance(fresh, 1);
writeFileSync(path.join(here, "fresh.json"), encodeSave(fresh, Date.now(), settings));

const mature = matureYard();
writeFileSync(path.join(here, "mature.json"), encodeSave(mature, Date.now() - 60_000, settings));

console.log(
  `make-fixtures-52: fresh (tutorial ${fresh.tutorial}, ${Object.keys(fresh.store).length} store lines) + ` +
    `mature (tutorial ${mature.tutorial}, ${mature.machines.length} machines, ` +
    `scrap ${mature.store.scrap}, ferrous ${mature.store.ferrous}) written`
);
