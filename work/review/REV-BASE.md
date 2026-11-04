# REV-BASE - baseline independent review (generation 1, id `rev-base-g1`)

- Candidate SHA (immutable, reviewed): `a8fb14a1fdd073723f67d3524a4b261013651019` (main, detached)
- Reviewer checkout: `C:\Users\ryans\.local\share\opencode\worktree\fe4e05\review-r1` (`npm install` run here; production code unmodified)
- Rubric: `docs/DESIGN_BIBLE.md`, section "Independent acceptance rubric" (8 categories, 0-4)
- Reviewer session: `ses_e5c04ffbdffedFAAymfdVAdGbI`; date 2026-11-03
- Verdict for this SHA and this scope: **rework** (quality acceptance; technical gates pass - section 6)

## 0. Image-capability receipt (verified first)

The session consumed repository PNGs one at a time (sequential single-image reads, respecting the one-image-per-turn limit). All seven loaded as raster images. Capability: **image input supported**.

Three concrete visible facts from the first authorized capture, `docs/screenshots/latest-research-phone.png` (390 x 844 @2x):

1. The research overlay renders the three branch nodes as **two side-by-side blocks with a hard column break**: the left block holds "Efficient Cutters / One cutting pulse gives 7 scrap instead of 5. / Known", the right, narrower block holds "Smart / Buffers / Every / machine / holds 6 / more / units / of / input ..." - the right block wraps to **one word per line**, and the third node ("Route Dispatch") sits below in the left column, so branch order no longer matches reading order.
2. The top HUD shows chips in two rows - `Scrap 10`, `Ferrous 54`, `Credits 82`, and a fourth reading **`Store900/900`** with no space between label and number - plus a right-hand cluster `Sound (check)`, `A 1`, `Home`.
3. In the world: a full 6 x 6 **construction grid is visible with no panel open and no build mode active**; six machines are the same nested-rectangle body with a light top strip and a dark well; amber level bars run **past their own cell** into the neighbour (the top row's bar crosses three cells); the wreck is a flat pentagon with a rust outline containing a small cyan toothed band, and the bottom action bar reads `Store | Yard | Sell 35 Ferrous +70 credits | Build | Research`.

Screenshot inventory note: the seven `latest-*.png` captures live in `docs/screenshots/`, not `docs/evidence/` (that folder holds the four measurement `.md` files plus `yard-mature.json`). Paths below are as-found.

## 1. Evidence used

- Stills (all inspected individually): `docs/screenshots/latest-research-phone.png`, `latest-mobile.png`, `latest-desktop.png`, `latest-yard.png`, `latest-machine-mobile.png`, `latest-research.png`, `latest-multitab.png`.
- Source read in the review worktree: `src/game/renderer/scene.ts`, `src/game/audio/audio.ts`, `src/ui/Panels.tsx`, `src/ui/Hud.tsx`, `src/ui/styles.css`, `src/ui/App.tsx` (render loop, key handling, tap handling, `cueFor`), `src/ui/useGame.ts`, `src/game/content/research.ts`, `src/game/simulation/engine.ts` (batch/status phases), `src/game/content/defs.ts` (`TICK_MS`, `TUNING`), `src/game/simulation/commands.ts` (`YARD_COLS/ROWS`, `DOCK_TILE`).
- Local check run in this worktree: `npm install`, `npm test` -> 21 files, **172 tests passed**, 5.30 s.
- Not used as evidence: developer self-reports, `docs/STATUS.md` M1 label (remains historical functional progress per the owner rejection).

## 2. Scores (observed categories only; pending dimensions are not scored)

| Category | Score | Primary evidence |
|---|---|---|
| Scene composition | **1** | all captures: grid-dominant flat field, no perimeter/floor detail beyond 3 ellipses, no foreground or distant layer; desktop leaves two flat navy margins |
| Asset identity | **1** | `latest-mobile.png`, `latest-multitab.png`: dock, machines and (visually) the wreck are the same nested rectangle; drone is a lone triangle; amber rectangles encode four different quantities |
| Readability | **2** | machine/store/return panels are clean and aligned, but `latest-research-phone.png` shows one-word columns; `Store900/900` unspaced; two different `Upgrade` prices on screen at once (`latest-machine-mobile.png`) |
| Interaction | **2** | Close/Escape/pagination present and consistent; but the primary dock verb and cost change with economy state (`Sell ...` -> `Upgrade 442` -> `Take over`), Yard is raw telemetry, blueprint choice is a blind `Next` cycle |
| Motion | **pending** | no real short capture/frame sequence at this SHA; source analysis (R-05) predicts quantized 10 Hz stepping |
| Audio | **pending** | no rendered-cue or mix-graph test and no listening pass at this SHA; source analysis (R-06..R-08) proves three structural defects |
| State fidelity | **2** | `engine.ts` has 5 machine statuses, `scene.ts` draws 4 accents: `powerLimited` renders identically to idle while the panel says "power limited" |
| Performance/accessibility | **2** | real measured HUD/contrast/no-scroll/100 ms work exists, and `:focus-visible` + reduced-motion wiring is real; but no trace at this SHA, B-08 device trace still blocked, and world selection is pointer-only |

First-feel acceptance **not met**: two observed categories are at 1, the rubric requires every observed category >= 3, and Motion/Audio have no evidence at this SHA.

## 3. Findings (what is seen / why it harms / change / measurable acceptance)

### R-01 Research node cards collapse into one-word columns - maps to Q-001

- **Seen** (`latest-research-phone.png`, same structure on desktop in `latest-research.png`): node 1 and node 2 sit side by side, node 3 wraps below into the left column; the right-hand block wraps one word per line; the "Data / 102" row does not align with any node row.
- **Cause in source** (`Panels.tsx` lines 315-352 + `styles.css` lines 292-298): `ResearchPanel` emits `dt`/`dd` pairs plus a per-node `div` **inside** the same `dl`, and `.panel dl` is `display: grid; grid-template-columns: auto 1fr`. The wrapper `div`s become grid items, so each whole node is **one cell** of a 2-column grid; column 1 is `auto` (max-content of the widest node), which starves column 2 into a one-word ribbon. The machine panel does not break because it has no wrapper divs.
- **Player harm**: the purchase decision becomes a text-shape puzzle. Branch order (cutters -> buffers -> dispatch) no longer reads top-to-bottom, the buy button's position is unpredictable, and at 390 px the effect sentence takes ~10 visual lines, pushing node 3 out of the first screenful.
- **Change**: give the research list one column (`grid-template-columns: 1fr`) or restructure each node as a self-contained card (title / exact effect / cost / prerequisite / state) with an aligned trailing action.
- **Acceptance** (360, 390, 412 px; landscape 844 x 390; text scales 1/1.5/2): every node card's measured width equals the panel body content width +/- 1 px; the longest effect string ("Every machine holds 6 more units of input, so short gaps do not halt it.") shows >= 3 words on every non-final line; cards appear in `RESEARCH_ORDER` order top-to-bottom; no document scroll; buy/known/blocked states each captured once from the same seed.

### R-02 Machine level bar crosses its own cell - maps to Q-003

- **Seen** (`latest-mobile.png`, `latest-research.png`, `latest-multitab.png`): the amber bar above a machine continues over the neighbour's body; in `latest-multitab.png` one bar spans three cells of row 1.
- **Cause** (`scene.ts` line 216): the bar is `fillRect(p.x - 9*s, p.y - 10*s, 6*s*(level/3 + 0.4), 2*s)`, so the right edge sits at `2L - 6.6` in cell units. Body edge is 12, cell edge is 16 -> overflow of the body from **L >= 10** and of the cell from **L >= 12**. At L15 the bar ends 7.4 units past the cell edge (13.4 CSS px on a 390 px phone, 29.6 px at the desktop scale 4); at the validator's L40 (`validate.ts` line 259 sweeps to 40) it ends at 73.4, about 2.3 cell widths away. Captures show L12-L15, so the defect is already in the normal range.
- **Player harm**: level is the one number the ladder spends credits on; an unreadable count means the player cannot tell which machine was just upgraded, and the spillover makes the neighbour look like it owns the bar. The grid lines stop being a ruler.
- **Change**: clamp the bar to the body (e.g. `min(barWidth, 18*s)`) or draw discrete pips (steps at levels 1-3, then a "1+" badge), all inside +/- 12*s.
- **Acceptance**: for L in {1, 3, 10, 15, 25, 40} the drawn bar's right edge <= body edge (12*s) and the tray square stays inside +/- 16*s; one bounded draw-bound unit test asserts the width expression never exceeds the body width for L up to 40; one fixture screenshot at L25 next to an occupied neighbour shows no pixel of the bar between the two cells.

### R-03 Grid is never hidden at rest - folds into Q-002 ("context-only grid")

- **Seen**: in all seven captures the full 6 x 6 grid is the brightest large-area structure after the HUD.
- **Cause** (`scene.ts` line 91): `if (options.buildMode || camera.scale >= 1.5) drawGrid(...)`. With `WORLD_W = 192`, `fitCamera` gives `scale = min(4, width/216)`: 1.667 at 360 px, 1.806 at 390 px, 1.907 at 412 px, 3.907 at 844 px, 4.0 at 1440 px. Every tested context is >= 1.5, so the "at rest" branch never fires below 324 px viewport width - the grid is permanently on.
- **Player harm**: the bible's "the grid must not be the most visually dominant object" fails by construction, and the empty cells read as content ("6 x 6 of nothing") instead of a yard with 6-8 objects.
- **Change**: draw the grid only in build/route mode (`options.buildMode`), plus a faint 1-cell highlight for the selected object.
- **Acceptance**: at rest, grid stroke draw calls per frame == 0 (stroke spy or a sampled-pixel test), and == 1 path in build mode; phone and desktop first-frame captures at identical seeds show objects without grid lines, build-mode captures show them.

### R-04 One amber primitive encodes four quantities; dock identity is that strip

- **Seen** (`latest-multitab.png` is the cleanest): the store fill level, the machine level bar, the tray square and the cargo dots on routes are all amber rectangles 2-5 units tall; the machine bodies are the same nested rectangle in every case; only the signal lab adds a distinguishable mark (a small mast). At 390 px the dock's store strip is `9*s*118/900` = about 2 px tall - a hairline, if visible at all.
- **Player harm**: no grayscale/silhouette pass is possible - the rubric's own rejection example ("machines not distinguishable without labels") applies. Four quantities share one colour and shape, so the player must memorise position-dependent meaning; the store fill, the most-referenced number, is a ~2 px strip while the HUD already states `118/900`.
- **Change** (already scoped in Q-002): role-silhouette sprites per bible lines 29-31 (dock = pad + arm, furnace = chamber + chimney, sorter = rollers + split chutes, mill = reels + tension arm, lab = mast), one amber token per machine, and a 2-5 pip store gauge instead of a continuous hairline.
- **Acceptance**: six grayscale silhouettes at the phone scale (1.8) named correctly by two independent readers with labels hidden; every amber element drawn from a named set of <= 3 shapes; minimum painted feature height >= 3 CSS px at scale 1.8.

### R-05 (pending gate) Motion is tick-quantized and the fleet collapses into one blob

- **Source facts** (so the pending gate is actionable, not guessed): `TICK_MS = 100` (10 Hz); `drawDrone` and `drawRoutes` derive `t` from the **integer** `state.tick` (`scene.ts` lines 266-272, 302-306), so the ~6 rAF frames inside a tick redraw identical pixels and then jump. The wreck->dock leg is a vertical 190.4-unit run over `droneTravelTicks = 10` -> **34.4 CSS px per step at 390 px width and 76 px per step at desktop scale 4**. Fleet spacing is `lean = (i - (n-1)/2) * 5` **screen** px (line 308) while the body is `8*s` px wide, so at s=4 five triangles occupy 52 px in total and overlap by ~85% - in `latest-multitab.png` the five drones read as one toothed band, not five units. `reducedMotion` sets `t = 0.5 or 0` for every unit (line 307), collapsing all five to one point.
- **Player harm**: the drone is the protagonist of the first minute; stepped motion hides whether a delivery is in flight or delivered, and an unreadable fleet count defeats the 45-credit-per-drone decision the ladder just introduced.
- **Change**: interpolate with the frame clock the store already keeps (`performance.now` delta since the last tick) instead of the integer tick; scale `lean` by `camera.scale`; give the drone hull + cargo pod + orientation and a 1-cell drop shadow; in reduced motion keep a small per-unit offset so unit count survives.
- **Acceptance**: frame-sequence evidence at 390 x 844 and 1440 x 900 - at least 10 consecutive frames where consecutive drone y-positions differ in >= 80% of frame pairs and the max per-frame step <= 8 px at 390 px width; adjacent unit bounding-box IoU <= 0.25; a short capture (<= 5 s) showing anticipation -> contact -> separation for one salvage pulse; a follower-tab capture of the same window. Still images alone cannot pass.

### R-06 (pending gate) Master bus is not a mixer

- `audio.ts` line 78: every bus, including `master`, calls `node.connect(ctx.destination)`, and cues connect `gain -> buses[spec.bus]` (line 118). So `buses.master` (level 0.9) has no input and no effect, and category levels cannot be balanced against a shared master. The bible names this exact defect (line 51).
- **Acceptance**: graph test asserts `destination` has exactly one incoming connection and that the path is `bus -> master -> destination`; a master gain sweep changes every cue's rendered peak proportionally; mute becomes one gain node, not six writes.

### R-07 (pending gate) No ambience, no music bed, single-oscillator identity

- `CUES` (lines 39-50) routes to `effects`, `machinery`, `ui`, `music` only - **the `ambience` bus is created and never fed** (bible line 53: an empty named bus is not an implementation). Every cue is exactly one `createOscillator` with a fixed frequency pair and no attack (`setValueAtTime` then exponential decay, lines 115-116): the "beep-only identity" rejection example.
- Voice handling is a flat `if (active >= voiceBudget) return;` (line 105): first-come, no priority, so a burst of UI clicks can silence the `discovery` accent; `onended` does not fire while the context is suspended, so `active` can pin at the ceiling until the next resume. No distance/zoom attenuation exists.
- The event bridge is command-only (`App.tsx` `cueFor`, lines 540-555): world events with no command (a delivery landing, a batch completing, a sorter going starved) are silent, and every unlisted command maps to the same `collect` beep - so building, connecting and researching are audibly identical.
- **Acceptance**: offline/loopback render per cue with named envelope checkpoints (attack <= 10 ms, declared decay), >= 2 sources for the impact cue, >= 1 continuous node on `ambience`, at least 3 pitch/gain variants per repeated cue, an audible starved-vs-working-vs-idle difference, and a priority test where a burst of UI clicks cannot drop `discovery`. The listening verdict stays explicitly pending until a supported pass exists (B-11).

### R-08 `powerLimited` renders like idle

- `engine.ts` line 444 sets `"powerLimited"`, `Panels.tsx` lines 110-112 print "power limited (NN%)" - but `scene.ts` lines 204-211 branch only on `starved`, `outputFull` and `progress > 0`, so a power-limited machine gets the idle `steelLight` accent.
- **Harm**: the world contradicts the panel exactly when the economy is throttled, which is the moment the player most needs the world to show it (rubric: "decorative animation contradicts economy").
- **Acceptance**: one fixture with `yardPowerCapacity` exceeded shows a distinct 5th accent (own hue, not a brightness step) for every running machine; a draw-colour test pins all five statuses to five distinct values; the panel's percentage and the world token appear in the same capture.

### R-09 Yard panel is raw telemetry in a player surface; primary verb is not stable - maps to Q-006

- **Seen**: `latest-yard.png` shows `Tick 442771 / Machines 6 / Drones 5 / Links 13 / Credits 402 / Save 14276 characters` above a raw JSON textarea (`{"schemaVersion":1,"checksum":"3f8a5c60","tick":1046,...}`). In `latest-machine-mobile.png` the panel says `Upgrade 484 credits` while the dock primary says `Upgrade 442 credits` - two different machines, one verb, no attribution. `latest-multitab.png` shows the same slot reading `Take over`. Build mode replaces all four targets with `Cancel | Place | Next`, and `Next` cycles an unseen blueprint.
- **Harm**: the four most-used taps change shape and text every time the economy moves, so muscle memory cannot form; the first thing a curious player sees in Yard is data no human reads, which buries the two lines that matter (machines, drones); in build mode the player cannot see which of eight blueprints is armed.
- **Change** (Q-006 scope): stable named destinations, save transfer moved to Settings, a bounded visible blueprint picker with cost/purpose/state, recommendation moved to the hint line, per-target attribution inside the primary label ("Upgrade sorter - 484").
- **Acceptance**: in a scripted first-minute path, dock slot N keeps the same destination and pixel box through salvage -> repair -> two builds -> one sell; both `Upgrade` labels state their machine; Yard page 1 has <= 6 human lines and the JSON field sits behind a second page or in Settings; one capture per context with no page scroll and no clipped label.

### R-10 Micro-readability and keyboard gaps (new, small)

- `Hud.tsx` lines 67-70 concatenate `chip.store` and the number with no separator -> `Store900/900` / `Store118/900` in three captures. Fix: one space, or a `gap` on a span pair. Acceptance: chip `textContent` matches `^Store \d+/\d+$`.
- Selection is pointer-only: `App.tsx` registers a keydown listener for `Escape` alone (lines 105-124) and sets `selected` only from `onPointerUp` (line 211), so a keyboard-only player can never open a machine panel although every panel button is focusable (`:focus-visible` exists). Acceptance: arrow-key cycling over dock and machines with a visible selection outline, Enter opening the panel, Escape closing it - one jsdom test plus one desktop capture.
- The wreck body sits at ~1.3:1 against the yard floor (computed from `rgba(24,40,58,0.85)` over `#080d18` = rgb(22,36,53) vs `#22384a`), well under the bible's distinct-luminance ask; machine bodies reach only ~2:1. Fold into Q-002: floor/wreck/machine luminance pairs should reach >= 1.5:1 / >= 3:1 / >= 4.5:1 measured on the composited canvas.

## 4. Explicitly unverified at this SHA

- **Motion**: no real capture or frame sequence reviewed - category not scored; steps are 34.4 px (phone) / 76 px (desktop) per 100 ms tick by formula, pending confirmation in a real browser.
- **Audio**: no rendered cue file, no mix-graph test, no listening pass - category not scored; R-06..R-08 are structural facts read from source, not a listening verdict.
- **Real-device performance/thermal** (B-08) and **human first-feel comprehension** (B-09): blocked, unchanged from BACKLOG.
- Desktop/phone **first-minute organic path** at this SHA: only the seeded jsdom/capture fixtures exist (B-25 records the organic phone session not reaching `data > 0`), so organic provenance is still missing for `latest-research-phone.png`.
- CI status for this SHA: not verified here (publisher's receipt records gh unauthenticated, API 404).
