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
// A building occupies `footprint.cells` logical cells of CELL world units each, taken
// from the content registry footprintOf() (#370, merged in main e8240a87). Per #370 the
// group sits at the footprint center on Y=0 and is scaled by base w/d; ALL geometry
// fields below (bounds, pick, pivots, bay) describe the AUTHORED LOCAL (unscaled)
// geometry, so world envelope = local envelope × footprint.scale. Frontage faces +Z
// (south) toward the loading bay. Pivots are named THREE.Group nodes ("pivot:<id>").
import {CELL, WORLD_SIZE, BUILDINGS, footprintOf} from "./content.js";

export const SCHEMA_ID = "rustwake.voxel.geometry.v1";
export const PARCEL = Object.freeze({cells: [WORLD_SIZE, WORLD_SIZE], world: [WORLD_SIZE * CELL, WORLD_SIZE * CELL]});

// Canonical scale references. Worker is the human unit; truck matches createTruck().
// ART-05 (#351): forklift/drone join the same canonical scale ladder; both are
// decorative yard crew with NO simulation authority until crew systems land (#274).
export const SCALE_REFERENCES = Object.freeze({
  worker: {height: 1.7, width: 0.62, depth: 0.34, role: "human scale reference; decorative until crew simulation lands (#274)"},
  truck: {length: 2.05, width: 1.2, height: 1.35, role: "physical freight carrier; must fit one road cell and one loading bay"},
  forklift: {length: 1.3, width: 0.8, height: 1.1, role: "decorative yard crew at the depot bay approach; no freight authority (#274, #351)"},
  drone: {length: 1.0, width: 1.0, height: 0.3, role: "decorative survey crew hovering over a real active cycle; no freight authority (#274, #351)"},
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
  black: {color: "#151d23", metalness: 0.1, roughness: 0.78, owner: "world.js mats", use: "doorways, tires"},
  // ART-03 (#349): discrete status variants for the four industrial rigs. Status
  // swaps REASSIGN mesh.material to these shared pool entries; the pool is never
  // mutated per building. "ember" is the starved (powered-but-no-inputs) process
  // surface; "dark" doubles as the cold/unpowered surface (already registered).
  statusStarved: {color: "#e7a25d", emissive: "#b06a20", emissiveIntensity: 1.2, owner: "world.js mats", use: "ART-03 starved amber status light"},
  statusDead: {color: "#5a3038", emissive: "#7a2430", emissiveIntensity: 0.5, owner: "world.js mats", use: "ART-03 unpowered dead-red status light"},
  statusIdle: {color: "#6f8a86", emissive: "#3a5a56", emissiveIntensity: 0.4, owner: "world.js mats", use: "ART-03 idle utility status light"},
  ember: {color: "#a85a38", emissive: "#6e2a12", emissiveIntensity: 0.6, owner: "world.js mats", use: "ART-03 starved dim-ember process window"},
  smoke: {color: "#9fb0ad", metalness: 0.05, roughness: 0.95, owner: "world.js mats", use: "ART-03 working-only emission puffs"}
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

const RAW_MACHINES = {
  // ART-02 (#348): rebuilt Scrap Extractor — stepped hull/roof, glazed cab, flared
  // intake + discharge chute, radiator fins, exhaust stack (static top 2.74), rear
  // counterweight. Rocker pivot contract unchanged; grapple head gains 3 teeth.
  salvager: foot(2.74, {
    pickHeight: 2.95,
    bounds: {width: PAD, height: 2.74, depth: PAD},
    parts: [
      {id: "foundation", material: "dark"}, {id: "base", material: "steel"},
      {id: "hull", material: "rust"}, {id: "roof", material: "roof"}, {id: "roofStep", material: "roof"},
      {id: "roofVents", material: "dark"}, {id: "cabFrame", material: "dark"}, {id: "cabGlass", material: "glass"},
      {id: "intake", material: "orange"}, {id: "intakeMouth", material: "black"},
      {id: "chute", material: "steel"}, {id: "chuteRim", material: "dark"},
      {id: "radiatorFins", material: "dark"}, {id: "stack", material: "steel"}, {id: "stackCap", material: "rust"},
      {id: "counterweight", material: "dark"}, {id: "sidePanel", material: "rust"},
      {id: "bay", material: "orange"}, {id: "status", material: "lights"}
    ],
    pivots: [{id: "rocker", node: "pivot:rocker", offset: [0, 2.4, -0.2], axis: "y",
      motion: {kind: "oscillate", amplitude: 0.55, speed: 0.65}, swingRadius: 2.95,
      parts: [{id: "turret", material: "dark"}, {id: "boom", material: "orange"},
        {id: "head", material: "steel"}, {id: "teeth", material: "orange"}]}],
    budget: {maxMeshes: 32, maxTriangles: 560}
  }),
  // ART-04 (#350): the four civic rigs are rebuilt as DISTINCT functional
  // structures (the old depot/market shared one blockout body differing only by
  // a text panel; research/fabricator were the same box + mast/boxes). Motion
  // numbers mirror src/art04.js ART04_MOTION / ART04_DOCK exactly (drift-tested).
  // research/fabricator pivots turn ONLY on the real sim work clock while
  // working; the depot shutter is a distance-driven "lift" (nearest real truck
  // to the bay approach cell — the ART-05 forklift convention); the market
  // beam/awning are DECLARED AMBIENT civic decoration (no production authority,
  // #274) and its lamp reads "trading" only on a real g.stats.sold increase.
  // Bounds/budgets below are MEASURED from the real makeBuilding graph
  // (scripts/measure-art04.mjs), not eyeballed.
  depot: foot(2.98, {
    bounds: {width: 3.14, height: 2.98, depth: 3.2725},
    parts: [
      {id: "foundation", material: "dark"}, {id: "base", material: "steel"},
      {id: "hall", material: "body"}, {id: "roof", material: "roof"},
      {id: "monitor", material: "dark"}, {id: "monitorSlats", material: "steel"},
      {id: "platform", material: "dark"}, {id: "platformLip", material: "steel"},
      {id: "doorway", material: "black"}, {id: "doorFrame", material: "dark"},
      {id: "canopy", material: "roof"}, {id: "canopyPosts", material: "orange"},
      {id: "signHangers", material: "steel"}, {id: "signage", material: "canvas-text"},
      {id: "container", material: "rust"}, {id: "containerRibs", material: "dark"},
      {id: "logoPlaque", material: "dark"}, {id: "logoCrates", material: "orange"},
      {id: "logoCrateCore", material: "steel"},
      {id: "bay", material: "orange"}, {id: "status", material: "lights"}
    ],
    // pivot:door is a roll-up shutter: motion kind "lift" (vertical travel in
    // world units) driven by nearest-truck-bay-distance, NOT a clock spin.
    // Vocabulary extension documented in docs/design/ASSETS.md + GAPS.md.
    pivots: [{id: "door", node: "pivot:door", offset: [0, 0.76, 1.08], axis: "y",
      motion: {kind: "lift", travel: 0.8, drive: "nearest-truck-bay-distance"}, swingRadius: 0.8,
      parts: [{id: "panel", material: "dark"}, {id: "slats", material: "steel"}, {id: "edge", material: "orange"}]}],
    signage: "FREIGHT",
    budget: {maxMeshes: 38, maxTriangles: 460}
  }),
  market: foot(2.79, {
    pickHeight: 3.1,
    bounds: {width: PAD, height: 2.79, depth: PAD},
    parts: [
      {id: "foundation", material: "dark"}, {id: "base", material: "steel"},
      {id: "hall", material: "wood"}, {id: "roofSlabs", material: "roof"},
      {id: "ridge", material: "dark"}, {id: "gable", material: "wood"},
      {id: "coin", material: "orange"}, {id: "coinHole", material: "dark"},
      {id: "door", material: "black"}, {id: "doorTrim", material: "orange"},
      {id: "signage", material: "canvas-text"},
      {id: "counter", material: "wood"}, {id: "counterTop", material: "steel"},
      {id: "produceCrate", material: "rust"}, {id: "produceCrateWood", material: "wood"},
      {id: "crateBands", material: "dark"},
      {id: "bay", material: "orange"}, {id: "status", material: "lights"}
    ],
    pivots: [
      {id: "scale", node: "pivot:scale", offset: [0, 2.95, 0.72], axis: "z",
        motion: {kind: "oscillate", amplitude: 0.12, speed: 0.5, drive: "ambient-elapsed"}, swingRadius: 0.8,
        parts: [{id: "post", material: "steel"}, {id: "beam", material: "steel"},
          {id: "hangers", material: "steel"}, {id: "pans", material: "orange"}]},
      {id: "awning", node: "pivot:awning", offset: [0, 1.95, 0.72], axis: "x",
        motion: {kind: "oscillate", amplitude: 0.05, speed: 0.8, drive: "ambient-elapsed"}, swingRadius: 0.85,
        parts: [{id: "canopy", material: "orange"}, {id: "scallops", material: "orange"}]}
    ],
    signage: "EXCHANGE",
    budget: {maxMeshes: 36, maxTriangles: 480}
  }),
  // ART-03 (#349): the four industrial rigs are rebuilt as DISTINCT physically
  // believable structures. Motion numbers mirror src/art03.js ART03_MOTION
  // exactly (drift-tested). All pivot angles are radians per unit of SIM work
  // clock — never wall time. Status surfaces (status:light / status:window /
  // status:glow / status:ingot) swap between shared materials per derived sim
  // status (working/starved/unpowered/assembling/idle); emit:* groups are
  // working-only emission points phased off the same work clock.
  generator: foot(3.05, {
    pickHeight: 3.1,
    bounds: {width: PAD, height: 3.05, depth: PAD},
    parts: [
      {id: "foundation", material: "dark"}, {id: "base", material: "steel"},
      {id: "body", material: "body"}, {id: "cap", material: "dark"},
      {id: "intakeGrille", material: "dark"}, {id: "stack", material: "steel"},
      {id: "stackCap", material: "rust"}, {id: "fuelTank", material: "rust"},
      {id: "tankSaddles", material: "dark"}, {id: "cornerPost", material: "orange"},
      {id: "cornerLamp", material: "lights"}, {id: "bay", material: "orange"},
      {id: "status", material: "lights"}, {id: "exhaustPuffs", material: "smoke"}
    ],
    pivots: [
      {id: "spin", node: "pivot:spin", offset: [0, 1.9, 0], axis: "y",
        motion: {kind: "spin", speed: 2.2}, swingRadius: 1.32,
        parts: [{id: "hub", material: "steel"}, {id: "blades", material: "orange"}]},
      {id: "turbine", node: "pivot:turbine", offset: [0, 1.02, 1.44], axis: "z",
        motion: {kind: "spin", speed: -3.4}, swingRadius: 0.6,
        parts: [{id: "hub", material: "steel"}, {id: "blades", material: "orange"}]}
    ],
    emissions: [{node: "emit:exhaust", offset: [-0.95, 3.05, -0.95], puffs: 2, material: "smoke"}],
    statusSurfaces: {light: "status:light"},
    budget: {maxMeshes: 36, maxTriangles: 800}
  }),
  furnace: foot(4.7, {
    bounds: {width: PAD, height: 4.7, depth: PAD},
    parts: [
      {id: "foundation", material: "dark"}, {id: "base", material: "steel"},
      {id: "vessel", material: "body"}, {id: "inductionCoils", material: "rust"},
      {id: "roof", material: "dark"}, {id: "stackMain", material: "steel"},
      {id: "stackMainCap", material: "rust"}, {id: "stackAux", material: "rust"},
      {id: "stackAuxCap", material: "dark"}, {id: "chargeHopper", material: "orange"},
      {id: "hopperMouth", material: "black"}, {id: "hotWindow", material: "furnace"},
      {id: "sideGrates", material: "dark"}, {id: "tapSpout", material: "rust"},
      {id: "launder", material: "steel"}, {id: "bay", material: "orange"},
      {id: "status", material: "lights"}, {id: "stackPuffs", material: "smoke"}
    ],
    pivots: [
      {id: "charge", node: "pivot:charge", offset: [0, 2.92, 0.62], axis: "x",
        motion: {kind: "oscillate", amplitude: 0.5, speed: 1.2}, swingRadius: 0.8,
        parts: [{id: "flap", material: "steel"}]},
      {id: "blower", node: "pivot:blower", offset: [1.22, 1.55, 0.45], axis: "x",
        motion: {kind: "spin", speed: 2.6}, swingRadius: 0.5,
        parts: [{id: "hub", material: "steel"}, {id: "blades", material: "orange"}]}
    ],
    animations: [{kind: "pulse", target: "group.scale.y", amplitude: 0.009, speed: 5}],
    emissions: [
      {node: "emit:stackA", offset: [-0.62, 4.72, -0.62], puffs: 2, material: "smoke"},
      {node: "emit:stackB", offset: [0.62, 4.22, -0.62], puffs: 2, material: "smoke"}
    ],
    statusSurfaces: {light: "status:light", hot: "status:window"},
    budget: {maxMeshes: 40, maxTriangles: 900}
  }),
  foundry: foot(4.2, {
    bounds: {width: PAD, height: 4.2, depth: PAD},
    parts: [
      {id: "foundation", material: "dark"}, {id: "base", material: "steel"},
      {id: "hall", material: "rust"}, {id: "sawtoothRoof", material: "roof"},
      {id: "clerestory", material: "glass"}, {id: "stackMain", material: "steel"},
      {id: "stackMainCap", material: "rust"}, {id: "stackAux", material: "rust"},
      {id: "stackAuxCap", material: "dark"}, {id: "trunnions", material: "dark"},
      {id: "moldLine", material: "dark"}, {id: "ingots", material: "steel"},
      {id: "hotIngot", material: "furnace"}, {id: "coolingTank", material: "steel"},
      {id: "coolant", material: "glass"}, {id: "bay", material: "orange"},
      {id: "status", material: "lights"}, {id: "stackPuffs", material: "smoke"}
    ],
    pivots: [
      {id: "crucible", node: "pivot:crucible", offset: [0, 1.95, 0.95], axis: "x",
        motion: {kind: "oscillate", amplitude: 0.42, speed: 0.85}, swingRadius: 0.62,
        parts: [{id: "vessel", material: "dark"}, {id: "glow", material: "furnace"}, {id: "lip", material: "steel"}]},
      {id: "fan", node: "pivot:fan", offset: [0.7, 2.44, 0.3], axis: "y",
        motion: {kind: "spin", speed: 2}, swingRadius: 0.66,
        parts: [{id: "hub", material: "steel"}, {id: "blades", material: "orange"}]}
    ],
    animations: [{kind: "pulse", target: "group.scale.y", amplitude: 0.009, speed: 5}],
    emissions: [
      {node: "emit:stackA", offset: [-0.8, 4.22, -0.85], puffs: 2, material: "smoke"},
      {node: "emit:stackB", offset: [0.8, 3.82, -0.85], puffs: 2, material: "smoke"}
    ],
    statusSurfaces: {light: "status:light", hot: "status:glow", ingot: "status:ingot"},
    budget: {maxMeshes: 40, maxTriangles: 900}
  }),
  // ART-02 (#348): Crusher + screening plant, split from the shared refinery branch
  // (refinery below was rebuilt by ART-03 #349 into a distinct distillation plant;
  // the crusher geometry is UNCHANGED by ART-03). Open-front chamber, stepped hopper
  // roof (static top 2.51), twin discharge chutes. The "sorter" outcome of the ART-02
  // trio is the oscillating screen deck: V2's content registry has no standalone
  // buildable sorter (adding one needs src/content.js + src/simulation.js, outside
  // this lease), and the crusher's real sim outputs {iron:6, stone:2} ARE mechanical
  // separation. Motion numbers mirror world.js ART02_MOTION exactly (no drift).
  crusher: foot(2.51, {
    bounds: {width: PAD, height: 2.51, depth: PAD},
    parts: [
      {id: "foundation", material: "dark"}, {id: "base", material: "steel"},
      {id: "chamberWalls", material: "body"}, {id: "chamberRear", material: "body"},
      {id: "chamberFloor", material: "dark"}, {id: "sideRibs", material: "dark"},
      {id: "wearPlate", material: "rust"}, {id: "hopperThroat", material: "dark"},
      {id: "hopperMid", material: "orange"}, {id: "hopperFlare", material: "orange"},
      {id: "hopperRails", material: "steel"}, {id: "roofCap", material: "roof"},
      {id: "chuteFerrous", material: "steel"}, {id: "chuteAggregate", material: "steel"},
      {id: "chuteRimFerrous", material: "rust"}, {id: "chuteRimAggregate", material: "orange"},
      {id: "ladder", material: "steel"}, {id: "bay", material: "orange"}, {id: "status", material: "lights"}
    ],
    pivots: [
      {id: "rollerA", node: "pivot:rollerA", offset: [0, 1.35, 0.42], axis: "x",
        motion: {kind: "spin", speed: 1.75}, swingRadius: 1.8,
        parts: [{id: "shaft", material: "steel"}, {id: "teeth", material: "steel"}, {id: "flywheel", material: "dark"}]},
      {id: "rollerB", node: "pivot:rollerB", offset: [0, 1.35, -0.18], axis: "x",
        motion: {kind: "spin", speed: -1.75}, swingRadius: 0.4,
        parts: [{id: "shaft", material: "steel"}, {id: "teeth", material: "steel"}]},
      {id: "screen", node: "pivot:screen", offset: [0, 0.95, 0.95], axis: "x",
        motion: {kind: "oscillate", amplitude: 0.04, speed: 3.4}, swingRadius: 1.1,
        parts: [{id: "deck", material: "steel"}, {id: "meshBars", material: "dark"}]}
    ],
    budget: {maxMeshes: 46, maxTriangles: 660}
  }),
  refinery: foot(3.5, {
    bounds: {width: PAD, height: 3.5, depth: PAD},
    parts: [
      {id: "foundation", material: "dark"}, {id: "base", material: "steel"},
      {id: "column", material: "steel"}, {id: "columnCollars", material: "rust"},
      {id: "columnCap", material: "dark"}, {id: "columnAux", material: "rust"},
      {id: "columnAuxCap", material: "dark"}, {id: "storageTanks", material: "steel"},
      {id: "tankSaddles", material: "dark"}, {id: "pipeRack", material: "steel"},
      {id: "flareStack", material: "dark"}, {id: "cabinet", material: "body"},
      {id: "cabinetGrates", material: "dark"}, {id: "sightWindow", material: "furnace"},
      {id: "pumpPedestal", material: "body"}, {id: "bay", material: "orange"},
      {id: "status", material: "lights"}, {id: "vaporPuffs", material: "smoke"},
      {id: "flareFlame", material: "furnace"}
    ],
    pivots: [
      {id: "pump", node: "pivot:pump", offset: [-1.2, 0.95, 0.35], axis: "x",
        motion: {kind: "spin", speed: 2.4}, swingRadius: 0.45,
        parts: [{id: "flywheel", material: "dark"}, {id: "spokes", material: "steel"}]},
      {id: "valve", node: "pivot:valve", offset: [0.15, 1.42, 0.2], axis: "y",
        motion: {kind: "oscillate", amplitude: 0.6, speed: 0.9}, swingRadius: 0.3,
        parts: [{id: "wheel", material: "orange"}, {id: "spokes", material: "steel"}, {id: "stem", material: "steel"}]}
    ],
    emissions: [
      {node: "emit:flare", offset: [1.25, 3.55, -1.15], puffs: 1, material: "furnace", flare: true},
      {node: "emit:vapor", offset: [-0.55, 3.34, -0.45], puffs: 2, material: "smoke"}
    ],
    statusSurfaces: {light: "status:light", hot: "status:window"},
    budget: {maxMeshes: 48, maxTriangles: 1100}
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
  fabricator: foot(2.56, {
    bounds: {width: PAD, height: 2.56, depth: PAD},
    parts: [
      {id: "foundation", material: "dark"}, {id: "base", material: "steel"},
      {id: "workshop", material: "body"}, {id: "roof", material: "roof"},
      {id: "vent", material: "dark"}, {id: "ventCap", material: "steel"},
      {id: "backplate", material: "dark"},
      {id: "anvil", material: "dark"}, {id: "anvilTop", material: "steel"},
      {id: "chute", material: "steel"}, {id: "chuteRails", material: "dark"},
      {id: "chuteCrate", material: "orange"},
      {id: "entrance", material: "black"}, {id: "lintel", material: "orange"},
      {id: "statusWindow", material: "furnace"}, {id: "signage", material: "canvas-text"},
      {id: "bay", material: "orange"}, {id: "status", material: "lights"}
    ],
    // 2:1 gear train: 8-tooth drive gear vs 4-tooth pinion, counter-rotating at
    // the radius ratio (1.6 / -3.2 rad per sim work-clock unit). Trip hammer
    // oscillates over the anvil; head clearance is proven in the model tests.
    pivots: [
      {id: "gear", node: "pivot:gear", offset: [-0.35, 1.35, 0.78], axis: "z",
        motion: {kind: "spin", speed: 1.6}, swingRadius: 0.6,
        parts: [{id: "disc", material: "steel"}, {id: "teeth", material: "steel"}, {id: "hub", material: "orange"}]},
      {id: "pinion", node: "pivot:pinion", offset: [0.4, 1.35, 0.78], axis: "z",
        motion: {kind: "spin", speed: -3.2}, swingRadius: 0.35,
        parts: [{id: "disc", material: "rust"}, {id: "teeth", material: "rust"}]},
      {id: "hammer", node: "pivot:hammer", offset: [1.05, 1.9, 0.9], axis: "x",
        motion: {kind: "oscillate", amplitude: 0.45, speed: 1.1}, swingRadius: 1.05,
        parts: [{id: "arm", material: "steel"}, {id: "head", material: "rust"}, {id: "bearing", material: "dark"}]}
    ],
    signage: "FAB WORKS",
    budget: {maxMeshes: 40, maxTriangles: 540}
  }),
  research: foot(3.45, {
    pickHeight: 4.5,
    bounds: {width: 3.09, height: 3.45, depth: PAD},
    parts: [
      {id: "foundation", material: "dark"}, {id: "base", material: "steel"},
      {id: "tower", material: "body"}, {id: "bands", material: "rust"},
      {id: "cap", material: "dark"},
      {id: "cabinet", material: "body"}, {id: "grille", material: "dark"},
      {id: "statusWindow", material: "furnace"},
      {id: "signBacking", material: "dark"}, {id: "signage", material: "canvas-text"},
      {id: "ladder", material: "steel"}, {id: "rungs", material: "steel"},
      {id: "bay", material: "orange"}, {id: "status", material: "lights"}
    ],
    // Azimuth dish (spin y) with a NESTED feed horn (oscillate x, parent
    // pivot:dish). Full animated height 4.4589 is SHORTER than the old 4.925
    // mast — the height-aware pick volume shrinks with it (CAM-01 debt relief).
    pivots: [
      {id: "dish", node: "pivot:dish", offset: [0, 3.55, -0.2], axis: "y",
        motion: {kind: "spin", speed: 0.5}, swingRadius: 1.15,
        parts: [{id: "drum", material: "dark"}, {id: "panel", material: "steel"}, {id: "rim", material: "rust"}]},
      {id: "feed", node: "pivot:feed", parent: "pivot:dish", offset: [0, 0.55, 0.62], axis: "x",
        motion: {kind: "oscillate", amplitude: 0.16, speed: 0.7}, swingRadius: 0.65,
        parts: [{id: "arm", material: "steel"}, {id: "horn", material: "orange"}]}
    ],
    signage: "SIGNAL",
    budget: {maxMeshes: 28, maxTriangles: 460}
  })
};

// #370 integration: logical footprints come from the content registry (crane is 2×3;
// every other initial machine is 1×1). footprint.scale is the base w/d group scale
// applied by world.js makeBuilding(); geometry fields stay in authored local space.
export const MACHINES = Object.freeze(Object.fromEntries(Object.entries(RAW_MACHINES).map(([type, d]) => {
  const fp = footprintOf(type);
  return [type, Object.freeze({...d, footprint: Object.freeze({
    ...d.footprint, cells: [fp.w, fp.d], world: [fp.w * CELL, fp.d * CELL], scale: [fp.w, fp.d]
  })})];
})));

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
    if (b.width > CELL + 1e-9 || b.depth > CELL + 1e-9)
      fail(errors, type, "static geometry overhangs the authored base cell (animated reach is declared separately)");
    const ratio = b.height / SCALE_REFERENCES.worker.height;
    if (ratio < SCALE_REFERENCES.machineHeightRatio.min || ratio > SCALE_REFERENCES.machineHeightRatio.max)
      fail(errors, type, "height " + b.height + " outside worker scale ratio " + JSON.stringify(SCALE_REFERENCES.machineHeightRatio));
  }
  if (!p || !Array.isArray(p.size) || !Array.isArray(p.center)) fail(errors, type, "pick bounds missing");
  else {
    // Pick is authored local; the #370 group scale stretches it over the full footprint.
    if (p.size[0] < CELL - 1e-9 || p.size[2] < CELL - 1e-9)
      fail(errors, type, "pick bounds smaller than the base cell (inaccessible on touch)");
    if (b && (p.size[0] < b.width - 1e-9 || p.size[1] < b.height - 1e-9 || p.size[2] < b.depth - 1e-9))
      fail(errors, type, "pick bounds must enclose the full static silhouette incl. roof");
    if (p.minProjectedCssPx < 44) fail(errors, type, "pick target below 44 css px accessibility floor");
  }
  const fr = desc.frontage;
  if (!fr || fr.face !== "+z" || !fr.bay) fail(errors, type, "frontage must declare +Z loading bay");
  else {
    const [ox, oz] = fr.bay.offset, [bw, bd] = fr.bay.size;
    if (Math.abs(ox) + bw / 2 > CELL / 2 + 1e-9 || Math.abs(oz) + bd / 2 > CELL / 2 + 1e-9)
      fail(errors, type, "loading bay outside the authored base cell");
    if (bw < SCALE_REFERENCES.truck.width - 1e-9) fail(errors, type, "bay narrower than a truck");
  }
  for (const pv of desc.pivots || []) {
    if (!pv.node || pv.node !== "pivot:" + pv.id) fail(errors, type, "pivot node must be named pivot:" + pv.id);
    if (!["x", "y", "z"].includes(pv.axis)) fail(errors, type, "pivot " + pv.id + " axis invalid");
    // ART-04 (#350): "lift" joins the motion vocabulary — a vertical travel in
    // world units driven by a declared real-sim signal (depot shutter:
    // nearest-truck-bay-distance), never a wall clock. Same envelope rules.
    if (!pv.motion || !["spin", "oscillate", "lift"].includes(pv.motion.kind)) fail(errors, type, "pivot " + pv.id + " motion invalid");
    if (pv.motion && pv.motion.kind === "lift" && (!isNum(pv.motion.travel) || pv.motion.travel <= 0 || typeof pv.motion.drive !== "string" || !pv.motion.drive))
      fail(errors, type, "pivot " + pv.id + " lift motion needs positive travel and a named drive signal");
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

// ---------------------------------------------------------------------------
// ART-05 (#351): vehicle/crew rig schema. Describes the ORIGINAL procedural rigs
// authored in src/world.js (createTruck/createForklift/createDrone/createWorker).
// Provenance: all geometry is authored in-code from the shared unit box/cylinder
// kit against public/reference/approved-yard.png + docs/design/tokens.json; no
// external/downloaded models, no archive/legacy geometry.
//
// Authority contract (honesty, #274/#384):
//  - truck is the ONLY rig with economic authority: its visible cargo mirrors the
//    simulation.js freight ledger (reserved -> onboard -> delivered) exactly.
//  - forklift/drone/worker are DECORATIVE yard crew. They never carry cargo,
//    never report freight capacity/production, and their placement/animation is
//    anchored to real observable sim state (truck proximity at the depot bay,
//    a building whose production timer actually advanced) or parked.
// ---------------------------------------------------------------------------
export const RIG_LOD = Object.freeze({detailMinCellPx: 26, blockMinCellPx: 12});
// LOD tier from the projected cell size (same orthographic contract as camera.js):
// 0 = full detail, 1 = silhouette block (greebles hidden), 2 = single proxy box.
export function rigLodTier(zoom, viewportHeight) {
  const px = cellProjectedCssPx(zoom, viewportHeight);
  return px >= RIG_LOD.detailMinCellPx ? 0 : px >= RIG_LOD.blockMinCellPx ? 1 : 2;
}

export const RIGS = Object.freeze({
  truck: Object.freeze({
    kind: "freight", authority: "simulation.js freight ledger (reserve/pickup/arrive)",
    decorative: false,
    identities: Object.freeze([
      {variant: "flatbed", livery: "rust", label: "RUST FLATBED"},
      {variant: "stake", livery: "orange", label: "AMBER STAKE-BED"},
      {variant: "tipper", livery: "body", label: "TEAL TIPPER"}
    ]),
    scale: {width: 1.2, height: 1.35, length: 2.05},
    wheelRadius: 0.3,
    pivots: ["pivot:wheels", "steer:fl", "steer:fr", "wheel:*", "pivot:beacon"],
    articulation: "wheel spin = travelled distance / radius; front-wheel steer from real route heading deltas; suspension bob proportional to real speed; beacon spin distance-driven. No free-running decorative work cycle.",
    cargo: "crates rebuilt only when v.cargo signature changes (real pickup/drop); tinted by RESOURCE_BY_ID color; empty truck carries no crate",
    lod: {proxy: {size: [1.2, 1.35, 2.05], center: [0, 0.625, 0.075]}, greebleGroup: "lod:greeble"},
    budget: {maxMeshes: 40, maxTriangles: 700}
  }),
  forklift: Object.freeze({
    kind: "decorative", authority: "none — decorative yard crew (#274)",
    decorative: true,
    scale: {width: 0.8, height: 1.1, length: 1.3},
    pivots: ["pivot:forks"],
    articulation: "fork lift is a pure function of the nearest REAL freight truck's distance to the depot bay approach (<=2 units raised 0.75, >=6 units lowered 0); never carries a load mesh",
    placement: "depot bay approach cell (machines cannot build there per gridOccupancy bayCells); visual only, never occupies a build site or road logic",
    lod: {proxy: {size: [0.8, 1.1, 1.3], center: [0, 0.55, 0]}, greebleGroup: "lod:greeble"},
    budget: {maxMeshes: 28, maxTriangles: 450}
  }),
  drone: Object.freeze({
    kind: "decorative", authority: "none — decorative yard crew (#274)",
    decorative: true,
    scale: {width: 1.0, height: 0.3, length: 1.0},
    pivots: ["pivot:rotor:0", "pivot:rotor:1", "pivot:rotor:2", "pivot:rotor:3"],
    articulation: "anchors above a building whose production timer ACTUALLY advanced this frame (real active cycle); hover bob/rotor spin are decorative flight on the sim clock, parked when no cycle is active or under reduced motion",
    lod: {proxy: {size: [1.0, 0.3, 1.0], center: [0, 0.15, 0]}, greebleGroup: "lod:greeble"},
    budget: {maxMeshes: 22, maxTriangles: 400}
  }),
  worker: Object.freeze({
    kind: "decorative", authority: "none — decorative yard crew (#274)",
    decorative: true,
    scale: {width: 0.62, height: 1.7, length: 0.34},
    pivots: ["pivot:arm-l", "pivot:arm-r"],
    articulation: "static posed scale reference; arm pivots named for future crew simulation, never driven as economic work",
    lod: {proxy: {size: [0.62, 1.7, 0.34], center: [0, 0.85, 0]}, greebleGroup: "lod:greeble"},
    budget: {maxMeshes: 16, maxTriangles: 250}
  })
});

export const rigDescriptor = (id) => RIGS[id] || null;

export function validateRig(id, desc = RIGS[id]) {
  const errors = [];
  if (!desc) {fail(errors, id, "no rig descriptor registered"); return {id, ok: false, errors};}
  if (!["freight", "decorative"].includes(desc.kind)) fail(errors, id, "kind must be freight|decorative");
  if (desc.decorative && desc.authority !== "none — decorative yard crew (#274)")
    fail(errors, id, "decorative rigs must declare zero simulation authority");
  if (!desc.decorative && desc.kind !== "freight") fail(errors, id, "non-decorative rigs must be freight authority");
  const s = desc.scale;
  if (!s || !isNum(s.width) || !isNum(s.height) || !isNum(s.length) || s.width <= 0 || s.height <= 0 || s.length <= 0)
    fail(errors, id, "scale must be positive width/height/length");
  else {
    if (s.width > CELL || s.length > CELL) fail(errors, id, "rig envelope exceeds one 3.5-unit cell");
    const ref = SCALE_REFERENCES[id];
    if (ref && (Math.abs(ref.width - s.width) > 1e-9 || Math.abs(ref.height - s.height) > 1e-9 || Math.abs(ref.length - s.length) > 1e-9))
      fail(errors, id, "scale disagrees with SCALE_REFERENCES." + id);
    if (id !== "worker" && s.height > SCALE_REFERENCES.worker.height)
      fail(errors, id, "yard crew/vehicle taller than the canonical 1.7-unit worker");
  }
  if (!Array.isArray(desc.pivots) || !desc.pivots.length) fail(errors, id, "rig must name its pivots");
  const lod = desc.lod;
  if (!lod || !lod.proxy || !Array.isArray(lod.proxy.size) || lod.proxy.size.length !== 3 || !lod.proxy.size.every(isNum))
    fail(errors, id, "lod proxy size missing");
  else if (s && (lod.proxy.size[0] < s.width - 1e-9 || lod.proxy.size[1] < s.height - 1e-9 || lod.proxy.size[2] < s.length - 1e-9))
    fail(errors, id, "lod proxy must enclose the rig silhouette");
  const budget = desc.budget;
  if (!budget || !Number.isInteger(budget.maxMeshes) || !Number.isInteger(budget.maxTriangles) ||
    budget.maxMeshes > PERFORMANCE_LIMITS.maxMeshesPerMachine || budget.maxTriangles > PERFORMANCE_LIMITS.maxTrianglesPerMachine)
    fail(errors, id, "budget missing or above global performance limits");
  return {id, ok: errors.length === 0, errors};
}

export function validateAllRigs() {
  const results = Object.keys(RIGS).map(id => validateRig(id));
  const errors = results.flatMap(r => r.errors);
  return {ok: errors.length === 0, schema: SCHEMA_ID, rigs: results, errors};
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

// ---------------------------------------------------------------------------
// ART-07 (#353): yard scenery — graded terrain dressing so a fresh save reads
// as an inhabited salvage yard on phone and desktop. Same pure-data contract
// as machines/rigs above: this DESCRIBES and VALIDATES the original procedural
// geometry built by src/world.js (yardSceneryPlan/buildScenery); it never
// replaces the playable world with an image and never imports archive/ code.
//
// Authority: scenery is decorative ONLY — no pick volumes (App.jsx picks by
// ground-plane cell, never mesh raycast), no build-site occupancy, no route
// blocking. Placement is proven against src/gridOccupancy.js in
// tests/yardScenery.test.mjs. Authority string mirrors the ART-05 yard-crew
// pattern (#274).
// ---------------------------------------------------------------------------
export const SCENERY_AUTHORITY = "none — decorative yard scenery (#274)";

// Placement zones, enforced by validateSceneryPlan(plan, seed) in world.js:
//  rock        — volumetric interior props stand ONLY on TERRAIN-rejected rock
//                cells (permanently unbuildable for machines), never on starter
//                footprint/bay cells. roadLine can still pave rock cells, so
//                sceneryConflicts(plan, g) hides any covered prop dynamically.
//  exterior    — beyond the parcel edge: machines reject BOUNDS and roadLine
//                refuses outside cells, so nothing can ever collide there.
//  any-nonroad — flush decals (top <= decalMaxHeight, below road top) may tint
//                any non-road cell; they are ground staining, not occupancy.
export const SCENERY = Object.freeze({
  schema: SCHEMA_ID,
  authority: SCENERY_AUTHORITY,
  decorative: true,
  zones: Object.freeze(["rock", "exterior", "any-nonroad"]),
  decalMaxHeight: 0.06,   // decal slab height; top = h/2 + 0.002 <= 0.06
  roadTop: 0.185,         // road slab top in world.js rebuild(); decals stay below
  truckHalfWidth: 0.6,    // route-clearance margin around INITIAL_ROADS rects
  kinds: Object.freeze({
    // render: "prop" = grouped meshes; "rubble" = shared InstancedMesh chunks;
    // "decal" = shared InstancedMesh flush ground tint (setColorAt).
    wreck: Object.freeze({render: "prop", zone: "rock", authority: SCENERY_AUTHORITY,
      scale: Object.freeze({width: 1.9, height: 1.25, length: 3.0}),
      materials: Object.freeze(["rust", "dark", "steel", "orange", "black"]),
      budget: Object.freeze({maxMeshes: 12, maxTriangles: 160}),
      pivot: "group origin at ground center; quarter-turn rotY keeps AABB inside one cell",
      note: "original crushed-hauler husk: tilted bed, crushed cab, axle stands, two remaining wheels"}),
    barrel: Object.freeze({render: "prop", zone: "rock", authority: SCENERY_AUTHORITY,
      scale: Object.freeze({width: 1.7, height: 1.0, length: 1.7}),
      materials: Object.freeze(["rust", "orange", "dark", "steel"]),
      budget: Object.freeze({maxMeshes: 8, maxTriangles: 160}),
      pivot: "group origin at ground center", note: "drum cluster with lid rings"}),
    outcrop: Object.freeze({render: "rubble", zone: "rock", authority: SCENERY_AUTHORITY,
      scale: Object.freeze({width: 3.1, height: 1.3, length: 3.1}),
      materials: Object.freeze(["rock", "sand"]),
      budget: Object.freeze({maxInstancesPerCell: 3}),
      pivot: "instance matrices centered per chunk, offsets <= 0.8 so chunks stay inside the cell",
      note: "weathered rock outcrop marking a permanently TERRAIN-rejected cell"}),
    scrapPile: Object.freeze({render: "rubble", zone: "rock", authority: SCENERY_AUTHORITY,
      scale: Object.freeze({width: 3.2, height: 1.4, length: 3.2}),
      materials: Object.freeze(["rust", "dark", "steel"]),
      budget: Object.freeze({maxInstancesPerCell: 6}),
      pivot: "instance matrices centered per chunk", note: "sorted scrap heap on a rock cell"}),
    container: Object.freeze({render: "prop", zone: "exterior", authority: SCENERY_AUTHORITY,
      scale: Object.freeze({width: 5.0, height: 2.0, length: 2.6}),
      materials: Object.freeze(["rust", "body", "dark", "steel"]),
      budget: Object.freeze({maxMeshes: 8, maxTriangles: 100}),
      pivot: "group origin at ground center", note: "stacked freight container with ribs and door"}),
    shed: Object.freeze({render: "prop", zone: "exterior", authority: SCENERY_AUTHORITY,
      scale: Object.freeze({width: 9.6, height: 8.7, length: 6.15}),
      materials: Object.freeze(["body", "roof", "dark", "steel", "rust", "black"]),
      budget: Object.freeze({maxMeshes: 14, maxTriangles: 220}),
      pivot: "group origin at ground center", note: "maintenance shed; height includes rust stack"}),
    silo: Object.freeze({render: "prop", zone: "exterior", authority: SCENERY_AUTHORITY,
      scale: Object.freeze({width: 8.0, height: 5.9, length: 2.4}),
      materials: Object.freeze(["rust", "steel", "roof", "orange"]),
      budget: Object.freeze({maxMeshes: 10, maxTriangles: 320}),
      pivot: "group origin at ground center", note: "silo triad with caps and hazard ladders"}),
    pipeRack: Object.freeze({render: "prop", zone: "exterior", authority: SCENERY_AUTHORITY,
      scale: Object.freeze({width: 6.7, height: 4.9, length: 2.45}),
      materials: Object.freeze(["rust", "roof", "steel", "orange"]),
      budget: Object.freeze({maxMeshes: 10, maxTriangles: 160}),
      pivot: "group origin at ground center", note: "pipe rack with grille and orange vent mast"}),
    floodlight: Object.freeze({render: "prop", zone: "exterior", authority: SCENERY_AUTHORITY,
      scale: Object.freeze({width: 0.85, height: 8.3, length: 0.75}),
      materials: Object.freeze(["dark", "orange"]),
      budget: Object.freeze({maxMeshes: 3, maxTriangles: 80, maxPointLights: 1}),
      pivot: "group origin at ground center", note: "yard floodlight mast; one of four PointLights"}),
    gatePost: Object.freeze({render: "prop", zone: "exterior", authority: SCENERY_AUTHORITY,
      scale: Object.freeze({width: 0.34, height: 2.6, length: 0.34}),
      materials: Object.freeze(["orange", "dark", "black"]),
      budget: Object.freeze({maxMeshes: 4, maxTriangles: 48}),
      pivot: "group origin at ground center", note: "hazard-striped gate post at the yard entrance"}),
    fence: Object.freeze({render: "rubble", zone: "exterior", authority: SCENERY_AUTHORITY,
      scale: Object.freeze({width: 0.24, height: 2.3, length: 6.8}),
      materials: Object.freeze(["rust", "dark"]),
      budget: Object.freeze({maxInstances: 120}),
      pivot: "instance matrices: posts + rails", note: "perimeter fence with gate gap |x| <= 7"}),
    boulder: Object.freeze({render: "rubble", zone: "exterior", authority: SCENERY_AUTHORITY,
      scale: Object.freeze({width: 2.5, height: 1.6, length: 2.5}),
      materials: Object.freeze(["rock", "sand"]),
      budget: Object.freeze({maxInstances: 60}),
      pivot: "instance matrices on a square belt beyond the parcel edge", note: "scattered yard-edge boulders"}),
    decal: Object.freeze({render: "decal", zone: "any-nonroad", authority: SCENERY_AUTHORITY,
      scale: Object.freeze({width: 3.3, height: 0.05, length: 3.3}),
      maxHeight: 0.05,
      materials: Object.freeze(["sand", "rock", "dark", "orange", "rust"]),
      budget: Object.freeze({maxInstances: 700}),
      pivot: "instance matrices flush on ground (y = h/2 + 0.002)",
      note: "bench tints, pad dust, maintenance-alley gravel + tire tracks, bay chevrons, oil stains"})
  }),
  budget: Object.freeze({
    maxPropMeshesTotal: 260,
    maxPropTrianglesTotal: 4200,
    maxRubbleInstances: 420,
    maxDecalInstances: 700,
    maxPointLights: PERFORMANCE_LIMITS.pointLightsMax
  })
});

export function sceneryDescriptor(kind) {
  return SCENERY.kinds[kind];
}

export function validateSceneryKind(kind, desc = SCENERY.kinds[kind]) {
  const errors = [];
  if (!desc) {fail(errors, kind, "no scenery descriptor registered"); return {kind, ok: false, errors};}
  if (desc.authority !== SCENERY_AUTHORITY) fail(errors, kind, "scenery must declare zero simulation authority");
  if (!["prop", "rubble", "decal"].includes(desc.render)) fail(errors, kind, "render must be prop|rubble|decal");
  if (!SCENERY.zones.includes(desc.zone)) fail(errors, kind, "zone must be rock|exterior|any-nonroad");
  if (desc.render === "prop" && desc.zone === "any-nonroad") fail(errors, kind, "volumetric props may not use the decal zone");
  const s = desc.scale;
  if (!s || !isNum(s.width) || !isNum(s.height) || !isNum(s.length) || s.width <= 0 || s.height <= 0 || s.length <= 0)
    fail(errors, kind, "scale must be positive width/height/length");
  if (desc.render === "decal" && s && s.height > SCENERY.decalMaxHeight)
    fail(errors, kind, "decal height above flush limit " + SCENERY.decalMaxHeight);
  if (!Array.isArray(desc.materials) || !desc.materials.length) fail(errors, kind, "materials list missing");
  else for (const m of desc.materials) if (!MATERIALS[m]) fail(errors, kind, "unknown material id " + m);
  const b = desc.budget;
  if (!b) fail(errors, kind, "budget missing");
  else if (desc.render === "prop") {
    if (!Number.isInteger(b.maxMeshes) || !Number.isInteger(b.maxTriangles) ||
      b.maxMeshes > PERFORMANCE_LIMITS.maxMeshesPerMachine || b.maxTriangles > PERFORMANCE_LIMITS.maxTrianglesPerMachine)
      fail(errors, kind, "prop budget missing or above global performance limits");
    if ((b.maxPointLights || 0) > 1) fail(errors, kind, "at most one point light per scenery prop");
  } else if (!Number.isInteger(b.maxInstances || b.maxInstancesPerCell))
    fail(errors, kind, "instance budget missing");
  if (!desc.pivot) fail(errors, kind, "pivot ownership must be declared");
  return {kind, ok: errors.length === 0, errors};
}

export function validateAllScenery() {
  const results = Object.keys(SCENERY.kinds).map(kind => validateSceneryKind(kind));
  const errors = results.flatMap(r => r.errors);
  const budget = SCENERY.budget;
  if (budget.maxPointLights > PERFORMANCE_LIMITS.pointLightsMax) errors.push("scenery point-light budget above global limit");
  if (budget.maxDecalInstances > SCENERY.kinds.decal.budget.maxInstances) errors.push("decal budget disagrees with kind budget");
  return {ok: errors.length === 0, schema: SCHEMA_ID, scenery: results, errors};
}
