import { catchUp, type ReturnReport } from "../simulation/offline";
import type { SimState } from "../simulation/types";

/**
 * Versioned handoff for the offline catch-up worker (spec 18.5). A response whose
 * version or id does not match the request the client is waiting for is ignored,
 * so a stale result can never overwrite a newer adopted snapshot.
 */
export const CATCHUP_PROTOCOL = 1;

/** Absences of at least this many ticks are worth a worker hop (1 tick = 100 ms). */
export const CATCHUP_WORKER_MIN_TICKS = 20_000;

export interface CatchUpRequest {
  readonly protocol: number;
  readonly id: number;
  readonly sim: SimState;
  readonly lastSeenMs: number;
  readonly nowMs: number;
}

export interface CatchUpResponse {
  readonly protocol: number;
  readonly id: number;
  readonly sim: SimState;
  readonly report: ReturnReport;
  readonly nextLastSeenMs: number;
}

/**
 * The one catch-up implementation, used by the worker entry point and by the
 * synchronous fallback, so both paths must agree exactly (spec 18.1).
 */
export function handleCatchUp(request: CatchUpRequest | undefined): CatchUpResponse | null {
  if (!request || request.protocol !== CATCHUP_PROTOCOL) return null;
  const { report, nextLastSeenMs } = catchUp(request.sim, request.lastSeenMs, request.nowMs);
  return { protocol: CATCHUP_PROTOCOL, id: request.id, sim: request.sim, report, nextLastSeenMs };
}

export type CatchUpBacked = "worker" | "sync";

export interface CatchUpClient {
  /** Settles with the adopted handoff, or `null` when the run was cancelled. */
  run(sim: SimState, lastSeenMs: number, nowMs: number): Promise<CatchUpResponse | null>;
  /** Abandons the in-flight run; its result is then ignored by `run`. */
  cancel(): void;
  readonly backed: CatchUpBacked;
}

/** Milliseconds before a worker that never answers is treated as absent. */
const WORKER_TIMEOUT_MS = 2_000;

/**
 * Runs the catch-up off the main thread when the page has workers, and inline
 * when it does not (spec 18.5). Starting a new run cancels the previous one, and
 * a worker that never replies falls back to the same synchronous function, so a
 * missing worker build degrades to the previous behaviour rather than a freeze.
 */
export function createCatchUpClient(): CatchUpClient {
  let seq = 0;
  let worker: Worker | null = null;
  let cancelled = 0;

  const stopWorker = () => {
    if (worker) {
      worker.terminate();
      worker = null;
    }
  };

  const run: CatchUpClient["run"] = (sim, lastSeenMs, nowMs) => {
    const id = ++seq;
    cancelled = id;
    if (typeof Worker === "undefined") {
      return Promise.resolve(handleCatchUp({ protocol: CATCHUP_PROTOCOL, id, sim, lastSeenMs, nowMs }));
    }
    stopWorker();
    return new Promise<CatchUpResponse | null>((resolve) => {
      const request: CatchUpRequest = { protocol: CATCHUP_PROTOCOL, id, sim, lastSeenMs, nowMs };
      let settled = false;
      let active: Worker | null = null;
      const isCurrent = () => cancelled === id;
      const finish = (response: CatchUpResponse | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (worker === active) stopWorker();
        resolve(response);
      };
      const timer = setTimeout(() => {
        // No answer inside the budget: do the same work inline and stop waiting.
        finish(isCurrent() ? handleCatchUp(request) : null);
      }, WORKER_TIMEOUT_MS);
      try {
        active = new Worker(new URL("./catchup.worker.ts", import.meta.url), { type: "module" });
      } catch {
        finish(isCurrent() ? handleCatchUp(request) : null);
        return;
      }
      worker = active;
      active.onmessage = (event: MessageEvent<CatchUpResponse>) => {
        const response = event.data;
        const usable =
          isCurrent() &&
          !!response &&
          response.protocol === CATCHUP_PROTOCOL &&
          response.id === id &&
          !!response.sim;
        finish(usable ? (response as CatchUpResponse) : null);
      };
      active.onerror = () => finish(isCurrent() ? handleCatchUp(request) : null);
      active.postMessage(request);
    });
  };

  return {
    run,
    cancel() {
      cancelled = ++seq; // any in-flight answer is now stale
      stopWorker();
    },
    get backed(): CatchUpBacked {
      return typeof Worker === "undefined" ? "sync" : "worker";
    },
  };
}
