/**
 * Buses, cues, and a bounded voice pool (spec 20.6).
 *
 * Audio is created only after a user gesture. Repeated identical cues inside
 * a short window are coalesced so bulk transfers cannot exceed the budget.
 */

export type BusName = "master" | "music" | "ambience" | "machinery" | "effects" | "ui";

export interface AudioApi {
  resume(): void;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  play(cue: CueName): void;
  suspend(): void;
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
}

const CUES: Record<CueName, CueSpec> = {
  salvage: { bus: "effects", freq: 420, to: 240, duration: 0.09, type: "square", gain: 0.34 },
  collect: { bus: "effects", freq: 880, to: 1180, duration: 0.07, type: "triangle", gain: 0.24 },
  repair: { bus: "effects", freq: 320, to: 720, duration: 0.22, type: "sawtooth", gain: 0.3 },
  drone: { bus: "machinery", freq: 190, duration: 0.16, type: "sine", gain: 0.18 },
  sorter: { bus: "machinery", freq: 260, to: 210, duration: 0.06, type: "square", gain: 0.16 },
  furnace: { bus: "machinery", freq: 120, duration: 0.24, type: "sine", gain: 0.2 },
  upgrade: { bus: "ui", freq: 520, to: 780, duration: 0.14, type: "triangle", gain: 0.28 },
  blocked: { bus: "ui", freq: 200, duration: 0.05, type: "square", gain: 0.16 },
  return: { bus: "ui", freq: 660, to: 990, duration: 0.18, type: "sine", gain: 0.26 },
  discovery: { bus: "music", freq: 740, to: 1110, duration: 0.3, type: "triangle", gain: 0.3 },
};

const BUS_LEVELS: Record<BusName, number> = {
  master: 0.9,
  music: 0.25,
  ambience: 0.2,
  machinery: 0.45,
  effects: 0.8,
  ui: 0.6,
};

export function createAudio(muted: boolean, voiceBudget = 16): AudioApi {
  let ctx: AudioContext | null = null;
  let buses: Record<BusName, GainNode> | null = null;
  let active = 0;
  let isMuted = muted;
  const lastPlayed = new Map<CueName, number>();

  const ensure = (): AudioContext | null => {
    if (ctx) return ctx;
    const Ctor: typeof AudioContext | undefined =
      typeof AudioContext !== "undefined" ? AudioContext : undefined;
    if (!Ctor) return null;
    ctx = new Ctor();
    const map = {} as Record<BusName, GainNode>;
    for (const name of Object.keys(BUS_LEVELS) as BusName[]) {
      const node = ctx.createGain();
      node.gain.value = isMuted ? 0 : BUS_LEVELS[name];
      node.connect(ctx.destination);
      map[name] = node;
    }
    buses = map;
    return ctx;
  };

  return {
    resume() {
      const context = ensure();
      if (context && context.state === "suspended") void context.resume();
    },
    setMuted(next: boolean) {
      isMuted = next;
      if (!ctx || !buses) return;
      for (const name of Object.keys(buses) as BusName[]) {
        buses[name].gain.value = next ? 0 : BUS_LEVELS[name];
      }
    },
    isMuted: () => isMuted,
    play(cue: CueName) {
      if (isMuted) return;
      const context = ensure();
      if (!context || !buses) return;
      const now = context.currentTime;
      const previous = lastPlayed.get(cue);
      if (previous !== undefined && now - previous < 0.045) return;
      if (active >= voiceBudget) return;
      lastPlayed.set(cue, now);
      const spec = CUES[cue];
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = spec.type;
      osc.frequency.setValueAtTime(spec.freq, now);
      if (spec.to !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(spec.to, now + spec.duration);
      }
      gain.gain.setValueAtTime(spec.gain, now);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + spec.duration);
      osc.connect(gain);
      gain.connect(buses[spec.bus]);
      active += 1;
      osc.onended = () => {
        active -= 1;
        osc.disconnect();
        gain.disconnect();
      };
      osc.start(now);
      osc.stop(now + spec.duration + 0.01);
    },
    suspend() {
      if (ctx && ctx.state === "running") void ctx.suspend();
    },
  };
}
