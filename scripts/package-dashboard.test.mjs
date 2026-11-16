import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";
test("packager requires an immutable SHA and built files",()=>{
 assert.throws(()=>execFileSync("node",["scripts/package-dashboard.mjs"],{env:{...process.env,RUSTWAKE_SOURCE_SHA:"invalid"},stdio:"pipe"}));
});
