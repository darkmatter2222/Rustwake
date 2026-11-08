// Usage: node scripts/publish-feature.mjs --issue https://github.com/darkmatter2222/Rustwake/issues/N "commit message" path [path ...]
// CLI requires GitHub Issue and opens/reuses a linked DRAFT PR after publishing.
// Only explicitly selected files are committed. Does not run tests or certify acceptance.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const repo='darkmatter2222/Rustwake';
export function issueNumberFromUrl(url){
 const match=/^https:\/\/github\.com\/darkmatter2222\/Rustwake\/issues\/([1-9]\d*)$/.exec(url??'');
 if(!match)throw Error('A canonical Rustwake GitHub Issue URL is required');
 return match[1];
}
export function ensureDraftPr(cwd,branch,issueUrl,message){
 const number=issueNumberFromUrl(issueUrl);
 const gh=(...args)=>execFileSync('gh',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 let issue,prs;
 try{
  issue=JSON.parse(gh('issue','view',number,'--repo',repo,'--json','url,state'));
  if(issue.state!=='OPEN'||issue.url!==issueUrl)throw Error('Issue must be open: '+issueUrl);
  prs=JSON.parse(gh('pr','list','--repo',repo,'--head',branch,'--state','open','--json','url,number,isDraft'));
 }catch(e){throw Error('GitHub Issue/PR verification failed; run gh auth status. '+(e.stderr?.toString()||e.message));}
 if(prs.length>1)throw Error('Ambiguous open PRs for '+branch);
 if(prs.length===1)return prs[0].url;
 try{
  return gh('pr','create','--repo',repo,'--base','main','--head',branch,'--draft','--title',message,
   '--body','Closes #'+number+'\n\nRole: developer\nIssue: '+issueUrl+'\nStatus: DRAFT - independent QA and product decision required before release engineer merge.');
 }catch(e){throw Error('Feature branch pushed but draft PR creation FAILED. Resolve gh auth/PR error and rerun helper; do not treat branch as handed off. '+(e.stderr?.toString()||e.message));}
}
export function publishFeature(cwd,message,paths,issueUrl=null){
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
 if(issueUrl){receipt.issue_url=issueUrl;receipt.pr_url=ensureDraftPr(cwd,branch,issueUrl,message);}
 const target=path.join(dir,branch.replaceAll('/','_')+'.json');const tmp=target+`.${process.pid}.tmp`;
 fs.writeFileSync(tmp,JSON.stringify(receipt,null,2)+'\n');fs.renameSync(tmp,target);
 return receipt;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=process.argv.slice(2);if(args[0]!=='--issue'||args.length<4)throw Error('Use --issue <canonical-GitHub-Issue-URL> "commit message" <owned-paths...>; branch-only publication is prohibited');console.log(JSON.stringify(publishFeature(process.cwd(),args[2],args.slice(3),args[1]),null,2));}
 catch(e){console.error('Publication failed: '+(e.stderr?.toString()||e.message));process.exitCode=1;}
}
