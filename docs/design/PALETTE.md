# Rustwake palette, typography and semantic styling

Machine-readable audited mirror: docs/design/tokens.json. Actual CSS source: src/styles.css root tokens. Actual renderer source: src/world.js material map. No agent may invent a new neon visual style or move toward the old dashboard just because an isolated screenshot looks cleaner.

## UI semantic swatches
- --bg #0e1b21, deep blue-charcoal foundation.
- --card #17252bcf translucent overlay, --card-strong #17272dea for inspector.
- --line #3b5055ba structural border; never the only control cue.
- --text #e5ebe3 foreground, --muted #94a5a3 supporting metadata.
- --amber #eeac71 primary constructive action, --amber-bright #ffc587 focus/highlight.
- --mint #8ac8b9 functional/connected/safe, --danger #f1917d blocked/invalid.
Alpha is encoded in 8-digit hex; contrast testing must use the composite over real rendered terrain.

## World material swatches
Asphalt #283840; road mark #e5ac60; earth #756b55; rock #91806b; steel #b2bfbd; dark chassis #33474e; rust #c78355; orange machine #e7a25d; operating lamp #86d5c5 and emissive #4baba7; hot furnace #f98b50 and emissive #cf431c; roof #70888b; body #839c9e; glass #9ab9bc; sand #8d7b5d; wood #80644d; tire/void #151d23.

Warm accents signal work and hazard; dusty mint is reserved for *real* functioning status. Unpowered should never present active mint just because animation looks attractive. Red/salmon failures include text/recovery, never color alone. All status hues remain distinct in grayscale/low-vision checks.

## Fonts
Display: Barlow Condensed 500–800, industrial tall narrow display forms used for brand, building names, dock labels, major statistics. Body: DM Sans 400–700 with system-ui fallback. Current CSS includes Google Fonts; controls and labels must still work if external fonts fail. Eyebrows at 9–10px are only ancillary tags, never the sole explanation of a required action.

## Layout rhythm
Use 4/8/12/16/24 CSS pixel spacing where practicable, touch targets >=44 CSS pixels, visible focus outline, short contextual labels. World dominates; small HUD panels are translucent yet legible over varied terrain. Keep center clear and only show deeper metrics when requested. At phone width <=770px brand and compact resources use distinct rows; side telemetry recedes; context panel scrolls internally. At >1150px secondary telemetry can be shown without obscuring the world.

## Lighting
Baseline in src/world.js: environment fog #3e4240 density .0038, world background #1a2930, hemispheric sky #d8e7e3 and ground #897754 intensity 2.5, warm sun #ffe5b3 intensity 3.65 from (-45,90,38), ACESFilmic exposure 1.9, floodlights #f4b77b. Validate on devices; do not add costly effects to manufacture appeal.

## Asset detail and a11y
Large matte surfaces, stepped primitive geometry, limited repeated parts and articulated pivots. Ordinary body text contrast target >=4.5:1, large or component boundaries >=3:1, real overlay compositing tested. Accessibility at 200% text should expand internal panels, not shrink control labels below readability.

## Update discipline
Any change to a semantic token, world material, font, contrast rule, camera, sun/fog, panel breakpoints or motion style updates tokens.json, this document, affected source, an ADR where direction changes, and genuine before/after screenshots *in the same PR*. CI checks the core audited source-to-manifest values; reviewer checks remaining hardcoded color uses and human visual quality. Source and manifest may legitimately diverge temporarily only when there is an explicit issue; it must not silently persist.
