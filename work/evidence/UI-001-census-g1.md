# UI-001 census g1 — measured by the coordinator on the deployed artifact

Deployed artifact: `rustwake-24daf0e` (source `24daf0e`, entry `assets/index-D14MbFT6.js`). Engine: headless Chrome (playwright-core), viewport 390x844, deviceScaleFactor 2. All numbers are measured, none are estimated. This lane imported them unchanged.

## 1. Rest-state footprint (method: `getBoundingClientRect()` of each element, area = w x h, expressed as a share of the canvas element area)

| Element | Rect x,y,w,h (CSS px) | Area share of canvas |
| --- | --- | --- |
| `canvas` (full viewport) | [0,0,390,844] | 100 % (329160 px²) |
| largest overlay: unnamed top wrapper | [10,8,370,99.6] | 11.2 % |
| `.dock` | [10,790,370,46] | 5.2 % |
| `.objective` | [10,58,340.4,49.6] | 5.1 % |
| `.hud__top` | [10,8,370,44] | 4.9 % |
| `.dock__btn--primary` | [87.5,790,226.7,46] | 3.2 % |

- Smallest tap dimension **44.0 CSS px at text scale 1 and at text scale 2** (method: min(w, h) over every visible `.dock__btn`).
- `scrollHeight == clientHeight == 844` at both text scales, so there is no page scroll (method: `documentElement.scrollHeight` vs `clientHeight`).

## 2. Why the panel-coverage numbers disagree (definition resolution, not a new measurement)

The 45.0 % / 57.8 % / 70.5 % spread mixes two things: the **state** that was measured (rest vs panel-open) and the **denominator** used (canvas element 390x844 = 329160 px² vs the drawn yard region ≈ 347x404.5 = 140361 px²). The same intersection is 39 % of the canvas element and 73 % of the drawn yard region.

**Canonical definition, applied prospectively only:** `coverage = intersection area / drawn yard region area`, measured in the **panel-open** state, with BOTH rects printed in the evidence JSON. The failed rows keep their old numbers, and those old numbers used the **canvas-element denominator**.

## 3. Triage consequence

`UI-001` is specifically an **open-panel** problem, not a whole-HUD problem: the rest-state footprint is only **11.2 %**.
