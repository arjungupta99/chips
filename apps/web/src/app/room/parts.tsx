/**
 * What the room sheet's pages are made of, the phone's on the desktop (ADR 0151): a card of rows
 * parted by hairlines (the Context group's `ctx-group`), a row with a face, a name and a line under
 * it, a page's title with Back, a tick, and the glide from one page to the next.
 */

import { type Directory, nameOf } from "@chipschat/core";
import { Avatar, Icon } from "@chipschat/ui";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
} from "react";
import { motionMs } from "../motionTokens.ts";
import { ease } from "../viewer/open.ts";

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

/**
 * What puts the sheet away, for the X at the top right of every page: the phone's sheets close by
 * their X alone, with no Done (ADR 0169's option 2, and ADR 0268 for the desktop).
 */
export const SheetClose = createContext<(() => void) | undefined>(undefined);

/** The sheet's X, at the right of a page's head. */
export function CloseX() {
  const close = useContext(SheetClose);
  if (close === undefined) return null;
  return (
    <button
      type="button"
      className="new-space-close"
      aria-label="Close"
      data-testid="room-sheet-close"
      onClick={close}
    >
      <Icon name="x" size={14} />
    </button>
  );
}

/** A page's title, with Back to the page it came from, and the sheet's X. */
export function Back(props: {
  readonly titleId: string;
  readonly title: string;
  readonly onBack: () => void;
  readonly testId?: string | undefined;
  /** What the page is called to a test, on its head. */
  readonly pageTestId?: string | undefined;
}) {
  return (
    <div className="sheet-back" data-testid={props.pageTestId}>
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
      <CloseX />
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
 * The page on show, as the phone's `SheetPages` turns one (ADR 0110): the new page fades in where it
 * stands while the page it replaces fades out where it stood, and the sheet's height glides from
 * what was drawn to what the page is, with no sideways slide. Not only on a turn: a page that grows
 * or folds as it is read (Media & files as its files come, a row gone) glides too, and a glide that
 * ends short of what the page has become glides on (ADR 0268 addendum). Until 3 November the page
 * left went in a frame, a page that grew after its turn jumped to its height when the glide ended,
 * and Media & files, laid out before its files had come, glid down to nothing and jumped back up.
 */
export function Pages({ page, children }: { readonly page: string; readonly children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const shown = useRef<HTMLDivElement>(null);
  const left = useRef<HTMLDivElement | null>(null);
  const drawn = useRef<number | undefined>(undefined);
  const gliding = useRef<(() => void) | undefined>(undefined);

  // From what was drawn last to what the pages are now. A turn (`restart`) takes a glide from
  // where it has got to; a change of size while one goes waits for it to end, and is taken then.
  const follow = useCallback((restart: boolean) => {
    const element = box.current;
    if (element === null || (gliding.current !== undefined && !restart)) return;
    let from = drawn.current;
    if (gliding.current !== undefined) {
      from = element.getBoundingClientRect().height;
      gliding.current();
    }
    const to = element.getBoundingClientRect().height;
    drawn.current = to;
    if (from === undefined || Math.abs(from - to) < 1 || stillMotion()) return;
    gliding.current = glide(element, from, to, () => {
      gliding.current = undefined;
      follow(false);
    });
  }, []);

  useLayoutEffect(() => {
    const element = box.current;
    if (element === null) return;
    const watch = new ResizeObserver(() => follow(false));
    watch.observe(element);
    return () => {
      watch.disconnect();
      gliding.current?.();
    };
  }, [follow]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new page is what starts a turn.
  useLayoutEffect(() => {
    const was = left.current;
    left.current = shown.current;
    const turned = was !== null && was !== shown.current && !was.isConnected;
    if (turned && box.current !== null && !stillMotion()) fadeAway(box.current, was);
    follow(true);
  }, [page]);

  return (
    <div ref={box} className="sheet-pages">
      <div key={page} ref={shown} className="sheet-page">
        {children}
      </div>
    </div>
  );
}

/** The box drawn `from` tall and gliding to `to`; the stop it returns lets it be its own height again. */
function glide(element: HTMLElement, from: number, to: number, ended: () => void): () => void {
  element.style.height = `${from}px`;
  element.getBoundingClientRect();
  element.style.height = `${to}px`;
  let done = false;
  const stop = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    element.removeEventListener("transitionend", end);
    element.style.height = "";
  };
  const end = (event: TransitionEvent) => {
    if (event.target !== element || event.propertyName !== "height") return;
    stop();
    ended();
  };
  // A timer as well as the transition's end: a window out of sight may never end it.
  const timer = setTimeout(() => {
    stop();
    ended();
  }, motionMs("--motion-slow") + 60);
  element.addEventListener("transitionend", end);
  return stop;
}

/**
 * The page a turn left, faded out where it stood, behind the page that came: the page itself, which
 * React has let go of, put back in the box until it has faded. Nothing in it is anything to find,
 * to name the sheet by or to press any more.
 */
function fadeAway(box: HTMLElement, page: HTMLElement): void {
  if (typeof page.animate !== "function") return;
  for (const named of [page, ...page.querySelectorAll("[data-testid], [id]")]) {
    named.removeAttribute("data-testid");
    named.removeAttribute("id");
  }
  page.setAttribute("aria-hidden", "true");
  page.inert = true;
  page.classList.add("sheet-page-left");
  box.prepend(page);
  // Put back on a page, what it had played plays again; it is as it was, at their ends.
  for (const playing of page.getAnimations({ subtree: true })) {
    if (Number.isFinite(playing.effect?.getTiming().iterations ?? 1)) playing.finish();
  }
  const fading = page.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: motionMs("--motion-fast"),
    easing: ease(),
    fill: "forwards",
  });
  const gone = () => page.remove();
  fading.addEventListener("finish", gone);
  setTimeout(gone, motionMs("--motion-fast") + 60);
}

export function stillMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
