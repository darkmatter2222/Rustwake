/*
 * UI-RESET-50 (G2 wave 2): the pointer gesture state machine.
 *
 * One pure reducer separates tap from drag from pinch from cancel, so the
 * canvas handlers only apply camera deltas and commit taps the machine has
 * already cleared. Rules the issue pins:
 *  - a tap is a single pointer that never travelled past the threshold;
 *  - a drag pans and can never commit a tap, even if it ends where it began;
 *  - a second pointer turns the gesture into a pinch; neither lift afterwards
 *    is a tap;
 *  - a cancelled pointer spoils the whole gesture: no lift of any remaining
 *    pointer may select, salvage or place until every pointer is up and a new
 *    gesture starts.
 * Coordinates are canvas-local CSS pixels; the reducer never touches the DOM.
 */

export const TAP_THRESHOLD_PX = 8;
/** Below this span a two-pointer gesture has no meaningful zoom ratio yet. */
const PINCH_MIN_SPAN = 4;

export interface GesturePoint {
  x: number;
  y: number;
}

export type GesturePhase = "idle" | "pending" | "pan" | "pinch";

export interface GestureState {
  phase: GesturePhase;
  pointers: Map<number, GesturePoint>;
  /** Accumulated Manhattan travel of the leading pointer. */
  moved: number;
  lastX: number;
  lastY: number;
  pinchSpan: number;
  pinchX: number;
  pinchY: number;
  /** A cancel happened; no tap may commit until the gesture restarts. */
  spoiled: boolean;
}

export function idleGesture(): GestureState {
  return {
    phase: "idle",
    pointers: new Map(),
    moved: 0,
    lastX: 0,
    lastY: 0,
    pinchSpan: 0,
    pinchX: 0,
    pinchY: 0,
    spoiled: false,
  };
}

export type GestureInput =
  | { type: "down"; id: number; x: number; y: number }
  | { type: "move"; id: number; x: number; y: number }
  | { type: "up"; id: number; x: number; y: number }
  | { type: "cancel"; id: number };

export interface GestureOutput {
  state: GestureState;
  /** Screen-pixel camera pan to apply (drag or two-finger carry). */
  pan: { dx: number; dy: number } | null;
  /** Zoom ratio anchored at the pinch midpoint. */
  pinch: { factor: number; x: number; y: number } | null;
  /** A cleared tap: the only output that may select / salvage / place. */
  tap: { x: number; y: number } | null;
  /** Build-ghost follow point (single-pointer moves only). */
  ghost: { x: number; y: number } | null;
}

const NONE = { pan: null, pinch: null, tap: null, ghost: null } as const;

/** The first two registered pointers drive the pinch span and midpoint. */
function pinchBaseline(pointers: Map<number, GesturePoint>): {
  span: number;
  x: number;
  y: number;
} {
  const list = [...pointers.values()];
  if (list.length < 2) return { span: 0, x: 0, y: 0 };
  const [a, b] = list;
  return {
    span: Math.hypot(a.x - b.x, a.y - b.y),
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

export function applyGesture(state: GestureState, input: GestureInput): GestureOutput {
  const pointers = new Map(state.pointers);
  const next: GestureState = { ...state, pointers };

  switch (input.type) {
    case "down": {
      pointers.set(input.id, { x: input.x, y: input.y });
      if (pointers.size === 1) {
        // A fresh gesture: the spoil of the previous one dies with it.
        next.phase = "pending";
        next.moved = 0;
        next.spoiled = false;
        next.lastX = input.x;
        next.lastY = input.y;
        next.pinchSpan = 0;
      } else {
        next.phase = "pinch";
        const base = pinchBaseline(pointers);
        next.pinchSpan = base.span;
        next.pinchX = base.x;
        next.pinchY = base.y;
      }
      return { state: next, ...NONE };
    }

    case "move": {
      if (!pointers.has(input.id)) return { state, ...NONE };
      pointers.set(input.id, { x: input.x, y: input.y });
      if (pointers.size >= 2) {
        const base = pinchBaseline(pointers);
        const dx = base.x - state.pinchX;
        const dy = base.y - state.pinchY;
        const factor =
          base.span > PINCH_MIN_SPAN && state.pinchSpan > PINCH_MIN_SPAN
            ? base.span / state.pinchSpan
            : null;
        next.pinchSpan = base.span;
        next.pinchX = base.x;
        next.pinchY = base.y;
        return {
          state: next,
          pan: dx !== 0 || dy !== 0 ? { dx, dy } : null,
          pinch: factor === null ? null : { factor, x: base.x, y: base.y },
          tap: null,
          ghost: null,
        };
      }
      const dx = input.x - state.lastX;
      const dy = input.y - state.lastY;
      next.moved = state.moved + Math.abs(dx) + Math.abs(dy);
      next.lastX = input.x;
      next.lastY = input.y;
      if (next.moved > TAP_THRESHOLD_PX) next.phase = "pan";
      return {
        state: next,
        pan: next.phase === "pan" ? { dx, dy } : null,
        pinch: null,
        tap: null,
        ghost: { x: input.x, y: input.y },
      };
    }

    case "up": {
      if (!pointers.has(input.id)) return { state, ...NONE };
      const wasSize = pointers.size;
      const tap =
        state.phase === "pending" &&
        !state.spoiled &&
        wasSize === 1 &&
        state.moved <= TAP_THRESHOLD_PX
          ? { x: input.x, y: input.y }
          : null;
      pointers.delete(input.id);
      if (pointers.size === 0) return { state: idleGesture(), ...NONE, tap };
      if (wasSize >= 2 && pointers.size === 1) {
        // Dropping out of a pinch leaves a drag, never a pending tap.
        const remaining = [...pointers.values()][0];
        next.phase = "pan";
        next.lastX = remaining.x;
        next.lastY = remaining.y;
      } else if (pointers.size >= 2) {
        const base = pinchBaseline(pointers);
        next.pinchSpan = base.span;
        next.pinchX = base.x;
        next.pinchY = base.y;
      }
      return { state: next, ...NONE, tap };
    }

    case "cancel": {
      if (!pointers.has(input.id)) return { state, ...NONE };
      pointers.delete(input.id);
      if (pointers.size === 0) return { state: idleGesture(), ...NONE };
      next.spoiled = true;
      if (pointers.size === 1) {
        const remaining = [...pointers.values()][0];
        next.phase = "pan";
        next.lastX = remaining.x;
        next.lastY = remaining.y;
      } else {
        const base = pinchBaseline(pointers);
        next.pinchSpan = base.span;
        next.pinchX = base.x;
        next.pinchY = base.y;
      }
      return { state: next, ...NONE };
    }
  }
}
