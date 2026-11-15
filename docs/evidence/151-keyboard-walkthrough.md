# #151 U04 — keyboard-only entity list walkthrough

- Build SHA: `2d01905a2f9d70cbda719793cbc062ac505dc107`
- Generated: 2026-11-15T02:03:35.945Z
- Method: headless Chrome, real key events only (Tab/Enter/Escape/digits); no mouse, no element.click(), no programmatic focus
- Verdict: **PASS** — 28/28 steps, 16/16 census cells, 0 defects, 349 real key presses, 54 frames

## Keyboard loop steps

| Loop | Step | Keys | Pass | Focus after |
|---|---|---|---|---|
| laptop | gate-continue | Tab Enter Escape | PASS | button[build] Build1 |
| laptop | build-catalog-place | 1 Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Ta | PASS | body  |
| laptop | build-commit | Tab Tab Enter | PASS | button Yard |
| laptop | map-entity-list | 6 | PASS | div MapCloseThe yard region you ar |
| laptop | inspect-building | Tab Tab Tab Enter | PASS | div BackScrap sorterCloseIdentityS |
| laptop | upgrade | Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab  | PASS | button Upgrade · 35 credits |
| laptop | escape-to-list-level-worded | Escape | PASS | div MapCloseThe yard region you ar |
| laptop | trade-sell | Escape 5 Tab Tab Tab Tab Tab Tab Enter Escape | PASS | button Yard |
| laptop | settings-yard-backup-download | Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab  | PASS | button Download |
| laptop | escape-unwind-focus-restore | Escape Escape | PASS | button Settings |
| laptop | map-toolbar-focus-return | Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab  | PASS | button[map] Map6 |
| laptop | digit6-escape-focus | 6 Escape | PASS | button[map] Map6 |
| laptop | tab-cycle-no-trap | Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab  | PASS | button[map] Map6 |
| laptop | status-event-driven-focus-ring | 6 Tab Tab Tab Tab Enter Escape | PASS | button[map] Map6 |
| desktop | gate-continue | Tab Enter Escape | PASS | button[build] Build1 |
| desktop | build-catalog-place | 1 Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Ta | PASS | body  |
| desktop | build-commit | Tab Tab Enter | PASS | button Yard |
| desktop | map-entity-list | 6 | PASS | div MapCloseThe yard region you ar |
| desktop | inspect-building | Tab Tab Tab Enter | PASS | div BackScrap sorterCloseIdentityS |
| desktop | upgrade | Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab  | PASS | button Upgrade · 35 credits |
| desktop | escape-to-list-level-worded | Escape | PASS | div MapCloseThe yard region you ar |
| desktop | trade-sell | Escape 5 Tab Tab Tab Tab Tab Tab Enter Escape | PASS | button Yard |
| desktop | settings-yard-backup-download | Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab  | PASS | button Download |
| desktop | escape-unwind-focus-restore | Escape Escape | PASS | button Settings |
| desktop | map-toolbar-focus-return | Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab  | PASS | button[map] Map6 |
| desktop | digit6-escape-focus | 6 Escape | PASS | button[map] Map6 |
| desktop | tab-cycle-no-trap | Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab Tab  | PASS | button[map] Map6 |
| desktop | status-event-driven-focus-ring | 6 Tab Tab Tab Tab Enter Escape | PASS | button[map] Map6 |

## Geometry census (8 viewports x text scale 1 & 2)

| Cell | Rows | Min row px | Doc scroll | Panel scroller | Inner scroll px | Pass |
|---|---|---|---|---|---|---|
| phone-small-ts1 | 2 | 49 | 0 | auto | 334 | PASS |
| phone-small-ts2 | 2 | 79 | 0 | auto | 423 | PASS |
| phone-ts1 | 2 | 49 | 0 | auto | 263 | PASS |
| phone-ts2 | 2 | 79 | 0 | auto | 257 | PASS |
| phone-large-ts1 | 2 | 49 | 0 | auto | 238 | PASS |
| phone-large-ts2 | 2 | 79 | 0 | auto | 207 | PASS |
| phone-landscape-ts1 | 2 | 49 | 0 | auto | 432 | PASS |
| phone-landscape-ts2 | 2 | 79 | 0 | auto | 813 | PASS |
| tablet-ts1 | 2 | 49 | 0 | auto | 171 | PASS |
| tablet-ts2 | 2 | 79 | 0 | auto | 60 | PASS |
| laptop-ts1 | 2 | 49 | 0 | auto | 370 | PASS |
| laptop-ts2 | 2 | 79 | 0 | auto | 768 | PASS |
| desktop-ts1 | 2 | 49 | 0 | auto | 214 | PASS |
| desktop-ts2 | 2 | 79 | 0 | auto | 690 | PASS |
| desktop-large-ts1 | 2 | 49 | 0 | auto | 34 | PASS |
| desktop-large-ts2 | 2 | 79 | 0 | auto | 500 | PASS |

## Defects

None.

## Limitations

- Proves keyboard operability and focus, NOT visual fidelity (sponsor judges visuals at the live URL).
- Digit-key entry records the body as the opener (existing PanelHost behavior); the toolbar-button path proves real focus return. Documented in tests/ui/entity-list-151.test.tsx.
- Drones have no fixed engine cell (they fly store <-> machine); their rows focus the dock cell they operate from.

## Save artifacts

- laptop: `docs/evidence/151-keyboard-walkthrough/laptop-save-export.json` (2053 bytes, sha256 `e66d2ef53838f5b5…`, parses: true)
- desktop: `docs/evidence/151-keyboard-walkthrough/desktop-save-export.json` (2053 bytes, sha256 `cfee653212f1bc42…`, parses: true)

Screenshots: `docs/evidence/151-keyboard-walkthrough/` (54 frames, all non-empty: true).
