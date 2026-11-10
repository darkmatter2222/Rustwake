# UI-RESET/NAV (#47) - instrumented press budget

- Issue: https://github.com/darkmatter2222/Rustwake/issues/47 | Goal: https://github.com/darkmatter2222/Rustwake/issues/43 | Branch `rw/47-nav-g1` | Role: ui-ux
- One **press** = one painted face activated once, or one key. Counted, not hand-traced: the shell numbers come from `capture-nav-47.mjs` (`captures/captures-nav.json`, field `presses`) and the design numbers from the prototype own counter (`S.pressed`, in `captures/captures-proto.json`).
- Reference budget, measured in #45: **16 presses to one machine with 0 batches done, 0.00 batches/s, sim tick 51** (`work/evidence/UI-RESET-45/journey-map.md` J1).

## 1. Shipped shell, head 224e22a, phone 390x844, fresh save

| milestone | presses | painted frame | what the save says at that press |
|---|---|---|---|
| gate cleared | 1 | `01-nav-phone-rest-step0` | no save yet, dock reads Store / Salvage / Build |
| salvage counted, repair face in the primary slot | 12 | `02-nav-phone-salvage-counted` | tick 43, tutorial 1, scrap 30, machines 0 |
| drone repaired | 13 | `03-nav-phone-repaired` | tick 200, tutorial 4, scrap 10 |
| build phase, ghost up | 14 | `04-nav-phone-build-ghost` | Cancel / Build Scrap sorter / Next |
| first machine placed | 18 | `08-nav-phone-furnace-placed` | tick 260, tutorial 5, **machines 1**, scrap 0 |
| machine inspected | 22 | `09-nav-phone-two-machines` | inspector painted, 20 px canvas grid still needed |
| store rows open | 35 | `12-nav-phone-store-rows` | tick 330, tutorial 6, credits 0 |
| save record read | 36 | `13-nav-phone-record-copy` | `Yard` face absent, `reachable=false` |
| import error state | 37 | `17-nav-phone-import-failure` | reason line, title still Yard record |
| text scale one step | 38 | `14-nav-phone-text-scale-2` | cluster reads A 1.25 |
| whole path end | 39 | `15-nav-phone-muted` | tick 361, machines 1, credits 0, **batches 0** |

Two extra instrumented loops on the mature seed: rest to a sell face **2 presses** (`16-nav-phone-store-full`), and the destination tour Store, Yard, Build with a Close each **5 presses for 3 destinations**, with the Research face never painted because the build phase replaces the row (`25-nav-phone-mature-research`, `Research=false`).

## 2. Specified design, same path, prototype own counter

| frame | presses | painted frame |
|---|---|---|
| gate | 0 | `30-proto-phone-gate` |
| rest at step 0, five slots | 1 | `31-proto-phone-rest-step0` |
| salvage counted | 7 | `32-proto-phone-salvage` |
| repaired, build step in the primary band | 8 | `33-proto-phone-repaired` |
| Build destination open | 9 | `34-proto-phone-build-catalog` |
| blueprint chosen | 10 | `35-proto-phone-build-chosen` |
| one machine placed | 11 | `36-proto-phone-placed` |
| **machine inspected from the Yard list** | **12** | `37-proto-phone-machine` |
| Store with the one command format | 13 | `38-proto-phone-store` |
| Menu import error | 16 | `39-proto-phone-import-error` |
| two Escape presses back to rest | 18 | `40-proto-phone-back` |

## 3. Reading

- To an inspected machine: **12 presses in the design, 22 in the shipped shell, 16 in the #45 budget**. The design beats the audit budget by 4 presses and the shipped shell by 10.
- Whole path including the settings faces and the save record: **18 presses in the design against 39 in the shipped shell**, and the shipped shell does not reach the upgrade fork at all inside 39 (`11-nav-phone-fork` still prints a build face).
- The three rules that pay are the ones in `navigation-spec.md`: a destination row that never changes slots (section 1), a Yard list whose machine faces are real buttons (E4, section 5) and one sheet replaced by the next instead of an open plus a Close pair (E3).

## 4. Not verified

No real-device run, no screen-reader pass, no audio listening test. The prototype is a browser-painted model of the specified shell, not the shipped renderer: the world canvas inside it is a flat field, so world ink positions inside the prototype frames are indicative only, while every chrome band is measured from the same painted DOM (`captures/captures-proto.json`, `rects`).
