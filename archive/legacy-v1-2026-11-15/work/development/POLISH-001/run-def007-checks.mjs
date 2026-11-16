// POLISH-001 / DEF-007 instrument: does the `--check` verdict depend on line endings, and
// does a genuinely stale view still fail?
//
// Two scratch trees are materialised from the *current* working copy, in the shape a fresh
// checkout takes on each host:
//   crlf/  bytes as a Windows `core.autocrlf=true` checkout writes them (CRLF working files)
//   lf/    bytes as CI writes them (LF working files)
// Each holds both the base script (`git show <base>:scripts/team-board.mjs`) and the fixed
// one, so the printed pair is the same process on the same bytes with one difference.
//
// Run: node work/development/POLISH-001/run-def007-checks.mjs
import { execFileSync, execFileSync as _x } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const scratch = 'C:\\Users\\ryans\\AppData\\Local\\Temp\\opencode\\polish001-scratch';
const BASE = '1573ac107acc3c9c0bed8e9eafffbd1b9ea3bca2';
const files = ['scripts/team-metrics.mjs', 'work/backlog.json', 'work/BOARD.md', 'work/board.html'];
const cr = s => (s.match(/\r/g) || []).length;

const materialise = flavour => {
  const dir = path.join(scratch, flavour);
  fs.rmSync(dir, { recursive: true, force: true });
  for (const rel of files) {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    const out = flavour === 'lf' ? text.replace(/\r\n/g, '\n') : text;
    const target = path.join(dir, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, out);
  }
  // the base version of the checker, straight from the object store
  const baseScript = execFileSync('git', ['show', `${BASE}:scripts/team-board.mjs`], { encoding: 'utf8' });
  fs.writeFileSync(path.join(dir, 'scripts/team-board-base.mjs'), flavour === 'lf' ? baseScript : baseScript.replace(/\n/g, '\r\n'));
  const fixedScript = fs.readFileSync(path.join(root, 'scripts/team-board.mjs'), 'utf8');
  fs.writeFileSync(path.join(dir, 'scripts/team-board-fixed.mjs'), flavour === 'lf' ? fixedScript : fixedScript.replace(/\n/g, '\r\n'));
  return dir;
};

const run = (dir, script) => {
  try {
    const out = execFileSync('node', [path.join(dir, 'scripts', script), '--check'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out: out.trim() };
  } catch (e) {
    return { code: e.status ?? 1, out: `${(e.stdout || '').trim()} ${(e.stderr || '').trim()}`.trim() };
  }
};

const census = dir => files.map(f => {
  const t = fs.readFileSync(path.join(dir, f), 'utf8');
  return `${f} ${Buffer.byteLength(t)}B CR=${cr(t)}`;
}).join(' | ');

const flipOneByte = (dir, rel) => {
  const target = path.join(dir, rel);
  const before = fs.readFileSync(target, 'latin1');
  const at = before.indexOf('Rustwake');
  const after = before.slice(0, at) + 'S' + before.slice(at + 1);
  fs.writeFileSync(target, after, 'latin1');
  return `${rel}: byte ${at} 'R'->'S' (${before.length} -> ${after.length} bytes, first differing offset ${at})`;
};

for (const flavour of ['crlf', 'lf']) {
  const dir = materialise(flavour);
  console.log(`\n=== scratch/${flavour} (working-copy line endings: ${flavour.toUpperCase()}) ===`);
  console.log(`  census  ${census(dir)}`);
  const before = run(dir, 'team-board-base.mjs');
  console.log(`  base  team-board --check  exit ${before.code}  "${before.out}"`);
  const after = run(dir, 'team-board-fixed.mjs');
  console.log(`  fixed team-board --check  exit ${after.code}  "${after.out}"`);
  console.log(`  stale  ${flipOneByte(dir, 'work/BOARD.md')}`);
  const stale = run(dir, 'team-board-fixed.mjs');
  console.log(`  fixed team-board --check  exit ${stale.code}  "${stale.out}"   <- one content byte changed`);
  const staleBase = run(dir, 'team-board-base.mjs');
  console.log(`  base  team-board --check  exit ${staleBase.code}  "${staleBase.out}"   <- same stale view, base script`);
}
console.log('\n=== this worktree (Windows checkout, core.autocrlf=true) ===');
for (const [tag, script] of [['base', 'work/development/POLISH-001/../..//scripts/team-board.mjs']]) void tag;
const tree = (() => {
  try {
    const out = execFileSync('node', ['scripts/team-board.mjs', '--check'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out: out.trim() };
  } catch (e) {
    return { code: e.status ?? 1, out: `${(e.stdout || '').trim()} ${(e.stderr || '').trim()}`.trim() };
  }
})();
console.log(`  node scripts/team-board.mjs --check  exit ${tree.code}  "${tree.out}"`);
console.log(`  working-copy census  ${files.map(f => `${f} CR=${cr(fs.readFileSync(path.join(root, f), 'utf8'))}`).join(' | ')}`);
