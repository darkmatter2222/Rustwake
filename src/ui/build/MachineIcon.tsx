/**
 * UI-RESET-52: the catalog's machine icon is the machine's own silhouette.
 * `PARTS` (the renderer's authored part table, read-only here) is the same
 * geometry the world tiles paint, so the card and the yard agree on what a
 * sorter or a furnace looks like — recognition, not a second art set. The
 * table is pure data (a type-only import is all it pulls), so the icon costs
 * the entry chunk a few hundred bytes, not the canvas renderer.
 */
import { COLOR_KEYS, PALETTE, PARTS } from "../../game/renderer/sprites";

export function MachineIcon(props: { blueprint: string; size?: number }) {
  const parts = PARTS[props.blueprint] ?? PARTS.generic;
  const size = props.size ?? 40;
  return (
    <svg
      className="catalog__icon"
      width={size}
      height={size}
      viewBox="-17 -17 34 34"
      aria-hidden="true"
      focusable="false"
    >
      {parts.map(([x, y, w, h, colour, ellipse], index) => {
        const fill = PALETTE[COLOR_KEYS[colour]];
        return ellipse ? (
          <ellipse
            key={index}
            cx={x + w / 2}
            cy={y + h / 2}
            rx={w / 2}
            ry={h / 2}
            fill={fill}
            opacity={0.35}
          />
        ) : (
          <rect key={index} x={x} y={y} width={w} height={h} fill={fill} />
        );
      })}
    </svg>
  );
}
