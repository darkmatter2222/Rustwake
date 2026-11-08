// Scratch: paint-op counts for the base fixture set (used as the "before" numbers
// in the ART-003 restated rows). Run with npx tsx scripts/_art003_paints.mjs
import { drawScene } from "../src/game/renderer/scene";
import { createInitialState } from "../src/game/simulation/types";

const PAINT_OPS = new Set(["fill", "stroke", "fillRect", "strokeRect", "fillText"]);

function makeCtx() {
  const log = [];
  let fillStyle = "";
  let strokeStyle = "";
  let segCount = 0;
  const ctx = {
    imageSmoothingEnabled: true,
    lineWidth: 1,
    font: "",
    textAlign: "",
    globalAlpha: 1,
    get fillStyle() { return fillStyle; },
    set fillStyle(v) { fillStyle = v; },
    get strokeStyle() { return strokeStyle; },
    set strokeStyle(v) { strokeStyle = v; },
    fillRect: (...a) => log.push({ op: "fillRect", style: fillStyle, args: a }),
    strokeRect: (...a) => log.push({ op: "strokeRect", style: strokeStyle, args: a }),
    fillText: (t, ...a) => log.push({ op: "fillText", style: fillStyle, args: a, text: t }),
    beginPath: () => { segCount = 0; },
    moveTo: (...a) => log.push({ op: "moveTo", style: "", args: a }),
    lineTo: (...a) => { segCount += 1; log.push({ op: "lineTo", style: "", args: a }); },
    closePath: () => undefined,
    rect: (...a) => log.push({ op: "rect", style: fillStyle, args: a }),
    ellipse: (...a) => log.push({ op: "ellipse", style: fillStyle, args: a.slice(0, 4) }),
    fill: () => log.push({ op: "fill", style: fillStyle, args: [] }),
    stroke: () => log.push({ op: "stroke", style: strokeStyle, args: [segCount] }),
    setTransform: () => undefined,
  };
  return { log, paints: () => log.filter((r) => PAINT_OPS.has(r.op)).length, ctx };
}

const VIEW = { width: 390, height: 844 };
const SCALE = 390 / (192 + 24);
const camera = { x: 96, y: (192 + 32) / 2, scale: SCALE };

function part(id, blueprint, tile, status, trayUnits) {
  return {
    id, blueprint, tile, orientation: 0, level: 1,
    inBuf: {}, inBufUnits: trayUnits, tray: [], trayUnits, batch: [],
    progress: 120, progressRem: 0, progressDen: 600, batchMilli: 600, batchPower: 2,
    status, inRoutes: [], outRoute: null, starvedTicks: 0, batchesDone: 3,
    ageTicks: 300, busyTicks: 200, fullTicks: 0,
    rateAge: 0, rateFrom: 0, rateAgePrev: 0, rateFromPrev: 0,
  };
}

function fs1() {
  const base = createInitialState();
  return {
    ...base,
    tick: 344,
    tutorial: 9,
    machines: [part(1, "sorter", 8, "running", 0), part(2, "furnace", 14, "outputFull", 1)],
    routes: [
      { id: 1, from: { kind: "store" }, to: { kind: "machine", id: 1 }, filter: "scrap", capacity: 5, latency: 5, items: [{ resource: "scrap", qty: 1, arrive: 344 }], inFlight: 1 },
      { id: 2, from: { kind: "machine", id: 1 }, to: { kind: "machine", id: 2 }, filter: "ferrous", capacity: 5, latency: 5, items: [{ resource: "ferrous", qty: 1, arrive: 345 }], inFlight: 1 },
    ],
    drone: { ...base.drone, repaired: true, inFlight: { arrive: 350, units: 3 } },
    storeUnits: 770,
    storeCapacity: 900,
  };
}

function mature() {
  const base = fs1();
  const blueprints = ["sorter", "furnace", "wireMill", "signalLab", "sorter", "furnace", "generic", "generic"];
  const statuses = ["running", "starved", "outputFull", "idle", "powerLimited", "paused", "running", "outputFull"];
  base.machines = blueprints.map((bp, i) => ({ ...base.machines[i % 2], id: i + 1, blueprint: bp, tile: i + 1, status: statuses[i], level: 2 + (i % 3) }));
  const spare = { repaired: true, inFlight: { arrive: 350, units: 2 } };
  return {
    ...base,
    spares: [spare, spare, spare, spare],
    routes: Array.from({ length: 18 }, (_, i) => ({
      id: i + 1, from: { kind: i % 2 ? "store" : "machine", id: 1 + (i % 8) },
      to: { kind: i % 3 ? "machine" : "store", id: 1 + ((i + 1) % 8) }, filter: "scrap",
      capacity: 5, latency: 5, items: [{ resource: "scrap", qty: 1, arrive: 344 + (i % 4) }], inFlight: 1,
    })),
  };
}

const rest = { reducedMotion: false, buildMode: false, ghostTile: null, ghostValid: true, selected: null };
const build = { ...rest, buildMode: true, ghostTile: 20, ghostValid: true };

const run = (state, options) => {
  const stub = makeCtx();
  drawScene(stub.ctx, state, camera, VIEW, options);
  return stub.paints();
};

console.log(JSON.stringify({ rest: run(fs1(), rest), build: run(fs1(), build), mature: run(mature(), rest) }));
