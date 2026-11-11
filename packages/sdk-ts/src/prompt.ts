/**
 * What a turn is handed, as one text, in the order Chips asks for it: the referee's note when
 * agents have been handing work around (ADR 0097), the room's note for the agent taking the turn
 * (ADR 0092), the room's project as the agent's copy stands (ADR 0221), how a file reaches the room
 * when the bridge sends them (`sendAnswer`), what was said
 * since it last spoke and the room's files (ADR 0088, ADR 0099), the message a reply answers
 * (ADR 0219), and the words themselves, with their files and what a voice note said. Both first
 * bridges wrote this themselves; a harness that wants its own order reads the same fields off
 * `message.new`.
 *
 * A turn can be on more than one message (ADR 0294). An agent works on one turn at a time in a
 * room, so what is said to it meanwhile waits, as does all it was sent while its harness was away.
 * A bridge makes one turn of what waited, not one each: `promptFor` on the newest, with those that
 * waited ahead of it as `earlier`, and what was said in the room after, to others, as `since`.
 *
 * The room's note ends with its rules, the project's note with its asks, and how a file reaches the
 * room is a rule too (ADR 0250): `rulesFor` gives them, and a turn whose session already holds
 * them word for word leaves them out (`rulesHeld`), so a session that keeps its turns hears them
 * once rather than with every turn. `SessionRules` keeps which session holds which.
 */

import {
  CONTEXT_BUDGET,
  type ContextLine,
  type MessageNew,
  type MessageOverheard,
  noteWithoutRules,
  type ProjectFacts,
  type RoomContext,
  renderAttachment,
  renderContext,
  renderLine,
  renderProjectAsks,
  renderProjectFacts,
  renderProjectNote,
  renderReplyingTo,
  withRole,
} from "@chipschat/protocol";
import type { Ack } from "./outbox.js";
import { sendingFiles } from "./sending.js";

export interface PromptOptions {
  /**
   * Who takes the turn: one of `message.for`. When the message is for one only, that one; for a
   * harness that does not speak agents, its own id, which is what its note is under.
   */
  readonly taker?: string | undefined;
  /**
   * Say who said it ahead of the words: `Arjun: …`, and for a person their standing in the
   * workspace when Chips said it, `Priya (guest): …` (SEC-15). On unless said otherwise.
   */
  readonly sayWho?: boolean | undefined;
  /**
   * Tell the agent how a file reaches the room (`sendingFiles`), for a bridge that sends the
   * files its answers name with `sendAnswer`: with a project, a file that isn't in it. Off unless
   * said.
   */
  readonly sendsFiles?: boolean | undefined;
  /**
   * The zone a reply tells the time of the message it answers in (ADR 0219). The host's, unless
   * said.
   */
  readonly zone?: string | undefined;
  /**
   * The room's project as `project.pull()` left the agent's copy (ADR 0221): where it is, what
   * others changed, and a clash or a key to see to. Said after the room's note.
   */
  readonly project?: ProjectFacts | undefined;
  /**
   * The session taking the turn already holds what `rulesFor` gives for it, word for word
   * (ADR 0250): the room's note is said without its rules, the project's without its asks, and
   * how a file reaches the room not at all. Off unless said.
   */
  readonly rulesHeld?: boolean | undefined;
  /**
   * The messages for the same taker that waited ahead of this one, oldest first (ADR 0294): said
   * to it while it worked on another turn, or while its harness was away. The turn is this
   * message's, the newest: its note, and what was said since. Those that waited are said in full
   * ahead of its words, and left out of the lines since, where they would be said twice. Not a
   * message Chips handed over (`handed`), whose note is about it alone: that one is a turn of its
   * own.
   */
  readonly earlier?: readonly MessageNew[] | undefined;
  /**
   * The ids of messages the taker has already had a turn on (ADR 0294). A message that reached
   * the harness while such a turn was going was sent with them among the lines since, as Chips
   * knew no better then: they are left out, so the agent is not handed again what it answered.
   */
  readonly answered?: readonly string[] | undefined;
  /**
   * The room's last lines before the taker joined it: `catch_up` on the `agent.attached` that put
   * it there (ADR 0088, point 5). Said once, at its first turn in the room, ahead of the lines
   * since: an agent put in a room at work otherwise starts knowing nothing of what was said. A
   * line this turn says as a message is left out.
   */
  readonly before?: Pick<RoomContext, "lines"> | undefined;
  /**
   * What `post` answered when Chips held the taker's last message in the room (ADR 0097): taken
   * into the room, and kept from the agents it named. Said first, as Chips's word, at the taker's
   * next turn there (`heldWords`): it otherwise waits on agents that never got its message. Where
   * this message says the agents' talk is no longer held, a person has acted since, which hands a
   * held message over, and the turn is told the agents have it now.
   */
  readonly heldPost?: Pick<Ack, "held" | "exchange"> | undefined;
  /**
   * What was said in the room to others after this message reached the harness and before the turn
   * began (`message.overheard`), oldest first (ADR 0294). Said after the words, so the turn has
   * the room as it is now: without them an agent does again what another said it had done while
   * this message waited. The newest forty are said. Leave out the taker's own.
   */
  readonly since?:
    | readonly Pick<MessageOverheard, "from" | "text" | "attachments" | "held">[]
    | undefined;
}

/** Who takes the turn: the one said, else the message's one taker. */
function takerOf(message: MessageNew, options: PromptOptions): string | undefined {
  return options.taker ?? (message.for?.length === 1 ? message.for[0] : undefined);
}

/** Whether the room has an agent other than the taker. */
function othersBeside(message: MessageNew, taker: string | undefined): boolean {
  return (message.room?.members ?? []).some(
    (member) => member.kind === "agent" && member.participant_id !== taker,
  );
}

/**
 * The rules a turn carries (ADR 0250), in the order the turn says them: how the space works, the
 * words the room's note ends with; with the room's project, what its note asks of every turn; and,
 * for a bridge that sends files, how a file reaches the room. They stay the same while the space's
 * agents and its project keep their shape, so a bridge whose sessions keep their turns says them
 * once a session (`SessionRules`) and passes `rulesHeld` after. Empty when there are none.
 */
export function rulesFor(message: MessageNew, options: PromptOptions = {}): string {
  const taker = takerOf(message, options);
  const { project } = options;
  const rules: Readonly<Record<string, string>> = message.room?.rules ?? {};
  return [
    taker === undefined ? undefined : rules[taker],
    project === undefined
      ? undefined
      : renderProjectAsks(project, { othersInRoom: othersBeside(message, taker) }),
    options.sendsFiles === true ? sendingFiles({ project: project !== undefined }) : undefined,
  ]
    .filter((part): part is string => part !== undefined && part !== "")
    .join("\n\n");
}

/** Something overheard as a line of the room, which the plain form says as it does every other. */
function lineOfHeard(heard: NonNullable<PromptOptions["since"]>[number]): ContextLine {
  const files = heard.attachments ?? [];
  const said = files.flatMap((file) => (file.transcript === undefined ? [] : [file.transcript]));
  return {
    seq: 1,
    at: "",
    kind: "said",
    from: {
      id: heard.from.participant_id,
      kind: heard.from.kind,
      name: heard.from.display_name,
      ...(heard.from.workspace_role === undefined
        ? {}
        : { workspace_role: heard.from.workspace_role }),
    },
    text: heard.text,
    ...(said.length === 0 ? {} : { transcript: said.join(" ") }),
    ...(files.length === 0 ? {} : { files: files.map((file) => file.filename) }),
    ...(heard.held === true ? { held: true } : {}),
  } as ContextLine;
}

/** What was said in the room after the words reached the harness, to others (ADR 0294). */
function sinceOf(options: PromptOptions): string | undefined {
  const since = (options.since ?? []).slice(-CONTEXT_BUDGET.lines);
  if (since.length === 0) return undefined;
  const those = (options.earlier ?? []).length === 0 ? "that message" : "those messages";
  return [
    `Said in this space after ${those}, to others:`,
    ...since.map((each) => renderLine(lineOfHeard(each))),
  ].join("\n");
}

/**
 * What an agent is told when Chips held its last message in the room (ADR 0097), from what `post`
 * answered: the agents it named do not have it, and why. Nothing for a post that was not held.
 *
 * With `released`, a person has acted in the room since. The first thing a person does there after
 * a hold hands each agent the newest held message that was for it, so the agents have it now, and
 * the words say that instead: told they do not, an agent says so to the person whose own message
 * had just sent it on.
 */
export function heldWords(
  answer: Pick<Ack, "held" | "exchange"> | undefined,
  released = false,
): string | undefined {
  if (answer?.held !== true) return undefined;
  if (released) {
    return "Your last message in this space was held from the agents it named until a person acted. A person has now, so Chips has handed it to them: do not send it again.";
  }
  const count = answer.exchange?.count;
  const since =
    typeof count === "number" && count > 0
      ? ` (they have sent each other ${count} since a person last acted)`
      : "";
  return `Your last message in this space was held, so the agents it named do not have it yet: messages between the agents here are held${since} until a person acts. Until then, tell the person what is done and what is blocked, rather than asking the agents again.`;
}

export const BEFORE_HEADING = "Said in this space before you joined:";

/** What was said in the room before the taker joined, without what this turn says as a message. */
function beforeOf(message: MessageNew, options: PromptOptions): string | undefined {
  const said = new Set([
    message.message_id,
    ...(options.earlier ?? []).map((each) => each.message_id),
  ]);
  const lines = (options.before?.lines ?? []).filter(
    (line) => line.message_id === undefined || !said.has(line.message_id),
  );
  return lines.length === 0 ? undefined : [BEFORE_HEADING, ...lines.map(renderLine)].join("\n");
}

/** That more than one message waited, said ahead of them (ADR 0294). */
function waitedWords(count: number): string {
  return `${count} messages for you waited while you were working or away. They follow, oldest first. Answer them together in one reply, and where a later one changes or settles an earlier one, go by the later.`;
}

/** One message as a turn says it: the message it answers, then its words under who said them, and its files. */
function saidOf(message: MessageNew, options: PromptOptions, taker: string | undefined): string[] {
  const who =
    options.sayWho === false ? "" : `${withRole(message.from.display_name, message.from)}: `;
  const files = (message.attachments ?? []).map(renderAttachment);
  const replying = renderReplyingTo(message.replying_to, {
    sender: {
      id: message.from.participant_id,
      name: message.from.display_name,
      kind: message.from.kind,
      workspace_role: message.from.workspace_role,
    },
    taker,
    at: message.ts,
    zone: options.zone,
  });
  return [replying, [`${who}${message.text}`, ...files].join("\n")];
}

/**
 * What was said since the taker last spoke, without the messages that waited, which are said in
 * full, and without those it has had a turn on.
 */
function contextOf(message: MessageNew, options: PromptOptions): MessageNew["context"] {
  const { context } = message;
  const waited = new Set([
    ...(options.earlier ?? []).map((each) => each.message_id),
    ...(options.answered ?? []),
  ]);
  if (context === undefined || waited.size === 0) return context;
  return {
    ...context,
    lines: context.lines.filter(
      (line) => line.message_id === undefined || !waited.has(line.message_id),
    ),
  };
}

/** The turn's text for this message, and for those that waited ahead of it (`earlier`). */
export function promptFor(message: MessageNew, options: PromptOptions = {}): string {
  const taker = takerOf(message, options);
  const held = options.rulesHeld === true;
  const earlier = options.earlier ?? [];
  const notes: Readonly<Record<string, string>> = message.room?.notes ?? {};
  const note =
    taker === undefined ? undefined : held ? noteWithoutRules(message.room, taker) : notes[taker];
  const sending =
    options.sendsFiles === true && !held
      ? sendingFiles({ project: options.project !== undefined })
      : undefined;
  const project =
    options.project === undefined
      ? undefined
      : held
        ? renderProjectFacts(options.project)
        : renderProjectNote(options.project, { othersInRoom: othersBeside(message, taker) });
  return [
    // Held still where this message says so; else a person has acted since, and it was handed over.
    heldWords(options.heldPost, message.exchange?.stage !== "held"),
    message.exchange?.note,
    note,
    project,
    sending,
    beforeOf(message, options),
    renderContext(contextOf(message, options)),
    earlier.length === 0 ? undefined : waitedWords(earlier.length + 1),
    ...earlier.flatMap((each) => saidOf(each, options, taker)),
    ...saidOf(message, options, taker),
    sinceOf(options),
  ]
    .filter((part): part is string => part !== undefined && part !== "")
    .join("\n\n");
}
