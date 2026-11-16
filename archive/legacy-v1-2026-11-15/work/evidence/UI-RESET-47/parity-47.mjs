// Bidirectional PNG/receipt parity for UI-RESET-47 (#81 P0-3).
// Run from the worktree root after the capture harnesses:
//   node work/evidence/UI-RESET-47/parity-47.mjs
// Every PNG in captures/ must have exactly one entry across the three PNG receipts, and every
// receipt entry must name an existing PNG. A press field is mandatory on every entry: `presses`
// (shipped-shell painted-face activations) or `pressed` (the prototype's own counter). The
// tap-budget receipt is intentionally mixed (app frames use presses, prototype frames pressed).
// Writes captures/parity.json and exits 1 on any mismatch. measures-nav.json is a band-layout
// receipt, not a PNG receipt.
import fs from 'node:fs';
const d = 'work/evidence/UI-RESET-47';
const receipts = [
  { file: 'captures/captures-nav.json', pressField: 'presses' },
  { file: 'captures/captures-proto.json', pressField: 'pressed' },
  { file: 'captures/captures-tbudget.json', pressField: 'presses|pressed' }
];
const pngs = fs.readdirSync(d + '/captures').filter((f) => f.endsWith('.png')).sort();
const entries = [];
for (const r of receipts) {
  const j = JSON.parse(fs.readFileSync(d + '/' + r.file, 'utf8'));
  for (const c of j.captures) entries.push({ receipt: r.file, pressField: r.pressField, ...c });
}
const byName = new Map();
for (const e of entries) byName.set(e.file, (byName.get(e.file) ?? 0) + 1);
const pngsWithoutEntry = pngs.filter((f) => !byName.has(f));
const entriesWithoutPng = [...byName.keys()].filter((f) => !pngs.includes(f)).sort();
const duplicateEntries = [...byName.entries()].filter(([, n]) => n > 1).map(([f, n]) => ({ file: f, count: n })).sort((a, b) => a.file.localeCompare(b.file));
const pressValue = (e) => (typeof e.presses === 'number' ? { field: 'presses', value: e.presses } : typeof e.pressed === 'number' ? { field: 'pressed', value: e.pressed } : null);
const missingPress = entries.filter((e) => pressValue(e) === null).map((e) => ({ file: e.file, receipt: e.receipt }));
const ok = pngsWithoutEntry.length === 0 && entriesWithoutPng.length === 0 && duplicateEntries.length === 0 && missingPress.length === 0;
const headSha = JSON.parse(fs.readFileSync(d + '/captures/captures-nav.json', 'utf8')).headSha;
const report = {
  task: 'UI-RESET/NAV #47 PNG/receipt parity (#81 P0-3)',
  issue: 'https://github.com/darkmatter2222/Rustwake/issues/47',
  headSha,
  headShaConvention: 'stamped by stamp-headsha-47.mjs to the captures commit; see README.md',
  tool: 'parity-47.mjs',
  receipts: receipts.map((r) => ({ file: r.file, entries: entries.filter((e) => e.receipt === r.file).length, pressField: r.pressField })),
  pngCount: pngs.length,
  entryCount: entries.length,
  pressFieldCounts: { presses: entries.filter((e) => typeof e.presses === 'number').length, pressed: entries.filter((e) => typeof e.pressed === 'number' && typeof e.presses !== 'number').length },
  pngsWithoutEntry,
  entriesWithoutPng,
  duplicateEntries,
  missingPress,
  ok
};
fs.writeFileSync(d + '/captures/parity.json', JSON.stringify(report, null, 2) + '\n');
console.log('PNGs=' + pngs.length + ' entries=' + entries.length + ' pngsWithoutEntry=' + JSON.stringify(pngsWithoutEntry) + ' entriesWithoutPng=' + JSON.stringify(entriesWithoutPng) + ' duplicates=' + JSON.stringify(duplicateEntries) + ' missingPress=' + JSON.stringify(missingPress));
console.log(ok ? 'PARITY-OK: every PNG has exactly one receipt entry and vice versa; all press fields present' : 'PARITY-FAIL');
process.exit(ok ? 0 : 1);
