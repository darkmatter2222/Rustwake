import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
export function publicationReader(root){
 let cached=null,expires=0,pending=null;
 return async()=>{
  if(Date.now()<expires)return cached;
  if(pending)return pending;
  pending=(async()=>{
   const result={observed_at:new Date().toISOString()};
   const run=async(cmd,args)=>(await exec(cmd,args,{cwd:root,timeout:15000,maxBuffer:1000000})).stdout.trim();
   try{
    result.latest_commit=(await run('git',['log','-1','--all','--format=%H|%cI'])).split('|');
    const common=path.resolve(root,await run('git',['rev-parse','--git-common-dir']));
    const dir=path.join(common,'rustwake-publication');
    const names=await fs.readdir(dir).catch(()=>[]);
    const receipts=(await Promise.all(names.filter(n=>n.endsWith('.json')).map(n=>fs.readFile(path.join(dir,n),'utf8').then(JSON.parse).catch(()=>null)))).filter(Boolean);
    receipts.sort((a,b)=>Date.parse(b.verified_push_at)-Date.parse(a.verified_push_at));
    result.feature_push=receipts[0]??null;
    result.unpublished_commit_count=Number(await run('git',['rev-list','--count','--branches','--not','--remotes=origin']));
    result.dirty_checkout_entries=(await run('git',['status','--porcelain'])).split('\n').filter(Boolean).length;
   }catch{result.git_error='Git publication state unavailable';}
   try{
    const runs=JSON.parse(await run('gh',['run','list','--repo','darkmatter2222/Rustwake','--workflow','delivery.yml','--limit','20','--json','conclusion,headSha,updatedAt,url']));
    result.deployment=runs.find(r=>r.conclusion==='success')??null;
   }catch{result.actions_error='Actions state unavailable';}
   cached=result;expires=Date.now()+60000;return result;
  })();
  try{return await pending;}finally{pending=null;}
 };
}
