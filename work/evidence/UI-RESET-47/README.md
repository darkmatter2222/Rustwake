# UI-RESET/NAV (#47) - what is in this folder

| file | what it is | how to rebuild it |
|---|---|---|
| `navigation-spec.md` | the single spec for this issue: destinations per tutorial stage, one primary action per frame, the one printed command format, portrait and desktop navigation with the landscape and narrow-laptop rules, the stack and focus rules, the destination of every existing action, and the press budget | read it |
| `prototype-nav.html` | the specified shell painted: five nav slots, one action band, one sheet, the machine and store and research and menu bodies, the fork, the locked slots with their reasons, plus its own press counter | open it over file:// with `?seed=fresh` or `?seed=mature` |
| `capture-nav-47.mjs` | drives the shipped build through the path of the spec and writes one PNG plus one painted-DOM read per frame, with the press counter | `npm ci && npm run build`, then `node node_modules/vite/bin/vite.js preview --port 4173 --strictPort` in a second shell, then `node work/evidence/UI-RESET-47/capture-nav-47.mjs` |
| `capture-proto-47.mjs` | drives `prototype-nav.html` at the six bands and writes its captures and the press log | `node work/evidence/UI-RESET-47/capture-proto-47.mjs`, no server needed |
| `measure-nav-47.mjs` | band rects and every face under 44 px for the rest, store and research states at the six bands, same probe shape as #45 | same preview server, then `node work/evidence/UI-RESET-47/measure-nav-47.mjs` |
| `captures/NN-nav-*` | the shipped shell at each step of the path, and the same states at 360x640, 844x390, 1366x768, 1920x1080 and 2560x1440 | `capture-nav-47.mjs` |
| `captures/NN-proto-*` | the specified design at the same steps and bands | `capture-proto-47.mjs` |
| `captures/captures-nav.json` | every shipped-frame press count with the painted chip row, objective card, panel, dock labels and the sim snapshot | `capture-nav-47.mjs` |
| `captures/captures-proto.json` | every design-frame press count with the painted band text and the band rects | `capture-proto-47.mjs` |
| `captures/measures-nav.json` | the band geometry and the under-44 inventory at all six bands | `measure-nav-47.mjs` |
| `tap-budget.md` | the instrumented press budget of both runs against the #45 budget of 16 presses at 0.00 batches/s | the two capture scripts |

Nothing in `src/` is touched by this issue: the shell changes are specified here and owned by #49, the camera bands by #50 and the HUD by #51.
