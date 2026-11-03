// Pure deterministic simulation. No DOM, React, networking, or wall clock reads.
export const VERSION = 1;
export const OFFLINE_CAP = 8 * 60 * 60;
export const KEYS = ['credits','scrap','steel','copper','circuits','research','cores'] as const;
export type Resource = typeof KEYS[number];
export type Inventory = Record<Resource, number>;
export type Kind = 'dock'|'sorter'|'smelter'|'fabricator'|'lab';
export interface Machine { id:number; kind:Kind; x:number; y:number; level:number; enabled:boolean }
export const BLUEPRINTS: Record<Kind,{name:string;short:string;color:string;cost:number;input:Partial<Inventory>;output:Partial<Inventory>;description:string}> = {
 dock:{name:'Salvage dock',short:'DRN',color:'#6bc6cc',cost:45,input:{},output:{scrap:1.5},description:'Autonomous drones recover mixed scrap.'},
 sorter:{name:'Scrap sorter',short:'SRT',color:'#dbb276',cost:65,input:{scrap:2},output:{steel:0.65,copper:0.35},description:'Separates scrap into usable metals.'},
 smelter:{name:'Alloy furnace',short:'FRN',color:'#f18755',cost:95,input:{steel:0.5},output:{credits:2.5},description:'Refines steel into export-grade alloy. Auto-sells output.'},
 fabricator:{name:'Circuit press',short:'FAB',color:'#a69be0',cost:140,input:{steel:0.25,copper:0.5},output:{circuits:0.2},description:'Turns recovered metals into precision electronics.'},
 lab:{name:'Signal lab',short:'LAB',color:'#79b7e0',cost:170,input:{circuits:0.1},output:{research:0.15},description:'Decodes old-world technology from recovered circuits.'}
};
export const SECTORS = [
 {name:'The Rustbelt',faction:'Unclaimed territory',duration:60,cost:20,power:1,description:'Abandoned commuter wrecks. A safe first recovery.',reward:{scrap:90,credits:45,research:2}},
 {name:'Helix Freight Terminal',faction:'Helix Combine',duration:180,cost:80,power:4,description:'Corporate sentries guard high-grade electronics.',reward:{copper:60,circuits:15,credits:150,research:12}},
 {name:'The Silent Array',faction:'Reclamation Authority',duration:360,cost:180,power:8,description:'An active machine network beneath the dead city.',reward:{steel:130,circuits:40,credits:400,research:35}}
];
const RECIPES = Object.fromEntries(Object.entries(BLUEPRINTS).map(([kind,b])=>[kind,{input:Object.entries(b.input) as [Resource,number][],output:Object.entries(b.output) as [Resource,number][]}])) as Record<Kind,{input:[Resource,number][];output:[Resource,number][]}>;
export interface State {version:1; resources:Inventory; machines:Machine[]; nextId:number; time:number; savedAt:number; efficiency:number; armor:number; lifetimeCredits:number; expeditions:number; mission:null|{sector:number;remaining:number}; log:string[]; claimed:number[]}
export function initial(now=Date.now()):State {return {version:1,resources:{credits:180,scrap:20,steel:12,copper:5,circuits:0,research:0,cores:0},machines:[{id:1,kind:'dock',x:1,y:2,level:1,enabled:true},{id:2,kind:'sorter',x:3,y:2,level:1,enabled:true},{id:3,kind:'smelter',x:5,y:2,level:1,enabled:true}],nextId:4,time:0,savedAt:now,efficiency:0,armor:0,lifetimeCredits:0,expeditions:0,mission:null,log:['Recovery license issued. Welcome to Yard 07.'],claimed:[]};}
export function record(s:State,message:string){s.log=[message,...s.log].slice(0,12);}
export function power(s:State){return 1+s.armor*2+s.machines.filter(m=>m.kind==='dock').reduce((n,m)=>n+m.level-1,0);}
export function upgradeCost(m:Machine){return Math.floor(BLUEPRINTS[m.kind].cost * 0.8 * 1.65 ** (m.level-1));}
export function multiplier(s:State,m:Machine){return m.level*(1+s.efficiency*0.15+s.resources.cores*0.05);}
export function tick(s:State){
 for(const m of s.machines){if(!m.enabled)continue;const b=RECIPES[m.kind],scale=multiplier(s,m);let fraction=1;
  for(const [key,value] of b.input)fraction=Math.min(fraction,s.resources[key as Resource]/(value*scale));
  for(const [key,value] of b.input)s.resources[key as Resource]=Math.max(0,s.resources[key as Resource]-value*scale*fraction);
  for(const [key,value] of b.output){const n=value*scale*fraction;s.resources[key as Resource]+=n;if(key==='credits')s.lifetimeCredits+=n;}
 }
 s.time++;
 if(s.mission&&--s.mission.remaining<=0){const sector=SECTORS[s.mission.sector];for(const [k,v] of Object.entries(sector.reward)){s.resources[k as Resource]+=v;if(k==='credits')s.lifetimeCredits+=v;}s.expeditions++;record(s,`Recovery complete: ${sector.name}. Cargo delivered.`);s.mission=null;}
}
export function advance(s:State,seconds:number){const steps=Math.min(OFFLINE_CAP,Math.max(0,Math.floor(seconds)));for(let i=0;i<steps;i++)tick(s);return steps;}
export function build(s:State,kind:Kind,x:number,y:number):string {
 if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||x>=10||y<0||y>=8)return 'Outside your yard.';
 if(s.machines.some(m=>m.x===x&&m.y===y))return 'This plot is occupied.';
 const b=BLUEPRINTS[kind];if(s.resources.credits<b.cost)return 'Not enough credits.';
 s.resources.credits-=b.cost;s.machines.push({id:s.nextId++,kind,x,y,level:1,enabled:true});record(s,`${b.name} commissioned.`);return '';
}
export function upgrade(s:State,id:number){const m=s.machines.find(m=>m.id===id);if(!m)return 'Machine not found.';const cost=upgradeCost(m);if(s.resources.credits<cost)return 'Not enough credits.';if(m.level>=25)return 'Prototype level cap reached.';s.resources.credits-=cost;m.level++;return '';}
export function dispatch(s:State,index:number){const sector=SECTORS[index];if(!sector)return 'Unknown sector.';if(s.mission)return 'Your expedition team is already deployed.';if(power(s)<sector.power)return 'Research escort armor to meet the threat rating.';if(s.resources.credits<sector.cost)return 'Not enough credits.';s.resources.credits-=sector.cost;s.mission={sector:index,remaining:sector.duration};record(s,`Team dispatched to ${sector.name}.`);return '';}
export function research(s:State,kind:'efficiency'|'armor'){const cost=(s[kind]+1)*10;if(s.resources.research<cost)return 'Not enough research data.';if(s[kind]>=20)return 'Prototype research cap reached.';s.resources.research-=cost;s[kind]++;return '';}
export const CONTRACTS=[{name:'First shift',description:'Earn 100 credits from production and expeditions.',target:100,reward:60},{name:'Industrial heartbeat',description:'Earn 500 lifetime credits.',target:500,reward:150},{name:'Reclaim the district',description:'Earn 2,000 lifetime credits.',target:2000,reward:500}];
export function claim(s:State,i:number){const c=CONTRACTS[i];if(!c||s.claimed.includes(i)||s.lifetimeCredits<c.target)return 'Contract not ready.';s.claimed.push(i);s.resources.credits+=c.reward;record(s,`Contract settled: ${c.name}.`);return '';}
export function validate(value:unknown):value is State {
 if(!value||typeof value!=='object')return false;const s=value as State;const nonnegative=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<1e15;
 if(s.version!==VERSION||!s.resources||!KEYS.every(k=>nonnegative(s.resources[k]))||!Array.isArray(s.machines)||s.machines.length>80)return false;
 if(!['nextId','time','savedAt','efficiency','armor','lifetimeCredits','expeditions'].every(k=>nonnegative(s[k as keyof State])))return false;
 if(!Number.isInteger(s.efficiency)||s.efficiency>20||!Number.isInteger(s.armor)||s.armor>20)return false;
 const occupied=new Set<string>(),ids=new Set<number>();
 for(const m of s.machines){if(!m||!Object.hasOwn(BLUEPRINTS,m.kind)||!Number.isInteger(m.id)||m.id<1||m.id>=s.nextId||ids.has(m.id)||!Number.isInteger(m.x)||m.x<0||m.x>=10||!Number.isInteger(m.y)||m.y<0||m.y>=8||!Number.isInteger(m.level)||m.level<1||m.level>25||typeof m.enabled!=='boolean')return false;const pos=`${m.x},${m.y}`;if(occupied.has(pos))return false;occupied.add(pos);ids.add(m.id);}
 if(!Array.isArray(s.log)||s.log.length>12||!s.log.every(l=>typeof l==='string'&&l.length<300)||!Array.isArray(s.claimed)||!s.claimed.every(i=>Number.isInteger(i)&&i>=0&&i<CONTRACTS.length))return false;
 if(s.mission!==null&&(!s.mission||!Number.isInteger(s.mission.sector)||!SECTORS[s.mission.sector]||!Number.isInteger(s.mission.remaining)||s.mission.remaining<=0||s.mission.remaining>SECTORS[s.mission.sector].duration))return false;
 return true;
}
export function restore(raw:string,now:number){const parsed:unknown=JSON.parse(raw);if(!validate(parsed))throw new Error('Invalid or unsupported save.');const state=parsed;const elapsed=advance(state,(now-state.savedAt)/1000);state.savedAt=Math.max(state.savedAt,now);return {state,elapsed};}
