// RUSTWAKE V2 — canonical content registry; no legacy UI coupling.
export const WORLD_SIZE = 24;
export const CELL = 3.5;
export const SAVE_KEY = "rustwake:living-world:v2";

export const RESOURCES = [
  {id:"credits",name:"Credits",unit:"CR",group:"currency",color:"#f5ba76"},
  {id:"scrap",name:"Scrap",unit:"SC",group:"material",color:"#a7b1a5"},
  {id:"iron",name:"Ferrous ore",unit:"FE",group:"material",color:"#8c9b9d"},
  {id:"copper",name:"Copper",unit:"CU",group:"material",color:"#c47e55"},
  {id:"stone",name:"Aggregate",unit:"AG",group:"material",color:"#adb0a2"},
  {id:"fuel",name:"Diesel",unit:"FU",group:"material",color:"#db9a4a"},
  {id:"water",name:"Water",unit:"H₂O",group:"material",color:"#83bac4"},
  {id:"steel",name:"Steel",unit:"ST",group:"product",color:"#b9c6cb"},
  {id:"alloy",name:"Alloy",unit:"AL",group:"product",color:"#c9caa8"},
  {id:"gears",name:"Mechanical parts",unit:"ME",group:"product",color:"#b6baba"},
  {id:"circuits",name:"Circuits",unit:"CI",group:"product",color:"#77c7b3"},
  {id:"data",name:"Research data",unit:"DT",group:"currency",color:"#82d2cb"},
  {id:"relics",name:"Relics",unit:"RE",group:"currency",color:"#d8b4e7"},
  {id:"influence",name:"Influence",unit:"IN",group:"currency",color:"#c4adc8"},
  {id:"shards",name:"Echo shards",unit:"ES",group:"prestige",color:"#da8b98"},
  {id:"charters",name:"Land charters",unit:"LC",group:"prestige",color:"#b1a8d7"},
  {id:"renown",name:"Faction renown",unit:"RN",group:"prestige",color:"#b8e3ad"},
];

export const INITIAL_BANK = {
  credits:1800,scrap:220,iron:90,copper:45,stone:220,fuel:110,water:90,
  steel:20,alloy:0,gears:0,circuits:0,data:15,relics:0,influence:0,shards:0,charters:0,renown:0
};

export const BUILDINGS = [
 {id:"salvager",name:"Scrap Extractor",tag:"HARVEST",family:"extraction",description:"Rakes salvage into reusable scrap, ferrous ore and copper fragments.",cost:{credits:180,scrap:28,stone:12},cycle:3.6,inputs:{},outputs:{scrap:9,iron:3,copper:1},power:1,color:"#a5b4b4",accent:"#e9a05c"},
 {id:"depot",name:"Freight Depot",tag:"LOGISTICS",family:"logistics",description:"The shared material bank. Trucks load, unload and reserve cargo here.",cost:{credits:200,scrap:35,stone:24},cycle:0,inputs:{},outputs:{},power:0,color:"#718e95",accent:"#f1b577"},
 {id:"furnace",name:"Induction Furnace",tag:"PROCESS",family:"processing",description:"Smelts ferrous ore into premium steel. Needs diesel and truck deliveries.",cost:{credits:360,iron:24,scrap:50,stone:20},cycle:5.5,inputs:{iron:5,fuel:2},outputs:{steel:4},power:3,color:"#a2afb1",accent:"#e87b4e"},
 {id:"crusher",name:"Crusher",tag:"PROCESS",family:"processing",description:"Compacts scrap into high-value ferrous feedstock.",cost:{credits:260,scrap:46,stone:28},cycle:4,inputs:{scrap:10},outputs:{iron:6,stone:2},power:2,color:"#88959b",accent:"#d9a069"},
 {id:"refinery",name:"Fuel Refinery",tag:"PROCESS",family:"processing",description:"Refines recovered fuel from salvage; expands vehicle uptime.",cost:{credits:520,scrap:70,steel:10},cycle:7,inputs:{scrap:8,water:2},outputs:{fuel:6},power:3,color:"#738d91",accent:"#d8a56b"},
 {id:"generator",name:"Turbine Generator",tag:"POWER",family:"utility",description:"Provides power for all active machines; visible blades reflect plant load.",cost:{credits:240,scrap:44,iron:18},cycle:0,inputs:{},outputs:{},power:-12,color:"#899da0",accent:"#7ec3b7"},
 {id:"foundry",name:"Alloy Foundry",tag:"INDUSTRY",family:"processing",description:"Combines steel and copper into durable high-tier alloy.",cost:{credits:760,steel:34,copper:28},cycle:8,inputs:{steel:4,copper:3,fuel:1},outputs:{alloy:3},power:4,color:"#7d9095",accent:"#f0a469"},
 {id:"fabricator",name:"Parts Fabricator",tag:"INDUSTRY",family:"processing",description:"Makes gears and circuits for advanced factories and defense.",cost:{credits:950,steel:30,copper:26},cycle:8,inputs:{steel:3,copper:3},outputs:{gears:3,circuits:1},power:5,color:"#79939b",accent:"#8cc9b9"},
 {id:"research",name:"Signal Observatory",tag:"RESEARCH",family:"science",description:"Converts circuit boards and power into research data.",cost:{credits:1250,steel:46,circuits:8},cycle:13,inputs:{circuits:2},outputs:{data:5},power:4,color:"#7d9eb0",accent:"#8bd7d8"},
 {id:"market",name:"Trade Exchange",tag:"ECONOMY",family:"logistics",description:"Sell surplus materials into the growing inter-faction economy.",cost:{credits:650,steel:16,stone:22},cycle:0,inputs:{},outputs:{},power:0,color:"#9f967e",accent:"#e4b97e"},
 {id:"turret",name:"Watchtower",tag:"DEFENSE",family:"defense",description:"The first modular defense platform, ready for future raid systems.",cost:{credits:780,steel:25,gears:6},cycle:0,inputs:{},outputs:{},power:2,color:"#8d9898",accent:"#d99f7e"},
 {id:"crane",name:"Heavy Yard Crane",tag:"UTILITY",family:"utility",description:"Animated cargo hoist on a 2×3 pad; can anchor a future vehicle construction bay.",cost:{credits:880,steel:36,gears:12},cycle:0,inputs:{},outputs:{},power:1,footprint:{w:2,d:3},color:"#d19c5f",accent:"#f4c67f"}
];

export const BLUEPRINTS = Object.fromEntries(BUILDINGS.map(b=>[b.id,b]));
// Deterministic footprint contract (#370): every blueprint occupies w×d cells.
// Absent footprint means the legacy 1×1 pad. Rotation never changes the anchor.
export const footprintOf=(type)=>BLUEPRINTS[type]?.footprint||{w:1,d:1};

// Starter yard layout is canonical content data so terrain grading, occupancy
// and the simulation all agree on the same deterministic first frame.
export const STARTER_BUILDINGS = [
 {id:1,type:"salvager",x:7,z:9,level:1,remaining:0,inventory:{},timer:0},
 {id:2,type:"depot",x:13,z:9,level:1,remaining:0,inventory:{},timer:0},
 {id:3,type:"generator",x:7,z:16,level:1,remaining:0,inventory:{},timer:0},
 {id:4,type:"furnace",x:16,z:13,level:1,remaining:0,inventory:{iron:10,fuel:7},timer:0},
 {id:5,type:"crane",x:15,z:5,rot:0,level:1,remaining:0,inventory:{},timer:0},
 {id:6,type:"market",x:15,z:18,level:1,remaining:0,inventory:{},timer:0},
];
const starterRoads=()=>{
 const set=new Set();
 const h=(z,x0,x1)=>{for(let x=x0;x<=x1;x++)set.add(x+","+z);};
 const v=(x,z0,z1)=>{for(let z=z0;z<=z1;z++)set.add(x+","+z);};
 h(8,5,19);h(12,5,19);h(17,5,19);v(11,4,20);v(5,8,17);v(19,8,17);
 return [...set];
};
export const INITIAL_ROADS = starterRoads();
export const ROAD_KINDS = [
  {id:"road",name:"Asphalt road",description:"Two-way traffic lane; logistics trucks follow connected segments.",cost:{stone:3,credits:4}},
  {id:"heavy",name:"Heavy haul",description:"Future high-capacity lane; currently uses road rules.",cost:{stone:5,credits:8}}
];
export const TIERS = [
 {id:0,name:"CINDER YARD",needs:0,unlocks:["salvager","depot","furnace","crusher","generator","crane"]},
 {id:1,name:"INDUSTRIAL AGE",needs:60,unlocks:["refinery","market","foundry"]},
 {id:2,name:"MECHANICAL ERA",needs:175,unlocks:["fabricator","research","turret"]},
];
export const RESEARCH = [
 {id:"crew",name:"Field crew training",desc:"Increases production throughput by 12%.",cost:{data:12,credits:200}},
 {id:"fleet",name:"Efficient dispatch",desc:"Raises vehicle speed by 18%.",cost:{data:26,credits:500}},
 {id:"smelt",name:"Closed-loop smelting",desc:"Increases production throughput by another 12%.",cost:{data:48,credits:800}},
 {id:"charter",name:"Frontier charter",desc:"Opens later outpost and region progression.",cost:{data:100,credits:1600}}
];
export const FACTIONS=[
 {id:"cinders",name:"Cinder Union",desc:"Industrial salvagers and manufacturers.",color:"#e6a063"},
 {id:"survey",name:"Glass Survey",desc:"Data hunters and artifact prospectors.",color:"#8bc7c6"},
 {id:"wardens",name:"Iron Wardens",desc:"Convoy security and territorial defenders.",color:"#c6a0a2"}
];
export const RESOURCE_BY_ID = Object.fromEntries(RESOURCES.map(r=>[r.id,r]));
export function amount(value){return Math.abs(value)>=1000000?(value/1000000).toFixed(2)+"m":Math.abs(value)>=10000?(value/1000).toFixed(1)+"k":Math.floor(value).toLocaleString();}
