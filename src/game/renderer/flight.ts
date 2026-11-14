/*
 * RW3D T07 (#134): the drone flight parameter, extracted verbatim from scene.ts so
 * the three.js world layer can place moving units without importing scene.ts (which
 * pulls the UI logistics bridge across the renderer boundary and would form an import
 * cycle). Pure: no DOM, no THREE, no clock — the caller supplies tick + framePhase.
 * scene.ts re-exports `droneLeg` so the legacy import surface is unchanged.
 */
import { TUNING } from "../content/defs";
import type { DroneState } from "../simulation/types";

/**
 * E-1: the drone's place on its own cycle as one continuous parameter. The loaded leg is
 * the in-flight record (wreck -> dock over `droneTravelTicks`); after the batch is counted
 * the unit holds at the dock for that tick and then runs the empty leg back, `t = 1 - u`,
 * finishing exactly at the next launch, so the position never teleports the whole leg.
 * The model's own spacing makes the last arrival recoverable without a new state field
 * (`nextDeliveryTick - arrive == droneDeliveryTicks - droneTravelTicks`), so the save
 * format and the checksum inputs are untouched.
 */
export function droneLeg(unit: DroneState, tick: number, phase: number): number {
  const travel = TUNING.droneTravelTicks;
  const cycle = TUNING.droneDeliveryTicks - travel; // 40 ticks of empty leg + hold
  const now = tick + phase;
  if (unit.inFlight) {
    // A1: position is a function of (arrive, framePhase), not of `state.tick` alone.
    // The launch is recorded on the tick *before* the first frame that shows it and the
    // cargo is counted on the tick *after* the last one, so the drawn frames of the leg
    // are `arrive - travel + 1 .. arrive + 1`; that window is the parameter's 0..1.
    // A9: the same sub-tick phase as the drone, over the 5-tick latency window.
    const since = now - (unit.inFlight.arrive - travel + 1);
    // Inside the recorded window the parameter is the accepted linear leg, unchanged.
    if (since <= travel) return Math.min(1, Math.max(0, since / travel));
    // DEF-004/DEF-005: an in-flight record whose `arrive` is stale (a caught-up save keeps it
    // while the tick has run far ahead) used to clamp at exactly 1 forever. The wrap runs the
    // loaded leg, one tick of dock hold, the empty leg and one tick of wreck hold, so the
    // value is continuous through the seam instead of snapping the whole leg in one frame.
    const period = 2 * travel + 2; // 10 + 1 + 10 + 1
    const within = since % period;
    if (within <= travel) return within / travel;
    if (within <= travel + 1) return 1; // the dock dwell, cargo being counted
    if (within <= 2 * travel + 1) return 1 - (within - (travel + 1)) / travel;
    return 0; // the wreck dwell before the next launch
  }
  if (!(unit.deliveries > 0) || !(unit.nextDeliveryTick > 0)) return 0; // never launched
  // The empty leg starts on the frame right after the cargo is counted and runs out
  // exactly on the frame the next launch shows, so no seam between the two branches.
  const lastArrive = unit.nextDeliveryTick - cycle;
  // DEF-004: the leg wraps on its own `cycle` instead of clamping, so a unit whose recorded
  // anchor is stale relative to `now` (the store sat at its cap, so no further launch was
  // recorded) keeps cycling rather than holding one lattice position forever. Inside the
  // first window the modulo is the identity, so the accepted frames are unchanged: at
  // `now = lastArrive + 1` this and the loaded leg both give 1.
  const sinceLast = now - (lastArrive + 1);
  if (sinceLast <= cycle) return 1 - Math.min(1, Math.max(0, sinceLast / cycle));
  // DEF-005: same eased shape as the loaded leg - out over `cycle`, back over `cycle`, so the
  // value stays continuous at every joint and one frame never moves the whole leg.
  const back = sinceLast % (2 * cycle);
  return back <= cycle ? 1 - back / cycle : (back - cycle) / cycle;
}