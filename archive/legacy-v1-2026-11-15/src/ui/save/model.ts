/**
 * UI-RESET-63: the pure read/preview layer behind the rebuilt save management.
 *
 * `previewImport` runs the SAME decode the store's `importSave` runs (checksum,
 * schema, repair, invariants, migration) but never touches the live yard: a
 * refused text answers with the shared refusal note, and a sound one answers
 * with the exact payload the confirm step will hand to `onImport`. Validation
 * therefore happens BEFORE any mutation, and the preview cannot drift from the
 * import it previews.
 */
import {
  DEFAULT_SETTINGS,
  decodeSave,
  migrate,
  type SavePayload,
  type SaveSettings,
} from "../../game/persistence/save";
import { fleetUnits, type SimState } from "../../game/simulation/types";
import { importNoteFor } from "../text";
import { SAVE_COPY } from "./copy";

/** The five yard statistics the record page and the replacement preview share. */
export interface YardSummary {
  tick: number;
  machines: number;
  drones: number;
  links: number;
  credits: number;
}

/** One derivation for both surfaces, so the record and the preview agree. */
export function summarizeYard(sim: SimState): YardSummary {
  return {
    tick: sim.tick,
    machines: sim.machines.length,
    drones: fleetUnits(sim).filter((unitState) => unitState.repaired).length,
    links: sim.routes.length,
    credits: sim.credits,
  };
}

/** What the confirmation gate shows: the migrated payload plus its readouts. */
export interface ImportPreview {
  payload: SavePayload;
  summary: YardSummary;
  settingsLine: string;
}

export type PreviewResult =
  | { status: "ready"; preview: ImportPreview }
  | { status: "refused"; note: string };

/**
 * Validate pasted text without mutating anything. `current` is the live settings
 * record (read from the export envelope) so the gate can name the settings change
 * the replacement would apply.
 */
export function previewImport(text: string, current: SaveSettings): PreviewResult {
  const decoded = decodeSave(text);
  if (!decoded.ok) {
    return {
      status: "refused",
      note: importNoteFor({ ok: false, reason: decoded.reason, detail: decoded.detail }),
    };
  }
  // Migrate here exactly as `importSave` does, so an older save previews the
  // backfilled shape it will actually import (counters, spares, research).
  const payload = migrate(decoded.payload);
  return {
    status: "ready",
    preview: {
      payload,
      summary: summarizeYard(payload.sim),
      settingsLine: settingsChangeLine(current, payload.settings),
    },
  };
}

/** The settings consequence in one line; empty diff reads "Settings unchanged". */
export function settingsChangeLine(current: SaveSettings, incoming: SaveSettings): string {
  const parts: string[] = [];
  if (current.textScale !== incoming.textScale) {
    parts.push(`Text scale ${current.textScale} → ${incoming.textScale}`);
  }
  if (current.muted !== incoming.muted) {
    parts.push(incoming.muted ? "Sound on → muted" : "Sound muted → on");
  }
  if (current.reducedMotion !== incoming.reducedMotion) {
    parts.push(incoming.reducedMotion ? "Motion full → reduced" : "Motion reduced → full");
  }
  return parts.length > 0 ? parts.join(" · ") : SAVE_COPY.settingsUnchanged;
}

/** The download file name carries the tick so two backups never overwrite silently. */
export function exportFileName(tick: number): string {
  return `rustwake-yard-tick-${tick}.json`;
}

/**
 * Clipboard write with a total failure answer: a missing API (older browser,
 * insecure context) or a rejected promise both read `false`, and the caller
 * shows the manual-copy note. Never throws.
 */
export async function copySaveText(text: string): Promise<boolean> {
  const clipboard = navigator.clipboard?.writeText;
  if (!clipboard) return false;
  try {
    await clipboard.call(navigator.clipboard, text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Download via a temporary object URL. Every step is guarded: a browser without
 * `createObjectURL` (or a hostile DOM) answers `false` and the caller shows the
 * copy-instead note, so a failed download never looks like a successful backup.
 */
export function downloadSaveText(text: string, fileName: string): boolean {
  try {
    if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return false;
    if (typeof URL.revokeObjectURL !== "function") return false;
    if (typeof Blob === "undefined" || typeof document === "undefined") return false;
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * The live settings as the export envelope carries them. YardPanel receives no
 * store handle (its mount contract is `state / exportText / onImport / onClose`),
 * and the export text IS the current checkpoint, so decoding it answers the
 * current settings without a new prop. A damaged export reads as defaults.
 */
export function currentSettingsOf(exportText: string): SaveSettings {
  const decoded = decodeSave(exportText);
  return decoded.ok ? decoded.payload.settings : { ...DEFAULT_SETTINGS };
}