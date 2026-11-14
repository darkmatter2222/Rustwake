import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * T09 (#136): production building kit gate. Runs the extended RW3D kit
 * validator (V06) as CI would and pins the authored contracts directly:
 * palette preservation, manifest production status, the depot door pivot
 * coverage (product ruling d on PR #188), the new wreck asset, and untouched
 * baseline vehicle/structure recipes. T15 (#142) re-authored the five unit
 * rigs; their contracts now live in rw3d-t15-rigs.test.ts and validator S8.
 */
const root = path.resolve(__dirname, "..", "..");
const assetsDir = path.join(root, "docs", "vision", "assets");
const kit = JSON.parse(fs.readFileSync(path.join(assetsDir, "kit.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(assetsDir, "asset-manifest.json"), "utf8"));
const byId = new Map<string, any>(kit.assets.map((a: any) => [a.id, a]));
const T09 = ["warehouse", "depot", "sorter", "furnace", "generator", "wreckSections"];

describe("rw3d kit validator (T09 #136, V06)", () => {
  it("passes every check with a real exit code and extended summary", () => {
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rw3d-t09-")), "report.json");
    // Throws on non-zero exit: a failing validator must fail CI, not be skipped.
    execFileSync(process.execPath, [path.join(root, "scripts", "rw3d-kit-validate.mjs"), "--json", tmp], {
      cwd: root,
      encoding: "utf8",
    });
    const report = JSON.parse(fs.readFileSync(tmp, "utf8"));
    expect(report.summary.fail).toBe(0);
    expect(report.summary.pass).toBe(report.summary.total);
    expect(report.summary.total).toBeGreaterThanOrEqual(1147);
    expect(report.summary.extendedBy).toEqual([136, 142]);
    expect(report.summary.exitCode).toBe(0);
    expect(report.summary.assets).toEqual(expect.arrayContaining(T09));
  });
});

describe("rw3d T09 authored contracts (#136)", () => {
  it("preserves the approved 10-token palette exactly", () => {
    expect(kit.palette).toEqual({
      sand: "#BA8054",
      oxide: "#A34F32",
      oxideLight: "#C47746",
      cream: "#D6C7A3",
      charcoal: "#292C29",
      steel: "#7C8078",
      olive: "#777746",
      yellow: "#C99A35",
      amber: "#FFB348",
      rubber: "#33332F",
    });
    for (const a of kit.assets) {
      for (const p of a.parts) expect(kit.palette[p.material], `${a.id}/${p.name}`).toBeTruthy();
    }
  });

  it("marks the six T09 assets production with visual review pending", () => {
    const entries = new Map<string, any>(manifest.assets.map((m: any) => [m.id, m]));
    for (const id of T09) {
      const m = entries.get(id);
      expect(m, id).toBeTruthy();
      expect(m.status, id).toBe("production");
      expect(m.visualReview, id).toBe("pending");
    }
    expect(manifest.additionalRequired).not.toContain("wreckSections");
    expect(manifest.additionalRequired.length).toBe(26);
    expect(entries.get("wreckSections").parts).toBe(11);
  });

  it("covers the depot door pivot sample gap (product ruling d, PR #188)", () => {
    const depot = byId.get("depot");
    const door = depot.groups.find((g: any) => g.name === "door");
    const panel = depot.parts.find((p: any) => p.name === "doorPanel");
    const anim = depot.animations.find((a: any) => a.name === "door_open");
    const bay = depot.sockets.find((s: any) => s.name === "serviceBay");
    expect(door).toBeTruthy();
    expect(panel.parent).toBe("door");
    expect(anim.target).toBe("door");
    expect(anim.path).toBe("translation");
    // Panel width is clearance-locked to the service bay opening.
    expect(panel.size[0]).toBe(bay.clearanceWidth);
    // Closed top and fully-open bottom must both clear the 1.8 lintel.
    const halfH = panel.size[1] / 2;
    const closedTop = door.position[1] + panel.center[1] + halfH;
    const openBottom = anim.values[anim.values.length - 1][1] + panel.center[1] - halfH;
    expect(closedTop).toBeGreaterThanOrEqual(1.8);
    expect(openBottom).toBeGreaterThanOrEqual(1.8);
  });

  it("ships wreckSections as a static sectioned salvage landmark", () => {
    const wreck = byId.get("wreckSections");
    expect(wreck.footprint).toEqual([3, 3]);
    expect(wreck.animations).toEqual([]);
    expect(wreck.groups.map((g: any) => g.name).sort()).toEqual([
      "sectionBed",
      "sectionCab",
      "sectionDebris",
      "sectionHull",
    ]);
    const socket = wreck.sockets.find((s: any) => s.name === "salvage");
    expect(socket.kind).toBe("pallet");
    expect(socket.approach).toEqual([0, 0, 1]);
  });

  it("keeps untouched baseline recipes intact (part counts)", () => {
    // T15 (#142) re-authored crane/truck/forklift/drone/worker; their part
    // counts are pinned in rw3d-t15-rigs.test.ts. Only turret/wall_gate remain
    // untouched baseline recipes after T09 + T15.
    const expected: Record<string, number> = {
      turret: 3,
      wall_gate: 3,
    };
    for (const [id, count] of Object.entries(expected)) {
      expect(byId.get(id).parts.length, id).toBe(count);
    }
  });
});
