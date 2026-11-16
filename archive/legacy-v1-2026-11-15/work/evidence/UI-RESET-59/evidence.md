# UI-RESET #59 — logistics presentation acceptance evidence (developer)

**Role:** developer (dev-59d, resume of dev-59c). This is the DEVELOPER's
delivery evidence for a DRAFT PR. It is NOT an acceptance verdict: independent
QA (ACCEPT/REWORK at the exact head SHA), product (outcome decision) and
release-engineer (merge + CI/deploy) are SEPARATE later personas. No self-review
is claimed; nothing is merged and nothing is deployed.

Issue: https://github.com/darkmatter2222/Rustwake/issues/59
Branch: `rw/59-logistics`
Delivered head SHA: `937698e424232c395abf9f682edbafc3495239f2`
Merge-base with origin/main: `7372edd` (11 implementation commits; this evidence
file is an evidence-only tail — `src/` is unchanged from `937698e`).

## Build under test (proven at run time; branch's OWN app, not the live site)

The probe ran against this branch's own production `dist/` served by
`vite preview --port 4195 --strictPort --host 127.0.0.1` from the worktree root.
It did NOT run against the deployed live site.

- Base URL: `http://127.0.0.1:4195/`
- Served entry: `assets/index-J-huZ0_n.js`, **167885 bytes**,
  sha256 `aae64f98c3acd0ffad7772a7a1107bd85a0da5f80fac72a6a394dfde39821ff1`.
  Under the 233000-byte entry-chunk ceiling.
- **Served-entry SHA parity (three-way, exact):**
  - built `dist/assets/index-J-huZ0_n.js` = 167885 B, sha256 `aae64f98…821ff1`
  - mirrored `served-entry-index-J-huZ0_n.js` = 167885 B, sha256 `aae64f98…821ff1`
  - HTTP-downloaded bytes (`System.Net.WebClient.DownloadData` -> SHA256,
    binary-safe) = 167885 B, sha256 `aae64f98…821ff1`
  - `index.html` resolves to `index-J-huZ0_n.js`.
- `probe.mjs` in this directory is BYTE-IDENTICAL to the committed
  `tests/ui/logistics-59.probe.mjs` (sha256
  `b2ee385cd85c3d91396b25af839007c0ccc6fc7accbaff23b6448843d25cb66c`).
- `results.json.buildSha == 937698e424232c395abf9f682edbafc3495239f2` (== head).
  Mirrored copies: `served-index.html`, `served-entry-index-J-huZ0_n.js`.

## Method (no vision; DOM/geometry/persisted-state/pixel-census authoritative)

`playwright-core` headless Chrome drives the real UI. The developer cannot see
images: every claim below is a DOM / geometry / console assertion or a canvas
pixel census captured by `probe.mjs`; the PNGs are hashed mirror artifacts only,
not visually inspected. Each loop step records a before/after `{sim, dom}`
snapshot plus before/after PNG frames and asserts named checks. `sim` is read
from the game's OWN persistence mirror
(`localStorage["rustwake.save.v1"].payload.sim`), written on every ok dispatch.
Selection is driven by real canvas taps
(`App.applyGestureOutput -> pickTarget -> setSelected`); every mutation flows
through panel buttons/selects -> `props.dispatch -> applyCommand`. No action is
faked by injection.

Form factors (each runs ALL five scenario loops in one build):
- **phone**: 390x844, deviceScaleFactor 2, portrait (frames 780x1688).
- **phoneland**: 844x390, deviceScaleFactor 2, landscape rail (frames 1688x780).
- **desktop**: 1920x1080, deviceScaleFactor 1, rail (frames 1920x1080).

Reproduce (from the worktree root so `node_modules` resolves; build + preview
first):
```
pnpm build
pnpm preview --port 4195 --strictPort --host 127.0.0.1   # background, cwd=worktree
BASE_URL='http://127.0.0.1:4195/' \
RW59_SHA='937698e424232c395abf9f682edbafc3495239f2' \
RW59_EVID='work/evidence/UI-RESET-59' \
node tests/ui/logistics-59.probe.mjs
```
Outputs: `results.json`, `frames/<form>-<scenario>/<step>-{before,after}.png`,
mirrored `served-index.html` + `served-entry-index-J-huZ0_n.js`.

## Result summary (clean confirmatory run at head 937698e)

| metric | value |
|---|---|
| scenario loops | 5 per form factor (dense, zeroPower, missingInput, outputFull, saved-route/refund) |
| form factors | 3 (phone, phoneland, desktop) -> 15 clips |
| steps | 54 (18 per form factor) |
| checks | 228 / 228 pass |
| failed checks | 0 |
| console errors | 0 |
| page errors | 0 |
| blockers | 0 |
| frames | 108 |
| frame mirror audit | auditOk=true; distinct=true on all 15 clips |

`generatedAt` 2026-11-12T15:30:27Z. Frame audit: each frame's dimensions match
viewport x deviceScaleFactor, sha256 matches the value recorded at capture, and
byte length is non-empty; ordered sequences are distinct (not duplicate frames).

## Acceptance-criteria coverage (all five probed on all three form factors)

1. **Route direction, material and working/idle/blocked legend.**
   Checks: "legend present with working/idle/blocked + exact rail colors",
   "legend states the direction convention" (dashes flow toward the destination;
   arrowhead marks the receiving end), "legend lists exactly the 11 carried
   materials, scrap swatch first"
   (`Scrap, Ferrous, Nonferrous, Steel, Polymer, Residue, Copper, Wire, Plates,
   Circuits, Data`), "every laid link prints its direction (source ->
   destination)". Rail hue census: cyan working rail, orange blocked rail
   (corroborated by DOM route status), amber cargo tokens.
2. **Selection reveals related paths, de-emphasizes irrelevant, visibility
   toggle.** Steps `03-select-furnace-dims-unrelated`, `01-hide-routes`,
   `02-show-routes`. Visibility claim is strictly relative:
   `visible.cyan > hidden.cyan`, `hidden.cyan < 0.5*visible.cyan`, and the
   rail-band set diff (`railRemoved`) >= 10 pixels both when hiding (ink removed)
   and showing (ink restored); route count unchanged while hidden. Toggle keeps
   the 44px touch floor; panel stays inside the viewport (no horizontal
   overflow). Selection uses the EXISTING App `selected` sentinel (no App.tsx
   edit); the toggle lives in-panel (no Hud.tsx edit).
3. **Connect/disconnect/filter with cost/validity preview + cancel; unsupported
   capabilities mapped explicitly (no fake controls).** Checks: "controls expose
   connect/disconnect/filter honestly". Steps `04-custom-duplicate-preview`
   (cost/validity preview), `05-invalid-commit-rejected` (invalid preview cannot
   commit), `06-invalid-cancel` (cancel restores). The DOM maps the unsupported
   capability explicitly: "Changing a filter in place is not supported by the
   simulation." `RouteControls` is keyed by machine id so the custom-link form
   resets on selection swap (prices the correct endpoint pair).
4. **Production/power overview derived from state + bottleneck->machine route.**
   Checks: "overview derived from state (18 routes, power, machines)",
   "production overview derived from state (batches/s across 8 machines)"
   (e.g. `1.45 batches/s across 8 machines`), and
   `bottleneck-reveals-route-not-selection-swap`. Steps `01-reveal-power`
   (zeroPower) and `01-reveal-output` (outputFull) expose the power/output
   bottleneck and the route from each bottleneck to the affected machine.
5. **Tests for dense / zeroPower / missingInput / outputFull / saved-route+refund.**
   The five scenario loops below; plus the committed unit suite
   `tests/ui/logistics-59.test.tsx` (23 tests) in the vitest ladder.

## Five scenarios x three form factors (15 clips)

Per form factor the loop set is identical (18 steps):
- **dense** (7 steps, 00-06): 8 machines / 18 routes; open sorter inspector;
  hide/show routes; select furnace (dims unrelated); custom duplicate preview;
  invalid commit rejected; invalid cancel.
- **zeroPower** (2 steps, 00-01): ENGINE-DRIVEN — every machine mid-batch
  (progress=1, batchMilli=1e9), sorter batchPower raised to 2000 so the engine's
  `allocatePower` yields ratio 8/2015 (~0%) and `startBatches` marks all
  powerLimited; reveal power overview + bottleneck route.
- **missingInput** (1 step, 00): route 4 removed; open furnace; starved input
  surfaced.
- **outputFull** (2 steps, 00-01): ENGINE-DRIVEN — sorter tray filled to its
  outputBuffer (12) and output belts saturated so `enqueueCargo` keeps the tray
  full and the engine sets outputFull; reveal output overview + bottleneck route.
- **saved-route/refund** (6 steps, 00-05): uses the `partial` fixture (route 1
  removed, store scrap raised to 60, every drone parked repaired=false to stop
  scrap income). Connect a fresh belt through the real UI (engine prices its
  run): `01-connect-preview` -> `02-cancel` -> `03-connect-confirm` ->
  `04-disconnect-preview` -> `05-disconnect-confirm`. Preview price/refund
  verified against the engine's `beltCost`/`refundOf` identities (mature belts
  are pre-price, run:null, refund 0; the freshly laid belt transports scrap, so
  the check is identity-based rather than an isolated store delta).

Clips: `frames/{phone,phoneland,desktop}-{dense,zeropower,missinginput,outputfull,refund}/`.

## Fixture scrutiny (a)-(d)

- **(a) mutation only in setup seeding, never src:** the only state mutation is
  setup seeding derived from `docs/evidence/yard-mature.json`, encoded with the
  game's OWN `encodeSave` arithmetic (FNV-1a checksum, `lastSeenMs=Date.now()`).
  No `src/` file is changed (evidence-only tail). Every loop ACTION is a real UI
  tap/click. `reducedMotion=true` on all fixtures for stable pixels.
- **(b) documented:** probe header, the `derive*` functions, this file, and
  `results.json.fixtureScrutiny`.
- **(c) validation not weakened/bypassed:** every seeded envelope passes the
  game's full `decodeSave`/`repairRegistration`/`validateSim`; the `00-open`
  steps assert the loaded mirror matches the seed; route references pruned
  exactly like `repairRegistration`. No invariant relaxed.
- **(d) action through the REAL UI/game path:** actions dispatch through
  `dispatch -> applyCommand`; localStorage is read only as the game's own
  persistence mirror (written on every ok dispatch), never written to fake an
  action.

## Verification ladder at head 937698e (all green)

| step | command | result |
|---|---|---|
| TypeScript strict | `pnpm typecheck` (`tsc --noEmit`) | exit 0 |
| content validate | `pnpm validate` | 0 violations (15 resources, 8 blueprints, 12 recipes, 3 research; behaviour 0 violations) |
| unit suite | `vitest run --minWorkers=4 --maxWorkers=4` | 55 files / 674 tests passed, exit 0 (logistics-59.test.tsx = 23 tests) |
| build | `pnpm build` (`tsc --noEmit && vite build`) | exit 0; entry index-J-huZ0_n.js 167.76 kB |
| acceptance probe | `node tests/ui/logistics-59.probe.mjs` | 228/228 checks, 0 failed, 0 errors, 0 blockers, exit 0 |

There is no lint script in this repo. vitest uses BOTH `--minWorkers=4
--maxWorkers=4` (this 32-CPU Windows host OOMs with default workers and hits a
Tinypool min/max conflict with `--maxWorkers` alone).

## Committed scope (no forbidden compositor path)

`7372edd..937698e` = exactly 13 files, +3218/-3:
`src/game/renderer/scene.ts` (+82/-3, drawRoutes); NEW
`src/ui/logistics/{LogisticsLegend.tsx, LogisticsOverview.tsx, RouteControls.tsx,
copy.ts, logistics.css, material.ts, model.ts, useLogisticsView.ts, view.ts}`;
`src/ui/panels/MachinePanel.tsx` (+18); `tests/ui/logistics-59.probe.mjs`
(+1004); `tests/ui/logistics-59.test.tsx` (+843). NO forbidden path touched
(App.tsx, Hud.tsx, Panels.tsx, styles.css, shell/*, save.ts, SettingsPanel.tsx,
home/copy.ts, ResetDialog.tsx all untouched). All new styles scoped under
`.logistics-*` (no global styles.css). No existing test modified. No lockfile
committed (`pnpm-lock.yaml` stays untracked; repo ships package-lock.json).
This evidence commit is an EVIDENCE-ONLY tail: `git diff 937698e..HEAD -- src`
is EMPTY.

## Limitations / unverified checks

- Developer has no vision; all verification is DOM/geometry/console + canvas
  pixel census. PNGs are mirrors audited for dimensions/hash/non-emptiness, not
  visually inspected. No aesthetic/coherence verdict is claimed.
- Project 1 membership is UNVERIFIABLE with the current gh token (gist/repo/
  workflow scopes only; lacks read:org and read:project; projectV2
  INSUFFICIENT_SCOPES). Recorded, not invented. Milestone 1 + labels are
  authoritative; milestone set via the REST issues endpoint where permitted.
- This is a DRAFT PR. Independent QA, product acceptance and release-engineer
  merge + main CI/CD + deployment are SEPARATE later steps; none is claimed here.
  No deployment is asserted from a pushed branch.
- The refund check is identity-based (engine `beltCost`/`refundOf`) because the
  freshly laid belt still transports scrap during the flow; it is not an
  isolated store-delta assertion.