/**
 * UI-RESET-64: the contextual onboarding coach. It paints inside `.hud__lead`, after the
 * objective card, so the camera's chrome insets reserve its band and the world is never
 * obscured (the same grammar the placement strips use). It is deliberately NOT a `.panel`
 * and NOT a `.dock`, and it uses none of the census classes (`.objective`, `.status-line`,
 * `.dock__btn`, `.resources__item`), so the resting-screen line/tier census, the dock face
 * census and the overlay-stack census are all untouched.
 *
 * It teaches the seven topics (salvage, build, connect, storage, trade, upgrades, research)
 * through the authoritative `state.tutorial` machine and the shared yard ladder: the goal
 * sentence is the objective card's own, and the coach adds the topic, the "why", a reachable
 * "next", and an expandable detail carrying the shared vocabulary. Skip hides it (persisted
 * UI preference); Show revisits it. A progressed yard is led by its current state, never
 * forced back through beginner steps.
 *
 * The place-mode earn trap (issue #41) gets a reachable recovery here: while a build is
 * aimed but unaffordable, one tap salvages scrap or opens the Store, instead of repeat
 * refusals. The fresh-yard finding (6821970539) is answered by the research-path lesson,
 * which guides the player to earn first Data — the `showResearch` gate is never weakened.
 */
import type { SimState } from "../../game/simulation/types";
import { placementCheck, shortfallLine } from "../place/flow";
import { ONBOARD_COPY } from "./copy";
import { lessonFor } from "./lessons";
import { useOnboard } from "./useOnboard";
import "./onboard.css";

export function OnboardCoach(props: {
  readonly state: SimState;
  readonly buildBlueprint: string | null;
  readonly ghostTile: number | null;
  readonly reader: boolean;
  readonly onSalvage: () => void;
  readonly onStore: () => void;
}) {
  const pref = useOnboard();
  // Reader mode follows another tab; coaching would be noise, so the coach yields entirely.
  if (props.reader) return null;

  const lesson = lessonFor(props.state);

  // Reachable recovery from the place-mode earn trap: only while a build is aimed and the
  // store cannot cover its price. The numbers are the engine's own (placementCheck mirror).
  const check =
    props.buildBlueprint !== null
      ? placementCheck(props.state, props.buildBlueprint, props.ghostTile)
      : null;
  const shortfall = check?.shortfall ?? null;

  if (pref.hidden) {
    return (
      <div className="onboard onboard--hidden" data-onboard="hidden">
        <button
          type="button"
          className="icon-btn onboard__btn"
          aria-label={ONBOARD_COPY.showAria}
          onClick={pref.show}
        >
          {ONBOARD_COPY.show}
        </button>
      </div>
    );
  }

  return (
    <section
      className="onboard"
      aria-label={ONBOARD_COPY.regionLabel}
      data-onboard="lesson"
      data-topic={lesson.topic}
      data-research-path={lesson.researchPath ? "true" : "false"}
      data-lesson={lesson.id}
    >
      <div className="onboard__head">
        <span className="onboard__badge">
          {ONBOARD_COPY.badgePrefix} · {lesson.title}
        </span>
        <button
          type="button"
          className="icon-btn onboard__btn onboard__skip"
          aria-label={ONBOARD_COPY.skipAria}
          onClick={pref.skip}
        >
          {ONBOARD_COPY.skip}
        </button>
      </div>
      <p className="onboard__what">{lesson.what}</p>
      <p className="onboard__why">
        <span className="onboard__label">{ONBOARD_COPY.whyLabel}:</span> {lesson.why}
      </p>
      <p className="onboard__next">
        <span className="onboard__label">{ONBOARD_COPY.nextLabel}:</span> {lesson.next}
      </p>
      <details className="onboard__detail">
        <summary className="onboard__summary">{ONBOARD_COPY.detailSummary}</summary>
        <p className="onboard__detail-body">{lesson.detail}</p>
      </details>
      {shortfall !== null ? (
        <div className="onboard__recover" data-onboard="recover">
          <p className="onboard__recover-title">{ONBOARD_COPY.earnTitle}</p>
          <p className="onboard__recover-short">{shortfallLine(shortfall)}</p>
          <p className="onboard__recover-hint">{ONBOARD_COPY.earnHint}</p>
          <div className="onboard__actions">
            <button
              type="button"
              className="icon-btn onboard__btn onboard__earn"
              aria-label={ONBOARD_COPY.earnSalvageAria}
              onClick={props.onSalvage}
            >
              {ONBOARD_COPY.earnSalvage}
            </button>
            <button
              type="button"
              className="icon-btn onboard__btn"
              aria-label={ONBOARD_COPY.earnStoreAria}
              onClick={props.onStore}
            >
              {ONBOARD_COPY.earnStore}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}