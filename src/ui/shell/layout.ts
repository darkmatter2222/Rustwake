/**
 * UI-RESET-49 (G2): the painted geometry of the app shell, from the accepted
 * navigation spec (work/evidence/UI-RESET-47/navigation-spec.md §3.6).
 *
 * These are shell-owned constants. `tokens.ts` stays frozen by the tokens-48
 * census (its `GEOMETRY.railWidthPx` is 56); the spec's 96 px rail is declared
 * here so the two contracts never fight over one number. The deviation is
 * recorded in the PR evidence.
 */

/** Edge inset shared by every painted box (spec §3.6: 8 px). */
export const SHELL_EDGE_PX = 8;
/** Gutter between painted boxes (spec §3.6: 6 px). */
export const SHELL_GUTTER_PX = 6;
/** R1: the destination rail's painted width. */
export const SHELL_RAIL_WIDTH_PX = 96;
/** The inspector column's painted width (spec §3.6: 320 px). */
export const SHELL_INSPECTOR_WIDTH_PX = 320;
/** World region left edge in rail mode: edge + rail + gutter = 110 px. */
export const SHELL_WORLD_LEFT_PX = SHELL_EDGE_PX + SHELL_RAIL_WIDTH_PX + SHELL_GUTTER_PX;
/** Reserved right gutter in rail mode: edge + inspector + gutter = 334 px. */
export const SHELL_RIGHT_GUTTER_PX = SHELL_EDGE_PX + SHELL_INSPECTOR_WIDTH_PX + SHELL_GUTTER_PX;
/** Inspector top edge: below the lead block (chips + objective), spec §3.6 y≈104. */
export const SHELL_INSPECTOR_TOP_PX = 104;
/** The phone Menu face width; the dock reserves 72 px for it (66 + 6 gutter). */
export const SHELL_MENU_FACE_PX = 66;
export const SHELL_MENU_ZONE_PX = SHELL_MENU_FACE_PX + SHELL_GUTTER_PX;

/**
 * UI-RESET-50: the visible zoom/reset controls. Each face keeps the shell's
 * 44 px target floor; phone/column modes reserve the stack's right gutter in
 * the camera fit so no yard cell ever sits under a control, and rail mode
 * paints the row above the primary band instead (the inspector owns the
 * right gutter there).
 */
export const SHELL_ZOOM_FACE_PX = 44;
export const SHELL_ZOOM_GUTTER_PX = SHELL_ZOOM_FACE_PX + 10 + SHELL_GUTTER_PX;

/** Rail mode: wide desktops, and any landscape short enough to need the width. */
export const SHELL_RAIL_MIN_WIDTH_PX = 1200;
export const SHELL_LANDSCAPE_MIN_WIDTH_PX = 600;
export const SHELL_LANDSCAPE_MAX_HEIGHT_PX = 460;
/**
 * The one media query the CSS rail block and the JS render gate share, so the
 * rail exists exactly where it is painted. Phone and column modes keep their
 * destinations in the dock row plus the Menu face; the rail is not a hidden
 * duplicate of them.
 */
export const SHELL_RAIL_QUERY =
  "(min-width: 1200px), (min-width: 600px) and (max-height: 460px)";
/** Phone mode: the thumb-zone split band. */
export const SHELL_PHONE_MAX_WIDTH_PX = 599;

/**
 * The five fixed destination slots, in painted order (spec §3.1). Keys 1–5
 * map to these in order; the rail and the keyboard share this one table.
 */
export const SHELL_SLOTS = ["yard", "build", "store", "research", "menu"] as const;
export type ShellSlot = (typeof SHELL_SLOTS)[number];
