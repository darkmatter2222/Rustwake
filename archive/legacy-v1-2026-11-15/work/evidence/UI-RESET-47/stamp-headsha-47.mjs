// Metadata-only headSha stamp for UI-RESET-47 receipts (#81 P0-3 two-commit convention).
// Run from the worktree root AFTER the captures commit exists:
//   node work/evidence/UI-RESET-47/stamp-headsha-47.mjs
// Sets headSha in every receipt to `git rev-parse HEAD` (the captures commit). The stamp itself is
// a second, metadata-only commit, so the final PR head is the stamp commit and headSha = head^.
// Only the headSha field is touched; no measurement is regenerated here. Override with STAMP_SHA.
import fs from 'node:fs';
import { execSync } from 'node:child_process';
const d = 'work/evidence/UI-RESET-47';
const sha = process.env.STAMP_SHA ?? execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
if (!/^[0-9a-f]{40}$/.test(sha)) { console.error('not a full commit SHA: ' + sha); process.exit(1); }
const files = [
  'captures/captures-nav.json',
  'captures/captures-proto.json',
  'captures/captures-tbudget.json',
  'captures/measures-nav.json',
  'captures/parity.json',
  'tap-budget.json',
  'measures.json'
];
let changed = 0;
for (const f of files) {
  const p = d + '/' + f;
  const raw = fs.readFileSync(p, 'utf8');
  const j = JSON.parse(raw);
  if (j.headSha === sha) { console.log('unchanged ' + f); continue; }
  const before = j.headSha;
  // Replace only the headSha value in the raw text so formatting and every other byte stay put.
  const next = raw.replace(/"headSha":\s*(?:"[^"]*"|null)/, '"headSha": "' + sha + '"');
  if (JSON.parse(next).headSha !== sha) { console.error('stamp failed for ' + f); process.exit(1); }
  fs.writeFileSync(p, next);
  changed += 1;
  console.log('stamped ' + f + ' ' + before + ' -> ' + sha);
}
console.log('headSha=' + sha + ' filesStamped=' + changed + '/' + files.length);
