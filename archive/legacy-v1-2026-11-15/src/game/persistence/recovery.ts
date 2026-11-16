import { decodeSave, type DecodeFailure } from "./save";

/**
 * G1 (#191): parallel legacy slot for a corrupt boot. The executive contract
 * forbids silently resetting a player's yard, so when the authoritative envelope
 * in `SAVE_KEY` fails to decode we retain its RAW bytes here, verbatim, before
 * anything can overwrite them. This is a recovery bay, not a second save: it is
 * written once, never overwritten while occupied, and cleared only after a
 * successful recovery or an explicit player confirmation.
 *
 * The payload is stored as the exact original text (no wrapper envelope) so a
 * near-quota storage is not pushed over the edge by re-serialization, and so an
 * exported recovery file is byte-identical to what the player lost.
 */
export const RECOVERY_KEY = "rustwake.save.recovery.v1";

/** Duck-typed storage; `removeItem` may be absent on minimal test doubles. */
export interface RecoveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

/**
 * Player-visible recovery state exposed by the store. `preserved` is true when the
 * raw bytes live in `RECOVERY_KEY`; false when they are held in place in `SAVE_KEY`
 * because the copy could not be written (quota), in which case the store suppresses
 * `SAVE_KEY` writes so the original survives. `textLength` is the retained text's
 * length in UTF-16 code units (localStorage's native unit), not a byte count.
 */
export interface SaveRecoveryNotice {
  slotKey: string;
  reason: DecodeFailure;
  detail?: string;
  textLength: number;
  preserved: boolean;
}

/**
 * Outcome of a recovery retry. A failure changes nothing: the corrupt slot is kept
 * and the live yard is untouched. `storage` means the recovered yard could not be
 * durably written, so the slot was deliberately not cleared.
 *
 * G1 (#203): a success may carry `slotClearFailed: true` when the recovered yard
 * landed durably in SAVE_KEY but storage refused the slot clear. The write-once
 * slot is kept and the flag — not a re-raised notice — is the surface the UI
 * must consume (a decodable residual slot raises no notice); a partial success
 * is never reported as a silent full success.
 */
export type RecoveryResult =
  | { ok: true; tick: number; machines: number; slotClearFailed?: boolean }
  | {
      ok: false;
      reason: DecodeFailure | "read-only" | "no-slot" | "storage";
      detail?: string;
    };

/**
 * Write-once preservation outcome. `already` = the slot holds these exact bytes;
 * `occupied` = the slot holds a DIFFERENT earlier corruption (left untouched);
 * `empty` = nothing to retain; `failed` = the copy threw (caller must hold).
 */
export type PreserveOutcome = "preserved" | "already" | "occupied" | "empty" | "failed";

function safeGet(storage: RecoveryStorage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** The retained raw text, or null when the slot is absent/empty. */
export function readRecoverySlot(storage: RecoveryStorage): string | null {
  const raw = safeGet(storage, RECOVERY_KEY);
  return raw !== null && raw.length > 0 ? raw : null;
}

/**
 * Retain a corrupt payload write-once. Never overwrites an occupied slot: an
 * earlier unresolved corruption is itself player data and must survive until it
 * is recovered or explicitly discarded. Returns `failed` only when the copy
 * throws, which is the signal for the caller to hold `SAVE_KEY` in place.
 */
export function preserveCorruptSave(storage: RecoveryStorage, raw: string | null): PreserveOutcome {
  if (raw === null || raw.length === 0) return "empty";
  const existing = readRecoverySlot(storage);
  if (existing !== null) return existing === raw ? "already" : "occupied";
  try {
    storage.setItem(RECOVERY_KEY, raw);
    return "preserved";
  } catch {
    return "failed";
  }
}

/** Best-effort clear; returns false when storage refused. Never throws. */
export function clearRecoverySlot(storage: RecoveryStorage): boolean {
  try {
    if (typeof storage.removeItem === "function") {
      storage.removeItem(RECOVERY_KEY);
      return true;
    }
    // Minimal double without removeItem: an empty slot reads as resolved.
    storage.setItem(RECOVERY_KEY, "");
    return true;
  } catch {
    return false;
  }
}

/**
 * Derive a notice from raw text. Returns null for empty or decodable text, so a
 * healthy slot never raises a false alarm. `detail` carries the first violated
 * invariant for `invalid`, mirroring `decodeSave`.
 */
export function recoveryNoticeFor(raw: string | null, preserved: boolean): SaveRecoveryNotice | null {
  if (raw === null || raw.length === 0) return null;
  const decoded = decodeSave(raw);
  if (decoded.ok || decoded.reason === "empty") return null;
  const notice: SaveRecoveryNotice = {
    slotKey: RECOVERY_KEY,
    reason: decoded.reason,
    textLength: raw.length,
    preserved,
  };
  if (decoded.detail !== undefined) notice.detail = decoded.detail;
  return notice;
}
