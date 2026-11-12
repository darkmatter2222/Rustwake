import { useCallback, useEffect, useState } from "react";
import type { SaveSettings } from "../../game/persistence/save";
import { t } from "../../game/content/strings";
import { RESET_COPY, SETTINGS_COPY } from "../home/copy";
import { Row } from "./shared";

/**
 * UI-RESET-62: the persisted settings surface, reachable before start (from the
 * title screen) and after start (Menu → Settings). Every row prints the ACTUAL
 * current value from the store's settings — never a default stand-in — and each
 * control writes straight back through the store, so the same panel works before
 * the yard runs, after it runs, and across a reload.
 *
 * Display is feature-detected: browsers without the Fullscreen API get a plain
 * note instead of a dead button, and a refused request keeps the windowed state
 * with a readable reason. Reduced motion shows the effective value: when the OS
 * already requests it, the toggle is disabled with a note rather than pretending
 * the saved preference is in charge.
 */
export function SettingsPanel(props: {
  settings: SaveSettings;
  osReducedMotion: boolean;
  onToggleMute: () => void;
  onCycleText: () => void;
  onToggleReducedMotion: () => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [fullscreenSupported] = useState<boolean>(
    () => typeof document !== "undefined" && document.fullscreenEnabled === true
  );
  // `!= null` on purpose: browsers without the Fullscreen API leave the property
  // undefined, and that must read as windowed, not fullscreen.
  const [isFullscreen, setIsFullscreen] = useState<boolean>(
    () => typeof document !== "undefined" && document.fullscreenElement != null
  );
  const [displayNote, setDisplayNote] = useState<string | null>(
    fullscreenSupported ? null : SETTINGS_COPY.displayUnsupported
  );

  useEffect(() => {
    if (!fullscreenSupported || typeof document === "undefined") return;
    const onChange = () => {
      setIsFullscreen(document.fullscreenElement != null);
      setDisplayNote(null);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [fullscreenSupported]);

  const toggleFullscreen = useCallback(() => {
    if (!fullscreenSupported || typeof document === "undefined") return;
    const action = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
    Promise.resolve(action).catch(() => {
      setDisplayNote(SETTINGS_COPY.displayDenied);
      setIsFullscreen(document.fullscreenElement != null);
    });
  }, [fullscreenSupported]);

  const motionEffective = props.settings.reducedMotion || props.osReducedMotion;

  return (
    <div className="panel panel--stack panel--settings" role="group" aria-label={SETTINGS_COPY.title}>
      <div className="panel__head">
        <h2 className="panel__title">{SETTINGS_COPY.title}</h2>
        <button className="icon-btn" aria-label={SETTINGS_COPY.closeAria} onClick={props.onClose}>
          {t("btn.close")}
        </button>
      </div>
      <div className="panel__body">
        <dl>
          <Row
            label={SETTINGS_COPY.sound}
            value={props.settings.muted ? SETTINGS_COPY.soundOff : SETTINGS_COPY.soundOn}
          >
            <button
              className="icon-btn"
              aria-label={props.settings.muted ? t("sound.on") : t("sound.off")}
              aria-pressed={props.settings.muted}
              onClick={props.onToggleMute}
            >
              {props.settings.muted ? t("btn.soundAudible") : t("btn.soundMuted")}
            </button>
          </Row>
          <Row label={SETTINGS_COPY.textSize} value={props.settings.textScale}>
            <button
              className="icon-btn"
              aria-label={SETTINGS_COPY.textCycleAria}
              onClick={props.onCycleText}
            >
              {SETTINGS_COPY.textCycle}
            </button>
          </Row>
          <Row
            label={SETTINGS_COPY.reducedMotion}
            value={motionEffective ? SETTINGS_COPY.motionOn : SETTINGS_COPY.motionOff}
          >
            <button
              className="icon-btn"
              aria-label={SETTINGS_COPY.motionToggleAria}
              aria-pressed={motionEffective}
              disabled={props.osReducedMotion}
              onClick={props.onToggleReducedMotion}
            >
              {motionEffective ? SETTINGS_COPY.motionOn : SETTINGS_COPY.motionOff}
            </button>
          </Row>
          <Row
            label={SETTINGS_COPY.display}
            value={isFullscreen ? SETTINGS_COPY.displayFullscreen : SETTINGS_COPY.displayWindowed}
          >
            <button
              className="icon-btn"
              disabled={!fullscreenSupported}
              onClick={toggleFullscreen}
            >
              {isFullscreen ? SETTINGS_COPY.displayExit : SETTINGS_COPY.displayEnter}
            </button>
          </Row>
        </dl>
        {props.osReducedMotion ? (
          <p className="status-line" role="note">
            {SETTINGS_COPY.motionOsNote}
          </p>
        ) : null}
        {displayNote ? (
          <p className="status-line" role="note">
            {displayNote}
          </p>
        ) : null}
        <div className="panel__actions">
          <button className="icon-btn panel__danger" onClick={props.onReset}>
            {SETTINGS_COPY.reset}
          </button>
        </div>
        <p className="status-line">{RESET_COPY.menuHint}</p>
      </div>
    </div>
  );
}