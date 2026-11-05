/**
 * What You's list is built from on the Mac and the web (ADR 0265), as the phone's is from
 * `ui/Group.tsx`: a group under a heading, its rows on one card, and a line under it only where a
 * row can't say it; a row with a mark at its left, so the words of every row start at one edge,
 * its value at its right, and a chevron on a row that opens something. A row that opens its page
 * beside the list wears the chosen ground while the page is the one open, as on the iPad, and so
 * does a row whose form is open there (the host says which).
 *
 * A row that opens something is a button, so the keyboard reaches it and Enter opens it. A row
 * that holds a control of its own (a switch, a field) is not, and its control is.
 */

import { Icon, type IconName } from "@chipschat/ui";
import { type ReactNode, useRef } from "react";
import { Swap } from "../Swap.tsx";
import { useFormHost } from "./pane.tsx";

/** A heading, its rows on one card, and a line under it. */
export function Group(props: {
  /** The heading over the card; none for a card that needs none (Sign out). */
  readonly heading?: ReactNode;
  /** At the heading's right: "Owners and admins". */
  readonly aside?: ReactNode;
  /** What a screen reader calls the group, when the heading is not words. */
  readonly label: string;
  readonly testId: string;
  /** A line under the card, for what a row can't say. */
  readonly foot?: ReactNode;
  /** The foot in red: something did not happen. */
  readonly failed?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <section className="you-group" aria-label={props.label} data-testid={props.testId}>
      {props.heading !== undefined && (
        <div className="you-gh">
          <h2>{props.heading}</h2>
          {props.aside}
        </div>
      )}
      <div className="you-gcard">{props.children}</div>
      {props.foot !== undefined && (
        <p
          className={props.failed === true ? "you-gfoot is-failed" : "you-gfoot"}
          role={props.failed === true ? "alert" : undefined}
        >
          {props.foot}
        </p>
      )}
    </section>
  );
}

/** A row's mark: its icon on a tile of its colour, or grey for a row that only says a fact. */
export function RowMark(props: {
  readonly icon: IconName;
  /** The tile's colour; none is the quiet grey of a fact. */
  readonly tint?: string | undefined;
  /** The icon's colour on the tile: white, or a dark ink on a light tile. */
  readonly ink?: string | undefined;
}) {
  const style =
    props.tint === undefined
      ? undefined
      : { background: props.tint, color: props.ink ?? "#ffffff" };
  return (
    <span className={props.tint === undefined ? "you-mark is-fact" : "you-mark"} style={style}>
      <Icon name={props.icon} size={14} />
    </span>
  );
}

/** The phone's hues for You's marks (`AVATAR_HUES`), so a row is the same colour on both. */
export const HUES = {
  pink: "#b84d86",
  teal: "#007f9a",
  clay: "#a76341",
  green: "#00736d",
  blue: "#1c6aa8",
  violet: "#6e48c1",
  leaf: "#2a8452",
  /** Connect a harness: a terminal's grey, since a harness is a program that runs itself. */
  terminal: "#494d54",
} as const;

export function ListRow(props: {
  readonly label: ReactNode;
  /** A line under the label. */
  readonly sub?: ReactNode;
  /** At the right: what the row is set to. */
  readonly value?: ReactNode;
  /** At the right, after the value: a switch, faces, a button. */
  readonly trailing?: ReactNode;
  readonly mark?: ReactNode;
  /** Opens something: the row is a button with a chevron. */
  readonly onOpen?: ((from: HTMLElement) => void) | undefined;
  /** Its page is the one open beside the list; unsaid, whether its form is. */
  readonly selected?: boolean | undefined;
  /** Red, for Sign out and Delete; the accent, for Pair another device. */
  readonly tone?: "danger" | "accent" | undefined;
  /**
   * What a screen reader reads for the whole row, where its words alone would not say it: it
   * begins with the row's words, so "click Delete your account" finds it by voice.
   */
  readonly ariaLabel?: string | undefined;
  readonly testId?: string | undefined;
  /** No chevron, for a row that acts rather than opens: Sign out. */
  readonly bare?: boolean | undefined;
  readonly disabled?: boolean | undefined;
}) {
  const row = useRef<HTMLButtonElement>(null);
  const lit = useFormHost()?.lit;
  const selected = props.selected ?? (lit != null && lit === row.current);
  const className = [
    "you-lrow",
    selected ? "is-chosen" : "",
    props.tone === undefined ? "" : `is-${props.tone}`,
    props.mark === undefined ? "is-unmarked" : "",
  ]
    .filter((each) => each !== "")
    .join(" ");
  const inside = (
    <>
      {props.mark}
      {/* A space between the parts, which the layout drops: a row's name is its words, title
          first, then what is under it and what it is set to ("Decisions Right away"), rather
          than one run-on word, so voice control and a screen reader read what is shown. */}
      <span className="you-lrow-lab">
        <span>{props.label}</span>
        {props.sub !== undefined && " "}
        {props.sub !== undefined && <small>{settling(props.sub, "you-lrow-sub")}</small>}
      </span>
      {props.value !== undefined && " "}
      {props.value !== undefined && (
        <span className="you-lrow-val">{settling(props.value, "you-lrow-said")}</span>
      )}
      {props.trailing}
      {props.onOpen !== undefined && props.bare !== true && (
        <span className="you-chev" aria-hidden="true" />
      )}
    </>
  );
  const { onOpen } = props;
  if (onOpen === undefined) {
    return (
      <div className={className} data-testid={props.testId}>
        {inside}
      </div>
    );
  }
  return (
    <button
      ref={row}
      type="button"
      className={className}
      aria-label={props.ariaLabel}
      aria-current={selected ? "page" : undefined}
      disabled={props.disabled}
      onClick={(event) => onOpen(event.currentTarget)}
      data-testid={props.testId}
    >
      {inside}
    </button>
  );
}

/**
 * What a row says it is set to, crossfading to what it was just set to: a form's Save, a choice, a
 * switch elsewhere (ADR 0265's addendum). Words only; anything else is drawn as it is.
 */
function settling(said: ReactNode, className: string): ReactNode {
  if (typeof said !== "string") return said;
  return (
    <Swap id={said} className={className}>
      {said}
    </Swap>
  );
}
