/**
 * What a reader may do to a line (M3.4, M5.4), on the right button rather than under every
 * bubble, in the phone's order and words (ADR 0200, ADR 0268): who said it and when at its head;
 * then what is done to its words where they are — Reply (ADR 0219), Copy, Edit, Pin — and, under a
 * rule, the rest: Not right? (in place of the thumbs and a note about what went wrong), What the
 * run did on the line that closed a run, and a deletion for the reader alone or for everyone
 * (ADR 0167) — the second asked about first, in core's words.
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
import { DELETE_FOR_EVERYONE, DELETE_FOR_ME, mayReply, notRightWords } from "@chipschat/core";
import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
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
  /** The row the menu is about: the menu moves with it, and goes when it leaves the room's view. */
  readonly row?: React.RefObject<HTMLElement | null>;
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
  /** Who said it and when, at the menu's head: `Theo · Today 1:05 AM`. */
  readonly head?: string | undefined;
  /** Who a Not right? goes to, for the line under it. */
  readonly name?: string | undefined;
  /**
   * What the run did, on the line that closed a run with something to show (ADR 0050, rule 3):
   * its receipt's one line, said under the item. The row opens the receipt.
   */
  readonly runDid?: string | undefined;
  readonly onRunDid?: (() => void) | undefined;
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
  /** Said in place of the label once done, before the menu goes: Copy's *Copied*. */
  readonly done?: string;
  /** The first of the second group, which a rule sets off from the quick ones. */
  readonly ruled?: boolean;
  readonly run: () => void;
}

/**
 * Whether a line offers anything at all, so a row knows before it opens an empty menu. `replies`
 * is whether the room takes replies, which a line can then be given (ADR 0219).
 */
export function hasMenu(
  may: LineMay,
  line: Line,
  feedback: boolean,
  replies = false,
  receipt = false,
): boolean {
  return (
    (replies && mayReply(line)) ||
    hasWords(line) ||
    feedback ||
    receipt ||
    may.pin ||
    may.edit ||
    may.remove ||
    may.hide
  );
}

/** A line with words to copy: not a tombstone, not files alone. */
function hasWords(line: Line): boolean {
  return line.deleted !== true && line.text.trim() !== "";
}

/** How long Copy says *Copied* before the menu goes. */
const DONE_MS = 700;

export function LineMenu(props: LineMenuProps) {
  const { onClose } = props;
  const id = useId();
  const [confirming, setConfirming] = useState(false);
  // The item that has said its word, while the menu waits a beat to go.
  const [done, setDone] = useState<string | undefined>(undefined);
  const menu = useRef<HTMLDivElement>(null);
  const at = useClamped(menu, props.at);
  const moved = useFollow(props.row, onClose);

  useDismiss(menu, onClose);

  const act = (run: () => void) => () => {
    run();
    onClose();
  };
  useEffect(() => {
    if (done === undefined) return;
    const timer = setTimeout(onClose, DONE_MS);
    return () => clearTimeout(timer);
  }, [done, onClose]);
  const said = (key: string, run: () => void) => () => {
    run();
    setDone(key);
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
    : ordinary(props, act, said, () => setConfirming(true));

  return createPortal(
    <div
      ref={menu}
      className="line-menu"
      data-testid="line-menu"
      role="menu"
      aria-label="What to do with this message"
      data-asking={confirming ? "true" : undefined}
      style={{ left: `${at.x + moved.x}px`, top: `${at.y + moved.y}px` }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
        walk(event);
      }}
    >
      {!confirming && props.head !== undefined && (
        <div className="line-menu-head" data-testid="line-menu-head">
          {props.head}
        </div>
      )}
      {confirming && (
        <div className="line-menu-ask" data-testid="line-menu-asking">
          <b>{asking.title}</b>
          <p>{asking.body}</p>
          {asking.note !== undefined && <p className="line-menu-note">{asking.note}</p>}
        </div>
      )}
      {items.map((item, index) => (
        <Fragment key={item.key}>
          {item.ruled === true && index > 0 && <hr className="line-menu-rule" />}
          <MenuItem
            item={item}
            first={index === 0}
            done={done === item.key}
            busy={props.busy}
            hintId={`${id}-${item.key}`}
          />
        </Fragment>
      ))}
    </div>,
    document.body,
  );
}

/** One line of the menu: its label, or the word it says once done, and what it does under it. */
function MenuItem(props: {
  readonly item: Item;
  readonly first: boolean;
  readonly done: boolean;
  readonly busy: boolean;
  readonly hintId: string;
}) {
  const { item } = props;
  const hinted = item.hint !== undefined;
  return (
    <button
      type="button"
      role="menuitem"
      className="line-menu-item"
      data-danger={item.danger === true ? "true" : undefined}
      data-done={props.done ? "true" : undefined}
      disabled={props.busy}
      ref={props.first ? focusFirst : undefined}
      onClick={item.run}
      // Named by its label alone; what it does is said as its description.
      aria-label={hinted ? item.label : undefined}
      aria-describedby={hinted ? props.hintId : undefined}
    >
      <span className="line-menu-label" aria-live={item.done === undefined ? undefined : "polite"}>
        {props.done && item.done !== undefined ? item.done : item.label}
      </span>
      {hinted && (
        <span className="line-menu-hint" id={props.hintId}>
          {item.hint}
        </span>
      )}
    </button>
  );
}

/**
 * Everything but the confirmation, in the phone's order (ADR 0200): the capsule's quick actions,
 * then the card's rows under a rule. Select and Share are a phone's: on a Mac the words select
 * where they stand.
 */
function ordinary(
  props: LineMenuProps,
  act: (run: () => void) => () => void,
  said: (key: string, run: () => void) => () => void,
  remove: () => void,
): Item[] {
  return [...quick(props, act, said), ...ruled(rest(props, act, remove))];
}

/** Reply, Copy, Edit and Pin: what is done to the words where they are. */
function quick(
  props: LineMenuProps,
  act: (run: () => void) => () => void,
  said: (key: string, run: () => void) => () => void,
): Item[] {
  const { line, may, spaceId, on } = props;
  const items: Item[] = [];
  // First, as on the phone's capsule: the thing a hand reaches for most (ADR 0219).
  if (props.onReply !== undefined)
    items.push({ key: "reply", label: "Reply", run: act(props.onReply) });
  if (hasWords(line)) {
    items.push({
      key: "copy",
      label: "Copy",
      done: "Copied",
      // The words as they were written, Markdown and all, as the phone's Copy takes them.
      run: said(
        "copy",
        () => void navigator.clipboard?.writeText(line.text).catch(() => undefined),
      ),
    });
  }
  if (may.edit) items.push({ key: "edit", label: "Edit", run: act(props.onEdit) });
  if (may.pin) {
    const unpin = props.pinned;
    items.push({
      key: "pin",
      label: unpin ? "Unpin" : "Pin",
      run: act(() => (unpin ? on.unpin(spaceId, line) : on.pin(spaceId, line))),
    });
  }
  return items;
}

/** Not right?, What the run did and the deletions: the card under the phone's capsule. */
function rest(
  props: LineMenuProps,
  act: (run: () => void) => () => void,
  remove: () => void,
): Item[] {
  const { may } = props;
  const items: Item[] = [];
  if (props.onFeedback !== undefined) {
    const words = notRightWords(props.name ?? "the agent");
    items.push({ key: "note", label: words.label, hint: words.hint, run: act(props.onNote) });
  }
  if (props.runDid !== undefined && props.onRunDid !== undefined) {
    items.push({
      key: "run-did",
      label: "What the run did",
      hint: props.runDid,
      run: act(props.onRunDid),
    });
  }
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

/** The second group, its first set off by a rule. */
function ruled(items: Item[]): Item[] {
  const [first, ...others] = items;
  return first === undefined ? [] : [{ ...first, ruled: true }, ...others];
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
 * How far the line has moved since the menu opened, so the menu goes where its line goes. The
 * room scrolls by itself, following an agent's answer as it lands, and a menu left where it
 * opened stood beside other messages while still acting on its own (seen in the demo, 2 November
 * 2026). Once the line has left the view of the scroller that moved it, the menu goes too.
 *
 * Only a scroller that holds the row counts: the spaces list scrolling by itself moves nothing.
 * Where the row stood is taken once, when the menu opens, since `onClose` is new on every draw.
 */
function useFollow(
  row: React.RefObject<HTMLElement | null> | undefined,
  onClose: () => void,
): Point {
  const [moved, setMoved] = useState<Point>({ x: 0, y: 0 });
  const start = useRef<DOMRect | undefined>(undefined);
  useEffect(() => {
    start.current ??= row?.current?.getBoundingClientRect();
    if (row === undefined) return;
    const follow = (event: Event) => {
      const line = row.current;
      const from = start.current;
      const scroller = event.target instanceof Element ? event.target : undefined;
      if (line === null || from === undefined || scroller?.contains(line) === false) return;
      const box = inView(line, scroller);
      if (box === undefined) onClose();
      else setMoved({ x: box.left - from.left, y: box.top - from.top });
    };
    window.addEventListener("scroll", follow, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", follow, { capture: true });
  }, [row, onClose]);
  return moved;
}

/** Where the line is now, or nothing once it has left the view of the scroller that moved it. */
function inView(line: HTMLElement, scroller: Element | undefined): DOMRect | undefined {
  const box = line.getBoundingClientRect();
  const view = scroller?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
  return box.bottom <= view.top || box.top >= view.bottom ? undefined : box;
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
