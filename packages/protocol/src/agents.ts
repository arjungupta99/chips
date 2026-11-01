/**
 * What a harness that has not learnt agents is shown (ADR 0087's addendum of 29 September).
 *
 * A harness takes part in rooms as its agents. One written before agents knows only itself: it
 * reads `from.kind === "harness"` as another agent, looks for its own id in `addressed_to` and
 * `mentions`, and learns whose agent is whose from `/v1/participants`. Until it declares
 * `agents`, everything Chips hands it is put back into those terms, on the socket and over HTTP
 * alike, so it goes on answering unchanged: its own agents are its own id, any other agent is a
 * harness, and nothing says `for`. The server and the conformance fake both hand it over through
 * this, so the two cannot drift.
 */

/** Events a harness that has not learnt agents is never handed: it has no words for them. */
export const AGENT_EVENTS: ReadonlySet<string> = new Set([
  "agent.registered",
  "agent.updated",
  "membership.replaced",
  "agent.attached",
  "agent.released",
  "agent.fork",
  "agent.asked",
  "message.held",
]);

/** Who is looking: the harness, and the agents it speaks for without knowing it. */
export interface LegacyView {
  readonly harnessId: string;
  readonly own: ReadonlySet<string>;
}

/** Whether a key names a kind of participant: `kind`, `participant_kind`. */
function namesAKind(key: string): boolean {
  return key === "kind" || key.endsWith("_kind");
}

function seen(value: unknown, view: LegacyView, key: string): unknown {
  if (typeof value === "string") return word(value, view, key);
  if (Array.isArray(value)) {
    const each = value.map((item) => seen(item, view, key));
    // Two of its agents named in one list are the harness once: `addressed_to`, `mentions`.
    return each.every((item) => typeof item === "string") ? [...new Set(each)] : each;
  }
  if (typeof value !== "object" || value === null) return value;
  const out: Record<string, unknown> = {};
  for (const [field, inner] of Object.entries(value)) {
    // A record keyed by participant, as the room note's `notes` is: its own agent's key is its own.
    if (field !== "for")
      out[view.own.has(field) ? view.harnessId : field] = seen(inner, view, field);
  }
  return out;
}

/** One string: its own agent's id is its own, and the kind `agent` is a harness. */
function word(value: string, view: LegacyView, key: string): string {
  if (view.own.has(value)) return view.harnessId;
  return value === "agent" && namesAKind(key) ? "harness" : value;
}

/**
 * An event, a page of them or any body a harness reads, as a harness that has not declared
 * `agents` knows it. The value given is not changed.
 */
export function inLegacyView<T>(value: T, view: LegacyView): T {
  return seen(value, view, "") as T;
}
