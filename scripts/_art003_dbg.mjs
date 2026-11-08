import { PARTS } from "../src/game/renderer/sprites";
const ids = ["dock","sorter","furnace","wireMill","signalLab","drone"];
const gu = (parts) => { const g = new Array(1024).fill(5); for (const t of parts) { const s = Math.min(4, Math.floor(t[4]/4)); const x0=Math.max(0,Math.floor(t[0]+16)),x1=Math.min(32,Math.ceil(t[0]+t[2]+16)),y0=Math.max(0,Math.floor(t[1]+16)),y1=Math.min(32,Math.ceil(t[1]+t[3]+16)); for(let y=y0;y<y1;y+=1) for(let x=x0;x<x1;x+=1) g[y*32+x]=s; } return g; };
const pct=(a,b)=>{let d=0;for(let i=0;i<a.length;i+=1) if(a[i]!==b[i]) d+=1;return +((100*d)/a.length).toFixed(1);};
const G=new Map(ids.map(i=>[i,gu(PARTS[i])]));
const rows=[];for(let i=0;i<6;i+=1)for(let j=i+1;j<6;j+=1)rows.push(`${ids[i]}/${ids[j]}=${pct(G.get(ids[i]),G.get(ids[j]))}`);
console.log(rows.join(" "));
console.log("sorterTuples="+PARTS.sorter.length, JSON.stringify(PARTS.sorter), "furnaceTuples="+PARTS.furnace.length, JSON.stringify(PARTS.furnace));