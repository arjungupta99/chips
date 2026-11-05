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
 */

import { type CSSProperties, type ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { boxOf, growFrom } from "./dialogMotion.ts";
import { reduceMotion } from "./viewer/open.ts";

/** Longer than the fold: a dialog whose fold never ends, in a tab in the background, still goes. */
const GONE_MS = 400;

export function GrowingDialog(props: {
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
  readonly children: ReactNode;
}) {
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
