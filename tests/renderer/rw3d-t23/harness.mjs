/**
 * RW3D T23 (#150) layered machine activity + restrained spatial sound harness.
 *
 * Drives the REAL drawScene (three.js world blit + 2D information overlay) on a
 * real browser canvas at scripted (tick, framePhase) pairs, and renders the REAL
 * audio mix graph through an OfflineAudioContext via the additive contextFactory
 * seam. No animation loop, no wall clock — every frame and every audio buffer is
 * reproducible from the fixed fixture below.
 *
 * Numerical checks only — a non-vision agent cannot self-certify visual fidelity;
 * capable visual inspection remains PENDING (architecture G1 #151).
 */
import {
  WORLD_H,
  WORLD_W,
  drawScene,
  tileToWorld,
  worldToScreen,
} from "/src/game/renderer/scene.ts";
import { PALETTE, STATUS_ACCENTS } from "/src/game/renderer/sprites.ts";
import { FAN_STEPS, machineActivity } from "/src/game/renderer/motion.ts";
import { createInitialState } from "/src/game/simulation/types.ts";
import { PANNER_MAX, createAudio } from "/src/game/audio/audio.ts";

const VIEW = { width: 960, height: 600 };
const CAMERA = { x: WORLD_W / 2, y: WORLD_H / 2, scale: 3 };
const canvas = document.getElementById("scene");
const ctx = canvas.getContext("2d");

const snap = (v) => Math.round(v * 2) / 2;
const hexRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const PAL = Object.fromEntries(Object.entries(PALETTE).map(([k, v]) => [k, hexRgb(v)]));
const ACCENTS = Object.fromEntries(Object.entries(STATUS_ACCENTS).map(([k, v]) => [k, hexRgb(v)]));

function pixel(x, y) {
  const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
  return [d[0], d[1], d[2]];
}
const eq = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/** FNV-1a over a pixel region: a cheap byte-identity witness for motion freezes. */
function regionHash(x, y, w, h) {
  const d = ctx.getImageData(Math.round(x), Math.round(y), w, h).data;
  let hsh = 0x811c9dc5;
  for (let i = 0; i < d.length; i += 1) {
    hsh ^= d[i];
    hsh = Math.imul(hsh, 0x01000193) >>> 0;
  }
  return (hsh >>> 0).toString(16).padStart(8, "0");
}

/** Same fixture as tests/renderer/activity-scene-150.test.ts plus a RUNNING furnace. */
function machine(id, blueprint, tile, status, progress = 300) {
  return {
    id, blueprint, tile, orientation: 0, level: 2,
    inBuf: {}, inBufUnits: 0, tray: [], trayUnits: 0, batch: [],
    progress, progressRem: 0, progressDen: 600, batchMilli: 600, batchPower: 2,
    status, inRoutes: [], outRoute: null, starvedTicks: 0, batchesDone: 4,
    ageTicks: 300, busyTicks: 10, fullTicks: 0,
    rateAge: 0, rateFrom: 0, rateAgePrev: 0, rateFromPrev: 0,
  };
}
function buildState(tick, progress = 300) {
  const base = createInitialState();
  return {
    ...base,
    tick,
    tutorial: 9,
    machines: [
      machine(1, "sorter", 13, "running", progress),
      machine(2, "sorter", 15, "running", progress),
      machine(3, "furnace", 17, "outputFull", progress),
      machine(4, "furnace", 19, "powerLimited", progress),
      machine(5, "furnace", 21, "running", progress),
      machine(6, "sorter", 23, "starved", progress),
    ],
  };
}

/**
 * One scripted frame. Returns per-machine pixel probes tied to the SAME pure
 * model the renderer uses (machineActivity), plus region hashes for motion /
 * freeze detection and a state-mutation witness.
 */
function render(tick, phase = 0, opts = {}) {
  const reducedMotion = Boolean(opts.reducedMotion);
  const scale = opts.scale ?? 3;
  const camera = { ...CAMERA, scale };
  const state = buildState(tick, opts.progress ?? 300);
  const before = JSON.stringify(state);
  drawScene(ctx, state, camera, VIEW, {
    reducedMotion, buildMode: false, ghostTile: null, ghostValid: true, selected: null, framePhase: phase,
  });
  const after = JSON.stringify(state);
  const s = scale;
  const machines = state.machines.map((m) => {
    const c = tileToWorld(m.tile);
    const p = worldToScreen(camera, VIEW, c.x, c.y);
    const act = machineActivity(m, tick, phase, reducedMotion);
    const out = {
      id: m.id, tile: m.tile, status: m.status, blueprint: m.blueprint,
      fanStep: act.fanStep, pulse: act.pulse, ventStage: act.ventStage,
      ventPuffs: act.ventPuffs.length, rollerStep: act.rollerStep, sweep: act.sweep,
      accent: pixel(p.x - 6 * s, p.y + 11 * s),
      coreCenter: pixel(p.x, p.y + 2 * s),
      // Amber only on the machine's own swell frame (radius 6 -> 7.5). Offset
      // (6,0) is empirically discriminating on the real rasteriser: the quiet
      // core stops at x+5, the swell reaches x+6, and NO fan step's 6x6 blade
      // box covers (x+6.5, y+0.5) - so the probe witnesses the swell alone.
      swellProbe: pixel(p.x + 6, p.y + 2 * s),
      ringHash: regionHash(p.x - 16, p.y - 8, 32, 26),
    };
    // The D-3 tick shares its band with the B5 progress pipRow (legacy geometry);
    // it reaches the canvas in the 3-unit gaps between pips (offset 6..9).
    if (m.status === "powerLimited") out.powerTick = pixel(p.x - 9 * s + 7.5, p.y + 14 * s);
    if (m.status === "outputFull") out.heldCargo = pixel(p.x + 8 * s + 4, p.y - 10 * s + 3);
    if (m.status === "starved") out.quietCore = pixel(p.x, p.y + 1 * s + 3);
    if (m.blueprint === "furnace") out.ventHash = regionHash(p.x + 9, p.y - 70, 18, 28);
    if (act.active && s >= 2) {
      const angle = (act.fanStep / FAN_STEPS) * Math.PI * 2;
      const fx = snap(p.x + Math.cos(angle) * 4 * s - s);
      const fy = snap(p.y + 2 * s + Math.sin(angle) * 2.5 * s - s);
      // Interior 4x4 of the 6x6 blade box: solid bodyLight by draw order.
      const d = ctx.getImageData(Math.round(fx) + 1, Math.round(fy) + 1, 4, 4).data;
      let count = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] === PAL.bodyLight[0] && d[i + 1] === PAL.bodyLight[1] && d[i + 2] === PAL.bodyLight[2]) count += 1;
      }
      out.fanBox = { x: fx, y: fy, bodyLightCount: count, allBodyLight: count === 16 };
    }
    if (act.active && s >= 2 && m.blueprint === "sorter") {
      // Batch-driven roller dot + magnet sweep, at the model's own snapped position.
      const rx = snap(p.x - 6 * s + act.rollerStep * 3 * s);
      out.rollerDot = pixel(rx + 3, p.y + 6 * s + 1);
      out.sweepMark = pixel(rx + 1, p.y + 3 * s + 3);
    }
    if (reducedMotion && s >= 2 && m.blueprint === "furnace" && act.ventStage > 0) {
      out.ventStageMark = pixel(p.x + 5 * s + 3, p.y - 16 * s + 3);
    }
    return out;
  });
  return { tick, phase, reducedMotion, scale, machines, stateIdentical: before === after };
}

// ---------------------------------------------------------------------------
// Offline audio: the SAME createAudio mix graph, rendered to a buffer through
// the additive contextFactory seam. Peak/RMS/clipping are measured per channel.
// ---------------------------------------------------------------------------

function analyze(buf, t0 = 0, t1 = buf.duration) {
  const rate = buf.sampleRate;
  const a = Math.max(0, Math.floor(t0 * rate));
  const b = Math.min(buf.length, Math.ceil(t1 * rate));
  let peak = 0; let sumSq = 0; let clip = 0; let n = 0;
  const ch = [];
  for (let c = 0; c < buf.numberOfChannels; c += 1) {
    const d = buf.getChannelData(c);
    let cp = 0; let cs = 0;
    for (let i = a; i < b; i += 1) {
      const v = d[i];
      const av = Math.abs(v);
      if (av > cp) cp = av;
      if (av >= 1) clip += 1;
      cs += v * v;
    }
    ch.push({ peak: cp, rms: Math.sqrt(cs / Math.max(1, b - a)) });
    if (cp > peak) peak = cp;
    sumSq += cs;
    n += b - a;
  }
  return {
    peak, rms: Math.sqrt(sumSq / Math.max(1, n)), clip,
    rmsL: ch[0]?.rms ?? 0, rmsR: ch[1]?.rms ?? 0,
    peakL: ch[0]?.peak ?? 0, peakR: ch[1]?.peak ?? 0,
  };
}

async function offline(seconds, build, muted = false) {
  const ctx2 = new OfflineAudioContext(2, Math.round(44100 * seconds), 44100);
  const api = createAudio(muted, 16, () => ctx2);
  const marks = [];
  await build(api, ctx2, marks);
  const buf = await ctx2.startRendering();
  const whole = analyze(buf);
  api.dispose();
  return { whole, marks, seconds };
}

const voiceCounts = (api) => {
  const snap = api.graphSnapshot();
  const voices = snap.filter((n) => n.kind === "voice" && !n.id.endsWith("-pan"));
  const pans = snap.filter((n) => n.id.endsWith("-pan"));
  return { voices: voices.length, pans: pans.length };
};

/**
 * A1: gentle machinery voices with restrained pan, one cue per 0.5 s window.
 * Beds are deliberately NOT started here: they are centre-panned room tone and
 * would drown the per-cue L/R ratio. A3 proves the beds exist and that the single
 * mute write silences them too.
 */
async function audioPanFull() {
  const ctx2 = new OfflineAudioContext(2, Math.round(44100 * 2.0), 44100);
  const api = createAudio(false, 16, () => ctx2);
  api.play("drone", { pan: -1 });
  ctx2.suspend(0.5).then(() => { api.play("sorter", { pan: 1 }); ctx2.resume(); });
  ctx2.suspend(1.0).then(() => { api.play("furnace", { pan: 0 }); ctx2.resume(); });
  ctx2.suspend(1.5).then(() => { api.play("collect", { pan: 1, distance: 4, zoom: 1.5 }); ctx2.resume(); });
  const buf = await ctx2.startRendering();
  const out = {
    whole: analyze(buf),
    droneLeft: analyze(buf, 0.02, 0.16),
    sorterRight: analyze(buf, 0.52, 0.57),
    furnaceCentre: analyze(buf, 1.02, 1.2),
    collectNonMachinery: analyze(buf, 1.52, 1.58),
  };
  api.dispose();
  return out;
}

/** A2: the pan clamp — raw +5 and NaN must render exactly like +PANNER_MAX / 0. */
async function audioClamp() {
  const one = async (pan) => {
    const r = await offline(0.5, (api) => { api.play("drone", { pan }); });
    return r.whole;
  };
  return { hardRight: await one(5), maxRight: await one(PANNER_MAX), nan: await one(NaN) };
}

/** A3: mute is one master write — the whole rendered graph must be digital silence. */
async function audioMute() {
  const late = await offline(1.0, (api) => {
    api.play("drone", { pan: -0.3 });
    api.play("salvage");
    api.play("upgrade");
    api.setMuted(false); // beds on
    api.setMuted(true);  // the single mute write
  });
  const fromStart = await offline(1.0, (api) => {
    api.play("drone");
    api.play("furnace");
  }, true);
  // The unmuted control: the same graph with beds on is audible (and gentle),
  // so the silence above is the mute write, not an empty graph. One 50 ms ui
  // cue builds the graph (offline contexts cannot resume() before rendering);
  // setMuted(false) then starts the beds exactly like the live gesture path.
  const bedsAudible = await offline(0.5, (api) => { api.play("blocked"); api.setMuted(false); });
  return { late, fromStart, bedsAudible };
}

/** A4: 64 plays in 16 bursts — the ledger stays capped and the mix never clips. */
async function audioPool() {
  return offline(1.0, (api, c, marks) => {
    const burst = (pan) => {
      api.play("drone", { pan });
      api.play("sorter", { pan: -pan });
      api.play("furnace", { pan });
      api.play("salvage");
      marks.push(voiceCounts(api));
    };
    burst(1);
    for (let k = 1; k < 16; k += 1) {
      c.suspend(0.05 * k).then(() => { burst(k % 2 ? 1 : -1); c.resume(); });
    }
  });
}

/** A5: graph read-back — the spatial hop is recorded on panner-capable contexts. */
function audioGraph() {
  const ctx2 = new OfflineAudioContext(2, 44100, 44100);
  const api = createAudio(false, 16, () => ctx2);
  api.play("furnace", { pan: 0.6 });
  api.play("collect", { pan: 1 });
  const snap = api.graphSnapshot();
  api.dispose();
  const pan = snap.find((n) => n.id.endsWith("-pan"));
  const voice = pan ? snap.find((n) => n.id === pan.id.slice(0, -4)) : null;
  const collectVoice = snap.find((n) => n.kind === "voice" && !n.id.endsWith("-pan") && n.id !== voice?.id);
  return {
    panEntry: pan ?? null,
    voiceEntry: voice ?? null,
    machineryBus: snap.find((n) => n.id === "machinery") ?? null,
    collectHasPan: snap.some((n) => n.id === `${collectVoice?.id}-pan`),
    totalNodes: snap.length,
  };
}

window.__RW3D__ = {
  render,
  audioPan: audioPanFull,
  audioClamp,
  audioMute,
  audioPool,
  audioGraph,
  meta: { PALETTE, STATUS_ACCENTS, PANNER_MAX, FAN_STEPS },
};
