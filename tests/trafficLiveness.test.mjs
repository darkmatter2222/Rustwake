// #589 PRIORITY-0 regression: the separation integrator must TERMINATE.
//
// At checkpoint 3d56957 the while-loop in moveVehicle spun forever on ordinary
// solo hauls: `remaining -= advanced*len` left an fp residue (~2.8e-17) whose
// remaining/len rounded `intended` back to exactly j.progress, so advanced===0,
// the blocked-break (progress < intended - 1e-9) did not fire, and remaining
// never shrank. Measured stall state (coordinator instrumentation):
//   moveVehicle id=1 remaining=2.7755575615628914e-17 seg=0 prog=0.9
//   routeLen=7 phase=toSource others=[]   <- ONE truck, separation not involved.
//
// This test runs the full solo scrap lifecycle at the real substep cadence and
// asserts it completes within a bounded tick count. At the checkpoint it hangs
// inside a single advanceGame call (demonstrated out-of-process with a killed
// child; a synchronous spin cannot be interrupted by node:test timeouts). With
// the `if(advanced<=0)break;` liveness guard it completes in a few hundred ticks.
import test from "node:test";
import assert from "node:assert/strict";
import {createGame, advanceGame, freightTotals} from "../src/simulation.js";
import {INITIAL_BANK} from "../src/content.js";

const ZERO_BANK = Object.fromEntries(Object.keys(INITIAL_BANK).map(k => [k, 0]));

// Same deterministic solo fixture as tests/freight.test.mjs: frozen power,
// explicit inventories, ONE truck so no neighbour can be blamed for a stall.
function soloScrapGame() {
  const g = createGame();
  assert.equal(g.seed, 4073);
  g.buildings.find(b => b.id === 3).remaining = 1e9; // generator never completes
  for (const b of g.buildings) b.inventory = b.id === 1 ? {scrap: 12} : {};
  g.bank = {...ZERO_BANK, credits: 1800};
  g.vehicles = g.vehicles.slice(0, 1);
  return g;
}

test("traffic liveness: solo scrap lifecycle terminates within bounded ticks (step=0.1)", () => {
  const g = soloScrapGame();
  assert.equal(g.vehicles.length, 1, "fixture must be solo — no separation partner");
  const base = freightTotals(g).totals;
  const MAX_TICKS = 6000; // 600 s at 0.1 s cadence; a healthy haul takes ~20 s
  let arrivedAt = -1;
  for (let i = 0; i < MAX_TICKS; i++) {
    advanceGame(g, 0.1); // checkpoint 3d56957 hangs INSIDE this call
    assert.deepStrictEqual(freightTotals(g).totals, base, "conservation every tick");
    if (g.freightLedger.some(e => e.kind === "arrive")) { arrivedAt = i + 1; break; }
  }
  assert.ok(arrivedAt > 0, `delivery must complete within ${MAX_TICKS} ticks (hang = liveness defect)`);
  assert.ok(arrivedAt < 1200, `solo haul should finish well under 120 s, took ${arrivedAt / 10} s`);
  assert.equal(g.bank.scrap, 12, "destination credited exactly once");
  assert.equal(g.vehicles[0].cargo, null);
  assert.equal(g.vehicles[0].job, null);
});

test("traffic liveness: 6000 solo ticks keep flowing, no stall after first delivery", () => {
  const g = soloScrapGame();
  // Re-stock the bay periodically so the dispatcher keeps assigning hauls; the
  // point is sustained motion, not ledger accounting (covered by freight tests).
  const bay = g.buildings.find(b => b.id === 1);
  let lastElapsed = -1;
  for (let i = 0; i < 6000; i++) {
    if (i % 500 === 0 && !(bay.inventory.scrap > 0)) bay.inventory.scrap = 12;
    advanceGame(g, 0.1);
    assert.ok(g.elapsed > lastElapsed, "simulated time must advance every tick");
    lastElapsed = g.elapsed;
  }
  assert.ok(g.freightLedger.filter(e => e.kind === "arrive").length >= 2,
    "multiple deliveries across the window — no post-delivery stall");
});
