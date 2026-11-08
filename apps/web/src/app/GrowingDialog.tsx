/**
 * A modal dialog that grows out of the control that opened it and folds back into it (ADR 0084):
 * New space out of the gold +, Add harness out of its button. It grows in a fifth of a second
 * (`--motion-base`) with no overshoot, as the phone's window pours out of its +, and folds away on
 * `--motion-base` too (`dialogMotion.ts`, ADR 0274).
 *
 * Every way out folds it away: Escape, the × its owner draws, or a click outside it. Add harness
 * was a panel in the page that closed only with the Cancel at its foot, and once the token showed,
 * only with a Done under the curl lines, which was hard to get out of (28 September 2026).
 *
 * A modal `<dialog>`, so the keyboard stays in it. Its owner says when it is leaving (its × or a
 * send), and hears when it has gone: the fade out has ended, or a moment has passed in which it
 * would have, should a tab in the background never draw it.
 *
 * Inside a section's columns it is no dialog at all (ADR 0284; Arjun, 3 November 2026: "minimise
 * popups in ipad, mac and web"): it stands in the third column, beside what opened it, as the
 * iPad's sheets from a card stand in its third column. Its owner's × and Escape close the column,
 * and it is gone once the column has closed over it. One that is a question about someone else
 * stays one (`stays`).
 *
 * One opened from a row of the list stands in the second column instead (`inPlace`, ADR 0284's
 * addendum: Arjun, 7 November 2026, "this 'connect a harness' can also make use of right section
 * instead of popup"): a page where a row's page would stand, which the column turns in and out.
 */

import { type CSSProperties, type ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { PANE_MS, type ThirdHost, useThird } from "./Columns.tsx";
import { boxOf, growFrom } from "./dialogMotion.ts";
import { reduceMotion } from "./viewer/open.ts";

/** Longer than the fold: a dialog whose fold never ends, in a tab in the background, still goes. */
const GONE_MS = 400;

type GrowingDialogProps = {
  /** The control that opened it, which it grows out of; without one it grows from its middle. */
  readonly from: HTMLElement | null | undefined;
  /** The id of its heading, which names it. */
  readonly labelledBy: string;
  readonly className: string;
  readonly testId: string;
  /** What has the keyboard when it opens: the words it is for, not the first button in it. */
  readonly focus: string;
  /** Folding away, as its owner says. */
  readonly leaving: boolean;
  /** Escape or a click outside: its owner decides whether it may go now. */
  readonly onLeave: () => void;
  /** Gone, the fold finished. */
  readonly onGone: () => void;
  /** Where it stands, for one that is not in the middle of the window: the room sheet's. */
  readonly style?: CSSProperties | undefined;
  /** A dialog wherever it is opened: a yes or no about somebody else (ADR 0284). */
  readonly stays?: boolean | undefined;
  /** A page where it is drawn, in the second column: what a row of the list opened. */
  readonly inPlace?: boolean | undefined;
  readonly children: ReactNode;
};

export function GrowingDialog(props: GrowingDialogProps) {
  const third = useThird();
  if (props.inPlace === true) return <InPlace {...props} />;
  if (third !== undefined && props.stays !== true) return <Docked {...props} host={third} />;
  return <Modal {...props} />;
}

/**
 * A page where it is drawn (ADR 0284's addendum): no card, no dim, nothing to click outside of. The
 * column it stands in turns it in and out, so it is gone the moment its owner lets it go; Escape
 * inside it is its way out, as its owner's × is.
 */
function InPlace(props: GrowingDialogProps) {
  const box = useRef<HTMLElement>(null);
  const gone = useRef(props.onGone);
  gone.current = props.onGone;
  const focus = useRef(props.focus);

  useEffect(() => {
    box.current?.querySelector<HTMLElement>(focus.current)?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (props.leaving) gone.current();
  }, [props.leaving]);

  return (
    <section
      ref={box}
      className={`grow-dialog ${props.className}`}
      aria-labelledby={props.labelledBy}
      data-testid={props.testId}
      data-in-place="true"
      data-leaving={props.leaving ? "true" : undefined}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        event.preventDefault();
        props.onLeave();
      }}
    >
      {props.children}
    </section>
  );
}

function Modal(props: GrowingDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  // A press that began inside and let go outside is a selection, not a click outside.
  const pressedOutside = useRef(false);
  const gone = useRef(props.onGone);
  gone.current = props.onGone;
  // Where it grew from and what to focus are the opening's, not any later render's.
  const opening = useRef({ from: props.from, focus: props.focus });

  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;
    if (!element.open) element.showModal();
    growFrom(element, boxOf(opening.current.from));
    element.querySelector<HTMLElement>(opening.current.focus)?.focus();
    return () => element.close();
  }, []);

  useEffect(() => {
    if (!props.leaving) return;
    // With Reduce Motion there is no fold to wait for: it goes at once.
    const timer = setTimeout(() => gone.current(), reduceMotion() ? 0 : GONE_MS);
    return () => clearTimeout(timer);
  }, [props.leaving]);

  return createPortal(
    // biome-ignore lint/a11y/useKeyWithClickEvents: a click on the dim is a pointer's way out; the keyboard's is Escape, the dialog's cancel, and the × is in the tab order.
    <dialog
      ref={dialog}
      className={`grow-dialog ${props.className}`}
      aria-labelledby={props.labelledBy}
      data-testid={props.testId}
      data-leaving={props.leaving ? "true" : undefined}
      style={props.style}
      onCancel={(event) => {
        // Escape: folded away, not snapped shut.
        event.preventDefault();
        props.onLeave();
      }}
      onPointerDown={(event) => {
        // The dialog's own box is the dim around the card; a press on the card is on its child.
        pressedOutside.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (pressedOutside.current && event.target === event.currentTarget) props.onLeave();
      }}
      onAnimationEnd={(event) => {
        if (props.leaving && event.target === event.currentTarget) gone.current();
      }}
    >
      {props.children}
    </dialog>,
    document.body,
  );
}

/**
 * In the third column (ADR 0284): where the section's columns draw it, holding the column open
 * while it is wanted, and gone once the column has closed over it.
 */
function Docked(props: GrowingDialogProps & { readonly host: ThirdHost }) {
  const { host, leaving } = props;
  const box = useRef<HTMLElement>(null);
  const gone = useRef(props.onGone);
  gone.current = props.onGone;
  const leave = useRef(props.onLeave);
  leave.current = props.onLeave;
  const focus = useRef(props.focus);

  // Its place in the column, held until it is leaving; the column closes as it lets go.
  useEffect(() => {
    if (leaving) return;
    return host.take(() => leave.current());
  }, [host.take, leaving]);

  // The words it is for have the keyboard, as the dialog's would, once it has somewhere to stand.
  const placed = host.slot !== null;
  useEffect(() => {
    if (!placed) return;
    box.current?.querySelector<HTMLElement>(focus.current)?.focus({ preventScroll: true });
  }, [placed]);

  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => gone.current(), reduceMotion() ? 0 : PANE_MS + 40);
    return () => clearTimeout(timer);
  }, [leaving]);

  if (host.slot === null) return null;
  return createPortal(
    <section
      ref={box}
      role="dialog"
      aria-modal="false"
      className={`grow-dialog ${props.className}`}
      aria-labelledby={props.labelledBy}
      data-testid={props.testId}
      data-docked="true"
      data-leaving={leaving ? "true" : undefined}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        event.preventDefault();
        props.onLeave();
      }}
    >
      {props.children}
    </section>,
    host.slot,
  );
}
