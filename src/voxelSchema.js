// RUSTWAKE V2 — canonical voxel geometry scale, pivot and material schema (ART-01, issue #347).
// Pure data + validation: no THREE, no DOM, no legacy V1 coupling. Node-testable.
//
// Provenance:
//  - Approved visual reference: public/reference/approved-yard.png (supplemental asset-style-sheet.png).
//  - Color/scale tokens: docs/design/tokens.json (rustwake.visual.tokens.v1).
//  - Geometry source of truth: src/world.js makeBuilding/createTruck at PR #307 baseline 006b5e8.
//  - This module DESCRIBES and VALIDATES that original procedural geometry; it never
//    replaces the playable world with an image and never imports archive/legacy code.
//
// Coordinate contract (matches src/camera.js): right-handed, X east, Y up, Z south.
// A building occupies `footprint.cells` logical cells of CELL world units each; its
// group origin sits at the cell center on Y=0. Frontage faces +Z (south) toward the
// loading bay. Pivots are named THREE.Group nodes ("pivot:<id>") owned by the machine.
import {CELL, WORLD_SIZE, BUILDINGS} from "./content.js";

export const SCHEMA_ID = "rustwake.voxel.geometry.v1";
export const PARCEL = Object.freeze({cells: [WORLD_SIZE, WORLD_SIZE], world: [WORLD_SIZE * CELL, WORLD_SIZE * CELL]});

// Canonical scale references. Worker is the human unit; truck matches createTruck().
export const SCALE_REFERENCES = Object.freeze({
  worker: {height: 1.7, width: 0.62, depth: 0.34, role: "human scale reference; decorative until crew simulation lands (#274)"},
  truck: {length: 2.05, width: 1.2, height: 1.35, role: "physical freight carrier; must fit one road cell and one loading bay"},
  machineHeightRatio: {min: 0.9, max: 4.0}, // machine height / worker height
  maxAnimatedReach: CELL * 1.5 // animated booms may overhang the cell, never the parcel logic
});

// Material ownership: one shared pool in src/world.js (`mats`), mirrored here and in
// docs/design/tokens.json `world`. Keys are the ONLY legal material ids for machine parts.
// metalness/roughness/emissive mirror world.js exactly; flatShading is universal.
export const MATERIALS = Object.freeze({
  asphalt: {color: "#283840", metalness: 0.07, roughness: 0.78, owner: "world.js mats", use: "road surface"},
  line: {color: "#e5ac60", metalness: 0.07, roughness: 0.78, owner: "world.js mats", use: "road center line"},
  earth: {color: "#756b55", metalness: 0.07, roughness: 0.78, owner: "world.js mats", use: "terrain"},
  rock: {color: "#91806b", metalness: 0.07, roughness: 0.78, owner: "world.js mats", use: "terrain debris"},
  steel: {color: "#b2bfbd", metalness: 0.42, roughness: 0.78, owner: "world.js mats", use: "structural steel"},
  dark: {color: "#33474e", metalness: 0.38, roughness: 0.78, owner: "world.js mats", use: "foundations, cabs"},
  rust: {color: "#c78355", metalness: 0.3, roughness: 0.78, owner: "world.js mats", use: "weathered industrial body"},
  orange: {color: "#e7a25d", metalness: 0.36, roughness: 0.78, owner: "world.js mats", use: "hazard/active machinery accent"},
  lights: {color: "#86d5c5", emissive: "#4baba7", emissiveIntensity: 1.1, owner: "world.js mats", use: "restrained operating mint status"},
  furnace: {color: "#f98b50", emissive: "#cf431c", emissiveIntensity: 1.8, owner: "world.js mats", use: "hot process window"},
  roof: {color: "#70888b", metalness: 0.35, roughness: 0.78, owner: "world.js mats", use: "roofing"},
  body: {color: "#839c9e", metalness: 0.4, roughness: 0.78, owner: "world.js mats", use: "machine housings"},
  glass: {color: "#9ab9bc", metalness: 0.1, roughness: 0.22, owner: "world.js mats", use: "cab glazing"},
  sand: {color: "#8d7b5d", metalness: 0.07, roughness: 0.78, owner: "world.js mats", use: "dusty ground"},
  wood: {color: "#80644d", metalness: 0.07, roughness: 0.78, owner: "world.js mats", use: "market timber"},
  black: {color: "#151d23", metalness: 0.1, roughness: 0.78, owner: "world.js mats", use: "doorways, tires"}
});

// Performance limits (issue #347 acceptance: provenance + performance limits).
// Shared unit BoxGeometry + shared material pool; cylinders limited to 8 radial segments.
export const PERFORMANCE_LIMITS = Object.freeze({
  maxMeshesPerMachine: 60,
  maxTrianglesPerMachine: 1600,
  maxMachinesInitialScene: 6,
  maxTrucksInitialScene: 3,
  cylinderRadialSegments: 8,
  shadowMapSize: 2048,
  deviceDPRMax: 2,
  pointLightsMax: 4
});

const PAD = CELL * 0.87; // foundation pad edge in world.js (3.045)
const BAY = {offset: [0, CELL * 0.37], size: [1.22, 0.42], y: 0.11}; // ground loading bay, +Z frontage
const STATUS_LIGHT = [1.28, 0.95, 1.25];

// Static envelope = everything except named animated pivot assemblies.
// bounds are centered on the cell origin in X/Z and start at Y=0.
const foot = (height, extra = {}) => {
  // Pick height encloses the tallest animated pose (boom/truss/rocker), not just the static shell.
  const pickHeight = extra.pickHeight ?? height;
  return {
    footprint: {cells: [1, 1], world: [CELL, CELL], pad: [PAD, PAD]},
    frontage: {face: "+z", bay: BAY, statusLight: STATUS_LIGHT},
    pick: {size: [CELL, pickHeight, CELL], center: [0, pickHeight / 2, 0], minProjectedCssPx: 44},
    pivots: [],
    animations: [],
    ...extra
  };
};

export const MACHINES = Object.freeze({
  salvager: foot(2.285, {
    pickHeight: 2.95,
    bounds: {width: PAD, height: 2.285, depth: PAD},
    parts: [
      {id: "foundation", material: "dark"}, {id: "base", material: "steel"},
      {id: "body", material: "rust"}, {id: "roof", material: "roof"},
      {id: "intake", material: "orange"}, {id: "chute", material: "steel"}, {id: "vents", material: "dark"}
    ],
    pivots: [{id: "rocker", node: "pivot:rocker", offset: [0, 2.4, -0.2], axis: "y",
      motion: {kind: "oscillate", amplitude: 0.55, speed: 0.65}, swingRadius: 2.95,
      parts: [{id: "turret", material: "dark"}, {id: "arm", material: "orange"}, {id: "head", material: "steel"}]}],
    budget: {maxMeshes: 24, maxTriangles: 400}
  }),
  depot: foot(2.87, {
    bounds: {width: 3.13, height: 2.87, depth: PAD},
    parts: [
      {id: "foundation", material: "dark"}, {id: "base", material: "steel"},
      {id: "body", material: "body"}, {id: "roof", material: "roof"},
      {id: "door", material: "black"}, {id: "doorTrim", material: "orange"},
      {id: "roofVents", material: "steel"}, {id: "signage", material: "canvas-text"},
      {id: "bay", material: "orange"}, {id: "status", material: "lights"}
    ],
    signage: "FREIGHT",
    budget: {maxMeshes: 24, maxTriangles: 400}
  }),
  market: foot(2.87, {
    bounds: {width: 3.13, height: 2.87, depth: PAD},
    parts: [
      {id: "foundation", material: "dark"}, {id: "base", material: "steel"},
      {id: "body", material: "wood"}, {id: "roof", material: "roof"},
      {id: "door", material: "black"}, {id: "doorTrim", material: "orange"},
      {id: "roofVents", material: "steel"}, {id: "signage", material: "canvas-text"},
      {id: "bay", material: "orange"}, {id: "status", material: "lights"}
    ],
    signage: "EXCHANGE",
    budget: {maxMeshes: 24, maxTriangles: 400}
  }),
  generator: foot(1.975, {
    pickHeight: 2.2,
    bounds: {width: PAD, height: 1.975, depth: PAD},
    parts: [
      {id: "foundation", material: "dark"}, {id: "base", material: "steel"},
      {id: "body", material: "body"}, {id: "cap", material: "dark"},
      {id: "exhaust", material: "orange"}, {id: "status", material: "lights"}
    ],
    pivots: [{id: "spin", node: "pivot:spin", offset: [0, 1.9, 0], axis: "y",
      motion: {kind: "spin", speed: 1.75}, swingRadius: 1.32,
      parts: [{id: "hub", material: "steel"}, {id: "blades", material: "orange"}]}],
    budget: {maxMeshes: 24, maxTriangles: 500}
  }),
  furnace: foot(4.55, {
    bounds: {width: PAD, height: 4.55, depth: PAD},
    parts: [
      {id: "foundation", material: "dark"}, {id: "base", material: "steel"},
      {id: "body", material: "body"}, {id: "roof", material: "roof"},
      {id: "stackMain", material: "steel"}, {id: "stackAux", material: "rust"},
      {id: "hotWindow", material: "furnace"}, {id: "sideRust", material: "rust"},
      {id: "trim", material: "orange"}
    ],
    animations: [{kind: "pulse", target: "group.scale.y", amplitude: 0.009, speed: 5}],
    budget: {maxMeshes: 24, maxTriangles: 500}
  }),
  foundry: foot(4.55, {
    bounds: {width: PAD, height: 4.55, depth: PAD},
    parts: [
      {id: "foundation", material: "dark"}, {id: "base", material: "steel"},
      {id: "body", material: "body"}, {id: "roof", material: "roof"},
      {id: "stackMain", material: "steel"}, {id: "stackAux", material: "rust"},
      {id: "hotWindow", material: "furnace"}, {id: "sideRust", material: "rust"},
      {id: "trim", material: "orange"}
    ],
    animations: [{kind: "pulse", target: "group.scale.y", amplitude: 0.009, speed: 5}],
    budget: {maxMeshes: 24, maxTriangles: 500}
  }),
  crusher: foot(2.34, {
    bounds: {width: PAD, height: 2.34, depth: PAD},
    parts: [
      {id: "foundation", material: "dark"}, {id: "base", material: "steel"},
      {id: "body", material: "body"}, {id: "rollers", material: "steel"},
      {id: "hopper", material: "orange"}, {id: "grille", material: "dark"}
    ],
    budget: {maxMeshes: 24, maxTriangles: 500}
  }),
  refinery: foot(2.34, {
    bounds: {width: PAD, height: 2.34, depth: PAD},
    parts: [
      {id: "foundation", material: "dark"}, {id: "base", material: "steel"},
      {id: "body", material: "body"}, {id: "rollers", material: "steel"},
      {id: "hopper", material: "orange"}, {id: "grille", material: "dark"}
    ],
    budget: {maxMeshes: 24, maxTriangles: 500}
  }),
  crane: foot(5.09, {
    pickHeight: 5.6,
    bounds: {width: PAD, height: 5.09, depth: PAD},
    parts: [
      {id: "foundation", material: "dark"}, {id: "base", material: "steel"},
      {id: "ballast", material: "rust"}, {id: "legs", material: "orange"},
      {id: "gantry", material: "steel"}
    ],
    pivots: [{id: "crane", node: "pivot:crane", offset: [0, 5.1, 0], axis: "y",
      motion: {kind: "oscillate", amplitude: 0.34, speed: 0.24}, swingRadius: 4.8,
      parts: [{id: "boom", material: "orange"}, {id: "truss", material: "steel"},
        {id: "cable", material: "steel"}, {id: "hook", material: "rust"}, {id: "counterweight", material: "dark"}]}],
    budget: {maxMeshes: 32, maxTriangles: 600}
  }),
  turret: foot(3.42, {
    bounds: {width: PAD, height: 3.42, depth: PAD},
    parts: [
      {id: "foundation", material: "dark"}, {id: "base", material: "steel"},
      {id: "tower", material: "dark"}, {id: "ring", material: "steel"}, {id: "cupola", material: "roof"}
    ],
    pivots: [{id: "rotate", node: "pivot:rotate", offset: [0, 2.95, 0], axis: "y",
      motion: {kind: "spin", speed: 0.22}, swingRadius: 2.3,
      parts: [{id: "barrel", material: "orange"}]}],
    budget: {maxMeshes: 20, maxTriangles: 400}
  }),
  fabricator: foot(3.05, {
    bounds: {width: PAD, height: 3.05, depth: PAD},
    parts: [
      {id: "foundation", material: "dark"}, {id: "base", material: "steel"},
      {id: "body", material: "body"}, {id: "roof", material: "roof"},
      {id: "windows", material: "lights"}, {id: "roofUnits", material: "orange"}
    ],
    budget: {maxMeshes: 24, maxTriangles: 400}
  }),
  research: foot(4.925, {
    bounds: {width: PAD, height: 4.925, depth: PAD},
    parts: [
      {id: "foundation", material: "dark"}, {id: "base", material: "steel"},
      {id: "body", material: "body"}, {id: "roof", material: "roof"},
      {id: "windows", material: "lights"}, {id: "mast", material: "steel"}, {id: "beacon", material: "lights"}
    ],
    budget: {maxMeshes: 24, maxTriangles: 450}
  })
});

export const machineDescriptor = (type) => MACHINES[type] || null;
export const cellCenter = (i) => (i - WORLD_SIZE / 2 + 0.5) * CELL;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const fail = (errors, id, message) => errors.push(id + ": " + message);

// Validates one descriptor against parcel, cell scale, pick accessibility,
// frontage/port, pivot ownership, material registry, scale references and budgets.
export function validateMachine(type, desc = MACHINES[type]) {
  const errors = [];
  if (!desc) {fail(errors, type, "no descriptor registered"); return {id: type, ok: false, errors};}
  const f = desc.footprint, b = desc.bounds, p = desc.pick;
  if (!f || !Array.isArray(f.cells) || f.cells.length !== 2 || !f.cells.every(c => Number.isInteger(c) && c >= 1))
    fail(errors, type, "footprint.cells must be two positive integers");
  else {
    if (f.cells[0] > WORLD_SIZE || f.cells[1] > WORLD_SIZE) fail(errors, type, "footprint exceeds 24x24 parcel");
    if (Math.abs(f.world[0] - f.cells[0] * CELL) > 1e-9 || Math.abs(f.world[1] - f.cells[1] * CELL) > 1e-9)
      fail(errors, type, "footprint.world must equal cells * 3.5");
  }
  if (!b || !isNum(b.width) || !isNum(b.height) || !isNum(b.depth) || b.width <= 0 || b.height <= 0 || b.depth <= 0)
    fail(errors, type, "bounds must be positive width/height/depth");
  else {
    if (b.width > f.world[0] + 1e-9 || b.depth > f.world[1] + 1e-9)
      fail(errors, type, "static geometry overhangs the logical cell (animated reach is declared separately)");
    const ratio = b.height / SCALE_REFERENCES.worker.height;
    if (ratio < SCALE_REFERENCES.machineHeightRatio.min || ratio > SCALE_REFERENCES.machineHeightRatio.max)
      fail(errors, type, "height " + b.height + " outside worker scale ratio " + JSON.stringify(SCALE_REFERENCES.machineHeightRatio));
  }
  if (!p || !Array.isArray(p.size) || !Array.isArray(p.center)) fail(errors, type, "pick bounds missing");
  else {
    if (p.size[0] < f.world[0] - 1e-9 || p.size[2] < f.world[1] - 1e-9)
      fail(errors, type, "pick bounds smaller than the cell footprint (inaccessible on touch)");
    if (b && (p.size[0] < b.width - 1e-9 || p.size[1] < b.height - 1e-9 || p.size[2] < b.depth - 1e-9))
      fail(errors, type, "pick bounds must enclose the full static silhouette incl. roof");
    if (p.minProjectedCssPx < 44) fail(errors, type, "pick target below 44 css px accessibility floor");
  }
  const fr = desc.frontage;
  if (!fr || fr.face !== "+z" || !fr.bay) fail(errors, type, "frontage must declare +Z loading bay");
  else {
    const [ox, oz] = fr.bay.offset, [bw, bd] = fr.bay.size;
    if (Math.abs(ox) + bw / 2 > f.world[0] / 2 + 1e-9 || Math.abs(oz) + bd / 2 > f.world[1] / 2 + 1e-9)
      fail(errors, type, "loading bay outside footprint");
    if (bw < SCALE_REFERENCES.truck.width - 1e-9) fail(errors, type, "bay narrower than a truck");
  }
  for (const pv of desc.pivots || []) {
    if (!pv.node || pv.node !== "pivot:" + pv.id) fail(errors, type, "pivot node must be named pivot:" + pv.id);
    if (!["x", "y", "z"].includes(pv.axis)) fail(errors, type, "pivot " + pv.id + " axis invalid");
    if (!pv.motion || !["spin", "oscillate"].includes(pv.motion.kind)) fail(errors, type, "pivot " + pv.id + " motion invalid");
    if (!Array.isArray(pv.offset) || pv.offset.length !== 3 || !pv.offset.every(isNum))
      fail(errors, type, "pivot " + pv.id + " offset invalid");
    else if (b && (Math.abs(pv.offset[0]) > b.width / 2 + 1e-9 || Math.abs(pv.offset[2]) > b.depth / 2 + 1e-9 ||
      pv.offset[1] < 0 || pv.offset[1] > b.height + 0.5))
      fail(errors, type, "pivot " + pv.id + " offset outside machine envelope");
    if (!isNum(pv.swingRadius) || pv.swingRadius <= 0 || pv.swingRadius > SCALE_REFERENCES.maxAnimatedReach)
      fail(errors, type, "pivot " + pv.id + " swingRadius must be >0 and <= " + SCALE_REFERENCES.maxAnimatedReach);
    for (const part of pv.parts || []) if (!MATERIALS[part.material] && part.material !== "canvas-text")
      fail(errors, type, "pivot " + pv.id + " part " + part.id + " uses unregistered material " + part.material);
  }
  for (const part of desc.parts || []) if (!MATERIALS[part.material] && part.material !== "canvas-text")
    fail(errors, type, "part " + part.id + " uses unregistered material " + part.material);
  const budget = desc.budget;
  if (!budget || !Number.isInteger(budget.maxMeshes) || !Number.isInteger(budget.maxTriangles) ||
    budget.maxMeshes > PERFORMANCE_LIMITS.maxMeshesPerMachine || budget.maxTriangles > PERFORMANCE_LIMITS.maxTrianglesPerMachine)
    fail(errors, type, "budget missing or above global performance limits");
  return {id: type, ok: errors.length === 0, errors};
}

export function validateAllMachines() {
  const results = BUILDINGS.map(b => validateMachine(b.id));
  const missing = BUILDINGS.filter(b => !MACHINES[b.id]).map(b => b.id);
  const extra = Object.keys(MACHINES).filter(id => !BUILDINGS.some(b => b.id === id));
  const errors = results.flatMap(r => r.errors);
  if (missing.length) errors.push("missing descriptors: " + missing.join(","));
  if (extra.length) errors.push("orphan descriptors: " + extra.join(","));
  return {ok: errors.length === 0, schema: SCHEMA_ID, parcel: PARCEL, cell: CELL, machines: results, errors};
}

// CSS pixels spanned by one cell at a given camera zoom/viewport (orthographic,
// frustum vertical span 80/zoom — same contract as src/camera.js).
export function cellProjectedCssPx(zoom, viewportHeight) {
  return CELL * viewportHeight * zoom / 80;
}
// Minimum zoom at which the full-cell pick target meets the 44px touch floor.
export function minZoomForPick(viewportHeight) {
  return 44 * 80 / (CELL * viewportHeight);
}
