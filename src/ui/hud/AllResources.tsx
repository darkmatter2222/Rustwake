import { RESOURCES } from "../../game/content/defs";
import type { SimState } from "../../game/simulation/types";
import { RESOURCE_LABEL } from "../text";
import { hudNumber } from "./format";
import { ResourceGlyph } from "./Icons";

/**
 * UI-RESET-51: the all-resource drawer. The chip row stays on its tight budget;
 * this bounded, scrollable grid is the escape hatch to every resource the yard
 * knows, each with its shape glyph, label and authoritative count. It renders
 * inside `.resources` on its own wrapped row, so it never floats over the world.
 */
export const ALL_RESOURCES_ID = "hud-all-resources";

export function AllResources({ state }: { state: SimState }) {
  return (
    <div
      className="hud-all"
      id={ALL_RESOURCES_ID}
      role="group"
      aria-label="All resources"
    >
      {RESOURCES.map((id) => (
        <span className="hud-all__row" key={id}>
          <ResourceGlyph id={id} className="hud-all__icon" />
          <span className="hud-all__label">{RESOURCE_LABEL[id] ?? id}</span>
          <strong className="hud-all__value">{hudNumber(state.store[id] ?? 0)}</strong>
        </span>
      ))}
    </div>
  );
}