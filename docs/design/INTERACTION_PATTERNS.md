# World-first interaction patterns and state machine

## Purpose
Rustwake must feel like playing in a physical 3D industrial sandbox. The rendered terrain occupies the full viewport; HTML overlays explain and control the world without becoming a separate dashboard. The accepted reference is public/reference/approved-yard.png and the canonical color/typography tokens live in docs/design/PALETTE.md / tokens.json once the camera/design PR is merged.

## Global input priority
Modal confirmation > contextual inspector > active placement/road tool > camera gestures > world selection. No hidden global shortcut while typing in an input, textarea or selector. Escape closes only the topmost mode, not every layer. On desktop, left-drag on ground pans with the exact terrain coordinate retained under the cursor; right-drag or Q/E orbits, wheel zooms toward pointer, Home resets to the useful cluster. Touch: tap selects; one-finger drag pans; two-finger pinch zooms and twist rotates; pointer cancel/touch loss cannot build/spend. Camera change must be applied to Three camera matrix before raycast and screen-to-world picking.

## Transaction pattern
Selecting a blueprint is free. Placement preview projects the full footprint and loading bay into 3D, displays have/need and conflict reasons, keeps selection when unaffordable. Commit is an explicit distinct gesture, validates the same footprint/path/cost at time of command and spends once. Road builder selects origin → previews continuous path/blocked cells/cost → confirms exactly once; not a pipe connector or decorative line. A vehicle in transit shows source, amount, path, destination, loading state, progress and recovery if blocked. UI's visual state is a readout of simulation, not a second ledger.

## First-visit spatial guidance
The first frame must show a useful cluster with silhouettes, roads and cargo; never force a full-screen gate/lesson wall over the scene. Use one contextual hint plus optional collapsible help. Novice can find Construct, Roads, Fleet and Inspect, and produce steel without a universal Next button. Help is dismissible; preserving player intent is more important than perfect tutorial completion.

## HUD and responsive layout
Compact brand and resources at top; useful-world center clear; actionable tool dock at bottom; translucent side telemetry only where ample desktop space. Context sheet may take a bounded portion of mobile display and scroll internally; document never scrolls. At 390×844, 844×390 and wide desktop all primary functions remain reachable and at least 44 CSS px. Avoid tiny text as the sole way to understand action. 200% text may expand panels; never truncate crucial cost/recovery or place the selected building under a sheet without allowing recenter.

## Visual state semantics
Gold/amber = constructive action/industrial work; mint = genuinely powered/connected/complete; salmon = blocked/unsafe; grey = inactive/not selected; dusty steel/earth = physical world. Always pair color with text/icon/shape. Green cannot mean a decorative animation is running when power or stock is unavailable. Decrease UI chrome emphasis rather than sacrificing world readability.

## Interaction verification
For every camera or UI change: unit test pure math, browser simulate mouse drag and wheel/zoom buttons, touch emulation with pointer cancel, and production-built desktop/phone screenshot. Assert ground point remains within ~1 CSS pixel (or documented world-coordinate tolerance) under pointer after drag, min/max zoom reachable without clipping or jump, game controls are visible and no document scroll. A successful React render alone is insufficient.
