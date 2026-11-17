import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const base=process.cwd();
const exists=p=>fs.existsSync(path.resolve(base,p));
const read=p=>fs.readFileSync(path.resolve(base,p),"utf8");
assert.ok(exists("public/reference/approved-yard.png"));
const manifest=JSON.parse(read("docs/design/asset-manifest.json"));
assert.equal(manifest.version,1);
assert.equal(manifest.approved_style,"public/reference/approved-yard.png");
assert.equal(manifest.assets.length,13);
const seen=new Set();
for(const asset of manifest.assets){
 assert.ok(!seen.has(asset.id),"Duplicate asset id "+asset.id);
 seen.add(asset.id);
 assert.match(asset.path,/^public\/assets\/blockouts\/[a-zA-Z0-9_-]+\.gltf$/);
 assert.ok(exists(asset.path),"Original blockout missing: "+asset.path);
 assert.ok(asset.stage.includes("not automatically production-approved"));
}
const required=["docs/DOCUMENTATION.md","docs/design/ART_DIRECTION.md","docs/design/PALETTE.md","docs/design/CAMERA.md","docs/design/UI_DESIGN.md","docs/design/tokens.json"];
const present=required.filter(exists);
if(present.length===0){
 console.log("Approved reference and 13 original art blockouts validated. PR #307 design package pending.");
 process.exit(0);
}
assert.equal(present.length,required.length,"Design package must be complete");
const t=JSON.parse(read("docs/design/tokens.json"));
assert.equal(t.schema,"rustwake.visual.tokens.v1");
assert.equal(t.reference,"public/reference/approved-yard.png");
assert.equal(t.camera.projection,"orthographic");
assert.equal(t.camera.defaultYaw,45);
assert.equal(t.camera.defaultElevation,35.264);
assert.ok(t.camera.zoomMin<=0.2&&t.camera.zoomMax>=12);
assert.equal(t.layout.worldUnitsPerCell,3.5);
assert.equal(t.layout.minimumTouchTargetCssPx,44);
assert.equal(t.layout.documentScroll,false);
const css=read("src/styles.css"),renderer=read("src/world.js");
const names={bg:"--bg",card:"--card",cardStrong:"--card-strong",line:"--line",text:"--text",muted:"--muted",amber:"--amber",amberBright:"--amber-bright",mint:"--mint",danger:"--danger"};
const flattened=css.replace(/\s+/g,"").toLowerCase();
for(const [name,cssName] of Object.entries(names)){
 const v=t.ui[name];
 assert.match(v,/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/);
 assert.ok(flattened.includes(cssName+":"+v.toLowerCase()),"CSS token mismatch: "+name);
}
for(const [name,v] of Object.entries(t.world)){
 if(typeof v==="string"&&v.startsWith("#")){
  assert.ok(renderer.toLowerCase().includes(v.toLowerCase()),"World material mismatch: "+name);
 }
}
assert.ok(css.includes("Barlow Condensed")&&css.includes("DM Sans"));
assert.ok(renderer.includes("THREE.OrthographicCamera"));
console.log(JSON.stringify({status:"PASS",assets:13,ui_tokens:Object.keys(names).length,world_tokens:Object.keys(t.world).length},null,2));
