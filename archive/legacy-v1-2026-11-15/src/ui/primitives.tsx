import type { ReactNode } from "react";
import {
  FACE_STATES,
  NAV_SLOTS,
  GEOMETRY,
  chipBandHeight,
  faceSentence,
  faceTransition,
  printAmount,
  printPrice,
  sheetHeightFor,
  type BandKey,
  type FaceState,
  type NavSlot,
} from "./tokens";
import "./primitives.css";

/**
 * UI-RESET/TOKENS (#48): the shared primitives, painted from `tokens.ts` only.
 *
 * Every primitive carries its state in a `data-*` attribute rather than in a colour, so a
 * state is readable by a 1-bit screen, by a screen reader and by the harness probe, and so
 * `prefers-reduced-motion` changes nothing but the transition string. The seven states of the
 * acceptance are painted by `[data-state]` rules, one per state, plus the real pseudo-class
 * rules for interactive use; `src/ui/primitives.css` holds both.
 */

/** `ok` and `short` are the two non-colour affordance classes (dashed vs solid edge). */
export type Afford = "ok" | "short" | "none";

export interface FaceProps {
  label: string;
  /** the printed price or gain, already formatted by `printPrice` / `printAmount`. */
  price?: string;
  /** the second line a locked or short face prints instead of a third format (C8). */
  reason?: string;
  state?: FaceState;
  afford?: Afford;
  /** the single accented face of the frame; at the fork, only the cheapest gets it (P2). */
  primary?: boolean;
  id?: string;
  /** the accessible name, when the painted text is shorter than the name (glyph faces). */
  ariaLabel?: string;
  onClick?: () => void;
}

/**
 * The one button of the interface: 46 px tall, 44 px minimum target, label and price as two
 * children with the 4 px gap (C6), state in `data-state`, affordability in `data-afford`.
 */
export function Face(props: FaceProps) {
  const state: FaceState = props.state ?? "normal";
  const disabled = state === "disabled" || state === "error";
  return (
    <button
      type="button"
      id={props.id}
      className={`wk-face${props.primary ? " wk-face--primary" : ""}`}
      data-state={state}
      data-afford={props.afford ?? "none"}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      aria-busy={state === "loading" || undefined}
      aria-label={props.ariaLabel ?? props.label}
      onClick={props.onClick}
    >
      <span className="wk-face__label">{props.label}</span>
      {props.price ? <span className="wk-face__price wk-data">{props.price}</span> : null}
      {props.reason ? <span className="wk-face__reason">{props.reason}</span> : null}
    </button>
  );
}

export interface NavFaceProps {
  slot: NavSlot;
  /** the painted glyph or letterform; the accessible name stays the long form. */
  glyph: string;
  active?: boolean;
  /** a locked slot keeps its place in the row and prints its reason (R-2). */
  locked?: boolean;
  reason?: string;
  state?: FaceState;
  onPress: (slot: NavSlot) => void;
}

/** One of the five fixed destinations. Never renumbered, never re-labelled, never removed. */
export function NavFace(props: NavFaceProps) {
  const state: FaceState = props.state ?? (props.locked ? "disabled" : props.active ? "pressed" : "normal");
  return (
    <button
      type="button"
      id={`nav-${props.slot}`}
      className="wk-nav__face"
      data-state={state}
      data-slot={props.slot}
      aria-current={props.active ? "page" : undefined}
      disabled={state === "disabled"}
      aria-disabled={state === "disabled" || undefined}
      aria-label={props.slot}
      onClick={() => props.onPress(props.slot)}
    >
      <span className="wk-nav__glyph" aria-hidden="true">
        {props.glyph}
      </span>
      <span className="wk-nav__label">{props.slot}</span>
      {props.reason ? <span className="wk-nav__reason">{props.reason}</span> : null}
    </button>
  );
}

/** The five slots in the one fixed order, at the measured 46 px row height. */
export function NavRow(props: {
  active: NavSlot | null;
  locked?: Partial<Record<NavSlot, string>>;
  onPress: (slot: NavSlot) => void;
  state?: FaceState;
}) {
  return (
    <nav className="wk-nav" aria-label="Yard" data-state={props.state ?? "normal"}>
      {NAV_SLOTS.map((slot) => (
        <NavFace
          key={slot}
          slot={slot}
          glyph={slot.slice(0, 1).toUpperCase()}
          active={props.active === slot}
          locked={props.locked?.[slot] !== undefined}
          reason={props.locked?.[slot]}
          state={props.state}
          onPress={props.onPress}
        />
      ))}
    </nav>
  );
}

export interface SheetProps {
  /** the `role=dialog` title; also the `aria-labelledby` target (E5). */
  title: string;
  band: BandKey;
  /** store and research keep their own measured heights (P3). */
  kind?: "store" | "research";
  onClose?: () => void;
  children?: ReactNode;
}

/**
 * The bottom sheet (portrait, landscape) - `role=dialog`, focused on open, one close face,
 * a fixed measured height so opening it never moves the world band.
 */
export function Sheet(props: SheetProps) {
  const height = sheetHeightFor(props.band, props.kind ?? "store");
  return (
    <section
      className="wk-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`wk-sheet-title-${props.band}`}
      tabIndex={-1}
      data-state="normal"
      data-band={props.band}
      style={{ height }}
    >
      <header className="wk-sheet__head">
        <h2 className="wk-sheet__title" id={`wk-sheet-title-${props.band}`}>
          {props.title}
        </h2>
        <Face label="Close" onClick={props.onClose} />
      </header>
      <div className="wk-sheet__body">{props.children}</div>
    </section>
  );
}

/** The top layer: the inner page or the return report, above every sheet. */
export function Dialog(props: { title: string; onClose?: () => void; children?: ReactNode }) {
  return (
    <section
      className="wk-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wk-dialog-title"
      tabIndex={-1}
      data-state="normal"
    >
      <h2 className="wk-dialog__title" id="wk-dialog-title">
        {props.title}
      </h2>
      <div className="wk-dialog__body">{props.children}</div>
      <footer className="wk-dialog__foot">
        <Face label="Back" onClick={props.onClose} />
      </footer>
    </section>
  );
}

export interface InspectorSectionProps {
  heading: string;
  /** the one number the section leads with, in the data face (tabular). */
  value?: string;
  /** a short state word, printed rather than coloured (satisfied / open / locked). */
  status?: string;
  rows?: { term: string; value: string }[];
  faces?: ReactNode;
  state?: FaceState;
}

/** One block of the inspector or of a sheet: heading, one leading number, definition rows. */
export function InspectorSection(props: InspectorSectionProps) {
  const state: FaceState = props.state ?? "normal";
  return (
    <section className="wk-inspector__section" data-state={state} aria-label={props.heading}>
      <h3 className="wk-inspector__heading">{props.heading}</h3>
      {props.value ? <span className="wk-inspector__value wk-data">{props.value}</span> : null}
      {props.status ? <span className="wk-inspector__status">{props.status}</span> : null}
      {props.rows && props.rows.length > 0 ? (
        <dl className="wk-inspector__rows">
          {props.rows.map((row) => (
            <div className="wk-inspector__row" key={row.term}>
              <dt>{row.term}</dt>
              <dd className="wk-data">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {props.faces ? <div className="wk-inspector__faces">{props.faces}</div> : null}
    </section>
  );
}

export interface ResourceAmountProps {
  label: string;
  value: number;
  /** the unit word, always printed (C2). */
  unit: string;
  /** a gain prints `+`, a cost no sign (C3). */
  signed?: boolean;
  /** the 6 px authored square that ties the row to the world's palette. */
  dot?: string;
  /** the shortfall a short row prints under its own amount (C8). */
  reason?: string;
  state?: FaceState;
}

/** `Scrap 10`, `+70 credits`, `810 Data`: one space before the unit, tabular figures. */
export function ResourceAmount(props: ResourceAmountProps) {
  const state: FaceState = props.state ?? "normal";
  return (
    <span className="wk-amount" data-state={state}>
      {props.dot ? <span className="wk-amount__dot" style={{ background: props.dot }} aria-hidden="true" /> : null}
      <span className="wk-amount__label">{props.label}</span>
      <span className="wk-amount__value wk-data">
        {printAmount(props.value, props.unit, props.signed ?? false)}
      </span>
      {props.reason ? <span className="wk-amount__reason">{props.reason}</span> : null}
    </span>
  );
}

export interface HelpProps {
  id: string;
  /** the printed line; a tooltip is never the only carrier of the information. */
  text: string;
  state?: FaceState;
}

/** Help text: an always-painted line, tied to its face by `aria-describedby`. */
export function HelpTip(props: HelpProps) {
  return (
    <span className="wk-help" id={props.id} data-state={props.state ?? "normal"}>
      {props.text}
    </span>
  );
}

/** The feedback lane: one status line in its own band above the primary row (C5, E-8). */
export function ToastLane(props: { text: string; state?: FaceState }) {
  const state: FaceState = props.state ?? "normal";
  return (
    <div className="wk-toast-lane" data-state={state}>
      <p className="wk-toast" role="status">
        {props.text}
      </p>
    </div>
  );
}

/** The one price string the whole UI prints, kept next to the primitives that use it. */
export { printPrice, faceSentence, chipBandHeight };

/* ------------------------------------------------------------------------- gallery ---- */

const STATES: readonly FaceState[] = FACE_STATES;

/**
 * Every primitive in every state, in the measured band boxes. Mounted by the shipped shell
 * at `?ui48` so the captures and the unit tests read the same painted nodes as the game.
 */
export function Primitives48(props: { band?: BandKey } = {}) {
  const band: BandKey = props.band ?? "390x844";
  return (
    <div className="wk-gallery" data-band={band}>
      <section className="wk-gallery__block" aria-label="faces">
        <h2 className="wk-gallery__heading">Face - the seven states</h2>
        {STATES.map((state) => (
          <Face
            key={state}
            label="Upgrade"
            price={printPrice(222)}
            state={state}
            afford={state === "normal" ? "ok" : "none"}
            primary={state === "normal"}
          />
        ))}
        <Face label="Upgrade" price={printPrice(222)} state="normal" afford="short" reason="Needs 222 credits · have 0" />
        <Face label="Sell 35 Ferrous" price={printAmount(70, "credits", true)} state="normal" afford="ok" />
      </section>

      <section className="wk-gallery__block" aria-label="navigation">
        <h2 className="wk-gallery__heading">Navigation row - five fixed slots</h2>
        <NavRow active="store" locked={{ research: "Needs data" }} onPress={() => undefined} />
        <NavRow active={null} state="disabled" onPress={() => undefined} />
      </section>

      <section className="wk-gallery__block" aria-label="sheet">
        <h2 className="wk-gallery__heading">Sheet and dialog</h2>
        <Sheet title="Yard store" band={band} kind="store">
          <ResourceAmount label="Scrap" value={10} unit="scrap" dot="#c9713a" />
          <InspectorSection
            heading="Capacity"
            value="900 / 900"
            status="settled"
            rows={[
              { term: "Ferrous", value: "54 units" },
              { term: "Nonferrous", value: "239 units" },
            ]}
            faces={<Face label="Sell 35 Ferrous" price={printAmount(70, "credits", true)} afford="ok" />}
          />
        </Sheet>
        <Sheet title="Research" band={band} kind="research">
          <InspectorSection heading="Smart Buffers" value="8 Data" status="open" state="loading" />
          <InspectorSection heading="Efficient Cutters" value="4 Data" status="locked" state="disabled" />
        </Sheet>
        <Dialog title="While you were away">
          <ResourceAmount label="Credits" value={82} unit="credits" />
          <ResourceAmount label="Batch" value={1.74} unit="s" reason="Blocked by power" state="error" />
        </Dialog>
      </section>

      <section className="wk-gallery__block" aria-label="feedback">
        <h2 className="wk-gallery__heading">Feedback and help</h2>
        <HelpTip id="wk-help-capacity" text="The store holds 900 units; overflow is lost." />
        <HelpTip id="wk-help-short" text="Needs 222 credits · have 0" state="error" />
        <ToastLane text="Cutting pulse recharging" />
        <ToastLane text="Not a Rustwake file" state="error" />
      </section>
    </div>
  );
}

/** The reduced-motion branch, as the CSS media block declares it, for the probe to compare. */
export function transitionFor(reducedMotion: boolean): string {
  return faceTransition(reducedMotion);
}

/** The measured geometry, exposed for the harness and the tests. */
export const MEASURED = {
  touchMinPx: GEOMETRY.touchMinPx,
  faceHeightPx: GEOMETRY.faceHeightPx,
  railWidthPx: GEOMETRY.railWidthPx,
  inspectorWidthPx: GEOMETRY.inspectorWidthPx,
  frameCapPx: GEOMETRY.frameCapPx,
} as const;
