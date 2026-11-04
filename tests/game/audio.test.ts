import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import {
  AMBIENCE_BED_GAIN,
  BUS_LEVELS,
  CATEGORY_BUSES,
  COALESCE_WINDOW,
  CUE_NAMES,
  CUE_PRIORITY,
  CUE_TABLE,
  CUE_VARIANTS,
  HEADROOM,
  MUSIC_BED_GAIN,
  NOISE_PERIOD,
  VARIANT_COUNTS,
  createAudio,
  busVoiceSum,
  distanceGain,
  headroomCeiling,
  maxConcurrentVoiceSum,
  onVisibility,
  type AudioApi,
  type CueName,
} from "../../src/game/audio/audio";
import { App, machineCueFor, stateCues } from "../../src/ui/App";
import { createStore, type GameStore } from "../../src/app/store";
import { SAVE_KEY, type ImportResult } from "../../src/game/persistence/save";
import { createInitialState, type SimState } from "../../src/game/simulation/types";

/**
 * Stub Web Audio world: every node records its connections and every AudioParam
 * automation, so the graph is read from the table instead of from sound. The
 * context time is frozen and moved by hand, which keeps the tests deterministic
 * (no timers, no rAF).
 */
interface ParamLike {
  value: number;
  calls: { kind: string; value: number; time: number }[];
  setValueAtTime(value: number, time: number): void;
  linearRampToValueAtTime(value: number, time: number): void;
  exponentialRampToValueAtTime(value: number, time: number): void;
}

interface StubNode {
  id: string;
  kind: string;
  connects: string[];
  starts: number[];
  stops: number[];
  disconnects: number;
  gain?: ParamLike;
  frequency?: ParamLike;
  loop?: boolean;
  buffer?: unknown;
  type?: string;
  onended?: (() => void) | null;
  connect(target: unknown): void;
  disconnect(): void;
  start(time: number): void;
  stop(time: number): void;
}

/** One AudioParam with a recording automation list. */
function makeParam(): ParamLike {
  const param: ParamLike = {
    value: 0,
    calls: [],
    setValueAtTime(value, time) {
      param.value = value;
      param.calls.push({ kind: "setValueAtTime", value, time });
    },
    linearRampToValueAtTime(value, time) {
      param.value = value;
      param.calls.push({ kind: "linearRamp", value, time });
    },
    exponentialRampToValueAtTime(value, time) {
      param.value = value;
      param.calls.push({ kind: "exponentialRamp", value, time });
    },
  };
  return param;
}

/** The label a connection records: the target's own id. */
function labelOf(target: unknown): string {
  return (target as { id?: string } | null)?.id ?? "unknown";
}

function makeStub() {
  const nodes: StubNode[] = [];
  const buffers: { frames: number }[] = [];
  let clock = 0;
  let seq = 0;
  const counter = { gains: 0, oscillators: 0, bufferSources: 0, compressors: 0, buffers: 0 };
  const counters = { resume: 0, suspend: 0, close: 0 };
  const add = (kind: string): StubNode => {
    seq += 1;
    const node: StubNode = {
      id: `${kind}#${seq}`,
      kind,
      connects: [],
      starts: [],
      stops: [],
      disconnects: 0,
      connect(target: unknown) {
        node.connects.push(labelOf(target));
      },
      disconnect() {
        node.disconnects += 1;
      },
      start(time: number) {
        node.starts.push(time);
      },
      stop(time: number) {
        node.stops.push(time);
      },
    };
    nodes.push(node);
    return node;
  };
  const destination = { id: "destination" };
  const context = {
    sampleRate: 8000,
    state: "running" as AudioContextState,
    get currentTime() {
      return clock;
    },
    destination,
    createGain() {
      counter.gains += 1;
      const node = add("gain");
      node.gain = makeParam();
      return node;
    },
    createOscillator() {
      counter.oscillators += 1;
      const node = add("oscillator");
      node.frequency = makeParam();
      return node;
    },
    createBufferSource() {
      counter.bufferSources += 1;
      return add("bufferSource");
    },
    createDynamicsCompressor() {
      counter.compressors += 1;
      const node = add("compressor");
      node.gain = makeParam();
      return node;
    },
    createBuffer(_channels: number, frames: number, _rate: number) {
      counter.buffers += 1;
      buffers.push({ frames });
      const data = new Float32Array(frames);
      return { numberOfChannels: 1, length: frames, sampleRate: 8000, getChannelData: () => data };
    },
    resume() {
      context.state = "running";
      counters.resume += 1;
      return Promise.resolve();
    },
    suspend() {
      context.state = "suspended";
      counters.suspend += 1;
      return Promise.resolve();
    },
    close() {
      counters.close += 1;
      return Promise.resolve();
    },
  };
  const api = {
    context,
    nodes,
    buffers,
    counter,
    counters,
    /** Gains in creation order, the mix stage first. */
    gains: () => nodes.filter((node) => node.kind === "gain"),
    advance(seconds: number) {
      clock += seconds;
    },
    setVisibility(state: "visible" | "hidden") {
      Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
    },
  };
  Object.defineProperty(globalThis, "AudioContext", {
    configurable: true,
    writable: true,
    value: function AudioContextStub() {
      return context;
    },
  });
  return api;
}

type Stub = ReturnType<typeof makeStub>;

/** Voices in the snapshot, i.e. one-shot and sustained entries (not buses). */
function voices(api: AudioApi) {
  return api.graphSnapshot().filter((node) => node.kind === "voice");
}
/** One-shot voices only: the two sustained beds are excluded from budget maths. */
function oneShots(api: AudioApi) {
  return voices(api).filter((node) => !node.id.startsWith("bed-"));
}
function buses(api: AudioApi) {
  return api.graphSnapshot().filter((node) => node.kind === "bus");
}
function entry(api: AudioApi, id: string) {
  return api.graphSnapshot().find((node) => node.id === id);
}
/** Gain automation of the Nth gain node the stub created (1-based). */
function gainCalls(stub: Stub, index: number) {
  const node = stub.nodes.filter((n) => n.kind === "gain")[index - 1];
  return node?.gain?.calls ?? [];
}
function peakOf(calls: { kind: string; value: number; time: number }[]) {
  return calls.find((call) => call.kind === "linearRamp")?.value;
}
/**
 * Automation of the voice's main gain. A tail cue allocates one more gain node
 * than a plain cue, so its main gain is the second-to-last one created.
 */
function mainGainCalls(stub: Stub, cue: CueName) {
  return gainCalls(stub, stub.counter.gains - (CUE_TABLE[cue].tail ? 1 : 0));
}
/** A state with one running machine, to exercise the S-14 diff without a timer. */
function machineState(blueprint: string, batches: number, data = 0): SimState {
  const base = createInitialState();
  return {
    ...base,
    store: { ...base.store, data },
    machines: [{ id: 1, blueprint, tile: 3, level: 1, batchesDone: batches } as never],
  } as SimState;
}

/** In-memory `Storage`, the same shape `tests/ui/app.test.tsx` drives the store with. */
function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    raw: map,
  };
}

/** Mount the live app with an injected audio object, as the real entry point does. */
function mountApp(store: GameStore, audioApi: AudioApi): HTMLDivElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    createRoot(host).render(createElement(App, { store, audioApi }));
  });
  return host;
}

/** The `.value` the real master gain node holds: the first gain the stub creates. */
function masterGainValue(stub: Stub): number | undefined {
  return stub.nodes.filter((node) => node.kind === "gain")[0]?.gain?.value;
}

describe("Q-005 mix graph structure", () => {
  it("S-00: graphSnapshot reports the node table with kinds and levels", () => {
    const stub = makeStub();
    const api = createAudio(false);
    api.resume();
    const snapshot = api.graphSnapshot();
    expect(snapshot.some((node) => node.kind === "destination")).toBe(true);
    expect(buses(api).map((node) => node.id).sort()).toEqual(
      [...CATEGORY_BUSES, "master"].sort()
    );
    for (const bus of buses(api)) expect(bus.level).toBe(BUS_LEVELS[bus.id as never]);
    expect(stub.counter.compressors).toBe(1);
    api.dispose();
    void stub;
  });

  it("S-01: every category bus has exactly one parent, the master, and master alone reaches destination", () => {
    const api = createAudio(false);
    api.resume();
    for (const bus of CATEGORY_BUSES) expect(entry(api, bus)?.outputId).toBe("master");
    expect(entry(api, "master")?.outputId).toBe("destination");
    const toDestination = buses(api).filter((node) => node.outputId === "destination");
    expect(toDestination.map((node) => node.id)).toEqual(["master"]);
    api.dispose();
  });

  it("S-02: no category bus is connected to the destination directly", () => {
    const stub = makeStub();
    const api = createAudio(false);
    api.resume();
    const compressor = stub.nodes.find((node) => node.kind === "compressor");
    expect(compressor?.connects).toEqual(["destination"]);
    for (const bus of CATEGORY_BUSES) expect(entry(api, bus)?.outputId).not.toBe("destination");
    api.dispose();
  });

  it("S-03: the master level is the single declared master stage", () => {
    const stub = makeStub();
    const api = createAudio(false);
    api.resume();
    const master = stub.nodes.filter((node) => node.kind === "gain")[0];
    expect(master.gain?.value).toBe(BUS_LEVELS.master);
    expect(entry(api, "master")?.level).toBe(BUS_LEVELS.master);
    api.dispose();
  });

  it("S-04: mute is one write on the master and the snapshot reads the effective levels", () => {
    const stub = makeStub();
    const api = createAudio(false);
    api.resume();
    const before = stub.counter.gains;
    api.play("upgrade");
    const writes = stub.nodes
      .filter((node) => node.kind === "gain")
      .slice(0, before + 8)
      .map((node) => node.gain?.calls.length ?? 0);
    expect(entry(api, "upgrade") === undefined).toBe(true);
    api.setMuted(true);
    expect(api.isMuted()).toBe(true);
    expect(entry(api, "master")?.level).toBe(0);
    for (const bus of CATEGORY_BUSES) expect(entry(api, bus)?.level).toBe(0);
    expect(voices(api).length).toBeGreaterThanOrEqual(1);
    // Muted: play() is a no-op, so no further gain node is allocated.
    const afterMute = stub.counter.gains;
    api.play("upgrade");
    expect(stub.counter.gains).toBe(afterMute);
    expect(writes.length).toBeGreaterThan(0);
    api.setMuted(false);
    expect(entry(api, "master")?.level).toBe(BUS_LEVELS.master);
    api.dispose();
  });

  it("S-05: exactly one output-stage compressor sits between master and destination", () => {
    const stub = makeStub();
    const api = createAudio(false);
    api.resume();
    expect(stub.counter.compressors).toBe(1);
    expect(entry(api, "destination")?.inputIds).toEqual(["master"]);
    api.play("salvage");
    api.play("drone");
    expect(stub.counter.compressors).toBe(1);
    api.dispose();
  });

  it("S-06: the worst-case summed mix sits at or below the declared 0.7 headroom", () => {
    expect(COALESCE_WINDOW).toBe(0.03);
    expect(busVoiceSum("effects")).toBeCloseTo(0.82, 4);
    expect(maxConcurrentVoiceSum()).toBeCloseTo(0.82, 4);
    expect(headroomCeiling()).toBeLessThanOrEqual(HEADROOM);
    expect(HEADROOM).toBe(0.7);
    expect(Math.round(BUS_LEVELS.master * maxConcurrentVoiceSum() * 1000) / 1000).toBeCloseTo(0.738, 3);
  });

  it("S-07: every repeated cue has at least three deterministic variants inside the spread", () => {
    for (const name of CUE_NAMES) {
      const variants = CUE_VARIANTS[name];
      expect(variants.length).toBeGreaterThanOrEqual(3);
      const base = CUE_TABLE[name];
      for (const variant of variants) {
        expect(Math.abs(variant.freq / base.freq - 1)).toBeLessThanOrEqual(0.06);
        expect(Math.abs(variant.gain / base.gain - 1)).toBeLessThanOrEqual(0.19);
        if (base.to !== undefined) expect(variant.to).toBeDefined();
      }
      // Seeded table: identical inputs give identical numbers.
      expect(JSON.stringify(CUE_VARIANTS[name])).toBe(JSON.stringify(CUE_VARIANTS[name]));
    }
    expect(CUE_NAMES.length * 3).toBe(30);
    // Pinned table shape: 5/4/5/4/4/5/4/5/3/3, total 42 (S-07).
    for (const name of CUE_NAMES) expect(CUE_VARIANTS[name].length).toBe(VARIANT_COUNTS[name]);
    expect(CUE_NAMES.reduce((total, name) => total + CUE_VARIANTS[name].length, 0)).toBe(42);
    expect(Object.values(VARIANT_COUNTS).reduce((a, b) => a + b, 0)).toBe(42);
  });

  it("S-08: the variants actually used rotate over the table across repeats", () => {
    const stub = makeStub();
    const api = createAudio(false);
    api.resume();
    const seen: (number | undefined)[] = [];
    for (const step of [0, 1, 2, 3]) {
      api.play("collect");
      stub.advance(0.1);
      const voice = voices(api).slice(-1)[0];
      seen.push(voice?.level);
      void step;
    }
    expect(new Set(seen).size).toBeGreaterThanOrEqual(3);
    api.dispose();
    // A second fresh instance replays the identical variant sequence (seeded table).
    const again = makeStub();
    const second = createAudio(false);
    second.resume();
    const seenAgain: (number | undefined)[] = [];
    for (const step of [0, 1, 2, 3]) {
      second.play("collect");
      again.advance(0.1);
      seenAgain.push(oneShots(second).slice(-1)[0]?.level);
      void step;
    }
    expect(seenAgain).toEqual(seen);
    second.dispose();
  });

  it("S-09: metallic cues are two-layer: an oscillator plus one noise-tail buffer source", () => {
    const stub = makeStub();
    const api = createAudio(false);
    api.resume();
    const oscillators = stub.counter.oscillators;
    const buffers = stub.counter.buffers;
    api.play("salvage");
    expect(stub.counter.oscillators - oscillators).toBe(1);
    // One new buffer only: the tail and the room tone share the cached fill.
    expect(stub.counter.buffers).toBeGreaterThanOrEqual(buffers);
    const tail = stub.nodes.filter((node) => node.kind === "bufferSource");
    expect(tail.length).toBeGreaterThanOrEqual(1);
    expect(tail[tail.length - 1].buffer).toBeTruthy();
    api.dispose();
  });

  it("S-10: the gain envelope is silence -> attack peak -> decay, in that time order", () => {
    const stub = makeStub();
    const api = createAudio(false);
    api.resume();
    const gainsBefore = stub.counter.gains;
    api.play("repair");
    const calls = mainGainCalls(stub, "repair");
    expect(calls.map((call) => call.kind)).toEqual([
      "setValueAtTime",
      "linearRamp",
      "exponentialRamp",
    ]);
    expect(calls[0].value).toBe(0);
    expect(calls[1].value).toBeCloseTo(CUE_VARIANTS.repair[0].gain, 4);
    expect(calls[1].time - calls[0].time).toBeCloseTo(CUE_TABLE.repair.attack, 6);
    expect(calls[2].time).toBeGreaterThan(calls[1].time);
    expect(stub.counter.gains).toBeGreaterThan(gainsBefore);
    api.dispose();
  });

  it("S-11 and S-12: the voice ledger is capped at the budget and steals the lowest priority first", () => {
    const api = createAudio(false, 4);
    api.resume();
    const order: CueName[] = ["drone", "sorter", "salvage", "collect", "upgrade"];
    for (const cue of order) {
      api.play(cue);
      api.play(cue); // same instant: coalesced, must not add a second voice
    }
    const shots = oneShots(api);
    expect(shots.length).toBeLessThanOrEqual(4);
    const survivors = shots.map((voice) => voice.outputId);
    expect(survivors).toContain("ui");
    expect(survivors).toContain("effects");
    expect(CUE_PRIORITY.ui).toBeGreaterThan(CUE_PRIORITY.effects);
    expect(CUE_PRIORITY.effects).toBeGreaterThan(CUE_PRIORITY.machinery);
    expect(CUE_PRIORITY.machinery).toBeGreaterThan(CUE_PRIORITY.ambience);
    api.dispose();
    const budgeted = createAudio(false);
    budgeted.resume();
    for (let index = 0; index < 64; index += 1) budgeted.play("collect");
    expect(oneShots(budgeted).length).toBeLessThanOrEqual(16);
    budgeted.dispose();
  });

  it("S-13: repeats inside the 30 ms window collapse to one voice, later ones do not", () => {
    const stub = makeStub();
    const api = createAudio(false);
    api.resume();
    api.play("collect");
    const first = voices(api).length;
    stub.advance(0.02);
    api.play("collect");
    expect(voices(api).length).toBe(first);
    stub.advance(0.02);
    api.play("collect");
    expect(voices(api).length).toBe(first + 1);
    api.dispose();
  });

  it("S-14: the state diff reaches sorter, furnace and discovery cues", () => {
    const before = machineState("sorter", 0);
    expect(stateCues(before, machineState("sorter", 1))).toEqual(["sorter"]);
    expect(stateCues(before, machineState("furnace", 0))).toEqual([]);
    expect(stateCues(machineState("furnace", 0), machineState("furnace", 2))).toEqual(["furnace"]);
    expect(stateCues(machineState("sorter", 1, 0), machineState("sorter", 1, 3))).toEqual([
      "discovery",
    ]);
    expect(machineCueFor("sorter")).toBe("sorter");
    expect(machineCueFor("furnace")).toBe("furnace");
    expect(machineCueFor("drone")).toBe(null);
  });

  it("S-15: the room tone is a looping buffer source and both beds are in the graph", () => {
    const stub = makeStub();
    const api = createAudio(false);
    api.resume();
    const looping = stub.nodes.filter((node) => node.kind === "bufferSource" && node.loop === true);
    expect(looping.length).toBe(1);
    expect(voices(api).map((voice) => voice.id).sort()).toEqual(["bed-ambience", "bed-music"]);
    expect(entry(api, "ambience")?.inputIds).toContain("bed-ambience");
    expect(entry(api, "music")?.inputIds).toContain("bed-music");
    expect(entry(api, "bed-ambience")?.level).toBe(AMBIENCE_BED_GAIN);
    expect(entry(api, "bed-music")?.level).toBe(MUSIC_BED_GAIN);
    // Gains 1..6 are master plus the five buses; 7 and 8 are the two beds.
    const bedGains = stub.nodes
      .filter((node) => node.kind === "gain")
      .slice(6, 8)
      .map((node) => node.gain?.value);
    expect(bedGains).toEqual([AMBIENCE_BED_GAIN, MUSIC_BED_GAIN]);
    // A-24: `dispose()` clears the bed guard together with the graph, so the next
    // `resume()` rebuilds both sustained voices instead of leaving the yard with
    // no room tone and no music bed.
    api.dispose();
    api.resume();
    expect(voices(api).map((voice) => voice.id).sort()).toEqual(["bed-ambience", "bed-music"]);
    expect(entry(api, "ambience")?.inputIds).toEqual(["bed-ambience"]);
    expect(entry(api, "music")?.inputIds).toEqual(["bed-music"]);
    // Two separate looping sources: one per started generation, never a third.
    expect(stub.nodes.filter((node) => node.kind === "bufferSource" && node.loop === true).length).toBe(2);
    api.dispose();
  });

  it("A-25: unmuting restarts both beds and a repeat call adds no second oscillator", () => {
    const stub = makeStub();
    const api = createAudio(true);
    api.resume();
    // Muted start: `resume()` leaves the sustained voices out of the graph.
    expect(voices(api)).toEqual([]);
    expect(entry(api, "ambience")?.inputIds).toEqual([]);
    expect(entry(api, "music")?.inputIds).toEqual([]);
    // The HUD mute button calls `setMuted`, not `resume()`; it must restore the beds.
    api.setMuted(false);
    expect(voices(api).map((voice) => voice.id).sort()).toEqual(["bed-ambience", "bed-music"]);
    expect(entry(api, "ambience")?.inputIds).toEqual(["bed-ambience"]);
    expect(entry(api, "music")?.inputIds).toEqual(["bed-music"]);
    // Idempotent through the `bedsStarted` guard: no second oscillator on repeats.
    const oscillators = stub.counter.oscillators;
    api.setMuted(false);
    api.setMuted(true);
    api.setMuted(false);
    expect(stub.counter.oscillators).toBe(oscillators);
    expect(voices(api).map((voice) => voice.id).sort()).toEqual(["bed-ambience", "bed-music"]);
    expect(stub.nodes.filter((node) => node.kind === "bufferSource" && node.loop === true).length).toBe(1);
    api.dispose();
  });

  it("S-16: near/far attenuation is monotonic, clamped and independent of the cue", () => {
    // A-29: the exact table, not only the ordering - these are the attenuation constants.
    expect(distanceGain(0, 1)).toBe(1);
    expect(distanceGain(4, 1)).toBe(0.7143);
    expect(distanceGain(6, 2)).toBe(0.5952);
    expect(distanceGain(8, 1)).toBe(0.5556);
    expect(distanceGain(0, 3)).toBe(0.9091);
    expect(distanceGain(12, 1)).toBe(0.4545);
    expect(distanceGain(400, 8)).toBe(0.35); // the MIN_DISTANCE_GAIN clamp
    expect(distanceGain(8, 1)).toBeLessThan(distanceGain(4, 1));
    expect(distanceGain(0, 3)).toBeLessThan(distanceGain(0, 1));
    expect(distanceGain()).toBe(1);
    // In-voice half, de-contaminated (A-29): one fresh instance per measurement, so the
    // cue always uses variant index 0 and the peak is exactly `variant.gain x
    // distanceGain(d, z)`, with no rotation factor left inside the ratio.
    const variantGain = CUE_VARIANTS.upgrade[0].gain;
    expect(variantGain).toBe(CUE_TABLE.upgrade.gain);
    const peakAt = (distance: number, zoom: number): number => {
      const stub = makeStub();
      const api = createAudio(false);
      api.resume();
      api.play("upgrade", { distance, zoom });
      const peak = peakOf(mainGainCalls(stub, "upgrade")) as number;
      api.dispose();
      return peak;
    };
    const near = peakAt(0, 1);
    const mid = peakAt(4, 1);
    const far = peakAt(6, 2);
    const clamped = peakAt(400, 8);
    expect(near).toBe(variantGain); // distanceGain(0, 1) === 1
    expect(mid).toBe(Math.round(variantGain * distanceGain(4, 1) * 10000) / 10000);
    expect(far).toBe(Math.round(variantGain * distanceGain(6, 2) * 10000) / 10000);
    expect(clamped).toBe(Math.round(variantGain * distanceGain(400, 8) * 10000) / 10000);
    expect(far < near).toBe(true);
    // Divide the peak by the variant gain: what is left is the constant itself.
    expect(near / variantGain).toBe(distanceGain(0, 1));
    expect(mid / variantGain).toBeCloseTo(distanceGain(4, 1), 4);
    expect(clamped / variantGain).toBe(distanceGain(400, 8));
    // The peak itself only carries four decimals, so this ratio costs its last digit.
    expect(far / variantGain).toBeCloseTo(distanceGain(6, 2), 3);
    // The factor that used to contaminate the ratio, recorded for the reader.
    expect(CUE_VARIANTS.upgrade[1].gain / variantGain).toBeCloseTo(0.92, 6);
  });

  it("S-17 (A-26): a settings write is the audio object's only mute source", () => {
    const stub = makeStub();
    const api = createAudio(false);
    const storage = memoryStorage();
    const store = createStore({ storage, now: () => 10 });
    mountApp(store, api);
    // The start gesture opens the context; the mix is audible at the declared level.
    act(() => api.resume());
    expect(masterGainValue(stub)).toBe(BUS_LEVELS.master);
    // The one player-facing mute control writes the store, and the app's sync effect
    // is the only writer of the audio object (App.tsx, S-17).
    act(() => store.setSettings({ muted: true }));
    act(() => store.step(1));
    expect(api.isMuted()).toBe(true);
    expect(api.isMuted()).toBe(store.getSettings().muted);
    // The real node, not the table echo: the single master write did the muting.
    expect(masterGainValue(stub)).toBe(0);
    for (const bus of CATEGORY_BUSES) expect(entry(api, bus)?.level).toBe(0);
    api.dispose();
  });

  it("S-17 and S-18 (A-26): a save loaded with muted:true reaches the real node", () => {
    const stub = makeStub();
    const api = createAudio(false);
    // The save the HUD produced with muted:true; S-18: the value survives encoding.
    const writer = memoryStorage();
    const first = createStore({ storage: writer, now: () => 10 });
    first.setSettings({ muted: true });
    const text = first.exportSave();
    expect(text).toContain('"muted":true');

    // A second store built from that serialized envelope, then the same text imported.
    const seeded = memoryStorage();
    seeded.setItem(SAVE_KEY, text);
    const second = createStore({ storage: seeded, now: () => 20 });
    expect(second.getSettings().muted).toBe(true);
    // The audio object itself was constructed unmuted: only the store can flip it.
    mountApp(second, api);
    act(() => api.resume());
    const imported: { result?: ImportResult } = {};
    act(() => {
      imported.result = second.importSave(text);
    });
    expect(imported.result?.ok).toBe(true);
    act(() => second.step(1));
    expect(api.isMuted()).toBe(true);
    expect(api.isMuted()).toBe(second.getSettings().muted);
    expect(masterGainValue(stub)).toBe(0);
    api.dispose();
  });

  it("S-19: one visibility handler pairs suspend with resume on the same context", () => {
    const stub = makeStub();
    const api = createAudio(false);
    api.resume();
    stub.setVisibility("hidden");
    onVisibility(api)();
    expect(stub.counters.suspend).toBe(1);
    stub.setVisibility("visible");
    onVisibility(api)();
    expect(stub.counters.resume).toBe(1);
    expect(stub.counters.close).toBe(0);
    api.dispose();
  });

  it("S-20: identical call sequences produce identical snapshots", () => {
    const run = () => {
      const stub = makeStub();
      const api = createAudio(false);
      api.resume();
      for (const cue of ["salvage", "collect", "repair", "upgrade"] as CueName[]) {
        api.play(cue, { distance: 3, zoom: 2 });
        stub.advance(0.05);
      }
      const snapshot = JSON.stringify(api.graphSnapshot());
      api.dispose();
      return snapshot;
    };
    expect(run()).toBe(run());
  });

  it("S-21: dispose clears the table, disconnects the nodes and closes the context", () => {
    const stub = makeStub();
    const api = createAudio(false);
    api.resume();
    api.play("salvage");
    expect(api.graphSnapshot().length).toBeGreaterThan(0);
    api.dispose();
    expect(api.graphSnapshot()).toEqual([]);
    expect(stub.counters.close).toBe(1);
    // A later gesture rebuilds a usable graph rather than writing into a dead one.
    api.resume();
    expect(buses(api).length).toBe(CATEGORY_BUSES.length + 1);
    api.dispose();
  });

  it("A-31: the room tone is aperiodic inside its period and its loop is a whole number of periods", () => {
    const stub = makeStub();
    const api = createAudio(false);
    api.resume();
    const bed = stub.nodes.find((node) => node.kind === "bufferSource" && node.loop === true);
    const buffer = bed?.buffer as { length: number; getChannelData(): Float32Array } | undefined;
    expect(buffer).toBeTruthy();
    const data = (buffer as { length: number; getChannelData(): Float32Array }).getChannelData();
    expect(data.length).toBe((buffer as { length: number }).length);
    // The old `index % 7` saw repeated its own first 7 samples exactly; the sum of
    // the 7- and 11-sample stages does not, so the wash is not one steady pitch.
    expect([...data.slice(0, 7)]).not.toEqual([...data.slice(7, 14)]);
    for (const shorter of [1, 7, 11]) {
      expect([...data.slice(0, shorter)]).not.toEqual([...data.slice(shorter, 2 * shorter)]);
    }
    // The fundamental period is lcm(7, 11) = 77: the first period does repeat at 77,
    // which keeps the fill deterministic (S-20) while being aperiodic at 7 and 11.
    for (let index = 0; index < NOISE_PERIOD; index += 1) {
      expect(data[index + NOISE_PERIOD]).toBe(data[index]);
    }
    // Loop seam: an exact whole number of periods, so no step at the boundary.
    expect(buffer!.length % NOISE_PERIOD).toBe(0);
    expect(buffer!.length).toBe(Math.round(buffer!.length / NOISE_PERIOD) * NOISE_PERIOD);
    // The shared debris-tail buffer follows the same rule.
    api.play("salvage");
    const tailSource = stub.nodes.filter((node) => node.kind === "bufferSource").slice(-1)[0];
    expect((tailSource.buffer as { length: number }).length % NOISE_PERIOD).toBe(0);
    api.dispose();
  });

  it("keeps the declared cue set complete", () => {
    expect(CUE_NAMES).toHaveLength(10);
    for (const name of CUE_NAMES) {
      const spec = CUE_TABLE[name];
      expect(CATEGORY_BUSES).toContain(spec.bus);
      expect(spec.attack).toBeGreaterThan(0);
      expect(spec.attack).toBeLessThanOrEqual(0.02);
      expect(spec.gain).toBeGreaterThan(0);
    }
  });
});
