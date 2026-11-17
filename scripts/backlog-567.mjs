// dev-567 supplementary measurement: full alarm/backlog landscape over 660s,
// parameterized by worktree root so pre-fix and post-fix sims compare identically.
import {pathToFileURL} from "node:url";
const root=pathToFileURL(process.argv[2]+"/").href;
const sim=await import(root+"src/simulation.js");
const {alarmsState}=await import(root+"src/alarms.js");
const g=sim.createGame();
const out=[];
for(let t=0;t<660;t+=0.5){
 sim.advanceGame(g,0.5);
 if(Math.round((t+0.5)*2)%120===0){
  const a=alarmsState(g);
  const bays=g.buildings.filter(b=>b.type!=="depot").map(b=>b.type+":"+Object.values(b.inventory||{}).reduce((x,y)=>x+y,0));
  out.push({t:t+0.5,bays,alarms:(a.alarms||[]).map(x=>x.id+"/"+x.state),shipments:g.stats.shipments,delivered:g.stats.delivered});
 }
}
console.log(JSON.stringify(out,null,1));
