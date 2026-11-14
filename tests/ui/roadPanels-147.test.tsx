/**
 * RW3D #147 (T20): road fleet / routes panel DOM behaviour.
 *
 * Acceptance: rows render with job/cargo/destination; the Focus face pans to the
 * exact typed blocker (U06); dispatch-policy controls gate creation; recovery
 * paths for an unreachable destination and an occupied bay name their fix;
 * the bay editor consumes the #139 socket projection and shows an HONEST empty
 * state when no sockets are declared (#217); traffic stays default-OFF and the
 * opt-in path is exercised (#140 parity — no fleet ink in the legacy mount).
 *
 * Method: jsdom DOM assertions only (no vision). Every action goes through the
 * real component event path into the faithful engine-backed double
 * (road-147.helpers). Socket links are a documented read-only projection double;
 * their derivation is independently covered by tests/game/roadSockets.test.ts.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import stylesRaw from "../../src/ui/styles.css?raw";
import shellRaw from "../../src/ui/shell/shell.css?raw";
import logisticsRaw from "../../src/ui/logistics/logistics.css?raw";
import { RoadFleet } from "../../src/ui/logistics/RoadFleet";
import { RoadRoutes } from "../../src/ui/logistics/RoadRoutes";
import { FleetPanel } from "../../src/ui/shell/FleetPanel";
import { RoutesPanel } from "../../src/ui/shell/RoutesPanel";
import { ROAD_FLEET_COPY as FLEET, ROAD_ROUTES_COPY as ROUTES } from "../../src/ui/logistics/copy";
import { getDispatchPolicy, resetDispatchPolicy } from "../../src/ui/logistics/dispatchPolicy";
import { createInitialState } from "../../src/game/simulation/types";
import { applyCommand } from "../../src/game/simulation/commands";
import {
  c,
  fixtureJob,
  fixtureRuntime,
  fixtureSocket,
  makeRoadDouble,
  seedYard,
} from "./road-147.helpers";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: Root[] = [];

function mount(node: ReactNode): HTMLElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mountedRoots.push(root);
  act(() => {
    root.render(node);
  });
  return host;
}

function injectSheets(): void {
  for (const raw of [stylesRaw, shellRaw, logisticsRaw]) {
    const style = document.createElement("style");
    style.textContent = raw;
    document.head.appendChild(style);
  }
}

function click(node: Element): void {
  act(() => {
    node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function submit(form: Element): void {
  act(() => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

function setInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function setSelect(select: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")!.set!;
  act(() => {
    setter.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function formByLabel(host: HTMLElement, label: string): HTMLFormElement {
  const found = host.querySelector<HTMLFormElement>(`form[aria-label="${label}"]`);
  if (!found) throw new Error(`missing form: ${label}`);
  return found;
}

function inputIn(form: HTMLFormElement, index = 0): HTMLInputElement {
  return form.querySelectorAll<HTMLInputElement>("input")[index];
}

function buttonByText(host: HTMLElement, text: string): HTMLButtonElement {
  const found = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === text);
  if (!found) throw new Error(`missing button: ${text}`);
  return found;
}

afterEach(() => {
  act(() => {
    for (const root of mountedRoots) root.unmount();
  });
  mountedRoots.length = 0;
});

beforeEach(() => {
  document.body.innerHTML = "";
  injectSheets();
  resetDispatchPolicy();
});

describe("RoadFleet — opt-in traffic and rows", () => {
  it("starts default-OFF with an Enable face and an honest empty fleet (#140 parity)", () => {
    const double = makeRoadDouble();
    const host = mount(<RoadFleet api={double.api} onFocusCell={() => {}} />);
    expect(host.textContent).toContain(FLEET.trafficOff);
    expect(host.textContent).toContain(FLEET.empty);
    expect(buttonByText(host, FLEET.enable)).toBeTruthy();
    // Opt-in: enabling flips the status line and retires the Enable face.
    click(buttonByText(host, FLEET.enable));
    expect(double.api.isTrafficEnabled()).toBe(true);
    expect(host.textContent).toContain(FLEET.trafficOn);
    expect(host.querySelector("button")?.textContent).not.toBe(FLEET.enable);
  });

  it("renders a truck row with job, cargo and destination; select focuses + opens the profile", () => {
    const double = makeRoadDouble();
    const carrier = double.api.registerLogisticsCarrier({ capacity: 12, cell: c(2, 3) })!;
    double.logistics.jobs.push(
      fixtureJob({ id: 7, carrierId: carrier.id, inTransit: 5, atSource: 5, status: "active", phase: "to-dest" }),
    );
    carrier.jobId = 7;
    const focus = vi.fn();
    const host = mount(<RoadFleet api={double.api} onFocusCell={focus} />);
    expect(host.textContent).toContain("Truck 1");
    expect(host.textContent).toContain("5/12 scrap");
    expect(host.textContent).toContain("2 (5, 0)"); // destination building + cell
    click(host.querySelector<HTMLButtonElement>(`[aria-label="${FLEET.select} 1"]`)!);
    expect(focus).toHaveBeenCalledWith(c(2, 3));
    expect(formByLabel(host, `${FLEET.truckConfig} 1`)).toBeTruthy();
  });

  it("renders a typed hold with recovery and a Focus face that pans to the blocker", () => {
    const double = makeRoadDouble();
    const carrier = double.api.registerLogisticsCarrier({ capacity: 12, cell: c(2, 3) })!;
    double.logistics.jobs.push(
      fixtureJob({
        id: 7,
        carrierId: carrier.id,
        heldReason: { kind: "no-route", from: c(0, 0), to: c(5, 0) },
      }),
    );
    carrier.jobId = 7;
    const focus = vi.fn();
    const host = mount(<RoadFleet api={double.api} onFocusCell={focus} />);
    expect(host.textContent).toContain("No road route (0, 0) → (5, 0)");
    expect(host.textContent).toContain("Build or repair road");
    click(host.querySelector<HTMLButtonElement>(`[aria-label="${FLEET.focus} truck 1"]`)!);
    expect(focus).toHaveBeenCalledWith(c(5, 0)); // no-route focuses the far end
  });

  it("adds a truck through the real engine and reports success", () => {
    const double = makeRoadDouble();
    const host = mount(<RoadFleet api={double.api} onFocusCell={() => {}} />);
    const form = formByLabel(host, FLEET.addTruck);
    setInput(inputIn(form, 0), "16"); // capacity
    setInput(inputIn(form, 1), "4"); // x
    setInput(inputIn(form, 2), "5"); // y
    submit(form);
    expect(double.logistics.carriers).toHaveLength(1);
    expect(double.logistics.carriers[0]).toMatchObject({ capacity: 16, cell: c(4, 5) });
    expect(host.textContent).toContain(FLEET.added);
  });

  it("default profile is disabled until traffic is enabled, then applies", () => {
    const double = makeRoadDouble();
    const host = mount(<RoadFleet api={double.api} onFocusCell={() => {}} />);
    const form = formByLabel(host, FLEET.defaultConfig);
    expect(inputIn(form, 0).disabled).toBe(true);
    click(buttonByText(host, FLEET.enable));
    expect(inputIn(form, 0).disabled).toBe(false);
    setInput(inputIn(form, 0), "4");
    submit(form);
    expect(double.traffic.defaultTruck.speed).toBe(4);
  });

  it("stands down for a reader tab: note shown, mutations disabled", () => {
    const double = makeRoadDouble({ role: "reader" });
    const host = mount(<RoadFleet api={double.api} onFocusCell={() => {}} />);
    expect(host.textContent).toContain(FLEET.reader);
    expect(buttonByText(host, FLEET.enable).disabled).toBe(true);
    expect(inputIn(formByLabel(host, FLEET.addTruck), 0).disabled).toBe(true);
  });
});

describe("RoadRoutes — policy, creation, holds and bays", () => {
  it("renders dispatch-policy controls and edits the session policy", () => {
    const double = makeRoadDouble();
    const host = mount(<RoadRoutes api={double.api} onFocusCell={() => {}} />);
    const filters = host.querySelectorAll<HTMLInputElement>(".road-policy__filter input");
    expect(filters.length).toBeGreaterThan(1);
    expect(filters[0].checked).toBe(true); // permissive default: all allowed
    click(filters[0]); // uncheck scrap -> filtered out
    expect(getDispatchPolicy().allowedResources).not.toContain("scrap");
    const policyForm = host.querySelector<HTMLElement>(".road-policy .road-form")!;
    const reserve = policyForm.querySelectorAll<HTMLInputElement>("input")[0];
    setInput(reserve, "7");
    expect(getDispatchPolicy().reserveFloor).toBe(7);
  });

  it("creates a job through the engine and renders the new row", () => {
    const double = makeRoadDouble();
    seedYard(double, { sourceStock: 50 });
    const host = mount(<RoadRoutes api={double.api} onFocusCell={() => {}} />);
    const form = formByLabel(host, ROUTES.newJob);
    const selects = form.querySelectorAll<HTMLSelectElement>("select");
    setSelect(selects[0], "1"); // source
    setSelect(selects[1], "2"); // destination
    setSelect(selects[2], "scrap"); // material
    setInput(form.querySelectorAll<HTMLInputElement>("input")[0], "5"); // amount
    submit(form);
    expect(double.logistics.jobs).toHaveLength(1);
    expect(host.textContent).toContain(ROUTES.created);
    // A freshly created job is pending: 0 delivered of 5 reserved.
    expect(host.textContent).toContain("0/5 scrap");
  });

  it("policy gate refuses a too-small job before the engine is asked", () => {
    const double = makeRoadDouble();
    seedYard(double, { sourceStock: 50 });
    const host = mount(<RoadRoutes api={double.api} onFocusCell={() => {}} />);
    const policyForm = host.querySelector<HTMLElement>(".road-policy .road-form")!;
    setInput(policyForm.querySelectorAll<HTMLInputElement>("input")[1], "10"); // min fill 10
    const form = formByLabel(host, ROUTES.newJob);
    setInput(form.querySelectorAll<HTMLInputElement>("input")[0], "3"); // amount 3 < 10
    submit(form);
    expect(double.logistics.jobs).toHaveLength(0);
    expect(host.textContent).toContain("Minimum fill is 10; 3 is too small");
  });

  it("unreachable destination: typed no-route hold, recovery and Focus to the destination", () => {
    const double = makeRoadDouble();
    double.logistics.jobs.push(
      fixtureJob({ id: 3, heldReason: { kind: "no-route", from: c(0, 0), to: c(5, 0) } }),
    );
    const focus = vi.fn();
    const host = mount(<RoadRoutes api={double.api} onFocusCell={focus} />);
    expect(host.textContent).toContain("No road route (0, 0) → (5, 0)");
    expect(host.textContent).toContain("Build or repair road");
    click(host.querySelector<HTMLButtonElement>(`[aria-label="${ROUTES.focus} job 3 blocker"]`)!);
    expect(focus).toHaveBeenCalledWith(c(5, 0));
  });

  it("occupied bay: typed bay-full hold names the capacity fix and focuses the bay", () => {
    const double = makeRoadDouble();
    double.logistics.jobs.push(fixtureJob({ id: 4, carrierId: 1, heldReason: null }));
    // bay-full is a traffic hold on the carrier runtime (not a cargo hold).
    fixtureRuntime(double.traffic, 1, { heldReason: { kind: "bay-full", at: c(7, 10), capacity: 1 } });
    const focus = vi.fn();
    const host = mount(<RoadRoutes api={double.api} onFocusCell={focus} />);
    expect(host.textContent).toContain("Bay (7, 10) full (capacity 1)");
    expect(host.textContent).toContain("Raise this bay's capacity");
    click(host.querySelector<HTMLButtonElement>(`[aria-label="${ROUTES.focus} job 4 blocker"]`)!);
    expect(focus).toHaveBeenCalledWith(c(7, 10));
  });

  it("cancels a live job but offers no cancel on terminal history", () => {
    const double = makeRoadDouble();
    seedYard(double, { sourceStock: 50 });
    double.api.createLogisticsJob({ id: "live", sourceBuildingId: 1, destBuildingId: 2, cargoType: "scrap", amount: 5 });
    double.logistics.jobs.push(fixtureJob({ id: 99, status: "complete", phase: "done", delivered: 10, atSource: 0 }));
    const host = mount(<RoadRoutes api={double.api} onFocusCell={() => {}} />);
    const liveCancel = host.querySelector<HTMLButtonElement>(`[aria-label="${ROUTES.cancel} job 1"]`);
    expect(liveCancel).toBeTruthy();
    expect(host.querySelector(`[aria-label="${ROUTES.cancel} job 99"]`)).toBeNull();
    click(liveCancel!);
    expect(double.logistics.jobs.find((j) => j.id === 1)?.status).toBe("cancelled");
  });

  it("bay editor consumes the socket projection: occupancy, cap, writer-gated set", () => {
    const double = makeRoadDouble({
      sockets: [fixtureSocket({ buildingId: 1, socket: "bay0", approach: c(7, 10), connected: true })],
    });
    double.traffic.bayCapacity["7,10"] = 1;
    double.traffic.bayLeases.push({ id: 1, carrierId: 1, jobId: 1, cell: c(7, 10) });
    const host = mount(<RoadRoutes api={double.api} onFocusCell={() => {}} />);
    expect(host.textContent).toContain("1/bay0");
    expect(host.textContent).toContain("1 in use");
    expect(host.textContent).toContain("Bay capacity 1");
    const form = formByLabel(host, `${ROUTES.bayCapacity} 1/bay0`);
    setInput(inputIn(form, 0), "3");
    submit(form);
    expect(double.traffic.bayCapacity["7,10"]).toBe(3);
  });

  it("shows the honest empty-socket state when no bays are declared (#217)", () => {
    const double = makeRoadDouble({ sockets: [] });
    const host = mount(<RoadRoutes api={double.api} onFocusCell={() => {}} />);
    expect(host.textContent).toContain(ROUTES.baysEmpty);
    expect(host.querySelector(".road-bays .shell-list")).toBeNull();
  });

  it("reader tab disables the bay editor and policy controls", () => {
    const double = makeRoadDouble({
      role: "reader",
      sockets: [fixtureSocket({ buildingId: 1, socket: "bay0", approach: c(7, 10) })],
    });
    const host = mount(<RoadRoutes api={double.api} onFocusCell={() => {}} />);
    expect(host.textContent).toContain(ROUTES.reader);
    expect(inputIn(formByLabel(host, `${ROUTES.bayCapacity} 1/bay0`), 0).disabled).toBe(true);
    expect(host.querySelector<HTMLInputElement>(".road-policy__filter input")!.disabled).toBe(true);
  });

  it("registers a building approach cell through the engine", () => {
    const double = makeRoadDouble();
    const host = mount(<RoadRoutes api={double.api} onFocusCell={() => {}} />);
    const form = formByLabel(host, ROUTES.registerBuilding);
    setInput(inputIn(form, 0), "5"); // id
    setInput(inputIn(form, 1), "2"); // x
    setInput(inputIn(form, 2), "3"); // y
    setInput(inputIn(form, 3), "40"); // capacity
    submit(form);
    expect(double.logistics.buildings[5]).toMatchObject({ id: 5, cell: c(2, 3), capacity: 40 });
    expect(host.textContent).toContain(ROUTES.registered);
  });
});

describe("additive mounting — legacy-safe, no fleet ink without the road capability", () => {
  it("FleetPanel without road renders only the drone ladder (default-OFF parity)", () => {
    const state = createInitialState();
    const host = mount(
      <FleetPanel state={state} dispatch={(cmd) => applyCommand(state, cmd)} onClose={() => {}} />,
    );
    expect(host.textContent).not.toContain(FLEET.title);
    expect(host.querySelector(".road-fleet")).toBeNull();
  });

  it("FleetPanel with road mounts the road fleet section", () => {
    const state = createInitialState();
    const double = makeRoadDouble();
    const host = mount(
      <FleetPanel
        state={state}
        dispatch={(cmd) => applyCommand(state, cmd)}
        onClose={() => {}}
        road={double.api}
        onFocusCell={() => {}}
      />,
    );
    expect(host.querySelector(".road-fleet")).toBeTruthy();
    expect(host.textContent).toContain(FLEET.title);
  });

  it("RoutesPanel without road renders no road jobs; with road it does", () => {
    const state = createInitialState();
    const legacy = mount(
      <RoutesPanel state={state} dispatch={(cmd) => applyCommand(state, cmd)} onClose={() => {}} />,
    );
    expect(legacy.querySelector(".road-routes")).toBeNull();
    expect(legacy.textContent).not.toContain(ROUTES.title);

    const double = makeRoadDouble();
    const withRoad = mount(
      <RoutesPanel
        state={state}
        dispatch={(cmd) => applyCommand(state, cmd)}
        onClose={() => {}}
        road={double.api}
        onFocusCell={() => {}}
      />,
    );
    expect(withRoad.querySelector(".road-routes")).toBeTruthy();
    expect(withRoad.textContent).toContain(ROUTES.title);
  });
});