import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const p=path.join(root,"docs/city/execution-manifest.json");
const doc=JSON.parse(fs.readFileSync(p,"utf8"));
assert.equal(doc.schema,"rustwake.v2.city-execution.v1");
assert.equal(doc.execution_master,310);
assert.equal(doc.vision_issue,253);
assert.equal(doc.first_playable_gate,276);
assert.equal(doc.roles_sessions.total_max,5);
assert.equal(doc.roles_sessions.children_max,4);
assert.equal(doc.tasks.length,192);
assert.equal(doc.tracks.length,15);
const tasks=new Map(),parents=new Set(doc.tracks.map(t=>t.issue));
for(const t of doc.tasks){
 assert.ok(Number.isInteger(t.issue)&&t.issue>=325&&t.issue<=525);
 assert.ok(!parents.has(t.issue),"Track cannot be dispatched as a leaf");
 assert.ok(!tasks.has(t.issue),"Duplicate issue number #"+t.issue);
 assert.ok(t.key&&t.stream&&t.role&&t.priority);
 assert.ok(["P0","P1","P2","P3","P4","P5"].includes(t.phase));
 assert.ok(parents.has(t.track_issue));
 assert.ok(Array.isArray(t.hard_blockers));
 assert.ok(!t.hard_blockers.includes(t.issue));
 tasks.set(t.issue,t);
}
let edges=0;
const states=new Map();
function visit(id,stack){
 if(states.get(id)===1)throw Error("Dependency cycle: "+[...stack,id].join(" > "));
 if(states.get(id)===2)return;
 states.set(id,1);
 for(const dep of tasks.get(id).hard_blockers){
  assert.ok(tasks.has(dep),"Unknown dependency #"+dep+" of #"+id);
  assert.ok(!parents.has(dep),"Track cannot be a hard blocker: #"+dep);
  edges++;
  visit(dep,[...stack,id]);
 }
 states.set(id,2);
}
for(const task of doc.tasks)visit(task.issue,[]);
const grouped=Object.fromEntries(doc.tracks.map(track=>[track.id,doc.tasks.filter(t=>t.track_issue===track.issue).length]));
for(const [name,count] of Object.entries(grouped))assert.ok(count>=10,"Track "+name+" has too few concrete issues");
const starters=doc.tasks.filter(t=>t.hard_blockers.length===0);
assert.ok(starters.length>=4);
console.log(JSON.stringify({result:"PASS",tasks:tasks.size,tracks:doc.tracks.length,edges,starters:starters.map(t=>t.issue),grouped},null,2));
