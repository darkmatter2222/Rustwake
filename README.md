# Rustwake

**Salvage the future.** A mobile-first, 2D cyberpunk idle factory game, built for the browser. Android and iOS wrappers are a future distribution option, not a dependency of the game.

## Playable foundation (0.1)

- Responsive React interface with a separately animated Canvas 2D salvage yard.
- 10 × 8 plot construction, five machine types, upgrades and pause controls.
- Scrap recovery → steel/copper sorting → credit exports / circuit fabrication → research.
- Three timed PvE expeditions with escort requirements and automatic cargo delivery.
- Efficiency and escort research, three one-time contracts, faction lore.
- Versioned local saves, validated save import/export, eight hours of offline simulation.
- Reduced-motion/battery-saving mode; rendering stops in hidden tabs.

**This is a solo pre-alpha.** There is no backend, real PvP, player trading, purchases, prestige reset, physical conveyor routing, or native shell yet. The current pixel-style machines are code-authored Canvas drawings; production sprite sheets are planned. Layout is cosmetic in this milestone and inventory is shared across the yard. Expedition combat is a deterministic equipment gate, not a tactical battle simulation.

## Run

Node.js 22.12+ (or 24 LTS) and npm:

```sh
npm ci
npm run dev
```

Open the URL Vite prints. To test on your phone, use the host computer's LAN address and Vite port while on the same network; do not expose the development server to the public internet.

```sh
npm test       # deterministic economy / persistence regression tests
npm run build # strict TypeScript check and production bundle
npm run bench # worst-case prototype offline replay CPU measurement
```

Deploy `dist/` to a static HTTPS host. Vite uses relative asset paths. A web manifest is included, but service-worker offline launching and full installability are not yet implemented. An internet connection is needed to initially load the game. Offline *progress* is calculated when the game resumes.

## First shift

1. Your dock, sorter and furnace start automatically. The furnace exports alloy for credits.
2. Select a blueprint, then tap an empty yard plot. A dropdown placement alternative is available.
3. Build a circuit press and then a signal lab. Both compete for your shared materials.
4. Inspect and upgrade machines. Pause a consumer when another chain needs its inputs.
5. Send your recovery team to the Rustbelt. Research escort armor to reach richer sectors.
6. Claim contracts and export a backup save from the settings gear.

Use one browser tab per save. Saves are local and editable; they must never be accepted as authoritative in a future competitive economy. Clearing browser storage removes local progress. Keep an exported backup.

## Engineering and planning

- [Roadmap and milestone acceptance criteria](docs/ROADMAP.md)
- [Game design and economy](docs/GAME_DESIGN.md)
- [Architecture and performance](docs/ARCHITECTURE.md)
- [Pixel art production brief](docs/ART_DIRECTION.md)
- [Validation record](docs/VALIDATION.md)

GitHub is the project source of record. `.openai/hosting.json` identifies the private Sites preview; ordinary static hosting does not need that file.
