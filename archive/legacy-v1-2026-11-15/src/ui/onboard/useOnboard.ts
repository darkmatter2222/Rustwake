/**
 * UI-RESET-64: the coach's skip/revisit preference. This is a UI-only preference kept in
 * its own localStorage key — it never touches the game save (`src/ui/save/*` and the
 * persistence layer are forbidden for this issue) and never mutates sim state. Skipping
 * hides the coach and survives a reload; revisit restores it. The lesson itself is always
 * derived from the authoritative state, so a progressed yard is never forced back through
 * beginner steps: "respect existing progress" is the derivation, this is just the mute.
 */
import { useCallback, useState } from "react";

const KEY = "rustwake.onboard.v1";

function readHidden(): boolean {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw === null || raw === undefined) return false;
    return JSON.parse(raw)?.hidden === true;
  } catch {
    return false;
  }
}

function writeHidden(hidden: boolean): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify({ hidden }));
  } catch {
    /* A blocked storage (private mode) just means the preference is session-only. */
  }
}

export interface OnboardPref {
  readonly hidden: boolean;
  readonly skip: () => void;
  readonly show: () => void;
}

export function useOnboard(): OnboardPref {
  const [hidden, setHidden] = useState<boolean>(readHidden);
  const skip = useCallback(() => {
    setHidden(true);
    writeHidden(true);
  }, []);
  const show = useCallback(() => {
    setHidden(false);
    writeHidden(false);
  }, []);
  return { hidden, skip, show };
}