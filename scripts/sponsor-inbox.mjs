import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const marker='<!-- WRITE BELOW THIS LINE -->';
const hash=s=>crypto.createHash('sha256').update(s,'utf8').digest('hex');
const rootDefault=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function atomic(file,text){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(tmp,text,{encoding:'utf8',flag:'wx'});fs.renameSync(tmp,file);}
function json(file,value){atomic(file,JSON.stringify(value,null,2)+'\n');}
function split(text){const at=text.indexOf(marker);if(at<0)throw Error('Inbox marker missing; refuse to consume');const end=at+marker.length;return {header:text.slice(0,end),body:text.slice(end)};}
function within(root,relative){if(typeof relative!=='string'||path.isAbsolute(relative)||relative.split(/[\\/]/).includes('..'))throw Error('Expected repository-relative path');return path.join(root,relative);}
function lock(root,fn){const dir=path.join(root,'.rustwake-runtime');fs.mkdirSync(dir,{recursive:true});const f=path.join(dir,'sponsor-intake.lock');let fd;try{fd=fs.openSync(f,'wx');fs.writeFileSync(fd,JSON.stringify({pid:process.pid,at:new Date().toISOString()}));}catch(e){throw Error('Sponsor intake already locked; reconcile owner before retrying: '+e.message);}try{return fn();}finally{fs.closeSync(fd);fs.unlinkSync(f);}}
export function snapshot(root=rootDefault){return lock(root,()=>{
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
 const id='SPONSOR-'+new Date().toISOString().replace(/[-:.TZ]/g,'')+'-'+crypto.randomBytes(4).toString('hex');
 const relative=`work/sponsor/intake/${id}.json`;
 const receipt={schema_version:1,id,status:'pending',captured_at:new Date().toISOString(),source:'SPONSOR_INBOX.md',request:body,request_sha256:hash(body),inbox_sha256:hash(inbox),ticket_ids:[],decision:null};
 json(path.join(root,relative),receipt);return {status:'pending',id,receipt:relative,request_sha256:receipt.request_sha256};
 });}
export function acknowledge(root,relative,decision,ticketIds){return lock(root,()=>{
 if(!/^work\/sponsor\/intake\/SPONSOR-[A-Za-z0-9-]+\.json$/.test(relative))throw Error('Invalid receipt path');
 const file=within(root,relative);const receipt=JSON.parse(fs.readFileSync(file,'utf8'));
 if(hash(receipt.request)!==receipt.request_sha256)throw Error('Receipt request hash mismatch');
 if(receipt.status==='incorporated')return {status:'already-incorporated',id:receipt.id,ticket_ids:receipt.ticket_ids};
 if(receipt.status==='prepared')throw Error('Interrupted acknowledgement: original request is preserved in receipt. Reconcile inbox_before/after hashes and Git before recovering; no automatic second deletion.');
 if(receipt.status!=='pending')throw Error('Unexpected receipt status');
 if(!Array.isArray(ticketIds)||!ticketIds.length||new Set(ticketIds).size!==ticketIds.length)throw Error('Supply unique existing backlog ticket IDs');
 if(!/^work\/product\/.+\.md$/.test(decision))throw Error('Decision must be a tracked work/product Markdown file');
 const decisionText=fs.readFileSync(within(root,decision),'utf8');
 const board=JSON.parse(fs.readFileSync(path.join(root,'work/backlog.json'),'utf8'));
 if(!decisionText.includes(receipt.id))throw Error('Decision must identify sponsor receipt');
 for(const id of ticketIds){const t=board.tickets?.find(t=>t.id===id);if(!t)throw Error('Missing backlog ticket '+id);if(!decisionText.includes(id))throw Error('Decision must explain ticket '+id);if(!(t.sponsor_requests??[]).includes(receipt.id)&&!(t.evidence??[]).includes(relative))throw Error('Ticket must link sponsor receipt: '+id);if(['rejected','deferred'].includes(t.status))throw Error('Deferred/rejected ideas stay in inbox until genuinely incorporated: '+id);}
 const inboxFile=path.join(root,'SPONSOR_INBOX.md');const before=fs.readFileSync(inboxFile,'utf8');const {header,body}=split(before);
 if(!body.startsWith(receipt.request))throw Error('Sponsor text changed since snapshot; preserve inbox and take a new snapshot');
 const after=header+body.slice(receipt.request.length);
 // Write durable acknowledgement with the original request before removing any inbox text.
 const prepared={...receipt,status:'prepared',ticket_ids:ticketIds,decision,decision_sha256:hash(decisionText),backlog_sha256:hash(JSON.stringify(board)),prepared_at:new Date().toISOString(),inbox_before_sha256:hash(before),inbox_after_sha256:hash(after),remaining_text:body.slice(receipt.request.length)};
 json(file,prepared);
 // Cooperating writers hold the same lock. This additional check also catches ordinary editor saves.
 if(fs.readFileSync(inboxFile,'utf8')!==before)throw Error('Inbox changed during acknowledgement; prepared receipt retained, no deletion performed');
 atomic(inboxFile,after);
 json(file,{...prepared,status:'incorporated',incorporated_at:new Date().toISOString()});
 return {status:'incorporated',id:receipt.id,ticket_ids:ticketIds,decision};
 });}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const [command,...args]=process.argv.slice(2);let result;if(command==='snapshot')result=snapshot(rootDefault);else if(command==='ack'&&args.length>=3)result=acknowledge(rootDefault,args[0],args[1],args.slice(2));else throw Error('Usage: node scripts/sponsor-inbox.mjs snapshot | ack work/sponsor/intake/ID.json work/product/DECISION.md TICKET-ID [TICKET-ID...]');console.log(JSON.stringify(result,null,2));}catch(e){console.error(e.message);process.exitCode=1;}
}
