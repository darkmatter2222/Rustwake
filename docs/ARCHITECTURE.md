# Architecture and performance

## Decision

Use React for semantic menus, resource counters, forms and mobile navigation. Use Canvas 2D for the animated yard. Keep the economy in a pure TypeScript module. React does not own individual scrap pieces or drone animation frames.

Current stack: React 19, TypeScript, Vite, Canvas 2D, native node:test through tsx. Exact dependency resolutions are in package-lock.json. No physics engine, state framework, rendering engine or backend dependency is necessary for this milestone.

## Modules

- `src/engine.ts`: data definitions, deterministic fixed one-second tick, commands, progression and save validation.
- `src/store.ts`: browser persistence and import/export boundary.
- `src/Yard.tsx`: bounded decorative animation and canvas hit testing. Draws 800 × 640 logical pixels, CSS scales for the viewport; nearest-neighbor rendering.
- `src/main.tsx`: UI commands and lifecycle reconciliation.
- `src/style.css`: mobile-first behavior, desktop panels and accessible controls.

The engine mutates a private state object to avoid per-tick cloning. UI redraws once per second and after commands. Visual animation targets 30 FPS and reduced-motion mode draws at up to 4 FPS. Canvas work is skipped while hidden. Drone paths are decoration and never affect balances.

Each tick processes machines in stable insertion order, proportionally throttles a recipe to available inputs, and then settles expeditions. Machine priority is intentionally deterministic but currently favors earlier-built machines. A future transport model should replace this with explicit allocation rules, covered by migrations and regression fixtures.

## Offline behavior

One simulation algorithm is used for active and offline progression. Elapsed whole seconds are replayed, capped at eight hours per reconciliation. State timestamps advance past capped time so that excess time cannot be repeatedly claimed. Negative elapsed time earns nothing. No production executes on a server while the browser is closed in this build.

The cap plus 80-machine limit bounds the current replay cost. For much larger factories, profile a worker with progress feedback, then analytic/event-based batching. Exact equivalence to sequential production is required before replacing the tick loop. Don't just multiply each machine's rate independently: shared-input competition changes results.

Local storage is untrusted and can be edited. The validator prevents malformed data from crashing normal saves; it is not anti-cheat. Failed initial save loading blocks automatic overwrite. Import requires confirmation and validation. Multi-tab ownership and automatic backup recovery are still roadmap work; use one tab for this version.

## Performance targets (not yet mobile-certified)

- Yard animation: stable 30 FPS default, optional 60 FPS only after device profiling.
- Main-thread budget: p95 animation frame under 10 ms on agreed midrange reference devices.
- Input feedback: under 100 ms in normal gameplay.
- No unbounded catch-up loops or background animation.
- Initial JS: under 150 KB gzip for foundation; verify build output after changes.
- Offline maximum: target under 500 ms on reference phones, otherwise move catch-up to a worker with visible progress.
- Memory: target under 100 MB working set on mobile, measured with real browser tools.

Current Node benchmark is a CPU smoke test only. Desktop emulation does not establish mobile FPS, heat or battery behavior. Test actual Safari and Chrome including lock screen, tab eviction, airplane mode, storage pressure, and power-saving modes.

## Future authoritative service

Command envelope: `{commandId, accountId, expectedRevision, commandType, payload}`; accountId is derived/verified from authentication, not trusted from request payload. Server applies commands transactionally, derives elapsed time from server clock, grants rewards once and returns a new revision. Competitive replays use versioned simulation rules and seeds. Avoid frame-level networking: asynchronous snapshots and commands match the idle design.

Do not reuse local imported totals in ranked progression. Entitlements, payments, trades and rewards must live on the server. The pure engine can be shared with server validation, but version rollout and replay compatibility require explicit handling.

## Packaging

Static HTTPS deployment from `dist/`. Native wrappers can later host the same bundle with storage/lifecycle adapters. The web manifest is preparatory, not a completed offline service-worker implementation. Fonts currently use a remote Google Fonts stylesheet with local fallbacks; self-host licensed font assets before a public release to remove that request and establish a stricter CSP.
