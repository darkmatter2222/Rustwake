/**
 * Offline studio contract checks, independent of Qwen/OpenCode version.
 * Validates documentation/role presence and prevents a tiny, unmaintained set
 * of personas from silently replacing the sponsor's autonomous studio.
 */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const root=path.resolve(process.cwd());
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const exists=p=>fs.existsSync(path.join(root,p));
const required=[
  "AGENTS.md","QWEN.md","goal.md",
  "docs/agents/ROLES.md","docs/agents/roles.json",
  "docs/agents/TASK_PROTOCOL.md","docs/agents/SPONSOR_HANDOFF.md",
  "docs/engineering/ARCHITECTURE.md","docs/engineering/ECONOMY.md",
  "docs/engineering/RELEASE.md","docs/qa/QUALITY_GATES.md",
  "docs/backlog/GAPS.md","docs/decisions/README.md",
  "docs/operations/PROJECTS.md",
  "public/reference/approved-yard.png"
];
for(const f of required) assert.ok(exists(f),"Required studio contract missing: "+f);
const registry=JSON.parse(read("docs/agents/roles.json"));
assert.equal(registry.version,1);
assert.equal(registry.primary,"coordinator");
assert.equal(registry.max_model_sessions,5);
assert.equal(registry.max_children,4);
assert.ok(registry.roles.length>=24,"Studio must cover all assigned capabilities");
const known=new Set();
for(const role of registry.roles){
 assert.match(role.id,/^[a-z][a-z0-9-]+$/);
 assert.ok(!known.has(role.id),"Duplicate role: "+role.id);
 known.add(role.id);
 assert.ok(role.mission?.length>25,"Missing mission: "+role.id);
 for(const provider of [".qwen/agents",".opencode/agents"]){
  const p=provider+"/rustwake-"+role.id+".md";
  assert.ok(exists(p),"Missing "+provider+" persona for "+role.id);
  const body=read(p);
  assert.match(body,/AGENTS\.md/,"Persona must inherit root contract: "+p);
  assert.match(body,/subagent|children|child|session/i,"Persona must acknowledge team cap: "+p);
 }
}
for(const role of ["coordinator","release-engineer","production-release-manager","cicd-engineer","staging-verifier","site-reliability-engineer","developer","ui-ux","product-owner","live-verifier","security-reviewer","documentation-steward"])assert.ok(known.has(role));
assert.match(read("AGENTS.md"),/docs\/agents\/ROLES\.md/);
assert.match(read("AGENTS.md"),/public\/reference\/approved-yard\.png/);
assert.match(read("goal.md"),/five|four|children|coordinator/i);
assert.match(read("docs/agents/TASK_PROTOCOL.md"),/main/i);
assert.match(read("docs/engineering/RELEASE.md"),/source_sha|manifest/i);
assert.match(read("docs/qa/QUALITY_GATES.md"),/cursor|pointer/i);
const optionalDesign=[
 "docs/DOCUMENTATION.md","docs/design/ART_DIRECTION.md","docs/design/PALETTE.md",
 "docs/design/CAMERA.md","docs/design/UI_DESIGN.md","docs/design/tokens.json"
];
const optionalPresent=optionalDesign.filter(exists);
if(optionalPresent.length>0){
 for(const p of optionalDesign)assert.ok(exists(p),"Partial design-system package: "+p);
 const tokens=JSON.parse(read("docs/design/tokens.json"));
 assert.ok(tokens&&typeof tokens==="object","Machine-readable art tokens required");
}
console.log(JSON.stringify({studio:"PASS",roles:known.size,required_files:required.length,design_package_present:optionalPresent.length===optionalDesign.length,max_model_sessions:registry.max_model_sessions},null,2));
