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
