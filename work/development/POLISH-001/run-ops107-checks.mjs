// POLISH-001 / OPS-107 instrument: does a no-op rerun of an evidence harness leave a
// line-ending-only diff behind?
//
// The belt harness named in the assignment (`scripts/probe-belt.mjs` ->
// `work/feedback/belt001-harness.json`) is not in this tree: it exists only on the BELT-001
// lane (commits 5eb4be6 / 5d5238b, `git log --all -- <path>`). The nearest in-tree analogue
// with the same shape - a tracked JSON evidence file a harness rewrites from scratch - is
// `work/feedback/strat001-labels.mjs` -> `work/feedback/strat001-labels.json`, so that is the
// one driven here. Same procedure, same file class (*.json).
//
// Run from the repository root, once with `.gitattributes` moved aside (before) and once with
// it in place (after):
//   node work/development/POLISH-001/run-ops107-checks.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const FILE = 'work/feedback/strat001-labels.json';
const HARNESS = 'work/feedback/strat001-labels.mjs';
const cr = s => (s.match(/\r/g) || []).length;

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).replace(/\r?\n$/, '');
const census = () => {
  const t = fs.readFileSync(FILE, 'utf8');
  const blob = git('hash-object', FILE);
  const head = git('rev-parse', `HEAD:${FILE}`);
  return `bytes=${Buffer.byteLength(t)} CR=${cr(t)} blob=${blob.slice(0, 12)} headBlob=${head.slice(0, 12)} ${blob === head ? 'MATCHES' : 'DIFFERS'}`;
};
const status = label => {
  const lines = git('status', '--short', '--', FILE);
  const again = git('status', '--short', '--', FILE);
  const diff = git('diff', '--stat', '--', FILE);
  console.log(`  ${label}: status "${lines.replace(/\n/g, ' | ') || '(clean)'}"` +
    `  repeated status "${again.replace(/\n/g, ' | ') || '(clean)'}"` +
    `  diff "${diff.replace(/\n/g, ' | ') || '(empty)'}"`);
  console.log(`    ${FILE}: ${census()}`);
};
const harness = () => execFileSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', HARNESS], { encoding: 'utf8' });

console.log(`attributes for ${FILE}: ${git('check-attr', 'text', 'eol', '--', FILE).replace(/\n/g, ' | ')}`);

console.log(`\n[1] forced fresh-checkout shape (delete + git checkout)`);
fs.rmSync(FILE);
git('checkout', '--', FILE);
status('after checkout');

console.log(`\n[2] first harness run (rewrites ${FILE})`);
harness();
status('after run 1');

console.log(`\n[3] second harness run - a no-op on identical content`);
harness();
status('after run 2');

console.log(`\n[4] third harness run - still a no-op`);
harness();
status('after run 3');

console.log(`\ngitattributes present: ${fs.existsSync('.gitattributes')}`);
if (fs.existsSync('.gitattributes')) console.log(fs.readFileSync('.gitattributes', 'utf8').trim());
