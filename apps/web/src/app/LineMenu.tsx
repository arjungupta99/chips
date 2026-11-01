/**
 * What a reader may do to a line (M3.4, M5.4), on the right button rather than under every
 * bubble: Reply (ADR 0219), Not right? (ADR 0200, in place of the thumbs and a note about what
 * went wrong), a pin, an edit, a deletion for the reader alone or for everyone (ADR 0167) — the
 * second asked about first, in core's words, as on the phone.
 *
 * It used to be two bars standing open under every message in the room — four controls each,
 * on lines nobody was ever going to react to. A room read like a form. The actions are the
 * same and the door is the same; what changed is that a message has to be asked before it
 * offers them. Right-click is the ask, and the `⋯` beside the name is the same menu for a
 * hand that cannot right-click and for a keyboard, which reaches it by tabbing to the row.
 *
 * The menu is drawn into `document.body` rather than beside the bubble it is about. A menu at a
 * pointer is placed against the window, and a row lives deep inside a scroller: anywhere in that
 * ancestry a `transform`, a `contain` or a `container-type` quietly redefines what the window
 * means for a fixed child, and the menu opens a screen away from the click. Measured doing
 * exactly that in a browser while the jsdom tests were green. The body has no ancestors to be
 * surprised by.
 */

import type { Asking, Line } from "@chipschat/core";
import { DELETE_FOR_EVERYONE, DELETE_FOR_ME, mayReply } from "@chipschat/core";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { OnFeedback } from "./Feedback.tsx";
import type { LineHandlers, LineMay } from "./LineActions.tsx";

/** Where the menu was asked for, in the viewport's own coordinates. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface LineMenuProps {
  readonly at: Point;
  readonly spaceId: string;
  readonly line: Line;
  readonly may: LineMay;
  readonly pinned: boolean;
  readonly busy: boolean;
  readonly on: LineHandlers;
  /** What is asked before a deletion for everyone (core's `deleteForEveryoneAsking`). */
  readonly asking: Asking;
  /**
   * The row breaks the line into dust and then deletes it (ADR 0167); the menu only says which
   * deletion the reader chose.
   */
  readonly onDelete: (deletion: "me" | "everyone") => void;
  /** Not right?, when this line takes feedback — only a harness's does. */
  readonly onFeedback?: OnFeedback | undefined;
  /** Reply, first, where the line can be replied to and the room takes replies (ADR 0219). */
  readonly onReply?: (() => void) | undefined;
  /** The row draws the forms; the menu only says the reader asked for one. */
  readonly onEdit: () => void;
  readonly onNote: () => void;
  readonly onClose: () => void;
}

/** One line of the menu. Built as data so the arrow keys have something to walk. */
interface Item {
  readonly key: string;
  readonly label: string;
  /** What it does, under it, where that is not plain from the label. */
  readonly hint?: string;
  readonly danger?: boolean;
  readonly run: () => void;
}

/**
 * Whether a line offers anything at all, so a row knows before it opens an empty menu. `replies`
 * is whether the room takes replies, which a line can then be given (ADR 0219).
 */
export function hasMenu(may: LineMay, line: Line, feedback: boolean, replies = false): boolean {
  return (replies && mayReply(line)) || feedback || may.pin || may.edit || may.remove || may.hide;
}

export function LineMenu(props: LineMenuProps) {
  const { onClose } = props;
  const id = useId();
  const [confirming, setConfirming] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const at = useClamped(menu, props.at);

  useDismiss(menu, onClose);

  const act = (run: () => void) => () => {
    run();
    onClose();
  };
  const { asking } = props;
  const items: Item[] = confirming
    ? [
        {
          key: "yes",
          label: asking.confirm,
          danger: true,
          run: act(() => props.onDelete("everyone")),
        },
        { key: "keep", label: "Cancel", run: () => setConfirming(false) },
      ]
    : ordinary(props, act, () => setConfirming(true));

  return createPortal(
    <div
      ref={menu}
      className="line-menu"
      data-testid="line-menu"
      role="menu"
      aria-label="What to do with this message"
      data-asking={confirming ? "true" : undefined}
      style={{ left: `${at.x}px`, top: `${at.y}px` }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
        walk(event);
      }}
    >
      {confirming && (
        <div className="line-menu-ask" data-testid="line-menu-asking">
          <b>{asking.title}</b>
          <p>{asking.body}</p>
          {asking.note !== undefined && <p className="line-menu-note">{asking.note}</p>}
        </div>
      )}
      {items.map((item, index) => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          className="line-menu-item"
          data-danger={item.danger === true ? "true" : undefined}
          disabled={props.busy}
          ref={index === 0 ? focusFirst : undefined}
          onClick={item.run}
          // Named by its label alone; what it does is said as its description.
          aria-label={item.hint === undefined ? undefined : item.label}
          aria-describedby={item.hint === undefined ? undefined : `${id}-${item.key}`}
        >
          <span className="line-menu-label">{item.label}</span>
          {item.hint !== undefined && (
            <span className="line-menu-hint" id={`${id}-${item.key}`}>
              {item.hint}
            </span>
          )}
        </button>
      ))}
    </div>,
    document.body,
  );
}

/** Everything but the confirmation, in the order a hand reaches for them. */
function ordinary(
  props: LineMenuProps,
  act: (run: () => void) => () => void,
  remove: () => void,
): Item[] {
  const { line, may, spaceId, on } = props;
  const items: Item[] = [];
  // First, as on the phone's capsule: the thing a hand reaches for most (ADR 0219).
  if (props.onReply !== undefined)
    items.push({ key: "reply", label: "Reply", run: act(props.onReply) });
  if (props.onFeedback !== undefined) {
    items.push({ key: "note", label: "Not right?", run: act(props.onNote) });
  }
  if (may.pin) {
    const unpin = props.pinned;
    items.push({
      key: "pin",
      label: unpin ? "Unpin from the top" : "Pin to the top",
      run: act(() => (unpin ? on.unpin(spaceId, line) : on.pin(spaceId, line))),
    });
  }
  if (may.edit) items.push({ key: "edit", label: "Edit", run: act(props.onEdit) });
  if (may.hide) {
    items.push({
      key: "delete-for-me",
      ...DELETE_FOR_ME,
      danger: true,
      run: act(() => props.onDelete("me")),
    });
  }
  if (may.remove) {
    items.push({ key: "delete", ...DELETE_FOR_EVERYONE, danger: true, run: remove });
  }
  return items;
}

/**
 * The same menu for a hand that cannot right-click, and the only way to it from a keyboard.
 * It opens under itself rather than at a pointer that was never there.
 */
export function More({ open }: { readonly open: (at: Point) => void }) {
  return (
    <button
      type="button"
      className="msg-more"
      data-testid="line-more"
      aria-haspopup="menu"
      aria-label="What to do with this message"
      onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        open({ x: box.left, y: box.bottom + 4 });
      }}
    >
      ⋯
    </button>
  );
}

/**
 * The first item takes the focus, so a menu opened from the keyboard is usable from it.
 *
 * `preventScroll`: the browser scrolls a newly focused element into view, and a fixed menu is
 * already where it belongs.
 */
function focusFirst(element: HTMLButtonElement | null): void {
  element?.focus({ preventScroll: true });
}

/** Up and down walk the items; a menu is not a paragraph and Tab is not how one is read. */
function walk(event: React.KeyboardEvent<HTMLDivElement>): void {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  const buttons = [
    ...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
  ];
  const here = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const step = event.key === "ArrowDown" ? 1 : -1;
  const next = buttons[(here + step + buttons.length) % buttons.length];
  next?.focus();
}

/**
 * A menu opened at the pointer near the right edge or the bottom of the window would hang off
 * it, so it is measured once it is drawn and pulled back inside.
 */
function useClamped(menu: React.RefObject<HTMLDivElement | null>, at: Point): Point {
  const [where, setWhere] = useState(at);
  useLayoutEffect(() => {
    const box = menu.current?.getBoundingClientRect();
    if (box === undefined) return;
    const margin = 8;
    setWhere({
      x: Math.max(margin, Math.min(at.x, window.innerWidth - box.width - margin)),
      y: Math.max(margin, Math.min(at.y, window.innerHeight - box.height - margin)),
    });
  }, [menu, at]);
  return where;
}

/**
 * A click elsewhere, the reader scrolling, or a resize all mean the same thing: not this message.
 *
 * The reader's scrolling is a wheel or a finger dragging, not any `scroll`: the room scrolls by
 * itself too, following an agent's line as it lands or bringing a row into view as the menu
 * opens, and a menu that closed on those was gone under the reader's hand (a loaded machine, 10
 * September 2026; the public CI, 1 November 2026). A scrollbar is pressed, which is a press
 * elsewhere. Within the menu, none of it is leaving.
 */
function useDismiss(menu: React.RefObject<HTMLDivElement | null>, onClose: () => void): void {
  useEffect(() => {
    const outside = (event: Event) => {
      if (!menu.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("wheel", outside, { capture: true, passive: true });
    window.addEventListener("touchmove", outside, { capture: true, passive: true });
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("wheel", outside, { capture: true });
      window.removeEventListener("touchmove", outside, { capture: true });
      window.removeEventListener("resize", onClose);
    };
  }, [menu, onClose]);
}
