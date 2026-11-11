import { describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import cssRaw from "../../src/ui/primitives.css?raw";
import {
  Dialog,
  Face,
  HelpTip,
  InspectorSection,
  NavRow,
  Primitives48,
  ResourceAmount,
  Sheet,
  ToastLane,
  transitionFor,
} from "../../src/ui/primitives";
import { FACE_STATES, GEOMETRY } from "../../src/ui/tokens";

/**
 * UI-RESET/TOKENS (#48) acceptance 1, 3 and 4: one primitive per state group painted in every
 * state, with the state carried in an attribute (so it is readable without colour), the printed
 * formats, the 44 / 46 px floor, keyboard focus and the reduced-motion branch.
 */

/** React 18 needs this flag or `act` warns in a plain jsdom run. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(node: ReactNode): HTMLDivElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    createRoot(host).render(node);
  });
  return host;
}

describe("primitive: Face, one primitive for the whole state group", () => {
  it("paints all seven states with the state in an attribute", () => {
    const host = mount(
      <div>
        {FACE_STATES.map((state) => (
          <Face key={state} id={`f-${state}`} label="Upgrade" price="222 credits" state={state} />
        ))}
      </div>
    );
    const faces = [...host.querySelectorAll<HTMLButtonElement>(".wk-face")];
    expect(faces).toHaveLength(7);
    expect(faces.map((f) => f.getAttribute("data-state"))).toEqual([...FACE_STATES]);
    for (const face of faces) {
      expect(face.getAttribute("data-afford")).toBe("none");
      expect(face.textContent).toContain("222 credits");
    }
  });

  it("makes disabled and error inert, loading busy, and keeps the label", () => {
    const host = mount(
      <div>
        <Face id="a" label="Upgrade" price="222 credits" state="disabled" />
        <Face id="b" label="Upgrade" price="222 credits" state="error" />
        <Face id="c" label="Sell 35 Ferrous" price="+70 credits" state="loading" />
      </div>
    );
    const [disabled, error, loading] = [...host.querySelectorAll<HTMLButtonElement>(".wk-face")];
    expect(disabled.disabled).toBe(true);
    expect(disabled.getAttribute("aria-disabled")).toBe("true");
    expect(error.disabled).toBe(true);
    expect(loading.getAttribute("aria-busy")).toBe("true");
    // a state never removes the label (P4: one goal, one wording)
    expect(disabled.textContent).toContain("Upgrade");
    expect(loading.querySelector(".wk-face__label")?.textContent).toBe("Sell 35 Ferrous");
    expect(loading.querySelector(".wk-face__price")?.textContent).toBe("+70 credits");
    // the face box comes from the measured geometry, not from a magic number in the sheet
    expect(GEOMETRY.faceHeightPx).toBe(46);
    expect(GEOMETRY.touchMinPx).toBe(44);
  });

  it("paints unaffordable as a non-colour state: dashed edge plus the printed shortfall", () => {
    const host = mount(
      <Face
        id="short"
        label="Upgrade"
        price="222 credits"
        reason="Needs 222 credits · have 0"
        afford="short"
      />
    );
    const face = host.querySelector<HTMLButtonElement>(".wk-face")!;
    expect(face.getAttribute("data-afford")).toBe("short");
    // the audit's measured gap: `disabled:false, opacity:1` at credits 0 left only the number
    expect(face.querySelector(".wk-face__reason")?.textContent).toBe("Needs 222 credits · have 0");
    expect(face.querySelector(".wk-face__label")).toBeTruthy();
    expect(face.querySelector(".wk-face__price")).toBeTruthy();
    // and the sheet does carry a shape change for it, not a hue alone
    expect(cssRaw).toMatch(/\.wk-face\[data-afford="short"\][^{]*\{[^}]*border-style: dashed/);
  });

  it("keeps label and price as two children so the strings never collide", () => {
    const host = mount(<Face id="s" label="Sell 35 Ferrous" price="+70 credits" afford="ok" />);
    const face = host.querySelector<HTMLButtonElement>(".wk-face")!;
    expect(face.children).toHaveLength(2);
    expect(face.querySelector(".wk-face__label")?.textContent).toBe("Sell 35 Ferrous");
    expect(face.querySelector(".wk-face__price")?.textContent).toBe("+70 credits");
    // the separation is a painted 4 px flex gap, so `Ferrous+70` cannot repaint (C6)
    expect(cssRaw).toMatch(/\.wk-face \{[^}]*gap: var\(--wk-gap-face\)/);
    expect(cssRaw).toContain("--wk-gap-face: 4px;");
  });
});

describe("primitive: the navigation row", () => {
  it("paints five slots in the fixed order and keeps a locked slot in place", () => {
    const host = mount(
      <NavRow active="store" locked={{ research: "Needs data" }} onPress={() => undefined} />
    );
    const slots = [...host.querySelectorAll<HTMLButtonElement>(".wk-nav__face")];
    expect(slots).toHaveLength(5);
    expect(slots.map((s) => s.getAttribute("data-slot"))).toEqual([
      "yard",
      "build",
      "store",
      "research",
      "menu",
    ]);
    expect(slots[2].getAttribute("aria-current")).toBe("page");
    const locked = slots[3];
    expect(locked.disabled).toBe(true);
    expect(locked.getAttribute("aria-disabled")).toBe("true");
    expect(locked.querySelector(".wk-nav__reason")?.textContent).toBe("Needs data");
    // an inert row keeps all five boxes, so the thumb learns five positions once
    const inert = mount(<NavRow active={null} state="disabled" onPress={() => undefined} />);
    expect(inert.querySelectorAll(".wk-nav__face")).toHaveLength(5);
  });
});

describe("primitive: sheet, dialog, inspector section", () => {
  it("is one named dialog region at the measured height, one close face", () => {
    const host = mount(
      <Sheet title="Yard store" band="390x844" kind="store" onClose={() => undefined}>
        <ResourceAmount label="Scrap" value={10} unit="scrap" />
      </Sheet>
    );
    const sheet = host.querySelector<HTMLElement>(".wk-sheet")!;
    expect(sheet.getAttribute("role")).toBe("dialog");
    expect(sheet.getAttribute("aria-modal")).toBe("true");
    expect(sheet.getAttribute("tabindex")).toBe("-1");
    expect(sheet.style.height).toBe("348px"); // the measured 390x844 sheet box, kept exactly
    const title = sheet.querySelector(".wk-sheet__title")!;
    expect(title.textContent).toBe("Yard store");
    expect(sheet.getAttribute("aria-labelledby")).toBe(title.id);
    const close = [...sheet.querySelectorAll("button")].find(
      (b) => (b.textContent ?? "").trim() === "Close"
    );
    expect(close).toBeTruthy();
    // one body: the sheet holds the section, no second stacked panel
    expect(sheet.querySelectorAll(".wk-sheet__body")).toHaveLength(1);
  });

  it("stacks the dialog above the sheet in the four-tier z ladder", () => {
    const host = mount(
      <Dialog title="While you were away" onClose={() => undefined}>
        <ResourceAmount label="Credits" value={82} unit="credits" />
      </Dialog>
    );
    const dialog = host.querySelector<HTMLElement>(".wk-dialog")!;
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.querySelector(".wk-dialog__foot button")?.textContent).toBe("Back");
    const sheetRule = cssRaw.slice(cssRaw.indexOf(".wk-sheet {"));
    const dialogRule = cssRaw.slice(cssRaw.indexOf(".wk-dialog {"));
    expect(sheetRule).toContain("z-index: var(--wk-z-sheet)");
    expect(dialogRule).toContain("z-index: var(--wk-z-dialog)");
  });

  it("keeps an inspector section's numbers in the data face", () => {
    const host = mount(
      <InspectorSection
        heading="Capacity"
        value="900 / 900"
        status="settled"
        rows={[
          { term: "Ferrous", value: "54 units" },
          { term: "Nonferrous", value: "239 units" },
        ]}
        state="loading"
      />
    );
    const section = host.querySelector<HTMLElement>(".wk-inspector__section")!;
    expect(section.getAttribute("data-state")).toBe("loading");
    expect(section.querySelector(".wk-inspector__value")?.className).toContain("wk-data");
    expect(section.querySelectorAll(".wk-inspector__row")).toHaveLength(2);
    expect(section.querySelector("dt")?.textContent).toBe("Ferrous");
    expect(section.querySelector("dd")?.textContent).toBe("54 units");
  });
});

describe("primitive: resource amount, help, feedback lane", () => {
  it("prints one space before the unit and a signed gain", () => {
    const host = mount(
      <div>
        <ResourceAmount label="Scrap" value={10} unit="scrap" dot="#c9713a" />
        <ResourceAmount label="Credits" value={70} unit="credits" signed />
        <ResourceAmount label="Batch" value={1.74} unit="s" reason="Blocked by power" state="error" />
      </div>
    );
    const values = [...host.querySelectorAll(".wk-amount__value")].map((n) => n.textContent);
    expect(values).toEqual(["10 scrap", "+70 credits", "1.74 s"]);
    for (const value of values) expect(value).toMatch(/^\S+ \S+$/);
    const errored = host.querySelectorAll(".wk-amount")[2];
    expect(errored.getAttribute("data-state")).toBe("error");
    expect(errored.querySelector(".wk-amount__reason")?.textContent).toBe("Blocked by power");
  });

  it("paints help as a printed line and the toast as a status in its own lane", () => {
    const host = mount(
      <div>
        <HelpTip id="h1" text="The store holds 900 units; overflow is lost." />
        <ToastLane text="Cutting pulse recharging" />
        <ToastLane text="Not a Rustwake file" state="error" />
      </div>
    );
    expect(host.querySelector(".wk-help")?.textContent).toContain("900 units");
    const toasts = [...host.querySelectorAll("[role='status']")];
    expect(toasts).toHaveLength(2);
    expect(host.querySelectorAll(".wk-toast-lane")).toHaveLength(2);
    expect(host.querySelectorAll(".wk-toast-lane")[1].getAttribute("data-state")).toBe("error");
  });
});

describe("primitive: the painted gallery at every band", () => {
  it("paints every state of every group in one frame", () => {
    const host = mount(<Primitives48 band="390x844" />);
    const states = new Set(
      [...host.querySelectorAll("[data-state]")].map((n) => String(n.getAttribute("data-state")))
    );
    for (const state of FACE_STATES) expect(states.has(state)).toBe(true);
    expect(host.querySelectorAll(".wk-face").length).toBeGreaterThanOrEqual(FACE_STATES.length);
    expect(host.querySelectorAll(".wk-nav__face")).toHaveLength(10);
    expect(host.querySelectorAll(".wk-sheet")).toHaveLength(2);
    expect(host.querySelector(".wk-dialog")).toBeTruthy();
    expect(host.querySelectorAll(".wk-inspector__section").length).toBeGreaterThanOrEqual(3);
    expect(host.querySelectorAll(".wk-amount").length).toBeGreaterThanOrEqual(3);
    expect(host.querySelectorAll(".wk-help")).toHaveLength(2);
    expect(host.querySelectorAll(".wk-toast-lane")).toHaveLength(2);
    // no raw token or key leaks onto the screen
    expect(host.textContent).not.toContain("--wk-");
    expect(host.textContent).not.toContain("undefined");
  });

  it("takes the reduced-motion branch the media query declares", () => {
    expect(transitionFor(false)).toContain("steps(4, end)");
    expect(transitionFor(true)).toBe("none");
    const block = cssRaw.slice(cssRaw.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).toContain("transition: none;");
  });
});
