# Renderer asset provenance — UI-RESET-60 (yard composition & machine presentation)

Issue: https://github.com/darkmatter2222/Rustwake/issues/60
Branch: `rw/60-world-art` · Base: `65658b632c78680e5a613838359a7c6cbac28c53`
Companion record: [`docs/evidence/asset-provenance.json`](../../../docs/evidence/asset-provenance.json) (Q-002 phase A).

## License & nature of the assets

`UNLICENSED` (`private: true`, see `package.json`). **No binary asset files exist.** Every
sprite, environment table and material is a hand-authored TypeScript tuple table or a
code-drawn canvas path, so a rebuild is byte-identical for a given commit and the editable
source *is* the shipped asset. There is no external atlas, sprite sheet, font file or
texture to license or regenerate.

Tool versions (from `package.json`): TypeScript 5.6.3 · Vite 5.4.11 · Vitest 2.1.8 ·
playwright-core ^1.49.1 · jsdom 25.0.1 · tsx ^4.23.15.

## Editable sources (owned by this issue)

| Module | Role | Editable form |
| --- | --- | --- |
| `src/game/renderer/sprites.ts` | `PALETTE` (17 keys), `PARTS` per-role glyph rows, environment tables (`FLOOR_KIT`, `GRAVEL`, `APRON_*`, `SKY_*`, `WRECK_*`, `PATH_CORE`, `PUDDLES`, `FLOOR_POSTS`), `STATUS_ACCENTS` | `[x, y, w, h, colourIndex, ellipse?]` tuples in world units (CELL = 32, coords ±16 from cell centre); `colourIndex` is the position in `Object.keys(PALETTE)` |
| `src/game/renderer/scene.ts` | Layer order, `drawScene`, `drawMachine`, `drawRoutes`, `drawDrones`, facet lighting (`facetPart`), grouped paints | code-drawn paths; `drawScene` signature preserved |
| `src/game/renderer/motion.ts` | **NEW** — live OS reduced-motion read | `effectiveReducedMotion(option)` = caller option OR `window.matchMedia("(prefers-reduced-motion: reduce)")` |

The same `PALETTE` is mirrored into `src/ui/styles.css :root` so DOM and canvas agree
(read-only here; not edited by this issue).

## What UI-RESET-60 changed

1. **Consistent upper-left facet on every solid machine block** (`scene.ts`). The previous
   bevel lit only the single largest body part per glyph (`bodyRowOf`). `facetPart` now
   applies the same lit-top/left + dark-bottom/right facet to *every* solid part ≥ 4×4
   (skipping ellipses and the ground band, colour index 15). All bands are inset inside the
   part's own box, so the union ink census and silhouette masks are unchanged, and the whole
   machine row still costs exactly two grouped paints (`select` sheen + `path` shade). This
   gives distinct machinery silhouettes a coherent material/lighting read at phone scale.
2. **Foreground apron crates share the machine light** (`sprites.ts`). Four lit left columns
   (colour index 3) added to `APRON_TOPS` and four shade right columns (colour index 15) to
   `APRON_SHADOWS`, matching the upper-left direction. All sit at y ≥ 200, outside every
   32-unit cell box, and reuse colour indices already present in each table — so the cell
   census, paint-group count and paint-op count are unchanged. This tightens the
   foreground/background material hierarchy without adding decoration over controls/routes.
3. **Live OS reduced-motion alternative** (`motion.ts`). `drawScene` now ORs the caller's
   `reducedMotion` option with the live OS preference, read once per frame *inside* the
   renderer. **No `drawScene` signature change, no new persisted setting, no `App.tsx`
   edit.** It complements the existing boot latch in `App.tsx` (which already persists the OS
   preference into settings). jsdom has no `matchMedia`, so unit tests keep the caller's
   option as the whole answer and existing reduced-motion behaviour is preserved.

### Considered and reverted (paint-budget contract)

A grouped `drain` belt casing stroke under the route polylines was prototyped to make links
read as physical channels. It added one paint op whenever any route exists, pushing the rest
frame from 84 to 85 and breaking the read-only `scene-draw` D1 ceiling (rest ≤ 84). It was
**reverted**; `drawRoutes` is byte-identical to base. Routes keep their cyan flow stroke and
per-item amber cargo tokens for material movement. Hierarchy is served by the facet work
above, which costs zero additional paint ops.

## Retained census-locked base (NOT re-authored)

`PARTS` glyph rows, `FLOOR_KIT` (kitPaintGroups == 5), `GRAVEL` (length 36), `STATUS_ACCENTS`,
`PALETTE`, and the sky/wreck/path detail tables are pinned by the read-only contracts in
`tests/renderer/{scene-draw,silhouette,belt-extent,drone-leg,camera-50,gestures-50}.test.ts`
(ink shares, min/max cell ink, ratio caps, amber budget, silhouette masks, extent witness).
They are retained verbatim; this issue rebuilds art *internals* (lighting, motion source)
without moving those censuses.

## State cues (unchanged contracts, verified)

Working / input-starved / output-blocked / power-limited read through the existing
`STATUS_ACCENTS` + per-status motion: working amber core swell (frames 3–4), starved frozen
quiet core, output-blocked accent bar settling 6→4→6 units once per cycle, plus non-color
geometry cues. Reduced motion freezes the cycle to a single static frame. These are asserted
by `silhouette.test.ts` (ART-003/ART-006) and re-verified on the real canvas by the probe.

## Evidence (headless, no vision)

Probe: `tests/renderer/world-60.evidence.mjs` (playwright-core headless Chrome; DOM/geometry/
console + canvas pixel checks only). Run:

```
node --import tsx tests/renderer/world-60.evidence.mjs \
  --url http://127.0.0.1:5160/ --out tests/renderer/world-60-evidence \
  --label before|after --sha <head>
```

Matched BEFORE/AFTER opening + mature captures at phone 390×844 (dsf 2) and desktop
1920×1080 (dsf 1), plus reduced-motion variants (CDP `Emulation.setEmulatedMedia`
`prefers-reduced-motion: reduce`). BEFORE = base `65658b63` art; AFTER = this branch's art.
Fixtures are seeded via the game's own `encodeSave` with `lastSeenMs = Date.now()`; fixture
mutation lives only in probe/test code, never in `src`. Metrics:
`tests/renderer/world-60-evidence/world-60-<label>-metrics.json`.
