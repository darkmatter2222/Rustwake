/**
 * Mix graph, cues, variants, and a bounded voice pool (spec 20.6, Q-005 S-01..S-21).
 *
 * Shape (S-01..S-05): every category bus feeds one real master gain, the master
 * feeds one output-stage `DynamicsCompressorNode`, and that compressor is the only
 * node connected to `ctx.destination`. Mute is therefore a single write on master.
 * `graphSnapshot()` returns the module's own node table so a test reads the graph
 * instead of inferring it from sound (S-00).
 *
 * Audio is created only after a user gesture. Identical cues inside a short window
 * are coalesced; repeated cues rotate over a small deterministic variant table.
 */

export type BusName = "master" | "music" | "ambience" | "machinery" | "effects" | "ui";

/** Node kinds the snapshot reports: mix buses, one-shot/sustained voices, the output stage. */
export type GraphKind = "bus" | "voice" | "destination";

export interface GraphNode {
  id: string;
  kind: GraphKind;
  level: number;
  inputIds: string[];
  outputId: string | null;
}

export interface Distance {
  distance?: number;
  zoom?: number;
}

/** Minimal shape `link()` needs from a real node, stub or native (A-17). */
type Linkable = { connect(target: unknown): void };

export interface AudioApi {
  resume(): void;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  play(cue: CueName, at?: Distance): void;
  suspend(): void;
  graphSnapshot(): GraphNode[];
  dispose(): void;
}

export type CueName =
  | "salvage"
  | "collect"
  | "repair"
  | "drone"
  | "sorter"
  | "furnace"
  | "upgrade"
  | "blocked"
  | "return"
  | "discovery";

interface CueSpec {
  bus: BusName;
  freq: number;
  to?: number;
  duration: number;
  type: OscillatorType;
  gain: number;
  /** Attack ramp in seconds, S-10: 0.002..0.020 for every cue. */
  attack: number;
  /** True when the voice adds a second, noise-tailed layer (S-09). */
  tail?: boolean;
  /** True when the voice sustains instead of decaying inside `duration`. */
  loop?: boolean;
}

export const CUE_TABLE: Readonly<Record<CueName, CueSpec>> = {
  salvage: { bus: "effects", freq: 420, to: 240, duration: 0.09, type: "square", gain: 0.32, attack: 0.004, tail: true },
  collect: { bus: "effects", freq: 880, to: 1180, duration: 0.07, type: "triangle", gain: 0.22, attack: 0.006 },
  repair: { bus: "effects", freq: 320, to: 720, duration: 0.22, type: "sawtooth", gain: 0.28, attack: 0.008, tail: true },
  drone: { bus: "machinery", freq: 190, duration: 0.16, type: "sine", gain: 0.18, attack: 0.01 },
  sorter: { bus: "machinery", freq: 260, to: 210, duration: 0.06, type: "square", gain: 0.16, attack: 0.003, tail: true },
  furnace: { bus: "machinery", freq: 120, duration: 0.24, type: "sine", gain: 0.2, attack: 0.014 },
  upgrade: { bus: "ui", freq: 520, to: 780, duration: 0.14, type: "triangle", gain: 0.28, attack: 0.006 },
  blocked: { bus: "ui", freq: 200, duration: 0.05, type: "square", gain: 0.16, attack: 0.002 },
  return: { bus: "ui", freq: 660, to: 990, duration: 0.18, type: "sine", gain: 0.26, attack: 0.005 },
  discovery: { bus: "music", freq: 740, to: 1110, duration: 0.3, type: "triangle", gain: 0.3, attack: 0.012 },
};

export const CUE_NAMES: readonly CueName[] = Object.keys(CUE_TABLE) as CueName[];

/** S-07: bounded spread, inside |freq/base - 1| <= 0.06 and |gain/base - 1| <= 0.19. */
const PITCH_SPREAD = [1, 1.04, 0.96, 1.02, 0.98] as const;
const GAIN_SPREAD = [1, 0.92, 1.06, 0.95, 1.03] as const;

/** S-07 variant counts per cue, in `CUE_NAMES` order; total 42 specs, all >= 3. */
export const VARIANT_COUNTS: Readonly<Record<CueName, number>> = {
  salvage: 5,
  collect: 4,
  repair: 5,
  drone: 4,
  sorter: 4,
  furnace: 5,
  upgrade: 4,
  blocked: 5,
  return: 3,
  discovery: 3,
};

export interface CueVariant {
  freq: number;
  to?: number;
  gain: number;
}

/** Deterministic variant table: 3..5 per cue, 42 specs total (S-07). */
export const CUE_VARIANTS: Readonly<Record<CueName, readonly CueVariant[]>> = (() => {
  const table = {} as Record<CueName, readonly CueVariant[]>;
  for (const name of CUE_NAMES) {
    const spec = CUE_TABLE[name];
    const count = VARIANT_COUNTS[name];
    const variants: CueVariant[] = [];
    for (let index = 0; index < count; index += 1) {
      const pitch = PITCH_SPREAD[index % PITCH_SPREAD.length];
      variants.push({
        freq: Math.round(spec.freq * pitch * 100) / 100,
        ...(spec.to === undefined ? {} : { to: Math.round(spec.to * pitch * 100) / 100 }),
        gain: Math.round(spec.gain * GAIN_SPREAD[index % GAIN_SPREAD.length] * 10000) / 10000,
      });
    }
    table[name] = variants;
  }
  return table;
})();

/** Steal order, S-12: ui > effects > music > machinery > ambience. */
export const CUE_PRIORITY: Readonly<Record<BusName, number>> = {
  ui: 5,
  effects: 4,
  music: 3,
  machinery: 2,
  ambience: 1,
  master: 0,
};

export const BUS_LEVELS: Readonly<Record<BusName, number>> = {
  master: 0.9,
  music: 0.25,
  ambience: 0.2,
  machinery: 0.45,
  effects: 0.8,
  ui: 0.6,
};

/** Category buses in graph order; `master` is the one parent above them (S-01). */
export const CATEGORY_BUSES: readonly BusName[] = ["music", "ambience", "machinery", "effects", "ui"];

/** Same-window repeats of one cue collapse to a single voice (S-13, 30 ms). */
export const COALESCE_WINDOW = 0.03;

/** S-16: gain = max(MIN, 1 / (1 + FALLOFF * distance)) x the same form for zoom. */
export const DISTANCE_FALLOFF = 0.1;
export const ZOOM_FALLOFF = 0.05;
export const MIN_DISTANCE_GAIN = 0.35;

/** S-15 bed gains, chosen to keep every bus inside the headroom invariant (S-06). */
export const AMBIENCE_BED_GAIN = 0.12;
export const MUSIC_BED_GAIN = 0.1;

/**
 * A-31: the room-tone fill is the sum of two coprime stages, 7 and 11 samples, so
 * its true period is `lcm(7, 11) = 77` samples. Every noise buffer holds a whole
 * number of those periods, which is what keeps the loop seam continuous.
 */
export const NOISE_PERIOD = 77;

/**
 * S-06: the documented headroom ceiling at the output stage, one-decimal value of
 * `BUS_LEVELS.master x maxConcurrentVoiceSum()` = 0.9 x 0.82 = 0.738 -> 0.7, so the
 * worst-case summed mix still sits below unity with room for the compressor.
 */
export const HEADROOM = 0.7;

/** Whole-cue sums of the declared peaks, per bus (S-06 input). */
export function busVoiceSum(bus: BusName): number {
  return CUE_NAMES.reduce((total, name) => {
    const spec = CUE_TABLE[name];
    if (spec.bus !== bus) return total;
    return total + spec.gain;
  }, 0) + bedGainFor(bus);
}

function bedGainFor(bus: BusName): number {
  if (bus === "ambience") return AMBIENCE_BED_GAIN;
  if (bus === "music") return MUSIC_BED_GAIN;
  return 0;
}

/** Largest simultaneous sum over the five category buses. */
export function maxConcurrentVoiceSum(): number {
  return CATEGORY_BUSES.reduce((max, bus) => Math.max(max, busVoiceSum(bus)), 0);
}

/** S-06 invariant: master x worst-case simultaneous sum stays at or below unity. */
export function headroomCeiling(): number {
  return Math.round(HEADROOM * maxConcurrentVoiceSum() * 10000) / 10000;
}

/** S-16: deterministic near/far gain for a cue. */
export function distanceGain(distanceTiles = 0, zoom = 1): number {
  const near = 1 / (1 + DISTANCE_FALLOFF * Math.max(0, distanceTiles));
  const far = 1 / (1 + ZOOM_FALLOFF * Math.max(0, zoom - 1));
  return Math.round(Math.max(MIN_DISTANCE_GAIN, Math.min(1, near * far)) * 10000) / 10000;
}

interface VoiceRecord {
  id: string;
  priority: number;
  stopTime: number;
  sources: { stop(time: number): void }[];
  nodes: { disconnect(): void }[];
}

export function createAudio(muted: boolean, voiceBudget = 16): AudioApi {
  let ctx: AudioContext | null = null;
  let isMuted = muted;
  let masterNode: GainNode | null = null;
  let bedsStarted = false;
  let listener: (() => void) | null = null;
  const busNodes = new Map<BusName, GainNode>();
  /** A-18: the unautomated mix-stage nodes by table id, for reading levels back. */
  const gainNodes = new Map<string, GainNode>();
  const table = new Map<string, GraphNode>();
  const voices: VoiceRecord[] = [];
  const lastPlayed = new Map<CueName, number>();
  const variantIndex = new Map<CueName, number>();
  let voiceSeq = 0;

  /** A-17: the table id each real node carries, so an edge can be recorded twice. */
  const nodeIds = new Map<unknown, string>();

  /**
   * A-17: one connection call that also records the edge on both sides of the table,
   * so `graphSnapshot` reports observed wiring instead of a literal table. The output
   * stage carries the `destination` id, so its own hop collapses onto that entry.
   */
  const link = (from: Linkable, to: Linkable): void => {
    from.connect(to);
    const fromId = nodeIds.get(from);
    const toId = nodeIds.get(to) ?? null;
    if (!fromId || fromId === toId) return;
    const entry = table.get(fromId);
    if (entry) entry.outputId = toId;
    if (toId) {
      const parent = table.get(toId);
      if (parent && !parent.inputIds.includes(fromId)) parent.inputIds.push(fromId);
    }
  };

  const declareBus = (name: BusName): GraphNode => {
    const existing = table.get(name);
    if (existing) return existing;
    const node: GraphNode = {
      id: name,
      kind: "bus",
      level: BUS_LEVELS[name],
      inputIds: [],
      outputId: null,
    };
    table.set(name, node);
    return node;
  };

  const ensure = (): AudioContext | null => {
    if (ctx) return ctx;
    const Ctor: typeof AudioContext | undefined =
      typeof AudioContext !== "undefined" ? AudioContext : undefined;
    if (!Ctor) return null;
    ctx = new Ctor();
    // Output stage first so the chain has somewhere to land (S-05). It is part of the
    // `destination` entry, hence the same table id (A-17).
    const output = ctx.createDynamicsCompressor();
    nodeIds.set(output, "destination");
    nodeIds.set(ctx.destination, "destination");
    link(output as unknown as Linkable, ctx.destination as unknown as Linkable);
    table.set("destination", {
      id: "destination",
      kind: "destination",
      level: 1,
      inputIds: [],
      outputId: null,
    });
    const master = ctx.createGain();
    master.gain.value = isMuted ? 0 : BUS_LEVELS.master;
    masterNode = master;
    gainNodes.set("master", master);
    declareBus("master");
    nodeIds.set(master, "master");
    link(master as unknown as Linkable, output as unknown as Linkable);
    for (const name of CATEGORY_BUSES) {
      const node = ctx.createGain();
      node.gain.value = BUS_LEVELS[name];
      busNodes.set(name, node);
      gainNodes.set(name, node);
      nodeIds.set(node, name);
      declareBus(name);
      link(node as unknown as Linkable, master as unknown as Linkable);
    }
    return ctx;
  };

  /**
   * A-18: a table entry reports the value its real node holds, so the snapshot is a
   * read-back and not an echo of the closure flags - the master carries the single mute
   * write while the buses and beds keep their own gains, all visible at once. Without a
   * context, and for the one-shot voices whose param is under envelope automation, the
   * declared level is the only truth (S-04).
   */
  const effectiveLevel = (node: GraphNode): number => {
    if (node.kind === "destination") return 1;
    const live = gainNodes.get(node.id)?.gain.value;
    return live === undefined ? node.level : live;
  };

  const startBeds = (context: AudioContext, now: number): void => {
    if (bedsStarted) return;
    bedsStarted = true;
    const specs: { bus: BusName; gain: number; freq: number; id: string; loopBuffer: boolean }[] = [
      { bus: "ambience", gain: AMBIENCE_BED_GAIN, freq: 96, id: "bed-ambience", loopBuffer: true },
      { bus: "music", gain: MUSIC_BED_GAIN, freq: 148, id: "bed-music", loopBuffer: false },
    ];
    for (const bed of specs) {
      const node = context.createGain();
      node.gain.value = bed.gain;
      // A-17: the entry exists before the link, so both sides of the edge are recorded.
      nodeIds.set(node, bed.id);
      gainNodes.set(bed.id, node);
      table.set(bed.id, {
        id: bed.id,
        kind: "voice",
        level: bed.gain,
        inputIds: [],
        outputId: null,
      });
      link(node as unknown as Linkable, (busNodes.get(bed.bus) ?? masterNode) as unknown as Linkable);
      // The room tone is a looping buffer source, the music bed a sustained
      // oscillator (S-15 asks for at least one `loop === true` source).
      let source: AudioBufferSourceNode | OscillatorNode;
      if (bed.loopBuffer) {
        const bufferSource = context.createBufferSource();
        bufferSource.buffer = noiseBuffer(context, 0.5);
        bufferSource.loop = true;
        source = bufferSource;
      } else {
        const oscillator = context.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.value = bed.freq;
        source = oscillator;
      }
      source.connect(node);
      source.start(now);
    }
  };

  /** One noise buffer per length, reused by every debris tail and the room tone (S-09). */
  const buffers = new Map<number, AudioBuffer>();
  const noiseBuffer = (context: AudioContext, seconds = 0.06): AudioBuffer => {
    const cached = buffers.get(seconds);
    if (cached) return cached;
    const rate = context.sampleRate || 44100;
    // A-31: a whole number of periods only, so the loop seam lands exactly on the
    // period border instead of cutting it and adding a tick twice per second.
    const periods = Math.max(1, Math.round(Math.floor(rate * seconds) / NOISE_PERIOD));
    const buffer = context.createBuffer(1, periods * NOISE_PERIOD, rate);
    // Deterministic aperiodic fill (A-31): two coprime stages, 7 and 11, repeat
    // together only every lcm(7, 11) = 77 samples, so the wash is not one steady
    // pitch the way the old single `index % 7` saw read.
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      data[index] = (((index % 7) - 3) / 4 + ((index % 11) - 5) / 8) / 1.6;
    }
    buffers.set(seconds, buffer);
    return buffer;
  };

  const envelope = (
    param: AudioParam,
    peak: number,
    start: number,
    attack: number,
    duration: number
  ): void => {
    param.setValueAtTime(0, start);
    param.linearRampToValueAtTime(peak, start + attack);
    param.exponentialRampToValueAtTime(0.0005, start + duration);
  };

  const stealOldest = (now: number): void => {
    // S-12: drop the lowest-priority, most recently started voice.
    let worst = -1;
    for (let index = 0; index < voices.length; index += 1) {
      if (worst < 0 || voices[index].priority <= voices[worst].priority) worst = index;
    }
    if (worst < 0) return;
    const victim = voices[worst];
    for (const source of victim.sources) source.stop(now);
    for (const node of victim.nodes) node.disconnect();
    table.delete(victim.id);
    voices.splice(worst, 1);
  };

  return {
    resume() {
      const context = ensure();
      if (!context) return;
      if (context.state === "suspended") void context.resume();
      if (!isMuted) startBeds(context, context.currentTime);
    },
    setMuted(next: boolean) {
      isMuted = next;
      // One write on the single parent does the whole mute (S-04).
      if (masterNode) masterNode.gain.value = next ? 0 : BUS_LEVELS.master;
      // A-25: the gesture that lifts the mute also brings the beds back, so a
      // session started muted is not left without room tone and music bed. The
      // `bedsStarted` guard inside `startBeds` makes a repeat call a no-op.
      if (!next && ctx) startBeds(ctx, ctx.currentTime);
    },
    isMuted: () => isMuted,
    play(cue: CueName, at?: Distance) {
      if (isMuted) return;
      const context = ensure();
      if (!context) return;
      const now = context.currentTime;
      const previous = lastPlayed.get(cue);
      if (previous !== undefined && now - previous <= COALESCE_WINDOW) return;
      const spec = CUE_TABLE[cue];
      const variants = CUE_VARIANTS[cue];
      const index = variantIndex.get(cue) ?? 0;
      variantIndex.set(cue, (index + 1) % variants.length);
      const variant = variants[index];
      const scale = distanceGain(at?.distance ?? 0, at?.zoom ?? 1);
      const peak = Math.round(variant.gain * scale * 10000) / 10000;
      lastPlayed.set(cue, now);
      if (voices.length >= voiceBudget) stealOldest(now);

      const gain = context.createGain();
      const id = `v${++voiceSeq}`;
      const sources: { stop(time: number): void }[] = [];
      const nodes: { disconnect(): void }[] = [gain];

      const osc = context.createOscillator();
      osc.type = spec.type;
      osc.frequency.setValueAtTime(variant.freq, now);
      if (variant.to !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(variant.to, now + spec.duration);
      }
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + spec.duration + 0.01);
      sources.push(osc);

      if (spec.tail) {
        // Debris layer: a short noise burst on the same bus, 3 dB under the tone.
        const tailGain = context.createGain();
        const source = context.createBufferSource();
        source.buffer = noiseBuffer(context);
        source.connect(tailGain);
        tailGain.connect(busNodes.get(spec.bus) ?? (masterNode as GainNode));
        envelope(tailGain.gain, Math.round(peak * 0.7 * 10000) / 10000, now, 0.002, spec.duration * 0.8);
        source.start(now);
        if (!spec.loop) source.stop(now + spec.duration);
        nodes.push(tailGain, source as unknown as { disconnect(): void });
        sources.push(source as unknown as { stop(time: number): void });
      }

      envelope(gain.gain, peak, now, spec.attack, spec.duration);
      // A-17: the entry is created first, then `link` makes the connection and records
      // the edge on both sides of the table.
      table.set(id, { id, kind: "voice", level: peak, inputIds: [], outputId: null });
      nodeIds.set(gain, id);
      link(gain as unknown as Linkable, (busNodes.get(spec.bus) ?? masterNode) as unknown as Linkable);
      voices.push({
        id,
        priority: CUE_PRIORITY[spec.bus],
        stopTime: now + spec.duration + 0.01,
        sources: sources as { stop(time: number): void }[],
        nodes,
      });
      osc.onended = () => {
        const position = voices.findIndex((voice) => voice.id === id);
        if (position >= 0) voices.splice(position, 1);
        table.delete(id);
        for (const node of nodes) node.disconnect();
      };
    },
    suspend() {
      if (ctx && ctx.state === "running") void ctx.suspend();
    },
    graphSnapshot() {
      return [...table.values()].map((node) => ({
        id: node.id,
        kind: node.kind,
        level: effectiveLevel(node),
        inputIds: [...node.inputIds],
        outputId: node.outputId,
      }));
    },
    dispose() {
      if (listener && typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", listener);
        listener = null;
      }
      for (const voice of voices.splice(0)) {
        for (const node of voice.nodes) node.disconnect();
      }
      for (const node of busNodes.values()) node.disconnect();
      if (masterNode) masterNode.disconnect();
      busNodes.clear();
      gainNodes.clear();
      masterNode = null;
      table.clear();
      nodeIds.clear();
      // A-24: the beds are gone with the rest of the graph, so the guard that keeps
      // them single-instance has to fall back too, or a later `resume()` rebuilds
      // the buses and never re-creates the two sustained voices.
      bedsStarted = false;
      if (ctx) {
        const closing = ctx.close();
        void closing;
        ctx = null;
      }
    },
  };
}

/**
 * S-19: one paired suspend/resume on tab visibility. The handler is created once per
 * audio object and App registers/removes exactly that instance, so no second listener
 * can appear across re-mounts.
 */
export function onVisibility(api: AudioApi): () => void {
  return function handleVisibility(): void {
    const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
    if (hidden) api.suspend();
    else api.resume();
  };
}
