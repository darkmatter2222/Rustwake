# V2 systems architecture and change boundaries

## Current concrete source of truth
- src/content.js defines 17 resource identifiers, initial balances, blueprints, recipes, research and unlock tiers. Registry presence does not mean each loop is implemented.
- src/simulation.js owns create/read/persist, in-memory bank/machine inventory, road path, truck cargo reservation, production, sale and research. Treat the running simulation as economic authority; never mint goods in React or renderer.
- src/world.js owns Three.js scene, orthographic camera, material palette, terrain, voxel buildings, trucks and presentation. It must project immutable simulation state; it must not settle transactions merely from animation completion.
- src/App.jsx and src/styles.css are the world-first React UI and input owner. App currently carries orchestration and a requestAnimationFrame tick; refactor carefully toward fixed-time stepping with deterministic replay, not frame-linked simulation.
- PR #307 currently proposes new src/camera.js ground/screen projection and src/cameraInput.js gesture ownership. It is still a branch until reviewed/merged; do not treat source on that branch as deployed. The current drag bug comes from not preserving the exact Y=0 ground point under the pointer through camera movement, which must account for elevation/zoom.
- scripts/capture-v2.mjs and tests/*.test.mjs hold first smoke and numerical invariants. Preview screenshots are not post-deploy live source identity.
- .github/workflows/ci.yml and delivery.yml, scripts/package-dashboard.mjs provide immutable packaging and trusted Databrick adapter; do not run repo scripts with privileged deployment runner access.
- public/reference/approved-yard.png and public/reference/asset-style-sheet.png define approved visual grammar; docs/asset-kit/kit.json and public/assets/blockouts are production reference assets. Archive/legacy-v1-2026-11-15 is read-only history; do not import its old HUD to the new app.

## Coordinate contract
Right-handed X east, Y up, Z south. Logical start parcel 24×24; 3.5 world units per cell. Camera defaults to yaw 45°, elevation 35.264° with visible building roofs AND sides. At arbitrary yaw/elevation/zoom, ground projection and ray picking must agree. Cursor grip invariant: the world ground point at pointer-down must remain under the cursor at every later pointer position; a pixel delta multiplied by an arbitrary constant is insufficient. Zoom is anchored at pointer/gesture centroid, not screen center unless explicitly requested. Mouse right-drag or Q/E orbit; one-finger drag pan, pinch zoom, two-finger twist; prevent pointer cancel from committing transactions.

## Ownership and dependency direction
Content data -> simulation transitions; React input -> validated controller/command -> simulation; simulation snapshot -> renderer; UI reads snapshots. Avoid renderer->economy writes, global mutable currency state and opaque event callback side effects. Keep art assets and camera math testable without WebGL. Simulation tick should be deterministic and independent of render FPS, with save/catch-up using bounded event jumps (not yet fully implemented).

## Safety invariants
- Build spends only on valid confirmed placement, exactly once. Repeated command ID and pointer cancellation cannot duplicate charge.
- Resource conservation across local machine, depot, reservation and cargo. Trucks must visibly carry actual reserved cargo and unload at actual reachable destination.
- Road blockage/reroute/removal must not delete or multiply loads. Explain stuck/full/shortage state with recovery.
- Recipe consumption yields real production only when inputs, power and capacity permit. No animation that falsely represents throughput.
- V2 local save remains separate from V1; versioned migration and invalid/oversized import must not erase a valid slot. Multi-tab writer safety is owed before claiming full idle robustness.
- Future online inventory is authoritative server-side; user-editable localStorage can never establish online trade/raid assets.
- New 3D UI must remain recognizable as the README-approved world, not a website dashboard or a top-down spreadsheet.

## Testing by change class
Camera: pure ground/screen mathematical identity, all yaw quadrants, min/max zoom and a real browser drag trace, then same-seed actual viewport captures. Freight: conservation equations, multiple concurrent carriers, missing road, reload and capacity. Content: recipe source/sink audits and fixed-seed progression. Save: backwards fixtures and corrupted/duplicate inputs. UI: desktop, 390×844 and 844×390, 200% text, zero document scroll, focus and no accidental taps. Production: immutable SHA, CI/CD, live release manifest and one browser artifact. Changes to a system require updated architecture/economy/camera docs, tests, ADR if design intent changes, and built/partial/missing ledger in same PR.
