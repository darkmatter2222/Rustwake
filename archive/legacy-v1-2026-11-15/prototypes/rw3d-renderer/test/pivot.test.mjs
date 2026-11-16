import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createHoistController, HOIST_MIN_Y, HOIST_MAX_Y, HOIST_SPEED, GRIP_HOLD_SECONDS,
} from "../src/pivot.js";

// Deterministic LCG so the dt sequence is reproducible (seed 130).
function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 0x100000000); }

test("bounds invariant under seeded variable dt for 10000 ticks", () => {
  const rand = lcg(130);
  const c = createHoistController();
  for (let i = 0; i < 10000; i += 1) {
    if (c.state === "idle" && rand() < 0.05) c.startCycle();
    c.tick(rand() * 0.1);
    assert.ok(c.y >= HOIST_MIN_Y && c.y <= HOIST_MAX_Y, `y out of bounds: ${c.y}`);
  }
});

test("full cycle: idle -> lowering -> gripping -> raising -> idle at max y", () => {
  const c = createHoistController();
  assert.equal(c.state, "idle");
  assert.equal(c.y, HOIST_MAX_Y);
  assert.equal(c.startCycle(), true);
  const seen = new Set();
  for (let i = 0; i < 1000 && c.state !== "idle"; i += 1) { seen.add(c.state); c.tick(1 / 60); }
  assert.deepEqual([...seen].sort(), ["gripping", "lowering", "raising"]);
  assert.equal(c.state, "idle");
  assert.equal(c.y, HOIST_MAX_Y);
});

test("cycle duration matches authored clip speed plus grip hold", () => {
  const c = createHoistController();
  c.startCycle();
  let t = 0;
  while (c.state !== "idle" && t < 20) { c.tick(1 / 240); t += 1 / 240; }
  const expected = 2 * (HOIST_MAX_Y - HOIST_MIN_Y) / HOIST_SPEED + GRIP_HOLD_SECONDS;
  assert.ok(Math.abs(t - expected) < 0.02, `duration ${t} vs expected ${expected}`);
});

test("startCycle is a no-op mid-cycle (no restart, no double charge)", () => {
  const c = createHoistController();
  c.startCycle();
  c.tick(0.5);
  const yBefore = c.y;
  assert.equal(c.startCycle(), false);
  assert.equal(c.y, yBefore);
});

test("reduced motion: discrete end states only, no intermediate travel", () => {
  const c = createHoistController({ reducedMotion: true });
  c.startCycle();
  assert.equal(c.state, "gripping");
  assert.equal(c.y, HOIST_MIN_Y);
  for (let i = 0; i < 60; i += 1) { c.tick(1 / 60); assert.ok(c.y === HOIST_MIN_Y || c.y === HOIST_MAX_Y); }
  assert.equal(c.state, "idle");
  assert.equal(c.y, HOIST_MAX_Y);
});

test("reset restores idle pose; non-positive dt is ignored", () => {
  const c = createHoistController();
  c.startCycle();
  c.tick(0.5);
  const y = c.y;
  c.tick(0); c.tick(-1);
  assert.equal(c.y, y);
  c.reset();
  assert.equal(c.state, "idle");
  assert.equal(c.y, HOIST_MAX_Y);
});
