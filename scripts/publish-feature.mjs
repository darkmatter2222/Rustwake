// Usage: node scripts/publish-feature.mjs "commit message" path [path ...]
// Only explicitly selected files are committed. Does not run tests or certify acceptance.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function publishFeature(cwd,message,paths){
 const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const branch=git('branch','--show-current');
 if(!/^rw\/[A-Za-z0-9._/-]+$/.test(branch))throw Error('Only rw/ feature branches may use this helper');
 if(!message?.trim()||!paths.length)throw Error('Commit message and explicit owned paths required');
 for(const p of paths){
  if(!p||path.isAbsolute(p)||p.includes('..')||p.includes('\\')||p.includes('*')||p.startsWith('-')||p==='.'||/(^|\/)(\.env[^/]*|\.git|\.rustwake-runtime|node_modules)(\/|$)/.test(p))throw Error('Unsafe publication path: '+p);
 }
 const owns=p=>paths.some(prefix=>p===prefix||p.startsWith(prefix+'/'));
 // Refuse to inherit another worker's staged files, including newline-containing names.
 const staged=execFileSync('git',['diff','--cached','--name-only','-z'],{cwd}).toString().split('\0').filter(Boolean);
 if(staged.some(p=>!owns(p)))throw Error('Index contains files outside this assignment; preserve them and reconcile');
 const available=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z','--',...paths],{cwd}).toString().split('\0').filter(Boolean);
 if(available.some(p=>/(^|\/)(\.env[^/]*|\.rustwake-runtime|node_modules)(\/|$)|\.(pem|key|pfx|p12)$/i.test(p)))throw Error('Selected paths contain a potential credential/runtime file; inspect explicitly');
 git('add','--',...paths);
 if(git('diff','--cached','--name-only'))git('commit','-m',message);
 const sha=git('rev-parse','HEAD');
 git('push','--set-upstream','origin',`HEAD:refs/heads/${branch}`);
 if(git('ls-remote','--heads','origin',`refs/heads/${branch}`).split(/\s+/)[0]!==sha)throw Error('Remote branch did not verify at published SHA');
 const common=path.resolve(cwd,git('rev-parse','--git-common-dir'));
 const dir=path.join(common,'rustwake-publication');fs.mkdirSync(dir,{recursive:true});
 const receipt={branch,sha,verified_push_at:new Date().toISOString(),commit_at:git('show','-s','--format=%cI','HEAD')};
 const target=path.join(dir,branch.replaceAll('/','_')+'.json');const tmp=target+`.${process.pid}.tmp`;
 fs.writeFileSync(tmp,JSON.stringify(receipt,null,2)+'\n');fs.renameSync(tmp,target);
 return receipt;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(publishFeature(process.cwd(),process.argv[2],process.argv.slice(3)),null,2));}
 catch(e){console.error('Publication failed: '+(e.stderr?.toString()||e.message));process.exitCode=1;}
}
