import { describe, expect, it } from "vitest";
import seedEnvelope from "../../docs/evidence/yard-mature.json";
import { BLUEPRINTS, RECIPES, TUNING, unlockedBlueprints, type ResourceId } from "../../src/game/content/defs";
import {
  applyCommand,
  DOCK_TILE,
  droneAddCost,
  sellableAmount,
  upgradeCost,
  YARD_TILES,
  type Command,
  type CommandBody,
} from "../../src/game/simulation/commands";
import { advance } from "../../src/game/simulation/engine";
import {
  batchMilliFor,
  createInitialState,
  inputCapacityOf,
  powerOf,
  upgradeRanks,
  type MachineState,
  type SimState,
  type UpgradeBranch,
} from "../../src/game/simulation/types";
import { checksum, decodeSave, encodeSave, validateSim } from "../../src/game/persistence/save";
import { SELL_ORDER, nextYardStep } from "../../src/game/simulation/plan";
import { planConnections } from "../../src/game/simulation/autoconnect";

/**
 * STRAT-002/A1: the named-outcome fork. One paid level buys exactly one of three
 * quantities, an unnamed level keeps the pre-fork scalar, and a re-pick costs nothing.
 */

let seq = 900;
function send(s: SimState, body: CommandBody): boolean {
  const key = "f" + (seq += 1);
  return applyCommand(s, { ...body, id: key } as Command).ok;
}

/** Starter yard with both tutorial machines running: pulses, drone, two links, feed. */
function yard(): SimState {
  const s = createInitialState();
  for (let i = 0; i < 6; i += 1) {
    send(s, { type: "manual.salvage" });
    advance(s, TUNING.manualPulseTicks);
  }
  send(s, { type: "drone.repair" });
  advance(s, 262);
  const seed: Partial<Record<ResourceId, number>> = { scrap: 120, ferrous: 40 };
  for (const key of Object.keys(seed) as ResourceId[]) {
    const value = seed[key] ?? 0;
    s.store[key] = (s.store[key] ?? 0) + value;
    s.storeUnits += value;
  }
  send(s, { type: "machine.build", blueprint: "sorter", tile: 0 });
  send(s, { type: "route.connect", from: 0, to: 1, filter: "scrap" });
  send(s, { type: "route.connect", from: 1, to: 0, filter: null });
  send(s, { type: "machine.build", blueprint: "furnace", tile: 1 });
  send(s, { type: "route.connect", from: 0, to: 2, filter: "ferrous" });
  send(s, { type: "route.connect", from: 2, to: 0, filter: null });
  advance(s, 300);
  s.credits = 200;
  return s;
}

const pick = (s: SimState, blueprint: string): MachineState =>
  s.machines.find((m) => m.blueprint === blueprint) as MachineState;

/* ---- A1-2v2 instrument, mirrored from work/feedback/strat002-harness.mjs ---- */

const PULSE_PERIOD = 9;
const PULSE_ON = 5;

/** The harness' first free tile: the dock tile is skipped, 8 is the fallback. */
function a12Tile(s: SimState): number {
  for (let tile = 0; tile < YARD_TILES; tile += 1) {
    if (tile === DOCK_TILE) continue;
    if (!s.machines.some((m) => m.tile === tile)) return tile;
  }
  return 8;
}

/** The same teaching sequence the harness runs, step by step. */
function tutorialBodies(s: SimState): CommandBody[] | null {
  const step = s.tutorial;
  if (step <= 1) return [{ type: "manual.salvage" }];
  if (step === 2) return [{ type: "drone.repair" }];
  if (step <= 6) {
    if (s.machines.length === 0) return [{ type: "machine.build", blueprint: "sorter", tile: 8 }];
    if (s.routes.length === 0) {
      return [
        { type: "route.connect", from: 0, to: 1, filter: "scrap" },
        { type: "route.connect", from: 1, to: 0, filter: "ferrous" },
      ];
    }
    const furnace = s.machines.find((m) => m.blueprint === "furnace");
    if (!furnace) {
      if ((s.store["scrap"] ?? 0) >= 10 && (s.store["ferrous"] ?? 0) >= 5) {
        return [{ type: "machine.build", blueprint: "furnace", tile: 9 }];
      }
      return [{ type: "manual.salvage" }];
    }
    const plans = planConnections(s, furnace.id);
    if (plans.length > 0) {
      return plans.map((plan) => ({ type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter }));
    }
    return [{ type: "manual.salvage" }];
  }
  if (step === 7) return [{ type: "contract.export" }];
  return null;
}

/** One scored row: shared boot, one command per round, 10 ticks apart, 1800 rounds.
 * `irregular` gates the wreck pulse into 5 pulsed / 4 silent rounds (decision 1.4). */
function a12Row(branch: UpgradeBranch | null, irregular: boolean) {
  const s = createInitialState();
  let seq = 0;
  let taps = 0;
  let rejects = 0;
  let earned = 0;
  let pulses = 0;
  let powerLimitedRounds = 0;
  let minPowerRatio = 1;
  let firstResearch: number | null = null;
  const kinds: Record<string, number> = {};
  const send = (body: CommandBody): boolean => {
    const before = s.credits;
    const ok = applyCommand(s, { ...body, id: "a12-" + (seq += 1) }).ok;
    const delta = s.credits - before;
    if (delta > 0) earned += delta;
    if (!ok) rejects += 1;
    return ok;
  };
  for (let i = 0; i < 6; i += 1) {
    send({ type: "manual.salvage" });
    advance(s, TUNING.manualPulseTicks);
  }
  send({ type: "drone.repair" });
  advance(s, 262);
  taps += 7;
  for (let round = 0; round < 1800; round += 1) {
    if (!s.exportClaimed && (s.store["steel"] ?? 0) >= TUNING.exportContractSteel) {
      send({ type: "contract.export" });
      taps += 1;
    }
    if (irregular && round % PULSE_PERIOD < PULSE_ON) {
      send({ type: "manual.salvage" });
      pulses += 1;
      taps += 1;
    }
    const taught = tutorialBodies(s);
    if (taught !== null) {
      for (const body of taught) send(body);
      taps += 1;
    } else {
      const step = nextYardStep(s);
      if (step && step.kind) {
        if (step.kind !== "salvage") kinds[step.kind] = (kinds[step.kind] ?? 0) + 1;
        switch (step.kind) {
          case "connect":
            for (const plan of step.plans) {
              send({ type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
            }
            taps += 1;
            break;
          case "build":
            send({ type: "machine.build", blueprint: step.blueprint, tile: a12Tile(s) });
            taps += 2;
            break;
          case "sell":
            send({ type: "contract.sell", resource: step.resource, qty: step.qty });
            taps += 1;
            break;
          case "research":
            send({ type: "research.buy", node: step.node });
            taps += 1;
            if (firstResearch === null) firstResearch = round + 1;
            break;
          case "drone":
            send({ type: "drone.add" });
            taps += 1;
            break;
          case "upgrade":
            send(
              branch === null
                ? { type: "machine.upgrade", machineId: step.machineId }
                : { type: "machine.upgrade", machineId: step.machineId, branch }
            );
            taps += 1;
            break;
          default:
            send({ type: "manual.salvage" });
            taps += 1;
        }
      }
    }
    advance(s, 10);
    if (s.powerRatio < 1) powerLimitedRounds += 1;
    if (s.powerRatio < minPowerRatio) minPowerRatio = s.powerRatio;
  }
  const starved = s.machines.map((m) =>
    Math.round((Math.min(m.starvedTicks, m.ageTicks) / Math.max(1, m.ageTicks)) * 100)
  );
  const batches = s.machines.reduce((sum, m) => sum + m.batchesDone, 0);
  return {
    batches,
    credits: Math.round(s.credits),
    creditsEarned: earned,
    creditsPer1000Batches: Number(((earned / Math.max(1, batches)) * 1000).toFixed(3)),
    taps,
    rejects,
    pulses,
    powerLimitedRounds,
    minPowerRatio: Number(minPowerRatio.toFixed(3)),
    starvedMax: Math.max(...starved),
    starvedMean: Math.round(starved.reduce((sum, value) => sum + value, 0) / Math.max(1, starved.length)),
    firstResearch,
    kinds,
    // R4: the three pick counts, each named by its own field.
    attempts: kinds.upgrade ?? 0,
    purchasedLevels: s.machines.reduce((sum, m) => sum + (m.level - 1), 0),
    picksRecorded: s.machines.reduce((sum, m) => sum + (m.branch ? m.branch.length : 0), 0),
    tick: s.tick,
    machines: s.machines.length,
  };
}

describe("STRAT-002/A1 the named-outcome fork", () => {
  it("keeps a pre-fork save byte-identical: checksum eede3c4f, schemaVersion 1", () => {
    const raw = JSON.stringify(seedEnvelope);
    const decoded = decodeSave(raw);
    if (!decoded.ok) throw new Error("the seed save must decode, got " + decoded.reason);
    const payload = decoded.payload;
    expect(payload.sim.schemaVersion).toBe(1);
    expect(seedEnvelope.checksum).toBe("eede3c4f");
    expect(checksum(JSON.stringify(payload))).toBe("eede3c4f");
    // No machine carries a branch, so the key never enters the serialized body and a
    // re-encode reproduces the file exactly, checksum included.
    for (const machine of payload.sim.machines) expect(machine.branch).toBeUndefined();
    expect(encodeSave(payload.sim, payload.lastSeenMs, payload.settings)).toBe(raw);
    expect(validateSim(payload.sim)).toBeNull();
  });

  it("omits the branch key entirely while no branch is named", () => {
    const s = yard();
    const sorter = pick(s, "sorter");
    const before = sorter.batchMilli;
    expect(send(s, { type: "machine.upgrade", machineId: sorter.id })).toBe(true);
    expect(sorter.branch).toBeUndefined();
    expect(JSON.stringify(s).includes('"branch"')).toBe(false);
    // The one scalar it always had: the additive rate curve at the new level.
    expect(sorter.batchMilli).toBe(batchMilliFor("sorter", sorter.level));
    expect(sorter.batchMilli).toBeLessThan(before);
    expect(sorter.level).toBe(2);
  });

  it("moves exactly one quantity per named outcome against the unnamed ladder", () => {
    const once = (branch: UpgradeBranch | null) => {
      const s = yard();
      const furnace = pick(s, "furnace");
      const paid = s.credits;
      send(
        s,
        branch === null
          ? { type: "machine.upgrade", machineId: furnace.id }
          : { type: "machine.upgrade", machineId: furnace.id, branch }
      );
      advance(s, 40);
      return {
        spent: paid - s.credits,
        milli: furnace.batchMilli,
        capacity: inputCapacityOf(furnace, 0),
        draw: powerOf(furnace),
        stored: furnace.batchPower,
      };
    };
    const plain = once(null);
    expect(plain.spent).toBe(upgradeCost(BLUEPRINTS.furnace.baseUpgradeCost, 1));

    // By construction an unnamed level *is* a speed rank, so the speed pick reproduces
    // the pre-fork scalar exactly; the other two picks hold the batch clock still.
    const speed = once("speed");
    expect(speed.milli).toBe(plain.milli);
    expect(speed.capacity).toBe(plain.capacity);
    expect(speed.draw).toBe(plain.draw);

    const buffer = once("buffer");
    expect(buffer.milli).toBeGreaterThan(plain.milli);
    expect(buffer.capacity).toBe(plain.capacity + 6);
    expect(buffer.draw).toBe(plain.draw);

    const draw = once("draw");
    expect(draw.milli).toBe(buffer.milli);
    expect(draw.capacity).toBe(plain.capacity);
    expect(draw.draw).toBe(plain.draw - 1);
    // The engine pays the reduced draw, not just the helper.
    expect(draw.stored).toBe(draw.draw);
    expect(plain.stored).toBe(RECIPES[BLUEPRINTS.furnace.recipeId].power);
  });

  it("never lets a named draw fall below one unit, so no pick is inert by accident", () => {
    const s = yard();
    const sorter = pick(s, "sorter"); // recipe power 1
    send(s, { type: "machine.upgrade", machineId: sorter.id, branch: "draw" });
    send(s, { type: "machine.upgrade", machineId: sorter.id, branch: "draw" });
    expect(powerOf(sorter)).toBe(1);
    expect(upgradeRanks(sorter)).toEqual({ speed: 0, buffer: 0, draw: 2 });
  });

  it("respecs with no cost, no state loss, and no drift from the same picks", () => {
    const s = yard();
    const furnace = pick(s, "furnace");
    send(s, { type: "machine.upgrade", machineId: furnace.id, branch: "speed" });
    send(s, { type: "machine.upgrade", machineId: furnace.id, branch: "buffer" });
    const credits = s.credits;
    const level = furnace.level;
    const record = JSON.stringify(furnace);

    // The newest pick is the one that moves: the level stays paid, the ranks shift.
    send(s, { type: "machine.respec", machineId: furnace.id, branch: "draw" });
    expect(s.credits).toBe(credits);
    expect(furnace.level).toBe(level);
    expect(furnace.branch).toEqual(["speed", "draw"]);
    expect(upgradeRanks(furnace)).toEqual({ speed: 1, buffer: 0, draw: 1 });

    // Reversible: the same taps back restore the machine record exactly.
    send(s, { type: "machine.respec", machineId: furnace.id, branch: "buffer" });
    expect(furnace.branch).toEqual(["speed", "buffer"]);
    expect(JSON.stringify(furnace)).toBe(record);
  });

  it("keeps the chosen branch across a save round trip", () => {
    const s = yard();
    const furnace = pick(s, "furnace");
    send(s, { type: "machine.upgrade", machineId: furnace.id, branch: "buffer" });
    const text = encodeSave(s, 1234, { muted: true, reducedMotion: false, textScale: 1 });
    const decoded = decodeSave(text);
    if (!decoded.ok) throw new Error("round trip must decode, got " + decoded.reason);
    const loaded = pick(decoded.payload.sim, "furnace");
    expect(loaded.branch).toEqual(["buffer"]);
    expect(loaded.level).toBe(furnace.level);
    expect(checksum(JSON.stringify(decoded.payload.sim))).toBe(checksum(JSON.stringify(s)));
    // Offline catch-up reads the same ranks after the reload.
    advance(decoded.payload.sim, 30);
    expect(inputCapacityOf(loaded, 0)).toBe(BLUEPRINTS.furnace.inputBuffer + 6);
  });

  it("refuses a damaged branch list instead of renumbering it", () => {
    const s = yard();
    const furnace = pick(s, "furnace");
    send(s, { type: "machine.upgrade", machineId: furnace.id, branch: "speed" });
    const text = encodeSave(s, 1, { muted: false, reducedMotion: false, textScale: 1 });
    const damaged = JSON.parse(text) as {
      payload: { sim: { machines: Record<string, unknown>[] } };
    };
    damaged.payload.sim.machines[1].branch = ["nope"];
    expect(decodeSave(JSON.stringify(damaged)).ok).toBe(false);
    damaged.payload.sim.machines[1].branch = ["speed", "speed"];
    expect(decodeSave(JSON.stringify(damaged)).ok).toBe(false);
  });

  it("widens the costed-choice census on the naive line (A1-1)", () => {
    // Same boot as the harness: the tutorial drives the first rounds, the ladder
    // speaks from tutorial 8 on, and the census runs once per round.
    const tutorial = (s: SimState): CommandBody[] | null => {
      const step = s.tutorial;
      if (step <= 1) return [{ type: "manual.salvage" }];
      if (step === 2) return [{ type: "drone.repair" }];
      if (step <= 6) {
        if (s.machines.length === 0) return [{ type: "machine.build", blueprint: "sorter", tile: 8 }];
        if (s.routes.length === 0) {
          return [
            { type: "route.connect", from: 0, to: 1, filter: "scrap" },
            { type: "route.connect", from: 1, to: 0, filter: "ferrous" },
          ];
        }
        const furnace = s.machines.find((m) => m.blueprint === "furnace");
        if (!furnace) {
          if ((s.store["scrap"] ?? 0) >= 10 && (s.store["ferrous"] ?? 0) >= 5) {
            return [{ type: "machine.build", blueprint: "furnace", tile: 9 }];
          }
          return [{ type: "manual.salvage" }];
        }
        const plans = planConnections(s, furnace.id);
        if (plans.length > 0) {
          return plans.map((plan) => ({
            type: "route.connect",
            from: plan.from,
            to: plan.to,
            filter: plan.filter,
          }));
        }
        return [{ type: "manual.salvage" }];
      }
      if (step === 7) return [{ type: "contract.export" }];
      return null;
    };
    const census = (branch: UpgradeBranch | null) => {
      const s = createInitialState();
      let counted = 0;
      for (let round = 0; round < 1800; round += 1) {
        if (!s.exportClaimed && (s.store["steel"] ?? 0) >= TUNING.exportContractSteel) {
          send(s, { type: "contract.export" });
        }
        const taught = tutorial(s);
        if (taught !== null) {
          for (const body of taught) send(s, body);
        } else {
          const step = nextYardStep(s);
          switch (step.kind) {
            case "connect":
              for (const plan of step.plans) {
                send(s, { type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
              }
              break;
            case "build":
              send(s, { type: "machine.build", blueprint: step.blueprint, tile: 8 + (round % 20) });
              break;
            case "sell":
              send(s, { type: "contract.sell", resource: step.resource, qty: step.qty });
              break;
            case "research":
              send(s, { type: "research.buy", node: step.node });
              break;
            case "drone":
              send(s, { type: "drone.add" });
              break;
            case "upgrade":
              send(
                s,
                branch === null
                  ? { type: "machine.upgrade", machineId: step.machineId }
                  : { type: "machine.upgrade", machineId: step.machineId, branch }
              );
              break;
            default:
              send(s, { type: "manual.salvage" });
          }
        }
        // The census the harness prints: distinct cost-bearing options payable now -
        // each affordable blueprint, the fork's three named outcomes at one price,
        // the fleet, the next research node, one sell tranche.
        const options: string[] = [];
        const unbuilt = unlockedBlueprints(s.tutorial).filter(
          (id) => !s.machines.some((m) => m.blueprint === id)
        );
        for (const blueprint of unbuilt) {
          if (BLUEPRINTS[blueprint].buildCost.every((item) => (s.store[item.resource] ?? 0) >= item.qty)) {
            options.push("build:" + blueprint);
          }
        }
        const upgrade = s.machines.find(
          (m) => s.credits >= upgradeCost(BLUEPRINTS[m.blueprint].baseUpgradeCost, m.level)
        );
        if (upgrade) {
          const price = upgradeCost(BLUEPRINTS[upgrade.blueprint].baseUpgradeCost, upgrade.level);
          for (const name of ["speed", "buffer", "draw"]) options.push(name + price);
        }
        if (s.drone.repaired && 1 + s.spares.length < TUNING.fleetCap && s.credits >= droneAddCost(s)) {
          options.push("drone");
        }
        if ((s.store["data"] ?? 0) >= 4) options.push("research");
        for (const resource of SELL_ORDER) {
          if (sellableAmount(s, resource) > 0) options.push("sell:" + resource);
        }
        if (options.length >= 2) counted += 1;
        advance(s, 10);
      }
      return counted;
    };
    // Both readings are the naive line's census, with and without an explicit pick:
    // the count comes from the three named options the dock shows at one price.
    expect(census(null)).toBeGreaterThanOrEqual(120);
    expect(census("buffer")).toBeGreaterThanOrEqual(120);
  });
});

/**
 * STRAT-002/A1-2v2 (work/product/STRAT-002-decision-g2.md 1.2): the scored table is the
 * three named rows, the unnamed row is the by-construction speed twin (R3), and a pick
 * count has to say which field it reads (R4).
 */
describe("STRAT-002/A1-2v2 the scored table and the pick counts", () => {
  it("reports the unnamed row as the speed twin on every scored column (R3)", () => {
    for (const irregular of [false, true]) {
      const twin = a12Row(null, irregular);
      const speed = a12Row("speed", irregular);
      // Same plan, so every scalar column and all six kinds counters are equal.
      const { picksRecorded: twinPicks, ...twinRest } = twin;
      const { picksRecorded: speedPicks, ...speedRest } = speed;
      expect(twinRest).toEqual(speedRest);
      // The one field the twin cannot share: an unnamed level records no branch list,
      // while the purchased-level count it paid for is the same 97 (R4's third number).
      expect(twinPicks).toBe(0);
      expect(speedPicks).toBe(twin.purchasedLevels);
      // Non-vacuous: the other two names do move the same columns.
      const buffer = a12Row("buffer", irregular);
      const draw = a12Row("draw", irregular);
      expect(buffer.batches).not.toBe(speed.batches);
      expect(draw.powerLimitedRounds).not.toBe(speed.powerLimitedRounds);
      expect(buffer.credits).not.toBe(speed.credits);
      // The columns g2 promoted out of stages[] and added are present and numeric.
      expect(Number.isInteger(twin.starvedMax)).toBe(true);
      expect(Number.isInteger(twin.starvedMean)).toBe(true);
      expect(Number.isInteger(twin.creditsEarned)).toBe(true);
      expect(twin.creditsPer1000Batches).toBe(
        Number(((twin.creditsEarned / Math.max(1, twin.batches)) * 1000).toFixed(3))
      );
    }
  }, 30_000);

  it("separates upgrade attempts from purchased levels, so a criterion names its field (R4)", () => {
    const s = yard();
    const furnace = pick(s, "furnace");
    // 40 then 47 cover two levels; the third price is 55, so later attempts are refused.
    s.credits = 87;
    const attempts: boolean[] = [];
    for (let i = 0; i < 4; i += 1) {
      attempts.push(send(s, { type: "machine.upgrade", machineId: furnace.id, branch: "buffer" }));
    }
    const paid = attempts.filter((ok) => ok).length;
    const rejects = attempts.length - paid;
    expect(furnace.level).toBe(3);
    expect(furnace.branch).toEqual(["buffer", "buffer"]);
    expect(upgradeRanks(furnace).buffer).toBe(2);
    // The purchased-level count is the paid attempts and the length of the branch list.
    expect(furnace.level - 1).toBe(paid);
    expect(furnace.branch!.length).toBe(paid);
    // The attempt count is a third number: attempts minus rejects reconciles them.
    expect(attempts.length).not.toBe(paid);
    expect(attempts.length - rejects).toBe(furnace.level - 1);
  });

  it("keeps buffer on one mechanism-adjacent column under irregular supply, and only one", () => {
    const speed = a12Row("speed", true);
    const buffer = a12Row("buffer", true);
    const draw = a12Row("draw", true);
    // The rule as written: >= 5 % relative or >= 10 absolute on one mechanism column.
    const rival = Math.max(speed.creditsPer1000Batches, draw.creditsPer1000Batches);
    const absolute = buffer.creditsPer1000Batches - rival;
    expect(absolute).toBeGreaterThanOrEqual(10);
    // The preferred starvation columns stay with speed: the recorded negative result.
    expect(buffer.starvedMax).toBeGreaterThan(speed.starvedMax);
    expect(buffer.starvedMean).toBeGreaterThan(speed.starvedMean);
    expect(draw.powerLimitedRounds).toBe(0);
    expect(speed.batches - Math.max(buffer.batches, draw.batches)).toBeGreaterThanOrEqual(900);
    // R4 at ladder scale: the branch-list length is the purchased-level count, while the
    // attempt counter (`kinds.upgrade`) is a different, larger number.
    expect(buffer.picksRecorded).toBe(buffer.purchasedLevels);
    expect(buffer.attempts).not.toBe(buffer.purchasedLevels);
    expect(buffer.attempts).toBeGreaterThan(buffer.purchasedLevels);
  }, 30_000);
});
