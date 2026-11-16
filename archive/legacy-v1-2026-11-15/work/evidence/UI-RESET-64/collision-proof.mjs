/**
 * UI-RESET-64 — in-process collision proof (NO UI), re-run by dev-64d after the
 * coordinator-authorized App.tsx fix (decision issuecomment-6832499377).
 *
 * Uses the game's OWN applyCommand / encodeSave / decodeSave — no state mutation
 * beyond setup seeding (scrap=100 / storeUnits=100), exactly the coordinator's
 * verified proof. Run: pnpm exec tsx work/evidence/UI-RESET-64/collision-proof.mjs
 *
 * Proves three things at the new code head:
 *  1. The dedup MECHANISM is intact: a genuine same-id retry (even across the
 *     save round-trip) still returns the first result without re-executing.
 *  2. The old App id scheme (bare c1..cN) WOULD still collide after reload —
 *     this is the pre-existing bug, kept here as the control.
 *  3. The FIXED App id scheme (per-load epoch prefix, App.tsx nextCommandId)
 *     executes after reload: COLLISION_NOOP_CONFIRMED=false.
 *
 * The id generator below mirrors src/ui/App.tsx's nextCommandId expression; the
 * REAL App is exercised end-to-end (mount -> reload -> click) by the jsdom
 * regression tests/ui/onboard-64-command-id.test.tsx, which fails on the old
 * counter and passes with the epoch.
 */
import { applyCommand } from "../../../src/game/simulation/commands.ts";
import { createInitialState } from "../../../src/game/simulation/types.ts";
import { encodeSave, decodeSave } from "../../../src/game/persistence/save.ts";

// Mirrors src/ui/App.tsx (UI-RESET-64 fix): one unique epoch per page load.
const newLoadIdGenerator = () => {
  const commandEpoch = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  let commandSeq = 0;
  return () => `${commandEpoch}-${++commandSeq}`;
};
// The OLD scheme, kept as the collision control.
const oldLoadIdGenerator = () => {
  let commandSeq = 0;
  return () => `c${++commandSeq}`;
};

const s = createInitialState();
s.store.scrap = 100;
s.storeUnits = 100;

// Pre-reload session (old scheme, as the live save was produced): build c1.
const pre = oldLoadIdGenerator();
const r1 = applyCommand(s, { id: pre(), type: "machine.build", blueprint: "sorter", tile: 8 });
console.log("pre-reload build c1:", JSON.stringify(r1), "machines=", s.machines.length, "scrap=", s.store.scrap);

// Genuine same-id retry WITHIN the session: must dedup, not re-execute.
const retryInSession = applyCommand(s, { id: "c1", type: "machine.build", blueprint: "sorter", tile: 9 });
const dedupInSession =
  retryInSession.ok && retryInSession.revision === r1.revision && s.machines.length === 1 && s.store.scrap === 80;
console.log("same-id retry within session:", JSON.stringify(retryInSession), "DEDUP_IN_SESSION_OK=", dedupInSession);

// Reload: the game's own save round-trip carries seenCommands.
const env = encodeSave(s, Date.now(), { muted: false, reducedMotion: true, textScale: 1 });
const dec = decodeSave(env);
if (!dec.ok) throw new Error(`decodeSave failed: ${dec.reason}`);
const s2 = dec.payload.sim;
console.log("seenCommands after reload:", JSON.stringify(Object.keys(s2.seenCommands)));

// CONTROL — the OLD scheme restarts at c1 and silently no-ops (the bug).
const oldPost = oldLoadIdGenerator();
const rOld = applyCommand(s2, { id: oldPost(), type: "machine.build", blueprint: "sorter", tile: 9 });
const oldCollisionNoop = rOld.ok && rOld.revision === 1 && s2.machines.length === 1 && s2.store.scrap === 80;
console.log("post-reload build OLD id c1:", JSON.stringify(rOld), "machines=", s2.machines.length, "scrap=", s2.store.scrap);
console.log("OLD_SCHEME_COLLISION_NOOP=", oldCollisionNoop, "(control: the pre-existing bug reproduces)");

// FIXED scheme — a fresh load's epoch id is unique, so the command EXECUTES.
const s3 = decodeSave(env).payload.sim;
const post = newLoadIdGenerator();
const r2 = applyCommand(s3, { id: post(), type: "machine.build", blueprint: "sorter", tile: 9 });
const collisionNoopConfirmed = r2.ok && s3.machines.length === 1 && s3.store.scrap === 80;
console.log("post-reload build NEW epoch id:", JSON.stringify(r2), "machines=", s3.machines.length, "scrap=", s3.store.scrap);
console.log("COLLISION_NOOP_CONFIRMED=", collisionNoopConfirmed);

// The fixed scheme still dedups a genuine same-id retry across the round-trip.
const again = applyCommand(s3, { id: Object.keys(s3.seenCommands).find((k) => k !== "c1"), type: "machine.build", blueprint: "sorter", tile: 10 });
const dedupCrossReload = again.ok && again.revision === r2.revision && s3.machines.length === 2 && s3.store.scrap === 60;
console.log("same-id retry across reload:", JSON.stringify(again), "DEDUP_CROSS_RELOAD_OK=", dedupCrossReload);

const pass = dedupInSession && oldCollisionNoop && !collisionNoopConfirmed && r2.revision === 2 && dedupCrossReload;
console.log(pass ? "PROOF_PASS: collision fixed, dedup preserved" : "PROOF_FAIL");
process.exitCode = pass ? 0 : 1;
