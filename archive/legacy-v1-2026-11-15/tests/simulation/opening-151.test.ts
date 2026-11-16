import { describe, expect, it } from "vitest";
import {
  buildBlocked,
  buildChoiceLocal,
  buildChoiceRemote,
  buildMature,
  buildOpening,
  buildStress,
  droneCount,
  fixtureSaveText,
  DRONE_FLEET_CAP,
  FIXTURE_WITNESS_MS,
  MATURE_BUILDINGS,
  MATURE_CARGO,
  MATURE_UNITS,
  RELEASE_SEED,
  STRESS_BUILDINGS,
  STRESS_JOBS,
  STRESS_UNITS,
} from "../fixtures/release";
import { TUNING } from "../../src/game/content/defs";
import { unitTotal } from "../../src/game/simulation/invariants";
import { logisticsTotals } from "../../src/game/simulation/logistics";
import { bayFree, bayLeasesAt, reserveBay } from "../../src/game/simulation/traffic";
import { createInitialState } from "../../src/game/simulation/types";
import { createWorld } from "../../src/game/world/terrain";
import {
  DEFAULT_SETTINGS,
  MAX_SAVE_TEXT_LENGTH,
  SAVE_KEY,
  decodeSave,
} from "../../src/game/persistence/save";

/**
 * G1 (#151) first-playable gate — OPENING seed equality and the release-fixture
 * contract (ACCEPTANCE.md:53).
 *
 * The OPENING assertions pin the GAME_SYSTEMS P1 starter seed FIELD BY FIELD
 * against the spec literals (120 scrap / 12 ferrous / 12 steel, 60 credits, no
 * tokens, 300-unit dock, 240 wreck pool, owned 24x24 start parcel). This is the
 * equality owed by docs/vision/evidence/214-starter-economy.md:131/207 — it is
 * deliberately NOT a re-assertion of createInitialState's own output: the
 * literals are the authority, and a separate witness checks the fixture applies
 * no commands on top of them.
 *
 * The determinism describe proves the brief's fixture contract: every builder
 * call returns byte-identical state AND a byte-identical save envelope at the
 * fixed witness time, so pass 3 can install any population through
 * localStorage[SAVE_KEY] reproducibly.
 */

describe("OPENING == GAME_SYSTEMS starter seed (#151, owed by 214-starter-economy)", () => {
  it("the sim mirror carries the seed field by field", () => {
    const { sim } = buildOpening();
    expect(sim.store).toEqual({ scrap: 120, ferrous: 12, steel: 12 });
    expect(sim.storeUnits).toBe(144);
    expect(sim.storeCapacity).toBe(300);
    expect(sim.credits).toBe(60);
    expect(sim.overflow).toEqual([]);
    expect(sim.machines).toEqual([]);
    expect(sim.routes).toEqual([]);
    expect(sim.wreck).toEqual({ remaining: 240, generation: 1, pulses: 0, nextPulseTick: 0 });
    expect(sim.drone.repaired).toBe(false);
    expect(sim.drone.inFlight).toBeNull();
    expect(sim.spares).toEqual([]);
    expect(sim.exportSteelDelivered).toBe(0);
    expect(sim.exportClaimed).toBe(false);
    expect(sim.tutorial).toBe(0);
    expect(sim.tick).toBe(0);
    expect(sim.revision).toBe(0);
    expect(sim.nextMachineId).toBe(1);
    expect(sim.nextRouteId).toBe(1);
    expect(sim.seenCommands).toEqual({});
    expect(sim.research).toEqual({});
  });

  it("the world authority carries the same seed field by field", () => {
    const { world } = buildOpening();
    expect(world.stock).toEqual({ scrap: 120, ferrous: 12, steel: 12 });
    expect(world.credits).toBe(60);
    expect(world.milestoneTokens).toBe(0);
    expect(world.buildings).toEqual([]);
    expect(world.sites).toEqual([]);
    expect(world.reservations).toEqual([]);
    expect(world.revision).toBe(0);
    expect(world.tick).toBe(0);
    expect(world.clearanceMode).toBe("blockout");
    // The owned start parcel plus the 16 expansion ring parcels (ids 1..16).
    expect(world.parcels.length).toBe(17);
    expect(world.parcels[0]).toEqual({ id: 0, x: 0, y: 0, size: 24, owned: true });
    expect(world.parcels.filter((p) => p.owned).length).toBe(1);
  });

  it("sim and world agree on the shared starter economy", () => {
    const { sim, world } = buildOpening();
    expect(sim.store).toEqual(world.stock);
    expect(sim.credits).toBe(world.credits);
    expect(sim.storeUnits).toBe(120 + 12 + 12);
  });

  it("the tuning constants the seed is built from are pinned", () => {
    expect(TUNING.dockCapacity).toBe(300);
    expect(TUNING.starterWreckPool).toBe(240);
    expect(TUNING.routeLatencyTicks).toBe(5);
    expect(TUNING.fleetCap).toBe(5);
    expect(TUNING.manualSalvagePerPulse).toBe(2);
    expect(TUNING.manualPulseTicks).toBe(20);
    expect(TUNING.beltCostPerTile).toBe(1);
  });

  it("the fixture applies no commands: it IS the pristine seed", () => {
    const { sim, world } = buildOpening();
    // A witness that the builder adds nothing on top of the seed — the literal
    // pins above remain the authority (this is not a substitute for them).
    expect(JSON.stringify(sim)).toBe(JSON.stringify(createInitialState()));
    expect(JSON.stringify(world)).toBe(JSON.stringify(createWorld(RELEASE_SEED)));
  });
});

describe("release fixture determinism and save envelopes (#151)", () => {
  const builders = {
    OPENING: buildOpening,
    "CHOICE-LOCAL": buildChoiceLocal,
    "CHOICE-REMOTE": buildChoiceRemote,
    BLOCKED: buildBlocked,
    MATURE: buildMature,
    STRESS: buildStress,
  } as const;

  for (const [name, build] of Object.entries(builders)) {
    it(`${name}: two calls are byte-identical in state and save envelope`, () => {
      const a = build();
      const b = build();
      // seenCommands is part of SimState, so command ids must repeat exactly.
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      const saveA = fixtureSaveText(a.sim);
      const saveB = fixtureSaveText(b.sim);
      expect(saveA).toBe(saveB);
      expect(saveA.length).toBeLessThanOrEqual(MAX_SAVE_TEXT_LENGTH);
    });
  }

  it("the envelope decodes to the fixture sim at the fixed witness time", () => {
    for (const build of Object.values(builders)) {
      const fixture = build();
      const decoded = decodeSave(fixtureSaveText(fixture.sim));
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) continue;
      expect(decoded.payload.lastSeenMs).toBe(FIXTURE_WITNESS_MS);
      expect(decoded.payload.settings).toEqual(DEFAULT_SETTINGS);
      expect(decoded.payload.sim).toEqual(fixture.sim);
    }
  });

  it("the shell install key and the witness-time override are pinned", () => {
    expect(SAVE_KEY).toBe("rustwake.save.v1");
    const { sim } = buildOpening();
    expect(fixtureSaveText(sim)).toBe(fixtureSaveText(sim, FIXTURE_WITNESS_MS));
    // A real clock is only for pass 3 offline catch-up; it must change the bytes.
    expect(fixtureSaveText(sim, FIXTURE_WITNESS_MS + 1)).not.toBe(fixtureSaveText(sim));
  });
});

describe("BLOCKED / MATURE / STRESS populations (#151, ACCEPTANCE.md:53)", () => {
  it("BLOCKED: storage is exactly full through commands, no overflow", () => {
    const { sim, traffic, bayCell } = buildBlocked();
    expect(sim.storeUnits).toBe(TUNING.dockCapacity);
    expect(sim.storeCapacity).toBe(300);
    expect(sim.store).toEqual({ scrap: 276, ferrous: 12, steel: 12 });
    expect(sim.overflow).toEqual([]);
    // 78 pulses x 20-tick cooldown; 156 salvaged of the 240 pool.
    expect(sim.tick).toBe(1560);
    expect(sim.wreck.remaining).toBe(84);
    expect(unitTotal(sim)).toBe(300);
    // The occupied bay: carrier 1 holds the only slot, carrier 2 is refused.
    const leases = bayLeasesAt(traffic, bayCell);
    expect(leases.length).toBe(1);
    expect(leases[0].carrierId).toBe(1);
    expect(bayFree(traffic, bayCell, 1)).toBe(true); // own lease is idempotent
    expect(bayFree(traffic, bayCell, 2)).toBe(false);
    expect(reserveBay(traffic, bayCell, 2, 2)).toBeNull();
  });

  it("MATURE: 20 buildings / 30 moving units / 200 aggregate cargo", () => {
    const { sim, log } = buildMature();
    expect(sim.machines.length).toBe(MATURE_BUILDINGS);
    expect(new Set(sim.machines.map((m) => m.tile)).size).toBe(MATURE_BUILDINGS);
    expect(sim.machines.every((m) => m.tile !== 2)).toBe(true); // DOCK_TILE free
    expect(droneCount(sim)).toBe(DRONE_FLEET_CAP);
    expect(log.carriers.length).toBe(MATURE_UNITS - DRONE_FLEET_CAP); // 25
    expect(droneCount(sim) + log.carriers.length).toBe(MATURE_UNITS);
    expect(unitTotal(sim)).toBe(MATURE_CARGO);
    expect(sim.storeUnits).toBe(178);
  });

  it("STRESS: 100 buildings / 100 moving units / 1000 waiting jobs, conserved", () => {
    const { sim, log } = buildStress();
    expect(sim.machines.length).toBe(STRESS_BUILDINGS);
    expect(droneCount(sim)).toBe(DRONE_FLEET_CAP);
    expect(log.carriers.length).toBe(STRESS_UNITS - DRONE_FLEET_CAP); // 95
    expect(droneCount(sim) + log.carriers.length).toBe(STRESS_UNITS);
    expect(log.jobs.length).toBe(STRESS_JOBS);
    // Frozen population: every job is reserved at source, nothing moved yet.
    for (const job of log.jobs) {
      expect(job.status).toBe("pending");
      expect(job.phase).toBe("waiting");
      expect(job.amount).toBe(1);
      expect(job.atSource).toBe(1);
      expect(job.inTransit).toBe(0);
      expect(job.delivered).toBe(0);
      expect(job.returned).toBe(0);
    }
    // 10 sites x 1000 seeded scrap; createJob only reserves, so totals hold.
    expect(logisticsTotals(log)).toEqual({ scrap: 10000 });
  });
});
