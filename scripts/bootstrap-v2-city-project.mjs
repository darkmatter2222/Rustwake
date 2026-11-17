#!/usr/bin/env node
/**
 * Rustwake V2 native Projects bootstrap.
 * Requires authenticated gh CLI project scope and Issues write.
 * Safe default is dry run. --apply makes changes.
 * --native-links creates real sub-issues and blocked-by relationships.
 * --close-legacy closes OLD Rustwake Projects 1 and 2 only after the
 * replacement is complete; never deletes projects or historical issues.
 */
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const model=JSON.parse(fs.readFileSync(path.join(ROOT,"docs/city/execution-manifest.json"),"utf8"));
const OWNER="darkmatter2222",REPO="Rustwake",FULL=OWNER+"/"+REPO;
const TITLE="Rustwake V2 — Living Industrial City";
const flags=new Set(process.argv.slice(2));
const apply=flags.has("--apply"),native=flags.has("--native-links"),close=flags.has("--close-legacy");
if((native||close)&&!apply)throw Error("--native-links / --close-legacy require --apply");
if(model.tasks.length<185||model.execution_master!==310)throw Error("Invalid V2 manifest");
const tasks=model.tasks,lookup=new Map(tasks.map(t=>[t.issue,t]));
function run(args,input){
 const r=spawnSync("gh",args,{encoding:"utf8",input,maxBuffer:48*1024*1024,timeout:120000});
 if(r.error)throw Error(r.error.message);
 if(r.status!==0)throw Error("gh "+args.join(" ")+" failed: "+(r.stderr||r.stdout).slice(0,1200));
 return r.stdout.trim();
}
function parse(args){return JSON.parse(run(args)||"null")}
function api(endpoint){return parse(["api","-H","X-GitHub-Api-Version: 2026-03-10",endpoint])}
function post(endpoint,data){
 return JSON.parse(run(["api","-X","POST","-H","X-GitHub-Api-Version: 2026-03-10",endpoint,"--input","-"],JSON.stringify(data)));
}
function nap(ms){Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms)}
function projects(){return parse(["project","list","--owner",OWNER,"--closed","--limit","200","--format","json"]).projects||[]}
function issueIds(){
 const map=new Map();
 for(let page=1;page<=12;page++){
  const a=api("repos/"+FULL+"/issues?state=all&per_page=100&page="+page);
  if(!Array.isArray(a)||!a.length)break;
  for(const i of a)if(!i.pull_request)map.set(i.number,i.id);
 }
 return map;
}
function ensureField(n,name,type,options){
 const fields=parse(["project","field-list",String(n),"--owner",OWNER,"--format","json"]).fields||[];
 if(fields.some(f=>f.name===name))return;
 const a=["project","field-create",String(n),"--owner",OWNER,"--name",name,"--data-type",type];
 if(options?.length)a.push("--single-select-options",options.join(","));
 run(a);
}
function existingUrls(n){
 const a=parse(["project","item-list",String(n),"--owner",OWNER,"--limit","1000","--format","json"]).items||[];
 return new Set(a.map(i=>i.content?.url).filter(Boolean));
}
function ensureNativeLinks(){
 const map=issueIds();
 for(const t of tasks)if(!map.has(t.issue)||!map.has(t.track_issue))throw Error("Missing numeric issue ID for "+t.issue);
 let children=0,dependencies=0;
 for(const track of model.tracks){
  const have=new Set();
  for(let page=1;page<=3;page++){
   const a=api("repos/"+FULL+"/issues/"+track.issue+"/sub_issues?per_page=100&page="+page);
   if(!Array.isArray(a)||!a.length)break;
   for(const child of a)have.add(child.number);
  }
  for(const t of tasks.filter(x=>x.track_issue===track.issue)){
   if(have.has(t.issue))continue;
   post("repos/"+FULL+"/issues/"+track.issue+"/sub_issues",{sub_issue_id:map.get(t.issue)});
   children++;nap(150);
  }
  console.log("Subissues reconciled for "+track.id);
 }
 for(const t of tasks){
  if(!t.hard_blockers.length)continue;
  const have=new Set();
  const a=api("repos/"+FULL+"/issues/"+t.issue+"/dependencies/blocked_by?per_page=100");
  for(const item of Array.isArray(a)?a:[])have.add(item.number);
  for(const blocker of t.hard_blockers){
   if(have.has(blocker))continue;
   if(!map.has(blocker))throw Error("Unknown blocker issue ID #"+blocker);
   post("repos/"+FULL+"/issues/"+t.issue+"/dependencies/blocked_by",{issue_id:map.get(blocker)});
   dependencies++;nap(150);
  }
 }
 return {children,dependencies};
}
const status=new Map();
function check(n,stack){
 if(status.get(n)===1)throw Error("Dependency cycle "+[...stack,n].join(" -> "));
 if(status.get(n)===2)return;
 status.set(n,1);
 const t=lookup.get(n);
 for(const blocker of t?.hard_blockers||[]){
  if(!lookup.has(blocker))throw Error("Unknown blocker #"+blocker+" for #"+n);
  check(blocker,[...stack,n]);
 }
 status.set(n,2);
}
for(const task of tasks)check(task.issue,[]);
const totalEdges=tasks.reduce((n,t)=>n+t.hard_blockers.length,0);
console.log(JSON.stringify({mode:apply?"APPLY":"DRY_RUN",tasks:tasks.length,tracks:model.tracks.length,dependencyEdges:totalEdges,externalHolds:tasks.filter(t=>t.external_hold).map(t=>({issue:t.issue,reason:t.external_hold})),closeLegacyRequested:close},null,2));
if(!apply){console.log("No changes made. To execute: node scripts/bootstrap-v2-city-project.mjs --apply --native-links --close-legacy");process.exit(0);}
run(["auth","status"]);
let project=projects().find(p=>p.title===TITLE&&!p.closed);
if(!project){
 project=parse(["project","create","--owner",OWNER,"--title",TITLE,"--format","json"]);
 if(!project?.number)throw Error("GitHub did not confirm new Project number");
}
const num=Number(project.number);
if(!Number.isInteger(num)||num<=2)throw Error("Unexpected new Project number; refuse old board mutation");
run(["project","link",String(num),"--owner",OWNER,"--repo",REPO]);
run(["project","edit",String(num),"--owner",OWNER,"--description","Rustwake V2 living industrial city. Vision #253; execution #310; 15 tracks, 192 granular tasks; reviewed PR/main CI/CD and live source verification.","--visibility","PUBLIC"]);
ensureField(num,"Phase","SINGLE_SELECT",["P0","P1","P2","P3","P4","P5"]);
ensureField(num,"Workstream","SINGLE_SELECT",model.tracks.map(x=>x.id));
ensureField(num,"Execution","SINGLE_SELECT",["Backlog","Ready","Doing","Review","Accepted","Merged","Deployed","Blocked"]);
ensureField(num,"Release SHA","TEXT");
const active=parse(["issue","list","--repo",FULL,"--state","open","--label","v2","--limit","1000","--json","number,url,title"]);
if(!Array.isArray(active)||active.length<210)throw Error("Unexpectedly few active V2 issues: "+active?.length);
const already=existingUrls(num);
let added=0,assigned=0;
for(const item of active){
 if(already.has(item.url))continue;
 run(["project","item-add",String(num),"--owner",OWNER,"--url",item.url]);
 added++;
 const t=lookup.get(item.number);
 if(t){
  const fields=[["Phase",t.phase],["Workstream",t.stream],["Execution",(t.external_hold||t.hard_blockers.length)?"Blocked":"Ready"]];
  for(const [name,value] of fields){
   run(["project","item-edit",String(num),"--owner",OWNER,"--url",item.url,"--field",name,"--value",value]);
   assigned++;
  }
 }
 if(added%25===0)console.log("Added "+added+" items");
}
const after=existingUrls(num);
if(after.size<active.length)throw Error("Project only has "+after.size+" items, expected at least "+active.length);
for(const t of tasks)if(!after.has("https://github.com/"+FULL+"/issues/"+t.issue))throw Error("Missing project task #"+t.issue);
if(!after.has("https://github.com/"+FULL+"/issues/310"))throw Error("Master #310 missing");
let links={children:0,dependencies:0};
if(native)links=ensureNativeLinks();
const retired=[];
if(close){
 if(!native)throw Error("Cannot close old boards before native dependency migration");
 for(const oldNo of [1,2]){
  const old=projects().find(p=>p.number===oldNo);
  if(!old){retired.push({number:oldNo,result:"not_found"});continue;}
  if(!/rust.?wake/i.test(old.title||""))throw Error("Refuse unrelated Project closure #"+oldNo+": "+old.title);
  if(!old.closed)run(["project","close",String(oldNo),"--owner",OWNER]);
  if(!projects().find(p=>p.number===oldNo)?.closed)throw Error("Cannot verify old Project #"+oldNo+" closed");
  retired.push({number:oldNo,result:"closed"});
 }
}
const receipt={projectNumber:num,url:"https://github.com/users/"+OWNER+"/projects/"+num,verifiedItems:after.size,added,fieldAssignments:assigned,nativeLinks:links,oldProjects:retired};
console.log("VERIFIED_PROJECT_RECEIPT "+JSON.stringify(receipt));
console.log("Post this receipt to issue #265 and issue #310; profile/agent host activation still requires separate #263 receipt.");
