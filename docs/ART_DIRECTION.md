# Pixel art production brief

## Visual identity

Weathered industrial cyberpunk, readable on a phone. Navy ground, cool steel, copper edges, amber furnaces, cyan drone indicators and restrained lavender electronics. Avoid dominant neon green. Environments should feel lived-in rather than a generic neon dashboard.

Palette anchors: background #10171c, floor #1c2b34, steel #60717a, rust #a96345, warm light #eeab72, drone light #6bc6cc, electronics #a69be0. Essential states must also use shape, labels or patterns.

## Current assets

Code-authored pixel-style machine drawings in Yard.tsx and a vector app mark. No external game art has been copied. These are prototype visuals, not final sprite assets. HUD text remains crisp HTML rather than pixel text.

## Sprite specification

- Top-down three-quarter industrial objects with a consistent slight view of top surfaces; no camera rotation.
- 16-pixel base unit; one grid cell is 64 logical pixels in the prototype.
- Machine footprint 48 × 48 within a 64 × 64 cell. Allow chimney/antenna overhang only with explicit draw bounds.
- RGBA PNG atlases with integer-aligned frames, nearest sampling, 2-pixel extrusion/padding, metadata containing frame/pivot/bounds.
- Machine variants: idle, working, starved, paused, damaged; 4–8 frames for working animations at 6–10 FPS.
- Drones: idle, outbound, carrying, docking and damaged. Keep silhouettes distinct at 24–32 pixels.
- Shadows on a separate consistent layer; emissive overlays optional and bounded.
- Do not bake text, UI numbers or faction labels into sprites.

## First production batch

1. Five machines with the states above.
2. Ground tiles, perimeter walls, storage crates and four wreck piles.
3. Scout, cargo and escort drones with faction color accents.
4. Scrap, steel, copper, circuits, data and credit icons in 16/24/32-pixel variants.
5. Rustbelt expedition background and three salvage wreck silhouettes.
6. Faction emblems and app icons at installable sizes.

## Workflow and acceptance

Create style frames before mass generation. Approve one machine and drone at actual phone size. Keep editable source alongside exports, track artist/license/provenance, and never reference other games' extracted sprites. AI-generated concept art may inform visual direction; production atlases still require alignment, transparency, consistent silhouettes and frame-by-frame review.

Validate atlases automatically for frame bounds and missing states. Inspect on both dark and light surroundings, at 1×/2×/3× and reduced-motion mode. Target a small first atlas under 1 MB compressed; add assets by sector with loading boundaries. No production sprite generation was performed in this initial code milestone.
