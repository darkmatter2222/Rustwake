/**
 * Rustwake V2 — explicit world grid occupancy and buildable-terrain validation (#370).
 *
 * Pure, deterministic, renderer-free. The simulation is the only economic
 * authority: checkSite() NEVER mutates game state or bank stock, so free
 * hover/selection is always safe. buildAt() in simulation.js spends exactly
 * once, and only after this validator returns ok.
 *
 * Coordinate contract (docs/engineering/ARCHITECTURE.md): X east, Y up, Z south.
 * Cell (x,z) centers at world ((x-12+0.5)*CELL, 0, (z-12+0.5)*CELL).
 * A building anchor (x,z) is the footprint's min-corner cell; rotation r∈{0,1,2,3}
 * turns the loading bay SOUTH→EAST→NORTH→WEST and swaps w/d for odd r.
 */
import {WORLD_SIZE,CELL,BLUEPRINTS,footprintOf,INITIAL_ROADS,STARTER_BUILDINGS,TIERS} from "./content.js";

export const SURVEY_MIN=1;               // outer ring of the parcel is unsurveyed
export const SURVEY_MAX=WORLD_SIZE-2;
export const PARCEL_SIZE=12;             // 24×24 land = four 12×12 deed parcels
export const ROAD_REACH=3;               // loading bay must reach a road within 3 cells
export const PARCEL_NAMES=["Cinder Yard","East Bench","South Flats","Far Works"];

export const key=(x,z)=>x+","+z;
export const cellOf=(k)=>k.split(",").map(Number);
export const inside=(x,z)=>Number.isInteger(x)&&Number.isInteger(z)&&x>=0&&z>=0&&x<WORLD_SIZE&&z<WORLD_SIZE;
export const normalizeRot=(rot)=>Number.isInteger(rot)?((rot%4)+4)%4:0;
export const surveyed=(x,z)=>inside(x,z)&&x>=SURVEY_MIN&&x<=SURVEY_MAX&&z>=SURVEY_MIN&&z<=SURVEY_MAX;
export const parcelId=(x,z)=>(x>=PARCEL_SIZE?1:0)+(z>=PARCEL_SIZE?2:0);

// Land deeds expand with real industrial rank (production milestones), never
// with a placeholder currency. Tier 0 owns the north half; tier 1 adds the
// South Flats; tier 2 claims the Far Works.
export function ownedParcels(g){
 const tier=Number(g?.tier)||0;
 return tier>=2?[0,1,2,3]:tier>=1?[0,1,2]:[0,1];
}

// Deterministic per-seed terrain. Same LCG constants as the renderer scenery.
// kind: "pad" (h0, graded), "bench" (h1, flat raised ground), "rock" (h2, never buildable).
// Initial road corridors and starter pads are always graded flat so the first
// yard always has legal buildable frontage, on every seed.
const terrainCache=new Map();
export function terrainFor(seed){
 const s=Number(seed)>>>0;
 if(terrainCache.has(s))return terrainCache.get(s);
 let state=s;const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const cells=new Map();
 for(let z=0;z<WORLD_SIZE;z++)for(let x=0;x<WORLD_SIZE;x++){
  const r=rand();
  const kind=r<.05?"rock":r<.18?"bench":"pad";
  cells.set(key(x,z),{kind,h:kind==="rock"?2:kind==="bench"?1:0});
 }
 const grade=(x,z)=>{if(inside(x,z))cells.set(key(x,z),{kind:"pad",h:0});};
 for(const tile of INITIAL_ROADS){
  const [x,z]=cellOf(tile);
  grade(x,z);grade(x-1,z);grade(x+1,z);grade(x,z-1);grade(x,z+1);
 }
 for(const b of STARTER_BUILDINGS){
  for(const c of footprintCells(b.type,b.x,b.z,b.rot||0))grade(c.x,c.z);
 }
 terrainCache.set(s,cells);
 return cells;
}
export const terrainAt=(seed,x,z)=>terrainFor(seed).get(key(x,z))||{kind:"pad",h:0};

export function footprintDims(type,rot=0){
 const {w,d}=footprintOf(type);
 return normalizeRot(rot)%2===1?{w:d,d:w}:{w,d};
}
// Exact occupied cells, row-major, anchor = min corner. Rotation keeps the
// anchor cell occupied and swaps the extent for odd quarter turns.
export function footprintCells(type,x,z,rot=0){
 const r=normalizeRot(rot),{w,d}=footprintDims(type,r),cells=[];
 for(let dz=0;dz<d;dz++)for(let dx=0;dx<w;dx++)cells.push({x:x+dx,z:z+dz});
 return cells;
}
// Ground-projected loading bay: the approach row just outside the footprint on
// the facing side. Roads may cross a bay (that is frontage); machines may not.
const FACING=[[0,1],[1,0],[0,-1],[-1,0]]; // rot 0..3 → +Z,+X,-Z,-X
export const facingName=(rot)=>["SOUTH","EAST","NORTH","WEST"][normalizeRot(rot)];
export function bayCells(type,x,z,rot=0){
 const r=normalizeRot(rot),{w,d}=footprintDims(type,r),[fx,fz]=FACING[r],cells=[];
 if(fz!==0){const bz=fz>0?z+d:z-1;for(let dx=0;dx<w;dx++)cells.push({x:x+dx,z:bz});}
 else{const bx=fx>0?x+w:x-1;for(let dz=0;dz<d;dz++)cells.push({x:bx,z:z+dz});}
 return cells;
}
export function buildingAt(g,x,z){
 return g.buildings.find(b=>footprintCells(b.type,b.x,b.z,b.rot||0).some(c=>c.x===x&&c.z===z))||null;
}

// Exact 3D footprint/pivot for the renderer and for tests. The group pivot is
// the footprint center at ground level; local geometry is authored at base
// (unrotated) dims and scaled by base w/d, then rotated rot*90° about Y.
export function worldFootprint(type,x,z,rot=0){
 const r=normalizeRot(rot),base=footprintOf(type),dims=footprintDims(type,r);
 const ox=(x-WORLD_SIZE/2+.5)*CELL,oz=(z-WORLD_SIZE/2+.5)*CELL;
 return {
  base,dims,rotationY:r*Math.PI/2,
  pivot:{x:ox+(dims.w-1)*CELL/2,y:0,z:oz+(dims.d-1)*CELL/2},
  min:{x:ox-CELL/2,y:0,z:oz-CELL/2},
  max:{x:ox+(dims.w-1)*CELL+CELL/2,y:0,z:oz+(dims.d-1)*CELL+CELL/2},
  size:{x:dims.w*CELL,z:dims.d*CELL}
 };
}

const fail=(code,reason)=>({ok:false,code,reason});
/**
 * Pure site validation. Deterministic order; each rejection carries an exact
 * machine code and player-facing reason. Never touches bank stock or state.
 */
export function checkSite(g,type,x,z,rot=0){
 const def=BLUEPRINTS[type];
 if(!def)return fail("UNKNOWN","Unknown blueprint");
 const r=normalizeRot(rot);
 const cells=footprintCells(type,x,z,r),bay=bayCells(type,x,z,r);
 const rank=TIERS.find(t=>t.unlocks.includes(type));
 if(!rank||g.tier<rank.id)return fail("LOCKED","Unlock this blueprint by growing your industrial rank");
 if(cells.some(c=>!inside(c.x,c.z)))return fail("BOUNDS","Beyond the surveyed frontier");
 if(cells.some(c=>!surveyed(c.x,c.z)))return fail("UNSURVEYED","Site is unsurveyed — stay inside the surveyed frontier");
 const owned=ownedParcels(g);
 if(cells.some(c=>!owned.includes(parcelId(c.x,c.z))))return fail("PARCEL","Parcel is not claimed — advance your industrial rank to expand");
 const terrain=terrainFor(g.seed);
 if(cells.some(c=>terrain.get(key(c.x,c.z))?.kind==="rock"))return fail("TERRAIN","Solid rock outcrop — machines need graded ground");
 const heights=cells.map(c=>terrain.get(key(c.x,c.z))?.h??0);
 if(Math.max(...heights)-Math.min(...heights)>0)return fail("SLOPE","Uneven ground — the footprint must sit level");
 const roads=new Set(g.roads);
 for(const c of cells){
  const hit=buildingAt(g,c.x,c.z);
  if(hit)return fail("COLLISION","A machine occupies this site");
  if(roads.has(key(c.x,c.z)))return fail("ROAD","Move the site off the road");
 }
 // Bay clearance is symmetric: your bay stays clear of machines, and you never
 // pave a machine into someone else's bay approach.
 for(const c of bay)if(inside(c.x,c.z)&&buildingAt(g,c.x,c.z))return fail("BAY","Loading bay blocked — keep the approach clear of machines");
 for(const b of g.buildings){
  const otherBay=bayCells(b.type,b.x,b.z,b.rot||0);
  if(cells.some(c=>otherBay.some(o=>o.x===c.x&&o.z===c.z)))return fail("BAY","Loading bay blocked — keep the approach clear of machines");
 }
 let reach=Infinity;
 for(const c of bay)for(const tile of g.roads){
  const [rx,rz]=cellOf(tile);
  reach=Math.min(reach,Math.abs(rx-c.x)+Math.abs(rz-c.z));
 }
 if(reach>ROAD_REACH)return fail("FRONTAGE","No road frontage — lay a road within "+ROAD_REACH+" cells of the loading bay");
 for(const [id,n] of Object.entries(def.cost))if(Math.max(0,Number(g.bank?.[id]||0))+1e-7<n)return fail("FUNDS","Not enough materials — review the blueprint costs");
 return {ok:true,code:"OK",cells,bay,dims:footprintDims(type,r),rot:r};
}
