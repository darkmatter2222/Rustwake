import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const marker='<!-- WRITE BELOW THIS LINE -->';
const repo='darkmatter2222/Rustwake';
const hash=s=>crypto.createHash('sha256').update(s,'utf8').digest('hex');
const rootDefault=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function atomic(file,text){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(tmp,text,{encoding:'utf8',flag:'wx'});fs.renameSync(tmp,file);}
function json(file,value){atomic(file,JSON.stringify(value,null,2)+'\n');}
function split(text){const at=text.indexOf(marker);if(at<0)throw Error('Inbox marker missing; refuse to consume');const end=at+marker.length;return {header:text.slice(0,end),body:text.slice(end)};}
function within(root,relative){if(typeof relative!=='string'||path.isAbsolute(relative)||relative.split(/[\\/]/).includes('..'))throw Error('Expected repository-relative path');return path.join(root,relative);}
function lock(root,fn){const dir=path.join(root,'.rustwake-runtime');fs.mkdirSync(dir,{recursive:true});const f=path.join(dir,'sponsor-intake.lock');let fd;try{fd=fs.openSync(f,'wx');fs.writeFileSync(fd,JSON.stringify({pid:process.pid,at:new Date().toISOString()}));}catch(e){throw Error('Sponsor intake already locked; reconcile owner before retrying: '+e.message);}try{return fn();}finally{fs.closeSync(fd);fs.unlinkSync(f);}}
// makeId is an injection seam for deterministic offline tests; the default keeps the
// timestamp+random-hex format used in production.
const defaultReceiptId=()=>'SPONSOR-'+new Date().toISOString().replace(/[-:.TZ]/g,'')+'-'+crypto.randomBytes(4).toString('hex');
export function snapshot(root=rootDefault,makeId=defaultReceiptId){return lock(root,()=>{
 const inbox=fs.readFileSync(path.join(root,'SPONSOR_INBOX.md'),'utf8');const {body}=split(inbox);if(!body.trim())return {status:'empty'};
 const dir=path.join(root,'work/sponsor/intake');
 if(fs.existsSync(dir)){
  for(const name of fs.readdirSync(dir).filter(n=>/^SPONSOR-[A-Za-z0-9-]+\.json$/.test(n)).sort()){
   const existing=JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
   if(['pending','prepared'].includes(existing.status)&&existing.request_sha256===hash(body)&&existing.request===body){
    if(existing.status==='prepared')throw Error('Interrupted acknowledgement for '+existing.id+': reconcile prepared receipt before snapshotting again');
    return {status:'pending',id:existing.id,receipt:'work/sponsor/intake/'+name,request_sha256:existing.request_sha256,reused:true};
   }
  }
 }
 const id=makeId();
 const relative=`work/sponsor/intake/${id}.json`;
 const receipt={schema_version:1,id,status:'pending',captured_at:new Date().toISOString(),source:'SPONSOR_INBOX.md',request:body,request_sha256:hash(body),inbox_sha256:hash(inbox),ticket_ids:[],decision:null};
 json(path.join(root,relative),receipt);return {status:'pending',id,receipt:relative,request_sha256:receipt.request_sha256};
 });}
// GitHub Issues are the only work system; the archived work/backlog.json is never consulted.
// Fail closed when gh is unavailable/unauthenticated: no silent fallback to local JSON.
function ghApi(endpoint,paginate=false){
 const args=['api',endpoint];if(paginate)args.push('--paginate','--slurp');
 const run=spawnSync('gh',args,{encoding:'utf8'});
 if(run.error)throw Error('GitHub CLI unavailable; sponsor ticket validation requires authenticated gh (no archived-backlog fallback): '+run.error.message);
 if(run.status!==0)throw Error('gh api '+endpoint+' failed; sponsor ticket validation requires authenticated gh (no archived-backlog fallback): '+String(run.stderr??'').trim());
 let parsed;try{parsed=JSON.parse(run.stdout);}catch{throw Error('gh api '+endpoint+' returned invalid JSON; cannot validate sponsor tickets');}
 return paginate?parsed.flat():parsed;
}
export function githubTicketValidator(ticketIds,receiptId,relative,api=ghApi){
 return ticketIds.map(id=>{
  const issue=api(`repos/${repo}/issues/${id}`);
  if(!issue||typeof issue!=='object')throw Error('Missing GitHub issue '+id);
  if(issue.pull_request)throw Error('Ticket must be a GitHub issue, not a pull request: '+id);
  const labels=(issue.labels??[]).map(l=>l?.name??String(l));
  if(labels.includes('status:deferred')||labels.includes('status:rejected'))throw Error('Deferred/rejected ideas stay in inbox until genuinely incorporated: '+id);
  const linked=text=>typeof text==='string'&&(text.includes(receiptId)||text.includes(relative));
  if(!linked(issue.body)&&!api(`repos/${repo}/issues/${id}/comments`,true).some(c=>linked(c?.body)))throw Error('Issue must link sponsor receipt: '+id);
  return {number:issue.number??Number(id),url:issue.html_url??`https://github.com/${repo}/issues/${id}`,state:issue.state,labels};
 });
}
// validateTickets is an injection seam for offline tests; the default validates via authenticated gh.
export function acknowledge(root,relative,decision,ticketIds,validateTickets=githubTicketValidator){return lock(root,()=>{
 if(!/^work\/sponsor\/intake\/SPONSOR-[A-Za-z0-9-]+\.json$/.test(relative))throw Error('Invalid receipt path');
 const file=within(root,relative);const receipt=JSON.parse(fs.readFileSync(file,'utf8'));
 if(hash(receipt.request)!==receipt.request_sha256)throw Error('Receipt request hash mismatch');
 if(receipt.status==='incorporated')return {status:'already-incorporated',id:receipt.id,ticket_ids:receipt.ticket_ids};
 if(receipt.status==='prepared')throw Error('Interrupted acknowledgement: original request is preserved in receipt. Reconcile inbox_before/after hashes and Git before recovering; no automatic second deletion.');
 if(receipt.status!=='pending')throw Error('Unexpected receipt status');
 if(!Array.isArray(ticketIds)||!ticketIds.length||new Set(ticketIds.map(String)).size!==ticketIds.length)throw Error('Supply unique GitHub issue numbers');
 const ids=ticketIds.map(String);
 for(const id of ids){if(!/^[1-9]\d*$/.test(id))throw Error('Ticket IDs must be GitHub issue numbers: '+id);}
 if(!/^work\/product\/.+\.md$/.test(decision))throw Error('Decision must be a tracked work/product Markdown file');
 const decisionText=fs.readFileSync(within(root,decision),'utf8');
 if(!decisionText.includes(receipt.id))throw Error('Decision must identify sponsor receipt');
 // Whole-token mention check: ticket digits embedded in a longer number ("1430") or in the
 // receipt ID ("SPONSOR-<timestamp>-<hex>") must not count; "#43", "43," and "(43)" do.
 // IDs are validated as numeric above, so no regex escaping is needed. Hyphens are excluded
 // from token boundaries so no segment of a hyphen-joined receipt ID can satisfy the check,
 // even an 8-digit ticket equal to the whole hex suffix.
 const mentions=id=>new RegExp('(?<![\\w-])'+id+'(?![\\w-])').test(decisionText);
 for(const id of ids){if(!mentions(id))throw Error('Decision must explain ticket '+id);}
 const issues=validateTickets(ids,receipt.id,relative);
 if(!Array.isArray(issues)||issues.length!==ids.length)throw Error('Ticket validator returned an invalid result');
 const inboxFile=path.join(root,'SPONSOR_INBOX.md');const before=fs.readFileSync(inboxFile,'utf8');const {header,body}=split(before);
 if(!body.startsWith(receipt.request))throw Error('Sponsor text changed since snapshot; preserve inbox and take a new snapshot');
 const after=header+body.slice(receipt.request.length);
 // Write durable acknowledgement with the original request before removing any inbox text.
 const prepared={...receipt,status:'prepared',ticket_ids:ids,decision,decision_sha256:hash(decisionText),github_issues:issues,prepared_at:new Date().toISOString(),inbox_before_sha256:hash(before),inbox_after_sha256:hash(after),remaining_text:body.slice(receipt.request.length)};
 json(file,prepared);
 // Cooperating writers hold the same lock. This additional check also catches ordinary editor saves.
 if(fs.readFileSync(inboxFile,'utf8')!==before)throw Error('Inbox changed during acknowledgement; prepared receipt retained, no deletion performed');
 atomic(inboxFile,after);
 json(file,{...prepared,status:'incorporated',incorporated_at:new Date().toISOString()});
 return {status:'incorporated',id:receipt.id,ticket_ids:ids,decision};
 });}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const [command,...args]=process.argv.slice(2);let result;if(command==='snapshot')result=snapshot(rootDefault);else if(command==='ack'&&args.length>=3)result=acknowledge(rootDefault,args[0],args[1],args.slice(2));else throw Error('Usage: node scripts/sponsor-inbox.mjs snapshot | ack work/sponsor/intake/ID.json work/product/DECISION.md ISSUE-NUMBER [ISSUE-NUMBER...] (GitHub issue numbers in darkmatter2222/Rustwake, validated via authenticated gh)');console.log(JSON.stringify(result,null,2));}catch(e){console.error(e.message);process.exitCode=1;}
}
