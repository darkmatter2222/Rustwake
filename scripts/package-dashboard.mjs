// Packages the V2 app for the existing immutable-artifact Rustwake host adapter.
// Maintains release-manifest.json compatibility with previous CD infrastructure.
import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
const sha=process.env.RUSTWAKE_SOURCE_SHA||process.argv[2]||"";
if(!/^[0-9a-f]{40}$/.test(sha))throw new Error("Full immutable SHA required");
const dist=path.resolve("dist");
if(!fs.existsSync(path.join(dist,"index.html")))throw new Error("Build dist before packaging");
const team=path.join(dist,"team");fs.mkdirSync(team,{recursive:true});
const status={version:3,product:"Rustwake V2 Living World",source_sha:sha,authority:"GitHub Issues",created_at:new Date().toISOString(),roadmap:"https://github.com/darkmatter2222/Rustwake/issues"};
fs.writeFileSync(path.join(team,"status.json"),JSON.stringify(status,null,2)+"\n");
fs.writeFileSync(path.join(team,"index.html"),"<!doctype html><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Rustwake production</title><style>body{background:#101c22;color:#e0e8df;font:16px system-ui;padding:24px}a{color:#e7ad79}</style><h1>Rustwake V2</h1><p>Production source: <code>"+sha+"</code></p><a href='../'>Play Rustwake</a> · <a href='https://github.com/darkmatter2222/Rustwake/issues'>GitHub issues</a>");
const files=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){
 const full=path.join(dir,e.name);
 if(e.isSymbolicLink())throw new Error("Symlinks prohibited");
 if(e.isDirectory())walk(full);
 else if(e.isFile()&&e.name!=="release-manifest.json"){
 const buf=fs.readFileSync(full);
 files.push({path:path.relative(dist,full).split(path.sep).join("/"),sha256:createHash("sha256").update(buf).digest("hex"),bytes:buf.length});
 } }}
walk(dist);
fs.writeFileSync(path.join(dist,"release-manifest.json"),JSON.stringify({version:1,source_sha:sha,files:files.sort((a,b)=>a.path.localeCompare(b.path))},null,2)+"\n");
console.log("Rustwake V2 package and immutable manifest:",sha,files.length,"files");
