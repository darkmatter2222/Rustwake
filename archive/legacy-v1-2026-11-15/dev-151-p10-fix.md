# dev-151-p10-fix — developer pass 10 handoff (issue #151, G1 first-playable gate)

Role: developer (child session 1 of 1; coordinator + developer = 2/5 sessions; no delegation).
Worktree: `C:/Users/ryans/AppData/Local/Temp/rw-qwen/rw-151` — branch `rw/151` — draft PR #227 ("Part of #151", never "Closes").
Starting head: `97e86b2da439b306ac2a4e25329913078fc08177` (verified local == origin == PR head, clean tree).
Final head this pass: `5705c7b7cc15a08b8e53c0f416b8948806219519` (pushed; tree clean except intermediate capture artifacts noted below).

## Milestone commits (each pushed)

| Defect | Commit | Files |
| --- | --- | --- |
| 1 + 2 (V05 atomic time base + live-stage crop bucketing) | `6c2b7c761f31ae2d6926ee9627d8dd5d557a13d4` | `src/game/renderer/three/assemblyView.ts`, `scripts/capture-g1-151.mjs`, `tests/renderer/assembly-view.test.ts` |
| 3 + 4 (U03 CSS: land844 card fill, phone dock wrap, glyph-metric leading) | `e84ac9e` | `src/ui/styles.css` |
| 5 (U03-3 tap witness excludes non-rendered controls) | `1c604be` | `scripts/measure-legibility.mjs` |
| 6 (atomic invalid-import witness) | `5705c7b7cc15a08b8e53c0f416b8948806219519` | `scripts/capture-g1-151.mjs` |

## Per-defect root cause and fix

### Defect 1 — V05 "live ahead of persisted" (CAPTURE TIME-BASE defect, not a renderer defect)
Root cause: `observe()` derived the pure stage report from the persisted save envelope
(`PERSIST_MS = 1000`), while `mesh.visible` was read from the live scene synced to the
current 100 ms sim tick — up to 10 ticks of lag. Pass 9: phone 2/21 + desktop 4/21 stage
mismatches, `allLiveAhead` true.
Fix (mechanism (a), the brief's preferred): `assemblyView.updateRecord` now stamps
read-only `group.userData.progressTicks` / `durationTicks` in the SAME sync that sets
`mesh.visible` (render-layer QA metadata only — no economy logic, no state writes, no
clock reads; boundary-3d contract tests stay green). `readLiveAssembly` returns the stamp
in the SAME `page.evaluate` as the visibility snapshot; `observe()` derives `pure` via
`buildingStageReport` from that live tick. Persisted progress is still recorded separately
(`progressTicks`), and a new `liveProgressTicks` field makes the time base auditable per
sample. If the stamp is absent (older bundle) the code falls back to the persisted
snapshot and the agreement checks fail honestly — nothing relaxed. Check names updated to
"live stage matches pure stage (atomic live tick)" etc.; header/methodology/summary text
updated to describe the corrected time base. New unit test pins tick==visibility atomicity
at progress 0/7/10/20/30/40/50 and stamp refresh on progress-only updates.

### Defect 2 — V05 desktop crop collapse (3/5 distinct hashes)
Root cause (hypothesis (i) confirmed by construction): crop buckets were keyed by the
STALE persisted stage, so one live-stage crop hash dominated several buckets. Desktop's
larger mismatch count (4/21 vs phone 2/21) explains the desktop-only collapse.
Fix: buckets now key on `liveObs.stage` (the same atomic time base as `pure`). No framing
change was needed if the empirical run below shows 5 distinct stage hashes on BOTH
devices; if desktop still collapses, crop framing is the next lever (pass #13).

### Defect 3 — U03-1 land844 844x390 @200% card fill 44.968% > 42% cap
Root cause: the short-viewport `.objective` cap of 400px forced the primary and power
lines to two boxes each inside a lead column that actually offers 510px
(844 - 20 hud padding - 314 drawer reserve).
Fix: `@media (max-height: 460px)` `.objective { max-width: min(100%, 560px) }` — the card
spends the available 510px, collapsing both lines to one box. The 42% cap, all type sizes
and all floors are unchanged; portrait phones (height > 460) never enter this block, so
the other 31 cells are untouched by this rule. Empirical census re-measure is pass #13.

### Defect 4 — U03-2 clipped phone dock labels @A2 + 1px vertical overflow
Root cause (clip): CSS specificity — `.text-large .dock` (0,2,0) `flex-wrap: nowrap`
outranked the phone-band `.dock` (0,1,0) `flex-wrap: wrap` regardless of source order, so
at scale >= 1.5 nav buttons froze at their 44px min-width while "Store"/"Build" need
~66px at 22.2px type. The phone-band block comment already promised wrapping; the fix
restores that documented intent.
Fix (clip): `.text-large .dock { flex-wrap: wrap }` inside `@media (max-width: 767px)`.
jsdom ignores @media, so the L-3 jsdom contract (`app.test.tsx` nowrap pin) is unchanged.
Root cause (overflow): line-heights below the font's ascent+descent left glyph overhang
outside the line box (`scrollHeight - clientHeight` +1/+2px rows).
Fix (overflow): `.objective__primary` 1.2 -> 1.3; `.text-large .status-line` 1.1 -> 1.2;
`.text-large .dock__btn` 1.1 -> 1.2 (cost inherits); `.text-large .resources__item`
1.15 -> 1.2. No font size changed, so every px ladder, the 1.32x tier ratio, the 12px
dock-price floor and the 4.5 AA floor are untouched; the 46px dock height floor still
holds (two lines measure 39.4px at scale 1.5). CHRM-002 comment updated honestly.

### Defect 5 — U03-3 tap witness counts display:none "Home" as 0x0
Root cause: `measure-legibility.mjs` mapped EVERY `.dock .dock__btn, .hud .icon-btn` into
the target list, including the Home face that `.cluster .icon-btn:last-child` hides at
every width by design. Its 0x0 box dragged `minTargetPx` to 0 and failed the 44px floor
on every cell — an instrument defect, not a UI defect.
Fix: exclude `display:none` / `visibility:hidden` / zero-area controls from `targets`;
record them as `hiddenTargets` (kept in the persisted step records) so the exclusion is
auditable and can never silently hide a rendered small target. Every RENDERED target
still faces the unchanged 44px floor (`FLOORS` untouched). Justification documented in
the script comment and here.

### Defect 6 — roundtrip invalid-import economy mutation + tick drift 10
Root cause: NOT an economy mutation. `YardPanel.applyImport` refuses invalid text via
`previewImport` before any `onImport` call, and `store.importSave` rejects before any
state swap/persist. The witness read D1, clicked Apply, waited 400ms, then read D2 — the
live sim (~10 ticks/s) and drone scrap deliveries drifted between the two reads
(~1s apart including round-trips), changing `store` and tick.
Fix: read-click-read in ONE synchronous `page.evaluate` (the same sanctioned atomic
pattern as the frozen valid import) — zero drift window. Added an `applyClicked`
assertion (strengthening: no vacuous pass if the button is missing) and an informational
`postWaitTickDelta` proving the sim keeps advancing after the refusal. The 400ms wait
still runs for the confirm-gate/note witness. The `<=2` drift threshold and every other
check are kept as-is; expected drift is now exactly 0.

## Verification this pass

- `npm run typecheck`: exit 0 (run twice: after defect 1, and after all fixes).
- Plain `npx vitest run`: **112 files / 1517 tests passed** (baseline 1516 + 1 new seam
  test). No flakes, no reruns needed, no test weakened. The L-3 jsdom pins
  (`flexWrap: "nowrap"`, 0.74rem/0.72rem, 46px) stay green because jsdom ignores @media.
- Targeted renderer tests after defect 1: assembly-view (10) + boundary-3d (9) = 19 green.
- Empirical running-build capture at head `5705c7b` (build + full `capture-g1-151.mjs`,
  self-managed vite preview on :4168; :4173/rw-217 untouched; only own preview killed):

CAPTURE_RESULTS_SLOT

## What remains (pass #13 / QA / product)

1. Full re-capture of BOTH harnesses at the final immutable head + evidence doc + PR
   republish. The capture artifacts regenerated this pass (`docs/evidence/151-g1-captures.json`,
   `docs/screenshots/151-*.png`) are INTERMEDIATE sanity evidence at `5705c7b`, left
   uncommitted in the worktree; pass #13 overwrites them at the final head.
2. U03 census re-measure (32 cells) — the CSS fixes are geometrically reasoned and
   unit-contract-safe, but the census is the empirical instrument: confirm land844 A2
   card fill < 42%, zero clipped rows, zero `verticalOverflow1pxRows`, `minTargetPx >= 44`
   on every cell, and no regression on the other cells (px ladders, AA, price floor,
   monotonicity, noPageScroll, coreAction). Point `RUSTWAKE_URL` at the pass-#13 preview
   (default :4173 is held by rw-217 — do not kill it) and assert served-bundle identity.
3. If desktop crop hashes still collapse after the bucketing fix, adjust crop framing
   (defect 2 fallback lever) — the empirical result above decides.
4. Re-measure the historical CHRM-002 worst case (360x640 @2.0, 2 machines, one blocked
   tap) at the final head: the status-line leading raise adds ~2.16px per wrapped box;
   the census-state cells have ample headroom, but that historical scenario quoted
   40.8% and must be re-confirmed under the 42% cap.
5. Independent QA + product verdict on the immutable head SHA; release engineer merges;
   main CI/CD verification. No self-acceptance.

## Limitations (honest, non-vision lane)

- Numeric/geometric evidence only. No visual-fidelity claim is made; visual ACCEPT is
  reserved for the sponsor at the live URL.
- Headless Chrome emulation on a desktop host, NOT a physical phone (#190 blocker):
  viewport/dpr/isMobile/hasTouch are emulated; CPU/GPU/thermal/real-touch/mobile-network
  are not.
- P03 byte ceiling (868378 B vs 233000 B) NOT touched — product ruling, not the
  developer's. No gate, floor, threshold, budget or check was weakened anywhere this
  pass; UNKNOWN never became MET; no result or hash was fabricated.
- PR #227 stays draft, "Part of #151". No merge, no ready-for-review, no main push, no
  ACCEPT/REWORK verdict issued by this session.