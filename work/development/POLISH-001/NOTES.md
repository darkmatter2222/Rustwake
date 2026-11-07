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
