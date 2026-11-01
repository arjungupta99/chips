/**
 * The catalogue is the single list of every Agent Connect event. The schemas, the generated
 * JSON Schema, the generated types, the reference pages and the fixture tests are all reads
 * of this one array, so an event cannot exist in one of them and not the others.
 */

import type { z } from "zod";
import { type EventDefinition, eventSchema } from "../envelope.js";
import { CHIPS_TO_HARNESS } from "./chips-to-harness.js";
import { HARNESS_TO_CHIPS } from "./harness-to-chips.js";
import { WORKSPACE_EVENTS } from "./workspace.js";

/** Every event in the log: Agent Connect in both directions, then Chips' own (ADR 0018). */
export const EVENTS: readonly EventDefinition[] = [
  ...HARNESS_TO_CHIPS,
  ...CHIPS_TO_HARNESS,
  ...WORKSPACE_EVENTS,
];

/** Every event type, as a plain list of strings. */
export const EVENT_TYPES: readonly string[] = EVENTS.map((event) => event.type);

export type HarnessToChipsType = (typeof HARNESS_TO_CHIPS)[number]["type"];
export type ChipsToHarnessType = (typeof CHIPS_TO_HARNESS)[number]["type"];
export type WorkspaceEventType = (typeof WORKSPACE_EVENTS)[number]["type"];
export type EventType = HarnessToChipsType | ChipsToHarnessType | WorkspaceEventType;

const byType = new Map<string, EventDefinition>(EVENTS.map((event) => [event.type, event]));

/** The definition for one event type, or undefined when nothing declares it. */
export function eventDefinition(type: string): EventDefinition | undefined {
  return byType.get(type);
}

/** The full schema — envelope plus payload — for one event type. */
const schemas = new Map<string, z.ZodObject>(
  EVENTS.map((event) => [event.type, eventSchema(event) as unknown as z.ZodObject]),
);

export function schemaFor(type: string): z.ZodObject | undefined {
  return schemas.get(type);
}

/** Every schema, keyed by event type. Used by the generators. */
export const EVENT_SCHEMAS: ReadonlyMap<string, z.ZodObject> = schemas;

export class UnknownEventTypeError extends Error {
  override readonly name = "UnknownEventTypeError";
  constructor(readonly type: string) {
    super(`no schema is declared for event type ${JSON.stringify(type)}`);
  }
}

export interface ParseFailure {
  readonly type: "unknown_type" | "invalid";
  readonly message: string;
  readonly issues?: readonly { path: string; message: string }[];
}

/**
 * Validate one event from the wire. This is the edge: everything inside trusts the result and
 * does not re-validate (technical-plan 6.1). A field the schema does not declare is dropped, and
 * `dropped` names those at the top level, so whoever sent them can be told (ADR 0162).
 */
export function parseEvent(
  input: unknown,
):
  | { ok: true; value: Record<string, unknown>; dropped: readonly string[] }
  | { ok: false; error: ParseFailure } {
  const type = (input as { type?: unknown })?.type;
  if (typeof type !== "string") {
    return { ok: false, error: { type: "unknown_type", message: "event has no `type`" } };
  }

  const schema = schemas.get(type);
  if (schema === undefined) {
    return { ok: false, error: { type: "unknown_type", message: `unknown event type ${type}` } };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        type: "invalid",
        message: `${type} is not valid`,
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join(".") || "(root)",
          message: issue.message,
        })),
      },
    };
  }
  const value = parsed.data as Record<string, unknown>;
  const dropped = Object.keys(input as object).filter((key) => !Object.hasOwn(value, key));
  return { ok: true, value, dropped };
}
