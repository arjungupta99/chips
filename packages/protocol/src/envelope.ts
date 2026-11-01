/**
 * Every Agent Connect event is an envelope plus a payload. The envelope is the part Chips
 * itself reads: who acted, in which workspace, on which run, and — for anything a client
 * sends — the key that makes replaying it safe.
 *
 * The shape is fixed by Appendix C of the technical plan.
 */

import { z } from "zod";
import { actor, id, isoTimestamp } from "./primitives.js";

/** The protocol version this build speaks. Breaking changes only at a major, after 1.0. */
export const PROTOCOL_VERSION = 1 as const;

export const envelope = z
  .object({
    v: z.literal(PROTOCOL_VERSION).describe("Protocol major version."),
    type: z.string().min(1).describe("The event type, for example `approval.request`."),
    id: id("event").describe("The event's own id. Stable across a retry of the same event."),
    ts: isoTimestamp.describe(
      "When it happened, by Chips' clock. Stamped on the way in; a value the sender writes is replaced.",
    ),
    workspace_id: id("workspace"),
    space_id: id("space").optional().describe("The space, when the event belongs to one."),
    run_id: id("run").optional().describe("The run, when the event belongs to one."),
    seq: z
      .int()
      .positive()
      .optional()
      .describe("Assigned by the server on append, monotonic per workspace. Absent on the way in."),
    idempotency_key: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe(
        "Required on every client-originated write. Sending the same key twice is a no-op.",
      ),
    actor,
  })
  .describe("The fields every Agent Connect event carries.");

export type Envelope = z.infer<typeof envelope>;

/**
 * Which way an event travels. `workspace` events never leave Chips: they record a human action
 * on the workspace itself, so the read models that depend on them can be replayed (ADR 0018).
 */
export type Direction = "harness_to_chips" | "chips_to_harness" | "workspace";

/**
 * Who writes an event (agents review, finding 1): a harness with its token, a person with a device
 * key, either, or Chips alone. `chips` is refused from every client: Chips writes it itself, as it
 * delivers or from what it already knows. Said for every event, so a new one cannot default to
 * "anybody may".
 */
export type EventSender = "harness" | "person" | "either" | "chips";

/** The description of one event type: everything the schema, the docs and the tests need. */
export interface EventDefinition<TType extends string = string> {
  /** The wire value of `type`. */
  readonly type: TType;
  readonly direction: Direction;
  /** Who may send it through the door. The direction says who hears it; this says who writes it. */
  readonly sender: EventSender;
  /**
   * The fields of its payload that are Chips's to write and not derived again at the door: a value
   * a sender wrote is dropped before the schema sees the event (agents review, finding 2).
   */
  readonly chipsWrites?: readonly string[];
  /** One sentence, in the product voice. Becomes the reference page's opening line. */
  readonly summary: string;
  /** The fields this event adds to the envelope. */
  readonly payload: z.ZodObject;
  /** Whether a harness may send this without a `run_id`. */
  readonly requiresRun: boolean;
}

/** Build the full schema for an event: the envelope, its `type` narrowed, and its payload. */
export function eventSchema<TType extends string>(definition: EventDefinition<TType>) {
  return envelope
    .extend({ type: z.literal(definition.type) })
    .extend(definition.payload.shape)
    .describe(definition.summary);
}

/** Helper for declaring a definition without losing the literal type of `type`. */
export function defineEvent<TType extends string>(
  definition: EventDefinition<TType>,
): EventDefinition<TType> {
  return definition;
}
