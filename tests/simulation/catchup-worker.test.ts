import { TUNING } from "../../src/game/content/defs";
import { advance } from "../../src/game/simulation/engine";
import { catchUp } from "../../src/game/simulation/offline";
import { applyCommand, type Command, type CommandBody } from "../../src/game/simulation/commands";
import { createInitialState, type SimState } from "../../src/game/simulation/types";
import { unitTotal } from "../../src/game/simulation/invariants";
import { encodeSave, SAVE_KEY } from "../../src/game/persistence/save";
import {
  CATCHUP_PROTOCOL,
  CATCHUP_WORKER_MIN_TICKS,
  createCatchUpClient,
  handleCatchUp,
} from "../../src/game/workers/catchup";
import { createStore } from "../../src/app/store";
import { handleWorkerMessage } from "../../src/game/workers/catchup.worker";

let seq = 900;
function send(state: SimState, command: CommandBody) {
  seq += 1;
  return applyCommand(state, { ...command, id: `w${seq}` } as Command);
}

/** Same deterministic build as the offline fixtures, built twice for comparison. */
function builtYard(): SimState {
  const state = createInitialState();
  for (let i = 0; i < 6; i += 1) {
    send(state, { type: "manual.salvage" });
    advance(state, TUNING.manualPulseTicks);
  }
  send(state, { type: "drone.repair" });
  advance(state, 262);
  send(state, { type: "machine.build", blueprint: "sorter", tile: 8 });
  const sorter = state.machines[0];
  send(state, { type: "route.connect", from: 0, to: sorter.id, filter: "scrap" });
  send(state, { type: "route.connect", from: sorter.id, to: 0, filter: "ferrous" });
  advance(state, 300);
  return state;
}

const AWAY_MS = 12 * 3600 * 1000;

describe("catch-up handoff (spec 18.5)", () => {
  it("refuses a request from another protocol version", () => {
    expect(handleCatchUp(undefined)).toBeNull();
    const state = builtYard();
    const tickBefore = state.tick;
    expect(
      handleCatchUp({ protocol: CATCHUP_PROTOCOL + 1, id: 1, sim: state, lastSeenMs: 0, nowMs: AWAY_MS })
    ).toBeNull();
    // A refused request advances nothing at all.
    expect(state.tick).toBe(tickBefore);
  });

  it("the shared handler reproduces the direct catch-up exactly", () => {
    const direct = builtYard();
    const handed = builtYard();
    const directResult = catchUp(direct, 1_000, 1_000 + AWAY_MS);
    const handled = handleCatchUp({
      protocol: CATCHUP_PROTOCOL,
      id: 7,
      sim: handed,
      lastSeenMs: 1_000,
      nowMs: 1_000 + AWAY_MS,
    });
    expect(handled).not.toBeNull();
    expect(handled!.protocol).toBe(CATCHUP_PROTOCOL);
    expect(handled!.id).toBe(7);
    expect(handled!.report).toEqual(directResult.report);
    expect(handled!.nextLastSeenMs).toBe(directResult.nextLastSeenMs);
    expect(handled!.sim.tick).toBe(direct.tick);
    expect(handled!.sim.credits).toBe(direct.credits);
    expect(unitTotal(handled!.sim)).toBe(unitTotal(direct));
  });

  it("the worker entry point answers one request with one versioned result", () => {
    const state = builtYard();
    const sent: unknown[] = [];
    handleWorkerMessage(
      { protocol: CATCHUP_PROTOCOL, id: 42, sim: state, lastSeenMs: 5, nowMs: 5 + AWAY_MS },
      (message) => sent.push(message)
    );
    expect(sent).toHaveLength(1);
    const response = sent[0] as { id: number; protocol: number; report: { creditedTicks: number } };
    expect(response.id).toBe(42);
    expect(response.protocol).toBe(CATCHUP_PROTOCOL);
    expect(response.report.creditedTicks).toBe(TUNING.offlineCapTicks);
  });

  it("without workers the client settles inline and keeps answering after a cancel", async () => {
    const client = createCatchUpClient();
    expect(client.backed).toBe("sync");
    const state = builtYard();
    const first = await client.run(state, 10, 10 + AWAY_MS);
    expect(first).not.toBeNull();
    expect(first!.report.creditedTicks).toBe(TUNING.offlineCapTicks);
    client.cancel();
    const second = await client.run(state, first!.nextLastSeenMs, first!.nextLastSeenMs);
    // The clock already moved, so a repeat claims nothing (spec 18.1).
    expect(second).not.toBeNull();
    expect(second!.report.creditedTicks).toBe(0);
  });

  it("the store settles a 12 h credited window once, with the same ledger as the handler", async () => {
    const seed = builtYard();
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, encodeSave(seed, 1_000, { muted: true, reducedMotion: false, textScale: 1 }));
    const store = createStore({ storage, now: () => 1_000 + 18 * 3600 * 1000 });
    expect(store.isReconciling()).toBe(false);
    const report = store.getReturnReport();
    expect(report).not.toBeNull();
    expect(report!.creditedTicks).toBe(TUNING.offlineCapTicks);
    expect(report!.capped).toBe(true);
    expect(store.getState().tick).toBe(seed.tick + TUNING.offlineCapTicks);
    // A second read does not claim the window again (spec 18.1).
    const again = await createCatchUpClient().run(store.getState(), 1_000 + AWAY_MS, 1_000 + AWAY_MS);
    expect(again!.report.creditedTicks).toBe(0);
  });

  it("uses the worker path only for windows long enough to matter", () => {
    // 100 ms per tick, so the shipped threshold is 2 000 s of absence.
    expect(CATCHUP_WORKER_MIN_TICKS).toBe(20_000);
    const storage = memoryStorage();
    const seed = builtYard();
    storage.setItem(
      SAVE_KEY,
      encodeSave(seed, 1_000, { muted: true, reducedMotion: false, textScale: 1 })
    );
    const short = createStore({ storage, now: () => 1_000 + 30_000 });
    // 300 ticks is below the threshold, so the inline path answers before the first frame.
    expect(short.isReconciling()).toBe(false);
    expect(short.getReturnReport()!.creditedTicks).toBe(300);
  });
});

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}
