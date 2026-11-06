import test from 'node:test';import assert from 'node:assert/strict';import {planAssignments,pathsConflict} from './team-scheduler.mjs';
const now='2026-11-05T12:00:00Z';
const ticket=(id,p)=>({id,status:'ready',priority:'P1',owner:'developer',product_approved:true,generation:0,dependencies:[],scheduling:{enabled:true,write_paths:[p],ready_at:now}});
const board=()=>({updated_at:now,max_active_sessions:4,runtime:{observed_at:now,sessions:[]},tickets:[ticket('DEV-001','src/audio/**'),ticket('DEV-002','src/render/**'),ticket('DEV-003','src/ui/**')]});
test('six total sessions allow five useful workers including UI/UX',()=>{const b=board();b.max_active_sessions=6;b.tickets.push(ticket('DEV-004','src/other/**'),{...ticket('UX-001','work/design/**'),owner:'ui-ux',scheduling:{enabled:true,role:'ui-ux',write_paths:['work/design/**'],ready_at:now}});const p=planAssignments(b);assert.equal(p.capacity_children,5);assert.equal(p.assignments.length,5);assert.ok(p.assignments.some(t=>t.role==='ui-ux'));});
test('three independent developers fill three slots',()=>assert.equal(planAssignments(board()).assignments.length,3));
test('active developer does not cause wait-all barrier',()=>{const b=board();b.runtime.sessions=[{session_id:'s1',task_id:'DEV-001',role:'developer',status:'running',write_paths:['src/audio/**']}];assert.equal(planAssignments(b).assignments.length,2);});
test('unknown ownership blocks unsafe parallel writes',()=>{const b=board();b.runtime.sessions=[{task_id:'x',status:'running'}];assert.equal(planAssignments(b).assignments.length,0);assert.ok(pathsConflict(['src/**'],['src/ui/file.ts']));});
test('stale state never means empty slots',()=>{const b=board();b.runtime.observed_at='2026-11-05T11:00:00Z';assert.equal(planAssignments(b).status,'reconcile-runtime');});
test('overdue release takes available slot',()=>{const b=board();b.max_active_sessions=2;b.tickets.push({...ticket('REL-001','integration/**'),status:'accepted',scheduling:{enabled:true,write_paths:['integration/**'],ready_at:'2026-11-05T11:00:00Z'}});assert.equal(planAssignments(b).assignments[0].role,'release-engineer');});
test('conflicting developers not dispatched and dependencies honored',()=>{const b=board();b.tickets[1].scheduling.write_paths=['src/audio/x.ts'];b.tickets[2].dependencies=['DEV-001'];assert.equal(planAssignments(b).assignments.length,1);});

