/**
 * What the space pane says when there is no room to open (ADR 0131): the phone's states, in the
 * middle of the window, where a room would be. Core's `emptyList` decides which.
 *
 * - The server being reached: the mark working, and the address.
 * - It cannot be reached, or is asleep: the mark still and red, and Try again.
 * - The server has said there are no rooms: what a space is, who can start one, and a gold
 *   Create a space that opens the new-space dialog out of itself.
 * - The same, for somebody let in by an invite: a welcome (JR-4) — who let them in, as what, that
 *   a room comes when somebody adds them — and Create a space only for those who may open one.
 *
 * While the cache is read and while the rooms the hello listed are coming in it says nothing: the
 * first is a moment, and the rail holds places for the second. A browser the server no longer
 * knows is sent to pairing before it gets here (`App.tsx`).
 */

import {
  ADDED_TO_A_SPACE_WORDS,
  type EmptyList,
  type Participant,
  startersWords,
  type Welcome,
} from "@chipschat/core";
import { Avatar, ChipMark, Icon } from "@chipschat/ui";
import { type ReactNode, useRef } from "react";

/** How many faces stand for who can start a space, before "and N more". */
const MOST_FACES = 3;

interface Saying {
  readonly title: string;
  readonly words: string;
  readonly retry: boolean;
}

const SAYING: Partial<Readonly<Record<EmptyList, Saying>>> = {
  connecting: {
    title: "Reaching your server",
    words: "Your spaces will show here as soon as it answers.",
    retry: false,
  },
  closed: {
    title: "Can't reach your server",
    words: "Chips keeps trying on its own. Check that the computer it runs on is awake and online.",
    retry: true,
  },
  asleep: {
    title: "Your server is asleep",
    words:
      "The relay can't find it: the computer Chips runs on is asleep or switched off. This app reconnects when it wakes.",
    retry: true,
  },
};

/**
 * Can't reach the server, on a device that knows no relay: it reaches the server only on its
 * network, since the relay isn't on (ADR 0245; the phone's `CLOSED_NO_RELAY`).
 */
const CLOSED_NO_RELAY: Saying = {
  title: "Can't reach your server",
  words:
    "Chips reaches it only on the server's own network, because the relay isn't on. At home, check that the computer Chips runs on is awake. Away, an owner can turn on the relay at home: You → Workspace → Relay.",
  retry: true,
};

export function NoRooms(props: {
  readonly empty: EmptyList;
  readonly server: string | undefined;
  /** Who can be asked for a space: core's `newSpaceHarnesses`. */
  readonly harnesses: readonly Participant[];
  /** Try now: the store's `wake`. */
  readonly onRetry: () => void;
  /** Open the new-space dialog out of this control; absent for somebody who may not (ADR 0196). */
  readonly onNewSpace: ((from: HTMLElement | null) => void) | undefined;
  /** For somebody let in by an invite: core's `welcomeFor`. */
  readonly welcome?: Welcome | undefined;
  /** This device knows a relay to reach the server through when it is away from it. */
  readonly relay?: boolean | undefined;
}) {
  if (props.empty === "none" && props.welcome !== undefined)
    return <Welcomed welcome={props.welcome} onNewSpace={props.onNewSpace} />;
  if (props.empty === "none")
    return <Nothing harnesses={props.harnesses} onNewSpace={props.onNewSpace} />;
  const saying =
    props.empty === "closed" && props.relay === false ? CLOSED_NO_RELAY : SAYING[props.empty];
  if (saying === undefined) return <Pane look="quiet" />;
  return (
    <Pane look={props.empty}>
      <ChipMark size={64} state={props.empty === "connecting" ? "working" : "failed"} />
      <h2 className="none-t">{saying.title}</h2>
      <p className="none-w">{saying.words}</p>
      {props.server === undefined ? null : <p className="none-c">{props.server}</p>}
      {saying.retry ? (
        <button type="button" className="none-b" onClick={props.onRetry}>
          Try again
        </button>
      ) : null}
    </Pane>
  );
}

/** The pane itself: the room's place, named for a screen reader as the room's would be. */
function Pane(props: { readonly look: string; readonly children?: ReactNode }) {
  // Quiet, it is the room's place a moment before the room: Chips for Mac's window waits for it to
  // pass before it is shown (ADR 0274).
  return (
    <main
      className="conv conv-none none"
      aria-label="Space"
      data-testid={`no-rooms-${props.look}`}
      data-window-waits={props.children === undefined ? "" : undefined}
    >
      <h1 className="ui-visually-hidden">Space</h1>
      {props.children === undefined ? null : (
        <div className="none-in" aria-live="polite">
          {props.children}
        </div>
      )}
    </main>
  );
}

/** The server has said there are no rooms: what a space is, and a way to make one. */
function Nothing(props: {
  readonly harnesses: readonly Participant[];
  readonly onNewSpace: ((from: HTMLElement | null) => void) | undefined;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const { harnesses } = props;
  return (
    <Pane look="none">
      <ChipMark size={64} />
      <h2 className="none-t">No spaces yet</h2>
      <p className="none-w">A space is where you and your agents work on something together.</p>
      {props.onNewSpace === undefined ? (
        <p className="none-who">{ADDED_TO_A_SPACE_WORDS}</p>
      ) : harnesses.length === 0 ? null : (
        <p className="none-who">
          <span className="none-faces" aria-hidden="true">
            {harnesses.slice(0, MOST_FACES).map((each) => (
              <Avatar key={each.id} name={each.displayName} kind={each.kind} size="sm" />
            ))}
          </span>
          {startersWords(harnesses.map((each) => each.displayName))}
        </p>
      )}
      {props.onNewSpace === undefined ? null : (
        <button
          ref={button}
          type="button"
          className="none-b none-b-gold"
          aria-haspopup="dialog"
          onClick={() => props.onNewSpace?.(button.current)}
        >
          <Icon name="plus" size={16} />
          Create a space
        </button>
      )}
    </Pane>
  );
}

/** Somebody let in by an invite, in no room yet: who let them in, and what comes next. */
function Welcomed(props: {
  readonly welcome: Welcome;
  readonly onNewSpace: ((from: HTMLElement | null) => void) | undefined;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const { welcome } = props;
  return (
    <Pane look="welcome">
      <ChipMark size={64} />
      <h2 className="none-t">{welcome.title}</h2>
      <p className="none-w">{welcome.words}</p>
      {welcome.mayCreate && props.onNewSpace !== undefined ? (
        <button
          ref={button}
          type="button"
          className="none-b"
          aria-haspopup="dialog"
          onClick={() => props.onNewSpace?.(button.current)}
        >
          <Icon name="plus" size={16} />
          Create a space
        </button>
      ) : null}
    </Pane>
  );
}
