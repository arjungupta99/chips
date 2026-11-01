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
 * The room's note ends with its rules, the project's note with its asks, and how a file reaches the
 * room is a rule too (ADR 0250): `rulesFor` gives them, and a turn whose session already holds
 * them word for word leaves them out (`rulesHeld`), so a session that keeps its turns hears them
 * once rather than with every turn. `SessionRules` keeps which session holds which.
 */

import {
  type MessageNew,
  noteWithoutRules,
  type ProjectFacts,
  renderAttachment,
  renderContext,
  renderProjectAsks,
  renderProjectFacts,
  renderProjectNote,
  renderReplyingTo,
  withRole,
} from "@chipschat/protocol";
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

/** The turn's text for this message. */
export function promptFor(message: MessageNew, options: PromptOptions = {}): string {
  const taker = takerOf(message, options);
  const held = options.rulesHeld === true;
  const notes: Readonly<Record<string, string>> = message.room?.notes ?? {};
  const note =
    taker === undefined ? undefined : held ? noteWithoutRules(message.room, taker) : notes[taker];
  const who =
    options.sayWho === false ? "" : `${withRole(message.from.display_name, message.from)}: `;
  const files = (message.attachments ?? []).map(renderAttachment);
  const words = [`${who}${message.text}`, ...files].join("\n");
  const sending =
    options.sendsFiles === true && !held
      ? sendingFiles({ project: options.project !== undefined })
      : undefined;
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
  const project =
    options.project === undefined
      ? undefined
      : held
        ? renderProjectFacts(options.project)
        : renderProjectNote(options.project, { othersInRoom: othersBeside(message, taker) });
  return [
    message.exchange?.note,
    note,
    project,
    sending,
    renderContext(message.context),
    replying,
    words,
  ]
    .filter((part): part is string => part !== undefined && part !== "")
    .join("\n\n");
}
