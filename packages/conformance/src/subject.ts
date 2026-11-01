/**
 * What the kit drives: an adapter, brought up against a Chips it was given, and — for a harness
 * that cannot act on its own here — asked for a turn.
 *
 * The kit plays the person. It says something in a space, answers the card that comes back,
 * answers a question if one is asked, and reads what the harness sent. Which side of the wire
 * the adapter is on is the adapter's business: a harness that runs itself — Scout, Jacobian's
 * channel — hears the message on its own socket and runs a turn by itself. An adapter with no
 * model behind it in a test is asked to
 * play the harness's side instead — the events a real turn would send, with the message as the
 * prompt. A custom harness that a person started by hand is the first kind: the kit prints where
 * Chips is and waits for it to connect.
 */

/** Where the fake Chips is, and who the harness is there. Everything an adapter needs to connect. */
export interface ChipsAddress {
  /** `http://127.0.0.1:<port>`. The socket is at `/v1/ws` under it. */
  readonly url: string;
  readonly workspaceId: string;
  readonly harnessId: string;
  /** The harness's bearer token, `chips_at_…`. */
  readonly token: string;
  /** The person the harness belongs to, and the one whose message starts the scenario. */
  readonly ownerId: string;
  /** The direct space between the owner and the harness, where the scenario is played. */
  readonly spaceId: string;
}

/** The person's message, as the kit said it. */
export interface Turn {
  readonly spaceId: string;
  readonly messageId: string;
  readonly text: string;
}

export interface Subject {
  /** The adapter's id — `scout`, `custom` — named in the report. */
  readonly name: string;
  /**
   * What the harness declares, as its registration would (ADR 0046). A harness that declares
   * `new_spaces` is asked for a room as well, after the golden scenario, and must claim it: it
   * is a harness that runs itself, since nobody calls `turn` for that room.
   */
  readonly capabilities?: readonly string[] | undefined;
  /** Bring the adapter up against this Chips. Resolves when it is ready to hear a message. */
  readonly start: (chips: ChipsAddress) => Promise<void>;
  /**
   * The harness's side of one turn, for an adapter whose harness cannot act here on its own.
   * Called right after the person's message is posted, and awaited only after the run has
   * ended — an approval it asks for is answered while it runs. Absent for a harness that
   * answers a message by itself.
   */
  readonly turn?: ((message: Turn) => Promise<void>) | undefined;
  readonly stop: () => Promise<void>;
}

/** A harness somebody starts by hand against the address the kit prints. */
export function customSubject(): Subject {
  return {
    name: "custom",
    start: async () => undefined,
    stop: async () => undefined,
  };
}
