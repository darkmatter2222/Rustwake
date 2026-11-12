import type { SimState } from "../../game/simulation/types";

/**
 * UI-RESET-62: the home/settings copy lane. strings.ts is read-only for this
 * issue, so every new phrase lives here as a plain literal. None of these may
 * take the shape of a translation key (the i18n census refuses raw key patterns
 * like `btn.foo` anywhere in the HUD), so they are full sentences and words.
 */
export const HOME_COPY = {
  continue: "Continue",
  newGame: "New game…",
  settings: "Settings",
  savedRun: "Saved run found",
  freshYard: "A fresh yard is waiting",
} as const;

export const SETTINGS_COPY = {
  title: "Settings",
  sound: "Sound",
  soundOn: "On",
  soundOff: "Off",
  textSize: "Text size",
  textCycle: "Change",
  textCycleAria: "Cycle text size",
  reducedMotion: "Reduced motion",
  motionOn: "On",
  motionOff: "Off",
  motionToggleAria: "Toggle reduced motion",
  motionOsNote: "Your system already requests reduced motion, so it stays on here.",
  display: "Display",
  displayWindowed: "Windowed",
  displayFullscreen: "Fullscreen",
  displayEnter: "Enter fullscreen",
  displayExit: "Exit fullscreen",
  displayUnsupported: "Fullscreen is not available in this browser.",
  displayDenied: "Fullscreen was refused by the browser; staying windowed.",
  reset: "Reset game…",
  closeAria: "Close settings",
} as const;

export const RESET_COPY = {
  title: "Reset game",
  warning:
    "This permanently deletes your saved yard, machines, credits and progress. It cannot be undone.",
  noSave: "There is no saved progress yet; resetting starts a fresh yard.",
  acknowledge: "I understand my save will be permanently deleted",
  confirm: "Delete save and reset",
  menuHint: "Delete the saved yard and start fresh",
  settingsRowHint: "Sound, text size, motion and display",
} as const;

/**
 * The title screen's one-line readout of the actual save: real tick, machine
 * count and drone status from the loaded state, never a canned string.
 */
export function saveSummary(sim: SimState): string {
  const machines = sim.machines.length;
  const machineWord = machines === 1 ? "machine" : "machines";
  const drone = sim.drone.repaired ? "drone flying" : "drone wrecked";
  const credits = sim.credits;
  return `Tick ${sim.tick} · ${machines} ${machineWord} · ${drone} · ${credits} credits`;
}