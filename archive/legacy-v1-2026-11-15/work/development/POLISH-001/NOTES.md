# POLISH-001 — three ledger rows in one pass

Base: `main = 1573ac107acc3c9c0bed8e9eafffbd1b9ea3bca2` (branch `rw/polish-g1`, Windows,
`core.autocrlf=true`, no `.gitattributes` at base). Instrument: `scripts/measure-ui002.mjs`
(the copy named in the assignment, `work/development/UI-002-g1/measure-ui002.mjs`, is not in
this tree — only its printed output `work/development/UI-002-g1/measure-ui002.txt` is; the
instrument itself lives in `scripts/`).

## DEF-009 — the store chip prints `Store900/900`

Fix: one character in `src/game/content/strings.ts`, `"chip.store": "Store"` → `"Store "`.
`Hud.tsx:70-73` renders the label and the `{units}/{capacity}` pair as two adjacent text
children, so the separator has to be in the string (release-owned `src/ui/**` untouched).

Printed before/after, same instrument, same four `rest` cells
(`measure-before-DEF009.txt` / `measure-after-DEF009.txt`):

| cell | chips, before | chips, after | card fill before | card fill after |
|---|---|---|---|---|
| 360x640 ts1 2-machine | `Store900/900` | `Store 900/900` | 13 % | 13 % |
| 360x640 ts2 2-machine | `Store900/900` | `Store 900/900` | 38.1 % | 38.1 % |
| 390x844 ts1 4-machine | `Store900/900` | `Store 900/900` | 9.9 % | 9.9 % |
| 390x844 ts2 4-machine | `Store900/900` | `Store 900/900` | 24.8 % | 24.8 % |

Every measured value is byte-for-byte the same as the lane's quoted values
(13 / 38.1 / 9.9 / 24.8 %), so the 42 % cap keeps its full 0.2 pp margin at the deepest cell
(41.8 %, the fork pass, quoted from `work/development/UI-002-g1/measure-ui002.txt` and
re-run in full at the end of this lane). The chip matches `^Store \d+/\d+$` in all four cells.

Entry chunk: `index-C_K4oMJ5.js` 231262 B at base → `index-C3IyXD3g.js` 231263 B after
(+1 B = the one space character; ceiling 233000 B, headroom 1737 B).

## DEF-007 — `team-board --check` reports a current view as stale on a CRLF working copy

Fix in `scripts/team-board.mjs`, comparison only: a new `eol()` helper folds `\r\n`/`\r` to
`\n` on **both sides** of the `--check` compare. The generator's write path is untouched, so a
regeneration still emits LF, and CI's ubuntu checkout (already LF) is unaffected because the
fold is the identity there.

Printed evidence — `run-def007-checks.mjs`, output in `team-board-check-DEF007.txt`. Two
scratch trees hold the same bytes in the shape each host writes them, each with the base
script (`git show 1573ac1:scripts/team-board.mjs`) and the fixed one side by side:

```
=== scratch/crlf (working-copy line endings: CRLF) ===       <- fresh Windows checkout shape
  census  work/backlog.json 211357B CR=3519 | work/BOARD.md 8020B CR=72 | work/board.html 62982B CR=1
  base  team-board --check  exit 1  "Stale generated file: work/BOARD.md / work/board.html"
  fixed team-board --check  exit 0  "Team board valid; generated views current"
  stale  work/BOARD.md: byte 2 'R'->'S' (8020 -> 8020 bytes)
  fixed team-board --check  exit 1  "Stale generated file: work/BOARD.md"     <- still stale
  base  team-board --check  exit 1  "Stale generated file: work/BOARD.md / work/board.html"

=== scratch/lf (working-copy line endings: LF) ===            <- CI shape, verdict unchanged
  census  work/backlog.json 207838B CR=0 | work/BOARD.md 7948B CR=0 | work/board.html 62981B CR=0
  base  team-board --check  exit 0    fixed team-board --check  exit 0
  stale  work/BOARD.md: byte 2 'R'->'S' (7948 -> 7948 bytes)
  fixed team-board --check  exit 1  "Stale generated file: work/BOARD.md"     <- still stale
  base  team-board --check  exit 1  "Stale generated file: work/BOARD.md"

=== this worktree (core.autocrlf=true, working copy still CRLF) ===
  node scripts/team-board.mjs --check  exit 0  "Team board valid; generated views current"
```

Before on this machine: exit 1, `Stale generated file: work/BOARD.md` (measured at base, and
reproduced as the `base … exit 1` line above). After: exit 0 with **no manual regeneration** —
`git status --short` shows only the owned files, the generated views were never rewritten. A
single content byte in `work/BOARD.md` (same byte count, first difference at offset 2) still
returns exit 1 and names the one file. The measured CR counts differ slightly from the values
quoted in the assignment (72 vs 57, 3519 vs 2422) because this tree is one commit newer than
the quoted base: `47fa9f4` → `1573ac1` added ledger rows to the same views.

`node --test scripts/team-*.test.mjs …` (the CI step that covers these scripts — `npx vitest
run` does not include `scripts/**`, its include list is `tests/**`): 59 pass, 0 fail, exit 0.

## OPS-107 — `.gitattributes` for the generated evidence JSONs

New file `.gitattributes` (3 comment lines + 2 rules):

```
*.json text eol=lf
*.md text eol=lf
```

`*.md` is included because it keeps the diff quiet: all 188 tracked `.md`/`.json` blobs are
already LF in the object store (`git cat-file blob HEAD:<f>` → 0 CR bytes in every one), so
pinning the conversion reproduces the stored bytes instead of renormalising them, and the
whole-tree `git status --short` after the change still lists only this lane's own files — no
renormalisation flood.

Named-in-assignment caveat: `scripts/probe-belt.mjs` / `work/feedback/belt001-harness.json`
are **not in this tree** — they exist only on the BELT-001 lane (`git log --all -- …` →
`5eb4be6`, `5d5238b`). The same-shaped in-tree harness `work/feedback/strat001-labels.mjs` →
`work/feedback/strat001-labels.json` (same `*.json` class, also a from-scratch rewrite) is
driven instead, three times in a row, by `run-ops107-checks.mjs`.

Before (`gitattributes-before-OPS107.txt`, no `.gitattributes`, `text: unspecified`):

```
[1] after forced checkout : status "(clean)"   28988B CR=1601  blob=3074af38ac0f MATCHES
[2] after run 1           : status " M work/feedback/strat001-labels.json"  diff "(empty)"  27387B CR=0  blob=3074af38ac0f MATCHES
[3] after run 2 (no-op)   : status " M work/feedback/strat001-labels.json"  diff "(empty)"  27387B CR=0  …
[4] after run 3 (no-op)   : status " M work/feedback/strat001-labels.json"  diff "(empty)"  27387B CR=0  …
```

The ` M` survives three consecutive runs and a repeated `git status` (it is not a one-shot
stat-cache artefact), while `git diff` is empty and `git hash-object` equals the HEAD blob:
a line-ending-only phantom modification (28988 → 27387 bytes = exactly the 1601 CR bytes),
plus one `warning: … LF will be replaced by CRLF` line per run.

After (`gitattributes-after-OPS107.txt`, `text: set`, `eol: lf`):

```
[1] after forced checkout : status "(clean)"   27387B CR=0
[2] after run 1           : status "(clean)"   27387B CR=0  blob MATCHES
[3] after run 2 (no-op)   : status "(clean)"   27387B CR=0  blob MATCHES
[4] after run 3 (no-op)   : status "(clean)"   27387B CR=0  blob MATCHES
```

A fresh checkout now materialises LF, so the harness rewrite is byte-identical and every no-op
rerun is clean; the autocrlf warning noise is gone too. Files that were already materialised
before the attribute landed keep their CRLF bytes (72 CR in `work/BOARD.md`, 3519 in
`work/backlog.json`) and stay clean through checkin normalisation.

`node scripts/team-board.mjs --check` verdict is the **same on both sides of this change**:
exit 0 (`Team board valid; generated views current`) before `.gitattributes` existed and after
it exists — the DEF-007 comparison fix owns the CRLF case, so the two fixes do not shift the
verdict. CI is unaffected: on an LF checkout the fold is the identity and the attribute asks
for exactly the bytes CI already has.

## Gates on the final SHA (all exit codes printed from the real processes)

| step | exit | printed |
|---|---|---|
| `npm run typecheck` | 0 | (`gate-typecheck.txt`) |
| `npx vitest run` | 0 | `Test Files 28 passed (28)` / `Tests 287 passed (287)` |
| `npm run validate` | 0 | `content: 0 violation(s)`, `behaviour: … \| 0 violation(s)`, `validated: no violations` |
| `npm run build` | 0 | `assets/index-C3IyXD3g.js 231.22 kB` |
| `node scripts/team-board.mjs --check` | 0 | `Team board valid; generated views current` |
| `node --test scripts/*.test.mjs … tools/team-supervisor/*.test.mjs` | 0 | `# tests 59 / # pass 59 / # fail 0` |

Entry asset against the ceiling: **`index-C3IyXD3g.js` = 231263 B** vs **233000 B** → headroom
**1737 B**. Growth versus the base build (`index-C_K4oMJ5.js`, 231262 B) is **+1 B**, which is
exactly the one added space character in the string table; `.gitattributes` and the `scripts/**`
checker are outside the bundle (0 B), and the asset hash changed because the string table is
inlined in the entry chunk.

Full instrument, all four passes (`measure-full-after-DEF009.txt`, exit 0, deepest cell
included): `13 / 38.1 / 9.9 / 24.8 %` in the four `rest` cells and **41.8 %** in the fork-open
cell — the deepest value the lane quoted, unchanged, still under the 42 % cap with 0.2 pp of
margin. `Store 900/900` appears 4 times, `Store900/900` 0 times.

### One observed layout consequence of the space (printed, not guessed)

`Compare-Object` of the two `rest` prints shows exactly three geometry lines changed, all in
the `360x640 ts2 2-machine` cell: the card's ink moved down by **28.97 px**
(`line0 ink 114.91..255.47` → `143.88..284.44`, `line2 … 349.91` → `378.88`). Cause, from the
stylesheet: `.resources` is `flex-wrap: wrap` and `.text-large .resources__item` has
`line-height: 1.15`, so at the ts2 pill font 25.2 px one chip line is 25.2 × 1.15 = **28.98 px**
— the chip row takes one extra wrapped line once the label is one character wider. Consequences:
the U-1 ratio is untouched (its denominator is the content box, 640, not the HUD), the card's own
box is byte-identical (`sh139/ch137`, `wrappedBoxes 4` in both runs), and the card ink bottom at
378.88 px still clears the dock row (faces at top 586 px) by 207 px. Deepest fill stays 41.8 %.

## What stays unverified in this lane

- Audio is decoded, not played: no listening pass on the decoded cues (no human ear in this run).
- Real-device p95 frame timings unrun: the numbers above are desktop chromium at DPR 2 against the `vite preview` artifact.
- Human second rater unrun: the 42 % card-fill verdict is the instrument's own ratio, not a second human rating.
- `npx vitest run` prints 287 tests because `scripts/**` is outside its include list; the `.mjs` script tests only run under `node --test` (CI step 2), which is why the DEF-007 fix carries its own driver instead of a unit test in a file vitest never loads.
- `work/backlog.json` / `work/BOARD.md` are release-owned and untouched, so the DEF-009 / DEF-007 / OPS-107 ledger rows still read their pre-integration state at these SHAs.
