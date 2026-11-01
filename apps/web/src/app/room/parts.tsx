/**
 * What the room sheet's pages are made of, the phone's on the desktop (ADR 0151): a card of rows
 * parted by hairlines (the Context group's `ctx-group`), a row with a face, a name and a line under
 * it, a page's title with Back, a tick, and the glide from one page to the next.
 */

import { type Directory, nameOf } from "@chipschat/core";
import { Avatar, Icon } from "@chipschat/ui";
import { type ReactNode, useLayoutEffect, useRef } from "react";

/** A face from the directory: an agent's own, a person's own, or their initials. */
export function Face({
  directory,
  id,
  faded = false,
}: {
  readonly directory: Directory;
  readonly id: string;
  readonly faded?: boolean;
}) {
  const who = directory[id];
  return (
    <span className="sheet-face" data-faded={faded ? "true" : undefined} aria-hidden="true">
      <Avatar
        name={nameOf(directory, id)}
        kind={who?.kind ?? "person"}
        icon={who?.face}
        size="sm"
      />
    </span>
  );
}

/** A tile with an icon on the card's own ground, for a row that is not anybody. */
export function Tile({ children }: { readonly children: ReactNode }) {
  return (
    <span className="ctx-tile ctx-tile-quiet sheet-tile" aria-hidden="true">
      {children}
    </span>
  );
}

/** The chevron at a row's end that says it opens something. */
export function Chev() {
  return (
    <span className="sheet-chev" aria-hidden="true">
      <Icon name="down" size={13} />
    </span>
  );
}

/** A row's tick: an empty ring, or the gold one with its check once it is in the room. */
export function Tick({ on }: { readonly on: boolean }) {
  return (
    <span className="sheet-tick" data-on={on ? "true" : undefined} aria-hidden="true">
      {on && <Icon name="check" size={12} />}
    </span>
  );
}

/** A card of rows. */
export function Group({ children }: { readonly children: ReactNode }) {
  return <ul className="ctx-group sheet-group">{children}</ul>;
}

/**
 * A row that is picked rather than pressed: a checkbox on Add (ADR 0148), a radio on Lead. The
 * input takes the keyboard; the tick or check at the row's end is what shows.
 */
export interface Pick {
  readonly type: "checkbox" | "radio";
  /** The radios' group. */
  readonly group?: string | undefined;
  readonly checked: boolean;
  readonly disabled?: boolean | undefined;
  readonly onPick: () => void;
}

/**
 * One row: a face, a name and a line under it, and what stands at its end. A button when it does
 * something, a checkbox or a radio when it is picked. Remove, where it may be done, stands beside
 * the row rather than inside it, and shows on hover and to the keyboard: the phone's swipe.
 */
export function Row(props: {
  readonly face: ReactNode;
  readonly name: string;
  readonly under?: string | undefined;
  readonly trailing?: ReactNode;
  readonly onClick?: (() => void) | undefined;
  readonly pick?: Pick | undefined;
  readonly label?: string | undefined;
  readonly testId?: string | undefined;
  readonly faded?: boolean | undefined;
  readonly onRemove?: (() => void) | undefined;
  readonly participant?: string | undefined;
}) {
  return (
    <li
      className="sheet-li"
      data-faded={props.faded ? "true" : undefined}
      data-testid={props.participant === undefined ? undefined : "member"}
      data-participant={props.participant}
    >
      <RowBody {...props} />
      {props.onRemove !== undefined && (
        <button
          type="button"
          className="sheet-remove"
          onClick={props.onRemove}
          aria-label={`Remove ${props.name}`}
        >
          Remove
        </button>
      )}
    </li>
  );
}

function RowBody(props: Parameters<typeof Row>[0]) {
  const words = (
    <>
      {props.face}
      <span className="ctx-row-words">
        <span className="ctx-row-title">{props.name}</span>
        {props.under !== undefined && <span className="ctx-row-line">{props.under}</span>}
      </span>
      {props.trailing}
    </>
  );
  const { pick } = props;
  if (pick !== undefined) {
    return (
      <label className="ctx-row sheet-pick" data-testid={props.testId}>
        <input
          type={pick.type}
          name={pick.group}
          className="sheet-pick-input"
          checked={pick.checked}
          disabled={pick.disabled}
          onChange={pick.onPick}
          aria-label={props.label ?? props.name}
        />
        {words}
      </label>
    );
  }
  if (props.onClick === undefined) {
    return (
      <div className="ctx-row" data-testid={props.testId}>
        {words}
      </div>
    );
  }
  return (
    <button
      type="button"
      className="ctx-row"
      onClick={props.onClick}
      aria-label={props.label}
      data-testid={props.testId}
    >
      {words}
    </button>
  );
}

/** A heading over a card, in the phone's small capitals. */
export function Heading({ children }: { readonly children: string }) {
  return <h3 className="sheet-h">{children}</h3>;
}

/** A page's title, with Back to the page it came from. */
export function Back(props: {
  readonly titleId: string;
  readonly title: string;
  readonly onBack: () => void;
  readonly testId?: string | undefined;
}) {
  return (
    <div className="sheet-back">
      <button
        type="button"
        className="sheet-back-button"
        aria-label="Back"
        onClick={props.onBack}
        data-testid={props.testId}
      >
        <Icon name="down" size={15} />
      </button>
      <h2 id={props.titleId}>{props.title}</h2>
    </div>
  );
}

/** What the server would not do, in red under the page, until the next thing is asked. */
export function Failed({ words }: { readonly words: string }) {
  return (
    <p className="sheet-failed" role="alert" data-testid="room-sheet-failed">
      {words}
    </p>
  );
}

/**
 * The page on show, faded in where it stands while the sheet's height glides from the last page's
 * to this one's, as the phone's `SheetPages` does (ADR 0110): no sideways slide. The height is
 * watched as it changes inside a page too, so a glide always starts from what was drawn last.
 */
export function Pages({ page, children }: { readonly page: string; readonly children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const drawn = useRef<number | undefined>(undefined);
  const gliding = useRef(false);
  useLayoutEffect(() => {
    const element = box.current;
    if (element === null) return;
    const watch = new ResizeObserver(() => {
      if (!gliding.current) drawn.current = element.getBoundingClientRect().height;
    });
    watch.observe(element);
    return () => watch.disconnect();
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new page is what starts a glide.
  useLayoutEffect(() => {
    const element = box.current;
    const from = drawn.current;
    if (element === null) return;
    const to = element.getBoundingClientRect().height;
    drawn.current = to;
    if (from === undefined || Math.abs(from - to) < 1 || stillMotion()) return;
    gliding.current = true;
    element.style.height = `${from}px`;
    element.getBoundingClientRect();
    element.style.height = `${to}px`;
    const settle = () => {
      gliding.current = false;
      element.style.height = "";
    };
    const timer = setTimeout(settle, GLIDE_MS + 60);
    return () => {
      clearTimeout(timer);
      settle();
    };
  }, [page]);
  return (
    <div ref={box} className="sheet-pages">
      <div key={page} className="sheet-page">
        {children}
      </div>
    </div>
  );
}

/** As long as the stylesheet's glide. */
const GLIDE_MS = 260;

export function stillMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
