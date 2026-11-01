/**
 * Whether this app is talking to its server, on the mark at the top of the rail (ADR 0131): the
 * phone's connection mark, in the one place the desktop always shows. It was the product's mark
 * and said nothing; the only word on the connection was a pill in an open room's header, so a
 * person on Agents, or with no room open, was never told.
 *
 * - Connected: the mark at rest. A light that is always on is not a status light.
 * - Reaching the server: its pins lit one after another round the circuit.
 * - Not reached, for any of the three reasons: still, in red. Pressed, it tries again now.
 * - Reached again after red: every pin lit on green for `BACK_MS`, then at rest.
 *
 * Nothing changes for the first `SETTLES_MS` of not being connected, as on the phone: a socket
 * blinks, and a mark that flashed on every blink would be noise. What it says in words is its
 * tooltip and its accessible name, with which server and since when.
 */

import { type ConnectionState, type LinkKind, lostWords } from "@chipschat/core";
import { ChipMark } from "@chipschat/ui";
import { useEffect, useRef, useState } from "react";

/** A blink of not-connected is not worth a mark: it shows only once it has lasted this long. */
export const SETTLES_MS = 600;
/** How long the mark stays green, every pin lit, once the connection is back after failing. */
export const BACK_MS = 900;

/** What the mark is showing. `rest` is the good news, and the good news is the mark as it is. */
export type Look = "rest" | "reaching" | "failed" | "back";

function lookOf(connection: ConnectionState): Exclude<Look, "back"> {
  if (connection === "open") return "rest";
  return connection === "connecting" ? "reaching" : "failed";
}

/**
 * The look the mark wears: the two that mean *not connected yet* only once they have lasted
 * `SETTLES_MS`, the one turned into the other at once once the mark is up, and `back` for a beat
 * when the connection returns after red. A slow connect that never failed just comes to rest, or
 * every slow launch would flash green.
 */
export function useConnectionLook(connection: ConnectionState): Look {
  const look = lookOf(connection);
  const [worn, setWorn] = useState<Look>("rest");
  // Whether it has said the connection failed since it was last at rest.
  const failed = useRef(false);
  if (worn === "failed") failed.current = true;
  if (worn === "rest") failed.current = false;
  useEffect(() => {
    if (look === "rest" && failed.current && worn !== "rest") {
      if (worn !== "back") {
        setWorn("back");
        return;
      }
      const timer = setTimeout(() => setWorn("rest"), BACK_MS);
      return () => clearTimeout(timer);
    }
    if (look === "rest" || worn !== "rest") {
      setWorn(look);
      return;
    }
    const timer = setTimeout(() => setWorn(look), SETTLES_MS);
    return () => clearTimeout(timer);
  }, [look, worn]);
  return worn;
}

/** Why it is not connected, and whether pressing helps; `after` is which server and since when. */
function failedWords(connection: ConnectionState, after: string): string {
  if (connection === "asleep") return `Your server is asleep${after} · press to try again`;
  if (connection === "rejected") return "This device isn't paired anymore";
  if (connection === "removed") return "You're no longer in this workspace";
  return `Can't reach your server${after} · press to try again`;
}

/** What the mark says of a relay the server names under a key this device did not pin (SEC-2). */
export const REKEYED_WORDS = "the server names a relay under a new key · pair again to use it";

/** What the mark says, in words: the state, then which server and since when, where known. */
export function markWords(
  look: Look,
  connection: ConnectionState,
  facts: {
    readonly link?: LinkKind | undefined;
    readonly server?: string | undefined;
    readonly lostAt?: string | undefined;
    /** The snapshot's `rekeyed`: the device keeps its key, and says so wherever it says how it is connected. */
    readonly rekeyed?: boolean | undefined;
  },
): string {
  const where = facts.server === undefined ? "" : ` · ${facts.server}`;
  const since =
    facts.lostAt === undefined || connection === "open"
      ? ""
      : ` · last connected ${lostWords(facts.lostAt)}`;
  const rekeyed = facts.rekeyed === true ? ` · ${REKEYED_WORDS}` : "";
  if (look === "back") return `Connected again${where}`;
  if (look === "reaching") return `Reaching your server…${where}${since}`;
  if (look === "failed") return `${failedWords(connection, `${where}${since}`)}${rekeyed}`;
  return facts.link === "relay"
    ? `Connected through the relay${where}${rekeyed}`
    : `Connected${where}${rekeyed}`;
}

/** The mark at the top of the rail, wearing the connection. */
export function RailMark(props: {
  readonly connection: ConnectionState;
  readonly link?: LinkKind | undefined;
  readonly lostAt?: string | undefined;
  readonly server?: string | undefined;
  /** The snapshot's `rekeyed` (SEC-2): said in the words, since the mark itself stays at rest. */
  readonly rekeyed?: boolean | undefined;
  /** Try now: the store's `wake`. */
  readonly onRetry: () => void;
}) {
  const look = useConnectionLook(props.connection);
  const words = markWords(look, props.connection, props);
  return (
    <button
      type="button"
      className="side-mark"
      data-look={look}
      data-testid="rail-mark"
      title={words}
      aria-label={words}
      // Pressed while it is not connected, it tries now; connected, there is nothing to do.
      onClick={() => {
        if (props.connection !== "open") props.onRetry();
      }}
    >
      <ChipMark
        size={20}
        state={look === "rest" ? undefined : look === "reaching" ? "working" : look}
      />
    </button>
  );
}
