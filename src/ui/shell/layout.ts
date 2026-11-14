/**
 * RW3D #135 (U03/U04): the painted geometry of the compact shell, from
 * docs/vision/UI_CONTRACT.md.
 *
 * The 2D-era permanent left rail, the Menu face/sheet and the two-layer panel
 * stack are retired here (the contract forbids a permanent left rail and allows
 * only ONE major inspector/catalog at a time). What replaces them is a single
 * persistent six-destination toolbar (the navigation spine on every viewport),
 * a contextual primary-action tray above it, a right-docked inspector on desktop
 * and a bottom sheet on phones. These constants are the one source of truth the
 * CSS blocks and the App camera-fit / focus logic share.
 */

/** Edge inset shared by every painted box. */
export const SHELL_EDGE_PX = 8;
/** Gutter between painted boxes. */
export const SHELL_GUTTER_PX = 6;

/** Desktop inspector column width (contract: 320-360 px). */
export const SHELL_INSPECTOR_WIDTH_PX = 340;
/** Reserved right gutter on desktop when an inspector is open: edge + width + gutter. */
export const SHELL_RIGHT_GUTTER_PX =
  SHELL_EDGE_PX + SHELL_INSPECTOR_WIDTH_PX + SHELL_GUTTER_PX;
/** Inspector top floor: just below the resource strip; App lifts it to the measured lead. */
export const SHELL_INSPECTOR_TOP_PX = 64;

/** The persistent toolbar height (contract: 56-64 px on phone and desktop). */
export const SHELL_TOOLBAR_HEIGHT_PX = 60;
/** Phone bottom sheet heights as a fraction of the viewport (contract ~35% / ~70%). */
export const SHELL_SHEET_COLLAPSED_VH = 35;
export const SHELL_SHEET_EXPANDED_VH = 70;

/**
 * UI-RESET-50: the visible zoom/reset controls. Each face keeps the 44 px target
 * floor; the camera fit reserves their gutter so no yard cell hides under a face.
 */
export const SHELL_ZOOM_FACE_PX = 44;
export const SHELL_ZOOM_GUTTER_PX = SHELL_ZOOM_FACE_PX + 10 + SHELL_GUTTER_PX;

/** Desktop mode: the inspector docks right and the toolbar centres (contract >= 1024 px). */
export const SHELL_DESKTOP_MIN_WIDTH_PX = 1024;
/**
 * The one media query the CSS desktop block and the JS render gate share, so the
 * right inspector exists exactly where it is painted. Below it the panels are
 * bottom sheets (portrait) or a compact side drawer (short landscape).
 */
export const SHELL_DESKTOP_QUERY = "(min-width: 1024px)";
/** Portrait phone band (contract < 768 px): bottom sheets + labeled bottom nav. */
export const SHELL_PHONE_MAX_WIDTH_PX = 767;
/** Compact landscape: short enough to want the side-drawer composition. */
export const SHELL_COMPACT_LANDSCAPE_MAX_HEIGHT_PX = 460;

/**
 * The six fixed destinations, in painted order (contract U03). Keys 1-6 map to
 * these in order; the toolbar and the keyboard share this one table. Build arms
 * the placement ghost + catalog; the rest open a single inspector panel.
 */
export const SHELL_SLOTS = ["build", "routes", "fleet", "research", "trade", "map"] as const;
export type ShellSlot = (typeof SHELL_SLOTS)[number];

/**
 * Panel selection sentinels. A positive value is a machine id (the entity
 * inspector); the negative values are the named destination panels. Build is not
 * a sentinel — it arms the ghost/catalog through `buildBlueprint`. Yard record and
 * Settings are reached from the Settings surface, not the toolbar.
 */
export const PANEL_TRADE = -2;
export const PANEL_RESEARCH = -3;
export const PANEL_YARD = -4;
export const PANEL_SETTINGS = -5;
export const PANEL_ROUTES = -6;
export const PANEL_FLEET = -7;
export const PANEL_MAP = -8;
/**
 * The return report is a stack layer like any other panel (U03: one major
 * surface at a time). It is pushed on Begin when the store holds an absence
 * report, and any destination opened over it sits on top; Back/Escape unwinds
 * one layer at a time down to the yard.
 */
export const PANEL_REPORT = -9;