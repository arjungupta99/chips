/**
 * What Chips does with something a person sends into a live run (blueprint: "a message sent
 * mid-run returns a receipt saying whether it was queued or steered"). A plain message waits
 * for the harness's next look; a steer or an interrupt goes now; a follow-up waits its turn.
 * Pure, so the rule reads in one place and the session only asks.
 */

export type Disposition = "queued" | "steered";

/** The disposition of an event, or nothing when it is not a person's mid-run message. */
export function dispositionOf(event: {
  readonly type: string;
  readonly mode?: unknown;
}): Disposition | undefined {
  if (event.type === "message.post") return "queued";
  if (event.type !== "run.steer") return undefined;
  return event.mode === "followup" ? "queued" : "steered";
}
