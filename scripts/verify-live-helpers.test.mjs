import test from "node:test";
import assert from "node:assert/strict";
import {auditManifest, assertBrowserObservation} from "./verify-live-helpers.mjs";
const sha = "a".repeat(40), hash = "b".repeat(64);
const good = () => ({version:1,source_sha:sha,files:[
  {path:"index.html",sha256:hash,bytes:123},
  {path:"assets/index-123.js",sha256:hash,bytes:999}
]});
test("exact deployed SHA and asset inventory are accepted", () => {
  assert.equal(auditManifest(good(),sha).length,2);
});
test("wrong live SHA is never claimed as deployment", () => {
  assert.throws(()=>auditManifest(good(),"c".repeat(40)),/LIVE_SHA_MISMATCH/);
});
test("manifest traversal, duplicates and omitted game are rejected", () => {
  const m=good();m.files[1].path="../.env";
  assert.throws(()=>auditManifest(m,sha),/Unsafe manifest/);
  const n=good();n.files.push({...n.files[0]});
  assert.throws(()=>auditManifest(n,sha),/Duplicate/);
  const p=good();p.files.splice(1);
  assert.throws(()=>auditManifest(p,sha),/game JavaScript/);
});
test("a missing 3D canvas or scrolling page cannot pass smoke",()=>{
  assertBrowserObservation({world3d:"ready",visibleCanvas:true,canvasWidth:390,canvasHeight:844,documentScroll:false});
  assert.throws(()=>assertBrowserObservation({world3d:"unavailable",visibleCanvas:true,canvasWidth:390,canvasHeight:844}),/GAME_RENDER_FAILED/);
  assert.throws(()=>assertBrowserObservation({world3d:"ready",visibleCanvas:true,canvasWidth:390,canvasHeight:844,documentScroll:true}),/DOCUMENT_SCROLL/);
});
