# Game-first interface system and responsive interaction patterns

The world is the game, not a website that happens to contain a world. Keep all major interventions contextual, visually grounded in the actual scene, and usable from one hand on a phone. The HUD should not obscure the machine or road being acted upon.

## Source components
The V2 root src/App.jsx assembles a fixed full-screen app-shell and world-container, screen-vignette, hud-top with Rustwake logo/resource rail, left-rail sector/camera controls, right-rail optional grid/fleet vitals, bottom tool-dock, panel-host for contextual sheets, center-hint, activity notices and footline. src/styles.css controls responsive positioning; src/cameraInput.js owns only world canvas gestures. Do not return to the archived V1 React HUD.

## Player interaction structure
Core tools: Inspect, Construct, Roads, Fleet, Research, Exchange; tapping resources opens inventory. Inspect entity reveals actual recipe, inventory, power and road connection, not fabricated metrics. Construct chooses blueprint and an actual ground placement; validation must explain occupied/outside/road collision/insufficient material. Roads tool chooses start/end and should show topology and cost before commit. Fleet shows real cargo reservations and vehicle state. Research consumes actual data+credits. Exchange sells actual depot inventory. Hover and keyboard focus need clear affordances.

Current foundation has build-on-tap construction with footprint rotation (R) and simplified road placement; the readable building inspector with confirmed dismantle/refund shipped via #362 (semantics below). Construction pre-commit confirmation, move/undo, bay-aware paths and perfect picking remain open issues. UI should not claim those features already work.

## Building inspector and confirmed dismantle (shipped via #362, UX-04)
The inspector is a contextual sheet in panel-host driven by a pure read model (src/inspector.js) over the authoritative simulation — it never spends, forks or fabricates economy state; every preview is unit-tested against the real transaction (tests/inspector.test.mjs). States: empty (honest guidance + construct-catalog shortcut), loading, error (missing/unknown selection) and selected. Selected shows a status chip with existing mint/amber/danger tokens (OPERATING, ASSEMBLING, STARVED, POWERLESS, NO FRONTAGE, ONLINE — no new tokens), exact status detail, power demand vs yard grid, footprint/bay facing, road-frontage reach, production recipe with level-scaled outputs, local cargo and the construction meter.

Upgrade effect: exact current-vs-next level preview (+n per output, mirroring advanceGame's n·level deposit) with an honestly disabled "Upgrade — locked" control and an aria-describedby reason — the purchase dispatch is not wired to the simulation yet (LOG track); never a fake buy.

Dismantle is two-step and confirmed. "Dismantle machine…" shows a recovery preview, then opens a role=alertdialog confirm block whose initial focus lands on "Confirm dismantling". The refund list distinguishes "40% recovery" (floor(0.4·cost) per build material, e.g. furnace 360 CR → +144 CR) from "cargo return" (100% of stored inventory); both land in the depot via removeBuilding. "Keep machine" and Escape close the confirm dialog ONLY (selection stays open) and return focus to the freshly re-mounted opener button — never the detached node. After a confirmed dismantle, focus returns to the Inspect/select tool in the dock. Confirm/Keep targets are >=44 CSS px. Gates mirror the simulation exactly: protected starter buildings (id<=6) and truck-reserved buildings show a disabled control with the exact sim reason. Canceling mid-assembly refunds the FULL blueprint cost via cancelConstruction.

Non-obscuring dock: on desktop the sheet docks on the half opposite the selected machine (auto), honoring a persisted left/right preference, and the left rail shifts beside the sheet (left-rail--beside-panel, >=771px) so controls stay reachable. On phone (<=770px) it is a bounded bottom sheet; if the machine falls under it, a focus pixel in the clear upper zone reframes the camera through pinGroundToPixel/setView/applyCamera only — #307 applyCamera/stampCamera invariants are never rewritten. A "Focus machine in clear view" fallback button appears whenever occlusion is detected. "Keep machine in view" (autoFrame) and dock side persist under rustwake:v2:ux-settings — player preference only, never economy. Escape layers topmost-first: confirm dialog, then selection/tool.

Evidence: docs/evidence/362-ux-04/ (report.json PASS_NUMERIC_ONLY + 12 desktop/phone screenshots, exact source SHA). Numeric occlusion/refund proofs do not certify visual quality; sponsor visual G1 (#276) and physical-handset verification (#268/#275) remain required.

## Desktop layout
>=1150px full viewport with resource strip top center and compact right telemetry optional, left identity/camera controls, bottom centered dock. At 768–1150px collapse secondary metrics before shrinking text; prioritize unobstructed active factory. Mouse left ground drag pans with cursor-locked grip, right drag/Shift rotates/tilts, wheel zooms about cursor, Q/E orbit, Home reset, number shortcuts select tool, arrow keys pan, Escape dismisses.

## Phone layouts
<=770px: two-row brand/resource strip, left context camera buttons, bottom tool dock, side vitals hidden, internal-scrolling inspector capped about 46dvh. At landscape 844×390, reduce overlay vertical height and keep center/roads usable. All camera actions have visible accessible alternatives with >=44 CSS px targets. Portrait/landscape safe-area insets required. No document scroll even at 200% text; internal panels can scroll. Tap selects; one finger pans; pinch zooms; two-finger twist rotates. Pointercancel NEVER spends or builds.

## Components and states
Each major panel needs: empty, available, selected, unaffordable, building, operating, starved, powerless, full storage, stuck route, saving, recovery, offline and error. Provide next available player action, not a universal next-button ladder. Colors communicate with text/icons, not color alone. Modals return focus to opener; keyboard and screen reader entity list is mandatory for final acceptance. Reduced motion must preserve information and simulation, not erase controls.

## Typography, colors and geometry
See tokens.json/PALETTE.md: condensed Barlow Condensed display, DM Sans text, petroleum-charcoal panels, warm amber action, mint valid status, salmon error, neutral grey machinery. Use 4/8/12/16/24px spacing rhythm and legible type hierarchy; avoid a crowded data dashboard. Hold a clear camera view even with a contextual panel open.

## UX walkthrough gate
Fresh save: see industrial 3D world immediately, orbit, inspect, select a building blueprint, preview/confirm construction, connect visible road, inspect truck movement of real cargo, see steel output, sell stock, unlock research and save/reload. Record actual desktop/mobile screenshots plus a one-minute interaction video. A vision-capable reviewer and sponsor compare with approved image. Passing a headless canvas render is not sufficient.
