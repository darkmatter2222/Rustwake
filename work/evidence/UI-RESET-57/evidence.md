# UI-RESET #57 — G2 integration acceptance evidence (reviewer)

**Role:** reviewer (slice-57). **Verdict: ACCEPT** — no blocking player-visible defects.
This is the reviewer's integration verdict only. The product evaluation
(coherence / hierarchy / factory-visibility / deliberate-choice) is a SEPARATE
later persona (po-rel-57); no product verdict is recorded here. Nothing is merged.

Issue: https://github.com/darkmatter2222/Rustwake/issues/57

## Build under test (proven at run time)

- main / deployed SHA: `b9944189e1aa49e4ec8c811fe9e6048b163be945` (rollback parent `3e44382e`).
- Live URL: `https://home.darkmatter2222.com/rustwake/`
- Served entry: `assets/index-Cjv1OrQ3.js`, **136904 bytes**,
  sha256 `e444e677c94ff67d3e793ab7f1622a3ca2abc428b065d2552af076ae42dcb1e0`.
- Proof: the probe fetched the live `index.html`, resolved the entry script, and
  hashed the downloaded bytes; independently re-verified with PowerShell
  `Invoke-WebRequest -OutFile` + `Get-FileHash` after the clean run.
  `ENTRY_BYTES=136904`, `ENTRY_SHA256=e444e677…b1e0`, `BUILD_SHA_MATCH=TRUE`.
  Mirrored copies: `served-index.html`, `served-entry-index-Cjv1OrQ3.js`.
  The probe ran against this exact deployed build (no local dev server).

## Method (no vision; DOM/geometry authoritative)

`playwright-core` 1.49.1 headless Chrome drives the real UI. The reviewer cannot
see images: every claim below is a DOM / geometry / console assertion captured by
`probe.mjs`; the PNGs are mirror artifacts only. Each loop step records a
before/after `{sim, dom}` snapshot plus a before/after PNG frame, and asserts
named checks. `sim` is read from the game's OWN persistence mirror
(`localStorage["rustwake.save.v1"].payload.sim`); actions are real clicks/taps on
actual controls (dock primary, catalog cards, place strip, inspector actions,
trade presets/Sell, upgrade cards/Buy), flowing through `dispatch -> applyCommand`.

Form factors (both run the FULL integrated loop in one build):
- **phone**: 390x844, deviceScaleFactor 2, isMobile + hasTouch (frames 780x1688).
- **desktop**: 1920x1080, deviceScaleFactor 1 (frames 1920x1080).

Reproduce (from the worktree root so `node_modules` resolves):
```
node work/evidence/UI-RESET-57/probe.mjs
# optional: BASE_URL=... CHROME_PATH=... node work/evidence/UI-RESET-57/probe.mjs
```
Outputs: `results.json`, `probe-run.log`, `frames/<form>/<step>-{before,after}.png`.

## Result summary (clean run)

| metric | value |
|---|---|
| steps | 26 (13 per form factor) |
| checks | 76 / 76 pass |
| failed checks | 0 |
| console errors | 0 |
| page errors | 0 |
| blockers | 0 |
| frames | 60 |
| frame mirror audit | ok=true; distinct=true on all 4 clips |

Frame audit (one pass over all 60 PNGs): each frame's IHDR width/height matches
viewport x deviceScaleFactor, sha256 matches the value recorded at capture, and
byte length > 1000 (non-empty). `distinctFramesPerForm` = true for
phone-opening, phone-mature, desktop-opening, desktop-mature (ordered sequences
are not duplicate frames). Note: `01-fresh-yard` before==after by design (the
gate-dismiss step changes no world state); this is an intended identical pair,
not a capture failure — the clip as a whole is distinct.

## Loop proven through the real UI — OPENING (fresh tutorial yard)

Both phone and desktop, identical step set and checks:

1. **01-fresh-yard** — gate dismissed; resources visible; 0 machines; dock primary
   is `Salvage`. (4/4)
2. **02-salvage** — tap wreck / guided Salvage primary; wreck pulses advanced;
   scrap banked to store; tutorial reached repair (>=2); scrap >=30. (4/4)
3. **03-repair-drone** — guided primary repairs drone; drone repaired; scrap spent
   on repair. (2/2)
4. **05-build-sorter** — guided primary arms sorter ghost; place strip appears;
   primary commits; sorter placed (machines>=1, blueprint present); tutorial >=5. (3/3)
5. **06-connect-sorter (input/storage bottleneck)** — guided `Connect dock to
   sorter` primary; routes created; tutorial >=6. (2/2)
   - BELT-001 charges scrap per connection. After repair(30)+sorter(20) the yard is
     at 0 scrap, so the FIRST guided Connect tap refuses. The refusal IS surfaced
     (captured toast `Need 2 scrap · have 0` + persistent "Last need…" tail). The
     probe then waits for the drone's real idle deliveries (5 scrap / ~5s) to bank
     scrap and reconnects through the SAME guided primary. Not a dead-end.
6. **07-inspect-sorter** — tap the placed sorter; inspector opens, titled
   `Scrap sorter`, seven inspector sections. (3/3)

Opening clips: `frames/phone-opening/`, `frames/desktop-opening/`
(00-gate, 01..07 before/after, 04-after-delivery, 08-final).

## Loop proven through the real UI — MATURE (developed yard)

Seeded from `docs/evidence/yard-mature.json` via the game's OWN envelope encoding
(see fixture scrutiny). Both phone and desktop:

1. **00-mature-yard** — 8 machines loaded; tutorial complete (9); export claimed
   (trade unlocked); no offline drain (credits intact at 82). (4/4)
2. **01-salvage** — catalog Salvage; salvage pulse registered; scrap gained. (2/2)
3. **02-build-furnace (place a machine)** — open catalog, select furnace card,
   `.catalog__place`, place strip, dock primary commit; machine count +1; new
   furnace exists; build cost spent (scrap down). (3/3)
4. **03-inspect-furnace (open inspector)** — tap new furnace; furnace inspector
   opens; seven sections; bottleneck section present. (3/3)
5. **04-connect-bottleneck (resolve input bottleneck)** — inspector `Connect`
   action; routes increased; the starved furnace gained an input route. (2/2)
6. **05-sell-resource (sell)** — tap dock building tile (world 80,16 -> pickTarget
   -2 -> StorePanel); dearest genuinely-sellable trade face = **circuits** (price
   30); Max preset + Sell. Phone: credits 82->742 (+660 = 22 circuits), circuits
   40->18. Desktop: credits 82->772 (+690 = 23 circuits), circuits 40->17. Checks:
   sellable face present; credits increased by sale; sold stock reduced. (3/3)
   - After the Max sale circuits sits at the reserve floor, so its trade face
     correctly disappears (next dearest face becomes plates). This is the reserve
     floor working as designed, not a missing/broken control.
7. **06-upgrade-furnace (choose an upgrade)** — tap furnace; upgrade card `Speed`;
   Buy; furnace level +1; credits spent (50); upgrade receipt shown:
   `Applied: Speed Rank 1 · level 2 · Batch time 4.00s → 3.64s · paid 50 credits`. (3/3)

Mature clips: `frames/phone-mature/`, `frames/desktop-mature/`
(00..06 before/after, 07-final).

## Fixture scrutiny (a)–(d)

- **(a) mutation only in probe/test code, never src:** the only state mutation is
  SETUP seeding via `probe.mjs` `encodeEnvelope`. No `src/` file is changed
  (evidence-only branch). Every loop ACTION is a real UI click/tap.
- **(b) documented:** probe header, this file, and `results.json.fixtureScrutiny`.
- **(c) validation not weakened/bypassed:** the seeded envelope is built with the
  game's own checksum (FNV-1a of `JSON.stringify(payload)`) and
  `lastSeenMs=Date.now()` (avoids offline catch-up drain); it passes the game's
  full `decodeSave`/`validateSim`. No invariant is relaxed.
- **(d) action through the REAL UI/game path:** actions dispatch through
  `dispatch -> applyCommand`; localStorage is read only as the game's own
  persistence mirror, never written to fake an action. Seeding a mature save is
  legitimate setup; no action is faked.

## Findings (all non-blocking; none is a REWORK defect)

1. **steel-reserve-floor** — intentional design, not a defect. Mature fixture holds
   exactly 10 steel and `TUNING.reserveFloor=10`, so `sellableAmount(steel)=0` and
   `tradeFaces()` omits a steel trade card while still listing steel (stock 10) in
   Inventory. The reserve floor protects starter stock by construction.
   (src/ui/store/model.ts; src/game/simulation/commands.ts; src/game/content/defs.ts)
2. **dock-context-sensitivity** — intentional. With a machine selected at
   tutorial>=8 the dock shows the upgrade-branch row; closing the inspector does
   not clear selection. Tapping an empty yard cell (pickTarget=null ->
   setSelected(null)) returns the dock to rest — a real, reachable path. No dead-end.
   (src/ui/App.tsx; src/ui/Hud.tsx)
3. **wreck-pool-regenerates** — intentional. At wreck.remaining=0 the engine
   increments generation and refills to starterWreckPool(30); salvage/drone never
   dead-end. (src/game/simulation/engine.ts)
4. **belt-cost-on-guided-connect** — minor friction, NOT blocking. BELT-001 charges
   `beltCostPerTile(1) x run tiles` scrap per connection. The opening yard at 0
   scrap refuses the first guided Connect; the refusal is surfaced (shortfall toast
   `Need 2 scrap · have 0` + persistent "Last need…" tail). The dock Connect face
   does not pre-print the belt scrap cost (tutorial polish opportunity), but the
   drone's idle deliveries resolve it and the connection completes. Suggested
   follow-up (non-blocking, owning surface = build/connect HUD + tutorial copy):
   print the belt scrap cost on the Connect face so the first-time player sees the
   price before tapping. (src/game/simulation/commands.ts connectRoute/beltCost;
   src/ui/App.tsx setToast/setLastReject + reject.shortfall)

No dead-ends, mislabeled controls, unreachable actions, broken bottleneck
resolution, save-loss, or layout failures were observed on either form factor.

## Console / page errors

0 uncaught console errors and 0 page errors across the entire run (all four
clips). The pre-existing ContextPanes duplicate-key jsdom warning is out of scope
and did not appear in the browser run.

## Shared interaction defect gating G3

None blocking. The only cross-form friction is finding #4 (belt cost not
pre-printed on the guided Connect face); it is surfaced honestly and resolved by
the idle earn path, so it does not block G3. Recommended as a polish follow-up.

## Limitations

- Reviewer has no vision; all verification is DOM/geometry/console. PNGs are
  mirrors, audited for dimensions/hash/non-emptiness, not visually inspected.
- Tutorial advances on 100ms ticks and persistence lags ~1000ms; the probe waits
  for the sim predicate (e.g. tutorial>=5/>=6) before snapshotting so tick lag is
  not mistaken for a defect.
- Project 1 membership is unverifiable with the current gh token (lacks
  read:project); recorded, not invented. Milestone set via REST where permitted.
- Product coherence/hierarchy verdict is deferred to po-rel-57 (separate persona).
