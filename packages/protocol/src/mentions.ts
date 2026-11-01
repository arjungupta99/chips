/**
 * What an `@handle` is, on the wire.
 *
 * A message mentions a participant by name — `@Ledger`, `@arjun` — and Chips resolves the
 * handle to a participant id against the members of the space (M3.3), so a harness can tell a
 * message addressed to it from one addressed to the room, and a client can draw the chip. The
 * server that resolves and the clients that render have to agree on what a handle is, so the
 * rule lives here, with the schemas, and nowhere else.
 *
 * A handle is `@` followed by two to sixty of letters, digits, `_`, `-` and `.`, not ending in
 * a dot or an underscore — so `@Ledger.` at the end of a sentence names Ledger, and so does
 * `_@Ledger_` in italics — at the start of the text, after a space, or after what opens Markdown's
 * emphasis, a parenthesis or a quotation: `**@Ledger:**`, `(@Ledger)`, `"@Ledger"`. The apps draw
 * a mention inside emphasis as one, so the server has to hear it there too (AW-20: a lead's
 * `**@OpenClaw3:**` drew a mention and reached nobody). After a letter or a digit it is not one,
 * so an email address names nobody.
 *
 * A participant answers to two handles, both case-insensitive: their display name
 * with its spaces removed, and its first word; `Scout · mini` is `@scout`. The whole name comes
 * first (ADR 0091): a first word names a participant only where nobody else among them has it,
 * as a first word or a whole name, so beside "OpenClaw 2", `@OpenClaw` is OpenClaw's.
 *
 * `@all` names every agent in the space (ADR 0081), so no participant answers to it.
 */

const HANDLE = "[a-z0-9_-][a-z0-9_.-]{0,58}[a-z0-9-]";

/**
 * Where a handle may begin: the start of the text, after a space or one of `*("'“‘`, or after an
 * underscore that is not a word's, as italics open: `_@Ledger_`, not `first_@example.com`.
 */
const BEFORE = `(?:^|(?<=[\\s*("'\u201C\u2018])|(?<=(?:^|[^a-z0-9])_))`;

/** Whether a word, without its `@`, is one a text can mention: `OpenClaw2`, not `J` or `Scout·mini`. */
export function isHandle(word: string): boolean {
  return new RegExp(`^${HANDLE}$`, "i").test(word);
}

/** A fresh, non-global pattern that captures the handle after the `@` in group 1. */
export function mentionPattern(): RegExp {
  return new RegExp(`${BEFORE}@(${HANDLE})`, "i");
}

/** The handles a text mentions, lowercased, in order, each once. */
export function handlesIn(text: string): string[] {
  const found: string[] = [];
  const pattern = new RegExp(`${BEFORE}@(${HANDLE})`, "gi");
  for (const match of text.matchAll(pattern)) {
    const handle = (match[1] as string).toLowerCase();
    if (!found.includes(handle)) found.push(handle);
  }
  return found;
}

/** The handle that names every harness in the space rather than one participant. */
export const EVERYONE_HANDLE = "all";

/** Whether a text says `@all`. */
export function mentionsEveryone(text: string): boolean {
  return handlesIn(text).includes(EVERYONE_HANDLE);
}

/**
 * The handles a participant answers to: the whole name without spaces, and its first word.
 * Never `all`, which names everyone.
 */
export function handlesOf(displayName: string): string[] {
  const trimmed = displayName.trim().toLowerCase();
  if (trimmed === "") return [];
  const whole = trimmed.replace(/\s+/g, "");
  const first = trimmed.split(/\s+/)[0] as string;
  const handles = whole === first ? [whole] : [whole, first];
  return handles.filter((handle) => handle !== EVERYONE_HANDLE);
}

export interface Mentionable {
  readonly id: string;
  readonly displayName: string;
  /**
   * Other names it answers to, after every participant's own: an agent answers to its harness's
   * name where it is the harness's one agent in the room (ADR 0087's addendum), so `@Jacobian`
   * still names Jacobian's agent there, whatever the agent is called.
   */
  readonly also?: readonly string[] | undefined;
}

/**
 * Who each handle names among these participants (ADR 0091): every whole name first, the first
 * given winning where two are one (Chips numbers an agent whose name clashes, so only names from
 * before that can be); then each first word that one participant has and nobody has as a whole
 * name; then the names a participant is only `also` known by, where nobody answers to them yet. A
 * first word two participants share names nobody, and no `also` takes it.
 */
export function handleMap(participants: readonly Mentionable[]): Map<string, string> {
  const byHandle = new Map<string, string>();
  for (const participant of participants) {
    const whole = handlesOf(participant.displayName)[0];
    if (whole !== undefined && !byHandle.has(whole)) byHandle.set(whole, participant.id);
  }
  const shared = giveFirstWords(byHandle, participants);
  const also = participants.flatMap((participant) =>
    (participant.also ?? []).flatMap((name) =>
      handlesOf(name).map((handle) => [handle, participant.id] as const),
    ),
  );
  for (const [handle, id] of also) {
    if (!byHandle.has(handle) && !shared.has(handle)) byHandle.set(handle, id);
  }
  return byHandle;
}

/**
 * Each first word one participant has and nobody has as a whole name, given to its participant;
 * the first words two share, which name nobody, returned.
 */
function giveFirstWords(
  byHandle: Map<string, string>,
  participants: readonly Mentionable[],
): Set<string> {
  const firsts = new Map<string, Set<string>>();
  for (const participant of participants) {
    const handles = handlesOf(participant.displayName);
    const first = handles[1] ?? handles[0];
    if (first === undefined) continue;
    firsts.set(first, (firsts.get(first) ?? new Set()).add(participant.id));
  }
  const shared = new Set<string>();
  for (const [first, ids] of firsts) {
    if (byHandle.has(first)) continue;
    if (ids.size === 1) byHandle.set(first, [...ids][0] as string);
    else shared.add(first);
  }
  return shared;
}

/**
 * The participants a text mentions, as ids, in the order the text names them and each once. A
 * handle nobody answers to is not a mention: it stays plain text on screen.
 */
export function resolveMentions(text: string, participants: readonly Mentionable[]): string[] {
  const byHandle = handleMap(participants);
  const ids: string[] = [];
  for (const handle of handlesIn(text)) {
    const id = byHandle.get(handle);
    if (id !== undefined && !ids.includes(id)) ids.push(id);
  }
  return ids;
}
