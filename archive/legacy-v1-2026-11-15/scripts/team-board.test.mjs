import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validate,render} from './team-board.mjs';
const fresh=()=>JSON.parse(fs.readFileSync(new URL('../work/backlog.json',import.meta.url),'utf8'));
test('published seed passes and output is deterministic',()=>{const b=fresh();assert.deepEqual(validate(b),[]);assert.deepEqual(render(b),render(b));});
test('sixth total session is rejected',()=>{const b=fresh();b.runtime.sessions=Array.from({length:5},(_,i)=>({session_id:String(i),task_id:'TEAM-001',generation:1}));assert.match(validate(b).join('\n'),/exceed cap/);});
test('acceptance cannot skip evidence and legal lifecycle',()=>{const b=fresh(),t=b.tickets[0];t.status='accepted';t.candidate_sha=null;t.review_verdict=null;t.history.push({at:b.updated_at,actor:'developer',from_state:'ready',to_state:'accepted',reason:'self-approved'});assert.match(validate(b).join('\n'),/candidate SHA/);assert.match(validate(b).join('\n'),/independent acceptance/);assert.match(validate(b).join('\n'),/illegal transition/);});
test('dependency cycles are rejected',()=>{const b=fresh();b.tickets[0].dependencies=['STRAT-001'];b.tickets[1].dependencies=['TEAM-001'];assert.match(validate(b).join('\n'),/dependency cycle/);});
test('feedback text cannot inject HTML',()=>{const b=fresh();b.tickets[0].title='<img src=x onerror=alert(1)>';const html=render(b)['work/board.html'];assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img src=x'));});


test("board shows honest metrics and refresh age",()=>{const html=render(fresh())["work/board.html"];assert.ok(html.includes("Child-slot utilization"));assert.ok(html.includes("http-equiv=\"refresh\""));assert.ok(html.includes("snapshot-age"));});

