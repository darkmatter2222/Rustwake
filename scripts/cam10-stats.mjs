/**
 * CAM-10 (#346) measurement-slice statistics — pure, deterministic helpers for
 * scripts/capture-cam10.mjs. NO browser, NO timers, NO I/O: unit-testable math
 * only. Rendered-world behaviour is proven by the capture script itself; a
 * pure-math pass alone is NOT acceptance for #346.
 *
 * Definitions (declared, not tuned after the fact):
 *  - frame delta: milliseconds between consecutive requestAnimationFrame
 *    callbacks while the measurement monitor is armed (60 Hz display budget
 *    FRAME_BUDGET_MS = 1000/60).
 *  - jank frame: delta > JANK_MS (50 ms — three missed 60 Hz vsyncs).
 *  - dropped frames: sum(max(0, round(delta / FRAME_BUDGET_MS) - 1)).
 *  - input-to-photon (proxy): event.timeStamp of the synthetic gesture event
 *    -> timestamp of the FIRST rAF callback that observes the camera dataset
 *    stamp changed by that input (matched by probe sequence number, never by
 *    evaluation order). Headless SwiftShader has no physical display, so this
 *    is event-to-next-rendered-frame, NOT a physical photon measurement.
 *  - percentile: nearest-rank on the ascending sample (P95 of n samples is
 *    index ceil(0.95*n)-1). Empty sample -> null (never a fabricated 0).
 */
export const FRAME_BUDGET_MS = 1000 / 60;
export const JANK_MS = 50;

export function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) return null;
  if (!(p > 0 && p <= 100)) throw new Error("percentile p must be in (0,100]");
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

export function frameStats(deltas, durationMs) {
  if (!Array.isArray(deltas)) throw new Error("deltas must be an array");
  const n = deltas.length;
  const jank = deltas.filter(d => d > JANK_MS).length;
  const dropped = deltas.reduce((s, d) => s + Math.max(0, Math.round(d / FRAME_BUDGET_MS) - 1), 0);
  return {
    frames: n,
    durationMs,
    fps: n > 0 && durationMs > 0 ? (n / durationMs) * 1000 : null,
    meanMs: n ? deltas.reduce((s, d) => s + d, 0) / n : null,
    p50Ms: percentile(deltas, 50),
    p95Ms: percentile(deltas, 95),
    maxMs: n ? Math.max(...deltas) : null,
    jankFrames: jank,
    droppedFrames: dropped
  };
}

export function latencyStats(samples) {
  const n = samples.length;
  return {
    count: n,
    meanMs: n ? samples.reduce((s, v) => s + v, 0) / n : null,
    p50Ms: percentile(samples, 50),
    p95Ms: percentile(samples, 95),
    minMs: n ? Math.min(...samples) : null,
    maxMs: n ? Math.max(...samples) : null
  };
}

/**
 * Deterministic negative-case verdict. The harness injects a synchronous
 * main-thread stall of `delayMs` into every measured camera command (probe
 * flag, never a quality change). Detection is provable, not load-dependent:
 *   - every degraded latency sample must include the injected stall:
 *     min(sample) >= delayMs (event.timeStamp precedes handler execution);
 *   - the degraded P95 must exceed the baseline P95 by at least half the
 *     injected stall (margin absorbs scheduler noise, never the stall itself);
 *   - each stalled command blocks the frame loop, so degraded jank count must
 *     be >= the number of injected commands.
 * Returns {pass, checks:[{name, expected, actual, pass}]} with exact numbers.
 */
export function negativeVerdict({ delayMs, baseline, degraded, injectedCommands }) {
  if (!(delayMs > 0)) throw new Error("delayMs must be > 0");
  if (!(injectedCommands > 0)) throw new Error("injectedCommands must be > 0");
  const kinds = ["drag", "zoom"];
  const checks = [];
  for (const kind of kinds) {
    const d = degraded.latency[kind], b = baseline.latency[kind];
    const dMin = d && d.count ? d.minMs : null;
    checks.push({
      name: `${kind}: every degraded sample >= injected stall`,
      expected: `min >= ${delayMs}`,
      actual: dMin,
      pass: dMin != null && dMin >= delayMs
    });
    const want = b && b.p95Ms != null ? b.p95Ms + delayMs / 2 : null;
    checks.push({
      name: `${kind}: degraded P95 >= baseline P95 + delay/2`,
      expected: want,
      actual: d ? d.p95Ms : null,
      pass: want != null && d != null && d.p95Ms != null && d.p95Ms >= want
    });
  }
  checks.push({
    name: "degraded jank frames >= injected commands",
    expected: `>= ${injectedCommands}`,
    actual: degraded.frames.jankFrames,
    pass: degraded.frames.jankFrames >= injectedCommands
  });
  return { pass: checks.every(c => c.pass), checks };
}

/**
 * Recovery verdict: after the injected flag is cleared, latency must return
 * to the baseline envelope (P95 <= baseline P95 + delay/2). Proves the
 * degradation was caused by the flag, not by a warming/cooling runner.
 */
export function recoveryVerdict({ delayMs, baseline, recovered }) {
  const checks = [];
  for (const kind of ["drag", "zoom"]) {
    const b = baseline.latency[kind], r = recovered.latency[kind];
    const ceiling = b && b.p95Ms != null ? b.p95Ms + delayMs / 2 : null;
    checks.push({
      name: `${kind}: recovered P95 <= baseline P95 + delay/2`,
      expected: ceiling,
      actual: r ? r.p95Ms : null,
      pass: ceiling != null && r != null && r.p95Ms != null && r.p95Ms <= ceiling
    });
  }
  return { pass: checks.every(c => c.pass), checks };
}
