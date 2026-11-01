/**
 * How an agent says it has nothing to say (ADR 0105): a post whose words are `NO_REPLY` and nothing
 * else, the word OpenClaw's own agents already answer with. Chips records it as `turn.passed`, not
 * as a message, so nobody is shown it and no agent is handed it; and a run that ends on it draws
 * no line in the room. The server, the conformance fake and the client read it with one rule.
 */

/** The word itself. */
export const NO_REPLY = "NO_REPLY";

/** `NO_REPLY` alone, as a model writes it: in backticks, bold or quotes, or with a full stop. */
const ALONE = /^[\s`*_"'“”]*NO_REPLY[\s`*_"'“”.!]*$/;

/** Whether words say only that there is nothing to say. */
export function isNoReply(text: unknown): boolean {
  return typeof text === "string" && ALONE.test(text);
}

/** What a passed turn keeps of the post it was: the envelope, and what it was answering. */
const PASSED_KEEPS: ReadonlySet<string> = new Set([
  "v",
  "type",
  "id",
  "ts",
  "workspace_id",
  "space_id",
  "run_id",
  "actor",
  "idempotency_key",
  "reply_to",
]);

/**
 * An agent's post that says only `NO_REPLY` made into its turn passed, in place: `turn.passed`,
 * keeping its room, its run and what it answered. A person's words are theirs, whatever they are,
 * and a post with files says something; both are left as they are. True when it was made one.
 */
export function passIfNothingSaid(event: Record<string, unknown>): boolean {
  if (event["type"] !== "message.post" || !isNoReply(event["text"])) return false;
  const actor = event["actor"] as { readonly kind?: unknown } | undefined;
  if (actor?.kind === "person" || actor?.kind === "system" || actor?.kind === undefined)
    return false;
  const files = [event["upload_ids"], event["attachments"]];
  if (files.some((each) => Array.isArray(each) && each.length > 0)) return false;
  for (const key of Object.keys(event)) if (!PASSED_KEEPS.has(key)) delete event[key];
  event["type"] = "turn.passed";
  return true;
}
