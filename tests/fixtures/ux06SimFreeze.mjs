// UX-06 (#364) wiring-test fixture: the REAL simulation module with a frozen
// advanceGame, resolved ONLY for src/App.jsx's import. jsdom's rAF cadence runs
// the sim far faster than wall time, which would drift seeded failure fixtures
// mid-test. Freezing the tick keeps every fixture static and deterministic;
// readGame/createGame/snapshot/powerStatus/roadLine/etc. stay REAL, and the
// pure read models (alarms.js, resourceStrip.js, inspector.js) still import the
// unfrozen simulation.js directly. Sim authority is proven separately in
// tests/alarms.test.mjs against the real advanceGame/roadLine/buildAt.
export * from "../../src/simulation.js";
export function advanceGame() {}
