/**
 * The storage port. SQLite implements it in solo mode and Postgres will in Phase 6; neither
 * appears in a use case (technical-plan 6.1, ADR 0016).
 */

/** An event as it goes in: validated at the edge, without a sequence number yet. */
export type IncomingEvent = Readonly<Record<string, unknown>> & {
  readonly type: string;
  readonly id: string;
  readonly ts: string;
  readonly workspace_id: string;
  readonly actor: { readonly kind: string; readonly id: string; readonly harness_id?: string };
};

/** An event as it comes out: the same thing, with the sequence number it was appended at. */
export interface StoredEvent {
  readonly seq: number;
  readonly workspace_id: string;
  readonly id: string;
  readonly type: string;
  readonly ts: string;
  readonly space_id: string | null;
  readonly run_id: string | null;
  readonly actor: { readonly kind: string; readonly id: string; readonly harness_id?: string };
  readonly idempotency_key: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface AppendResult {
  readonly event: StoredEvent;
  /**
   * True when this event had already been appended, so nothing changed. Every command carries
   * an idempotency key and every handler is safe to run twice (technical-plan 6.1).
   */
  readonly duplicate: boolean;
}

/**
 * An append the store itself turned away: a rule that has to hold whichever path wrote the event,
 * asked inside the append's transaction (agents review, findings 5 to 8). Nothing was written. A
 * door answers it as it answers any refusal; a use case that had already asked the same rule
 * meets it only when something else got there first.
 */
export class AppendRefused extends Error {
  override readonly name = "AppendRefused";
  constructor(
    readonly refusal: {
      readonly kind: string;
      readonly message: string;
      readonly space_id?: string | undefined;
    },
  ) {
    super(refusal.message);
  }
}

/** A page of events, with the cursor to ask for the next one. Never an offset (6.2). */
export interface EventPage {
  readonly events: readonly StoredEvent[];
  readonly nextCursor: number | null;
}

/**
 * Restrict a read to what a viewer may see (phase-0-review finding 6). `spaces` is the
 * set the viewer is a member of; the read returns events in those spaces and the
 * workspace-wide events that belong to no space. Absent, the read is unrestricted, which
 * is what an internal caller such as `rebuild` wants.
 */
export interface VisibilityScope {
  readonly spaces: readonly string[];
  /**
   * The viewer, so the events that add them to a space or remove them from one reach them even
   * when the space is not in `spaces` — which, for a removal, is exactly when it matters: a
   * client resuming after it left a space elsewhere would otherwise never hear that it did.
   */
  readonly participantId?: string;
  /** Who else the viewer is in rooms: a harness's agents (ADR 0087). */
  readonly alsoIs?: readonly string[];
  /**
   * Whether the viewer is told who every person in the workspace is: a person who is not a guest.
   * Anybody else is sent a person's face and what came of a join only when they read who is who.
   */
  readonly seesDirectory?: boolean;
  /**
   * Whether the viewer is told every agent: an owner or admin (ADR 0034's addendum). Anybody else
   * is sent an agent's registration and changes only when the agent is theirs, in a room with
   * them, or of a harness they own (agents review, finding 3).
   */
  readonly seesAgents?: boolean;
}

/** What an erase takes away (ADR 0067), and the line it leaves in the log. */
export interface EraseInput {
  readonly workspaceId: string;
  /** The space. Its threads go with it: every event naming one of them goes. */
  readonly spaceId: string;
  /**
   * The `space.erased` the log keeps, without `erased` or `spent`: the store names the space and
   * its threads, numbers it past everything they held, and writes what they cost into it, which
   * only it can work out.
   */
  readonly tombstone: IncomingEvent;
}

export interface EraseResult {
  /** The `space.erased`, as stored: what the hub sends every device. */
  readonly event: StoredEvent;
  /** The space and its threads, as the tombstone names them. */
  readonly erased: readonly string[];
  /** File digests nothing refers to any more, which the blob store may now remove. */
  readonly orphanedDigests: readonly string[];
  /**
   * Whether the projections were rebuilt from the log (ADR 0067) rather than the rooms' rows
   * taken in place (ADR 0258): the slow way, taken when only a rebuild was sure.
   */
  readonly rebuilt: boolean;
}

export interface EventStore {
  /**
   * Append one event and apply its projections in a single transaction. Appending an event
   * whose id or idempotency key is already present returns the stored one and changes nothing.
   * Throws `AppendRefused`, having written nothing, for an event the store's own gate turns away.
   */
  readonly append: (event: IncomingEvent) => Promise<AppendResult>;

  /**
   * Everything after `seq`, in order. This is how a client resumes. With a `scope`, only the
   * events that scope may see — a page still holds up to `limit` of them, so pagination is
   * honest whether or not a viewer can see every event in the range.
   */
  readonly since: (
    workspaceId: string,
    seq: number,
    limit?: number,
    scope?: VisibilityScope,
  ) => Promise<EventPage>;

  /** The highest sequence number in a workspace, or zero when it has no events. */
  readonly head: (workspaceId: string) => Promise<number>;

  /** Drop every projection for a workspace and replay its log from the beginning. */
  readonly rebuild: (workspaceId: string) => Promise<{ replayed: number }>;

  /**
   * Erase spaces from the log (ADR 0067): their events and every row built from them go, the
   * uploads nothing else refers to go, and one `space.erased` is appended in their place — all
   * in one transaction, with the projections rebuilt so they are what a replay would make.
   */
  readonly erase: (input: EraseInput) => Promise<EraseResult>;
}
