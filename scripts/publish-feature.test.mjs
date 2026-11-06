import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {publishFeature} from './publish-feature.mjs';
import {taskDirectory,prioritizeTasks} from '../tools/team-supervisor/dispatcher.mjs';
test('feature publication verifies remote, isolates staged files and rejects main',t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rw-publish-'));t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
 const cwd=path.join(tmp,'repo'),remote=path.join(tmp,'remote.git');fs.mkdirSync(cwd);
 const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 execFileSync('git',['init','--bare',remote],{stdio:'ignore'});git('init','-b','main');git('config','user.email','test@example.com');git('config','user.name','Test');git('remote','add','origin',remote);
 fs.writeFileSync(path.join(cwd,'file.txt'),'first');git('add','file.txt');git('commit','-m','initial');
 assert.throws(()=>publishFeature(cwd,'change',['file.txt']),/Only rw/);
 git('switch','-c','rw/feature');fs.writeFileSync(path.join(cwd,'file.txt'),'second');
 const receipt=publishFeature(cwd,'implement change',['file.txt']);assert.equal(receipt.sha,git('rev-parse','HEAD'));assert.ok(git('ls-remote','origin','refs/heads/rw/feature').startsWith(receipt.sha));
 fs.writeFileSync(path.join(cwd,'peer.txt'),'peer');git('add','peer.txt');assert.throws(()=>publishFeature(cwd,'bad',['file.txt']),/outside/);
 assert.throws(()=>publishFeature(cwd,'bad',['.env']),/Unsafe/);
});
test('release tasks outrank developer queue order without mutating queue',()=>{
 const tasks=[{role:'developer'},{role:'reviewer'},{role:'release-engineer'}];assert.equal(prioritizeTasks(tasks)[0].role,'release-engineer');assert.equal(tasks[0].role,'developer');
});
test('only registered separate rw feature worktrees can be developer directories',async t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rw-wt-'));t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
 const root=path.join(tmp,'repo');fs.mkdirSync(root);const git=(...a)=>execFileSync('git',a,{cwd:root,stdio:'ignore'});
 git('init','-b','main');git('config','user.email','test@example.com');git('config','user.name','Test');git('commit','--allow-empty','-m','init');
 const wt=path.join(tmp,'worker');git('worktree','add','-b','rw/task',wt);
 assert.equal(await taskDirectory(root,{role:'developer',directory:wt}),fs.realpathSync(wt));
 await assert.rejects(taskDirectory(root,{role:'developer',directory:root}),/separate/);
 await assert.rejects(taskDirectory(root,{role:'developer',directory:tmp}),/registered/);
});
