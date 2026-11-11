# UI-RESET/NAV (#47) - folder index

Issue: https://github.com/darkmatter2222/Rustwake/issues/47 - follow-up #81
https://github.com/darkmatter2222/Rustwake/issues/81.
Branch `rw/81-nav-parity-g1`, base `a365c192926087796bd6ba25a263816a53804418`.

This folder has **one painted prototype entry point** (`prototype-nav.html`) and **one spec
file** (`navigation-spec.md`). #81 deleted the legacy `prototype.html`, `prototype.js`,
`nav-spec.md` and the scratch `proto-tmp.txt`. Every PNG has exactly one receipt entry and
every receipt entry has exactly one PNG (48 = 48, both name diffs empty; see
`captures/parity.json`). Every number in the spec and the press budget is tagged **measured**
(with its source receipt) or **specified** (with its section) in `navigation-spec.md` section 9.

## Committed file groups (real counts, for 1:1 reviewer verification)

| group | count | files | what it is |
|---|---|---|---|
| Spec | 1 | `navigation-spec.md` | the single spec: destinations per tutorial stage, one primary action per frame, the one printed command format, portrait/landscape/narrow-laptop/desktop navigation, stack and focus rules, the destination of every existing action, the press budget, and the section 9 measured/specified numeric table |
| Prototype entry | 1 | `prototype-nav.html` | the one painted entry point: five nav slots, one action band, one sheet, machine/store/research/menu bodies, the fork, locked slots with reasons, its own press counter (`window.RW47`). Open over `file://` with `?seed=fresh` or `?seed=mature` |
| Press-budget doc | 1 | `tap-budget.md` | the instrumented press budget of the shipped path and the model path against the #45 budget of 16 presses at 0.00 batches/s, with the auto-settle decomposition |
| Index | 1 | `README.md` | this file |
| Harnesses (`.mjs`) | 8 | see table below | the scripts that regenerate every receipt |
| Shipped PNGs | 25 | `captures/01-nav-*` .. `captures/25-nav-*` | the shipped shell at each step of the spec path and at 360x640, 844x390, 1366x768, 1920x1080, 2560x1440 |
| Prototype PNGs | 19 | `captures/30-proto-*` .. `captures/48-proto-*` | the painted prototype at the same steps and six bands |
| Tap-budget PNGs | 4 | `captures/60-tbudget-app-machine`, `61-tbudget-app-production`, `62-tbudget-proto-machine`, `63-tbudget-proto-store` | the dedicated instrumented budget run, app and model |
| **PNG total** | **48** | 25 + 19 + 4 | one PNG per receipt entry |
| PNG receipts | 3 | `captures/captures-nav.json` (25 entries, press field `presses`), `captures/captures-proto.json` (19 entries, press field `pressed`), `captures/captures-tbudget.json` (4 entries, mixed `presses`/`pressed`) | one entry per PNG with the press count, painted text, rects and (shipped) sim snapshot |
| Band geometry receipt | 1 | `captures/measures-nav.json` | shipped band rects and the under-44 face inventory for rest/store/research at all six bands (non-PNG receipt) |
| Parity receipt | 1 | `captures/parity.json` | the bidirectional PNG-to-entry diff, duplicate check, missing-press check and press-field counts |
| Derived prototype measures | 1 | `measures.json` | per-frame clip check (`clipOK`), cluster right edge vs viewport, tap-target inventory and band overlaps, derived from `captures-proto.json` |
| Instrumented budget data | 1 | `tap-budget.json` | the committed model-path and app-path press counts, auto-settle decomposition and production reading behind `tap-budget.md` |

Folder total: 67 committed files (3 `.md` + 1 `.html` + 8 `.mjs` + 2 top-level `.json` +
48 `.png` + 5 `captures/*.json`). Deleted in #81: `prototype.html`, `prototype.js`,
`nav-spec.md`, `proto-tmp.txt`.

### The 8 harnesses

| harness | needs | writes |
|---|---|---|
| `capture-nav-47.mjs` | preview server (4173) | 25 PNGs + `captures/captures-nav.json` |
| `measure-nav-47.mjs` | preview server (4173) | `captures/measures-nav.json` |
| `capture-proto-47.mjs` | none (`file://`) | 19 PNGs + `captures/captures-proto.json` |
| `tap-budget-47.mjs` | none (self-serves `dist/` on 127.0.0.1:4175; prototype over `file://`) | 4 PNGs + `captures/captures-tbudget.json` + `tap-budget.json` |
| `measures-from-captures.mjs` | none (reads `captures-proto.json`) | `measures.json` |
| `parity-47.mjs` | none (reads the 3 PNG receipts, lists `captures/*.png`) | `captures/parity.json`; exits 0 only on 1:1 parity |
| `dom-shim-47.mjs` | none (node `vm` + minimal DOM, no browser) | stdout painted-root proof for `prototype-nav.html` |
| `stamp-headsha-47.mjs` | none (node + `git rev-parse`) | stamps the captures-commit SHA into the 7 receipts (metadata only) |

## headSha convention (two-commit stamp)

A receipt cannot contain the SHA of the commit that introduces it, so this folder uses two
commits:

1. **Commit A (the captures commit)** regenerates every PNG, receipt, spec and doc with
   `headSha: "pending-stamp"`.
2. `stamp-headsha-47.mjs` writes commit A's full 40-char SHA into the `headSha` field of the
   **7 receipts** by raw-text replacement (formatting preserved, parse-back verified):
   `captures/captures-nav.json`, `captures/captures-proto.json`,
   `captures/captures-tbudget.json`, `captures/measures-nav.json`, `captures/parity.json`,
   `measures.json`, `tap-budget.json`.
3. **Commit B is metadata-only**: it changes nothing but those `headSha` lines.

For the published PR: **PR head = commit B**, and **`headSha` in every receipt = commit A =
`B^`** (the parent of the PR head). Verify at the PR head with `git rev-parse HEAD^` and
compare to any receipt's `headSha`; `git show --stat HEAD` should show only the 7 receipt
files with single-line `headSha` changes.

## Rebuild (from the repo root)

```sh
npm ci && npm run build
# second shell - only capture-nav and measure-nav need it (binds localhost):
node node_modules/vite/bin/vite.js preview --port 4173 --strictPort

node work/evidence/UI-RESET-47/capture-nav-47.mjs          # 25 PNGs + captures-nav.json
node work/evidence/UI-RESET-47/measure-nav-47.mjs          # captures/measures-nav.json
node work/evidence/UI-RESET-47/capture-proto-47.mjs        # 19 PNGs + captures-proto.json
node work/evidence/UI-RESET-47/tap-budget-47.mjs           # 4 PNGs + captures-tbudget.json + tap-budget.json
node work/evidence/UI-RESET-47/measures-from-captures.mjs  # measures.json
node work/evidence/UI-RESET-47/parity-47.mjs               # captures/parity.json (exit 0 = parity)
node work/evidence/UI-RESET-47/dom-shim-47.mjs             # node-only painted-root proof

# after commit A exists, stamp its SHA into the 7 receipts, then commit B (metadata only):
node work/evidence/UI-RESET-47/stamp-headsha-47.mjs
```

`RUSTWAKE_URL` overrides the preview URL for the two shipped harnesses; `RUSTWAKE_SHA`
overrides the pre-stamp `headSha`; `STAMP_SHA` overrides the SHA the stamp script writes.
The browser harnesses use `playwright-core` with a local Chrome/Edge (`CHROME_PATH` override).

## Scope

Nothing in `src/` is touched by this issue: the shell changes are specified here and owned by
#49, the camera bands by #50 and the HUD by #51. `UI-RESET-45/`, `UI-RESET-46/` and
`UI-RESET-48/` are read-only predecessors; their receipts are cited, not edited. The prototype
is a self-contained model of the specified shell, not the engine path - the shipped figures
come from the built app under `dist/`, the model figures from `prototype-nav.html`.
