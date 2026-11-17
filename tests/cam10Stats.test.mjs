/**
 * CAM-10 (#346) measurement statistics contract (scripts/cam10-stats.mjs).
 * Pure deterministic math: nearest-rank percentiles, frame jank/dropped
 * accounting at the declared 60 Hz budget, and the negative/recovery verdict
 * logic the capture harness uses to PROVE it detects injected degradation.
 * Fails against unmodified main c5ad8dec (module does not exist there).
 * Rendered-world proof lives in scripts/capture-cam10.mjs, not here.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  FRAME_BUDGET_MS, JANK_MS, percentile, frameStats, latencyStats,
  negativeVerdict, recoveryVerdict
} from "../scripts/cam10-stats.mjs";

test("CAM-10 stats: declared constants (60 Hz budget, 50 ms jank)", () => {
  assert.equal(FRAME_BUDGET_MS, 1000 / 60);
  assert.equal(JANK_MS, 50);
});

test("CAM-10 stats: percentile is nearest-rank, exact on known samples", () => {
  const hundred = Array.from({length: 100}, (_, i) => i + 1);
  assert.equal(percentile(hundred, 95), 95);
  assert.equal(percentile(hundred, 50), 50);
  assert.equal(percentile([10, 20, 30], 95), 30);
  assert.equal(percentile([30, 10, 20], 50), 20, "must sort, not trust input order");
  assert.equal(percentile([7], 95), 7);
  assert.equal(percentile([], 95), null, "empty sample is null, never a fabricated 0");
  assert.throws(() => percentile([1], 0));
  assert.throws(() => percentile([1], 101));
});

test("CAM-10 stats: frameStats exact jank/dropped/FPS on a known delta trace", () => {
  const deltas = [16, 16, 60, 16]; // one 60ms stall among 16ms frames
  const s = frameStats(deltas, 108);
  assert.equal(s.frames, 4);
  assert.equal(s.jankFrames, 1, "60ms > 50ms jank threshold");
  assert.equal(s.droppedFrames, 3, "round(60/16.667)-1 = 3 dropped vsyncs");
  assert.equal(s.meanMs, 27);
  assert.equal(s.p95Ms, 60);
  assert.equal(s.maxMs, 60);
  assert.ok(Math.abs(s.fps - (4 / 108) * 1000) < 1e-9);
  const clean = frameStats([16.6, 16.7, 16.6], 50);
  assert.equal(clean.jankFrames, 0);
  assert.equal(clean.droppedFrames, 0);
  const empty = frameStats([], 0);
  assert.equal(empty.fps, null);
  assert.equal(empty.p95Ms, null);
});

test("CAM-10 stats: latencyStats exact aggregates", () => {
  const s = latencyStats([10, 20, 30, 40]);
  assert.equal(s.count, 4);
  assert.equal(s.meanMs, 25);
  assert.equal(s.p50Ms, 20);
  assert.equal(s.p95Ms, 40);
  assert.equal(s.maxMs, 40);
  assert.equal(latencyStats([]).p95Ms, null);
});

const baseline = {
  latency: {drag: {count: 30, p95Ms: 20}, zoom: {count: 30, p95Ms: 25}},
  frames: {jankFrames: 0}
};
const degradedGood = {
  latency: {
    drag: {count: 8, minMs: 121, p95Ms: 145},
    zoom: {count: 8, minMs: 122, p95Ms: 150}
  },
  frames: {jankFrames: 16}
};

test("CAM-10 stats: negativeVerdict PASSES when the injected 120ms stall is detected", () => {
  const v = negativeVerdict({delayMs: 120, baseline, degraded: degradedGood, injectedCommands: 16});
  assert.equal(v.pass, true);
  assert.equal(v.checks.length, 5);
  for (const c of v.checks) assert.equal(c.pass, true, c.name);
});

test("CAM-10 stats: negativeVerdict FAILS if any degraded sample is below the injected stall", () => {
  const degraded = structuredClone(degradedGood);
  degraded.latency.drag.minMs = 119.9; // one sample escaped the stall -> not deterministic
  const v = negativeVerdict({delayMs: 120, baseline, degraded, injectedCommands: 16});
  assert.equal(v.pass, false);
  const failed = v.checks.filter(c => !c.pass);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].actual, 119.9);
  assert.equal(failed[0].expected, "min >= 120");
});

test("CAM-10 stats: negativeVerdict FAILS if P95 does not rise by at least delay/2", () => {
  const degraded = structuredClone(degradedGood);
  degraded.latency.zoom.p95Ms = 25 + 59.9; // baseline 25 + 60 required
  const v = negativeVerdict({delayMs: 120, baseline, degraded, injectedCommands: 16});
  assert.equal(v.pass, false);
  assert.ok(v.checks.some(c => !c.pass && c.name.startsWith("zoom: degraded P95")));
});

test("CAM-10 stats: negativeVerdict FAILS if jank count is below injected command count", () => {
  const degraded = structuredClone(degradedGood);
  degraded.frames.jankFrames = 15; // 16 stalled commands must each block a frame
  const v = negativeVerdict({delayMs: 120, baseline, degraded, injectedCommands: 16});
  assert.equal(v.pass, false);
  assert.ok(v.checks.some(c => !c.pass && c.name.includes("jank")));
});

test("CAM-10 stats: negativeVerdict rejects degenerate inputs", () => {
  assert.throws(() => negativeVerdict({delayMs: 0, baseline, degraded: degradedGood, injectedCommands: 1}));
  assert.throws(() => negativeVerdict({delayMs: 120, baseline, degraded: degradedGood, injectedCommands: 0}));
});

test("CAM-10 stats: recoveryVerdict — flag cleared must return to baseline envelope", () => {
  const recovered = {latency: {drag: {p95Ms: 22}, zoom: {p95Ms: 84}}};
  assert.equal(recoveryVerdict({delayMs: 120, baseline, recovered}).pass, true);
  const stillBad = {latency: {drag: {p95Ms: 22}, zoom: {p95Ms: 85.1}}}; // ceiling 25+60=85
  const v = recoveryVerdict({delayMs: 120, baseline, recovered: stillBad});
  assert.equal(v.pass, false);
  assert.ok(v.checks.some(c => !c.pass && c.name.startsWith("zoom")));
});
