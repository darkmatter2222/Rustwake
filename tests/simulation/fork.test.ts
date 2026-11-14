import { describe, expect, it } from "vitest";
import seedEnvelope from "../../docs/evidence/yard-mature.json";
import { BLUEPRINTS, RECIPES, TUNING, unlockedBlueprints, type ResourceId } from "../../src/game/content/defs";
import {
  applyCommand,
  branchPrice,
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
import { branchOptions } from "../../src/ui/text";
import { SELL_ORDER, nextYardStep } from "../../src/game/simulation/plan";
import { planConnections } from "../../src/game/simulation/autoconnect";
import {
  newLadderRecovery,
  ladderRecoveryTriggers,
  ladderRecoveryAdjust,
  ladderRecoveryClear,
} from "../../src/game/content/validate";

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

/* ---- A1-2v2/v3 instrument, mirrored from work/feedback/strat002-harness.mjs ---- */

import harnessJson from "../../work/feedback/strat002-harness.json";
import beltHarnessJson from "../../work/feedback/belt001-harness.json";

/**
 * BELT-001: the priced-connection tree re-ran the same mirror (scripts/probe-belt.mjs),
 * so the in-test mirror below reconciles against `ladderRows` from that run. #214:
 * work/feedback/strat002-harness.mjs was re-run on the GAME_SYSTEMS seed with the same
 * shared recovery play order, so its scored columns equal the belt rows again.
 */
const beltTable = (pattern: "regular" | "irregular" | "gap6") =>
  (beltHarnessJson as { ladderRows: Record<string, unknown[]> }).ladderRows[pattern] as unknown as StoredRow[];

/** The two gap ladders, exact predicates: round % 9 < 5 and round % 6 < 3. */
const GAP_SPECS = {
  gap9: { period: 9, on: 5 },
  gap6: { period: 6, on: 3 },
} as const;
type Ladder = "regular" | "gap9" | "gap6";

/**
 * STRAT-003: the two live plans cost different amounts; the mirror buys a plan
 * only when its own price is covered (the same policy the harness prints), and
 * takes the surplus sell in the rounds a plan is not covered.
 */
const LIVE = ["speed", "draw"] as const;
const mirrorPrices = (base: number, level: number) => ({
  speed: branchPrice(base, level, "speed"),
  draw: branchPrice(base, level, "draw"),
});
function mirrorPolicyPick(s: SimState, base: number, level: number): (typeof LIVE)[number] {
  const prices = mirrorPrices(base, level);
  const preferred: (typeof LIVE)[number] = s.powerRatio < 1 ? "draw" : "speed";
  if (s.credits >= prices[preferred]) return preferred;
  const options = LIVE.map((b) => ({ branch: b, price: prices[b] })).filter(
    (o) => s.credits >= o.price
  );
  options.sort((a, b) => a.price - b.price || LIVE.indexOf(a.branch) - LIVE.indexOf(b.branch));
  return options.length > 0 ? options[0].branch : preferred;
}

/** The harness' `sellStep`: one surplus tranche outside the pending build inputs. */
function mirrorSellStep(s: SimState): { resource: ResourceId; qty: number } | null {
  const unbuilt = unlockedBlueprints(s.tutorial).filter(
    (id) => !s.machines.some((m) => m.blueprint === id)
  );
  const pending = new Set<string>();
  for (const id of unbuilt) {
    for (const item of BLUEPRINTS[id].buildCost) {
      if ((s.store[item.resource] ?? 0) < item.qty) pending.add(item.resource);
    }
  }
  for (const resource of SELL_ORDER) {
    if (pending.has(resource)) continue;
    const qty = sellableAmount(s, resource);
    if (qty > 0) return { resource, qty };
  }
  return null;
}

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
      // #214: gate on the shipped furnace buildCost (35 scrap + 4 steel), not the
      // pre-retune 10 scrap + 5 ferrous. Mirrors scripts/probe-belt.mjs.
      if (BLUEPRINTS.furnace.buildCost.every((item) => (s.store[item.resource] ?? 0) >= item.qty)) {
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
 * `gap9` gates the wreck pulse 5 pulsed / 4 silent rounds (decision 1.4); `gap6`
 * gates it 3 pulsed / 3 silent rounds (g2 addendum, A1-2v3). The round's ten steps
 * are taken one tick at a time - identical `stepTick` calls to `advance(s, 10)` - so
 * the per-tick `inputStallTicks` sample (A1-2v3: not busy while the store sits at the
 * reserve floor) reads the same state the harness reads. */
function a12Row(branch: UpgradeBranch | null | "policy", ladder: Ladder) {
  const spec = ladder === "regular" ? null : GAP_SPECS[ladder];
  const s = createInitialState();
  let seq = 0;
  let taps = 0;
  let rejects = 0;
  let earned = 0;
  let pulses = 0;
  let powerLimitedRounds = 0;
  let minPowerRatio = 1;
  let firstResearch: number | null = null;
  let inputStallTicks = 0;
  const recovery = newLadderRecovery();
  // #214: recovery can dismantle an already-upgraded machine (the stalled circuit
  // assembler, the furnace replaced by the signal lab). Its paid levels/picks leave
  // the surviving sums, so they are counted for the R4 reconciliation, exactly as
  // work/feedback/strat002-harness.mjs counts them.
  let dismantledLevels = 0;
  let dismantledPicks = 0;
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
    // #214: the seed's 12 steel pays for the sorter and furnace (4 + 4) first; the
    // 10-steel contract waits for both starters, matching validateBehaviour and
    // scripts/probe-belt.mjs so the in-test mirror reconciles with the golden.
    const startersBuilt =
      s.machines.some((m) => m.blueprint === "sorter") &&
      s.machines.some((m) => m.blueprint === "furnace");
    if (!s.exportClaimed && startersBuilt && (s.store["steel"] ?? 0) >= TUNING.exportContractSteel) {
      send({ type: "contract.export" });
      taps += 1;
    }
    if (spec !== null && round % spec.period < spec.on) {
      send({ type: "manual.salvage" });
      pulses += 1;
      taps += 1;
    }
    const beforeRecovery = new Map(
      s.machines.map((m) => [m.id, { level: m.level, picks: (m.branch ?? []).length }])
    );
    ladderRecoveryTriggers(s, recovery, round);
    for (const [id, info] of beforeRecovery) {
      if (!s.machines.some((m) => m.id === id)) {
        dismantledLevels += info.level - 1;
        dismantledPicks += info.picks;
      }
    }
    const taught = tutorialBodies(s);
    if (taught !== null) {
      for (const body of taught) send(body);
      taps += 1;
    } else {
      const step = ladderRecoveryAdjust(s, recovery, nextYardStep(s));
      if (step && step.kind) {
        if (step.kind !== "salvage" && step.kind !== "upgrade") kinds[step.kind] = (kinds[step.kind] ?? 0) + 1;
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
          case "upgrade": {
            // STRAT-003 mirror of the harness `run()` upgrade case: the attempt goes
            // out only when the option's own price is covered; otherwise the round
            // takes the surplus sell (or idles when there is no surplus).
            const machine = s.machines.find((m) => m.id === step.machineId);
            const base = machine ? BLUEPRINTS[machine.blueprint].baseUpgradeCost : 0;
            const named: UpgradeBranch | null =
              branch === "policy"
                ? machine
                  ? mirrorPolicyPick(s, base, machine.level)
                  : null
                : branch;
            const price = machine
              ? named == null
                ? upgradeCost(base, machine.level)
                : branchPrice(base, machine.level, named)
              : 0;
            if (named == null || s.credits >= price) {
              kinds.upgrade = (kinds.upgrade ?? 0) + 1;
              send(
                named == null
                  ? { type: "machine.upgrade", machineId: step.machineId }
                  : { type: "machine.upgrade", machineId: step.machineId, branch: named }
              );
              taps += 1;
            } else {
              const sell = mirrorSellStep(s);
              if (sell) {
                kinds.sell = (kinds.sell ?? 0) + 1;
                send({ type: "contract.sell", resource: sell.resource, qty: sell.qty });
                taps += 1;
              }
            }
            break;
          }
          default:
            send({ type: "manual.salvage" });
            taps += 1;
        }
      }
    }
    for (let tick = 0; tick < 10; tick += 1) {
      const busyBefore = s.machines.map((m) => m.busyTicks);
      advance(s, 1);
      if ((s.store["scrap"] ?? 0) <= TUNING.reserveFloor) {
        for (let k = 0; k < s.machines.length; k += 1) {
          if (s.machines[k].busyTicks === (busyBefore[k] ?? 0)) inputStallTicks += 1;
        }
      }
    }
    ladderRecoveryClear(s, recovery);
    if (s.powerRatio < 1) powerLimitedRounds += 1;
    if (s.powerRatio < minPowerRatio) minPowerRatio = s.powerRatio;
  }
  const starved = s.machines.map((m) =>
    Math.round((Math.min(m.starvedTicks, m.ageTicks) / Math.max(1, m.ageTicks)) * 100)
  );
  const batches = s.machines.reduce((sum, m) => sum + m.batchesDone, 0);
  const policyMix: Record<string, number> = {};
  for (const m of s.machines) for (const b of m.branch ?? []) policyMix[b] = (policyMix[b] ?? 0) + 1;
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
    inputStallTicks,
    inputStallPct: Number(((inputStallTicks / Math.max(1, s.tick)) * 100).toFixed(1)),
    firstResearch,
    kinds,
    ...(branch === "policy" ? { policyMix } : {}),
    // R4: the three pick counts, each named by its own field, plus the levels/picks
    // the #214 recovery dismantled out of the surviving sums.
    attempts: kinds.upgrade ?? 0,
    purchasedLevels: s.machines.reduce((sum, m) => sum + (m.level - 1), 0),
    picksRecorded: s.machines.reduce((sum, m) => sum + (m.branch ? m.branch.length : 0), 0),
    dismantledLevels,
    dismantledPicks,
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

  it("still loads and decodes a save written while the dock named three branches", () => {
    // PLAY-002 1: the drop removes the *option* from the dock, not the name from the
    // decoder. A record from before the drop still carries `"buffer"`.
    const s = yard();
    const furnace = pick(s, "furnace");
    expect(send(s, { type: "machine.upgrade", machineId: furnace.id, branch: "speed" })).toBe(true);
    expect(send(s, { type: "machine.upgrade", machineId: furnace.id, branch: "buffer" })).toBe(true);
    const text = encodeSave(s, 17, { muted: false, reducedMotion: false, textScale: 1 });
    expect(text).toContain('"branch":["speed","buffer"]');

    const decoded = decodeSave(text);
    if (!decoded.ok) {
      throw new Error("a pre-drop save must still decode, got " + decoded.reason);
    }
    const loaded = pick(decoded.payload.sim, "furnace");
    expect(loaded.branch).toEqual(["speed", "buffer"]);
    expect(loaded.level).toBe(furnace.level);
    // The decoder still counts the dropped name, so the paid levels keep their effect.
    expect(upgradeRanks(loaded)).toEqual({ speed: 1, buffer: 1, draw: 0 });
    expect(inputCapacityOf(loaded, 0)).toBe(BLUEPRINTS.furnace.inputBuffer + 6);
    expect(validateSim(decoded.payload.sim)).toBeNull();
    // Byte-for-byte round trip, so no migration touched the record.
    expect(encodeSave(decoded.payload.sim, decoded.payload.lastSeenMs, decoded.payload.settings)).toBe(
      text
    );
    // The dock that answers that save is the two-plan dock; the saved rank is still read.
    // BLD-001: cheapest-first, so the 30-credit `draw` plan leads the row.
    expect(branchOptions(decoded.payload.sim, loaded.id).map((option) => option.id)).toEqual([
      "draw",
      "speed",
    ]);
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
        // each affordable blueprint, the fork's named options each at its own price
        // (STRAT-003), the fleet, the next research node, one sell tranche.
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
          // STRAT-003: each named option prints its own price, so the census reads
          // the same per-option table the dock prints.
          for (const name of ["speed", "buffer", "draw"] as const) {
            options.push(
              name + branchPrice(BLUEPRINTS[upgrade.blueprint].baseUpgradeCost, upgrade.level, name)
            );
          }
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
    // the count comes from the named options the dock shows, each at its own price.
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
  it("keeps the unnamed ladder exact and lets the price difference bite (R3 restated, STRAT-003)", () => {
    const patternOf: Record<Ladder, "regular" | "irregular" | "gap6"> = {
      regular: "regular",
      gap9: "irregular",
      gap6: "gap6",
    };
    type StoredFull = StoredRow & {
      credits: number;
      creditsEarned: number;
      taps: number;
      rejects: number;
      inputStallTicks: number;
      purchasedLevels: number;
      kinds: Record<string, number>;
    };
    for (const ladder of ["regular", "gap9", "gap6"] as Ladder[]) {
      const twin = a12Row(null, ladder);
      // The unnamed ladder is the golden-line ladder: same boot, plain price, so
      // every stored scalar column and the kinds counters reproduce from the mirror.
      // (BELT-001: the goldens are the priced-tree rows in belt001-harness.json.)
      const stored = beltTable(patternOf[ladder]).find(
        (r) => r.policy === "naive (unnamed)"
      ) as StoredFull;
      expect(twin.batches).toBe(stored.batches);
      expect(twin.credits).toBe(stored.credits);
      expect(twin.creditsEarned).toBe(stored.creditsEarned);
      expect(twin.creditsPer1000Batches).toBe(stored.creditsPer1000Batches);
      expect(twin.taps).toBe(stored.taps);
      expect(twin.rejects).toBe(stored.rejects);
      expect(twin.powerLimitedRounds).toBe(stored.powerLimitedRounds);
      expect(twin.minPowerRatio).toBe(stored.minPowerRatio);
      expect(twin.starvedMax).toBe(stored.starvedMax);
      expect(twin.starvedMean).toBe(stored.starvedMean);
      expect(twin.inputStallTicks).toBe(stored.inputStallTicks);
      expect(twin.inputStallPct).toBe(stored.inputStallPct);
      expect(twin.kinds).toEqual(stored.kinds);
      expect(Number.isInteger(twin.inputStallTicks)).toBe(true);
      expect(twin.inputStallTicks).toBeGreaterThan(0);
      // STRAT-003: with distinct prices no named row is a by-construction twin any
      // more. `speed` pays the +10 premium per level, so its purse and its purchase
      // clock diverge from the unnamed ladder; `draw` pays the plain price and
      // diverges by mechanism (its batch clock stays where the recipe put it).
      const speed = a12Row("speed", ladder);
      const draw = a12Row("draw", ladder);
      const buffer = a12Row("buffer", ladder);
      expect(speed.credits).not.toBe(twin.credits);
      expect(speed.batches).not.toBe(twin.batches);
      expect(draw.batches).not.toBe(twin.batches);
      // R4 now reconciles *exactly* on the named rows: under the buy-when-affordable
      // policy every attempt purchases one level (the rejected-attempt noise of g3 is
      // gone). #214: the shared recovery may dismantle an already-upgraded machine,
      // so the attempt counter equals the surviving purchased levels plus the levels
      // lost to dismantling - and likewise for the recorded picks. The unnamed row
      // keeps the old semantics (it always attempts the plain price).
      for (const row of [speed, draw, buffer]) {
        expect(row.kinds.upgrade).toBe(row.purchasedLevels + row.dismantledLevels);
        expect(row.kinds.upgrade).toBe(row.picksRecorded + row.dismantledPicks);
        expect(Number.isFinite(row.creditsPer1000Batches)).toBe(true);
      }
      // The named mechanisms still separate as in g3: clock leads batches. The budget
      // plan holds zero throttled rounds on both gap ladders; on the ungated ladder
      // the new seed's power line dips for exactly 2 rounds.
      expect(buffer.batches).not.toBe(speed.batches);
      expect(draw.powerLimitedRounds).toBe(ladder === "regular" ? 2 : 0);
      expect(speed.powerLimitedRounds).toBeGreaterThan(0);
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

  it("scores the 5-on/4-off ladder by the per-column MMG, not the retired disjunction", () => {
    // BELT-001 restated on the priced tree (rows in belt001-harness.json), #214 seed.
    // The column leaders under the MMG are now: speed owns only `starvedMean`, draw
    // owns the power pair; `batches` (872 < 900), `starvedMax` (2 < 3) and
    // `inputStallPct` (0.4 < 3) all sit under their floors, so they name no leader.
    const speed = a12Row("speed", "gap9");
    const buffer = a12Row("buffer", "gap9");
    const draw = a12Row("draw", "gap9");
    const mmg = harnessJson.gaps.mmg;
    // speed still leads `batches` outright - 1 895 over the best named rival 1 023 -
    // but the new seed's lead is 872, under the 900-unit MMG floor: the column keeps
    // its raw leader and names no leader under the MMG. The gap is pinned exactly.
    expect(speed.batches - Math.max(buffer.batches, draw.batches)).toBe(872);
    expect(872).toBeLessThan(mmg.batches.absolute);
    // draw keeps the zero row, and buffer's 274 throttled rounds now clear the
    // 200-unit floor, so this column names draw under the MMG (the pre-#214 seed
    // parked the rival at 127, under the floor).
    expect(draw.powerLimitedRounds).toBe(0);
    expect(Math.min(speed.powerLimitedRounds, buffer.powerLimitedRounds)).toBe(274);
    expect(274).toBeGreaterThanOrEqual(mmg.powerLimitedRounds.absolute);
    expect(draw.minPowerRatio - Math.max(speed.minPowerRatio, buffer.minPowerRatio)).toBeGreaterThanOrEqual(
      mmg.minPowerRatio.absolute
    );
    // starvedMean stays with speed (67 - 61 = 6 >= 3); starvedMax compresses to
    // 93 - 91 = 2 on the new seed, under the 3-point floor, so it names no leader.
    expect(Math.max(buffer.starvedMax, draw.starvedMax) - speed.starvedMax).toBe(2);
    expect(2).toBeLessThan(mmg.starvedMax.absolute);
    expect(Math.max(buffer.starvedMean, draw.starvedMean) - speed.starvedMean).toBeGreaterThanOrEqual(
      mmg.starvedMean.absolute
    );
    // buffer's single A1-2v3 column: recovery collapses its stall to 4.0, now the raw
    // best, but the best rival 4.4 (draw) leaves a lead of only +0.4 points - still
    // under the 3-point floor, so the column is still not buffer's under the MMG.
    expect(buffer.inputStallPct).toBe(4);
    expect(Math.min(speed.inputStallPct, draw.inputStallPct) - buffer.inputStallPct).toBeCloseTo(0.4, 3);
    expect(Math.min(speed.inputStallPct, draw.inputStallPct) - buffer.inputStallPct).toBeLessThan(
      mmg.inputStallPct.absolute
    );
    // R4 at ladder scale: every attempt purchased one level; recovery dismantled one
    // upgraded machine, so attempts = surviving purchased levels + dismantled levels.
    expect(buffer.picksRecorded).toBe(buffer.purchasedLevels);
    expect(buffer.attempts).toBe(buffer.purchasedLevels + buffer.dismantledLevels);
    expect(buffer.dismantledLevels).toBe(1);
    expect(buffer.purchasedLevels).toBeGreaterThan(90);
  }, 30_000);
});

/* ---- A1-2v3 per-column MMG, read from the harness' `gaps` block ---- */

/** The stored rows carry exactly the scored fields this block recomputes. */
type StoredRow = {
  policy: string;
  batches: number;
  powerLimitedRounds: number;
  minPowerRatio: number;
  starvedMax: number;
  starvedMean: number;
  inputStallPct: number;
  creditsPer1000Batches: number;
};
const NAMED_POLICIES = ["speed", "buffer", "draw"];
const MMG_READ: Record<string, { read: (r: StoredRow) => number; higherWins: boolean }> = {
  inputStallPct: { read: (r) => r.inputStallPct, higherWins: false },
  starvedMax: { read: (r) => r.starvedMax, higherWins: false },
  starvedMean: { read: (r) => r.starvedMean, higherWins: false },
  batches: { read: (r) => r.batches, higherWins: true },
  powerLimitedRounds: { read: (r) => r.powerLimitedRounds, higherWins: false },
  minPowerRatio: { read: (r) => r.minPowerRatio, higherWins: true },
  creditsPer1000Batches: { read: (r) => r.creditsPer1000Batches, higherWins: true },
};

/** The leading branch under one column's MMG, named rows only (harness semantics). */
function leaderUnderMmg(rows: StoredRow[], column: string): string | null {
  const spec = MMG_READ[column];
  const mmg = harnessJson.gaps.mmg[column as keyof typeof harnessJson.gaps.mmg] as {
    absolute: number;
    relative?: number;
  };
  const named = rows.filter((r) => NAMED_POLICIES.includes(r.policy));
  const values = named.map((r) => spec.read(r));
  const best = spec.higherWins ? Math.max(...values) : Math.min(...values);
  const sole = named.filter((_, i) => values[i] === best);
  if (sole.length !== 1) return null;
  const owner = sole[0];
  const rivals = named.filter((r) => r.policy !== owner.policy).map((r) => spec.read(r));
  const rival = spec.higherWins ? Math.max(...rivals) : Math.min(...rivals);
  const own = spec.read(owner);
  const absolute = spec.higherWins ? own - rival : rival - own;
  const relative = rival === 0 ? (absolute === 0 ? 0 : 1) : absolute / rival;
  // Absolute-only when the rival is exactly 0; the two-term column needs both terms.
  if (rival === 0) return absolute >= mmg.absolute ? owner.policy : null;
  if (mmg.relative !== undefined) {
    return absolute >= mmg.absolute && relative >= mmg.relative ? owner.policy : null;
  }
  return absolute >= mmg.absolute ? owner.policy : null;
}

const storedTable = (pattern: "regular" | "irregular" | "gap6") =>
  harnessJson[pattern].rows as unknown as StoredRow[];

describe("STRAT-002/A1-2v3 the per-column MMG and the auto-executing drop clause", () => {
  it("declares the MMG once in the harness gaps block and reads it back exactly", () => {
    // The addendum's table, per column, in each column's own scale.
    expect(harnessJson.gaps.mmg.inputStallPct).toEqual({ absolute: 3 });
    expect(harnessJson.gaps.mmg.starvedMax).toEqual({ absolute: 3 });
    expect(harnessJson.gaps.mmg.starvedMean).toEqual({ absolute: 3 });
    expect(harnessJson.gaps.mmg.batches).toEqual({ absolute: 900 });
    expect(harnessJson.gaps.mmg.powerLimitedRounds).toEqual({ absolute: 200 });
    expect(harnessJson.gaps.mmg.minPowerRatio).toEqual({ absolute: 0.25 });
    // The only two-term column: 3 % relative AND >= 100 units.
    expect(harnessJson.gaps.mmg.creditsPer1000Batches).toEqual({ relative: 0.03, absolute: 100 });
    // Retired disjunction and the zero-rival clause are stated in the block itself.
    expect(harnessJson.gaps.criteria).toContain(">= 5 % relative OR >= 10 absolute");
    expect(harnessJson.gaps.criteria).toContain("absolute-only when the rival is exactly 0");
    expect(harnessJson.primaryColumns).toContain("inputStallPct");
  });

  it("reproduces the stored inputStall columns on both gap ladders, non-vacuously", () => {
    for (const ladder of ["gap9", "gap6"] as Ladder[]) {
      const pattern = ladder === "gap9" ? "irregular" : "gap6";
      for (const [name, branch] of [
        ["naive (unnamed)", null],
        ["speed", "speed"],
        ["buffer", "buffer"],
        ["draw", "draw"],
        ["priced", "policy"],
      ] as [string, UpgradeBranch | null | "policy"][]) {
        const mirror = a12Row(branch, ladder);
        const stored = beltTable(pattern).find((r) => r.policy === name);
        if (!stored) throw new Error("stored row missing for " + name);
        // The stored row's new pair equals the mirror's, tick for tick.
        const storedFull = stored as StoredRow & {
          inputStallTicks: number;
          tick: number;
          batches: number;
          credits: number;
          taps: number;
          rejects: number;
          kinds: Record<string, number>;
          policyMix?: Record<string, number>;
        };
        expect(mirror.inputStallTicks).toBe(storedFull.inputStallTicks);
        expect(mirror.inputStallPct).toBe(storedFull.inputStallPct);
        expect(storedFull.inputStallTicks).toBeGreaterThan(0);
        // STRAT-003: the whole trajectory, not only the stall pair - batches, purse,
        // taps and rejects - reproduces from the in-test mirror on every row.
        expect(mirror.batches).toBe(storedFull.batches);
        expect(mirror.credits).toBe(storedFull.credits);
        expect(mirror.taps).toBe(storedFull.taps);
        expect(mirror.rejects).toBe(storedFull.rejects);
        expect(mirror.kinds).toEqual(storedFull.kinds);
        if (name === "priced") {
          expect(storedFull.policyMix).toBeDefined();
          expect(mirror.policyMix).toEqual(storedFull.policyMix);
          // The policy buys both plans inside 1800 rounds, so the price difference
          // actually steered purchases instead of one name absorbing everything.
          expect(storedFull.policyMix!.speed).toBeGreaterThan(0);
          expect(storedFull.policyMix!.draw).toBeGreaterThan(0);
        }
      }
    }
  }, 30_000);

  it("names the leading branch per column under MMG, named rows only, on both ladders", () => {
    const irregular = storedTable("irregular");
    const gap6 = storedTable("gap6");
    // 5-on/4-off, #214 seed: speed keeps only starvedMean (6-point lead); the batches
    // lead compresses to 872 (< 900), starvedMax to 2 (< 3), and buffer's raw-best
    // stall 4.0 leads draw's 4.4 by only 0.4 (< 3) - those three name no leader. Draw
    // owns the power pair (274 throttled rival rounds clear the 200 floor); the 10^4
    // ratio clears neither term of its MMG on this ladder.
    expect(leaderUnderMmg(irregular, "inputStallPct")).toBeNull();
    expect(leaderUnderMmg(irregular, "starvedMax")).toBeNull();
    expect(leaderUnderMmg(irregular, "starvedMean")).toBe("speed");
    expect(leaderUnderMmg(irregular, "batches")).toBeNull();
    expect(leaderUnderMmg(irregular, "powerLimitedRounds")).toBe("draw");
    expect(leaderUnderMmg(irregular, "minPowerRatio")).toBe("draw");
    expect(leaderUnderMmg(irregular, "creditsPer1000Batches")).toBeNull();
    // Period-6 3-on/3-off, #214 seed: draw's stall 4.1 is the raw best but leads
    // buffer's 4.3 by only 0.2 (< 3), so the stall column names no leader either;
    // batches 796 (< 900) and starvedMax 1 (< 3) drop out the same way. The power
    // column now names draw (buffer's 274 throttled rounds clear the 200 floor), and
    // the ratio column clears both terms - reported, but unable to satisfy R1.
    expect(leaderUnderMmg(gap6, "inputStallPct")).toBeNull();
    expect(leaderUnderMmg(gap6, "starvedMax")).toBeNull();
    expect(leaderUnderMmg(gap6, "starvedMean")).toBe("speed");
    expect(leaderUnderMmg(gap6, "batches")).toBeNull();
    expect(leaderUnderMmg(gap6, "powerLimitedRounds")).toBe("draw");
    expect(leaderUnderMmg(gap6, "minPowerRatio")).toBe("draw");
    expect(leaderUnderMmg(gap6, "creditsPer1000Batches")).toBe("draw");
    // The harness' own leadersUnderMmg maps agree with this recomputation, ladder for ladder.
    for (const pattern of ["irregular", "gap6"] as const) {
      const rows = storedTable(pattern);
      const expected = Object.fromEntries(
        Object.keys(MMG_READ).map((column) => [column, leaderUnderMmg(rows, column)])
      );
      expect(harnessJson[pattern].verdicts.leadersUnderMmg).toEqual(expected);
    }
  });

  /**
   * STRAT-003: with the two plans priced differently, the same MMG census over just
   * the pair on the dock (speed vs draw, buffer excluded as off the dock) still puts
   * different columns on different names on both scored ladders: starvedMean stays
   * with `speed`, the stall column and the power pair stay with `draw`. #214 finding:
   * the batches column collapses below its MMG on both gap ladders (872 and 796,
   * floor 900) and starvedMax compresses under its 3-point floor - recorded as null,
   * never re-scored.
   */
  it("keeps the two live plans leading different columns under the pair census", () => {
    // 5-on/4-off: draw keeps the stall column (4.4 vs 28.6) and the power pair; speed
    // keeps starvedMean; batches (872 < 900) and starvedMax (2 < 3) name no leader.
    expect(harnessJson.irregular.leadersTwoPlans).toEqual({
      inputStallPct: "draw",
      starvedMax: null,
      starvedMean: "speed",
      batches: null,
      powerLimitedRounds: "draw",
      minPowerRatio: "draw",
      creditsPer1000Batches: "draw",
    });
    // Period 6: the same shape - draw's stall 4.1 vs speed's 20.5, the power pair
    // against speed's 441 throttled rounds, and batches 796 < 900, starvedMax 1 < 3.
    expect(harnessJson.gap6.leadersTwoPlans).toEqual({
      inputStallPct: "draw",
      starvedMax: null,
      starvedMean: "speed",
      batches: null,
      powerLimitedRounds: "draw",
      minPowerRatio: "draw",
      creditsPer1000Batches: "draw",
    });
    // The batches column of the PAIR census, pinned exactly: irregular 1895 - 1023
    // = 872, gap6 1821 - 1025 = 796 - both under the 900 MMG floor on the new seed,
    // which is why the maps above record null for that column.
    const at = (p: "irregular" | "gap6", name: string) =>
      (storedTable(p).find((r) => r.policy === name) as StoredRow).batches;
    expect(at("irregular", "speed") - at("irregular", "draw")).toBe(872);
    expect(at("gap6", "speed") - at("gap6", "draw")).toBe(796);
    expect(872).toBeLessThan(harnessJson.gaps.mmg.batches.absolute);
    expect(796).toBeLessThan(harnessJson.gaps.mmg.batches.absolute);
  });

  it("executes the drop clause: buffer's inputStallPct lead clears the MMG on neither gap ladder", () => {
    const irregular = storedTable("irregular");
    const gap6 = storedTable("gap6");
    const at = (rows: StoredRow[], policy: string) =>
      (rows.find((r) => r.policy === policy) as StoredRow).inputStallPct;
    // 5-on/4-off, #214 seed: recovery collapses buffer's stall to 4.0, the raw best,
    // but the best rival 4.4 (draw) leaves a lead of only +0.4 points (< 3).
    expect(at(irregular, "buffer")).toBe(4);
    expect(Math.min(at(irregular, "speed"), at(irregular, "draw")) - at(irregular, "buffer")).toBeCloseTo(0.4, 3);
    expect(Math.min(at(irregular, "speed"), at(irregular, "draw")) - at(irregular, "buffer")).toBeLessThan(3);
    // Period-6: buffer 4.3 sits behind the best rival 4.1 (draw) -> lead -0.2 (< 3).
    expect(at(gap6, "buffer")).toBe(4.3);
    expect(Math.min(at(gap6, "speed"), at(gap6, "draw")) - at(gap6, "buffer")).toBeCloseTo(-0.2, 3);
    expect(Math.min(at(gap6, "speed"), at(gap6, "draw")) - at(gap6, "buffer")).toBeLessThan(3);
    // The auto-executing question from the addendum, answered by the same run: NO on
    // both ladders, so the drop executes and the fork ships two plans (speed, draw).
    expect(harnessJson.autoExec.irregular).toBe(false);
    expect(harnessJson.autoExec.gap6).toBe(false);
    expect(harnessJson.autoExec.bothPatterns).toBe(false);
    expect(harnessJson.autoExec.outcome).toContain("two plans (speed, draw)");
    // The verdict records match the column leaders: buffer fails its single named
    // column on every table, while speed and draw keep theirs.
    for (const pattern of ["regular", "irregular", "gap6"] as const) {
      expect(harnessJson[pattern].verdicts.buffer.pass).toBe(false);
      expect(harnessJson[pattern].verdicts.buffer.column).toBe("inputStallPct");
    }
  }, 30_000);
});

/**
 * STRAT-003: named plans cost different amounts. The dock row itself carries the
 * tradeoff: `Faster batches` pays the plain ladder plus the 10-credit throughput
 * premium (one of ten clock-denominator units = 10 % batches/s at the first rank),
 * `Less power` keeps the plain price (it removes the baseline unit step, 1 of the
 * yard's 8 power units). Both stay within `upgradeCost + 10`.
 */
describe("STRAT-003 the two live plans carry their own prices", () => {
  it("names the two plans at different prices on every ladder level", () => {
    for (const base of [30, 40, 45, 50, 55, 60, 70, 75]) {
      for (let level = 1; level <= 40; level += 1) {
        const plain = upgradeCost(base, level);
        const speed = branchPrice(base, level, "speed");
        const draw = branchPrice(base, level, "draw");
        const buffer = branchPrice(base, level, "buffer");
        // The two visible prices differ at every level and the dearer one is the
        // throughput plan, exactly +10 above the plain ladder's next step.
        expect(speed).not.toBe(draw);
        expect(speed).toBe(plain + 10);
        expect(draw).toBe(plain);
        expect(buffer).toBe(plain);
        // Both within the unnamed price plus ten, integers, never decreasing.
        for (const price of [speed, draw, buffer]) {
          expect(Number.isInteger(price)).toBe(true);
          expect(price).toBeLessThanOrEqual(plain + 10);
        }
      }
    }
  });

  it("charges exactly the price the tapped option printed, for both plans", () => {
    const parse = (cost?: string): number => Number((cost ?? "").split(" ")[0]);
    for (const [id, wanted] of [
      ["speed", 40],
      ["draw", 30],
    ] as [UpgradeBranch, number][]) {
      const s = yard();
      const sorter = pick(s, "sorter");
      const option = branchOptions(s, sorter.id).find((o) => o.id === id);
      if (!option) throw new Error("the dock must offer " + id);
      expect(parse(option.cost)).toBe(wanted);
      const before = s.credits;
      expect(send(s, { type: "machine.upgrade", machineId: sorter.id, branch: id })).toBe(true);
      // Sum of the chosen option equals the sim charge, credit for credit.
      expect(before - s.credits).toBe(parse(option.cost));
      expect(before - s.credits).toBe(wanted);
    }
  });

  it("keeps the unnamed ladder at the plain price beside the priced options", () => {
    const s = yard();
    const sorter = pick(s, "sorter");
    // The two faces print their own prices at the level the dock is answering, cheapest
    // first (BLD-001): the plain-ladder `draw` plan leads, the premium `speed` plan follows.
    expect(branchOptions(s, sorter.id).map((o) => o.cost)).toEqual(["30 credits", "40 credits"]);
    const before = s.credits;
    expect(send(s, { type: "machine.upgrade", machineId: sorter.id })).toBe(true);
    expect(before - s.credits).toBe(upgradeCost(BLUEPRINTS.sorter.baseUpgradeCost, 1));
    // One level up, the pair moves with the plain ladder: 35 under 35 + 10.
    expect(branchOptions(s, sorter.id).map((o) => o.cost)).toEqual(["35 credits", "45 credits"]);
  });

  /**
   * BLD-001: the dock paints the two named plans by their own price ascending, so the
   * leftmost face is always one the current purse can pay (QA note 6: at 30 credits the
   * old row parked 31 leftmost taps at 0 commands). The `speed` premium is +10 at every
   * rank, so the pair stays ordered all the way up; a tie would keep the declared order,
   * because `Array#sort` has been stable since ES2019.
   */
  it("paints the two plans cheapest-first at every rank of the ladder (BLD-001)", () => {
    const number = (cost: string): number => Number(cost.split(" ")[0]);
    const s = yard();
    const sorter = pick(s, "sorter");
    for (let rank = 1; rank <= 4; rank += 1) {
      const options = branchOptions(s, sorter.id);
      const level = sorter.level;
      expect(options.map((o) => o.id)).toEqual(["draw", "speed"]);
      const prices = options.map((o) => number(o.cost));
      for (let i = 1; i < prices.length; i += 1)
        expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
      // Each printed number is the engine's own price for that plan at this rank.
      expect(prices[0]).toBe(
        branchPrice(BLUEPRINTS.sorter.baseUpgradeCost, level, options[0].id)
      );
      expect(prices[1]).toBe(
        branchPrice(BLUEPRINTS.sorter.baseUpgradeCost, level, options[1].id)
      );
      expect(send(s, { type: "machine.upgrade", machineId: sorter.id, branch: "draw" })).toBe(true);
      expect(sorter.level).toBe(level + 1);
    }
  });

  it("decodes a save whose machine names all three plans", () => {
    const s = yard();
    const furnace = pick(s, "furnace");
    for (const branch of ["speed", "buffer", "draw"] as UpgradeBranch[]) {
      expect(send(s, { type: "machine.upgrade", machineId: furnace.id, branch })).toBe(true);
    }
    const text = encodeSave(s, 5, { muted: false, reducedMotion: false, textScale: 1 });
    expect(text).toContain('"branch":["speed","buffer","draw"]');
    const decoded = decodeSave(text);
    if (!decoded.ok) throw new Error("a three-plan save must still decode, got " + decoded.reason);
    const loaded = pick(decoded.payload.sim, "furnace");
    expect(loaded.branch).toEqual(["speed", "buffer", "draw"]);
    expect(loaded.level).toBe(4);
    expect(upgradeRanks(loaded)).toEqual({ speed: 1, buffer: 1, draw: 1 });
    expect(validateSim(decoded.payload.sim)).toBeNull();
    // Byte-for-byte again: the price table touches no stored byte.
    expect(encodeSave(decoded.payload.sim, decoded.payload.lastSeenMs, decoded.payload.settings)).toBe(
      text
    );
    // And the priced dock answers that save with its two live faces, cheapest first: the
    // furnace's plain ladder at level 4 is 40 -> 47 -> 55 -> 64, so 64 under 64 + 10.
    expect(branchOptions(decoded.payload.sim, loaded.id).map((o) => o.cost)).toEqual([
      "64 credits",
      "74 credits",
    ]);
  });
});
